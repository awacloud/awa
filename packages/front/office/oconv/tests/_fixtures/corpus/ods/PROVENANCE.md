# `@awacloud/oconv` ods corpus — provenance & licence

> Per-fixture-dir provenance (BATCH_14 `03-sheets-to-ir.md`, task 03). This
> file covers ONLY `tests/_fixtures/corpus/ods/` — it does **not** append to
> `tests/_fixtures/corpus/PROVENANCE.md` (BATCH_11 task 02's docx/odt corpus)
> or to the new `tests/_fixtures/corpus/xlsx/PROVENANCE.md` (this task's own
> xlsx corpus, a separate directory/file). Same durable owner ruling applies
> (`ai/memory/lessons.md`, 2026-07-20): `references/` is documentation, never
> a code dependency — nothing here is read from `references/`.

## Source

**First-party, generated in-repo** via `@awacloud/odf`'s public `ods.write()`
surface — mirrors the `odt/` corpus's own precedent
(`tests/_fixtures/corpus/PROVENANCE.md` §2). No third-party content, no
third-party rights; a real-world `.ods` corpus was not pursued for this
task the same way BATCH_11 found none for `.odt`: Apache POI ships no ODF
test content at all (confirmed again on this tree, `ai/memory/types/
office.md` 2026-07-21), and the LibreOffice `contrib/test-files` source was
already checked and REJECTED (no licence file anywhere in the tree — see
`tests/_fixtures/corpus/PROVENANCE.md` §4) — that finding is format-agnostic
and applies here unchanged, so it was not re-checked.

Generator: `tests/_fixtures/gen-ods-fixtures.js` (one-shot, committed for
provenance only — any future fidelity harness reads the COMMITTED bytes
below and never re-runs it). Regenerate with:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-ods-fixtures.js
```

## Vendored file (1)

| File | Bytes | SHA-256 | Content |
|---|---|---|---|
| `ods/ods-structured.ods` | 2015 | `77b4b766f52fd9a37152ef46b7a6b8fafffc8702dff051ad4381f22401783a18` | 2 sheets: `Data` (1 header row + 2 data rows mixing string/number/boolean/date typed cells, one genuine `table:formula` cell with its cached value, a trailing all-empty row and an all-empty trailing column) and `Empty` (zero rows) |

Generated + committed 2026-07-22.

**Why this content**: exercises `oconvOdsToIr`'s full tier-2 mapping
against one real (if first-party) file — multi-sheet order (`Data` then
`Empty`), `table:table-header-rows` → `row.header`, mixed cell-value
typing, `sheet/formula-as-value`, the shared `sheet-grid.js` trailing-empty
trim (the `Notes` column and the final blank row both disappear), and an
empty sheet inside a multi-sheet workbook (`Empty` emits its heading with
no `table` node). Spot-verified interactively while authoring this
provenance record: converts through `odsToIr` without throwing, `oconvIr.
validate()` reports `ok:true`, and the recorded loss ledger is exactly one
`sheet/formula-as-value` entry (`detail: "Data!R3C2"`) — no other loss
code fires on this file (no styled cell, no merge, no `table:shapes`).
The automated corpus-consuming assertions, if any, are a later task's
fidelity harness — not this task's own reader unit tests (`src/read/
ods-to-ir.test.js`), which hand-build every fixture via `ods.write()`/
`ods.read()` directly, per the `odt-to-ir.test.js` precedent.

## Refresh procedure

1. Re-run `bun packages/front/office/oconv/tests/_fixtures/
   gen-ods-fixtures.js`, recompute the SHA-256, update this file. **Not**
   byte-identical across regenerations in general (the ods writer shares
   `@awacloud/fw`'s zip writer with docx/odt — GAP-OOXML-4,
   `tests/_fixtures/corpus/PROVENANCE.md` §2 — a wall-clock DOS date/time
   is stamped unless the caller threads an explicit `mtime`, which this
   generator does not).
2. Always re-run `bun test packages/front/office/oconv/` after touching
   anything in this directory.
