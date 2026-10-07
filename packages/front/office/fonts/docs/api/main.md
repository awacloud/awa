---
module: main
category: main
dependencies: []
returns: object
worker-safe: true
status: complete
---

# main

> Entry point — the declarative manifest of the `@awacloud/fonts` package, plus every module descriptor re-exported by its binding name.

**Module** `main` | **Source** `packages/front/office/fonts/src/main.js` | **Deps** none | **Worker-safe** yes

**Prerequisites**: the `@awacloud/fonts` package root, and an `@awacloud/fw` runtime to resolve the descriptors it lists.

`main.js` carries no runtime bootstrap: it exports four arrays (`fw_require`, `modules`, `extras`, `bundle`) and, additively, each descriptor of `modules` and `bundle` under its binding name (error classes are **not** top-level exports — they are resolved from the `fontErrors` descriptor, see [errors](./errors.md)). Register the arrays in an `@awacloud/fw` runtime to wire dependency injection.

## Resolve

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const api = fw.runtime.resolve('fonts');
const font = api.read(bytes);   // bytes: Uint8Array of a .ttf or .otf file
```

A descriptor such as `fonts` cannot be used without a runtime: `fonts.factory()` called with no arguments throws, because its dependencies are injected as factory arguments.

## API

The four top-level arrays:

| Export | Type | Description |
|--------|------|-------------|
| `fw_require` | `Array` | External `@awacloud/fw` factory descriptors consumed by the package, dependency-closed (`binaryReader`, `binaryWriter`, `bitstream`, `huffman`, `lz77`, `deflate`, `adler32`, `zlib`, `brotliDict`, `brotliDictWords`, `brotli`). |
| `modules` | `Array` | All core local factories, in topological order (dependencies before their consumers): errors, primitives, sfnt containers (`fontSfnt` / `fontTtc` / `fontWoff` / `fontWoff2`), every OT table (required, optional, variable, colour, bitmap, CFF / CFF2, layout sub-parsers), `embed-pdf/*`, `layout/classDefinitions`, `cmap/toUnicode`, `standard14/*`, `encodings/*`, `glyph/*`, and the `fonts` orchestrator itself. Derive the count with `modules.length`. |
| `extras` | `Array` | Opt-in extras (each wired via `fonts.use(...)`): math / jstf / dsig metadata, the TT hinting VM and its opcode groups, complex shapers, WOFF2 write, Apple AAT tables. They are **not** re-exported by name from the package root: register the array and resolve an extra by name (`extraMath`, `aatMorx`, …), or import its file through the `./extra/*` sub-path. |
| `bundle` | `Array` | The three bundle descriptors — `fontsLargeBundle`, `fontsFullBundle`, `fontsAppleAatBundle` (see [bundles](./bundles/README.md)). |

### Named descriptor exports

Every descriptor of `modules` and `bundle` is **also** re-exported by its binding name, so sibling composers can import it through the bare `@awacloud/fonts` specifier without going through the manifest arrays. This table lists every one of those bindings. "no page yet" marks a descriptor without its own reference page; each of those is an internal sub-module documented through its parent module: the `tableGposType*` descriptors, `tableCff{Charstring,Dict,IndexRecord}`, `tableGsub*`, `tableCmapFormats`, `tableColrPaint`, `tableGposValueRecord` and `embed{Closure,CmapBuilder,GlyphRewriter,Hash}`.

| Group | Binding | Reference page |
|-------|---------|----------------|
| Errors | `fontErrors` | [errors.md](./errors.md) |
| Shared + primitives | `fontsShared` | [_shared/README.md](./_shared/README.md) |
| Shared + primitives | `fontFixed` | [primitives/fixed.md](./primitives/fixed.md) |
| Shared + primitives | `fontTag` | [primitives/tag.md](./primitives/tag.md) |
| Shared + primitives | `fontChecksum` | [primitives/checksum.md](./primitives/checksum.md) |
| Shared + primitives | `fontEncoding` | [primitives/encoding.md](./primitives/encoding.md) |
| Shared + primitives | `fontReader` | [primitives/reader.md](./primitives/reader.md) |
| Shared + primitives | `fontWriter` | [primitives/writer.md](./primitives/writer.md) |
| SFNT containers | `fontSfnt` | [sfnt/sfnt.md](./sfnt/sfnt.md) |
| SFNT containers | `fontTtc` | [sfnt/ttc.md](./sfnt/ttc.md) |
| SFNT containers | `fontWoff` | [sfnt/woff.md](./sfnt/woff.md) |
| SFNT containers | `fontWoff2` | [sfnt/woff2.md](./sfnt/woff2.md) |
| OpenType tables | `tableHead` | [table/head.md](./table/head.md) |
| OpenType tables | `tableHhea` | [table/hhea.md](./table/hhea.md) |
| OpenType tables | `tableMaxp` | [table/maxp.md](./table/maxp.md) |
| OpenType tables | `tableHmtx` | [table/hmtx.md](./table/hmtx.md) |
| OpenType tables | `tableCmap` | [table/cmap.md](./table/cmap.md) |
| OpenType tables | `tableName` | [table/name.md](./table/name.md) |
| OpenType tables | `tableOs2` | [table/os2.md](./table/os2.md) |
| OpenType tables | `tablePost` | [table/post.md](./table/post.md) |
| OpenType tables | `tableLoca` | [table/loca.md](./table/loca.md) |
| OpenType tables | `tableGlyf` | [table/glyf.md](./table/glyf.md) |
| OpenType tables | `tableCff` | [table/cff.md](./table/cff.md) |
| OpenType tables | `tableKern` | [table/kern.md](./table/kern.md) |
| OpenType tables | `tableGasp` | [table/gasp.md](./table/gasp.md) |
| OpenType tables | `tableHdmx` | [table/hdmx.md](./table/hdmx.md) |
| OpenType tables | `tableVdmx` | [table/vdmx.md](./table/vdmx.md) |
| OpenType tables | `tableLtsh` | [table/ltsh.md](./table/ltsh.md) |
| OpenType tables | `tableGdef` | [table/gdef.md](./table/gdef.md) |
| OpenType tables | `tableGsub` | [table/gsub.md](./table/gsub.md) |
| OpenType tables | `tableGpos` | [table/gpos.md](./table/gpos.md) |
| OpenType tables | `tableFvar` | [table/fvar.md](./table/fvar.md) |
| OpenType tables | `tableAvar` | [table/avar.md](./table/avar.md) |
| OpenType tables | `tableStat` | [table/stat.md](./table/stat.md) |
| OpenType tables | `tableGvar` | [table/gvar.md](./table/gvar.md) |
| OpenType tables | `tableHvar` | [table/hvar.md](./table/hvar.md) |
| OpenType tables | `tableMvar` | [table/mvar.md](./table/mvar.md) |
| OpenType tables | `tableBase` | [table/base.md](./table/base.md) |
| OpenType tables | `tableCpal` | [table/cpal.md](./table/cpal.md) |
| OpenType tables | `tableColr` | [table/colr.md](./table/colr.md) |
| OpenType tables | `tableSbix` | [table/sbix.md](./table/sbix.md) |
| OpenType tables | `tableSvg` | [table/svg.md](./table/svg.md) |
| OpenType tables | `tableCbdt` | [table/cbdt.md](./table/cbdt.md) |
| OpenType tables | `tableCblc` | [table/cblc.md](./table/cblc.md) |
| OpenType tables | `tableCff2` | [table/cff2.md](./table/cff2.md) |
| OpenType tables | `tableVhea` | [table/vhea.md](./table/vhea.md) |
| OpenType tables | `tableVmtx` | [table/vmtx.md](./table/vmtx.md) |
| OpenType tables | `tableVorg` | [table/vorg.md](./table/vorg.md) |
| OpenType tables | `tableEbdt` | [table/ebdt.md](./table/ebdt.md) |
| OpenType tables | `tableEblc` | [table/eblc.md](./table/eblc.md) |
| OpenType tables | `tableEbsc` | [table/ebsc.md](./table/ebsc.md) |
| OpenType tables | `tableCmapFormats` | no page yet |
| OpenType tables | `tableColrPaint` | no page yet |
| OpenType tables | `tableCffCharstring` | no page yet |
| OpenType tables | `tableCffDict` | no page yet |
| OpenType tables | `tableCffIndexRecord` | no page yet |
| OpenType tables | `tableGsubScriptFeatureList` | no page yet |
| OpenType tables | `tableGsubTypes14` | no page yet |
| OpenType tables | `tableGsubTypes57` | no page yet |
| OpenType tables | `tableGposType1` | no page yet |
| OpenType tables | `tableGposType2` | no page yet |
| OpenType tables | `tableGposType3` | no page yet |
| OpenType tables | `tableGposType46` | no page yet |
| OpenType tables | `tableGposType78` | no page yet |
| OpenType tables | `tableGposType9` | no page yet |
| OpenType tables | `tableGposValueRecord` | no page yet |
| Variable-font helpers | `varCoordsConvert` | [variable/coordsConvert.md](./variable/coordsConvert.md) |
| Variable-font helpers | `varInstance` | [variable/instance.md](./variable/instance.md) |
| Glyph model | `fontPath` | [glyph/path.md](./glyph/path.md) |
| Glyph model | `fontGlyph` | [glyph/glyph.md](./glyph/glyph.md) |
| Glyph model | `fontCompositeResolve` | [glyph/compositeResolve.md](./glyph/compositeResolve.md) |
| embed-pdf | `embedClosure` | no page yet |
| embed-pdf | `embedCmapBuilder` | no page yet |
| embed-pdf | `embedGlyphRewriter` | no page yet |
| embed-pdf | `embedHash` | no page yet |
| embed-pdf | `embedSubsetForPdf` | [embed-pdf/subsetForPdf.md](./embed-pdf/subsetForPdf.md) |
| embed-pdf | `embedFontDescriptor` | [embed-pdf/fontDescriptor.md](./embed-pdf/fontDescriptor.md) |
| embed-pdf | `embedCidSystemInfo` | [embed-pdf/cidSystemInfo.md](./embed-pdf/cidSystemInfo.md) |
| embed-pdf | `embedToUnicodeBuilder` | [embed-pdf/toUnicodeBuilder.md](./embed-pdf/toUnicodeBuilder.md) |
| Layout, cmap | `layoutClassDefinitions` | [layout/classDefinitions.md](./layout/classDefinitions.md) |
| Layout, cmap | `cmapToUnicode` | [cmap/toUnicode.md](./cmap/toUnicode.md) |
| Standard 14 | `standard14Helvetica` | [standard14/helvetica.md](./standard14/helvetica.md) |
| Standard 14 | `standard14Times` | [standard14/times.md](./standard14/times.md) |
| Standard 14 | `standard14Courier` | [standard14/courier.md](./standard14/courier.md) |
| Standard 14 | `standard14Symbol` | [standard14/symbol.md](./standard14/symbol.md) |
| Standard 14 | `standard14ZapfDingbats` | [standard14/zapfDingbats.md](./standard14/zapfDingbats.md) |
| Standard 14 | `standard14Lookup` | [standard14/lookup.md](./standard14/lookup.md) |
| Encodings | `encodingWinAnsi` | [encodings/winAnsi.md](./encodings/winAnsi.md) |
| Encodings | `encodingMacRoman` | [encodings/macRoman.md](./encodings/macRoman.md) |
| Encodings | `encodingMacExpert` | [encodings/macExpert.md](./encodings/macExpert.md) |
| Encodings | `encodingStandard` | [encodings/standard.md](./encodings/standard.md) |
| Encodings | `encodingSymbol` | [encodings/symbol.md](./encodings/symbol.md) |
| Encodings | `encodingZapfDingbats` | [encodings/zapfDingbats.md](./encodings/zapfDingbats.md) |
| Encodings | `encodingLookup` | [encodings/lookup.md](./encodings/lookup.md) |
| Encodings | `encodingAglTable` | [encodings/aglTable.md](./encodings/aglTable.md) |
| Encodings | `encodingAgl` | [encodings/agl.md](./encodings/agl.md) |
| Orchestrator | `fonts` | [fonts.md](./fonts.md) |
| Bundles | `fontsLargeBundle` | [bundles/fonts-large.md](./bundles/fonts-large.md) |
| Bundles | `fontsFullBundle` | [bundles/fonts-full.md](./bundles/fonts-full.md) |
| Bundles | `fontsAppleAatBundle` | [bundles/fonts-apple-aat.md](./bundles/fonts-apple-aat.md) |

`embedSubsetForPdf` depends on four sub-modules (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash`); `modules` registers all four before it, and each is also re-exported by its binding name. See [subsetForPdf](./embed-pdf/subsetForPdf.md).

See [api/README](./README.md) for the per-module page list.

## Examples

### Registration and resolution

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const fonts = fw.runtime.resolve('fonts');
const { parseMath } = fw.runtime.resolve('extraMath');
```

### Import by sub-path

```js
import { fonts } from '@awacloud/fonts';
import { fonts as fontsDirect } from '@awacloud/fonts/fonts';
import { extraMath } from '@awacloud/fonts/extra/math';
```

## Notes

- Order in `modules` follows dependencies: `fontErrors` first, then primitives, sfnt containers, tables, glyph, and `fonts` last.
- There is **no default export** — always import the named bindings (`fw_require`, `modules`, `fonts`, etc.).
- `package.json#exports` only declares a fixed set of sub-paths (`.`, `./fonts`, `./embed-pdf/*`, `./encodings`, `./standard14`, `./cmap-to-unicode`, `./extra/*`, `./bundles/*`, `./build/*`, `./standalone/*`) — there is no generic `./<anything>` sub-path, so for example `@awacloud/fonts/sfnt` does not resolve; import `fontSfnt` from the package root instead.

## See also

- [fonts](./fonts.md) — application entry point
- [errors](./errors.md)
