---
module: zlib
category: io/compress
dependencies: [deflate, adler32]
returns: object
worker-safe: true
status: complete
---

# zlib

> Zlib compression/decompression (RFC 1950) — DEFLATE + 2-byte header + Adler32. Used by PNG, HTTP, and many binary formats.

**Module** `zlib` | **Source** `packages/front/fw/src/io/compress/zlib.js` | **Deps** `deflate`, `adler32` | **Worker-safe** yes

## Resolve

```js
const zlib = runtime.resolve('zlib');
// Returns: { zlibSync, unzlibSync, zlib, unzlib, ZlibStream, UnzlibStream }
```

## API

### Synchronous

```js
const compressed   = zlib.zlibSync(uint8Array, opts?);    // → Uint8Array
const decompressed = zlib.unzlibSync(compressed, opts?);  // → Uint8Array
```

### Asynchronous

```js
const compressed   = await zlib.zlib(uint8Array, opts?);
const decompressed = await zlib.unzlib(compressed, opts?);
```

### Streaming

```js
// Compression
const parts = [];
const comp = new zlib.ZlibStream(opts?, (chunk) => parts.push(chunk));
comp.push(data1);
comp.push(lastChunk, true);

// Decompression
const output = [];
const decomp = new zlib.UnzlibStream(opts?, (chunk) => output.push(chunk));
decomp.push(zlibChunk);
decomp.push(lastZlibChunk, true);
// or, when the trailer may be missing: decomp.push(chunk); decomp.flush();
```

`flush()` ends the stream when no trailer can be expected (a source that may
be truncated, such as a PDF FlateDecode stream): the last bytes, held back
until then as a presumed trailer, are decoded as payload and emitted. A
`push` after `flush()` (or after `final`) throws `ESTREAMEND` (errno 4). A header split
across chunks is fine: the stream waits until the whole header has arrived.

## Options

### Compression (`zlibSync`, `zlib`, `ZlibStream`)

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Compression level (default: 6) |
| `dictionary` | `Uint8Array` | Pre-compression dictionary |

### Decompression (`unzlibSync`, `unzlib`, `UnzlibStream`)

| Option | Type | Description |
|--------|------|-------------|
| `out` | `Uint8Array` | Pre-allocated output buffer |
| `dictionary` | `Uint8Array` | Matching dictionary |
| `maxOutput` | `number` | Cap, in bytes, on the decoded output (a non-negative integer; absent = no cap). One byte more throws `EMAXOUT` (errno 7) before the buffer grows past the cap — the bound against a decompression bomb. On `UnzlibStream` it caps the stream's total |
| `verify` | `boolean` | Check the Adler-32 trailer against the decoded bytes (RFC 1950 § 2.3); a mismatch throws `ECHECKSUM` (errno 16), a frame too short for a deflate stream and its trailer throws `EEOF` (errno 0). Default `true`; `false` skips both checks (the trailer is not read) |

## Internal format (RFC 1950)

```
[CMF 1B][FLG 1B] [DICTID 4B optional] [DEFLATE payload] [Adler32 4B big-endian]
```

CMF = `0x78` (CM=8 DEFLATE, CINFO=7 window 32K). FCHECK ensures `(CMF×256 + FLG) % 31 === 0`.

## Error codes

| `code` | `errno` | Meaning |
|---|------|---------|
| `EEOF` | 0 | Unexpected EOF — unless `verify: false`, a frame shorter than a deflate stream and its trailer (e.g. the header plus 0-4 bytes) |
| `EBADFORMAT` | 6 | Invalid zlib data |
| `EMAXOUT` | 7 | Output limit exceeded — the decoded output would pass `maxOutput` |
| `ECHECKSUM` | 16 | Incorrect data check — unless `verify: false`, the Adler-32 trailer does not match the decoded bytes |

`e.code` is the string in the first column; `e.errno` keeps the number of the
earlier convention (the compressor family's one typed convention, shared
with brotli).

## Example

```js
const zlib = runtime.resolve('zlib');

const data = new TextEncoder().encode('<svg>...</svg>'.repeat(200));

const compressed   = zlib.zlibSync(data, { level: 9 });
const decompressed = zlib.unzlibSync(compressed);

// With dictionary (optimized compression for similar data)
const dict = new TextEncoder().encode('<svg><path d="');
const c = zlib.zlibSync(data, { level: 9, dictionary: dict });
const d = zlib.unzlibSync(c, { dictionary: dict });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const zlib = libs.zlib;
        const compressed = zlib.zlibSync(args.data, { level: 6 });
        self.postMessage(compressed, [compressed.buffer]);
    },
    { dependencies: ['zlib'], args: { data: new Uint8Array(rawData) } }
);
```

## Notes

- Integrity checksum: Adler-32 (RFC 1950) computed on the uncompressed data — distinct from `gzip` which uses CRC-32.
- The zlib dictionary must be identical on both the compressor and decompressor sides — a mismatch produces a checksum error during decompression.
- The zlib format (CMF+FLG header) is not the same as gzip (magic bytes `1f 8b`) or raw deflate (no header) — use the correct module for the target format.

## See also

- [deflate](./deflate.md) — underlying engine
- [gzip](./gzip.md) — gzip format (CRC32 instead of Adler32)
- [zip](./zip.md) — multi-file archiving
- [adler32](../calc/adler32.md)
