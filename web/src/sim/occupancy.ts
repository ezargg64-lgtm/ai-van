// ── Slot occupancy ───────────────────────────────────────────────────────────
// Shared bookkeeping between livingSim (idle) and taskStaging (interrupts) so two
// agents never claim the same cushion. Also holds the "staged" set: agents under
// task/meeting control, which livingSim must not touch.

import { ZONES, slotFor, type Slot } from './vanLayout';
import type { ZoneId } from './types';

const key = (zone: ZoneId, slot: number) => `${zone}:${slot}`;

const owner = new Map<string, string>();
const stagedAgents = new Set<string>();

export const occupancy = {
  /** true while a task/meeting owns this agent */
  isStaged(id: string) {
    return stagedAgents.has(id);
  },

  stage(id: string) {
    stagedAgents.add(id);
  },

  unstage(id: string) {
    stagedAgents.delete(id);
  },

  unstageAll() {
    stagedAgents.clear();
  },

  whoAt(zone: ZoneId, slot: number): string | undefined {
    return owner.get(key(zone, slot));
  },

  /** Try to seat an agent in a specific slot. Ignores its own previous claim. */
  claim(id: string, zone: ZoneId, slot: number): boolean {
    const k = key(zone, slot);
    const current = owner.get(k);
    if (current && current !== id) return false;
    this.release(id);
    owner.set(k, id);
    return true;
  },

  release(id: string) {
    for (const [k, v] of owner) if (v === id) owner.delete(k);
  },

  /** Indices of seats in a zone nobody is using (proper seats, then overflow). */
  freeSlots(zone: ZoneId, exclude?: string): number[] {
    const def = ZONES[zone];
    if (!def) return [];
    const all = [...def.slots, ...(def.overflow ?? [])];
    const free: number[] = [];
    for (let i = 0; i < all.length; i++) {
      const who = owner.get(key(zone, i));
      if (!who || who === exclude) free.push(i);
    }
    return free;
  },

  /** Is this seat one of the zone's proper seats (not an overflow spot)? */
  isProper(zone: ZoneId, slot: number): boolean {
    return slot < (ZONES[zone]?.slots.length ?? 0);
  },

  /** Best free seat in a zone, preferring proper seats. */
  takeSeat(id: string, zone: ZoneId): number | null {
    const free = this.freeSlots(zone, id);
    if (!free.length) return null;
    const proper = free.find((s) => this.isProper(zone, s));
    const chosen = proper ?? free[0];
    this.claim(id, zone, chosen);
    return chosen;
  },

  slotOf(zone: ZoneId, slot: number): Slot {
    return slotFor(zone, slot);
  },

  snapshot() {
    return {
      owner: new Map(owner),
      staged: new Set(stagedAgents),
    };
  },

  restore(snap: { owner: Map<string, string>; staged: Set<string> }) {
    owner.clear();
    for (const [k, v] of snap.owner) owner.set(k, v);
    stagedAgents.clear();
    for (const v of snap.staged) stagedAgents.add(v);
  },

  debug() {
    return Object.fromEntries(owner);
  },
};
