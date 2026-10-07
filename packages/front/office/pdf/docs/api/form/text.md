---
module: pdfTextField
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfTextField

> Typing of a text field `/FT /Tx` — ISO 32000-2 §12.7.5.3.

**Module** `pdfTextField` | **Source** `packages/front/office/pdf/src/form/text.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Text field — free-form input. `/V` is a string (or a stream for very long content — retrieved as `Uint8Array` via `stream.raw`). The `/Ff` word carries the sub-flags: **Multiline** (bit 13), **Password** (bit 14), **FileSelect** (bit 21), **DoNotSpellCheck** (bit 23), **DoNotScroll** (bit 24), **Comb** (bit 25, requires `/MaxLen`), **RichText** (bit 26). The module enforces the `Comb` ⇒ `/MaxLen` present constraint.

## Resolve

```js
const tf = runtime.resolve('pdfTextField');
// Returns: { typeTextField }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeTextField` | `(dict) => TextField` | Typing. |

### Shape `TextField`

```js
{
    ft: 'Tx',
    flags: number,
    multiline, password, fileSelect,
    doNotSpellCheck, doNotScroll, comb, richText,   // booleans
    v:      Uint8Array | null,
    dv:     Uint8Array | null,
    maxLen: number | null,
    da:     Uint8Array | null,
    q:      number,                // 0=left, 1=center, 2=right
    t:      Uint8Array | null,
    raw:    object,
    _extras:{ [key]: PdfObject }
}
```

## Examples

### Simple typing

```js
const tf = runtime.resolve('pdfTextField');
const tx = tf.typeTextField(record.node);
new TextDecoder('utf-8').decode(tx.v);  // current value
```

### Comb with MaxLen

```js
if (tx.comb) {
    tx.maxLen;  // guaranteed defined, otherwise a ParseError would have been thrown
}
```

### Password detection

```js
if (tx.password) {
    // Don't render tx.v in clear text in the UI.
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/tx/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/tx/bad-ft` | `ParseError` | `/FT` present but ≠ `/Tx`. |
| `pdf/form/tx/comb-without-maxlen` | `ParseError` | `Comb` flag set but `/MaxLen` absent. |

## See also

- [`pdfFieldTree`](./fieldTree.md) — discovery.
- [`pdfAppearance`](./appearance.md) — `/AP /N` regenerated when `NeedAppearances`.
- [`pdfButtonField`](./button.md), [`pdfChoiceField`](./choice.md), [`pdfSignatureField`](./signature.md).
