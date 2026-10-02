#include <napi.h>
#include <algorithm>
#include <cmath>
#import <AppKit/AppKit.h>

#include "colorpanel.h"

// Who hears the panel: one picker at a time, and opening another finishes the first.
static Napi::ThreadSafeFunction listener;
static bool listening = false;

static void report(NSColor *color, bool done) {
    if (!listening) {
        return;
    }
    NSColor *srgb = [color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    int rgb[3] = {
        (int) std::lround(std::clamp(srgb.redComponent, 0.0, 1.0) * 255),
        (int) std::lround(std::clamp(srgb.greenComponent, 0.0, 1.0) * 255),
        (int) std::lround(std::clamp(srgb.blueComponent, 0.0, 1.0) * 255),
    };
    int r = rgb[0], g = rgb[1], b = rgb[2];
    listener.NonBlockingCall([r, g, b, done](Napi::Env env, Napi::Function callback) {
        Napi::Array color = Napi::Array::New(env, 3);
        color[(uint32_t) 0] = r;
        color[(uint32_t) 1] = g;
        color[(uint32_t) 2] = b;
        callback.Call({ color, Napi::Boolean::New(env, done) });
    });
    if (done) {
        listener.Release();
        listening = false;
    }
}

@interface RazerColorTarget : NSObject
@end

@implementation RazerColorTarget
- (instancetype)init {
    if ((self = [super init])) {
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(closing:)
                                                   name:NSWindowWillCloseNotification object:NSColorPanel.sharedColorPanel];
    }
    return self;
}

- (void)changed:(NSColorPanel *)panel {
    report(panel.color, false);
}

- (void)closing:(NSNotification *)notification {
    report(NSColorPanel.sharedColorPanel.color, true);
}
@end

/**
 * Opens the macOS colour panel on `rgb` with `title`. Calls back with
 * ([r, g, b], false) as the colour changes, and ([r, g, b], true) once when the
 * panel closes or another picker takes it over.
 */
void ShowColorPanel(const Napi::CallbackInfo &info) {
    static RazerColorTarget *target = [[RazerColorTarget alloc] init];
    Napi::Env env = info.Env();
    Napi::Array rgb = info[0].As<Napi::Array>();
    std::string title = info[1].As<Napi::String>().Utf8Value();

    NSColorPanel *panel = NSColorPanel.sharedColorPanel;
    report(panel.color, true);
    listener = Napi::ThreadSafeFunction::New(env, info[2].As<Napi::Function>(), "colorpanel", 0, 1);
    listener.Unref(env);

    // Set the colour before listening, so it does not report itself back.
    [panel setTarget:nil];
    panel.showsAlpha = NO;
    // Panels hide whenever their app is not frontmost, which a menu bar app
    // rarely is; this one stays up while you watch the lights.
    panel.hidesOnDeactivate = NO;
    panel.continuous = YES;
    panel.title = [NSString stringWithUTF8String:title.c_str()];
    panel.color = [NSColor colorWithSRGBRed:rgb.Get((uint32_t) 0).As<Napi::Number>().DoubleValue() / 255
                                      green:rgb.Get((uint32_t) 1).As<Napi::Number>().DoubleValue() / 255
                                       blue:rgb.Get((uint32_t) 2).As<Napi::Number>().DoubleValue() / 255
                                      alpha:1];
    [panel setTarget:target];
    [panel setAction:@selector(changed:)];
    listening = true;

    // A menu bar app is never the active app; bring the panel to the front.
    if (@available(macOS 14.0, *)) {
        [NSApp activate];
    } else {
        [NSApp activateIgnoringOtherApps:YES];
    }
    [panel makeKeyAndOrderFront:nil];
}

void InitColorPanel(Napi::Env env, Napi::Object exports) {
    exports.Set("showColorPanel", Napi::Function::New(env, ShowColorPanel));
}
