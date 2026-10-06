// ── The van itself ───────────────────────────────────────────────────────────
// Honest dollhouse cutaway: no roof, no wall on the camera (+Z) side. All the
// furniture numbers come from sim/vanLayout.ts, so the seats and the bodies agree.
// Renders with at most 3 real lights (see Lighting.tsx) — StringLights are
// emissive meshes only, exactly as the spec demands.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VAN, ZONES } from '../sim/vanLayout';
import { world } from '../sim/timeOfDay';
import { floorTexture, gpsTexture, rugTexture } from './textures';

export const COLORS = {
  floor: '#b98a5a',
  wall: '#f4efe6',
  wallShade: '#e4dbcd',
  trim: '#8d6a4f',
  wood: '#c08b58',
  woodDark: '#8f6136',
  counter: '#7d8b93',
  cabinet: '#dcc7a6',
  fabricTeal: '#3f8b86',
  fabricMustard: '#dfa94a',
  mattress: '#f2ece2',
  blanket: '#6f9fc4',
  metal: '#b7bdc4',
  dark: '#2b2f36',
  plant: '#4a8b50',
  terracotta: '#c96f5a',
  curtain: '#e8dfd0',
  body: '#e9e4d8',
};

type Vec3 = [number, number, number];

/** flat-shaded box: the only primitive we need for furniture */
function B({
  p,
  s,
  c,
  map,
  e,
  ei = 0,
  rough = 0.85,
}: {
  p: Vec3;
  s: Vec3;
  c: string;
  map?: THREE.Texture | null;
  e?: string;
  ei?: number;
  rough?: number;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={c}
        map={map ?? null}
        emissive={e ?? '#000000'}
        emissiveIntensity={ei}
        roughness={rough}
        metalness={0.05}
      />
    </mesh>
  );
}

type Opening = { center: number; width: number; y0: number; y1: number };

/** Split a wall into pieces around window openings (real holes, not decals). */
function wallPieces(length: number, height: number, thickness: number, openings: Opening[]) {
  const pieces: Array<{ p: Vec3; s: Vec3 }> = [];
  const sorted = [...openings].sort((a, b) => a.center - b.center);
  let cursor = -length / 2;
  for (const o of sorted) {
    const left = o.center - o.width / 2;
    const right = o.center + o.width / 2;
    if (left > cursor) {
      pieces.push({ p: [(cursor + left) / 2, height / 2, 0], s: [left - cursor, height, thickness] });
    }
    if (o.y0 > 0) {
      pieces.push({ p: [o.center, o.y0 / 2, 0], s: [o.width, o.y0, thickness] });
    }
    if (o.y1 < height) {
      pieces.push({ p: [o.center, (o.y1 + height) / 2, 0], s: [o.width, height - o.y1, thickness] });
    }
    cursor = right;
  }
  if (cursor < length / 2) {
    pieces.push({ p: [(cursor + length / 2) / 2, height / 2, 0], s: [length / 2 - cursor, height, thickness] });
  }
  return pieces;
}

const WINDOWS: Opening[] = [
  { center: 0.38, width: 0.92, y0: 1.0, y1: 1.62 }, // over the dinette
  { center: -0.42, width: 0.68, y0: 1.06, y1: 1.62 }, // over the galley sink
  { center: -1.68, width: 1.06, y0: 1.0, y1: 1.62 }, // over the sofa
];

function Windows() {
  const glowMats = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(() => {
    const glow = world.lights.window;
    glowMats.current.forEach((m) => {
      if (m) m.emissiveIntensity = 0.25 + glow * 1.5;
    });
  });
  return (
    <group position={[0, 0, -1.14]}>
      {WINDOWS.map((w, i) => (
        <group key={i}>
          {/* glass */}
          <mesh position={[w.center, (w.y0 + w.y1) / 2, 0]}>
            <planeGeometry args={[w.width - 0.03, w.y1 - w.y0 - 0.03]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) glowMats.current[i] = m;
              }}
              color="#cfe6f2"
              emissive="#ffe6b0"
              emissiveIntensity={0.3}
              transparent
              opacity={0.32}
              roughness={0.15}
              metalness={0}
            />
          </mesh>
          {/* frame */}
          <mesh position={[w.center, w.y1 + 0.03, 0]}>
            <boxGeometry args={[w.width + 0.1, 0.06, 0.12]} />
            <meshStandardMaterial color={COLORS.trim} roughness={0.7} />
          </mesh>
          <mesh position={[w.center, w.y0 - 0.03, 0]}>
            <boxGeometry args={[w.width + 0.1, 0.06, 0.14]} />
            <meshStandardMaterial color={COLORS.trim} roughness={0.7} />
          </mesh>
          <mesh position={[w.center - w.width / 2 - 0.03, (w.y0 + w.y1) / 2, 0]}>
            <boxGeometry args={[0.06, w.y1 - w.y0 + 0.12, 0.12]} />
            <meshStandardMaterial color={COLORS.trim} roughness={0.7} />
          </mesh>
          <mesh position={[w.center + w.width / 2 + 0.03, (w.y0 + w.y1) / 2, 0]}>
            <boxGeometry args={[0.06, w.y1 - w.y0 + 0.12, 0.12]} />
            <meshStandardMaterial color={COLORS.trim} roughness={0.7} />
          </mesh>
          {/* curtain panels */}
          {[-1, 1].map((side) => (
            <B
              key={side}
              p={[w.center + side * (w.width / 2 + 0.11), (w.y0 + w.y1) / 2, 0.09]}
              s={[0.14, w.y1 - w.y0 - 0.04, 0.06]}
              c={COLORS.curtain}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Shell() {
  const floorMap = useMemo(() => floorTexture(), []);
  const rugMap = useMemo(() => rugTexture(), []);
  const wheels = useRef<THREE.Mesh[]>([]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const spin = (-world.lights.sun * 0 + 15 * step) / 0.34;
    for (const w of wheels.current) if (w) w.rotation.x += spin;
  });

  const farWall = wallPieces(VAN.length, VAN.ceilingY, VAN.wallThickness, WINDOWS);

  return (
    <group>
      {/* floor */}
      <mesh position={[0, -0.07, 0]} receiveShadow>
        <boxGeometry args={[VAN.length, 0.14, VAN.width]} />
        <meshStandardMaterial map={floorMap} color="#ffffff" roughness={0.9} />
      </mesh>
      {/* rugs */}
      <mesh position={[0.28, 0.006, 0.06]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.25, 1.0]} />
        <meshStandardMaterial map={rugMap} roughness={1} />
      </mesh>
      <mesh position={[-1.62, 0.006, 0.02]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.1, 0.7]} />
        <meshStandardMaterial map={rugMap} roughness={1} />
      </mesh>

      {/* far wall (-Z) with real window holes */}
      <group position={[0, 0, -1.14]}>
        {farWall.map((piece, i) => (
          <B key={i} p={piece.p} s={piece.s} c={COLORS.wall} />
        ))}
      </group>

      {/* rear wall (-X) with one window */}
      <group position={[-2.46, 0, 0]}>
        {wallPieces(VAN.width, VAN.ceilingY, VAN.wallThickness, [{ center: -0.3, width: 0.8, y0: 1.02, y1: 1.6 }]).map(
          (piece, i) => (
            <mesh key={i} position={[piece.p[2], piece.p[1], piece.p[0]]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[piece.s[0], piece.s[1], piece.s[2]]} />
              <meshStandardMaterial color={COLORS.wallShade} roughness={0.9} />
            </mesh>
          ),
        )}
        {/* rear door seam + handle */}
        <mesh position={[-0.03, 1.0, 0.66]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.86, 1.94, 0.03]} />
          <meshStandardMaterial color={COLORS.wall} roughness={0.9} />
        </mesh>
        <mesh position={[-0.06, 1.0, 0.28]}>
          <boxGeometry args={[0.05, 0.16, 0.05]} />
          <meshStandardMaterial color={COLORS.metal} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* corner posts + roof edge beams (the roof is gone) */}
      {[
        [1.0, 1.0],
        [1.0, -1.0],
        [-1.0, 1.0],
        [-1.0, -1.0],
      ].map(([sx, sz], i) => (
        <B key={i} p={[sx * 2.42, VAN.ceilingY / 2, sz * 1.06]} s={[0.11, VAN.ceilingY, 0.11]} c={COLORS.wallShade} />
      ))}
      {[-1.06, 1.06].map((z) => (
        <B key={z} p={[0, VAN.ceilingY - 0.05, z]} s={[VAN.length, 0.1, 0.14]} c={COLORS.wallShade} />
      ))}
      {[-2.42, 2.42].map((x) => (
        <B key={x} p={[x, VAN.ceilingY - 0.05, 0]} s={[0.14, 0.1, VAN.width]} c={COLORS.wallShade} />
      ))}

      {/* side sill on the open side (the doorway) */}
      <B p={[0.4, 0.985, 1.1]} s={[1.5, 0.06, 0.1]} c={COLORS.trim} />
      <B p={[0.4, -0.2, 1.2]} s={[1.5, 0.4, 0.3]} c={COLORS.body} />

      {/* underbody + wheels: this is a van, not a box */}
      <B p={[0, -0.42, 0]} s={[VAN.length + 0.1, 0.62, VAN.width + 0.14]} c={COLORS.body} />
      <B p={[2.62, -0.05, 0]} s={[0.5, 1.1, VAN.width + 0.06]} c={COLORS.body} />
      <B p={[2.86, -0.38, 0]} s={[0.22, 0.3, VAN.width + 0.02]} c={COLORS.dark} />
      <B p={[-2.66, -0.38, 0]} s={[0.2, 0.3, VAN.width + 0.02]} c={COLORS.dark} />
      {[
        [1.55, 1.12],
        [1.55, -1.12],
        [-1.5, 1.12],
        [-1.5, -1.12],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) wheels.current[i] = m;
          }}
          position={[x, -0.44, z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.34, 0.34, 0.22, 14]} />
          <meshStandardMaterial color="#22242a" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Cab() {
  const gps = useMemo(() => gpsTexture(), []);
  return (
    <group>
      {/* dashboard */}
      <B p={[2.16, 0.86, 0]} s={[0.62, 0.3, 2.0]} c={COLORS.dark} />
      <B p={[2.16, 0.99, 0]} s={[0.66, 0.06, 2.04]} c="#3a3f47" />
      {/* GPS screen */}
      <mesh position={[2.02, 1.06, -0.75]} rotation={[0, -0.5, -0.25]}>
        <planeGeometry args={[0.34, 0.26]} />
        <meshBasicMaterial map={gps} toneMapped={false} />
      </mesh>
      {/* windshield: front wall with a big hole */}
      <group position={[VAN.halfLength - 0.04, 0, 0]}>
        <B p={[0, 0.42, 0]} s={[VAN.wallThickness, 0.86, VAN.width]} c={COLORS.wall} />
        <B p={[0, 1.93, 0]} s={[VAN.wallThickness, 0.26, VAN.width]} c={COLORS.wall} />
        {[-1, 1].map((side) => (
          <B key={side} p={[0, 1.38, side * 1.0]} s={[VAN.wallThickness, 1.06, 0.2]} c={COLORS.wall} />
        ))}
        <mesh position={[0.06, 1.4, 0]} rotation={[0, 0, 0.09]}>
          <planeGeometry args={[1.8, 0.96]} />
          <meshStandardMaterial
            color="#cfe6f2"
            transparent
            opacity={0.22}
            roughness={0.1}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      {/* steering wheel */}
      <group position={[2.05, 1.0, -0.45]} rotation={[0, 0, 1.15]}>
        <mesh castShadow>
          <torusGeometry args={[0.16, 0.026, 8, 20]} />
          <meshStandardMaterial color="#2a2d33" roughness={0.6} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.3, 0.03, 0.03]} />
          <meshStandardMaterial color="#2a2d33" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.03, 0.03, 0.3]} />
          <meshStandardMaterial color="#2a2d33" />
        </mesh>
      </group>
      {/* driver swivel seat (facing the living area) */}
      <group position={[1.8, 0, -0.45]} rotation={[0, -1.11, 0]}>
        <B p={[0, 0.24, 0]} s={[0.46, 0.12, 0.44]} c={COLORS.dark} />
        <B p={[0, 0.34, 0]} s={[0.06, 0.22, 0.06]} c={COLORS.metal} />
        <B p={[0, 0.44, 0]} s={[0.5, 0.1, 0.46]} c="#4a5361" />
        <group position={[0, 0.49, -0.22]} rotation={[0.16, 0, 0]}>
          <B p={[0, 0.24, 0]} s={[0.48, 0.48, 0.1]} c="#3f4855" />
        </group>
      </group>
      {/* passenger seat */}
      <group position={[1.86, 0, 0.5]}>
        <B p={[0, 0.3, 0]} s={[0.48, 0.34, 0.46]} c="#3f4855" />
        <group position={[0, 0.47, 0.22]} rotation={[-0.16, 0, 0]}>
          <B p={[0, 0.24, 0]} s={[0.46, 0.48, 0.1]} c="#3f4855" />
        </group>
        <B p={[0, 0.07, 0]} s={[0.4, 0.14, 0.4]} c={COLORS.dark} />
      </group>
      {/* dash plant + a mug in the cupholder */}
      <group position={[2.12, 1.02, 0.72]}>
        <B p={[0, 0.06, 0]} s={[0.14, 0.12, 0.14]} c={COLORS.terracotta} />
        <mesh position={[0, 0.2, 0]} castShadow>
          <icosahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial color={COLORS.plant} flatShading roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

function Dinette() {
  return (
    <group>
      {/* table */}
      <B p={[0.28, 0.63, -0.12]} s={[1.05, 0.06, 0.55]} c={COLORS.wood} />
      <B p={[0.28, 0.31, -0.12]} s={[0.09, 0.62, 0.09]} c={COLORS.metal} />
      <B p={[0.28, 0.03, -0.12]} s={[0.5, 0.05, 0.4]} c={COLORS.woodDark} />
      {/* far bench */}
      <B p={[0.42, 0.175, -0.78]} s={[1.0, 0.35, 0.36]} c={COLORS.woodDark} />
      <B p={[0.42, 0.395, -0.78]} s={[1.0, 0.09, 0.36]} c={COLORS.fabricTeal} />
      <group position={[0.42, 0.44, -0.97]} rotation={[0.14, 0, 0]}>
        <B p={[0, 0.21, 0]} s={[1.0, 0.42, 0.1]} c={COLORS.fabricTeal} />
      </group>
      {/* near stool bench */}
      <B p={[0.4, 0.175, 0.46]} s={[0.72, 0.35, 0.34]} c={COLORS.woodDark} />
      <B p={[0.4, 0.395, 0.46]} s={[0.72, 0.09, 0.34]} c={COLORS.fabricMustard} />
      {/* bench cushions */}
      <B p={[0.15, 0.45, -0.95]} s={[0.3, 0.3, 0.16]} c={COLORS.fabricMustard} />
      <B p={[0.3, 0.68, -0.12]} s={[0.3, 0.04, 0.22]} c="#f6f1e8" />
    </group>
  );
}

function Galley() {
  return (
    <group>
      {/* cabinet + counter */}
      <B p={[-0.38, 0.43, -0.85]} s={[0.78, 0.86, 0.5]} c={COLORS.cabinet} />
      <B p={[-0.38, 0.885, -0.84]} s={[0.82, 0.05, 0.56]} c={COLORS.counter} />
      <B p={[-0.38, 0.62, -0.6]} s={[0.72, 0.42, 0.03]} c="#cbb595" />
      <B p={[-0.38, 0.62, -0.585]} s={[0.22, 0.03, 0.03]} c={COLORS.metal} />
      {/* sink */}
      <B p={[-0.62, 0.875, -0.82]} s={[0.34, 0.06, 0.3]} c="#8d979d" />
      <mesh position={[-0.62, 0.905, -0.82]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.28, 0.24]} />
        <meshStandardMaterial color="#5f686e" roughness={0.4} metalness={0.4} />
      </mesh>
      <B p={[-0.77, 0.98, -0.9]} s={[0.04, 0.16, 0.04]} c={COLORS.metal} />
      <B p={[-0.72, 1.05, -0.87]} s={[0.12, 0.035, 0.035]} c={COLORS.metal} />
      {/* stove */}
      <B p={[-0.2, 0.912, -0.84]} s={[0.34, 0.02, 0.44]} c="#31353b" />
      {[-0.28, -0.12].map((x) => (
        <mesh key={x} position={[x, 0.925, -0.84]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.012, 6, 14]} />
          <meshStandardMaterial color="#6d747c" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* kettle on the stove (a static one: agents carry their own) */}
      <group position={[-0.3, 0.98, -0.84]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.09, 0.12, 10]} />
          <meshStandardMaterial color={COLORS.metal} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0.08, 0.02, 0]} rotation={[0, 0, -0.6]}>
          <boxGeometry args={[0.13, 0.02, 0.02]} />
          <meshStandardMaterial color={COLORS.metal} metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
      {/* shelf with mugs */}
      <B p={[-0.38, 1.44, -1.04]} s={[0.62, 0.04, 0.2]} c={COLORS.wood} />
      {[-0.56, -0.38, -0.2].map((x, i) => (
        <mesh key={x} position={[x, 1.5, -1.04]} castShadow>
          <cylinderGeometry args={[0.04, 0.035, 0.08, 8]} />
          <meshStandardMaterial color={[COLORS.fabricMustard, COLORS.fabricTeal, '#f2f0ea'][i]} roughness={0.8} />
        </mesh>
      ))}
      {/* spice jars */}
      {[-0.66, -0.6].map((x) => (
        <mesh key={x} position={[x, 1.51, -0.98]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.06, 7]} />
          <meshStandardMaterial color="#a8763f" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Sofa() {
  return (
    <group>
      <B p={[-1.62, 0.17, -0.58]} s={[1.25, 0.34, 0.6]} c={COLORS.woodDark} />
      {[-1.94, -1.3].map((x) => (
        <B key={x} p={[x, 0.39, -0.58]} s={[0.6, 0.1, 0.58]} c={COLORS.fabricTeal} />
      ))}
      <group position={[-1.62, 0.44, -0.9]} rotation={[0.16, 0, 0]}>
        <B p={[0, 0.24, 0]} s={[1.25, 0.48, 0.12]} c={COLORS.fabricTeal} />
      </group>
      {/* throw pillows */}
      <B p={[-2.08, 0.58, -0.78]} s={[0.26, 0.26, 0.1]} c={COLORS.fabricMustard} />
      <B p={[-1.16, 0.58, -0.78]} s={[0.24, 0.24, 0.1]} c="#d9705f" />
      {/* armrest */}
      <B p={[-2.28, 0.34, -0.58]} s={[0.12, 0.4, 0.6]} c={COLORS.woodDark} />
    </group>
  );
}

function Bunk() {
  return (
    <group>
      {/* platform + mattress */}
      <B p={[1.93, 1.1, -0.3]} s={[1.02, 0.12, 1.52]} c={COLORS.woodDark} />
      <mesh position={[1.93, 1.21, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.14, 1.48]} />
        <meshStandardMaterial color={COLORS.mattress} roughness={1} />
      </mesh>
      {/* pillow + blanket */}
      <B p={[1.93, 1.34, 0.24]} s={[0.62, 0.16, 0.34]} c="#ffffff" />
      <B p={[1.93, 1.4, -0.62]} s={[0.94, 0.07, 0.62]} c={COLORS.blanket} />
      {/* support posts */}
      <B p={[1.5, 0.6, -1.02]} s={[0.08, 1.2, 0.08]} c={COLORS.metal} />
      <B p={[2.38, 0.6, -1.02]} s={[0.08, 1.2, 0.08]} c={COLORS.metal} />
      {/* ladder at the open edge */}
      <group position={[1.92, 0.72, 0.58]}>
        {[-0.3, 0.3].map((dx) => (
          <B key={dx} p={[dx, 0, 0]} s={[0.06, 1.44, 0.06]} c={COLORS.wood} />
        ))}
        {[-0.58, -0.28, 0.02, 0.32, 0.62].map((dy) => (
          <B key={dy} p={[0, dy, 0]} s={[0.62, 0.05, 0.05]} c={COLORS.wood} />
        ))}
      </group>
      {/* reading light (emissive only) */}
      <mesh position={[1.98, 1.62, -1.06]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#fff3d0" emissive="#ffd88a" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

/** Emissive-only fairy lights: no real lights, exactly per the light budget. */
function StringLights() {
  const geo = useMemo(() => new THREE.SphereGeometry(0.036, 8, 6), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffd27a', emissiveIntensity: 0.4, toneMapped: false }),
    [],
  );
  const count = 15;

  useFrame(() => {
    const s = world.lights.strings;
    mat.emissiveIntensity = 0.15 + s * 2.6;
    mat.opacity = 1;
  });

  return (
    <group>
      {[-1.0, 1.0].map((z) => (
        <group key={z}>
          <B p={[0, 1.9, z]} s={[4.7, 0.015, 0.015]} c="#6b6257" />
          <instancedMesh
            args={[geo, mat, count]}
            position={[0, 1.87, z]}
            ref={(mesh) => {
              if (!mesh) return;
              const dummy = new THREE.Object3D();
              for (let i = 0; i < count; i++) {
                dummy.position.set(-2.25 + (i / (count - 1)) * 4.5, Math.sin(i * 1.7) * 0.03, 0);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
              }
              mesh.instanceMatrix.needsUpdate = true;
            }}
          />
        </group>
      ))}
      {/* pendant over the dinette: shade + bulb, wired to the edge beam */}
      <B p={[0.28, 1.98, -0.2]} s={[0.015, 0.14, 0.015]} c="#6b6257" />
      <mesh position={[0.28, 1.82, -0.2]} castShadow>
        <coneGeometry args={[0.22, 0.2, 14, 1, true]} />
        <meshStandardMaterial color="#3f4855" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      <mesh position={[0.28, 1.76, -0.2]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial color="#fff2cf" emissive="#ffcf82" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

export function Interior() {
  void ZONES;
  return (
    <group>
      <Shell />
      <Windows />
      <Cab />
      <Dinette />
      <Galley />
      <Sofa />
      <Bunk />
      <StringLights />
    </group>
  );
}
