// After a plug, unplug or wake, the Razer devices are read again once USB has
// settled. A device is in the USB registry before it can be opened (it is still
// starting up, or the Mac is halfway back to sleep after a dock woke it), and
// becoming openable changes nothing in the registry, so a scan that could not
// open a device is run again at these delays, then left until the devices change.
const SETTLE_MS = 800;
const RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000];

/**
 * Keeps the device list in step with what is attached. `rescan` reads the
 * devices again and rebuilds the menu (Application.refreshTray).
 */
export class DeviceWatch {
  constructor(signals, deviceManager, rescan) {
    this.signals = signals;
    this.deviceManager = deviceManager;
    this.rescan = rescan;
    this.timer = null;
    this.tries = 0;
  }

  // The first scan has run by now: check it, in case a device was still starting up.
  start() {
    this.signals.on('devices', () => this.changed());
    this.check();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.again(), delay);
  }

  changed() {
    this.tries = 0;
    this.schedule(SETTLE_MS);
  }

  async again() {
    this.timer = null;
    await this.rescan().catch(error => console.warn('Devices: rescan failed:', error?.message ?? error));
    this.check();
  }

  check() {
    if (this.timer) {
      return; // the devices changed again; that rescan checks
    }
    const error = this.deviceManager.openError;
    if (!error) {
      return;
    }
    const what = `Devices: an attached Razer device could not be opened (${error})`;
    const delay = RETRY_MS[this.tries];
    if (delay == null) {
      console.warn(`${what}; giving up until the devices change`);
      return;
    }
    this.tries++;
    console.warn(`${what}, trying again in ${delay / 1000}s`);
    this.schedule(delay);
  }
}
