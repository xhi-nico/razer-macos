import { FeatureIdentifier } from './feature/featureidentifier';
import { RazerDeviceType } from './device/razerdevicetype';
import { Daylight } from './daylight';
import { CallVoices } from './callvoices';
import { LightLayers, CALL_PRIORITY, clamp01, easeInOut, mix } from './lightlayers';

const SETTINGS_KEY = 'desklights';

/**
 * What the desk shows, most important first: the first look whose condition
 * holds wins, so overlapping Mac states can never fight. `store` also writes the
 * colour into the devices' own memory, which they show the moment they get
 * power, before the app can reach them. Only red is stored, so a desk that
 * powers up without the Mac (docking a locked or sleeping Mac, the login screen,
 * the app not running) is red until the app says otherwise.
 */
const LOOKS = [
  { name: 'away', color: [255, 0, 0], store: true, when: state => state.away },
  { name: 'idle', color: [255, 255, 255], breathe: true, daylight: true, when: state => state.idle },
  { name: 'working', color: [255, 255, 255], daylight: true, when: () => true },
];

// The panic button holds the plain look (no animation, no layers, no top row) this long at most.
const PLAIN_MS = 60 * 60 * 1000;

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

// Claude needs you: an orange band rolls across the keyboard and back, three times, over the
// call lights, and the mouse flashes orange each time the band turns at the keyboard's right end.
export const ATTENTION = {
  id: 'attention',
  region: 'keyboard',
  effect: 'wave',
  color: [255, 90, 20],
  period: 2.6,
  duration: 7.8,
  priority: CALL_PRIORITY + 10,
};
const ATTENTION_FLASH = { ...ATTENTION, id: 'attention:mouse', region: 'mouse', effect: 'flash' };

// Next meeting: the keyboard's top row fills amber over the last minute (the
// mouse warms with it), then both pulse faster and faster until a mic turns on
// (you joined) or it gives up.
const MEETING_COLOR = [255, 140, 0];
const MEETING_LEAD_MS = 60 * 1000;
const MEETING_GIVE_UP_MS = 3 * 60 * 1000;
const MEETING_PULSE_HZ = [0.5, 2];

// On a call (a camera or mic on): the keyboard's top row and the mouse pulse slowly in deep purple.
const ON_AIR_COLOR = [90, 8, 66];
const ON_AIR_PERIOD_MS = 4000;

// Someone talking on a call, you or them: a magenta meter fills the top row from
// the left with their loudness, over the pulse. The loudest moment holds its key
// for a beat. Keyboard only: the mouse shows one colour, so it keeps the pulse.
const VOICE_COLOR = [239, 0, 142];

// When the top row changes what it shows (a call starts or ends, the countdown
// gives way), it crossfades over this long.
const TOP_ROW_FADE_MS = 500;

// After devices connect, paint them again at these delays: a device still
// starting up can miss the first write.
const DEVICE_RECHECK_MS = [2000, 6000];

// A device that fails a write (stalled, asleep, unplugged) is left out of
// frames and retried on its own after this, doubling with each failure up to
// the cap. Skipping it matters: a stalled device takes a full USB timeout per write.
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 30 * 1000;

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
const toRgb = color => color.map(Math.round);

// How much of each top-row key the voice meter lights: the bar filled from the
// left, plus the key its recent peak holds.
const voiceMeter = ({ level, peak }, col, cols) =>
  Math.max(clamp01(level * cols - col), col === Math.min(cols - 1, Math.floor(peak * cols)) ? 1 : 0);

// A top-row layer: { at(colour, col, cols), whole(colour) }, each returning the
// colour over the look; `whole` is the row as one colour, for the mouse.
// Shows `from` giving way to `to`, either of which may be null (just the look).
function crossfade(from, to, amount) {
  const at = (layer, color, col, cols) => (layer ? layer.at(color, col, cols) : color);
  const whole = (layer, color) => (layer ? layer.whole(color) : color);
  return {
    at: (color, col, cols) => mix(at(from, color, col, cols), at(to, color, col, cols), amount),
    whole: color => mix(whole(from, color), whole(to, color), amount),
  };
}

// A spot on the desk, for the look and the layers: `desk` is where it sits
// across the desk; each other region it belongs to says where it sits in that
// region (0 to 1), or null when the device shows one colour (see LightLayers).
function keyPixel(row, col, cols) {
  const across = (col + 0.5) / cols;
  return { desk: KEYBOARD_LEFT + KEYBOARD_WIDTH * col / (cols - 1), keyboard: across, ...(row === 0 && { toprow: across }) };
}

function devicePixel(device) {
  switch (device.mainType) {
    case RazerDeviceType.KEYBOARD:
      return { desk: KEYBOARD_LEFT + KEYBOARD_WIDTH / 2, keyboard: null, toprow: null };
    case RazerDeviceType.MOUSE:
      return { desk: POSITIONS[device.mainType], mouse: null };
    case RazerDeviceType.MOUSEMAT:
      return { desk: POSITIONS[device.mainType], mat: null };
    default:
      return { desk: OTHER_POSITION };
  }
}

function keyboardGrid(device) {
  const ripple = device.mainType === RazerDeviceType.KEYBOARD && device.getFeature(FeatureIdentifier.RIPPLE);
  return ripple && ripple.configuration.rows > 0 ? ripple.configuration : null;
}

/**
 * Drives every Razer device as one desk. Each frame is painted from layers:
 * the current look (with any fade or sweep into it), then the shown layers
 * below CALL_PRIORITY, then the keyboard's top row and the mouse (meeting
 * countdown, or camera / mic with the call's voices), then the shown layers
 * from CALL_PRIORITY up (the attention wave). Shown layers stay hidden while
 * the Mac is away. A change that lands mid-animation starts from whatever is
 * showing at that moment, so overlapping Mac events redirect an animation
 * instead of jumping.
 */
export class DeskLights {
  constructor(settingsManager, addon, getDevices, daylight = new Daylight()) {
    this.settingsManager = settingsManager;
    this.addon = addon;
    this.getDevices = getDevices;
    this.daylight = daylight;
    this.voices = new CallVoices(addon);
    this.transition = null; // { from: x => colour, startedAt, duration, sweep }
    this.layers = new LightLayers();
    this.meetings = []; // start times (ms) of nearby meetings
    this.joinedMeetings = new Set(); // starts whose countdown a mic or camera ended
    this.onAir = false; // a camera or mic is on
    this.recording = false; // another app is recording from a mic, and the Mac is not away
    this.topRowKind = null; // what the top row shows: 'meeting', 'onAir' or null
    this.topRowShown = null; // the top-row layer last painted
    this.topRowFade = null; // { from: layer, startedAt }
    this.written = new Map(); // device -> what it last showed, to skip repeats
    this.failing = new Map(); // device -> { retryAt, delay } while its writes fail
    this.onHealthChange = () => {}; // a device stopped or started answering
    this.plainUntil = 0; // while set, the panic button holds the plain look until then
    this.onPlainChange = () => {}; // the plain hold started or ended
    this.macState = null;
    this.holds = 0; // refreshes in flight
    this.timer = null;
    this.frameDue = Infinity; // when the next frame is set to paint
    this.rechecks = [];

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
    this.onAir = macState.camera || macState.mic;
    this.recording = macState.mic && !macState.away;
    this.followVoices();
    if (this.onAir) {
      this.meetings.filter(start => this.inMeetingWindow(start, now)).forEach(start => this.joinedMeetings.add(start));
    }

    this.macState = macState;
    this.followLook(now);
    this.render();
  }

  // Moves to the look the Mac's state calls for; the plain hold skips the idle breath.
  followLook(now) {
    if (this.macState == null) {
      return;
    }
    const next = LOOKS.find(look => look.when(this.macState) && !(this.plain && look.breathe));
    if (next !== this.look) {
      console.log(`Lights: ${this.look.name} -> ${next.name}`);
      this.transition = { from: this.baseAt(now), startedAt: now, ...transitionFor(this.look.name, next.name) };
      this.look = next;
      this.lookSince = now;
    }
  }

  get plain() {
    return this.plainUntil > 0;
  }

  /**
   * The panic button: hold the plain look (white, warm white at night, red when
   * away) with nothing moving and nothing over it, for an hour at most. It holds
   * even with Auto lights off, since it is there to calm the desk down.
   */
  setPlain(on) {
    if (on === this.plain) {
      return;
    }
    const now = Date.now();
    this.plainUntil = on ? now + PLAIN_MS : 0;
    console.log(on ? 'Lights: holding the plain look' : 'Lights: plain hold over');
    this.followVoices();
    this.followLook(now);
    this.written.clear();
    this.onPlainChange();
    this.render();
  }

  // Whether this app paints the devices: Auto lights, or the plain hold.
  driving() {
    return this.auto || this.plain;
  }

  // Shows a layer (see LightLayers.show); throws LayerError on a bad request.
  show(spec, source) {
    const layer = this.layers.show(spec, Date.now(), source);
    this.renderSoon();
    return layer;
  }

  // Fades a layer out; false when there is no such layer.
  cancel(id) {
    const found = this.layers.cancel(id, Date.now());
    if (found) {
      this.renderSoon();
    }
    return found;
  }

  has(id) {
    return this.layers.has(id, Date.now());
  }

  // The attention wave, unless one is already rolling. Both layers start together, so they stay in step.
  attention() {
    const now = Date.now();
    if (!this.layers.has(ATTENTION.id, now)) {
      [ATTENTION, ATTENTION_FLASH].forEach(spec => this.layers.show(spec, now));
      this.renderSoon();
    }
  }

  // Stops the attention wave early (fades it out).
  calmDown() {
    [ATTENTION, ATTENTION_FLASH].forEach(({ id }) => this.cancel(id));
  }

  // Paints now, unless a frame is due anyway: a burst of hook posts then costs one frame, not one each.
  renderSoon() {
    if (!(this.frameDue - Date.now() <= FRAME_GAP_MS)) {
      this.render();
    }
  }

  status() {
    const now = Date.now();
    return {
      auto: this.auto,
      plainSecondsLeft: this.plain ? Math.round((this.plainUntil - now) / 1000) : 0,
      look: this.look.name,
      topRow: this.topRowKind,
      layersShown: this.layersShown(),
      layers: this.layers.status(now),
      devices: (this.getDevices() || []).map(device => ({
        name: device.name,
        answering: !this.isFailing(device),
        ...(device.batteryLevel != null && { battery: device.batteryLevel, charging: device.chargingStatus }),
      })),
    };
  }

  // Layers show over the look, except over the stored red and during the plain hold.
  layersShown() {
    return this.auto && !this.plain && this.look.name !== 'away';
  }

  // No time to animate: the Mac is about to sleep, log out or shut down, or the app is quitting.
  sleepNow() {
    if (!this.driving() || this.holds > 0) {
      return;
    }
    this.stopAnimating();
    this.voices.stop();
    this.look = lookNamed('away');
    this.paint(Date.now(), true);
  }

  setAuto(on) {
    if (on === this.auto) {
      return;
    }
    this.auto = on;
    this.stopAnimating();
    // Only Auto lights writes often enough to notice a device not answering.
    this.clearFailing();
    this.followVoices();
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
      this.clearFailing();
      this.rechecks.forEach(clearTimeout);
      this.rechecks = DEVICE_RECHECK_MS.map(delay =>
        setTimeout(() => {
          this.written.clear();
          this.render();
        }, delay),
      );
    }
    this.render();
  }

  render() {
    this.stopTimer();
    const now = Date.now();
    if (this.plain && now >= this.plainUntil) {
      this.setPlain(false);
      return;
    }
    if (!this.driving() || this.holds > 0) {
      return;
    }
    this.noticeTopRow(now);
    const layers = this.layersShown();
    const pace = layers ? this.layers.pace(now) : null;
    const moving = this.transition != null || this.topRowFade != null || this.voices.listening || pace === 'fast';
    const slow = this.look.breathe || this.topRowKind != null || pace === 'slow';
    this.paint(now, !moving && !slow);

    if (moving || slow) {
      const gap = moving ? FRAME_GAP_MS : SLOW_FRAME_GAP_MS;
      this.frameDue = now + gap;
      this.timer = setTimeout(() => this.render(), gap);
      return;
    }
    // Nothing moving: sleep until the next meeting's countdown, the next daylight
    // step, a layer starting to fade out or the next retry of a failing device.
    const daylightChange = this.look.daylight ? this.daylight.nextChange(now) : Infinity;
    const wake = Math.min(
      daylightChange <= now ? now + DAYLIGHT_STEP_MS : daylightChange,
      layers ? this.layers.nextChange(now) : Infinity,
      this.plain ? this.plainUntil : Infinity,
      ...[...this.failing.values()].map(({ retryAt }) => Math.max(retryAt, now + FRAME_GAP_MS)),
      ...this.meetings
        .filter(start => !this.joinedMeetings.has(start))
        .map(start => start - MEETING_LEAD_MS)
        .filter(countdown => countdown > now),
    );
    if (Number.isFinite(wake)) {
      this.timer = setTimeout(() => this.render(), wake - now);
    }
  }

  // A settled frame must land, so it waits for each device's reply; the look's
  // settled frame is also stored when the look says so.
  paint(now, settled) {
    const store = settled && this.look.store;
    const base = this.baseAt(now);
    const topRow = this.topRowAt(now, this.voices.read(now));
    const shown = this.layersShown();
    const under = shown ? this.layers.painters(now, layer => layer.priority < CALL_PRIORITY) : [];
    const over = shown ? this.layers.painters(now, layer => layer.priority >= CALL_PRIORITY) : [];
    // `topRowAt` paints the built-in top row over a colour, when this spot shows it.
    const colorAt = (pixel, topRowAt) => {
      const below = under.reduce((color, paint) => paint(color, pixel), base(pixel.desk));
      return toRgb(over.reduce((color, paint) => paint(color, pixel), topRowAt ? topRowAt(below) : below));
    };

    this.addon.setSkipResponses(!settled);
    try {
      (this.getDevices() || [])
        .filter(device => device.hasFeature(FeatureIdentifier.STATIC))
        .filter(device => !(this.failing.get(device.internalId)?.retryAt > now))
        .forEach(device => {
          const grid = keyboardGrid(device);
          if (grid == null) {
            const mirrorsTopRow = topRow && device.mainType === RazerDeviceType.MOUSE;
            this.writeColor(device, colorAt(devicePixel(device), mirrorsTopRow && topRow.whole), store);
            return;
          }
          // Only the top row differs from the rest, so the rest is worked out once.
          const row = top => Array.from({ length: grid.cols }, (_, col) =>
            colorAt(keyPixel(top ? 0 : 1, col, grid.cols), top && topRow && (color => topRow.at(color, col, grid.cols))));
          const rest = row(false);
          const rows = [row(true), ...Array(grid.rows - 1).fill(rest)];
          const [r, g, b] = rows[0][0];
          if (rows.slice(0, 2).every(keys => keys.every(rgb => rgb[0] === r && rgb[1] === g && rgb[2] === b))) {
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
    this.attempt(device, () => {
      rows.forEach((row, index) => {
        if (keys[index] !== shown[index]) {
          device.setCustomFrame([index, 0, row.length - 1, ...row.flat()]);
        }
      });
      device.setModeCustom();
      this.written.set(device.internalId, keys);
    });
  }

  writeIfChanged(device, content, write) {
    if (this.written.get(device.internalId) === content) {
      return;
    }
    this.attempt(device, () => {
      write();
      this.written.set(device.internalId, content);
    });
  }

  // Runs one device's write, tracking failures for the retry (see RETRY_FIRST_MS).
  // Logs when a device starts failing and when it recovers, not every frame between.
  attempt(device, write) {
    const id = device.internalId;
    try {
      write();
      if (this.failing.delete(id)) {
        console.log(`Lights: ${device.name} is answering again`);
        this.onHealthChange();
      }
    } catch (error) {
      // What it shows is unknown now, so the retry must write even a frame that
      // matches the last one it took.
      this.written.delete(id);
      const failing = this.failing.get(id);
      const delay = failing ? Math.min(failing.delay * 2, RETRY_MAX_MS) : RETRY_FIRST_MS;
      this.failing.set(id, { retryAt: Date.now() + delay, delay });
      if (!failing) {
        console.warn(`Lights: ${device.name} did not take the frame, retrying on its own:`, error?.message ?? error);
        this.onHealthChange();
      }
    }
  }

  // Whether this device is failing its writes right now (see attempt).
  isFailing(device) {
    return this.failing.has(device.internalId);
  }

  clearFailing() {
    if (this.failing.size > 0) {
      this.failing.clear();
      this.onHealthChange();
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

  // What the top row (and the mouse) should show now: 'meeting', 'onAir' or null.
  topRowKindAt(now) {
    if (this.look.name === 'away' || this.plain) {
      return null;
    }
    if (this.meetingAt(now)) {
      return 'meeting';
    }
    return this.onAir ? 'onAir' : null;
  }

  // Starts a crossfade from whatever is showing when the top row changes what it shows.
  noticeTopRow(now) {
    const kind = this.topRowKindAt(now);
    if (kind !== this.topRowKind) {
      this.topRowKind = kind;
      this.topRowFade = { from: this.topRowShown, startedAt: now };
    }
  }

  // The top-row layer to paint (see crossfade), or null for just the look.
  topRowAt(now, voice) {
    if (this.look.name === 'away') {
      // Straight to the stored red, with nothing over it.
      this.topRowFade = null;
      this.topRowShown = null;
      return null;
    }
    let layer = this.topRowKind && this.topRowLayer(this.topRowKind, now, voice);
    const fade = this.topRowFade;
    if (fade) {
      const progress = (now - fade.startedAt) / TOP_ROW_FADE_MS;
      if (progress >= 1) {
        this.topRowFade = null;
      } else {
        layer = crossfade(fade.from, layer, easeInOut(progress));
      }
    }
    this.topRowShown = layer;
    return layer;
  }

  topRowLayer(kind, now, voice) {
    if (kind === 'meeting') {
      const meeting = this.meetingAt(now);
      return {
        at: (color, col, cols) => mix(color, MEETING_COLOR, meeting.level(col, cols)),
        whole: color => mix(color, MEETING_COLOR, meeting.overall),
      };
    }
    const pulse = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / ON_AIR_PERIOD_MS));
    const onAir = color => mix(color, ON_AIR_COLOR, pulse);
    if (!voice) {
      return { at: onAir, whole: onAir };
    }
    return {
      at: (color, col, cols) => mix(onAir(color), VOICE_COLOR, voiceMeter(voice, col, cols)),
      whole: onAir,
    };
  }

  // Measures the call's voices while another app records and Auto lights is on.
  followVoices() {
    if (this.auto && !this.plain && this.recording) {
      this.voices.listen();
    } else {
      this.voices.stop();
    }
  }

  // The countdown: { level(col, cols) for each top-row key, overall for the mouse }, or null.
  meetingAt(now) {
    const start = this.meetings.find(meeting => this.inMeetingWindow(meeting, now) && !this.joinedMeetings.has(meeting));
    if (start == null) {
      return null;
    }
    if (now < start) {
      const filled = (now - (start - MEETING_LEAD_MS)) / MEETING_LEAD_MS;
      return { level: (col, cols) => clamp01(filled * cols - col), overall: filled };
    }
    // Late: pulse, speeding up from the first to the second rate until it gives up.
    const t = Math.min(now - start, MEETING_GIVE_UP_MS) / 1000;
    const [slowHz, fastHz] = MEETING_PULSE_HZ;
    const phase = 2 * Math.PI * (slowHz * t + (fastHz - slowHz) * t * t / (2 * MEETING_GIVE_UP_MS / 1000));
    const level = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(phase));
    return { level: () => level, overall: level };
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
    this.topRowFade = null;
  }

  stopTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.frameDue = Infinity;
  }
}
