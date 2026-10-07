---
module: pdfContentOpsExtended
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfContentOpsExtended

> Extended graphics-state operators and full ExtGState catalog — ISO 32000-2 §8.4.5.

**Module** `pdfContentOpsExtended` | **Source** `packages/front/office/pdf/src/extra/content-ops-extended.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Covers `d0`/`d1` (Type 3 glyph-width operators, §9.6.4) and every key of the `/ExtGState` dictionary (Table 57). Unknown keys are preserved under `_extras`.

## Resolve

```js
const ext = runtime.resolve('pdfContentOpsExtended');
// Returns: { typeExtGState, decodeType3CharOp, EXT_GSTATE_KEYS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeExtGState` | `(dict) => ExtGState` | Typed record covering every §8.4.5 Table 57 entry. |
| `decodeType3CharOp` | `(op: string, operands: number[]) => { kind, wx, wy, bbox? }` | `d0` or `d1`. |
| `EXT_GSTATE_KEYS` | frozen catalog | Map key → `{ kind, doc }`. |

### Shape `ExtGState`

```js
{
    type, lw, lc, lj, ml, d, ri, op, opNs, opm, font,
    bg, bg2, ucr, ucr2, tr, tr2, ht, fl, sm, sa,
    bm, sMask, ca, caNs, ais, tk, useBlackPtComp, hto,
    raw, _extras
}
```

## Examples

### Type a full ExtGState

```js
const ext = runtime.resolve('pdfContentOpsExtended');
const gs = ext.typeExtGState(doc._raw.resolve(extGStateRef));
gs.ca;    // 0.5
gs.bm;    // { type: 'name', value: 'Multiply' }
```

### Decode a Type 3 operator

```js
ext.decodeType3CharOp('d1', [600, 0, 0, 0, 500, 700]);
// { kind: 'd1', wx: 600, wy: 0, bbox: [0, 0, 500, 700] }
```

### Key catalog

```js
ext.EXT_GSTATE_KEYS.CA.doc;  // 'stroke alpha [0,1]'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/ext-gstate/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/ext-gstate/bad-type` | `ParseError` | `/Type` present and not `/ExtGState`. |
| `pdf/extra/content-ops/unknown` | `ParseError` | Operator is neither `d0` nor `d1`. |
| `pdf/extra/content-ops/bad-d0` | `ParseError` | `d0` does not have exactly 2 operands. |
| `pdf/extra/content-ops/bad-d1` | `ParseError` | `d1` does not have exactly 6 operands. |

## See also

- [`pdfContentOps`](../content/ops.md)
- [`pdfFont`](../font/font.md)
- [Extras index](./README.md)
