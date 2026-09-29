---
module: focus
category: dom/utils
dependencies: [dom, events]
returns: object
worker-safe: false
status: complete
---

# focus

> Focus trap, tab order, stash/restore, and focus-change notification.

**Module** `focus` | **Source** `packages/front/fw/src/dom/utils/focus.js` | **Deps** `dom`, `events` | **Worker-safe** no

Focus manager for complex interfaces: Tab loop within a container (modal, dialog), visible non-inert tab-order calculation, keyboard next/previous navigation, active focus capture/restore, and focus-change subscription.

## Resolve

```js
const focus = runtime.resolve('focus');
// Returns: { trap, tabOrder, next, previous, stash, current, onChange }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `trap` | `(el: Element, opts?) => TrapCtrl` | Trap controller |
| `tabOrder` | `(container: Element) => HTMLElement[]` | Ordered focusable elements |
| `next` | `(container?: Element) => void` | Focus on the next element |
| `previous` | `(container?: Element) => void` | Focus on the previous element |
| `stash` | `() => { restore() }` | Capture + restore of active focus |
| `current` | `() => Element` | `document.activeElement` |
| `onChange` | `(fn: (newEl, oldEl) => void) => unsubscribe` | Subscribe to focus changes |

### `focus.trap(el, opts?)`

Creates a focus trap inside `el`. Returns `{ activate, deactivate, pause, resume, paused }`.

- On activation: focuses `opts.initialFocus` (element or CSS selector) or the first focusable element.
- `Tab` / `Shift+Tab` loops within `el` — captures `keydown` on the container.
- On deactivation: restores pre-activation focus if `returnFocus: true` (default).
- `escapeDeactivates: true` → `Escape` automatically calls `deactivate()`.
- `pause()` / `resume()` temporarily suspends the trap without destroying it.

#### Options `trap`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `initialFocus` | `Element \| string` | first focusable | Focus target on activation |
| `returnFocus` | `boolean` | `true` | Restores pre-activation focus |
| `escapeDeactivates` | `boolean` | `false` | `Escape` deactivates the trap |
| `allowOutsideClick` | `boolean` | `false` | Reserved — future use |

### `focus.tabOrder(container)`

Returns focusable elements in logical order. Inclusion criteria:
- visible (`offsetParent !== null` or dimensions > 0),
- not `disabled`,
- no `inert` ancestor,
- `tabindex >= 0` or naturally focusable element (`a[href]`, `button`, `input:not([type=hidden])`, `select`, `textarea`, `[contenteditable]`, `[tabindex]`).

Order: positive tabindexes sorted ascending, then tabindex 0 / natural elements in DOM order.

### `focus.stash()`

Captures `document.activeElement` at the time of the call. Returns `{ restore() }`.

### `focus.onChange(fn)`

Subscribes `fn(newEl, oldEl)` to global `focusin` events. Returns `unsubscribe()`.

## Examples

### Modal with focus trap

```js
const focus = runtime.resolve('focus');

const modal = document.getElementById('my-modal');
const openBtn = document.getElementById('open-modal');

openBtn.addEventListener('click', () => {
    modal.removeAttribute('hidden');
    const trapCtrl = focus.trap(modal, {
        returnFocus: true,
        escapeDeactivates: true
    });
    trapCtrl.activate();
});
```

### Toolbar navigation (prev / next)

```js
const focus = runtime.resolve('focus');
const toolbar = document.querySelector('[role="toolbar"]');

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') focus.next(toolbar);
    if (e.key === 'ArrowLeft')  focus.previous(toolbar);
});
```

### Stash/restore around a temporary action

```js
const focus = runtime.resolve('focus');

const saved = focus.stash();
// … opens a temporary picker, focus changed …
saved.restore();
```

### Focus-change notification

```js
const focus = runtime.resolve('focus');

const unsub = focus.onChange((newEl, oldEl) => {
    console.log('focus:', oldEl, '→', newEl);
});

// Later:
unsub();
```

## Notes

- The trap listens for `keydown` on the container, not the global `focusin` — does not interfere with other apps.
- If a programmatic external focus leaves the trap, `focusin` automatically brings focus back to the first element in the container.
- `tabOrder` recalculates on every call — no cache. Use sparingly in tight loops.
- `worker-safe: false` — uses `document.activeElement`, `addEventListener`, `focus()`.

## See also

- [events](../query/events.md) — named event management
- [dom](../query/dom.md) — consistent DOM API
- [keybindings](./keybindings.md) — global keyboard shortcuts
