---
module: uiSession
category: dom/rendering
dependencies: [uiSessionCore, uiSessionDirect, uiSessionList]
returns: function (factory)
worker-safe: false
status: complete
---

# uiSession

> High-level facade over the parser→render→template+dom pipeline. Block-oriented API.

**Module** `uiSession` | **Source** `packages/front/fw/src/dom/rendering/uiSession.js` | **Deps** `uiSessionCore`, `uiSessionDirect`, `uiSessionList` | **Worker-safe** no

> `uiSession` is a **glue facade** that composes three sibling modules: `uiSessionCore` (lifecycle, mount/portals), `uiSessionDirect` (`text`/`attr`/`on`/`bind` mutators), `uiSessionList` (`UIList` class + `list()` factory). The actual pipeline consumers (`parser`, `render`, `template`, `dom`) are dependencies of the three sub-modules, not of `uiSession` directly.

## Resolve

```js
const uiSession = runtime.resolve('uiSession');
// Returns: function(containerName) → UISession

const ui = uiSession('myContext');
// 'myContext' must already exist (created via tpl.init)
```

## Prerequisites

`template.init` must have been called **before** creating the session:

```js
const tpl = runtime.resolve('template');
tpl.init('content', { to: '#app' });

const ui = uiSession('content');
```

## API — UISession

All mutating methods return `this` (chainable).

### `ui.parse(htmlString)` → ParseResult

Shortcut for `parser.fromHTML(html)`.

```js
const block = ui.parse('<div><h1>#{title}</h1>${slot}</div>');
```

---

### `ui.add(items[])` → this

Renders and inserts blocks into the context.

```js
ui.add([{
    id: 'main',           // logical identifier of the block
    block: parsedBlock,   // ParseResult from ui.parse()
    data: { title: 'Hello' }  // variables to bind
}]);
```

#### Typedef: RenderItem

```js
{
    id?:       string,          // logical identifier (for get/remove/move)
    block?:    ParseResult,     // result of ui.parse()
    template?: ElmNode[],       // alternative: direct elm-array
    data?:     Object|Object[], // bindings; array → iterative render (loop)
    attach?:   {                // attach into a slot of another block
        elm:  string,           // blockId of the parent
        name: string            // name of the slot ${name}
    },
    prepend?:  boolean          // insert before existing children
}
```

---

### `ui.append(items[])` → this

Alias for `add` — semantically explicit for appending.

---

### `ui.prepend(items[])` → this

Inserts blocks **before** existing content.

```js
ui.prepend([{ id: 'banner', block: b, data: { msg: 'Header' } }]);
```

---

### `ui.hydrate(items[], opts?)` → this

Adopts **already-present** DOM (rendered by `render.toHTML` server-side) instead of materialising new nodes. Walks the session container subtree, finds each `[data-fw-id="<prefix>:<elm.id>"]`, and registers it in `_map` / `_attach` exactly as `ui.add` would have done.

```js
ui.hydrate(
    [
        { id: 'layout', block: layoutTpl, data: { title: 'Page' } },
        { id: 'body',   attach: { elm: 'layout', name: 'body' },
          block: bodyTpl, data: { txt: 'inside' } },
    ],
    { idPrefix: 'app' },
);
```

| Option | Description |
|---|---|
| `idPrefix` | Must match the `idPrefix` passed to `render.toHTML`. Without it, defaults to `''`. |

**Guarantees**:
- DOM elements are **reused** (same references). `ui.get(blockId, lid)` returns the server-rendered node.
- All subsequent operations (`ui.text/attr/on/list/clear/remove/...`) work normally.
- `ui.clear(blockId)` removes the block from the DOM with its usual cascade.
- Throws with an explicit message if an expected `data-fw-id` is missing (template ↔ SSR HTML mismatch).

**v1 limitations**:
- Iterate blocks (`<!-- $name -->`) are not auto-reconnected to a `ui.list`. The wrapper is adopted, but to react to the array, call `ui.list(parent, slot, …).sync(items)` after hydrate.
- No listeners are re-attached automatically — the consumer must call `ui.on(...)` after hydrate (typically in the component `mount` hook).

See also [guide rendering-pipeline](../../../guide/rendering-pipeline.md) for the SSR round-trip flow.

---

### `ui.replace(blockId, items[])` → this

Clears a block and replaces it with new items.

```js
ui.replace('main', [{ id: 'main', block: newBlock, data: newData }]);
```

---

### `ui.get(blockId, logicalId?)` → Element | null

Retrieves a DOM node by logical identifiers.

```js
const rootNode = ui.get('main');          // root node of the 'main' block
const h1Node   = ui.get('main', 'title'); // element with HTML id 'title' in the block
```

**Root resolution (1-arg)**: `ui.get(blockId)` first tries a logical id equal to the blockId (case where the template has an `id="X"` matching the caller's `add({id:'X', …})`). Otherwise it returns the **first element** of the block-map (render order: parent before children → that is the block root).

**Iterative blocks** (rendered via `add({data: <array>})`): returns `null` — there is no single root for N iterations. Use `template.get` directly to address items from a loop.

#### Slots vs attach — vocabulary

- **Slot** (`${name}` in the HTML template): declares a zone in the parent template that can receive attached content. One zone, one name.
- **Attach** (`attach: {elm, name}` in a `RenderItem`): specifies where a child block is inserted — into the slot `name` of the block `elm` in the session.

Both concepts coexist: the parent template **declares** slots, and children **attach** into them via their `attach.name`.

---

### `ui.query(blockId, logicalId, selector)` → Element | null

Searches for a CSS descendant within an element.

```js
const btn = ui.query('panel', 'form', 'button.submit');
```

---

### `ui.queryAll(blockId, logicalId, selector)` → NodeList | []

Searches for all CSS descendants.

```js
const items = ui.queryAll('list', 'ul', 'li');
```

---

### `ui.remove(blockId, logicalId)` → this

Removes an element and its children from the DOM and the session.

```js
ui.remove('main', 'subtitle');
```

---

### `ui.clear(blockId?, logicalId?)` → this

Overloads:
- `clear()` → full context reset
- `clear(blockId)` → removes all elements of the block
- `clear(blockId, logicalId)` → removes the **children** of the element (keeps the element)

```js
ui.clear();              // full reset
ui.clear('main');        // clears the entire 'main' block
ui.clear('main', 'ul');  // clears children of 'ul' (keeps 'ul')
```

---

### `ui.text(blockId, logicalId, value)` → this

Updates the `textContent` of a logical element. No-op if not found.

```js
ui.text('header', 'title', 'New title');
```

---

### `ui.attr(blockId, logicalId, name, value)` → this

Updates an attribute. If `value` is `null`, `false`, or `undefined`, the attribute is **removed** (consistent with conditional attributes in `template`).

```js
ui.attr('panel', 'btn', 'disabled', isLoading ? '' : null);
```

---

### `ui.on(blockId, logicalId, type, fn, name?, options?)` → string | null

Registers a **managed** listener bound to the logical element. The listener is tracked internally and automatically removed when the block/element is removed via `remove`, `clear`, or `replace`. Returns the listener name (auto-generated if not provided) to allow a manual `ui.off(name)`; returns `null` if the element is not found.

```js
ui.on('viewer', 'closeBtn', 'click', () => ui.remove('viewer'));
// listener automatically removed when `ui.remove('viewer')` is called
```

---

### `ui.off(name)` → this

Removes a managed listener by its name.

---

### `ui.exists(blockId, logicalId?)` → boolean

Checks whether a block (or a logical element within a block) exists in the session.

```js
if (ui.exists('modal')) ui.remove('modal');
```

---

### `ui.list(parentBlockId, slotName, options)` → UIList

Creates an **incremental keyed list** controller mounted in the `${slotName}` slot of an already-rendered block. Each item becomes its own addressable uiSession sub-block by the caller's key — so all session APIs (`text`, `attr`, `on`, `remove`, `move`) work per item.

```js
const list = ui.list('parent', 'items', {
    keyFn:    item => item.id,              // required — stable key extractor
    block:    ui.parse('<li>#{text}</li>'), // required — item ParseResult
    eqFn:     Object.is,                     // optional — skip update if true (default Object.is)
    onMount:  (key, item) => {…},            // optional — called after each mount
    onUpdate: 'replace' | 'patch' | 'none' | fn, // update mode (default 'replace')
    dataFn:   item => bindings,              // optional — DOM-bound data extraction
    metaFn:   item => meta,                  // optional — side data (not DOM)
});
```

`ui.list` is **idempotent** by `(parentBlockId, slotName)`: a second call on the same pair returns the same instance, **and the options may be omitted**:

```js
// First call: options required (at least keyFn + block)
ui.list('parent', 'items', { keyFn: x => x.id, block: TPL.item, onUpdate: 'patch' });

// Subsequent calls: options optional, the already-created instance is returned
const list = ui.list('parent', 'items');
```

Options from subsequent calls are **ignored** except `block`, which must be the same `ParseResult` reference (otherwise throws — the template structure cannot change during a list's lifetime). Callbacks (`keyFn`, `dataFn`, `metaFn`, `eqFn`, `onUpdate`, `onMount`, `onRemove`) remain those fixed at creation — they are generally inline arrows recreated on each call and must not be compared by reference. To change an option, remove the parent via `ui.clear(parent)` and rebuild.

When the parent block is removed via `ui.clear(parentBlockId)` or `ui.remove(parentBlockId, …)`, the list is **auto-disposed**: any subsequent operation throws with an explicit message.

#### Controller API

| Method | Behaviour |
|---|---|
| `list.sync(items)` | Reconciles with a complete dataset. Returns `{added, kept, updated, removed, reordered}` (Sets of keys + boolean). Unchanged items keep their DOM node. |
| `list.adopt(items, { idPrefix? })` | **SSR only**: adopts rows already rendered server-side (cf. `render.toHTML` with `iterates`) without DOM rebuild. Must be called on an empty list, right after `ui.hydrate`. See [SSR section](#ssr-adopting-server-side-rendered-rows). |
| `list.push(item)` | Appends; throws if key already present. |
| `list.prepend(item)` | Inserts at head; throws on duplicate. |
| `list.insert(item, beforeKey?)` | Inserts before `beforeKey`, or appends if `beforeKey` is absent/unknown. |
| `list.upsert(item)` | Inserts or replaces; returns `'added'` \| `'updated'` \| `'unchanged'`. |
| `list.update(key, item)` | Strict update: throws if the key is absent. Returns `'updated'` \| `'unchanged'`. |
| `list.remove(key)` | Removes the item; releases DOM + managed listeners. Returns `boolean`. |
| `list.move(key, beforeKey?)` | Moves without recreating the DOM. |
| `list.clear()` | Clears the list. |
| `list.has(key)` / `list.get(key)` | Lookup. |
| `list.meta(key)` | Lookup of meta data (if `metaFn` provided). |
| `list.keys()` / `list.entries()` | Ordered iteration. |
| `list.element(key)` | Root DOM element of the item, or `null`. |
| `list.itemId(key)` | Internal uiSession block identifier of the item. |
| `list.attr(key, name, value)` or `list.attr(key, logicalId, name, value)` | Proxy of `ui.attr` by key. |
| `list.text(key, value)` or `list.text(key, logicalId, value)` | Proxy of `ui.text` by key. |
| `list.on(key, type, fn, name?)` or `list.on(key, logicalId, type, fn, name?)` | Proxy of `ui.on` by key. |
| `list.query(key, selector)` / `list.queryAll(key, selector)` | CSS search within an item's subtree. |
| `list.size` | Getter `number`. |

#### Update modes (`onUpdate`)

| Mode | Behaviour |
|---|---|
| `'replace'` (default) | `clear+add` of the item block — fresh DOM, managed listeners recreated. |
| `'patch'` | Re-binds `#{var}` and parameterised attrs on existing nodes via `render.applyParsedElm`. Stable DOM (focus, selection, transitions, listeners preserved). **Automatic fallback to `'replace'` if the item block contains iterates** (`<!-- $name -->`) that cannot be patched. |
| `'none'` | No DOM change on update — the list updates its bookkeeping (`get`, `meta`) but the caller must apply changes via `list.attr`/`list.text` if desired. |
| Function `(key, oldItem, newItem, controller) => 'patched' \| 'replaced' \| 'unchanged'` | Custom strategy. Must return one of the three labels; used in the `sync` delta. |

#### `dataFn` / `metaFn`

```js
ui.list(parent, slot, {
    keyFn:  item => item.id,
    block:  itemBlock,
    dataFn: item => ({ label: item.label, href: '#/' + item.id }),  // DOM bindings
    metaFn: item => item.rawSource,                                   // off-DOM
});
```

- `dataFn(item)`: if provided, its result is what is passed to the parser/render pipeline (for `#{...}`). Otherwise, the item itself is used. Allows keeping `item` as raw business data without polluting the DOM with unbound fields.
- `metaFn(item)`: if provided, its result is stored separately and accessible via `list.meta(key)`. No influence on the DOM. Typical use: reference to a sub-tree for recursion after `sync`.

#### Hooks `onMount` / `onRemove`

```js
ui.list(parent, slot, {
    keyFn, block,
    onMount:  (key, item) => { /* item mounted */ },
    onRemove: (key, item) => { /* before DOM removal — app cleanup */ },
});
```

- `onMount(key, item)`: called after the DOM insertion of an item (`push`, `prepend`, `insert`, additions via `sync`/`upsert`).
- `onRemove(key, item)`: called **before** the item's DOM disappears (`remove`, removal via `sync`, `clear`). Ideal for cancelling in-flight fetches, detaching external observers, stopping animations.

#### Diff semantics (`sync`)

For each `sync(items)` call:

1. **Remove**: every key present before and absent after → `ui.clear(itemId)` (releases DOM + managed listeners).
2. **Add**: every new key → mount at the end (will be reordered in phase 3).
3. **Update**: key present and `eqFn(old, new) === false` → `clear+add` of the item block (re-render), unless `onUpdate` is `'patch'`/`'none'`/a custom function — see [Update modes](#update-modes-onupdate). Otherwise, no change.
4. **Reorder**: `dom.reorder` reorders existing nodes with minimal moves whenever the current key order differs from `newKeys`, **or** whenever phase 3 replaced at least one item (a `'replace'`d row is a fresh DOM node freshly mounted at the slot's end, regardless of its position in the key sequence — the key-sequence diff alone can't see that the row moved). `delta.reordered` reflects whichever condition fired.

`upsert(item)` and `update(key, item)` apply the same rule for a single key: a `'replaced'` outcome from `_replaceItem` restores the row's position via the same reorder pass, even though the key's index in the list didn't change. A `'patched'` or `'unchanged'` outcome never moves the node, so no reorder runs for it.

With `eqFn = Object.is` (default), passing the **same reference** in `sync` skips the replace and fully preserves the DOM (focus, selection, scroll, CSS transitions). With an immutable dataset where each render reconstructs objects, passing a custom `eqFn` (`(a,b) => a.text === b.text && a.flag === b.flag`) restores this gain.

#### Prerequisite: slot in the parent template

```js
const parent = ui.parse('<div>${items}</div>');     // slot "items"
ui.add([{ id: 'parent', block: parent, data: {} }]);
const list = ui.list('parent', 'items', { … });    // OK
```

The slot can be a text slot (`${name}`). If the parent block has no slot named `slotName`, **the first `push`/`sync` throws** with an explicit message.

#### Edge cases

| Case | Behaviour |
|---|---|
| `keyFn` returns `null`/`undefined` | throws `keyFn returned null/undefined` |
| Duplicate key in `sync(items)` or `push` | throws `duplicate key '…'` |
| `remove(key)` on absent key | returns `false` (no-op) |
| `insert(item, beforeKey)` with `beforeKey` not found | appends (fallback) |
| Non-existent parent slot | throws `slot '…' not resolved on block '…'` |

#### Example — live filter

```js
const all  = [{id:'a',text:'Alpha'}, {id:'b',text:'Beta'}, {id:'c',text:'Gamma'}];
const list = ui.list('panel', 'rows', {
    keyFn: x => x.id,
    block: ui.parse('<li id="row"><a id="lnk">#{text}</a></li>'),
});
list.sync(all);

// Filter input → re-sync the visible subset.
input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    list.sync(all.filter(x => x.text.toLowerCase().includes(q)));
});
// → only new items create DOM; those still visible keep their node
//   (stable focus on the filter input).
```

#### SSR: adopting server-side rendered rows

When the server has already rendered the list via `render.toHTML(tpl, vars, { iterates: { rows: initialRows }, idPrefix })`, the HTML received by the client already contains the final `<li>` elements. `ui.hydrate` adopts the parent block but **does not adopt** the iterate rows (their parser IDs collide between rows — this is expected). To reuse them without rebuilding:

```js
// 1. Hydrate the parent block (the <ul>, not the <li>).
ui.hydrate(
    [{ id: 'panel', block: panelTpl, data: vars }],
    { idPrefix: 'app' }
);

// 2. Create the list and pass it the initial snapshot.
const list = ui.list('panel', 'rows', {
    keyFn: r => r.id,
    block: rowTpl,
    // Important: a content-aware eqFn; otherwise Object.is rejects subsequent
    // re-fetches (new objects == "modified") and `sync` rebuilds every row.
    eqFn: (a, b) => a.id === b.id && a.text === b.text,
});
list.adopt(initialRows, { idPrefix: 'app' });
// → list.size === initialRows.length, no DOM mutation,
//   the SSR <li> elements are now under the list's control.

// 3. Later, incremental syncs reuse SSR nodes
//    for unchanged items (focus / scroll / transitions preserved).
list.sync(await fetchRows());
```

Constraints:
- The sub-template (`block`) must have **a single root** (standard case: a `<li>`, a `<tr>`). Multi-root → throws; recreate via `sync` instead.
- The slot must contain **exactly** `items.length` child elements. Any client/server mismatch → throws with a clear message.
- `list.adopt` must be called on an **empty** list (no prior `push`). Throws otherwise.
- `onMount(key, item)` hooks are fired for each row; `onEnter` is intentionally **skipped** (the DOM is already visible — replaying the enter animation would be incoherent).

---

### `ui.move(blockId, logicalId, targetBlockId, targetLogicalId)` → this

Moves an element to a new parent.

```js
ui.move('left', 'item', 'right', 'container');
```

---

### `ui.onUnmount(blockId, fn)` → this

Registers a **pre-removal** hook on a block. The hook is invoked **just before** the block's DOM disappears (via `remove`, `clear(blockId)`, `replace`, or global `clear()`). Ideal for application cleanup tied to a block's lifecycle:

```js
const controller = new AbortController();
ui.add([{ id: 'feed', block: feedTpl, data: {} }]);
fetch('/stream', { signal: controller.signal });
ui.onUnmount('feed', () => controller.abort());
```

Typical use cases:
- Cancel an in-flight `fetch`/`AbortController`
- Detach an IntersectionObserver / ResizeObserver
- Stop an active `setInterval`/`requestAnimationFrame`
- Close a WebSocket / SSE connection bound to the block

Guarantees:
- **One hook per blockId** — re-registering replaces the previous one.
- **One-shot hook** — automatically removed after invocation (no manual cleanup needed).
- **Errors swallowed** — any exception thrown in the hook is silently ignored. The unmount flow cannot be broken by a consumer bug.
- **DOM still mounted** at invocation — the hook may call `ui.get(blockId)` or inspect attributes.
- Passing `null`/`undefined` as `fn` removes the hook without triggering it.

For individual **list** items, see `ui.list(parent, slot, { onRemove })` which covers the same need per item.

## Examples

### Basic example

```js
import fw from './fw/main.js';
const { runtime, domReady } = fw;

domReady.loaded(() => {
    const tpl = runtime.resolve('template');
    const uiSession = runtime.resolve('uiSession');
    const dom = runtime.resolve('dom');

    tpl.init('app', { to: '#root' });
    const ui = uiSession('app');

    const b = ui.parse('<div><h1>#{title}</h1><p>#{body}</p></div>');

    ui.add([{ id: 'content', block: b, data: { title: 'Hello', body: 'World' } }]);

    // Access the DOM
    dom.style(ui.get('content', 'title'), 'color', 'blue');
});
```

### Slots and attachment

```js
const layout = ui.parse(`<div class="layout"><main>${'$'}main</main><aside>${'$'}sidebar</aside></div>`);
const widget  = ui.parse('<p>#{text}</p>');

ui.add([{ id: 'layout', block: layout, data: {} }]);
ui.add([
    { id: 'main',    attach: { elm: 'layout', name: 'main' },    block: widget, data: { text: 'Main content' } },
    { id: 'sidebar', attach: { elm: 'layout', name: 'sidebar' }, block: widget, data: { text: 'Sidebar' } }
]);
```

### Iterative render (array data → loop)

```js
const listBlock = ui.parse(`
    <ul>
        <!-- $item -->
            <li class="#{cls}">#{text}</li>
        <!-- item$ -->
    </ul>
`);

ui.add([
    { id: 'list', block: listBlock, data: { cls: 'wrapper' } },
    {
        attach: { elm: 'list', name: 'item' },
        block: listBlock,
        data: [
            { text: 'First', cls: 'first' },
            { text: 'Second', cls: '' },
            { text: 'Third', cls: 'last' }
        ]
    }
]);
```

## Notes

- The logical `id` in `add` is optional — without `id`, the block cannot be targeted by `get/remove/move`.
- The `logicalId → realId` translation is internal to the session — DOM IDs are not guaranteed stable between renders.
- `get(blockId)` without `logicalId` returns the root element of the block.
- `uiSession` wraps an existing `template` context — it does not create its own context.
- **Implementation**: `uiSession.js` composes three internal mixins (`uiSession-core.js` — state and base methods, `uiSession-direct.js` — `add`/`remove`/`text`/`attr`/`on`, `uiSession-list.js` — `UIList` controller). These files are implementation details not documented separately.

## See also

- [parser](./parser.md), [render](./render.md), [template](./template.md)
- [dom](../query/dom.md) — used by `query` / `queryAll`
- [Guide pipeline](../../../guide/rendering-pipeline.md)
