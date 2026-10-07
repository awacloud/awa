---
module: textParagraph
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textParagraph

> Parse/render `<text:p>`, `<text:span>` and `<text:a>` from ODF `content.xml`.

**Module** `textParagraph` | **Source** `packages/front/office/odf/src/text/paragraph.js` | **Deps** `xml` | **Worker-safe** yes

Model:

```js
{ type: 'paragraph', styleName?, runs: [<run>...], _extras? }
```

Run kinds:

| Kind | Extra field | ODF element |
|------|-------------|-------------|
| `text` | `value` | (inline text) |
| `span` | `value`, `styleName?`, `bold?`, `italic?`, `strike?`, `monospace?`, `runs?`, `_extras?` | `<text:span>` (see [Span runs](#span-runs)) |
| `space` | `count` | `<text:s text:c="N"/>` |
| `tab` | — | `<text:tab/>` |
| `line-break` | — | `<text:line-break/>` |
| `link` | `href`, `runs`, `_extras?` | `<text:a>` |
| `image` | `href`, `mimeType?`, `width?`, `height?`, `name?`, `anchorType?`, `styleName?` | `<draw:frame>` > `<draw:image>` (write side only, through `ctx.renderImage`) |

### Paragraph attributes

`text:style-name` is the only `<text:p>` attribute the model types
(`styleName`). Every other attribute (`xml:id`, `text:class-names`,
`text:cond-style-name`, extension attributes such as
`loext:marker-style-name`, …) is preserved verbatim, in read order, in
`_extras.attrs`; on write the typed style name is emitted first, then
`_extras.attrs`. `_extras.attrs` and `_extras.children` share one `_extras`
object; a paragraph with no such attribute and no untyped child has no
`_extras`. Through `odt`, the namespace prefixes these attributes use are
declared on the written `content.xml` root.

### Span runs

```js
{ type: 'span', value, styleName?, bold?, italic?, strike?, monospace?,
  runs?, _extras?: { attrs } }
```

- `value` is the flattened character data of the whole `<text:span>` subtree
  (spacing elements contribute nothing, the text of a frame or field anchored
  in the span is concatenated in place).
- `runs` is present **only** when the `<text:span>` has at least one element
  child. It lists the span's children in document order:

  | Child of `<text:span>` | Entry in `runs` |
  |---|---|
  | text | `{ type: 'text', value }` |
  | `text:s` / `text:tab` / `text:line-break` | `space` / `tab` / `line-break` run |
  | nested `text:span` | a span run of this same shape; its style is resolved through `ctx` on its own (its flags are not merged with the parent's) |
  | `text:a` | a link run, as at paragraph level; inside a link, a nested `text:a` is a raw element (next row) |
  | any other element (`draw:frame`, fields, references, notes, bookmarks, …) | the raw XML element node `{ type: 'element', name, attrs, children }`, kept verbatim at its position |

- `_extras.attrs` holds every span attribute other than `text:style-name`,
  verbatim and in read order.
- A span with no element child keeps the plain shape (no `runs`).

**Render** — when `runs` is an array, the `<text:span>` children are the
rendered `runs` (a raw `element` entry is emitted verbatim) and `value` is
ignored; otherwise the single text child is `value`. Attributes: the style
name (precedence below), then `_extras.attrs`. To replace the text of a read
span, delete its `runs` and set `value`.

**`textOf`** — a span with `runs` contributes the text of its runs (`space` →
that many spaces, `tab` → `\t`, `line-break` → `\n`, nested span and link →
their text, raw element → its character data); a span without `runs`
contributes `value`.

### Image runs

`{ type: 'image', href, … }` is a **write-side** run kind: `renderRun` hands it
to `ctx.renderImage(run)` and places the returned node at the run's position.
`odt` provides that sink, built from `drawFrame` / `drawImage` (see
[odt — Images](../odt/odt.md#images-typed-write)). On read a `draw:frame`
inside a `text:p` is not typed: it stays in the paragraph's
`_extras.children`. `textOf` gives an image run no text.

### Emphasis flags

`bold` / `italic` / `strike` / `monospace` are booleans, meaningful on `span`
runs only.

**Precedence (write)** — an explicit `styleName` always wins; the flags are
consulted only when `styleName` is absent.

### Link runs

`{ type: 'link', href, runs, _extras? }` maps `<text:a>`. Its `runs` accept
every run kind except `link`: ODF forbids nesting, so a `<text:a>` inside a
`<text:a>` is preserved raw in the outer link's `_extras.children`. A missing
`xlink:href` parses to `href: ''`.

`xlink:href` is the only attribute the model types. `xlink:type` is the
schema-fixed `'simple'` that the renderer always re-emits, so the canonical
value is reconstructed rather than stored; any other value — and every other
attribute — is preserved verbatim in `_extras.attrs` and re-emitted over the
defaults.

### The `ctx` style seam

Every parse/render entry point takes an optional trailing `ctx` — the
`textStyleRegistry` object built by `odt` (a **resolver** on read, a
**registry** on write). It is what turns opaque `text:style-name` references
into flags and back:

| `ctx.textFlags(styleName)` | Read result |
|---|---|
| `null` (foreign / unprovable style) | opaque passthrough: `styleName` kept, no flags |
| `{ …, source: 'auto' }` | *consume-and-drop*: flags gained, `styleName` **dropped** (the write side rebuilds the automatic style) |
| `{ …, source: 'named' }` | *keep-and-gain*: flags gained **and** `styleName` kept — a `styles.xml` named style is a document-level resource that must not be orphaned |

Keep-and-gain is idempotent precisely because of the write precedence above:
the write re-emits the original binding untouched, the next read re-derives the
same flags.

The `ctx` members this module calls:

| Member | Side | Used for |
|---|---|---|
| `ctx.textFlags(styleName)` | read | span emphasis resolution (table above) |
| `ctx.textStyle(flags)` | write | allocating the automatic style of a flagged span without `styleName` |
| `ctx.renderImage(run)` | write | rendering an `image` run; the returned node is placed at the run's position |

Each member is optional: a `ctx` that lacks it degrades exactly as a call
without `ctx` does.

## Resolve

```js
const para = runtime.resolve('textParagraph');
// → { parseParagraph, renderParagraph, textOf, paragraph, TEXT_NS }
```

## API

| Method | Description |
|--------|-------------|
| `parseParagraph(el, ctx?)` | Converts a `<text:p>` node into the model. With a resolver `ctx`, span emphasis is typed. |
| `renderParagraph(p, ctx?)` | Builds a `<text:p>` node. With a registry `ctx`, flagged spans get a generated automatic style. |
| `textOf(p)` | Concatenates the visible text (substitutes `text:s`/`text:tab`/`text:line-break`, recurses into `link` runs and into the `runs` of spans). |
| `paragraph(text, { styleName? })` | Helper — builds a single-text-run paragraph. |
| `TEXT_NS` | The ODF `text:` namespace URI. |

## Examples

```js
const el = xml.parse('<text:p text:style-name="P1">Hello <text:span>world</text:span>!</text:p>');
const p = para.parseParagraph(el);
para.textOf(p); // 'Hello world!'
```

Emphasis and a link, written through a document that owns a style sink:

```js
odt.write({
    body: [{
        type: 'paragraph',
        runs: [
            { type: 'span', value: 'important', bold: true, italic: true },
            { type: 'text', value: ' — see ' },
            { type: 'link', href: 'https://example.org/doc',
              runs: [{ type: 'text', value: 'the doc' }] }
        ]
    }]
});
// content.xml: <text:span text:style-name="awa-t-bi">important</text:span>
//              <text:a xlink:type="simple" xlink:href="…">the doc</text:a>
// odt.read() gives the same body back, flags included.
```

## Notes

- Unrecognised children of the paragraph itself (`text:bookmark-start`, fields, frames, etc.) go into `_extras.children` and are re-emitted after the runs on write. Inside a `text:span` they keep their position instead (see [Span runs](#span-runs)).
- [`textBookmarks`](./bookmarks.md) and [`textFields`](./fields.md) type such elements on demand; the paragraph parser does not call them.
- **Standalone-render degrade** — emphasis flags with **no** `ctx` render a
  plain unstyled `<text:span>`, text intact. A standalone render (the `odp` /
  `ods` callers, or a direct `renderParagraph(p)`) has no style sink to declare
  the automatic style in, and emitting a dangling style name would be worse
  than dropping the emphasis. Callers without a `ctx` behave exactly as they
  did before the seam existed.
- **Image degrade** — an `image` run with no `ctx.renderImage` sink (the `odp`
  / `ods` callers, or a direct `renderParagraph(p)`) emits nothing: the
  paragraph keeps its other runs and loses the picture, like flags without a
  registry.
- A `monospace` request makes the registry declare an `awa-mono`
  `<style:font-face>` as a side effect (`toFontFaceDecls()`); `renderRun` itself
  emits nothing font-face-specific.

## See also

- [text/style-registry](./style-registry.md) — the `ctx` contract (registry + resolver)
- [text/heading](./heading.md)
- [odt/odt](../odt/odt.md)
- [style/styles](../style/styles.md)
