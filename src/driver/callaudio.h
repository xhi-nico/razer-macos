#pragma once

#include <napi.h>

// How loud each side of a call is (your mic, and what the call app plays), for the keyboard's top row.
void InitCallAudio(Napi::Env env, Napi::Object exports);
