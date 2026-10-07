---
module: smlWorkbookConfig
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# smlWorkbookConfig

> SML — workbook-level configuration (`bookViews`, `fileVersion`, `fileSharing`, `webPublishing`, custom views, …).

**Module** `smlWorkbookConfig` | **Source** `packages/front/office/ooxml/src/extra/sml-workbook-config.js` | **Deps** `xml` | **Worker-safe** yes

Typed parsing for the children of `<workbook>` outside `<sheets>` / `<definedNames>` / `<workbookPr>` (bookViews, fileVersion, fileSharing, fileRecoveryPr, oleSize, protection/workbookProtection, smartTagPr, smartTagTypes, webPublishing, webPublishObjects, customWorkbookViews, pivotCaches).

## Resolve

```js
const ext = smlWorkbookConfig.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseWorkbookConfig` / `renderWorkbookConfig` | `(rootChildren) => WorkbookConfig` / `(w) => xmlNode[]` | the whole `<workbook>` config block in one pass |
| `parseWorkbookView` / `renderWorkbookView` | — | one `<workbookView>` (inside `bookViews`) |
| `parseCustomWorkbookView` / `renderCustomWorkbookView` | — | one `<customWorkbookView>` |
| `parseSmartTagTypes` / `renderSmartTagTypes` | — | `<smartTagTypes>` (list of `smartTagType`) |
| `parseWebPublishObjects` / `renderWebPublishObjects` | — | `<webPublishObjects>` (`{count, items[]}`) |

`fileVersion`, `fileSharing`, `fileRecoveryPr`, `oleSize`, `protection`, `workbookProtection`, `smartTagPr`, `webPublishing` and `pivotCaches` are typed only *inside* `parseWorkbookConfig`/`renderWorkbookConfig` (plain attribute picks) — there is no standalone parser/renderer per element, no `parseWorkbookPr` (the top-level `<workbookPr>` is not handled by this module), and no `<externalReferences>` support.

## Elements typed

`bookViews`, `workbookView`, `fileVersion`, `fileSharing`, `fileRecoveryPr`, `oleSize`, `protection`, `workbookProtection`, `smartTagPr`, `smartTagTypes`, `smartTagType`, `webPublishing`, `webPublishObjects`, `webPublishObject`, `customWorkbookViews`, `customWorkbookView`, `pivotCaches`, `pivotCache` (alongside [sml-pivot-tables](./sml-pivot-tables.md)).

## Notes

- `<workbookPr>` (e.g. `date1904`) is out of scope for this module — it is handled by core.
- `customWorkbookViews` is rarely seen in real fixtures.

## See also

- [sml-sheet-config](./sml-sheet-config.md)
- [sml-calculation](./sml-calculation.md)
