#include <napi.h>
#include <atomic>
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>
#import <Foundation/Foundation.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>

#include "audioprocesses.h"
#include "callaudio.h"

namespace {

// The loudest audio buffer since the last read, as an RMS amplitude (0 to 1).
// Core Audio's real-time thread writes it; JS reads and resets it.
struct Meter {
    std::atomic<float> loudest{0};

    // IOProc buffers are 32-bit float on macOS.
    void measure(const AudioBufferList *buffers) {
        double sum = 0;
        size_t count = 0;
        for (UInt32 i = 0; i < buffers->mNumberBuffers; i++) {
            const float *samples = (const float *) buffers->mBuffers[i].mData;
            size_t size = buffers->mBuffers[i].mDataByteSize / sizeof(float);
            for (size_t s = 0; samples != NULL && s < size; s++) {
                sum += samples[s] * samples[s];
            }
            count += samples != NULL ? size : 0;
        }
        if (count == 0) {
            return;
        }
        float rms = (float) std::sqrt(sum / count);
        float seen = loudest.load(std::memory_order_relaxed);
        while (rms > seen && !loudest.compare_exchange_weak(seen, rms, std::memory_order_relaxed)) {
        }
    }

    float take() {
        return loudest.exchange(0, std::memory_order_relaxed);
    }
};

// One side of the call being measured. `target` names what it listens to, so a
// follow only restarts it when the call moved to another mic or app.
struct Capture {
    Meter meter;
    std::string target;
    AudioObjectID device = kAudioObjectUnknown;
    AudioDeviceIOProcID proc = NULL;
    AudioObjectID tap = kAudioObjectUnknown; // them only: the tap and the private device that reads it
    AudioObjectID aggregate = kAudioObjectUnknown;

    bool start(AudioObjectID onDevice) {
        Meter *into = &meter;
        if (AudioDeviceCreateIOProcIDWithBlock(&proc, onDevice, NULL,
                ^(const AudioTimeStamp *, const AudioBufferList *input, const AudioTimeStamp *, AudioBufferList *, const AudioTimeStamp *) {
                    into->measure(input);
                }) != noErr) {
            proc = NULL;
            return false;
        }
        if (AudioDeviceStart(onDevice, proc) != noErr) {
            AudioDeviceDestroyIOProcID(onDevice, proc);
            proc = NULL;
            return false;
        }
        device = onDevice;
        return true;
    }

    void stop() {
        if (proc != NULL) {
            AudioDeviceStop(device, proc);
            AudioDeviceDestroyIOProcID(device, proc);
            proc = NULL;
        }
        device = kAudioObjectUnknown;
        if (@available(macOS 14.2, *)) {
            if (aggregate != kAudioObjectUnknown) {
                AudioHardwareDestroyAggregateDevice(aggregate);
            }
            if (tap != kAudioObjectUnknown) {
                AudioHardwareDestroyProcessTap(tap);
            }
        }
        aggregate = kAudioObjectUnknown;
        tap = kAudioObjectUnknown;
        target.clear();
        meter.take();
    }

    bool running() const {
        return proc != NULL;
    }
};

Capture mine;
Capture theirs;

AudioObjectID defaultInput() {
    return readAudioValue<AudioObjectID>(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultInputDevice, kAudioObjectUnknown);
}

// The mics the call apps record from, the system's default first if they use it.
// The system default comes last as a fallback, for an app recording through a
// private device this app cannot open.
std::vector<AudioObjectID> callMicrophones(const std::vector<AudioObjectID> &callApps) {
    AudioObjectID fallback = defaultInput();
    std::vector<AudioObjectID> mics;
    for (AudioObjectID app : callApps) {
        for (AudioObjectID device : readAudioArray<AudioObjectID>(app, kAudioProcessPropertyDevices, kAudioObjectPropertyScopeInput)) {
            mics.insert(device == fallback ? mics.begin() : mics.end(), device);
        }
    }
    mics.push_back(fallback);
    return mics;
}

std::string familyOf(const std::string &bundleId) {
    std::string lower = bundleId;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    size_t helper = lower.find(".helper");
    return helper == std::string::npos ? bundleId : bundleId.substr(0, helper);
}

// Every process of the apps on the call: a browser or Electron call app often
// records in one helper process and plays in another.
std::vector<AudioObjectID> callPlayers(const std::vector<AudioObjectID> &callApps) {
    std::vector<std::string> families;
    for (AudioObjectID app : callApps) {
        families.push_back(familyOf(audioProcessBundleId(app)));
    }
    std::vector<AudioObjectID> players;
    for (AudioObjectID process : otherAudioProcesses()) {
        bool isCallApp = std::find(callApps.begin(), callApps.end(), process) != callApps.end();
        std::string bundleId = audioProcessBundleId(process);
        bool inFamily = !bundleId.empty() && std::any_of(families.begin(), families.end(), [&](const std::string &family) {
            return !family.empty() && (bundleId == family || bundleId.rfind(family + ".", 0) == 0);
        });
        if (isCallApp || inFamily) {
            players.push_back(process);
        }
    }
    return players;
}

void followMine(const std::vector<AudioObjectID> &callApps) {
    std::vector<AudioObjectID> mics = callMicrophones(callApps);
    std::string target = std::to_string(mics.front());
    if (target == mine.target) {
        return;
    }
    mine.stop();
    for (AudioObjectID mic : mics) {
        if (mic != kAudioObjectUnknown && mine.start(mic)) {
            break;
        }
    }
    mine.target = target;
}

// What the call apps play: a private tap on their processes, read through a
// private aggregate device that holds only the tap, so no mic leaks in.
void followTheirs(const std::vector<AudioObjectID> &callApps) API_AVAILABLE(macos(14.2)) {
    std::vector<AudioObjectID> players = callPlayers(callApps);
    std::string target;
    NSMutableArray<NSNumber *> *processes = [NSMutableArray array];
    for (AudioObjectID player : players) {
        target += std::to_string(player) + ",";
        [processes addObject:@(player)];
    }
    if (target == theirs.target) {
        return;
    }
    theirs.stop();
    theirs.target = target;

    CATapDescription *description = [[CATapDescription alloc] initMonoMixdownOfProcesses:processes];
    description.name = @"Razer macOS call level";
    description.privateTap = YES;
    if (AudioHardwareCreateProcessTap(description, &theirs.tap) != noErr) {
        theirs.tap = kAudioObjectUnknown;
        return;
    }
    NSDictionary *aggregate = @{
        @kAudioAggregateDeviceNameKey: @"Razer macOS call level",
        @kAudioAggregateDeviceUIDKey: [NSUUID UUID].UUIDString,
        @kAudioAggregateDeviceIsPrivateKey: @YES,
        @kAudioAggregateDeviceTapAutoStartKey: @YES,
        @kAudioAggregateDeviceTapListKey: @[@{ @kAudioSubTapUIDKey: description.UUID.UUIDString }],
    };
    if (AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef) aggregate, &theirs.aggregate) != noErr) {
        theirs.aggregate = kAudioObjectUnknown;
        return;
    }
    theirs.start(theirs.aggregate);
}

} // namespace

/**
 * Starts measuring the call, or moves to the mic and apps it uses now. Cheap
 * when nothing moved, so it can run every few seconds. Stops when no other app
 * is recording. Returns which sides are being measured: { mine, theirs }.
 */
Napi::Object FollowCallAudio(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    std::vector<AudioObjectID> callApps = otherAppsRecording();
    if (callApps.empty()) {
        mine.stop();
        theirs.stop();
    } else {
        followMine(callApps);
        // Process taps arrived in macOS 14.2; before that, only your side shows.
        if (@available(macOS 14.2, *)) {
            followTheirs(callApps);
        }
    }
    Napi::Object sides = Napi::Object::New(env);
    sides.Set("mine", Napi::Boolean::New(env, mine.running()));
    sides.Set("theirs", Napi::Boolean::New(env, theirs.running()));
    return sides;
}

void StopCallAudio(const Napi::CallbackInfo &info) {
    mine.stop();
    theirs.stop();
}

/**
 * How loud each side was since the last read, as RMS amplitudes (0 to 1):
 * { mine, theirs }. Silence where a side is not being measured, or where
 * macOS has not given permission.
 */
Napi::Object ReadCallAudio(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object levels = Napi::Object::New(env);
    levels.Set("mine", Napi::Number::New(env, mine.meter.take()));
    levels.Set("theirs", Napi::Number::New(env, theirs.meter.take()));
    return levels;
}

void InitCallAudio(Napi::Env env, Napi::Object exports) {
    exports.Set("followCallAudio", Napi::Function::New(env, FollowCallAudio));
    exports.Set("stopCallAudio", Napi::Function::New(env, StopCallAudio));
    exports.Set("readCallAudio", Napi::Function::New(env, ReadCallAudio));
}
