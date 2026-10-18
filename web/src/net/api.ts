// ── REST client ──────────────────────────────────────────────────────────────
// Relative URLs only: dev is proxied by Vite, prod is served by Express itself.
// So the browser never needs to know where the backend lives.

import type { AgentView, ChatLine, SettingsView, TaskView } from '../state/hudStore';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getAgents: () => req<{ agents: AgentView[] }>('/api/agents'),
  putAgent: (id: string, patch: Partial<AgentView>) =>
    req<{ agent: AgentView }>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  getSettings: () => req<{ settings: SettingsView }>('/api/settings'),
  putSettings: (patch: Record<string, unknown>) =>
    req<{ settings: SettingsView }>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  getTasks: () => req<{ tasks: TaskView[]; demoMode: boolean }>('/api/tasks'),
  postTask: (task: string) =>
    req<{ taskId: string; status: string; demoMode: boolean }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ task }),
    }),
  postMeeting: (topic: string) =>
    req<{
      meetingId: string;
      topic: string;
      opener: ChatLine;
      demoMode: boolean;
      cap: number;
      callsUsed: number;
      callsRemaining: number;
    }>('/api/meetings', { method: 'POST', body: JSON.stringify({ topic }) }),
  postMeetingMessage: (id: string, text: string) =>
    req<{
      lines: ChatLine[];
      concluded: boolean;
      callsUsed: number;
      callsRemaining: number;
      cap: number;
    }>(`/api/meetings/${id}/message`, { method: 'POST', body: JSON.stringify({ text }) }),
  endMeeting: (id: string) => req<{ ok: boolean }>(`/api/meetings/${id}/end`, { method: 'POST' }),
};
