---
module: pdfStructElement
category: pdf/tagged
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfStructElement

> Structure element — ISO 32000-2 §14.7.3, the granularity of Tagged PDF §14.8.

**Module** `pdfStructElement` | **Source** `packages/front/office/pdf/src/tagged/structElement.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types a `/Type /StructElem` dict. Fields: `/S` (structure type — required), `/P` (parent), `/ID`, `/Pg` (owning page), `/K` (kids — `int`/`ref`/`dict` or array), `/A`/`/C` (attributes/classes), `/R` (revision), `/T`/`/Lang`/`/Alt`/`/E`/`/ActualText` (accessibility), `/AF` (PDF 2.0 associated files), `/NS` (namespace), `/PhoneticAlphabet`/`/Phoneme`. Kids are normalized to records `{ kind: 'mcid'|'elem'|'mcr'|'objr', … }`.

## Resolve

```js
const se = runtime.resolve('pdfStructElement');
// Returns: { typeStructElement }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeStructElement` | `(dict) => StructElement` | Typing (kids are not recursively typed — each `kind: 'elem'` kid still carries a raw `ref`, resolved and re-typed by the caller). |

### Shape of a kid

```js
{ kind: 'mcid', mcid: number }
{ kind: 'elem', ref: { type:'ref', num, gen } }
{ kind: 'mcr',  pg?, stm?, stmOwn?, mcid: number|null, raw }   // /Type /MCR
{ kind: 'objr', pg?, obj?, raw }                                // /Type /OBJR
```

## Examples

### Recursive walk

```js
function walk(elDict, resolveRef, depth = 0) {
    const e = runtime.resolve('pdfStructElement').typeStructElement(elDict);
    console.log(' '.repeat(depth) + e.s + (e.alt ? ` [${e.alt}]` : ''));
    for (const k of e.k) {
        if (k.kind === 'elem') walk(resolveRef(k.ref), resolveRef, depth + 1);
    }
}
```

### Accessibility

```js
const el = runtime.resolve('pdfStructElement').typeStructElement(dict);
el.s;          // 'Figure'
el.alt;        // alt-text (required for PDF/UA)
el.actualText;
el.lang;       // 'fr-FR'
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/struct-elem/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/tagged/struct-elem/bad-type` | `ParseError` | `/Type` present and ≠ `/StructElem`. |
| `pdf/tagged/struct-elem/missing-s` | `ParseError` | `/S` missing or not a name. |
| `pdf/tagged/struct-elem/bad-kid` | `ParseError` | Kid of an unhandled shape. |

## See also

- [`pdfStructTree`](./structTree.md) · [`pdfMarkedContent`](./markedContent.md)
- [`pdfRoleMap`](./roleMap.md) — resolution of custom `/S` values.
