#include <unistd.h>
#include <algorithm>
#include <cctype>

#include "audioprocesses.h"

// Dictation apps record the mic for a few seconds at a time; that is not a call.
// Each also covers its helpers (an ID starting with it and a dot).
static const char *DICTATION_APPS[] = {
    "com.electron.wispr-flow",
    "com.superduper.superwhisper",
    "com.goodsnooze.macwhisper",
};

static bool isDictationApp(AudioObjectID process) {
    std::string bundleId = audioProcessBundleId(process);
    std::transform(bundleId.begin(), bundleId.end(), bundleId.begin(), ::tolower);
    return std::any_of(std::begin(DICTATION_APPS), std::end(DICTATION_APPS), [&](const std::string &app) {
        return bundleId == app || bundleId.rfind(app + ".", 0) == 0;
    });
}

std::vector<AudioObjectID> otherAudioProcesses() {
    std::vector<AudioObjectID> processes;
    pid_t self = getpid();
    for (AudioObjectID process : readAudioArray<AudioObjectID>(kAudioObjectSystemObject, kAudioHardwarePropertyProcessObjectList)) {
        if (readAudioValue<pid_t>(process, kAudioProcessPropertyPID, -1) != self) {
            processes.push_back(process);
        }
    }
    return processes;
}

// The other processes whose `running` property is set. Asks that first, so this
// app's own process ID is only read for the few that are.
static std::vector<AudioObjectID> othersWhere(AudioObjectPropertySelector running) {
    std::vector<AudioObjectID> matching;
    pid_t self = getpid();
    for (AudioObjectID process : readAudioArray<AudioObjectID>(kAudioObjectSystemObject, kAudioHardwarePropertyProcessObjectList)) {
        if (readAudioValue<UInt32>(process, running, 0) && readAudioValue<pid_t>(process, kAudioProcessPropertyPID, -1) != self) {
            matching.push_back(process);
        }
    }
    return matching;
}

std::vector<AudioObjectID> otherAppsRecording() {
    std::vector<AudioObjectID> recording = othersWhere(kAudioProcessPropertyIsRunningInput);
    recording.erase(std::remove_if(recording.begin(), recording.end(), isDictationApp), recording.end());
    return recording;
}

bool otherAppsPlaying() {
    return !othersWhere(kAudioProcessPropertyIsRunningOutput).empty();
}

std::string audioProcessBundleId(AudioObjectID process) {
    CFStringRef bundleId = readAudioValue<CFStringRef>(process, kAudioProcessPropertyBundleID, NULL);
    if (bundleId == NULL) {
        return "";
    }
    char buffer[256] = "";
    CFStringGetCString(bundleId, buffer, sizeof(buffer), kCFStringEncodingUTF8);
    CFRelease(bundleId);
    return buffer;
}
