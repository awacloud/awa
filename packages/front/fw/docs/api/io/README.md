# IO — Input/output modules

Pure (worker-safe) modules for binary and text data manipulation.

| Category | Modules | Description |
|-----------|---------|-------------|
| [Codec](./codec/README.md) | `hex`, `b64`, `base32`, `base58`, `utf8`, `buffer`, `cbor`, `msgpack`, `csv`, `url`, `mime`, `xml` | Encoding/decoding: bytes↔string, value↔bytes, value↔text, HTTP web formats, XML |
| [Compress](./compress/README.md) | `lz4`, `lzw`, `bitstream`, `huffman`, `lz77`, `deflate`, `gzip`, `zlib`, `zip`, `brotli`, `brotliShared`, `brotliFrame`, `brotliDict`, `brotliDictWords` | Compression/decompression (RFC 1950/1951/1952, RFC 7932/9841, ZIP) |
| [Calc](./calc/README.md) | `crc32`, `adler32`, `easing`, `bigint` | Calculations: checksums, easing, BigInt |
| [Math](./math/README.md) | `linalg`, `stats`, `geom`, `interp`, `fixedPoint` | Linear algebra, statistics, geometry, interpolation, fixed-point conversions |
| [Utils](./utils/README.md) | `eventBus`, `queue`, `bitmap`, `ui8`, `valid`, `errors`, `signal`, `uuid` | Application pub/sub, binary utilities, validation, reactive signals, identifiers |
| [Timing](./timing/README.md) | `clock`, `rateLimit`, `scheduler` | Monotonic clock, rate limiting, scheduling |
| [Sync](./sync/README.md) | `abort`, `mutex`, `semaphore`, `channel`, `atomics`, `cancellable`, `tokenBucket` | Synchronisation, cancellation, logical rate limiting |
| [Structures](./structures/README.md) | `lruCache`, `heap`, `ringBuffer`, `trie`, `btree`, `treeWalker` | Low-level data structures + generic tree visitor |
| [Binary](./binary/README.md) | `binaryReader`, `binaryWriter` | Endianness-aware binary read/write (BE + LE) over Uint8Array |
| [Time](./time/README.md) | `date` | Temporal helpers (formatting, parsing, timezone) |
| [i18n](./i18n/README.md) | `i18n` | Translation and localisation (Intl) |
| [Text](./text/README.md) | `ansi`, `semver`, `str`, `unicode`, `htmlEntities` | ANSI/VT100/xterm, semver 2.0.0, string manipulation, Unicode, HTML5 entities decoder |

All these modules are **worker-safe** (no DOM dependency).
