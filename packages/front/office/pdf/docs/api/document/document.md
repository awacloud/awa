---
module: pdfDocument
category: pdf/document
dependencies: [pdfErrors, pdfTokenizer, pdfParser, pdfXref, pdfTrailer, pdfCatalog, pdfPage, pdfPages, pdfCrossRefStream, pdfObjStream, pdfFilterDispatch, pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6]
returns: object
worker-safe: true
status: complete
---

# pdfDocument

> Top-level read orchestrator — `Uint8Array` → navigable typed model.

**Module** `pdfDocument` | **Source** `packages/front/office/pdf/src/document/document.js` | **Deps** `pdfErrors`, `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer`, `pdfCatalog`, `pdfPage`, `pdfPages`, `pdfCrossRefStream`, `pdfObjStream`, `pdfFilterDispatch`, `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5`, `pdfStandardV6` | **Worker-safe** yes

Full pipeline: header → xref (chaining `/Prev`, at most 32 sections) → trailer →
catalog → pages. It builds an **indirect resolver** (`doc._raw.resolve`) backed
by a `Map<'num:gen'>` cache.

Both cross-reference forms are read automatically. At each `startxref` /
`/Prev` offset the walk looks at the bytes: an `xref` keyword takes the
classical table path, anything else is parsed as a `/Type /XRef`
cross-reference stream through [`pdfCrossRefStream`](../syntax/crossRefStream.md)
(§7.5.8), so mixed chains — a signed file whose classical incremental section
chains back into an xref-stream base, or the reverse — resolve end to end. A
classical trailer carrying `/XRefStm` (hybrid-reference file, §7.5.8.4) also
has its companion stream merged, without overriding the entries the table
itself provides. Objects stored inside a `/Type /ObjStm` container (§7.5.7)
are materialised on demand through [`pdfObjStream`](../syntax/objStream.md),
each container being decoded once per document.

The cross-reference stream is decoded through
[`pdfFilterDispatch`](../syntax/filters/dispatch.md), which hands its
`/DecodeParms` to the decoder as plain values, so a `/Predictor 12` xref stream
(the shape most PDF 1.5+ producers emit) is un-predicted before its entries
are read.

**Trailer merge across sections.** The trailer `readDocument`
returns is the merge of every section's trailer dict, newest first. The
newest dict is kept whole. Each document key it lacks (`/Root`, `/Info`,
`/ID`, `/Encrypt`, `/Size`) comes from the newest older section that carries
it. Section-local keys are never inherited: `/Prev`, `/XRefStm`, and a
cross-reference stream's `/Type`, `/W`, `/Index`, `/Length` and filter
entries. Each section's own `/Prev` drives the walk. So a linearized file
whose main xref stream omits `/Root` reads, and so does an incremental update
that omits it. A chain where **no** section supplies `/Root` still throws
`pdf/trailer/missing-root`.

**Free entries.** Sometimes the winning (newest) xref entry of a
referenced object is free. The resolver then uses the newest section that
still defines the object, and records `pdf/document/free-entry-fallback` in
`doc.losses`. When every section marks the object free, the resolver records
`pdf/document/free-object` and the reference reads as the null object
(ISO 32000-2 §7.3.10). A page-tree kid in that state contributes no page. A
`/Root` that is free in every section is still refused with
`pdf/document/free-object`.

## Resolve

```js
const docMod = runtime.resolve('pdfDocument');
// Returns: { readDocument, readHeader }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `readDocument` | `(bytes: Uint8Array, opts?: { allowEncrypted?: boolean, recoverXref?: boolean, password?: string \| Uint8Array, legacyRc4?: object, fastCipher?: boolean }) => Document` | Full model; `password` opens an encrypted document (see [Encrypted documents](#encrypted-documents)); `recoverXref: true` rebuilds an unusable cross-reference table from the bytes (see [Cross-reference recovery](#cross-reference-recovery)). |
| `readHeader` | `(bytes: Uint8Array) => { version, end }` | Header only. |

### `Document` shape

```js
{
    version: string,                  // '2.0', '1.7', …
    catalog: TypedCatalog,            // see pdfCatalog
    pages:   TypedPage[],             // already resolved and typed
    trailer: TypedTrailer,            // see pdfTrailer
    xref:    {
        // classical entries: { offset, gen, free }
        // xref-stream entries also carry `type` (0 | 1 | 2); a type-2
        // entry is { type: 2, objStm, index, offset: 0, gen: 0, free }
        entries: { [num]: { offset, gen, free, type? } },
        sections: Array<{ at, kind, entries }>   // kind: 'table' | 'stream'
    },
    // Read-path degradations, e.g. 'pdf/document/free-entry-fallback',
    // 'pdf/document/free-object'. Live: later _raw.resolve calls append to it.
    losses:  Array<{ code, message, context }>,
    _raw: {
        resolve:   (ref) => PdfObject,    // generic cached resolver
        bytes:     Uint8Array,
        headerEnd: number,
        // an object materialised from an object stream carries
        // `objStm` (the container's object number) and `offset: 0`
        indirects: Map<'num:gen', { value, offset, objStm? }>
    }
}
```

## Examples

### Full read

```js
const docMod = runtime.resolve('pdfDocument');
const doc = docMod.readDocument(bytes);
console.log(doc.version, doc.pages.length);
```

### Header only

```js
docMod.readHeader(bytes);
// → { version: '2.0', end: 9 }
```

### Resolve an arbitrary reference

```js
if (doc.catalog.metadata) {
    const xmp = doc._raw.resolve(doc.catalog.metadata);
    // xmp.type === 'stream'; xmp.raw === XMP Uint8Array
}
```

## Cross-reference recovery

Two classic-table shapes that real producers write are read without the
option: a subsection header ending with spaces or tabs before its EOL,
and 19-byte entries (a one-byte EOL). Each shape met records one
`pdf/document/xref-tolerated` loss (`context.shape`
`'subsection-header-space'` or `'entry-eol-one-byte'`, `context.at` the
section's offset).

By default the reader follows `startxref` and the `/Prev` chain and
throws on the first section it cannot use (a wrong offset, a
cross-reference stream whose filter it cannot decode, no `startxref`).
With `{ recoverXref: true }` (only `true` enables it), such a failure —
any `pdf/…` `ParseError` of the walk, or a trailer without `/Root` —
rebuilds the table from the file's bytes instead:

- every `N G obj` definition, in file order, the later one winning (an
  incremental update);
- the members of every object stream that decodes, at the container's
  place in that order;
- the trailer merged, newest first, from every parsable `trailer`
  dictionary and cross-reference stream dictionary; `/Root` the last
  catalog found when none names one, `/Size` one past the highest
  object number when none gives it.

A rebuilt read records `pdf/document/xref-rebuilt` in `doc.losses` (its
`context.cause` the code that made the walk fail, `context.entries` the
number of entries rebuilt), and `doc.xref.sections` holds one section
`{ at: null, kind: 'rebuilt', entries }`. A file with no catalog at all
still throws `pdf/trailer/missing-root`. A readable chain is never
rebuilt.

```js
const doc = docMod.readDocument(bytes, { recoverXref: true });
doc.losses.some((l) => l.code === 'pdf/document/xref-rebuilt'); // true when it was rebuilt
```

## Encrypted documents

`readDocument` fails loud on an encrypted input: when the
trailer carries `/Encrypt` (`/Encrypt null` is no entry, so a plaintext
document), it throws `pdf/document/encrypted` instead
of silently returning a model whose strings and streams are still
ciphertext.

`{ password }` (a string or a `Uint8Array`; `''` is the empty user
password most protected files carry) opens it: the `/Encrypt` dictionary
is typed by [`pdfSecurity.typeEncryptDict`](../crypto/security.md), the
Standard handler V=4 R=4 (AESV2, RC4), V=5 R=5 or V=5 R=6 (AESV3, AESV4)
chosen by `selectHandler`, the password tried as the user password, then
as the owner password, and every indirect object is decrypted as it is
resolved: its strings by the `/StrF` crypt filter, its stream payload by
`/StmF` (`/EFF` for an embedded file), `Identity` leaving a class as
stored. Left as stored (ISO 32000-2 § 7.6.2): the `/Encrypt` dictionary, a
cross-reference stream, the `/Type /Metadata` stream when
`EncryptMetadata` is false, the `/Contents` of a signature dictionary
(`/Type /Sig` or `/DocTimeStamp`). An object stream is decrypted like
any stream and its members are read as stored (they are not encrypted
again inside it). RC4 V=1 / V=2 (R2, R3) needs `legacyRc4`, the
[`pdfLegacyRc4Read`](../extra/legacy-rc4-read.md) instance of the opt-in
extras (the `pdf-legacy` bundle's `read` passes its own when given a
password): the file key is checked against `/U`, the password tried as the
user, then as the owner password, and every string and stream decrypted
with its per-object RC4 key. Without it such a document throws
`pdf/crypto/unsupported-version`. Without `password` every result is
unchanged; on an unencrypted document it is ignored; it wins over
`allowEncrypted`.

`fastCipher: true` (opt-in, with `password`) routes the decryptor's AES
through fw's T-table path, `aes.ttable.fn`: the key check (V4, V5 and the
R6 key hardening of Algorithm 2.B, about 0.4 s a check through the
default) and the AES-CBC string and stream decryption — measured on
qpdf's 30-page R6 file, a whole read 0.9 s → 25 ms, and a 2 MiB stream
0.3 → about 100 MB/s. The T-table path is **not constant-time**: its
memory accesses depend on the key, so a process sharing the machine's
caches could observe them. Use it on a trusted, single-user host (a local
viewer), never on a shared one; the default stays the constant-time
`aes.fn`. AESV4 (GCM) and RC4 are not affected. `false` or absent reads
as today; another value throws `pdf/document/bad-fast-cipher-option`.

Pass `{ allowEncrypted: true }` instead to read the raw container (the
object graph is returned unmodified — no decrypt is performed):

```js
try {
    docMod.readDocument(bytes);
} catch (e) {
    if (e.code === 'pdf/document/encrypted') {
        // bytes are encrypted; no decrypt path is composed here.
    }
}

// Explicit opt-out — returns the raw (still-encrypted) container:
const raw = docMod.readDocument(bytes, { allowEncrypted: true });

// Decrypted, with the (often empty) user password or the owner password:
const doc = docMod.readDocument(bytes, { password: '' });
```


## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/document/short` | `ParseError` | Input shorter than 8 bytes. |
| `pdf/document/bad-header` | `ParseError` | No `%PDF-` in the first 1024 bytes. |
| `pdf/document/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/document/no-startxref` | `ParseError` | No `startxref` at the end of the file. |
| `pdf/document/no-trailer` | `ParseError` | No usable trailer. |
| `pdf/document/bad-fast-cipher-option` | `ContractError` | `opts.fastCipher` is present and not a boolean. |
| `pdf/document/encrypted` | `ParseError` | Trailer carries `/Encrypt`, and neither `opts.password` nor `opts.allowEncrypted: true` is given. |
| `pdf/document/bad-password-option` | `ContractError` | `opts.password` is neither a string nor a `Uint8Array`. |
| `pdf/document/bad-legacy-rc4-option` | `ContractError` | `opts.legacyRc4` is not the `pdfLegacyRc4Read` instance (`validateUserPassword`, `validateOwnerPassword`, `decryptString`, `decryptStream`). |
| `pdf/document/bad-password` | `EncryptionError` | `opts.password` opens the document neither as its user nor as its owner password. |
| `pdf/crypto/unsupported-filter` | `EncryptionError` | Under `opts.password`, the `/Encrypt` `/Filter` is not `Standard`. |
| `pdf/document/missing-xref` | `ParseError` | Reference absent from the table. |
| `pdf/document/free-object` | `ParseError` | The catalog (`/Root`) is free in every xref section. Any other free reference is recorded in `doc.losses` instead of thrown. |
| `pdf/document/bad-offset` | `ParseError` | Xref offset out of range. |
| `pdf/document/xref-mismatch` | `ParseError` | The definition at the offset does not match the expected `num gen`. |
| `pdf/document/bad-xref-section` | `ParseError` | The bytes at a `startxref` / `/Prev` / `/XRefStm` offset are neither an `xref` table nor a `/Type /XRef` stream. |
| `pdf/document/xrefstm-indirect-length` | `ParseError` | A cross-reference stream uses an indirect `/Length`, which cannot be resolved before the xref exists. |
| `pdf/document/xref-stream-unwired` | `ParseError` | The instance was built without `pdfCrossRefStream`, `pdfObjStream` and `pdfFilterDispatch`, and the input needs the stream path. |
| `pdf/document/objstm-nested` | `ParseError` | An object stream is itself stored inside another object stream. |
| `pdf/document/objstm-not-stream` | `ParseError` | The object a type-2 entry names as its container is not a stream. |
| `pdf/document/objstm-mismatch` | `ParseError` | The container member at the entry's index carries another object number. |
| `pdf/document/objstm-encrypted` | `ParseError` | A compressed object of an encrypted document was reached under `allowEncrypted` (without `password`): its object stream is still ciphertext. |

It also propagates every code from [`pdfXref`](../syntax/xref.md),
[`pdfTrailer`](../syntax/trailer.md), [`pdfCatalog`](./catalog.md),
[`pdfPages`](./pages.md), [`pdfPage`](./page.md),
[`pdfCrossRefStream`](../syntax/crossRefStream.md),
[`pdfObjStream`](../syntax/objStream.md) and
[`pdfFilterDispatch`](../syntax/filters/dispatch.md).

## See also

- [`pdf`](../pdf.md) — wraps `readDocument` behind `.read()`.
- [Read pipeline](../../guide/read-pdf.md)
- [Coverage](../../guide/coverage.md)
- [`pdfErrors`](../errors.md)
