---
module: component
category: dom/rendering
dependencies: [reactiveBind]
returns: object
worker-safe: false
status: complete
---

# component

> Reusable component primitive on top of `uiSession`. Encapsulates template + state + lifecycle + automatic cleanup.

**Module** `component` | **Source** `packages/front/fw/src/dom/rendering/component.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const component = runtime.resolve('component');
// → { define }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `define` | `(spec) => (opts: { ui, parent?, slot?, id?, props }) => Instance` | Component factory |
| `instance.update` | `(newProps) => void` | Re-validates, re-applies `propsFn`, triggers `update` |
| `instance.destroy` | `() => void` | Explicitly unmounts (idempotent) |
| `instance.get` / `.text` / `.attr` / `.on` | proxies | See `self` |
| `instance.props` | getter | Current transformed props |
| `instance.blockId` | getter | Internal BlockId |
| `instance.state` | getter | Free state object populated by hooks |
| `instance.scopeClass` | getter | Scope CSS class or `null` |

### `component.define(spec)` → factory

Defines a component **blueprint**. Returns a function `create({ui, parent?, slot?, id?, props}) → instance`.

| `spec` field | Type | Description |
|---|---|---|
| `template` | `ParseResult` | **Required.** HTML template parsed by `parser.fromHTML` or `ui.parse`. |
| `name` | `string` | Optional. Human name used in error messages (`component[name]: …`). |
| `props` | `Object<string, PropSpec>` | Optional. Props validation schema (see below). |
| `css` | `string` | Optional. Scoped CSS — `&` is rewritten to `.fw-comp-N`. Injected once per blueprint into `<head>`. |
| `propsFn(props)` | `Function` | Optional. Transforms validated props into DOM bindings before render. Re-evaluated on every `update()`. |
| `mount(self)` | `Function` | Optional. Called once after DOM mount. Ideal for `self.on(...)`. |
| `update(self, prevProps)` | `Function` | Optional. Called on `instance.update(newProps)`, after re-applying bindings. |
| `unmount(self)` | `Function` | Optional. Called **before** the DOM disappears. App cleanup (fetches, observers, intervals). |

#### `PropSpec`

| Field | Type | Description |
|---|---|---|
| `type` | `'string'\|'number'\|'boolean'\|'function'\|'object'\|'array'` | Type check; `'array'` uses `Array.isArray`. |
| `required` | `boolean` | Throws if the prop is absent at creation or update. |
| `default` | `any \| () => any` | Default value when the prop is `undefined`. Function form = re-evaluated per instance (useful for `[]`/`{}`). |
| `validator` | `(value) => boolean` | Throws if returns `false`. |

The **`self`** passed to hooks exposes:

| Member | Description |
|---|---|
| `self.props` | **Transformed** props (after optional `propsFn`) — the exact shape bound to the DOM. |
| `self.rawProps` | **Validated** props before `propsFn` — raw user input after defaults are applied. |
| `self.prevProps` | Previous transformed props (populated during `update`). |
| `self.ui` | The parent `UISession`. |
| `self.blockId` | Internal component BlockId. |
| `self.scopeClass` | Scope CSS class (`'fw-comp-N'`) or `null` if no `css`. |
| `self.state` | Free object persisted between hooks (timers, refs, abort controllers). |
| `self.bind` | Lazy `reactiveBind` controller (see [Reactive bindings](#reactive-bindings-selfbind)). `undefined` after unmount. |
| `self.get(lid?)` | `ui.get(blockId, lid)`; without argument → block root. |
| `self.text(lid?, value)` | Proxy of `ui.text(blockId, ...)`. |
| `self.attr(lid?, name, value)` | Proxy of `ui.attr(blockId, ...)`. |
| `self.on(lid?, type, fn, …)` | Proxy of `ui.on(blockId, ...)`. Listener auto-removed on destroy. |
| `self.query(lid, sel)` / `self.queryAll(lid, sel)` | CSS selector within a subtree. |
| `self.off(name)` | Removes a managed listener. |

### Instance

```js
const instance = ComponentFactory({ ui, parent, slot, id, props });
```

| Method / Property | Description |
|---|---|
| `instance.update(newProps)` | Re-validates, re-applies `propsFn`, triggers the `update` hook. |
| `instance.destroy()` | Explicitly unmounts (DOM, listeners, hooks). Idempotent. |
| `instance.get(lid?)` / `.text/.attr/.on` | Same proxies as on `self`. |
| `instance.props` | Getter — current **transformed** props. |
| `instance.blockId` | Internal BlockId. |
| `instance.state` | Free state object populated by hooks. |
| `instance.scopeClass` | Scope CSS class or `null`. |

### Lifecycle

```
create(opts)
  ├─ ui.add(...)              ← DOM mounted
  ├─ ui.onUnmount(blockId, …)  ← hook attached
  └─ spec.mount(self)          ← called once

instance.update(newProps)
  └─ spec.update(self, prev)

instance.destroy()
  └─ ui.clear(blockId)
      └─ ui.onUnmount fire     ← once only
          └─ spec.unmount(self)

// Indirect unmount (parent cleared externally):
ui.clear(parentBlockId)
  └─ cascade → ui.clear(childBlockId)
      └─ ui.onUnmount fire → spec.unmount(self)
```

The component **survives external clears**: if the parent block is `ui.clear`-ed, the cascade descends via `_children` tracking and fires the component's `unmount` hook.

## Examples

### Card with fetch and cleanup

```js
const cardTpl = ui.parse(`
    <article id="root" class="card">
        <h3 id="title">#{title}</h3>
        <p id="body">#{body}</p>
        <button id="closeBtn">×</button>
    </article>
`);

const Card = component.define({
    template: cardTpl,
    mount(self) {
        self.on('closeBtn', 'click', () => self.props.onClose?.());

        // Resource lifecycle : abort controller in self.state
        self.state.controller = new AbortController();
        fetch(self.props.url, { signal: self.state.controller.signal })
            .then(r => r.text())
            .then(text => self.text('body', text));
    },
    update(self, prev) {
        // Re-fetch only if the URL changed
        if (self.props.url !== prev.url) {
            self.state.controller.abort();
            self.state.controller = new AbortController();
            fetch(self.props.url, { signal: self.state.controller.signal })
                .then(r => r.text())
                .then(text => self.text('body', text));
        }
    },
    unmount(self) {
        self.state.controller.abort();   // cancel in-flight fetch
    },
});

// Instantiate
const c = Card({
    ui,
    parent: 'main',
    slot:   'content',
    id:     'card-42',
    props:  { title: 'Hi', body: '…', url: '/data/42', onClose: () => c.destroy() },
});

// Update props later
c.update({ title: 'Hi v2', body: '…', url: '/data/42', onClose: …});

// Or destroy explicitly
c.destroy();
```

## Scoped CSS

`spec.css` supports three authoring patterns beyond the basic `& { }` root selector:

### Nesting (`&` chains)

Nested `&` chains are flattened to plain CSS selectors at injection time — no
browser nesting support is required:

```css
/* authored */
& { padding: 1rem; }
& .title { font-weight: bold; }
& .title .sub { color: gray; }

/* injected (all & resolved to .fw-comp-N) */
.fw-comp-7 { padding: 1rem; }
.fw-comp-7 .title { font-weight: bold; }
.fw-comp-7 .title .sub { color: gray; }
```

### `:global(sel)` — escape hatch

Wrap a selector in `:global(...)` to emit it without the scope prefix:

```css
/* authored */
:global(body) { margin: 0; box-sizing: border-box; }
& { color: var(--fw-color-text); }

/* injected */
body { margin: 0; box-sizing: border-box; }
.fw-comp-7 { color: var(--fw-color-text); }
```

### `@keyframes` — unique per-blueprint names

Keyframe identifiers are renamed to `<scopeClass>-<name>` so two components
that both define `@keyframes spin` never collide. Every `animation` /
`animation-name` reference in the same blueprint is rewritten to the new name
automatically:

```css
/* authored */
@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
& .icon { animation: spin 1s linear infinite; }

/* injected (blueprint gets scope class fw-comp-7) */
@keyframes fw-comp-7-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
.fw-comp-7 .icon { animation: fw-comp-7-spin 1s linear infinite; }
```

Injection remains **once per blueprint** — multiple instances of the same
component share the single `<style data-fw-component="fw-comp-N">` tag in
`<head>`.

## Reactive bindings (`self.bind`)

`self.bind` is a [`reactiveBind`](./reactiveBind.md) controller scoped to the
component's `uiSession`. It is created **lazily on first access** and
**disposed automatically** when the component unmounts — no manual cleanup
needed:

```js
const Ticker = component.define({
    template: ui.parse('<div id="root"><span id="count">0</span></div>'),
    mount(self) {
        const count = sig.create(0);
        // Bind the signal to the <span id="count"> node.
        self.bind.text(self.blockId, 'count', count);

        // Increment every second (stored in self.state for cleanup reference).
        self.state.timer = setInterval(() => count.set(count.peek() + 1), 1000);
    },
    unmount(self) {
        clearInterval(self.state.timer);
        // self.bind.dispose() is called automatically — no explicit call needed.
    },
});
```

**Auto-disposal contract:**

- `self.bind` is `undefined` after the component unmounts (whether destroyed
  explicitly via `c.destroy()` or removed via a parent `ui.clear()`).
- Accessing `self.bind` after unmount returns `undefined` and does **not**
  create a new controller — a disposed component stays disposed.
- If `self.bind` was never accessed, no controller is created and unmount is
  a no-op from `reactiveBind`'s perspective.

See [reactiveBind](./reactiveBind.md) for the full controller API
(`text`, `attr`, `class`, `style`, `show`, `model`, `list`, `dispose`).

## Notes

- **`self.props` vs `self.rawProps`**: `self.props` holds the shape after `propsFn` — the exact data bound to the DOM. `self.rawProps` holds validated props before transformation. Both are updated symmetrically on every `update()`.
- **No automatic reactivity**: `update(newProps)` must be called explicitly. For fine-grained DOM patching without a full re-render, use `self.bind` (signals) or `self.attr`/`self.text` directly in the `update` hook.
- **Scoped CSS**: `spec.css` is injected once per blueprint (`define()`) — no duplication even on hot-reload. The `.fw-comp-N` class is added automatically to every instance's root element.
- **Props validation**: throws on missing required prop or wrong type, **at construction and on every `update()`**. The function form of `default` is re-evaluated per instance at creation.
- **State isolation**: each instance has its own `self.state`. No implicit sharing between components.
- **Hook errors**: `unmount` is internally try-caught (never blocking). `mount`/`update` propagate errors to the caller — intentional for easier debugging.

## See also

- [uiSession](./uiSession.md) — underlying session layer.
- [reactiveBind](./reactiveBind.md) — signal-to-DOM binding controller used by `self.bind`.
- [parser](./parser.md) — produces `ParseResult` templates.
- [Guide rendering-pipeline](../../../guide/rendering-pipeline.md).
