// ── Socket.IO bridge ─────────────────────────────────────────────────────────
// THE seam. Everything the backend says lands here and is translated into either
// (a) HUD view state or (b) simulation-layer commands. React components never see
// a backend payload directly, and the scene never sees one at all.

import { io, type Socket } from 'socket.io-client';
import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';
import { taskStaging } from '../sim/taskStaging';
import { setCycleMinutes } from '../sim/timeOfDay';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(): Socket {
  if (socket) return socket;
  const hud = useHud.getState();

  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    useHud.getState().setConnected(true);
  });
  socket.on('disconnect', () => {
    useHud.getState().setConnected(false);
  });
  socket.on('connect_error', (err) => {
    useHud.getState().setConnected(false);
    if (!socket?.active) hud.toast('error', `Backend unreachable: ${err.message}`);
  });

  // ── initial snapshot + roster/settings updates ──
  socket.on('init', (snapshot: any) => {
    const h = useHud.getState();
    if (snapshot?.agents) {
      h.setAgents(snapshot.agents);
      useVan.getState().setRoster(snapshot.agents);
      useVan.getState().setMode('idle');
    }
    if (snapshot?.settings) {
      h.setSettings(snapshot.settings);
      setCycleMinutes(snapshot.settings.dayCycleMinutes);
    }
  });

  socket.on('agents_updated', (payload: any) => {
    if (!payload?.agents) return;
    useHud.getState().setAgents(payload.agents);
    useVan.getState().setRoster(payload.agents);
  });

  socket.on('settings_updated', (payload: any) => {
    if (!payload?.settings) return;
    useHud.getState().setSettings(payload.settings);
    setCycleMinutes(payload.settings.dayCycleMinutes);
  });

  // ── task stream ──
  socket.on('task_created', (p: any) => {
    taskStaging.onTaskEvent('task_created', p);
  });

  socket.on('task_split', (p: any) => {
    useHud.getState().taskSplit(String(p?.taskId ?? ''), String(p?.approach ?? ''), p?.subtasks ?? []);
    taskStaging.onTaskEvent('task_split', p);
  });

  socket.on('staff_started', (p: any) => {
    useHud.getState().staffStarted(String(p?.taskId ?? ''), String(p?.subtaskId ?? ''));
    taskStaging.onTaskEvent('staff_started', p);
  });

  socket.on('staff_finished', (p: any) => {
    useHud.getState().staffFinished(String(p?.taskId ?? ''), String(p?.subtaskId ?? ''), String(p?.text ?? ''));
    taskStaging.onTaskEvent('staff_finished', p);
  });

  socket.on('task_completed', (p: any) => {
    useHud.getState().taskCompleted(String(p?.summary ?? ''), Number(p?.durationMs ?? 0));
    taskStaging.onTaskEvent('task_completed', p);
    useHud.getState().toast('good', 'Task wrapped up ✅');
  });

  socket.on('task_failed', (p: any) => {
    useHud.getState().taskFailed(String(p?.error ?? 'unknown error'));
    taskStaging.onTaskEvent('task_failed', p);
    useHud.getState().toast('error', `Task failed: ${p?.error ?? ''}`);
  });

  // ── meeting stream ──
  socket.on('meeting_summon', (p: any) => {
    taskStaging.onMeetingEvent('meeting_summon', p);
  });

  socket.on('meeting_line', (p: any) => {
    useHud
      .getState()
      .meetingLine(String(p?.meetingId ?? ''), p?.line, Number(p?.callsUsed ?? 0), Number(p?.callsRemaining ?? 0), Number(p?.cap ?? 0));
    taskStaging.onMeetingEvent('meeting_line', p);
  });

  socket.on('meeting_ended', (p: any) => {
    useHud.getState().meetingConcluded(String(p?.reason ?? 'user'));
    taskStaging.onMeetingEvent('meeting_ended', p);
  });

  return socket;
}
