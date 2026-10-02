import { RazerApplication } from './razerapplication';
import { app, dialog, Menu, nativeImage, Tray, powerMonitor, shell } from 'electron';
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
 * Application is a small wrapper around an electron app (tray, dialog, colour panel...)
 * It's the entry point into the application and references the main functionality with: RazerApplication
 * @constructor
 */
export class Application {

  constructor(isDevelopment) {
    this.isDevelopment = isDevelopment;
    this.tray = null;
    this.app = app;
    this.dialog = dialog;
    this.APP_VERSION = version;

    // A second copy would fight this one for the devices and the attention port.
    if (!app.requestSingleInstanceLock()) {
      console.log('Already running, so this copy quits');
      app.quit();
      return;
    }
    // Opening the app again shows its menu; it has no window.
    app.on('second-instance', () => this.tray?.popUpContextMenu());

    this.initListeners();

    // Init the main application
    this.razerApplication = new RazerApplication();
  }

  initListeners() {
    this.app.on('ready', () => {
      this.createTray().then(() => this.startSignals());
    });

    this.app.on('quit', () => {
      [this.music, this.panic, this.battery, this.lightsApi, this.signals].forEach(feature => feature?.stop());
      this.razerApplication.destroy();
    });
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

  /**
   * Opens the macOS colour panel on `rgb`: `onPick(rgb, done)` hears every change,
   * then once more with done when it closes. Faults are logged, not thrown.
   */
  pickColor(title, rgb, onPick) {
    addon.showColorPanel(rgb, title, (picked, done) => guard(`Colour for ${title}`, () => onPick(picked, done)));
  }

  quit() {
    this.app.quit();
  }
}