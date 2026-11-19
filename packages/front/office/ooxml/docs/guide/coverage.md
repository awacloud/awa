# Coverage

**Purpose**: understand what each coverage tier of `@awacloud/ooxml` types, what it only preserves, and which bundle to pick.
**Prerequisites**: none beyond [Getting started](./getting-started.md); the tiers are the core sub-paths (`@awacloud/ooxml/docx`, …) and the bundles (`@awacloud/ooxml/docx-large`, `@awacloud/ooxml/docx-full`, …).

`@awacloud/ooxml` is layered: a core types the structures most documents use and keeps every other element of the parts it models verbatim in `_extras`, and opt-in [`extra/`](../api/extra/README.md) modules name more of the ECMA-376 Part 1 schemas — some type a read through a walker hook, most are toolkits one calls on raw nodes. How much of a real file the package reads and writes back is measured, not estimated: see [Measured coverage](#measured-coverage) below.

## Coverage by schema

| Schema | Spec | Core | + Extras | `extra/` modules |
|--------|-----:|-----:|---------:|------------------|
| `wml.xsd` | 546 | ~80 | 546 | wml-run-formatting, wml-paragraph-formatting, wml-table-properties, wml-numbering-details, wml-settings, wml-fields, wml-tracked-changes, wml-vml-legacy, wml-misc |
| `sml.xsd` | 385 | ~80 | 385 | sml-pivot-tables, sml-calculation, sml-sheet-config, sml-workbook-config, sml-form-controls, sml-misc |
| `pml.xsd` | 210 | ~32 | 210 | pml-animations, pml-transitions, pml-notes, pml-layouts-typed, pml-misc |
| `dml-main.xsd` | 321 | ~56 | 321 | dml-effects, dml-fills-advanced, dml-shapes-advanced, dml-main-misc |
| `dml-chart.xsd` | 220 | 46 | 220 | dml-chart-3d, dml-chart-axes-advanced, dml-chart-data-labels, dml-chart-other-types, dml-chart-trendlines, dml-chart-misc |
| `shared-math.xsd` | 124 | 35 | 124 | math-advanced, math-misc |
| `dml-wp.xsd` | 43 | 6 | 43 | dml-wp-positioning |
| `dml-sp.xsd` (xdr) | 36 | 24 | 36 | dml-xdr-advanced |
| `dml-pic.xsd` | 6 | 6 | 6 | (core only) |
| Part 4 (transitional) | ~50 | 0 | 50 | transitional, legacy-vml |

## What the numbers mean

The `+ Extras` column counts the schema elements that an extra either models or catalogues. It counts what an extra **names** — modelled by a toolkit's parse / render functions, or catalogued —, not what a read types: of all the extras only `wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties`, `wmlSettings` and `dmlWpDrawing` carry a walker hook and type a `docx.read()`; the others are toolkits one calls on raw nodes (see the [bundles README](../api/bundles/README.md)). What a read does not type it keeps verbatim inside the parts the model reads, which the coverage scorecards measure. The six `*-misc` modules (`wml-misc`, `sml-misc`, `pml-misc`, `dml-chart-misc`, `dml-main-misc`, `math-misc`) catalogue the long tail: each element is recognised and flagged `_passthrough: true`, but it has no semantic model, and the column is a count of names, not a conformance measurement. The packages the writers produce use the Transitional namespace URIs (for example `http://schemas.openxmlformats.org/wordprocessingml/2006/main`); the docx reader locates elements by their `w:` prefix and does not consult the namespace URI, so a document whose `w:` prefix is bound to the Strict URI is read the same way, then written back with the Transitional URIs. The `~` values of the `Core` column are estimates of the elements the core types, not measurements; the measured figures (an external validator over the written files, the readers over third-party files) are in [Measured coverage](#measured-coverage) below.

## Choosing a tier

| Need | Import |
|------|--------|
| docx with typed run, paragraph and table properties, settings and drawings | [`docx-large`](../api/bundles/docx-large.md) |
| The above + the VML, custom-geometry, transitional and long-tail toolkits | [`docx-full`](../api/bundles/docx-full.md) |
| xlsx + the pivot, calculation, config and chart toolkits | [`xlsx-large`](../api/bundles/xlsx-large.md) |
| The above + the workbook details and a drawing's text typed in a read, the calculation chain, external links, XML maps, connections, query tables and pivot tables read (`smlWorkbookDetails`, `dmlTextDetails`, `smlPackageParts`) + the form-control, anchor and long-tail toolkits | [`xlsx-full`](../api/bundles/xlsx-full.md) |
| pptx + the animation, transition, notes, layout and chart toolkits | [`pptx-large`](../api/bundles/pptx-large.md) |
| The above + the text details, the part-level elements and the notes, handout and unused layout parts read (`dmlTextDetails`, `pmlPartDetails`, `pmlPackageParts`) + the custom-geometry and long-tail toolkits | [`pptx-full`](../api/bundles/pptx-full.md) |

Each `*-large`/`*-full` bundle is a pure `@awacloud/fw` factory descriptor —
register it (and its declared extras) in a `ModuleRuntime` and resolve
its name; see the [bundles guide](../api/bundles/README.md) for the
exact `registerAll` sequence, including the caveat that most `sml-*` /
`dml-*` / `pml-*` extras expose `parse*`/`render*` helpers only (no
automatic `hydrate*` on `.read()`) — check each bundle's own page for
what it actually auto-wires.

## Extending the coverage

For a missing ECMA-376 element: follow the [extending guide](./extending.md) — create a `src/extra/<name>.js` + its test, wire it into the appropriate bundle, and document it under [`docs/api/extra/`](../api/extra/).

## See also

- [Bundles](../api/bundles/README.md) — ergonomic `large` / `full` compositions
- [Extras](../api/extra/README.md) — opt-in modules
- [Extending guide](./extending.md)
- [CHANGELOG](../../CHANGELOG.md)

<!-- office-scorecard:begin (generated by `bun cli.ts office-scorecard render`; do not edit by hand) -->

## Measured coverage

Generated from `coverage/scorecard.json` (format `office-scorecard/v1`) in the repository, written by the unpublished tool `tools/office-scorecard`. Each figure names its suite and version, the UTC day and the commit measured, and the command that replays it; a figure is what was measured on that suite, not a claim of conformance to a standard. Low results are published as measured.

### Code coverage

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| `bun-coverage-src` bun 1.3.13 | lines 96.08 %, functions 95.70 % (mean of 81 source files) | the coverage gate's model over the declared basis (src/**) | 2026-10-26, `976d3b35e` | `bun cli.ts office-scorecard axis-a --pkg ooxml` |

### Conformance suites

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| `tracked-changes-docx` poi@REL_5_5_1+libreoffice@26.8.0.3 | 78 / 79 | every wild docx whose document, header, footer, footnotes, endnotes or comments part holds a tracked-change element (w:ins, w:del, w:moveFrom, w:moveTo, a *PrChange, w:numberingChange, a move or custom-XML revision range marker, w:cellIns / w:cellDel / w:cellMerge) is read, written with the ooxml-validator round trip and read again; it passes when the count of every such element in those parts is unchanged and the second read's document deep-equals the first's (a model fixed point); a throw fails it | 2026-10-28, `f7d869cb7` | `bun cli.ts office-scorecard axis-b --suite tracked-changes-docx` |
| `tracked-changes-docx-alternate-keep` poi@REL_5_5_1+libreoffice@26.8.0.3 | 79 / 79 | every wild docx whose document, header, footer, footnotes, endnotes or comments part holds a tracked-change element (w:ins, w:del, w:moveFrom, w:moveTo, a *PrChange, w:numberingChange, a move or custom-XML revision range marker, w:cellIns / w:cellDel / w:cellMerge) is read with docx.read(bytes, { alternateContent: 'keep' }) (the save-back read that keeps every mc:AlternateContent, both branches, in place), written from that model as the ooxml-validator round trip writes, and read again with the same option; it passes when the count of every such element in those parts is unchanged and the second read's document deep-equals the first's (a model fixed point); a throw fails it | 2026-10-28, `f7d869cb7` | `bun cli.ts office-scorecard axis-b --suite tracked-changes-docx-alternate-keep` |
| `ooxml-untyped-docx` poi@REL_5_5_1+libreoffice@26.8.0.3 | 97 / 1491 | every wild docx (poi, lo-ooxmlexport, lo-odfexport) is read through docxFullBundle (the core, the large and the full bundles' extras); it passes when the read model keeps no raw XML node in an _extras array (every element typed) and its unmodelledParts lists none of no part (every docx part T60 takes on is read today); a throw fails it | 2026-11-05, `e5beeff05` | `bun cli.ts office-scorecard axis-b --suite ooxml-untyped-docx` |
| `ooxml-untyped-xlsx` poi@REL_5_5_1+libreoffice@26.8.0.3 | 295 / 344 | every wild xlsx (poi, lo-ooxmlexport, lo-ods) is read through xlsxFullBundle (the core, the large and the full bundles' extras); it passes when the read model keeps no raw XML node in an _extras array (every element typed) and its unmodelledParts lists none of the calculation chain, pivot tables and caches, external links, XML maps, connections and query tables; a throw fails it | 2026-11-06, `e5e9a82b0` | `bun cli.ts office-scorecard axis-b --suite ooxml-untyped-xlsx` |
| `ooxml-untyped-pptx` poi@REL_5_5_1+libreoffice@26.8.0.3 | 65 / 476 | every wild pptx (poi, lo-ooxmlexport, lo-pptx) is read through pptxFullBundle (the core, the large and the full bundles' extras); it passes when the read model keeps no raw XML node in an _extras array (every element typed) and its unmodelledParts lists none of the slide layouts, notes masters, handout masters and notes slides; a throw fails it | 2026-11-05, `1a6ddae08` | `bun cli.ts office-scorecard axis-b --suite ooxml-untyped-pptx` |
| `ooxml-saveback-pptx` poi@REL_5_5_1+libreoffice@26.8.0.3 | 77 / 476 | every wild pptx (poi, lo-ooxmlexport, lo-pptx) is read with the core pptx.read and written with pptx.write; it passes when every slide, every layout a slide uses and every master is written back as read (docxProperties.sameElement against the source after markup-compatibility processing, the roots' namespace declarations set aside); a throw fails it | 2026-11-05, `3911a353e` | `bun cli.ts office-scorecard axis-b --suite ooxml-saveback-pptx` |

### Output validity, judged by an external validator

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`ooxml-validator`](https://github.com/mikeebowen/OOXML-Validator/tree/0d58b7bfb0c40a8da2e0ee76005ec17233d77981) OOXML-Validator@2.1.6 | 32 / 32 | OOXML-Validator 2.1.6 (Open XML SDK DocumentFormat.OpenXml 3.2.0, FileFormatVersions.Microsoft365) reports 0 errors (schema, semantic, package, or a package that does not open) for the written file; a round trip (read, then write with the same package) counts only when the validator reports 0 errors for its source too — a source with errors, or one the writer refuses with a typed error, is skipped with the reason; documents: 34 (22 written, 12 round trips); 3 cases not run, each with its reason in the scorecard | 2026-10-24, `a0b028f8d` | `bun cli.ts office-scorecard axis-c --suite ooxml-validator` |
| [`ooxml-validator-tracked-changes`](https://github.com/mikeebowen/OOXML-Validator/tree/0d58b7bfb0c40a8da2e0ee76005ec17233d77981) OOXML-Validator@2.1.6 | 62 / 65 | OOXML-Validator 2.1.6 (Open XML SDK DocumentFormat.OpenXml 3.2.0, FileFormatVersions.Microsoft365) reports 0 errors (schema, semantic, package, or a package that does not open) for the written file; a round trip (read, then write with the same package) counts only when the validator reports 0 errors for its source too — a source with errors, or one the writer refuses with a typed error, is skipped with the reason; documents: 79 (0 written, 79 round trips); 14 cases not run, each with its reason in the scorecard | 2026-10-28, `c9cecc9f0` | `bun cli.ts office-scorecard axis-c --suite ooxml-validator-tracked-changes` |

### Robustness on wild and pathological inputs

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`poi-ooxml`](https://github.com/apache/poi/tree/094968cfc3d48224db08f0b7f0a6fc341b035114/test-data) poi@REL_5_5_1 | 566 / 566 ok | per file, the ooxml reader of the file kind (docx, xlsx including xlsm, pptx) reads it; ok when it returns or throws an error of the package's own hierarchy (OoxmlError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-10-16, `5a94d770a` | `bun cli.ts office-scorecard axis-d --suite poi-ooxml --container` |
| `libreoffice-ooxml` libreoffice@26.8.0.3 | 1759 / 1759 ok | per file, the ooxml reader of the file kind (docx, xlsx including xlsm, pptx) reads it; ok when it returns or throws an error of the package's own hierarchy (OoxmlError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-02, `286387de3` | `bun cli.ts office-scorecard axis-d --suite libreoffice-ooxml --container` |

<!-- office-scorecard:end -->
