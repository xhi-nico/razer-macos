// The panic button: tap Control 5 times quickly to hold the plain look, and
// again to let go (see DeskLights.setPlain). Either Control key counts.
const TAPS = 5;
const WINDOW_MS = 2000;
// While macOS refuses the key watch, ask again this often (granting needs no restart).
const RETRY_MS = 30 * 1000;
// What the native key watch reports (keywatch.mm); never which key.
const CONTROL_DOWN = 1;
const CONTROL_UP = 2;

/**
 * Counts taps: a tap is Control going down and up with no other key in
 * between, and any other key starts the count over.
 */
export class TapCounter {
  constructor() {
    this.taps = [];
    this.down = false;
  }

  // True on the tap that completes 5 within the window.
  feed(event, now) {
    if (event === CONTROL_DOWN) {
      this.down = true;
      return false;
    }
    if (event !== CONTROL_UP || !this.down) {
      this.down = false;
      this.taps = [];
      return false;
    }
    this.down = false;
    this.taps = [...this.taps, now].filter(at => now - at <= WINDOW_MS);
    if (this.taps.length >= TAPS) {
      this.taps = [];
      return true;
    }
    return false;
  }
}

/**
 * Watches the keyboard for the panic taps. The watch needs Input Monitoring:
 * macOS asks once; while it is not granted, `blocked` is true and the menu
 * offers the setting.
 */
export class PanicButton {
  constructor(addon, onPanic) {
    this.addon = addon;
    this.onPanic = onPanic;
    this.counter = new TapCounter();
    this.watching = null; // unknown until the first try
    this.onBlockedChange = () => {};
  }

  get blocked() {
    return this.watching === false;
  }

  start() {
    if (this.addon.inputMonitoringAccess() === 'unknown') {
      this.addon.requestInputMonitoring();
    }
    this.tryWatch();
  }

  tryWatch() {
    clearTimeout(this.retry);
    const was = this.watching;
    this.watching = this.addon.inputMonitoringAccess() === 'granted'
      && this.addon.startKeyWatch(event => {
        if (this.counter.feed(event, Date.now())) {
          this.onPanic();
        }
      });
    if (was !== this.watching) {
      console.log(this.watching ? 'Panic button: watching for 5 Control taps' : 'Panic button: needs Input Monitoring');
      this.onBlockedChange();
    }
    if (!this.watching) {
      this.retry = setTimeout(() => this.tryWatch(), RETRY_MS);
    }
  }

  stop() {
    clearTimeout(this.retry);
    if (this.watching) {
      this.addon.stopKeyWatch();
      this.watching = false;
    }
  }
}
