import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
}));

import { DeskLights } from '../src/main/desklights';
import { MusicVisualiser } from '../src/main/music';
import { fakeDesk, fakeSettings, fakeAddon, noDaylight, macState, WHITE } from './fakes';

describe('MusicVisualiser', () => {
  let devices, addon, lights, music;
  const topRow = () => devices[0].calls.filter(([method, frame]) => method === 'setCustomFrame' && frame[0] === 0).at(-1)?.[1];
  const key = (frame, col) => frame.slice(3 + col * 3, 6 + col * 3);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    devices = fakeDesk();
    addon = {
      ...fakeAddon(),
      playing: true,
      level: 0.1,
      followMusicAudio: vi.fn(() => ({ playing: addon.playing, listening: addon.playing })),
      stopMusicAudio: vi.fn(),
      readMusicLevel: () => addon.level,
      // Loud bass, nothing in the treble.
      readMusicSpectrum: bands => Float32Array.from({ length: bands }, (_, band) => (band < 3 ? -20 : -120)),
    };
    lights = new DeskLights(fakeSettings(), addon, () => devices, noDaylight);
    lights.update(macState());
    vi.advanceTimersByTime(2000);
    music = new MusicVisualiser(lights, addon);
    music.start();
  });

  afterEach(() => {
    music.stop();
    lights.setAuto(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dims the top row and lights the bands that sound', () => {
    vi.advanceTimersByTime(3000);
    const frame = topRow();
    expect(key(frame, 0)).toEqual([113, 4, 255]); // bass, full, near the violet end
    expect(key(frame, 17).every(channel => channel < 60)).toBe(true); // dimmed, silent
    expect(key(lastRow(), 17)).toEqual(WHITE);
  });

  it('hands the row back once it has been quiet a while, and stops listening when nothing plays', () => {
    vi.advanceTimersByTime(3000);
    addon.level = 0;
    vi.advanceTimersByTime(6000);
    expect(lights.layers.has('music', Date.now())).toBe(false);
    addon.playing = false;
    vi.advanceTimersByTime(3000);
    expect(lights.layers.has('music', Date.now())).toBe(false);
  });

  it('gives way to a call, and stops listening', () => {
    vi.advanceTimersByTime(3000);
    lights.update(macState({ mic: true }));
    vi.advanceTimersByTime(3000);
    expect(lights.layers.has('music', Date.now())).toBe(false);
    expect(addon.stopMusicAudio).toHaveBeenCalled();
  });

  const lastRow = () => devices[0].calls.filter(([method, frame]) => method === 'setCustomFrame' && frame[0] === 5).at(-1)?.[1];
});
