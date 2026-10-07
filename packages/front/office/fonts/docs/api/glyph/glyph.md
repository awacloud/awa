---
module: fontGlyph
category: glyph/glyph
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontGlyph

> High-level glyph — wraps outline + advance/lsb + PostScript name.

**Module** `fontGlyph` | **Source** `packages/front/office/fonts/src/glyph/glyph.js` | **Deps** none | **Worker-safe** yes

Immutable wrapper around a parsed `glyf` entry (or, later, a CFF CharString), enriched with `advanceWidth`/`lsb` from `hmtx` and the PostScript name from `post`.

## Resolve

```js
const { Glyph } = runtime.resolve('fontGlyph');
```

## API

| Symbol | Type | Description |
|---------|------|-------------|
| `Glyph` | class | See below. |

### Constructor

`new Glyph(init)`:

| `init` field | Type | Description |
|--------------|------|-------------|
| `id` | `number` | Glyph index (gid). |
| `name` | `string` | PostScript name (optional). |
| `advanceWidth` | `number` | From `hmtx`. |
| `lsb` | `number` | Left side bearing. |
| `bbox` | `{xMin,yMin,xMax,yMax}` | Optional. |
| `path` | `Path` | See [path](./path.md). |
| `components` | `Array` | Component list if composite. |

### Properties / methods

| Member | Signature | Description |
|--------|-----------|-------------|
| `id`, `name`, `advanceWidth`, `lsb`, `bbox`, `path`, `components` | — | Fields exposed as-is. |
| `isEmpty()` | `() => boolean` | `true` if there is no `path` or the path is empty. |
| `isComposite()` | `() => boolean` | `true` if `components` is non-null. |

## Examples

```js
const font = fonts.read(bytes);
const g = font.getGlyphByCodePoint(0x41);
if (!g.isEmpty()) console.log(g.path.toSvgPath());
```

## Notes

- `Glyph` is conceptually immutable — no setters; mutating fields directly is outside the contract.
- `bbox` reflects the `glyf` header (for TT); `path.bbox()` recomputes it from the commands.

## See also

- [path](./path.md)
- [compositeResolve](./compositeResolve.md)
- [fonts](../fonts.md)
