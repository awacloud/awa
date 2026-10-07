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
  columns: [ { styleName?, defaultCellStyleName?, repeated? } ],
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
| `renderTable(t)` | Builds the node. |

## Notes

- `parseColumn` reads `table:number-columns-repeated` with no bound at
  all and keeps it raw in `columns[i].repeated`; nothing in
  `@awacloud/odf` expands repetitions, so the attribute is inert until a
  consumer iterates.
