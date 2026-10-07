# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] - 2026-10-07

### Added

- **Core package container (L0)** — `pkgPackage`, `pkgManifest`,
  `pkgMimetype` read / write ZIP-based ODF packages, enforcing the
  `mimetype`-first-STORED convention and parsing
  `META-INF/manifest.xml`. Namespace URIs, the `ODF_VERSION` constant,
  XML declaration variants and the frozen MIME table (`CT.ODT/.ODS/
  .ODP/.XML/.FORMULA`) are centralized in the shared `odfShared`
  factory (see below) rather than duplicated per module.
- **Typed errors** — the `odfErrors` factory exposes `OdfError`,
  `ParseError`, `RenderError`, `ContractError` and `isOdfError`;
  consumers resolve it via `runtime.resolve('odfErrors')` or
  `odfErrors.factory()` in tests. Error codes are namespaced by origin
  (`odf/parse-error/<part>` — `/odt`, `/ods`, `/odp`, `/manifest`,
  `/meta`, `/settings`, `/styles`, `/mimetype`, `/pkg`, `/chart`,
  `/math`, `/limit`), and API/contract violations (`odt.write(null)`,
  `pkg.write({})` without mimetype, `pkgMimetype.parse`/`render` with
  bad input, …) raise `ContractError('odf/contract-error/<module>', …)`
  instead of `ParseError`. All raised errors carry a rich
  `context: { part, module, ... }` and preserve `cause`.
- **Metadata / settings / styles** — `odfMeta` parses / renders
  `meta.xml` (`<office:document-meta>` → `<office:meta>` carrying
  `dc:title`, `dc:creator`, `dc:date`, `meta:generator`,
  `meta:initial-creator`, `meta:creation-date`, preserve-unknowns for
  the rest). `odfSettings` parses / renders `settings.xml`, preserving
  `<config:config-item-set>` children as raw element nodes.
  `odfStyles` parses / renders `styles.xml` with the three standard
  buckets (`office:styles`, `office:automatic-styles`,
  `office:master-styles`) as raw element node arrays.
- **Text (L0/L1)** — `textParagraph` types `<text:p>` / `<text:span>`
  plus `text:s`, `text:tab`, `text:line-break` run kinds. `textHeading`
  (`<text:h>` + `outlineLevel`), `textList` (`<text:list>` +
  `<text:list-item>`, incl. nested lists), `textSection`
  (`<text:section>`), `textBookmarks` (inline `<text:bookmark*>` /
  `<text:reference-mark*>`), `textFields` (`<text:date>`,
  `<text:page-number>`, `<text:variable-*>`, `<text:bookmark-ref>` +
  twelve other inline field elements), `textContent` (body
  orchestrator: `parseBody`, `renderBody`, `bodyText`).
- **Table (L1)** — `tableCell` (typed value/formula/spans/repeated;
  the opt-in `maxRepeat` option of `parseCell` raises
  `ParseError('odf/parse-error/limit')` when `table:number-columns-repeated`
  exceeds the ceiling), `tableRow` (cells + repeated, same option on
  `parseRow`), `tableTable` (columns, header rows, rows).
- **Draw (L1)** — `drawImage` (`<draw:image>` + magic-byte sniffer for
  PNG/JPEG/GIF/BMP/WebP/TIFF/SVG) and `drawFrame` (`<draw:frame>`
  wrapping image / text-box / object children).
- **Style (L1)** — `styleAutomatic` (typed `<office:automatic-styles>`
  with per-family property bags), `stylePageLayout`
  (`<style:page-layout>` + header/footer styles), `styleMasterPage`
  (`<style:master-page>` with header/footer/header-left/footer-left
  preserved as raw XML).
- **Number (L1)** — `numberFormats` parses / renders date / time /
  number / currency / percentage / boolean / text styles, preserving
  ordered typed `parts`.
- **`.odt` orchestrator** — the `odt` factory composes the stack to
  read / write a complete `.odt` package (`mimetype` STORED +
  `META-INF/manifest.xml` + `content.xml` + `styles.xml` + `meta.xml`
  + `settings.xml`), exposing `read`, `write`, `empty`, `paragraph`,
  `fromText`, `toText`. The body consumes `textContent`: `read()`
  returns mixed typed nodes (paragraphs / headings / lists / sections /
  soft-page-breaks / `unknown`), `toText()` walks them recursively.
- **ODS (L2)** — `spreadsheet` types `<office:spreadsheet>` as
  `{ tables, namedExpressions?, dataValidations?, _extras? }` (named
  expressions and content validations preserved as raw XML). `ods` is
  the `.ods` orchestrator (mimetype
  `application/vnd.oasis.opendocument.spreadsheet`), exposing `read`,
  `write`, `empty`, `sheet`, `fromArrays`, `cell`, `toText`, `CT_ODS`.
  `tableCell` gained typed `office:value-type` support for `float` /
  `percentage` / `currency` / `date` / `time` / `boolean` / `string`
  with the matching `office:value` / `office:date-value` /
  `office:time-value` / `office:string-value` / `office:boolean-value`
  / `office:currency` attrs; `table:formula` preserves the OpenFormula
  `of:=…` prefix transparently.
- **ODP (L2)** — `presentationStyle` types `<presentation:placeholder>`
  and `<presentation:notes>` (basic; animations/transitions deferred to
  L3). `slide` types `<draw:page>` as `{ name, masterPageName?,
  styleName?, layoutName?, frames, notes?, _extras? }`. `odp` is the
  `.odp` orchestrator (mimetype
  `application/vnd.oasis.opendocument.presentation`), exposing `read`,
  `write`, `empty`, `slide`, `fromSlides`, `toText`, `CT_ODP`.
- **L3 core surface** — `textTracked` (`<text:tracked-changes>`
  container: `changed-region` × { `insertion` | `deletion` |
  `format-change` } with `office:change-info`, plus inline
  `text:change`/`text:change-start`/`text:change-end` markers).
  `drawShape` (typed `draw:rect`, `draw:circle`, `draw:ellipse`,
  `draw:line`, `draw:polyline`, `draw:polygon`, `draw:path`,
  `draw:custom-shape` with optional `draw:enhanced-geometry`).
  `chartChart` (`<chart:chart>` root parser/renderer preserving
  title/subtitle/legend/plot-area, axes, series, data-points, plus
  `bytesOf`/`parseBytes` for the chart content.xml sub-document).
  `mathMath` (opaque passthrough for embedded MathML `<math:math>` +
  `bytesOf`/`parseBytes`). `odpAnimations` (recursive parse/render for
  `anim:*` trees — `par`, `seq`, `set`, `animate`, `animateColor`,
  `animateMotion`, `animateTransform`, `transitionFilter`, `audio`,
  `command`, `iterate`, `param` — plus `parseTransition`/
  `renderTransition` for `presentation:transition`). `formForms`
  (`<office:forms>` container with the typed `form:*` control set:
  button, text, checkbox, listbox, combobox, radio, date, time, file,
  hidden, image-frame, formatted-text, fixed-text, password, textarea,
  generic-control, value-range, column, grid, item, option, properties,
  property, list-property, connection-resource). `dr3dScene`
  (`<dr3d:scene>` with typed lights and `dr3d:cube`/`dr3d:sphere`/
  `dr3d:extrude`/`dr3d:rotate`). `odfMc` (markup-compatibility helpers
  `versionOf`, `meetsVersion`, and a `process` no-op mirroring OOXML's
  `markupCompatibility.process` for future stripping/promotion logic).
- **Extension hook `.use()`** — one walker module per top-level
  orchestrator (`odtWalker`, `odsWalker`, `odpWalker`), each exposing
  `createWalker()` → `{ use, applyHydrate, applyDehydrate,
  hasExtensions }`. The `odt`/`ods`/`odp` factories wire the walker
  into `read()` (post-parse hydrate) and `write()` (pre-render
  dehydrate) and expose `.use(...extensions)` for idempotent
  registration of opt-in extras. Hook surface: `hydrate*`/`dehydrate*`
  for `Paragraph`, `Span`, `Heading`, `List`, `Table`, `Cell`, `Frame`,
  `Slide`, plus `Metadata`, `Settings`, `Styles`. The three walkers
  share their dispatch/indexing engine via the `odfWalker` factory (see
  below) instead of duplicating ~100 LOC each; the hook index is keyed
  by hook name and rebuilt lazily after each `use(...)`, so on a
  `*-full` bundle (≈29 extensions, ~10 000 paragraphs) the dispatch
  table only holds extensions that actually implement the requested
  hook.
- **Coverage extras — P0** (typed, always shipped in the `*-large`
  bundles): `textTrackedChanges` (`text:tracked-changes`,
  `text:changed-region`, `text:insertion`, `text:deletion`,
  `text:format-change` + inline change markers), `textFieldsExtended`
  (`text:variable-*`, `text:user-field-*`, `text:sequence-decl`,
  `text:expression`, `text:database-*`, `text:hidden-*`,
  `text:conditional-text`, `text:placeholder`, `text:execute-macro`,
  `text:dde-connection*`, `text:meta-field`), `textListDetailed`
  (`text:list-style`, `text:list-level-style-*`, `text:outline-style`,
  `text:outline-level-style`, `text:list-header`), `tableAdvanced`
  (`table:table-template`, `table:database-range`, `table:filter*`,
  `table:scenario`, `table:sort*`, `table:data-pilot-*` recursive
  tree), `stylePage` (`style:page-layout`,
  `style:page-layout-properties`, `style:master-page`,
  `style:header(-left|-first)?`, `style:footer(-left|-first)?`,
  `style:background-image`, `style:column*`, `style:footnote-sep`,
  `style:layout-grid-properties`), `stylePropertiesTyped` (promotes a
  curated subset of attrs on every `style:*-properties` element into
  typed fields, unknown attrs preserved), `drawShapes` (`draw:rect`,
  `draw:circle`, `draw:ellipse`, `draw:line`, `draw:polyline`,
  `draw:polygon`, `draw:path`, `draw:regular-polygon`,
  `draw:connector`, `draw:caption`, `draw:measure`, `draw:control`,
  `draw:custom-shape` with `draw:enhanced-geometry` + `draw:equation` +
  `draw:handle`, `draw:contour-*`), `presentationTyped`
  (`presentation:placeholder`, `presentation:notes`,
  `presentation:settings`, `presentation:show*`, `presentation:hide*`,
  `presentation:dim`, `presentation:play`,
  `presentation:event-listener(s)?`, `presentation:sound`,
  `presentation:date-time(-decl)?`, `presentation:footer(-decl)?`,
  `presentation:header(-decl)?`, `presentation:animations`,
  `presentation:transition`).
- **Bundles `*-large`** — `@awacloud/odf/odt-large` (core odt + the 7 P0
  odt-relevant extras, descriptor `odtLargeBundle`),
  `@awacloud/odf/ods-large` (core ods + the 6 P0 ods-relevant extras,
  `odsLargeBundle`), `@awacloud/odf/odp-large` (core odp + the 6 P0
  odp-relevant extras, `odpLargeBundle`). Each `*-large` bundle leaves
  P1/P2/P3 extras out; the descriptors replaced earlier imperative
  `build*` helpers (see Removed).
- **Coverage extras — P1** (deep complementary typing): `textMetaExtended`
  (`text:meta`, `text:meta-field`, `text:rdf-metadata` + paragraph RDFa
  attrs), `textSectionsAdvanced` (`text:section-source`,
  `text:section-decl`, `text:dde-connection` + protection attrs),
  `textTocIndex` (every ODF index family — TOC, alphabetical, user,
  object, illustration, table, bibliography — + all
  `*-source`/`*-entry-template`/`index-title-template`/`index-body`
  children), `drawImageExtended` (`draw:area-*`, `draw:image-map`,
  `draw:gradient/hatch/fill-image/opacity/marker/stroke-dash`,
  `draw:layer*`, `draw:applet/plugin/floating-frame/object/object-ole`),
  `chartTyped` (deep `chart:*` tree: title, subtitle, footer, legend,
  plot-area, axis, categories, grid, series, domain, data-point,
  mean-value, regression-curve, error-indicator,
  stock-gain/loss/range, wall/floor, label-separator, equation,
  data-label), `animationsSmil` (typed `anim:*` — par, seq, iterate,
  audio, command, set, animate, animateColor, animateMotion,
  animateTransform, transitionFilter, param), `formsControls` (typed
  full `form:*` control set, ~30 controls + properties +
  event-listener), `numberFormatExtended` (typed `number:*`
  sub-elements: number, scientific-number, fraction, currency-symbol,
  all date/time/boolean sub-elements), `metaExtended` (full
  `meta:*`/`dc:*` set in `<office:meta>`: generator, initial-creator,
  creation-date, document-statistic, user-defined, keyword,
  editing-cycles, editing-duration, …), `mathMathml` (typed
  `<math:math>` passthrough + manifest wiring helpers, MathML body kept
  as raw XML).
- **Coverage extras — P2** (secondary domains): `dr3d3d` (deeper typing
  of `dr3d:scene/cube/sphere/extrude/rotate/light`), `databaseSources`
  (`db:*`, ~50 elements, typed passthrough via the shared
  `odfTypedHelper`), `settingsExtended` (deeper typing of
  `config:config-item*`), `scriptMacros` (typed `office:scripts/script`
  + `office:event-listeners` + `script:event-listener`),
  `dsigSignatures` (typed `dsig:document-signatures` + raw XML-DSig
  body preservation + `META-INF/documentsignatures.xml` manifest entry
  helper).
- **Coverage extras — P3** (catch-all `_passthrough: true`):
  `textMisc`, `styleMisc`, `drawMisc`, `tableMisc`, `officeMisc`
  (residual `text:*`/`style:*`/`draw:*`/`table:*`/`office:*` not
  covered by P0/P1), `legacyStaroffice` (preserves any element with a
  StarOffice 5.x/6.x namespace prefix — `so:`, `so20:`, `so52:`,
  `ooo:`, `ooow:`, `oooc:` — as `_legacy: true`).
- **Bundles `*-full`** — `@awacloud/odf/odt-full` (`odt-large` + the 17
  odt-relevant P1/P2/P3 extras, descriptor `odtFullBundle`),
  `@awacloud/odf/ods-full` (`ods-large` + the 16 ods-relevant P1/P2/P3
  extras, `odsFullBundle`), `@awacloud/odf/odp-full` (`odp-large` + the 18
  odp-relevant P1/P2/P3 extras, `odpFullBundle`).
- **Shared helper factories** — `odfShared` (deps `['odfErrors',
  'xml']`) centralizes the canonical ODF namespace map (`ODF_NS`, 24
  frozen URIs), `ODF_VERSION`, the XML declaration variants
  (`XML_DECL`, `XML_DECL_STANDALONE`), the frozen MIME table, the
  singleton-backed UTF-8 codec (`encodeText`/`decodeText`), and the
  stateless helpers `parseXmlOrThrow`, `readSidecars`, `writeSidecars`,
  `findDeep`, `intAttr`, `boundedIntAttr`. `odfWalker` (deps `[]`)
  exposes `createWalker(config)`, the shared engine behind the three
  format walkers. `odfMiscHelper` (deps `['xml']`) exposes
  `buildMiscPassthrough(elementNames, ns)`; `odfTypedHelper` exposes
  `buildTypedFamily(elementNames, ns, typeTag)` — both promoted from
  dead ESM helpers (`src/extra/_misc-helper.js`/`_typed-helper.js`,
  shipped but never imported) to worker-safe factories, with the
  legacy named exports preserved for direct importers. `src/main.js`
  re-exports all four; `odfShared` and `odfWalker` are registered through
  `modules[]`, the two helper factories through `extras[]`.
- **Pre-built single-factory bundles — two-surface `dist/`.**
  `tools/generate-bundles.mjs` (`bun run gen:bundles`, a thin wrapper
  around `@awacloud/tool-prebuild-generator`) emits, per assembly root (9 :
  `odt`/`odt-large`/`odt-full` and the same for `ods`, `odp`), two
  path-discriminated surfaces side by side under `dist/` :
  `dist/standalone/<root>.{js,min.js,meta.json}` (`dependencies: []`,
  every fw + odf-local factory inlined, zero runtime registration) and
  `dist/build/<root>.{js,min.js,meta.json}` (declares the 6 fw modules
  — `xml`, `bitstream`, `huffman`, `deflate`, `zip`, `crc32` — as
  dependencies, inlines only the odf-local factories, smallest
  payload). Each `.js` has a minified `.min.js` twin and a
  `.meta.json` sidecar (`fwDependencies`, source `modules`, byte
  sizes); `dist/build/index.js` is a barrel re-exporting the whole
  `@awacloud/odf` namespace for bulk registration on an `@awacloud/fw` runtime.
  Both surfaces expose a single factory call returning the same
  enriched core orchestrator as the legacy declarative `*Bundle`
  descriptors, under the resolve keys `<root>Bundled` (standalone) /
  `<root>Package` (build) — e.g. `odtLargeBundled` / `odtLargePackage`
  — unchanged from the retired generated-descriptor layout (see
  Removed). `package.json` exposes `./build/*` and `./standalone/*`.
  Documented in `docs/api/bundles/prebuilt/README.md`. Output is
  byte-deterministic (see Changed — Dist).
- **Documentation** — `docs/README.md` top-level index; `docs/api/`
  one page per source module (YAML frontmatter: module / category /
  dependencies / returns / worker-safe / status), including the pages
  under `docs/api/extra/*`, the bundle pages
  (`docs/api/bundles/od{t,s,p}-{large,full}.md`) plus a reference for the two
  shared factories (`docs/api/_shared/README.md`); `docs/guide/`
  guides — getting-started (incl. an added security section on XML
  parsing, see Security below), read-write-odt, pkg-overview,
  read-write-ods, read-write-odp, coverage (maturity tiers). The L3 audit (P0/P1/P2/P3
  breakdown) and the L3 → L4 finalisation report (15 items across
  risks/perf/errors/maintainability) were working documents and are not
  shipped; see Changed below for the net result.
- **Tests + integration** — the suite grew from the initial **108
  unit tests** (14 files, 334 assertions) at L0 through the L2 (ODS/ODP
  parse/render/roundtrip/error suites) and L3 (58 new unit tests across
  the eight new modules, extended roundtrip + fuzz coverage, shared
  test helpers exposing `tracked`/`shape`/`chart`/`math`/`forms`/
  `dr3d`/`mc` instances) additions to **483 pass / 0 fail across 87
  files** after the L3 → L4 finalisation and dedup passes. Coverage includes a roundtrip
  integration test wired through fw's `ModuleRuntime`
  (`tests/roundtrip.integration.test.js` — ODT paragraphs/headings/
  lists/sections, 2-sheet ODS with formula + typed values, 3-slide ODP
  with placeholders/notes, tracked-changes + `draw:rect`/
  `draw:custom-shape` + `chartChart`/`mathMath` + `anim:par` +
  `<office:forms>` + `dr3d:scene` survival) and a fuzz/malformed-input
  suite (`tests/fuzz.test.js` — typed `ParseError` on garbage/empty/
  corrupt input and bad-mimetype/missing-`content.xml`/
  `write(undefined)` for every module through L3).
- **Architecture** — mirrors the architecture of `@awacloud/ooxml`
  (same factory pattern, file layout, test/doc conventions, error
  hierarchy shape); layered architecture (stable L0 core with room for
  L1+ extensions); preserve-unknowns (every typed parser keeps
  unrecognised attributes/children in `_extras` for roundtrip
  fidelity); factory pattern (`{ name, dependencies, factory }`)
  compatible with
  `@awacloud/fw` `ModuleRuntime` DI; worker-safe (each factory is
  self-contained, no closure on mutable module-level state);
  browser-only (`Uint8Array`, `TextEncoder`, `TextDecoder` only); zero
  external dependency beyond `@awacloud/fw` (workspace).
- **Package surface** — sub-path exports grew across the maturity
  levels: L0 shipped 3 (`.` → `src/main.js`; `./odt` → `.odt`
  orchestrator; `./pkg` → ODF container); L2 added `./ods` and `./odp`
  (`awa.maturity: "L2"`); L3 added `./chart`, `./math`, `./form`,
  `./dr3d` (`awa.maturity: "L3"`). The full current map (also `./errors`,
  `./text`, `./table`, `./draw`, the `*-large` / `*-full` bundles,
  `./extra/*`, `./bundles/*`, `./build/*`, `./standalone/*`) is the
  README table "Exposed sub-paths".
- **Typed presentation capability** — a
  consumer can now produce a presentable `.odt` without authoring ODF XML.
  (a) `odfStyles.serialize` accepts typed named-style SPECS
  (`{ name, family, displayName?, parentStyleName?, nextStyleName?,
  defaultOutlineLevel?, class?, properties?, _extras? }`) in its three
  buckets next to raw elements (raw entries stay byte-identical), through
  the new public `odfStyles.namedStyle(spec)`; a missing/non-string
  `name`/`family` raises `ContractError('odf/contract-error/styles')`;
  `parse` stays raw. (b) Body-table grid seam: a `textContent` `table` node's
  `grid: true` renders through the new `textStyleRegistry` registry members
  `cellStyle({bordered: true})` → `awa-c-b` (`table-cell`, `fo:border`
  `0.5pt solid #000000`, `fo:padding` `0.097cm`) and
  `tableStyle({align: 'margins'})` → `awa-tb-m` (`table:align="margins"`),
  explicit `styleName`s winning; on read the new resolver members
  `cellBorders` / `tableAlign` recognise it back (honesty rule: fully mapped
  or `null`), restoring `grid: true` and consuming the auto styles, so
  `odt.read(odt.write({ body: [gridTable] })).autoStyles` is `undefined`.
  (c) Every generated `text:list-style` level (1..10, bullet and number)
  carries one label-alignment `style:list-level-properties` child
  (`fo:margin-left` / tab stop `1.27cm` … `6.985cm`, `fo:text-indent`
  `-0.635cm`) — no forced bullet font. Committed `dist/**` bundles
  regenerated.
- **Bounded ZIP reading** — `read(bytes, opts)` caps on `pkgPackage` and
  on the `odt`, `ods` and `odp` facades, and the frozen
  `pkgPackage.DEFAULT_LIMITS` (see Security).
- **Typed images** — a typed `image` paragraph run and `doc.pictures`.
- **Slide text** — `slide.slideText`.
- **Namespace declarations** — `odfShared.ODF_PREFIXES` (frozen prefix to
  URI table), `odfShared.sourceNamespaces(sourcePkg, partPath)` and
  `odfShared.declareNamespaces(rootEl, opts?)`; `odfStyles.serialize`,
  `odfMeta.serialize` and `odfSettings.serialize` accept `(model, opts?)`
  with `opts.namespaces`; `writeSidecars` forwards the source parts'
  declarations.

### Changed

- **API reference and source comments describe each opt-in module by what it
  covers** — internal milestone labels are removed from the `extra/` module
  comments and the ODT guide.
- **Dist** — dist regenerated with the licence banner: every committed
  `dist/**/*.js` / `.min.js` opens with the row's `/*! … */` legal block
  (content from `docs/publication/license-matrix.json`), each `*.meta.json`
  `bytes` entry is measured on the final bytes, and the `builtAt` timestamp
  is gone — `bun run gen:bundles` is now byte-deterministic.
- **Documentation pass** — the README now follows the published-package
  skeleton (every `exports` key has a row in "Exposed sub-paths", identity
  values read from `package.json`) and states how `odt.read()` resolves
  styles; the Quick Start and the getting-started guide register
  `fw_require` (the former snippets omitted the `xml` module and failed to
  resolve `odt`); the guides open with their purpose and prerequisites; the
  package-local working notes and audit pages are no longer part of the
  package, and this changelog no longer cites them.
- **Package contents** — the npm tarball now ships `NOTICE` (dual licence +
  third-party attributions) next to `LICENSE`.
- **Shared-helper deduplication** — the `odfShared` and `odfWalker`
  factories (see Added) replaced ~210 LOC of duplicated boilerplate
  across `pkg/*` (mimetype constants, `parseXmlOrThrow`, namespaces,
  codec singletons), `meta/settings/styles`, the three `.odX`
  orchestrators, the three format walkers, `chart`/`math`, and
  `table/cell`+`table/row`; a second pass through `odfMiscHelper`/
  `odfTypedHelper` removed a further ~380 LOC across 5 misc extras
  (`textMisc`, `styleMisc`, `officeMisc`, `drawMisc`, `tableMisc`) and 7
  typed extras (`chartTyped`, `animationsSmil`, `dr3d3d`,
  `formsControls`, `textSectionsAdvanced`, `textTocIndex`,
  `drawImageExtended`). `database-sources.js` was refactored to a thin
  shell over `odfTypedHelper.buildTypedFamily(ELEMENTS, 'db:',
  'db-node', { passthrough: true })`. Public output APIs are unaffected —
  the factory *signatures* of the refactored modules changed
  (breaking for direct `factory(...)` callers, transparent for DI
  consumers registering via `runtime.register(...)`):

  | Module | Old signature | New signature |
  |---|---|---|
  | `pkgMimetype` | `factory(errors)` | `factory(errors, shared)` |
  | `pkgManifest` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `pkgPackage` | `factory(errors, zip, ...)` | `factory(errors, shared, zip, ...)` |
  | `odfMeta` / `odfSettings` / `odfStyles` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `tableCell` / `tableRow` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `chartChart` / `mathMath` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `odt` / `ods` / `odp` | `factory(errors, pkg, xml, ...)` | `factory(errors, shared, pkg, xml, ...)` |
  | `odtWalker` / `odsWalker` / `odpWalker` | `factory()` | `factory(odfWalker.factory())` |
  | `databaseSources` | `factory(xml)` | `factory(odfTypedHelper.factory(xml))` |

- **Worker-safe factories.** Every factory in the package was made
  serializable and usable in a Worker: module-level constants
  (`Set`/`Map`/regex/tables) and utility helpers previously declared
  outside a factory body and referenced from it were moved or inlined
  inside each consuming factory (36 files across the source tree).
  The helper modules (`src/_shared/index.js`, `src/extra/_misc-helper.js`,
  `src/extra/_typed-helper.js`) remain exported for their sibling tests, but
  their logic is duplicated inside every consuming factory; the error classes
  (`ParseError`/`RenderError`/`ContractError`/`OdfError`) stayed
  imported at module level to preserve the class identity expected by
  `expect(...).toThrow(ParseError)` in tests. No regression: 483 tests
  passed at the end of this pass.
- **Modular error handling.** `errors.js` no longer exports
  `OdfError`/`ParseError`/`RenderError`/`ContractError` at the top
  level — the classes are declared inside the `odfErrors` factory body,
  which returns `{ OdfError, ParseError, RenderError, ContractError,
  isOdfError }`. Every consumer that used the error classes now
  declares `'odfErrors'` as its first dependency and destructures the
  classes in its factory body (no more top-level `import {
  ParseError } from '../errors.js'`); as a side effect this fixed two
  latent bugs where `chart.js`/`math.js` referenced `ParseError`
  without importing it (see Fixed). The shared helpers (`odfShared`, in
  `src/_shared/index.js`) receive `odfErrors` by dependency injection
  (`factory(errors, xml)`), so every helper raises the same error classes
  as the module that calls it.
- **Bundles simplified to pure factories.** The six `*-large`/`*-full`
  descriptors (`odt-large`, `odt-full`, `ods-large`, `ods-full`,
  `odp-large`, `odp-full`) are now minimal fw descriptors `{ name,
  dependencies, factory }`: the factory retrieves the already-built
  core and extras and calls `core.use(...extras)`, returning the
  enriched core. Consumption: `runtime.resolve('odtLargeBundle')` after
  registering all core modules + extras (see Removed for the dropped
  imperative helpers).
- **Error codes by origin (breaking for `instanceof` consumers).**
  Every parse-error site moved from the single `'odf/parse-error'` code
  to `'odf/parse-error/<part>'` (`/odt`, `/ods`, `/odp`, `/manifest`,
  `/meta`, `/settings`, `/styles`, `/mimetype`, `/pkg`, `/chart`,
  `/math`, `/limit`); back-compat is preserved via
  `e.code.startsWith('odf/parse-error')`.
- **`ContractError` for API/contract violations.** `odt.write(null)`,
  `ods.write(null)`, `odp.write(null)`, `pkg.write({})` (no mimetype),
  `pkgMimetype.parse(<not Uint8Array>)`, `pkgMimetype.render('')` now
  raise `ContractError('odf/contract-error/<module>', …)` instead of
  `ParseError`. All still `instanceof OdfError`; a consumer relying on
  `instanceof ParseError` for these must switch to `OdfError` or
  `ContractError`. Sibling tests (`odt`/`ods`/`odp`/`pkg/package`/
  `pkg/mimetype`) and `tests/fuzz.test.js` were updated accordingly.
- **Performance.** `odtWalker`/`odsWalker`/`odpWalker` index their
  hooks by name instead of iterating every registered extension on
  each visit (index invalidated after each `use(...)`, rebuilt
  lazily). `TextEncoder`/`TextDecoder` moved to the singleton-backed
  codec in `odfShared` instead of per-call allocation.
- **Maintainability.** New `src/_shared/` folder mutualizing
  boilerplate across 11 modules (`index.js` hosting `odfShared`,
  `walker.js` hosting `odfWalker` — see above). `package.json`'s `files`
  array explicitly excludes `tmp/`/`**/tmp/**`. `package.json` gained
  `description`, `keywords`, `engines`, `sideEffects: false`;
  `awa.maturity` moved from `"L3"` to `"L4"`. It now declares
  `license` (`AGPL-3.0-only`), `author`, `repository`, `bugs` and
  `homepage`, `LICENSE` carries the AGPL-3.0 text and `NOTICE` the
  copyright and dual-licence statement.
- **Error context.** Every orchestrator `ParseError` (`odt`, `ods`,
  `odp` + `manifest`, `meta`, `settings`, `styles`, `pkg`, `mimetype`)
  now carries a `context: { part, module, ... }` (and `expected` for
  mimetype mismatches); `cause` is preserved as-is by
  `parseXmlOrThrow`.
- **`xml` dependency migration (internal, breaking).** The local
  `odfXml` module is gone (see Removed) — all ~25 consumer modules now
  declare `dependencies: ['xml', …]` and receive the `xml` factory from
  `@awacloud/fw/io/codec/xml.js` instead of the local clone. The 9 call
  sites that invoke `xml.parse(...)` on potentially malformed input
  (`pkgManifest`, `odfMeta`, `odfSettings`, `odfStyles`, `odt`, `ods`,
  `odp`) translate fw's `XmlParseError` into `ParseError` with a
  `cause`, preserving the public typed-error contract verified by fuzz
  tests. Consumers must register `@awacloud/fw/io/codec/xml.js` in their
  `ModuleRuntime` alongside the odf modules.
- **`odp.toText`** renders the slides' text (text-box frames, shapes and
  tables; notes opt-in) instead of the slide names.
- **`write()` round-trip.** `odt`, `ods` and `odp` `write()` re-emit the
  read sidecars and parts (see Fixed).
- **`read()` options.** `odt.read`, `ods.read` and `odp.read` take an
  optional second argument forwarded to `pkgPackage.read` (`maxParts`,
  `maxUncompressed`, `maxRatio`).
- **Image MIME type attribute.** `drawImage` writes the image MIME type as
  the ODF 1.4 `draw:mime-type` attribute (it read and wrote the LibreOffice
  extension `loext:mime-type`; both are still read).
- **Documentation** describes behaviour without maturity-stage tags and
  says what is preserved on a round-trip, including the `text:span`
  limitation.
- **Tests.** The dist freshness test now proves, in every mode, that its
  byte comparisons can run.
- **Span runs** gain `runs` (present only when the `<text:span>` has an
  element child: its children in document order — text, spacing, nested
  spans, links, and every other element as the raw node at its position)
  and `_extras.attrs` (every span attribute other than `text:style-name`).
  `value` is unchanged (the flattened character data); render emits `runs`
  when present. `toText` honours spacing inside spans.
- **Default archive entry cap** — `pkgPackage.DEFAULT_LIMITS.maxParts` is
  4096 (was 1024), for every ODF package read through `pkgPackage.read`
  (hence `odt` / `ods` / `odp` `read`): LibreOffice documents with many
  embedded objects carry a directory entry and several parts per object.
  `maxUncompressed` and `maxRatio` are unchanged; explicit limits still
  override through every facade.

### Removed

- Top-level error class exports (`OdfError`, `ParseError`,
  `RenderError`, `ContractError`) from `@awacloud/odf` / `@awacloud/odf/errors`.
  Migration: `const { ParseError } = runtime.resolve('odfErrors')` or
  `const { ParseError } = odfErrors.factory()`.
- `buildOdtLarge` / `buildOdtFull` / `buildOdsLarge` / `buildOdsFull` /
  `buildOdpLarge` / `buildOdpFull` imperative builder helpers.
  Migration: register `odtLargeBundle` (etc.) in a `ModuleRuntime` and
  `resolve(...)` it.
- Bundles no longer re-export extras individually. Migration: import
  directly from `@awacloud/odf/extra/<extra-name>`, or from `@awacloud/odf` (the
  main entry re-exports every extra).
- The local `odfXml` module (its parser source, ~240 LOC, and its
  test file) and its API page — superseded by
  `@awacloud/fw/io/codec/xml.js` (see Changed).
- The `KNOWN` `Set` in `src/meta/meta.js`, which had no discriminant
  effect; the surrounding comment now documents the delegation to the
  opt-in `metaExtended` module for the rest of the `meta:*`/`dc:*`
  vocabulary.
- **The generated `prebuilt` descriptor directory under `src/bundles/`**
  (18 descriptors) and its generator (`bun run gen:prebuilds`) — retired in
  favour of the two-surface `dist/build/` + `dist/standalone/`
  convention (see Added). The exported factory names and resolve keys
  are unchanged, only the on-disk location and generator moved
  (`tools/generate-bundles.mjs`/`bun run gen:bundles`).

### Fixed

- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package, or at files the tarball does not ship, now point at the
  public repository at this release's tag, so they resolve from the tarball.

- `chart.js` / `math.js` referenced `ParseError` without importing it
  — a latent bug fixed as a side effect of wiring `odfErrors` in as an
  explicit dependency (see Changed — Modular error handling).

- `write(read(x))` on `odt`, `ods` and `odp` no longer drops unmodelled
  parts and named styles: every part of the read package that the
  writer does not regenerate (pictures, thumbnails, `Configurations2/`,
  embedded objects) is re-emitted byte-for-byte with the media type the
  source manifest declared, together with the manifest's directory
  entries, and `styles.xml`, `settings.xml` and `meta.xml` travel unless
  `opts.*` overrides them (the order is `opts.*`, then the read model's
  `doc.*`, then empty). A writer-supplied part (`odt` `doc.pictures`)
  wins over the carried copy, and deleting `doc.package` drops the
  carried material.

- `meta:generator` names `@awacloud/odf` on every `odt`, `ods` and `odp`
  write — a read document's previous generator is replaced — unless the
  caller passes an explicit `opts.meta.generator`.

- Every written XML part now declares each namespace prefix it uses: the
  image MIME type attribute, carried form controls and graphic styles, and
  third-party extension markup kept in `_extras` no longer produce
  undeclared prefixes; a prefix with no known or source declaration makes
  `write` throw `odf/render-error/namespace`. The chart and math
  sub-document writers (`bytesOf`) now declare their prefixes too.

- `odp.toText` / `slide.slideText` now include tables held by a frame or
  placed directly on the slide, and text boxes nested in groups.

- `odt.toText` (`textContent.bodyText`) now includes the text of text boxes
  anchored in paragraphs, headings, list items, table cells and at body
  level, after the line of the element that holds them.

- `textList` degrades to an unstyled list when the write context has no
  `listStyle` (and reads without numbering when it has no `listNumbering`)
  instead of throwing a `TypeError`.
- Paragraph and heading attributes other than the style name (`xml:id`,
  `text:class-names`, `text:cond-style-name`, `text:is-list-header`,
  extension attributes) survive a round-trip: they are kept in
  `_extras.attrs` and re-emitted, with their namespace prefixes declared;
  a heading's outline level is typed once (`outlineLevel`).
- Span markup survives a round-trip: spacing elements, nested spans with
  their own styles, links, fields and frames anchored inside a
  `<text:span>` keep their position instead of being flattened to the
  span's character data.
- A LibreOffice document with more than 1024 archive entries (many
  embedded objects) reads with the default limits.

### Security

- ZIP decompression is bounded: `pkgPackage.read(bytes, opts?)` rejects
  archives with more than 1024 entries (`maxParts`), more than 256 MiB
  of uncompressed content in total (`maxUncompressed`), or an entry whose
  compression ratio exceeds 200:1 (`maxRatio`), checked per entry before
  inflation; `0` disables a cap. A breach throws
  `ParseError('odf/parse-error/zip-bomb')` with `context.limit`, and the
  defaults are exposed, frozen, as `DEFAULT_LIMITS`.

- Added a dedicated XML-security section to
  `docs/guide/getting-started.md` documenting that XXE and
  billion-laughs attacks are not applicable: the fw parser skips
  `<!DOCTYPE>` and limits the entity table to the 5 standard XML
  entities plus validated code points.
