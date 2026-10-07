# Reading and writing `.xlsx`

This guide demonstrates the xlsx flow, first with [`xlsx-large`](../api/bundles/xlsx-large.md) (pivot tables, sheet config, charts), then with [`xlsx-full`](../api/bundles/xlsx-full.md) (form controls).

**Prerequisites**: `@awacloud/ooxml` and `@awacloud/fw` installed and the install and runtime registration of [Getting started](./getting-started.md); the bundles come from `@awacloud/ooxml/bundles/xlsx-large` and `@awacloud/ooxml/bundles/xlsx-full`.

## Bootstrapping with `ModuleRuntime`

`register()` takes **one** descriptor per call — use `registerAll(array)`
for a batch. The extras are **not** re-exported by name from the
`@awacloud/ooxml` root; import the whole `extras` array instead:

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { xlsxLargeBundle } from '@awacloud/ooxml/bundles/xlsx-large';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.registerAll(extras);   // every opt-in extra; a bundle only
                                   // resolves the ones it declares
fw.runtime.register(xlsxLargeBundle);

const xl = fw.runtime.resolve('xlsxLargeBundle'); // enriched xlsx instance
```

## Reading

```js
const bytes  = await fetch('/sample.xlsx')
    .then(r => r.arrayBuffer())
    .then(b => new Uint8Array(b));
const result = xl.read(bytes);   // → { workbook, package, unmodelledParts }
```

The typed workbook lives under `result.workbook`:

```js
{
    type: 'workbook',
    sheets: [{
        name, state?,
        rows: [ [cell, cell, …], … ],   // array of rows, each an array of cells
        merges?: ['A1:B2'],
        cols?: [{ min, max, width? }],
        sheetPr?, sheetFormatPr?, printOptions?, …   // RAW nodes — see note below
    }],
    sharedStrings?: [string],
    styles?: { /* numFmts, fonts, fills, borders, cellXfs, dxfs */ },
    definedNames?: [{ name, value, scope?, hidden? }],
    tables?: [xlsxTablesObject]
}

cell := { type: 'cell', value, t, formula?, ref?, s?, hyperlinkRef? }
```

`sheet.rows` is a **plain array of rows**, each row a **plain array of
cells** — there is no `cells['A1']`-keyed map. Gaps from a sparse `r=`
attribute are back-filled with `{ type:'cell', value:null, t:'n' }` so
the column index equals the position in the row array. See
[the `xlsx` core page](../api/xlsx/xlsx.md#workbook-model) for the full
model.

## Cell access

```js
const sheet = result.workbook.sheets[0];

// Read (row 0 = header row, row 1 = first data row).
sheet.rows[0][0];   // { type:'cell', value:'Name', t:'s' }
sheet.rows[1][1];   // { type:'cell', value:42, t:'n' }

// Write.
sheet.rows[0][3] = { type: 'cell', value: 'Total', t: 's' };
sheet.rows[1][3] = { type: 'cell', value: 100, t: 'n', s: 1 };
```

## Concrete input → parsed object

Input `xl/worksheets/sheet1.xml` excerpt:

```xml
<sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c></row>
  <row r="2"><c r="A2"><v>42</v></c></row>
</sheetData>
```

After `read()`:

```js
sheet.rows[0][0] // → { type:'cell', value:'Name', t:'s' }   // resolved via sharedStrings[0]
sheet.rows[1][0] // → { type:'cell', value:42, t:'n' }
```

## Sheet config, pivot tables (with `xlsx-large`)

None of the `xlsx-large` extras declares a `hydrateWorkbook` /
`hydrateSheet` hook, so `xlsxWalker` does **not** enrich the read
result automatically — resolve the extra and call its `parse*`/`render*`
helpers on the raw XML you care about:

```js
const sheetConfig = fw.runtime.resolve('smlSheetConfig');
// `sheetPr`/`printOptions`/etc. are typed together in one pass from the
// worksheet's root children, not resolved individually from the read()
// result — see the smlSheetConfig API for the exact call site.
```

See [`smlSheetConfig`](../api/extra/sml-sheet-config.md) for the full shape.

Pivot-table parts are reached through their own package relationships,
not through `result.workbook`:

```js
const pivots = fw.runtime.resolve('smlPivotTables');
const definition = pivots.parsePivotTable(pivotTableXmlText);
console.log(definition.dataFields[0].attrs.name); // 'Sum of amount'
const cache = pivots.parsePivotCacheDefinition(pivotCacheDefinitionXmlText);
console.log(cache.cacheFields.map(f => f.attrs.name)); // ['region', 'date', 'amount']
```

See [`smlPivotTables`](../api/extra/sml-pivot-tables.md).

## Form controls (with `xlsx-full`)

```js
import { xlsxFullBundle } from '@awacloud/ooxml/bundles/xlsx-full';

// `extras` (registered above) already covers xlsx-full's own extras
// (smlFormControls, dmlShapesAdvanced, dmlXdrAdvanced, transitional,
// legacyVml, smlMisc, dmlChartMisc, dmlMainMisc) — `xlsxLargeBundle` is
// already registered too (a declared dependency of xlsxFullBundle):
fw.runtime.register(xlsxFullBundle);

const xlFull = fw.runtime.resolve('xlsxFullBundle');
const result = xlFull.read(bytes);

const controls = fw.runtime.resolve('smlFormControls');
const parsed   = controls.parseControls(controlsXmlText);
```

See [`smlFormControls`](../api/extra/sml-form-controls.md).

## Writing

```js
// `write` takes the WORKBOOK, not the whole read() result — single
// argument, no options object.
const out = xl.write(result.workbook);
const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
```

The output carries every explicitly-set field on `workbook`
(sheetPr, styles, definedNames, tables, …). `write()` produces the parts
its model carries; a part `read()` did not model (a theme, document
properties, pivot tables and their caches, printer settings, …) is not
written back — `read()` lists it in `result.unmodelledParts`. The legacy
VML drawing of the comment shapes is listed too: `write()` generates a
new one from the comments model.

## See also

- [xlsx-large bundle](../api/bundles/xlsx-large.md)
- [xlsx-full bundle](../api/bundles/xlsx-full.md)
- [xlsx core](../api/xlsx/xlsx.md)
- [smlPivotTables](../api/extra/sml-pivot-tables.md)
- [Extending](./extending.md)
