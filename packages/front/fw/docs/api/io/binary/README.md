# IO / Binary

Endianness-aware binary read/write (big-endian + little-endian) over `DataView`.

Modules designed for parsing and generating binary file formats: SFNT/OpenType, PDF streams, BMP, WAV, MP4 atoms, etc.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [binaryReader](./reader.md) | `{ create }` | none | Cursor reader over Uint8Array — typed primitives, strings, zero-copy sub-reader |
| [binaryWriter](./writer.md) | `{ create }` | none | Auto-growing writer — typed primitives, strings, seek-based patch |

## Common pattern

```js
const binaryReader = runtime.resolve('binaryReader');
const binaryWriter = runtime.resolve('binaryWriter');

// Reading
const r = binaryReader.create(bytes, { endian: 'be' });
const magic = r.u32();

// Writing + round-trip
const w = binaryWriter.create({ endian: 'be' });
w.u32(0x00010000);
w.u16(1);
const out = w.finalize();
```

All these modules are **worker-safe** (no DOM dependency).
