#pragma once

#include <napi.h>

// What the Mac is playing, as loudness and a spectrum, for the keyboard's top row.
void InitMusicAudio(Napi::Env env, Napi::Object exports);
