import { useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';
import { taskStaging } from '../sim/taskStaging';

const TOPIC_IDEAS = [
  'should we rewrite the router?',
  'what should we cut from v2?',
  'how do we make onboarding feel faster?',
  'is our test suite actually useful?',
];

export function ChatPanel() {
  const open = useHud((s) => s.panels.chat);
  const meeting = useHud((s) => s.meeting);
  const openPanel = useHud((s) => s.openPanel);
  const toast = useHud((s) => s.toast);
  const settings = useHud((s) => s.settings);
  const roster = useVan((s) => s.roster);
  const mode = useVan((s) => s.mode);

  const [topic, setTopic] = useState('should we rewrite the router?');
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (meeting?.lines.length) {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [meeting?.lines.length, meeting?.pending]);

  if (!open) return null;

  const cap = meeting?.cap ?? settings?.meetingCallCap ?? 20;

  const start = async () => {
    const t = topic.trim();
    if (!t || starting) return;
    setStarting(true);
    // optimistic: everyone turns to face you straight away
    taskStaging.beginMeeting(t);
    try {
      const res = await api.postMeeting(t);
      useHud
        .getState()
        .meetingOpened(res.meetingId, res.topic, res.demoMode, res.cap, res.callsUsed, res.callsRemaining, res.opener);
    } catch (err) {
      toast('error', `Could not start the chat: ${(err as Error).message}`);
      taskStaging.endMeeting();
    } finally {
      setStarting(false);
    }
  };

  const send = async () => {
    const text = message.trim();
    if (!text || !meeting || meeting.concluded || meeting.pending) return;
    setMessage('');
    useHud.getState().meetingAddMine(text);
    try {
      const res = await api.postMeetingMessage(meeting.id, text);
      // lines also stream over WS; meetingLine dedupes by id
      for (const line of res.lines) {
        useHud.getState().meetingLine(meeting.id, line, res.callsUsed, res.callsRemaining, res.cap);
      }
      if (res.concluded) useHud.getState().meetingConcluded('budget');
    } catch (err) {
      toast('error', `Message failed: ${(err as Error).message}`);
      useHud.getState().meetingPending(false);
    }
  };

  const end = async () => {
    if (meeting) {
      try {
        await api.endMeeting(meeting.id);
      } catch {
        /* the socket event is the source of truth; ignore */
      }
    }
    taskStaging.endMeeting();
  };

  return (
    <aside className="panel left glass">
      <header className="panel-head">
        <div>
          <h2>💬 Discuss with Team</h2>
          <p className="dim">
            {meeting
              ? `topic: ${meeting.topic}`
              : mode === 'task'
                ? 'the team is busy with a task'
                : 'everyone turns to face you at the dinette'}
          </p>
        </div>
        <button className="icon-btn" onClick={() => openPanel('chat', false)}>
          ✕
        </button>
      </header>

      {!meeting ? (
        <div className="panel-body">
          <p className="dim small">
            Pick a topic and the van becomes a meeting room: Mike chairs, up to two specialists jump in per
            round, and you can see exactly how many Gemini calls are left.
          </p>
          <label className="field">
            <span className="label">Topic</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void start();
              }}
              placeholder="what should the team talk about?"
            />
          </label>
          <div className="suggestions">
            {TOPIC_IDEAS.map((t) => (
              <button key={t} className="chip" onClick={() => setTopic(t)}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn primary wide" onClick={() => void start()} disabled={starting || mode === 'task'}>
            {starting ? 'calling everyone over…' : `Start chat · ${cap} calls budget`}
          </button>
        </div>
      ) : (
        <>
          <div className="budget">
            <div className="budget-bar">
              <div
                className="budget-fill"
                style={{ width: `${Math.round((meeting.callsRemaining / Math.max(1, meeting.cap)) * 100)}%` }}
              />
            </div>
            <span className="dim small">
              {meeting.callsRemaining} of {meeting.cap} calls left
              {meeting.demo ? ' · demo lines' : ''}
            </span>
          </div>

          <div className="messages" ref={listRef}>
            {meeting.lines.map((line) => {
              const mine = line.agentId === 'me';
              const agent = roster[line.agentId];
              return (
                <div key={line.id} className={`message ${mine ? 'mine' : ''}`}>
                  {!mine && (
                    <span className="avatar" style={{ background: agent?.color ?? '#888' }}>
                      {line.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="bubble-in">
                    {!mine && <span className="who">{line.name} · {line.role}</span>}
                    <p>{line.text}</p>
                  </div>
                </div>
              );
            })}
            {meeting.pending && (
              <div className="message">
                <span className="avatar typing">…</span>
                <div className="bubble-in">
                  <span className="who">the van is thinking</span>
                </div>
              </div>
            )}
            {meeting.concluded && (
              <p className="dim small center">Chat concluded — the team is heading back to whatever they were doing.</p>
            )}
          </div>

          <div className="chat-input">
            <input
              value={message}
              placeholder={meeting.concluded ? 'chat has ended' : 'say something to the team…'}
              disabled={meeting.concluded}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <button className="btn primary" onClick={() => void send()} disabled={meeting.concluded || !message.trim()}>
              Send
            </button>
            <button className="btn" onClick={() => void end()}>
              End chat
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
