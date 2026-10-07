---
module: pdfXref
category: pdf/syntax
dependencies: [pdfErrors, pdfTokenizer, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfXref

> Classical cross-reference table, ISO 32000-2 §7.5.4 — locate + parse + trailer; plus the xref-stream dict reader and emitter the incremental writer uses.

**Module** `pdfXref` | **Source** `packages/front/office/pdf/src/syntax/xref.js` | **Deps** `pdfErrors`, `pdfTokenizer`, `pdfParser` | **Worker-safe** yes

Reads the **classical table** (`xref` keyword plus 20-byte subsection entries)
only. Cross-reference streams (`/Type /XRef`, §7.5.8) and object streams
(`/Type /ObjStm`, §7.5.7) are handled by the dedicated
[`pdfCrossRefStream`](./crossRefStream.md) and [`pdfObjStream`](./objStream.md)
modules, which [`pdfDocument`](../document/document.md) composes: the section
walk calls `parseXrefTable` only when the bytes at the offset actually start
with `xref`. The backward scan tolerance for `startxref`
is widened to 8192 bytes (versus the 1024 of the spec) to absorb annotated
`%%EOF` tails.

Two cross-reference-stream helpers serve
[`pdfIncrementalWriter`](../document/incrementalWriter.md).
`readXrefStreamDict` reads only the **dictionary** of a `/Type /XRef` stream
section and never decodes its data, so it needs no filter module.
`buildXrefStream` emits one uncompressed `/Type /XRef` stream section for an
incremental update. Decoding a stream's entries stays the job of
[`pdfCrossRefStream`](./crossRefStream.md).

## Resolve

```js
const xref = runtime.resolve('pdfXref');
// Returns: { locateStartXref, readStartXref, parseXrefTable, parseTrailerDict,
//            readXrefStreamDict, buildXrefStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `locateStartXref` | `(bytes: Uint8Array) => number` | Offset of the last `startxref`, or `-1`. |
| `readStartXref` | `(bytes: Uint8Array, at: number) => number` | Offset of the xref it points to. |
| `parseXrefTable` | `(bytes: Uint8Array, at: number) => { entries, end }` | Table plus the offset just after it. |
| `parseTrailerDict` | `(bytes: Uint8Array, at: number) => { dict, end }` | Raw trailer plus the offset just after it. |
| `readXrefStreamDict` | `(bytes: Uint8Array, at: number) => { num, gen, dict }` | The raw dict of the `/Type /XRef` stream object at `at`; the data is not decoded. |
| `buildXrefStream` | `(opts: XrefStreamOpts) => Uint8Array` | One complete `num 0 obj … endobj` xref-stream section. The caller appends `startxref`/`%%EOF`. |

### `XrefStreamOpts`

```js
{
    num:     number,                              // the stream's own object number (>= 1)
    offset:  number,                              // byte offset where the object will start
    entries: [ { num, offset, gen? }, … ],        // type-1 rows; object 0's free head and
                                                  // the stream's own row are added for you
    prev:    number,                              // /Prev — the previous section's offset
    root:    { num, gen },                        // /Root
    info?:   { num, gen } | null,                 // /Info
    id?:     [ Uint8Array, Uint8Array ] | null,   // /ID
    size?:   number,                              // /Size = max(size, num + 1)
    encrypt?: { num, gen } | null                 // /Encrypt, written right after /ID
}
```

`encrypt` repeats an encrypted document's `/Encrypt` in the update
(ISO 32000-2 §7.5.6). Only an indirect reference is accepted. Without it
the output is unchanged.

`/W` is the narrowest `[1 w2 w3]` that fits the rows, and `/Index` holds one
pair per contiguous run of object numbers. No `/Filter` is written.

### `entries` shape

```js
{
    [num: number]: { offset: number, gen: number, free: boolean }
}
```

`free === true` corresponds to the `f` flag (released object; must not be
dereferenced).

## Examples

### Full xref pipeline

```js
const xref = runtime.resolve('pdfXref');

const sxAt = xref.locateStartXref(bytes);
if (sxAt < 0) throw new Error('no startxref');
const xrefAt = xref.readStartXref(bytes, sxAt);

const { entries, end } = xref.parseXrefTable(bytes, xrefAt);
const { dict: trailer } = xref.parseTrailerDict(bytes, end);
```

### Chaining through `/Prev` (incremental update)

```js
const sections = [];
let cursor = xrefAt;
for (let i = 0; i < 32 && cursor >= 0; i++) {
    const s = xref.parseXrefTable(bytes, cursor);
    sections.push(s);
    const { dict } = xref.parseTrailerDict(bytes, s.end);
    const prev = dict.entries.Prev;
    cursor = prev && prev.type === 'int' ? prev.value : -1;
}
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/xref/no-startxref` | `ParseError` | No `startxref` keyword at `at`. |
| `pdf/xref/bad-startxref` | `ParseError` | `startxref` not followed by an int ≥ 0. |
| `pdf/xref/no-xref-keyword` | `ParseError` | No `xref` at the expected offset. `pdfDocument` never produces it for a cross-reference stream — it inspects the bytes first and takes the stream path. |
| `pdf/xref/bad-subsection-header` | `ParseError` | Invalid `<first> <count>` header. |
| `pdf/xref/truncated-entry` | `ParseError` | Subsection cut short. |
| `pdf/xref/bad-entry-format` | `ParseError` | Missing space at column 10 or 16. |
| `pdf/xref/bad-entry-flag` | `ParseError` | Final flag is neither `n` nor `f`. |
| `pdf/xref/bad-digit` | `ParseError` | Non-ASCII-digit character inside `xxxxxxxxxx`/`ggggg`. |
| `pdf/xref/no-trailer` | `ParseError` | No `trailer` keyword. |
| `pdf/xref/trailer-not-dict` | `ParseError` | `trailer` not followed by a dictionary. |
| `pdf/xref/not-xref-stream` | `ParseError` | `readXrefStreamDict`: no indirect object at `at`, or one that is not a `/Type /XRef` stream. |
| `pdf/xref/bad-stream-section` | `RenderError` | `buildXrefStream`: unusable `num`, `offset`, `prev`, `root`, `encrypt` (anything but an indirect reference) or entry. |

## See also

- [`pdfTrailer`](./trailer.md) — types the dictionary returned here.
- [`pdfCrossRefStream`](./crossRefStream.md) — the §7.5.8 alternative.
- [`pdfDocument`](../document/document.md) — orchestrates xref plus the `/Prev` chain.
- [`pdfTokenizer`](./tokenizer.md), [`pdfParser`](./parser.md)
