---
module: pdfContentOps
category: pdf/content
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pdfContentOps

> Exhaustive catalogue of content-stream operators — ISO 32000-2 §8.2 Table 60 + §9.4.

**Module** `pdfContentOps` | **Source** `packages/front/office/pdf/src/content/ops.js` | **Deps** none | **Worker-safe** yes

Single source of truth for the PDF operator mnemonics, their **category**
(`gstate`, `path`, `paint`, `clip`, `color`, `shading`, `image`, `xobject`,
`marked`, `text`) and their expected **arity**. Consumed by `pdfContentStream`
for categorisation, and by any linter wanting to validate a stream's coherence.
71 operators are registered.

## Resolve

```js
const opsMod = runtime.resolve('pdfContentOps');
// Returns: { OPS, OP_NAMES, lookupOp, isOp }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `OPS` | `Object<string, OpRecord>` (frozen) | Full table, keyed by mnemonic. |
| `OP_NAMES` | `string[]` (frozen) | Alphabetically sorted list (71 entries). |
| `lookupOp` | `(mnemonic: string) => OpRecord \| undefined` | Direct lookup. |
| `isOp` | `(mnemonic: string) => boolean` | Membership test. |

### `OpRecord` shape

```js
{ op: string, category: string, arity: number | 'var', desc: string }
```

`arity` is `'var'` for exactly four operators — `SC`, `sc`, `SCN`, `scn` —
whose operand count depends on the current colour space. `TJ` has arity `1`
(the single positioning array).

### Categories covered

| Category | §ISO | Count | Operators |
|----------|------|-------|-----------|
| `gstate` | §8.4 | 13 | `q`, `Q`, `cm`, `w`, `J`, `j`, `M`, `d`, `ri`, `i`, `gs`, `d0`, `d1` |
| `path` | §8.5.2 | 7 | `m`, `l`, `c`, `v`, `y`, `h`, `re` |
| `paint` | §8.5.3 | 10 | `S`, `s`, `f`, `F`, `f*`, `B`, `B*`, `b`, `b*`, `n` |
| `clip` | §8.5.4 | 2 | `W`, `W*` |
| `color` | §8.6 | 12 | `CS`, `cs`, `SC`, `sc`, `SCN`, `scn`, `G`, `g`, `RG`, `rg`, `K`, `k` |
| `shading` | §8.7 | 1 | `sh` |
| `image` | §8.9.7 | 3 | `BI`, `ID`, `EI` |
| `xobject` | §8.10 | 1 | `Do` |
| `marked` | §14.6 | 5 | `MP`, `DP`, `BMC`, `BDC`, `EMC` |
| `text` | §9.3 / §9.4 | 17 | `BT`, `ET`, `Tc`, `Tw`, `Tz`, `TL`, `Tf`, `Tr`, `Ts`, `Td`, `TD`, `Tm`, `T*`, `Tj`, `'`, `"`, `TJ` |

## Examples

### Lookup

```js
const { lookupOp, isOp } = runtime.resolve('pdfContentOps');
lookupOp('Tj');  // { op: 'Tj', category: 'text', arity: 1, desc: 'show text' }
isOp('xyz');     // false
isOp('cm');      // true
```

### Iterating by category

```js
const { OPS } = runtime.resolve('pdfContentOps');
const textOps = Object.values(OPS).filter(o => o.category === 'text');
textOps.length;  // 17
```

### Validating an operator's arity

```js
const rec = lookupOp(op.op);
if (rec.arity !== 'var' && op.args.length !== rec.arity) {
    throw new Error(`${op.op}: expected ${rec.arity} args, got ${op.args.length}`);
}
```

## Errors

A table module with no I/O — it emits no `PdfError`. Consumers
(`pdfContentStream`, linters) surface their own errors.

## See also

- [`pdfContentStream`](./stream.md) — consumes `isOp` to recognise operators.
- [`pdfGraphics`](./graphics.md), [`pdfText`](./text.md), [`pdfColor`](./color.md) — dispatch by category.
- [`pdfImages`](./images.md) — types the XObjects invoked by `Do`.
