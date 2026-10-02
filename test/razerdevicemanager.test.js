import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/driver', () => ({ default: {} }));
vi.mock('electron', () => ({}));

import { RazerDeviceManager } from '../src/main/razerdevicemanager';

const KEYBOARD = 0x026b; // Huntsman V2 TKL
const MOUSE = 0x00c7; // Pro Click V2 Vertical Edition
const MAT = 0x0c02; // Goliathus Extended Chroma

// Like the native addon: each scan hands out fresh IDs, and anything unknown answers 0.
function fakeAddon(products) {
  let nextId = 1;
  const addon = {
    events: [],
    getAllDevices: vi.fn(() => {
      addon.events.push('scan');
      return products.map(productId => ({ productId, internalDeviceId: nextId++ }));
    }),
    closeAllDevices: vi.fn(),
  };
  return new Proxy(addon, { get: (target, name) => (name in target ? target[name] : () => 0) });
}

const settings = {
  getSettingsFor: async device => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return device.getDefaultSettings();
  },
};

describe('RazerDeviceManager', () => {
  let manager;
  const withAddon = addon => {
    manager = new RazerDeviceManager(settings);
    manager.addon = addon;
    return addon;
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('builds the desk in order: keyboard, mouse, mat', async () => {
    withAddon(fakeAddon([MAT, MOUSE, KEYBOARD]));
    await manager.refreshRazerDevices(true);
    expect(manager.activeRazerDevices.map(device => device.productId)).toEqual([KEYBOARD, MOUSE, MAT]);
  });

  it('runs one rebuild at a time, so two never fight over the devices', async () => {
    const addon = withAddon(fakeAddon([KEYBOARD, MOUSE]));
    const first = manager.refreshRazerDevices(true).then(() => addon.events.push('first done'));
    const second = manager.refreshRazerDevices(true).then(() => addon.events.push('second done'));
    await Promise.all([first, second]);
    expect(addon.events).toEqual(['scan', 'first done', 'scan', 'second done']);
  });

  it('skips a rebuild asked for too soon, unless forced', async () => {
    const addon = withAddon(fakeAddon([KEYBOARD]));
    await manager.refreshRazerDevices(true);
    expect(await manager.refreshRazerDevices()).toBe(false);
    expect(await manager.refreshRazerDevices(true)).toBe(true);
    expect(addon.getAllDevices).toHaveBeenCalledTimes(2);
  });

  it('keeps a device whose state cannot be read', async () => {
    const addon = fakeAddon([KEYBOARD]);
    withAddon(new Proxy(addon, {
      get: (target, name) => (name === 'KbdGetBrightness' ? () => { throw new Error('USB request failed'); } : target[name]),
    }));
    await manager.refreshRazerDevices(true);
    expect(manager.activeRazerDevices).toHaveLength(1);
    expect(manager.activeRazerDevices[0].settings).toBeDefined();
  });

  it('leaves out a product it has no device file for', async () => {
    withAddon(fakeAddon([KEYBOARD, 0xffff]));
    await manager.refreshRazerDevices(true);
    expect(manager.activeRazerDevices.map(device => device.productId)).toEqual([KEYBOARD]);
  });

  it('finds the live device for a copy from before a rebuild', async () => {
    withAddon(fakeAddon([KEYBOARD, MOUSE]));
    await manager.refreshRazerDevices(true);
    const stale = manager.activeRazerDevices[1].serialize();
    await manager.refreshRazerDevices(true);
    const live = manager.resolve(stale);
    expect(live).toBe(manager.activeRazerDevices[1]);
    expect(live.internalId).not.toBe(stale.internalId);
  });

  it('carries on past a device that fails', async () => {
    withAddon(fakeAddon([KEYBOARD, MOUSE, MAT]));
    await manager.refreshRazerDevices(true);
    const reached = [];
    manager.forEachDevice(device => {
      reached.push(device.productId);
      if (device.productId === MOUSE) {
        throw new Error('USB request failed');
      }
    });
    expect(reached).toEqual([KEYBOARD, MOUSE, MAT]);
  });
});
