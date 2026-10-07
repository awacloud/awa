---
module: tableCell
category: odf/table
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# tableCell

> Parse/render `<table:table-cell>` and `<table:covered-table-cell>`.

**Module** `tableCell` | **Source** `packages/front/office/odf/src/table/cell.js` | **Worker-safe** yes

Model:

```js
{ type: 'cell', covered?, styleName?, valueType?, value?, currency?, formula?,
  repeated?, colSpan?, rowSpan?, children: [...rawXml], _extras? }
```

`children` contains the raw XML nodes of the content (typically
paragraphs). Typed interpretation of the content is surfaced via
`textContent`. The value attributes (`valueType`, `value`, `currency`,
`formula`) are typed by this module.

## API

| Method | Description |
|---------|-------------|
| `parseCell(el, { maxRepeat? })` | Converts `<table:table-cell>` / `<table:covered-table-cell>`. Optional `maxRepeat` caps `table:number-columns-repeated` and throws `ParseError('odf/parse-error/limit', …)` if exceeded. |
| `renderCell(cell)` | Builds the node. |

## Notes

- `parseCell` enforces `maxRepeat` only when the caller passes it; the
  `ods` and `odt` facades do not forward one, so default tolerance is
  unbounded. Pass `maxRepeat` when calling the module directly on
  untrusted input.
