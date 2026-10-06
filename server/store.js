// ── File store ───────────────────────────────────────────────────────────────
// data/store.json is the source of truth for agents, settings and task history.
// NO database, NO serverless: this file must live on a mounted volume in prod.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_AGENTS, AGENT_IDS } from './agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(ROOT, 'data'),
);
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const TASK_HISTORY_LIMIT = 30;

function defaults() {
  return {
    version: 1,
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    settings: {
      // Empty string = fall back to the GEMINI_API_KEY env var, then demo mode.
      geminiKey: '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      dayCycleMinutes: Number(process.env.DAY_CYCLE_MINUTES || 12),
      meetingCallCap: Number(process.env.MEETING_CALL_CAP || 20),
    },
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

let state = defaults();
let writeTimer = null;

/** Merge the file (if any) onto defaults, keeping unknown-but-valid shapes sane. */
function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  if (Array.isArray(raw.agents)) {
    const byId = new Map(raw.agents.filter((a) => a && a.id).map((a) => [a.id, a]));
    out.agents = base.agents.map((def) => {
      const saved = byId.get(def.id) || {};
      return {
        ...def,
        name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : def.name,
        role: typeof saved.role === 'string' && saved.role.trim() ? saved.role.trim() : def.role,
        color: typeof saved.color === 'string' ? saved.color : def.color,
        persona:
          typeof saved.persona === 'string' && saved.persona.trim() ? saved.persona : def.persona,
        defaultZone: typeof saved.defaultZone === 'string' ? saved.defaultZone : def.defaultZone,
        bias: Array.isArray(saved.bias) ? saved.bias : def.bias,
      };
    });
  }
  if (raw.settings && typeof raw.settings === 'object') {
    const s = raw.settings;
    out.settings = {
      geminiKey: typeof s.geminiKey === 'string' ? s.geminiKey : '',
      model: typeof s.model === 'string' && s.model.trim() ? s.model.trim() : base.settings.model,
      dayCycleMinutes: clampNumber(s.dayCycleMinutes, 1, 240, base.settings.dayCycleMinutes),
      meetingCallCap: clampNumber(s.meetingCallCap, 1, 200, base.settings.meetingCallCap),
    };
  }
  if (Array.isArray(raw.tasks)) out.tasks = raw.tasks.slice(-TASK_HISTORY_LIMIT);
  return out;
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function load() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      state = normalize(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')));
    } else {
      state = defaults();
      saveNow();
    }
  } catch (err) {
    console.warn('[store] could not read store.json, starting from defaults:', err.message);
    state = defaults();
  }
  return state;
}

/** Debounced atomic write — safe for a single container with one volume. */
export function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    saveNow();
  }, 120);
}

export function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    state.updatedAt = new Date().toISOString();
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error('[store] write failed:', err.message);
  }
}

export const store = {
  get agents() {
    return state.agents;
  },
  get settings() {
    return state.settings;
  },
  get tasks() {
    return state.tasks;
  },
  updateSettings(patch) {
    const s = state.settings;
    if (typeof patch.geminiKey === 'string') s.geminiKey = patch.geminiKey.trim();
    if (typeof patch.model === 'string' && patch.model.trim()) s.model = patch.model.trim();
    if (patch.dayCycleMinutes != null)
      s.dayCycleMinutes = clampNumber(patch.dayCycleMinutes, 1, 240, s.dayCycleMinutes);
    if (patch.meetingCallCap != null)
      s.meetingCallCap = clampNumber(patch.meetingCallCap, 1, 200, s.meetingCallCap);
    save();
    return s;
  },
  updateAgent(id, patch) {
    if (!AGENT_IDS.includes(id)) return null;
    const agent = state.agents.find((a) => a.id === id);
    if (!agent) return null;
    for (const key of ['name', 'role', 'color', 'persona', 'defaultZone']) {
      if (typeof patch[key] === 'string' && patch[key].trim()) agent[key] = patch[key].trim();
    }
    if (Array.isArray(patch.bias)) agent.bias = patch.bias;
    save();
    return agent;
  },
  addTask(task) {
    state.tasks.push(task);
    if (state.tasks.length > TASK_HISTORY_LIMIT) state.tasks.shift();
    save();
    return task;
  },
  updateTask(id, patch) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, patch);
    save();
    return task;
  },
};

/** Active Gemini key: saved setting first, env var as the global default. */
export function activeKey() {
  const saved = state.settings.geminiKey?.trim();
  if (saved) return saved;
  return (process.env.GEMINI_API_KEY || '').trim();
}

export function keyPreview() {
  const key = activeKey();
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function modelFor() {
  return state.settings.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}
