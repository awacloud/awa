# Getting started — `@awacloud/odf` (L4)

First read/write of a minimal `.odt`: install the package, wire its modules
into an `@awacloud/fw` `ModuleRuntime`, write a document and read it back.

**Prerequisites.** The package `@awacloud/odf` and its sole dependency
`@awacloud/fw` (a monorepo workspace, or the import map shown in the package
README); an ES-module runtime with `Uint8Array`, `TextEncoder` and
`TextDecoder` (a browser, bun, node >= 20). The examples below run
unchanged in bun.

## Installation

```bash
npm install @awacloud/odf
```

## Wiring via `ModuleRuntime`

`fw_require` is the list of fw modules the odf modules depend on (`xml`,
compression, `crc32`); `modules` is the list of odf descriptors.

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/odf';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const odt = runtime.resolve('odt');
const bytes = odt.write({ body: [odt.paragraph('Hello, world.')] });
const back = odt.read(bytes);
console.log(odt.toText(back)); // → "Hello, world."
```

## Exposed sub-paths (core set)

| Sub-path | Target |
|----------|-------|
| `@awacloud/odf` | `src/main.js` — all modules + `modules[]` |
| `@awacloud/odf/odt` | `src/odt/odt.js` |
| `@awacloud/odf/ods` | `src/ods/ods.js` |
| `@awacloud/odf/odp` | `src/odp/odp.js` |
| `@awacloud/odf/pkg` | `src/pkg/package.js` |
| `@awacloud/odf/text` | `src/text/content.js` |
| `@awacloud/odf/table` | `src/table/table.js` |
| `@awacloud/odf/draw` | `src/draw/frame.js` |
| `@awacloud/odf/chart` | `src/chart/chart.js` |
| `@awacloud/odf/math` | `src/math/math.js` |
| `@awacloud/odf/form` | `src/form/forms.js` |
| `@awacloud/odf/dr3d` | `src/dr3d/dr3d.js` |

See the package [`README.md`](../../README.md#exposed-sub-paths) for the
full table, including `*-large`/`*-full` bundles, `./extra/*`,
`./bundles/*`, and the prebuilt `./build/*` / `./standalone/*` surfaces.

## L3 surface

L3 adds:

- **Tracked changes** (`textTracked`) — `<text:tracked-changes>` +
  inline `text:change-*` markers.
- **Charts** (`chartChart`) — `<chart:chart>` root + content.xml helpers.
- **Math** (`mathMath`) — opaque passthrough for `<math:math>`.
- **Animations** (`odpAnimations`) — `anim:*` trees +
  `presentation:transition`.
- **Forms** (`formForms`) — `<office:forms>` + typed controls.
- **dr3d** (`dr3dScene`) — 3D scenes (cube / sphere / extrude / light).
- **Markup compatibility** (`odfMc`) — `office:version` introspection.

See [coverage.md](./coverage.md) for the full tiering.

## Security and robustness limits

### XML — XXE / billion-laughs

The XML parser consumed via `@awacloud/fw/io/codec/xml.js` skips every
`<!DOCTYPE …>` (including the internal subset) without external entity
expansion or `SYSTEM` / `PUBLIC` resolution. The entity table is limited
to the 5 standard XML entities (`&lt;`, `&gt;`, `&amp;`, `&quot;`,
`&apos;`) plus validated code-point references (≤ `0x10FFFF`, excluding
surrogates). **XXE and billion-laughs are therefore non-applicable by
design.** No consumer action is required.

### `repeated` policy (raw cell / row)

ODF allows `table:number-columns-repeated="1000000"` and
`table:number-rows-repeated="..."`; an attacker could craft a `.ods`
under 5 KB modeling 10^12 logical cells. **Default tolerance is
unbounded**: `tableCell.parseCell` / `tableRow.parseRow` enforce
`maxRepeat` only when the caller passes it, and no `maxRepeat` is
forwarded anywhere on the `ods` / `odt` read paths (`tableTable.parseTable`
calls `parseRow` without it). `tableTable.parseColumn` reads
`table:number-columns-repeated` with no bound at all and keeps it raw in
`columns[i].repeated`. Nothing in `@awacloud/odf` expands a repetition,
so the attributes are inert until a consumer iterates — pass `maxRepeat`
when calling the table modules directly on untrusted input.

Two tools are provided:

1. `tableCell.parseCell(el, { maxRepeat: 65535 })` and
   `tableRow.parseRow(el, { maxRepeat: 65535 })` throw
   `ParseError('odf/parse-error/limit', …)` right at parse time.
2. `odfShared.boundedIntAttr(el, name, { max, module, label })` (the
   general-purpose bounds-checked attribute reader exposed by
   `@awacloud/odf`'s `odfShared` module, resolved via the runtime) — for
   ad-hoc verification at the point of use.

### ZIP — decompression

`pkgPackage.read(bytes, opts?)` bounds decompression before any entry is
inflated. Three caps are checked per entry, with these defaults (exposed,
frozen, as `pkgPackage.DEFAULT_LIMITS`):

| Option            | Default             | Bounds                                  |
|-------------------|---------------------|-----------------------------------------|
| `maxParts`        | `4096`              | entries in the archive                  |
| `maxUncompressed` | `268435456` (256 MiB) | total uncompressed bytes             |
| `maxRatio`        | `200`               | uncompressed / compressed ratio, per entry |

Pass `0` to disable one cap. A breach throws
`ParseError('odf/parse-error/zip-bomb')` whose `context.limit` names the
breached option. The `odt`, `ods` and `odp` facades forward their second
argument unchanged, so `read(bytes, opts)` applies the same caps:

```js
const odt = runtime.resolve('odt');
const pkg = runtime.resolve('pkgPackage');

// A valid document padded with 1 MiB of zeros (deflates far beyond 200:1).
const p = pkg.read(odt.write(odt.fromText(['x'])));
pkg.setPart(p, 'Pictures/pad.bin', new Uint8Array(1024 * 1024));
const padded = pkg.write(p);

try { odt.read(padded); }
catch (e) { e.code; /* 'odf/parse-error/zip-bomb' */ e.context.limit; /* 'maxRatio' */ }

odt.read(padded, { maxRatio: 0 });   // trusted source: ratio check off
```

Tighten the caps for untrusted input rather than loosening them, and keep
bounding `cell.repeated` / `row.repeated` with `maxRepeat` (see above).

### XML serialization — memory

`xml.serialize` (fw) builds output by concatenation: peak memory is
≈ 2× the size of `content.xml`. No streaming is available on the fw
side — out of scope for odf.

## See also

- [Read & write `.odt`](./read-write-odt.md)
- [Pkg overview](./pkg-overview.md)
- [Coverage tiers](./coverage.md)
