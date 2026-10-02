import { vi } from 'vitest';
import { FeatureIdentifier } from '../src/main/feature/featureidentifier';
import { RazerDeviceType } from '../src/main/device/razerdevicetype';

export const RED = [255, 0, 0];
export const WHITE = [255, 255, 255];

// A device as DeskLights sees it, recording what it was sent. `fail` makes every write throw.
export function fakeDevice(name, mainType, internalId, grid = null) {
  const device = {
    name,
    mainType,
    internalId,
    fail: false,
    attempts: 0,
    calls: [],
    hasFeature: id => id === FeatureIdentifier.STATIC || (grid != null && id === FeatureIdentifier.RIPPLE),
    getFeature: id => (grid != null && id === FeatureIdentifier.RIPPLE ? { configuration: grid } : undefined),
  };
  const record = method => (...args) => {
    device.attempts++;
    if (device.fail) {
      throw new Error('USB request failed: e00002ed');
    }
    device.calls.push([method, ...args.map(arg => (Array.isArray(arg) ? [...arg] : arg))]);
  };
  ['setModeStatic', 'setModeStaticNoStore', 'setCustomFrame', 'setModeCustom'].forEach(method => {
    device[method] = record(method);
  });
  device.last = method => device.calls.filter(([name]) => name === method).at(-1)?.slice(1);
  return device;
}

export const fakeDesk = () => [
  fakeDevice('Keyboard', RazerDeviceType.KEYBOARD, 1, { rows: 6, cols: 18 }),
  fakeDevice('Mouse', RazerDeviceType.MOUSE, 2),
  fakeDevice('Mat', RazerDeviceType.MOUSEMAT, 3),
];

export function fakeSettings(saved = {}) {
  const store = { desklights: saved };
  return {
    store,
    getKeySync: key => store[key] ?? {},
    setKeySync: vi.fn((key, value) => {
      store[key] = value;
    }),
  };
}

export const fakeAddon = () => ({
  setSkipResponses: vi.fn(),
  followCallAudio: () => ({ mine: 'none', theirs: 'none' }),
  readCallAudio: () => ({ mine: 0, theirs: 0 }),
  stopCallAudio: vi.fn(),
});

export const noDaylight = { warmth: () => 0, nextChange: () => Infinity };

export const macState = (overrides = {}) => ({ away: false, camera: false, idle: false, mic: false, meetings: [], ...overrides });
