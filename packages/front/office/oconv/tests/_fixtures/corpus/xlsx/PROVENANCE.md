# `@awacloud/oconv` xlsx corpus — provenance & licence

> Per-fixture-dir provenance (BATCH_14 `03-sheets-to-ir.md`, task 03). This
> file covers ONLY `tests/_fixtures/corpus/xlsx/` — it does **not** append
> to `tests/_fixtures/corpus/PROVENANCE.md` (that file is BATCH_11 task 02's
> docx/odt corpus, owned by that task). Same durable owner ruling applies
> (`ai/memory/lessons.md`, 2026-07-20): `references/` is documentation, never
> a code dependency — nothing here is read from `references/`.
>
> Recipe followed (`ai/memory/types/office.md`, 2026-07-21, "BATCH_11, corpus
> licensing, reusable recipe"): **licence gate BEFORE content** — the
> repository licence was fetched and read at the pinned commit before any
> candidate file was selected, and the fail-closed rule (pin a commit SHA,
> record repo+SHA+path+URL+date+SHA-256+licence evidence per file) was
> applied identically to BATCH_11's own docx vendoring.

## Source & licence gate

- **Source**: Apache POI `test-data` (`https://github.com/apache/poi`,
  `trunk` branch).
- **Pinned commit**: `0d6d4872c491b1f230f51c6878e57407c60ae697` — the SAME
  commit BATCH_11 pinned for its docx vendoring (`tests/_fixtures/corpus/
  PROVENANCE.md`), reused here for consistency; re-verified reachable and
  unchanged on this tree.
- **Licence evidence, fetched and read at this commit on 2026-07-22**:
  - `legal/LICENSE` → Apache License, Version 2.0 (full text present).
  - `legal/NOTICE` → `Apache POI`, `Copyright 2003-2026 The Apache Software
    Foundation`, attribution to `https://www.apache.org/`.
  - No `LICENSE`/`NOTICE`/`COPYING`/`README` found directly under
    `test-data/` or `test-data/spreadsheet/` (checked via the GitHub
    contents API) — no per-directory exception overriding the repo-wide
    Apache-2.0 grant.
- **Redistribution basis**: Apache-2.0 §4 (verbatim redistribution with
  licence + attribution preserved). Attribution: **Apache POI, Copyright
  2003-2026 The Apache Software Foundation** (`https://www.apache.org/`).
- **Redistribution files**: the POI `legal/NOTICE` and Apache-2.0 licence
  text for this directory live once at the corpus root —
  `../NOTICE-apache-poi` (sha256 `a89ff8b670bcacd3e98ebee64979e0569181c7942e9ad795f4222b25e5637a61`) and `../LICENSE-apache-2.0`
  (sha256 `6e7c918e5a49f677c1b85a9eb2d035cd85c217fc42af6b4a336964a434001a9c`), both from the pinned commit above (see `../PROVENANCE.md`
  §3 and §5). Apache-2.0 §4(a) requires the licence copy, §4(d) the NOTICE
  attributions; the npm tarball excludes `tests/`, the repository/source
  export carries them with these fixtures.
- **Selection criteria**: genuine, non-fuzzer, non-bug-crash Excel-authored
  `.xlsx` documents (rejected every candidate whose name matched
  `clusterfuzz-*`, `poc-*`, `crash-*`, `bug*`, or a bare numeric issue id),
  small, one per structural aspect this task's reader needs to exercise
  (multi-sheet workbook order, a genuine formula with its cached value).

## Vendored files (2)

| File (vendored as) | Upstream path | git blob SHA-1 | Bytes | SHA-256 (vendored bytes) |
|---|---|---|---|---|
| `xlsx/poi-simple-multicell.xlsx` | `test-data/spreadsheet/SimpleMultiCell.xlsx` | `d5dfe7adc3eb0e8228713da69f653f467624c1ef` | 8123 | `119b6e70c5bbca6ca3e46f981e0719c154d87203adb4b5b61210d726deab9f7a` |
| `xlsx/poi-formula-eval.xlsx` | `test-data/spreadsheet/formula-eval.xlsx` | `198c6b5e0724f31303f489160deb6d9aaded97b1` | 8369 | `b82ba9d02f362acd061b4e0018dedc8b59db4c616c8768d89383a0806014eaa8` |

Retrieved 2026-07-22 via
`https://raw.githubusercontent.com/apache/poi/0d6d4872c491b1f230f51c6878e57407c60ae697/test-data/spreadsheet/<name>`.

Content, verified by unzipping and reading `xl/workbook.xml` /
`xl/worksheets/sheet*.xml` on this tree before vendoring:

- **`poi-simple-multicell.xlsx`** — 3 sheets (`Sheet1`/`Sheet2`/`Sheet3`),
  plain numeric staircase grids, no styles/formulas/charts/merges on the
  cells actually populated. Exercises multi-sheet workbook order and plain
  numeric-cell mapping against a real, non-synthetic file.
- **`poi-formula-eval.xlsx`** — 1 sheet (`Sheet1`), 4 cells `A1:D1`
  (`1`, `2.5`, `3.25`, and `D1` a genuine `SUM(A1:C1)` formula with its
  cached value `6.75`). Exercises `sheet/formula-as-value` against a real
  Excel-computed cached result.

**No reader gap was found on either file** — both convert through
`xlsxToIr` without throwing (spot-checked interactively while selecting
these two candidates; the automated corpus-consuming assertions are task
06's `tests/fidelity.integration.test.js`, not this task's).

## Refresh procedure

1. Re-fetch from the pinned commit above if a refresh is ever needed;
   re-run the licence check (fetch+read `legal/LICENSE`+`legal/NOTICE` at
   the new commit, confirm no `test-data/spreadsheet/`-level exception)
   before adding any new candidate.
2. Always re-run `bun test packages/front/office/oconv/` after touching
   anything in this directory.
