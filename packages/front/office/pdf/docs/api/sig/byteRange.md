---
module: pdfByteRange
category: pdf/sig
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfByteRange

> `/ByteRange` computation and extraction — ISO 32000-2 §12.8.1.

**Module** `pdfByteRange` | **Source** `packages/front/office/pdf/src/sig/byteRange.js` | **Deps** `pdfErrors` | **Worker-safe** yes

A signature's `/ByteRange` is an array `[start1 len1 start2 len2]` covering the whole document *except* the gap `[start1+len1, start2)` that holds the `/Contents` value. This module provides the mechanics: locating `/Contents` in the file bytes, computing the matching ByteRange, auditing a ByteRange against the file, and extracting the signed bytes (concatenation of the two ranges). Two gap forms exist in the field; see [Notes § Gap forms](#gap-forms).

## Resolve

```js
const br = runtime.resolve('pdfByteRange');
// Returns: { computeByteRange, extractSignedBytes, findContentsField, auditByteRange }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `computeByteRange` | `(docBytes, contentsOffset, contentsLength, opts?) => [s1, l1, s2, l2]` | Direct computation. Without `opts` the gap is the span given; `opts.token` makes it the `<…>` token (form b). |
| `findContentsField` | `(docBytes, sigObjectOffset) => { offset, length }` | Hex-digit span of the `/Contents <…>` literal in the file (`offset` is the byte after `<`). |
| `extractSignedBytes` | `(docBytes, byteRange) => Uint8Array` | Concatenation of the two intervals. |
| `auditByteRange` | `(docBytes, byteRange, opts?) => { ok, issues, gapForm }` | Hardened audit (overlap, gap form, coverage). |

### `computeByteRange(documentBytes, contentsOffset, contentsLength, opts?)`

Returns `[0, gapStart, gapEnd, total - gapEnd]`. Without `opts` the gap is
`[contentsOffset, contentsOffset + contentsLength)` — the historical
call, unchanged. `opts.token` — `{ offset, length }`, the span of the whole
`<…>` token — makes that span the gap (form b); it must enclose the digit
span by exactly one byte on each side, and those bytes must be `<` and `>`,
otherwise `pdf/sig/byterange/bad-token` is thrown. `pdfSign` calls it with
`{ token: { offset: contentsOffset - 1, length: contentsLength + 2 } }`.

### `auditByteRange(documentBytes, byteRange, opts?)`

Non-throwing audit: returns `{ ok, issues, gapForm }` where each issue
is a record `{ code, message, context }`. The caller decides whether to
escalate to an error or a warning. `gapForm` is `'token'` (form b),
`'digits'` (form a) or `null` — `null` when `opts.contents` is absent or
the gap matches neither form. An accepted gap form does not mask the other
checks: `ok` is `false` whenever any issue is recorded. `opts`:

- `opts.contents` — `{ offset, length }` from `findContentsField` (the
  hex-digit span); the gap must be exactly the `<…>` token or exactly the
  digits. Any other gap records `gap-start-mismatch` and/or
  `gap-end-mismatch`, measured against the token bounds.
- `opts.others` — array of other `/ByteRange`s to cross-check, to
  detect overlaps between concurrent signatures.
- `opts.requireFullCoverage: true` — requires the second range to
  reach `documentBytes.length`.

## Examples

### Hash the signature

```js
const br  = runtime.resolve('pdfByteRange');
const sig = runtime.resolve('pdfSignature').typeSignature(dict);
const signed = br.extractSignedBytes(docBytes, sig.byteRange);
const hash = await crypto.subtle.digest('SHA-256', signed);
```

### Locate `/Contents` to re-sign (form b)

```js
const pos = br.findContentsField(docBytes, sigObjOffset);   // hex digits
const byteRange = br.computeByteRange(docBytes, pos.offset, pos.length, {
    token: { offset: pos.offset - 1, length: pos.length + 2 }
});
br.auditByteRange(docBytes, byteRange, { contents: pos }).gapForm;  // 'token'
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/sig/byterange/bad-input` | `ParseError` | Bytes argument is not a Uint8Array. |
| `pdf/sig/byterange/bad-offset` | `ParseError` | Offset < 0 or out of bounds. |
| `pdf/sig/byterange/bad-length` | `ParseError` | Length < 0 or out of bounds. |
| `pdf/sig/byterange/overflow` | `ParseError` | `offset + length` > file size. |
| `pdf/sig/byterange/bad-token` | `ParseError` | `computeByteRange` `opts.token` is not the `<…>` token enclosing the digit span. |
| `pdf/sig/byterange/bad-shape` | `ParseError` | ByteRange is not a 4-integer array. |
| `pdf/sig/byterange/inconsistent` | `ParseError` | A range entry is negative, a range extends past the document, or range 2 starts before range 1 ends. |
| `pdf/sig/byterange/non-zero-start` | record `issues[]` | Range 1 does not start at 0. |
| `pdf/sig/byterange/self-overlap` | record `issues[]` | Range 2 starts before range 1 ends. |
| `pdf/sig/byterange/out-of-bounds` | record `issues[]` | A range extends past the end of the document. |
| `pdf/sig/byterange/gap-start-mismatch` | record `issues[]` | The gap is neither form and range 1 does not end at the `/Contents` literal's `<` (`context.expected` = the token start). |
| `pdf/sig/byterange/gap-end-mismatch` | record `issues[]` | The gap is neither form and range 2 does not start right after the `/Contents` literal's `>` (`context.expected` = the token end). |
| `pdf/sig/byterange/cross-overlap` | record `issues[]` | Overlap with another `/ByteRange` (`opts.others`). |
| `pdf/sig/byterange/incomplete-coverage` | record `issues[]` | Range 2 does not cover the document up to its end (`opts.requireFullCoverage`). |
| `pdf/sig/byterange/no-contents` | `ParseError` | `/Contents` marker not found. |
| `pdf/sig/byterange/contents-not-hex` | `ParseError` | `/Contents` is not a hex string (`<…>`). |
| `pdf/sig/byterange/contents-unterminated` | `ParseError` | `<` opened without a matching `>`. |

## Notes

### Gap forms

| Form | `gapForm` | The gap is | Who emits it |
|---|---|---|---|
| (b) token | `'token'` | the whole `<…>` hex string, both delimiters included | `pdfSign` today; PDFBox (`COSWriter`) and pyHanko (`DERPlaceholder`) |
| (a) digits | `'digits'` | the hex digits only; `<` and `>` are signed | `pdfSign` in earlier versions |

ISO 32000-2:2020 §12.8.3.3.1 (CMS signatures, the clause governing `adbe.pkcs7.detached`, `pdfSign`'s default `/SubFilter`; unchanged since ISO 32000-1 §12.8.3.3) states that `/Contents` "shall be a hexadecimal string with "<" and ">" delimiters" and that "it shall fit precisely in the space between the ranges specified by ByteRange" — form (b). For `ETSI.CAdES.detached` and `ETSI.RFC3161` the text only says "excluding the Contents value", and ETSI EN 319 142-1 §6.3 i) disapplies the explicit clause; both reference implementations use form (b) there too. No clause describes form (a). Hence the signer moved to form (b), and the verifier accepts both.

`pdfSign` emits form (b) for the `/Sig` and the LTA `/DocTimeStamp`. `auditByteRange` accepts **exactly** form (a) or form (b), so a signature written by an earlier version still audits clean; any other gap (off by one at either end, a delimiter only, part of the digits) is refused. `pdfSignature.verifySignature` / `verifyAllSignatures` apply the same rule to every `/Sig`, and `verifyAllSignatures` to every `/DocTimeStamp` too: any other gap sets `verified: false` and adds the `gap-start-mismatch` / `gap-end-mismatch` records to `errors`; a `timestamps[]` entry also names the accepted form in `gapForm`, with this module's vocabulary (see [`pdfSignature`](./signature.md)). The digest is always taken over the ranges the file declares; neither form is special-cased there.

## See also

- [`pdfSignature`](./signature.md) · [`pdfTimestamp`](./timestamp.md)
