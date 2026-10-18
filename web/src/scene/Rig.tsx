// ── Camera rig + dollhouse framing ───────────────────────────────────────────
// OrbitControls clamped to the OPEN side (+Z) so the camera can never end up
// inside the van or behind the far wall: azimuth ±60°, polar 35°-55°, distance
// 5.2-11.5m. The framing tweens a little when the team huddles or turns to face
// you, and it hands control to the user the moment they drag.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useVan } from '../sim/vanStore';
import { FRAMINGS, ORBIT_CLAMP, type Framing } from './cameraFraming';

export function Rig({ onControls }: { onControls?: (c: OrbitControlsImpl | null) => void }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const mode = useVan((s) => s.mode);
  const userHold = useRef(0);
  const goal = useRef<Framing>({ ...FRAMINGS.idle });
  const { camera } = useThree();

  // new framing whenever the mode changes (and never while the user is dragging)
  useEffect(() => {
    goal.current = { ...(FRAMINGS[mode] ?? FRAMINGS.idle) };
    userHold.current = 0;
  }, [mode]);

  useEffect(() => {
    camera.position.set(...FRAMINGS.idle.pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onControls?.(controls.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tmpTarget = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = controls.current;
    if (!c) return;
    if (Date.now() < userHold.current) return; // user is driving

    const k = 1 - Math.exp(-2.6 * dt);
    tmpPos.current.set(...goal.current.pos);
    tmpTarget.current.set(...goal.current.target);
    camera.position.lerp(tmpPos.current, k);
    c.target.lerp(tmpTarget.current, k);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0.9, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={ORBIT_CLAMP.minDistance}
      maxDistance={ORBIT_CLAMP.maxDistance}
      minPolarAngle={(ORBIT_CLAMP.minPolarDeg * Math.PI) / 180}
      maxPolarAngle={(ORBIT_CLAMP.maxPolarDeg * Math.PI) / 180}
      minAzimuthAngle={(-ORBIT_CLAMP.maxAzimuthDeg * Math.PI) / 180}
      maxAzimuthAngle={(ORBIT_CLAMP.maxAzimuthDeg * Math.PI) / 180}
      onStart={() => {
        userHold.current = Date.now() + 6000;
      }}
    />
  );
}
