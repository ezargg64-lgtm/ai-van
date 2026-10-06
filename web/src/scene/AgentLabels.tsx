// ── Speech bubbles + name tags ───────────────────────────────────────────────
// One Html element per agent (five total, cheap). Each follows its head's WORLD
// position every frame instead of being parented into the swaying group, so the
// text never jitters while the van rocks.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { agentAnchors } from './AgentAvatar';
import { useVan } from '../sim/vanStore';

function AgentLabel({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const bubble = useVan((s) => s.agents[id]?.bubble ?? null);
  const speaking = useVan((s) => s.agents[id]?.speaking ?? false);
  const facing = useVan((s) => s.agents[id]?.facingCamera ?? false);
  const roster = useVan((s) => s.roster[id]);
  const vec = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const anchor = agentAnchors[id];
    const target = anchor?.head ?? anchor?.root;
    if (!target || !group.current) return;
    target.getWorldPosition(vec);
    group.current.position.set(vec.x, vec.y + 0.3, vec.z);
  });

  const name = roster?.name ?? id;
  const role = roster?.role ?? '';
  const color = roster?.color ?? '#8ab4f8';

  return (
    <group ref={group}>
      <Html center distanceFactor={6.5} zIndexRange={[30, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div className={`agent-tag${bubble ? ' has-bubble' : ''}${speaking ? ' speaking' : ''}`}>
          {bubble ? (
            <div className="bubble" style={{ borderColor: color }}>
              <span className="bubble-name" style={{ background: color }}>
                {name}
              </span>
              <span className="bubble-text">{bubble.text}</span>
            </div>
          ) : (
            <div className={`pill${facing ? ' facing' : ''}`} style={{ borderColor: color }}>
              <span className="dot" style={{ background: color }} />
              <span className="pill-name">{name}</span>
              <span className="pill-role">{role}</span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

export function AgentLabels() {
  const ids = useVan((s) => s.order);
  return (
    <group>
      {ids.map((id) => (
        <AgentLabel key={id} id={id} />
      ))}
    </group>
  );
}
