#include <napi.h>
#include <atomic>
#include <thread>
#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/IOHIDLib.h>

#include "keywatch.h"

namespace {

// What JS hears. Never which key: only Control going down or up, or any other key.
enum KeyEvent { CONTROL_DOWN = 1, CONTROL_UP = 2, OTHER_KEY = 3 };

// Virtual key codes of the left and right Control keys, and their device-specific flag bits.
constexpr int64_t LEFT_CONTROL = 59;
constexpr int64_t RIGHT_CONTROL = 62;
constexpr CGEventFlags LEFT_CONTROL_FLAG = 0x00000001;
constexpr CGEventFlags RIGHT_CONTROL_FLAG = 0x00002000;

Napi::ThreadSafeFunction listener;
std::thread watcher;
std::atomic<CFRunLoopRef> watcherLoop{nullptr};
CFMachPortRef tap = nullptr;

void tell(KeyEvent event) {
    listener.NonBlockingCall([event](Napi::Env env, Napi::Function callback) {
        callback.Call({ Napi::Number::New(env, event) });
    });
}

CGEventRef onEvent(CGEventTapProxy, CGEventType type, CGEventRef event, void *) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        CGEventTapEnable(tap, true);
        return event;
    }
    if (type == kCGEventKeyDown) {
        tell(OTHER_KEY);
        return event;
    }
    if (type == kCGEventFlagsChanged) {
        int64_t key = CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (key == LEFT_CONTROL || key == RIGHT_CONTROL) {
            CGEventFlags flag = key == LEFT_CONTROL ? LEFT_CONTROL_FLAG : RIGHT_CONTROL_FLAG;
            tell((CGEventGetFlags(event) & flag) ? CONTROL_DOWN : CONTROL_UP);
        } else {
            tell(OTHER_KEY); // Shift, Command, Option, Fn, Caps Lock
        }
    }
    return event;
}

} // namespace

/**
 * Input Monitoring, which a listen-only key watch needs: "granted", "denied"
 * or "unknown" (never asked).
 */
Napi::String InputMonitoringAccess(const Napi::CallbackInfo &info) {
    switch (IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)) {
        case kIOHIDAccessTypeGranted: return Napi::String::New(info.Env(), "granted");
        case kIOHIDAccessTypeDenied: return Napi::String::New(info.Env(), "denied");
        default: return Napi::String::New(info.Env(), "unknown");
    }
}

// Asks macOS once (it lists the app under Input Monitoring); true when already granted.
Napi::Boolean RequestInputMonitoring(const Napi::CallbackInfo &info) {
    return Napi::Boolean::New(info.Env(), IOHIDRequestAccess(kIOHIDRequestTypeListenEvent));
}

/**
 * Starts watching the keyboard, listen-only: calls back with 1 (Control down),
 * 2 (Control up) or 3 (any other key). False when macOS refuses, which is what
 * happens without Input Monitoring.
 */
Napi::Boolean StartKeyWatch(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (tap != nullptr) {
        return Napi::Boolean::New(env, true);
    }
    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventFlagsChanged);
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly, mask, onEvent, nullptr);
    if (tap == nullptr) {
        return Napi::Boolean::New(env, false);
    }
    listener = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "keywatch", 0, 1);
    // The callbacks must not keep the app alive at quit.
    listener.Unref(env);
    CFMachPortRef port = tap;
    watcher = std::thread([port] {
        CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0);
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
        CGEventTapEnable(port, true);
        watcherLoop = CFRunLoopGetCurrent();
        CFRunLoopRun();
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
        CFRelease(source);
    });
    return Napi::Boolean::New(env, true);
}

void StopKeyWatch(const Napi::CallbackInfo &info) {
    if (tap == nullptr) {
        return;
    }
    CGEventTapEnable(tap, false);
    while (watcherLoop.load() == nullptr) {
        std::this_thread::yield(); // the thread is still starting its loop
    }
    CFRunLoopStop(watcherLoop.exchange(nullptr));
    watcher.join();
    CFMachPortInvalidate(tap);
    CFRelease(tap);
    tap = nullptr;
    listener.Release();
}

void InitKeyWatch(Napi::Env env, Napi::Object exports) {
    exports.Set("inputMonitoringAccess", Napi::Function::New(env, InputMonitoringAccess));
    exports.Set("requestInputMonitoring", Napi::Function::New(env, RequestInputMonitoring));
    exports.Set("startKeyWatch", Napi::Function::New(env, StartKeyWatch));
    exports.Set("stopKeyWatch", Napi::Function::New(env, StopKeyWatch));
}
