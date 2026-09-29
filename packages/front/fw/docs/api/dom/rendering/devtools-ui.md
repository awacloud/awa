---
module: devtoolsUI
category: dom/rendering
dependencies: [devtools]
returns: object
worker-safe: false
status: complete
---

# devtoolsUI

> Opt-in DOM inspector rendering the session, module-registry and signal-graph views.

**Module** `devtoolsUI` | **Source** `packages/front/fw/src/dom/rendering/devtools-ui.js` | **Deps** `devtools` | **Worker-safe** no

`devtools` exposes data only. `devtoolsUI` is the fw-side, no-bundler renderer of
that data: it turns `devtools.inspect()`, `runtime.snapshot()` and
`signal.inspectGraph()` into DOM, and does nothing else.

## Resolve

```js
const devtoolsUI = runtime.resolve('devtoolsUI');
// Returns: { render, renderSession, renderRegistry, renderGraph }
```

## Opt-in contract

- **Importing the file mounts nothing.** No side effect at import, no ambient
  read, no auto-mount. Measured in a fresh realm: after importing the module,
  `document.body` has zero children and zero text.
- **Instantiating mounts nothing.** `factory()` builds closures only.
- A view exists **only** after an explicit `render*` call with a target element
  the caller supplies. Nothing is discovered, scanned or hooked for you.
- Each call **appends** a fresh subtree and returns it; the target is never
  cleared. The caller owns the lifetime (`root.remove()`).

## Read-only guarantee

The inspector never writes back into what it inspects. Asserted against the
**sources**, not the view:

| Source | Read through | What is guaranteed |
|--------|--------------|--------------------|
| `uiSession` | `devtools.inspect()` / `summarize()` | Session snapshot identical before/after; the session's own container DOM untouched |
| Module registry | `runtime.snapshot()` | Frozen metadata rows; `runtime.instances` unchanged — rendering **instantiates nothing** |
| Signal graph | `signal.inspectGraph()` | Graph identical before/after; no effect re-runs and no dependency is registered |

`runtime.list()` is deliberately **rejected** by `renderRegistry`: it hands back
live `ModuleDefinition`s (splicable `dependencies`, callable `factory`), which
would make the view a write channel. Only `snapshot()` is accepted.

Every value reaches the DOM through `textContent`, so no inspected string can
ever be interpreted as markup.

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `render` | `(target: Element, sources?: { session?, runtime?, signal?, filter? }) => Element` | Composite root `<section class="fw-devtools-ui">`, one view per supplied source, in the fixed order session → registry → graph |
| `renderSession` | `(target: Element, session: object) => Element` | `<section data-view="session">` — `devtools.inspect()` view |
| `renderRegistry` | `(target: Element, runtime: object, filter?: object) => Element` | `<section data-view="registry">` — `runtime.snapshot(filter)` view |
| `renderGraph` | `(target: Element, signal: object) => Element` | `<section data-view="graph">` — `signal.inspectGraph()` view |

All four throw when `target` is not a DOM element. `renderRegistry` throws
unless its source exposes `snapshot()`; `renderGraph` throws unless its source
exposes `inspectGraph()`.

### The three views

1. **Session** — container, one-line `summarize()`, then tables for blocks
   (`block` / `logical ids` / `loop`), listeners, lists, and a counts table for
   the remaining collections.
2. **Module registry** — one row per registered *version*:
   `module` / `version` / `type` / `dependencies` / `latest` / `instantiated`.
3. **Signal graph** — the live effects (`effect` / `deps`), the signals they
   observe (`signal` / `kind`) and the edges between them.

## Examples

```js
const devtoolsUI = runtime.resolve('devtoolsUI');
const panel = document.querySelector('#inspector');

// Everything at once.
const root = devtoolsUI.render(panel, {
    session: myUiSession,
    runtime,                 // read through runtime.snapshot()
    signal: signalInstance,  // the signal.factory() INSTANCE, not the descriptor
});

// …later
root.remove();
```

```js
// One view at a time, with a registry filter.
devtoolsUI.renderRegistry(panel, runtime, { type: 'fw.dom.' });  // prefix match
devtoolsUI.renderGraph(panel, signalInstance);
```

## Notes

- **The signal-graph view is partial by design, and says so on screen.** It is
  the *effect* dependency graph: a signal no live effect observes is not a node,
  and the own sources of a `computed` are not edges (a `computed` read by an
  effect does appear, as a node of kind `computed`). The rendered note states
  this — absence in the view is not absence in the app.
- **The graph is per `signal.factory()` instance.** Pass the instance your app
  actually uses; a module descriptor is rejected, and a different instance would
  report a different (correct but unrelated) graph.
- **Lockdown-compatible, measured with zero carve-outs.** The single dependency
  `devtools` is itself measured lockdown-clean, and the DOM surface used here
  (`createElement`, `appendChild`, `textContent`, `setAttribute`, `className`)
  works post-`lockdown()` — see
  `packages/front/fw/tests/devtools-ui-lockdown.integration.test.js`, which
  drives a pre-freeze instance, a fresh post-freeze factory and the canonical
  `runtime.resolve()` path, with a control assertion proving the freeze applied.
- **No live updates.** Views are snapshots at call time; there is no
  "session mutated" hook to subscribe to. Re-render to refresh.
- The module registers no listener, installs no timer and holds no state between
  calls, so a rendered view can be dropped by removing its root element.

## See also

- [devtools](./devtools.md) — the data API this module renders (`inspect`, `summarize`, …)
- [uiSession](./uiSession.md) — the session inspected by the first view
- [runtime](../../core/runtime.md) — `snapshot()`, the read-only registry accessor
- [signal](../../io/utils/signal.md) — `inspectGraph()` and its documented limits
