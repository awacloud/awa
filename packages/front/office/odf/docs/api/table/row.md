---
module: tableRow
category: odf/table
dependencies: [odfErrors, odfShared, xml, tableCell]
returns: object
worker-safe: true
status: complete
---

# tableRow

> Parse/render `<table:table-row>`.

**Module** `tableRow` | **Source** `packages/front/office/odf/src/table/row.js` | **Worker-safe** yes

Model: `{ type: 'row', styleName?, repeated?, cells: [...], _extras? }`.

## API

| Method | Description |
|---------|-------------|
| `parseRow(el, { maxRepeat? })` | Converts `<table:table-row>` into the model. Optional `maxRepeat` caps `table:number-rows-repeated` and throws `ParseError('odf/parse-error/limit', …)` if exceeded. |
| `renderRow(row)` | Builds the node. |

## Notes

- `parseRow` enforces `maxRepeat` only when the caller passes it; the
  `ods` and `odt` facades do not forward one (and `tableTable.parseTable`
  calls `parseRow` without it), so default tolerance is unbounded. Pass
  `maxRepeat` when calling the module directly on untrusted input.
