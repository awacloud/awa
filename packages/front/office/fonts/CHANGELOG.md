# Changelog

All notable changes to `@awacloud/fonts` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
this project adheres to [Semantic Versioning](https://semver.org/).
Reference specs:
[OpenType v1.9](https://learn.microsoft.com/en-us/typography/opentype/spec/) +
[TrueType Reference Manual (Apple)](https://developer.apple.com/fonts/TrueType-Reference-Manual/).

## [Unreleased]

## [1.0.0] - 2026-10-07

### Added

#### Initial library surface

Each bullet describes the final state of the surface.

- **SFNT container and primitives** — `sfnt/sfnt.js` parses and packs the
  table directory (checksums, `head.checksumAdjustment` recomputation,
  4-byte-aligned tables, the search-range / entry-selector / range-shift
  trio) for the four `sfntVersion` flavors (TrueType `0x00010000`, OpenType
  `OTTO`, Apple `true`, `typ1`). `BinaryReader` / `BinaryWriter` big-endian
  helpers (int/uint 8/16/24/32, Fixed 16.16, F2Dot14, tag, LONGDATETIME, peek,
  sub-reader, padding, patching), the table checksum and `head` adjustment,
  UTF-16BE and Mac Roman codecs and 4-character tag pack/unpack.
- **Required OpenType tables** — read: `head`, `hhea`, `maxp` (v0.5 / v1.0),
  `hmtx` (with trailing equal-advance collapse), `cmap` (formats 0, 2, 4, 6,
  12, 13, 14), `name` (formats 0 and 1; Windows BMP UTF-16BE, Mac Roman,
  Unicode), `OS/2` (v0–v5), `post` (v1, v2, v2.5, v3), `loca` (short and
  long) and `glyf` (simple and composite, with offset/anchor arguments and
  2×2 F2Dot14 transforms). Encoders exist for `head`, `hhea`, `maxp`, `hmtx`,
  `name`, `OS/2`, `post` and `loca` (the `loca` format is chosen from the
  offset constraints).
- **Glyph model** — `Path` (M/L/Q/C/Z commands, affine transform, SVG output),
  the typed `Glyph` wrapper (id, name, advanceWidth, lsb, bbox, path,
  components) and `compositeResolve` with cycle detection and a depth cap.
- **Top-level orchestrator** `fonts.read(bytes)` returning a navigable `Font`:
  tables, `unicodeMap`, names, `getGlyphByIndex` / `getGlyphByCodePoint`,
  `advanceWidth(gid)` and `leftSideBearing(gid)`, plus the idempotent
  `.use(...)` hook with its declared surface (`hydrateFont`, `hydrateGlyph`,
  `hydrateTable`, `hydrateName`).
- **Outline and layout tables** — CFF Type 2 (INDEX, DICT, Top DICT, String
  INDEX, Global/Local Subr INDEX, CharStrings, Private DICT; Type 2 charstring
  decoder with subroutine biasing) and CFF2 (header, Top DICT, 32-bit INDEX,
  global Subr INDEX, CharStrings INDEX, variation-store offset). GDEF
  (header v1.0 / 1.2 / 1.3, `glyphClassDef`, `markAttachClassDef`), GSUB
  (Script / Feature / Lookup lists; lookup types 1–8 decoded, a lookup of
  another type is returned as `{ type, parsed: false }`), GPOS (lookup types
  1–9 decoded, ValueRecord decoder) and the `layout/classDefinitions.js`
  coverage and ClassDef (formats 1 and 2) primitives. GSUB and GPOS are
  parsed, not applied: the package has no shaping engine.
- **Containers** — WOFF1 (`sfnt/woff.js`: per-table compressed / uncompressed
  payloads, zlib inflation through `@awacloud/fw`, standalone SFNT output with a
  tag-sorted directory); WOFF2 envelope read (`sfnt/woff2.js`: header, 66
  known-table index, UIntBase128 lengths, Brotli-decompressed body sliced into
  per-table views — the `glyf` / `loca` transform is **not** reversed, and
  `decodeWoff2` reports it through `inverseGlyfTransform`); TTC / OTC
  (`sfnt/ttc.js`: `parseTtc` and `extractFont(bytes, index)`).
- **Secondary, vertical and bitmap tables** — `kern`, `gasp`, `hdmx`, `VDMX`,
  `LTSH`; `vhea`, `vmtx`, `VORG`; `EBDT`, `EBLC`, `EBSC`.
- **Variable fonts** — `fvar` (axes and named instances), `avar` (per-axis
  segment maps and `applyAvarSegment`), `STAT` (design axes and axis-value
  records, formats 1–4), `gvar` (tuple records and packed point/delta), `HVAR`,
  `MVAR`; helpers `variable/coordsConvert.js` (`normaliseAxisValue`,
  `normaliseAxesCoords`) and `variable/instance.js` (`axisScalar`,
  `tupleScalar`, `applyGvarDeltas`). There is no one-shot instantiation
  pipeline.
- **Colour fonts and `BASE`** — COLR v0 and v1 (`decodeColorLine`, `decodePaint`
  and `decodePaintGraph` with depth and cycle guards; `PAINT_FORMAT` names all
  32 paint formats (ids 1–32), every one decodes into `{ format, name, … }`, any
  other id decodes as `{ format, parsed: false }`),
  CPAL v0 and v1, `sbix`, SVG documents, CBDT / CBLC strikes, and `BASE`
  baseline metadata for the horizontal and vertical axes.
- **PDF-facing helpers** — PDF and legacy encodings (`WinAnsiEncoding`,
  `MacRomanEncoding`, `MacExpertEncoding`, `StandardEncoding`, `Symbol`,
  `ZapfDingbats`, with `lookupEncoding(name)` / `findCode(encoding,
  glyphName)`), the ToUnicode CMap parser and builder (`cmap/toUnicode.js`),
  the Standard 14 AFM metrics (`standard14/*`: Helvetica × 4, Times × 4,
  Courier × 4, Symbol, ZapfDingbats) and the embed-pdf helpers
  (`subsetForPdf`, `buildFontDescriptor`, `buildCidSystemInfo`,
  `embedBuildToUnicode`), each at its own sub-path (see Changed).
- **Opt-in extras** — `extra/tt-hinting.js`, the RM05 bytecode VM (graphics
  state, zones and the opcode catalogue; most catalogued opcodes are
  recognized and `RM05_DEFERRED_COUNT` reports the rest — function-definition
  opcodes are not implemented); `extra/apple-aat/{morx,kerx,ankr,prop,lcar,feat}.js`
  and a barrel (envelope parsers: `feat` decodes its settings registry, `kerx`
  format 0 subtables are decoded, other `kerx` formats and `morx` subtables
  return `{ parsed: false }`, `ankr` and `lcar` expose raw lookup bytes);
  `extra/shaper-{arabic,indic,cjk}.js` (Arabic joining, Devanagari cluster
  reorder, CJK vertical forms and IVS); `extra/{woff2-write,dsig,math,jstf}.js`
  (WOFF2 encoder, DSIG records, MATH v1.0 and MathConstants, JSTF). The bundles
  `bundles/fonts-large.js`, `bundles/fonts-full.js` and
  `bundles/fonts-apple-aat.js` layer them onto the core.
- `fonts/inconsistent-tables` cross-table validation in `buildFont`
  (`fonts.js`) — cmap gids and composite glyph component indices
  must stay within `maxp.numGlyphs`.
- `fonts/loca-non-monotonic` — `parseLoca` now rejects non-monotone
  offset arrays which would otherwise produce negative-length glyph
  slices passed to `parseGlyph`.
- `fonts/maxp-numglyphs-cap`, `fonts/sfnt-too-many-tables`,
  `fonts/cmap-too-many-subtables`, `fonts/name-too-many`,
  `fonts/gsub-script-count-cap`, `fonts/gsub-feature-count-cap`,
  `fonts/gsub-lookup-count-cap` — hard caps on count fields to prevent
  allocation DoS. `fonts/sfnt-empty` now also raised at parse time
  (previously only at `packSfnt`).
- `sliceTable(bytes, offset, length)`, returned by the `fontReader` factory —
  a bounds-checked wrapper around
  `new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length)`.
- `buildKerningTable(gpos)`, returned by the `tableGpos` factory — an opt-in
  memoised `Map<(left<<16)|right, dx>` for fast horizontal kerning
  lookups.
- `glyphIndexForCodePoint(cp, { strict: true })` returns `-1` for
  unknown code-points instead of `0` (which is also the valid gid of
  `.notdef`).
- `docs/api/errors.md` — the security codes, the validation caps, the code
  families and the `cause:` convention (not an exhaustive table of every code).
- Two-surface `dist/` build: `tools/generate-bundles.mjs` (a thin
  wrapper over `@awacloud/tool-prebuild-generator`, shared with
  `@awacloud/ooxml`/`@awacloud/odf`/`@awacloud/pdf`/`@awacloud/md`) emits
  `dist/build/<root>.{js,min.js,meta.json}` (fw-mode, `dependencies`
  declared) plus `dist/standalone/<root>.{js,min.js,meta.json}`
  (framework-free, factories inlined) for each of `fonts`,
  `fonts-large`, `fonts-full`, `fonts-apple-aat`, plus a
  `dist/build/index.js` barrel.

#### Font-embedding and colour-font follow-ups

- **`buildToUnicode(map, opts)` takes `opts.codeBytes`** (`1` or `2`, default
  `2`) — `codeBytes: 1` emits a one-byte codespace (`<00> <FF>`) and two-hex-digit
  `bfchar` / `bfrange` source codes, as ISO 32000-1 § 9.10.3 requires for a simple
  (single-byte) font; `2` and the default are byte-identical to the previous
  output. Any other value throws `fonts/tou-bad-code-bytes`, and a source code
  that is not an integer in `0..0xFF` under `codeBytes: 1` throws
  `fonts/tou-code-out-of-range`. `parseToUnicode` reads the one-byte form back.
  `embedBuildToUnicode` forwards `opts` unchanged, so the option reaches the
  embed-pdf helper too; the Type0 subset path keeps the two-byte default.
- **Twelve `PAINT_FORMAT` keys** — `VAR_SCALE` (17), `VAR_SCALE_AROUND_CENTER`
  (19), `SCALE_UNIFORM` (20), `VAR_SCALE_UNIFORM` (21),
  `SCALE_UNIFORM_AROUND_CENTER` (22), `VAR_SCALE_UNIFORM_AROUND_CENTER` (23),
  `VAR_ROTATE` (25), `ROTATE_AROUND_CENTER` (26), `VAR_ROTATE_AROUND_CENTER`
  (27), `VAR_SKEW` (29), `SKEW_AROUND_CENTER` (30) and `VAR_SKEW_AROUND_CENTER`
  (31), with their decoders: `decodePaint` now decodes every format 1–32 and each
  decoded paint carries a `name` field (the OpenType paint-table name, for
  example `'PaintScaleAroundCenter'`). The `Var*` variants decode their
  `varIndexBase`; the deltas are not applied.

#### Layout follow-ups

- **GSUB lookup type 8 is decoded** — Reverse Chaining Contextual Single
  Substitution, format 1, decodes to `{ type: 8, format: 1, coverage,
  backtrackCoverages, lookaheadCoverages, substitutes }`, directly and through
  a type 7 Extension lookup; any other type 8 format throws
  `fonts/gsub-reverse-format`. Lookup types outside 1–8 still return
  `{ type, parsed: false }`. The substitutions are decoded, not applied.

### Changed

- **`subsetForPdf` requires TrueType outlines (documented precondition)** — a
  font without `glyf` / `loca`, such as a CFF- or CFF2-flavoured font, is
  rejected with `ContractError` `fonts/subset-bad-font`; there is no CFF
  subsetting route. The behaviour is unchanged: the source comment now states
  the precondition and the tests pin the error code.
- **`package.json` declares `engines.node` `>=18`.**
- **Reference documentation** — new API pages for `cff2`, `vhea`, `vmtx`,
  `vorg`, `ebdt`, `eblc` and `ebsc`, and for the `fontsShared`,
  `varCoordsConvert`, `varInstance` and `encodingAglTable` helpers. The API
  index and the `main` page list every exported binding and link the new
  pages; the manifest header in `src/main.js` describes the named re-exports
  next to the four manifest arrays. The README states that colour and bitmap
  tables are parsed, not rendered. No code change.

- **`PAINT_FORMAT` follows the OpenType 1.9 COLR numbering** — three keys moved
  to the numbers the specification gives them: `SCALE_AROUND_CENTER` 17 → 18,
  `ROTATE` 18 → 24 and `SKEW` 19 → 28 (formats 1–16 and 32 keep their numbers).
  A consumer that compares a decoded `format` with a literal 17, 18 or 19, or that
  stored those numbers, must switch to the enum keys. The layouts of the three
  decoded paints did not change; only the format number they answer to did.

- **Documentation pass** — the README follows the published-package skeleton
  (install, quick start, one sub-path row per `exports` key, maturity, licence,
  project) with runnable snippets; the guide and the reference pages were
  corrected against the live exports (import lines, `.use()` of an extra,
  dependency lists, API tables in both directions, the error-class identity
  rules, the `embed-pdf` index turned into a plain section index); internal
  references were removed from published pages and source comments; this
  changelog was consolidated into the single `[Unreleased]` section. No code
  change.
- **Dist** — dist regenerated with the licence banner: every committed
  `dist/**/*.js` / `.min.js` opens with the row's `/*! … */` legal block
  (content from the repository licence matrix), each `*.meta.json`
  `bytes` entry is measured on the final bytes, and the `builtAt` timestamp
  is gone — `bun run gen:bundles` is now byte-deterministic.
- **Package contents** — the npm tarball now ships `NOTICE` (dual licence +
  third-party attributions) and the Adobe Core 14 AFM notice
  (`vendor/afm/NOTICE-adobe-afm.html`) the fonts `NOTICE` points at; the
  six vendored `.afm` source files, the eleven `_test-runtime.js` test
  scaffolds and the pre-publication checklist no longer ship.
- **Strict factory-only architecture completed across `src/`.** Every
  module — `primitives/*`, `sfnt/*`, `table/*` (root + `cmap/`, `cff/`,
  `colr/`, `gsub/`, `gpos/`), `extra/*` (incl. `apple-aat/*` and
  `tt-hinting/*`), `embed-pdf/*`, `cmap/`, `encodings/*`,
  `standard14/*`, `variable/*`, `layout/*`, `glyph/*` — now exports
  exactly one `fw` factory descriptor; no top-level helper/constant/
  class export remains outside a descriptor body. The one exception is
  `standard14/_widths.generated.js`, a generated plain-data module that only
  the tests import. Cross-module wiring
  is declared in `main.js`'s 4-array manifest (`fw_require` /
  `modules` / `extras` / `bundle`) and resolved through `@awacloud/fw`
  `ModuleRuntime` DI. Sibling tests resolve factories via per-area
  `_test-runtime.js` `ModuleRuntime` bootstraps instead of calling
  `descriptor.factory()` directly or importing deleted top-level
  shims.
- `src/errors.js` — the `fontErrors` factory body is **strict pure** :
  each invocation declares fresh `FontError` / `ParseError` /
  `RenderError` / `ContractError` class identities (no module-local
  memoisation). Cross-call identity stability (required for
  `instanceof` across consumers) is delegated entirely to
  `ModuleRuntime`, which caches the resolved instance per
  `(name, version)`. This matches the `@awacloud/ooxml` / `@awacloud/md`
  reference pattern. **Breaking**: `src/errors.js` no longer exports
  `FontError`/`ParseError`/`RenderError`/`ContractError`/`isFontError`
  as top-level bindings, and `@awacloud/fonts` does not re-export them either:
  consumers resolve them from the `fontErrors` descriptor
  (`fw.runtime.resolve('fontErrors')`, the same runtime that resolves `fonts`).
- Hand-written factory bodies (`primitives/*`, `sfnt/*`, `errors.js`,
  and the majority of `table/*`/`extra/*`) are worker-safe: each body
  inlines the helpers/constants/classes it needs and closes only over
  DI-injected dependencies, so `factory.toString()` is serialisable to
  a Worker. The frozen 256-entry lookup tables under `encodings/*` and
  `standard14/*` are declared inside their factory bodies, so they need no
  DI either.
- `primitives/reader.js` and `primitives/writer.js` now delegate their
  low-level primitive operations to `@awacloud/fw` `binaryReader` /
  `binaryWriter`. The historical `BinaryReader` / `BinaryWriter` classes
  remain as thin font-specific facades — same API, same big-endian
  semantics, OpenType-specific helpers
  (`readFixed`, `readF2Dot14`, `readTag`, `readLongDateTime`,
  `writeTag(string|uint32)`, `padTo4`, `patchUint16/32`, windowed
  `sub` / `constructor(bytes, start, length)`) preserved verbatim.
  `primitives/fixed.js` (`fixedFromInt32`, `f2dot14FromInt16`, …),
  `primitives/checksum.js`, `primitives/encoding.js` and
  `primitives/tag.js` remain local (OT-specific, not delegated; `fixed.js`
  has no dependency).
- `embed-pdf/index.js` barrel removed (re-exporting resolved
  singletons was non-compliant with strict factory-only). Each
  embed-pdf helper now publishes at its own `package.json` `exports`
  sub-path: `@awacloud/fonts/embed-pdf/subsetForPdf`, `.../fontDescriptor`,
  `.../cidSystemInfo`, `.../toUnicodeBuilder` (plus the
  `subsetForPdf/{closure,cmap-builder,glyph-rewriter,hash}` internals).
- `script-feature-list.js` (`parseLookupList`) no longer swallows
  `ParseError`. Only non-`ParseError` exceptions are downgraded to
  `{ parsed: false, error, cause }` so a malformed sub-format does not
  silently produce an opaque subtree. The `cause:` chain is preserved.
- `writeTag(string)` rejects non-ASCII characters with
  `ContractError('fonts/bad-tag')`. Previously it truncated silently
  via `charCodeAt() & 0xFF`.
- `BinaryReader` primitive reads use an inline `try/catch` (no closure
  allocation) and a factory-local `_translate(e)` helper. Reduces per-read
  overhead on hot paths such as `parseGlyf` over CJK fonts.
- The fw `binaryReader` / `binaryWriter` modules are injected into
  `fontReader` / `fontWriter` through dependency injection instead of being
  initialised at module load. Improves testability.
- `extra/apple-aat/prop.js` returns
  `{ parsed: false, reason: 'aat-state-machine-deferred' }` to signal
  explicit stub status — the only live AAT deferred-stub marker in
  `src/`. Full AAT state-machine decoding (`morx` subtables and `kerx` formats
  other than 0, `prop`) stays out of the 1.0.0 surface, and `ankr` / `lcar`
  expose raw lookup bytes; `feat` is decoded. This is a scope decision: the
  package ships these tables as envelope-only parsers.
- Module descriptors carry a generated `deps:` array
  (`bun run deps:check`, backed by `fw-codegen deps`), mirroring each
  descriptor's `dependencies:` list by binding for static
  dependency-graph tooling. `deps:` is inert at runtime — never read
  by `ModuleRuntime.resolve()` or `fw-bundler standalone` — and is
  regenerated together with the full test suite as the correctness
  gate.
- `awa.maturity` advanced from `"L3"` to `"L4"`; license (`LICENSE`, `NOTICE`)
  and `package.json` metadata are stamped.
- README translated to English (tagline, coverage summary, security
  notes, quick-start).
- **API reference describes the current surface only** (no maturity-level
  promises) and the API index is grouped by area; source comments describe
  each module's contract in plain terms. The message of the
  `fonts/tt-hinting-unimplemented` error now reads `TT opcode not
  implemented: <name> (0x<op>)` (the error code and context are unchanged).

### Fixed

- **`BinaryReader` read errors keep their cause.** The `ParseError` a
  `fontReader` read throws (for example `fonts/reader-eof`) now carries the
  originating `@awacloud/fw` `ContractError` as `cause`; its code and message
  are unchanged. `fontReader` is in every bundle, so all four `dist` roots are
  regenerated with the fix.
- **`embedSubsetForPdf` is resolvable from the package's own manifest.** The
  four descriptors it depends on (`embedClosure`, `embedCmapBuilder`,
  `embedGlyphRewriter`, `embedHash`, the `embed-pdf/subsetForPdf/*` helpers) were
  neither in `modules` nor in `fw_require`, so a `ModuleRuntime` seeded with the
  package's own arrays threw `Module not found: embedClosure` the first time it
  resolved `embedSubsetForPdf`, and a host had to register the four by sub-path.
  They are now registered in `modules`, each before `embedSubsetForPdf`, and
  re-exported from `main.js` by binding name; the `fw_require` + `modules`
  self-closure and the uniqueness of the `modules` names are pinned by the wiring
  test. A composer that already patches these four in by hand (for example
  `@awacloud/pdf`) now lists the same names twice, which `ModuleRuntime` accepts
  because registration is idempotent by name.
- **WOFF2 round trip with untransformed `glyf` / `loca`.** `encodeWoff2` wrote
  version 0 for every table. In WOFF2 version 0 is the null transform for every
  table except `glyf` and `loca`, where it means "transformed" (the null transform
  is version 3) — so a decoder expected a `transformLength` the writer never wrote
  and failed on the first real font (`brotli: CL-of-CL Kraft > 1`). The writer now
  flags `glyf` and `loca` with transform version 3 and every other table with
  version 0, and writes no `transformLength`. The mirror bug in the reader
  (`sfnt/woff2.js`) is fixed too: it read a `transformLength` for any non-zero
  transform version, including `glyf` / `loca` version 3; it now reads one only
  when the version is not that table's null-transform version. A real font
  (Liberation Sans Regular, 19 tables) round-trips byte for byte. The writer is
  part of the `fonts-full` and `fonts-apple-aat` bundles, which are regenerated
  with the fix; the reader and the other changes of this section reach no
  bundle.
- **COLR v1 paint formats 16–31 decoded as the wrong paint.** The paint format
  numbers after 16 did not follow the OpenType 1.9 table, so a format-18 paint
  (`PaintScaleAroundCenter`) decoded as a rotation and the `Var*`, uniform-scale
  and around-centre variants were not decoded at all (see Changed and Added).

- **`WinAnsiEncoding` slots 0x27 and 0x60** —
  the table named `quoteright` at 0x27 and `quoteleft` at 0x60 (the
  StandardEncoding ASCII row). ISO 32000-2 Annex D has `quotesingle` and
  `grave` there; `quoteleft`/`quoteright` stay at 0x91/0x92. Only those two
  slots changed; no generated `dist/` bundle carries this table (the
  regeneration is byte-identical).
- **Pack-surface pin for the Adobe Glyph List notice** —
  `third-party/NOTICE-adobe-glyph-list`, which `NOTICE` points at, is now
  pinned in the `npm pack` listing test with a non-vacuity control.
- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package now point at the public repository at this release's
  tag, so they resolve from the tarball; references to sources that are not
  published are plain-text citations.
- **`fw_require` not dependency-closed** —
  `src/main.js`'s `fw_require` used to list only `binaryReader`,
  `binaryWriter`, `zlib`, `brotli`, omitting each provider's own transitive
  deps: `zlib` needs `deflate`/`adler32` (which itself needs
  `bitstream`/`huffman`/`lz77`), and `brotli` needs `lz77`/`brotliDict`/
  `brotliDictWords`. A `ModuleRuntime` seeded from this package's own
  manifest therefore resolved `fontWoff`/`fontWoff2` but threw
  `Module not found` the first time WOFF/WOFF2 decode actually ran.
  `fw_require` now lists the full closure, dependencies before dependents;
  `modules`, `extras`, `bundle` and the named re-export block are
  unchanged.
- **`fonts/post-num-mismatch` on `subsetForPdf` output**
  — `embedSubsetForPdf`'s `subsetForPdf` no longer copies a source
  font's `post` table verbatim. A v1.0/v2.0/v4.0 `post` carries
  glyph-name data keyed to the source font's gid count/order, which
  the subset's renumbered/reduced glyph set invalidates, so
  `fonts.read()` on the subset bytes threw `fonts/post-num-mismatch`
  for any real (non-v3.0) source font. The subset's `post` table is
  now a re-versioned 32-byte v3.0 header (no glyph names) built from
  the source header's shared fields (italicAngle, underline,
  isFixedPitch, memory hints), preserved bit-for-bit; an already-v3.0
  source `post` is still copied verbatim, and a source `post` absent
  or shorter than 32 bytes still yields no `post` table in the
  subset. No new dependency added to `embedSubsetForPdf` — pure byte
  patch inside the existing factory body.

### Security

Parser-bomb and correctness fixes from an internal security audit. Each fix is
locked by a dedicated regression test in `tests/fuzz.test.js`
(describe block `fonts security — P0 fixes`).

- **`fonts/cmap-range-bomb`** (`table/cmap/formats.js`) —
  Cmap subtable formats 12 and 13 declared `startCharCode` /
  `endCharCode` as `uint32`, allowing a malicious font to declare
  e.g. `(start=0, end=0xFFFFFFFF)` — a 4-billion-iteration `Map.set`
  loop guaranteed to OOM/hang the parser. Each group is now bounded
  to the legal Unicode range `[0..0x10FFFF]` and the cumulative
  materialised entry count is capped at `2 × 0x110000`.
- **`fonts/glyf-too-many-components`** (`table/glyf.js`) —
  Composite glyphs decoded via a `do { ... } while (flags & MORE_COMPONENTS)`
  loop with no upper bound. A malicious font could emit millions of
  component records → OOM. Components per glyph are now capped at 256
  (well above any legitimate use; OT validators recommend ≤ 8). The
  existing `MAX_DEPTH=16` cap in `compositeResolve.js` is unchanged —
  width *and* depth are now both bounded.
- **cmap format 14 (UVS) sub-readers** (`table/cmap/formats.js`) —
  `parseFormat14` used `r.peek(rr => { rr.seek(...); return rr; })`
  to obtain sub-tables, but `peek` restores the parent cursor on
  return — every subsequent `sub.readUint*` call was actually reading
  from the pre-peek position. Default and non-default UVS tables were
  therefore silently corrupted. Now uses `r.sub(rel, length)` to obtain
  an independent sub-reader. Two regression tests
  (`parses non-default UVS mappings correctly`,
  `parses default UVS ranges correctly`) lock in the corrected behaviour.
