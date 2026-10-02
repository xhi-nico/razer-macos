#include <napi.h>
#include <iostream>
#include <iomanip>
#include <string>
#include <type_traits>

#include "macsignals.h"
#include "calendar.h"
#include "callaudio.h"
#include "musicaudio.h"

extern "C"
{
#include "razerdevice.h"
#include "razerkbd_driver.h"
#include "razermouse_driver.h"
#include "razermousedock_driver.h"
#include "razermousemat_driver.h"
#include "razerheadphone_driver.h"
#include "razercommon.h"
}

// The devices open right now. Empty (NULL, 0) whenever none are, never dangling.
RazerDevices devices = {NULL, 0};

// Each scan numbers its devices from here on, so an ID from an earlier scan
// never names a device from a later one; it is refused instead (see getRazerDeviceFor).
static int nextDeviceId = 1;

/**
 * The open device an ID names. An unknown ID (a device from before the last
 * scan, or after its close) throws, rather than handing the driver a NULL
 * handle it would crash on.
 */
RazerDevice getRazerDeviceFor(const Napi::CallbackInfo &info) {
    int internalDeviceId = info[0].ToNumber().Int32Value();
    for (int counter = 0; counter < devices.size; ++counter) {
        if (devices.devices[counter].internalDeviceId == internalDeviceId && devices.devices[counter].usbDevice != NULL) {
            return devices.devices[counter];
        }
    }
    throw Napi::Error::New(info.Env(), "Razer device " + std::to_string(internalDeviceId) + " is not open");
}

/**
 * Wraps a device function so a USB failure inside it (device gone, stalled,
 * timed out) throws, instead of passing silently as the driver would.
 */
template <auto Fn>
Napi::Value Guarded(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    razer_take_usb_error();
    Napi::Value result = env.Undefined();
    if constexpr (std::is_void_v<decltype(Fn(info))>) {
        Fn(info);
    } else {
        result = Fn(info);
    }
    IOReturn error = razer_take_usb_error();
    if (error != kIOReturnSuccess && !env.IsExceptionPending()) {
        char code[16];
        snprintf(code, sizeof(code), "%08x", error);
        Napi::Error failure = Napi::Error::New(env, std::string("USB request failed: ") + code);
        failure.Set("usbError", Napi::Number::New(env, error));
        throw failure;
    }
    return result;
}

/**
* Keyboard functions
*/

void KbdSetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_mode_none(device.usbDevice, "1", 1);
}

void KbdSetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

void KbdSetModeWave(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    std::string waveSettingString = info[1].ToString().Utf8Value();
    const char *waveSetting = waveSettingString.c_str();
    if (std::strncmp(waveSetting, "left_turtle", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0xFF);
    } else if (std::strncmp(waveSetting, "left_slowest", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0xD9);
    } else if (std::strncmp(waveSetting, "left_slower", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0xB9);
    } else if (std::strncmp(waveSetting, "left_slow", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x90);
    } else if (std::strncmp(waveSetting, "left_default", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x70);
    } else if (std::strncmp(waveSetting, "left_fast", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x55);
    } else if (std::strncmp(waveSetting, "left_faster", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x40);
    } else if (std::strncmp(waveSetting, "left_fastest", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x25);
    } else if (std::strncmp(waveSetting, "left_lightning", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "1", 0, 0x10);
    }
// right
    else if (std::strncmp(waveSetting, "right_turtle", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0xFF);
    } else if (std::strncmp(waveSetting, "right_slowest", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0xD9);
    } else if (std::strncmp(waveSetting, "right_slower", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0xB9);
    } else if (std::strncmp(waveSetting, "right_slow", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x90);
    } else if (std::strncmp(waveSetting, "right_default", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x70);
    } else if (std::strncmp(waveSetting, "right_fast", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x55);
    } else if (std::strncmp(waveSetting, "right_faster", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x40);
    } else if (std::strncmp(waveSetting, "right_fastest", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x25);
    } else if (std::strncmp(waveSetting, "right_lightning", 20) == 0) {
        razer_attr_write_mode_wave(device.usbDevice, "2", 0, 0x10);
    }
}

void KbdSetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Static only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_mode_static(device.usbDevice, buf, 3);
}

void KbdSetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Static only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_mode_static_no_store(device.usbDevice, buf, 3);
}

void KbdSetModeReactive(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();
    // TODO: allow different arg length types
    if (argsArr.ElementLength() != 4) {
        Napi::TypeError::New(env, "Reactive only accepts Speed, RGB (4byte)")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_mode_reactive(device.usbDevice, buf, 4);
}

void KbdSetModeBreathe(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 1) {
        Napi::TypeError::New(env, "Breathing only accepts '1' (1byte). RGB (3byte). RGB, RGB (6byte)")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_mode_breath(device.usbDevice, buf, 1);
}

Napi::Number KbdGetBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_set_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void KbdSetBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_set_brightness(device.usbDevice, brightness, 1);
}

void KbdSetModeStarlight(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();
    int argsArr_len = argsArr.ElementLength();
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();
    if (argsArr_len == 7) //two colors
    {
        razer_attr_write_mode_starlight(device.usbDevice, buf, 7);
    } else if (argsArr_len == 4) //single color
    {
        razer_attr_write_mode_starlight(device.usbDevice, buf, 4);
    } else if (argsArr_len == 1) //random
    {
        razer_attr_write_mode_starlight(device.usbDevice, buf, 1);
    } else //exception
    {
        Napi::TypeError::New(env, "Starlight only accepts Speed (1byte). Speed, RGB (4byte). Speed, RGB, RGB (7byte)")
                .ThrowAsJavaScriptException();
        return;

    }
}

void KbdSetModeCustom(const Napi::CallbackInfo &info)
{
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_mode_custom(device.usbDevice, "1", 1);
}

void KbdSetCustomFrame(const Napi::CallbackInfo &info)
{
    RazerDevice device = getRazerDeviceFor(info);
    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();
    int argsArr_len = argsArr.ElementLength();

    // Cast unsigned char array into char array
    char *buf = (char *)info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_matrix_custom_frame(device.usbDevice, buf, argsArr_len);
}

/**
* Mouse
*/

Napi::Number GetMousebatteryLevel(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    Napi::Env env = info.Env();

    char buf[4] = {0};

    razer_attr_read_get_battery(device.usbDevice, buf);
    double bufferValue = atof(buf);

    if (bufferValue <= 0) {
        return Napi::Number::New(env, -1);
    }
    double batteryLevel = (bufferValue * 100.0) / 255.0;
    return Napi::Number::New(env, static_cast<int>(batteryLevel));
}

Napi::Boolean GetIsMouseCharging(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    char buf[2] = {0};
    razer_attr_read_is_charging(device.usbDevice, buf);
    int charging = atoi(buf);

    return Napi::Boolean::New(env, static_cast<bool>(charging));
}

void MouseSetLogoLEDEffect(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    std::string effectString = info[1].ToString().Utf8Value();
    const char *effect = effectString.c_str();

    if (std::strncmp(effect, "static", 6) == 0) {
        razer_attr_write_logo_led_effect(device.usbDevice, "0", 1);
        razer_attr_write_scroll_led_effect(device.usbDevice, "0", 1);
    } else if (std::strncmp(effect, "blinking", 8) == 0) {
        razer_attr_write_logo_led_effect(device.usbDevice, "1", 1);
        razer_attr_write_scroll_led_effect(device.usbDevice, "1", 1);
    } else if (std::strncmp(effect, "pulsate", 7) == 0) {
        razer_attr_write_logo_led_effect(device.usbDevice, "2", 1);
        razer_attr_write_scroll_led_effect(device.usbDevice, "2", 1);
    } else if (std::strncmp(effect, "scroll", 6) == 0) {
        razer_attr_write_logo_led_effect(device.usbDevice, "4", 1);
        razer_attr_write_scroll_led_effect(device.usbDevice, "4", 1);
    }
}

void MouseSetLogoLEDRGB(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_logo_led_rgb(device.usbDevice, buf, 3);
}

void MouseSetLogoModeWave(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    if (std::strncmp(info[1].ToString().Utf8Value().c_str(), "left", 4) == 0) {
        razer_attr_write_logo_mode_wave(device.usbDevice, "1", 0);
        razer_attr_write_scroll_mode_wave(device.usbDevice, "1", 0);
        razer_attr_write_left_mode_wave(device.usbDevice, "1", 0);
        razer_attr_write_right_mode_wave(device.usbDevice, "1", 0);
    } else {
        razer_attr_write_logo_mode_wave(device.usbDevice, "2", 0);
        razer_attr_write_scroll_mode_wave(device.usbDevice, "2", 0);
        razer_attr_write_left_mode_wave(device.usbDevice, "2", 0);
        razer_attr_write_right_mode_wave(device.usbDevice, "2", 0);
    }
}

void MouseSetLogoModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_logo_mode_static(device.usbDevice, buf, 3);
    razer_attr_write_scroll_mode_static(device.usbDevice, buf, 3);
    razer_attr_write_left_mode_static(device.usbDevice, buf, 3);
    razer_attr_write_right_mode_static(device.usbDevice, buf, 3);
}

void MouseSetLogoModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_logo_mode_static_no_store(device.usbDevice, buf, 3);
    razer_attr_write_scroll_mode_static_no_store(device.usbDevice, buf, 3);
    razer_attr_write_left_mode_static_no_store(device.usbDevice, buf, 3);
    razer_attr_write_right_mode_static_no_store(device.usbDevice, buf, 3);
}

void MouseSetLogoModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_logo_mode_spectrum(device.usbDevice, "1", 1);
    razer_attr_write_scroll_mode_spectrum(device.usbDevice, "1", 1);
    razer_attr_write_left_mode_spectrum(device.usbDevice, "1", 1);
    razer_attr_write_right_mode_spectrum(device.usbDevice, "1", 1);
}

void MouseSetLogoModeReactive(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 4) {
        Napi::TypeError::New(env, "Reactive only accepts Speed, RGB (4byte)")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_attr_write_logo_mode_reactive(device.usbDevice, buf, 4);
    razer_attr_write_scroll_mode_reactive(device.usbDevice, buf, 4);
    razer_attr_write_left_mode_reactive(device.usbDevice, buf, 4);
    razer_attr_write_right_mode_reactive(device.usbDevice, buf, 4);
}

void MouseSetLogoModeBreathe(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_logo_mode_breath(device.usbDevice, "1", 1);
    razer_attr_write_scroll_mode_breath(device.usbDevice, "1", 1);
    razer_attr_write_left_mode_breath(device.usbDevice, "1", 1);
    razer_attr_write_right_mode_breath(device.usbDevice, "1", 1);
}

void MouseSetLogoModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_attr_write_logo_mode_none(device.usbDevice, "1", 1);
    razer_attr_write_scroll_mode_none(device.usbDevice, "1", 1);
    razer_attr_write_left_mode_none(device.usbDevice, "1", 1);
    razer_attr_write_right_mode_none(device.usbDevice, "1", 1);
}

Napi::Number MouseGetDpi(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    ushort dpi = razer_attr_read_dpi(device.usbDevice);
    return Napi::Number::New(env, dpi);
}

void MouseSetDpi(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    Napi::Number dpi_number = info[1].ToNumber();
    ushort dpi = dpi_number.Int32Value();

    razer_attr_write_dpi(device.usbDevice, dpi, dpi);
}

Napi::Number MouseGetPollRate(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    ushort dpi = razer_attr_read_poll_rate(device.usbDevice);
    return Napi::Number::New(env, dpi);
}

void MouseSetPollRate(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    Napi::Number pollRate = info[1].ToNumber();
    ushort poll_rate = pollRate.Int32Value();

    razer_attr_write_poll_rate(device.usbDevice, poll_rate);
}

Napi::Number MouseGetBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_matrix_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void MouseSetBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_matrix_brightness(device.usbDevice, brightness);
}

Napi::Number MouseGetLogoBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_logo_led_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void MouseSetLogoBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_logo_led_brightness(device.usbDevice, brightness);
}

Napi::Number MouseGetScrollBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_scroll_led_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void MouseSetScrollBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_scroll_led_brightness(device.usbDevice, brightness);
}

Napi::Number MouseGetLeftBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_left_led_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void MouseSetLeftBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_left_led_brightness(device.usbDevice, brightness);
}

Napi::Number MouseGetRightBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_attr_read_right_led_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void MouseSetRightBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_attr_write_right_led_brightness(device.usbDevice, brightness);
}

/**
* Mouse docks
*/
void MouseDockSetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_mouse_dock_attr_write_mode_static(device.usbDevice, buf, 3);
}

void MouseDockSetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_mouse_dock_attr_write_mode_static_no_store(device.usbDevice, buf, 3);
}

void MouseDockSetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_mouse_dock_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

void MouseDockSetModeBreathe(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_mouse_dock_attr_write_mode_breath(device.usbDevice, "1", 1);
}

void MouseDockSetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_mouse_dock_attr_write_mode_none(device.usbDevice, "1", 1);
}

/**
* eGPU
*/
void EgpuSetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_egpu_attr_write_mode_static(device.usbDevice, buf, 3);
}

void EgpuSetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_egpu_attr_write_mode_static_no_store(device.usbDevice, buf, 3);
}

void EgpuSetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_egpu_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

void EgpuSetModeBreathe(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_egpu_attr_write_mode_breath(device.usbDevice, "1", 1);
}

void EgpuSetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_egpu_attr_write_mode_none(device.usbDevice, "1", 1);
}

void EgpuSetModeWave(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    if (std::strncmp(info[1].ToString().Utf8Value().c_str(), "left", 4) == 0) {
        razer_egpu_attr_write_mode_wave(device.usbDevice, "1", 0);
    } else {
        razer_egpu_attr_write_mode_wave(device.usbDevice, "2", 0);
    }
}

/**
* Mouse mat
*/

void MouseMatSetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_mouse_mat_attr_write_mode_none(device.usbDevice, "1", 1);
}

void MouseMatSetModeWave(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    if (std::strncmp(info[1].ToString().Utf8Value().c_str(), "left", 4) == 0) {
        razer_mouse_mat_attr_write_mode_wave(device.usbDevice, "1", 0);
    } else {
        razer_mouse_mat_attr_write_mode_wave(device.usbDevice, "2", 0);
    }
}

void MouseMatSetModeBreathe(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 1) {
        Napi::TypeError::New(env, "Breathing only accepts '1' (1byte). RGB (3byte). RGB, RGB (6byte)")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_mouse_mat_attr_write_mode_breath(device.usbDevice, buf, 1);
}

void MouseMatSetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_mouse_mat_attr_write_mode_static(device.usbDevice, buf, 3);
}

void MouseMatSetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_mouse_mat_attr_write_mode_static_no_store(device.usbDevice, buf, 3);
}

void MouseMatSetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_mouse_mat_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

/**
 * Headphone
 */

void HeadphoneSetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_headphone_attr_write_mode_static(device.usbDevice, buf, 3);
}

void HeadphoneSetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_headphone_attr_write_mode_static_no_store(device.usbDevice, buf, 3);
}

void HeadphoneSetModeBreathe(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_headphone_attr_write_mode_breath(device.usbDevice, "1", 1);
}

void HeadphoneSetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_headphone_attr_write_mode_none(device.usbDevice, "1", 1);
}

void HeadphoneSetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_headphone_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

/**
* Accessory
*/
void AccessorySetModeNone(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_accessory_attr_write_mode_none(device.usbDevice, "1", 1);
}

void AccessorySetModeSpectrum(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);
    razer_accessory_attr_write_mode_spectrum(device.usbDevice, "1", 1);
}

void AccessorySetModeWave(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    std::string waveSettingString = info[1].ToString().Utf8Value();
    const char *waveSetting = waveSettingString.c_str();
    if (std::strncmp(waveSetting, "left_turtle", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0xFF);
    } else if (std::strncmp(waveSetting, "left_slowest", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0xD9);
    } else if (std::strncmp(waveSetting, "left_slower", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0xB9);
    } else if (std::strncmp(waveSetting, "left_slow", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x90);
    } else if (std::strncmp(waveSetting, "left_default", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x70);
    } else if (std::strncmp(waveSetting, "left_fast", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x55);
    } else if (std::strncmp(waveSetting, "left_faster", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x40);
    } else if (std::strncmp(waveSetting, "left_fastest", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x25);
    } else if (std::strncmp(waveSetting, "left_lightning", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "1", 0, 0x10);
    }
// right
    else if (std::strncmp(waveSetting, "right_turtle", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0xFF);
    } else if (std::strncmp(waveSetting, "right_slowest", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0xD9);
    } else if (std::strncmp(waveSetting, "right_slower", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0xB9);
    } else if (std::strncmp(waveSetting, "right_slow", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x90);
    } else if (std::strncmp(waveSetting, "right_default", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x70);
    } else if (std::strncmp(waveSetting, "right_fast", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x55);
    } else if (std::strncmp(waveSetting, "right_faster", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x40);
    } else if (std::strncmp(waveSetting, "right_fastest", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x25);
    } else if (std::strncmp(waveSetting, "right_lightning", 20) == 0) {
        razer_accessory_attr_write_mode_wave(device.usbDevice, "2", 0, 0x10);
    }
}

void AccessorySetModeStatic(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Static only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_accessory_attr_write_mode_static(device.usbDevice, buf, 3);
}

void AccessorySetModeStaticNoStore(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 3) {
        Napi::TypeError::New(env, "Static only accepts RGB (3byte).")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    // we don't have no store
    razer_accessory_attr_write_mode_static(device.usbDevice, buf, 3);
}

void AccessorySetModeBreathe(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Uint8Array argsArr = info[1].As<Napi::Uint8Array>();

    if (argsArr.ElementLength() != 1) {
        Napi::TypeError::New(env, "Breathing only accepts '1' (1byte). RGB (3byte). RGB, RGB (6byte)")
                .ThrowAsJavaScriptException();
        return;
    }
    // Cast unsigned char array into char array
    char *buf = (char *) info[1].As<Napi::Uint8Array>().Data();

    razer_accessory_attr_write_mode_breath(device.usbDevice, buf, 1);
}

Napi::Number AccessoryGetBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_accessory_attr_read_set_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

void AccessorySetBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_accessory_attr_write_set_brightness(device.usbDevice, brightness, 1);
}

void MouseMatSetBrightness(const Napi::CallbackInfo &info) {
    RazerDevice device = getRazerDeviceFor(info);

    Napi::Number brightness_number = info[1].ToNumber();
    ushort brightness = brightness_number.Int32Value();

    razer_mouse_mat_attr_write_set_brightness(device.usbDevice, brightness, 1);
}
Napi::Number MouseMatGetBrightness(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    RazerDevice device = getRazerDeviceFor(info);
    ushort brightness = razer_mouse_mat_attr_read_set_brightness(device.usbDevice);
    return Napi::Number::New(env, brightness);
}

/**
* Get all razer devices
*/
void closeDevices() {
    if (devices.devices != NULL) {
        closeAllRazerDevices(devices);
    }
    devices = {NULL, 0};
}

// Rescans, closing whatever is open first: a device left open cannot be opened again.
Napi::Array GetAllDevices(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    closeDevices();
    devices = getAllRazerDevices();
    for (int counter = 0; counter < devices.size; ++counter) {
        devices.devices[counter].internalDeviceId = nextDeviceId++;
    }

    Napi::Array razerDevices = Napi::Array::New(env, devices.size);

    for (int counter = 0; counter < devices.size; ++counter) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("productId", Napi::Number::New(env, devices.devices[counter].productId));
        obj.Set("internalDeviceId", Napi::Number::New(env, devices.devices[counter].internalDeviceId));
        razerDevices[counter] = obj;
    }

    return razerDevices;
}

// See razer_set_skip_responses: for streaming lighting frames only.
void SetSkipResponses(const Napi::CallbackInfo &info) {
    razer_set_skip_responses(info[0].ToBoolean().Value());
}

void CloseAllDevices(const Napi::CallbackInfo &info) {
    closeDevices();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {

    exports.Set("kbdSetModeNone", Napi::Function::New(env, Guarded<KbdSetModeNone>));
    exports.Set("kbdSetModeSpectrum", Napi::Function::New(env, Guarded<KbdSetModeSpectrum>));
    exports.Set("kbdSetModeStatic", Napi::Function::New(env, Guarded<KbdSetModeStatic>));
    exports.Set("kbdSetModeStaticNoStore", Napi::Function::New(env, Guarded<KbdSetModeStaticNoStore>));
    exports.Set("kbdSetModeWave", Napi::Function::New(env, Guarded<KbdSetModeWave>));
    exports.Set("kbdSetModeReactive", Napi::Function::New(env, Guarded<KbdSetModeReactive>));
    exports.Set("kbdSetModeBreathe", Napi::Function::New(env, Guarded<KbdSetModeBreathe>));
    exports.Set("KbdGetBrightness", Napi::Function::New(env, Guarded<KbdGetBrightness>));
    exports.Set("KbdSetBrightness", Napi::Function::New(env, Guarded<KbdSetBrightness>));
    exports.Set("kbdSetModeStarlight", Napi::Function::New(env, Guarded<KbdSetModeStarlight>));
    exports.Set("kbdSetModeCustom", Napi::Function::New(env, Guarded<KbdSetModeCustom>));
    exports.Set("kbdSetCustomFrame", Napi::Function::New(env, Guarded<KbdSetCustomFrame>));

    exports.Set("getBatteryLevel", Napi::Function::New(env, Guarded<GetMousebatteryLevel>));
    exports.Set("getChargingStatus", Napi::Function::New(env, Guarded<GetIsMouseCharging>));
    exports.Set("mouseSetLogoModeWave", Napi::Function::New(env, Guarded<MouseSetLogoModeWave>));
    exports.Set("mouseSetLogoModeStatic", Napi::Function::New(env, Guarded<MouseSetLogoModeStatic>));
    exports.Set("mouseSetLogoModeStaticNoStore", Napi::Function::New(env, Guarded<MouseSetLogoModeStaticNoStore>));
    exports.Set("mouseSetLogoModeSpectrum", Napi::Function::New(env, Guarded<MouseSetLogoModeSpectrum>));
    exports.Set("mouseSetLogoModeReactive", Napi::Function::New(env, Guarded<MouseSetLogoModeReactive>));
    exports.Set("mouseSetLogoModeBreathe", Napi::Function::New(env, Guarded<MouseSetLogoModeBreathe>));
    exports.Set("mouseSetLogoModeNone", Napi::Function::New(env, Guarded<MouseSetLogoModeNone>));

    exports.Set("mouseGetDpi", Napi::Function::New(env, Guarded<MouseGetDpi>));
    exports.Set("mouseSetDpi", Napi::Function::New(env, Guarded<MouseSetDpi>));

    exports.Set("mouseGetPollRate", Napi::Function::New(env, Guarded<MouseGetPollRate>));
    exports.Set("mouseSetPollRate", Napi::Function::New(env, Guarded<MouseSetPollRate>));

    exports.Set("mouseGetBrightness", Napi::Function::New(env, Guarded<MouseGetBrightness>));
    exports.Set("mouseSetBrightness", Napi::Function::New(env, Guarded<MouseSetBrightness>));
    exports.Set("mouseGetScrollBrightness", Napi::Function::New(env, Guarded<MouseGetScrollBrightness>));
    exports.Set("mouseSetScrollBrightness", Napi::Function::New(env, Guarded<MouseSetScrollBrightness>));
    exports.Set("mouseGetLogoBrightness", Napi::Function::New(env, Guarded<MouseGetLogoBrightness>));
    exports.Set("mouseSetLogoBrightness", Napi::Function::New(env, Guarded<MouseSetLogoBrightness>));
    exports.Set("mouseGetLeftBrightness", Napi::Function::New(env, Guarded<MouseGetLeftBrightness>));
    exports.Set("mouseSetLeftBrightness", Napi::Function::New(env, Guarded<MouseSetLeftBrightness>));
    exports.Set("mouseGetRightBrightness", Napi::Function::New(env, Guarded<MouseGetRightBrightness>));
    exports.Set("mouseSetRightBrightness", Napi::Function::New(env, Guarded<MouseSetRightBrightness>));

    exports.Set("mouseDockSetModeNone", Napi::Function::New(env, Guarded<MouseDockSetModeNone>));
    exports.Set("mouseDockSetModeBreathe", Napi::Function::New(env, Guarded<MouseDockSetModeBreathe>));
    exports.Set("mouseDockSetModeStatic", Napi::Function::New(env, Guarded<MouseDockSetModeStatic>));
    exports.Set("mouseDockSetModeStaticNoStore", Napi::Function::New(env, Guarded<MouseDockSetModeStaticNoStore>));
    exports.Set("mouseDockSetModeSpectrum", Napi::Function::New(env, Guarded<MouseDockSetModeSpectrum>));

    exports.Set("mouseMatSetModeNone", Napi::Function::New(env, Guarded<MouseMatSetModeNone>));
    exports.Set("mouseMatSetModeWave", Napi::Function::New(env, Guarded<MouseMatSetModeWave>));
    exports.Set("mouseMatSetModeBreathe", Napi::Function::New(env, Guarded<MouseMatSetModeBreathe>));
    exports.Set("mouseMatSetModeStatic", Napi::Function::New(env, Guarded<MouseMatSetModeStatic>));
    exports.Set("mouseMatSetModeStaticNoStore", Napi::Function::New(env, Guarded<MouseMatSetModeStaticNoStore>));
    exports.Set("mouseMatSetModeSpectrum", Napi::Function::New(env, Guarded<MouseMatSetModeSpectrum>));
    exports.Set("mouseMatSetBrightness", Napi::Function::New(env, Guarded<MouseMatSetBrightness>));
    exports.Set("mouseMatGetBrightness", Napi::Function::New(env, Guarded<MouseMatGetBrightness>));

    // Older mouse functions
    exports.Set("mouseSetLogoLEDEffect", Napi::Function::New(env, Guarded<MouseSetLogoLEDEffect>));
    exports.Set("mouseSetLogoLEDRGB", Napi::Function::New(env, Guarded<MouseSetLogoLEDRGB>));

    // Egpu
    exports.Set("egpuSetModeNone", Napi::Function::New(env, Guarded<EgpuSetModeNone>));
    exports.Set("egpuSetModeBreathe", Napi::Function::New(env, Guarded<EgpuSetModeBreathe>));
    exports.Set("egpuSetModeStatic", Napi::Function::New(env, Guarded<EgpuSetModeStatic>));
    exports.Set("egpuSetModeStaticNoStore", Napi::Function::New(env, Guarded<EgpuSetModeStaticNoStore>));
    exports.Set("egpuSetModeWave", Napi::Function::New(env, Guarded<EgpuSetModeWave>));
    exports.Set("egpuSetModeSpectrum", Napi::Function::New(env, Guarded<EgpuSetModeSpectrum>));

    // Headphones
    exports.Set("headphoneSetModeNone", Napi::Function::New(env, Guarded<HeadphoneSetModeNone>));
    exports.Set("headphoneSetModeBreathe", Napi::Function::New(env, Guarded<HeadphoneSetModeBreathe>));
    exports.Set("headphoneSetModeStatic", Napi::Function::New(env, Guarded<HeadphoneSetModeStatic>));
    exports.Set("headphoneSetModeStaticNoStore", Napi::Function::New(env, Guarded<HeadphoneSetModeStaticNoStore>));
    exports.Set("headphoneSetModeSpectrum", Napi::Function::New(env, Guarded<HeadphoneSetModeSpectrum>));

    // Accessory
    exports.Set("accessorySetModeNone", Napi::Function::New(env, Guarded<AccessorySetModeNone>));
    exports.Set("accessorySetModeSpectrum", Napi::Function::New(env, Guarded<AccessorySetModeSpectrum>));
    exports.Set("accessorySetModeStatic", Napi::Function::New(env, Guarded<AccessorySetModeStatic>));
    exports.Set("accessorySetModeStaticNoStore", Napi::Function::New(env, Guarded<AccessorySetModeStaticNoStore>));
    exports.Set("accessorySetModeWave", Napi::Function::New(env, Guarded<AccessorySetModeWave>));
    exports.Set("accessorySetModeBreathe", Napi::Function::New(env, Guarded<AccessorySetModeBreathe>));
    exports.Set("accessoryGetBrightness", Napi::Function::New(env, Guarded<AccessoryGetBrightness>));
    exports.Set("accessorySetBrightness", Napi::Function::New(env, Guarded<AccessorySetBrightness>));

    // All devices
    exports.Set("getAllDevices", Napi::Function::New(env, GetAllDevices));
    exports.Set("closeAllDevices", Napi::Function::New(env, CloseAllDevices));

    exports.Set("setSkipResponses", Napi::Function::New(env, SetSkipResponses));
    InitMacSignals(env, exports);
    InitCalendar(env, exports);
    InitCallAudio(env, exports);
    InitMusicAudio(env, exports);

    return exports;
}

NODE_API_MODULE(addon, Init
)
