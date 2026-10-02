import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/driver', () => ({ default: {} }));
vi.mock('electron', () => ({}));

import { RazerDeviceManager } from '../src/main/razerdevicemanager';
import { getDeviceMenuFor } from '../src/main/menu/menubuilderdevice';

const MOUSE = 0x00c7; // Pro Click V2 Vertical Edition
const KEYBOARD = 0x026b; // Huntsman V2 TKL

describe('Device menu', () => {
  let manager, addon, application, picked;
  const find = (items, label) => items.find(item => item.label?.startsWith(label));

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    addon = new Proxy({
      getAllDevices: () => [{ productId: MOUSE, internalDeviceId: 1 }, { productId: KEYBOARD, internalDeviceId: 2 }],
      mouseGetDpi: () => 1800,
      mouseGetPollRate: () => 1000,
      mouseGetBrightness: () => 60,
      mouseSetDpi: vi.fn(),
      mouseSetPollRate: vi.fn(),
    }, { get: (target, name) => (name in target ? target[name] : () => 0) });
    manager = new RazerDeviceManager({ getSettingsFor: async device => device.getDefaultSettings(), saveSettingsFor: vi.fn() });
    manager.addon = addon;
    await manager.refreshRazerDevices(true);
    picked = null;
    application = {
      razerApplication: { deviceManager: manager, lights: { isFailing: () => false } },
      refreshTray: vi.fn(),
      setAutoLights: vi.fn(),
      pickColor: (title, rgb, onPick) => {
        picked = { title, rgb, onPick };
      },
    };
  });

  const menuOf = productId => getDeviceMenuFor(application, manager.activeRazerDevices.find(device => device.productId === productId));

  it('offers DPI presets within the mouse range, with the current one ticked, and leaves Auto lights on', () => {
    const dpi = find(menuOf(MOUSE), 'DPI');
    expect(dpi.label).toBe('DPI: 1800');
    expect(dpi.submenu.map(item => item.label)).toEqual(['400', '800', '1200', '1600', '1800', '2400', '3200', '4800', '6400']);
    expect(dpi.submenu.find(item => item.checked).label).toBe('1800');
    dpi.submenu.find(item => item.label === '3200').click();
    expect(addon.mouseSetDpi).toHaveBeenCalledWith(1, 3200);
    expect(application.setAutoLights).not.toHaveBeenCalled();
  });

  it('offers the polling rates', () => {
    const rate = find(menuOf(MOUSE), 'Polling rate');
    expect(rate.submenu.map(item => item.label)).toEqual(['125 Hz', '250 Hz', '500 Hz', '1000 Hz']);
    rate.submenu[1].click();
    expect(addon.mouseSetPollRate).toHaveBeenCalledWith(1, 250);
  });

  it('shows a mouse with one brightness zone as one Brightness item', () => {
    const brightness = find(menuOf(MOUSE), 'Brightness');
    expect(brightness.label).toBe('Brightness: 60%');
    expect(brightness.submenu.map(item => item.label)).toEqual(['0%', '25%', '50%', '60%', '75%', '100%']);
  });

  it('picks the custom colours in the colour panel and saves them when it closes', () => {
    const menu = menuOf(KEYBOARD);
    expect(find(menu, 'Second custom color…')).toBeDefined();
    find(menu, 'Custom color…').click();
    expect(picked.rgb).toEqual([255, 255, 0]);
    picked.onPick([10, 20, 30], false);
    const keyboard = manager.activeRazerDevices.find(device => device.productId === KEYBOARD);
    expect(keyboard.settings.customColor1.rgb).toEqual({ r: 255, g: 255, b: 0 });
    picked.onPick([10, 20, 30], true);
    expect(keyboard.settings.customColor1).toEqual({ hex: '#0a141e', rgb: { r: 10, g: 20, b: 30 } });
    expect(application.refreshTray).toHaveBeenCalled();
  });
});
