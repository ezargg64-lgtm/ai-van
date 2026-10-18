// ── AgentAvatar ──────────────────────────────────────────────────────────────
// Pure renderer: it reads VanAgentState (through sim/vanStore) and nothing else.
// Articulated hips -> torso -> head/arms and thighs -> knees, all angles damped so
// every pose change is a 0.35s tween. Walking, turning, climbing the bunk ladder
// and the speaking gestures all fall out of the same angle rig.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AGENT_LOOKS, BUNK_CLIMB_ANCHOR, STAND_HIP_Y, WALK_SPEED, slotFor } from '../sim/vanLayout';
import { BODY, baseAngles, damp, poseTargets, shortAngle } from './avatarRig';
import { useVan } from '../sim/vanStore';
import type { PropId } from '../sim/types';

/** Every avatar publishes its root + head so bubbles and gaze can find them. */
export const agentAnchors: Record<string, { root: THREE.Object3D | null; head: THREE.Object3D | null }> = {};

// ── props the agents hold / wear ─────────────────────────────────────────────

function PropMesh({ propId, color }: { propId: PropId; color: string }) {
  switch (propId) {
    case 'laptop':
      return (
        <group position={[0, 0.2, 0.27]} rotation={[-0.12, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.02, 0.24]} />
            <meshStandardMaterial color="#5b6068" metalness={0.4} roughness={0.5} />
          </mesh>
          <group position={[0, 0.01, -0.12]} rotation={[1.35, 0, 0]}>
            <mesh position={[0, 0.11, 0]} castShadow>
              <boxGeometry args={[0.33, 0.22, 0.015]} />
              <meshStandardMaterial color="#3b4149" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.11, 0.012]}>
              <planeGeometry args={[0.29, 0.18]} />
              <meshStandardMaterial color="#7fd8c8" emissive="#4fbfae" emissiveIntensity={1.1} toneMapped={false} />
            </mesh>
          </group>
        </group>
      );
    case 'book':
      return (
        <group position={[0, 0.3, 0.25]} rotation={[-0.5, 0.06, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.24, 0.04, 0.18]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.023, 0]}>
            <boxGeometry args={[0.22, 0.01, 0.16]} />
            <meshStandardMaterial color="#f6f2e8" roughness={0.9} />
          </mesh>
        </group>
      );
    case 'handheld':
      return (
        <group position={[0, 0.34, 0.25]} rotation={[-0.45, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.22, 0.04, 0.11]} />
            <meshStandardMaterial color="#31353b" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.15, 0.08]} />
            <meshStandardMaterial color="#8fd7ff" emissive="#4fa8ff" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'mug':
      return (
        <group position={[0, -0.3, 0.06]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.1, 10]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>
      );
    case 'kettle':
      return (
        <group position={[0, -0.3, 0.06]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.07, 0.085, 0.13, 10]} />
            <meshStandardMaterial color="#c3c9cf" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0.07, 0.02, 0]} rotation={[0, 0, -0.7]}>
            <boxGeometry args={[0.12, 0.02, 0.02]} />
            <meshStandardMaterial color="#a9b0b7" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

export function AgentAvatar({ id }: { id: string }) {
  const look = AGENT_LOOKS[id] ?? AGENT_LOOKS.michael;
  const color = useVan((s) => s.roster[id]?.color ?? '#8ab4f8');
  const propId = useVan((s) => s.agents[id]?.propId ?? null);
  const zzz = useVan((s) => s.agents[id]?.zzz ?? false);

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const thighL = useRef<THREE.Group>(null);
  const thighR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const elbL = useRef<THREE.Group>(null);
  const elbR = useRef<THREE.Group>(null);

  const lookRef = useRef(look);
  lookRef.current = look;

  // mutable animation state (never in React)
  const anim = useRef({
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    angles: baseAngles(),
    desired: baseAngles(),
    walkBlend: 0,
    walkPhase: 0,
    climbing: false,
    headYawLocal: 0,
    initialised: false,
  });

  const zzzRef = useRef<THREE.Group>(null);
  const zzzSprite = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 78px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('Z', 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    return mat;
  }, []);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.06);
    const st = useVan.getState().agents[id];
    const g = root.current;
    if (!st || !g) return;

    const slot = slotFor(st.zone, st.slot);
    const a = anim.current;
    if (!a.initialised) {
      a.pos.set(slot.pos[0], slot.pos[1] - STAND_HIP_Y, slot.pos[2]);
      a.yaw = slot.yaw;
      a.initialised = true;
    }

    // ── 1. where should we be? ────────────────────────────────────────────────
    const targetHipY = slot.pos[1];
    const elevated = targetHipY > 1.0;
    // The bunk is the only raised spot, so the ladder anchor is the vertical travel
    // point in both directions: climb up there before crawling in, slide to the edge
    // and climb down there before walking off. Never float sideways.
    const needsLadder = elevated || a.pos.y > 0.05;
    const ankleX = needsLadder ? BUNK_CLIMB_ANCHOR[0] : slot.pos[0];
    const ankleZ = needsLadder ? BUNK_CLIMB_ANCHOR[2] : slot.pos[2];

    const dx = ankleX - a.pos.x;
    const dz = ankleZ - a.pos.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.05;
    let climbing = false;

    if (moving) {
      const step = Math.min(dist, WALK_SPEED * dt);
      a.pos.x += (dx / dist) * step;
      a.pos.z += (dz / dist) * step;
      a.walkPhase += dt * 7.4;
    } else if (elevated && Math.abs(a.pos.y - (targetHipY - STAND_HIP_Y)) > 0.02) {
      // climb the ladder: rise (or drop) at the anchor
      const targetY = targetHipY - STAND_HIP_Y;
      a.pos.y = damp(a.pos.y, targetY, 3.4, dt);
      climbing = true;
      a.walkPhase += dt * 5;
    } else if (!elevated && a.pos.y > 0.01) {
      // step down
      a.pos.y = damp(a.pos.y, 0, 4, dt);
      climbing = true;
      a.walkPhase += dt * 5;
    } else {
      a.pos.y = elevated ? targetHipY - STAND_HIP_Y : 0;
    }

    const movingNow = moving || climbing;
    a.walkBlend = damp(a.walkBlend, movingNow ? 1 : 0, 9, dt);

    // ── 2. which way do we face? ──────────────────────────────────────────────
    let desiredYaw = slot.yaw;
    let headLook = 0;
    const standish = st.pose === 'stand' || st.pose === 'shuffle' || movingNow;
    if (moving) {
      desiredYaw = Math.atan2(dx, dz);
    } else if (st.lookAt) {
      let lx: number | undefined;
      let lz: number | undefined;
      if (st.lookAt === 'camera') {
        lx = state.camera.position.x;
        lz = state.camera.position.z;
      } else if (useVan.getState().agents[st.lookAt]) {
        const other = agentAnchors[st.lookAt]?.root;
        if (other) {
          other.getWorldPosition(tmpVec);
          lx = tmpVec.x;
          lz = tmpVec.z;
        }
      } else {
        const zoneSlot = slotFor(st.lookAt as never, 0);
        lx = zoneSlot.pos[0];
        lz = zoneSlot.pos[2];
      }
      if (lx != null && lz != null) {
        desiredYaw = Math.atan2(lx - a.pos.x, lz - a.pos.z);
        const diff = shortAngle(desiredYaw - a.yaw);
        if (!standish && Math.abs(diff) < 1.05) {
          // seated: turn the head instead of the whole body
          headLook = diff;
          desiredYaw = slot.yaw;
        }
      }
    }
    const yawDelta = shortAngle(desiredYaw - a.yaw);
    a.yaw = shortAngle(a.yaw + yawDelta * (1 - Math.exp(-(movingNow ? 6 : 3.4) * dt)));

    // ── 3. pose angles ────────────────────────────────────────────────────────
    poseTargets(climbing ? 'shuffle' : st.pose, a.desired);
    const wb = a.walkBlend;
    const swing = Math.sin(a.walkPhase);
    const swing2 = Math.sin(a.walkPhase * 2);
    const speak = st.speaking ? Math.sin(state.clock.elapsedTime * 7.2) : 0;

    if (climbing) {
      a.desired.thighL = -1.0 + swing * 0.5;
      a.desired.thighR = -1.0 - swing * 0.5;
      a.desired.kneeL = 1.5 - swing * 0.5;
      a.desired.kneeR = 1.5 + swing * 0.5;
      a.desired.armL = -2.2 + swing * 0.35;
      a.desired.armR = -2.2 - swing * 0.35;
      a.desired.elbL = a.desired.elbR = -0.5;
      a.desired.torso = 0.1;
      a.desired.bodyPitch = 0.12;
    }

    // walk cycle blended on top of the pose (suppressed while lying down)
    const lying = 1 - Math.min(1, Math.abs(a.angles.bodyRoll) / 1.4);
    const thighWalk = swing * 0.5 * wb * lying;
    const armWalk = -swing * 0.42 * wb * lying;
    const bob = Math.abs(swing2) * 0.028 * wb * (0.4 + 0.6 * lying);

    const A = a.angles;
    const D = a.desired;
    const lambda = 8;
    A.bodyPitch = damp(A.bodyPitch, D.bodyPitch, lambda, dt);
    A.bodyRoll = damp(A.bodyRoll, D.bodyRoll, lambda * 0.8, dt);
    A.torso = damp(A.torso, D.torso + (st.activity === 'coding' ? 0.06 : 0), lambda, dt);
    const lookDown = st.activity === 'coding' ? 0.16 : st.activity === 'gaming' ? 0.3 : st.activity === 'reading' ? 0.22 : 0;
    A.head = damp(A.head, D.head + (st.speaking ? speak * 0.05 : 0) + lookDown, lambda, dt);
    A.headYaw = damp(A.headYaw, headLook + D.headYaw * (1 - wb), lambda, dt);
    A.thighL = damp(A.thighL, D.thighL + thighWalk, lambda, dt);
    A.thighR = damp(A.thighR, D.thighR - thighWalk, lambda, dt);
    A.kneeL = damp(A.kneeL, D.kneeL + Math.max(0, -swing) * 0.5 * wb, lambda, dt);
    A.kneeR = damp(A.kneeR, D.kneeR + Math.max(0, swing) * 0.5 * wb, lambda, dt);
    A.spreadL = damp(A.spreadL, D.spreadL, lambda, dt);
    A.spreadR = damp(A.spreadR, D.spreadR, lambda, dt);
    A.armL = damp(A.armL, D.armL + armWalk + (st.activity === 'coffee' || st.activity === 'cooking' ? 0.25 : 0), lambda, dt);
    A.armR = damp(A.armR, D.armR - armWalk - (st.speaking ? Math.abs(speak) * 0.5 + 0.45 : 0), lambda, dt);
    A.elbL = damp(A.elbL, D.elbL, lambda, dt);
    A.elbR = damp(A.elbR, D.elbR - (st.speaking ? Math.abs(speak) * 0.4 : 0), lambda, dt);
    A.armSpread = damp(A.armSpread, D.armSpread + (st.speaking ? 0.16 : 0), lambda, dt);

    // ── 4. write to the scene graph ───────────────────────────────────────────
    g.position.set(a.pos.x, a.pos.y + bob, a.pos.z);
    g.rotation.y = a.yaw;
    if (hips.current) {
      hips.current.rotation.x = A.bodyPitch;
      hips.current.rotation.z = A.bodyRoll;
    }
    if (torso.current) {
      torso.current.rotation.x = A.torso;
      torso.current.rotation.y = 0;
    }
    if (head.current) {
      head.current.rotation.x = A.head;
      head.current.rotation.y = A.headYaw;
    }
    if (thighL.current) {
      thighL.current.rotation.x = A.thighL;
      thighL.current.rotation.z = A.spreadL;
    }
    if (thighR.current) {
      thighR.current.rotation.x = A.thighR;
      thighR.current.rotation.z = -A.spreadR;
    }
    if (kneeL.current) kneeL.current.rotation.x = A.kneeL;
    if (kneeR.current) kneeR.current.rotation.x = A.kneeR;
    if (armL.current) {
      armL.current.rotation.x = A.armL;
      armL.current.rotation.z = A.armSpread;
    }
    if (armR.current) {
      armR.current.rotation.x = A.armR;
      armR.current.rotation.z = -A.armSpread;
    }
    if (elbL.current) elbL.current.rotation.x = A.elbL;
    if (elbR.current) elbR.current.rotation.x = A.elbR;

    if (zzzRef.current) {
      zzzRef.current.visible = zzz;
      const t = state.clock.elapsedTime;
      const rise = (t * 0.22) % 0.5;
      zzzRef.current.position.set(0.17 + Math.sin(t * 0.9) * 0.02, 0.1 + rise, 0.02);
      zzzSprite.opacity = Math.max(0, 0.85 - rise * 1.5);
    }

    const anchor = agentAnchors[id] ?? (agentAnchors[id] = { root: null, head: null });
    anchor.root = g;
    anchor.head = head.current;
  });

  const shirt = color;
  const pants = look.pants;

  return (
    <group ref={root} name={`agent-${id}`}>
      <group ref={hips} position={[0, STAND_HIP_Y, 0]}>
        {/* pelvis */}
        <mesh position={[0, -(BODY.thighPivot - 0.03), 0]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.2]} />
          <meshStandardMaterial color={pants} roughness={0.9} />
        </mesh>

        {/* legs: every offset comes from BODY (see avatarRig.ts) */}
        <group ref={thighL} position={[-0.09, -BODY.thighPivot, 0]}>
          <mesh position={[0, -BODY.thigh / 2, 0]} castShadow>
            <boxGeometry args={[0.14, BODY.thigh, 0.16]} />
            <meshStandardMaterial color={pants} roughness={0.9} />
          </mesh>
          <group ref={kneeL} position={[0, -BODY.thigh, 0]}>
            <mesh position={[0, -BODY.calf / 2, 0]} castShadow>
              <boxGeometry args={[0.12, BODY.calf, 0.14]} />
              <meshStandardMaterial color={pants} roughness={0.9} />
            </mesh>
            <mesh position={[0, -BODY.soleDrop + BODY.shoeHeight / 2, BODY.shoeForward]} castShadow>
              <boxGeometry args={[0.14, BODY.shoeHeight, BODY.shoeLength]} />
              <meshStandardMaterial color={look.shoes} roughness={0.8} />
            </mesh>
          </group>
        </group>
        <group ref={thighR} position={[0.09, -BODY.thighPivot, 0]}>
          <mesh position={[0, -BODY.thigh / 2, 0]} castShadow>
            <boxGeometry args={[0.14, BODY.thigh, 0.16]} />
            <meshStandardMaterial color={pants} roughness={0.9} />
          </mesh>
          <group ref={kneeR} position={[0, -BODY.thigh, 0]}>
            <mesh position={[0, -BODY.calf / 2, 0]} castShadow>
              <boxGeometry args={[0.12, BODY.calf, 0.14]} />
              <meshStandardMaterial color={pants} roughness={0.9} />
            </mesh>
            <mesh position={[0, -BODY.soleDrop + BODY.shoeHeight / 2, BODY.shoeForward]} castShadow>
              <boxGeometry args={[0.14, BODY.shoeHeight, BODY.shoeLength]} />
              <meshStandardMaterial color={look.shoes} roughness={0.8} />
            </mesh>
          </group>
        </group>

        {/* torso */}
        <group ref={torso}>
          <mesh position={[0, BODY.torsoUp / 2 + 0.02, 0]} castShadow>
            <boxGeometry args={[0.34, BODY.torsoUp, 0.2]} />
            <meshStandardMaterial color={shirt} roughness={0.85} />
          </mesh>
          {/* collar detail */}
          <mesh position={[0, BODY.torsoUp, 0]}>
            <boxGeometry args={[0.36, 0.06, 0.22]} />
            <meshStandardMaterial color={shirt} roughness={0.85} />
          </mesh>

          {/* arms */}
          <group ref={armL} position={[-BODY.shoulderX, BODY.shoulderY, 0]}>
            <mesh position={[0, -BODY.upperArm / 2, 0]} castShadow>
              <boxGeometry args={[0.1, BODY.upperArm, 0.11]} />
              <meshStandardMaterial color={shirt} roughness={0.85} />
            </mesh>
            <group ref={elbL} position={[0, -BODY.upperArm, 0]}>
              <mesh position={[0, -BODY.foreArm / 2, 0]} castShadow>
                <boxGeometry args={[0.09, BODY.foreArm, 0.1]} />
                <meshStandardMaterial color={shirt} roughness={0.85} />
              </mesh>
              <mesh position={[0, -BODY.foreArm, 0]}>
                <sphereGeometry args={[BODY.handRadius, 8, 6]} />
                <meshStandardMaterial color={look.skin} roughness={0.9} />
              </mesh>
            </group>
          </group>
          <group ref={armR} position={[BODY.shoulderX, BODY.shoulderY, 0]}>
            <mesh position={[0, -BODY.upperArm / 2, 0]} castShadow>
              <boxGeometry args={[0.1, BODY.upperArm, 0.11]} />
              <meshStandardMaterial color={shirt} roughness={0.85} />
            </mesh>
            <group ref={elbR} position={[0, -BODY.upperArm, 0]}>
              <mesh position={[0, -BODY.foreArm / 2, 0]} castShadow>
                <boxGeometry args={[0.09, BODY.foreArm, 0.1]} />
                <meshStandardMaterial color={shirt} roughness={0.85} />
              </mesh>
              <mesh position={[0, -BODY.foreArm, 0]}>
                <sphereGeometry args={[BODY.handRadius, 8, 6]} />
                <meshStandardMaterial color={look.skin} roughness={0.9} />
              </mesh>
              {propId === 'mug' || propId === 'kettle' ? (
                <PropMesh propId={propId} color={look.skin} />
              ) : null}
            </group>
          </group>

          {/* props that sit in front of the body rather than in the hand */}
          {propId && propId !== 'mug' && propId !== 'kettle' ? (
            <PropMesh propId={propId} color={look.skin} />
          ) : null}

          {/* head */}
          <group ref={head} position={[0, BODY.headOffset, 0]}>
            <mesh position={[0, 0.06, 0]} castShadow>
              <sphereGeometry args={[0.135, 14, 12]} />
              <meshStandardMaterial color={look.skin} roughness={0.9} />
            </mesh>
            {/* hair */}
            {look.hairstyle === 'cap' ? (
              <mesh position={[0, 0.12, 0.01]} rotation={[0.08, 0, 0]} castShadow>
                <sphereGeometry args={[0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                <meshStandardMaterial color={shirt} roughness={0.9} />
              </mesh>
            ) : (
              <mesh position={[0, 0.09, -0.01]} scale={[1, 0.95, 1]} castShadow>
                <sphereGeometry
                  args={[
                    0.145,
                    14,
                    10,
                    0,
                    Math.PI * 2,
                    0,
                    look.hairstyle === 'long' || look.hairstyle === 'curly' ? Math.PI * 0.75 : Math.PI * 0.55,
                  ]}
                />
                <meshStandardMaterial color={look.hair} roughness={0.95} />
              </mesh>
            )}
            {look.hairstyle === 'bun' && (
              <mesh position={[0, 0.13, -0.13]}>
                <sphereGeometry args={[0.06, 8, 6]} />
                <meshStandardMaterial color={look.hair} roughness={0.95} />
              </mesh>
            )}
            {/* eyes + smile */}
            {[-0.05, 0.05].map((x) => (
              <mesh key={x} position={[x, 0.05, 0.115]}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshStandardMaterial color="#33312f" roughness={0.4} />
              </mesh>
            ))}
            <mesh position={[0, 0.0, 0.12]}>
              <boxGeometry args={[0.05, 0.012, 0.02]} />
              <meshStandardMaterial color="#8a5a4a" roughness={0.6} />
            </mesh>

            {/* Zzz (a sprite, so it always faces the camera) */}
            <group ref={zzzRef} visible={false}>
              <sprite material={zzzSprite} scale={[0.13, 0.13, 0.13]} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
