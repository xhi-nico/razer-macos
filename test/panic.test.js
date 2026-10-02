import { describe, it, expect, vi } from 'vitest';
import { TapCounter, PanicButton } from '../src/main/panic';

const DOWN = 1;
const UP = 2;
const OTHER = 3;

describe('TapCounter', () => {
  const tap = (counter, at) => {
    counter.feed(DOWN, at);
    return counter.feed(UP, at + 50);
  };

  it('fires on the fifth quick tap, then starts over', () => {
    const counter = new TapCounter();
    const results = [0, 300, 600, 900, 1200].map(at => tap(counter, at));
    expect(results).toEqual([false, false, false, false, true]);
    expect(tap(counter, 1500)).toBe(false);
  });

  it('only counts taps within two seconds', () => {
    const counter = new TapCounter();
    [0, 600, 1200, 1800].forEach(at => tap(counter, at));
    expect(tap(counter, 2400)).toBe(false); // the first has fallen out of the window
    expect(tap(counter, 2600)).toBe(true);
  });

  it('starts over when another key is pressed, even mid-tap', () => {
    const counter = new TapCounter();
    [0, 200, 400].forEach(at => tap(counter, at));
    counter.feed(DOWN, 600);
    counter.feed(OTHER, 620); // Control-C
    counter.feed(UP, 650);
    expect([800, 1000, 1200, 1400].map(at => tap(counter, at))).toEqual([false, false, false, false]);
    expect(tap(counter, 1600)).toBe(true);
  });
});

describe('PanicButton', () => {
  const addon = access => ({
    inputMonitoringAccess: vi.fn(() => access),
    requestInputMonitoring: vi.fn(),
    startKeyWatch: vi.fn(() => true),
    stopKeyWatch: vi.fn(),
  });

  it('asks once, and waits for Input Monitoring before watching', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fake = addon('unknown');
    const panic = new PanicButton(fake, () => {});
    panic.start();
    expect(fake.requestInputMonitoring).toHaveBeenCalledTimes(1);
    expect(panic.blocked).toBe(true);
    expect(fake.startKeyWatch).not.toHaveBeenCalled();

    fake.inputMonitoringAccess.mockReturnValue('granted');
    vi.advanceTimersByTime(30 * 1000);
    expect(panic.blocked).toBe(false);
    expect(fake.startKeyWatch).toHaveBeenCalledTimes(1);
    panic.stop();
    expect(fake.stopKeyWatch).toHaveBeenCalled();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
