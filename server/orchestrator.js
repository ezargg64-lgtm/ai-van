// ── Task orchestration ───────────────────────────────────────────────────────
// POST /api/tasks -> Manager plans -> specialists work -> Manager wraps up.
// Everything streams out over WebSocket so the van can stage it:
//   task_created -> task_split -> staff_started/finished (×n) -> task_completed

import { callGemini, parseJson, hasKey } from './gemini.js';
import {
  MANAGER_PLAN_SYSTEM,
  staffSystem,
  staffUser,
  MANAGER_SUMMARY_SYSTEM,
  managerSummaryUser,
} from './prompts.js';
import { store } from './store.js';
import { demoPlan, demoStaffWork, demoSummary } from './demo.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROLE_BY_ID = () => new Map(store.agents.map((a) => [a.id, a]));
const IDS = () => store.agents.map((a) => a.id);

function normalizePlan(raw, text) {
  const agents = ROLE_BY_ID();
  const ids = IDS();
  let subtasks = Array.isArray(raw?.subtasks) ? raw.subtasks : [];
  subtasks = subtasks
    .filter((s) => s && typeof s === 'object')
    .slice(0, 4)
    .map((s, i) => {
      let assignee = String(s.assignee || '').toLowerCase().trim();
      if (!ids.includes(assignee)) {
        const match = ids.find(
          (id) =>
            assignee.includes(id) ||
            assignee.includes(agents.get(id).name.toLowerCase()) ||
            assignee.includes(agents.get(id).role.toLowerCase()),
        );
        assignee = match || ids[(i + 1) % ids.length];
      }
      return {
        id: `s${i + 1}`,
        index: i,
        title: String(s.title || `Subtask ${i + 1}`).slice(0, 90),
        assignee,
        description: String(s.description || s.title || '').slice(0, 600),
      };
    });
  if (!subtasks.length) return null;
  return {
    approach: String(raw?.approach || '').slice(0, 400) || 'Split the request and ship it.',
    subtasks,
    viaFallback: Boolean(text),
  };
}

/** Fallback plan when the model returns unparseable garbage. */
function fallbackPlan(task) {
  const ids = IDS();
  const [dev, ux, qa, res] = [ids[1], ids[2], ids[4], ids[3]];
  return {
    approach: 'Manager split the request by craft and put QA last.',
    subtasks: [
      {
        id: 's1',
        index: 0,
        title: 'Scope it and pick the approach',
        assignee: res,
        description: `Research the request "${task}", name the trade-offs, and recommend one approach with a reason.`,
      },
      {
        id: 's2',
        index: 1,
        title: 'Design the flow and states',
        assignee: ux,
        description: `Sketch the screens/states needed for "${task}" and the copy the user will read.`,
      },
      {
        id: 's3',
        index: 2,
        title: 'Build the first cut',
        assignee: dev,
        description: `Implement the smallest working version of "${task}" and note what you would refactor next.`,
      },
      {
        id: 's4',
        index: 3,
        title: 'Test and sign off',
        assignee: qa,
        description: `Test "${task}" end-to-end: happy path plus the three edge cases most likely to break it.`,
      },
    ],
  };
}

/**
 * Run a task end-to-end. Never throws: failures are reported as task_failed.
 * @param {{id:string,text:string}} task
 * @param {(event:string, payload:object)=>void} emit
 */
export async function runTask(task, emit) {
  const startedAt = Date.now();
  const demo = !hasKey();
  const record = store.addTask({
    id: task.id,
    text: task.text,
    createdAt: new Date().toISOString(),
    status: 'planning',
    demo,
    plan: null,
    results: [],
    summary: '',
  });

  emit('task_created', { taskId: task.id, text: task.text, demo });
  store.updateTask(task.id, { status: 'planning' });

  // ── 1. Manager plans ──────────────────────────────────────────────────────
  let plan = null;
  let planError = null;
  try {
    if (demo) {
      await sleep(700);
      plan = normalizePlan(demoPlan(task.text), null);
    } else {
      const { text, model } = await callGemini({
        system: MANAGER_PLAN_SYSTEM,
        user: `User request:\n"""${task.text}"""\n\nReturn the plan as strict JSON.`,
        temperature: 0.6,
        maxTokens: 900,
        json: true,
      });
      plan = normalizePlan(parseJson(text), text);
      record.model = model;
    }
  } catch (err) {
    planError = err.message;
    console.warn('[task] plan failed:', err.message);
  }
  if (!plan) plan = fallbackPlan(task.text);

  store.updateTask(task.id, { status: 'working', plan });
  emit('task_split', {
    taskId: task.id,
    approach: plan.approach,
    subtasks: plan.subtasks,
    fallback: Boolean(planError),
  });

  // ── 2. Specialists work, one at a time, in plan order ─────────────────────
  const agents = ROLE_BY_ID();
  const results = [];
  for (const subtask of plan.subtasks) {
    const agent = agents.get(subtask.assignee) || store.agents[0];
    emit('staff_started', {
      taskId: task.id,
      subtaskId: subtask.id,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      title: subtask.title,
      index: subtask.index,
      total: plan.subtasks.length,
    });

    let text = '';
    try {
      if (demo) {
        await sleep(1400 + subtask.index * 250);
        text = demoStaffWork(agent, subtask, task.text);
      } else {
        const out = await callGemini({
          system: staffSystem(agent),
          user: staffUser({ task: task.text, subtask, agent }),
          temperature: 0.9,
          maxTokens: 700,
        });
        text = out.text;
      }
    } catch (err) {
      text = `(${agent.name} hit a problem and is reporting a rough draft): ${err.message}`;
      console.warn('[task] staff call failed:', err.message);
    }

    const result = {
      subtaskId: subtask.id,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      title: subtask.title,
      text,
      at: new Date().toISOString(),
    };
    results.push(result);
    store.updateTask(task.id, { results: [...results] });
    emit('staff_finished', { taskId: task.id, ...result });
    await sleep(240);
  }

  // ── 3. Manager wraps up ───────────────────────────────────────────────────
  let summary = '';
  try {
    if (demo) {
      await sleep(900);
      summary = demoSummary(task.text, results);
    } else {
      const out = await callGemini({
        system: MANAGER_SUMMARY_SYSTEM,
        user: managerSummaryUser({ task: task.text, results }),
        temperature: 0.7,
        maxTokens: 420,
      });
      summary = out.text;
    }
  } catch (err) {
    summary = `Wrap-up unavailable (${err.message}). Individual results above stand on their own.`;
  }

  const finished = store.updateTask(task.id, {
    status: 'done',
    summary,
    results,
    durationMs: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
  });
  emit('task_completed', {
    taskId: task.id,
    summary,
    results,
    durationMs: finished.durationMs,
    demo,
  });

  return finished;
}
