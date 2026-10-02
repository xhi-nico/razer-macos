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

std::vector<AudioObjectID> otherAppsRecording() {
    std::vector<AudioObjectID> recording;
    for (AudioObjectID process : otherAudioProcesses()) {
        if (readAudioValue<UInt32>(process, kAudioProcessPropertyIsRunningInput, 0)) {
            recording.push_back(process);
        }
    }
    return recording;
}

bool otherAppsPlaying() {
    for (AudioObjectID process : otherAudioProcesses()) {
        if (readAudioValue<UInt32>(process, kAudioProcessPropertyIsRunningOutput, 0)) {
            return true;
        }
    }
    return false;
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
