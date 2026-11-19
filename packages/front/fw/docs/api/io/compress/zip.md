---
module: zip
category: io/compress
dependencies: [deflate, crc32]
returns: object
worker-safe: true
status: complete
---

# zip

> ZIP archiving (PKZIP) — multi-file create and extract, sync/async/streaming. Supports ZIP64 (> 4 GB).

**Module** `zip` | **Source** `packages/front/fw/src/io/compress/zip.js` | **Deps** `deflate`, `crc32` | **Worker-safe** yes

## Resolve

```js
const zip = runtime.resolve('zip');
// Returns: { zipSync, unzipSync, zip, unzip, ZipStream, ZipStreamReader }
```

## API

### Synchronous

```js
// Create an archive
const archive = zip.zipSync(files, opts?);  // → Uint8Array

// Extract
const files = zip.unzipSync(archive, opts?);  // → { [path]: Uint8Array }
```

### Asynchronous

```js
const archive = await zip.zip(files, opts?);
const files   = await zip.unzip(archive, opts?);
```

### Streaming — write (`ZipStream`)

```js
const parts = [];
const stream = new zip.ZipStream(opts?, (chunk) => parts.push(chunk));

// Full file
stream.add('readme.txt', textBytes);
stream.add('data.bin', [binaryBytes, { level: 0 }]);  // store (no compression)

// Streaming file (large files)
const entry = stream.openEntry('big.dat', { level: 6 });
entry.push(chunk1);
entry.push(chunk2, true);  // true = last chunk of the file

// Directory
stream.add('subdir/', new Uint8Array(0));

// Finalize the archive (emits Central Directory + EOCD)
stream.finalize();
```

### Streaming — read (`ZipStreamReader`)

```js
const reader = new zip.ZipStreamReader(opts?, (name, data) => {
    console.log('file:', name, data.length, 'bytes');
});
reader.push(archiveChunk);
reader.push(lastChunk, true);  // Central Directory at the end
```

## `files` format (zipSync / zip)

```js
const files = {
    'file.txt': textBytes,                          // Uint8Array direct
    'data.bin': [binaryBytes, { level: 0 }],        // with per-file options
    'images/photo.jpg': [jpgBytes, { level: 0 }],   // store (already-compressed data)
    'subdir/': {}                                   // directory entry
};
```

## Options

### Archive (`opts`)

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Default compression level (default: 6) |
| `mtime` | `number \| Date` | Default modification date |
| `comment` | `string` | Archive comment |

### Per file (second element of the `[data, opts]` tuple)

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Compression level (`0` = store) |
| `mtime` | `number \| Date` | Modification date |
| `comment` | `string` | File comment |

### Extraction (`filter`)

```js
const files = zip.unzipSync(archive, {
    filter: ({ name, size, originalSize, compression }) => {
        return name.endsWith('.txt');  // extract only .txt files
    }
});
```

Entry names are read with `/` as the separator: a `\` (written by .NET Framework's `ZipFile.CreateFromDirectory`, against APPNOTE 4.4.17) becomes `/`, as Info-ZIP, 7-Zip and CPython present it; the zip-slip check runs on the normalised name. An entry named `__proto__` is extracted as an own property of the result (and written as an entry by `zipSync`); the result has a `null` prototype (no inherited key; use `Object.hasOwn`).

### Extraction (`maxOutput`)

`unzipSync(archive, { maxOutput })` (and `unzip`, `ZipStreamReader`) caps the
bytes extracted over every entry. Each entry's size as the central directory
declares it is checked against what is left **before** its buffer is
allocated, so an archive declaring a 4 GiB entry fails with `EMAXOUT` instead of
allocating it. Absent, there is no cap.

### Extraction (`verify`)

`unzipSync(archive)` checks each extracted entry against the CRC-32 and the
uncompressed size the central directory records; a mismatch throws `ECHECKSUM` (errno 16)
naming the entry. `{ verify: false }` skips the check. The streaming reader
(`ZipStreamReader`) does not take the option.

## Deterministic / reproducible archives

Fixing the writer-level `mtime` makes two writes of an identical payload
byte-identical. Without it, every entry lacking its own `p.mtime` falls
back to `Date.now()`, so bytes differ from run to run even for the same
content.

```js
const zip = runtime.resolve('zip');
const MTIME = Date.UTC(2020, 0, 1);  // any fixed instant, e.g. a build's commit time

const a1 = zip.zipSync({ 'file.txt': data }, { mtime: MTIME });
const a2 = zip.zipSync({ 'file.txt': data }, { mtime: MTIME });
// a1 and a2 are byte-identical

// Same option on the streaming writer, at construction time:
const stream = new zip.ZipStream({ mtime: MTIME }, (chunk) => parts.push(chunk));
```

- `opts.mtime` is a **writer-level default**: it seeds every entry that
  does not supply its own `mtime`. A per-file `mtime` (second element of
  the `[data, opts]` tuple, or `openEntry`/`add`'s own `opts`) always
  wins over the writer-level default.
- The valid range stays 1980-2099 (MS-DOS date/time) — a fixed `mtime`
  outside that range throws `EBADDATE` just like the per-entry form;
  the writer-level option does not relax or clamp the range.
- **Claim boundary**: `zip` only provides the option. A consumer built on
  top of it (e.g. a document-format writer producing DOCX/ODT/PPTX,
  which are ZIP containers) must thread a fixed `mtime` through to its
  own `opts` to claim byte-reproducible output — passing nothing still
  defaults every entry to `Date.now()`.

## Characteristics

| Aspect | Value |
|--------|-------|
| Compression methods | DEFLATE (method 8), store (method 0) |
| ZIP64 | Yes (archives > 4 GB) |
| Filename encoding | Latin-1 or UTF-8 (flag bit 11 auto) |
| Valid date range | 1980–2099 (MS-DOS date/time) |

## Error codes

| `code` | `errno` | Meaning |
|---|------|---------|
| `EBADFORMAT` | 6 | Invalid ZIP data |
| `EMAXOUT` | 7 | Output limit exceeded — an entry's declared size passes what `maxOutput` leaves |
| `EEXTRATOOLONG` | 9 | Extra field too long |
| `EBADDATE` | 10 | Date out of range (before 1980 or after 2099) |
| `ENAMETOOLONG` | 11 | Filename too long |
| `EBADFORMAT` | 13 | Invalid ZIP |
| `EBADMETHOD` | 14 | Unknown compression method |
| `EUNSAFEPATH` | 15 | Unsafe entry path (zip-slip: `..` segment or absolute path) — unless `safe: false` |
| `ECHECKSUM` | 16 | Incorrect data check — unless `verify: false`, an entry's CRC-32 or size does not match the central directory |

`e.code` is the string in the first column; `e.errno` keeps the number of the
earlier convention (the compressor family's one typed convention, shared
with brotli).

## Full example

```js
const zip  = runtime.resolve('zip');
const utf8 = runtime.resolve('utf8');

// Create
const archive = zip.zipSync({
    'README.txt':     utf8.toBytes('Documentation'),
    'data/raw.bin':   [binaryData, { level: 0 }],  // store
    'data/text.txt':  utf8.toBytes('Text data'),
});

// Selective extraction
const extracted = zip.unzipSync(archive, {
    filter: ({ name }) => !name.startsWith('data/')
});

console.log(Object.keys(extracted));  // ['README.txt']
console.log(utf8.fromBytes(extracted['README.txt']));  // 'Documentation'
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const zip = libs.zip;
        const archive = zip.zipSync(args.files);
        self.postMessage(archive, [archive.buffer]);
    },
    { dependencies: ['zip'], args: { files: { 'data.bin': new Uint8Array([1, 2, 3]) } } }
);
```

## Notes

- ZIP64 automatic: ZIP64 extensions are used as soon as a file exceeds 4 GB or the archive exceeds 4 GB / 65535 entries.
- Dates are stored in MS-DOS format (2-second resolution) — range 1980–2099; out-of-range dates → `EBADDATE`.
- Store mode (method 0): useful for already-compressed files (PNG, JPEG, MP4) — avoids double compression with no gain.
- Methods: stored (0) and deflate (8). Any other — Deflate64 (9, 7-Zip's `-mm=Deflate64`), bzip2, LZMA, zstd — is refused with `EBADMETHOD`, never misread.
- Read against archives from CPython, .NET Framework, 7-Zip and libarchive (data descriptors on stored entries, NTFS and Unix extras included); what fw writes is checked by Info-ZIP UnZip where it is installed.

## See also

- [deflate](./deflate.md), [gzip](./gzip.md), [zlib](./zlib.md)
- [crc32](../calc/crc32.md)
