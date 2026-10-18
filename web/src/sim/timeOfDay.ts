// ── Time of day ──────────────────────────────────────────────────────────────
// One number, t ∈ [0,1), drives everything outside: sun position, interior lamps,
// string lights, window glow, panorama crossfade, and the living-sim bias.
// Keyframes are interpolated smoothly so nothing ever pops.

export type Segment = 'morning' | 'day' | 'sunset' | 'night';

export const SEGMENT_ORDER: Segment[] = ['morning', 'day', 'sunset', 'night'];

/** Sunrise 06:00 at t=0, sunset 18:00 at t=0.75 (a 12-minute day by default). */
export function clockLabel(t: number): string {
  const hours = (6 + (t % 1) * 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function segmentOf(t: number): Segment {
  const x = ((t % 1) + 1) % 1;
  if (x < 0.2) return 'morning';
  if (x < 0.6) return 'day';
  if (x < 0.75) return 'sunset';
  return 'night';
}

export function phaseLabel(t: number): string {
  const x = ((t % 1) + 1) % 1;
  if (x < 0.05) return 'sunrise';
  if (x < 0.2) return 'morning';
  if (x < 0.45) return 'midday';
  if (x < 0.6) return 'afternoon';
  if (x < 0.7) return 'golden hour';
  if (x < 0.78) return 'sunset';
  if (x < 0.88) return 'dusk';
  return 'night';
}

export type LightSample = {
  ambient: number;
  ambientColor: string;
  sun: number;
  sunColor: string;
  sunPos: [number, number, number];
  lamp: number;
  cab: number;
  strings: number;
  window: number;
  /** 0 = full day panorama, 1 = full night panorama */
  night: number;
  sky: string;
};

type Key = Omit<LightSample, 'sunPos'> & { t: number };

// t, ambient, sun, lamp (warm interior), cab (GPS cyan), strings, window, night, sky
const KEYS: Key[] = [
  { t: 0.0, ambient: 0.34, ambientColor: '#cdd9f2', sun: 1.2, sunColor: '#ffb27a', lamp: 0.95, cab: 0.75, strings: 0.45, window: 0.5, night: 0.35, sky: '#6d7ea8' },
  { t: 0.06, ambient: 0.55, ambientColor: '#dfeaff', sun: 1.9, sunColor: '#ffd9a8', lamp: 0.45, cab: 0.35, strings: 0.12, window: 0.15, night: 0.05, sky: '#9ccbf5' },
  { t: 0.25, ambient: 0.85, ambientColor: '#eaf3ff', sun: 2.6, sunColor: '#fff6e0', lamp: 0.12, cab: 0.15, strings: 0.0, window: 0.0, night: 0.0, sky: '#8fc4f0' },
  { t: 0.52, ambient: 0.78, ambientColor: '#f7ecd8', sun: 2.35, sunColor: '#ffe3b0', lamp: 0.18, cab: 0.18, strings: 0.0, window: 0.0, night: 0.0, sky: '#9dc6ea' },
  { t: 0.64, ambient: 0.52, ambientColor: '#ffdcb8', sun: 1.85, sunColor: '#ffa860', lamp: 0.6, cab: 0.45, strings: 0.22, window: 0.12, night: 0.08, sky: '#e0a276' },
  { t: 0.71, ambient: 0.36, ambientColor: '#e8a58c', sun: 1.1, sunColor: '#ff8a4c', lamp: 0.95, cab: 0.7, strings: 0.55, window: 0.45, night: 0.3, sky: '#c9705a' },
  { t: 0.765, ambient: 0.26, ambientColor: '#9aa2cc', sun: 0.5, sunColor: '#8f9bd8', lamp: 1.25, cab: 0.9, strings: 0.88, window: 0.85, night: 0.82, sky: '#3c4878' },
  { t: 0.84, ambient: 0.22, ambientColor: '#8fa4d8', sun: 0.5, sunColor: '#b9ccff', lamp: 1.35, cab: 1.0, strings: 1.0, window: 1.0, night: 1.0, sky: '#131c34' },
  { t: 0.96, ambient: 0.22, ambientColor: '#8fa4d8', sun: 0.5, sunColor: '#b9ccff', lamp: 1.32, cab: 1.0, strings: 1.0, window: 1.0, night: 1.0, sky: '#141e38' },
  { t: 1.0, ambient: 0.34, ambientColor: '#cdd9f2', sun: 1.2, sunColor: '#ffb27a', lamp: 0.95, cab: 0.75, strings: 0.45, window: 0.5, night: 0.35, sky: '#6d7ea8' },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => k * k * (3 - 2 * k);

function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
  const bl = Math.round(lerp(pa & 255, pb & 255, k));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Sun/moon direction. By day the sun crosses from ahead of the van (+X, rising
 *  in the windshield) to behind it (-X) — you drive into the sunrise and the sunset. */
function sunPosition(t: number): [number, number, number] {
  const x = ((t % 1) + 1) % 1;
  if (x > 0.75) {
    // night: fixed moonlight, cool and high on the open side
    return [-13, 15, -9];
  }
  const dayT = x / 0.75;
  const az = dayT * Math.PI;
  const elev = Math.sin(dayT * Math.PI) * 0.95 + 0.08;
  return [Math.cos(az) * 21, elev * 21, -7 + Math.sin(az * 2) * 3.2];
}

export function sampleLights(t: number, out?: LightSample): LightSample {
  const x = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && x > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const span = b.t - a.t || 1;
  const k = smooth(Math.min(1, Math.max(0, (x - a.t) / span)));

  const res: LightSample = out ?? ({} as LightSample);
  res.ambient = lerp(a.ambient, b.ambient, k);
  res.ambientColor = mixHex(a.ambientColor, b.ambientColor, k);
  res.sun = lerp(a.sun, b.sun, k);
  res.sunColor = mixHex(a.sunColor, b.sunColor, k);
  res.sunPos = sunPosition(x);
  res.lamp = lerp(a.lamp, b.lamp, k);
  res.cab = lerp(a.cab, b.cab, k);
  res.strings = lerp(a.strings, b.strings, k);
  res.window = lerp(a.window, b.window, k);
  res.night = lerp(a.night, b.night, k);
  res.sky = mixHex(a.sky, b.sky, k);
  return res;
}

// ── Mutable world clock ──────────────────────────────────────────────────────
// Kept out of React state on purpose: it changes every frame. The HUD subscribes
// to a 4 Hz projection of it (see store.ts / director.ts).

export type WorldClock = {
  t: number;
  cycleMinutes: number;
  /** set false when you want to freeze the cycle (pause) */
  running: boolean;
  lights: LightSample;
};

export const world: WorldClock = {
  t: 0.16,
  cycleMinutes: 12,
  running: true,
  lights: sampleLights(0.16),
};

export function setCycleMinutes(min: number) {
  const m = Number(min);
  if (Number.isFinite(m) && m >= 1 && m <= 240) world.cycleMinutes = m;
}

export function advanceWorld(dtSeconds: number) {
  if (!world.running) return;
  world.t = (world.t + dtSeconds / (world.cycleMinutes * 60)) % 1;
  sampleLights(world.t, world.lights);
}
