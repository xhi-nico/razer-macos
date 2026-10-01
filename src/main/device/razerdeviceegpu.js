import { RazerDevice } from './razerdevice';

export class RazerDeviceEgpu extends RazerDevice {
  setModeNone() {
    super.setModeNone();
    this.addon.egpuSetModeNone(this.internalId);
  }

  setModeStaticNoStore(color) {
    super.setModeStaticNoStore(color);
    this.addon.egpuSetModeStaticNoStore(this.internalId, new Uint8Array(color));
  }

  setModeStatic(color) {
    super.setModeStatic(color);
    this.addon.egpuSetModeStatic(this.internalId, new Uint8Array(color));
  }
  setSpectrum() {
    super.setSpectrum();
    this.addon.egpuSetModeSpectrum(this.internalId);
  }
  setBreathe(color) {
    super.setBreathe(color);
    this.addon.egpuSetModeBreathe(this.internalId, new Uint8Array(color));
  }

  //device specific
  setWaveSimple(direction) {
    this.addon.egpuSetModeWave(this.internalId, direction);
  }
}