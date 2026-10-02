import { getDeviceMenuFor, takesOverLights } from './menubuilderdevice';
import { guard } from '../guard';

export function getMenuFor(application) {
  const fullMenu = getMainMenu(application)
    .concat(getAllDevicesMenu(application))
    .concat(getCustomColorsCycleMenu(application))
    .concat(getDeviceMenu(application))
    .concat(getMainMenuBottom(application));

  patch(fullMenu, application);
  return fullMenu;
}

// Every click is guarded, so a device that fails mid-click is logged rather than
// thrown. Any click but a checkbox's also stops the running animation first.
function patch(deviceMenu, application) {
  deviceMenu.forEach(menuItem => {
    if (menuItem.hasOwnProperty('click')) {
      const originalClick = menuItem['click'];
      menuItem['click'] = (...args) => guard(`Menu "${menuItem.label}"`, () => {
        if (menuItem.type !== 'checkbox') {
          application.razerApplication.stopAnimations();
        }
        originalClick(...args);
      });
    } else if (menuItem.hasOwnProperty('submenu')) {
      patch(menuItem['submenu'], application);
    }
  });
}

function getMainMenu(application) {
  return [
    {
      label: 'Auto lights',
      type: 'checkbox',
      checked: application.razerApplication.lights.auto,
      toolTip: 'White while you work, red when you leave, top row pulses on calls',
      click(menuItem) {
        application.setAutoLights(menuItem.checked);
      },
    },
    getPlainItem(application),
    ...(application.panic?.blocked ? [{
      label: 'Allow Input Monitoring for the panic button…',
      toolTip: 'The panic button needs it to see Control being tapped; it never sees which other keys you press',
      click() {
        application.openInputMonitoringSettings();
      },
    }] : []),
    // Only the packaged app: in development this would register the bare Electron binary.
    ...(application.app.isPackaged ? [{
      label: 'Open at Login',
      type: 'checkbox',
      checked: application.openAtLogin,
      click(menuItem) {
        application.openAtLogin = menuItem.checked;
      },
    }] : []),
    { type: 'separator' },
    {
      label: 'Refresh Device List',
      click() {
        application.refreshTray(true);
      },
    },
    {
      label: 'Clear all settings',
      click() {
        application.showConfirm("Really clear all settings?").then(result => {
          if(result.response === 0) {
            return application.razerApplication.settingsManager.clearAll();
          } else {
            return Promise.resolve();
          }
        }).then(() => {
          application.refreshTray(true);
        }).catch(() => {});
      }
    },
    { type: 'separator' },
    {
      label: 'All Devices',
      enabled: false,
    },
    { type: 'separator' },
  ];
}

function getPlainItem(application) {
  const { lights } = application.razerApplication;
  const until = new Date(lights.plainUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    label: lights.plain ? `Plain lights until ${until}` : 'Plain lights for an hour',
    type: 'checkbox',
    checked: lights.plain,
    toolTip: 'Or tap Control 5 times. Stops every animation and holds white, warm white at night, red when away',
    click(menuItem) {
      application.setPlain(menuItem.checked);
    },
  };
}

function getAllDevicesMenu(application) {
  return [
    {
      label: 'None',
      click() {
        application.razerApplication.deviceManager.forEachDevice(device => {
          device.setModeNone();
        });
      },
    },
    {
      label: 'Static',
      submenu: [
        {
          label: 'Custom',
          click() {
            application.razerApplication.deviceManager.forEachDevice(device => {
              device.setModeStatic(Object.values(device.settings.customColor1.rgb).slice(0,3));
            });
          },
        },
        {
          label: 'Red',
          click() {
            application.razerApplication.deviceManager.forEachDevice(device => {
              device.setModeStatic([0xff, 0, 0]);
            });
          },
        },
        {
          label: 'Green',
          click() {
            application.razerApplication.deviceManager.forEachDevice(device => {
              device.setModeStatic([0, 0xff, 0]);
            });
          },
        },
        {
          label: 'Blue',
          click() {
            application.razerApplication.deviceManager.forEachDevice(device => {
              device.setModeStatic([0, 0, 0xff]);
            });
          },
        },
      ],
    },
    {
      label: 'Spectrum',
      submenu: [
        {
          label: 'By device',
          toolTip: 'Runs spectrum mode for all attached devices',
          click() {
            application.razerApplication.deviceManager.forEachDevice(device => {
              device.setSpectrum();
            });
          }
        },
        {
          label: 'By animation',
          toolTip: 'Starts timed animation which changes color for all attached devices',
          click() {
            application.razerApplication.spectrumAnimation.start();
          }
        },
      ]
    },
  ].map(item => takesOverLights(application, item));
}

function getCustomColorsCycleMenu(application) {
  const cccMenu = [
    takesOverLights(application, {
      label: 'Start Cycle',
      click() {
        application.razerApplication.cycleAnimation.start();
      },
    }),
    {
      label: 'Stop Cycle',
      click() {
        application.razerApplication.cycleAnimation.stop();
      },
    },
    { type: 'separator' },
    {
      label: 'Add Color',
      click() {
        application.razerApplication.cycleAnimation.addColor({ r: 0x00, g: 0xff, b: 0x00 });
        application.refreshTray();
      },
    },
    {
      label: 'Reset Colors',
      click() {
        application.razerApplication.cycleAnimation.setColor([
          { r: 0xff, g: 0x00, b: 0x00 },
          { r: 0x00, g: 0xff, b: 0x00 },
          { r: 0x00, g: 0x00, b: 0xff },
        ]);
        application.refreshTray();
      },
    },
    { type: 'separator' },
  ];

  const colorItems = application.razerApplication.cycleAnimation.getAllColors().map((color, index) => {
    return {
      label: 'Color ' + (index + 1),
      click: () => {
        application.showView({
          mode: 'color',
          index: index,
          color: color
        });
      },
    };
  });

  return [{
    label: 'Cycle',
    submenu: cccMenu.concat(colorItems)
  }]
}

function getDeviceMenu(application) {
  return application.razerApplication.deviceManager.activeRazerDevices.map(device => getDeviceMenuFor(application, device)).flat();
}

function getMainMenuBottom(application) {
  return [
    { type: 'separator' },
    {
      label: 'About',
      submenu: [
        {
          label: `Version: ${application.APP_VERSION}`,
          enabled: false,
        },
        {
          label: 'Open Log',
          click() {
            application.openLog();
          },
        },
      ],
    },
    {
      label: 'Quit',
      click() {
        application.quit();
      },
      accelerator: 'Command+Q',
    },
  ]
}