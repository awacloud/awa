---
module: oconvXlsxToIr
category: oconv/read
dependencies: [oconvIr, xlsx]
returns: object
worker-safe: true
status: complete
---

# oconvXlsxToIr

> `.xlsx` (`@awacloud/ooxml`'s `xlsx.read()` result) → `oconv-ir/v1`, tier 2 — one heading + one table per sheet.

**Module** `oconvXlsxToIr` (`oconvXlsxToIr`) | **Source** `packages/front/office/oconv/src/read/xlsx-to-ir.js` | **Deps** `oconvIr`, `xlsx` | **Worker-safe** yes

Pure transformation over an already-parsed `xlsx.read(bytes)` structure. Composes only `xlsx`'s public API, never an `@awacloud/ooxml` internal.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const xlsx = runtime.resolve('xlsx');
const { xlsxToIr } = runtime.resolve('oconvXlsxToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `xlsxToIr` | `(readResult: object, opts?: object) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` | — |

## Examples

### Convert an `.xlsx` read result to IR

```js
const { ir, losses } = xlsxToIr(xlsx.read(bytes));
ir.kind;   // 'document'
losses;    // [] on a plain grid with no formulas/styles/merges/charts
```

## Notes

- One IR `heading{level:1}` + one IR `table` per workbook sheet, in workbook order — the heading is always level 1 (sheets carry no nesting signal to derive a deeper level from).
- The sheet's row grid is padded to its widest row, then trailing all-empty rows/columns are trimmed (`normalizeGrid`, mirrored from `read/sheet-grid.js`); a sheet whose trimmed grid has zero rows emits its heading only.
- No `row.header` is ever set — xlsx carries no first-class header-row concept (contrast `oconvOdsToIr`, whose `table:table-header-rows` is a real signal).
- **`opts.sheets`** (`toMd`'s `sheets` input): `'table'` (default) maps each sheet to a GFM table as above; `'csv'` or `'tsv'` writes the same normalised grid as one `codeBlock` (`info` `csv` / `tsv`) under the sheet's heading — RFC 4180 quoting for csv; for tsv a cell's backslash, tab, LF and CR written as two-character escapes, recorded once per sheet as `sheet/tsv-escaped`. Another value throws `oconv: bad sheets`.
- **`opts.cellBudget`** (`toMd`'s `sheetCellBudget` input): a positive safe integer, else `oconv: bad cell budget`. A sheet whose padded table (its kept rows times its kept columns, found from the row lengths without padding) would hold more cells is never padded: under `'table'` one `paragraph` per non-empty cell, `<A1 address>: <text>`, in row then column order; under `'csv'` / `'tsv'` its rows unpadded. Recorded `sheet/sparse-form` (the sheet name, the padded and the kept cell counts). Without it every sheet is padded as above.
- Loss codes this module emits: `sheet/formula-as-value` (a formula cell reduced to its cached value), `sheet/format-dropped` (once per sheet, first styled cell), `sheet/merge-dropped` (once per sheet, when any merge exists), `sheet/chart-dropped` (once per sheet, first drawing carrying a chart).
- Pivot tables are a matrix-level, permanently out-of-scope drop — this reader's frozen dependency list never wires the opt-in pivot-table extension, so a pivot table is structurally invisible on the `readResult` it receives; never reported per node.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconvOdsToIr`](./ods-to-ir.md) — the ODF sister reader, same loss vocabulary
- [loss matrix](../../loss-matrix.md)
