---
module: fontCompositeResolve
category: glyph/compositeResolve
dependencies: [fontErrors, fontPath]
returns: object
worker-safe: true
status: complete
---

# fontCompositeResolve

> Recursive flattening of a composite glyph into a single `Path`.

**Module** `fontCompositeResolve` | **Source** `packages/front/office/fonts/src/glyph/compositeResolve.js` | **Deps** `fontErrors`, `fontPath` | **Worker-safe** yes

Follows [OT spec §glyf composite description](https://learn.microsoft.com/en-us/typography/opentype/spec/glyf#composite-glyph-description): each component references a glyph by index, applies a 2×2 F2Dot14 transform + XY offset (`ARGS_ARE_XY_VALUES` mode) to it, and concatenates its commands onto the result path. The point-to-point (anchor) mode falls back to a (0, 0) offset — rarely used in practice.

## Resolve

```js
const { resolveGlyphPath, MAX_DEPTH } = runtime.resolve('fontCompositeResolve');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `resolveGlyphPath` | `(glyphs: Array, index: number, visited?: Set, depth?: number) => Path` | Flattened path, ready to render. |
| `MAX_DEPTH` | `number` | `16` — nesting cap beyond which `RenderError` is thrown. |

### Behavior

- `null` glyph ⇒ empty Path.
- `kind === 'simple'` ⇒ delegates to `pathFromSimpleGlyph`.
- `kind === 'composite'` ⇒ iterates `components`, applies transform + offset, concatenates.
- Unknown `kind` ⇒ `RenderError('fonts/composite-bad-kind')`.
- Cycle detected ⇒ `RenderError('fonts/composite-cycle')`.
- Depth > 16 ⇒ `RenderError('fonts/composite-depth')`.

## Examples

```js
const { resolveGlyphPath } = runtime.resolve('fontCompositeResolve');
const path = resolveGlyphPath(glyphTable, 42);
console.log(path.toSvgPath());
```

## Notes

- The OT spec mandates ≤ 4 nesting levels, but real-world fonts occasionally exceed it — this module accepts up to 16 to stay pragmatic.
- Flattening is lazy per call: `font.getGlyphByIndex` triggers it on every access, no memoization.
- Out-of-range index or non-array input throws `ContractError`.

## See also

- [glyph](./glyph.md)
- [path](./path.md)
- [glyf](../table/glyf.md) — `composite` schema
- [errors](../errors.md)
