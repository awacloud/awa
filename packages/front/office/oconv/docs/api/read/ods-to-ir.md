---
module: oconvOdsToIr
category: oconv/read
dependencies: [oconvIr, ods]
returns: object
worker-safe: true
status: complete
---

# oconvOdsToIr

> `.ods` (`@awacloud/odf`'s `ods.read()` result) → `oconv-ir/v1`, tier 2 — one heading + one table per `<table:table>`.

**Module** `oconvOdsToIr` (`oconvOdsToIr`) | **Source** `packages/front/office/oconv/src/read/ods-to-ir.js` | **Deps** `oconvIr`, `ods` | **Worker-safe** yes

Pure transformation over an already-parsed `ods.read(bytes)` structure, composing `@awacloud/odf`'s public surface only — same contract and loss vocabulary as `oconvXlsxToIr`, mirroring the docx/odt sister-pair pattern.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const ods = runtime.resolve('ods');
const { odsToIr } = runtime.resolve('oconvOdsToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `odsToIr` | `(readResult: object, opts?: object) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` | — |

## Examples

### Convert an `.ods` read result to IR

```js
const { ir, losses } = odsToIr(ods.read(bytes));
ir.kind;   // 'document'
// measured on the vendored ods-structured.ods fixture:
// [{code:'sheet/formula-as-value', detail:'Data!R3C2'}]
```

## Notes

- One IR `heading{level:1}` + one IR `table` per `<table:table>`, in document order.
- Unlike xlsx, `table:table-header-rows` IS a real public signal — the corresponding leading rows of the trimmed grid get `row.header: true`.
- Cell text uses the typed `office:value-type` string when present, otherwise the cell's raw paragraph children are text-extracted; a `<table:covered-table-cell>` always contributes `''`.
- `table:number-rows-repeated` / `table:number-columns-repeated` are expanded, capped at 1000 (`MAX_REPEAT`) as a documented safety bound — real content repeats stay far below it, and a trailing "rest of the sheet is empty" repeat is trimmed away regardless by the same grid-normalisation step `oconvXlsxToIr` uses.
- Loss codes this module emits: `sheet/formula-as-value`, `sheet/format-dropped` (once per sheet, first cell carrying a `styleName`), `sheet/merge-dropped` (once per sheet, first cell with `colSpan`/`rowSpan` > 1), `sheet/chart-dropped` (once per sheet, when the table carries a `table:shapes` extra).
- Pivot tables are a matrix-level, permanently out-of-scope drop, same treatment as `oconvXlsxToIr`.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconvXlsxToIr`](./xlsx-to-ir.md) — the OOXML sister reader, same loss vocabulary
- [loss matrix](../../loss-matrix.md)
