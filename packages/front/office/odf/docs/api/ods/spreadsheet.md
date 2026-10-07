---
module: spreadsheet
category: odf/ods
dependencies: [xml, tableTable]
returns: object
worker-safe: true
status: complete
---

# spreadsheet

> Parse/render `<office:spreadsheet>` — body of `.ods` `content.xml`.

**Module** `spreadsheet` | **Source** `packages/front/office/odf/src/ods/spreadsheet.js` | **Deps** `xml`, `tableTable` | **Worker-safe** yes

Model:

```js
{
  tables: [ ...tableModel ],
  namedExpressions?: [ ...rawXmlElements ],
  dataValidations?:  [ ...rawXmlElements ],
  _extras?
}
```

## Resolve

```js
const sheet = runtime.resolve('spreadsheet');
// → { parseSpreadsheet, renderSpreadsheet, empty }
```

## API

| Method | Description |
|---------|-------------|
| `parseSpreadsheet(el)` | Converts `<office:spreadsheet>` to a typed model. |
| `renderSpreadsheet(s)` | Builds the XML element. |
| `empty()` | `{ tables: [] }`. |

## Notes

- Only the tables (`table:table`) are typed. `table:named-expressions`
  and `table:content-validations` are preserved as raw XML elements.
- Unknown children go into `_extras.children`.

## See also

- [ods/ods](./ods.md)
- [table/table](../table/table.md)
