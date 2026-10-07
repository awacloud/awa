---
module: pdfXrefStreamWriter
category: pdf/document
dependencies: [pdfErrors, pdfSerializer, pdfFlate]
returns: object
worker-safe: true
status: complete
---

# pdfXrefStreamWriter

> Alternative emitter using a `/Type /XRef` cross-reference stream instead of a classical table.

**Module** `pdfXrefStreamWriter` | **Source** `packages/front/office/pdf/src/document/xrefStreamWriter.js` | **Deps** `pdfErrors`, `pdfSerializer`, `pdfFlate` | **Worker-safe** yes

An alternative to `pdfWriter.writeDocument`: instead of a classical
`xref`/`trailer` tail, `writeXrefStreamDocument` emits the cross-reference as a
single `/Type /XRef` stream object (PDF 1.5+ / ISO 32000-2:2020 §7.5.8), with
`/W` widths sized to fit the largest observed offset/generation values and a
full `/Index`. Optionally (`useObjStm: true`), non-stream indirects with
`gen === 0` are grouped into `/Type /ObjStm` compressed object streams
(§7.5.7, chunked by `objStmCapacity`) and referenced as type-2 xref entries;
stream objects and non-zero-generation objects are always left as
uncompressed, type-1 entries. The xref-stream object itself is always
appended last and given a fresh, freshly-computed object number, then
flate-compressed like any other stream.

> **Note:** a document produced by this writer round-trips through the
> package's own read path — `pdfDocument.readDocument` composes
> [`pdfCrossRefStream`](../syntax/crossRefStream.md) and
> [`pdfObjStream`](../syntax/objStream.md), so both the plain and the
> `useObjStm` outputs re-read end to end (see [`pdfDocument`](./document.md)).
> What it cannot do is receive an **incremental update**:
> [`pdfIncrementalWriter`](./incrementalWriter.md) emits classical tables only.

## Resolve

```js
const xw = runtime.resolve('pdfXrefStreamWriter');
// Returns: { writeXrefStreamDocument }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `writeXrefStreamDocument` | `(opts: XrefStmWriteOpts) => Uint8Array` | A full PDF: header + serialized indirects (+ ObjStm wrappers if requested) + xref-stream object + `startxref`/`%%EOF`. |

### `XrefStmWriteOpts`

```js
{
    indirects: [ { num, gen, value }, … ],  // required, num >= 1, no duplicates
    root:      { num, gen },                // required
    info?:     { num, gen },
    id?:       [ string | Uint8Array, string | Uint8Array ],
    version?:  string,          // default '2.0', must match /^\d\.\d$/
    useObjStm?: boolean,        // default false — group compressible indirects into ObjStm(s)
    objStmCapacity?: number     // default 64 — max members per ObjStm
}
```

Object 0 (the free-list head) is always synthesized and included in the
xref-stream's `/Index`; the xref-stream's own entry is always type 1
(uncompressed), pointing at its own byte offset, per §7.5.8.

## Examples

### Minimal document, classical-style indirects, xref-stream output

```js
const { writeXrefStreamDocument } = runtime.resolve('pdfXrefStreamWriter');
const bytes = writeXrefStreamDocument({
    indirects: [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
        { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        { num: 3, gen: 0, value: obj.dict({ Type: obj.name('Page'), Parent: obj.ref(2, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]) }) }
    ],
    root: { num: 1, gen: 0 }
});
```

### Grouping non-stream objects into ObjStm(s)

```js
const bytes = writeXrefStreamDocument({
    indirects,
    root: { num: 1, gen: 0 },
    useObjStm: true,
    objStmCapacity: 32   // split across several ObjStms once exceeded
});
```

### `/Info` and `/ID`

```js
const bytes = writeXrefStreamDocument({
    indirects,
    root: { num: 1, gen: 0 },
    info: { num: 4, gen: 0 },
    id: [Uint8Array.of(0x00, 0x11), Uint8Array.of(0xAA, 0xBB)]
});
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/xrefstm-writer/bad-input` | `RenderError` | `opts.indirects` is not an array. |
| `pdf/xrefstm-writer/no-root` | `RenderError` | `opts.root` missing or `opts.root.num` not finite. |
| `pdf/xrefstm-writer/no-flate` | `RenderError` | `pdfFlate.encode` unavailable — required to emit the xref-stream and any ObjStm. |
| `pdf/xrefstm-writer/bad-version` | `RenderError` | `version` doesn't match `/^\d\.\d$/`. |
| `pdf/xrefstm-writer/bad-indirect` | `RenderError` | An indirect lacks a finite `num >= 1`. |
| `pdf/xrefstm-writer/duplicate-num` | `RenderError` | Two indirects share the same `num`. |

## See also

- [`pdfWriter`](./writer.md) — the classical-xref counterpart (same `indirects`/`root`/`info`/`id` shape).
- [`pdfDocument`](./document.md) — the top-level reader; it reads this module's output back, see the note above.
- [`pdfCrossRefStream`](../syntax/crossRefStream.md) · [`pdfObjStream`](../syntax/objStream.md) — the parser-side counterparts `pdfDocument` composes to read back a document this module produced.
- [`pdfFlate`](../syntax/filters/flate.md) — required for both the xref-stream payload and any ObjStm.
