---
module: pdfShadingTyped
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfShadingTyped

> Typed Shading dicts (§8.7.4) and Function dicts (§7.10) — ISO 32000-2.

**Module** `pdfShadingTyped` | **Source** `packages/front/office/pdf/src/extra/shading-typed.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Shadings 1–7 (Function-based, Axial, Radial, Free-form Gouraud, Lattice-form Gouraud, Coons patch mesh, Tensor-product patch mesh). Functions 0/2/3/4 (Sampled, Exponential, Stitching, PostScript).

## Resolve

```js
const ext = runtime.resolve('pdfShadingTyped');
// Returns: { typeShading, typeFunction, typePattern, PATTERN_KEYS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeShading` | `(dict\|stream) => Shading` | Record shaped by `/ShadingType`. |
| `typeFunction` | `(dict\|stream) => Function` | Record shaped by `/FunctionType`. |
| `typePattern` | `(dict\|stream) => Pattern` | A pattern dictionary or stream (its dictionary read) of `/PatternType` 1 (tiling) or 2 (shading): one field per key of its type's list, named after the key in lower case (`PaintType` → `painttype`, `XStep` → `xstep`), present only when the key is — a name, a number, an integer by its value, an array (a rectangle or matrix included), a dictionary or a stream as read (a reference as read), `null` for a value of none of the key's types; a stream's Table 5 keys (`Length`, `Filter` …) left to `typeStreamEntries`; plus `raw` and `_extras` (the other keys). |
| `PATTERN_KEYS` | frozen object | Pattern type → its keys (the Arlington PDF Model's lists). |

## Examples

### Axial shading

```js
const ext = runtime.resolve('pdfShadingTyped');
const sh = ext.typeShading(shadingDict);
sh.shadingType;  // 2
sh.coords;       // [x0, y0, x1, y1]
sh.function;     // raw /Function entry
```

### Stitching function

```js
const fn = ext.typeFunction(fnDict);
fn.functionType;  // 3
fn.functions;     // array of sub-function entries
fn.bounds;        // [...]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/shading/not-dict-or-stream` | `ParseError` | Invalid input. |
| `pdf/extra/shading/missing-type` | `ParseError` | `/ShadingType` absent. |
| `pdf/extra/shading/bad-type` | `ParseError` | `/ShadingType` outside 1..7. |
| `pdf/extra/shading/pattern/not-dict` | `ParseError` | `typePattern`: neither a dictionary nor a stream. |
| `pdf/extra/shading/pattern/bad-type` | `ParseError` | `typePattern`: `/PatternType` missing or not 1, 2. |
| `pdf/extra/shading/lattice-missing-vpr` | `ParseError` | Type 5 without `/VerticesPerRow`. |
| `pdf/extra/shading/mesh-missing-bits` | `ParseError` | Type 4/6/7 without `/BitsPerCoordinate`/`/BitsPerComponent`. |
| `pdf/extra/shading/mesh-missing-decode` | `ParseError` | `/Decode` absent. |
| `pdf/extra/shading/mesh-missing-flag` | `ParseError` | `/BitsPerFlag` absent (Type 4/6/7). |
| `pdf/extra/shading/bad-coords` | `ParseError` | `/Coords` malformed. |
| `pdf/extra/function/not-dict-or-stream` | `ParseError` | Invalid input. |
| `pdf/extra/function/missing-type` | `ParseError` | `/FunctionType` absent. |
| `pdf/extra/function/bad-type` | `ParseError` | `/FunctionType` outside {0,2,3,4}. |

## See also

- [`pdfColorSpacesExtended`](./color-spaces-extended.md)
- [`pdfGraphics`](../content/graphics.md)
- [Extras index](./README.md)
