// ── HUD store ────────────────────────────────────────────────────────────────
// This is the *only* place backend shapes are allowed to live. The 3D scene never
// imports anything from here; it reads sim/vanStore (the state contract) instead.

import { create } from 'zustand';
import type { Segment } from '../sim/timeOfDay';

export type SubtaskStatus = 'pending' | 'working' | 'done';

export type SubtaskView = {
  id: string;
  title: string;
  assignee: string;
  description: string;
  status: SubtaskStatus;
  text?: string;
};

export type TaskView = {
  id: string;
  text: string;
  status: 'planning' | 'working' | 'done' | 'failed';
  approach: string;
  subtasks: SubtaskView[];
  summary: string;
  demo: boolean;
  durationMs?: number;
  error?: string;
};

export type ChatLine = {
  id: string;
  agentId: string;
  name: string;
  role: string;
  text: string;
  at: string;
};

export type MeetingView = {
  id: string;
  topic: string;
  lines: ChatLine[];
  callsUsed: number;
  callsRemaining: number;
  cap: number;
  concluded: boolean;
  demo: boolean;
  pending: boolean;
};

export type AgentView = {
  id: string;
  name: string;
  role: string;
  color: string;
  persona: string;
  defaultZone: string;
  bias: string[];
};

export type SettingsView = {
  model: string;
  geminiKeySet: boolean;
  geminiKeyPreview: string;
  keySource: 'saved' | 'env' | 'none' | string;
  dayCycleMinutes: number;
  meetingCallCap: number;
  demoMode: boolean;
  dataDir: string;
  persisted: boolean;
};

export type Toast = { id: number; kind: 'info' | 'error' | 'good'; text: string };

export type PanelId = 'task' | 'chat' | 'settings';

type HudStore = {
  connected: boolean;
  demoMode: boolean;
  clock: { t: number; label: string; segment: Segment; phase: string };
  task: TaskView | null;
  meeting: MeetingView | null;
  agents: AgentView[];
  settings: SettingsView | null;
  panels: Record<PanelId, boolean>;
  toasts: Toast[];
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  setConnected: (v: boolean) => void;
  setClock: (t: number, label: string, segment: Segment, phase: string) => void;
  setAgents: (agents: AgentView[]) => void;
  setSettings: (settings: SettingsView) => void;
  patchAgent: (id: string, patch: Partial<AgentView>) => void;
  openPanel: (id: PanelId, open?: boolean) => void;
  // tasks
  taskSubmitted: (text: string, demo: boolean) => void;
  taskSplit: (taskId: string, approach: string, subtasks: Array<{ id: string; title: string; assignee: string; description: string }>) => void;
  staffStarted: (taskId: string, subtaskId: string) => void;
  staffFinished: (taskId: string, subtaskId: string, text: string) => void;
  taskCompleted: (summary: string, durationMs: number) => void;
  taskFailed: (error: string) => void;
  // meetings
  meetingOpened: (id: string, topic: string, demo: boolean, cap: number, callsUsed: number, callsRemaining: number, opener: ChatLine | null) => void;
  meetingLine: (meetingId: string, line: ChatLine, callsUsed: number, callsRemaining: number, cap: number) => void;
  meetingPending: (pending: boolean) => void;
  meetingConcluded: (reason: string) => void;
  meetingAddMine: (text: string) => void;
};

let toastId = 0;

export const useHud = create<HudStore>((set, get) => ({
  connected: false,
  demoMode: true,
  clock: { t: 0.16, label: '10:00', segment: 'morning', phase: 'morning' },
  task: null,
  meeting: null,
  agents: [],
  settings: null,
  panels: { task: false, chat: false, settings: false },
  toasts: [],

  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setConnected: (v) => set({ connected: v }),
  setClock: (t, label, segment, phase) => set({ clock: { t, label, segment, phase } }),
  setAgents: (agents) => set({ agents }),
  setSettings: (settings) => set({ settings, demoMode: settings.demoMode }),
  patchAgent: (id, patch) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

  openPanel: (id, open) =>
    set((s) => {
      const next = { ...s.panels, [id]: open ?? !s.panels[id] };
      if (next[id]) {
        // task + chat are mutually exclusive: both own the bottom bar
        if (id === 'task') next.chat = false;
        if (id === 'chat') next.task = false;
      }
      return { panels: next };
    }),

  taskSubmitted: (text, demo) =>
    set({
      task: { id: 'pending', text, status: 'planning', approach: '', subtasks: [], summary: '', demo },
      panels: { ...get().panels, task: true },
    }),

  taskSplit: (taskId, approach, subtasks) =>
    set((s) => ({
      task: {
        id: taskId,
        text: s.task?.text ?? '',
        status: 'working',
        approach,
        summary: '',
        demo: s.task?.demo ?? false,
        subtasks: subtasks.map((t) => ({ ...t, status: 'pending' as SubtaskStatus })),
      },
    })),

  staffStarted: (taskId, subtaskId) =>
    set((s) => {
      if (!s.task) return s;
      return {
        task: {
          ...s.task,
          id: taskId,
          subtasks: s.task.subtasks.map((t) => (t.id === subtaskId ? { ...t, status: 'working' } : t)),
        },
      };
    }),

  staffFinished: (taskId, subtaskId, text) =>
    set((s) => {
      if (!s.task) return s;
      return {
        task: {
          ...s.task,
          id: taskId,
          subtasks: s.task.subtasks.map((t) => (t.id === subtaskId ? { ...t, status: 'done', text } : t)),
        },
      };
    }),

  taskCompleted: (summary, durationMs) =>
    set((s) => (s.task ? { task: { ...s.task, status: 'done', summary, durationMs } } : s)),

  taskFailed: (error) =>
    set((s) => (s.task ? { task: { ...s.task, status: 'failed', error } } : s)),

  meetingOpened: (id, topic, demo, cap, callsUsed, callsRemaining, opener) =>
    set((s) => ({
      meeting: {
        id,
        topic,
        lines: opener ? [opener] : [],
        callsUsed,
        callsRemaining,
        cap,
        concluded: false,
        demo,
        pending: false,
      },
      panels: { ...s.panels, chat: true, task: false },
    })),

  meetingLine: (meetingId, line, callsUsed, callsRemaining, cap) =>
    set((s) => {
      if (!s.meeting || s.meeting.id !== meetingId) return s;
      if (s.meeting.lines.some((l) => l.id === line.id)) return s; // dedupe WS + POST
      return {
        meeting: {
          ...s.meeting,
          lines: [...s.meeting.lines, line],
          callsUsed,
          callsRemaining,
          cap,
          pending: false,
        },
      };
    }),

  meetingPending: (pending) => set((s) => (s.meeting ? { meeting: { ...s.meeting, pending } } : s)),

  meetingConcluded: (reason) =>
    set((s) => {
      if (!s.meeting) return s;
      get().toast(reason === 'budget' ? 'info' : 'info', reason === 'budget' ? 'Chat budget used up — wrapping up 👋' : 'Chat ended');
      return { meeting: { ...s.meeting, concluded: true, pending: false } };
    }),

  meetingAddMine: (text) =>
    set((s) =>
      s.meeting
        ? {
            meeting: {
              ...s.meeting,
              pending: true,
              lines: [
                ...s.meeting.lines,
                { id: `me:${Date.now()}`, agentId: 'me', name: 'You', role: '', text, at: new Date().toISOString() },
              ],
            },
          }
        : s,
    ),
}));
