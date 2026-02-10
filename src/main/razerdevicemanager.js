import addon from '../driver';
import { RazerDeviceKeyboard } from './device/razerdevicekeyboard';
import { RazerDeviceMouse } from './device/razerdevicemouse';
import { RazerDeviceMouseDock } from './device/razerdevicemousedock';
import { RazerDeviceMouseMat } from './device/razerdevicemousemat';
import { RazerDeviceEgpu } from './device/razerdeviceegpu';
import { RazerDeviceHeadphone } from './device/razerdeviceheadphone';
import { RazerDeviceAccessory } from './device/razerdeviceaccessory';
import { RazerDevice } from './device/razerdevice';
import { FeatureHelper } from './feature/featurehelper';
import { RazerDeviceType } from './device/razerdevicetype';

/**
 * Responsible to fetch all attached Razer devices and map them to RazerDevice instances with features
 * @constructor
 */
export class RazerDeviceManager {
  constructor(settingsManager, stateManager) {
    this.addon = addon;
    this.settingsManager = settingsManager;
    this.stateManager = stateManager;
    this.razerConfigDevices = this.getAllRazerDeviceConfigurations();
    this.activeRazerDevices = null;

    // Ensure the refresh throttle doesn't break on the first call
    this.lastRefresh = 0;
  }

  // Normalize productId coming from native addon.
  // Handles:
  // - number (e.g., 199)
  // - hex string (e.g., "0x00C7")
  // - decimal string (e.g., "199")
  toIntProductId(pid) {
    if (pid == null) return null;

    if (typeof pid === 'number') {
      return Number.isFinite(pid) ? pid : null;
    }

    if (typeof pid === 'string') {
      const s = pid.trim().toLowerCase();
      if (s.startsWith('0x')) {
        const v = parseInt(s, 16);
        return Number.isFinite(v) ? v : null;
      }
      const v10 = parseInt(s, 10);
      return Number.isFinite(v10) ? v10 : null;
    }

    return null;
  }

  toHex4(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
    return `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
  }

  async refreshRazerDevices() {
    if (new Date().getTime() < this.lastRefresh + 2000) {
      /// Refresh is called too fast. Wait a bit...
      return;
    }
    this.lastRefresh = new Date().getTime();
    this.closeDevices();

    const foundDevices = this.addon.getAllDevices();

    // Compact debug: what the addon is returning
    console.log(
      '[RazerDeviceManager] addon devices:',
      foundDevices.map(d => ({
        internalDeviceId: d.internalDeviceId,
        productIdRaw: d.productId,
        productIdNum: this.toIntProductId(d.productId),
        productIdHex: this.toHex4(this.toIntProductId(d.productId)),
      }))
    );

    // Useful debug: what configs exist (hex)
    const configPidsHex = this.razerConfigDevices
      .map(d => d.productId)
      .sort((a, b) => a - b)
      .map(pid => this.toHex4(pid));
    console.log('[RazerDeviceManager] config productIds:', configPidsHex);

    const devicePromises = foundDevices.map(async foundDevice => {
      const foundProductId = this.toIntProductId(foundDevice.productId);

      if (!Number.isFinite(foundProductId)) {
        console.warn('[RazerDeviceManager] skipping device with invalid productId:', foundDevice);
        return null;
      }

      const configurationDevice = this.razerConfigDevices.find(d => d.productId === foundProductId);
      if (configurationDevice === undefined) {
        console.warn(
          `[RazerDeviceManager] no config match for productId ${this.toHex4(foundProductId)} (${foundProductId})`
        );
        return null;
      }

      const razerProperties = {
        name: configurationDevice.name,
        productId: foundProductId,
        internalId: foundDevice.internalDeviceId,
        mainType: configurationDevice.mainType,
        image: configurationDevice.image,
        features: configurationDevice.features,
        featuresMissing: configurationDevice.featuresMissing,
        featuresConfig: configurationDevice.featuresConfig,
      };

      const razerDevice = this.createRazerDeviceFrom(razerProperties);
      return razerDevice.init();
    });

    return Promise.all(devicePromises)
      .then(devices => devices.filter(device => device !== null))
      .then((devices) => {
        this.activeRazerDevices = this.sortDevices(devices);
      });
  }

  sortDevices(devices) {
    const deviceOrder = [
      RazerDeviceType.KEYBOARD,
      RazerDeviceType.MOUSE,
      RazerDeviceType.MOUSEDOCK,
      RazerDeviceType.MOUSEMAT,
      RazerDeviceType.EGPU,
      RazerDeviceType.HEADPHONE,
      RazerDeviceType.ACCESSORY
    ]; // we could offer this as a personal setting in the future

    return devices.sort((deviceA, deviceB) => {
      const mainTypeAOrder = deviceOrder.indexOf(deviceA.mainType);
      const mainTypeBOrder = deviceOrder.indexOf(deviceB.mainType);
      if (mainTypeAOrder === mainTypeBOrder) {
        if (deviceA.name < deviceB.name) return -1;
        if (deviceA.name > deviceB.name) return 1;
        return 0;
      }
      return mainTypeAOrder - mainTypeBOrder;
    });
  }

  createRazerDeviceFrom(razerProperties) {
    let device;

    switch (razerProperties.mainType) {
      case RazerDeviceType.KEYBOARD:
        device = RazerDeviceKeyboard;
        break;
      case RazerDeviceType.MOUSE:
        device = RazerDeviceMouse;
        break;
      case RazerDeviceType.MOUSEDOCK:
        device = RazerDeviceMouseDock;
        break;
      case RazerDeviceType.MOUSEMAT:
        device = RazerDeviceMouseMat;
        break;
      case RazerDeviceType.EGPU:
        device = RazerDeviceEgpu;
        break;
      case RazerDeviceType.HEADPHONE:
        device = RazerDeviceHeadphone;
        break;
      case RazerDeviceType.ACCESSORY:
        device = RazerDeviceAccessory;
        break;
      default:
        device = RazerDevice;
    }

    const razerDeviceProperties = {
      name: razerProperties.name,
      productId: razerProperties.productId,
      internalId: razerProperties.internalId,
      mainType: razerProperties.mainType,
      image: razerProperties.image,
      features: null,
    };

    /// create from device standard or from feature list
    if (razerProperties.features == null) {
      razerDeviceProperties.features = FeatureHelper.getDefaultFeaturesFor(razerProperties.mainType);
    } else {
      razerDeviceProperties.features = razerProperties.features.map(featureConfig =>
        FeatureHelper.createFeatureFrom(featureConfig)
      );
    }

    /// remove features which are stated being missing
    if (razerProperties.featuresMissing != null) {
      razerDeviceProperties.features = razerDeviceProperties.features.filter(
        feature => !razerProperties.featuresMissing.some(
          missingFeature => missingFeature === feature.featureIdentifier
        )
      );
    }

    /// override configs if available
    if (razerProperties.featuresConfig != null) {
      razerProperties.featuresConfig.forEach(featureConfig => {
        const featureIdentifier = Object.keys(featureConfig)[0];
        const overriddenFeatureConfig = Object.values(featureConfig)[0];
        const feature = razerDeviceProperties.features.find(f => f.featureIdentifier === featureIdentifier);

        if (feature) {
          feature.configuration = Object.assign(feature.configuration, overriddenFeatureConfig);
        }
      });
    }

    return new device(this.addon, this.settingsManager, this.stateManager, razerDeviceProperties);
  }

  getAllRazerDeviceConfigurations() {
    const allFiles = require.context('../devices', true, /\.json$/i);
    return allFiles.keys().map((key) => {
      const razerConfigDevice = allFiles(key);
      return {
        name: razerConfigDevice.name,
        productId: parseInt(razerConfigDevice.productId, 16),
        mainType: razerConfigDevice.mainType,
        features: razerConfigDevice.features,
        featuresMissing: razerConfigDevice.featuresMissing,
        featuresConfig: razerConfigDevice.featuresConfig,
        image: razerConfigDevice.image,
      };
    });
  }

  getByInternalId(internalId) {
    return this.activeRazerDevices.find(device => device.internalId === internalId);
  }

  closeDevices() {
    if (this.activeRazerDevices !== null) {
      this.addon.closeAllDevices();
      this.activeRazerDevices = null;
    }
  }

  destroy() {
    if (this.activeRazerDevices != null) {
      this.activeRazerDevices.forEach(device => {
        if (device !== null) {
          device.destroy();
        }
      });
    }
    this.closeDevices();
    this.addon = null;
  }
}
