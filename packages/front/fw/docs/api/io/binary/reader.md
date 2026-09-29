---
module: binaryReader
category: io/binary
dependencies: []
returns: object
worker-safe: true
status: complete
---

# binaryReader

> Endianness-aware cursor reader over Uint8Array — BE + LE, typed primitives, strings.

**Module** `binaryReader` | **Source** `packages/front/fw/src/io/binary/reader.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const binaryReader = runtime.resolve('binaryReader');
// Returns: { create }
```

## API

### Factory

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(uint8: Uint8Array, opts?: { endian?: 'be'\|'le' }) => Reader` | Reader instance |

### Reader — position

| Method | Signature | Returns |
|--------|-----------|---------|
| `pos` | getter | `number` — current offset |
| `length` | getter | `number` — buffer size |
| `tell` | `() => number` | alias for `pos` |
| `eof` | `() => boolean` | `true` if `pos >= length` |
| `seek` | `(offset: number) => Reader` | absolute positioning |
| `skip` | `(n: number) => Reader` | advance by n bytes |
| `peek` | `(n: number) => Uint8Array` | read without advancing pos |
| `setEndian` | `(e: 'be'\|'le') => void` | change the current endianness |

### Reader — unsigned primitives

| Method | Returns |
|--------|---------|
| `u8()` | `number` uint8 |
| `u16()` | `number` uint16 |
| `u24()` | `number` uint24 |
| `u32()` | `number` uint32 |
| `u64()` | `BigInt` uint64 |
| `u64Safe()` | `number` — throws if > `Number.MAX_SAFE_INTEGER` |

### Reader — signed primitives

| Method | Returns |
|--------|---------|
| `i8()` | `number` int8 |
| `i16()` | `number` int16 |
| `i32()` | `number` int32 |
| `i64()` | `BigInt` int64 |

### Reader — floats

| Method | Returns |
|--------|---------|
| `f32()` | `number` float32 |
| `f64()` | `number` float64 |

### Reader — strings / bytes

| Method | Signature | Returns |
|--------|-----------|---------|
| `bytes` | `(n: number) => Uint8Array` | zero-copy slice |
| `utf8` | `(n: number) => string` | decode UTF-8 |
| `ascii` | `(n: number) => string` | decode ASCII, throws if byte > 127 |
| `cstring` | `() => string` | read until NUL, advances pos one extra byte |

### Reader — sub-reader

| Method | Signature | Returns |
|--------|-----------|---------|
| `sub` | `(offset: number, length: number) => Reader` | independent reader (zero-copy) |

## Examples

```js
const binaryReader = runtime.resolve('binaryReader');

// Big-endian read (SFNT/OpenType)
const r = binaryReader.create(sfntBytes, { endian: 'be' });
const sfVersion = r.u32();   // 0x00010000 = TrueType
const numTables = r.u16();
r.skip(6);

// Switch endian mid-stream (mixed PDF)
r.setEndian('le');
const xrefOffset = r.u32();

// Sub-reader on a table
const sub = r.sub(tableOffset, tableLength);
const tag = sub.ascii(4); // "cmap"
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const r = libs.binaryReader.create(args[0], { endian: 'be' });
        self.postMessage(r.u32());
    },
    { dependencies: ['binaryReader'], args: [bytes] }
);
```

## Notes

- The sub-reader is **zero-copy**: it shares the parent buffer via `Uint8Array.subarray()`. Mutating the parent buffer affects the sub-reader.
- `u64()` and `i64()` return `BigInt` — use `u64Safe()` when you need a `Number` and the value is guaranteed sub-2^53.
- All errors (overrun, OOB seek, invalid ASCII, missing NUL) are `ContractError` with `.code` and `.context`.

## See also

- [binaryWriter](./writer.md) — endianness-aware binary writer (companion module)
