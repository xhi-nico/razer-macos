// Layers shown over Auto lights for a while: "this colour, this effect, on this
// region, for this long". The local lights API (lightsapi.js) creates them; the
// attention wave, Claude Code's session states, a low battery and the music
// visualiser are layers too.

export const REGIONS = ['desk', 'keyboard', 'toprow', 'mouse', 'mat'];
export const EFFECTS = ['solid', 'pulse', 'wave', 'bars'];

// The built-in top row (meeting countdown, call lights) paints at this
// priority: lower layers show under it, this or higher over it.
export const CALL_PRIORITY = 50;

const DEFAULT_PRIORITY = 10;
const DEFAULT_SECONDS = 10;
const MAX_SECONDS = 12 * 60 * 60;
const MAX_LAYERS = 64;
const MAX_ID_LENGTH = 64;
const MAX_COLORS = 8;
const MAX_LEVELS = 64;
const BLACK = [0, 0, 0];
// A pulse breathes once per period; a wave rolls across its region and back once per period.
const DEFAULT_PERIOD = { pulse: 2, wave: 2.6 };
const WAVE_WIDTH = 0.3;
// Layers ease in and out rather than cutting.
const FADE_IN_MS = 200;
const FADE_OUT_MS = 400;
// An update that changes a layer's colour or effect crossfades over this long.
const CHANGE_MS = 500;

// What a layer looks like, without where or for how long: kept to crossfade from.
const looks = ({ colors, effect, periodMs, animatedFrom, dim, levels, source }) => ({ colors, effect, periodMs, animatedFrom, dim, levels, source });

export class LayerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clamp01 = value => Math.min(1, Math.max(0, value));
const easeInOut = t => 0.5 - Math.cos(Math.PI * t) / 2;
const mix = (from, to, amount) => from.map((channel, i) => channel + (to[i] - channel) * amount);

function parseColor(color) {
  if (Array.isArray(color) && color.length === 3 && color.every(c => Number.isInteger(c) && c >= 0 && c <= 255)) {
    return color;
  }
  const hex = typeof color === 'string' && color.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
  }
  throw new LayerError('color must be "#rrggbb" or [r, g, b], or a list of up to 8 of them');
}

// One colour, or a list of them spread evenly across the region as a gradient.
function parseColors(color) {
  const list = Array.isArray(color) && color.length > 0 && color.every(entry => typeof entry === 'string' || Array.isArray(entry));
  if (list && color.length > MAX_COLORS) {
    throw new LayerError('color must be "#rrggbb" or [r, g, b], or a list of up to 8 of them');
  }
  return list ? color.map(parseColor) : [parseColor(color)];
}

function colorAt(colors, at) {
  if (colors.length === 1) {
    return colors[0];
  }
  const scaled = clamp01(at) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  return mix(colors[index], colors[index + 1], scaled - index);
}

const hex = rgb => `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

function parseLevels(levels) {
  if (levels == null) {
    return null;
  }
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > MAX_LEVELS || !levels.every(level => typeof level === 'number' && level >= 0 && level <= 1)) {
    throw new LayerError(`levels must be a list of 1 to ${MAX_LEVELS} numbers from 0 to 1`);
  }
  return levels;
}

function parseSeconds(value, fallback, name, max) {
  if (value == null) {
    return fallback;
  }
  if (typeof value !== 'number' || !(value > 0) || value > max) {
    throw new LayerError(`${name} must be a number of seconds, above 0 and at most ${max}`);
  }
  return value;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new LayerError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function parseId(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw new LayerError(`${name} must be a string of 1 to ${MAX_ID_LENGTH} characters`);
  }
  return value;
}

// Checks a request and fills in the defaults; throws LayerError on anything wrong.
export function parseLayer(spec) {
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new LayerError('expected a JSON object');
  }
  const effect = oneOf(spec.effect ?? 'solid', EFFECTS, 'effect');
  const priority = spec.priority ?? DEFAULT_PRIORITY;
  if (!Number.isFinite(priority)) {
    throw new LayerError('priority must be a number');
  }
  const dim = spec.dim ?? 0;
  if (typeof dim !== 'number' || !(dim >= 0 && dim <= 1)) {
    throw new LayerError('dim must be a number from 0 to 1');
  }
  return {
    id: spec.id == null ? null : parseId(spec.id, 'id'),
    region: oneOf(spec.region ?? 'desk', REGIONS, 'region'),
    effect,
    colors: parseColors(spec.color),
    levels: parseLevels(spec.levels),
    dim,
    durationMs: parseSeconds(spec.duration, DEFAULT_SECONDS, 'duration', MAX_SECONDS) * 1000,
    periodMs: parseSeconds(spec.period, DEFAULT_PERIOD[effect] ?? 1, 'period', 60) * 1000,
    priority,
    group: spec.group == null ? null : parseId(spec.group, 'group'),
  };
}

// How strongly a layer's effect covers a spot `at` (0 left to 1 right of its patch), `elapsed` ms in.
// Bars light each spot by the level of its bar, the levels spread evenly across the patch.
function effectAmount(layer, elapsed, at, levels) {
  if (layer.effect === 'bars') {
    return clamp01(levels?.[Math.min(levels.length - 1, Math.floor(at * levels.length))] ?? 0);
  }
  if (layer.effect === 'pulse') {
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * elapsed / layer.periodMs);
  }
  if (layer.effect === 'wave') {
    const t = (elapsed / layer.periodMs) % 1;
    const there = easeInOut(t < 0.5 ? t * 2 : 2 - t * 2);
    const center = -WAVE_WIDTH + (1 + 2 * WAVE_WIDTH) * there;
    return easeInOut(clamp01(1 - Math.abs(at - center) / WAVE_WIDTH));
  }
  return 1;
}

/**
 * The layers currently shown. Each spot on the desk is a "pixel" naming where it
 * sits in every region it belongs to: a number from 0 (left) to 1 (right), or
 * null for a device lit as one colour. Layers paint in priority order, newest on
 * top among equals. Layers sharing a group split their region between them,
 * oldest on the left.
 */
export class LightLayers {
  constructor() {
    this.layers = new Map();
    this.made = 0;
  }

  // Adds a layer, or updates the one with the same id: an update keeps its
  // place, runs for its new duration from now, and crossfades to a new colour
  // or effect; the same effect keeps its animation's phase. `source`, for the
  // app's own bars, gives the levels for each frame: now => levels.
  show(spec, now, source = null) {
    const parsed = parseLayer(spec);
    if (parsed.effect === 'bars' && parsed.levels == null && source == null) {
      throw new LayerError('bars need levels');
    }
    this.prune(now);
    const id = parsed.id ?? `layer-${this.made + 1}`;
    const existing = this.layers.get(id);
    if (!existing && this.layers.size >= MAX_LAYERS) {
      throw new LayerError(`at most ${MAX_LAYERS} layers at once`, 429);
    }
    this.made++;
    const sameEffect = existing && existing.effect === parsed.effect && existing.periodMs === parsed.periodMs;
    const changed = existing && !(sameEffect && String(existing.colors) === String(parsed.colors));
    const layer = {
      ...parsed,
      source,
      id,
      order: existing?.order ?? this.made,
      startedAt: existing?.startedAt ?? now,
      animatedFrom: sameEffect ? existing.animatedFrom : now,
      was: changed ? looks(existing) : existing?.was,
      changedAt: changed ? now : existing?.changedAt,
      endsAt: now + parsed.durationMs,
    };
    this.layers.set(id, layer);
    return layer;
  }

  // Fades a layer out now. False when there is no such layer.
  cancel(id, now) {
    this.prune(now);
    const layer = this.layers.get(id);
    if (!layer) {
      return false;
    }
    layer.endsAt = Math.min(layer.endsAt, now + FADE_OUT_MS);
    return true;
  }

  has(id, now) {
    this.prune(now);
    return this.layers.has(id);
  }

  prune(now) {
    this.layers.forEach((layer, id) => {
      if (layer.endsAt <= now) {
        this.layers.delete(id);
      }
    });
  }

  // Whether the layers need frame-by-frame painting right now.
  animating(now) {
    this.prune(now);
    return [...this.layers.values()].some(layer =>
      layer.effect !== 'solid' || now - layer.startedAt < FADE_IN_MS || layer.endsAt - now <= FADE_OUT_MS || now - layer.changedAt < CHANGE_MS);
  }

  // When steady layers next need a frame (a fade-out starting, or a layer gone), or Infinity.
  nextChange(now) {
    this.prune(now);
    return Math.min(...[...this.layers.values()].map(({ endsAt }) => (endsAt - FADE_OUT_MS > now ? endsAt - FADE_OUT_MS : endsAt)));
  }

  /**
   * One function per layer that passes `which`, in painting order, each
   * (colour, pixel) => colour over it.
   */
  painters(now, which) {
    this.prune(now);
    const layers = [...this.layers.values()].filter(which).sort((a, b) => a.priority - b.priority || a.order - b.order);
    const groups = new Map();
    layers.filter(layer => layer.group != null).sort((a, b) => a.order - b.order).forEach(layer => {
      const key = `${layer.region}/${layer.group}`;
      groups.set(key, [...(groups.get(key) ?? []), layer]);
    });

    return layers.map(layer => {
      const strength = clamp01(Math.min((now - layer.startedAt) / FADE_IN_MS, (layer.endsAt - now) / FADE_OUT_MS));
      const change = now - layer.changedAt < CHANGE_MS ? easeInOut((now - layer.changedAt) / CHANGE_MS) : 1;
      const levels = shown => (shown.source ? shown.source(now) : shown.levels);
      const [current, was] = [layer, change < 1 ? layer.was : null].map(shown => shown && { ...shown, levels: levels(shown) });
      const look = (shown, color, at) => mix(
        shown.dim ? mix(color, BLACK, shown.dim) : color,
        colorAt(shown.colors, at),
        effectAmount(shown, now - shown.animatedFrom, at, shown.levels),
      );
      const members = layer.group == null ? [layer] : groups.get(`${layer.region}/${layer.group}`);
      const share = members.length;
      const index = members.indexOf(layer);
      return (color, pixel) => {
        const position = pixel[layer.region];
        if (position === undefined) {
          return color;
        }
        let at = position ?? 0.5;
        if (position != null && share > 1) {
          if (Math.min(share - 1, Math.floor(position * share)) !== index) {
            return color;
          }
          at = position * share - index;
        }
        const painted = was ? mix(look(was, color, at), look(current, color, at), change) : look(current, color, at);
        return mix(color, painted, strength);
      };
    });
  }

  status(now) {
    this.prune(now);
    return [...this.layers.values()]
      .sort((a, b) => b.priority - a.priority || b.order - a.order)
      .map(({ id, region, effect, colors, priority, group, endsAt }) => ({
        id,
        region,
        effect,
        color: colors.length === 1 ? hex(colors[0]) : colors.map(hex),
        priority,
        group,
        secondsLeft: Math.round((endsAt - now) / 100) / 10,
      }));
  }
}
