# Primitives

Low-level building blocks shared by every OpenType table — binary, numeric and text encodings.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [fixed](./fixed.md) | `{fixedFromInt32, ...}` | none | Fixed 16.16 / F2Dot14 / version16Dot16. |
| [tag](./tag.md) | `{tag, untag, tagEquals}` | `fontErrors` | 4-char ASCII tag ↔ uint32 BE. |
| [reader](./reader.md) | `{BinaryReader, reader, sliceTable}` | `fontErrors`, `binaryReader`, `fontFixed` | Big-endian binary reader. |
| [writer](./writer.md) | `{BinaryWriter, writer}` | `fontErrors`, `binaryWriter`, `fontFixed` | Big-endian binary writer. |
| [checksum](./checksum.md) | `{calcTableChecksum, computeChecksumAdjustment}` | none | OT checksum + `head` adjustment. |
| [encoding](./encoding.md) | `{decodeUtf16Be, ...}` | `fontErrors` | UTF-16BE and Mac Roman for `name`. |

## Common pattern

```js
const r = runtime.resolve('fontReader').reader(bytes);
const w = runtime.resolve('fontWriter').writer();
// ... typed BE read / write ...
```

## Why a facade over `@awacloud/fw`

Since v1.0.0, `BinaryReader` / `BinaryWriter` delegate the primitives
(`u8/u16/u24/u32`, `i8/i16/i32`, `bytes`, `seek`) to
`@awacloud/fw/io/binary/{reader,writer}.js`. The facade nevertheless stays
**non-redundant** for the following reasons:

- **OpenType-specific API**: `readFixed`, `readF2Dot14`, `readTag`,
  `readLongDateTime`, `readOffset16/32`, `peek(fn)`, `sub(start, len)`,
  `writeTag`, `writeLongDateTime`, `padTo4/padTo`, `patchUint16/32`.
  None of these helpers belong in a generic BE module.
- **Error hierarchy**: the facade translates fw's `ContractError` into
  the fonts package's `ParseError` (`fonts/reader-*`, `fonts/writer-*`).
  Without this translation, callers would have to branch on two
  disjoint hierarchies for identical errors.
- **Windowing at construction**: `new BinaryReader(bytes, start,
  length)` materializes a sub-buffer with no allocation, which fw only
  exposes via `create(view, opts)`. The facade derives the view itself.
- **Documented invariants**: `readBytes` shares the source buffer;
  `writeTag` rejects non-ASCII characters; `readLongDateTime` preserves
  precision beyond 2^32. These three invariants are covered by tests in
  `src/primitives/reader.test.js` and `writer.test.js`.
