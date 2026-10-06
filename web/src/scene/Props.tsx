// ── Scenery props ────────────────────────────────────────────────────────────
// Set dressing that is always there (beanbag, guitar, wall art, kettle steam).
// It reads the state contract only — never the backend.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVan } from '../sim/vanStore';
import { COLORS } from './Interior';

function B({ p, s, c, r = [0, 0, 0] }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.82} />
    </mesh>
  );
}

/** Steam over the stove kettle whenever somebody is making coffee or cooking. */
function KettleSteam() {
  const group = useRef<THREE.Group>(null);
  const puffs = useRef<Array<THREE.Mesh | null>>([]);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }),
    [],
  );
  const active = useVan((s) =>
    Object.values(s.agents).some((a) => a.activity === 'coffee' || a.activity === 'cooking'),
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    const t = state.clock.elapsedTime;
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const k = ((t * 0.5 + i / 6) % 1) * 1;
      m.position.y = 1.06 + k * 0.55;
      m.position.x = -0.3 + Math.sin((t + i) * 1.6) * 0.05 * k;
      const s = 0.035 + k * 0.09;
      m.scale.setScalar(s / 0.05);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.4;
    });
    void mat;
  });

  return (
    <group ref={group} visible={false}>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            puffs.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.05, 7, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Props() {
  return (
    <group>
      {/* beanbag on the floor (the overflow seat) */}
      <mesh position={[-0.5, 0.16, 0.8]} scale={[0.5, 0.3, 0.5]} castShadow receiveShadow>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={COLORS.fabricMustard} roughness={1} flatShading />
      </mesh>

      {/* guitar leaning in the rear corner */}
      <group position={[-2.24, 0.52, 0.86]} rotation={[0.18, 0.4, 0.28]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.17, 0.2, 0.1, 14]} />
          <meshStandardMaterial color="#c96f5a" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow>
          <boxGeometry args={[0.07, 0.6, 0.05]} />
          <meshStandardMaterial color="#8f6136" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[0.11, 0.14, 0.05]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.6} />
        </mesh>
      </group>

      {/* wall art: two little framed prints on the far wall */}
      {[
        [1.35, 1.42, 0.26, 0.34, '#7fb3c8'],
        [-2.18, 1.5, 0.22, 0.28, '#e0a06a'],
      ].map(([x, y, w, h, c], i) => (
        <group key={i} position={[x as number, y as number, -1.07]}>
          <mesh>
            <boxGeometry args={[w as number, h as number, 0.03]} />
            <meshStandardMaterial color="#6b5340" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[(w as number) - 0.05, (h as number) - 0.05]} />
            <meshStandardMaterial color={c as string} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* solar / battery panel with a tiny LED bar */}
      <group position={[1.25, 1.34, -1.07]}>
        <B p={[0, 0, 0]} s={[0.22, 0.3, 0.04]} c="#e6e6e6" />
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.05 + i * 0.05, -0.06, 0.03]}>
            <boxGeometry args={[0.03, 0.03, 0.01]} />
            <meshStandardMaterial color="#3ddc84" emissive="#2fbf6f" emissiveIntensity={1.6} />
          </mesh>
        ))}
      </group>

      {/* hanging pan + towel by the galley */}
      <group position={[-0.02, 1.36, -1.05]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.04, 12]} />
          <meshStandardMaterial color="#4a5158" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
      <B p={[0.14, 1.28, -1.03]} s={[0.16, 0.24, 0.02]} c="#d9705f" />

      {/* on the dinette table: mug, notebook, map */}
      <mesh position={[0.62, 0.71, -0.24]} castShadow>
        <cylinderGeometry args={[0.038, 0.032, 0.08, 10]} />
        <meshStandardMaterial color="#f2f0ea" roughness={0.8} />
      </mesh>
      <B p={[0.12, 0.685, -0.02]} s={[0.16, 0.03, 0.22]} c="#e8b64c" />
      <mesh position={[-0.2, 0.665, 0.02]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color="#dfe7d8" roughness={0.95} />
      </mesh>

      <KettleSteam />
    </group>
  );
}
