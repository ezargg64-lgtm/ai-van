// ── taskStaging.ts ───────────────────────────────────────────────────────────
// Tasks and meetings always win. Any task_* / meeting_* event force-transitions
// every agent immediately (activity = null, shuffle to the dinette, staggered
// 150ms by agent index), seats them, streams the speaking beats, and hands the
// van back to livingSim when it is over. Backend payloads are read *here* and
// nowhere else — the scene only ever sees VanAgentState.

import { ZONES, slotFor } from './vanLayout';
import { occupancy } from './occupancy';
import { livingSim } from './livingSim';
import { bubbleSnippet, cancelAllPending, clearBubble, later, say, writeAgent } from './writer';
import { useVan } from './vanStore';
import type { Pose, ZoneId } from './types';

export const HUDDLE_ORDER = ['dana', 'uma', 'quinn', 'michael', 'rio'];

/** Distance from the dinette, furthest first: they start walking first. */
const DEPARTURE_RANK: Record<string, number> = {
  'driver-seat': 4,
  bunk: 5,
  sofa: 2,
  galley: 2,
  floor: 1,
  dinette: 0,
  aisle: 1,
};

const STAGGER_MS = 150;

let activeTask: string | null = null;

function firstSentence(text: string, max = 118): string {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const match = clean.match(/^.*?[.!?](\s|$)/);
  const candidate = match ? match[0].trim() : clean;
  return bubbleSnippet(candidate, max);
}

function huddle(opts: { clearBubbles?: boolean } = {}) {
  livingSim.cancelChatPair();
  const seated: string[] = [];
  const order = HUDDLE_ORDER.filter((id) => useVan.getState().agents[id]);
  const sorted = [...order].sort((a, b) => {
    const za = useVan.getState().agents[a].zone;
    const zb = useVan.getState().agents[b].zone;
    return (DEPARTURE_RANK[zb] ?? 1) - (DEPARTURE_RANK[za] ?? 1);
  });

  sorted.forEach((id, index) => {
    occupancy.stage(id);
    const seat = occupancy.takeSeat(id, 'dinette');
    const slot = seat ?? 0;
    const def = slotFor('dinette', slot);
    const pose: Pose = def.pose;
    const isOverflow = !occupancy.isProper('dinette', slot);
    seated.push(id);
    later(() => {
      if (opts.clearBubbles !== false) clearBubble(id);
      livingSim.placeAgent(id, 'dinette', slot, pose, null);
    }, index * STAGGER_MS);
    void isOverflow;
  });
  return seated.length;
}

export const taskStaging = {
  /** Called optimistically from the HUD the moment a task is submitted. */
  beginTask(text: string, taskId = 'pending') {
    if (activeTask === taskId) return;
    activeTask = taskId;
    cancelAllPending();
    livingSim.rememberAll();
    useVan.getState().setMode('task');
    huddle();
    later(() => {
      const michael = useVan.getState().agents.michael;
      if (!michael) return;
      say('michael', `Alright team — "${bubbleSnippet(text, 46)}". Huddle up.`, 7600);
    }, 900);
  },

  beginMeeting(topic: string) {
    cancelAllPending();
    activeTask = null;
    livingSim.rememberAll();
    useVan.getState().setMode('meeting');
    huddle({ clearBubbles: true });
    // once the stagger has everyone at the table, they all turn to face you
    later(() => {
      for (const id of useVan.getState().order) {
        writeAgent(id, { facingCamera: true, lookAt: 'camera', speaking: false });
      }
    }, HUDDLE_ORDER.length * STAGGER_MS + 700);
    later(() => {
      say('michael', `Let's talk about ${bubbleSnippet(topic, 46)}`, 6000);
    }, 2400);
  },

  endMeeting() {
    useVan.getState().setMode('idle');
    cancelAllPending();
    for (const id of useVan.getState().order) {
      writeAgent(id, { facingCamera: false, lookAt: null, speaking: false });
    }
    // let the group un-huddle, then hand the van back to the living sim
    later(() => {
      livingSim.resumeAll(Date.now(), 600);
    }, 1500);
  },

  /** Server said the task is over: celebrate, then disperse. */
  finishTask(summary: string) {
    activeTask = null;
    for (const id of useVan.getState().order) {
      writeAgent(id, { speaking: false, lookAt: id === 'michael' ? 'camera' : 'michael' });
    }
    if (summary) {
      later(() => {
        say('michael', firstSentence(summary), 9000);
      }, 500);
    }
    later(() => {
      useVan.getState().setMode('idle');
      for (const id of useVan.getState().order) writeAgent(id, { speaking: false });
      livingSim.resumeAll(Date.now(), 800);
    }, 9000);
  },

  // ── WebSocket → staging ────────────────────────────────────────────────────
  onTaskEvent(event: string, payload: any) {
    switch (event) {
      case 'task_created':
        this.beginTask(String(payload?.text ?? ''), String(payload?.taskId ?? 'pending'));
        break;

      case 'task_split': {
        const approach = String(payload?.approach ?? '');
        later(() => say('michael', firstSentence(approach), 8000), 1200);
        break;
      }

      case 'staff_started': {
        const agentId = String(payload?.agentId ?? '');
        const title = String(payload?.title ?? '');
        if (!agentId) break;
        for (const id of useVan.getState().order) {
          writeAgent(id, { speaking: id === agentId, lookAt: id === agentId ? 'camera' : agentId });
        }
        say(agentId, `On it: ${bubbleSnippet(title, 70)}`, 6400);
        break;
      }

      case 'staff_finished': {
        const agentId = String(payload?.agentId ?? '');
        const text = String(payload?.text ?? '');
        if (!agentId) break;
        for (const id of useVan.getState().order) {
          writeAgent(id, { speaking: id === agentId, lookAt: id === agentId ? 'camera' : agentId });
        }
        say(agentId, firstSentence(text), 8200);
        break;
      }

      case 'task_completed':
        this.finishTask(String(payload?.summary ?? ''));
        break;

      case 'task_failed':
        activeTask = null;
        this.finishTask('');
        break;

      default:
        break;
    }
  },

  onMeetingEvent(event: string, payload: any) {
    switch (event) {
      case 'meeting_summon':
        // the HUD opens the panel on the POST response; staging starts as soon
        // as the server confirms, or locally when the user clicks the button
        if (useVan.getState().mode !== 'meeting') this.beginMeeting(String(payload?.topic ?? ''));
        break;

      case 'meeting_line': {
        const line = payload?.line;
        if (!line?.agentId) break;
        const agentId = String(line.agentId);
        for (const id of useVan.getState().order) {
          writeAgent(id, {
            speaking: id === agentId,
            lookAt: id === agentId ? 'camera' : agentId,
            facingCamera: useVan.getState().mode === 'meeting',
          });
        }
        say(agentId, bubbleSnippet(String(line.text ?? ''), 124), 8200);
        break;
      }

      case 'meeting_ended':
        this.endMeeting();
        break;

      default:
        break;
    }
  },

  /** Introspection for the console: is a task running, and who is sitting where. */
  debugZones() {
    const out: string[] = [];
    for (const zone of Object.keys(ZONES)) {
      const z = zone as ZoneId;
      const free = occupancy.freeSlots(z).length;
      out.push(`${zone}: ${ZONES[z].slots.length - free}/${ZONES[z].slots.length}`);
    }
    return out.join(' · ');
  },
};
