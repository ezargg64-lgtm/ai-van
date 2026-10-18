// ── Demo mode ────────────────────────────────────────────────────────────────
// If no Gemini key is set, the backend answers with canned lines so the entire
// product flow (huddle -> bubbles -> results, meetings, budget) is testable for $0.
// Deterministic-ish: picks are seeded from the request text so a re-run of the
// same task looks the same.

import { store } from './store.js';

function seed(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

export function demoPlan(task) {
  const rng = seed(task);
  const ids = store.agents.map((a) => a.id);
  const [dev, ux, qa, res] = [ids[1] ?? 'dana', ids[2] ?? 'uma', ids[4] ?? 'quinn', ids[3] ?? 'rio'];
  const t = task.length > 60 ? `${task.slice(0, 57)}...` : task;
  return {
    approach: pick(rng, [
      `Tiny MVP first, then polish: everyone works the same ${t} thread so we never block.`,
      `Research the edges, design the flow, build the thin slice, then QA the seams.`,
      `Split by craft, keep the first cut dumb, and let QA break it before we do.`,
    ]),
    subtasks: [
      {
        id: 's1',
        title: `Scope "${t}" and name the trade-offs`,
        assignee: res,
        description: `Research the request, list 3 approaches with one-line trade-offs, and recommend one with a reason.`,
      },
      {
        id: 's2',
        title: 'Design the flow and its states',
        assignee: ux,
        description: `Sketch the happy path plus loading, empty and error states for the request above; write the user-facing copy.`,
      },
      {
        id: 's3',
        title: 'Build the thin slice',
        assignee: dev,
        description: `Implement the smallest end-to-end version that ships value for the request above; note the follow-up refactor.`,
      },
      {
        id: 's4',
        title: 'Break it on purpose, then sign off',
        assignee: qa,
        description: `Test the happy path and the three nastiest edge cases; state clearly whether it is safe to ship.`,
      },
    ],
  };
}

const DEV_LINES = [
  (t) =>
    `I took the thin slice. For "${t}" the smallest useful version is one endpoint plus one view, no new dependency. I kept the shape close to what we already return so the frontend needs zero new types. Two things I deliberately skipped: caching and optimistic updates. I'd pay down the retry path next — it's the only place I had to guess at intent. Handing back: a working vertical slice and a 3-item follow-up list.`,
  (t) =>
    `Built it behind a flag so nothing else moves. The core of "${t}" is about 120 lines; the fiddly bit was state that outlives a refresh, so I put that in the store rather than component state. Trade-off: this reads slightly worse, survives reloads much better. I also stubbed the failure case so QA can actually reach it. Handing back: implementation notes plus the exact spots I expect to break.`,
];
const UX_LINES = [
  (t) =>
    `Designing for the person who is mid-task and mildly annoyed. For "${t}" I'd lead with one primary action and hide everything else until it's needed. States: empty (one sentence + a suggestion), loading (skeleton, never a spinner alone), error (what happened, what to do, one button). Copy stays in second person and never blames the user. Spacing on a 4pt rhythm, contrast at least 4.5:1 for body text. Handing back: a flow with all four states and the microcopy written out.`,
  (t) =>
    `On "${t}" the interesting constraint is the tiny screen — half our users are on a laptop with a browser at 60% zoom in a split window, so I designed for 380px wide first. One column, sticky action at the bottom, no modals that trap focus. Motion is short (150-200ms) and always explains where something came from. Handing back: two layout sketches described in words plus the state table.`,
];
const RIO_LINES = [
  (t) =>
    `Looked at three ways to do "${t}". The obvious one is the most common in the wild and the easiest to explain, but it couples two concerns we'll want apart in about a month. The second is a small rewrite of the data shape up front: more work today, much cheaper later. The third only wins if the volume stays tiny. I'd take the second, and I'd write down the assumption it rests on so we notice if it stops being true. Confidence: moderate-high. Handing back: the comparison and the assumption to watch.`,
  (t) =>
    `Nothing about "${t}" is novel, which is good news — the standard approach works and there's prior art we can copy. The catch is the edge case everyone forgets: what happens when two people act at once. I'd rather we decide that now than discover it in production. I checked the numbers people usually quote; they don't apply at our scale, so ignore the scary one. Handing back: a decision, its one real risk, and what I'd measure to catch it early.`,
];
const QA_LINES = [
  (t) =>
    `Tested it, and I mean properly. Happy path for "${t}" passes on a clean load, which is the easy part. Three things will bite us: (1) acting twice quickly double-submits, (2) refreshing mid-flow drops the in-progress state, (3) very long input text overflows the header by about 12px. None are blockers today, all three are embarrassing tomorrow. Ship it if we file those first — I've written exact reproduction steps for each. Handing back: pass with three tickets.`,
  (t) =>
    `I went looking for the seams in "${t}" and found one that matters: the error path only shows a generic message, so a user who hits it cannot tell a bad input from a server problem. That's a five-line fix and I'd do it before shipping. Everything else held up under repeated hammering and a slow-network throttle. Verdict: safe to ship after that one copy change. Handing back: one blocker-level note and a clean bill for the rest.`,
];

export function demoStaffWork(agent, subtask, task) {
  const rng = seed(`${agent.id}:${subtask.id}:${task}`);
  const market = task.length > 70 ? `${task.slice(0, 67)}...` : task;
  switch (agent.id) {
    case 'dana':
      return pick(rng, DEV_LINES)(market);
    case 'uma':
      return pick(rng, UX_LINES)(market);
    case 'rio':
      return pick(rng, RIO_LINES)(market);
    case 'quinn':
      return pick(rng, QA_LINES)(market);
    default:
      return `Handled my part of "${market}": ${subtask.title}. Nothing surprising, no blockers, and I noted the one thing to keep an eye on. Handing back to the team.`;
  }
}

export function demoSummary(task, results) {
  const names = results.map((r) => `${r.name} (${r.role})`).join(', ');
  const t = task.length > 70 ? `${task.slice(0, 67)}...` : task;
  return (
    `We're good to go on "${t}". ${names} each landed their piece and the pieces actually fit: ` +
    `research chose an approach, design specified the states, build produced a thin slice, and QA went hunting and came back with a short list.\n\n` +
    `- One primary action, four written states (empty, loading, error, done)\n` +
    `- Thin slice implemented behind a flag, no new dependencies\n` +
    `- Two follow-ups flagged: retry path, and double-submit protection\n` +
    `- QA verdict: ship after the error-copy fix and the long-input overflow tweak`
  );
}

// ── Meeting lines ────────────────────────────────────────────────────────────

const OPENERS = [
  (topic) => `Alright, "${topic}" is on the table — I've got opinions, but I'd rather hear what you actually want out of it first.`,
  (topic) => `"${topic}" — good timing, we were just talking about it over coffee. Where do you want to start?`,
  (topic) => `Okay, sitting down for "${topic}". Give me the one thing that matters most to you and we'll go from there.`,
];

const MANAGER_REPLIES = [
  (t) =>
    `That's the part I wanted to hear about. My instinct: keep the first version small enough to finish this week, then decide with real usage instead of a meeting. What's your appetite for cutting scope?`,
  () =>
    `Fair. I'll be the one to say the boring thing though: whatever we choose, someone has to own it. I'd rather have one owner and a rough plan than three of us politely sharing it.`,
  (t) =>
    `Noted. I can see two shapes for this: the safe incremental path, or the one that costs us a week now and saves a month later. I lean incremental, but I'll let the specialists push back on me.`,
  () =>
    `Good. Then let's keep it concrete — no more abstract talk, someone say what they'd actually build on Monday morning.`,
];

const SPECIALIST_REPLIES = {
  dana: [
    `From the build side: this is smaller than it sounds. A day, maybe two, if we don't gold-plate the endpoint. The thing I'd push back on is doing it behind a flag — nobody ever takes those down.`,
    `I can do it, but I want the data shape decided first. My honest read: the version where we store less is also the version that's easier to change later.`,
    `Cheapest path is to reuse what's already there and accept one ugly branch. The clean path is a small refactor. I'd take the ugly branch this week and the refactor next.`,
  ],
  uma: [
    `Design-wise the risk is that we make it look like three separate features. One entry point, one primary action, and the states written down before anyone codes: empty, loading, error, done.`,
    `Whoever uses this will be mid-task and slightly annoyed. So it needs to be one decision per screen and no settings page. I'd rather ship less surface with better copy.`,
    `Also worth saying: motion is free communication. A 150ms line explaining where a panel came from does more than a tooltip ever will.`,
  ],
  rio: [
    `I checked what other people do here, and the common approach works at our scale. The one assumption worth writing down: usage stays in the low hundreds, not the low millions.`,
    `There's prior art for this exact thing and it's boring in the best way. I'd copy the boring pattern and spend our novelty budget elsewhere.`,
    `My worry isn't the happy path, it's the second user. Everything is fine until two people act at once — that's the case I'd decide now.`,
  ],
  quinn: [
    `I'll take the test pass. My prediction: the happy path works immediately and the failure copy is wrong. It always is. Also, what happens when someone acts twice by accident?`,
    `Only thing I'd insist on: an error message a human can act on. "Something went wrong" is how you turn a five-second problem into a support ticket.`,
    `Give me an hour with it and I'll tell you whether it's shippable. If you want the fast answer: yes, with two caveats and one test I'd keep forever.`,
  ],
};

export function demoMeetingOpener(topic) {
  return pick(seed(`opener:${topic}`), OPENERS)(topic);
}

export function demoManagerReply(topic, latest) {
  const rng = seed(`m:${latest}`);
  return pick(rng, MANAGER_REPLIES)(latest.slice(0, 60) || topic);
}

export function demoSpecialistReply(agent, latest) {
  const rng = seed(`s:${agent.id}:${latest}`);
  const lines = SPECIALIST_REPLIES[agent.id] || [`I'm with Michael on this one.`];
  return pick(rng, lines);
}
