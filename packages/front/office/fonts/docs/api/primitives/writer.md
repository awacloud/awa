---
module: fontWriter
category: primitives/writer
dependencies: [fontErrors, binaryWriter, fontFixed]
returns: object
worker-safe: true
status: complete
---

# fontWriter

> Big-endian binary writer — symmetric counterpart of `fontReader`.

**Module** `fontWriter` | **Source** `packages/front/office/fonts/src/primitives/writer.js` | **Deps** `fontErrors`, `binaryWriter`, `fontFixed` | **Worker-safe** yes

Grows an internal `Uint8Array` (doubling strategy) and exposes `finalize()`, which returns a tightly-sized copy of the bytes written. Used by table encoders, the SFNT packer and the subsetter.

## Resolve

```js
const { BinaryWriter, writer } = runtime.resolve('fontWriter');
const w = writer(initialCapacity);
```

## API

### Constructor

`new BinaryWriter(initialCapacity = 256)` — initial buffer size.

### Properties

| Property | Type | Description |
|-----------|------|-------------|
| `pos` | `number` | Current write offset. |
| `length` | `number` | Logical length (== `pos`). |

### Write methods

| Method | Signature | Description |
|---------|-----------|-------------|
| `writeUint8` / `writeInt8` | `(v) => this` | 1 byte. |
| `writeUint16` / `writeInt16` | `(v) => this` | 2 bytes BE. |
| `writeUint24` | `(v) => this` | 3 bytes BE. |
| `writeUint32` / `writeInt32` | `(v) => this` | 4 bytes BE. |
| `writeFixed` | `(v) => this` | Fixed 16.16. |
| `writeF2Dot14` | `(v) => this` | Saturated F2Dot14. |
| `writeTag` | `(v: string\|number) => this` | 4-char ASCII or uint32. |
| `writeLongDateTime` | `(seconds) => this` | 64-bit seconds since 1904. |
| `writeBytes` | `(u8: Uint8Array) => this` | Raw append. |
| `padTo4` | `() => this` | Zero-pad to a multiple of 4 (OT alignment). |
| `padTo` | `(align) => this` | Zero-pad to an arbitrary alignment. |

### Positioning methods

| Method | Signature | Description |
|---------|-----------|-------------|
| `seek` | `(p) => this` | Must stay within the already-written area. |
| `patchUint32` | `(pos, value) => this` | Back-patches a uint32 without moving the cursor. |
| `patchUint16` | `(pos, value) => this` | Back-patches a uint16. |
| `finalize` | `() => Uint8Array` | Tightly-sized copy of the bytes written. |

## Examples

### Building a table

```js
const { writer } = runtime.resolve('fontWriter');
const w = writer(54);
w.writeUint16(1).writeUint16(0).writeFixed(1.0);
const bytes = w.finalize();
```

### Deferred offset patch

```js
const offsetPos = w.pos;
w.writeUint32(0);          // placeholder
// ... bytes later ...
w.patchUint32(offsetPos, actualOffset);
```

## Notes

- All write methods are chainable (return `this`).
- `writeBytes` requires a `Uint8Array` — otherwise `ContractError('fonts/writer-input')`.
- `seek` does not allow moving past the written area — to reserve and patch later, write a placeholder then use `patchUint*`.
- `writeTag(string)` rejects any non-ASCII character (`> 0x7F`) — `ContractError('fonts/bad-tag')`. Avoids the historical silent-truncation issue.
- **v1.0.0 migration**: implementation delegated to `@awacloud/fw/io/binary/writer.js`. The fonts package's `BinaryWriter` facade keeps the historical API (`writeFixed`, `writeF2Dot14`, `writeTag`, `writeLongDateTime`, `padTo4/padTo`, `patchUint16/32`).

## See also

- [reader](./reader.md)
- [checksum](./checksum.md) — used after SFNT finalization
