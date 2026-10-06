import { useState } from 'react';
import { useHud } from '../state/hudStore';
import { useVan } from '../sim/vanStore';

export function ResultsPanel() {
  const open = useHud((s) => s.panels.task);
  const task = useHud((s) => s.task);
  const openPanel = useHud((s) => s.openPanel);
  const roster = useVan((s) => s.roster);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!open) return null;

  const statusText =
    task?.status === 'planning'
      ? 'Manager is planning…'
      : task?.status === 'working'
        ? 'Team at the dinette…'
        : task?.status === 'done'
          ? 'Wrapped up'
          : task?.status === 'failed'
            ? 'Failed'
            : 'No task yet';

  return (
    <aside className="panel right glass">
      <header className="panel-head">
        <div>
          <h2>Task</h2>
          <p className="dim">{statusText}</p>
        </div>
        <button className="icon-btn" onClick={() => openPanel('task', false)}>
          ✕
        </button>
      </header>

      <div className="panel-body">
        {!task && (
          <p className="empty">
            Give the team a task from the bar at the bottom. Michael plans it, the specialists work it at the
            dinette, and QA gets the last word.
          </p>
        )}

        {task && (
          <>
            <div className="request">
              <span className="label">Request</span>
              <p>{task.text}</p>
            </div>

            {task.approach && (
              <div className="approach">
                <span className="label">Manager's approach</span>
                <p>{task.approach}</p>
              </div>
            )}

            <ol className="subtasks">
              {task.subtasks.map((st, i) => {
                const agent = roster[st.assignee];
                const isOpen = expanded === st.id;
                return (
                  <li key={st.id} className={`subtask ${st.status}`}>
                    <button className="subtask-head" onClick={() => setExpanded(isOpen ? null : st.id)}>
                      <span className="idx">{i + 1}</span>
                      <span className="dot" style={{ background: agent?.color ?? '#888' }} />
                      <span className="subtask-main">
                        <span className="subtask-title">{st.title}</span>
                        <span className="subtask-who">
                          {agent?.name ?? st.assignee} · {agent?.role ?? ''}
                        </span>
                      </span>
                      <span className={`status ${st.status}`}>
                        {st.status === 'working' ? 'working' : st.status === 'done' ? 'done' : 'queued'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="subtask-body">
                        <p className="dim small">{st.description}</p>
                        {st.text ? (
                          <p className="result">{st.text}</p>
                        ) : st.status === 'working' ? (
                          <p className="dim small">…{agent?.name} is working on it</p>
                        ) : (
                          <p className="dim small">waiting for their turn</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {task.summary && (
              <div className="summary">
                <span className="label">Michael's wrap-up</span>
                <p>{task.summary}</p>
              </div>
            )}

            {task.error && <p className="error">{task.error}</p>}

            {task.status === 'done' && task.durationMs ? (
              <p className="dim small">took {Math.round(task.durationMs / 1000)}s · agents are back to van life</p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
