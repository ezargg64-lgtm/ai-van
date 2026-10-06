// ── The world outside the windows ────────────────────────────────────────────
// Curved panorama cylinder (day + night canvas textures, generated once and
// crossfaded), scrolling ground, road with dashes, guardrail posts, forest and
// distant hills. Everything scrolls toward the rear; nothing here casts shadows.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { panoramaTexture } from './textures';
import { motion, scrollX, updateMotion, SCROLL_SPAN } from './motion';
import { world } from '../sim/timeOfDay';

export const GROUND_Y = -0.78;
const PANO_RADIUS = 45;
const PANO_LOW = GROUND_Y;
const PANO_HIGH = 14;
const PANO_HEIGHT = PANO_HIGH - PANO_LOW;
/** one texture repeat covers this many metres of the horizon */
const PANO_METRES_PER_REPEAT = (2 * Math.PI * PANO_RADIUS) / 2;

type Item = { x: number; z: number; s: number; r: number };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeItems(count: number, seed: number, zMin: number, zMax: number, sMin: number, sMax: number): Item[] {
  const r = seeded(seed);
  return Array.from({ length: count }, () => {
    const side = r() < 0.5 ? -1 : 1;
    const z = side * (zMin + r() * (zMax - zMin));
    return { x: (r() - 0.5) * SCROLL_SPAN, z, s: sMin + r() * (sMax - sMin), r: r() };
  });
}

/** Instanced + scrolling. Geometry/material are plain THREE objects. */
function ScrollingInstances({
  geometry,
  material,
  items,
  factor = 1,
  y = 0,
  matrixFor,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: Item[];
  factor?: number;
  y?: number;
  matrixFor: (item: Item, dummy: THREE.Object3D, index: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const live = useRef<Item[]>(items.map((i) => ({ ...i })));

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < live.current.length; i++) {
      const item = live.current[i];
      item.x = scrollX(item.x, step, factor);
      matrixFor(item, dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      position={[0, y, 0]}
      frustumCulled={false}
    />
  );
}

export function Panorama() {
  const dayMap = useMemo(() => panoramaTexture(true), []);
  const nightMap = useMemo(() => panoramaTexture(false), []);
  const dayMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: dayMap,
        side: THREE.BackSide,
        toneMapped: false,
        depthWrite: true,
        // the backdrop paints its own atmosphere: keep it out of the scene fog,
        // which exists to melt the mid-distance trees and hills into the horizon
        fog: false,
      }),
    [dayMap],
  );
  const nightMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: nightMap,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
        fog: false,
      }),
    [nightMap],
  );
  const nightRef = useRef<THREE.Mesh>(null);

  useMemo(() => {
    for (const m of [dayMap, nightMap]) {
      m.wrapS = THREE.RepeatWrapping;
      m.repeat.set(2, 1);
    }
  }, [dayMap, nightMap]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const scroll = (motion.speed * step) / PANO_METRES_PER_REPEAT;
    dayMap.offset.x = (dayMap.offset.x + scroll) % 1;
    nightMap.offset.x = (nightMap.offset.x + scroll) % 1;
    nightMat.opacity = Math.min(1, Math.max(0, world.lights.night));
    if (nightRef.current) nightRef.current.visible = nightMat.opacity > 0.01;
  });

  return (
    <group>
      <mesh position={[0, (PANO_HIGH + PANO_LOW) / 2, 0]} material={dayMat}>
        <cylinderGeometry args={[PANO_RADIUS, PANO_RADIUS, PANO_HEIGHT, 72, 1, true]} />
      </mesh>
      <mesh
        ref={nightRef}
        position={[0, (PANO_HIGH + PANO_LOW) / 2, 0]}
        material={nightMat}
        renderOrder={1}
      >
        <cylinderGeometry args={[PANO_RADIUS - 0.6, PANO_RADIUS - 0.6, PANO_HEIGHT, 72, 1, true]} />
      </mesh>
    </group>
  );
}

function Road() {
  const dashGeo = useMemo(() => new THREE.BoxGeometry(2.2, 0.03, 0.16), []);
  const dashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f4f1e4' }), []);
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.12, 0.9, 0.12), []);
  const postMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#cfd6dc' }), []);
  const bushGeo = useMemo(() => new THREE.IcosahedronGeometry(0.6, 0), []);
  const bushMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#3f6b45', flatShading: true }), []);

  const dashes = useMemo(() => makeItems(26, 3, 0.05, 0.05, 1, 1), []);
  const posts = useMemo(
    () =>
      makeItems(30, 9, 2.7, 2.7, 1, 1).map((p, i) => ({
        ...p,
        z: i % 2 === 0 ? 2.7 : -2.7,
      })),
    [],
  );
  const bushes = useMemo(
    () => makeItems(40, 21, 5.5, 16, 0.6, 1.8).map((b) => ({ ...b, z: b.z < 0 ? -Math.abs(b.z) : Math.abs(b.z) })),
    [],
  );

  return (
    <group>
      {/* road surface */}
      <mesh position={[0, GROUND_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <planeGeometry args={[SCROLL_SPAN, 5.2]} />
        <meshLambertMaterial color="#3b3f46" />
      </mesh>
      {/* edge lines */}
      {[-2.35, 2.35].map((z) => (
        <mesh key={z} position={[0, GROUND_Y + 0.015, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[SCROLL_SPAN, 0.12]} />
          <meshBasicMaterial color="#e8e3cf" />
        </mesh>
      ))}
      <ScrollingInstances
        geometry={dashGeo}
        material={dashMat}
        items={dashes}
        y={GROUND_Y + 0.02}
        matrixFor={(item, d) => {
          d.position.set(item.x, 0, 0);
          d.rotation.set(0, 0, 0);
          d.scale.set(1, 1, 1);
        }}
      />
      <ScrollingInstances
        geometry={postGeo}
        material={postMat}
        items={posts}
        y={GROUND_Y + 0.45}
        matrixFor={(item, d) => {
          d.position.set(item.x, 0, item.z);
          d.scale.set(1, 1, 1);
        }}
      />
      <ScrollingInstances
        geometry={bushGeo}
        material={bushMat}
        items={bushes}
        y={GROUND_Y + 0.4}
        matrixFor={(item, d) => {
          d.position.set(item.x, 0, item.z);
          const s = item.s;
          d.scale.set(s, s * 0.8, s);
          d.rotation.set(0, item.r * 6, 0);
        }}
      />
    </group>
  );
}

function Forest() {
  const trees = useMemo(() => makeItems(44, 101, 8, 30, 2.2, 6.4), []);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.16, 0.22, 1.6, 5), []);
  const trunkMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#5a4632', flatShading: true }), []);
  const crownGeo = useMemo(() => new THREE.ConeGeometry(1, 2.6, 6), []);
  const crownMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#2f6b45', flatShading: true }), []);
  const hills = useMemo(() => makeItems(14, 555, 46, 110, 12, 30), []);
  const hillGeo = useMemo(() => new THREE.ConeGeometry(1, 1, 5), []);
  const hillMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#4d6a5c', flatShading: true }), []);

  const trunkY = GROUND_Y + 0.8;
  const crownY = GROUND_Y + 2.6;

  return (
    <group>
      <ScrollingInstances
        geometry={trunkGeo}
        material={trunkMat}
        items={trees}
        y={trunkY}
        matrixFor={(item, d) => {
          d.position.set(item.x, 0, item.z);
          const s = Math.min(item.s / 4, 1.4);
          d.scale.set(s, s, s);
          d.rotation.set(0, 0, 0);
        }}
      />
      <ScrollingInstances
        geometry={crownGeo}
        material={crownMat}
        items={trees}
        y={crownY}
        matrixFor={(item, d) => {
          d.position.set(item.x, (item.s - 2.2) * 0.25, item.z);
          const s = item.s / 4;
          d.scale.set(s, s * 1.35, s);
          d.rotation.set(0, item.r * 6, 0);
        }}
      />
      <ScrollingInstances
        geometry={hillGeo}
        material={hillMat}
        items={hills}
        factor={0.35}
        y={GROUND_Y}
        matrixFor={(item, d) => {
          d.position.set(item.x, item.s * 0.28, item.z);
          d.scale.set(item.s * 1.6, item.s * 0.55, item.s * 1.6);
          d.rotation.set(0, item.r * 3, 0);
        }}
      />
    </group>
  );
}

export function World({ swayGroup }: { swayGroup: React.RefObject<THREE.Group> }) {
  const groundGeo = useMemo(() => new THREE.PlaneGeometry(220, 220), []);
  const groundMat = useMemo(
    () => new THREE.MeshLambertMaterial({ color: '#6d9459' }),
    [],
  );

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    updateMotion(step);
    const g = swayGroup.current;
    if (g) {
      g.rotation.set(motion.rotX, 0, motion.rotZ);
      g.position.y = motion.y;
    }
  });

  return (
    <group ref={swayGroup}>
      <mesh
        geometry={groundGeo}
        material={groundMat}
        position={[0, GROUND_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <Road />
      <Forest />
      <Panorama />
    </group>
  );
}
