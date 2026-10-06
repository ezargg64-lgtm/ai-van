# Build log — what each phase delivered, and how it was checked

This follows the five phases of the original plan. "Verified" lists what was actually
executed in this environment; the honest gaps are in [ROADMAP.md](ROADMAP.md).

## Phase 1 — Van shell + camera ✅

`sim/vanLayout.ts` (single source of truth: zones, hip anchors, yaws, poses, activity
table, warps), the cutaway interior (floor with a procedural plank texture, far wall with
real window holes, windshield with a hole, corner posts and roof-edge beams so the missing
roof reads as a dollhouse, dash with a drawn GPS screen, swivel + passenger seats, dinette,
galley, sofa, bunk with a ladder, beanbag, guitar, wall art), the three-light rig, and
`OrbitControls` clamped to the open side. Agents load already posed in their default zones.

**Verified:** `npm run test:rig` measures every slot: the hip lands exactly on the slot, the
body stays inside the shell, nothing pokes through the ceiling, and each of the three camera
framings is reachable inside the orbit clamp (distance 5.2–11.5m, polar 35–55°, azimuth
±60°), so the camera cannot snap on the first drag.

## Phase 2 — Moving world ✅

Curved panorama cylinder (45m) with two 2048×512 canvases generated once and cached, day and
night layers crossfaded by `timeOfDay`; the sky/fog/lamps/string lights/window glow all follow
that one number. Ground, road with scrolling dashes and edge lines, guardrail posts, bushes,
a forest and distant hills — all instanced and recycled over a 180m loop. The world rocks on a
2.4s sine (see below); the road and dashboards are procedural too.

**Verified:** `npm run test:textures` draws every texture through a validating mock canvas
(catches typos like a gradient used before it is built, or an out-of-range `globalAlpha`) and
checks the wrap flags, size and caching. `test:sim` asserts the cycle drives the sim: string
lights off at midday and fully on at night, the panorama blend at both extremes, the lamp
brighter at night, and the clock mapping.

**Deviation, deliberate:** the brief parents the camera to a swaying group. That fights
OrbitControls' orbit math (the controller computes its offset in the camera's local space), so
the *world* sways instead and the van stays steady on screen. Same ride-along feel, no jitter,
and the user's orbit stays predictable. Bubbles follow their head's world position for the
same reason.

## Phase 3 — Poses + living sim ✅

Six poses with damped angles (~0.35s tweens), a walk cycle blended on top and suppressed while
lying, articulated hips → torso → head/arms and thighs → knees, per-activity props, Zzz sprites,
and a ladder climb for the bunk. `livingSim.ts` runs the staggered 30–50s decision timer with
weighted activities (agent bias × time-of-day bias), seat occupancy with overflow fallbacks, a
guarantee that somebody codes during the day, idle bubbles, and 2–3 turn chat pairs between
adjacent zones.

**Verified:** `test:sim` plays ~20 virtual minutes per run: no two agents ever share a seat,
at least three different activities and zones occur, somebody codes during the day segment, and
slots stay legal, and a 90-second trace after the task proves the van never empties out (at
least two busy at every sample, back to 4/5, nobody idle for more than 50s, three or more
different activities seen). `test:rig` proves the feet land on the floor for every seated pose (and are
not 6cm under it), the sleeper rests on the mattress under the wall line, and no slot pokes
into the bunk slab.

## Phase 4 — Task + chat staging ✅

`taskStaging.ts`: any task/meeting event clears activities, staggers everyone to the dinette
150ms apart (3 seats + 2 standing overflow), stages the speaking beats with bubbles and gaze,
and hands the van back to `livingSim` afterwards, resuming each agent's remembered activity.
Meetings turn everyone to face the camera, run the Manager → up to two specialists round, keep
a visible Gemini-call budget, and auto-conclude at zero. The HUD has the task bar, results
panel, chat panel, persona editor and global settings; demo mode makes the whole flow free.

**Verified:** `test:sim` runs a task end to end (all five at the dinette, five distinct spots,
one speaker at a time, result bubbles, wrap-up, everyone picks life back up) and a meeting
(everyone faces the camera, speaker bubbles, end → idle).

## Phase 5 — Deploy prep ✅

`Dockerfile` (two stages, `npm ci`, static `web/dist`, `DATA_DIR=/app/data`), Express static
serving with an SPA fallback that does not swallow `/api` or `/socket.io`, root scripts,
`.env.example`, `.dockerignore`, and the hosting guide in the README.

**Verified:** the production path was exercised directly — `GET /` returns the built
`index.html`, hashed assets return 200 with the right content type, a deep link falls back to
`index.html`, and `/api/*` still answers JSON. **`docker build` itself has not been run**: no
Docker daemon in this environment (see ROADMAP).
