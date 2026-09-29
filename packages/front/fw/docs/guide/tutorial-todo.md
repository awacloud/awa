---
category: guide
---

# Tutorial: a todo app in under 100 lines

> Goal: show how to combine `parser`, `template`, `uiSession`, `ui.list`,
> `signal` and `form` to build a functional app without a third-party framework,
> without JSX, without a virtual DOM. Full code at the end, < 100 lines excluding HTML.
>
> Prerequisites: having read [getting-started](./getting-started.md) (runtime init,
> resolving a module). Basic DOM knowledge.

## What we are building

A todo app with:
- input + item add (form binding)
- live list filterable by status (signal + derived)
- toggle done per item
- item deletion
- live counter "N remaining"
- persistence via the `storage` module (backend `localStorage`, JSON managed)

Runtime demo: the HTML input fits in 25 lines, the JS in fewer than 60.

## Step 1 — The HTML shell

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Todo</title>
    <script src="./fw/dist/build/sanity-base-classic.min.js"></script>  <!-- fw security lock, must be first -->
    <!-- default tier is lockdown(); no classic artifact is built for it today
         (prebuild:sanity emits base + community only), so call lockdown() from a
         module script — see docs/guide/security.md § Recommended default -->
    <script type="module" src="./app.js"></script>
</head>
<body>
    <main id="app"></main>
</body>
</html>
```

Sanity is loaded first — it neutralises `eval`, `Function`, `innerHTML`,
`history.pushState`, `Math.random`, `crypto.randomUUID`, etc. The rest of
the app works with fw's secure APIs only (hence the `uuid` module
below, instead of `crypto.randomUUID`).

## Step 2 — The templates

```js
// Inline for the demo; in practice load them from an HTML file.
const SHELL = `
    <section id="root" class="todo">
        <h1>Todos</h1>
        <form id="add">
            <input id="newText" placeholder="Add..." autocomplete="off">
            <button id="submit">+</button>
        </form>
        <nav id="filter">
            <button id="all">All</button>
            <button id="active">Active</button>
            <button id="done">Done</button>
        </nav>
        <ul id="items">\${rows}</ul>
        <footer id="count">#{remaining} remaining</footer>
    </section>
`;

const ROW = `
    <li id="row" data-fw-row-id="#{id}">
        <input id="check" type="checkbox" checked="#{done}">
        <span id="text">#{text}</span>
        <button id="del" data-act="del">×</button>
    </li>
`;
```

Notation reminder:
- `#{var}`: substituted value (text or attribute).
- `${slot}`: placeholder for items.
- `id="..."`: logical identifier referenced from JS (`sess.get`/`sess.on(blockId, id, …)`).

> **Logical `id` ≠ DOM `id`**: at render time, the engine replaces each logical
> `id="..."` with a **unique generated** identifier (rows of a keyed list cannot
> share the same `id`). A **delegated** handler therefore cannot filter on
> `[id$="del"]` — the rendered `id` no longer equals "del". Mark the button
> with a stable **`data-*`** attribute (`data-act="del"`), which is preserved
> as-is (like `data-fw-row-id`). To target an element *by its logical id*, use
> the session instead (`sess.on('app', 'del', …)`), but that is not applicable
> to dynamic rows — hence the delegation.

> **Conditional attribute**: `checked="#{done}"` behaves as a boolean — the attribute
> is **set** when `done` is true, **omitted** when it is `false`/`null`/`undefined`
> (cf. `applyAttributes`). This is what makes the checkbox reflect the `done`
> state on each (re)render of the row — including after a `list.sync` that
> recreates the row.

## Step 3 — Runtime bootstrap

```js
import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';

// After the refactor: no module is pre-registered by main.js.
// The user must register the full set (or a subset) before the
// first `runtime.resolve(...)`. `registerAll` accepts the default export
// of `core/modules.js` (an array of descriptors `{ name, deps, factory }`).
runtime.registerAll(modules);

const tpl    = runtime.resolve('template');
const ui     = runtime.resolve('uiSession');
const signal = runtime.resolve('signal');
const form   = runtime.resolve('form');
const dom    = runtime.resolve('dom');
const uuid   = runtime.resolve('uuid');             // v4 ids (crypto.randomUUID is neutralised by sanity)
const store  = runtime.resolve('storage').local;    // localStorage + JSON; null if unavailable

const ctx = 'todo';
tpl.init(ctx, { to: document.getElementById('app'), main: true });
const sess = ui(ctx);
```

`tpl.init` registers the render context on the `<main>`; `ui(ctx)` creates
a session, a high-level facade manipulated for the rest.

## Step 4 — Reactive state

```js
const items     = signal.create(store?.get('todos') || []);
const filter    = signal.create('all');                              // 'all' | 'active' | 'done'
const visible   = signal.derived([items, filter], (xs, f) =>
    f === 'all' ? xs : xs.filter(x => f === 'done' ? x.done : !x.done)
);
const remaining = signal.derived([items], xs => xs.filter(x => !x.done).length);

// Automatic persistence (JSON serialisation managed by the storage module).
signal.effect(() => store?.set('todos', items.get()));
```

Four signals suffice:
- `items`: source of truth (array of `{id, text, done}` objects).
- `filter`: active filter.
- `visible`: derived — always synchronised with `items`+`filter`.
- `remaining`: derived counter.

The `effect` persists on every `items` change, without manual setup.

> **Why `storage` instead of raw `localStorage`?** `localStorage` is not
> blocked by sanity — using it directly would work. But the
> [`storage`](../api/dom/fs/storage.md) module (`src/dom/fs/storage.js`) is the
> idiomatic option: `storage.local.get/set` serialises/deserialises JSON for
> us, and `storage.local` returns `null` when the backend is unavailable
> (private browsing, sandboxed iframe) — hence the `?.` above.

## Step 5 — Rendering

```js
const shellTpl = sess.parse(SHELL);
const rowTpl   = sess.parse(ROW);

sess.add([{ id: 'app', block: shellTpl, data: { remaining: remaining.get() } }]);

// Keyed list — incremental diff, unchanged items keep their DOM.
const list = sess.list('app', 'rows', {
    keyFn: x => x.id,
    block: rowTpl,
    eqFn: 'shallow',
});

// Bind derived → list (re-sync on every change).
signal.effect(() => list.sync(visible.get()));
signal.effect(() => sess.text('app', 'count', `${remaining.get()} remaining`));
```

`sess.list` creates a keyed controller: `keyFn` extracts the key, `eqFn: 'shallow'`
detects content changes without recreating DOM. The `effect` re-synchronises
automatically on every `visible` change.

## Step 6 — Interactions

```js
// Form: field bind + submit
const newItem = form.create({
    fields: { text: { type: 'string', required: true } },
    onSubmit: ({ text }) => {
        items.set([...items.get(), { id: uuid.v4(), text, done: false }]);
        newItem.reset();
    },
});
newItem.attach('text', sess.get('app', 'newText'));
sess.on('app', 'add', 'submit', (e) => { e.preventDefault(); newItem.submit(); });

// Filter
for (const f of ['all', 'active', 'done']) {
    sess.on('app', f, 'click', () => filter.set(f));
}

// Toggle done + delete (event delegation, a single listener for the whole list)
sess.on('app', 'items', 'change', (e) => {
    const row = e.target.closest('[data-fw-row-id]');
    if (!row) return;
    const id = row.dataset.fwRowId;
    items.set(items.get().map(x => x.id === id ? { ...x, done: e.target.checked } : x));
});

sess.on('app', 'items', 'click', (e) => {
    if (!e.target.closest('[data-act="del"]')) return;   // data-* survives render, logical id does not
    const row = e.target.closest('[data-fw-row-id]');
    if (!row) return;
    items.set(items.get().filter(x => x.id !== row.dataset.fwRowId));
});
```

Note: we could have used `list.on(key, 'click', fn)` but `events.delegate`
via `sess.on(blockId, slotName, ...)` is more economical for long lists
(a single handler).

> **Why `uuid.v4()`?** `crypto.randomUUID` is one of the APIs
> neutralised by sanity (cf. step 1) — calling it would throw an exception at
> runtime. The `uuid` module (`src/crypto/utils/uuid.js`) generates RFC 4122 v4
> UUIDs via `crypto.getRandomValues`, which is not blocked.

## Full code (54 lines)

```js
import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';

runtime.registerAll(modules);

const tpl   = runtime.resolve('template');
const ui    = runtime.resolve('uiSession');
const sig   = runtime.resolve('signal');
const frm   = runtime.resolve('form');
const uuid  = runtime.resolve('uuid');
const store = runtime.resolve('storage').local;

const SHELL = `<section id="root"><h1>Todos</h1><form id="add"><input id="newText"><button id="submit">+</button></form><nav id="filter"><button id="all">All</button><button id="active">Active</button><button id="done">Done</button></nav><ul id="items">\${rows}</ul><footer id="count">#{remaining}</footer></section>`;
const ROW   = `<li id="row" data-fw-row-id="#{id}"><input id="check" type="checkbox" checked="#{done}"><span id="text">#{text}</span><button id="del" data-act="del">×</button></li>`;

const ctx = 'todo';
tpl.init(ctx, { to: document.getElementById('app'), main: true });
const s = ui(ctx);

const items   = sig.create(store?.get('todos') || []);
const filter  = sig.create('all');
const visible = sig.derived([items, filter], (xs, f) =>
    f === 'all' ? xs : xs.filter(x => f === 'done' ? x.done : !x.done));
const rem     = sig.derived([items], xs => xs.filter(x => !x.done).length);
sig.effect(() => store?.set('todos', items.get()));

s.add([{ id: 'app', block: s.parse(SHELL), data: { remaining: 0 } }]);
const list = s.list('app', 'rows', { keyFn: x => x.id, block: s.parse(ROW), eqFn: 'shallow' });
sig.effect(() => list.sync(visible.get()));
sig.effect(() => s.text('app', 'count', rem.get() + ' remaining'));

const newItem = frm.create({
    fields: { text: { type: 'string', required: true } },
    onSubmit: ({ text }) => {
        items.set([...items.get(), { id: uuid.v4(), text, done: false }]);
        newItem.reset();
    },
});
newItem.attach('text', s.get('app', 'newText'));
s.on('app', 'add', 'submit', (e) => { e.preventDefault(); newItem.submit(); });

for (const f of ['all', 'active', 'done']) s.on('app', f, 'click', () => filter.set(f));

s.on('app', 'items', 'change', (e) => {
    const row = e.target.closest('[data-fw-row-id]');
    if (!row) return;
    items.set(items.get().map(x => x.id === row.dataset.fwRowId ? { ...x, done: e.target.checked } : x));
});
s.on('app', 'items', 'click', (e) => {
    if (!e.target.closest('[data-act="del"]')) return;
    const row = e.target.closest('[data-fw-row-id]');
    if (!row) return;
    items.set(items.get().filter(x => x.id !== row.dataset.fwRowId));
});
```

## What we did NOT write

- no class component, no hook, no virtual DOM
- no mandatory bundler (the module loads as native ESM)
- no framework directives (`v-if`, `*ngFor`, …) — the `#{var}` notation
  lives in standard HTML templates
- no unnecessary re-renders: `list.sync` with `eqFn: 'shallow'` only touches
  DOM nodes of changed items

## Going further

See [index by use case](./by-use-case.md) to navigate the docs based on
what you want to do next: SSR, modals, routes, accessibility, etc.
