#include <unistd.h>

#include "audioprocesses.h"

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
    return othersWhere(kAudioProcessPropertyIsRunningInput);
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
