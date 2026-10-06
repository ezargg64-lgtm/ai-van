// ── Body vs. layout smoke test ───────────────────────────────────────────────
// Builds the avatar's kinematic chain out of plain three.js Object3Ds (no WebGL,
// no React) using the exact metrics and pose table the scene uses, then asks the
// questions that decide whether the van looks right:
//
//   · do seated agents' feet reach the floor, or do they float / sink?
//   · does a lying agent fit on the bunk under the ceiling?
//   · does anybody's head or body poke through a wall?
//   · is the hip exactly on the seat the layout promised?
//
//   npm run test:rig

import * as THREE from 'three';
import { BODY, baseAngles, poseTargets } from '../src/scene/avatarRig';
import { BUNK_SLAB, STAND_HIP_Y, STAND_HEIGHT, VAN, ZONES, slotFor } from '../src/sim/vanLayout';
import { FRAMINGS, ORBIT_CLAMP, framingStats, insideClamp } from '../src/scene/cameraFraming';
import type { Pose, ZoneId } from '../src/sim/types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

/** Mirror of AgentAvatar's hierarchy, driven by BODY. */
function buildBody() {
  const root = new THREE.Object3D();
  const hips = new THREE.Object3D();
  hips.position.y = STAND_HIP_Y;
  root.add(hips);

  const torso = new THREE.Object3D();
  hips.add(torso);

  const head = new THREE.Object3D();
  head.position.set(0, BODY.headOffset, 0);
  torso.add(head);
  const headTop = new THREE.Object3D();
  headTop.position.y = 0.06 + BODY.headRadius;
  head.add(headTop);
  const headCentre = new THREE.Object3D();
  headCentre.position.y = 0.06;
  head.add(headCentre);

  const legs = [-1, 1].map((side) => {
    const thigh = new THREE.Object3D();
    thigh.position.set(side * 0.09, -0.06, 0);
    hips.add(thigh);
    const knee = new THREE.Object3D();
    knee.position.y = -BODY.thigh;
    thigh.add(knee);
    // same numbers the mesh uses: sole centre, then its bottom face
    const sole = new THREE.Object3D();
    sole.position.set(0, -BODY.soleDrop + BODY.shoeHeight / 2, BODY.shoeForward);
    knee.add(sole);
    const soleBottom = new THREE.Object3D();
    soleBottom.position.y = -BODY.shoeHeight / 2;
    sole.add(soleBottom);
    return { thigh, knee, sole, soleBottom };
  });

  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Object3D();
    arm.position.set(side * BODY.shoulderX, BODY.shoulderY, 0);
    torso.add(arm);
    const elbow = new THREE.Object3D();
    elbow.position.y = -BODY.upperArm;
    arm.add(elbow);
    const hand = new THREE.Object3D();
    hand.position.y = -BODY.foreArm;
    elbow.add(hand);
    return { arm, elbow, hand };
  });

  return { root, hips, torso, head, headCentre, headTop, legs, arms };
}

function applyPose(body: ReturnType<typeof buildBody>, pose: Pose) {
  const a = poseTargets(pose, baseAngles());
  body.hips.rotation.set(a.bodyPitch, 0, a.bodyRoll);
  body.torso.rotation.set(a.torso, 0, 0);
  body.head.rotation.set(a.head, a.headYaw, 0);
  body.legs[0].thigh.rotation.set(a.thighL, 0, a.spreadL);
  body.legs[1].thigh.rotation.set(a.thighR, 0, -a.spreadR);
  body.legs[0].knee.rotation.set(a.kneeL, 0, 0);
  body.legs[1].knee.rotation.set(a.kneeR, 0, 0);
  body.arms[0].arm.rotation.set(a.armL, 0, a.armSpread);
  body.arms[1].arm.rotation.set(a.armR, 0, -a.armSpread);
  body.arms[0].elbow.rotation.set(a.elbL, 0, 0);
  body.arms[1].elbow.rotation.set(a.elbR, 0, 0);
  body.root.updateMatrixWorld(true);
}

function worldOf(obj: THREE.Object3D) {
  return obj.getWorldPosition(new THREE.Vector3());
}

function bounds(body: ReturnType<typeof buildBody>, pad = BODY.headRadius * 0.7) {
  const box = new THREE.Box3();
  const points = [
    body.headTop,
    body.headCentre,
    body.hips,
    body.legs[0].knee,
    body.legs[1].knee,
    body.legs[0].soleBottom,
    body.legs[1].soleBottom,
    body.arms[0].hand,
    body.arms[1].hand,
    body.torso,
  ];
  for (const p of points) box.expandByPoint(worldOf(p));
  if (pad) box.expandByScalar(pad);
  return box;
}

console.log('\n🚐 DEV VAN LIFE — body / layout smoke test\n');

console.log('metrics');
ok(Math.abs(BODY.hipY - STAND_HIP_Y) < 1e-6, 'BODY.hipY matches the layout constant');
ok(Math.abs(BODY.hipY - BODY.thighPivot - BODY.thigh - (BODY.soleDrop + BODY.shoeHeight) ) < 0.2,
  'leg chain adds up to roughly the hip height',
  `${BODY.thighPivot + BODY.thigh + BODY.soleDrop}`);
ok(Math.abs((BODY.hipY + BODY.headOffset + 0.06 + BODY.headRadius) - STAND_HEIGHT) < 0.08,
  'standing height is within 8cm of the layout height', `${(BODY.hipY + BODY.headOffset + 0.06 + BODY.headRadius).toFixed(3)} vs ${STAND_HEIGHT}`);

console.log('\nper-pose floor contact and headroom');
// a representative seat for each pose, exactly as the layout hands it over
const POSE_HIP: Array<[Pose, number]> = [
  ['stand', STAND_HIP_Y],
  ['shuffle', STAND_HIP_Y],
  ['sit-upright', slotFor('dinette', 0).pos[1]],
  ['sit-crossleg', slotFor('sofa', 0).pos[1]],
  ['lounge', slotFor('sofa', 0).pos[1]],
  ['lie-side', slotFor('bunk', 0).pos[1]],
];
for (const [pose, hipY] of POSE_HIP) {
  const body = buildBody();
  body.root.position.y = hipY - STAND_HIP_Y;
  applyPose(body, pose);
  const b = bounds(body);
  const soleL = worldOf(body.legs[0].soleBottom).y;
  const soleR = worldOf(body.legs[1].soleBottom).y;
  const standing = pose === 'stand' || pose === 'shuffle';
  const sole = Math.min(soleL, soleR);
  if (standing) {
    ok(Math.abs(sole) < 0.03, `${pose}: feet rest on the floor`, `sole y=${sole.toFixed(3)}`);
    ok(b.max.y < VAN.ceilingY + 0.02, `${pose}: head clears the ceiling`, `top ${b.max.y.toFixed(3)}`);
  } else if (pose === 'lie-side') {
    ok(sole > 0.2, `${pose}: legs are off the floor (lying)`, `sole y=${sole.toFixed(3)}`);
    ok(b.max.y < VAN.ceilingY, `${pose}: body clears the ceiling`, `top ${b.max.y.toFixed(3)}`);
  } else if (pose === 'lounge') {
    // sofa: feet stretched out, hovering just above the floor
    ok(sole > -0.06 && sole < 0.35, `${pose}: feet are off the floor or resting on it`, `sole y=${sole.toFixed(3)}`);
  } else {
    // seated on a 42-44cm cushion: the foot must land on the floor, not sink
    ok(Math.abs(sole) < 0.05, `${pose}: feet land exactly on the floor`, `sole y=${sole.toFixed(3)}`);
    ok(b.min.y > -0.15, `${pose}: nothing is buried in the floor`, `bottom ${b.min.y.toFixed(3)}`);
  }
  const span = b.max.y - b.min.y;
  ok(span > 0.4 && span < 2.1, `${pose}: sensible body span`, `${span.toFixed(2)}m`);
}

console.log('\nevery slot in every zone, with the right pose');
for (const [zoneId, def] of Object.entries(ZONES)) {
  const all = [...def.slots, ...(def.overflow ?? [])];
  all.forEach((slot, index) => {
    const s = slotFor(zoneId as ZoneId, index);
    const body = buildBody();
    body.root.position.set(s.pos[0], s.pos[1] - STAND_HIP_Y, s.pos[2]);
    body.root.rotation.y = s.yaw;
    applyPose(body, s.pose);
    const hip = worldOf(body.hips);
    const b = bounds(body);

    ok(Math.abs(hip.y - s.pos[1]) < 1e-6, `${zoneId}[${index}] hip sits exactly on the slot`, `${hip.y.toFixed(3)} vs ${s.pos[1]}`);
    const insideX = b.min.x > -VAN.halfLength - 0.35 && b.max.x < VAN.halfLength + 0.2;
    const insideZ = b.min.z > -VAN.width / 2 - 0.3 && b.max.z < VAN.width / 2 + 0.4;
    ok(insideX && insideZ, `${zoneId}[${index}] body stays inside the shell`,
      `x[${b.min.x.toFixed(2)},${b.max.x.toFixed(2)}] z[${b.min.z.toFixed(2)},${b.max.z.toFixed(2)}]`);
    ok(b.max.y < VAN.ceilingY + 0.05, `${zoneId}[${index}] nothing pokes through the (missing) roof`, `top ${b.max.y.toFixed(3)}`);
    if (s.pose === 'sit-upright' || s.pose === 'sit-crossleg') {
      const sole = Math.min(worldOf(body.legs[0].soleBottom).y, worldOf(body.legs[1].soleBottom).y);
      ok(sole > -0.15, `${zoneId}[${index}] feet are not buried in the floor`, `sole ${sole.toFixed(3)}`);
    }
    if (zoneId === 'bunk') {
      // the lying body must be over the mattress, not hanging off it
      const mattressMinZ = -1.06;
      const mattressMaxZ = 0.46;
      ok(b.min.z > mattressMinZ - 0.25 && b.max.z < mattressMaxZ + 0.25,
        `bunk: body lies on the mattress`, `z[${b.min.z.toFixed(2)},${b.max.z.toFixed(2)}]`);
      ok(b.min.y > 1.0, `bunk: body is up on the platform`, `bottom ${b.min.y.toFixed(2)}`);
    }
    if (zoneId === 'galley') {
      // standing at the counter: hands should be near counter height (0.91)
      const hand = worldOf(body.arms[1].hand);
      ok(hand.y > 0.35 && hand.y < 1.35, `galley: hands are at a working height`, `hand y=${hand.y.toFixed(2)}`);
    }
  });
}

console.log('\nseated agents reach the table');
{
  const body = buildBody();
  const slot = ZONES.dinette.slots[0];
  body.root.position.set(slot.pos[0], slot.pos[1] - STAND_HIP_Y, slot.pos[2]);
  body.root.rotation.y = slot.yaw;
  applyPose(body, 'sit-upright');
  const hand = worldOf(body.arms[1].hand);
  const tableTop = 0.66;
  ok(Math.abs(hand.y - tableTop) < 0.42, 'a dinette sitter\'s hand is near the table top', `hand y=${hand.y.toFixed(2)}`);
  const knee = worldOf(body.legs[0].knee);
  ok(knee.y > 0.3 && knee.y < 0.6, 'knees are where knees go', `knee y=${knee.y.toFixed(2)}`);
  const headTop = worldOf(body.headTop);
  ok(headTop.y < VAN.ceilingY, 'sitting tall still clears the roof beam', `top ${headTop.y.toFixed(2)}`);
}

console.log('\nheadroom under the over-cab bunk');
{
  // the solid slab itself: the space *below* it is legitimately usable (dash,
  // cab seats), but nothing may poke into the platform
  const slab = new THREE.Box3(
    new THREE.Vector3(BUNK_SLAB.x[0], BUNK_SLAB.bottom, BUNK_SLAB.z[0]),
    new THREE.Vector3(BUNK_SLAB.x[1], BUNK_SLAB.mattressTop + 0.14, BUNK_SLAB.z[1]),
  );
  for (const [zoneId, def] of Object.entries(ZONES)) {
    const all = [...def.slots, ...(def.overflow ?? [])];
    all.forEach((slot, index) => {
      if (zoneId === 'bunk') return; // the sleeper is on top of the slab, not under it
      const s = slotFor(zoneId as ZoneId, index);
      const body = buildBody();
      body.root.position.set(s.pos[0], s.pos[1] - STAND_HIP_Y, s.pos[2]);
      body.root.rotation.y = s.yaw;
      applyPose(body, s.pose);
      const box = bounds(body, 0);
      ok(!box.intersectsBox(slab), `${zoneId}[${index}] does not poke into the bunk platform`,
        `${JSON.stringify(box.min.toArray().map((n) => +n.toFixed(2)))}..${JSON.stringify(box.max.toArray().map((n) => +n.toFixed(2)))}`);
    });
  }
  // and the sleeper has to be ON the mattress, under the wall line
  const slot = slotFor('bunk', 0);
  const body = buildBody();
  body.root.position.set(slot.pos[0], slot.pos[1] - STAND_HIP_Y, slot.pos[2]);
  body.root.rotation.y = slot.yaw;
  applyPose(body, 'lie-side');
  const box = bounds(body, 0);
  ok(box.min.y > BUNK_SLAB.mattressTop - 0.12, 'the sleeper rests on the mattress', `bottom ${box.min.y.toFixed(2)}`);
  ok(box.max.y < VAN.ceilingY - 0.05, 'the sleeper stays below the wall line', `top ${box.max.y.toFixed(2)}`);
}

console.log('\ncamera framings stay inside the orbit clamp (no snap when the user grabs it)');
for (const [mode, framing] of Object.entries(FRAMINGS)) {
  const stats = framingStats(framing);
  const verdict = insideClamp(framing);
  ok(verdict.ok, `${mode} framing is reachable by OrbitControls`, verdict.reason);
  ok(stats.distance >= ORBIT_CLAMP.minDistance && stats.distance <= ORBIT_CLAMP.maxDistance,
    `${mode} framing distance is in range`, stats.distance.toFixed(2));
  ok(Math.abs(stats.azimuthDeg) <= ORBIT_CLAMP.maxAzimuthDeg,
    `${mode} framing looks in from the open side`, `${stats.azimuthDeg.toFixed(1)}°`);
  // and it must actually see the van: the target is inside the shell
  ok(Math.abs(framing.target[0]) < VAN.halfLength && Math.abs(framing.target[2]) < VAN.halfWidth,
    `${mode} framing points at the van`, `${framing.target}`);
}

console.log('\nthe huddle fits five agents without overlap');
{
  const placed: Array<{ id: string; box: THREE.Box3 }> = [];
  const ids = ['dana', 'uma', 'quinn', 'michael', 'rio'];
  ids.forEach((id, i) => {
    const slot = slotFor('dinette', i);
    const body = buildBody();
    body.root.position.set(slot.pos[0], slot.pos[1] - STAND_HIP_Y, slot.pos[2]);
    body.root.rotation.y = slot.yaw;
    applyPose(body, slot.pose);
    placed.push({ id, box: bounds(body) });
  });
  let overlaps = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i].box.clone().expandByScalar(-0.1);
      const b = placed[j].box.clone().expandByScalar(-0.1);
      if (a.intersectsBox(b)) {
        overlaps++;
        console.log(`    · ${placed[i].id} and ${placed[j].id} are within 10cm of each other`);
      }
    }
  }
  ok(overlaps === 0, 'no two huddled agents share the same space', `${overlaps} overlapping pairs`);
}

console.log(
  `\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ' — the bodies fit the van\n'),
);
process.exit(failures === 0 ? 0 : 1);
