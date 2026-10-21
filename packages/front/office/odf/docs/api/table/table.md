---
module: tableTable
category: odf/table
dependencies: [xml, tableRow]
returns: object
worker-safe: true
status: complete
---

# tableTable

> Parse/render `<table:table>` — orchestrator for columns, rows, header rows.

**Module** `tableTable` | **Source** `packages/front/office/odf/src/table/table.js` | **Worker-safe** yes

Model:

```js
{
  type: 'table',
  name?, styleName?,
  columns: [ { styleName?, defaultCellStyleName?, repeated?, visibility? } ],
  headerRows?: integer,       // header rows count (top-N rows)
  rows: [ ...rowModel ],
  _extras?
}
```

The first `headerRows` rows of `rows` are rendered inside a
`<table:table-header-rows>`.

> **Note — `grid` is not a `tableTable` field.** The semantic `grid: true`
> flag (bordered cells, margins-aligned table) belongs to body tables handled
> by [`textContent`](../text/content.md#grid-tables--the-grid-field), which
> turns it into `styleName`s through the `textStyleRegistry` seam before
> calling `renderTable`. `parseTable`/`renderTable` ignore it.

## API

| Method | Description |
|---------|-------------|
| `parseTable(el)` | Converts `<table:table>`. |
| `renderTable(t)` | Builds the node. A model with no `columns` entry is written with one `<table:table-column>` repeated to the widest row (cells counted with `repeated`, a `colSpan` past the last cell included; no repeat attribute for a width of 1): the schema requires a column before the rows. The model passed in is not modified; reading the file back shows that column (`columns: [{ repeated: N }]`, no `repeated` for a width of 1). |

## Notes

- `visibility` is `table:visibility` (`visible` | `collapse` | `filter`) of a
  column, kept as written and absent when the attribute is; `renderTable`
  writes it back. Rows carry the same field (see [`tableRow`](./row.md)).
- `parseColumn` reads `table:number-columns-repeated` with no bound at
  all and keeps it raw in `columns[i].repeated`; nothing in
  `@awacloud/odf` expands repetitions, so the attribute is inert until a
  consumer iterates.
