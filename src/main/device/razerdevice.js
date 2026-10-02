export class RazerDevice {
  constructor(addon, settingsManager, razerDeviceProperties) {
    this.addon = addon;
    this.settingsManager = settingsManager;

    this.name = razerDeviceProperties.name;
    this.productId = razerDeviceProperties.productId;
    this.internalId = razerDeviceProperties.internalId;
    this.mainType = razerDeviceProperties.mainType;
    this.image = razerDeviceProperties.image;
    this.features = razerDeviceProperties.features;

    this.defaultColorSettings = {
      hex: '#ffff00',
      rgb: {
        r: 255,
        g: 255,
        b: 0,
      }
    };
  }

  async init() {
    try {
      this.readState();
    } catch (error) {
      // Still usable: the menu shows defaults until the next refresh reads it.
      console.warn(`${this.name}: could not read its state:`, error?.message ?? error);
    }
    this.settings = await this.settingsManager.getSettingsFor(this);
    return this;
  }

  // Reads what the device reports (brightness, DPI, battery). Override in device types.
  readState() {}

  getSettingsKey() {
    return 'razer_'+this.productId;
  }

  getDefaultSettings() {
    return {
      customColor1: this.defaultColorSettings
    };
  }

  refresh() {
  }

  // This device's handle is about to close: stop everything that would still write to it.
  destroy() {
    clearInterval(this.batteryLevelInterval);
    this.batteryLevelInterval = null;
  }

  async setSettings(settings) {
    this.settings = settings;
    return this.settingsManager.saveSettingsFor(this);
  }

  hasFeature(featureIdentifier) {
    return typeof this.getFeature(featureIdentifier) !== 'undefined';
  }
  getFeature(featureIdentifier) {
    return this.features.find(feature => feature.featureIdentifier === featureIdentifier);
  }

  //override in device types
  setModeNone() {}
  setModeStaticNoStore(color) {}
  setModeStatic(color) {}
  setSpectrum() {}
  setBreathe(color) {}
}