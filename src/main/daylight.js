import fs from 'fs';

// How long the shift between daylight white and evening white takes, starting at sunset and at sunrise.
const RAMP_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Approximate coordinates for this Mac, read from the time zone's entry in the
 * system's zone.tab (Toronto for America/Toronto). City-level is close enough
 * for sunset, and it needs no location permission. Null when not found.
 */
function coordinatesFromTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const line = fs.readFileSync('/usr/share/zoneinfo/zone.tab', 'utf8')
      .split('\n')
      .find(entry => entry.split('\t')[2] === timeZone);
    // ±DDMM±DDDMM or ±DDMMSS±DDDMMSS
    const [, latitude, longitude] = line.split('\t')[1].match(/^([+-]\d+)([+-]\d+)$/);
    const degrees = (value, degreeDigits) => {
      const sign = value[0] === '-' ? -1 : 1;
      const digits = value.slice(1);
      const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2));
      const seconds = Number(digits.slice(degreeDigits + 2) || 0);
      return sign * (Number(digits.slice(0, degreeDigits)) + minutes / 60 + seconds / 3600);
    };
    return { latitude: degrees(latitude, 2), longitude: degrees(longitude, 3) };
  } catch {
    return null;
  }
}

/**
 * Sunrise and sunset (ms) on the local day containing `time`. The standard
 * sunrise equation, as in suncalc; NaN on days the sun never rises or sets.
 */
function sunTimes(time, { latitude, longitude }) {
  const rad = Math.PI / 180;
  const J2000 = 2451545;
  const toDays = ms => ms / DAY_MS + 2440587.5 - J2000;
  const toMs = days => (days + J2000 - 2440587.5) * DAY_MS;

  const noon = new Date(time);
  noon.setHours(12, 0, 0, 0);
  const lw = -longitude * rad;
  const cycle = Math.round(toDays(noon.getTime()) - 0.0009 - lw / (2 * Math.PI));
  const approxTransit = 0.0009 + lw / (2 * Math.PI) + cycle;
  const anomaly = rad * (357.5291 + 0.98560028 * approxTransit);
  const center = rad * (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly));
  const eclipticLongitude = anomaly + center + rad * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(rad * 23.4397));
  const correction = 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * eclipticLongitude);
  const transit = approxTransit + correction;
  const hourAngle = Math.acos((Math.sin(rad * -0.833) - Math.sin(rad * latitude) * Math.sin(declination))
    / (Math.cos(rad * latitude) * Math.cos(declination)));
  const set = 0.0009 + (hourAngle + lw) / (2 * Math.PI) + cycle + correction;
  return { sunrise: toMs(transit - (set - transit)), sunset: toMs(set) };
}

/**
 * How far into evening white the desk should be: 0 by day, 1 by night, easing
 * across the half hour after sunset and the half hour after sunrise.
 */
export class Daylight {
  constructor() {
    this.coordinates = coordinatesFromTimeZone();
  }

  warmth(now) {
    if (this.coordinates == null) {
      return 0;
    }
    const { sunrise, sunset } = sunTimes(now, this.coordinates);
    if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)) {
      return 0;
    }
    if (now < sunrise) {
      return 1;
    }
    if (now < sunrise + RAMP_MS) {
      return 1 - (now - sunrise) / RAMP_MS;
    }
    if (now < sunset) {
      return 0;
    }
    return Math.min(1, (now - sunset) / RAMP_MS);
  }

  // When warmth next starts changing, or `now` while it is changing.
  nextChange(now) {
    if (this.coordinates == null) {
      return Infinity;
    }
    const today = sunTimes(now, this.coordinates);
    const tomorrow = sunTimes(now + DAY_MS, this.coordinates);
    const starts = [today.sunrise, today.sunset, tomorrow.sunrise].filter(Number.isFinite);
    if (starts.some(start => now >= start && now < start + RAMP_MS)) {
      return now;
    }
    return Math.min(...starts.filter(start => start > now));
  }
}
