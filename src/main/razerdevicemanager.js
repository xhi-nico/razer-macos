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
import { guard } from './guard';

/**
 * Responsible to fetch all attached Razer devices and map them to RazerDevice instances with features
 * @constructor
 */
export class RazerDeviceManager {
  constructor(settingsManager) {
    this.addon = addon;
    this.settingsManager = settingsManager;
    this.razerConfigDevices = this.getAllRazerDeviceConfigurations();
    this.activeRazerDevices = [];
    this.lastRefresh = 0;
    this.refreshing = Promise.resolve(false);
  }

  // Resolves true once the device list has been rebuilt, false when throttled.
  // force skips the throttle: a replugged device must be picked up even right after a refresh.
  // One rebuild runs at a time; overlapping ones would fight over the open devices.
  refreshRazerDevices(force = false) {
    const rebuild = () => this.rebuild(force);
    this.refreshing = this.refreshing.then(rebuild, rebuild);
    return this.refreshing;
  }

  async rebuild(force) {
    if (!force && Date.now() < this.lastRefresh + 2000) {
      return false;
    }
    this.lastRefresh = Date.now();
    // The scan below closes every open device, so nothing may write to the old list.
    this.activeRazerDevices.forEach(device => guard(`Stopping ${device.name}`, () => device.destroy()));
    this.activeRazerDevices = [];

    const devices = await Promise.all(this.addon.getAllDevices().map(async foundDevice => {
      const configurationDevice = this.razerConfigDevices.find(d => d.productId === foundDevice.productId);
      if (configurationDevice === undefined) {
        console.log(`Devices: no device file for product 0x${foundDevice.productId.toString(16).padStart(4, '0')}`);
        return null;
      }
      const razerDevice = this.createRazerDeviceFrom({
        name: configurationDevice.name,
        productId: foundDevice.productId,
        internalId: foundDevice.internalDeviceId,
        mainType: configurationDevice.mainType,
        image: configurationDevice.image,
        features: configurationDevice.features,
        featuresMissing: configurationDevice.featuresMissing,
        featuresConfig: configurationDevice.featuresConfig,
      });
      try {
        return await razerDevice.init();
      } catch (error) {
        console.warn(`Devices: ${razerDevice.name} could not be set up:`, error?.message ?? error);
        return null;
      }
    }));

    this.activeRazerDevices = this.sortDevices(devices.filter(device => device !== null));
    console.log(`Devices: ${this.activeRazerDevices.map(device => device.name).join(', ') || 'none'}`);
    return true;
  }

  // Runs `action` on every device; one that fails is logged and skipped.
  forEachDevice(action) {
    this.activeRazerDevices.forEach(device => guard(device.name, () => action(device)));
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
        if (deviceA.name < deviceB.name) {
          return -1;
        }
        if (deviceA.name > deviceB.name) {
          return 1;
        }
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
      razerDeviceProperties.features = razerProperties.features.map(featureConfig => FeatureHelper.createFeatureFrom(featureConfig));
    }

    /// remove features which are stated being missing
    if (razerProperties.featuresMissing != null) {
      razerDeviceProperties.features = razerDeviceProperties.features.filter(feature => !razerProperties.featuresMissing.some(missingFeature => missingFeature === feature.featureIdentifier));
    }

    /// override configs if available
    if (razerProperties.featuresConfig != null) {
      razerProperties.featuresConfig.forEach(featureConfig => {
        const featureIdentifier = Object.keys(featureConfig)[0];
        const overriddenFeatureConfig = Object.values(featureConfig)[0];
        const feature = razerDeviceProperties.features.find(f => f.featureIdentifier === featureIdentifier);

        if(feature) {
          feature.configuration = Object.assign(feature.configuration, overriddenFeatureConfig);
        }
      });
    }

    return new device(this.addon, this.settingsManager, razerDeviceProperties);
  }

  getAllRazerDeviceConfigurations() {
    // Vite has no require.context; import.meta.glob is inlined at build time.
    const allFiles = import.meta.glob('../devices/*.json', { eager: true });
    return Object.values(allFiles).map((module) => {
      const razerConfigDevice = module.default ?? module;
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

  /**
   * The live device for one the settings window or an old menu still holds.
   * IDs change on every rebuild, so fall back to the same product, which is the
   * same physical device unless two identical ones are attached.
   */
  resolve(device) {
    if (device == null) {
      return undefined;
    }
    return this.activeRazerDevices.find(active => active.internalId === device.internalId)
      ?? this.activeRazerDevices.find(active => active.productId === device.productId);
  }

  destroy() {
    this.activeRazerDevices.forEach(device => guard(`Stopping ${device.name}`, () => device.destroy()));
    this.activeRazerDevices = [];
    this.addon.closeAllDevices();
    this.addon = null;
  }
}
