import { RazerDevice } from './razerdevice';
import { RazerAnimationRipple } from '../animation/animationripple';
import { RazerAnimationWheel } from '../animation/animationwheel';

export class RazerDeviceKeyboard extends RazerDevice {
  constructor(addon, settingsManager, razerProperties) {
    super(addon, settingsManager, razerProperties);
    this.rippleAnimation = null;
    this.wheelAnimation = null;
  }

  async init() {
    this.brightness = this.addon.KbdGetBrightness(this.internalId);
    return super.init();
  }

  getDefaultSettings() {
    return {
      customColor1: this.defaultColorSettings,
      customColor2: this.defaultColorSettings
    }
  }

  getSerializeIgnoredProperties() {
    return super.getSerializeIgnoredProperties().concat(['rippleAnimation', 'wheelAnimation']);
  }

  destroy() {
    super.destroy();
    if(this.rippleAnimation != null) {
      this.rippleAnimation.destroy();
    }
    if(this.wheelAnimation != null) {
      this.wheelAnimation.destroy();
    }
  }

  setModeNone() {
    super.setModeNone();
    this.stopAnimations();
    this.addon.kbdSetModeNone(this.internalId)
  }

  setModeStaticNoStore(color) {
    super.setModeStaticNoStore(color);
    this.stopAnimations();
    this.addon.kbdSetModeStaticNoStore(this.internalId, new Uint8Array(color));
  }

  setModeStatic(color) {
    super.setModeStatic(color);
    this.stopAnimations();
    this.addon.kbdSetModeStatic(this.internalId, new Uint8Array(color));
  }

  setSpectrum() {
    super.setSpectrum();
    this.stopAnimations();
    this.addon.kbdSetModeSpectrum(this.internalId);
  }

  setBreathe(color) {
    super.setBreathe(color);
    this.stopAnimations();
    this.addon.kbdSetModeBreathe(this.internalId, new Uint8Array(color));
  }

  //device specific
  setWaveExtended(directionSpeed) {
    this.stopAnimations();
    this.addon.kbdSetModeWave(this.internalId, directionSpeed);
  }
  setReactive(colorMode) {
    this.stopAnimations();
    this.addon.kbdSetModeReactive(this.internalId, new Uint8Array(colorMode));
  }
  setStarlight(mode) {
    this.stopAnimations();
    this.addon.kbdSetModeStarlight(this.internalId, new Uint8Array(mode));
  }

  getBrightness() {
    return this.brightness;
  }
  setBrightness(brightness) {
    this.brightness = brightness;
    this.addon.KbdSetBrightness(this.internalId, brightness);
  }

  stopAnimations() {
    if(this.rippleAnimation != null) {
      this.rippleAnimation.stop();
    }
    if(this.wheelAnimation != null) {
      this.wheelAnimation.stop();
    }
  }

  setRippleEffect(featureConfiguration, color, backgroundColor) {
    this.stopAnimations();
    this.rippleAnimation = new RazerAnimationRipple(this, featureConfiguration, color, backgroundColor);
    this.rippleAnimation.start();
  }

  setWheelEffect(featureConfiguration, speed) {
    this.stopAnimations();
    this.wheelAnimation = new RazerAnimationWheel(this, featureConfiguration, speed);
    this.wheelAnimation.start();
  }

  setCustomFrame(frame) {
    this.addon.kbdSetCustomFrame(this.internalId, new Uint8Array(frame));
  }
  setModeCustom() {
    this.addon.kbdSetModeCustom(this.internalId);
  }
}