---
module: textList
category: odf/text
dependencies: [xml, textParagraph]
returns: object
worker-safe: true
status: complete
---

# textList

> Parse/render `<text:list>` + `<text:list-item>` (numbered / bulleted lists).

**Module** `textList` | **Source** `packages/front/office/odf/src/text/list.js` | **Deps** `xml, textParagraph` | **Worker-safe** yes

Model:

```js
{
  type: 'list',
  styleName?,
  ordered?: boolean,
  numFormat?: '1'|'a'|'A'|'i'|'I',
  continueNumbering?,
  items: [ { children: [...nodes], _extras? } ],
  _extras?
}
```

### Ordered / numFormat semantics

`ordered` and `numFormat` are optional, independent of `styleName`:

| Value | Meaning |
|---|---|
| `ordered: true` | numbered list; `numFormat` is one of `'1' \| 'a' \| 'A' \| 'i' \| 'I'`, default `'1'` when absent |
| `ordered: false` | bullet list, rendered through an **emitted** bullet style (not left unstyled) |
| `ordered` absent | legacy passthrough — parse/render behave exactly as before this field existed |

**Precedence (write)** — an explicit `styleName` always wins; `ordered`/
`numFormat` are consulted only when `styleName` is absent.

### The `ctx` style seam

`parseList`/`renderList` (and the `hooks`-driven item/nested-list recursion)
accept an optional trailing `ctx` — the `textStyleRegistry` object built by
`odt` (a **resolver** on read, a **registry** on write; see
[text/style-registry](./style-registry.md)). It turns an opaque
`text:style-name` reference on a list into `ordered`/`numFormat` and back:

| `ctx.listNumbering(styleName)` | Read result |
|---|---|
| `null` (foreign / unprovable style) | opaque passthrough: `styleName` kept, no `ordered` field |
| `{ …, source: 'auto' }` | *consume-and-drop*: `ordered`/`numFormat` gained, `styleName` **dropped** (the write side rebuilds the automatic list style) |
| `{ …, source: 'named' }` | *keep-and-gain*: `ordered`/`numFormat` gained **and** `styleName` kept — a `styles.xml` named list style is a document-level resource that must not be orphaned |

Keep-and-gain is idempotent precisely because of the write precedence above
(same rationale as `text/paragraph.js`'s span rule): the write re-emits the
original binding untouched, the next read re-derives the same flags.

`ctx` is forwarded through the internal item / nested-list recursion, so
every level of a nested list is resolved independently against its own
`text:style-name` — nesting never inherits a parent's numbering. Each level
therefore carries its own generated style-name attribute when written; this
is legal ODF and a reader resolves each level on its own.

**Standalone-render degrade** — `ordered`/`numFormat` with **no** `ctx`,
or with a `ctx` that has no `listStyle` function, render an unstyled
`<text:list>` (no `text:style-name`), same as an `ordered`-less list. On read,
a `ctx` without a `listNumbering` function behaves like no `ctx`: no
`ordered`/`numFormat` is derived and the `styleName` is kept. This mirrors
`text/paragraph.js`'s degrade for emphasis flags without a style sink.

## Resolve

```js
const list = runtime.resolve('textList');
// → { parseList, renderList }
```

## API

| Method | Description |
|--------|-------------|
| `parseList(el, hooks?, ctx?)` | Converts a `<text:list>` node into the model. With a resolver `ctx`, a resolvable style name is typed into `ordered`/`numFormat`. |
| `renderList(list, hooks?, ctx?)` | Builds a `<text:list>` node. With a registry `ctx`, an `ordered`/`numFormat`-only list gets a generated style name. |

The `hooks` parameter lets a caller delegate parsing/rendering of item
children (paragraphs, headings, nested lists) to a higher-level parser
(`textContent`). Without `hooks`, `text:p` and nested `text:list`
children are typed inline via `textParagraph`/`parseList` and any
other child is dropped into `_extras.children`; `ctx` is forwarded to that
inline recursion either way.

## Examples

```js
const list = runtime.resolve('textList');
const el = xml.parse('<text:list><text:list-item><text:p>One</text:p></text:list-item></text:list>');
const l = list.parseList(el);
list.renderList(l);
```

An ordered list written through a document that owns a style sink:

```js
odt.write({
    body: [{
        type: 'list', ordered: true, numFormat: 'a',
        items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'first' }] }] }]
    }]
});
// content.xml: <text:list text:style-name="awa-l-na">…</text:list>
// odt.read() gives back { type: 'list', ordered: true, numFormat: 'a', items: [...] },
// no styleName — the generated style is fully consumed.
```

## Notes

- `text:list-header` items are parsed like `text:list-item` but carry `header: true` on the item.
- `continueNumbering` is only set (`true`) when `text:continue-numbering="true"` is present; it is omitted otherwise, independently of `ordered`/`numFormat`.
- Two adjacent lists of different `ordered` values keep distinct semantics end-to-end through `odt.write`/`odt.read` — this field is the odf-side half of keeping adjacent lists of different numbering distinct; before it existed, both degraded to a single untyped `text:list` shape.

## See also

- [text/content](./content.md)
- [text/paragraph](./paragraph.md)
- [text/style-registry](./style-registry.md)
