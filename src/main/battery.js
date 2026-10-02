import { FeatureIdentifier } from './feature/featureidentifier';
import { RazerDeviceType } from './device/razerdevicetype';
import { guard } from './guard';

// Under this charge, and not charging, the mouse pulses amber until it is charging or charged.
const LOW_PERCENT = 15;
// Each read is a synchronous USB request, and charge moves over hours.
const POLL_MS = 2 * 60 * 1000;
// Under the call lights; it outlasts a missed poll or two, then fades if the app stops checking.
const LOW = { region: 'mouse', color: [255, 140, 0], effect: 'pulse', period: 3, priority: 30, duration: POLL_MS * 2.5 / 1000 };

/**
 * Reads every mouse's battery now and then, and shows a low one as a layer.
 * A mouse that cannot say (a wireless one asleep reads as -1) keeps what it showed.
 */
export class BatteryWatch {
  constructor(lights, getDevices) {
    this.lights = lights;
    this.getDevices = getDevices;
    this.low = new Set(); // layer ids of the mice shown low
  }

  start() {
    this.check();
    this.timer = setInterval(() => this.check(), POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  check() {
    const low = new Set();
    (this.getDevices() || [])
      .filter(device => device.mainType === RazerDeviceType.MOUSE && device.hasFeature(FeatureIdentifier.BATTERY))
      .forEach(device => guard(`Battery of ${device.name}`, () => {
        const id = `battery:${device.productId}`;
        device.refresh();
        const unknown = device.batteryLevel < 0;
        if (unknown ? this.low.has(id) : device.batteryLevel < LOW_PERCENT && !device.chargingStatus) {
          low.add(id);
          if (!unknown && !this.low.has(id)) {
            console.log(`Battery: ${device.name} is low (${device.batteryLevel}%)`);
          }
        }
      }));
    low.forEach(id => this.lights.show({ id, ...LOW }));
    this.low.forEach(id => {
      if (!low.has(id)) {
        this.lights.cancel(id);
      }
    });
    this.low = low;
  }
}
