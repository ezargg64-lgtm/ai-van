// ── Experience: everything inside the Canvas ─────────────────────────────────

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lighting } from './Lighting';
import { World } from './World';
import { Interior } from './Interior';
import { Props } from './Props';
import { AgentAvatar } from './AgentAvatar';
import { AgentLabels } from './AgentLabels';
import { Rig } from './Rig';
import { AGENT_IDS } from '../sim/vanLayout';
import { advanceWorld, clockLabel, phaseLabel, segmentOf, world } from '../sim/timeOfDay';
import { livingSim } from '../sim/livingSim';
import { useHud } from '../state/hudStore';

/** Runs before everything else: advances the clock and ticks the living sim. */
function SimDriver() {
  const simAcc = useRef(0);
  const hudAcc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    advanceWorld(dt);

    simAcc.current += dt;
    if (simAcc.current >= 0.25) {
      simAcc.current = 0;
      livingSim.update(Date.now());
    }

    hudAcc.current += dt;
    if (hudAcc.current >= 0.33) {
      hudAcc.current = 0;
      useHud.getState().setClock(world.t, clockLabel(world.t), segmentOf(world.t), phaseLabel(world.t));
    }
  }, -1);

  return null;
}

export function Experience() {
  const swayGroup = useRef<THREE.Group>(null);

  return (
    <>
      <Lighting />
      <World swayGroup={swayGroup as React.RefObject<THREE.Group>} />
      <Interior />
      <Props />
      {AGENT_IDS.map((id) => (
        <AgentAvatar key={id} id={id} />
      ))}
      <AgentLabels />
      <Rig />
      <SimDriver />
    </>
  );
}
