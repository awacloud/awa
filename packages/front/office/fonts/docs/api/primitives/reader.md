---
module: fontReader
category: primitives/reader
dependencies: [fontErrors, binaryReader, fontFixed]
returns: object
worker-safe: true
status: complete
---

# fontReader

> Big-endian binary reader — SFNT / OpenType / WOFF / TrueType streams.

**Module** `fontReader` | **Source** `packages/front/office/fonts/src/primitives/reader.js` | **Deps** `fontErrors`, `binaryReader`, `fontFixed` | **Worker-safe** yes

Wraps a `DataView` over a `Uint8Array` and exposes typed reads (int / uint 8/16/24/32, Fixed, F2Dot14, tag, LONGDATETIME) plus cursor management (`pos`, `seek`, `skip`, `peek`, `sub`). Always BE — OpenType is big-endian throughout.

## Resolve

```js
const { BinaryReader, reader, sliceTable } = runtime.resolve('fontReader');
const r = reader(bytes);
```

`sliceTable(bytes, offset, length)` returns a bounds-checked, zero-copy `Uint8Array` view over `bytes` (a non-`Uint8Array` input throws `ParseError('fonts/reader-input')`, a range outside the buffer throws `ParseError('fonts/reader-sub')`).

## API

### Constructor

`new BinaryReader(bytes, start?, length?)` — throws `ParseError` if the input is not a `Uint8Array` or if `start+length` exceeds the buffer.

### Properties

| Property | Type | Description |
|-----------|------|-------------|
| `pos` | `number` | Current offset in the window. |
| `length` | `number` | Total size of the window. |
| `eof` | `boolean` | `true` when the cursor is at the end. |

### Methods

| Method | Signature | Description |
|---------|-----------|-------------|
| `seek` | `(p: number) => this` | Sets the cursor. |
| `skip` | `(n: number) => this` | Advances by `n` bytes. |
| `peek` | `(fn: (r) => T) => T` | Runs `fn` then restores the cursor. |
| `sub` | `(start, length) => BinaryReader` | Sub-reader, independent cursor. |
| `readBytes` | `(n) => Uint8Array` | Shared view of the buffer. |
| `readBytesCopy` | `(n) => Uint8Array` | Independent copy. |
| `readUint8` / `readInt8` | `() => number` | 1 byte. |
| `readUint16` / `readInt16` | `() => number` | 2 bytes BE. |
| `readUint24` | `() => number` | 3 bytes BE. |
| `readUint32` / `readInt32` | `() => number` | 4 bytes BE. |
| `readFixed` | `() => number` | Fixed 16.16. |
| `readF2Dot14` | `() => number` | F2Dot14. |
| `readTag` | `() => number` | uint32. |
| `readLongDateTime` | `() => number` | 64-bit seconds since 1904 (Number — ~2^53 precision). |
| `readOffset16` / `readOffset32` | `() => number` | Semantic aliases. |

## Examples

### Simple parsing

```js
const { reader } = runtime.resolve('fontReader');
const r = reader(bytes);
const version = r.readUint32();
const numTables = r.readUint16();
r.skip(6);
```

### Sub-reader

```js
const sub = r.sub(offset, length);
const x = sub.readUint16();   // r.pos unchanged
```

### Peek

```js
const next = r.peek(rr => rr.readUint32());
// r.pos stays where it was
```

## Notes

- All reads are BE — no endianness option, by OpenType design.
- Out-of-bounds / EOF throws `ParseError('fonts/reader-eof'|'fonts/reader-seek'|'fonts/reader-sub')`.
- `readBytes` shares the source buffer — mutating the returned window affects the stream.
- **v1.0.0 migration**: implementation delegated to `@awacloud/fw/io/binary/reader.js`. The fonts package's `BinaryReader` facade keeps the historical API (BE semantics, `peek`, `sub`, OT types) and translates fw's `ContractError` into typed `fonts/reader-*` `ParseError`s; the original `ContractError` is kept as the `cause` of the `ParseError`.

## See also

- [writer](./writer.md) — symmetric write side
- [fixed](./fixed.md)
