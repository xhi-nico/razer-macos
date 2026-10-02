import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
}));

import { DeskLights, ATTENTION } from '../src/main/desklights';

import { fakeDesk, fakeSettings, fakeAddon, noDaylight, macState, RED, WHITE } from './fakes';

const START = new Date('2026-06-21T12:00:00').getTime();

describe('DeskLights', () => {
  let devices, settings, addon, lights;
  const [keyboard, mouse, mat] = [0, 1, 2].map(index => () => devices[index]);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    devices = fakeDesk();
    settings = fakeSettings();
    addon = fakeAddon();
    lights = new DeskLights(settings, addon, () => devices, noDaylight);
  });

  afterEach(() => {
    lights.setAuto(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('welcomes you from red to white, then settles without storing', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
    expect(mat().last('setModeStaticNoStore')).toEqual([WHITE]);
    expect(keyboard().last('setModeStaticNoStore')).toEqual([WHITE]);
    expect(devices.flatMap(device => device.calls).filter(([method]) => method === 'setModeStatic')).toEqual([]);
  });

  it('stores red in every device when you leave', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(2000);
    devices.forEach(device => expect(device.last('setModeStatic')).toEqual([RED]));
  });

  it('starts from the red stored in the devices', () => {
    expect(lights.storedLook).toBe('away');
    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(2000);
    // Already stored: nothing to rewrite in the settings.
    expect(settings.setKeySync).not.toHaveBeenCalled();
  });

  it('only ever stores red', () => {
    for (const state of [{}, { idle: true }, {}, { away: true }, {}, { camera: true }, { away: true }]) {
      lights.update(macState(state));
      vi.advanceTimersByTime(5000);
    }
    const stored = devices.flatMap(device => device.calls).filter(([method]) => method === 'setModeStatic');
    expect(stored.length).toBeGreaterThan(0);
    stored.forEach(([, color]) => expect(color).toEqual(RED));
  });

  it('paints nothing while a device refresh is in flight', () => {
    lights.hold();
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    expect(devices.every(device => device.calls.length === 0)).toBe(true);
    lights.release(true);
    vi.advanceTimersByTime(2000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
  });

  it('leaves the devices alone while Auto lights is off', () => {
    lights.setAuto(false);
    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(5000);
    expect(devices.every(device => device.calls.length === 0)).toBe(true);
  });

  it('keeps painting the rest of the desk when one device fails, and retries it on its own', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);

    // The attention wave animates every frame; the failing mouse is retried at
    // 1, 2 and 4 seconds rather than 30 times a second.
    mouse().fail = true;
    const before = mouse().attempts;
    const keyboardBefore = keyboard().calls.length;
    lights.attention();
    vi.advanceTimersByTime(10 * 1000);
    expect(mouse().attempts - before).toBeLessThanOrEqual(4);
    expect(keyboard().calls.length - keyboardBefore).toBeGreaterThan(30);
    expect(console.warn).toHaveBeenCalledTimes(1);

    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(2000);
    expect(mat().last('setModeStatic')).toEqual([RED]);

    mouse().fail = false;
    vi.advanceTimersByTime(30 * 1000);
    expect(mouse().last('setModeStatic')).toEqual([RED]);
    expect(console.log).toHaveBeenCalledWith('Lights: Mouse is answering again');
  });

  it('clears a device that recovers once the desk settles, and goes back to sleeping', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    mouse().fail = true;
    lights.attention();
    vi.advanceTimersByTime(9000); // past the end of the wave
    mouse().fail = false;
    vi.advanceTimersByTime(30 * 1000);
    // The settled white matches what the mouse showed before the wave, but it
    // must still be rewritten: the frames in between never landed.
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
    expect(lights.failing.size).toBe(0);
    expect(lights.timer).toBeNull();
  });

  it('fills the top row amber in the minute before a meeting', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.update(macState({ meetings: [Date.now() + 30 * 1000] }));
    vi.advanceTimersByTime(1000);
    const topRow = keyboard().calls.filter(([method, frame]) => method === 'setCustomFrame' && frame[0] === 0).at(-1)[1];
    const firstKey = topRow.slice(3, 6);
    const lastKey = topRow.slice(-3);
    expect(firstKey).toEqual([255, 140, 0]); // filled
    expect(lastKey).toEqual(WHITE); // not yet
  });

  it('rolls the attention wave over the keyboard, flashes the mouse as it turns, then hands back', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.attention();
    vi.advanceTimersByTime(600); // the band is crossing the keyboard; the mouse waits
    expect(keyboard().last('setCustomFrame')).toBeDefined();
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
    vi.advanceTimersByTime(700); // the band turns past the keyboard's right end
    const [[r, g, b]] = mouse().last('setModeStaticNoStore');
    expect([r, g, b]).toEqual([255, expect.closeTo(90, -1), expect.closeTo(20, -1)]);
    vi.advanceTimersByTime(10 * 1000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
  });

  it('stops the attention wave early', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.attention();
    vi.advanceTimersByTime(1000);
    lights.calmDown();
    vi.advanceTimersByTime(1000);
    expect(lights.has(ATTENTION.id)).toBe(false);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
  });

  const topRowOf = device => device.calls.filter(([method, frame]) => method === 'setCustomFrame' && frame[0] === 0).at(-1)?.[1];
  const keyAt = (frame, col) => frame.slice(3 + col * 3, 6 + col * 3);
  const lastRowOf = device => device.calls.filter(([method, frame]) => method === 'setCustomFrame' && frame[0] === 5).at(-1)?.[1];

  it('shows a layer on its region only, then fades it out when it ends', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.show({ region: 'toprow', color: '#00ff00', duration: 3 });
    vi.advanceTimersByTime(1000);
    expect(keyAt(topRowOf(keyboard()), 0)).toEqual([0, 255, 0]);
    expect(keyAt(lastRowOf(keyboard()), 0)).toEqual(WHITE);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
    vi.advanceTimersByTime(3000);
    expect(keyboard().last('setModeStaticNoStore')).toEqual([WHITE]);
    expect(lights.layers.status(Date.now())).toEqual([]);
    expect(lights.timer).toBeNull();
  });

  it('splits a region between the layers of one group, oldest on the left', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.show({ id: 'a', region: 'toprow', color: '#ff0000', group: 'sessions', duration: 60 });
    lights.show({ id: 'b', region: 'toprow', color: '#0000ff', group: 'sessions', duration: 60 });
    vi.advanceTimersByTime(1000);
    const frame = topRowOf(keyboard());
    expect(keyAt(frame, 0)).toEqual(RED);
    expect(keyAt(frame, 8)).toEqual(RED);
    expect(keyAt(frame, 9)).toEqual([0, 0, 255]);
    expect(keyAt(frame, 17)).toEqual([0, 0, 255]);
    // An update keeps its place.
    lights.show({ id: 'a', region: 'toprow', color: '#00ff00', group: 'sessions', duration: 60 });
    vi.advanceTimersByTime(1000);
    expect(keyAt(topRowOf(keyboard()), 0)).toEqual([0, 255, 0]);
  });

  it('cancels a layer early by its id', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.show({ id: 'busy', region: 'mouse', color: '#00ff00', duration: 600 });
    vi.advanceTimersByTime(1000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([[0, 255, 0]]);
    expect(lights.cancel('busy')).toBe(true);
    expect(lights.cancel('nothing')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
  });

  it('paints a higher priority over a lower one, and the call lights between them', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.update(macState({ camera: true }));
    lights.show({ region: 'mouse', color: '#00ff00', duration: 60, priority: 1 });
    vi.advanceTimersByTime(3000);
    const [underCall] = mouse().last('setModeStaticNoStore');
    expect(underCall).not.toEqual([0, 255, 0]); // the call pulse shows over it
    lights.show({ region: 'mouse', color: '#0000ff', duration: 60, priority: 90 });
    vi.advanceTimersByTime(1000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([[0, 0, 255]]);
  });

  it('hides layers while the Mac is away and never stores them', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.show({ region: 'desk', color: '#00ff00', duration: 60 });
    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(2000);
    devices.forEach(device => expect(device.last('setModeStatic')).toEqual([RED]));
    expect(lights.status().layersShown).toBe(false);
    lights.update(macState());
    vi.advanceTimersByTime(3000);
    expect(mat().last('setModeStaticNoStore')).toEqual([[0, 255, 0]]);
  });

  it('reports a device that stops answering once, and again once it recovers', () => {
    const health = vi.fn();
    lights.onHealthChange = health;
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    mouse().fail = true;
    lights.attention();
    vi.advanceTimersByTime(5000);
    expect(health).toHaveBeenCalledTimes(1);
    expect(lights.isFailing(mouse())).toBe(true);
    expect(lights.isFailing(mat())).toBe(false);
    mouse().fail = false;
    vi.advanceTimersByTime(30 * 1000);
    expect(health).toHaveBeenCalledTimes(2);
    expect(lights.isFailing(mouse())).toBe(false);
  });

  it('holds the plain look, with nothing over it, until let go or an hour passes', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.show({ region: 'mouse', color: '#00ff00', duration: 7200 });
    lights.update(macState({ camera: true, idle: true }));
    vi.advanceTimersByTime(2000);
    expect(mouse().last('setModeStaticNoStore')).not.toEqual([WHITE]);

    lights.setPlain(true);
    vi.advanceTimersByTime(2000);
    expect(lights.look.name).toBe('working'); // no idle breath either
    devices.forEach(device => expect(device.last('setModeStaticNoStore')).toEqual([WHITE]));
    expect(lights.timer).not.toBeNull(); // asleep until the hour is up

    lights.update(macState({ away: true }));
    vi.advanceTimersByTime(2000);
    expect(mouse().last('setModeStatic')).toEqual([RED]);
    lights.update(macState({ camera: true }));

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(lights.plain).toBe(false);
    expect(mouse().last('setModeStaticNoStore')).not.toEqual([WHITE]);
  });

  it('holds the plain look even with Auto lights off', () => {
    lights.update(macState());
    lights.setAuto(false);
    lights.setPlain(true);
    vi.advanceTimersByTime(2000);
    expect(mat().last('setModeStaticNoStore')).toEqual([WHITE]);
    lights.setPlain(false);
    const calls = mat().calls.length;
    vi.advanceTimersByTime(5000);
    expect(mat().calls.length).toBe(calls);
  });
});
