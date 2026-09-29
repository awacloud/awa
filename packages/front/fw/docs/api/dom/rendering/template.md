---
module: template
category: dom/rendering
dependencies: [secPolicy]
returns: object
worker-safe: false
status: complete
---

# template

> DOM engine: materialises elm-arrays into DOM nodes. Manages named contexts and a `<template>` catalogue as cloning sources.

**Module** `template` | **Source** `packages/front/fw/src/dom/rendering/template.js` | **Deps** `secPolicy` | **Worker-safe** no

> **Security**: `applyAttributes` rejects dangerous URLs on `href`/`src`/`action`/…, DOM-clobbering values on `id`/`name`, and `on*` attributes. The shared policy lives in [`secPolicy`](./secPolicy.md).

## Resolve

```js
const tpl = runtime.resolve('template');
// Returns: cmd object (init, elm, elms, get, has, move, clear*, style, script, ...)
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `init` | `(name, options) => void` | Initialises a context (throws if already exists) |
| `elm` | `(name, data) => void` | Inserts or updates a single element |
| `elms` | `(name, elmArray) => void` | Inserts an array of elm-nodes |
| `fromParseResult` | `(parseResult) => parseResult` | Validates and adopts a pre-compiled ParseResult |
| `get` | `(name, id) => Element \| null` | Retrieves a live DOM node |
| `has` | `(name, id) => boolean` | Checks whether an element exists |
| `move` | `(name, node, newParent) => void` | Moves a DOM node |
| `container` | `(name) => Element \| null` | DOM container of the context |
| `getCtx` | `(name) => Object \| null` | Internal context (debug) |
| `registerTags` | `(tags, ctxName?) => string[]` | Extends the catalogue after init |
| `clearElm` | `(name, id) => void` | Removes an element and its children |
| `clearIn` | `(name, id) => void` | Removes children (keeps the element) |
| `clearAll` | `(name) => void` | Clears the entire context |
| `clearContext` | `(name) => void` | Destroys the context (DOM + map + catalogue) |
| `style` | `(name, id, styles) => void` | Injects `<style>` into `<head>` (page contexts) |
| `script` | `(name, id, content) => void` | Injects `<script>` into `<head>` (page contexts) |

### Key concepts

- **Context** (`name`): named render container with its own live-element `map`.
- **Catalogue** (`tpl`): dictionary of `<template>` elements cloned on each insertion.
- **Render singleton**: a `main` context can be shared by other contexts.

### `tpl.init(name, options)`

Initialises a render context. **Throws** if a context with that `name` already exists — call `tpl.clearContext(name)` before re-initialising.

```js
// Full page (body + head)
tpl.init('page', { to: document, main: true, page: true });

// Sub-context in an element
tpl.init('panel', { to: '#panel-container' });

// With custom HTML templates
tpl.init('page', { to: document, main: true, tpl: '#tpl-container' });
```

| Option | Type | Description |
|--------|------|-------------|
| `to` | `string\|Element\|Document` | Container: CSS selector, Element, or `document` |
| `main` | `boolean` | Shares the catalogue under the key `'main'` |
| `page` | `boolean` | Page mode: `ctx` → `body`, `head` → `head` |
| `tpl` | `string\|NodeList\|HTMLTemplateElement[]` | Template source (selector, NodeList, or array). Default: `DEFAULT_TAGS` |

---

### `tpl.elm(name, data)`

Inserts or updates a single element.

```js
tpl.elm('page', {
    id: 'title',
    tag: 'h1',
    text: 'Hello World'
});

// With attributes
tpl.elm('panel', {
    id: 'btn',
    tag: 'button',
    attrs: ['class', 'style'],
    data: { class: 'btn-primary', style: 'color:red' },
    text: 'Click'
});

// Child of another element
tpl.elm('panel', {
    id: 'child-span',
    parent: 'btn',      // parent id
    tag: 'span',
    text: 'icon'
});

// Prepend (before existing children)
tpl.elm('panel', {
    id: 'first-child',
    parent: 'container',
    tag: 'div',
    prepend: true,
    text: 'First'
});
```

---

### `tpl.fromParseResult(parseResult)`

Adopts a pre-compiled JSON `ParseResult` (produced by the `tools/rendering/precompilation/` tool) directly, without going through `parser.fromHTML()`. The return value is the same object, validated: the caller then passes it to `tpl.elms`, `render.toHTML`, etc. Use case: eliminate parsing cost at first paint.

```js
import precompiled from './nav.html.parseresult.json' assert { type: 'json' };
// or (without import assertion):
import precompiled from './nav.html.parseresult.js';

const pr = tpl.fromParseResult(precompiled);
tpl.elms('main', pr.template);
```

| Param | Type | Description |
|-------|------|-------------|
| `parseResult` | `object` | Payload `{ template: ElmNode[], iterates?: { [name]: ElmNode[] } }` from `parser.fromHTML()` or precompilation |

**Throws:**
- `TypeError` — `parseResult` is not an object, is `null`, is an Array, or has a malformed `template`/`iterates` shape.

Returns: the identical `parseResult` (identity passthrough after validation).

See [docs/tools/precompilation.md](../../../tools/precompilation.md) for producing JSON artefacts.

---

### `tpl.elms(name, elmArray)`

Inserts an array of elm-nodes (result of `render.parts()` or `render.loop()`).

```js
tpl.elms('panel', result.arr);
```

---

### `tpl.get(name, id)`

Retrieves a live DOM node by its ID in the context.

```js
const node = tpl.get('panel', 'title');
node.style.color = 'blue';
```

---

### `tpl.has(name, id)`

Checks whether an element exists in the context.

```js
if (tpl.has('panel', 'modal')) { /* ... */ }
```

---

### `tpl.move(name, node, newParent)`

Moves a DOM node to a new parent in the same context.

```js
const node = tpl.get('panel', 'title');
const target = tpl.get('panel', 'other-container');
tpl.move('panel', node, target);
```

---

### `tpl.container(name)` / `tpl.getCtx(name)`

Access to the DOM container or the internal context (debug / event delegation).

```js
const navEl = tpl.container('nav');           // → Element | null
const entry = tpl.context('nav');             // → { ctx, map, … } | null
```

---

### `tpl.registerTags(tags, ctxName?)`

Extends the tag catalogue **after** init. Useful when the bootstrap code does not know all required tags in advance.

```js
tpl.registerTags(['my-custom-tag', { name: 'btn-primary', tag: 'button', attrs: { type: 'submit' } }]);
tpl.elm('app', { id: 'x', tag: 'my-custom-tag' });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tags` | `TagSpec[]` | Tags to add (string or `{name, tag?, attrs?, svg?, child?}`). |
| `ctxName` | `string` | Optional — target context. Default `'main'` (shared catalogue). |

Returns: `string[]` — names added (existing entries are overwritten).

---

### Cleanup methods

| Method | Description |
|---------|-------------|
| `tpl.clearElm(name, id)` | Removes an element and its children from the DOM and the `map` |
| `tpl.clearIn(name, id)` | Removes the **children** of an element (keeps the element) |
| `tpl.clearAll(name)` | Clears the entire context |
| `tpl.clearContext(name)` | Destroys the context (DOM + map + catalogue if needed) |

---

### `tpl.style(name, id, styles)` / `tpl.script(name, id, content)`

Injection into `<head>` (page contexts only).

```js
tpl.style('page', 'myStyle', 'body { background: #eee; }');
tpl.script('page', 'myScript', 'console.log("loaded")');
```

### Default tags (auto-generated catalogue)

When no `tpl` is provided to `init`, the catalogue contains the common semantic HTML5 tags:

- **Structure**: `div`, `span`, `nav`, `header`, `footer`, `section`, `article`, `aside`, `main`
- **Forms**: `form`, `input`, `label`, `select`, `option`, `textarea`, `button`, `fieldset`, `legend`
- **Tables**: `table`, `tr`, `td`, `th`, `thead`, `tbody`, `tfoot`, `caption`
- **Lists**: `ul`, `li`, `ol`, `dl`, `dt`, `dd`
- **Headings / text**: `h1`–`h6`, `p`, `br`, `hr`, `i`, `b`, `em`, `strong`, `small`, `pre`, `code`, `kbd`, `samp`, `var`, `mark`
- **Inline semantics**: `a`, `abbr`, `cite`, `q`, `blockquote`, `s`, `u`, `sub`, `sup`, `time`
- **Interactive / collapsible**: `details`, `summary`, `dialog`, `progress`, `meter`
- **Media**: `video`, `audio`, `picture`, `img`, `figure`, `figcaption`
- **Canvas / SVG**: `cvs` (canvas), `svg`, `svg_use`

To add other tags, either pass a `tpl: [...]` array to `init`, or call `tpl.registerTags([...])` after init.

### Conditional attributes

When the resolved value of an attribute is `null`, `false`, or `undefined`, the attribute is **omitted** on the materialised element. Any other value (including `''`, `0`, `'false'`) is applied.

```js
tpl.elm('app', {
    id: 'd', tag: 'details',
    attrs: ['open'],
    data: { open: isOpen ? '' : null },   // '' = open, null = closed
});
```

This allows a single template to manage the presence/absence of boolean attributes (`open`, `disabled`, `checked`, …).

### Security

- `on*` attributes (event handlers) are silently ignored.
- Attributes not starting with a letter are ignored.
- `pageAttr` accepts only `class`, `style`, and `data-*` on `<body>`.

## Examples

```js
const tpl = runtime.resolve('template');

// Minimal setup
tpl.init('app', { to: '#root' });

// Nested structure
tpl.elm('app', { id: 'container', tag: 'div', attrs: ['class'], data: { class: 'wrapper' } });
tpl.elm('app', { id: 'title', parent: 'container', tag: 'h1', text: 'My Title' });
tpl.elm('app', { id: 'content', parent: 'container', tag: 'p', text: 'My content' });

// Access the DOM node
const titleNode = tpl.get('app', 'title');
titleNode.style.color = 'red';

// Remove an element
tpl.clearElm('app', 'content');
```

## Notes

- `tpl.init` throws if the context already exists — call `clearContext(name)` before re-initialising.
- `applyAttributes` rejects dangerous URLs on `href`/`src`/`action`/…, DOM-clobbering values on `id`/`name`, and `on*` attributes (shared policy via [`secPolicy`](./secPolicy.md)).
- When the resolved value of an attribute is `null`/`false`/`undefined`, the attribute is **omitted**; any other value (including `''`, `0`, `'false'`) is applied.

## See also

- [render](./render.md) — produces elm-arrays for `tpl.elms`
- [parser](./parser.md) — produces elm-arrays via `fromHTML`
- [uiSession](./uiSession.md) — facade that wraps `template` + `render` + `parser`
