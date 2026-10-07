---
module: pdfSignatureField
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfSignatureField

> Typing of a signature field `/FT /Sig` — ISO 32000-2 §12.7.5.5.

**Module** `pdfSignatureField` | **Source** `packages/front/office/pdf/src/form/signature.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

A signature field carries an opaque signature dict in `/V` (PKCS#7 / CMS, ByteRange, MDP). The **signature payload** itself is typed at L3 in `src/sig/` — here `/V` is kept as a raw typed object (ref or inline dict) so the caller decides whether to descend into it. `/Lock` (post-signature lock) and `/SV` (seed value) are also preserved. `signed` is `true` iff `/V` is present and well-formed.

## Resolve

```js
const sf = runtime.resolve('pdfSignatureField');
// Returns: { typeSignatureField }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeSignatureField` | `(dict) => SignatureField` | Typing. |

### Shape `SignatureField`

```js
{
    ft: 'Sig',
    flags:  number,
    v:      object | null,   // signature dict ref|dict (opaque at this level)
    lock:   object | null,   // ref|dict
    sv:     object | null,   // ref|dict — seed value
    t:      Uint8Array | null,
    signed: boolean,
    raw:    object,
    _extras:{ [key]: PdfObject }
}
```

## Examples

### Detecting a present signature

```js
const sf = runtime.resolve('pdfSignatureField');
const sig = sf.typeSignatureField(record.node);
if (sig.signed) {
    const sigDict = sig.v.type === 'ref' ? doc._raw.resolve(sig.v) : sig.v;
    // → hand off to the L3 src/sig/ API
}
```

### Lock / seed value

```js
sig.lock;   // /Lock — post-signature restrictions
sig.sv;     // /SV — constraints for the signer
```

### Combining with AcroForm.sigFlags

```js
const af = runtime.resolve('pdfAcroForm').typeAcroForm(...);
const signaturesExist = (af.sigFlags & 1) !== 0;
const appendOnly      = (af.sigFlags & 2) !== 0;
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/sig/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/sig/bad-ft` | `ParseError` | `/FT` present but ≠ `/Sig`. |
| `pdf/form/sig/bad-v` | `ParseError` | `/V` is neither a dict nor a ref. |
| `pdf/form/sig/bad-lock` | `ParseError` | `/Lock` is neither a dict nor a ref. |
| `pdf/form/sig/bad-sv` | `ParseError` | `/SV` is neither a dict nor a ref. |

## See also

- [`pdfAcroForm`](./acroform.md) — `/SigFlags`.
- [`pdfFieldTree`](./fieldTree.md) — discovery.
- [`pdfAppearance`](./appearance.md) — visual representation.
- [`pdfButtonField`](./button.md), [`pdfTextField`](./text.md), [`pdfChoiceField`](./choice.md).
