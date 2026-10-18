// ── STATE CONTRACT ───────────────────────────────────────────────────────────
// The simulation layer writes this. The scene only reads it.
// Nothing under scene/ may import backend types or fetch responses.

export type ZoneId =
  | 'driver-seat'
  | 'dinette'
  | 'sofa'
  | 'bunk'
  | 'galley'
  | 'floor'
  | 'aisle';

export type Pose =
  | 'sit-upright'
  | 'sit-crossleg'
  | 'lie-side'
  | 'lounge'
  | 'stand'
  | 'shuffle';

export type ActivityId =
  | 'coding'
  | 'sleeping'
  | 'cooking'
  | 'gaming'
  | 'reading'
  | 'window'
  | 'coffee'
  | 'chat';

export type PropId = 'laptop' | 'book' | 'kettle' | 'handheld' | 'mug';

export type Mode = 'idle' | 'task' | 'meeting';

/** Optional look override: a zone id, an agent id, or 'camera'. */
export type LookTarget = string | null;

export type VanAgentState = {
  id: string;
  zone: ZoneId;
  /** Slot index inside the zone (which seat). Assigned by the sim. */
  slot: number;
  pose: Pose;
  activity: ActivityId | null;
  propId: PropId | null;
  facingCamera: boolean;
  bubble: { text: string; until: number } | null;
  // ── rendering hints (extra, still sim-written) ──
  lookAt: LookTarget;
  speaking: boolean;
  zzz: boolean;
};
