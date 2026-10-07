---
module: smlPivotTables
category: extra
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# smlPivotTables

> SML — pivotTable + pivotCacheDefinition + pivotCacheRecords.

**Module** `smlPivotTables` | **Source** `packages/front/office/ooxml/src/extra/sml-pivot-tables.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

Reads / writes the three pivot parts present in `xl/pivotTables/` and `xl/pivotCache/` (~50 elements: locations, pivot fields with items, row/col/page/data fields, pivot areas, formats, chart/conditional formats, filters, pivot hierarchies, hierarchy usages, table style info, cache fields with typed shared items `s`/`n`/`m`/`b`/`d`/`e`/`x`, cache hierarchies, kpis, dimensions, measure groups, maps, cache records). Unknown children are preserved through `_extras` for fidelity.

## Resolve

```js
const ext = smlPivotTables.factory(ooxmlErrors, xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parsePivotTable` / `renderPivotTable` | `(xmlText) => PivotTable` | `xl/pivotTables/pivotTable*.xml`; throws `ParseError('xlsx/pivotTable-bad-root')` on a non-`<pivotTableDefinition>` root |
| `parsePivotCacheDefinition` / `renderPivotCacheDefinition` | `(xmlText) => PivotCache` | `xl/pivotCache/pivotCacheDefinition*.xml`; throws `ParseError('xlsx/pivotCacheDefinition-bad-root')` |
| `parsePivotCacheRecords` / `renderPivotCacheRecords` | `(xmlText) => {attrs, records[]}` | `xl/pivotCache/pivotCacheRecords*.xml`; throws `ParseError('xlsx/pivotCacheRecords-bad-root')` |
| `parseSharedItems` / `renderSharedItems` | — | `<sharedItems>`/`<groupItems>` container |
| `parsePivotArea` / `renderPivotArea` | — | `<pivotArea>` (used by `formats`/`chartFormats`/`conditionalFormats`) |
| `parseFieldGroup` / `renderFieldGroup` | — | `<fieldGroup>` (rangePr / discretePr / groupItems) |
| `parseCacheSource` / `renderCacheSource` | — | `<cacheSource>` (worksheetSource / consolidation) |
| `findChildren` | `(parent, name) => xmlNode[]` | all element children matching `name` |

## Elements typed

`pivotTableDefinition`, `location`, `pivotFields`, `pivotField`, `items`, `item`, `rowFields`, `colFields`, `dataFields`, `dataField`, `pageFields`, `pageField`, `rowItems`, `colItems`, `formats`, `format`, `chartFormats`, `conditionalFormats`, `filters`, `pivotHierarchies`, `pivotCacheDefinition`, `cacheSource`, `cacheFields`, `cacheField`, `sharedItems`, `cacheHierarchies`, `kpis`, `dimensions`, `measureGroups`, `maps`, `pivotCacheRecords`, `r`, `s`, `n`, `m`, `b`, `d`, `e`, `x`, `pivotTableStyleInfo`.

## Roundtrip example

```js
xlsx.use(smlPivotTables.factory(ooxmlErrors, xml));
const definition = ext.parsePivotTable(pivotTableXmlText);
definition.dataFields[0].attrs.name; // 'Sum of amount'
const cache = ext.parsePivotCacheDefinition(pivotCacheDefinitionXmlText);
cache.cacheFields.map(f => f.attrs.name); // ['region', 'amount', …]
```

## Notes

- The cache is split into two parts (definition + records) wired by the `pivotCacheDefinition.rId` relationship.
- Shared items are deduplicated; `item.x` references their index.

## See also

- [xlsx](../xlsx/xlsx.md)
- [Read+write xlsx guide](../../guide/read-write-xlsx.md)
