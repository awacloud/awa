---
module: pdfEncryptedWriter
category: pdf/document
dependencies: [pdfErrors, pdfWriter, pdfStandardV5, pdfStandardV6, pdfStandardV4, pdfAesGcm]
returns: object
worker-safe: true
status: complete
---

# pdfEncryptedWriter

> Emits an `/Encrypt`-protected PDF — wraps `pdfWriter` with the Standard Security Handlers.

**Module** `pdfEncryptedWriter` | **Source** `packages/front/office/pdf/src/document/encryptedWriter.js` | **Deps** `pdfErrors`, `pdfWriter`, `pdfStandardV5`, `pdfStandardV6`, `pdfStandardV4`, `pdfAesGcm` | **Worker-safe** yes

Encrypts a from-scratch indirect-object graph (same shape as `pdfWriter`'s
`indirects`) and emits the result with an `/Encrypt` dictionary. Supports:

- **V=4, R=4** (PDF 1.6) — method `'AESV2'` (AES-128-CBC, default) or `'V2'`
  (RC4-128), delegated to `pdfStandardV4`.
- **V=5, R=5** (historical AES-256, Adobe Extension Level 3) — delegated to `pdfStandardV5`.
- **V=5, R=6** (ISO 32000-2:2020 hardening) — delegated to `pdfStandardV6`. Method
  `'AESV3'` (AES-256-CBC, default) or `'AESV4'` (AES-256-GCM, ISO TS 32003 — requires `pdfAesGcm`).

An optional distinct cipher for `/Type /EmbeddedFile` streams (`/EFF`, ISO
32000-1 §7.6.5) is selected via `opts.encrypt.effMethod`, validated against
the same (version, method) rules as the main `method`. Every `string` and
`stream.raw` payload in the indirect graph is walked and encrypted in place
(fresh IV per object) before the `/Encrypt` indirect is appended and the
trailer patched.

## Resolve

```js
const ew = runtime.resolve('pdfEncryptedWriter');
// Returns: { writeEncryptedDocument }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `writeEncryptedDocument` | `(opts: EncWriteOpts) => EncWriteResult` | Encrypted PDF bytes plus the derived crypto material. |

### `EncWriteOpts`

Mirrors `pdfWriter`'s `WriteOpts` (`indirects`, `root`, `info?`, `id?`, `version?`) plus:

```js
{
    encrypt: {
        version: 4 | 5,
        revision: 4 | 5 | 6,
        method?:     'AESV2' | 'V2' | 'AESV3' | 'AESV4',  // default per version
        effMethod?:  'AESV2' | 'V2' | 'AESV3' | 'AESV4',  // optional, /Type /EmbeddedFile only
        keyBits?:    number,           // default 128 (V4) / 256 (V5)
        ownerPassword?: string | Uint8Array,
        userPassword?:  string | Uint8Array,
        permissions?:   number,        // /P bitmask (Table 24)
        encryptMetadata?: boolean,     // default true
        randomBytes?: (n: number) => Uint8Array  // default globalThis.crypto.getRandomValues
    }
}
```

`randomBytes` supplies every key, salt and IV the writer draws. When it is
omitted the writer uses `globalThis.crypto.getRandomValues`, read at call
time; when neither exists the call throws `pdf/crypto/enc-writer/no-random`
before producing any output. There is no non-cryptographic fallback.

### `EncWriteResult`

```js
{
    bytes: Uint8Array, encryptObjNum: number,
    fek: Uint8Array, id: [Uint8Array, Uint8Array],
    O, U, OE?, UE?, Perms?: Uint8Array,
    version, revision, method, effMethod
}
```

## Examples

### V=5 R=6, AES-256-CBC, deterministic (test) randomness

```js
const ew = runtime.resolve('pdfEncryptedWriter');
const out = ew.writeEncryptedDocument({
    indirects, root: { num: 1, gen: 0 },
    encrypt: {
        version: 5, revision: 6,
        ownerPassword: 'owner', userPassword: 'user',
        permissions: -4,
        randomBytes: makeDeterministicRand(1)   // test-only PRNG
    }
});
out.bytes;   // encrypted PDF, ready to write to disk
```

### V=4 R=4, legacy RC4-128

```js
const out = ew.writeEncryptedDocument({
    indirects, root: { num: 1, gen: 0 },
    encrypt: { version: 4, revision: 4, method: 'V2', userPassword: 'user' }
});
```

### Distinct cipher for embedded-file streams (`/EFF`)

```js
const out = ew.writeEncryptedDocument({
    indirects, root: { num: 1, gen: 0 },
    encrypt: {
        version: 5, revision: 6, method: 'AESV3',
        effMethod: 'AESV4',   // embedded files get AES-GCM, everything else AES-CBC
        userPassword: 'user'
    }
});
```

### Recovering the FEK to decrypt

```js
const v6 = runtime.resolve('pdfStandardV6');
const r = v6.tryPassword(typedEncryptDict, 'user', false);
r.fileEncryptionKey; // === out.fek, when the password matches
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/crypto/enc-writer/missing-writer` | `EncryptionError` | Constructed without a `pdfWriter.writeDocument` function (module wiring). |
| `pdf/crypto/enc-writer/unsupported-version` | `EncryptionError` | `(version, revision)` outside `{4,4}`, `{5,5}`, `{5,6}`. |
| `pdf/crypto/enc-writer/missing-v4` | `EncryptionError` | `version: 4` requested but `pdfStandardV4` not supplied. |
| `pdf/crypto/enc-writer/bad-input` | `RenderError` | `opts` missing or not an object. |
| `pdf/crypto/enc-writer/no-encrypt` | `RenderError` | `opts.encrypt` missing. |
| `pdf/crypto/enc-writer/bad-method` | `RenderError` | `method` incompatible with `version` (V=4 wants AESV2/V2, V=5 wants AESV3/AESV4). |
| `pdf/crypto/enc-writer/missing-gcm` | `EncryptionError` | `method` or `effMethod` is `'AESV4'` but `pdfAesGcm` not supplied. |
| `pdf/crypto/enc-writer/bad-eff-method` | `RenderError` | `effMethod` incompatible with `version`. |
| `pdf/crypto/enc-writer/no-random` | `EncryptionError` | No `randomBytes` and no `globalThis.crypto.getRandomValues`. |
| `pdf/crypto/enc-writer/no-trailer` / `no-trailer-close` | `RenderError` | Internal: the base `writeDocument` output didn't contain a patchable trailer (should not occur in practice). |

## See also

- [`pdfWriter`](./writer.md) — the base emitter this wraps.
- [`pdfStandardV4`](../crypto/standardV4.md) · [`pdfStandardV5`](../crypto/standardV5.md) · [`pdfStandardV6`](../crypto/standardV6.md) · [`pdfAesGcm`](../crypto/aesGcm.md)
- [`pdfSecurity`](../crypto/security.md) — the read-side dispatcher.
