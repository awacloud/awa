---
module: anim/timeline
category: anim
name: graphic.timeline
type: fw.dom.graphic
dependencies: [graphic.scheduler, graphic.tween]
returns: "{ Timeline }"
worker-safe: false
status: complete
---

# anim/timeline — `graphic.timeline`

> Compose tweens with computed start offsets — on the SAME shared scheduler.

**Module** `graphic.timeline` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/anim/timeline.js` | **Deps** `graphic.scheduler`, `graphic.tween` | **Worker-safe** no

## Descriptor

`graphic.timeline` is one capture-free fw module descriptor. Its factory receives
the resolved scheduler and tween modules as parameters and returns `{ Timeline }`;
the `Timeline` class is defined **inside** the factory so it references the
injected `tweenMod.Tween` constructor and shared scheduler — never a module-scope
binding (`fw/no-factory-capture` clean).

```js
export const timelineModule = {
    name: 'graphic.timeline',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.tween'],
    deps: [schedulerModule, tweenModule],
    factory(scheduler, tweenMod) { /* … */ return { Timeline }; },
};
```

`deps.map(d => d.name) === dependencies` (same order). The factory composes
`tweenMod.Tween` instances on the SHARED `scheduler.scheduler` singleton.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Timeline` | `class Timeline(opts?)` | Compose child tweens with computed offsets. |
| `Timeline#add` | `(tweenOrOptions, atMs?) => this` | Place a child at an absolute offset (ms). |
| `Timeline#sequence` | `(items) => this` | Each child starts when the previous ends. |
| `Timeline#parallel` | `(items) => this` | All children start together (offset 0). |
| `Timeline#stagger` | `(items, stepMs \| { each?, from?, ease?, at? }) => this` | Child `i` starts at `i * stepMs`; the options form starts the wave from `'start'`, `'end'`, `'center'`, `'edges'` or an index, and `ease` redistributes the offsets. |
| `Timeline#play` | `() => this` | Register the timeline on the scheduler; resolves `onComplete` when all children are done. Re-arms the `onSettle` latch. |
| `Timeline#stop` | `() => this` | Unregister from its own scheduler (idempotent: no-op before `play()` and after natural completion). Does **not** fire `onComplete`; **does** fire `onSettle`. |
| `Timeline#done` | `boolean` (read) | True once every child completed in the current play cycle; `stop()` leaves it as it was. |
| `Timeline#seek` | `(ms) => this` | Render the whole timeline's state at `ms` (clamped to `[0, duration]`) and move its clock there. |
| `Timeline#pause` | `() => this` | Hold the position: leave the scheduler, stay live (no `onSettle`). |
| `Timeline#resume` | `() => this` | Continue from `time`; on a timeline that is not playing, start a play cycle from there. |
| `Timeline#time` | `number` (read-only) | Current position in ms. |
| `Timeline#duration` | `number` (read-only) | The latest child end, in ms. |
| `Timeline#paused` | `boolean` (read-only) | True between `pause()` and the next `resume()`, `play()` or `stop()`. |
| `Timeline#timeScale` | `number` | Playback rate (1 real time, 0.5 half speed, 0 frozen); a finite number ≥ 0, else it throws. |

`opts`: `{ scheduler?, onComplete?, onSettle? }` — `scheduler` defaults to the
shared instance.

### Terminal lifecycle — `onComplete` vs `onSettle`

A play cycle ends in exactly one of two ways, and the two callbacks answer two
different questions:

| Hook | Fires on natural completion | Fires on `stop()` | Answers |
|------|:---:|:---:|---------|
| `onComplete` | yes | **no** | "the animation reached its end state" |
| `onSettle` | yes | **yes** | "the timeline is terminal, whatever ended it" |

`onSettle` is the additive cleanup channel: it fires **exactly once
per play cycle**, after the timeline has already been unregistered from its
scheduler, and — on the completion path — **immediately before** `onComplete`,
so a completion observer always sees cleanup already done. It never fires for a
timeline that was never played, and `stop()` called twice (or after natural
completion) does not re-fire it. `play()` re-arms the latch, so a replayed
timeline settles again.

Rule of thumb: state whose release is a *precondition of correctness* (a
re-entrancy guard, an in-flight `Set`, a lock) belongs on `onSettle`;
end-of-animation *effects* (final write, notify listeners) belong on
`onComplete`. Hanging a guard release on `onComplete` alone is the exact defect
this hook closes — a caller cancelling the timeline would leave the guard armed
forever.

```js
const guard = { busy: false };
const tl = new Timeline({
    onSettle: () => { guard.busy = false; },     // released on BOTH paths
    onComplete: () => finalWrite(),              // completion only
});
tl.play();
guard.busy = true;
// …either the timeline finishes naturally, or:
tl.stop();            // onSettle ran → guard.busy === false, onComplete skipped
```

`onSettle` adds **no per-frame work**: `_step` only consults a boolean latch on
the frame that turns the timeline terminal. The hook path is DOM-free, so it
does not change the module's Worker-safety profile (still "not Worker-safe"
solely because of the DOM-mutating tweens it drives).

### Control — seek, pause, timeScale

A timeline keeps its **own clock**: each frame advances `time` by the frame
delta times `timeScale`. That clock is what makes scrubbing, slow motion and
a jump to the final state possible:

```js
const tl = new Timeline().add(/* … */).add(/* … */, 400);

range.max = tl.duration;
range.oninput = () => tl.seek(Number(range.value));   // scrub: renders the state at that time
slow.onclick = () => { tl.timeScale = 0.25; };        // slow motion, position kept
pauseBtn.onclick = () => tl.paused ? tl.resume() : tl.pause();

if (matchMedia('(prefers-reduced-motion: reduce)').matches) tl.seek(tl.duration); // final frame, no motion
```

**What `seek(ms)` writes.** Every child whose window has opened is written at
its progress; a child that has not started yet writes its `from`, so a track
holds its first child's start value until it begins, whatever was seeked
before. The write order is the order live play would leave: children that
have not started first, then the others by the time they last wrote (their
end, or now when still running), in insertion order on a tie. For the same
timeline, `seek(t)` therefore leaves the values live play leaves at a frame at
`t`.

`seek` fires each child's `apply` and `onUpdate`, **never** an `onComplete`
(a child's or the timeline's), and leaves the scheduler as it was: a playing
timeline continues from the new position on the next frame; a paused or idle
one stays put until `resume()`. `play()` keeps its contract: it restarts at 0.

### Stagger options

```js
// Buildings rise from the centre out, 70 ms apart, starting at 1.6 s.
tl.stagger(buildings.map((g) => ({ target: g, property: 'transform', from: 'translate(0,400)', to: 'translate(0,0)', duration: 700 })),
    { each: 70, from: 'center', at: 1600 });

// The same span, eased: the gaps shrink toward the edges.
tl.stagger(items, { each: 70, from: 'center', ease: 'ease-out' });
```

`from` is `'start'` (default), `'end'`, `'center'`, `'edges'` or an item
index; `ease` is any easing spec ([anim/tween](./tween.md#easing-specs)) and
maps each child's distance from the origin, as a share of the largest one,
before multiplying by `each`; `at` is a base offset. The number form is
unchanged.

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { timelineModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(timelineModule);              // pulls tween + scheduler + transitive deps
const { Timeline } = runtime.resolve('graphic.timeline');

const tl = new Timeline({ onComplete: () => console.log('all done') });

// Back-to-back: B starts at A's end.
tl.sequence([
  { target: a, property: 'x', from: 0, to: 100, duration: 500 },
  { target: b, property: 'x', from: 0, to: 100, duration: 500 },
]);

// Or all together / staggered:
// tl.parallel([...]);
// tl.stagger([...], 80);

tl.play();
```

## Notes

- **Single-scheduler invariant holds**: a `Timeline` registers ITSELF (one tickable)
  on the shared scheduler and drives its children with offset-anchored timestamps. It
  does **not** open a second rAF loop — only the timeline is in the scheduler's active
  set, not each child (`scheduler.active.size === 1`).
- Offsets: `sequence` = cumulative child durations; `parallel` = 0; `stagger` =
  `i * stepMs` (or the options form above); `add` = the explicit `atMs`.
- The timeline anchors its clock on its first tick and keeps its own time
  (`time`), advanced by each frame delta times `timeScale`; each child's start is
  anchored at its offset on that clock when its window opens, so progress is
  measured from the offset (deterministic under an injected clock).
- Completion: when the last child is `done`, the timeline sets `done`, removes itself
  from the scheduler, fires `onSettle` then `onComplete` (each once).
- **`stop()`** cancels a still-in-flight timeline by unregistering it from its own
  captured scheduler (the shared default, or `opts.scheduler`) — the caller's only
  handle to cancel a turn left on the SHARED scheduler otherwise. Idempotent (a
  no-op before `play()` and after natural completion — `Scheduler#remove` is a
  `Set.delete`, safe on an absent tickable); does **not** fire `onComplete`, and
  `done` is left as-is (a stopped timeline did not "complete"). It **does** fire
  `onSettle` when the timeline was live — see
  [Terminal lifecycle](#terminal-lifecycle--oncomplete-vs-onsettle).
- **Additive, no signature break**: `onSettle` is a new optional `opts` key. A
  timeline built without it behaves byte-for-byte as before, including `stop()`'s
  documented skip-`onComplete` contract.
- **Secure-writer routing**: children that use the default writer route through
  `graphic.tween` → `svgApply.svgAttr` → fw `dom.attr`. **Sanitization scope
  (accurate)**: `dom.attr` writes via raw `setAttribute` and does **not** invoke
  secPolicy sanitization (only `dom.style`/visibility paths sanitize). Timeline-driven
  attribute writes are not XSS-filtered beyond `setAttribute`.
- **Not Worker-safe** (drives DOM-mutating tweens) and **no Worker by default**.

## See also

- [anim/scheduler](./scheduler.md) — the single shared loop the timeline runs on
- [anim/tween](./tween.md) — the children a timeline composes
- [hypertree](../../hypertree.md) — the reference `onSettle` consumer: its
  `ignoreWhileFocusing` guard and in-flight timeline set are released on the hook,
  so cancelling a focus never leaves the tree deaf to clicks
