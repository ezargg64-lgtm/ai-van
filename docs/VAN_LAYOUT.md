# 🚐 Van layout — the coordinates

`web/src/sim/vanLayout.ts` is the single source of truth. If something is in the wrong
place, fix the number there; the scene, the sim and both test suites read it.

Axes: **+X forward** (cab/windshield) · **+Y up** (floor top = 0) · **+Z the open side**
(where the camera lives) · **−Z the long wall with the windows**.

```
  −Z                windshield
  wall  ┌──────────────────────────────────────┐
  ──────┤  galley        │  dinette  │  cab     │
        │  counter 0.91  │  table    │  dash    │   ┌─ roof edge beams at y=2.01
        │  sink / stove  │  0.66     │  GPS     │   │  corner posts at ±2.42/±1.06
        │  shelf 1.44    │  bench x2 │  glow    │   │  ROOF IS ABSENT (cutaway)
        │                │           │          │   │
        │  sofa (2)      │  beanbag  │ swivel   │   │  bunk slab above the cab:
        │  cushions 0.44 │  on floor │ seat     │   │  x 1.44-2.44, z −1.11-0.50,
        │                │           │ 0.72     │   │  underside 1.34, mattress 1.52
        └──────────────────────────────────────┘
   x = −2.42      −1.6        −0.4      0.5      1.9      +2.42
   (rear door)                                        (front)
        ↑ this wall exists (−Z)              ↑ this wall is MISSING (+Z)
                                  ↑ ladder (x 1.44, z 0) + climb anchor (1.18, 0)
```

**The bunk is deliberately high.** Its underside sits at 1.34 so a seated head (1.32) clears
it, and its camera-side edge stops at z = 0.50 so everything more towards +Z stays visible
from the default framing — which is exactly why the swivel seat lives out at z = 0.72
instead of under the bunk. `test/rig.smoke.ts` asserts both of those.

Seats are **hip anchors** `[x, hipY, z]`. The avatar's root is placed at
`hipY - BODY.hipY (0.82)`, so one convention covers sitting, standing and lying down —
and `test/rig.smoke.ts` asserts the hip lands exactly there for every slot.

| Zone | Slots | Pose | hip y | Furniture it belongs to |
| --- | --- | --- | --- | --- |
| `driver-seat` | 1 `(1.72, 0.50, 0.72)` | sit-upright | 0.50 | swivel seat by the door, faces back into the van (yaw −2.2) |
| `dinette` | 3 `(0.15 / 0.68 / 0.45, 0.48, −0.70 / −0.70 / 0.42)` | sit-upright | 0.48 | far bench ×2 + near stool, table at 0.66 |
| `dinette` overflow | 2 standing `(0.30, 0.82, 0.98)`, `(−0.62, 0.82, 0.86)` | stand | 0.82 | huddlers 4 and 5 |
| `sofa` | 2 `(−1.92 / −1.30, 0.46, −0.56)` | sit-crossleg | 0.46 | cushions at 0.44, faces the camera |
| `bunk` | 1 `(1.93, 1.71, −0.32)` | lie-side | 1.71 | mattress top 1.52, head to the open side |
| `galley` | 1 `(−0.38, 0.82, −0.50)` | stand | 0.82 | counter at 0.91, faces −Z |
| `floor` | 1 `(−0.50, 0.48, 0.80)` | sit-crossleg | 0.48 | beanbag, squashes to ~0.46 |
| `aisle` | 2 standing | stand | 0.82 | overflow / passing through |

The bunk is the only raised slot: `AgentAvatar` sends anyone heading there (or leaving
it) via `BUNK_CLIMB_ANCHOR [1.18, 0.82, 0.00]` so they climb the ladder on the
living-area edge instead of floating across the van. `BUNK_SLAB` in `vanLayout.ts` is the
volume the scene builds and the rig test checks against.

**Lighting budget:** sun/moon (shadow caster) + pendant `(0.28, 1.74, −0.20)` +
cab glow `(2.00, 1.05, 0.60)`. String lights live at y 1.9 on both long edges and are
emissive only.

**Poses** (`avatarRig.ts`): `sit-upright`, `sit-crossleg`, `lounge`, `lie-side`, `stand`,
`shuffle`. Angles are damped, so every change is a ~0.35s tween; the walk cycle is blended
on top and suppressed while lying.
