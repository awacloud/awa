---
module: gzip
category: io/compress
dependencies: [deflate, crc32]
returns: object
worker-safe: true
status: complete
---

# gzip

> Gzip compression/decompression (RFC 1952) — DEFLATE + 10-byte header + CRC32. Standard HTTP format (`Content-Encoding: gzip`).

**Module** `gzip` | **Source** `packages/front/fw/src/io/compress/gzip.js` | **Deps** `deflate`, `crc32` | **Worker-safe** yes

## Resolve

```js
const gzip = runtime.resolve('gzip');
// Returns: { gzipSync, gunzipSync, gzip, gunzip, GzipStream, GunzipStream }
```

## API

### Synchronous

```js
const compressed   = gzip.gzipSync(uint8Array, opts?);    // → Uint8Array
const decompressed = gzip.gunzipSync(compressed, opts?);  // → Uint8Array
```

### Asynchronous

```js
const compressed   = await gzip.gzip(uint8Array, opts?);
const decompressed = await gzip.gunzip(compressed, opts?);
```

### Streaming

```js
// Compression
const parts = [];
const comp = new gzip.GzipStream(opts?, (chunk) => parts.push(chunk));
comp.push(data1);
comp.push(lastChunk, true);

// Decompression
const output = [];
const decomp = new gzip.GunzipStream(opts?, (chunk) => output.push(chunk)); // flush() as for zlib
decomp.push(gzChunk);
decomp.push(lastGzChunk, true);
```

## Options

### Compression (`gzipSync`, `gzip`, `GzipStream`)

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Compression level (default: 6) |
| `filename` | `string` | Original filename (stored in the header) |
| `mtime` | `number \| Date` | Modification date (stored in the header) |

`flush()` ends the stream when no trailer can be expected (a source that may
be truncated, such as a PDF FlateDecode stream): the last bytes, held back
until then as a presumed trailer, are decoded as payload and emitted. A
`push` after `flush()` (or after `final`) throws `ESTREAMEND` (errno 4). A header split
across chunks is fine: the stream waits until the whole header has arrived.

### Decompression (`gunzipSync`, `gunzip`, `GunzipStream`)

| Option | Type | Description |
|--------|------|-------------|
| `out` | `Uint8Array` | Pre-allocated output buffer |
| `dictionary` | `Uint8Array` | Decompression dictionary |
| `maxOutput` | `number` | Cap, in bytes, on the decoded output (a non-negative integer; absent = no cap). One byte more throws `EMAXOUT` (errno 7) before the buffer grows past the cap — the bound against a decompression bomb. It holds over every member, and on `GunzipStream` over the stream's life |
| `verify` | `boolean` | Check the CRC-32 and ISIZE trailer against the decoded bytes (RFC 1952 § 2.3.1); a mismatch throws `ECHECKSUM` (errno 16). Default `true`; `false` skips the check |

## Internal format (RFC 1952)

```
[10-byte header] [DEFLATE payload] [CRC32 4B] [original size 4B]
```

Header: magic `0x1F 0x8B`, method `0x08`, flags, mtime, XFL, OS (`3` = Unix).

A gzip file is a series of members (RFC 1952 § 2.2): `gunzipSync` and
`GunzipStream` decode every member and return their concatenation (each
member's trailer is checked, unless `verify: false`). Zero bytes after the last
member are ignored; any other trailing byte throws `EBADFORMAT` (errno 6), and a member cut
short throws `EEOF` (errno 0).

## Error codes

| `code` | `errno` | Meaning |
|---|------|---------|
| `EBADFORMAT` | 6 | Invalid gzip data (incorrect magic bytes) |
| `EMAXOUT` | 7 | Output limit exceeded — the decoded output would pass `maxOutput` |
| `ECHECKSUM` | 16 | Incorrect data check — unless `verify: false`, the CRC-32 or the size mod 2^32 does not match the decoded bytes |

`e.code` is the string in the first column; `e.errno` keeps the number of the
earlier convention (the compressor family's one typed convention, shared
with brotli).

## Example

```js
const gzip = runtime.resolve('gzip');
const utf8 = runtime.resolve('utf8');

const data = utf8.toBytes('Hello World '.repeat(1000));

// Compress with metadata
const compressed = gzip.gzipSync(data, {
    level: 9,
    filename: 'data.txt',
    mtime: new Date()
});

// Decompress
const decompressed = gzip.gunzipSync(compressed);
console.log(utf8.fromBytes(decompressed));
```

## Worker usage

```js
const worker = fw.createWorker(
    async function({ libs, args }) {
        const [rawData] = args;
        const compressed = await libs.gzip.gzip(rawData);
        self.postMessage({ compressed }, [compressed.buffer]);
    },
    { dependencies: ['gzip'], args: [data] }
);
```

## Notes

- Integrity checksum: CRC-32 (IEEE 802.3) computed on the uncompressed data — distinct from `zlib` which uses Adler-32.
- The gzip header stores an `mtime` (Unix timestamp) and optionally a `filename` — useful for interoperability with the system `gunzip`.
- Async methods use microtasks (no internal `Worker`) — they yield the main thread between compression blocks.

## See also

- [deflate](./deflate.md) — underlying engine
- [zlib](./zlib.md) — zlib format (Adler32 instead of CRC32)
- [zip](./zip.md) — multi-file archiving
- [crc32](../calc/crc32.md)
