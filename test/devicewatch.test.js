import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { DeviceWatch } from '../src/main/devicewatch';

const NOT_READY = 'e00002ed';

describe('DeviceWatch', () => {
  let signals, manager, rescan, watch, ready;

  // A rescan opens the device when it is ready, like the native scan; until then it reports the error.
  const build = (openError = null) => {
    signals = new EventEmitter();
    manager = { openError };
    rescan = vi.fn(async () => {
      manager.openError = ready ? null : NOT_READY;
    });
    watch = new DeviceWatch(signals, manager, rescan);
    watch.start();
  };

  const plug = () => signals.emit('devices');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ready = false;
    build();
  });

  afterEach(() => {
    watch.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads the devices once USB has settled after a plug, and leaves it there', async () => {
    ready = true;
    plug();
    await vi.advanceTimersByTimeAsync(799);
    expect(rescan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rescan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(rescan).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('tries again, backing off, until the scan opens everything', async () => {
    plug();
    await vi.advanceTimersByTimeAsync(800);
    expect(rescan).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}), trying again in 1s`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(rescan).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}), trying again in 2s`);
    await vi.advanceTimersByTimeAsync(2000);
    expect(rescan).toHaveBeenCalledTimes(3);
    ready = true;
    await vi.advanceTimersByTimeAsync(4000);
    expect(rescan).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(rescan).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('gives up after a couple of minutes, until the devices change', async () => {
    plug();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(rescan).toHaveBeenCalledTimes(10);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}); giving up until the devices change`);
    plug();
    await vi.advanceTimersByTimeAsync(800);
    expect(rescan).toHaveBeenCalledTimes(11);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}), trying again in 1s`);
  });

  it('starts the count over when the devices change mid-retry', async () => {
    plug();
    await vi.advanceTimersByTimeAsync(800 + 1000 + 2000);
    expect(rescan).toHaveBeenCalledTimes(3);
    plug();
    await vi.advanceTimersByTimeAsync(800);
    expect(rescan).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}), trying again in 1s`);
  });

  it('checks the first scan at start, for an app launched while a device was starting up', async () => {
    build(NOT_READY);
    expect(console.warn).toHaveBeenLastCalledWith(`Devices: an attached Razer device could not be opened (${NOT_READY}), trying again in 1s`);
    ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(rescan).toHaveBeenCalledTimes(1);
    expect(manager.openError).toBeNull();
  });

  it('carries on past a rescan that fails', async () => {
    rescan.mockRejectedValueOnce(new Error('USB request failed: e00002ed'));
    manager.openError = NOT_READY;
    plug();
    await vi.advanceTimersByTimeAsync(800);
    expect(console.warn).toHaveBeenCalledWith('Devices: rescan failed:', 'USB request failed: e00002ed');
    ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(rescan).toHaveBeenCalledTimes(2);
    expect(manager.openError).toBeNull();
  });
});
