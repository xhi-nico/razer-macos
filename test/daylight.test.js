import { describe, it, expect, beforeAll } from 'vitest';

describe('Daylight', () => {
  let daylight;
  beforeAll(async () => {
    process.env.TZ = 'America/Toronto';
    const { Daylight } = await import('../src/main/daylight');
    daylight = new Daylight();
  });

  // Toronto's sunset on 21 June is about 21:03 local time.
  const at = time => new Date(`2026-06-21T${time}`).getTime();

  it("finds the Mac's city from its time zone", () => {
    expect(daylight.coordinates.latitude).toBeCloseTo(43.65, 1);
    expect(daylight.coordinates.longitude).toBeCloseTo(-79.38, 1);
  });

  it('is daylight white by day and evening white by night', () => {
    expect(daylight.warmth(at('13:00:00'))).toBe(0);
    expect(daylight.warmth(at('23:30:00'))).toBe(1);
    expect(daylight.warmth(at('03:00:00'))).toBe(1);
  });

  it('shifts over the half hour after sunset', () => {
    const warmth = daylight.warmth(at('21:18:00'));
    expect(warmth).toBeGreaterThan(0.2);
    expect(warmth).toBeLessThan(0.8);
  });

  it('wakes the lights at the next sunset', () => {
    const next = new Date(daylight.nextChange(at('13:00:00')));
    expect(next.getHours()).toBe(21);
  });
});
