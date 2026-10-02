#pragma once

#include <napi.h>

// Watches for taps of the Control keys, for the panic button.
void InitKeyWatch(Napi::Env env, Napi::Object exports);
