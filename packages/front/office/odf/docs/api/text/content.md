---
module: textContent
category: odf/text
dependencies: [xml, textParagraph, textHeading, textList, textSection, tableTable]
returns: object
worker-safe: true
status: complete
---

# textContent

> Orchestrator parsing/rendering the body of `<office:text>` (paragraphs, headings, lists, sections, tables, soft page breaks).

**Module** `textContent` | **Source** `packages/front/office/odf/src/text/content.js` | **Deps** `xml, textParagraph, textHeading, textList, textSection, tableTable` | **Worker-safe** yes

Each body node has a `type`:

| type | element |
|------|---------|
| `paragraph` | `<text:p>` |
| `heading` | `<text:h>` |
| `list` | `<text:list>` |
| `section` | `<text:section>` |
| `table` | `<table:table>` |
| `soft-page-break` | `<text:soft-page-break/>` |
| `unknown` | (preserved as-is) |

## Table cells are typed here — unlike standalone `tableCell`

[`tableCell`](../table/cell.md) carries a cell's `children` as raw XML
element nodes verbatim — it has no notion of paragraphs, lists, or nested
tables. **Within `textContent`**, once a `<table:table>` is
reached via `parseNode`/`parseBody`, every non-covered cell's `children`
array is replaced with the same TYPED body nodes used everywhere else in
this module (paragraphs, headings, lists, nested tables, or `unknown` for
anything unrecognised) — produced by recursing each raw cell child through
`parseNode`. Covered cells (`covered: true`) always end up with
`children: []`, regardless of what was in the source XML.

The reverse happens on render: `renderNode`/`renderBody` deep-copy the table
(and its rows and cells) and replace each cell's typed `children` with
rendered raw XML nodes (via `renderNode`) before delegating to
[`tableTable.renderTable`](../table/table.md). The typed model passed in is
never mutated — a `node` handed to `renderBody` compares deep-equal to
itself afterwards (`odt.write` must not alter the caller's doc).

Everything else about a table node — `name`, `styleName`, `columns`,
`headerRows`, and per-cell `styleName`/`valueType`/`value`/`currency`/
`formula`/`repeated`/`colSpan`/`rowSpan`/`covered`/`_extras` — is exactly the
[`tableTable`](../table/table.md)/[`tableRow`](../table/row.md)/
[`tableCell`](../table/cell.md) model shape; only `children` changes meaning
within `textContent` — plus the semantic `grid` field below.

## Grid tables — the `grid` field

A body `table` node may carry `grid?: boolean`, a `textContent`-level field
(it is not part of [`tableTable`](../table/table.md)'s model and is **never
serialised as an attribute**). It means "draw every cell with a visible
border, align the table to the page margins", expressed through the
[`textStyleRegistry`](./style-registry.md) seam:

- **Render** — when `node.grid === true` and `ctx` exposes `cellStyle`, the
  rendered table gets `table:style-name = node.styleName ||
  ctx.tableStyle({align: 'margins'})` (`awa-tb-m`) and every non-covered cell
  gets `table:style-name = cell.styleName || ctx.cellStyle({bordered: true})`
  (`awa-c-b`). **An explicit `styleName` always wins** — the same precedence
  rule as paragraphs and lists. Covered cells are untouched. Without `ctx`,
  or without `grid`, the output is byte-identical to a seam-free render.
- **Parse** — when `ctx` exposes `cellBorders`, the table has at least one
  non-covered cell and **every** non-covered cell's `styleName` resolves
  `bordered`, the table gets `grid: true`. Each cell style resolved with
  `source: 'auto'` is dropped from its cell (a named style is kept — "keep and
  gain"), and the table's own `styleName` is dropped too when `tableAlign`
  resolves it with `source: 'auto'`.
- **Consume-and-drop** — the auto resolutions land in the resolver's
  `consumed` set, so [`odt.read`](../odt/odt.md) drops the matching automatic
  styles from the surfaced `autoStyles`. If any non-covered cell fails, the
  table is left exactly as without the seam (no `grid`, every name kept) and
  any automatic style the attempt consumed is released again, so it stays
  surfaced.

Invariant: for `T = { type: 'table', grid: true, columns: [{repeated: 3}],
rows: [...] }` with no cell `styleName`, `parseBody(renderBody([T], registry),
resolver)` deep-equals `[T]`, and `odt.read(odt.write({ body: [T] })).autoStyles`
is `undefined`.

## Resolve

```js
const content = runtime.resolve('textContent');
// → { parseNode, renderNode, parseBody, renderBody, bodyText }
```

## API

| Method | Description |
|--------|-------------|
| `parseBody(officeTextEl, ctx?)` | Converts the contents of an `<office:text>` into an array of typed nodes. |
| `renderBody(nodes, ctx?)` | Converts an array of typed nodes into XML elements. |
| `parseNode(el, ctx?)` / `renderNode(node, ctx?)` | Works node by node; used internally to delegate section/list/table children. |
| `bodyText(nodes)` | One line per paragraph or heading (lists, sections and table cells included), followed by the text of any text box (`draw:frame` / `draw:text-box`) anchored in it; image frames and alternative text contribute nothing; spacing inside a `text:span` (`text:s`, `text:tab`, `text:line-break`) is honoured, and the text of a text box anchored inside a span stays inline with the span. |

## The `ctx` parameter

Every parse/render entry point accepts an optional trailing `ctx` — the style
seam object built by [`odt`](../odt/odt.md): a
[`textStyleRegistry`](./style-registry.md) **resolver** on read, a **registry**
on write. `textContent` never interprets it; it passes it straight through as
an **extra trailing argument**:

| dispatch | call |
|----------|------|
| `text:p` | `parseParagraph(el, ctx)` / `renderParagraph(node, ctx)` |
| `text:h` | `parseHeading(el, ctx)` / `renderHeading(node, ctx)` |
| `text:list` | `parseList(el, hooks, ctx)` / `renderList(node, hooks, ctx)` |
| `text:section` | `parseSection(el, hooks)` / `renderSection(node, hooks)` — no `ctx` |
| `table:table` | cell children go through `parseNode(el, ctx)` / `renderNode(node, ctx)` directly; the table itself consumes `ctx` for the `grid` field |

The child `hooks` are built per call, so nested content keeps the `ctx` of the
enclosing call. `textSection` receives none: its children reach it through
those hooks, which already carry it. Table cells are not routed through
`tableTable`/`tableRow`/`tableCell` for their content — `textContent` types
and untypes cell children itself, calling `parseNode`/`renderNode`
recursively (so a table nested inside a table, or inside a list item, keeps
the same `ctx` all the way down).

All three delegate pairs consume `ctx`: `textParagraph`/`textHeading` for
typed run emphasis and link runs, `textList` for ordered/bullet list styles —
and body tables consume it for `grid` (above).
`ctx === undefined` reproduces the previous behaviour exactly, byte for byte.

## Examples

```js
const content = runtime.resolve('textContent');
const officeText = xml.parse('<office:text><text:p>Hello</text:p></office:text>');
const nodes = content.parseBody(officeText);
content.bodyText(nodes); // 'Hello'
content.renderBody(nodes);

// With the style seam threaded through (as `odt` does):
const resolver = styleRegistry.createResolver(autoStyles, fontFaces, namedStyles);
content.parseBody(officeText, resolver);
```

A table cell's content, once parsed, is a typed body-node array like any
other:

```js
const withTable = xml.parse(
    '<office:text><table:table><table:table-row><table:table-cell>' +
    '<text:p>cell text</text:p></table:table-cell></table:table-row></table:table></office:text>'
);
const [table] = content.parseBody(withTable);
table.type;                          // 'table'
table.rows[0].cells[0].children[0];  // { type: 'paragraph', runs: [...] }
content.bodyText([table]);           // 'cell text'
```

A grid table through the registry/resolver seam:

```js
const styleRegistry = runtime.resolve('textStyleRegistry');
const para = runtime.resolve('textParagraph');
const grid = { type: 'table', grid: true, columns: [{ repeated: 2 }], rows: [
    { type: 'row', cells: [
        { type: 'cell', children: [para.paragraph('a')] },
        { type: 'cell', children: [para.paragraph('b')] }
    ] }
] };
const registry = styleRegistry.createRegistry();
const rendered = content.renderBody([grid], registry);
rendered[0].attrs;                      // { 'table:style-name': 'awa-tb-m' }
registry.toAutomaticStyles().styles.map(s => s.name); // ['awa-c-b', 'awa-tb-m']

const resolver = styleRegistry.createResolver(registry.toAutomaticStyles(), [], null);
const [back] = content.parseBody(xml.el('office:text', {}, rendered), resolver);
back.grid;                              // true — cell/table style names dropped
```

## Notes

- Orchestrates `textParagraph`, `textHeading`, `textList`, `textSection`, `tableTable` — unrecognised element names become `{ type: 'unknown', element: el }` and round-trip verbatim, including an `{ type: 'unknown', element: <table:table ...> }` node produced by an older reader that predates the `table` node type: it still renders back to its original XML verbatim.
- `bodyText` recurses into list items, section children, and every row/cell of a table. It does not read `unknown` nodes as text, except to find text boxes: the text of every `draw:text-box` kept raw by the reader (in a paragraph's or heading's raw extras, in a link run's, or in a body-level `unknown` element) is emitted on its own line after the line of the element that holds it, and boxes nested in a box are reached once, in document order. The read model itself is unchanged — frames stay raw.
- `bodyText` takes no `ctx`: it reads only what is already in the typed nodes.
- Covered cells (`table:covered-table-cell`, `covered: true`) always carry `children: []` after parsing — any raw children present in the source XML are dropped, matching the ODF semantics that a covered cell has no content of its own.

## See also

- [text/paragraph](./paragraph.md)
- [text/heading](./heading.md)
- [text/list](./list.md)
- [text/section](./section.md)
- [text/style-registry](./style-registry.md) — what a `ctx` is
- [table/table](../table/table.md) / [table/row](../table/row.md) / [table/cell](../table/cell.md) — the cell model whose raw `children` `textContent` replaces with typed nodes
- [odt/odt](../odt/odt.md) — builds the `ctx` and threads it in
