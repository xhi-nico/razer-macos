#pragma once

#include <napi.h>

// The macOS colour panel, for picking custom colours from the menu.
void InitColorPanel(Napi::Env env, Napi::Object exports);
