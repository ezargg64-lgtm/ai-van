import { useState } from 'react';
import { api } from '../net/api';
import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';
import { taskStaging } from '../sim/taskStaging';

const SUGGESTIONS = [
  'add a dark mode toggle to settings',
  'write onboarding copy for first-time users',
  'audit the signup flow for accessibility',
  'design a weekly digest email',
  'plan a v2 of the search API',
];

export function TaskBar() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = useVan((s) => s.mode);
  const toast = useHud((s) => s.toast);
  const demoMode = useHud((s) => s.demoMode);

  const submit = async (value: string) => {
    const task = value.trim();
    if (!task || busy) return;
    if (mode === 'meeting') {
      toast('info', 'End the team chat first — the team is facing you right now.');
      return;
    }
    setBusy(true);
    setText('');
    // optimistic: the van reacts instantly, the server confirms a beat later
    useHud.getState().taskSubmitted(task, demoMode);
    taskStaging.beginTask(task);
    try {
      const res = await api.postTask(task);
      taskStaging.beginTask(task, res.taskId);
      toast('info', demoMode ? 'Task running in demo mode (canned agent lines)' : 'Manager is planning…');
    } catch (err) {
      toast('error', `Could not submit: ${(err as Error).message}`);
      useHud.getState().taskFailed((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="taskbar glass">
      <div className="taskbar-row">
        <span className="taskbar-icon">🗒️</span>
        <input
          value={text}
          placeholder="give the team a task…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit(text);
          }}
          disabled={busy}
        />
        <button className="btn primary" onClick={() => void submit(text)} disabled={busy || !text.trim()}>
          {busy ? '…' : 'Go'}
        </button>
      </div>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => void submit(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
