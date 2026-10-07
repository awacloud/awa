# Content — ISO 32000-2 §7.8 / §8 / §9.3–§9.4

Content-stream layer: decoded `Uint8Array` → typed ops → gstate / text / colour
applied, plus typed XObjects.

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [`pdfContentOps`](./ops.md) | `{ OPS, OP_NAMES, lookupOp, isOp }` | none | Operator table §8.2 + §9.4. |
| [`pdfContentStream`](./stream.md) | `{ parseContentStream }` | `pdfErrors`, `pdfParser`, `pdfContentOps` | Bytes → ops §7.8. |
| [`pdfGraphics`](./graphics.md) | `{ GStateStack, createStack, applyOp, initialGState, mulCtm }` | `pdfErrors` | Graphics-state stack §8.4. |
| [`pdfText`](./text.md) | `{ setFont, beginTextObject, td, tdSetLeading, setTextMatrix, nextLine, rawStringBytes, extractText }` | `pdfErrors` | Text state + Tm/Tlm §9.3. |
| [`pdfColor`](./color.md) | `{ applyColorOp }` | `pdfErrors` | Colour §8.6. |
| [`pdfImages`](./images.md) | `{ typeImageXObject, typeFormXObject, typeXObject }` | `pdfErrors`, `pdfParser` | XObjects §8.9 / §8.10. |

## Common pattern

```js
const cs = runtime.resolve('pdfContentStream');
const g  = runtime.resolve('pdfGraphics');
const ops = cs.parseContentStream(decodedBytes);
const stack = g.createStack();
for (const op of ops) g.applyOp(stack, op);
```

## See also

- [Document layer](../document/README.md) — supplies `pageDict` and Resources.
- [Font layer](../font/README.md) — feeds `pdfText.extractText`.
- [Syntax layer](../syntax/README.md) — the underlying `pdfParser`.
