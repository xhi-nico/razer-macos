#include <napi.h>
#include <string>
#include <vector>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>
#include <CoreMediaIO/CMIOHardware.h>
#include <CoreAudio/CoreAudio.h>
#include <CoreGraphics/CoreGraphics.h>

#include "macsignals.h"

extern "C"
{
#include "razerdevice.h"
}

static bool isRazer(io_service_t usbDevice) {
    CFTypeRef vendorId = IORegistryEntryCreateCFProperty(usbDevice, CFSTR(kUSBVendorID), kCFAllocatorDefault, 0);
    if (vendorId == NULL) {
        return false;
    }
    SInt32 value = 0;
    bool matches = CFGetTypeID(vendorId) == CFNumberGetTypeID()
        && CFNumberGetValue((CFNumberRef) vendorId, kCFNumberSInt32Type, &value)
        && value == USB_VENDOR_ID_RAZER;
    CFRelease(vendorId);
    return matches;
}

/**
 * Registry entry IDs of every attached Razer USB device, without opening any of them.
 * An ID changes whenever a device re-enumerates (unplug, replug, wake from sleep),
 * so a changed list means the open device handles are stale.
 */
Napi::Array ListRazerUsbEntries(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Array entries = Napi::Array::New(env);

    CFMutableDictionaryRef matchingDict = IOServiceMatching(kIOUSBDeviceClassName);
    if (matchingDict == NULL) {
        return entries;
    }

    io_iterator_t iter;
    // Consumes matchingDict.
    if (IOServiceGetMatchingServices(MACH_PORT_NULL, matchingDict, &iter) != KERN_SUCCESS) {
        return entries;
    }

    uint32_t count = 0;
    io_service_t usbDevice;
    while ((usbDevice = IOIteratorNext(iter))) {
        uint64_t entryId = 0;
        if (isRazer(usbDevice) && IORegistryEntryGetRegistryEntryID(usbDevice, &entryId) == KERN_SUCCESS) {
            entries[count++] = Napi::String::New(env, std::to_string(entryId));
        }
        IOObjectRelease(usbDevice);
    }
    IOObjectRelease(iter);
    return entries;
}

/**
 * True while any camera is streaming to any app. Reading this property opens
 * no camera, so it needs no camera permission.
 */
Napi::Boolean IsCameraInUse(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    CMIOObjectPropertyAddress devicesAddress = {
        kCMIOHardwarePropertyDevices, kCMIOObjectPropertyScopeGlobal, kCMIOObjectPropertyElementMain
    };
    UInt32 dataSize = 0;
    if (CMIOObjectGetPropertyDataSize(kCMIOObjectSystemObject, &devicesAddress, 0, NULL, &dataSize) != kCMIOHardwareNoError
        || dataSize == 0) {
        return Napi::Boolean::New(env, false);
    }

    std::vector<CMIOObjectID> cameras(dataSize / sizeof(CMIOObjectID));
    UInt32 dataUsed = 0;
    if (CMIOObjectGetPropertyData(kCMIOObjectSystemObject, &devicesAddress, 0, NULL, dataSize, &dataUsed, cameras.data())
        != kCMIOHardwareNoError) {
        return Napi::Boolean::New(env, false);
    }

    CMIOObjectPropertyAddress runningAddress = {
        kCMIODevicePropertyDeviceIsRunningSomewhere, kCMIOObjectPropertyScopeWildcard, kCMIOObjectPropertyElementWildcard
    };
    for (CMIOObjectID camera : cameras) {
        UInt32 isRunning = 0;
        if (CMIOObjectGetPropertyData(camera, &runningAddress, 0, NULL, sizeof(isRunning), &dataUsed, &isRunning)
            == kCMIOHardwareNoError && isRunning) {
            return Napi::Boolean::New(env, true);
        }
    }
    return Napi::Boolean::New(env, false);
}

template <typename T>
static std::vector<T> readArrayProperty(AudioObjectID object, AudioObjectPropertySelector selector) {
    AudioObjectPropertyAddress address = {
        selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain
    };
    UInt32 dataSize = 0;
    if (AudioObjectGetPropertyDataSize(object, &address, 0, NULL, &dataSize) != noErr || dataSize == 0) {
        return {};
    }
    std::vector<T> values(dataSize / sizeof(T));
    if (AudioObjectGetPropertyData(object, &address, 0, NULL, &dataSize, values.data()) != noErr) {
        return {};
    }
    return values;
}

static bool readFlag(AudioObjectID object, AudioObjectPropertySelector selector) {
    AudioObjectPropertyAddress address = {
        selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain
    };
    UInt32 value = 0;
    UInt32 size = sizeof(value);
    return AudioObjectGetPropertyData(object, &address, 0, NULL, &size, &value) == noErr && value;
}

/**
 * True while any app is recording from a microphone. Asks per app rather than
 * per device, because a headset playing music runs its mic's device too. Like
 * the camera check, this opens nothing, so it needs no microphone permission.
 */
Napi::Boolean IsMicInUse(const Napi::CallbackInfo &info) {
    for (AudioObjectID process : readArrayProperty<AudioObjectID>(kAudioObjectSystemObject, kAudioHardwarePropertyProcessObjectList)) {
        if (readFlag(process, kAudioProcessPropertyIsRunningInput)) {
            return Napi::Boolean::New(info.Env(), true);
        }
    }
    return Napi::Boolean::New(info.Env(), false);
}

static bool readSessionFlag(CFDictionaryRef session, CFStringRef key, bool fallback) {
    CFTypeRef value = CFDictionaryGetValue(session, key);
    if (value == NULL || CFGetTypeID(value) != CFBooleanGetTypeID()) {
        return fallback;
    }
    return CFBooleanGetValue((CFBooleanRef) value);
}

/**
 * This user's login session: whether it is the one at the screen (false after
 * switching to another user) and whether the screen is locked.
 */
Napi::Object GetSessionState(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    bool onConsole = true;
    bool locked = false;

    CFDictionaryRef session = CGSessionCopyCurrentDictionary();
    if (session != NULL) {
        onConsole = readSessionFlag(session, kCGSessionOnConsoleKey, true);
        locked = readSessionFlag(session, CFSTR("CGSSessionScreenIsLocked"), false);
        CFRelease(session);
    }

    Napi::Object state = Napi::Object::New(env);
    state.Set("onConsole", Napi::Boolean::New(env, onConsole));
    state.Set("locked", Napi::Boolean::New(env, locked));
    return state;
}

void InitMacSignals(Napi::Env env, Napi::Object exports) {
    exports.Set("listRazerUsbEntries", Napi::Function::New(env, ListRazerUsbEntries));
    exports.Set("isCameraInUse", Napi::Function::New(env, IsCameraInUse));
    exports.Set("isMicInUse", Napi::Function::New(env, IsMicInUse));
    exports.Set("getSessionState", Napi::Function::New(env, GetSessionState));
}
