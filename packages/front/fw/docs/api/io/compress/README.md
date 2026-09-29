# IO / Compress — Compression

Binary compression modules. All worker-safe (pure factories, no DOM).

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [lz4](./lz4.md) | `object` | none | LZ4 compression (fast, streaming) |
| [bitstream](./bitstream.md) | `object` | none | LSB-first bit read/write + reverse table |
| [huffman](./huffman.md) | `object` | bitstream | Canonical Huffman codes (encode + decode) |
| [lz77](./lz77.md) | `object` | none | LZ77 hash-chain matching (literal + match callbacks) |
| [lzw](./lzw.md) | `object` | none | LZW dynamic dictionary, variable codes (GIF/TIFF/.Z) |
| [deflate](./deflate.md) | `object` | bitstream, huffman, lz77 | Deflate (internal engine, RFC 1951) |
| [gzip](./gzip.md) | `object` | deflate, crc32 | Gzip sync/async/streaming (RFC 1952) |
| [zlib](./zlib.md) | `object` | deflate, adler32 | Zlib sync/async/streaming (RFC 1950) |
| [zip](./zip.md) | `object` | deflate, crc32 | ZIP sync/async/streaming archive |
| [brotliDict](./brotli_dict.md) | `object` | none | Brotli — tables + 121 transforms (RFC 7932 Appendix B) |
| [brotliDictWords](./brotli_dict_words.md) | `object` | none | Brotli — static dictionary blob (RFC 7932 Appendix A, lazy-loadable) |
| [brotli](./brotli.md) | `object` | bitstream, huffman, lz77, brotliDict, brotliDictWords | Brotli RFC 7932 — full decoder, dynamic encoder |
| [brotliShared](./brotli_shared.md) | `object` | brotli, brotliDict, brotliDictWords | RFC 9841 extensions (large window, shared dictionary §3.1/§3.2, `parseSharedDictionary` §5) |
| [brotliFrame](./brotli_frame.md) | `object` | none | RFC 9841 §8 Shared Brotli Framing Format parser |

## Common pattern

```js
const lz4   = runtime.resolve('lz4');
const gzip  = runtime.resolve('gzip');
const zip   = runtime.resolve('zip');
const br    = runtime.resolve('brotli');

// LZ4 — ultra-fast, ideal for temporary data
const [size, compressed] = lz4.compress(data, data.length);
const [origSize, original] = lz4.decompress(compressed);

// Gzip — web standard (Accept-Encoding, fetch)
const gz = gzip.gzipSync(data);
const raw = gzip.gunzipSync(gz);

// ZIP — multi-file archiving
const archive = zip.zipSync({ 'file.txt': textBytes, 'data.bin': binBytes });
const files = zip.unzipSync(archive);

// Brotli — RFC 7932, superior ratio on text
const enc = br.brotliCompressSync(data, { quality: 11 });
const dec = br.brotliDecompressSync(enc);
```

## Choosing the right module

| Use case | Module |
|-------------|--------|
| Fast compression without standard | `lz4` |
| HTTP/browser compatibility (gzip Content-Encoding) | `gzip` |
| System tool compatibility (Unix `zlib`) | `zlib` |
| Multi-file archiving | `zip` |
| Compression only (base for gzip/zlib/zip) | `deflate` |
| Superior ratio on text (Brotli RFC 7932 core) | `brotli` |
| Shared dictionary / large window / §5 parser (RFC 9841) | `brotliShared` |
| Multi-resource framing container (RFC 9841 §8) | `brotliFrame` |
| Text compression with small dictionary | `lzw` (GIF/TIFF/.Z) |
| Low-level primitives for building a codec | `bitstream`, `huffman`, `lz77` |
