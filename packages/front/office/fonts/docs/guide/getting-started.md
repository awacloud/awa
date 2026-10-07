# Getting started

`@awacloud/fonts` reads a TrueType or OpenType file (TTF, OTF) and exposes a
navigable `Font` object. No dependency beyond `@awacloud/fw`.

**Prerequisites**: the `@awacloud/fonts` package (root sub-path) and an
`@awacloud/fw` runtime. Every module of the package is a factory descriptor
whose dependencies are injected by that runtime, so a descriptor such as
`fonts` is registered and then resolved by name — it is never called directly
with no arguments. The examples below assume `bytes` is the `Uint8Array` of a
`.ttf` or `.otf` file.

## Reading a TTF / OTF file

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const api  = fw.runtime.resolve('fonts');
const font = api.read(bytes);
```

The returned `font` object exposes:

```js
font.flavor              // 'truetype' | 'opentype' | 'apple-true' | 'apple-typ1'
font.unitsPerEm          // typically 1000 (CFF) or 2048 (TT)
font.numGlyphs           // total glyph count
font.names.family        // e.g. 'Liberation Sans'
font.names.subfamily     // e.g. 'Regular'
font.names.fullName      // e.g. 'Liberation Sans'
font.names.postScriptName

font.head                // parsed head table (xMin, yMax, flags, …)
font.hhea, font.maxp, font.hmtx, font.cmap, font.name, font.os2, font.post
font.glyphTable          // array of glyphs (kind: 'simple' | 'composite')
font.loca                // Uint32Array of offsets
font.unicodeMap          // Map<codePoint, gid>
```

## Getting a glyph

```js
const gid   = font.glyphIndexForCodePoint(0x41);   // 'A' → gid
const glyph = font.getGlyphByIndex(gid);

glyph.id              // gid
glyph.name            // PostScript name (from post v2.0)
glyph.advanceWidth    // from hmtx
glyph.lsb             // left side bearing
glyph.bbox            // { xMin, yMin, xMax, yMax }
glyph.path            // resolved Path (composites flattened)
glyph.path.toSvgPath()  // → "M1167 0 L1006 412 …"
```

## Extending with `.use(...)`

```js
api.use({
    hydrateFont(font) {
        // add derived fields
        font.aspectRatio = (font.head.xMax - font.head.xMin) / font.unitsPerEm;
    }
});
const extended = api.read(bytes);
console.log(extended.aspectRatio);
```

Registration is idempotent — passing the same `ext` object again does not re-register it.

## Typed errors

Resolve the error classes from the same runtime as `fonts`: every
`fontErrors.factory()` call declares its own class identities, so a class
obtained from a separate direct call is not the one `read` throws.

```js
const { ParseError, ContractError } = fw.runtime.resolve('fontErrors');

try { api.read(bytes); }
catch (e) {
    if (e instanceof ParseError) console.warn('malformed file:', e.code);
    else if (e instanceof ContractError) console.warn('invalid API usage:', e.code);
    else throw e;
}
```

## See also

- [API: fonts](../api/fonts.md)
- [API: table/glyf](../api/table/glyf.md)
- [API: errors](../api/errors.md)
