// ── Camera framing + orbit clamp ─────────────────────────────────────────────
// Pure numbers, no React: Rig.tsx uses them to drive OrbitControls and
// test/rig.smoke.ts asserts every framing sits inside the clamp, so the camera
// can never snap when the user grabs the mouse after a mode change.

import type { Mode } from '../sim/types';

export type Framing = { pos: [number, number, number]; target: [number, number, number] };

export const ORBIT_CLAMP = {
  minDistance: 5.2,
  maxDistance: 11.5,
  /** polar angle from +Y: 35° = looking down steeply, 55° = shallower */
  minPolarDeg: 35,
  maxPolarDeg: 55,
  /** ±60° either side of the open wall (+Z) */
  maxAzimuthDeg: 60,
} as const;

export const FRAMINGS: Record<Mode, Framing> = {
  idle: { pos: [3.2, 6.6, 5.4], target: [0, 0.9, 0] },
  task: { pos: [2.3, 5.5, 4.0], target: [0.3, 0.9, -0.15] },
  meeting: { pos: [1.5, 6.4, 5.75], target: [0.3, 1.05, 0.15] },
};

export function framingStats(f: Framing) {
  const [px, py, pz] = f.pos;
  const [tx, ty, tz] = f.target;
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  const polarDeg = (Math.acos((py - ty) / distance) * 180) / Math.PI;
  const azimuthDeg = (Math.atan2(px - tx, pz - tz) * 180) / Math.PI;
  return { distance, polarDeg, azimuthDeg };
}

export function insideClamp(f: Framing): { ok: boolean; reason: string } {
  const { distance, polarDeg, azimuthDeg } = framingStats(f);
  if (distance < ORBIT_CLAMP.minDistance - 1e-6) return { ok: false, reason: `distance ${distance.toFixed(2)} < min` };
  if (distance > ORBIT_CLAMP.maxDistance + 1e-6) return { ok: false, reason: `distance ${distance.toFixed(2)} > max` };
  if (polarDeg < ORBIT_CLAMP.minPolarDeg - 1e-6) return { ok: false, reason: `polar ${polarDeg.toFixed(1)}° < min (too top-down)` };
  if (polarDeg > ORBIT_CLAMP.maxPolarDeg + 1e-6) return { ok: false, reason: `polar ${polarDeg.toFixed(1)}° > max (too shallow)` };
  if (Math.abs(azimuthDeg) > ORBIT_CLAMP.maxAzimuthDeg + 1e-6) {
    return { ok: false, reason: `azimuth ${azimuthDeg.toFixed(1)}° outside ±${ORBIT_CLAMP.maxAzimuthDeg}°` };
  }
  return { ok: true, reason: '' };
}
