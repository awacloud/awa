---
module: parser
category: dom/rendering
dependencies: [secPolicy]
returns: object
worker-safe: true
status: complete
---

# parser

> Converts HTML to elm-arrays (notation `#{...}`, `${...}`, `<!-- $name -->`) and back.

**Module** `parser` | **Source** `packages/front/fw/src/dom/rendering/parser.js` | **Deps** `secPolicy` | **Worker-safe** yes

> **Worker note**: `parser.fromHTML` uses `DOMParser` when available (window + some workers) and falls back to a self-contained tokenizer for Node/Bun or contexts without `DOMParser`. The other methods (elm-array serialisation, validation) are 100% data — no DOM dependency.

> **Security**: parsing rejects `<script>`, `<object>`, `<embed>`, `<iframe>`, `on*` attributes, and attribute names that do not start with a letter. These rules live in the [`secPolicy`](./secPolicy.md) module — single source of truth for the security policy, shared with `template`, `render`, `dom`, and `sanitize`.

## Resolve

```js
const parser = runtime.resolve('parser');
// Returns: { fromHTML, toHTML }
```

## API

| Method | Signature | Description |
|---------|-----------|-------------|
| `fromHTML` | `(html: string, options?: FromHTMLOptions) => ParseResult` | HTML → elm-array + iterates |
| `toHTML` | `(input: ElmNode[]\|ParseResult) => string` | elm-array → HTML (reverse) |

### Typedef: FromHTMLOptions

| Field | Type | Description |
|---|---|---|
| `reserveIds` | `Iterable<string>` | Explicit ids the caller knows the assembled document will contain, declared **up front**. Reserved for the whole parser instance — this call and every later one — so an auto `p<n>` never collides with an explicit id the instance has not met yet. Empty and non-string entries are ignored. Supplying the option **bypasses the `ParseResult` cache** (read *and* write), because the reservation changes which ids are minted. |

### `parser.fromHTML(html)`

```js
const result = parser.fromHTML('<div><h1>#{title}</h1></div>');
// → {
//   template: [
//     { id: "p0", tag: "div" },
//     { id: "p1", tag: "h1", parent: "p0", text: "", map: [{ name: "title", prop: "text" }] }
//   ]
// }
```

#### With a content slot

```js
const result = parser.fromHTML('<div><h1>#{title}</h1>${content}</div>');
// template contains a node with content: "content"
```

#### With an iterable block

```js
const result = parser.fromHTML(`
    <ul>
        <!-- $item -->
            <li>#{text}</li>
        <!-- item$ -->
    </ul>
`);
// → {
//   template: [ ElmNode{tag:"ul"} ],
//   iterates: { item: [ ElmNode{tag:"li", map:[{name:"text",prop:"text"}]} ] }
// }
```

### `parser.toHTML(input)`

```js
const html = parser.toHTML(result.template);
// Rebuilds the original HTML (with #{...} notation preserved)
```

## Typedef: ParseResult

```js
{
    template: ElmNode[],            // flat array, parents before children
    iterates?: {                    // present if <!-- $name --> blocks found
        [blockName: string]: ElmNode[]
    }
}
```

## Typedef: ElmNode

```js
{
    id:      string,                // HTML id or auto-generated ("p0", "p1", ...)
    tag:     string,                // "div", "h1", "svg_use", "text", ...
    parent?: string,                // parent id (absent for root nodes)
    attrs?:  string[],              // names of tracked attributes
    data?:   Object.<string,string>,// static attribute values
    text?:   string,                // static text (leaf nodes)
    content?: string,               // slot name or iterable block name
    map?:    MapEntry[]             // variable descriptors
}
```

## Typedef: MapEntry

```js
{
    name:     string,   // variable name (from #{name})
    prop:     string,   // target property: attribute or "text"
    data?:    boolean,  // true → targets elm.data[prop] (attribute)
    append?:  boolean,  // value appended after the static base
    prepend?: boolean,  // value prepended before the static base
    tail?:    string,   // static run that immediately FOLLOWS this variable
    default?: any       // value if variable is absent from the render
}
```

### Value positioning — the static/var segment model

A single text or attribute value is an ordered sequence of static runs and
`#{var}` markers. It is stored as a static base (`elm.text` / `elm.data[prop]`)
plus one `MapEntry` per marker, and rendered as:

```
base + Σ over entries in order ( resolve(varᵢ) + tailᵢ )
```

`base` is the leading static run; each entry's `tail` is the static run that
immediately follows its marker (unconditional — kept even when the variable is
absent). A marker may therefore sit **anywhere** in the value, with static
content on both sides:

| Source value | `base` | entries |
|---|---|---|
| `#{v}` | `""` | `{v}` (full replace) |
| `pre#{v}` | `"pre"` | `{v, append}` |
| `#{v}suf` | `"suf"` | `{v, prepend}` |
| `pre#{v}suf` | `"pre"` | `{v, append, tail:"suf"}` |
| `a#{v1}b#{v2}c` | `"a"` | `{v1, append, tail:"b"}, {v2, append, tail:"c"}` |

The prefix-only / suffix-only / full-replace shapes are unchanged; `tail` only
appears when a marker has a non-empty trailing static run (both-sides or the
interior runs of a multi-marker value). `render.js` and the AOT `dom-codegen`
apply the same model, and `toHTML` restores the full value.

## Template notation

| Marker | Usage | Examples |
|---------|-------|---------|
| `#{varName}` | Text or attribute value | `<h1>#{title}</h1>`, `class="#{cls}"` |
| `${slotName}` | Content slot (child element) | `<div>${body}</div>` |
| `<!-- $name --> ... <!-- name$ -->` | Iterable block | `<!-- $item --><li>#{t}</li><!-- item$ -->` |

## Examples

```js
const parser = runtime.resolve('parser');

// Simple variable
const r1 = parser.fromHTML('<h1>#{title}</h1>');
// r1.template[0].map = [{ name: "title", prop: "text" }]

// Variable in attribute
const r2 = parser.fromHTML('<div class="#{cls}" id="box">texte</div>');
// r2.template[0].map = [{ name: "cls", prop: "class", data: true }]

// Round-trip
const html = '<div><p>#{text}</p></div>';
const parsed = parser.fromHTML(html);
const rebuilt = parser.toHTML(parsed.template);
// rebuilt ≈ html (possible reformatting)

// One logical document assembled from several calls: declare the full
// explicit-id set up front so no auto id can collide with it.
const explicit = ['p2', 'intro'];
const head = parser.fromHTML('<div><span>a</span><span>b</span></div>', { reserveIds: explicit });
const body = parser.fromHTML('<section id="p2"><h1>Title</h1></section>');
const page = parser.toHTML([...head.template, ...body.template]);
// `head` skipped p2 → the <section> survives the merge.
```

## Notes

- SVG children: `svg_` prefix (e.g. `svg_use`, `svg_rect`, `svg_path`).
- Mixed text nodes: synthetic tag `"text"`.
- HTML ids are preserved in `elm.id`; otherwise auto-incremented (`p0`, `p1`, ...).
- The auto counter is scoped to the parser **instance** and keeps running across `fromHTML` calls, so a site build that shares one parser gets stable, non-repeating ids. Within a single `fromHTML` call the ids are **guaranteed unique for that document**: a `pN` value already used as an explicit `id` anywhere in the parsed markup is skipped (the whole document is scanned before the first mint, so an explicit id further down the tree counts too). Feeding parser output back through `fromHTML` is therefore safe.
- **Multi-call document assembly.** A consumer that builds one logical document from *several* `fromHTML` calls on a shared instance gets the guarantee across that seam too, in two layers. (1) *Accumulation, always on*: every explicit id seen by a call is reserved for the instance, so a later call never re-mints it. (2) *Caller-supplied reservation*: pass the full explicit-id set of the assembled document as `fromHTML(html, { reserveIds })` on the **first** call — this is the only way to cover the opposite direction, an explicit `pN` that only arrives in a *later* call, which accumulation cannot foresee. A reservation is instance-wide and permanent; it applies to every subsequent call with no options. Reservation only affects *future* mints, so it must be declared before the first parse of the assembly. Uniqueness matters because `buildTree` merges nodes by id with last-write-wins: a collision **deletes** a subtree from the assembled output rather than duplicating it.
- **`id` is identity, never a binding site.** The `id` attribute is consumed as the node's `elm.id` and skipped by the attribute walk, so it never enters `attrs` / `data` and never gets a `MapEntry`. `id="#{key}"` therefore does **not** bind: the literal string `#{key}` becomes the node id. Bind a dynamic identity through another attribute (`data-key="#{key}"`) and let `render.rewrite` handle id uniqueness.
- The slot `${name}` becomes a `<span>` if the node has siblings, otherwise inlined on `elm.content`.

## See also

- [render](./render.md) — next step: binding data
- [uiSession](./uiSession.md) — `ui.parse()` wraps `parser.fromHTML()`
- [Guide pipeline](../../../guide/rendering-pipeline.md)
