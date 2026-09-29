---
module: binaryWriter
category: io/binary
dependencies: []
returns: object
worker-safe: true
status: complete
---

# binaryWriter

> Endianness-aware auto-growing binary writer — BE + LE, typed primitives, strings.

**Module** `binaryWriter` | **Source** `packages/front/fw/src/io/binary/writer.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const binaryWriter = runtime.resolve('binaryWriter');
// Returns: { create }
```

## API

### Factory

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(opts?: { endian?: 'be'\|'le', initialSize?: number }) => Writer` | Writer instance |

### Writer — position

| Method | Signature | Returns |
|--------|-----------|---------|
| `pos` | getter | `number` — current offset |
| `length` | getter | `number` — logical bytes written |
| `seek` | `(offset: number) => Writer` | absolute positioning (may overwrite) |
| `align` | `(n: number) => Writer` | pad with 0x00 to the next multiple of n |

### Writer — unsigned primitives

| Method | Signature | Returns |
|--------|-----------|---------|
| `u8` | `(v: number) => Writer` | writes 1 byte |
| `u16` | `(v: number) => Writer` | writes 2 bytes |
| `u24` | `(v: number) => Writer` | writes 3 bytes |
| `u32` | `(v: number) => Writer` | writes 4 bytes |
| `u64` | `(v: BigInt) => Writer` | writes 8 bytes |

### Writer — signed primitives

| Method | Signature | Returns |
|--------|-----------|---------|
| `i8` | `(v: number) => Writer` | writes 1 signed byte |
| `i16` | `(v: number) => Writer` | writes 2 signed bytes |
| `i32` | `(v: number) => Writer` | writes 4 signed bytes |
| `i64` | `(v: BigInt) => Writer` | writes 8 signed bytes |

### Writer — floats

| Method | Signature | Returns |
|--------|-----------|---------|
| `f32` | `(v: number) => Writer` | writes 4-byte float |
| `f64` | `(v: number) => Writer` | writes 8-byte double |

### Writer — strings / bytes

| Method | Signature | Returns |
|--------|-----------|---------|
| `bytes` | `(arr: Uint8Array) => Writer` | copy bytes |
| `utf8` | `(s: string) => Writer` | encode as UTF-8 |
| `ascii` | `(s: string) => Writer` | encode ASCII, throws if char > 127 |
| `cstring` | `(s: string) => Writer` | encode UTF-8 + NUL terminator |

### Writer — finalization

| Method | Signature | Returns |
|--------|-----------|---------|
| `finalize` | `() => Uint8Array` | returns the exact buffer (logical size, not capacity) |

## Examples

```js
const binaryWriter = runtime.resolve('binaryWriter');

// Build a minimal SFNT header (big-endian)
const w = binaryWriter.create({ endian: 'be', initialSize: 256 });
w.u32(0x00010000); // sfVersion TrueType
w.u16(12);         // numTables
w.u16(0x0080);     // searchRange
w.u16(3);          // entrySelector
w.u16(0x0040);     // rangeShift

// Patch a length field written ahead of time
w.u32(0x00000000); // placeholder offset=12
const dataStart = w.pos;
w.bytes(tableData);
w.seek(12);
w.u32(dataStart);  // patch the offset

const sfnt = w.finalize(); // exact Uint8Array
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const w = libs.binaryWriter.create({ endian: 'le' });
        w.u32(42);
        const out = w.finalize();
        self.postMessage(out, [out.buffer]);
    },
    { dependencies: ['binaryWriter'] }
);
```

## Notes

- The buffer grows automatically by doubling (×2 factor) each time capacity is exceeded.
- `finalize()` returns a **copy** truncated to the logical size — the internal writer remains usable afterwards.
- `seek()` can point before the end to overwrite — useful for patching length/offset fields written as placeholders.
- `cstring(null)` and any invalid input throw a `ContractError` with `.code` and `.context`.

## See also

- [binaryReader](./reader.md) — endianness-aware binary reader (companion module)
