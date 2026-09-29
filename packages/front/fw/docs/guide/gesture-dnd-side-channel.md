# Gesture & DnD side-channel

> **Status**: documentation-only — no new code. Describes the implicit contract
> between `gesture`, `dnd` and the rest of the rendering pipeline.

## TL;DR

The `gesture` (pinch / pan / rotate / swipe / long-press) and `dnd`
(HTML5 drag-and-drop + DataTransfer) modules **do not use the classic reactive
pipeline** (`signal`, `ui.bind`, `ui.list`). They operate as a **direct
side-channel** on DOM nodes, for two reasons:

1. **Latency** — a 120 Hz gesture cannot afford a diffing loop. The `pointermove`
   handler writes `transform: translate3d(…)` directly on the targeted element,
   bypassing template/render.
2. **Native APIs** — `DragEvent.dataTransfer`, `pointercancel`, pointer capture
   (`setPointerCapture`) are designed to operate on the originating element.
   Indirection = loss of browser context.

## Consequences for the developer

### 1. State managed by the module, not by `signal`

```js
// ✗ Anti-pattern: trying to bind a drag position to a signal
const x = signal.create(0);
ui.bind('#card', el => el.style.left = x.get() + 'px');
const g = gesture.attach(card, { onPan: ({ dx }) => x.set(x.get() + dx) });
// → 2× re-render per frame, guaranteed flickering
```

```js
// ✓ Good pattern: let gesture write directly, read final state on drop
const g = gesture.attach(card, {
    onPanEnd: ({ dx, dy }) => {
        // Persist the final state HERE (a single signal.set per drop)
        position.set({ x: position.get().x + dx, y: position.get().y + dy });
    }
});
```

### 2. Re-render = active gesture lost

If during a gesture you replace the node (`ui.list` in `replace` mode,
`template.create` that re-injects a subtree), **the gesture is cancelled** by
the browser — `pointercancel` is emitted. Mitigations:

- Prefer `onUpdate: 'patch'` or `'none'` on lists while a gesture is active.
- Mark the gesture zone with `data-fw-no-rerender` (internal convention)
  and skip it in reconciliation.

### 3. `dnd` is asymmetric

The HTML5 DnD API requires:
- the **source** carries `draggable="true"` and a `dragstart` listener that
  fills `dataTransfer`.
- the **target** carries a `dragover` listener that *must* call
  `e.preventDefault()` otherwise `drop` does not fire.

The framework's `dnd` module hides this mechanism behind
`dnd.draggable(el, opts)` / `dnd.dropTarget(el, opts)`, but the **data flow
remains outside signal**. Transfer happens via `dataTransfer.setData(type, json)`
and reading on `drop`. Do not try to synchronise source ↔ target via a shared
signal during the drag: the browser already has that channel.

### 4. Touch vs mouse vs pen

All module gestures use `pointerdown / pointermove / pointerup`,
which unify the three. **Do not listen** to `mousedown` / `touchstart` in
parallel — you would get duplicates on hybrid devices (touch laptops).
The module already handles this case.

### 5. Cleanup

`gesture.attach(el, opts)` returns a handle `{ on, off, detach, dispose }` —
`dispose()` (alias `detach()`) detaches all listeners and releases pointer
capture. **Always** call it in `ui.onUnmount`, otherwise listeners
survive node replacement:

```js
const handle = gesture.attach(el, { onPan });
ui.onUnmount('card', () => handle.dispose());
```

`ui.adopt('card', () => handle.dispose())` is strictly equivalent.

## Why not a unified channel?

Recurring question: "why not also pass gesture / dnd through
`signal` + `ui.bind` to have a homogeneous API?"

Evaluated trade-offs:

| Option                          | Latency | Code     | Browser DnD compat |
|---------------------------------|---------|----------|---------------------|
| Direct side-channel (current)   | ~1 ms   | native   | full                |
| `signal` pipeline + diff        | ~16 ms  | abstract | DnD broken (async preventDefault) |
| Hybrid (signal for `onEnd`)     | ~1 ms   | mixed    | full                |

The framework adopts the 3rd option: **side-channel for movement, signal
for final state**.

## Anti-patterns to avoid

- Do not call `signal.set` in `onMove` (re-render at 120 Hz).
- Do not listen to `mousedown` + `touchstart` alongside the gesture module.
- Do not unmount the target node while a gesture is in progress
  (`ui.clear(parent)`, `list.sync` in `replace`).
- Do not forget `preventDefault()` on `dragover` (the module does it, but
  not if you bypass the API).
- Do not store `dataTransfer` beyond the `drop` handler (object cleared by the
  browser at the end of the event).

## See also

- `src/dom/query/gesture.js` — gesture module (pan/pinch/rotate/swipe/long-press)
- `src/dom/query/dnd.js`     — dnd module (source/target/file-drop)
- `docs/guide/rendering-pipeline.md` — why `signal` cannot keep up with 120 Hz
- `docs/guide/security.md`    — cross-origin DnD (files, URL, JSON)
