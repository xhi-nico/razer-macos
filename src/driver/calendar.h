#pragma once

#include <napi.h>

// Upcoming meetings from the Mac's Calendar (EventKit), for the meeting countdown.
void InitCalendar(Napi::Env env, Napi::Object exports);
