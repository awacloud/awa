# Lumen Rail — technique map

A one-minute rail shooter in SVG, built with this package, its svg3d kernels
and fw input. Everything lives in `main.js`; the page boots the aggregate,
calls `run()` and wires three buttons.

## The game

The Kite flies into the screen down a dusk lane. Drones come in waves (a
line, a V, an arc, two columns) and fire one slow orb each; amber pylons
stand in the lane; the Warden, a core inside a turning ring of ten
segments, holds the lane at the end of the run and fires fans of five orbs.
The lasers fire on their own, alternating wings. The shield loses 25 on a
pylon, 20 on a drone and 12 on an orb; at 0 the run ends. A drone is worth
100, the Warden 5 000. Steer with the arrow keys / WASD or by dragging; any
input during the attract mode takes the controls.

## Techniques

| Part | Technique |
|---|---|
| The scene | one `svgBuild` template, built once with a scoped id prefix: sky, ridge, ground, grid, every pool, the ship, the HUD |
| No DOM node per frame | fixed pools (18 bolts, 12 drones, 16 orbs and their cores, 10 pylons, 48 sparks) toggled with `display`; text through the element's own text node (`data`), never `textContent`, which would create one; `tests/lumen-rail.integration.test.js` counts the nodes created over a whole run: 0 |
| The perspective | `svg3d.project.createCamera` gives the camera; its `depth` is the divide: `screen = offset + depth · (p − eye) / z`. The eye sits 90 units above the lane, so the ship flies in the lower part of the frame and enemies come down from the horizon |
| The meshes | the Kite (5 vertices, 4 faces, banked and pitched by its speed) and the octahedra of the drones and the Warden's core, rotated with `svg3d.vec3` (`rotationMatrix3`, `applyMatrix3`) and projected vertex by vertex; one path per mesh |
| The ground | lateral lines projected once; twelve rows whose depth runs toward the camera |
| The loop | one tickable on the shared scheduler; the game steps in fixed 1/60 s steps from the frame time, so a run plays the same at any frame rate; `handle.advance(ms)` steps it without a clock |
| The script | a sorted list of waves, pylon rows and banners in game time; the Warden at 47 s |
| The autopilot | dodges the pylons and the orbs about to reach the ship (the free lane position farthest from them), otherwise lines up with the nearest target; it clears the run in about 56 s |
| The HUD | `graphic.timeline` and `tween`: the wave banners (`opacity`, `letter-spacing` with a `cubic-bezier`), the damage flash, the Warden's bar; every timeline is stopped on `dispose()` |
| Input | fw `dom/query/events` (a scope for `keydown`/`keyup` on the document) and fw `dom/query/gesture` (`pan` deltas on the scene) |
| Randomness | seeded generators only (the ridge, the sparks); `Math.random` is blocked by fw's sanity lockdown in any case |

## Measured

- 191 SVG elements, the same before and after a whole run.
- The autopilot's run: the Warden at 47.3 s, the run clear at 56.3 s.

## Origin

An original game in the genre of the early-1990s 3D rail shooters: its
name, its ship, its enemies, its level and its look are this demo's own.
