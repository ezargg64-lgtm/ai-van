// ── Meetings: "Discuss with Team" ────────────────────────────────────────────
// One in-memory session per meetingId. A "round" = Manager, then up to 2
// specialists who build on what was just said. Hard call cap per session
// (settings.meetingCallCap, default 20) with auto-conclude at 0 — the counter is
// surfaced in the UI on every line.

import { callGemini, hasKey } from './gemini.js';
import {
  MEETING_OPENER_SYSTEM,
  MEETING_MANAGER_SYSTEM,
  meetingSpecialistSystem,
  meetingContextUser,
} from './prompts.js';
import { store } from './store.js';
import {
  demoMeetingOpener,
  demoManagerReply,
  demoSpecialistReply,
} from './demo.js';

/** meetingId -> session */
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 90;

let seq = 0;
const newId = () => `mtg_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function agentsById() {
  return new Map(store.agents.map((a) => [a.id, a]));
}

function pruneOldSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function budget(session) {
  const cap = session.cap;
  return {
    callsUsed: session.callsUsed,
    callsRemaining: Math.max(0, cap - session.callsUsed),
    cap,
    demo: session.demo,
  };
}

/** Which specialists speak this round? Named first, then the quietest two. */
function chooseSpecialists(managerText, session) {
  const agents = agentsById();
  const specialists = store.agents.filter((a) => a.id !== 'michael');
  const named = [];
  const text = String(managerText || '').toLowerCase();
  for (const a of specialists) {
    if (
      text.includes(a.id) ||
      text.includes(a.name.toLowerCase()) ||
      text.includes(a.role.toLowerCase())
    ) {
      named.push(a.id);
    }
  }
  if (named.length) return named.slice(0, 2);
  return [...specialists]
    .sort((a, b) => (session.spoken[a.id] || 0) - (session.spoken[b.id] || 0))
    .slice(0, 2)
    .map((a) => a.id);
}

async function turn(session, { system, user, temperature, demoText, agentId, name, role }) {
  session.callsUsed += 1; // counted in demo mode too, so the UI path is real
  session.lastAt = Date.now();
  let text;
  if (session.demo) {
    await new Promise((r) => setTimeout(r, 550 + Math.random() * 450));
    text = demoText;
  } else {
    const out = await callGemini({ system, user, temperature, maxTokens: 320 });
    text = out.text;
  }
  const line = {
    id: `${session.id}:${session.lines.length}`,
    meetingId: session.id,
    agentId,
    name,
    role,
    text: String(text).trim(),
    at: new Date().toISOString(),
  };
  session.lines.push(line);
  session.history.push({ who: name, text: line.text });
  session.spoken[agentId] = (session.spoken[agentId] || 0) + 1;
  return line;
}

/**
 * Create a meeting and produce the Manager's opener.
 * @returns {Promise<{meeting: object, opener: object}>}
 */
export async function createMeeting({ topic, emit }) {
  pruneOldSessions();
  const manager = store.agents.find((a) => a.id === 'michael') || store.agents[0];
  const session = {
    id: newId(),
    topic: topic || 'the current work',
    createdAt: Date.now(),
    lastAt: Date.now(),
    callsUsed: 0,
    cap: store.settings.meetingCallCap || 20,
    demo: !hasKey(),
    lines: [],
    history: [],
    spoken: {},
    concluded: false,
  };
  sessions.set(session.id, session);

  emitter(emit, 'meeting_summon', {
    meetingId: session.id,
    topic: session.topic,
    ...budget(session),
  });

  const opener = await turn(session, {
    system: MEETING_OPENER_SYSTEM,
    user: `The user just sat down at the dinette and said: """${session.topic}"""\n\nGreet them and open the discussion as Michael.`,
    temperature: 0.9,
    demoText: demoMeetingOpener(session.topic),
    agentId: manager.id,
    name: manager.name,
    role: manager.role,
  });

  emitter(emit, 'meeting_line', { meetingId: session.id, line: opener, ...budget(session) });
  return { session, opener };
}

/**
 * One round: Manager replies to the user, then up to 2 specialists react.
 * @returns {Promise<{lines: object[], concluded: boolean, callsUsed: number, callsRemaining: number, cap: number}>}
 */
export async function sendMessage({ meetingId, text, emit }) {
  const session = sessions.get(meetingId);
  if (!session) return { error: 'unknown meeting' };
  session.lastAt = Date.now();

  if (session.concluded || session.callsUsed >= session.cap) {
    session.concluded = true;
    return {
      lines: [],
      concluded: true,
      reason: 'budget',
      ...budget(session),
    };
  }

  const agents = agentsById();
  const manager = agents.get('michael') || store.agents[0];
  const out = [];
  session.history.push({ who: 'User', text: text });

  // 1. Manager
  const managerLine = await turn(session, {
    system: MEETING_MANAGER_SYSTEM,
    user: meetingContextUser({ topic: session.topic, history: session.history.slice(-8), latest: text }),
    temperature: 0.95,
    demoText: demoManagerReply(session.topic, text),
    agentId: manager.id,
    name: manager.name,
    role: manager.role,
  });
  out.push(managerLine);
  emitter(emit, 'meeting_line', { meetingId, line: managerLine, ...budget(session) });

  // 2. Specialists (up to 2), budget permitting
  const picks = chooseSpecialists(managerLine.text, session);
  for (const id of picks) {
    if (session.callsUsed >= session.cap) break;
    const agent = agents.get(id);
    if (!agent) continue;
    const line = await turn(session, {
      system: meetingSpecialistSystem(agent),
      user: meetingContextUser({
        topic: session.topic,
        history: session.history.slice(-8),
        latest: `${manager.name} just said: "${managerLine.text}"`,
      }),
      temperature: 1.0,
      demoText: demoSpecialistReply(agent, managerLine.text),
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
    });
    out.push(line);
    emitter(emit, 'meeting_line', { meetingId, line, ...budget(session) });
  }

  // 3. Auto-conclude at 0
  const b = budget(session);
  if (b.callsRemaining <= 0) {
    session.concluded = true;
    emitter(emit, 'meeting_ended', { meetingId, reason: 'budget', ...b });
  }
  return { lines: out, concluded: session.concluded, ...b };
}

export function endMeeting({ meetingId, emit }) {
  const session = sessions.get(meetingId);
  if (!session) return { ok: false, error: 'unknown meeting' };
  session.concluded = true;
  const b = budget(session);
  emitter(emit, 'meeting_ended', { meetingId, reason: 'user', ...b });
  return { ok: true, ...b, lineCount: session.lines.length };
}

export function getMeeting(meetingId) {
  const s = sessions.get(meetingId);
  if (!s) return null;
  return {
    id: s.id,
    topic: s.topic,
    lines: s.lines,
    concluded: s.concluded,
    ...budget(s),
  };
}

function emitter(emit, event, payload) {
  try {
    emit?.(event, payload);
  } catch (err) {
    console.warn('[meeting] emit failed:', err.message);
  }
}
