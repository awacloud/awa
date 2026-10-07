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
// Returns: { typeShading, typeFunction }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeShading` | `(dict\|stream) => Shading` | Record shaped by `/ShadingType`. |
| `typeFunction` | `(dict\|stream) => Function` | Record shaped by `/FunctionType`. |

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
