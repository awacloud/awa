---
module: smlMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# smlMisc

> SML — long-tail sweeper for residual SpreadsheetML elements.

**Module** `smlMisc` | **Source** `packages/front/office/ooxml/src/extra/sml-misc.js` | **Deps** `xml` | **Worker-safe** yes

Bulk parser/renderer for the remaining `sml.xsd` elements outside the typed `sml-pivot-tables`, `sml-calculation`, `sml-sheet-config`, `sml-workbook-config` and `sml-form-controls` modules. Generic `{ kind, attrs, children }` shape preserves anything that isn't typed elsewhere.

## Resolve

```js
const ext = smlMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` / `renderElement` | — | dispatcher / inverse |
| `ELEMENTS` | `string[]` | the long-tail SML tag names |

## Notes

- Covers QueryTables, Connections, Slicers, smartTags, ext lists, and rare `<extLst>` extensions.
- Loaded only via [xlsx-full](../bundles/xlsx-full.md).

## See also

- [sml-pivot-tables](./sml-pivot-tables.md)
- [xlsx-full bundle](../bundles/xlsx-full.md)
