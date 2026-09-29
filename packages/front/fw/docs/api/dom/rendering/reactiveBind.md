---
module: reactiveBind
category: dom/rendering
dependencies: [signal]
returns: object
worker-safe: false
status: complete
---

# reactiveBind

> Explicit signal-to-DOM binding controller: patch nodes, never re-render.

**Module** `reactiveBind` | **Source** `packages/front/fw/src/dom/rendering/reactiveBind.js` | **Deps** `signal` | **Worker-safe** no

## Philosophy

`reactiveBind` makes reactivity *practical*, not *automatic*. Every binding is
a method the caller invokes explicitly — there is no magic template scanning or
transparent reactive proxy. This follows the
[Lit ReactiveController](https://lit.dev/docs/composition/controllers/) pattern
and aligns with Solid's fine-grained `createEffect` idiom.

Each call registers exactly one `signal.effect` that auto-tracks its source and
calls the corresponding `uiSession` mutator when the value changes. The effect
**patches** the live node in place — it never triggers a re-render, never
reconstructs a vdom, and never replaces the element. Node identity is always
preserved.

## Resolve

```js
const reactiveBind = runtime.resolve('reactiveBind');
// → { create }
```

## API

### `reactiveBind.create(ui)` → `ReactiveBindController`

Creates a new binding controller scoped to the `uiSession` instance `ui`.

```js
const bind = reactiveBind.create(ui);
```

All methods on the controller accept a `sigOrFn` argument which is either:
- a **signal** (object with `.get()`) — reads are auto-tracked, or
- a **thunk** `() => value` — also auto-tracked inside the effect.

Every method **throws** a descriptive error if the addressed `(blockId,
localId)` pair is not found in the session. This is intentional: silent no-ops
would make missing-element bugs invisible.

### One-way bindings

| Method | Signature | Patches |
|--------|-----------|---------|
| `text` | `(blockId, localId, sigOrFn) => disposer` | `textContent` |
| `attr` | `(blockId, localId, name, sigOrFn) => disposer` | Attribute `name` (`null`/`false` removes it) |
| `class` | `(blockId, localId, name, sigBool) => disposer` | CSS class toggle |
| `style` | `(blockId, localId, prop, sigOrFn) => disposer` | Inline style property (`null`/`false` removes it) |
| `show` | `(blockId, localId, sigBool) => disposer` | `hidden` attribute (truthy = visible, falsy = hidden) |

### Two-way binding

```
model(blockId, localId, sig, opts?) → disposer
```

`opts`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `event` | `string` | `'input'` | DOM event type to listen on. |
| `parse` | `(v: string) => *` | identity | Convert DOM value to signal value. |
| `format` | `(v: *) => string` | `String(v)` | Convert signal value to DOM value. |

The binding wires both directions:
- **Signal → DOM**: a `signal.effect` writes `format(sig.get())` to
  `element.value` when the signal changes. The write is skipped if the
  formatted value already matches to avoid caret-jump on fast typing.
- **DOM → Signal**: an event listener calls `sig.set(parse(element.value))`
  and skips the set when the parsed value equals the current signal value
  (feedback-loop guard via `Object.is`).

### List binding

```
list(listController, sigArray, opts) → disposer
```

`opts`:

| Field | Type | Description |
|-------|------|-------------|
| `keyFn` | `(item) => *` | **Required.** Key extractor forwarded to `UIList.sync`. |
| `block` | `ParseResult` | **Required.** Row template forwarded to `UIList.sync`. |
| `eqFn` | `function \| 'shallow' \| 'deep'` | Optional equality preset forwarded to `UIList.sync`. |

Whenever `sigArray` changes, `listController.sync(newValue, opts)` is called.
Reconciliation — reorder, add, remove — is entirely owned by `UIList`. No
diffing happens inside `reactiveBind`.

### Disposal

Every binding method returns its own **per-call disposer** `() => void` that
detaches only that one binding. The controller also accumulates all disposers
internally so a single `bind.dispose()` call cleans up everything at once.

```js
const stop = bind.text('card', 'title', nameSig);
stop();          // detach only this one binding

bind.dispose();  // detach all bindings registered on this controller
```

`dispose()` is idempotent.

## Examples

```js
const sig          = runtime.resolve('signal');
const reactiveBind = runtime.resolve('reactiveBind');

const name    = sig.create('Alice');
const visible = sig.create(true);
const color   = sig.create('royalblue');
const count   = sig.create(0);

const bind = reactiveBind.create(ui);

// One-way: patch text content
bind.text('card', 'title', name);

// One-way: set attribute from a computed thunk
bind.attr('card', 'title', 'aria-label', () => `User: ${name.get()}`);

// One-way: toggle CSS class
bind.class('card', 'root', 'highlighted', sig.computed(() => count.get() > 5));

// One-way: inline style
bind.style('card', 'root', 'border-color', color);

// One-way: show/hide
bind.show('card', 'spinner', visible);

// Two-way: input ↔ signal
const query = sig.create('');
bind.model('search', 'input', query);

// Two-way: numeric input with parse/format
bind.model('form', 'amount', count, {
    parse:  (v) => parseFloat(v) || 0,
    format: (v) => v.toFixed(2),
});

// List
const items    = sig.create([{ id: '1', name: 'Alice' }]);
const listCtrl = ui.list('app', 'rows', { keyFn: (x) => x.id, block: rowBlock });
bind.list(listCtrl, items, { keyFn: (x) => x.id, block: rowBlock });

// Signal changes drive patches immediately:
name.set('Bob');    // card#title.textContent = 'Bob'
visible.set(false); // card#spinner[hidden] = ''

// Bulk teardown:
bind.dispose();
```

## Non-goals

### Transparent reactivity (`ref` / Solid-style)

`reactiveBind` does **not** auto-instrument templates or scan variable
accesses at parse time. Explicit bindings are preferred because they make the
reactive surface visible in code, simplify debugging (one effect = one binding),
and avoid the overhead of proxy-based tracking across the whole DOM tree.

### Virtual DOM / structural diffing

`reactiveBind` does not implement its own differ. Structural changes (adding,
removing, reordering rows) are delegated to `UIList.sync` via the `list`
binding. For everything else — text, attributes, classes, styles — a single
targeted `uiSession` mutator call is sufficient and avoids unnecessary tree
comparisons.

## Notes

- Each one-way binding is backed by exactly one `signal.effect`; the effect
  re-runs and re-collects its dependencies each time, so conditional reads
  inside thunks work correctly (e.g. `() => flag.get() ? a.get() : b.get()`
  tracks only the branch that was taken).
- `model` uses `sig.peek()` (non-tracking read) inside the event handler to
  compare the parsed value — this avoids accidentally adding the signal as a
  dependency of a stale effect.
- **Node addressing differs per binder — and it decides what survives a view
  swap.** All six element binders validate `(blockId, localId)` eagerly at bind
  time, but they do not address the node the same way afterwards:

  | Binder | Addressing inside the effect |
  |---|---|
  | `text`, `attr`, `show` | **ID-addressed** — the effect calls the `uiSession` mutator with `(blockId, localId)`, so the node is re-resolved on every run |
  | `cls`, `style`, `model` | **Node-captured** — the element is resolved once at bind time and mutated directly (`classList`, `style`, `value`) |

  Consequences after `ui.replace(...)` on the bound block:

  - `text` / `attr` / `show` **self-heal**: the next effect run writes into the
    new node. The swap itself does not re-flush them, so the new node keeps its
    rendered value until the signal next changes.
  - `cls` / `style` / `model` keep writing into the **detached old element**.
    Nothing throws and nothing warns — the binding is simply invisible from
    then on. `model` also loses its DOM→signal direction, because its listener
    is attached to the captured node (and removed from that same node by the
    disposer).

  Over a block that is **cleared** rather than replaced the two families diverge
  the same way: the ID-addressed binders resolve nothing and are a silent
  no-op, while the node-capturing ones go on mutating a detached element.
  Neither throws — only the bind-time check reports a missing
  `(blockId, localId)`.

  The practical rule: **dispose a binder before its block is replaced or
  cleared, then re-bind against the new block.** Relying on self-healing covers
  three of the six binders only. `list` is unaffected — it addresses no element
  itself and delegates reconciliation entirely to the `UIList` controller.
- Worker-safe: **no**. `reactiveBind` holds references to `uiSession` (DOM)
  instances and manipulates `element.style`, `classList`, and `value` directly.

## See also

- [signal](../../io/utils/signal.md) — reactive primitives: `create`, `effect`, `computed`.
- [uiSession](./uiSession.md) — the session that `reactiveBind` patches.
- [component](./component.md) — higher-level component system; task 04 will add `self.bind` which wraps `reactiveBind`.
