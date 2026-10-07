---
module: pdfText
category: pdf/content
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfText

> Text state + Tm/Tlm matrices + Unicode extraction — ISO 32000-2 §9.3 / §9.4.

**Module** `pdfText` | **Source** `packages/front/office/pdf/src/content/text.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Applies the operators that mutate `gstate.text` (`Tf`, `BT`, `Td`, `TD`, `Tm`,
`T*`) and exposes `extractText`, which decodes a `Tj`/`TJ`/`'`/`"` operand into
Unicode through a caller-supplied `cidToUnicode` function (typically built from
`@awacloud/fonts`' `cmapToUnicode` module, `@awacloud/fonts/cmap-to-unicode`). ToUnicode
resolution is deliberately **not** done here, so the module stays worker-safe
with no font dependency.

## Resolve

```js
const t = runtime.resolve('pdfText');
// Returns: { setFont, beginTextObject, td, tdSetLeading,
//            setTextMatrix, nextLine, rawStringBytes, extractText }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `setFont` | `(gstate, fontResource: string, size: number) => void` | Applies `Tf`. |
| `beginTextObject` | `() => { Tm, Tlm }` | Initialises `BT` — both matrices identity. |
| `td` | `(state, tx, ty) => void` | Operator `Td`. |
| `tdSetLeading` | `(gstate, state, tx, ty) => void` | Operator `TD` — also sets `gstate.text.leading = -ty`. |
| `setTextMatrix` | `(state, m: number[6]) => void` | Operator `Tm`. |
| `nextLine` | `(gstate, state) => void` | Operator `T*`. |
| `rawStringBytes` | `(stringObj) => Uint8Array` | Raw bytes of a typed `string` operand. |
| `extractText` | `(op, font, cidToUnicode) => string` | Decodes `Tj`/`TJ`/`'`/`"`. |

`state` is the `{ Tm, Tlm }` record returned by `beginTextObject`; `gstate` is a
graphics state from [`pdfGraphics`](./graphics.md), whose `text` sub-object is
mutated in place.

### `extractText`

- Single-byte fonts (`font.subtype !== 'Type0'`): each byte is a CID.
- CID fonts (`font.subtype === 'Type0'`): big-endian byte pairs.
- Numbers inside a `TJ` array (positioning adjustments) contribute no text.
- The `"` operator reads its string from `args[2]`; `Tj` and `'` from `args[0]`.
- A glyph with no ToUnicode mapping yields the replacement character `'�'`.

## Examples

### Minimal extraction pipeline

```js
const t = runtime.resolve('pdfText');
const state = t.beginTextObject();
let acc = '';
for (const op of ops) {
    if (op.op === 'Tf')      t.setFont(gstate, op.args[0].value, op.args[1].value);
    else if (op.op === 'Td') t.td(state, op.args[0].value, op.args[1].value);
    else if (op.op === 'Tj' || op.op === 'TJ') {
        acc += t.extractText(op, currentFont, cidToUnicode);
    }
}
```

### Set the text matrix

```js
t.setTextMatrix(state, [1, 0, 0, 1, 72, 720]);  // (72, 720) in user space
```

### Raw bytes for an external ToUnicode

```js
const raw = t.rawStringBytes(op.args[0]);  // Uint8Array
const text = customCmap.decode(raw);
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/text/bad-matrix` | `ContractError` | `Tm` matrix is not 6 elements. |
| `pdf/text/bad-string` | `ContractError` | `rawStringBytes` given something other than a `{type:'string'}`. |

## See also

- [`pdfContentStream`](./stream.md) — produces the `Tj`/`TJ` ops.
- [`pdfGraphics`](./graphics.md) — hosts `gstate.text`.
- [`pdfFont`](../font/font.md) — supplies `subtype` to `extractText`.
- [`pdfFontEncoding`](../font/encoding.md) — `/Encoding` resolution.
