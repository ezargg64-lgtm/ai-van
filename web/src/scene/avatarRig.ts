// ── avatarRig.ts ─────────────────────────────────────────────────────────────
// The body's measurements and the pose angle table, in one place, with no React
// and no JSX. The scene uses it to build the mesh; test/rig.smoke.ts uses the very
// same numbers to prove the bodies actually stand on the floor, sit on the
// cushions and fit under the ceiling.

import type { Pose } from '../sim/types';

// Measured once, used by the mesh AND by test/rig.smoke.ts, so a seated agent's
// foot always lands exactly on the floor: the knee pivot sits at hipY - thighPivot
// - thigh = 0.42 for a standing agent, and soleDrop reaches 0.42 back down to the
// ground. A 44cm cushion puts the seated knee at 0.42 as well, for free.
export const BODY = {
  /** standing hip height: the avatar's origin sits at hipY - this */
  hipY: 0.82,
  /** hip pivot -> thigh pivot (the pelvis mesh sits between them) */
  thighPivot: 0.06,
  thigh: 0.34,
  calf: 0.34,
  /** knee pivot -> sole bottom */
  soleDrop: 0.42,
  shoeHeight: 0.1,
  shoeLength: 0.26,
  shoeForward: 0.04,
  torsoUp: 0.5,
  headOffset: 0.62,
  headRadius: 0.15,
  shoulderX: 0.19,
  shoulderY: 0.46,
  upperArm: 0.28,
  foreArm: 0.28,
  handRadius: 0.055,
} as const;

export type Angles = {
  bodyPitch: number;
  bodyRoll: number;
  torso: number;
  head: number;
  headYaw: number;
  thighL: number;
  kneeL: number;
  thighR: number;
  kneeR: number;
  spreadL: number;
  spreadR: number;
  armL: number;
  elbL: number;
  armR: number;
  elbR: number;
  armSpread: number;
};

export function baseAngles(): Angles {
  return {
    bodyPitch: 0,
    bodyRoll: 0,
    torso: 0.02,
    head: 0,
    headYaw: 0,
    thighL: 0,
    kneeL: 0,
    thighR: 0,
    kneeR: 0,
    spreadL: 0.07,
    spreadR: 0.07,
    armL: -0.08,
    elbL: -0.25,
    armR: -0.08,
    elbR: -0.25,
    armSpread: 0.14,
  };
}

/** Target angles for a pose. Signs: negative rotation.x swings a limb forward. */
export function poseTargets(pose: Pose, out: Angles = baseAngles()): Angles {
  const t = baseAngles();
  switch (pose) {
    case 'sit-upright':
      t.thighL = t.thighR = -Math.PI / 2;
      t.kneeL = t.kneeR = Math.PI / 2.05;
      t.torso = 0.07;
      t.armL = t.armR = -0.5;
      t.elbL = t.elbR = -1.15;
      t.spreadL = t.spreadR = 0.16;
      break;
    case 'sit-crossleg':
      t.thighL = t.thighR = -Math.PI / 2.15;
      t.kneeL = t.kneeR = 1.95;
      t.spreadL = 0.62;
      t.spreadR = 0.62;
      t.torso = 0.09;
      t.armL = t.armR = -0.45;
      t.elbL = t.elbR = -1.05;
      break;
    case 'lounge':
      t.thighL = t.thighR = -1.32;
      t.kneeL = t.kneeR = 0.4;
      t.spreadL = t.spreadR = 0.3;
      t.torso = -0.3;
      t.head = 0.12;
      t.armL = t.armR = -0.32;
      t.elbL = t.elbR = -0.9;
      break;
    case 'lie-side':
      t.bodyRoll = -Math.PI / 2;
      t.torso = 0.04;
      t.head = 0.16;
      t.headYaw = 0.24;
      t.thighL = 0.06;
      t.thighR = 0.22;
      t.kneeL = 0.2;
      t.kneeR = 0.5;
      t.spreadL = 0.06;
      t.spreadR = 0.1;
      t.armL = 0.62;
      t.armR = 0.3;
      t.elbL = -0.7;
      t.elbR = -0.45;
      break;
    case 'shuffle':
    case 'stand':
    default:
      t.armL = t.armR = -0.1;
      t.elbL = t.elbR = -0.28;
      break;
  }
  Object.assign(out, t);
  return out;
}

export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

export function shortAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
