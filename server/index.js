// ── DEV VAN LIFE — Express + Socket.IO backend ───────────────────────────────
// Single process, single container, one JSON file on a volume. No serverless.

import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';

import { load, store, saveNow, DATA_DIR, keyPreview, activeKey } from './store.js';
import { hasKey, modelName, NoKeyError } from './gemini.js';
import { runTask } from './orchestrator.js';
import { createMeeting, sendMessage, endMeeting, getMeeting } from './meetings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(__dirname, '..', 'web', 'dist');
// Pterodactyl injects SERVER_PORT from the allocation — never hardcode a port.
// Railway/Render/Fly/Docker set PORT; 8080 is the local default.
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 8080);

load();

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
  path: '/socket.io',
});

const emit = (event, payload) => io.emit(event, payload);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Public agent shape: persona included (the Settings screen edits it). */
function publicAgents() {
  return store.agents.map((a) => ({ ...a }));
}

function publicSettings() {
  return {
    model: modelName(),
    geminiKeySet: Boolean(activeKey()),
    geminiKeyPreview: keyPreview(),
    keySource: store.settings.geminiKey ? 'saved' : process.env.GEMINI_API_KEY ? 'env' : 'none',
    dayCycleMinutes: store.settings.dayCycleMinutes,
    meetingCallCap: store.settings.meetingCallCap,
    demoMode: !hasKey(),
    dataDir: DATA_DIR,
    persisted: fs.existsSync(path.join(DATA_DIR, 'store.json')),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

const snapshot = () => ({
  agents: publicAgents(),
  settings: publicSettings(),
  tasks: store.tasks.slice(-10).reverse(),
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, demoMode: !hasKey(), model: modelName(), uptime: process.uptime() });
});

// agents: GET/PUT
app.get('/api/agents', (req, res) => res.json({ agents: publicAgents() }));

app.put('/api/agents/:id', (req, res) => {
  const agent = store.updateAgent(req.params.id, req.body || {});
  if (!agent) return res.status(404).json({ error: 'unknown agent' });
  emit('agents_updated', { agents: publicAgents() });
  res.json({ agent });
});

// settings: GET/PUT (Gemini key + model + cycle + cap)
app.get('/api/settings', (req, res) => res.json({ settings: publicSettings() }));

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  store.updateSettings(body);
  emit('settings_updated', { settings: publicSettings() });
  res.json({ settings: publicSettings() });
});

// tasks: POST (fire-and-check), GET history
app.get('/api/tasks', (req, res) =>
  res.json({ tasks: store.tasks.slice(-10).reverse(), demoMode: !hasKey() }),
);

app.post('/api/tasks', (req, res) => {
  const text = String(req.body?.task || '').trim();
  if (!text) return res.status(400).json({ error: 'task text required' });
  if (text.length > 800) return res.status(400).json({ error: 'task too long (max 800 chars)' });

  const task = { id: `task_${Date.now().toString(36)}`, text };
  res.status(202).json({ taskId: task.id, status: 'accepted', demoMode: !hasKey() });

  runTask(task, emit).catch((err) => {
    console.error('[task] crashed:', err);
    emit('task_failed', { taskId: task.id, error: err.message });
  });
});

// meetings: create / message / end
app.post('/api/meetings', async (req, res) => {
  const topic = String(req.body?.topic || '').trim() || 'the current work';
  try {
    const { session, opener } = await createMeeting({ topic, emit });
    res.json({
      meetingId: session.id,
      topic: session.topic,
      opener,
      demoMode: session.demo,
      cap: session.cap,
      callsUsed: session.callsUsed,
      callsRemaining: Math.max(0, session.cap - session.callsUsed),
    });
  } catch (err) {
    if (err instanceof NoKeyError) return res.status(503).json({ error: 'no api key' });
    console.error('[meeting] create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/meetings/:id', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'unknown meeting' });
  res.json({ meeting });
});

app.post('/api/meetings/:id/message', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'message text required' });
  try {
    const out = await sendMessage({ meetingId: req.params.id, text, emit });
    if (out.error) return res.status(404).json({ error: out.error });
    res.json(out);
  } catch (err) {
    console.error('[meeting] message failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meetings/:id/end', (req, res) => {
  const out = endMeeting({ meetingId: req.params.id, emit });
  if (!out.ok) return res.status(404).json(out);
  res.json(out);
});

// ── Static frontend (built) + SPA fallback ───────────────────────────────────
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res
      .status(200)
      .type('text/plain')
      .send(
        'DEV VAN LIFE API is running, but web/dist is missing.\n' +
          'Dev:  npm run dev  (Vite on :5173, this API on :8080)\n' +
          'Prod: npm run build && npm start\n',
      ),
  );
}

// ── Sockets ──────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('init', snapshot());
});

process.on('SIGINT', () => {
  saveNow();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveNow();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚐 DEV VAN LIFE listening on ${PORT} (0.0.0.0:${PORT})`);
  console.log(`   data:    ${DATA_DIR}`);
  console.log(`   gemini:  ${hasKey() ? `${modelName()} (key ${keyPreview()})` : 'DEMO MODE — no key set, canned lines'}`);
  console.log(`   static:  ${fs.existsSync(webDist) ? webDist : 'none (dev mode: use Vite)'}`);
});
