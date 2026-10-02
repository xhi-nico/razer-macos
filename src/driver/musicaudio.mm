#include <napi.h>
#include <algorithm>
#include <cmath>
#include <vector>
#import <Accelerate/Accelerate.h>

#include "audiocapture.h"
#include "audioprocesses.h"
#include "musicaudio.h"

namespace {

Ring ring;
Capture music;
double sampleRate = 48000;

// 2048 samples is about 43 ms at 48 kHz: fine enough for the bass, quick enough for a beat.
constexpr vDSP_Length FFT_LOG2 = 11;
constexpr size_t FFT_SIZE = 1 << FFT_LOG2;
// The spectrum's bands span this range, spaced evenly in pitch.
constexpr double LOWEST_HZ = 40;
constexpr double HIGHEST_HZ = 12000;

} // namespace

/**
 * Listens to everything the Mac plays while any other app is playing, and stops
 * when none is. Cheap when nothing changed, so it can run every few seconds.
 * Returns { playing, listening }; listening stays false before macOS 14.2.
 */
Napi::Object FollowMusicAudio(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    bool playing = otherAppsPlaying();
    if (!playing) {
        music.stop();
    } else if (music.target.empty()) {
        // Tried once per stretch of playing, so a refused permission is not retried every follow.
        music.target = "everything";
        music.ring = &ring;
        if (@available(macOS 14.2, *)) {
            CATapDescription *description = [[CATapDescription alloc] initMonoGlobalTapButExcludeProcesses:@[]];
            if (startTap(music, description, @"Razer macOS music level")) {
                sampleRate = readAudioValue<Float64>(music.aggregate, kAudioDevicePropertyNominalSampleRate, 48000);
            }
        }
    }
    Napi::Object state = Napi::Object::New(env);
    state.Set("playing", Napi::Boolean::New(env, playing));
    state.Set("listening", Napi::Boolean::New(env, music.running()));
    return state;
}

void StopMusicAudio(const Napi::CallbackInfo &info) {
    music.stop();
}

// The loudest moment since the last read, as an RMS amplitude (0 to 1).
Napi::Number ReadMusicLevel(const Napi::CallbackInfo &info) {
    return Napi::Number::New(info.Env(), music.meter.take());
}

/**
 * The spectrum of the latest samples, in `bands` bands from bass to treble:
 * each band's loudest frequency, in dB relative to a full-scale sine.
 */
Napi::Value ReadMusicSpectrum(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    size_t bands = std::clamp<int64_t>(info[0].As<Napi::Number>().Int64Value(), 1, 64);

    static FFTSetup setup = vDSP_create_fftsetup(FFT_LOG2, kFFTRadix2);
    static std::vector<float> window = [] {
        std::vector<float> hann(FFT_SIZE);
        vDSP_hann_window(hann.data(), FFT_SIZE, vDSP_HANN_NORM);
        return hann;
    }();

    std::vector<float> samples(FFT_SIZE);
    ring.latest(samples.data(), FFT_SIZE);
    vDSP_vmul(samples.data(), 1, window.data(), 1, samples.data(), 1, FFT_SIZE);

    std::vector<float> real(FFT_SIZE / 2), imag(FFT_SIZE / 2);
    DSPSplitComplex split = { real.data(), imag.data() };
    vDSP_ctoz((const DSPComplex *) samples.data(), 2, &split, 1, FFT_SIZE / 2);
    vDSP_fft_zrip(setup, &split, 1, FFT_LOG2, FFT_FORWARD);

    // A full-scale sine through the Hann window and vDSP's doubled output peaks at FFT_SIZE / 2.
    Napi::Float32Array levels = Napi::Float32Array::New(env, bands);
    for (size_t band = 0; band < bands; band++) {
        double from = LOWEST_HZ * std::pow(HIGHEST_HZ / LOWEST_HZ, (double) band / bands);
        double to = LOWEST_HZ * std::pow(HIGHEST_HZ / LOWEST_HZ, (double) (band + 1) / bands);
        size_t first = std::max<size_t>(1, (size_t) (from * FFT_SIZE / sampleRate));
        size_t last = std::min<size_t>(FFT_SIZE / 2 - 1, std::max(first, (size_t) (to * FFT_SIZE / sampleRate)));
        float loudest = 0;
        for (size_t bin = first; bin <= last; bin++) {
            loudest = std::max(loudest, real[bin] * real[bin] + imag[bin] * imag[bin]);
        }
        levels[band] = (float) (20 * std::log10(std::max(std::sqrt(loudest) / (FFT_SIZE / 2.0), 1e-9)));
    }
    return levels;
}

void InitMusicAudio(Napi::Env env, Napi::Object exports) {
    exports.Set("followMusicAudio", Napi::Function::New(env, FollowMusicAudio));
    exports.Set("stopMusicAudio", Napi::Function::New(env, StopMusicAudio));
    exports.Set("readMusicLevel", Napi::Function::New(env, ReadMusicLevel));
    exports.Set("readMusicSpectrum", Napi::Function::New(env, ReadMusicSpectrum));
}
