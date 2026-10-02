import { RazerDevice } from './razerdevice';

export class RazerDeviceMouseMat extends RazerDevice {
  readState() {
    this.brightness = this.addon.mouseMatGetBrightness(this.internalId);
  }

  setModeNone() {
    super.setModeNone();
    this.addon.mouseMatSetModeNone(this.internalId);
  }

  setModeStaticNoStore(color) {
    super.setModeStaticNoStore(color);
    this.addon.mouseMatSetModeStaticNoStore(this.internalId, new Uint8Array(color));
  }

  setModeStatic(color) {
    super.setModeStatic(color);
    this.addon.mouseMatSetModeStatic(this.internalId, new Uint8Array(color));
  }

  getBrightness() {
    return this.brightness;
  }

  setBrightness(brightness) {
    this.brightness = brightness;
    this.addon.mouseMatSetBrightness(this.internalId, brightness);
  }

  setSpectrum() {
    super.setSpectrum();
    this.addon.mouseMatSetModeSpectrum(this.internalId);
  }

  setBreathe(color) {
    super.setBreathe(color);
    this.addon.mouseMatSetModeBreathe(this.internalId, new Uint8Array(color));
  }

  // device specific
  setWaveSimple(direction) {
    this.addon.mouseMatSetModeWave(this.internalId, direction);
  }
}