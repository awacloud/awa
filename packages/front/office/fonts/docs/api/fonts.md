---
module: fonts
category: fonts
dependencies: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableCmap, tableName, tableOs2, tablePost, tableLoca, tableGlyf, tableGvar, fontGlyph, fontCompositeResolve]
returns: object
worker-safe: true
status: complete
---

# fonts

> Top-level orchestrator — reads a TTF/OTF byte stream and returns a navigable `Font` object.

**Module** `fonts` | **Source** `packages/front/office/fonts/src/fonts.js` | **Deps** `fontErrors`, `fontSfnt`, `tableHead`, `tableHhea`, `tableMaxp`, `tableHmtx`, `tableCmap`, `tableName`, `tableOs2`, `tablePost`, `tableLoca`, `tableGlyf`, `tableGvar`, `fontGlyph`, `fontCompositeResolve` | **Worker-safe** yes

Application entry point of `@awacloud/fonts`. Parses the SFNT header, the 8 required tables, `loca`/`glyf` when present, and assembles an immutable `Font` object exposing glyph, metric and name accessors.

`fonts.read` only reads: writing is provided by separate modules (the per-table `encode<Name>` functions, `embed-pdf/subsetForPdf`, `extra/woff2-write`). It assembles the TrueType (`glyf`) outline model; for an OTF font with CFF outlines `glyphTable` and `loca` are `null` and every `Glyph.path` is `null` — CFF CharStrings are parsed by the separate `table/cff` modules, which `fonts.read` does not call.

## Resolve

```js
const fonts = runtime.resolve('fonts');
// { read, use, buildFont, KNOWN_HOOKS, SFNT_FLAVOR }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(bytes: Uint8Array) => Font` | Builds a complete `Font` object. |
| `use` | `(...exts: object[]) => fonts` | Registers hook-based extensions (`hydrateFont`, …). Idempotent. |
| `buildFont` | `(sfnt: SfntFile) => Font` | Builds a `Font` from an already-parsed SFNT directory (used internally by `read`; also exposed for callers that already hold a `parseSfnt` result). |
| `KNOWN_HOOKS` | `string[]` | List of hooks recognized by `use()`. |
| `SFNT_FLAVOR` | `object` | Flavor constants — re-exported from [sfnt](./sfnt/sfnt.md). |

### `Font` object

| Field | Type | Description |
|-------|------|-------------|
| `flavor` | `'truetype' \| 'opentype' \| 'apple-true' \| 'apple-typ1'` | SFNT flavor. |
| `sfntVersion` | `number` | Raw `sfntVersion` field from the SFNT header. |
| `rawSfnt` | `SfntFile` | The underlying parsed SFNT directory (see [sfnt](./sfnt/sfnt.md)), kept for callers that need raw table bytes (e.g. subsetting). |
| `head`, `hhea`, `maxp`, `hmtx`, `cmap`, `name`, `os2`, `post` | parsed objects | OT tables (the last two can be `null`). |
| `loca` | `Uint32Array \| null` | Offsets into `glyf` (TT only). |
| `glyphTable` | `Array<object \| null> \| null` | Raw glyphs (TT only). |
| `numGlyphs` | `number` | Taken from `maxp`. |
| `unitsPerEm` | `number` | Taken from `head`. |
| `unicodeMap` | `Map<number, number>` | code point → gid (from `cmap`). |
| `names` | `object` | `{ family, subfamily, fullName, postScriptName, version, copyright, manufacturer, designer }`. |
| `advanceWidth(gid)` | `(number) => number` | 0 if out of range. |
| `leftSideBearing(gid)` | `(number) => number` | 0 if out of range. |
| `glyphIndexForCodePoint(cp, opts?)` | `(number, { strict?: boolean }) => number` | 0 if unmapped; pass `{ strict: true }` to get `-1` instead. |
| `getGlyphByIndex(gid)` | `(number) => Glyph` | Throws `ContractError` if out of range. |
| `getGlyphByCodePoint(cp)` | `(number) => Glyph` | Returns the `.notdef` glyph (gid 0) if unmapped. |

### Extension hooks

`use()` accepts objects exposing any subset of the following callbacks. Each is called after the corresponding hydration phase:

`hydrateFont`, `dehydrateFont`, `hydrateGlyph`, `dehydrateGlyph`, `hydrateTable`, `dehydrateTable`, `hydrateName`, `dehydrateName`.

## Examples

### Basic read

```js
const fonts = runtime.resolve('fonts');
const font = fonts.read(bytes);
console.log(font.names.family, font.numGlyphs);
const gA = font.getGlyphByCodePoint(0x41);
console.log(gA.advanceWidth, gA.path && gA.path.toSvgPath());
```

### With an extension

```js
fonts.use({ hydrateFont(f) { f.aspectRatio = buildAspectRatio(f); } })
     .read(bytes);
```

## Worker usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const font = libs.fonts.read(args[0]);
        self.postMessage({ family: font.names.family, numGlyphs: font.numGlyphs });
    },
    { dependencies: ['fonts'], args: [bytes] }
);
```

## Notes

- `fonts.read` requires a `Uint8Array` — any other input throws `ContractError('fonts/read-input')`.
- Missing required tables throw `ParseError('fonts/missing-<table>')`.
- `OS/2` and `post` are optional; when absent, the corresponding fields are `null`.
- `getGlyphByIndex` materializes the `Path` on demand via `resolveGlyphPath` (lazy per call, not cached).

## See also

- [sfnt](./sfnt/sfnt.md) — container parsed upstream
- [glyph](./glyph/glyph.md) — type returned by the getters
- [compositeResolve](./glyph/compositeResolve.md) — composite flattening
- [errors](./errors.md)
