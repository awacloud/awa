---
module: pdfSerializer
category: pdf/syntax
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfSerializer

> Typed PDF objects → `Uint8Array` — canonical emission, ISO 32000-2 §7.3.

**Module** `pdfSerializer` | **Source** `packages/front/office/pdf/src/syntax/serializer.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Strict inverse of [`pdfParser`](./parser.md). Emits any typed object (`null`,
`bool`, `int`, `real`, `name`, `string`, `array`, `dict`, `ref`) as bytes.
`stream` objects are not emitted directly — go through `serializeIndirect`,
which rewrites `/Length` to the exact raw byte count. `real` values follow
§7.3.3 (fixed point, no exponent notation, trailing zeros stripped). `name`
values are `#xx`-escaped for every delimiter, space, or byte outside `!`..`~`.
`string` values automatically pick the literal `(…)` or hex `<…>` form based on
the density of non-printable bytes, unless `syntax: 'hex'` is explicit.

## Resolve

```js
const ser = runtime.resolve('pdfSerializer');
// Returns: { serializeObject, serializeIndirect, formatReal }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `serializeObject` | `(obj: PdfObject) => Uint8Array` | Bytes of a standalone object. |
| `serializeIndirect` | `(num: number, gen: number, body: PdfObject) => Uint8Array` | `<n> <g> obj … endobj\n`. |
| `formatReal` | `(n: number) => string` | Canonical real per §7.3.3. |

### `serializeIndirect`

For a `stream` body, the dictionary is cloned with `/Length` forced to
`body.raw.length`. The result follows
`<n> <g> obj\n<<…>>\nstream\n<raw>\nendstream\nendobj\n`. Any other type is
serialised inline between `obj` and `endobj`.

## Examples

### Emit a dictionary

```js
const ser = runtime.resolve('pdfSerializer');
const dict = {
    type: 'dict',
    entries: {
        Type: { type: 'name', value: 'Catalog' },
        Pages: { type: 'ref', num: 2, gen: 0 }
    }
};
const bytes = ser.serializeObject(dict);
// → "<< /Type /Catalog /Pages 2 0 R >>"
```

### Emit an indirect definition

```js
const def = ser.serializeIndirect(1, 0, dict);
// → "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
```

### Emit a stream — `/Length` recomputed

```js
const raw = new TextEncoder().encode('BT /F1 12 Tf (Hi) Tj ET');
const stream = {
    type: 'stream',
    dict: { type: 'dict', entries: {} },
    raw
};
const bytes = ser.serializeIndirect(4, 0, stream);
// `/Length` is raw.length, whatever the dict said.
```

### Canonical reals

```js
ser.formatReal(1.5);        // '1.5'
ser.formatReal(2);          // '2'
ser.formatReal(0.0500);     // '0.05'
ser.formatReal(-0);         // '0'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/serializer/bad-input` | `RenderError` | `serializeObject` given something other than a typed object. |
| `pdf/serializer/bad-num` | `RenderError` | `num` not a non-negative integer. |
| `pdf/serializer/bad-gen` | `RenderError` | `gen` not a non-negative integer. |
| `pdf/serializer/bad-real` | `RenderError` | Non-finite real (`NaN`, `Infinity`). |
| `pdf/serializer/bad-string` | `RenderError` | `string.value` is not a `Uint8Array`. |
| `pdf/serializer/inline-stream` | `RenderError` | Attempt to serialise a `stream` through `serializeObject`. |
| `pdf/serializer/unknown-type` | `RenderError` | Unrecognised `obj.type`. |

## See also

- [`pdfParser`](./parser.md) — inverse operation.
- [`pdfWriter`](../document/writer.md) — main consumer.
- [`pdfErrors`](../errors.md)
