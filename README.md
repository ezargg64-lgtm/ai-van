# 🚐 DEV VAN LIFE

Your AI agents as dev friends living in a cozy camper van, always driving through a
low-poly day/night world. One page, one 3D scene, five characters who get on with
their lives while you watch — until you give them a task or sit down to talk.

- **Stack:** React + three.js (react-three-fiber + drei) + TypeScript + Vite · Express + Socket.IO · Gemini
- **No external runtime assets.** Every texture, the panorama, the wood floor and the GPS
  screen are drawn procedurally to canvases at mount.
- **No database.** `data/store.json` is the source of truth; mount it as a volume.

```
npm run install:all     # server + web deps
npm run dev             # Express :8080 + Vite :5173 (open http://localhost:5173)
npm run build && npm start   # single process on :8080 serving the API *and* the SPA
cd web && npm test      # typecheck + two headless smoke tests (see below)
```

## What you can do

| Action | What happens |
| --- | --- |
| **Give a task** (bottom bar) | Michael plans it → 2-4 subtasks → every agent shoves over to the dinette (staggered 150ms), the assignee speaks, results land in the panel, then everyone disperses back to what they were doing. |
| **💬 Discuss with Team** | The team turns to face you at the dinette. You chat; each round is Michael + up to two specialists. A hard Gemini-call budget is shown and counted down; at zero the chat auto-concludes and the van goes back to life. |
| **⚙️ Settings → Agents** | Edit each agent's name, role, colour and persona. Persists to disk, survives restarts. |
| **⚙️ Settings → Global** | Paste a Gemini key (or leave it and run in **demo mode** with canned agent lines — the whole flow is testable for $0), pick the model, the day-cycle length and the per-chat call cap. |
| **Orbit / zoom** | Drag to orbit, scroll to zoom. The camera is clamped to 60° either side of the open wall, 35–55° polar, 5.2–11.5m: it can never enter the van or look in from behind the far wall. |
| **⏯ in the top bar** | Pause/resume the day-night cycle. |

## How it is put together

The one rule that keeps this maintainable: **the simulation layer is the only writer of
visual state, and the scene is a pure renderer.** Backend payloads never reach a scene
component — they land in `net/socket.ts`, get translated into `VanAgentState`, and the
scene reads that and nothing else.

```
web/src/
  sim/       vanLayout.ts  ← single source of truth for every position in the van
             types.ts      ← the state contract (VanAgentState)
             writer.ts     ← the only door into visual state (bubbles auto-expire here)
             livingSim.ts  ← idle life: weighted activities, chat pairs, seat occupancy
             taskStaging.ts← tasks/meetings interrupt everything and hand it back
             occupancy.ts  ← who sits where; "staged" agents are off-limits to idle life
             timeOfDay.ts  ← one number t∈[0,1): sun, lamps, string lights, panorama blend
             vanStore.ts   ← the scene's only input
  scene/     Interior, Props, World (panorama + scrolling world), Lighting (3 lights),
             AgentAvatar (articulated), AgentLabels (bubbles), Rig (camera), avatarRig.ts
  net/       api.ts (REST) · socket.ts (the seam)
  hud/       TopBar, TaskBar, ResultsPanel, ChatPanel, SettingsPanel, Toasts
  state/     hudStore.ts — the only place backend shapes are allowed
server/
  index.js · orchestrator.js · meetings.js · prompts.js · gemini.js · demo.js · store.js
```

### Scene decisions worth knowing

- **Cutaway, not transparency.** No roof and no wall on the +Z side — real missing geometry,
  with corner posts and roof-edge beams so it reads as a dollhouse rather than a bug.
- **Ride-along sway.** The brief parents the camera to a swaying group; that fights
  OrbitControls' orbit math, so the *world* rocks instead (see `scene/motion.ts`). The van
  stays rock-steady on screen, the scenery bobs — same feeling, no jitter, and the control
  stays perfectly predictable for the user. Speech bubbles follow their head's world position
  every frame (not parenting) for the same reason.
- **Three real lights, hard cap.** Sun/moon (the only shadow caster), the dinette pendant,
  and the cyan cab glow. String lights and window glow are emissive meshes only.
- **Articulated legs.** Hips → torso → head/arms, thighs → knees, all angles damped, so every
  pose change is a ~0.35s tween. `BODY` in `avatarRig.ts` is measured so the sole of the shoe
  lands exactly on the floor for standing *and* for a 44cm cushion.
- **The only raised seat** is the bunk: agents walk to the ladder, climb, then slide in; and
  reverse it on the way out. Nothing ever floats sideways.
- **The over-cab bunk sets the cab's height budget.** Its underside is 1.34 and its
  camera-side edge stops at z = 0.50, so a seated head (1.32) clears it and the cab stays
  visible from the default framing; the swivel seat lives out at z = 0.72 for the same
  reason. `BUNK_SLAB` is the shared volume, and the rig suite asserts that no slot pokes into
  it, that the sleeper rests on the mattress inside the footprint, and that the sleeper stays
  below the wall line.

## Tests

No browser needed — both suites run in Node.

```bash
cd web
npm run test:sim   # drives the whole sim on a VIRTUAL clock (Date.now + setTimeout patched)
npm run test:rig   # builds the avatar's kinematic chain in three.js and measures it
```

`test:sim` plays out ~20 virtual minutes per run and asserts the things the acceptance
criteria actually care about: no two agents share a seat, activities cycle through zones and
props, somebody is always coding during the day, a task pulls all five to the dinette and
stages their speaking beats, the huddle breaks up and life resumes, and a meeting turns every
agent to face the camera. `test:rig` proves the bodies fit the van: feet on the floor, hips
exactly on the slots the layout promises, nobody through a wall or a ceiling, the lying agent
on the mattress, and no two huddled agents overlapping.

## Deploying

**One container, one volume. Not serverless** — Vercel's ephemeral filesystem resets
`store.json` on every request (that was the blank Agents tab).

```bash
docker build -t dev-van .
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e GEMINI_API_KEY=... dev-van
```

Railway (easiest): deploy the repo, add a **Volume** at `/app/data`, set `GEMINI_API_KEY`.
Render: same, but it calls it a **Disk**. Fly.io: `fly launch` picks up the Dockerfile, then
`fly volumes create data`. Any VPS: the `docker run` above, behind Caddy or nginx for TLS.

| Env var | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | default key; without one the app runs in demo mode |
| `GEMINI_MODEL` | `gemini-2.5-flash` | model for every call (overridable in Settings) |
| `PORT` | `8080` | listen port |
| `DAY_CYCLE_MINUTES` | `12` | one full day/night cycle |
| `MEETING_CALL_CAP` | `20` | Gemini calls per "Discuss with Team" session |
| `DATA_DIR` | `./data` (`/app/data` in Docker) | where `store.json` lives |

### Post-deploy checklist

- [ ] `GET /api/agents` returns 5 agents
- [ ] Settings → Agents: edit a persona, save, hard-refresh → still there
- [ ] Settings → Global: paste a key, save → top bar stops saying `demo`
- [ ] Submit a task → huddle → bubbles → wrap-up → agents disperse
- [ ] Discuss with Team → multi-turn chat → budget counts down → end → idle resumes
- [ ] Restart the service → everything is still there (the volume works)
- [ ] Orbit stays on the open side; the world scrolls; night brings the string lights

## API

```
GET  /api/health                     → { ok, demoMode, model }
GET  /api/agents                     → the 5 agents (name, role, colour, persona, bias)
PUT  /api/agents/:id                 → edit one agent
GET  /api/settings                   → model, key source/preview, cycle, cap, demoMode
PUT  /api/settings                   → save global settings (key, model, cycle, cap)
GET  /api/tasks                      → last 10 tasks
POST /api/tasks       { task }       → 202 + taskId, then streams over WS
POST /api/meetings    { topic }      → { meetingId, opener, cap, callsUsed, callsRemaining }
POST /api/meetings/:id/message {text}→ one round: manager + up to 2 specialists
POST /api/meetings/:id/end           → conclude the session
```

WebSocket events: `task_created`, `task_split`, `staff_started`, `staff_finished`,
`task_completed`, `task_failed`, `meeting_summon`, `meeting_line`, `meeting_ended`,
`agents_updated`, `settings_updated`.
