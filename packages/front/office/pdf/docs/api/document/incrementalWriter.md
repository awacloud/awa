---
module: pdfIncrementalWriter
category: pdf/document
dependencies: [pdfErrors, pdfSerializer, pdfTokenizer, pdfParser, pdfXref, pdfTrailer]
returns: object
worker-safe: true
status: complete
---

# pdfIncrementalWriter

> Append-only incremental update — ISO 32000-2 §7.5.6.

**Module** `pdfIncrementalWriter` | **Source** `packages/front/office/pdf/src/document/incrementalWriter.js` | **Deps** `pdfErrors`, `pdfSerializer`, `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer` | **Worker-safe** yes

`appendIncremental(pdfBytes, opts)` produces a new PDF that carries the
original bytes **verbatim**, followed by an incremental-update section:
`originalBytes ‖ newObjects ‖ xref ‖ trailer (with /Prev) ‖ %%EOF`. It locates
the previous `startxref`/trailer to chain `/Prev` and carry over `/Root`,
`/Info`, `/Size`, `/ID` unless the caller overrides them, then emits a fresh
cross-reference section covering only the newly-added object numbers (one
subsection per contiguous run — object 0's free-list head is always
re-emitted), in the form the section-selection rule below picks. A reader that follows the `/Prev` chain (e.g. `pdfDocument`)
sees the new entries win over older ones automatically. This is the
non-destructive counterpart of a full re-emit: existing objects are never
patched in place, only appended to — the mechanism behind PAdES levels
T/LT/LTA (`pdfSign`) appending DSS/DocTimeStamp updates.

Scope: no ObjStm grouping; hybrid-reference bases are refused (below).

## Section forms and the selection rule

The update's cross-reference section takes the form of the base's **newest**
section, the one the final `startxref` designates:

| Newest base section | Update written | Trailer keys come from |
|---|---|---|
| Classical `xref` table | Classical table + `trailer` dict, `/Prev` = the base's `startxref` offset. **Byte-identical** to the output of earlier versions, which wrote only this form. | The newest trailer dict alone. |
| `/Type /XRef` stream (§7.5.8) | One uncompressed `/Type /XRef` stream object (no `/Filter`), carrying `/W`, `/Index`, `/Size`, `/Prev`, `/Root` and, when known, `/Info` and `/ID`. No `trailer` keyword. The stream takes object number `max(size, prevSize, newMaxNum + 1)`, and the written `/Size` is one more. | The newest-first merge of every section's dict in the `/Prev` chain, as [`pdfDocument`](./document.md) types it. So a linearized file whose `/Root` sits in only one of its two xref streams still resolves `/Root`. |
| Hybrid-reference file: a classical trailer carrying `/XRefStm`, anywhere in the chain | **Refused**, `pdf/incremental/hybrid-base`. | — |
| Neither a table nor an xref stream | **Refused**, `pdf/incremental/unsupported-base`. | — |

Hybrid-reference bases are refused on purpose. A hybrid file carries two
cross-reference forms, so two conforming readers can resolve different
objects in it, and an update over it could read differently from viewer to
viewer. The refusal is reversible: support can be added once a real hybrid
file is available to choose and test a form against.

The emitted stream is read back by this library's own reader: an update over
a stream base re-reads with both the base objects and the appended ones
reachable (`tests/real-shapes.integration.test.js`).

## Resolve

```js
const iw = runtime.resolve('pdfIncrementalWriter');
// Returns: { appendIncremental, appendIncrementalWithOffsets, readBaseTrailer }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `appendIncremental` | `(pdfBytes: Uint8Array, opts: AppendOpts) => Uint8Array` | The original bytes plus one incremental-update section. |
| `appendIncrementalWithOffsets` | `(pdfBytes: Uint8Array, opts: AppendOpts) => { bytes, offsets, xrefOffset }` | Same as `appendIncremental`: same options, same validation and refusals, and `bytes` is byte-identical to its return value. `offsets` is a `Map<num, byteOffset>` giving where each update's `num gen obj` header starts in `bytes`. `xrefOffset` is where the update's cross-reference section (table or stream object) starts, which is the offset the new `startxref` records. |
| `readBaseTrailer` | `(pdfBytes: Uint8Array) => { form, xrefOffset, trailer }` | The trailer an update over `pdfBytes` starts from. Nothing is written. `form` is `'table'` or `'stream'` (the newest section's form). `trailer` is the typed newest-first merge of every section's dict, as `pdfDocument` types it, for classical bases too. It is `null` when no section supplies a usable `/Size` and `/Root`. The base is vetted as `appendIncremental` vets it, so a hybrid-reference base throws `pdf/incremental/hybrid-base` and a `startxref` that designates neither form throws `pdf/incremental/unsupported-base`. |

`appendIncrementalWithOffsets` and `readBaseTrailer` were added for
[`pdfSign`](../sig/sign.md). The signer reads the merged `/Size`
to number its signature object. It then patches the fixed-width `/ByteRange`
placeholder inside that object, found from its offset, without changing the
byte length. Every offset recorded in the cross-reference section therefore
stays valid.

### `AppendOpts`

```js
{
    updates: [ { num, gen?, value }, … ],   // required — num >= 1
    root?:   { num, gen },                  // defaults to the previous /Root
    info?:   { num, gen },                  // defaults to the previous /Info
    id?:     [ Uint8Array, Uint8Array ],    // defaults to the previous /ID
    size?:   number,                        // defaults to max(prevSize, newMaxNum + 1)
    encrypt?: { num, gen }                  // the base's /Encrypt, repeated in the update; never defaulted
}
```

`opts.root` is mandatory only when no section of the base supplies a usable
`/Root` (and `/Size`) — on a classical base, when the newest trailer does not.

`opts.encrypt` is the base's `/Encrypt` reference (the `{ num, gen }` that
`readBaseTrailer(...).trailer.encrypt` reports). It is written as
`/Encrypt n g R` right after `/ID`, in the trailer or in the cross-reference
stream dictionary. An update over an encrypted document needs it to
conform (ISO 32000-2 §7.5.6): every trailer of an encrypted file carries
`/Encrypt`. It is not taken from the base by default. Without it the output
is byte-identical to what it was before the option existed. A direct
`/Encrypt` dictionary (a typed `{ type: 'dict' }`) is written as it is in a
classical trailer. Over a cross-reference stream base it is refused with
`pdf/xref/bad-stream-section`.

## Examples

### Append a new indirect object to an existing PDF

```js
const iw = runtime.resolve('pdfIncrementalWriter');
const updated = iw.appendIncremental(originalBytes, {
    updates: [
        { num: 42, gen: 0, value: { type: 'dict', entries: {
            Type: { type: 'name', value: 'Example' }
        } } }
    ]
});
// `updated` re-parses via pdfDocument.readDocument, following /Prev.
```

### Update the Catalog to point at a new object (e.g. DSS)

```js
const nextNum = 43;
const updated = iw.appendIncremental(signedBytes, {
    updates: [
        { num: nextNum, gen: 0, value: dssDict },
        { num: 1, gen: 0, value: updatedCatalogDict } // re-defines obj 1
    ],
    root: { num: 1, gen: 0 }
});
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/incremental/bad-input` | `RenderError` | `pdfBytes` is not a `Uint8Array` (every member). |
| `pdf/incremental/no-updates` | `RenderError` | `opts.updates` is not an array. |
| `pdf/incremental/bad-update` | `RenderError` | An update entry lacks a finite `num >= 1`. |
| `pdf/incremental/no-startxref` | `ParseError` | `pdfBytes` has no `startxref` — not a valid PDF. |
| `pdf/incremental/no-root` | `RenderError` | `opts.root` missing and no `/Root` can be read from the base (see the table above). |
| `pdf/incremental/hybrid-base` | `RenderError` | A classical section in the base's `/Prev` chain carries `/XRefStm` (hybrid-reference file). Nothing is written. |
| `pdf/incremental/unsupported-base` | `ParseError` | `startxref` designates neither a classical `xref` table nor a `/Type /XRef` stream. Nothing is written. |
| `pdf/xref/bad-stream-section` | `RenderError` | Cross-reference stream base, and `opts.encrypt` is not an indirect reference (propagated from `pdfXref.buildXrefStream`). |

## See also

- [`pdfWriter`](./writer.md) — full re-emit (the `{ num, gen, value }` update shape mirrors `writeDocument`'s `indirects`).
- [`pdfSign`](../sig/sign.md) — appends every signature (all levels), the LT/LTA DSS and the LTA DocTimeStamp through this module.
- [`pdfDssBuilder`](../sig/dss.md) — produces the DSS updates typically appended here.
