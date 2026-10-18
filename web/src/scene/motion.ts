// ── Ride-along motion ────────────────────────────────────────────────────────
// The van is always driving, so the camera "rides along". Instead of parenting the
// camera to a swaying group (which fights OrbitControls' math), the WORLD rocks
// gently and the van stays rock-steady on screen — same feeling, no jitter, and
// the orbit stays perfectly predictable for the user.

export const motion = {
  /** seconds since mount, drives the sway sine */
  phase: 0,
  rotZ: 0,
  rotX: 0,
  y: 0,
  /** metres per second — the speed the world scrolls past */
  speed: 15,
  /** 0..1: eased down when the van is parked in the user's imagination */
  sway: 1,
};

const TWO_PI = Math.PI * 2;

export function updateMotion(dt: number) {
  motion.phase += dt;
  const slow = motion.phase * (TWO_PI / 2.4); // ~2.4s period
  const fast = motion.phase * (TWO_PI / 1.7);
  motion.rotZ = Math.sin(slow) * ((0.5 * Math.PI) / 180) * motion.sway; // ±0.5°
  motion.rotX = Math.sin(fast + 1.1) * ((0.32 * Math.PI) / 180) * motion.sway;
  motion.y = Math.sin(fast * 1.3) * 0.012 * motion.sway;
}

export const SCROLL_SPAN = 180; // metres of world that loop past the van

/** advance a world-space x and wrap it back round */
export function scrollX(x: number, dt: number, factor = 1): number {
  const next = x - motion.speed * dt * factor;
  return next < -SCROLL_SPAN / 2 ? next + SCROLL_SPAN : next;
}
