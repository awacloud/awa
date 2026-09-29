# Rendering pipeline

Declarative templating system: HTML → elm-arrays → DOM. Four modules cooperate, encapsulated by `uiSession`.

## Overview

```
HTML string
      ↓  parser.fromHTML()
ParseResult { template: ElmNode[], iterates?: {name: ElmNode[]} }
      ↓  render.elms() / render.parts() / render.loop() / render.full()
ElmNode[] (variables bound + IDs rewritten, without touching the DOM)
      ↓  template cmd.insert()  (via tpl.elms / tpl.elm)
Live DOM nodes in the context
```

`uiSession` encapsulates **all** these stages behind a simple API.

## Template notation

Three types of markers in HTML:

### `#{varName}` — Variable

Replaced by a value at render time. Usable in a node's text or in an attribute value.

```html
<h1>#{title}</h1>
<div class="#{cssClass}" style="color:#{color}">#{text}</div>
```

### `${slotName}` — Content slot

Reserved space where other blocks can be **attached**.

```html
<div class="page">
    <h1>#{title}</h1>
    ${page_content}
    ${page_footer}
</div>
```

### `<!-- $name --> ... <!-- name$ -->` — Iterable block

Delimits a sub-template for repeated rendering (loop).

```html
<ul>
    <!-- $item -->
        <li class="#{class}">#{text}</li>
    <!-- item$ -->
</ul>
```

## Stage 1: `parser`

```js
const parser = runtime.resolve('parser');
const result = parser.fromHTML('<div><h1>#{title}</h1>${content}</div>');
// → {
//     template: [ ElmNode{id:"p0",tag:"div",...}, ElmNode{id:"p1",tag:"h1",...} ],
//     iterates: undefined
// }

// With iterable block
const result2 = parser.fromHTML('<ul><!-- $item --><li>#{text}</li><!-- item$ --></ul>');
// → { template: [...], iterates: { item: [ElmNode{...}] } }
```

See [parser API](../api/dom/rendering/parser.md) for options and the ElmNode structure.

## Stage 2: `render`

The render does **not** touch the DOM — it transforms data.

```js
const render = runtime.resolve('render');

// Apply variables to a template
const bound = render.elms(result.template, { title: 'Hello', text: 'World' });

// Rewrite IDs (anti-collision)
const rewritten = render.rewrite(bound.arr);
// → { arr, map, content }

// In one pass (bind + rewrite)
const parts = render.parts(result.template, { title: 'Hello' });

// Iterative rendering (loop)
const looped = render.loop(result2.iterates.item, [
    { text: 'Item 1' },
    { text: 'Item 2' },
    { text: 'Item 3' }
]);
```

## Stage 3: `template`

Materialisation of elm-arrays into DOM.

```js
const tpl = runtime.resolve('template');

// Create a render context
tpl.init('main', { to: '#app', main: true, tpl: '#tpl' });

// Insert a simple element
tpl.elm('main', {
    id: 'title',
    tag: 'h1',
    text: 'Hello World'
});

// Insert from an elm-array
tpl.elms('main', elmArray);
```

## Stage 4: `uiSession` (recommended)

Encapsulates all 4 stages. The simplest API to use.

```js
const uiSession = runtime.resolve('uiSession');

// Initialise on an existing template context
const ui = uiSession('contenu'); // template context name

// Parse HTML
const b1 = ui.parse('<div><h1>#{title}</h1>${content}</div>');
const b2 = ui.parse('<p>#{text}</p>');

// Add blocks
ui.add([
    { id: 'main', block: b1, data: { title: 'Hello' } }
]);

// Attach into a slot
ui.add([
    { id: 'para', attach: { elm: 'main', name: 'content' }, block: b2, data: { text: 'World' } }
]);

// Iteration into a slot
const bList = ui.parse('<ul><!-- $item --><li>#{text}</li><!-- item$ --></ul>');
ui.add([
    { id: 'list', block: bList, data: {} },
    {
        attach: { elm: 'list', name: 'item' },
        block: bList,
        data: [{ text: 'A' }, { text: 'B' }, { text: 'C' }]  // array → loop
    }
]);
```

## Incremental keyed lists (`ui.list`)

For dynamic lists (logs, live filters, paginated datasets), `uiSession.list` adds **key-based reconciliation** on top of the pipeline. Instead of rebuilding everything on each update, only additions, removals and value changes produce DOM work — unchanged nodes keep their identity (focus, selection, CSS transitions preserved).

### Setup

```js
const ui = uiSession('panel');

// 1. The parent block must declare a ${name} slot that will serve as the anchor point.
const layout = ui.parse('<div class="list-wrap">${rows}</div>');
ui.add([{ id: 'panel', block: layout, data: {} }]);

// 2. The item template — simple, no iterate.
const rowTpl = ui.parse('<div class="row" id="root"><span id="lbl">#{label}</span></div>');

// 3. Create the list, attached to the `rows` slot.
const list = ui.list('panel', 'rows', {
    keyFn:    item => item.id,
    block:    rowTpl,
    dataFn:   item => ({ label: item.label }),  // DOM bindings (optional)
    metaFn:   item => item.raw,                  // non-DOM meta (optional)
    onUpdate: 'patch',                           // re-bind without destroying DOM
});
```

### Mutations

```js
// Imperative ops
list.push({ id: 'a', label: 'Alpha' });
list.prepend({ id: 'first', label: 'First' });
list.insert({ id: 'b', label: 'Beta' }, /*beforeKey*/ 'a');
list.upsert({ id: 'a', label: 'Alpha v2' });          // add or update
list.update('a', { id: 'a', label: 'Alpha v3' });     // strict; throws if absent
list.remove('first');
list.move('b', 'a');                                   // move without recreating DOM
list.clear();

// Declarative reconciliation — provide the full dataset, ui.list computes the delta.
const delta = list.sync([
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
]);
// delta = { added: Set, kept: Set, updated: Set, removed: Set, reordered: bool }
```

### Update modes

| Mode | DOM effect |
|---|---|
| `'replace'` (default) | `clear+add` of the item block — fresh DOM, listeners recreated |
| `'patch'` | Re-binds `#{var}` and attrs on existing nodes via `render.applyParsedElm`. Stable DOM |
| `'none'` | Updates bookkeeping, does not touch the DOM (caller applies its own `list.attr/text`) |
| Custom function | `(key, oldItem, newItem, controller) → 'patched' \| 'replaced' \| 'unchanged'` |

### Key-based addressing

```js
list.element('a');                     // → root DOM element of item 'a'
list.get('a');                         // → the original item passed
list.meta('a');                        // → what metaFn returned
list.itemId('a');                      // → internal blockId (for direct ui.text/ui.attr)

// Idiomatic proxies (follow UISession overloads):
list.text('a', 'lbl', 'New');         // textContent
list.attr('a', 'data-flag', 'on');    // attribute, null/false removes
list.on('a', 'lbl', 'click', fn);     // managed listener, auto-removed on remove(key)
```

### Idempotence & lifecycle

`ui.list(parent, slot, …)` is **idempotent** per `(parent, slot)`: a second call returns the same instance. When the parent block is removed via `clear`/`remove`, the list is **auto-disposed** (any subsequent op throws).

### Hooks

```js
ui.list(parent, slot, {
    keyFn, block,
    onMount:  (key, item) => { /* after DOM mount */ },
    onRemove: (key, item) => { /* before DOM removal — app cleanup */ },
});
```

---

## Server-side rendering (SSR)

The framework supports HTML pre-rendering on Node/Bun **without external dependencies**: neither DOMParser nor jsdom/happy-dom required. An internal HTML tokenizer is embedded in `parser.js`; it automatically takes over when `DOMParser` is absent.

### `render.toHTML(parseResult, data, opts?)` → string

```js
import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';
runtime.registerAll(modules);

const parser = runtime.resolve('parser');
const render = runtime.resolve('render');

const tpl = parser.fromHTML(`
    <article>
        <h1>#{title}</h1>
        <p>#{body}</p>
    </article>
`);

const html = render.toHTML(tpl, {
    title: 'Hello SSR',
    body:  'Pre-rendered on the server.',
});

response.send(html);
```

**Secure by default**, identical to the client pipeline:
- Text escaped (`<`, `>`, `&`, `"`, `'`).
- URLs filtered (`href`, `src`, etc.) — `javascript:`, `vbscript:`, `data:text/...` rejected.
- DOM clobbering blocked (`<input name="cookie">` removed).
- Event handlers (`on*`) never emitted.

### Hydration markers

By default, each element receives a `data-fw-id="<id>"` allowing a future `uiSession.hydrate(rootElement)` to find and adopt the server DOM without rebuilding it.

```js
render.toHTML(tpl, data);                        // markers ON
render.toHTML(tpl, data, { hydrate: false });    // markers OFF (clean output)
render.toHTML(tpl, data, { idPrefix: 'app' });   // → data-fw-id="app:title"
```

### Slots and iterations

```js
const tpl = parser.fromHTML(`
    <html>
        <head><title>#{title}</title></head>
        <body>
            <header>${'${header}'}</header>
            <main>
                <ul>
                    <!-- $row -->
                        <li><a href="#{href}">#{label}</a></li>
                    <!-- row$ -->
                </ul>
            </main>
        </body>
    </html>
`);

const html = render.toHTML(tpl,
    { title: 'Catalogue' },
    {
        slots: {
            header: '<h1>Welcome</h1>',                  // static string
            // or function: header: () => buildHeader(),
        },
        iterates: {
            row: [
                { href: '/a', label: 'Item A' },
                { href: '/b', label: 'Item B' },
                { href: '/c', label: 'Item C' },
            ],
        },
    },
);
```

### Client-side hydration

After receiving the SSR HTML, the client creates a `uiSession` on the container and adopts the existing DOM via `ui.hydrate(items, opts)`. **No DOM reconstruction**: the `data-fw-id` attributes match parsed elements, and the same `ui.text/attr/on/list/...` calls as after a `ui.add` become available.

```js
// 1. The SSR HTML is in the document (server-delivered or fetch'd).
//    Container: <div id="app">…</div>

// 2. Client: create the session on the SSR container.
tpl.init('app', { to: '#app' });
const ui = uiSession('app');

// 3. Hydrate with the SAME items (template + data + opts) as SSR.
const layoutTpl = ui.parse(
    '<div id="layout"><h1 id="title">#{title}</h1>${body}</div>'
);
const bodyTpl = ui.parse('<p id="body">#{txt}</p>');

ui.hydrate(
    [
        { id: 'layout', block: layoutTpl, data: { title: 'Page' } },
        { id: 'body',   attach: { elm: 'layout', name: 'body' },
          block: bodyTpl, data: { txt: 'inside' } },
    ],
    { idPrefix: 'app' },     // same prefix as render.toHTML
);

// 4. All uiSession APIs operate on the EXISTING nodes.
ui.text('layout', 'title', 'Updated');     // mutates the server-rendered <h1>
ui.on('layout', 'title', 'click', fn);     // listener on the existing element
ui.attr('body',  'body',  'hidden', '');   // direct attribute mutation
```

**Semantics**:
- DOM nodes are **reused** (same references as before hydrate).
- `ui.clear('layout')` removes the block from the DOM normally (cascade included toward attached blocks).
- `ui.list(parent, slot, …)` after hydrate: SSR items are preserved visually, but the UIList instance starts empty. To resume from a known dataset, call `list.sync(initialItems)` after hydrate (the SSR DOM is replaced). Finer integration (adoption of SSR items by the list) is deferred to a later iteration.

### Known limitations v1

- `parser.fromHTML` on the server supports **well-formed HTML5** (balanced tags, basic entities, attributes with/without quotes). For raw/broken input (CMS Markdown, user content), run through `sanitize` first or add a DOMParser polyfill (happy-dom, linkedom).
- Iterate blocks (`<!-- $name -->`) on the hydrate side: the wrapper is adopted but rows are not reconnected to a `ui.list`. Workaround: `ui.list(parent, slot, …).sync(items)` after hydrate (clears SSR + re-renders).
- The `dnd`, `gesture`, `media`, `chart`, `virtualScroll` modules are client-side only.

## Complete example: page with layout

```js
import { runtime, domReady } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';

// After the refactor: no module is pre-registered.
runtime.registerAll(modules);

domReady.loaded(() => {
    const tpl = runtime.resolve('template');
    const dom = runtime.resolve('dom');
    const uiSession = runtime.resolve('uiSession');

    // Main context
    tpl.init('page', { main: true, to: document, page: true });
    tpl.elm('page', { id: 'app', tag: 'div', attrs: ['style'],
        data: { style: 'padding:20px' } });

    tpl.init('contenu', { to: '#app' });
    const ui = uiSession('contenu');

    // Main layout
    const layout = ui.parse(`
        <div class="page">
            <h1>#{title}</h1>
            \${body}
            <footer>\${footer}</footer>
        </div>
    `);

    // Content
    const content = ui.parse('<article>#{text}</article>');

    // Render
    ui.add([{ id: 'layout', block: layout, data: { title: 'My App' } }]);
    ui.add([
        { id: 'body', attach: { elm: 'layout', name: 'body' }, block: content, data: { text: 'Welcome' } },
        { id: 'footer', attach: { elm: 'layout', name: 'footer' }, block: content, data: { text: '© 2024' } }
    ]);

    // Access a DOM element by logical ID
    dom.style(ui.get('body'), 'color', 'blue');

    // Access an internal element by its HTML id
    dom.query(ui.get('layout'), 'h1'); // → h1 DOM element
});
```

## See also

- [parser API](../api/dom/rendering/parser.md)
- [render API](../api/dom/rendering/render.md)
- [template API](../api/dom/rendering/template.md)
- [uiSession API](../api/dom/rendering/uiSession.md)
