---
module: render
category: dom/rendering
dependencies: [secPolicy]
returns: object
worker-safe: true
status: complete
---

# render

> Data transformer for elm-arrays: binds variables, rewrites IDs. Does not touch the DOM.

**Module** `render` | **Source** `packages/front/fw/src/dom/rendering/render.js` | **Deps** `secPolicy` | **Worker-safe** yes (no DOM dependency; pure data)

> **SSR security**: `render.toHTML` filters dangerous URLs (`javascript:`, `vbscript:`, …), DOM-clobbering values on `id`/`name`, and `on*` attributes. The shared policy lives in [`secPolicy`](./secPolicy.md).

## Resolve

```js
const render = runtime.resolve('render');
// Returns: { elms, rewrite, parts, loop, full, computeBoundValue, applyParsedElm }
```

## API

### Main pipeline (consumed by `uiSession`)

| Method | Description |
|---------|-------------|
| `elms(array, options, attach?)` | Applies variables without rewriting IDs |
| `rewrite(array)` | Rewrites IDs (anti-collision) → `RenderResult` |
| `parts(array, options, attach?)` | `elms` + `rewrite` in one pass → `RenderResult` |
| `loop(array, optionsArray, attach?)` | Iterative render (1 template × N datasets) → `RenderResult` |
| `full(data, attachParent?, idParent?)` | Full multi-item pass → `FullResult` |

### Binding helpers (consumed by `uiSession.list` in `patch` mode)

| Method | Description |
|---------|-------------|
| `computeBoundValue(mapEntry, data, base)` | Resolves **one** binding variable (handles `default`, `prepend`, `append`, missing). |
| `applyParsedElm(parsedElm, data)` | Applies all `MapEntry` items of an elm to `data` → `{ data: attrs, [prop]: text }`. Does not mutate the input. |

### Server-side rendering (SSR)

| Method | Description |
|---------|-------------|
| `toHTML(parseResult, data, opts?)` | Pure function — serialises a `ParseResult` (or elm-array) to final HTML, without the DOM. Default security (URL/clobbering/event filter). Emits `data-fw-id` for future hydration. See the `rendering-pipeline.md` guide for the full signature. |

#### Attribute value semantics of the SSR writer

`toHTML` writes each tracked attribute from the bound `elm.data[attr]`, and the
value's **type** decides the emitted form:

| Bound value | Emitted |
|---|---|
| `null`, `false`, `undefined` | attribute **omitted entirely** — this is how a conditional attribute is expressed server-side |
| `''` (empty string) | bare **boolean attribute** (`disabled`, not `disabled=""`) |
| anything else | `name="<escaped value>"` |

An attribute is also dropped (not emitted empty) when it is an `on*` handler,
when its name is not a safe attribute name, when a URL-bearing attribute fails
the URL filter, or when an `id`/`name` value would clobber the DOM.

This is **not** the client writer's behaviour: `dom.attr` coerces `null` /
`false` / `undefined` to the strings `"null"` / `"false"` / `"undefined"` and
needs `dom.attrRemove` to actually remove. An author who relies on
falsy-means-absent gets it from `toHTML` and from `uiSession.attr` — never from
a direct `dom.attr` call.

### `render.elms(array, options, attach?)`

Binds variables into a cloned elm-array. Does not modify the original.

```js
const bound = render.elms(template, { title: 'Hello', color: 'red' });
// bound is an ElmNode[] with variables applied
```

### `render.rewrite(array)`

Rewrites IDs to avoid collisions between multiple renders of the same template.

```js
const { arr, map, content } = render.rewrite(elmArray);
// arr     → ElmNode[] with recalculated IDs (timestamp + index + random)
// map     → Map<origId, newId> — translation for later references
// content → Map<slotName, containerId> — IDs of content slots
```

### `render.parts(array, options, attach?)`

Shortcut: `elms` + `rewrite` in one pass.

```js
const result = render.parts(template, { title: 'Hello' });
// result : { arr, map, content }
```

### `render.loop(array, optionsArray, attach?)`

Renders the same template N times with different data. Results are concatenated.

```js
const items = [
    { text: 'Item 1', cls: 'odd' },
    { text: 'Item 2', cls: 'even' },
    { text: 'Item 3', cls: 'odd' }
];
const result = render.loop(iterateTemplate, items);
// result.arr → ElmNode[] containing 3 repetitions of the template
```

### `render.full(data, attachParent?, idParent?)`

Full orchestration for one or more items with `attach` slot management.

```js
const result = render.full([
    { template, id: 'main', data: { title: 'Hello' } },
    { template: contentTpl, id: 'body', attach: { elm: 'main', name: 'content' }, data: { text: 'World' } }
]);
// result : { arr, map, attach }
```

---

### `render.computeBoundValue(mapEntry, data, base)` → `*`

Resolves the final value of **a single** `MapEntry` (parser `#{...}` binding) from `data` and the static base value.

```js
const m = { name: 'cls', prop: 'class', append: true };
render.computeBoundValue(m, { cls: 'active' }, 'btn-');    // → 'btn-active'
render.computeBoundValue(m, {},                'btn-');    // → 'btn-' (nothing to append)

const m2 = { name: 'open', prop: 'open', data: true };
render.computeBoundValue(m2, { open: null }, '');          // → null (conditional attr)
```

Semantics:
- `data[name]` present → uses that value
- otherwise `mapEntry.default` if provided
- otherwise returns `base` unchanged (no-op)
- `append: true` → `base + value`
- `prepend: true` → `value + base`
- neither → `value` (full replacement)
- `tail` (when present) → appended after the above, **unconditionally** — the trailing static run survives even when the variable is absent (e.g. `{ append: true, tail: ';z' }` on base `'a:'` → `'a:<value>;z'`, or `'a:;z'` when absent). This is how a marker with static content on BOTH sides (`"pre#{v}suf"`) or interleaved multi-marker runs are preserved. See the parser's *static/var segment model*.
- `null`/`false`/`0`/`''` values are **passed through as-is** — only `undefined` (absent variable with no default) triggers the return of `base`.

Pure function — no mutation of `mapEntry`, `data`, or `base`.

---

### `render.applyParsedElm(parsedElm, data)` → `{ data, [prop]: * }`

Applies **all** `MapEntry` items of a parsed elm to `data`. Returns a new object with:
- `out.data[prop]` for each bound attribute (`map.data = true`)
- `out[prop]` for each bound top-level prop (text, etc.)

```js
const elm = {
    id: 'a', tag: 'div',
    data: { class: 'base-' },
    map: [
        { name: 'a', prop: 'class', data: true, append: true },
        { name: 'b', prop: 'class', data: true, append: true },
    ],
};
render.applyParsedElm(elm, { a: 'x', b: 'y' }).data.class;
// → 'base-xy'  (multiple bindings on the same prop accumulated in order)
```

Pure function — does not mutate the input. This is the primitive used by `uiSession.list` in `onUpdate: 'patch'` mode to re-apply bindings on an existing DOM without rebuilding it.

## Typedef: RenderResult

```js
{
    arr:     ElmNode[],              // elm-array with rewritten IDs
    map:     Map<string, string>,    // origId → newId
    content: Map<string, string>     // slotName → containerId (new IDs)
}
```

## Examples

```js
const parser = runtime.resolve('parser');
const render = runtime.resolve('render');
const tpl    = runtime.resolve('template');

const parsed = parser.fromHTML('<div><h1>#{title}</h1>${body}</div>');

// Simple render
const result = render.parts(parsed.template, { title: 'Hello World' });
tpl.elms('monContexte', result.arr);

// Iterative render
const listParsed = parser.fromHTML('<!-- $item --><li>#{text}</li><!-- item$ -->');
const loop = render.loop(listParsed.iterates.item, [
    { text: 'A' }, { text: 'B' }, { text: 'C' }
]);
tpl.elms('monContexte', loop.arr);
```

## Notes

- `elms` and `rewrite` always clone the input array — the original is not modified.
- IDs rewritten by `rewrite`: `timestamp_index_random` format to guarantee global uniqueness.
- `loop` is the correct pattern for `<!-- $name -->` blocks extracted by `parser`.
- Use `parts` rather than `elms + rewrite` separately unless the two steps are truly independent.
- `computeBoundValue` and `applyParsedElm` are **pure** (no mutation, no DOM). Usable in a worker.

## See also

- [parser](./parser.md) — produces the ElmNode[] input
- [template](./template.md) — consumes the ElmNode[] output
- [uiSession](./uiSession.md) — wraps everything automatically, and uses `applyParsedElm` for its `onUpdate: 'patch'` mode
