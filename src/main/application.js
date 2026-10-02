import { RazerApplication } from './razerapplication';
import { app, dialog, BrowserWindow, ipcMain, Menu, nativeImage, Tray, powerMonitor, shell } from 'electron';
import path from 'path';
import { getMenuFor } from './menu/menubuilder';
import { MacSignals } from './macsignals';
import { LightsApi, readJson } from './lightsapi';
import { ClaudeCodeSessions } from './claudecode';
import { BatteryWatch } from './battery';
import { MusicVisualiser } from './music';
import { PanicButton } from './panic';
import addon from '../driver';
import { clearBatteryMode } from './menu/menubuilderdevice';
import { guard } from './guard';
import { getLogFile } from './log';
// ?asset resolves to a real file path in dev and in the packaged app,
// replacing electron-webpack's __static global.
import trayIconPath from '../../static/assets/iconTemplate.png?asset';

const version = require('../../package.json').version;

// Wait for USB to settle after a plug event before re-reading the device list.
const DEVICE_SETTLE_MS = 800;

/**
 * Application is a small wrapper around an electron app (browserwindow, tray, dialog...)
 * It's the entry point into the application and references the main functionality with: RazerApplication
 * @constructor
 */
export class Application {

  constructor(isDevelopment) {
    this.isDevelopment = isDevelopment;
    this.forceQuit = false;
    this.tray = null;
    this.browserWindow = null;
    this.app = app;
    this.dialog = dialog;
    this.APP_VERSION = version;

    // A second copy would fight this one for the devices and the attention port.
    if (!app.requestSingleInstanceLock()) {
      console.log('Already running, so this copy quits');
      app.quit();
      return;
    }
    // Opening the app again shows its menu, the closest thing it has to a window.
    app.on('second-instance', () => this.tray?.popUpContextMenu());

    this.initListeners();

    // Init the main application
    this.razerApplication = new RazerApplication();
  }

  initListeners() {
    this.app.on('ready', () => {
      this.createTray().then(() => this.startSignals());
      this.createWindow();
    });

    this.app.on('quit', () => {
      this.music?.stop();
      this.panic?.stop();
      this.razerApplication.destroy();
    });

    // Settings window actions. The window holds a copy of the device from when
    // it opened, so each resolves the live one first.
    this.onDevice('request-set-dpi', (device, { dpi }) => device.setDPI(dpi));
    this.onDevice('update-brightness', (device, { brightness }) => device.setBrightness(brightness));
    this.onDevice('request-set-custom-color', (device, { device: edited }) => device.setSettings(edited.settings));
    ['Matrix', 'Logo', 'Scroll', 'Left', 'Right'].forEach(zone => {
      this.onDevice(`update-mouse-${zone.toLowerCase()}-brightness`, (device, { brightness }) => device[`setBrightness${zone}`](brightness));
    });
    this.onDevice('update-mouse-pollrate', (device, { pollRate }) => device.setPollRate(pollRate), false);

    ipcMain.on('request-cycle-color', (_, { index, color }) => guard('Cycle colour', () => {
      this.razerApplication.cycleAnimation.updateColor(index, color.rgb);
      this.refreshTray();
    }));
  }

  onDevice(channel, apply, refreshMenu = true) {
    ipcMain.on(channel, (_, message) => guard(channel, () => {
      const device = this.razerApplication.deviceManager.resolve(message.device);
      if (device == null) {
        console.warn(`${channel}: ${message.device?.name ?? 'the device'} is no longer attached`);
        return;
      }
      apply(device, message);
      if (refreshMenu) {
        this.refreshTray();
      }
    }));
  }

  createWindow() {
    this.browserWindow = new BrowserWindow({
      webPreferences: { preload: path.join(__dirname, '../preload/index.js') },
      //titleBarStyle: 'hidden',
      height: 800, // This is adjusted later with window.setSize
      resizable: false,
      width: 500,
      minWidth: 320,
      minHeight: 320,
      y: 100,
      // Set the default background color of the window to match the CSS
      // background color of the page, this prevents any white flickering
      backgroundColor: '#202124',
      // Don't show the window until it's ready, this prevents any white flickering
      show: false,
    });
    if (this.isDevelopment) {
      this.browserWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
      this.browserWindow.resizable = true;
    } else {
      this.browserWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Handle window logic properly on macOS:
    // 1. App should not terminate if window has been closed
    // 2. Click on icon in dock should re-open the window
    // 3. ⌘+Q should close the window and quit the app
    this.browserWindow.on('close', (e) => {
      if (!this.forceQuit) {
        e.preventDefault();
        this.browserWindow.hide();
      }
    });

    this.app.on('activate', () => {
      this.browserWindow.show();
    });

    this.app.on('before-quit', () => {
      this.forceQuit = true;
    });

    if (this.isDevelopment) {
      // auto-open dev tools
      //this.browserWindow.webContents.openDevTools();

      // add inspect element on right click menu
      this.browserWindow.webContents.on('context-menu', (e, props) => {
        const that = this;
        Menu.buildFromTemplate([
          {
            label: 'Inspect element',
            click() {
              that.browserWindow.inspectElement(props.x, props.y);
            },
          },
        ]).popup(this.browserWindow);
      });
    }
  }

  createTray() {
    if (!this.isDevelopment && this.app.dock) {
      this.app.dock.hide();
    }

    // The bundler content-hashes the asset filename, so it no longer ends in
    // "Template" and macOS will not infer a template image from the name.
    // Set the flag explicitly instead of relying on that convention.
    // https://www.electronjs.org/docs/api/native-image#template-image
    // macOS also redraws a template image for light and dark menu bars by itself.
    const trayIcon = nativeImage.createFromPath(trayIconPath);
    trayIcon.setTemplateImage(true);
    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Razer macOS menu');
    this.tray.on('click', () => {
      this.razerApplication.deviceManager.forEachDevice(device => device.refresh());
      this.refreshTray();
    });

    return this.refreshTray(true);
  }

  startSignals() {
    const { lights } = this.razerApplication;
    lights.onHealthChange = () => this.refreshTray();
    lights.onPlainChange = () => this.refreshTray();
    this.signals = new MacSignals(addon, powerMonitor);
    this.signals.on('change', state => lights.update(state));
    this.signals.on('sleep', () => lights.sleepNow());
    this.signals.on('devices', () => {
      clearTimeout(this.deviceSettleTimer);
      this.deviceSettleTimer = setTimeout(() => this.refreshTray(true, true), DEVICE_SETTLE_MS);
    });
    this.signals.start();
    this.lightsApi = new LightsApi(lights);
    // Claude Code's hooks post their JSON here. Always a 204: nothing to tell Claude Code.
    const sessions = new ClaudeCodeSessions(lights);
    this.lightsApi.route('POST', /^\/claude-code$/, async request => {
      sessions.handle(await readJson(request).catch(() => null));
    });
    this.lightsApi.start();
    this.battery = new BatteryWatch(lights, () => this.razerApplication.deviceManager.activeRazerDevices);
    this.battery.start();
    this.music = new MusicVisualiser(lights, addon);
    this.music.start();
    this.panic = new PanicButton(addon, () => this.setPlain(!lights.plain));
    this.panic.onBlockedChange = () => this.refreshTray();
    this.panic.start();
  }

  // The panic button, or its menu item: stop every animation and hold the plain look.
  setPlain(on) {
    if (on) {
      this.razerApplication.stopAnimations();
    }
    this.razerApplication.lights.setPlain(on);
  }

  openInputMonitoringSettings() {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
  }

  setAutoLights(on) {
    const { lights, deviceManager } = this.razerApplication;
    if (on) {
      this.razerApplication.stopAnimations();
      deviceManager.activeRazerDevices.forEach(clearBatteryMode);
    }
    lights.setAuto(on);
    this.refreshTray();
  }

  refreshTray(withDeviceRefresh, force = false) {
    const refresh = withDeviceRefresh ? this.razerApplication.refresh(force) : Promise.resolve(true);
    return refresh.then(() => {
      if (withDeviceRefresh) {
        this.battery?.check(); // a mouse may have just arrived
      }
      const contextMenu = Menu.buildFromTemplate(getMenuFor(this));
      this.tray.setContextMenu(contextMenu);
    });
  }

  get openAtLogin() {
    return this.app.getLoginItemSettings().openAtLogin;
  }

  set openAtLogin(on) {
    this.app.setLoginItemSettings({ openAtLogin: on });
  }

  openLog() {
    shell.openPath(getLogFile());
  }

  showConfirm(message) {
    this.app.focus();
    return this.dialog.showMessageBox({
      buttons: ['Yes', 'No'], message: message,
    });
  }

  showView(args) {
    this.browserWindow.webContents.send('render-view', args);
    this.browserWindow.show();
  }

  quit() {
    this.app.quit();
  }
}