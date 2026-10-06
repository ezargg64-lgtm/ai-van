# 🚐 Van layout — the coordinates

`web/src/sim/vanLayout.ts` is the single source of truth. If something is in the wrong
place, fix the number there; the scene, the sim and both test suites read it.

Axes: **+X forward** (cab/windshield) · **+Y up** (floor top = 0) · **+Z the open side**
(where the camera lives) · **−Z the long wall with the windows**.

```
                                   windshield
        ┌────────────────┬──────────────┐ ← bunk platform (y 1.05-1.19, mattress to 1.28)
  −Z    │  galley        │   cab        │
  wall  │  counter 0.91  │   dash 0.86  │  ┌─ roof edge beams at y=2.01, corner posts
  ──────┤  sink / stove  │   GPS glow   │  │  ROOF IS ABSENT (cutaway)
        │  shelf 1.44    │              │  │
        │                │  swivel seat │  │
        │  dinette       │  (Michael)   │  │   ← ladder at the bunk's open edge
        │  table 0.66    │              │  │
        │  bench x2      │  [side sill] │  │
        ├────────────────┤              │  │
        │  sofa  (2)     │   beanbag    │  │
        │                │   (floor)    │  │
        └────────────────┴──────────────┘
  x=-2.42        x=-1.6      x=0      x=1.9   x=+2.42
                                   (rear door)              (front)
        ↑ this wall exists (-Z)                     ↑ this wall is MISSING (+Z)
```

Seats are **hip anchors** `[x, hipY, z]`. The avatar's root is placed at
`hipY - BODY.hipY (0.82)`, so one convention covers sitting, standing and lying down —
and `test/rig.smoke.ts` asserts the hip lands exactly there for every slot.

| Zone | Slots | Pose | hip y | Furniture it belongs to |
| --- | --- | --- | --- | --- |
| `driver-seat` | 1 `(1.80, 0.50, −0.45)` | sit-upright | 0.50 | swivel seat, faces the living area (yaw −1.11) |
| `dinette` | 3 `(0.15 / 0.68 / 0.45, 0.48, −0.60 / −0.60 / 0.42)` | sit-upright | 0.48 | far bench ×2 + near stool, table at 0.66 |
| `dinette` overflow | 2 standing `(0.30, 0.82, 0.98)`, `(−0.62, 0.82, 0.86)` | stand | 0.82 | huddlers 4 and 5 |
| `sofa` | 2 `(−1.92 / −1.30, 0.46, −0.56)` | sit-crossleg | 0.46 | cushions at 0.44, faces the camera |
| `bunk` | 1 `(1.93, 1.47, −0.30)` | lie-side | 1.47 | mattress top 1.28, head to the open side |
| `galley` | 1 `(−0.38, 0.82, −0.50)` | stand | 0.82 | counter at 0.91, faces −Z |
| `floor` | 1 `(−0.50, 0.48, 0.80)` | sit-crossleg | 0.48 | beanbag (squashes to ~0.46) |
| `aisle` | 2 standing | stand | 0.82 | overflow / passing through |

The bunk is the only raised slot: `AgentAvatar` sends anyone heading there (or leaving
it) via `BUNK_CLIMB_ANCHOR [1.92, 0.82, 0.78]` so they climb the ladder instead of
floating across the van.

**Lighting budget:** sun/moon (shadow caster) + pendant `(0.28, 1.74, −0.20)` +
cab glow `(1.98, 1.02, −0.50)`. String lights live at y 1.9 on both long edges and are
emissive only.

**Poses** (`avatarRig.ts`): `sit-upright`, `sit-crossleg`, `lounge`, `lie-side`, `stand`,
`shuffle`. Angles are damped, so every change is a ~0.35s tween; the walk cycle is blended
on top and suppressed while lying.
