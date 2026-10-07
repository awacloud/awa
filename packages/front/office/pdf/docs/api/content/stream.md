---
module: pdfContentStream
category: pdf/content
dependencies: [pdfErrors, pdfParser, pdfContentOps]
returns: object
worker-safe: true
status: complete
---

# pdfContentStream

> Content-stream parser — decoded `Uint8Array` → ordered list of typed operations. ISO 32000-2 §7.8 + §8.2 + Table 60.

**Module** `pdfContentStream` | **Source** `packages/front/office/pdf/src/content/stream.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfContentOps` | **Worker-safe** yes

Reads the bytes of an **already decoded** content stream (the `/Filter` chain
must have been applied by `pdfFilterDispatch` upstream) and produces
`[{ op, args, data? }]`. Operands stay **typed** (`{ type, value, … }`) — a `Tj`
carries its typed `string`, ready for ToUnicode resolution; a `gs` carries its
`name`, usable directly against `/Resources /ExtGState`. Inline images
`BI … ID … EI` (§8.9.7) are captured as a single synthetic op with
`data: Uint8Array`.

## Resolve

```js
const csMod = runtime.resolve('pdfContentStream');
// Returns: { parseContentStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseContentStream` | `(bytes: Uint8Array) => Op[]` | Ordered list of operations. |

### `Op` shape

```js
{
    op: string,         // mnemonic (e.g. 'Tj', 'cm', 'BI', '__trailing__')
    args: PdfObject[],  // typed operands, in stack order
    data?: Uint8Array   // present only for 'BI' (raw image data)
}
```

A synthetic `{ op: '__trailing__', args }` is appended when the stream ends on
unconsumed operands — this preserves rewrite fidelity.

### Inline images

```js
{
    op: 'BI',
    args: [{ type: 'dict', entries: { Width, Height, ColorSpace, Filter, … } }],
    data: Uint8Array  // raw bytes between `ID\n` and the space before `EI`
}
```

## Examples

### Parse a minimal stream

```js
const cs = runtime.resolve('pdfContentStream');
const bytes = new TextEncoder().encode('BT /F1 12 Tf (Hello) Tj ET');
const ops = cs.parseContentStream(bytes);
// → [{op:'BT',args:[]}, {op:'Tf',args:[name,int]}, {op:'Tj',args:[string]}, {op:'ET',args:[]}]
```

### Extract the font names in use

```js
const fonts = new Set();
for (const op of ops) {
    if (op.op === 'Tf') fonts.add(op.args[0].value);  // args[0] = name
}
```

### Inline image

```js
const ops = cs.parseContentStream(streamBytes);
const img = ops.find(o => o.op === 'BI');
img.args[0].entries.W;   // typed int
img.data;                // Uint8Array — feed to pdfFilterDispatch when /F is set
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/content/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/content/unknown-op` | `ParseError` | Unknown mnemonic (absent from `pdfContentOps`). |
| `pdf/content/inline-image/no-ID` | `ParseError` | `BI` without a matching `ID`. |
| `pdf/content/inline-image/bad-key` | `ParseError` | Non-`name` key in the inline dictionary. |
| `pdf/content/inline-image/no-EI` | `ParseError` | `ID` without a matching `EI`. |

It also propagates the `pdf/parser/*` codes while parsing operands.

## See also

- [`pdfContentOps`](./ops.md) — operator table.
- [`pdfGraphics`](./graphics.md) — applies the `gstate` ops.
- [`pdfText`](./text.md) — decodes the `text` ops.
- [`pdfColor`](./color.md) — applies the `color` ops.
- [`pdfImages`](./images.md) — types the XObjects (`Do`).
