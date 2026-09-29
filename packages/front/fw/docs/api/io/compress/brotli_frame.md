---
module: brotliFrame
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# brotliFrame

> RFC 9841 §8 Shared Brotli Framing Format parser — multi-resource container.

**Module** `brotliFrame` | **Source** `packages/front/fw/src/io/compress/brotli_frame.js` | **Deps** none | **Worker-safe** yes

Parser for the chunked container defined by RFC 9841 §8 (Shared Brotli Framing Format Stream). The container encapsulates one or more brotli/shared-brotli streams with per-chunk metadata, dictionary references, optional hashes and an optional central directory.

The signature `91 0a 42 52` is by construction an invalid WBITS pattern in brotli/large-window-brotli — a decoder can therefore disambiguate a framing container from a raw brotli stream.

This module **does not decompress** payloads — that is the job of [`brotli`](./brotli.md). Typical flow:

```
brotliFrame.parse(buf)
  → { chunks }
brotliFrame.extractResources(parsed)
  → [{ payload, codec, ... }, ...]
then for each resource:
brotli.brotliDecompressSync(resource.payload)
```

## Resolve

```js
const f = runtime.resolve('brotliFrame');
// Returns: { parse, extractResources, parseMetadataFields,
//             CHUNK_TYPE_NAMES, CODEC_NAMES }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(buf: Uint8Array) => ParsedFrame` | Container structure (chunks described, payloads exposed) |
| `extractResources` | `(parsed: ParsedFrame) => Array<Resource>` | Grouped resources (`first` → `middle*` → `last` sequences concatenated) |
| `parseMetadataFields` | `(payload: Uint8Array) => Array<Field>` | Parse §8.3 fields from a metadata chunk payload |
| `CHUNK_TYPE_NAMES` | `Record<number, string>` | Numeric → name mapping |
| `CODEC_NAMES` | `Record<number, string>` | Numeric → name mapping |

### Format `ParsedFrame`

```ts
{
    flags: number,
    hasFinalFooter: boolean,
    chunks: Array<{
        type: number,        // 0..10 per §8.2
        typeName: string,    // 'padding', 'data', 'first-partial-data', ...
        codec: number,       // -1 if chunk type has no codec; otherwise 0..3
        codecName: string,   // 'uncompressed' | 'keep-decoder' | 'brotli' | 'shared-brotli'
        uncompressedSize: number,    // -1 if codec='uncompressed'
        dictionaryRefs: Array | null, // if codec='shared-brotli'
        dataFlags: number,   // for chunk types 2..5
        hash: { type, bytes } | null, // 256-bit hash if dataFlags bit 1 set
        headerStart, contentStart, payloadStart, contentEnd,  // byte offsets
        payload: Uint8Array,
    }>,
    finalFooter: Uint8Array | null,
}
```

### `Resource` format (output of `extractResources`)

```ts
{
    payload: Uint8Array,             // concatenated payload bytes
    codec: number,
    codecName: string,
    uncompressedSize: number,
    dictionaryRefs: Array | null,
}
```

### `Field` format (output of `parseMetadataFields`)

```ts
{
    name: string,          // 2 ASCII letters (e.g. 'id', 'mt', 'AP')
    kind: 'standard' | 'custom',  // lowercase = standard, uppercase = custom
    content: Uint8Array,   // raw bytes (length via varint)
}
```

### Chunk types (§8.2)

| ID | Name | Has codec | Has flags byte |
|----|------|-----------|----------------|
| 0  | `padding` | no | no |
| 1  | `metadata` | yes | no |
| 2  | `data` | yes | yes (+ optional hash) |
| 3  | `first-partial-data` | yes | yes |
| 4  | `middle-partial-data` | yes | yes |
| 5  | `last-partial-data` | yes | yes |
| 6  | `footer-metadata` | yes | no |
| 7  | `global-metadata` | yes | no |
| 8  | `repeat-metadata` | yes | no |
| 9  | `central-directory` | no | no |
| 10 | `final-footer` | no | no |

### Codec values (§8.2)

| ID | Name | Description |
|----|------|-------------|
| 0  | `uncompressed` | Raw bytes |
| 1  | `keep-decoder` | Continuation of the decoder state from the previous chunk |
| 2  | `brotli` | RFC 7932 stream |
| 3  | `shared-brotli` | RFC 9841 stream (with dictionary refs) |

## RFC 9841 §8 coverage

| Section | Coverage |
|---------|----------|
| §8.1 Main format (signature + flags) | ✅ |
| §8.2 Chunk format (length / type / codec / uSize / dict refs) | ✅ |
| §8.3 Metadata fields (`id`, `mt`, customs) | ✅ via `parseMetadataFields` |
| §8.4.1 Padding chunk (type 0) | ✅ (validated, content skipped) |
| §8.4.2 Metadata chunk (type 1) | ✅ |
| §8.4.3 Data chunk (type 2) + flags + hash | ✅ |
| §8.4.4-6 Partial data chunks (types 3-5) | ✅ |
| §8.4.7-9 Footer / global / repeat metadata (types 6-8) | ✅ |
| §8.4.10 Central directory (type 9) | ✅ (payload exposed raw, entry parsing: future) |
| §8.4.11 Final footer (type 10) | ✅ |
| Hash verification (256-bit HighwayHash) | ❌ — HighwayHash impl absent from `fw` |

## Examples

### Simple parsing

```js
const f = runtime.resolve('brotliFrame');

const parsed = f.parse(containerBytes);
console.log('Chunks:', parsed.chunks.length);
for (const c of parsed.chunks) {
    console.log(' -', c.typeName, 'codec=' + c.codecName, 'len=' + c.payload.length);
}
```

### Extraction + decompression of resources

```js
const f  = runtime.resolve('brotliFrame');
const br = runtime.resolve('brotli');

const parsed = f.parse(containerBytes);
const resources = f.extractResources(parsed);

for (const res of resources) {
    if (res.codecName === 'brotli') {
        const decoded = br.brotliDecompressSync(res.payload);
        // ... usage ...
    }
}
```

### Reading metadata fields §8.3

```js
const f = runtime.resolve('brotliFrame');

const parsed = f.parse(containerBytes);
for (const c of parsed.chunks) {
    if (c.typeName === 'metadata' && c.codecName === 'uncompressed') {
        const fields = f.parseMetadataFields(c.payload);
        for (const field of fields) {
            console.log(field.kind, field.name, new TextDecoder().decode(field.content));
        }
    }
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const f = libs.brotliFrame;
        const br = libs.brotli;
        const parsed = f.parse(args[0]);
        const resources = f.extractResources(parsed);
        const decoded = resources
            .filter(r => r.codecName === 'brotli')
            .map(r => br.brotliDecompressSync(r.payload));
        self.postMessage(decoded);
    },
    {
        dependencies: ['brotli', 'brotliFrame'],
        args: [containerBytes],
    }
);
```

## Notes

- The parser **validates bounds**: chunk length vs buffer size, reserved flags at zero, hash size, invalid dict-ref bit combinations.
- `extractResources` groups `first` → `middle*` → `last` sequences into a single resource. An unterminated sequence throws `EBADSTREAM`.
- `metadata` / `footer-metadata` / `global-metadata` / `repeat-metadata` / `central-directory` chunks expose their payloads as raw `Uint8Array`. The §8.3 field parser (`parseMetadataFields`) is available — parsing of central directory entries is yet to be delivered.
- HighwayHash (32 bytes, `dataFlags` bit 1) is exposed but **not verified** — HighwayHash is not implemented in `fw`.
- Tests: 29 cases (signature + flags + all chunk types + dict refs + `parseMetadataFields` happy/error paths + integration via hand-crafted container).

## See also

- [brotli](./brotli.md) — decompression of extracted resources
- [brotliShared](./brotli_shared.md) — RFC 9841 §3 / §5 / §6, Shared Dictionary Stream parser
- [brotliDict](./brotli_dict.md), [brotliDictWords](./brotli_dict_words.md) — shared static dictionary
