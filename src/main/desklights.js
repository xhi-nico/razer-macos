import { FeatureIdentifier } from './feature/featureidentifier';
import { RazerDeviceType } from './device/razerdevicetype';
import { Daylight } from './daylight';

const SETTINGS_KEY = 'desklights';

/**
 * What the desk shows, most important first: the first look whose condition
 * holds wins, so overlapping Mac states can never fight. `store` also writes the
 * colour into the devices' own memory, which is what they keep showing while
 * the app is not running: red at the login screen after logout or shutdown.
 */
const LOOKS = [
  { name: 'away', color: [255, 0, 0], store: true, when: state => state.away },
  { name: 'idle', color: [255, 255, 255], breathe: true, daylight: true, when: state => state.idle },
  { name: 'working', color: [255, 255, 255], store: true, daylight: true, when: () => true },
];

// After sunset the daylight looks shift to this warm white, and back after sunrise.
const WARM_WHITE = [255, 170, 90];
// While that shift is under way, repaint this often.
const DAYLIGHT_STEP_MS = 60 * 1000;

// Idle: a slow white breath, like a sleeping MacBook's light.
const BREATH_PERIOD_MS = 7000;
const BREATH_HIGH = 0.35;
const BREATH_LOW = 0.08;

// Where each device sits across the desk, left (0) to right (1), so sweeps and
// waves travel the way the desk is laid out: keyboard on the left, mouse on the
// right, the mat under both.
const KEYBOARD_LEFT = 0.02;
const KEYBOARD_WIDTH = 0.6;
const POSITIONS = { [RazerDeviceType.MOUSEMAT]: 0.5, [RazerDeviceType.MOUSE]: 0.9 };
const OTHER_POSITION = 0.75;

// The welcome (away to working) sweeps white in from the left; this is the width of its soft edge.
const SWEEP_EDGE = 0.35;

// Claude wants you: an orange band rolls across the desk and back, three times.
const ATTENTION_COLOR = [255, 90, 20];
const ATTENTION_WAVE_MS = 2600;
const ATTENTION_WAVES = 3;
const ATTENTION_WIDTH = 0.3;

// Next meeting: the keyboard's top row fills amber over the last minute, then
// pulses faster and faster until a mic turns on (you joined) or it gives up.
const MEETING_COLOR = [255, 140, 0];
const MEETING_LEAD_MS = 60 * 1000;
const MEETING_GIVE_UP_MS = 3 * 60 * 1000;
const MEETING_PULSE_HZ = [0.5, 2];

// On a call: the keyboard's top row pulses slowly, green while a camera is on
// (like the Mac's camera dot), otherwise blue while a mic is on.
const CAMERA_COLOR = [0, 255, 40];
const MIC_COLOR = [0, 80, 255];
const ON_AIR_PERIOD_MS = 4000;

// Pause between frames: short for moving effects, longer for slow ones so an
// idle desk or an hour-long call costs little.
const FRAME_GAP_MS = 30;
const SLOW_FRAME_GAP_MS = 120;

function transitionFor(from, to) {
  if (to === 'working' && from === 'away') {
    return { duration: 1400, sweep: true }; // the welcome: login, unlock, wake
  }
  if (to === 'working' && from === 'idle') {
    return { duration: 250 }; // you touched something, so wake up now
  }
  if (to === 'idle') {
    return { duration: 3000 }; // drift down slowly enough to go unnoticed
  }
  return { duration: 900 };
}

const lookNamed = name => LOOKS.find(look => look.name === name);
const mix = (from, to, amount) => from.map((channel, i) => channel + (to[i] - channel) * amount);
const clamp01 = value => Math.min(1, Math.max(0, value));
const easeInOut = t => 0.5 - Math.cos(Math.PI * t) / 2;
const toRgb = color => color.map(Math.round);

function keyboardGrid(device) {
  const ripple = device.mainType === RazerDeviceType.KEYBOARD && device.getFeature(FeatureIdentifier.RIPPLE);
  return ripple && ripple.configuration.rows > 0 ? ripple.configuration : null;
}

/**
 * Drives every Razer device as one desk. Each frame is painted from layers:
 * the current look (with any fade or sweep into it), then the keyboard's top
 * row (meeting countdown, or camera / mic), then the attention wave. A change that
 * lands mid-animation starts from whatever is showing at that moment, so
 * overlapping Mac events redirect an animation instead of jumping.
 */
export class DeskLights {
  constructor(settingsManager, addon, getDevices, daylight = new Daylight()) {
    this.settingsManager = settingsManager;
    this.addon = addon;
    this.getDevices = getDevices;
    this.daylight = daylight;
    this.transition = null; // { from: x => colour, startedAt, duration, sweep }
    this.attentionStartedAt = null;
    this.meetings = []; // start times (ms) of nearby meetings
    this.joinedMeetings = new Set(); // starts whose countdown a mic or camera ended
    this.onAir = null; // 'camera', 'mic' or null
    this.written = new Map(); // device -> what it last showed, to skip repeats
    this.holds = 0; // refreshes in flight
    this.timer = null;

    let saved = {};
    try {
      saved = settingsManager.getKeySync(SETTINGS_KEY);
    } catch (error) {
      console.warn('Lights settings unreadable, using defaults', error);
    }
    this.auto = saved.auto !== false;
    // The devices still show whatever was last stored in them, so the first
    // animation starts from there: red after a logout means a red-to-white welcome.
    this.storedLook = lookNamed(saved.stored) ? saved.stored : 'away';
    this.look = lookNamed(this.storedLook);
    this.lookSince = Date.now();
  }

  update(macState) {
    const now = Date.now();
    this.meetings = macState.meetings;
    this.joinedMeetings.forEach(start => {
      if (start < now - MEETING_GIVE_UP_MS) {
        this.joinedMeetings.delete(start);
      }
    });
    this.onAir = macState.camera ? 'camera' : macState.mic ? 'mic' : null;
    if (this.onAir) {
      this.meetings.filter(start => this.inMeetingWindow(start, now)).forEach(start => this.joinedMeetings.add(start));
    }

    const next = LOOKS.find(look => look.when(macState));
    if (next !== this.look) {
      console.log(`Lights: ${this.look.name} -> ${next.name}`);
      this.transition = { from: this.baseAt(now), startedAt: now, ...transitionFor(this.look.name, next.name) };
      this.look = next;
      this.lookSince = now;
      if (next.name === 'away') {
        this.attentionStartedAt = null;
      }
    }
    this.render();
  }

  pulse() {
    if (!this.auto || this.look.name === 'away' || this.attentionStartedAt != null) {
      return;
    }
    this.attentionStartedAt = Date.now();
    this.render();
  }

  // No time to animate: the Mac is about to sleep, log out or shut down, or the app is quitting.
  sleepNow() {
    if (!this.auto || this.holds > 0) {
      return;
    }
    this.stopAnimating();
    this.look = lookNamed('away');
    this.paint(Date.now(), true);
  }

  setAuto(on) {
    if (on === this.auto) {
      return;
    }
    this.auto = on;
    this.stopAnimating();
    this.save();
    if (on) {
      // After manual control the devices' colours are unknown, so go straight to the look.
      this.written.clear();
      this.render();
    }
  }

  // The device list is being rebuilt; writing now would hit closed handles.
  hold() {
    this.holds++;
    this.stopTimer();
  }

  // After a rebuild the handles are new: repaint every device, including any just plugged in.
  release(rebuilt) {
    this.holds = Math.max(0, this.holds - 1);
    if (rebuilt) {
      this.written.clear();
    }
    this.render();
  }

  render() {
    this.stopTimer();
    if (!this.auto || this.holds > 0) {
      return;
    }
    const now = Date.now();
    const moving = this.transition != null || this.attentionStartedAt != null;
    const slow = this.look.breathe || this.topRowAt(now) != null;
    this.paint(now, !moving && !slow && this.look.store);

    if (moving || slow) {
      this.timer = setTimeout(() => this.render(), moving ? FRAME_GAP_MS : SLOW_FRAME_GAP_MS);
      return;
    }
    // Nothing moving: sleep until the next meeting's countdown or the next daylight step.
    const daylightChange = this.look.daylight ? this.daylight.nextChange(now) : Infinity;
    const wake = Math.min(
      daylightChange <= now ? now + DAYLIGHT_STEP_MS : daylightChange,
      ...this.meetings
        .filter(start => !this.joinedMeetings.has(start))
        .map(start => start - MEETING_LEAD_MS)
        .filter(countdown => countdown > now),
    );
    if (Number.isFinite(wake)) {
      this.timer = setTimeout(() => this.render(), wake - now);
    }
  }

  paint(now, store) {
    const base = this.baseAt(now);
    const wave = this.attentionAt(now);
    const topRow = this.topRowAt(now);
    const colorAt = x => (wave ? mix(base(x), ATTENTION_COLOR, wave(x)) : base(x));

    // Frames along the way need not land; only the settled, stored colour must.
    this.addon.setSkipResponses(!store);
    try {
      (this.getDevices() || [])
        .filter(device => device.hasFeature(FeatureIdentifier.STATIC))
        .forEach(device => {
          const grid = keyboardGrid(device);
          if (grid == null) {
            this.writeColor(device, toRgb(colorAt(POSITIONS[device.mainType] ?? OTHER_POSITION)), store);
            return;
          }
          const columns = Array.from({ length: grid.cols }, (_, col) => {
            const color = colorAt(KEYBOARD_LEFT + KEYBOARD_WIDTH * col / (grid.cols - 1));
            return [toRgb(color), toRgb(topRow ? mix(color, topRow.color, topRow.level(col, grid.cols)) : color)];
          });
          const rows = Array.from({ length: grid.rows }, (_, row) => columns.map(([plain, topRow]) => (row === 0 ? topRow : plain)));
          const first = rows[0][0].join();
          if (rows.every(row => row.every(rgb => rgb.join() === first))) {
            this.writeColor(device, rows[0][0], store);
          } else {
            this.writeGrid(device, rows);
          }
        });
    } finally {
      this.addon.setSkipResponses(false);
    }

    if (store && this.storedLook !== this.look.name) {
      this.storedLook = this.look.name;
      this.save();
    }
  }

  writeColor(device, rgb, store) {
    // A stored colour is also showing, so it needs no second, unstored write.
    if (!store && this.written.get(device.internalId) === `stored ${rgb}`) {
      return;
    }
    this.writeIfChanged(device, `${store ? 'stored' : 'shown'} ${rgb}`, () => {
      if (store) {
        device.setModeStatic(rgb);
      } else {
        device.setModeStaticNoStore(rgb);
      }
    });
  }

  // Rewrites only the rows that changed since the last grid, so a top-row
  // effect costs one row per frame rather than the whole keyboard.
  writeGrid(device, rows) {
    const previous = this.written.get(device.internalId);
    const shown = Array.isArray(previous) ? previous : [];
    const keys = rows.map(String);
    if (keys.every((key, index) => key === shown[index])) {
      return;
    }
    try {
      rows.forEach((row, index) => {
        if (keys[index] !== shown[index]) {
          device.setCustomFrame([index, 0, row.length - 1, ...row.flat()]);
        }
      });
      device.setModeCustom();
      this.written.set(device.internalId, keys);
    } catch (error) {
      console.warn(`Lights: ${device.name} did not take the frame`, error);
    }
  }

  writeIfChanged(device, content, write) {
    if (this.written.get(device.internalId) === content) {
      return;
    }
    try {
      write();
      this.written.set(device.internalId, content);
    } catch (error) {
      console.warn(`Lights: ${device.name} did not take the frame`, error);
    }
  }

  lookColor(now) {
    const color = this.look.daylight ? mix(this.look.color, WARM_WHITE, this.daylight.warmth(now)) : this.look.color;
    if (!this.look.breathe) {
      return color;
    }
    const swing = 0.5 + 0.5 * Math.cos(2 * Math.PI * (now - this.lookSince) / BREATH_PERIOD_MS);
    return mix([0, 0, 0], color, BREATH_LOW + (BREATH_HIGH - BREATH_LOW) * swing);
  }

  // The look across the desk, as a colour for each position.
  baseAt(now) {
    const target = this.lookColor(now);
    const transition = this.transition;
    if (transition == null) {
      return () => target;
    }
    const progress = (now - transition.startedAt) / transition.duration;
    if (progress >= 1) {
      this.transition = null;
      return () => target;
    }
    const { from } = transition;
    if (transition.sweep) {
      return x => mix(from(x), target, easeInOut(clamp01((progress * (1 + SWEEP_EDGE) - x) / SWEEP_EDGE)));
    }
    const amount = easeInOut(progress);
    return x => mix(from(x), target, amount);
  }

  // How strongly the attention wave covers each position, or null when there is none.
  attentionAt(now) {
    if (this.attentionStartedAt == null) {
      return null;
    }
    const elapsed = (now - this.attentionStartedAt) / ATTENTION_WAVE_MS;
    if (elapsed >= ATTENTION_WAVES) {
      this.attentionStartedAt = null;
      return null;
    }
    const t = elapsed % 1;
    const there = easeInOut(t < 0.5 ? t * 2 : 2 - t * 2);
    const center = -ATTENTION_WIDTH + (1 + 2 * ATTENTION_WIDTH) * there;
    return x => easeInOut(clamp01(1 - Math.abs(x - center) / ATTENTION_WIDTH));
  }

  // What the keyboard's top row shows over the look: { color, level(col, cols) }, or null.
  topRowAt(now) {
    if (this.look.name === 'away') {
      return null;
    }
    const meeting = this.meetingAt(now);
    if (meeting) {
      return { color: MEETING_COLOR, level: meeting };
    }
    if (this.onAir) {
      const level = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / ON_AIR_PERIOD_MS));
      return { color: this.onAir === 'camera' ? CAMERA_COLOR : MIC_COLOR, level: () => level };
    }
    return null;
  }

  // How strongly each top-row key shows the countdown, or null when there is none.
  meetingAt(now) {
    const start = this.meetings.find(meeting => this.inMeetingWindow(meeting, now) && !this.joinedMeetings.has(meeting));
    if (start == null) {
      return null;
    }
    if (now < start) {
      const filled = (now - (start - MEETING_LEAD_MS)) / MEETING_LEAD_MS;
      return (col, cols) => clamp01(filled * cols - col);
    }
    // Late: pulse, speeding up from the first to the second rate until it gives up.
    const t = Math.min(now - start, MEETING_GIVE_UP_MS) / 1000;
    const [slowHz, fastHz] = MEETING_PULSE_HZ;
    const phase = 2 * Math.PI * (slowHz * t + (fastHz - slowHz) * t * t / (2 * MEETING_GIVE_UP_MS / 1000));
    const level = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(phase));
    return () => level;
  }

  inMeetingWindow(start, now) {
    return now >= start - MEETING_LEAD_MS && now <= start + MEETING_GIVE_UP_MS;
  }

  // Synchronous, so the stored look is on disk even when this runs during quit.
  save() {
    try {
      this.settingsManager.setKeySync(SETTINGS_KEY, { auto: this.auto, stored: this.storedLook });
    } catch (error) {
      console.warn('Lights settings not saved', error);
    }
  }

  stopAnimating() {
    this.stopTimer();
    this.transition = null;
    this.attentionStartedAt = null;
  }

  stopTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
