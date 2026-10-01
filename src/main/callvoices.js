import { systemPreferences } from 'electron';

// Loudness shown as an empty bar at the first and a full one at the second, in dBFS.
const QUIET_DB = -50;
const LOUD_DB = -10;
// Below this share of the bar, nobody is talking.
const TALKING = 0.12;
// The bar jumps up at once and falls back over roughly this long, like a VU meter.
const FALL_MS = 180;
// The loudest moment holds its key this long, then falls a full bar per second.
const PEAK_HOLD_MS = 600;
const PEAK_DROP_MS = 1000;
// How often to check whether the call moved to another mic or app.
const FOLLOW_MS = 5000;

const toLevel = rms => {
  const db = 20 * Math.log10(Math.max(rms, 1e-9));
  return Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));
};

/**
 * How loud each side of a call is: you (the mic the call app records from) and
 * them (whatever the call app plays). Measures loudness only; no audio is kept.
 * macOS asks once for the microphone, and once for "system audio recording" the
 * first time the call app is tapped; without either, that side stays silent.
 */
export class CallVoices {
  constructor(addon) {
    this.addon = addon;
    this.listening = false;
    this.followedAt = 0;
    this.mine = 0;
    this.theirs = 0;
    this.peak = 0;
    this.peakAt = 0;
    this.readAt = 0;
  }

  listen() {
    if (this.listening) {
      return;
    }
    this.listening = true;
    if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
      // Measuring before the answer gets silence, so measure again after it.
      systemPreferences.askForMediaAccess('microphone').then(() => {
        this.followedAt = 0;
      });
    }
    this.follow(Date.now());
  }

  stop() {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    this.addon.stopCallAudio();
    this.mine = 0;
    this.theirs = 0;
    this.peak = 0;
  }

  follow(now) {
    const sides = this.addon.followCallAudio();
    if (this.followedAt === 0) {
      console.log(`Lights: measuring the call (you: ${sides.mine}, them: ${sides.theirs})`);
    }
    this.followedAt = now;
  }

  // The meter right now, whoever is louder: { level, peak }, each 0..1, or null when nobody talks.
  read(now) {
    if (!this.listening) {
      return null;
    }
    if (now - this.followedAt >= FOLLOW_MS) {
      this.follow(now);
    }
    const levels = this.addon.readCallAudio();
    const elapsed = Math.min(now - this.readAt, 1000);
    this.readAt = now;
    const fall = Math.exp(-elapsed / FALL_MS);
    this.mine = Math.max(toLevel(levels.mine), this.mine * fall);
    this.theirs = Math.max(toLevel(levels.theirs), this.theirs * fall);

    const level = Math.max(this.mine, this.theirs);
    if (level >= this.peak) {
      this.peak = level;
      this.peakAt = now;
    } else if (now - this.peakAt >= PEAK_HOLD_MS) {
      this.peak = Math.max(level, this.peak - elapsed / PEAK_DROP_MS);
    }
    if (this.peak < TALKING / 2) {
      return null;
    }
    return { level, peak: this.peak };
  }
}
