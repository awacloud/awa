# Glyph

High-level glyph model: resolution-independent `Path`, the `Glyph` wrapper, and composite flattening.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [glyph](./glyph.md) | `{Glyph}` | none | `Glyph` class (gid + path + metrics). |
| [path](./path.md) | `{Path, pathFromSimpleGlyph}` | none | Path with M/L/Q/C/Z commands + TT reconstruction. |
| [compositeResolve](./compositeResolve.md) | `{resolveGlyphPath, MAX_DEPTH}` | `fontErrors`, `fontPath` | Flattens a composite into a single `Path`. |

## Common pattern

```js
const font = fonts.read(bytes);
const g = font.getGlyphByCodePoint(0x41);
console.log(g.path.toSvgPath());
```
