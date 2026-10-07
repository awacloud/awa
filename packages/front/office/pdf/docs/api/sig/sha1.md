---
module: pdfSha1
category: pdf/sig
dependencies: [bitArray, utf8]
returns: object
worker-safe: true
status: complete
---

# pdfSha1

> SHA-1 (FIPS 180-4 §6.1) — PDF-local legacy hash, DSS `/VRI` keys only.

**Module** `pdfSha1` | **Source** `packages/front/office/pdf/src/sig/sha1.js` | **Deps** `bitArray`, `utf8` | **Worker-safe** yes

SHA-1 is cryptographically broken for collision resistance and **must not**
be used for new signatures, MACs, or password hashing. This module exists
solely because ISO 32000-2 §12.8.4.3 mandates SHA-1 of the signature value
as the DSS `/VRI` dict key — kept in `@awacloud/pdf` rather than `@awacloud/fw` so the
legacy-only nature stays obvious to anyone reading fw's hash family
(`sha256`/`sha384`/`sha512` only, no `sha1`). Exposes the same shape as fw's
hash modules (`hash(data)` one-shot, `fn()` constructor) so dispatch code
can treat it uniformly.

## Resolve

```js
const sha1 = runtime.resolve('pdfSha1');
// Returns: { fn, hash }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `hash` | `(data: Uint8Array \| bitArray \| string) => bitArray` | One-shot digest (20 bytes as a fw `bitArray`). |
| `fn` | `(other?: HashState) => HashState` | Streaming constructor — `{ reset, update, finalize, blockSize: 512 }`. Passing an existing instance clones its internal state. |

`update(data)` accepts a `string` (UTF-8 encoded via `utf8.toBytes` then
converted to a `bitArray`) or an already-encoded `bitArray`.

## Examples

### One-shot digest

```js
const sha1 = runtime.resolve('pdfSha1');
const bitArrayMod = runtime.resolve('bitArray');
const digest = sha1.hash(bitArrayMod.ui8_to_ba(signatureValueBytes));
const bytes = bitArrayMod.ba_to_ui8(digest); // 20 bytes
```

### Streaming

```js
const sha1 = runtime.resolve('pdfSha1');
const ctx = sha1.fn();
ctx.update(chunk1).update(chunk2);
const digest = ctx.finalize();
```

## Errors

None thrown. `update()` guards against hashing more than 2^53 − 1 bits by
`console.warn`-ing and returning `false` instead of throwing — a limit that
is unreachable for the DSS VRI-key use case (hashing a single signature
value, at most a few KB).

## See also

- [`pdfDssBuilder`](./dss.md) — the only consumer, for `/VRI` key derivation.
- [`pdfSignature`](./signature.md) — uses fw's `sha256`/`sha384`/`sha512` for the actual signature digest.
