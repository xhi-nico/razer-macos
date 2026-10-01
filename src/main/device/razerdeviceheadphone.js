import { RazerDevice } from './razerdevice';

export class RazerDeviceHeadphone extends RazerDevice {
  setModeNone() {
    super.setModeNone();
    this.addon.headphoneSetModeNone(this.internalId);
  }

  setModeStaticNoStore(color) {
    super.setModeStaticNoStore(color);
    this.addon.headphoneSetModeStaticNoStore(this.internalId, new Uint8Array(color));
  }

  setModeStatic(color) {
    super.setModeStatic(color);
    this.addon.headphoneSetModeStatic(this.internalId, new Uint8Array(color));
  }

  setSpectrum() {
    super.setSpectrum();
    this.addon.headphoneSetModeSpectrum(this.internalId);
  }

  setBreathe(color) {
    super.setBreathe(color);
    this.addon.headphoneSetModeBreathe(this.internalId, new Uint8Array(color));
  }
}