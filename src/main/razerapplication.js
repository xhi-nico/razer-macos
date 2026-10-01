import { RazerDeviceManager } from './razerdevicemanager';
import { SettingsManager } from './settingsmanager';
import { RazerAnimationCycleSpectrum } from './animation/animationcyclespectrum';
import { RazerAnimationCycleCustom } from './animation/animationcyclecustom';
import { DeskLights } from './desklights';

/**
 * Main application
 * DeviceManager: Queries all the devices and sets up their features
 * SettingsManager: Used to save settings for the application / devices
 * DeskLights: Sets every device's lighting from the Mac's state
 *
 * Animations: Animations which are run on all devices in parallel are held here as well.
 * @constructor
 */
export class RazerApplication {
  constructor() {
    this.settingsManager = new SettingsManager();
    this.deviceManager = new RazerDeviceManager(this.settingsManager);
    this.lights = new DeskLights(this.settingsManager, this.deviceManager.addon, () => this.deviceManager.activeRazerDevices);
    this.spectrumAnimation = null;
    this.cycleAnimation = null;
  }

  async refresh(force = false) {
    this.lights.hold();
    let rebuilt = false;
    return this.deviceManager.refreshRazerDevices(force).then(didRebuild => {
      rebuilt = didRebuild;
      const spectrumPromise = new RazerAnimationCycleSpectrum(this).init().then(animation => {
        this.spectrumAnimation = animation;
      });
      const cyclePromise = new RazerAnimationCycleCustom(this).init().then(animation => {
        this.cycleAnimation = animation;
      });
      return Promise.all([spectrumPromise, cyclePromise]).then(() => true);
    }).finally(() => this.lights.release(rebuilt));
  }

  destroy() {
    this.lights.sleepNow();
    this.deviceManager.destroy();
  }

  stopAnimations() {
    this.cycleAnimation.stop();
    this.spectrumAnimation.stop();
  }
}