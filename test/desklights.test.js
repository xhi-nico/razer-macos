import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
}));

import { DeskLights } from '../src/main/desklights';
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
    const matBefore = mat().calls.length;
    lights.pulse();
    vi.advanceTimersByTime(10 * 1000);
    expect(mouse().attempts - before).toBeLessThanOrEqual(4);
    expect(mat().calls.length - matBefore).toBeGreaterThan(30);
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
    lights.pulse();
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

  it('rolls the attention wave and then hands back', () => {
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    lights.pulse();
    vi.advanceTimersByTime(900); // the band is passing the mouse
    expect(mouse().last('setModeStaticNoStore')[0]).not.toEqual(WHITE);
    vi.advanceTimersByTime(10 * 1000);
    expect(mouse().last('setModeStaticNoStore')).toEqual([WHITE]);
  });
});
