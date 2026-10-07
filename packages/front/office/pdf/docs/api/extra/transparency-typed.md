---
module: pdfTransparencyTyped
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfTransparencyTyped

> Transparency Group (§11.6.6), Soft Mask (§11.6.5.2), blend modes (§11.3.5) — ISO 32000-2.

**Module** `pdfTransparencyTyped` | **Source** `packages/front/office/pdf/src/extra/transparency-typed.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types the group attributes `/Group /S /Transparency` (§11.6.6), the soft masks `/Luminosity` / `/Alpha` with `/TR` transfer (§11.6.5.2), and exposes the frozen catalog of standard blend modes (§11.3.5 Table 136).

## Resolve

```js
const ext = runtime.resolve('pdfTransparencyTyped');
// Returns: { typeTransparencyGroup, typeSoftMask, resolveBlendMode, BLEND_MODES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeTransparencyGroup` | `(dict) => Group` | `{ s, cs, isolated, knockout, raw, _extras }`. |
| `typeSoftMask` | `(dict) => SoftMask` | `{ kind, g, backdrop, transfer, raw, _extras }`. |
| `resolveBlendMode` | `(value) => string \| null` | Decodes a name or the first recognized name in an array. |
| `BLEND_MODES` | frozen array | 17 standard modes (includes `Compatible`). |

## Examples

### Group

```js
const ext = runtime.resolve('pdfTransparencyTyped');
const g = ext.typeTransparencyGroup(groupDict);
g.s;         // 'Transparency'
g.cs;        // raw /CS entry
g.isolated;  // true
g.knockout;  // false
```

### Blend mode resolution

```js
ext.resolveBlendMode({ type: 'name', value: 'Multiply' }); // 'Multiply'
ext.resolveBlendMode({ type: 'array', items: [
    { type: 'name', value: 'Saturation' },
    { type: 'name', value: 'Normal' }
]}); // 'Saturation' (first recognized name)
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/transparency-group/not-dict` | `ParseError` | Group is not a dict. |
| `pdf/extra/transparency-group/bad-type` | `ParseError` | `/Type` present and not `/Group`. |
| `pdf/extra/transparency-group/bad-s` | `ParseError` | `/S` is not `/Transparency`. |
| `pdf/extra/soft-mask/not-dict` | `ParseError` | SoftMask is not a dict. |
| `pdf/extra/soft-mask/bad-type` | `ParseError` | `/Type` is not `/Mask`. |
| `pdf/extra/soft-mask/bad-s` | `ParseError` | `/S` is not `Luminosity`/`Alpha`. |
| `pdf/extra/soft-mask/missing-g` | `ParseError` | `/G` (transparency group XObject) absent. |
| `pdf/extra/blend-mode/bad-type` | `ParseError` | Value is neither a name nor an array. |

## See also

- [`pdfGraphics`](../content/graphics.md)
- [`pdfContentOpsExtended`](./content-ops-extended.md)
- [Extras index](./README.md)
