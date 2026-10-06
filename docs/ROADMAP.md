# Roadmap & known limits

## What phase 5 did not get to verify

**`docker build` has not been executed in this environment** (no Docker daemon available in
the sandbox). The Dockerfile is straightforward and mirrors the documented Railway/Render
flow, but treat the first build as unverified. Everything on the runtime side *is* verified:
the same Express process that the image starts (`node server/index.js`, `NODE_ENV=production`)
was run against the built `web/dist` and checked for:

- `GET /` → the built `index.html`
- `GET /assets/*` → hashed JS/CSS with the right content types
- `GET /deep/link` → SPA fallback returns `index.html`
- `GET /api/agents` → the 5-agent JSON
- WebSocket handshake on `/socket.io`

Also unverified for the same reason: the actual pixels. No browser was available in the
sandbox, so the 3D scene has been verified by construction and by two headless suites
(`test:sim`, `test:rig`) rather than by screenshot. The first thing to do on a real machine:
open it, watch a full 12-minute cycle, and check the acceptance list at the bottom of the
README.

## Good next steps

1. **Screenshot testing.** Wire `playwright` in a CI runner that has browsers, screenshot the
   van at four times of day, and diff. That closes the "pixels" gap above permanently.
2. **Prop detail pass.** The kettle steam exists; add a foaming coffee trick, a book page
   turn, and a handheld screen flash on the winning run.
3. **Sound.** Optional, off by default: tyre hum, kettle whistle, the string lights coming on.
4. **A fourth room.** The van has no bathroom/awning; a rear awning with two deck chairs
   would give a nice "sunset" zone.
5. **Task history.** `store.json` keeps the last 30 tasks; surface them in the results panel
   so yesterday's work is one click away.
6. **Multiple vans.** `data/store.json` is a single tenant today. If you want a fleet, the
   natural seam is `store.js` (one object per van) plus a van id in the socket room.
