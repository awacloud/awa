---
module: pdfWriter
category: pdf/document
dependencies: [pdfErrors, pdfSerializer]
returns: object
worker-safe: true
status: complete
---

# pdfWriter

> Model → PDF 2.0 `Uint8Array` — header, indirects, classical xref, trailer.

**Module** `pdfWriter` | **Source** `packages/front/office/pdf/src/document/writer.js` | **Deps** `pdfErrors`, `pdfSerializer` | **Worker-safe** yes

Emits a complete PDF document per ISO 32000-2 §7.5.2–7.5.5:

1. Header `%PDF-x.y\n` plus the binary marker comment.
2. For each indirect, `serializeIndirect` and the recording of its offset.
3. Classical xref table — `xref` keyword, one `0 N` subsection, 20-byte entries
   (`0000000000 65535 f ` for the free-list head, `oooooooooo 00000 n ` for live
   objects, `0000000000 00000 f ` for holes).
4. Trailer dictionary plus `startxref` and `%%EOF`.

`writeDocument` is model-agnostic: it happily emits a from-scratch indirect list
(see the second example). `assembleIndirects(model)` covers the **read → write
round trip**: it forces full resolution of a model read through `pdf.read()`,
then snapshots the `_raw.indirects` cache into an ordered list ready for
`writeDocument`. The result is byte-different but semantically equivalent.

Two sibling factories build on this one: `pdfBuilder` (`{ builder }`) offers a
chainable constructive DSL — `addPage`, `addContent`, `addFont`, `addMetadata`,
`setVersion`, `setId`, `build()` — and `pdfIncrementalWriter`
(`{ appendIncremental }`) appends an incremental-update section (§7.5.6) to
existing bytes. `pdfEncryptedWriter` (`{ writeEncryptedDocument }`) wraps
`writeDocument` with the standard security handlers.

## Resolve

```js
const writer = runtime.resolve('pdfWriter');
// Returns: { writeDocument, assembleIndirects }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `writeDocument` | `(opts: WriteOpts) => Uint8Array` | Complete document. |
| `assembleIndirects` | `(model: ReadModel, opts?: { strict?: boolean }) => Array<{num, gen, value}>` | Ordered snapshot; carries `skippedObjects` (see below). |

### `WriteOpts`

```js
{
    indirects: [ { num, gen, value }, … ],   // required — num >= 1, no duplicates
    root:      { num, gen },                 // required — trailer /Root
    info?:     { num, gen },                 // optional — /Info
    version?:  '2.0' | '1.7' | …             // default '2.0', matches /^\d\.\d$/
    id?:       [ Uint8Array, Uint8Array ]    // 2 × 16 bytes for /ID
}
```

`indirects` is sorted by `num` before emission, so the caller need not supply it
in ascending order.

### Unresolvable objects (`skippedObjects`, `strict`)

`assembleIndirects` forces resolution of every in-use xref entry. An entry whose
resolution throws cannot be written, so it never reaches the snapshot. The loss is
reported, not silent:

- **Lenient (default)** — the snapshot is returned as before (byte-identical
  output for a fully resolvable model) and carries the skipped entries on its
  **non-enumerable** `skippedObjects` property: `Array<{ num, gen, code }>`,
  empty when nothing was skipped. `code` is the caught error's `code` when it is a
  typed pdf error, else `'unknown'`. Being non-enumerable, it does not change
  iteration, spreading, `JSON.stringify` or deep equality of the array.
- **`opts.strict === true`** — throws a `RenderError` coded
  `pdf/writer/unresolvable-objects` (message names the count) whose
  `context.objects` is the same list.

```js
const indirects = writer.assembleIndirects(model);
if (indirects.skippedObjects.length > 0) {
    console.warn('dropped', indirects.skippedObjects);   // [{ num, gen, code }, …]
}
writer.assembleIndirects(model, { strict: true });        // throws instead of dropping
```

`pdf.write(model)` calls `assembleIndirects(model)` in lenient mode and does not
forward the list; call `assembleIndirects` directly to observe or forbid drops.

## Examples

### Read → write round trip

```js
const pdf = runtime.resolve('pdf');
const writer = runtime.resolve('pdfWriter');

const model = pdf.read(srcBytes);
const indirects = writer.assembleIndirects(model);
const out = writer.writeDocument({
    indirects,
    root: { num: model.trailer.root.num, gen: model.trailer.root.gen },
    info: model.trailer.info,
    version: model.version
});
```

### Minimal from-scratch document

```js
const writer = runtime.resolve('pdfWriter');
const out = writer.writeDocument({
    indirects: [
        { num: 1, gen: 0, value: { type: 'dict', entries: {
            Type: { type: 'name', value: 'Catalog' },
            Pages: { type: 'ref', num: 2, gen: 0 }
        }}},
        { num: 2, gen: 0, value: { type: 'dict', entries: {
            Type: { type: 'name', value: 'Pages' },
            Count: { type: 'int', value: 0 },
            Kids: { type: 'array', items: [] }
        }}}
    ],
    root: { num: 1, gen: 0 }
});
```

### `/ID` for reproducibility

```js
const id = new Uint8Array(16); /* … filled … */
writer.writeDocument({ indirects, root, id: [id, id] });
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/writer/bad-input` | `RenderError` | `opts.indirects` is not an array. |
| `pdf/writer/no-root` | `RenderError` | `opts.root` missing or `num` not finite. |
| `pdf/writer/bad-version` | `RenderError` | `version` does not match `/^\d\.\d$/`. |
| `pdf/writer/bad-indirect` | `RenderError` | An element without a finite `num` ≥ 1. |
| `pdf/writer/duplicate-num` | `RenderError` | Two entries share the same `num`. |
| `pdf/writer/bad-model` | `RenderError` | `assembleIndirects` given something other than a `pdf.read()` model. |
| `pdf/writer/unresolvable-objects` | `RenderError` | `assembleIndirects(model, { strict: true })` and at least one in-use object could not be resolved; `context.objects` is `Array<{ num, gen, code }>`. |

It also propagates every code from [`pdfSerializer`](../syntax/serializer.md).

## See also

- [`pdfSerializer`](../syntax/serializer.md) — per-object emission.
- [`pdfDocument`](./document.md) — inverse operation.
- [`pdfErrors`](../errors.md)
