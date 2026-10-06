import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';
import { setCycleMinutes } from '../sim/timeOfDay';
import type { AgentView } from '../state/hudStore';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest'];

export function SettingsPanel() {
  const open = useHud((s) => s.panels.settings);
  const openPanel = useHud((s) => s.openPanel);
  const agents = useHud((s) => s.agents);
  const settings = useHud((s) => s.settings);
  const toast = useHud((s) => s.toast);

  const [tab, setTab] = useState<'agents' | 'global'>('agents');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentView | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [cycle, setCycle] = useState(12);
  const [cap, setCap] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setModel(settings.model);
      setCycle(settings.dayCycleMinutes);
      setCap(settings.meetingCallCap);
    }
  }, [settings]);

  useEffect(() => {
    const first = agents[0];
    if (!draft && first) {
      setSelected(first.id);
      setDraft({ ...first });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  if (!open) return null;

  const saveAgent = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.putAgent(draft.id, {
        name: draft.name,
        role: draft.role,
        color: draft.color,
        persona: draft.persona,
      });
      useHud.getState().patchAgent(draft.id, draft);
      useVan.getState().setRoster(agents.map((a) => (a.id === draft.id ? draft : a)));
      toast('good', `${draft.name} saved`);
    } catch (err) {
      toast('error', `Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveGlobal = async () => {
    setSaving(true);
    try {
      const res = await api.putSettings({
        ...(key.trim() ? { geminiKey: key.trim() } : {}),
        model,
        dayCycleMinutes: cycle,
        meetingCallCap: cap,
      });
      useHud.getState().setSettings(res.settings);
      setCycleMinutes(res.settings.dayCycleMinutes);
      setKey('');
      toast('good', 'Settings saved');
    } catch (err) {
      toast('error', `Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => openPanel('settings', false)}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <div>
            <h2>⚙️ Settings</h2>
            <p className="dim">
              stored in {settings?.dataDir ?? 'data'}/store.json · survives refreshes and service restarts
            </p>
          </div>
          <button className="icon-btn" onClick={() => openPanel('settings', false)}>
            ✕
          </button>
        </header>

        <div className="tabs">
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>
            Agents
          </button>
          <button className={tab === 'global' ? 'active' : ''} onClick={() => setTab('global')}>
            Global
          </button>
        </div>

        {tab === 'agents' ? (
          <div className="settings-agents">
            <ul className="agent-list">
              {agents.map((a) => (
                <li key={a.id}>
                  <button
                    className={selected === a.id ? 'active' : ''}
                    onClick={() => {
                      setSelected(a.id);
                      setDraft({ ...a });
                    }}
                  >
                    <span className="dot" style={{ background: a.color }} />
                    <span className="agent-list-name">{a.name}</span>
                    <span className="dim small">{a.role}</span>
                  </button>
                </li>
              ))}
            </ul>

            {draft && (
              <div className="agent-form">
                <div className="row">
                  <label className="field">
                    <span className="label">Name</span>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="label">Role</span>
                    <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
                  </label>
                  <label className="field narrow">
                    <span className="label">Colour</span>
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="label">Persona (this is the whole personality they get)</span>
                  <textarea
                    rows={6}
                    value={draft.persona}
                    onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
                  />
                </label>
                <p className="dim small">
                  Idle bias: {(draft.bias ?? []).join(', ') || '—'} · home base: {draft.defaultZone}
                </p>
                <button className="btn primary" onClick={() => void saveAgent()} disabled={saving}>
                  Save {draft.name}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="agent-form">
            <label className="field">
              <span className="label">
                Gemini API key {settings?.geminiKeySet ? `· set from ${settings.keySource} (${settings.geminiKeyPreview})` : '· not set → demo mode'}
              </span>
              <input
                type="password"
                value={key}
                placeholder={settings?.geminiKeySet ? 'leave blank to keep the current key' : 'paste your AI Studio key'}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <div className="row">
              <label className="field">
                <span className="label">Model</span>
                <input list="models" value={model} onChange={(e) => setModel(e.target.value)} />
                <datalist id="models">
                  {MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="field narrow">
                <span className="label">Day cycle (min)</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={cycle}
                  onChange={(e) => setCycle(Number(e.target.value))}
                />
              </label>
              <label className="field narrow">
                <span className="label">Calls per chat</span>
                <input type="number" min={1} max={200} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
              </label>
            </div>
            <button className="btn primary" onClick={() => void saveGlobal()} disabled={saving}>
              Save global settings
            </button>
            <p className="dim small">
              {settings?.demoMode
                ? 'No key set: the van runs on canned agent lines so you can test everything for $0.'
                : 'Key is active — agent turns are real Gemini calls.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
