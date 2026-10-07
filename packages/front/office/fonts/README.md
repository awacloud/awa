# @awacloud/fonts

Pure JavaScript library to read, write and subset **OpenType** and
**TrueType** fonts in the browser. No runtime dependency beyond
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/fonts@1.0.0/packages/front/fw):
SFNT container and table directory, table parsing and serialization,
quadratic TrueType outlines, composite glyphs, WOFF/WOFF2/TTC containers and a
TrueType subsetter for PDF embedding.

The core covers the required OpenType tables, CFF/CFF2, the layout tables
(parsed, not applied), variable-font and colour-font tables. An opt-in layer
(`extra/*`) adds the RM05 TrueType hinting VM, Apple AAT parsers, Arabic /
Indic / CJK shaping helpers, WOFF2 write and the DSIG / MATH / JSTF tables,
grouped into the bundles `fonts-large`, `fonts-full` and `fonts-apple-aat`.

Known limits, so they are not a surprise:

- GSUB and GPOS lookups are decoded, but there is no shaping engine that
  applies them.
- Colour and bitmap glyph tables (`COLR` / `CPAL`, `SVG `, `sbix`,
  `CBDT` / `CBLC`, `EBDT` / `EBLC` / `EBSC`) are parsed, not rendered:
  the parsers return the decoded records (paint graphs, palettes, SVG
  documents, embedded bitmap bytes with their metrics); rasterising
  and compositing them is left to the caller.
- WOFF2 decoding returns the table directory and the Brotli body; a
  transformed `glyf` / `loca` table is not reversed.
- `subsetForPdf` subsets TrueType (`glyf`) outlines only; CFF fonts are
  rejected.
- Apple AAT state-machine bodies (`morx`, non-format-0 `kerx`, `prop`) are
  returned as `{ parsed: false }`; `ankr` and `lcar` expose raw lookup bytes.

## Installation

```bash
npm install @awacloud/fonts
```

In the browser, via import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":     "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":    "/node_modules/@awacloud/fw/src/",
    "@awacloud/fonts":  "/node_modules/@awacloud/fonts/src/main.js",
    "@awacloud/fonts/": "/node_modules/@awacloud/fonts/src/"
}}
</script>
```

## Quick Start

### Read a TTF / OTF

`fonts` is a plain fw factory descriptor (`{ name, dependencies, factory }`):
its `factory` is resolved by an `@awacloud/fw` runtime, never called directly
with no arguments.

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const api  = fw.runtime.resolve('fonts');
const font = api.read(bytes);   // bytes: Uint8Array of a .ttf or .otf file

console.log(font.flavor);          // 'truetype' or 'opentype'
console.log(font.names.family);    // e.g. 'Liberation Sans'
console.log(font.unitsPerEm);      // e.g. 2048
console.log(font.numGlyphs);

const gid   = font.glyphIndexForCodePoint(0x41);  // 'A'
const glyph = font.getGlyphByIndex(gid);
console.log(glyph.advanceWidth);
console.log(glyph.path.toSvgPath());              // "M1167 0 L1006 412 …"
```

### The manifest: four arrays

`@awacloud/fonts` (`src/main.js`) exports a declarative manifest, plus every
module descriptor by its binding name:

```js
import { fw_require, modules, extras, bundle } from '@awacloud/fonts';
```

- `fw_require` — the `@awacloud/fw` descriptors consumed through dependency
  injection, dependency-closed (`binaryReader`, `binaryWriter`, `bitstream`,
  `huffman`, `lz77`, `deflate`, `adler32`, `zlib`, `brotliDict`,
  `brotliDictWords`, `brotli`).
- `modules` — the local core factories (errors, primitives, sfnt, tables,
  glyph, embed-pdf, encodings, standard14, and the `fonts` orchestrator).
- `extras` — the opt-in modules (RM05 hinting, Apple AAT, shapers, WOFF2
  write, DSIG / MATH / JSTF).
- `bundle` — the `fontsLargeBundle`, `fontsFullBundle` and
  `fontsAppleAatBundle` descriptors, resolvable with `runtime.resolve(...)`.

To use an extra, register the `extras` array as well and resolve it by name:

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseMath } = fw.runtime.resolve('extraMath');
```

### Strict parsing of untrusted input

Resolve the error classes from the same runtime as `fonts`: every
`fontErrors.factory()` call declares its own class identities, so a class
obtained from a separate direct call is not the one `read` throws.

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const api = fw.runtime.resolve('fonts');
const { ParseError } = fw.runtime.resolve('fontErrors');

try {
    const font = api.read(untrustedBytes);
    // OK: parser hardened, caps applied, glyphs accessible.
} catch (e) {
    if (e instanceof ParseError) {
        // e.code, e.g. 'fonts/cmap-range-bomb', 'fonts/glyf-too-many-components',
        // 'fonts/inconsistent-tables', 'fonts/loca-non-monotonic'.
        // See docs/api/errors.md.
    } else { throw e; }
}
```

## Security — parsing untrusted fonts

Font files are frequently parsed on content supplied by users (PDFs, Office
documents, uploads). This package's parsers are hardened against the following
attack classes:

- **cmap range bombs (format 12/13)** — strict bounding of ranges to the
  Unicode domain `[0..0x10FFFF]` and a cumulative cap of `2 × 0x110000`
  materializations (`fonts/cmap-range-bomb`).
- **Composite `glyf` — component explosion** — components per glyph capped at
  256 (`fonts/glyf-too-many-components`); resolution depth capped at 16
  (`MAX_DEPTH` in `compositeResolve.js`).
- **cmap format 14 (UVS)** — independent sub-readers are used instead of
  `peek`, so `defaultUVS` / `nonDefaultUVS` decode correctly (regression tests
  in `tests/fuzz.test.js`).
- **Generic validation caps** — `numGlyphs ≤ 65535`, `numTables ≤ 64`,
  `name.count ≤ 32768`, `gsub` script / feature / lookup counts ≤ 1024 / 4096 /
  4096, `loca` strictly monotonic, cross-table bounds
  (`fonts/inconsistent-tables`).

Error codes: [`docs/api/errors.md`](./docs/api/errors.md). Parsing failures
throw a typed `ParseError`, never a bare `Error`.

## Committed dist — two build surfaces

For consumers who do not want to hand-assemble the `fw_require` / `modules`
manifest, `dist/` ships a committed, pre-generated build for each of the four
assembly roots (`fonts`, `fonts-large`, `fonts-full`, `fonts-apple-aat`), in
two path-discriminated surfaces:

| Surface | Path | Contents |
|---|---|---|
| `dist/build/` | `@awacloud/fonts/build/<root>` | fw mode: declares the fw modules as `dependencies` (DI-injected), needs an `@awacloud/fw` runtime |
| `dist/standalone/` | `@awacloud/fonts/standalone/<root>` | framework-free: every reachable fw factory inlined in the body, zero runtime dependency (Worker-serializable) |

Each root emits a `.js` / `.min.js` / `.meta.json` triplet (for example
`dist/build/fonts-large.js`, `fonts-large.min.js`, `fonts-large.meta.json`),
plus a single `dist/build/index.js` barrel re-exporting the whole `src/main.js`
namespace (the four registration arrays and every named descriptor). Each
`.meta.json` sidecar records the root's `modules`, `fwDependencies` (read back
from the generated descriptor) and build byte sizes.

The generator, `tools/generate-bundles.mjs` (`bun run gen:bundles` in the
source repository), produces byte-identical output across runs — no build
stamp, and every `.js` / `.min.js` opens with the `/*! … */` licence banner at
byte 0. It is a thin wrapper around the shared build tool
`@awacloud/tool-prebuild-generator`, which is not published.

## Source structure

```
src/
├── main.js                     — manifest (4 arrays) + named descriptor exports
├── errors.js                   — FontError / ParseError / RenderError / ContractError
├── fonts.js                    — orchestrator (.read / .use) + cross-table validation
├── _shared/                    — container magics, SFNT flavor mapping, search params
├── primitives/                 — fixed, tag, reader, writer, checksum, encoding
├── sfnt/                       — sfnt header, woff1, woff2, ttc
├── table/                      — head, hhea, maxp, hmtx, cmap, name, OS/2, post,
│                                  loca, glyf, cff, cff2, gsub, gpos, gdef,
│                                  fvar/avar/gvar/hvar/mvar/stat, colr/cpal/sbix/svg,
│                                  cbdt/cblc/ebdt/eblc/ebsc, vhea/vmtx/vorg, base, …
├── glyph/                      — Path, Glyph, compositeResolve (cycle + depth caps)
├── layout/                     — coverage + classDef primitives
├── variable/                   — coordsConvert, instance (axisScalar, gvar deltas)
├── cmap/                       — toUnicode (PDF CMap mini-language)
├── encodings/                  — WinAnsi, MacRoman, Symbol, ZapfDingbats, …
├── standard14/                 — Helvetica × 4, Times × 4, Courier × 4, Symbol, ZD
├── embed-pdf/                  — subsetForPdf, FontDescriptor, CidSystemInfo, ToUnicode
├── extra/                      — tt-hinting, apple-aat/*, shaper-{arabic,indic,cjk},
│                                  woff2-write, dsig, math, jstf
└── bundles/                    — fonts-large, fonts-full, fonts-apple-aat
```

## Hook `.use(...)` (extension)

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const api = fw.runtime.resolve('fonts');
api.use({
    hydrateFont(font) { /* inspect or annotate */ },
    hydrateGlyph(glyph) { /* hook */ }
});
```

Registration is **idempotent**: calling `use(ext)` multiple times with the same
object has no additional effect. Recognized hooks are listed in `KNOWN_HOOKS`
(`hydrateFont`, `hydrateGlyph`, `hydrateTable`, `hydrateName`).

## Tests

The suite lives in `src/**/*.test.js` (unit, beside the module) and `tests/`
(integration: `tests/roundtrip.integration.test.js` builds a minimal in-memory
TTF, encodes it with `packSfnt`, reads it back through `fonts.read` and checks
metrics and paths; `tests/fuzz.test.js` locks the parser-bomb fixes down).
Run it from the monorepo root:

```sh
bun test packages/front/office/fonts/
```

Not every source module has a sibling `*.test.js`; some table sub-parsers
(for example `table/cff/charstring.js`) are covered
through their parent modules.

## Design choices

- **All big-endian** — all reader/writer helpers encode in BE by default
  (OpenType is BE everywhere).
- **Fixed-point** — `Fixed 16.16` and `F2Dot14` are signed integers viewed as
  a JS `number` divided/multiplied by 65536 / 16384. No `bigint` required.
- **DataView + shared buffer** — sub-tables are `Uint8Array` views over the
  same buffer (zero copy) except when independent mutable state is needed
  (`readBytesCopy`).
- **Exclusively typed errors** — `throw new ParseError(...)` everywhere, never
  `throw new Error(...)`. Hierarchy `FontError → {Parse,Render,Contract}Error`.
- **Factory pattern** — every module is a factory descriptor resolved by an fw
  `ModuleRuntime`; constants are declared inside the factory body, with no
  mutable module-level state.
- **Browser-only** — `Uint8Array`, `DataView`, `TextEncoder`, `TextDecoder`;
  no Node module.
- **Hardened parser** — explicit caps on all count/length fields, independent
  sub-readers for sub-tables, cross-table validation
  (`fonts/inconsistent-tables`).

## Documentation

- [`docs/`](./docs/) — per-module API documentation, one page per source
  module.
- [`docs/api/errors.md`](./docs/api/errors.md) — error code vocabulary.
- [`CHANGELOG.md`](./CHANGELOG.md) — release history.

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/fonts` | `src/main.js` | Manifest (`fw_require`, `modules`, `extras`, `bundle`) and every module descriptor by binding name |
| `@awacloud/fonts/fonts` | `src/fonts.js` | Top-level `fonts` orchestrator descriptor (`read` / `.use()`) |
| `@awacloud/fonts/embed-pdf/subsetForPdf` | `src/embed-pdf/subsetForPdf.js` | TrueType subsetter for PDF embedding |
| `@awacloud/fonts/embed-pdf/subsetForPdf/closure` | `src/embed-pdf/subsetForPdf/closure.js` | Glyph closure (internal sub-module of the subsetter) |
| `@awacloud/fonts/embed-pdf/subsetForPdf/cmap-builder` | `src/embed-pdf/subsetForPdf/cmap-builder.js` | Subset `cmap` builder (internal sub-module of the subsetter) |
| `@awacloud/fonts/embed-pdf/subsetForPdf/glyph-rewriter` | `src/embed-pdf/subsetForPdf/glyph-rewriter.js` | Glyph renumbering (internal sub-module of the subsetter) |
| `@awacloud/fonts/embed-pdf/subsetForPdf/hash` | `src/embed-pdf/subsetForPdf/hash.js` | Subset-tag hash (internal sub-module of the subsetter) |
| `@awacloud/fonts/embed-pdf/fontDescriptor` | `src/embed-pdf/fontDescriptor.js` | PDF FontDescriptor dictionary builder |
| `@awacloud/fonts/embed-pdf/cidSystemInfo` | `src/embed-pdf/cidSystemInfo.js` | PDF CIDSystemInfo dictionary builder |
| `@awacloud/fonts/embed-pdf/toUnicodeBuilder` | `src/embed-pdf/toUnicodeBuilder.js` | PDF ToUnicode CMap stream builder |
| `@awacloud/fonts/embed-pdf/*.js` | `src/embed-pdf/*.js` | Any other file of `src/embed-pdf/`, addressed with its `.js` suffix |
| `@awacloud/fonts/encodings` | `src/encodings/lookup.js` | WinAnsi / MacRoman / MacExpert / Standard / Symbol / ZapfDingbats lookup |
| `@awacloud/fonts/standard14` | `src/standard14/lookup.js` | Standard 14 AFM metrics (Helvetica, Times, Courier, Symbol, ZapfDingbats) |
| `@awacloud/fonts/cmap-to-unicode` | `src/cmap/toUnicode.js` | PDF ToUnicode CMap parser / builder |
| `@awacloud/fonts/extra/*` | `src/extra/*.js` | Opt-in modules (RM05 hinting, AAT, shapers, WOFF2 write, DSIG / MATH / JSTF) |
| `@awacloud/fonts/bundles/*` | `src/bundles/*.js` | `fonts-large` / `fonts-full` / `fonts-apple-aat` (fw factory descriptors) |
| `@awacloud/fonts/build/*` | `dist/build/*` | Committed fw-mode build (`fonts`, `fonts-large`, `fonts-full`, `fonts-apple-aat`, `index`) |
| `@awacloud/fonts/standalone/*` | `dist/standalone/*` | Committed framework-free build, same roots |

## Maturity

L4 (`awa.maturity` in `package.json`): the package covers its declared
surface, within the limits listed above, and ships a test suite and per-module
reference pages.

## Licence

`AGPL-3.0-only` — see [`LICENSE`](./LICENSE). A commercial licence and the
third-party notices (Adobe Core 14 AFM metrics, Adobe Glyph List) are in
[`NOTICE`](./NOTICE).

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/fonts`](https://github.com/awacloud/awa/tree/@awacloud/fonts@1.0.0/packages/front/office/fonts)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/@awacloud/fonts@1.0.0/SECURITY.md
