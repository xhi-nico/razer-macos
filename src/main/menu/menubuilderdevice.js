import { FeatureIdentifier } from '../feature/featureidentifier';
import { RazerDeviceType } from '../device/razerdevicetype';
import { toHex } from '../lightlayers';

// Brightness scales whatever Auto lights shows, and DPI and polling rate are not
// lighting, so these leave Auto on.
const LEAVES_LIGHTS = [FeatureIdentifier.BRIGHTNESS, FeatureIdentifier.MOUSE_BRIGHTNESS, FeatureIdentifier.MOUSE_DPI, FeatureIdentifier.POLL_RATE];

const BRIGHTNESS_PRESETS = [0, 25, 50, 75, 100];
const DPI_PRESETS = [400, 800, 1200, 1600, 2400, 3200, 4800, 6400];

// A setting's presets as radio items, the current value among them even when it
// is not a preset. Picking one applies it and refreshes the menu.
function presetMenu(application, label, presets, current, format, apply) {
  return {
    label: `${label}: ${format(current)}`,
    submenu: [...new Set([...presets, current].filter(Number.isFinite))]
      .sort((a, b) => a - b)
      .map(value => ({
        label: format(value),
        type: 'radio',
        checked: value === current,
        click() {
          apply(value);
          application.refreshTray();
        },
      })),
  };
}

/**
 * Picking a colour or effect by hand stops the running animation and switches
 * Auto lights off, so the next Mac event does not paint over it. Ticking Auto
 * lights hands control back.
 */
export function takesOverLights(application, menuItem) {
  if (menuItem.click) {
    const originalClick = menuItem.click;
    menuItem.click = (...args) => {
      application.razerApplication.stopAnimations();
      application.setAutoLights(false);
      originalClick(...args);
    };
  }
  if (menuItem.submenu) {
    menuItem.submenu.forEach(subItem => takesOverLights(application, subItem));
  }
  return menuItem;
}

export function getDeviceMenuFor(application, razerDevice) {
  let deviceMenu = [
    { type: 'separator' },
    getHeaderFor(application, razerDevice),
    { type: 'separator' },
  ];

  const featureMenu = razerDevice.features
    .map(feature => {
      const item = getFeatureMenuFor(application, razerDevice, feature);
      return item != null && !LEAVES_LIGHTS.includes(feature.featureIdentifier) ? takesOverLights(application, item) : item;
    })
    .filter(item => item != null);
  return deviceMenu.concat(featureMenu, getCustomColorItems(application, razerDevice));
}

function getHeaderFor(application, razerDevice) {

  let label = razerDevice.name;
  let icon = null;
  switch (razerDevice.mainType) {
    case RazerDeviceType.KEYBOARD:
      break;
    case RazerDeviceType.MOUSE:
      if (razerDevice.hasFeature(FeatureIdentifier.BATTERY) && razerDevice.batteryLevel !== -1) {
        if (razerDevice.chargingStatus) {
          label = label + ' - ⚡' + razerDevice.batteryLevel.toString() + '%';
        } else {
          label = label + ' - 🔋' + razerDevice.batteryLevel.toString() + '%';
        }
      }
      break;
    case RazerDeviceType.MOUSEDOCK:
      break;
    case RazerDeviceType.MOUSEMAT:
      break;
    case RazerDeviceType.EGPU:
      break;
    case RazerDeviceType.HEADPHONE:
      break;
    case RazerDeviceType.ACCESSORY:
      break;
  }
  // Auto lights retries it on its own, and the label clears when it answers again.
  if (application.razerApplication.lights.isFailing(razerDevice)) {
    label = label + ' - ⚠️ not answering';
  }

  return {
    label: label,
    icon: icon,
    enabled: false,
  };
}

function getFeatureMenuFor(application, device, feature) {
  switch (feature.featureIdentifier) {
    case FeatureIdentifier.NONE:
      return getFeatureNone(application, device, feature);
    case FeatureIdentifier.STATIC:
      return getFeatureStatic(application, device, feature);
    case FeatureIdentifier.WAVE_SIMPLE:
      return getFeatureWaveSimple(application, device, feature);
    case FeatureIdentifier.WAVE_EXTENDED:
      return getFeatureWaveExtended(application, device, feature);
    case FeatureIdentifier.SPECTRUM:
      return getFeatureSpectrum(application, device, feature);
    case FeatureIdentifier.REACTIVE:
      return getFeatureReactive(application, device, feature);
    case FeatureIdentifier.BREATHE:
      return getFeatureBreath(application, device, feature);
    case FeatureIdentifier.STARLIGHT:
      return getFeatureStarlight(application, device, feature);
    case FeatureIdentifier.BRIGHTNESS:
      return getFeatureBrightness(application, device, feature);
    case FeatureIdentifier.RIPPLE:
      return getFeatureRipple(application, device, feature);
    case FeatureIdentifier.WHEEL:
      return getFeatureWheel(application, device, feature);
    case FeatureIdentifier.OLD_MOUSE_EFFECTS:
      return getFeatureOldMouseEffect(application, device, feature);
    case FeatureIdentifier.MOUSE_BRIGHTNESS:
      return getFeatureMouseBrightness(application, device, feature);
    case FeatureIdentifier.POLL_RATE:
      return getFeaturePollRate(application, device, feature);
    case FeatureIdentifier.MOUSE_DPI:
      return getFeatureDpi(application, device, feature);
    case FeatureIdentifier.BATTERY:
      return getFeatureBatteryLevel(application, device, feature);
    default:
      throw 'Unmapped feature for identifier ' + feature.featureIdentifier + ' detected.';
  }
}

// Battery level moves over hours, so a slow tick is plenty. Each tick makes a
// synchronous native USB call, so this doubles as limiting exposure to a stale
// device handle.
const BATTERY_POLL_MS = 120000;

export function clearBatteryMode(device) {
  if (device.batteryLevelInterval) {
    clearInterval(device.batteryLevelInterval);
    device.batteryLevelInterval = null;
  }
  if (device.settings && device.settings.batteryModeActive) {
    device.settings.batteryModeActive = false;
    device.setSettings(device.settings);
  }
}

function getFeatureBatteryLevel(application, device, feature) {
  const getDockTargetDevice = () => {
    if (device.mainType !== RazerDeviceType.MOUSEDOCK) {
      return device;
    }

    const devices = application.razerApplication.deviceManager.activeRazerDevices || [];
    // Resolve the live dock object every tick in case the device list refreshed.
    // Deliberately no fallback to the captured `device`: once the dock leaves the
    // active list its native handle has been released, and writing to it segfaults
    // inside IOUSBLib rather than throwing something the try/catch could catch.
    return devices.find(activeDevice =>
      activeDevice.mainType === RazerDeviceType.MOUSEDOCK
      && activeDevice.productId === device.productId,
    ) || null;
  };

  const getBatterySourceDevice = () => {
    if (device.mainType !== RazerDeviceType.MOUSEDOCK) {
      return getDockTargetDevice();
    }

    // Dock has no own battery telemetry; map to an attached mouse battery.
    const devices = application.razerApplication.deviceManager.activeRazerDevices || [];
    const batteryMice = devices.filter(activeDevice =>
      activeDevice.mainType === RazerDeviceType.MOUSE
      && activeDevice.hasFeature(FeatureIdentifier.BATTERY),
    );

    const chargingMouse = batteryMice.find(mouse => mouse.chargingStatus);
    return chargingMouse || batteryMice[0] || null;
  };

  const updateBatteryColor = () => {
    const dockTargetDevice = getDockTargetDevice();
    if (!dockTargetDevice) {
      return;
    }

    const batterySourceDevice = getBatterySourceDevice();
    if (batterySourceDevice && typeof batterySourceDevice.refresh === 'function') {
      batterySourceDevice.refresh();
    }

    const batteryLevel = batterySourceDevice ? batterySourceDevice.batteryLevel : null;
    if (!batteryLevel || batteryLevel === -1) {
      dockTargetDevice.setModeStatic([255, 255, 255]);
      return;
    }

    let r = 0;
    let g = 0;

    if (batteryLevel < 50) {
      r = 255;
      g = Math.round(5.1 * batteryLevel);
    } else {
      g = 255;
      r = Math.round(510 - 5.10 * batteryLevel);
    }

    dockTargetDevice.setModeStatic([r, g, 0]);
  };

  // Auto-start polling if battery mode was active when the app last ran.
  if (device.settings && device.settings.batteryModeActive && !device.batteryLevelInterval
    && !application.razerApplication.lights.auto) {
    try {
      updateBatteryColor();
    } catch (error) {
      console.warn('Failed to apply initial battery color update', error);
    }
    device.batteryLevelInterval = setInterval(() => {
      try {
        updateBatteryColor();
      } catch (error) {
        console.warn('Failed battery color update tick', error);
      }
    }, BATTERY_POLL_MS);
  }

  return {
    label: 'Battery level',
    click() {
      if (device.batteryLevelInterval) clearInterval(device.batteryLevelInterval);
      if (device.settings) {
        device.settings.batteryModeActive = true;
        device.setSettings(device.settings);
      }
      try {
        updateBatteryColor();
      } catch (error) {
        console.warn('Failed to apply initial battery color update', error);
      }
      device.batteryLevelInterval = setInterval(() => {
        try {
          updateBatteryColor();
        } catch (error) {
          console.warn('Failed battery color update tick', error);
        }
      }, BATTERY_POLL_MS);
    },
  };
}

function getFeatureBreath(application, device, feature) {
  return {
    label: 'Breathe',
    click() {
      clearBatteryMode(device);
      // random
      device.setBreathe([0]);
    },
  };
}

function getFeatureBrightness(application, device, feature) {
  return presetMenu(application, 'Brightness', BRIGHTNESS_PRESETS, device.getBrightness(), value => `${value}%`, value => device.setBrightness(value));
}

function getFeatureDpi(application, device, feature) {
  const { min, max } = feature.configuration;
  return presetMenu(application, 'DPI', DPI_PRESETS.filter(dpi => dpi >= min && dpi <= max), device.getDPI(), String, value => device.setDPI(value));
}

function getFeaturePollRate(application, device, feature) {
  return presetMenu(application, 'Polling rate', feature.configuration.pollRates, device.getPollRate(), value => `${value} Hz`, value => device.setPollRate(value));
}

/**
 * The custom colours that the Custom colour effects use, picked in the macOS
 * colour panel. A device that only shows some of red, green and blue gets the
 * rest dropped. The pick is saved when the panel closes.
 */
function getCustomColorItems(application, device) {
  const staticFeature = device.getFeature(FeatureIdentifier.STATIC);
  if (!device.settings?.customColor1 || !staticFeature) {
    return [];
  }
  const { enabledRed, enabledGreen, enabledBlue } = staticFeature.configuration;
  const shown = [enabledRed, enabledGreen, enabledBlue];
  const item = (key, name) => ({
    label: `${name}…`,
    click() {
      const { r, g, b } = device.settings[key].rgb;
      application.pickColor(`${device.name}: ${name}`, [r, g, b], (picked, done) => {
        if (!done) {
          return;
        }
        const live = application.razerApplication.deviceManager.resolve(device);
        if (live == null) {
          return;
        }
        const rgb = picked.map((channel, i) => (shown[i] ? channel : 0));
        live.settings[key] = { hex: toHex(rgb), rgb: { r: rgb[0], g: rgb[1], b: rgb[2] } };
        live.setSettings(live.settings);
        application.refreshTray();
      });
    },
  });
  return [
    item('customColor1', 'Custom color'),
    ...(device.settings.customColor2 ? [item('customColor2', 'Second custom color')] : []),
  ];
}

function getFeatureNone(application, device, feature) {
  return {
    label: 'None',
    click() {
      clearBatteryMode(device);
      device.setModeNone();
    },
  };
}

function getFeatureOldMouseEffect(application, device, feature) {

  const submenu = [
    feature.configuration.enabledStatic ? {
      label: 'Static',
      click() {
        clearBatteryMode(device);
        device.setLogoLEDEffect('static');
      },
    } : null,
    feature.configuration.enabledBlinking ? {
      label: 'Blinking',
      click() {
        clearBatteryMode(device);
        device.setLogoLEDEffect('blinking');
      },
    } : null,
    feature.configuration.enabledPulsate ? {
      label: 'Pulsate',
      click() {
        clearBatteryMode(device);
        device.setLogoLEDEffect('pulsate');
      },
    } : null,
    feature.configuration.enabledScroll ? {
      label: 'Scroll',
      click() {
        clearBatteryMode(device);
        device.setLogoLEDEffect('scroll');
      },
    } : null,
  ];

  return {
    label: 'Older model effects',
    submenu: submenu.filter(s => s !== null),
  };
}

function getFeatureReactive(application, device, feature) {
  const singleItem = (label, colorMode) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setReactive(colorMode);
      },
    };
  };
  return {
    label: 'Reactive',
    submenu: [
      singleItem('Custom color', [3, device.settings.customColor1.rgb.r, device.settings.customColor1.rgb.g, device.settings.customColor1.rgb.b]),
      singleItem('Red', [3, 0xff, 0, 0]),
      singleItem('Green', [3, 0, 0xff, 0]),
      singleItem('Blue', [3, 0, 0, 0xff]),
    ],
  };
}

function getFeatureRipple(application, device, feature) {

  if (feature.configuration == null || feature.configuration.rows === -1 || feature.configuration.cols === -1) {
    return {
      // device missing rows, cols config
      label: 'Ripple',
      enabled: false
    };
  }

  const singleItem = (label, color, backgroundColor) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setRippleEffect(feature.configuration, color, backgroundColor);
      },
    };
  };

  return {
    label: 'Ripple',
    submenu: [
      singleItem('Custom color', Object.values(device.settings.customColor1.rgb).slice(0, 3)),
      singleItem('Custom dual color',
        Object.values(device.settings.customColor1.rgb).slice(0, 3),
        Object.values(device.settings.customColor2.rgb).slice(0, 3),
      ),
      singleItem('Red', [0xff, 0, 0]),
      singleItem('Green', [0, 0xff, 0]),
      singleItem('Blue', [0, 0, 0xff]),
    ],
  };
}

function getFeatureWheel(application, device, feature) {

  if (feature.configuration == null || feature.configuration.rows === -1 || feature.configuration.cols === -1) {
    return {
      // device missing rows, cols config
      label: 'Wheel',
      enabled: false
    };
  }

  const singleItem = (label, speed) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setWheelEffect(feature.configuration, speed);
      },
    };
  };

  return {
    label: 'Wheel',
    submenu: [
      singleItem('Slow Speed', 3),
      singleItem('Medium Speed', 2),
      singleItem('Fast Speed', 1),
    ],
  };
}

function getFeatureSpectrum(application, device, feature) {
  return {
    label: 'Spectrum',
    click() {
      clearBatteryMode(device);
      device.setSpectrum();
    },
  };
}

function getFeatureStarlight(application, device, feature) {
  const singleItem = (label, speed, colors) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setStarlight([speed].concat(colors));
      },
    };
  };

  const menuFor = (colors) => {
    return [
      singleItem('Slow Speed', 3, colors),
      singleItem('Medium Speed', 2, colors),
      singleItem('Fast Speed', 1, colors),
    ];
  };

  return {
    label: 'Starlight',
    submenu: [
      {
        label: 'Custom color',
        submenu: menuFor([device.settings.customColor1.rgb.r, device.settings.customColor1.rgb.g, device.settings.customColor1.rgb.b]),
      },
      {
        label: 'Custom dual color',
        submenu: menuFor([device.settings.customColor1.rgb.r, device.settings.customColor1.rgb.g, device.settings.customColor1.rgb.b, device.settings.customColor2.rgb.r, device.settings.customColor2.rgb.g, device.settings.customColor2.rgb.b]),
      },
      {
        label: 'Random',
        submenu: menuFor([]),
      },
      {
        label: 'Red',
        submenu: menuFor([0xff, 0, 0]),
      },
      {
        label: 'Green',
        submenu: menuFor([0, 0xff, 0]),
      },
      {
        label: 'Blue',
        submenu: menuFor([0, 0, 0xff]),
      },
      {
        label: 'Purple',
        submenu: menuFor([0x80, 0, 0x80]),
      },
      {
        label: 'Aqua',
        submenu: menuFor([0, 0xff, 0xff]),
      },
      {
        label: 'Orange',
        submenu: menuFor([0xff, 0x45, 0]),
      },

      {
        label: 'Red and Green',
        submenu: menuFor([0xff, 0, 0, 0, 0xff, 0]),
      },
      {
        label: 'Red and Blue',
        submenu: menuFor([0xff, 0, 0, 0, 0, 0xff]),
      },
      {
        label: 'Blue and Green',
        submenu: menuFor([0, 0, 0xff, 0, 0xff, 0]),
      },
    ],
  };
}

function getFeatureStatic(application, device, feature) {
  const singleItem = (label, color) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setModeStatic(color);
      },
    };
  };

  const subMenu = [
    singleItem('Custom color', [device.settings.customColor1.rgb.r, device.settings.customColor1.rgb.g, device.settings.customColor1.rgb.b]),
    feature.hasAllColors() ? singleItem('White', [0xff, 0xff, 0xff]) : null,
    feature.configuration.enabledRed ? singleItem('Red', [0xff, 0, 0]) : null,
    feature.configuration.enabledGreen ? singleItem('Green', [0, 0xff, 0]) : null,
    feature.configuration.enabledBlue ? singleItem('Blue', [0, 0, 0xff]) : null,
  ];

  return {
    label: 'Static',
    submenu: subMenu.filter(s => s !== null),
  };
}

function getFeatureWaveExtended(application, device, feature) {
  const singleItem = (label, directionSpeed) => {
    return {
      label: label,
      click() {
        clearBatteryMode(device);
        device.setWaveExtended(directionSpeed);
      },
    };
  };

  const menuFor = (direction) => {
    return [
      singleItem('Turtle Speed', direction + '_turtle'),
      singleItem('Slowest Speed', direction + '_slowest'),
      singleItem('Slower Speed', direction + '_slower'),
      singleItem('Slow Speed', direction + '_slow'),
      singleItem('Normal Speed', direction + '_default'),
      singleItem('Fast Speed', direction + '_fast'),
      singleItem('Faster Speed', direction + '_faster'),
      singleItem('Fastest Speed', direction + '_fastest'),
      singleItem('Lightning Speed', direction + '_lightning'),
    ];
  };

  return {
    label: 'Wave',
    submenu: [
      {
        label: 'Left',
        submenu: menuFor('left'),
      },
      {
        label: 'Right',
        submenu: menuFor('right'),
      },
    ],
  };
}

function getFeatureWaveSimple(application, device, feature) {
  return {
    label: 'Wave',
    submenu: [
      {
        label: 'Left',
        click() {
          clearBatteryMode(device);
          device.setWaveSimple('left');
        },
      },
      {
        label: 'Right',
        click() {
          clearBatteryMode(device);
          device.setWaveSimple('right');
        },
      },
    ],
  };
}

function getFeatureMouseBrightness(application, device, feature) {
  const zone = (enabled, label, zoneName) => enabled
    ? presetMenu(application, label, BRIGHTNESS_PRESETS, device[`getBrightness${zoneName}`](), value => `${value}%`, value => device[`setBrightness${zoneName}`](value))
    : null;
  const { enabledMatrix, enabledLogo, enabledScroll, enabledLeft, enabledRight } = feature.configuration;
  const zones = [
    zone(enabledMatrix, 'All', 'Matrix'),
    zone(enabledLogo, 'Logo', 'Logo'),
    zone(enabledScroll, 'Scroll wheel', 'Scroll'),
    zone(enabledLeft, 'Left side', 'Left'),
    zone(enabledRight, 'Right side', 'Right'),
  ].filter(item => item != null);
  // One zone needs no submenu of its own.
  if (zones.length === 1) {
    return { ...zones[0], label: zones[0].label.replace(/^All/, 'Brightness') };
  }
  return { label: 'Brightness', submenu: zones };
}
