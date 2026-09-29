---
module: events
category: dom/query
dependencies: []
returns: object
worker-safe: false
status: complete
---

# events

> Named DOM event management. Attach, fire, and clean up listeners via a logical identifier — without keeping a direct reference to the element or the function.

**Module** `events` | **Source** `packages/front/fw/src/dom/query/events.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const events = runtime.resolve('events');
// Returns: { on, off, has, clear, emit, preset, dispatch, unset }
```

## API

### `events.on(name, elm, type, fn, opts?)` — Attach a listener

Registers a listener with a logical name so it can be removed without keeping a reference.

```js
events.on('btnClick', btn, 'click', (e) => console.log('clicked', e));
events.on('inputKey',  input, 'keydown', handler, { once: true });
```

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique logical identifier |
| `elm` | `Element\|Window\|Document` | Event target |
| `type` | `string` | Event type (`'click'`, `'keydown'`, …) |
| `fn` | `Function` | Handler |
| `opts` | `object?` | Options passed to `addEventListener` (`once`, `passive`, `capture`) |

---

### `events.off(name)` — Remove a listener

```js
events.off('btnClick');
```

Removes the listener and deletes it from the registry. No effect if `name` does not exist.

---

### `events.has(name) → boolean`

```js
events.has('btnClick');  // → true/false
```

---

### `events.clear()` — Remove all

Removes all registered listeners.

```js
events.clear();
```

---

### `events.emit(elm, type, detail?, opts?)` — Emit a CustomEvent

```js
events.emit(btn, 'app:action', { id: 42 });
events.emit(document, 'app:ready', null, { bubbles: true });
```

| Param | Type | Description |
|-------|------|-------------|
| `elm` | `Element\|Window\|Document` | Target |
| `type` | `string` | Event name |
| `detail` | `any?` | Data in `event.detail` |
| `opts` | `object?` | CustomEvent options (`bubbles`, `cancelable`, `composed`) |

---

### `events.preset(name, elm, type, detail?, opts?)` — Pre-define a dispatch

Registers a named emission to trigger later via `dispatch`.

```js
events.preset('notifyReady', document, 'app:ready', { version: '1.0' }, { bubbles: true });
```

---

### `events.dispatch(name, detail?)` — Trigger a preset

```js
events.dispatch('notifyReady');
events.dispatch('notifyReady', { version: '2.0' }); // overrides the detail
```

---

### `events.unset(name)` — Remove a preset

```js
events.unset('notifyReady');
```

---

### `events.delegate(name, root, type, selector, fn, opts?)` — Event delegation

Places **a single** listener on `root` that filters events by CSS selector. Useful when a parent contains N interactive elements and attaching N listeners should be avoided.

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Unique listener identifier (cf. `events.on`). |
| `root` | `EventTarget` | Root element where the real listener is attached. |
| `type` | `string` | DOM event type (`'click'`, `'input'`, …). |
| `selector` | `string` | CSS selector — the event fires only if a target (or ancestor up to `root` excluded) matches. |
| `fn` | `(event) => void` | Handler. `this` is the matched element. `event.currentMatch` too. |

```js
const list = document.querySelector('#items');

events.delegate('item-click', list, 'click', '.item .btn-remove', function (e) {
    // `this` and `e.currentMatch` are the matched `.btn-remove` element.
    const item = this.closest('.item');
    item.remove();
});
```

Match semantics:
- Walk from `event.target` up to `root` (excluded); calls `fn` on the first ancestor that matches.
- If nothing matches, the event is silently ignored.
- `root` itself is never considered a match.

Managed like `events.on`: re-registering with the same `name` removes the old one; `events.off(name)` detaches.

## Examples

### Full lifecycle

```js
const events = runtime.resolve('events');

// Attach
events.on('formSubmit', form, 'submit', (e) => {
    e.preventDefault();
    handleSubmit(e.target);
});

// Check
if (events.has('formSubmit')) {
    console.log('listener active');
}

// Fire a custom event
events.emit(form, 'app:validated', { valid: true });

// Clean up
events.off('formSubmit');
```

### Component-to-component communication via CustomEvent

```js
// Emitter
events.preset('itemSelected', document, 'app:item-selected', {}, { bubbles: true });

// Receiver
events.on('listenSelect', document, 'app:item-selected', (e) => {
    console.log('item:', e.detail.id);
});

// Dispatch with data
events.dispatch('itemSelected', { id: 42, label: 'Product A' });
```

### Cleanup on view exit

```js
function mountView(container) {
    events.on('view:click',   container, 'click',   onClick);
    events.on('view:keydown', document,  'keydown',  onKey);

    return function unmount() {
        events.off('view:click');
        events.off('view:keydown');
    };
}

const unmount = mountView(el);
// Later:
unmount();
```

## Notes

- The `name` must be unique in the registry — a second `on` with the same name **replaces** the previous one (old listener automatically removed).
- `clear()` is useful for tests or full page changes.
- `emit` uses `CustomEvent` — check compatibility if `composed: true` is required to traverse Shadow DOM.

## See also

- [dom](./dom.md) — selection of target elements
- [uiSession](../rendering/uiSession.md) — obtain DOM nodes for attaching events
