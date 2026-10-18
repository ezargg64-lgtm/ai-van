import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';
import { world } from '../sim/timeOfDay';

const SEGMENT_LABEL: Record<string, string> = {
  morning: 'morning ☀️',
  day: 'day 🌤',
  sunset: 'sunset 🌇',
  night: 'night 🌙',
};

export function TopBar() {
  const clock = useHud((s) => s.clock);
  const connected = useHud((s) => s.connected);
  const demoMode = useHud((s) => s.demoMode);
  const settings = useHud((s) => s.settings);
  const mode = useVan((s) => s.mode);
  const panels = useHud((s) => s.panels);
  const openPanel = useHud((s) => s.openPanel);
  const meeting = useHud((s) => s.meeting);
  const task = useHud((s) => s.task);

  const cycle = settings?.dayCycleMinutes ?? 12;

  return (
    <header className="topbar glass">
      <div className="brand">
        <span className="brand-van">🚐</span>
        <span className="brand-text">
          DEV VAN LIFE
          <small>your agents, somewhere on the road</small>
        </span>
      </div>

      <div className="clock">
        <div className="clock-time">{clock.label}</div>
        <div className="clock-track">
          <div className="clock-fill" style={{ width: `${Math.round(clock.t * 100)}%` }} />
          <div className="clock-ticks">
            {[0.2, 0.6, 0.75].map((t) => (
              <span key={t} style={{ left: `${t * 100}%` }} />
            ))}
          </div>
        </div>
        <div className="clock-meta">
          <span className={`seg seg-${clock.segment}`}>{SEGMENT_LABEL[clock.segment]}</span>
          <span className="dim">{clock.phase} · {cycle}min day</span>
          <button
            className="tiny"
            title="pause / resume the day-night cycle"
            onClick={() => {
              world.running = !world.running;
            }}
          >
            ⏯
          </button>
        </div>
      </div>

      <div className="topbar-actions">
        {mode !== 'idle' && <span className={`mode-chip mode-${mode}`}>{mode === 'task' ? 'task in progress' : 'team chat'}</span>}
        {meeting && mode === 'meeting' && (
          <span className="budget-chip" title="Gemini calls left in this chat">
            {meeting.callsRemaining}/{meeting.cap} calls left
          </span>
        )}
        <button
          className={`btn ${panels.chat ? 'active' : ''}`}
          onClick={() => openPanel('chat')}
          disabled={mode === 'task'}
        >
          💬 Discuss with Team
        </button>
        <button className={`btn ${panels.task ? 'active' : ''}`} onClick={() => openPanel('task')} disabled={!task}>
          📋 Task {task?.status === 'working' ? '· running' : ''}
        </button>
        <button className="btn" onClick={() => openPanel('settings')}>
          ⚙️ Settings
        </button>
        <span className={`conn ${connected ? 'on' : 'off'}`} title={connected ? 'backend connected' : 'backend offline'} />
        {demoMode && <span className="demo-chip">demo</span>}
      </div>
    </header>
  );
}
