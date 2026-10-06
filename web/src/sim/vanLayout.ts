// ── vanLayout.ts — SINGLE SOURCE OF TRUTH for the van ────────────────────────
// Every position in the 3D scene comes from here. Axes:
//   +X = forward (cab / windshield)      -X = rear door
//   +Y = up                              floor top at y = 0
//   +Z = the OPEN (camera) side          -Z = the long wall with the windows
// Roof and the +Z long wall are absent: honest dollhouse cutaway, not transparency.
// A "slot" is a hip anchor: [x, hipY, z] in world metres. The avatar's root is
// placed at hipY - STAND_HIP_Y, so one convention covers sitting, standing and lying.

import type { ActivityId, Pose, PropId, ZoneId } from './types';

export const STAND_HIP_Y = 0.82;
export const STAND_HEIGHT = 1.62;

export const VAN = {
  length: 5.0,
  width: 2.2,
  halfLength: 2.5,
  halfWidth: 1.1,
  floorY: 0,
  ceilingY: 2.06,
  wallThickness: 0.08,
  /** external floor of the world (below the wheels' tops) */
  groundY: -0.78,
  openSideZ: 1,
};

/**
 * The over-cab bunk, as a volume. Shared by the scene, the sim and the rig test.
 * The underside is high enough for a seated head (1.32) to clear it, and the
 * mattress top is at 1.52, so a lying body tops out at ~1.93 — under the 2.06
 * wall height. The camera-side edge is at z = 0.42: anything more towards +Z stays
 * visible from the default framing, which is why the swivel seat lives out there.
 */
export const BUNK_SLAB = {
  x: [1.44, 2.44] as [number, number],
  z: [-1.06, 0.42] as [number, number],
  bottom: 1.34,
  mattressTop: 1.52,
};

export type Slot = {
  zone: ZoneId;
  /** hip anchor [x, y, z] */
  pos: [number, number, number];
  yaw: number;
  pose: Pose;
  /** free-text note for debugging / the layout diagram */
  note?: string;
};

type ZoneDef = {
  id: ZoneId;
  label: string;
  /** seats that count as "proper" spots for this zone */
  slots: Slot[];
  /** where a 4th/5th huddler goes when the seats are taken */
  overflow?: Slot[];
};

export const ZONES: Record<ZoneId, ZoneDef> = {
  'driver-seat': {
    id: 'driver-seat',
    label: 'Swivel seat',
    slots: [
      {
        zone: 'driver-seat',
        pos: [1.72, 0.5, 0.72],
        yaw: -2.2,
        pose: 'sit-upright',
        note: 'swivel seat by the door, out from under the bunk so you can always see who is in it',
      },
    ],
  },
  dinette: {
    id: 'dinette',
    label: 'Dinette',
    slots: [
      { zone: 'dinette', pos: [0.15, 0.48, -0.7], yaw: 0.12, pose: 'sit-upright', note: 'far bench, window side' },
      { zone: 'dinette', pos: [0.68, 0.48, -0.7], yaw: -0.02, pose: 'sit-upright', note: 'far bench, table end' },
      { zone: 'dinette', pos: [0.45, 0.48, 0.42], yaw: Math.PI, pose: 'sit-upright', note: 'near stool bench' },
    ],
    overflow: [
      { zone: 'dinette', pos: [0.3, STAND_HIP_Y, 0.98], yaw: -0.45, pose: 'stand', note: 'standing at the table' },
      { zone: 'dinette', pos: [-0.62, STAND_HIP_Y, 0.86], yaw: 0.55, pose: 'stand', note: 'standing, aisle side' },
    ],
  },
  sofa: {
    id: 'sofa',
    label: 'Sofa',
    slots: [
      { zone: 'sofa', pos: [-1.92, 0.46, -0.56], yaw: 0.1, pose: 'sit-crossleg' },
      { zone: 'sofa', pos: [-1.3, 0.46, -0.56], yaw: -0.06, pose: 'sit-crossleg' },
    ],
  },
  bunk: {
    id: 'bunk',
    label: 'Bunk (over cab)',
    slots: [
      { zone: 'bunk', pos: [1.93, 1.71, -0.3], yaw: -Math.PI / 2, pose: 'lie-side', note: 'head to the open side' },
    ],
  },
  galley: {
    id: 'galley',
    label: 'Galley',
    slots: [
      { zone: 'galley', pos: [-0.38, STAND_HIP_Y, -0.5], yaw: Math.PI + 0.18, pose: 'stand', note: 'at the counter' },
    ],
  },
  floor: {
    id: 'floor',
    label: 'Beanbag',
    slots: [
      // the beanbag squashes to ~0.46 high, so the hips perch on top of it and the
      // crossed legs still reach the floor (see test/rig.smoke.ts)
      { zone: 'floor', pos: [-0.5, 0.48, 0.8], yaw: 0.55, pose: 'sit-crossleg' },
    ],
  },
  aisle: {
    id: 'aisle',
    label: 'Aisle',
    slots: [
      { zone: 'aisle', pos: [-0.1, STAND_HIP_Y, 0.5], yaw: -0.2, pose: 'stand' },
      { zone: 'aisle', pos: [0.95, STAND_HIP_Y, 0.62], yaw: -1.0, pose: 'stand' },
    ],
  },
};

/** Doorway / step area on the open side — pure scenery, but agents walk through it. */
export const FLOOR_WALK_Y = 0;

export type ActivityDef = {
  id: ActivityId;
  /** zones to try, in order */
  zones: ZoneId[];
  /** pose per zone (single value = same everywhere) */
  poses: Partial<Record<ZoneId, Pose>>;
  prop: PropId | null;
  /** how long one instance lasts, in seconds */
  duration: [number, number];
  /** idle bubbles (short!) */
  bubbles: string[];
  /** base weight before agent bias and time-of-day bias */
  weight: number;
  zzz?: boolean;
};

export const ACTIVITIES: Record<ActivityId, ActivityDef> = {
  coding: {
    id: 'coding',
    zones: ['dinette', 'sofa'],
    poses: { dinette: 'sit-upright', sofa: 'sit-crossleg' },
    prop: 'laptop',
    duration: [45, 110],
    weight: 1.0,
    bubbles: [
      'refactoring the router...',
      'shipping it 🚢',
      'this diff is 400 lines 😬',
      'one more test then coffee',
      'naming things is hard',
      'git blame says... me. again.',
    ],
  },
  sleeping: {
    id: 'sleeping',
    zones: ['bunk'],
    poses: { bunk: 'lie-side' },
    prop: null,
    duration: [60, 150],
    weight: 0.5,
    zzz: true,
    bubbles: [],
  },
  cooking: {
    id: 'cooking',
    zones: ['galley'],
    poses: { galley: 'stand' },
    prop: 'kettle',
    duration: [30, 60],
    weight: 0.35,
    bubbles: ['🍳 eggs again...', 'who ate the last ramen?!', 'stirring, not burning', 'dinner in 10 🍲'],
  },
  gaming: {
    id: 'gaming',
    zones: ['sofa'],
    poses: { sofa: 'lounge' },
    prop: 'handheld',
    duration: [40, 90],
    weight: 0.5,
    bubbles: ['🎮 almost beat the boss', 'one more run', 'lag! lag! 🎮', 'new high score 🏆'],
  },
  reading: {
    id: 'reading',
    zones: ['sofa', 'bunk', 'dinette'],
    poses: { sofa: 'lounge', bunk: 'lie-side', dinette: 'sit-upright' },
    prop: 'book',
    duration: [45, 100],
    weight: 0.6,
    bubbles: ['📖 LLM paper', 'docs docs docs', 'this chapter is dense', 'taking notes 📝'],
  },
  window: {
    id: 'window',
    zones: ['driver-seat', 'dinette'],
    poses: { 'driver-seat': 'sit-upright', dinette: 'sit-upright' },
    prop: null,
    duration: [25, 60],
    weight: 0.5,
    bubbles: ['nice sunset...', 'are we there yet?', 'different mountains now', 'the sky here is unreal'],
  },
  coffee: {
    id: 'coffee',
    zones: ['galley'],
    poses: { galley: 'stand' },
    prop: 'mug',
    duration: [20, 45],
    weight: 0.45,
    bubbles: ['☕ coffee\'s ready!', 'second cup ☕', 'kettle\'s on', 'who wants a mug?'],
  },
  chat: {
    id: 'chat',
    zones: ['dinette', 'sofa'],
    poses: { dinette: 'sit-upright', sofa: 'sit-crossleg' },
    prop: null,
    duration: [30, 60],
    weight: 0.4,
    bubbles: [],
  },
};

/** Time-of-day weight multipliers per activity. */
export const TIME_BIAS: Record<'morning' | 'day' | 'sunset' | 'night', Partial<Record<ActivityId, number>>> = {
  morning: { coffee: 2.4, cooking: 1.8, window: 1.4, coding: 1.3, reading: 1.0, gaming: 0.8, sleeping: 0.5, chat: 0.8 },
  day: { coding: 2.0, reading: 1.2, gaming: 1.0, cooking: 1.0, coffee: 1.0, window: 0.7, sleeping: 0.4, chat: 0.7 },
  sunset: { window: 2.4, reading: 1.5, cooking: 1.4, gaming: 1.2, coding: 1.0, coffee: 0.9, sleeping: 0.6, chat: 1.0 },
  night: { sleeping: 2.4, gaming: 1.9, reading: 1.8, chat: 1.2, coffee: 0.6, window: 0.6, coding: 0.6, cooking: 0.4 },
};

/** Zones that are close enough for a two-agent chat. */
export const ADJACENT: Array<[ZoneId, ZoneId]> = [
  ['dinette', 'galley'],
  ['dinette', 'driver-seat'],
  ['dinette', 'sofa'],
  ['sofa', 'galley'],
  ['sofa', 'floor'],
  ['galley', 'floor'],
  ['dinette', 'floor'],
];

/** 2-3 turn banter, reskinned for van life. */
export const CHAT_PAIRS: Array<string[]> = [
  ['is the kettle on?', 'asking the real questions ☕', 'it is now'],
  ['good signal out here?', 'enough for one push', 'living the dream 🚐'],
  ['where are we?', 'no idea, looks nice though', 'that is the correct answer'],
  ['did you close that ticket?', 'I closed the ticket', 'you closed the ticket into a new ticket', 'that is how it works'],
  ['we should stop for groceries', 'there is no next exit', 'there is always a next exit'],
  ['my build finally passed', 'on the third try?', 'we do not speak of the first two'],
  ['the wifi here is terrible', 'we are literally in a van', 'in a van with standards'],
  ['sunset in a bit 🌅', 'best window seat is mine', 'it is always yours'],
];

/** Walking anchors: agents shuffle between 1-2m neighbours only, no pathfinding. */
export const WALK_SPEED = 1.15;
export const CLIMB_SPEED = 0.55;
/** Standing spot at the foot of the bunk ladder: elevated slots are climbed from here. */
export const BUNK_CLIMB_ANCHOR: [number, number, number] = [1.18, STAND_HIP_Y, 0.0];

/** Roster defaults (the backend can override names/roles/colors at runtime). */
export const ROSTER: Array<{
  id: string;
  name: string;
  role: string;
  color: string;
  defaultZone: ZoneId;
  bias: ActivityId[];
}> = [
  { id: 'michael', name: 'Michael', role: 'Manager', color: '#6ea8fe', defaultZone: 'driver-seat', bias: ['window', 'coffee'] },
  { id: 'dana', name: 'Dana', role: 'Developer', color: '#5ad1a5', defaultZone: 'dinette', bias: ['coding', 'coffee'] },
  { id: 'uma', name: 'Uma', role: 'UI/UX', color: '#f2a1c9', defaultZone: 'sofa', bias: ['gaming', 'reading'] },
  { id: 'rio', name: 'Rio', role: 'Researcher', color: '#f6d365', defaultZone: 'sofa', bias: ['reading', 'window'] },
  { id: 'quinn', name: 'Quinn', role: 'QA', color: '#c39bff', defaultZone: 'bunk', bias: ['sleeping', 'gaming'] },
];

export const AGENT_IDS = ROSTER.map((r) => r.id);

/** Looks are keyed off the roster colour so a Settings change still lands. */
export const AGENT_LOOKS: Record<string, { skin: string; hair: string; pants: string; shoes: string; hairstyle: 'short' | 'bun' | 'long' | 'curly' | 'cap' }> = {
  michael: { skin: '#e8b58c', hair: '#4a3b32', pants: '#3f4a5c', shoes: '#2b2f36', hairstyle: 'short' },
  dana: { skin: '#c98d63', hair: '#2f2a28', pants: '#37506b', shoes: '#c8543f', hairstyle: 'bun' },
  uma: { skin: '#f0c9a6', hair: '#c25a8a', pants: '#57406b', shoes: '#f2f0ea', hairstyle: 'long' },
  rio: { skin: '#a9714b', hair: '#221d1b', pants: '#4b5a3f', shoes: '#8a6a4a', hairstyle: 'curly' },
  quinn: { skin: '#e8b58c', hair: '#7a5136', pants: '#4a4a52', shoes: '#2b2f36', hairstyle: 'cap' },
};

export function slotFor(zone: ZoneId, slot: number): Slot {
  const def = ZONES[zone];
  if (!def) return ZONES.aisle.slots[0];
  const all = [...def.slots, ...(def.overflow ?? [])];
  return all[slot] ?? all[0];
}

export function slotCount(zone: ZoneId): number {
  const def = ZONES[zone];
  return def ? def.slots.length : 0;
}

/** Nearest zone an agent can actually use, used for overflow fallbacks. */
export function fallbackZone(preferred: ZoneId): ZoneId {
  const order: ZoneId[] = [preferred, 'aisle', 'floor', 'dinette', 'galley', 'sofa', 'driver-seat', 'bunk'];
  return order[0];
}
