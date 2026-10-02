import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatteryWatch } from '../src/main/battery';
import { FeatureIdentifier } from '../src/main/feature/featureidentifier';
import { RazerDeviceType } from '../src/main/device/razerdevicetype';

describe('BatteryWatch', () => {
  let mouse, lights, watch;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mouse = {
      name: 'Mouse',
      productId: 0xc8,
      mainType: RazerDeviceType.MOUSE,
      hasFeature: id => id === FeatureIdentifier.BATTERY,
      reading: [80, false],
      refresh() {
        [this.batteryLevel, this.chargingStatus] = this.reading;
      },
    };
    lights = { show: vi.fn(), cancel: vi.fn() };
    watch = new BatteryWatch(lights, () => [mouse]);
  });

  it('pulses the mouse amber while low and not charging', () => {
    watch.check();
    expect(lights.show).not.toHaveBeenCalled();
    mouse.reading = [12, false];
    watch.check();
    expect(lights.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'battery:200', region: 'mouse', effect: 'pulse', color: [255, 140, 0] }));
    mouse.reading = [12, true];
    watch.check();
    expect(lights.cancel).toHaveBeenCalledWith('battery:200');
  });

  it('keeps showing low while a sleeping mouse cannot say', () => {
    mouse.reading = [10, false];
    watch.check();
    mouse.reading = [-1, false];
    watch.check();
    expect(lights.show).toHaveBeenCalledTimes(2);
    expect(lights.cancel).not.toHaveBeenCalled();
  });

  it('skips a mouse that fails to answer', () => {
    mouse.refresh = () => {
      throw new Error('USB request failed: e00002ed');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => watch.check()).not.toThrow();
  });
});
