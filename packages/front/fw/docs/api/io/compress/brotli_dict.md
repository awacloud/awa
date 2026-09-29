---
module: brotliDict
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# brotliDict

> RFC 7932 (Brotli) static dictionary and 121 transforms — tables + apply.

**Module** `brotliDict` | **Source** `packages/front/fw/src/io/compress/brotli_dict.js` | **Deps** none | **Worker-safe** yes

Data and operations shared between the Brotli encoder and decoder:

- **Word dictionary** (RFC 7932 Appendix A) — 122 784 bytes indexed by `(length, index)` via `NDBITS` / `DOFFSET`. The blob itself lives in the dedicated module [`brotliDictWords`](./brotli_dict_words.md) (lazy-load) — imperative injection via `setWords(blob)`. Before injection, `hasWords() === false` and `lookupWord` throws `EDICT_UNLOADED`.
- **Word transforms** (RFC 7932 Appendix B) — the 121 canonical transforms (Identity / FermentFirst / FermentAll / OmitFirst1..9 / OmitLast1..9) with UTF-8 prefix + suffix. Fully implemented and round-trippable.

## Resolve

```js
const dict = runtime.resolve('brotliDict');
// Returns: { NDBITS, NWORDS, DOFFSET, DICTSIZE, transforms, applyTransform,
//             setWords, hasWords, lookupWord }
```

## API

| Method / field | Signature / type | Description |
|----------------|------------------|-------------|
| `NDBITS` | `Uint8Array(25)` | Depth table (RFC 7932 §8) |
| `NWORDS` | `(length: number) => number` | Number of words of this length (0 if `< 4`) |
| `DOFFSET` | `(length: number) => number` | Offset of the first word of this length in the blob |
| `DICTSIZE` | `number` | **122 784** — total dictionary size |
| `transforms` | `Array(121)` of `{ prefix, kind, param, suffix }` | Structured description |
| `applyTransform` | `(id: number, baseWord: Uint8Array) => Uint8Array` | Returns `prefix + T_id(baseWord) + suffix` |
| `setWords` | `(blob: Uint8Array) => void` | Injects the Appendix A blob (size verified = `DICTSIZE`) |
| `hasWords` | `() => boolean` | `true` after a successful `setWords` |
| `lookupWord` | `(length: number, index: number) => Uint8Array` | View into the blob; throws `EDICT_UNLOADED` if not loaded |

### `transforms[id]` format

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | `Uint8Array` | UTF-8 bytes prepended to the transformed word |
| `kind` | `number` | `0` = Identity, `1` = FermentFirst, `2` = FermentAll, `3..11` = OmitFirst1..9 (8 unused), `12..20` = OmitLast1..9 |
| `param` | `number` | For OmitFirstK / OmitLastK: value `k` ∈ `[1, 9]`; 0 otherwise |
| `suffix` | `Uint8Array` | UTF-8 bytes appended at the end |

### `applyTransform(id, baseWord)`

Applies transform `id` (∈ `[0, 120]`) to the base word. The result is a **new** `Uint8Array` — `baseWord` is not mutated. `Ferment` upper-cases ASCII lowercase letters (but leaves uppercase unchanged) and toggles the 2nd/3rd bytes of multibyte UTF-8 codepoints via XOR (32 or 5).

| Kind | Definition |
|------|------------|
| `Identity` | Word unchanged |
| `OmitFirstk` / `OmitLastk` | Drop the first / last `k` bytes (empty if `len(word) < k`) |
| `FermentFirst` | `Ferment(word, 0)` — first UTF-8 codepoint only |
| `FermentAll` | Loop `Ferment` over all codepoints |

## Examples

### Applying transforms

```js
const dict = runtime.resolve('brotliDict');
const enc = new TextEncoder(), dec = new TextDecoder();

dec.decode(dict.applyTransform(0,  enc.encode('hello')));  // 'hello'        — Identity
dec.decode(dict.applyTransform(1,  enc.encode('hello')));  // 'hello '
dec.decode(dict.applyTransform(4,  enc.encode('hello')));  // 'Hello '       — FermentFirst + ' '
dec.decode(dict.applyTransform(41, enc.encode('hello')));  // ' the hello'   — ' the ' + Identity
dec.decode(dict.applyTransform(44, enc.encode('hello')));  // 'HELLO'        — FermentAll
dec.decode(dict.applyTransform(23, enc.encode('abcdef'))); // 'abc'          — OmitLast3
```

### Wiring the blob and looking up a word

```js
const dict  = runtime.resolve('brotliDict');
const words = runtime.resolve('brotliDictWords');

if (words.isLoaded) dict.setWords(words.blob);

// word_id = transform_id * NWORDS[length] + index (RFC 7932 §8)
const base = dict.lookupWord(6, 1234);
const word = dict.applyTransform(5, base);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const out = libs.brotliDict.applyTransform(args[0], args[1]);
        self.postMessage(out, [out.buffer]);
    },
    {
        dependencies: ['brotliDict'],
        args: [4, new TextEncoder().encode('hello')],
    }
);
```

## Notes

- `NDBITS` values fixed by the spec: `[0,0,0,0,10,10,11,11,10,10,10,10,10,9,9,8,7,7,8,7,7,6,6,5,5]`.
- `DICTSIZE = 122 784` bytes — size fixed by the spec and verified by tests + in `setWords`.
- The `transforms` are structurally static — the instance is shareable between encoder and decoder with no risk of mutation.
- The blob is externalized in [`brotliDictWords`](./brotli_dict_words.md) — this module embeds **no** Appendix A data. Native code-split (no inlined base64).
- Tests: ~50 cases (round-trip of all 121 transforms + lookups at `NWORDS[length]` boundaries + CRC-32 of the concatenated transforms = `0x3d965f81`).

## See also

- [brotliDictWords](./brotli_dict_words.md) — Appendix A blob (injected via `setWords`)
- [brotli](./brotli.md) — consuming codec (decoder + encoder)
- [brotliShared](./brotli_shared.md) — RFC 9841 extensions (reuses `transforms` and `lookupWord`)
