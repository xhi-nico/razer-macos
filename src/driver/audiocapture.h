#pragma once

#include <algorithm>
#include <atomic>
#include <cmath>
#include <iterator>
#include <cstdint>
#include <string>
#import <Foundation/Foundation.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>

// Listening to audio for the lights: a loudness meter, a buffer of the latest
// samples, and a capture that feeds them from a device or an app's audio. Only
// loudness and spectrum are ever computed; nothing is kept or recorded.

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

// The latest samples of the first channel, for a spectrum. The real-time thread
// writes while JS reads, so a read can catch a few samples mid-write; for a
// light show that is invisible.
struct Ring {
    static constexpr size_t SIZE = 8192;
    float samples[SIZE] = {0};
    std::atomic<uint64_t> written{0};

    void push(const AudioBufferList *buffers) {
        if (buffers->mNumberBuffers == 0 || buffers->mBuffers[0].mData == NULL) {
            return;
        }
        const AudioBuffer &buffer = buffers->mBuffers[0];
        const float *data = (const float *) buffer.mData;
        size_t channels = std::max<UInt32>(1, buffer.mNumberChannels);
        size_t frames = buffer.mDataByteSize / sizeof(float) / channels;
        uint64_t at = written.load(std::memory_order_relaxed);
        for (size_t f = 0; f < frames; f++) {
            samples[(at + f) % SIZE] = data[f * channels];
        }
        written.store(at + frames, std::memory_order_release);
    }

    // The newest `count` samples, oldest first (count at most SIZE).
    void latest(float *out, size_t count) const {
        uint64_t end = written.load(std::memory_order_acquire);
        for (size_t i = 0; i < count; i++) {
            out[i] = end + i >= count ? samples[(end + i - count) % SIZE] : 0;
        }
    }

    void clear() {
        std::fill(std::begin(samples), std::end(samples), 0.0f);
    }
};

// One audio source being listened to. `target` names what it listens to, so a
// follow only restarts it when that changed.
struct Capture {
    Meter meter;
    Ring *ring = nullptr; // also fed, when set
    std::string target;
    AudioObjectID device = kAudioObjectUnknown;
    AudioDeviceIOProcID proc = NULL;
    AudioObjectID tap = kAudioObjectUnknown; // an app's audio: the tap and the private device that reads it
    AudioObjectID aggregate = kAudioObjectUnknown;

    bool start(AudioObjectID onDevice) {
        Meter *into = &meter;
        Ring *samples = ring;
        if (AudioDeviceCreateIOProcIDWithBlock(&proc, onDevice, NULL,
                ^(const AudioTimeStamp *, const AudioBufferList *input, const AudioTimeStamp *, AudioBufferList *, const AudioTimeStamp *) {
                    into->measure(input);
                    if (samples != nullptr) {
                        samples->push(input);
                    }
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
        if (ring != nullptr) {
            ring->clear();
        }
    }

    bool running() const {
        return proc != NULL;
    }
};

// Listens to what a tap hears: a private tap, read through a private aggregate
// device that holds only the tap, so no mic leaks in. macOS asks once for
// "system audio recording"; without it the capture hears silence.
inline bool startTap(Capture &capture, CATapDescription *description, NSString *name) API_AVAILABLE(macos(14.2)) {
    description.name = name;
    description.privateTap = YES;
    if (AudioHardwareCreateProcessTap(description, &capture.tap) != noErr) {
        capture.tap = kAudioObjectUnknown;
        return false;
    }
    NSDictionary *aggregate = @{
        @kAudioAggregateDeviceNameKey: name,
        @kAudioAggregateDeviceUIDKey: [NSUUID UUID].UUIDString,
        @kAudioAggregateDeviceIsPrivateKey: @YES,
        @kAudioAggregateDeviceTapAutoStartKey: @YES,
        @kAudioAggregateDeviceTapListKey: @[@{ @kAudioSubTapUIDKey: description.UUID.UUIDString }],
    };
    if (AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef) aggregate, &capture.aggregate) != noErr) {
        capture.aggregate = kAudioObjectUnknown;
        return false;
    }
    return capture.start(capture.aggregate);
}
