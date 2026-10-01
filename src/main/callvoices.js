import { systemPreferences } from 'electron';

// Loudness shown as an empty bar at the first and a full one at the second, in dBFS.
const QUIET_DB = -50;
const LOUD_DB = -10;
// Below this share of the bar, a side counts as silent.
const TALKING = 0.12;
// The bar jumps up at once and falls back over roughly this long, like a VU meter.
const FALL_MS = 180;
// Your mic hears them through the speakers, so you only show once they have
// been quiet this long; on a headset they are never in your mic anyway.
const ECHO_MS = 250;
// How long the bar takes to change colour when the talker changes.
const SWITCH_MS = 120;
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
    this.theirsHeardAt = -Infinity;
    this.share = 0; // how much of the bar is their colour, 0 (you) to 1 (them)
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
  }

  follow(now) {
    const sides = this.addon.followCallAudio();
    if (this.followedAt === 0) {
      console.log(`Lights: measuring the call (you: ${sides.mine}, them: ${sides.theirs})`);
    }
    this.followedAt = now;
  }

  // The bar right now: { level 0..1, share 0..1 of it in their colour }, or null when nobody talks.
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

    if (this.theirs >= TALKING) {
      this.theirsHeardAt = now;
    }
    const mine = now - this.theirsHeardAt >= ECHO_MS ? this.mine : 0;
    const level = Math.max(mine, this.theirs);
    if (level < TALKING / 2) {
      return null;
    }
    const target = this.theirs >= mine ? 1 : 0;
    this.share += (target - this.share) * (1 - Math.exp(-elapsed / SWITCH_MS));
    return { level, share: this.share };
  }
}
