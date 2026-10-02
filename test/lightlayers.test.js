import { describe, it, expect } from 'vitest';
import { LightLayers, parseLayer } from '../src/main/lightlayers';

describe('LightLayers', () => {
  it('fills in the defaults', () => {
    expect(parseLayer({ color: '#FF8800' })).toEqual({
      id: null, region: 'desk', effect: 'solid', colors: [[255, 136, 0]], levels: null, dim: 0,
      durationMs: 10000, periodMs: 1000, priority: 10, group: null,
    });
    expect(parseLayer({ color: [1, 2, 3], effect: 'pulse' }).periodMs).toBe(2000);
  });

  it('turns away a bad request with a reason', () => {
    expect(() => parseLayer({})).toThrow(/color/);
    expect(() => parseLayer({ color: '#fff' })).toThrow(/color/);
    expect(() => parseLayer({ color: [256, 0, 0] })).toThrow(/color/);
    expect(() => parseLayer({ color: '#ffffff', region: 'ceiling' })).toThrow(/region must be one of desk/);
    expect(() => parseLayer({ color: '#ffffff', effect: 'strobe' })).toThrow(/effect/);
    expect(() => parseLayer({ color: '#ffffff', duration: -1 })).toThrow(/duration/);
    expect(() => parseLayer({ color: '#ffffff', duration: 'long' })).toThrow(/duration/);
    expect(() => parseLayer({ color: '#ffffff', id: '' })).toThrow(/id/);
    expect(() => parseLayer([1])).toThrow(/object/);
  });

  it('caps how many layers run at once', () => {
    const layers = new LightLayers();
    for (let i = 0; i < 64; i++) {
      layers.show({ color: '#ffffff' }, 0);
    }
    expect(() => layers.show({ color: '#ffffff' }, 0)).toThrow(expect.objectContaining({ status: 429 }));
    // Updating one that exists still works.
    expect(layers.show({ id: 'layer-1', color: '#000000' }, 0).id).toBe('layer-1');
  });

  it('eases in, holds, and eases out at the end', () => {
    const layers = new LightLayers();
    layers.show({ color: [200, 0, 0], region: 'mouse', duration: 2 }, 0);
    const at = now => layers.painters(now, () => true)[0]?.([0, 0, 0], { desk: 0.9, mouse: null })[0];
    expect(layers.nextChange(0)).toBe(1600);
    expect(at(0)).toBe(0);
    expect(at(100)).toBeCloseTo(100);
    expect(at(1000)).toBe(200);
    expect(at(1800)).toBeCloseTo(100);
    expect(at(2000)).toBeUndefined();
  });

  it('leaves spots outside its region alone', () => {
    const layers = new LightLayers();
    layers.show({ color: [200, 0, 0], region: 'toprow' }, 0);
    const [paint] = layers.painters(1000, () => true);
    expect(paint([1, 2, 3], { desk: 0.2, keyboard: 0.1 })).toEqual([1, 2, 3]);
    expect(paint([1, 2, 3], { desk: 0.2, keyboard: 0.1, toprow: 0.1 })).toEqual([200, 0, 0]);
  });

  it('rolls a wave across its region and back', () => {
    const layers = new LightLayers();
    layers.show({ color: [255, 255, 255], effect: 'wave', period: 2, duration: 4 }, 0);
    const level = (now, x) => layers.painters(now, () => true)[0]([0, 0, 0], { desk: x })[0];
    expect(level(500, 0.5)).toBeGreaterThan(250); // halfway there at a quarter period
    expect(level(500, 0)).toBe(0);
    expect(level(750, 1)).toBeGreaterThan(level(750, 0.5)); // reaching the far end
  });

  it('blinks hard, on for the middle half of each period', () => {
    const layers = new LightLayers();
    layers.show({ color: [255, 255, 255], effect: 'blink', period: 1, duration: 4 }, 0);
    const level = now => layers.painters(now, () => true)[0]([0, 0, 0], { desk: null })[0];
    expect([1240, 1260, 1500, 1740, 1760].map(level)).toEqual([0, 255, 255, 255, 0]);
    expect(layers.pace(1500)).toBe('fast');
  });
});

describe('LightLayers updates', () => {
  const shown = now => layers => layers.painters(now, () => true)[0]([0, 0, 0], { desk: 0.5 }).map(Math.round);

  it('crossfades to a new colour, and keeps a steady one steady', () => {
    const layers = new LightLayers();
    layers.show({ id: 'a', color: [200, 0, 0], duration: 60 }, 0);
    layers.show({ id: 'a', color: [200, 0, 0], duration: 60 }, 1000);
    expect(layers.pace(1000)).toBeNull();
    layers.show({ id: 'a', color: [0, 0, 200], duration: 60 }, 2000);
    expect(shown(2250)(layers)).toEqual([100, 0, 100]);
    expect(shown(2500)(layers)).toEqual([0, 0, 200]);
    expect(layers.pace(2600)).toBeNull();
  });
});

describe('LightLayers bars', () => {
  it('spreads a gradient and the levels across the region, over a dimmed colour', () => {
    const layers = new LightLayers();
    layers.show({ color: ['#000000', '#ff0000'], effect: 'bars', levels: [0, 1], dim: 0.5 }, 0);
    const [paint] = layers.painters(1000, () => true);
    expect(paint([200, 200, 200], { desk: 0.1 })).toEqual([100, 100, 100]); // empty bar: just dimmed
    expect(paint([200, 200, 200], { desk: 1 })).toEqual([255, 0, 0]); // full bar at the red end
    expect(layers.status(1000)[0].color).toEqual(['#000000', '#ff0000']);
  });

  it('needs levels', () => {
    const layers = new LightLayers();
    expect(() => layers.show({ color: '#ffffff', effect: 'bars' }, 0)).toThrow(/levels/);
    expect(() => layers.show({ color: '#ffffff', effect: 'bars', levels: [2] }, 0)).toThrow(/levels/);
    expect(layers.show({ color: '#ffffff', effect: 'bars' }, 0, () => [1]).effect).toBe('bars');
  });
});
