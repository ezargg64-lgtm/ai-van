// ── Lighting rig: exactly 3 real-time lights ─────────────────────────────────
//   1. directional sun/moon (the only shadow caster)
//   2. warm pendant over the dinette
//   3. cyan cab / dash glow
// Ambient is free. String lights and window glow are emissive meshes only.
// Sun colours, intensities and the fog/sky colour all come from sim/timeOfDay.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../sim/timeOfDay';

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const cab = useRef<THREE.PointLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();

  const skyColor = useRef(new THREE.Color('#9ccbf5'));
  const fogColor = useRef(new THREE.Color('#bcd8ef'));
  const tmp = useRef(new THREE.Color());

  useFrame(() => {
    const L = world.lights;
    if (sun.current) {
      sun.current.position.set(L.sunPos[0], L.sunPos[1], L.sunPos[2]);
      sun.current.intensity = L.sun;
      sun.current.color.set(L.sunColor);
    }
    if (lamp.current) {
      lamp.current.intensity = L.lamp * 3.4;
      lamp.current.color.set(L.lamp > 0.8 ? '#ffc98a' : '#ffe3bd');
    }
    if (cab.current) {
      cab.current.intensity = L.cab * 1.6;
    }
    if (ambient.current) {
      ambient.current.intensity = L.ambient;
      ambient.current.color.set(L.ambientColor);
    }

    skyColor.current.set(L.sky);
    scene.background = skyColor.current;
    // fog picks up a touch of the ambient warm/cool so the far forest melts in
    tmp.current.set(L.ambientColor);
    fogColor.current.copy(skyColor.current).lerp(tmp.current, 0.35);
    if (!scene.fog) scene.fog = new THREE.Fog(fogColor.current, 38, 130);
    (scene.fog as THREE.Fog).color.copy(fogColor.current);
  });

  return (
    <group>
      <ambientLight ref={ambient} intensity={0.6} />
      <directionalLight
        ref={sun}
        position={[14, 18, -8]}
        intensity={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0012}
      />
      {/* pendant over the dinette */}
      <pointLight ref={lamp} position={[0.28, 1.74, -0.2]} intensity={2} distance={7} decay={1.6} color="#ffd9a0" />
      {/* dash / GPS glow */}
      <pointLight ref={cab} position={[2.0, 1.05, 0.6]} intensity={1} distance={4.5} decay={1.8} color="#7fe6ff" />
    </group>
  );
}
