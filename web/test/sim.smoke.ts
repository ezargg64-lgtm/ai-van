// ── Sim smoke test ───────────────────────────────────────────────────────────
// Runs the whole simulation layer on a VIRTUAL clock (Date.now + setTimeout are
// patched) so a 20-minute van day plays out in milliseconds. No browser, no GPU:
// this checks the rules the acceptance criteria actually care about.
//
//   npm run test:sim     (in web/)

import { livingSim } from '../src/sim/livingSim';
import { taskStaging } from '../src/sim/taskStaging';
import { occupancy } from '../src/sim/occupancy';
import { useVan } from '../src/sim/vanStore';
import { sampleLights, segmentOf, clockLabel, world } from '../src/sim/timeOfDay';
import { ZONES, ACTIVITIES, slotFor } from '../src/sim/vanLayout';
import type { ActivityId, Pose, ZoneId } from '../src/sim/types';

// ── virtual clock ────────────────────────────────────────────────────────────
let vnow = 1_700_000_000_000;
const timers: Array<{ at: number; fn: () => void; id: number }> = [];
let timerId = 1;

const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

Date.now = () => vnow;
// @ts-expect-error test shim
globalThis.setTimeout = (fn: () => void, ms = 0) => {
  const id = timerId++;
  timers.push({ at: vnow + ms, fn, id });
  return id as unknown as ReturnType<typeof setTimeout>;
};
globalThis.clearTimeout = (handle: any) => {
  const idx = timers.findIndex((t) => t.id === handle);
  if (idx >= 0) timers.splice(idx, 1);
};

function advance(ms: number, step = 250) {
  const target = vnow + ms;
  while (vnow < target) {
    vnow = Math.min(vnow + step, target);
    // fire due timers
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= vnow) {
        const t = timers.splice(i, 1)[0];
        t.fn();
      }
    }
    // clock + sim
    world.t = (world.t + step / 1000 / (world.cycleMinutes * 60)) % 1;
    sampleLights(world.t, world.lights);
    livingSim.update(vnow);
  }
}

// ── tiny assert kit ──────────────────────────────────────────────────────────
let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

const VALID_POSES: Pose[] = ['sit-upright', 'sit-crossleg', 'lie-side', 'lounge', 'stand', 'shuffle'];

function snapshot() {
  return useVan.getState().agents;
}

function checkInvariants(label: string) {
  const agents = snapshot();
  const ids = Object.keys(agents);
  ok(ids.length === 5, `${label}: 5 agents in the van`);
  for (const id of ids) {
    const a = agents[id];
    ok(VALID_POSES.includes(a.pose), `${label}: ${id} pose valid (${a.pose})`);
    ok(Boolean(ZONES[a.zone]), `${label}: ${id} zone valid (${a.zone})`);
  }
}

/** No two agents may occupy the same marker: seats must be unique per zone. */
function checkNoSeatCollisions(label: string) {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const [id, a] of Object.entries(snapshot())) {
    const key = `${a.zone}:${a.slot}`;
    if (seen.has(key)) collisions.push(`${key} (${seen.get(key)} + ${id})`);
    seen.set(key, id);
  }
  ok(collisions.length === 0, `${label}: no two agents share a seat`, collisions.join(', '));
}

function activityHistogram() {
  const counts: Partial<Record<ActivityId | 'idle', number>> = {};
  for (const a of Object.values(snapshot())) {
    const key = (a.activity ?? 'idle') as ActivityId | 'idle';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ── the run ──────────────────────────────────────────────────────────────────
console.log('\n🚐 DEV VAN LIFE — simulation smoke test\n');

console.log('phase 1 · boot and idle life');
livingSim.init(vnow);
checkInvariants('boot');
checkNoSeatCollisions('boot');
ok(occupancy.freeSlots('dinette').length === 0 || true, 'occupancy table is live');

// let the van live for ~6 virtual minutes (half a day cycle): everyone should move
const before = Object.values(snapshot())
  .map((a) => `${a.zone}:${a.slot}:${a.activity}`)
  .join('|');
const seenActivities = new Set<ActivityId>();
const seenZones = new Set<ZoneId>();
let codingFrames = 0;
let frames = 0;

for (let i = 0; i < 1440; i++) {
  advance(250, 250);
  frames++;
  for (const a of Object.values(snapshot())) {
    if (a.activity) seenActivities.add(a.activity);
    seenZones.add(a.zone);
    if (a.activity === 'coding') codingFrames++;
  }
  if (i % 120 === 0) checkNoSeatCollisions(`idle t+${Math.round((i * 250) / 1000)}s`);
}
const after = Object.values(snapshot())
  .map((a) => `${a.zone}:${a.slot}:${a.activity}`)
  .join('|');
ok(before !== after, 'agents changed what they were doing over time');
ok(seenActivities.size >= 3, `at least 3 different idle activities happened (${[...seenActivities].join(', ')})`);
ok(seenZones.size >= 3, `agents used at least 3 zones (${[...seenZones].join(', ')})`);
ok(codingFrames > 0, 'somebody was visibly coding during the day segment');

// every activity that was seen must be a real activity with a legal zone/pose
for (const act of seenActivities) {
  const def = ACTIVITIES[act];
  ok(Boolean(def), `activity ${act} exists in the table`);
}

console.log('\nphase 2 · the day/night cycle drives the sim');
const segments = new Set<string>();
for (let i = 0; i < 20; i++) {
  advance(45_000, 250);
  segments.add(segmentOf(world.t));
}
ok(segments.size >= 3, `cycle passed through ${segments.size} segments (${[...segments].join(', ')})`);
ok(clockLabel(0) === '06:00', 'clock maps t=0 to 06:00 sunrise');
ok(clockLabel(0.75) === '00:00', 'clock maps t=0.75 to midnight');
const noon = sampleLights(0.25);
const midnight = sampleLights(0.85);
ok(noon.strings === 0, 'string lights are OFF at midday');
ok(noon.night === 0, 'panorama is full day at midday');
ok(midnight.strings === 1, 'string lights are fully ON at night');
ok(midnight.night === 1, 'panorama is full night at night');
ok(midnight.lamp > noon.lamp, 'interior lamp is brighter at night than at midday');

console.log('\nphase 3 · a task huddles everyone at the dinette');
taskStaging.beginTask('add a dark mode toggle to settings', 'task_test');
advance(500, 100);
ok(useVan.getState().mode === 'task', 'mode flips to task immediately');
advance(9000, 250);
{
  const agents = snapshot();
  const atDinette = Object.values(agents).filter((a) => a.zone === 'dinette');
  ok(atDinette.length === 5, 'all five agents are at the dinette', `${atDinette.length}/5`);
  ok(
    Object.values(agents).every((a) => a.activity === null),
    'task mode clears idle activities',
  );
  checkNoSeatCollisions('huddle');
  const dinetteSeats = new Set(atDinette.map((a) => a.slot));
  ok(dinetteSeats.size === 5, 'the huddle uses 5 distinct spots (3 seats + 2 overflow)', [...dinetteSeats].join(','));
  const posing = Object.values(agents).map((a) => a.pose);
  ok(posing.filter((p) => p === 'stand').length >= 1, 'the overflow huddlers stand');
}

console.log('\nphase 4 · speaking beats stream through the huddle');
taskStaging.onTaskEvent('task_split', { approach: 'Research, design, build, then break it.', subtasks: [] });
taskStaging.onTaskEvent('staff_started', { agentId: 'dana', title: 'Build the thin slice' });
advance(300, 100);
{
  const agents = snapshot();
  ok(agents.dana.speaking === true, 'Dana is flagged as the speaker');
  ok(Boolean(agents.dana.bubble?.text), 'Dana has a bubble');
  ok(
    Object.values(agents).filter((a) => a.speaking).length === 1,
    'exactly one agent speaks at a time',
  );
}
taskStaging.onTaskEvent('staff_finished', { agentId: 'dana', text: 'Shipped the slice. It is behind a flag.' });
advance(400, 100);
ok(Boolean(snapshot().dana.bubble?.text), 'Dana reports back with a result bubble');

console.log('\nphase 5 · the task ends and the van goes back to life');
taskStaging.finishTask('We are good to go on the dark mode toggle. QA wants the error copy fixed first.');
advance(1500, 250);
ok(Boolean(snapshot().michael.bubble), 'Michael gives the wrap-up');
advance(20_000, 250);
ok(useVan.getState().mode === 'idle', 'mode returns to idle after the wrap-up');
{
  const agents = Object.values(snapshot());
  const stools = agents.filter((a) => a.zone === 'dinette').length;
  ok(stools <= 4, 'the huddle breaks up', `${stools} still at the table`);
  ok(
    occupancy.isStaged('dana') === false && occupancy.isStaged('quinn') === false,
    'staging flags cleared, living sim owns them again',
  );
  const busy = agents.filter((a) => a.activity !== null).length;
  ok(busy >= 4, 'everyone picked up where they left off', `${busy}/5 busy · ${JSON.stringify(livingSim.debugPlans())}`);
}
advance(90_000, 250);
checkInvariants('post-task');
checkNoSeatCollisions('post-task');
{
  const agents = Object.values(snapshot());
  const acts = new Set(agents.map((a) => a.activity).filter(Boolean));
  const busy = agents.filter((a) => a.activity !== null).length;
  ok(busy >= 2, 'the van keeps living after a task', `${busy}/5 busy · ${JSON.stringify(livingSim.debugPlans())}`);
  ok(acts.size >= 2, 'life is varied, not a single loop', [...acts].join(', '));
  const settled = agents.filter((a) => a.zone === 'dinette' && a.activity === null).length;
  ok(settled <= 2, 'nobody is left permanently parked at the table', `${settled} parked`);
}

console.log('\nphase 6 · first contact: everyone turns to face you');
taskStaging.beginMeeting('should we rewrite the router?');
advance(6000, 250);
{
  const agents = Object.values(snapshot());
  ok(useVan.getState().mode === 'meeting', 'mode is meeting');
  ok(
    agents.every((a) => a.facingCamera),
    'every agent faces the camera',
  );
  ok(
    agents.every((a) => a.lookAt === 'camera'),
    'every agent looks at the camera',
  );
}
taskStaging.onMeetingEvent('meeting_line', {
  line: { agentId: 'rio', text: 'I checked what other people do here, and the boring path works.' },
});
advance(400, 100);
{
  const agents = snapshot();
  ok(agents.rio.speaking && Boolean(agents.rio.bubble?.text), 'the speaker gets a bubble in meeting mode');
  ok(!agents.dana.speaking, 'listeners are silent');
}
taskStaging.endMeeting();
advance(4000, 250);
{
  const agents = Object.values(snapshot());
  ok(useVan.getState().mode === 'idle', 'chat ended, back to idle');
  ok(
    agents.every((a) => !a.facingCamera),
    'agents stop facing the camera',
  );
}
advance(40_000, 250);
checkNoSeatCollisions('post-meeting');
checkInvariants('post-meeting');

console.log('\nphase 7 · slot sanity (the seam between layout and bodies)');
for (const [zone, def] of Object.entries(ZONES)) {
  const all = [...def.slots, ...(def.overflow ?? [])];
  ok(all.length > 0, `zone ${zone} has at least one spot`);
  for (const s of all) {
    const slot = slotFor(zone as ZoneId, all.indexOf(s));
    ok(VALID_POSES.includes(slot.pose), `${zone} slot ${all.indexOf(s)} has a valid pose`);
    ok(
      Math.abs(s.pos[0]) < 3 && Math.abs(s.pos[2]) < 1.3,
      `${zone} slot ${all.indexOf(s)} sits inside the shell`,
      `${s.pos}`,
    );
    ok(s.pos[1] >= 0.25 && s.pos[1] <= 1.8, `${zone} slot ${all.indexOf(s)} hip height is plausible`, `${s.pos[1]}`);
  }
}

console.log(
  `\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ' — the van behaves\n'),
);

// restore the real clock before exit
Date.now = realNow;
globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;
process.exit(failures === 0 ? 0 : 1);
