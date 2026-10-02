#pragma once

#include <CoreAudio/CoreAudio.h>
#include <string>
#include <vector>

// Core Audio's per-app view (macOS 14+): which apps are doing audio, and on which devices.

template <typename T>
std::vector<T> readAudioArray(AudioObjectID object, AudioObjectPropertySelector selector,
                              AudioObjectPropertyScope scope = kAudioObjectPropertyScopeGlobal) {
    AudioObjectPropertyAddress address = { selector, scope, kAudioObjectPropertyElementMain };
    UInt32 dataSize = 0;
    if (AudioObjectGetPropertyDataSize(object, &address, 0, NULL, &dataSize) != noErr || dataSize == 0) {
        return {};
    }
    std::vector<T> values(dataSize / sizeof(T));
    if (AudioObjectGetPropertyData(object, &address, 0, NULL, &dataSize, values.data()) != noErr) {
        return {};
    }
    values.resize(dataSize / sizeof(T));
    return values;
}

template <typename T>
T readAudioValue(AudioObjectID object, AudioObjectPropertySelector selector, T fallback) {
    AudioObjectPropertyAddress address = { selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain };
    T value = fallback;
    UInt32 size = sizeof(value);
    return AudioObjectGetPropertyData(object, &address, 0, NULL, &size, &value) == noErr ? value : fallback;
}

// Every app's process object, except this app's own: it records too, while measuring the call.
std::vector<AudioObjectID> otherAudioProcesses();

// The other apps recording from a microphone right now.
std::vector<AudioObjectID> otherAppsRecording();

// Whether any other app is playing audio right now (possibly silence).
bool otherAppsPlaying();

// A process's bundle ID, or "" for one without (a command-line tool).
std::string audioProcessBundleId(AudioObjectID process);
