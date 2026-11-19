---
module: pdfDocument
category: pdf/document
dependencies: [pdfErrors, pdfTokenizer, pdfParser, pdfXref, pdfTrailer, pdfCatalog, pdfPage, pdfPages, pdfCrossRefStream, pdfObjStream, pdfFilterDispatch, pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6, pdfInfo]
returns: object
worker-safe: true
status: complete
---

# pdfDocument

> Top-level read orchestrator — `Uint8Array` → navigable typed model.

**Module** `pdfDocument` | **Source** `packages/front/office/pdf/src/document/document.js` | **Deps** `pdfErrors`, `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer`, `pdfCatalog`, `pdfPage`, `pdfPages`, `pdfCrossRefStream`, `pdfObjStream`, `pdfFilterDispatch`, `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5`, `pdfStandardV6`, `pdfInfo` | **Worker-safe** yes

Full pipeline: header → xref (chaining `/Prev`, at most 32 sections) → trailer →
catalog → pages. It builds an **indirect resolver** (`doc.resolve`, also at
`doc._raw.resolve`) backed by a `Map<'num:gen'>` cache.

**The read document's public reach.** Beside `{ version, catalog, pages,
trailer, xref, losses }` the result carries:

| Member | Signature | Description |
|---|---|---|
| `resolve` | `(node) => value` | A reference to its object (decrypted as every read object), any other value itself. |
| `info` | `() => object \| null` | The Info dictionary as text: `{ title, author, subject, keywords, creator, producer, creationDate, modDate, trapped }`, each string decoded as a PDF text string (UTF-16BE, UTF-8, PDFDocEncoding), a missing or non-string entry left out, `trapped` a name's value or `'True'` / `'False'` for a boolean; `null` when the trailer has no Info dictionary. It never throws on a malformed entry. |
| `pageContents` | `(i) => Uint8Array` | Page `i`'s content: its streams resolved, decoded through their filters and joined with a newline between two (ISO 32000 §7.8.2); empty bytes without `/Contents`. A stream that does not resolve or decode throws its error (`pdf/document/bad-contents` when a reference is not a stream); an index that is no page's throws `ContractError` `pdf/document/bad-page-index`. |

`_raw` (`{ resolve, bytes | source, headerEnd, indirects }`) stays for the
callers that need the bytes.

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

**Reference cycles.** A stream's indirect `/Length` is resolved while the
stream is read. When it names the stream itself, or an object stream names
one of its own members, the reference reads as the null object and the
resolver records `pdf/document/reference-cycle` (context `num`, `gen`) in
`doc.losses`; the stream's data then ends at its `endstream`. A nesting of
more than 32 objects being read at once throws
`pdf/document/resolve-too-deep`.

## Resolve

```js
const docMod = runtime.resolve('pdfDocument');
// Returns: { readDocument, readHeader }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `readDocument` | `(input: Uint8Array \| { byteLength: number, read(offset: number, length: number): Uint8Array }, opts?: { allowEncrypted?: boolean, recoverXref?: boolean, password?: string \| Uint8Array, legacyRc4?: object, fastCipher?: boolean, sourceWindow?: number }) => Document` | Full model; the input may be a byte source, read by windows (see [A byte source](#a-byte-source)); `password` opens an encrypted document (see [Encrypted documents](#encrypted-documents)); `recoverXref: true` rebuilds an unusable cross-reference table from the bytes (see [Cross-reference recovery](#cross-reference-recovery)). |
| `readHeader` | `(bytes: Uint8Array) => { version, end }` | Header only. |

### A byte source

`readDocument` also takes a byte source `{ byteLength, read(offset, length) }`: `read` is synchronous and returns a `Uint8Array` of up to `length` bytes from `offset` (Bun / Node's `readSync`, a worker's `FileReaderSync` over a `Blob`). The file is then never held whole. The reader reads windows:

- the header from the file's start;
- `startxref` from the last 8,192 bytes;
- each xref section with its trailer, and each object as it is resolved, from a window at its offset.

A window starts at 64 KiB, or `opts.sourceWindow` (an integer of at least 16, else `ContractError` `pdf/document/bad-source-window-option`). It doubles while a parse runs out of it, a stream whose `/Length` passes the window's end included, never cut at an `endstream` inside it. Past the parser's `maxStreamBytes` plus 64 KiB it is refused with `ParseError` `pdf/document/source-window`.

A resolved stream keeps a copy of its bytes, not its window. The result is the document a read of the same bytes gives, except that `_raw` carries `source` in place of `bytes`.

One refusal is specific to a source: a `read` that returns no `Uint8Array` throws `ContractError` `pdf/document/bad-source-read`. A source whose cross-reference chain fails is read whole once, since the rebuild scans the whole file, so a source and its bytes give one outcome.

A `Uint8Array` input is one window over the whole file: the same code path as before.

```js
import { openSync, fstatSync, readSync } from 'node:fs';
const fd = openSync('large.pdf', 'r');
const source = {
    byteLength: fstatSync(fd).size,
    read(offset, length) {
        const out = new Uint8Array(Math.max(0, Math.min(length, this.byteLength - offset)));
        readSync(fd, out, 0, out.length, offset);
        return out;
    }
};
const doc = docMod.readDocument(source);
```

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

The reader follows `startxref` and the `/Prev` chain. A section it
cannot use (a wrong offset, a cross-reference stream whose filter it
cannot decode, no `startxref`) — any `pdf/…` `ParseError` of the walk, or
a trailer without `/Root` — rebuilds the table from the file's bytes, by
default; `{ recoverXref: false }` (only `false` turns it off) throws the
walk's error instead. The paths that append an incremental update to
the file read it with `recoverXref: false`: `pdfSign` (the signing base
and the DSS update) and `pdfFormFill`. The rebuild:

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
const doc = docMod.readDocument(bytes); // rebuilt; { recoverXref: false } throws
doc.losses.some((l) => l.code === 'pdf/document/xref-rebuilt'); // true when it was rebuilt
```

## Encrypted documents

When the trailer carries `/Encrypt` (`/Encrypt null` is no entry, so a
plaintext document) and no `password` is given, `readDocument` tries the
empty password, as the user then as the owner: a document it opens reads,
with one `pdf/document/opened-with-empty-password` loss (context:
`permissions`, the `/P` bits). One it does not open throws
`pdf/document/encrypted` instead of silently returning a model whose
strings and streams are still ciphertext. `{ emptyPassword: false }`
throws it on every encrypted document read with no password. `pdfSign` and
`pdfFormFill` read with `allowEncrypted`; `pdfMerge` refuses an encrypted
source (`pdf/merge/encrypted-source`).

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
        // encrypted, and the empty password does not open it: pass { password }.
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
| `pdf/document/encrypted` | `ParseError` | Trailer carries `/Encrypt`, neither `opts.password` nor `opts.allowEncrypted: true` is given, and the empty password does not open it (or `opts.emptyPassword` is `false`). |
| `pdf/document/bad-password-option` | `ContractError` | `opts.password` is neither a string nor a `Uint8Array`. |
| `pdf/document/bad-legacy-rc4-option` | `ContractError` | `opts.legacyRc4` is not the `pdfLegacyRc4Read` instance (`validateUserPassword`, `validateOwnerPassword`, `decryptString`, `decryptStream`). |
| `pdf/document/bad-password` | `EncryptionError` | `opts.password` opens the document neither as its user nor as its owner password. |
| `pdf/crypto/unsupported-filter` | `EncryptionError` | Under `opts.password`, the `/Encrypt` `/Filter` is not `Standard`. |
| `pdf/document/missing-xref` | `ParseError` | Reference absent from the table. |
| `pdf/document/free-object` | `ParseError` | The catalog (`/Root`) is free in every xref section. Any other free reference is recorded in `doc.losses` instead of thrown. |
| `pdf/document/bad-offset` | `ParseError` | Xref offset out of range. |
| `pdf/document/resolve-too-deep` | `ParseError` | Resolving a reference nests more than 32 objects being read at once (a chain of indirect `/Length` entries). A reference to an object already being read is recorded as `pdf/document/reference-cycle` in `doc.losses` instead. |
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
