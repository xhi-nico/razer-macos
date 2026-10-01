#pragma once

#include <napi.h>

// Read-only macOS state for the lights: session lock, camera use, attached Razer devices.
void InitMacSignals(Napi::Env env, Napi::Object exports);
