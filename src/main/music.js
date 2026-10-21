// While the Mac plays sound and no call is on, the keyboard's top row becomes a
// spectrum: it dims, and each key lights with one band, bass on the left.
const BANDS = 18;
const MUSIC = {
  id: 'music',
  region: 'toprow',
  effect: 'bars',
  color: ['#7800ff', '#0050ff', '#00dcc8'],
  dim: 0.85,
  // Under the call lights and the attention wave.
  priority: 25,
};
// A band shows empty at the first and full at the second, in dB from a full-scale sine.
const QUIET_DB = -70;
const LOUD_DB = -25;
// Bars jump up at once and fall back over roughly this long.
const FALL_MS = 160;
// How often to check whether anything plays, and how long it may be silent before the row hands back.
const FOLLOW_MS = 1500;
const SOUND_RMS = 0.002;
const SILENT_MS = 3000;
const SETTINGS_KEY = 'musicVisualiser';

const toLevel = db => Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));

/**
 * Listens to everything the Mac plays (the system audio tap in musicaudio.mm)
 * while it is on (the menu's "Music on the keyboard"), layers show (Auto lights
 * on, the Mac here, no plain hold) and no camera or mic is on: a call gets the
 * call meter instead. Only loudness and spectrum are measured.
 */
export class MusicVisualiser {
  constructor(lights, addon, settingsManager) {
    this.lights = lights;
    this.addon = addon;
    this.settingsManager = settingsManager;
    this.levels = new Array(BANDS).fill(0);
    this.readAt = 0;
    this.soundAt = -Infinity;
    this.listening = false;
    let saved = {};
    try {
      saved = settingsManager.getKeySync(SETTINGS_KEY);
    } catch (error) {
      console.warn('Music settings unreadable, using defaults', error);
    }
    this.on = saved.on !== false;
  }

  setOn(on) {
    this.on = on;
    try {
      this.settingsManager.setKeySync(SETTINGS_KEY, { on });
    } catch (error) {
      console.warn('Music settings not saved', error);
    }
    this.follow();
  }

  start() {
    this.timer = setInterval(() => this.follow(), FOLLOW_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.quiet();
  }

  follow(now = Date.now()) {
    const lights = this.lights;
    if (!this.on || !lights.layersShown() || lights.onAir) {
      this.quiet();
      return;
    }
    const { listening } = this.addon.followMusicAudio();
    if (listening && !this.listening) {
      console.log('Lights: listening to what plays');
    }
    this.listening = listening;
    if (listening && this.addon.readMusicLevel() >= SOUND_RMS) {
      this.soundAt = now;
    }
    if (now - this.soundAt < SILENT_MS) {
      // Outlasts a missed follow or two, then fades on its own.
      lights.show({ ...MUSIC, duration: FOLLOW_MS * 3 / 1000 }, at => this.read(at));
    } else {
      lights.cancel(MUSIC.id);
    }
  }

  quiet() {
    if (this.listening) {
      this.addon.stopMusicAudio();
      this.listening = false;
    }
    this.soundAt = -Infinity;
    this.lights.cancel(MUSIC.id);
  }

  // The bars for a frame, each 0..1.
  read(now) {
    if (!this.listening) {
      return this.levels.map(() => 0);
    }
    const spectrum = this.addon.readMusicSpectrum(BANDS);
    const fall = Math.exp(-Math.min(now - this.readAt, 1000) / FALL_MS);
    this.readAt = now;
    this.levels = this.levels.map((level, band) => Math.max(toLevel(spectrum[band]), level * fall));
    return this.levels;
  }
}
