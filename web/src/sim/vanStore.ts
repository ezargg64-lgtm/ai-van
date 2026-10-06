// ── The scene's only input ───────────────────────────────────────────────────
// The simulation layer (livingSim + taskStaging) is the ONLY writer of this
// store. Scene components read it and never touch the network.

import { create } from 'zustand';
import { ROSTER, slotFor, type Slot } from './vanLayout';
import type { Mode, VanAgentState, ZoneId } from './types';

export type RosterEntry = { id: string; name: string; role: string; color: string };

function initialState(entry: (typeof ROSTER)[number]): VanAgentState {
  const slot: Slot = slotFor(entry.defaultZone, 0);
  const zone: ZoneId = entry.defaultZone;
  return {
    id: entry.id,
    zone,
    slot: 0,
    pose: slot.pose,
    activity: null,
    propId: null,
    facingCamera: false,
    bubble: null,
    lookAt: null,
    speaking: false,
    zzz: false,
  };
}

export type VanStore = {
  agents: Record<string, VanAgentState>;
  roster: Record<string, RosterEntry>;
  /** index order drives staging stagger (150ms apart) */
  order: string[];
  mode: Mode;
  setAgent: (id: string, patch: Partial<VanAgentState>) => void;
  setMode: (mode: Mode) => void;
  setRoster: (agents: RosterEntry[]) => void;
};

export const useVan = create<VanStore>((set) => ({
  agents: Object.fromEntries(ROSTER.map((r) => [r.id, initialState(r)])),
  roster: Object.fromEntries(ROSTER.map((r) => [r.id, { id: r.id, name: r.name, role: r.role, color: r.color }])),
  order: ROSTER.map((r) => r.id),
  mode: 'idle',

  setAgent: (id, patch) =>
    set((state) => {
      const current = state.agents[id];
      if (!current) return state;
      return { agents: { ...state.agents, [id]: { ...current, ...patch } } };
    }),

  setMode: (mode) => set({ mode }),

  setRoster: (agents) =>
    set((state) => {
      const roster = { ...state.roster };
      for (const a of agents) {
        const prev = roster[a.id];
        if (prev) roster[a.id] = { ...prev, name: a.name, role: a.role, color: a.color };
      }
      return { roster };
    }),
}));

/** Convenience for non-reactive reads inside useFrame. */
export const agentState = (id: string): VanAgentState => useVan.getState().agents[id];
