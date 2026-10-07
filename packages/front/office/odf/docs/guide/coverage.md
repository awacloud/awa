# Coverage tiers — `@awacloud/odf`

Which ODF elements each maturity tier of `@awacloud/odf` types, and which stay in
the preserve-unknowns `_extras` carry-bag. No prerequisites: this page is a map
of the surface, not a how-to.

`@awacloud/odf` ships its surface in maturity tiers that mirror `@awacloud/ooxml`.
Each tier is exercised by the test suite; later tiers extend (but
do not break) earlier ones via `_extras` slots and opt-in modules.

## Core L0 — minimal `.odt`

- `xml`, `odfErrors`, `pkgMimetype`, `pkgManifest`, `pkgPackage`
- `odfMeta`, `odfSettings`, `odfStyles`
- `textParagraph`, `odt`

Goal: round-trip an empty `.odt` containing a single
`<text:p>Hello, world.</text:p>`.

## Core L1 — enriched ODT

Adds typed headings, lists, sections, bookmarks, fields, tables, draw
frames/images, automatic / page-layout / master-page styles, number
formats. Covers the bulk of real-world `.odt` content produced by
LibreOffice.

## Core L2 — ODS + ODP basics

Adds `ods` (multi-sheet spreadsheets, typed cells, OpenFormula prefix)
and `odp` (slides with placeholders, frames, notes).

## Core L3 — extended coverage

Adds:

- `textTracked` — `<text:tracked-changes>` + inline change markers.
- `drawShape` — typed `draw:rect`, `draw:circle`, `draw:ellipse`,
  `draw:line`, `draw:polyline`, `draw:polygon`, `draw:path`,
  `draw:custom-shape` (with `draw:enhanced-geometry`).
- `chartChart` — `<chart:chart>` root + content.xml helpers.
- `mathMath` — opaque MathML fragment preservation.
- `odpAnimations` — `anim:*` trees + `presentation:transition`.
- `formForms` — `<office:forms>` + typed controls.
- `dr3dScene` — 3D scenes (cube, sphere, extrude, rotate, light).
- `odfMc` — `office:version` introspection.

Goal: 100 % structural roundtrip for the long tail of typed elements
encountered in real documents — without yet typing every attribute.

## L4 — publication-ready (current)

L4 does not change L3's functional surface but consolidates
publication readiness: error codes typed by origin
(`odf/parse-error/<part>`), `ContractError` for API-contract
violations, shared `_shared/*` helpers, name-indexed extension hooks,
a security section in the guide, licensing metadata in
`package.json`/`LICENSE`. The finalisation changes are summarised in the
package [`CHANGELOG.md`](../../CHANGELOG.md) (the working audit documents
of that pass are not shipped).

## Extras (opt-in, already delivered)

29 opt-in modules shipped across four waves (P0/P1/P2/P3) that augment
the core types via `_extras`. Loaded explicitly via `.use(...)`; zero
impact on the core bundle size. See
[`docs/api/README.md`](../api/README.md) for the full list and
[`extending.md`](./extending.md) for the usage pattern.
