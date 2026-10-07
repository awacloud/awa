---
module: pdfAcroForm
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAcroForm

> Typing of the Catalog's `/AcroForm` dict — ISO 32000-2 §12.7.3.

**Module** `pdfAcroForm` | **Source** `packages/front/office/pdf/src/form/acroform.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The Catalog's `/AcroForm` describes the interactive-forms layer: root `/Fields`, `/NeedAppearances`, `/SigFlags` (bit 1 = SignaturesExist, bit 2 = AppendOnly), `/CO` (calculation order), `/DR` (default Resources), `/DA` (default appearance), `/Q` (default quadding, 0=left/1=center/2=right). `/XFA` (legacy 1.7) is preserved verbatim in `_extras` for 2.0 fidelity. Any unknown entry is also captured in `_extras`.

## Resolve

```js
const af = runtime.resolve('pdfAcroForm');
// Returns: { typeAcroForm }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeAcroForm` | `(dict) => AcroForm` | Typing. |

### Shape `AcroForm`

```js
{
    fields:          Array<{num:number, gen:number}>,
    needAppearances: boolean,        // default false
    sigFlags:        number,         // default 0
    co:              Array<{num,gen}>, // calculation order
    dr:              object|null,    // /DR dict
    da:              Uint8Array|null,// /DA bytes
    q:               number,         // default 0
    raw:             object,
    _extras:         { [key]: PdfObject }   // /XFA + others
}
```

`/Fields` is required by §12.7.3 but a degenerate AcroForm dict without it is tolerated (result `[]`).

## Examples

### Typing from the Catalog

```js
const af = runtime.resolve('pdfAcroForm');
if (doc.catalog.acroForm) {
    const form = af.typeAcroForm(doc._raw.resolve(doc.catalog.acroForm));
    form.fields.length;
    (form.sigFlags & 1) !== 0;  // SignaturesExist
    (form.sigFlags & 2) !== 0;  // AppendOnly
}
```

### Walking the roots

```js
const ft = runtime.resolve('pdfFieldTree');
const records = ft.walkFieldTree(form.fields, doc._raw.resolve);
```

### XFA preservation

```js
form._extras.XFA;  // typed array/stream — passed through as-is to the writer
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/acroform/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/form/acroform/bad-fields` | `ParseError` | `/Fields` is not an array of refs. |
| `pdf/form/acroform/bad-co` | `ParseError` | `/CO` is not an array of refs. |

## See also

- [`pdfFieldTree`](./fieldTree.md) — walks `fields`.
- [`pdfButtonField`](./button.md), [`pdfTextField`](./text.md), [`pdfChoiceField`](./choice.md), [`pdfSignatureField`](./signature.md) — typing by `/FT`.
- [`pdfCatalog`](../document/catalog.md) — carries `acroForm`.
