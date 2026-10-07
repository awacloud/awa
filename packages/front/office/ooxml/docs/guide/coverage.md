# Coverage

**Purpose**: understand what each coverage tier of `@awacloud/ooxml` types, what it only preserves, and which bundle to pick.
**Prerequisites**: none beyond [Getting started](./getting-started.md); the tiers are the core sub-paths (`@awacloud/ooxml/docx`, …) and the bundles (`@awacloud/ooxml/docx-large`, `@awacloud/ooxml/docx-full`, …).

`@awacloud/ooxml` types or preserves every element of the ECMA-376 Part 1 schemas through a layered architecture: a stable core (~95% of real-world usage, an estimate) plus opt-in [`extra/`](../api/extra/README.md) modules that promote elements from the `_extras` fallback to typed fields.
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

The `+ Extras` column counts the schema elements that an extra either models or catalogues. The six `*-misc` modules (`wml-misc`, `sml-misc`, `pml-misc`, `dml-chart-misc`, `dml-main-misc`, `math-misc`) catalogue the long tail: each element is recognised, flagged `_passthrough: true` and preserved on a round trip, but it has no semantic model. "Full" coverage therefore means every element is either typed or preserved, not that every element has a semantic model, and it is not a conformance measurement. The packages the writers produce use the Transitional namespace URIs (for example `http://schemas.openxmlformats.org/wordprocessingml/2006/main`); the docx reader locates elements by their `w:` prefix and does not consult the namespace URI, so a document whose `w:` prefix is bound to the Strict URI is read the same way, then written back with the Transitional URIs. The "~95%" figures below are an estimate of real-world usage, not a measurement.

## Choosing a tier

| Need | Import |
|------|--------|
| ~95% real-world docx | [`docx-large`](../api/bundles/docx-large.md) |
| Every docx element typed or preserved (VML, custGeom, transitional) | [`docx-full`](../api/bundles/docx-full.md) |
| ~95% real-world xlsx | [`xlsx-large`](../api/bundles/xlsx-large.md) |
| Every xlsx element typed or preserved (form controls, advanced anchors) | [`xlsx-full`](../api/bundles/xlsx-full.md) |
| ~95% real-world pptx | [`pptx-large`](../api/bundles/pptx-large.md) |
| Every pptx element typed or preserved (custGeom, …) | [`pptx-full`](../api/bundles/pptx-full.md) |

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
