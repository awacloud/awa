---
module: bitArray
category: crypto/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# bitArray

> bitArray — bit-precise representation (SJCL convention; see [provenance](../../../dev/provenance.md)): 32-bit words + partial last word.

**Module** `bitArray` | **Source** `packages/front/fw/src/crypto/utils/bitArray.js` | **Deps** none | **Worker-safe** yes

Pivot format for the crypto module. All hashes / MACs / KDFs / modes consume and produce `bitArray`. For interop with `Uint8Array`: `ui8_to_ba` / `ba_to_ui8`.

## Resolve

```js
const bitArray = runtime.resolve('bitArray');
// Returns: { ui8_to_ba, ba_to_ui8, bitLength, partial, getPartial,
//             concat, clamp, equal, ... }
```

## API (excerpt)

| Method | Signature | Returns |
|--------|-----------|---------|
| `ui8_to_ba(bytes)` | `(Uint8Array \| number[]) => bitArray` | Convert Uint8Array → bitArray |
| `ba_to_ui8(ba)` | `(bitArray) => Uint8Array` | Reverse (rounded up to byte) |
| `bitLength(ba)` | `(bitArray) => number` | Length in bits |
| `partial(len, x)` | `(number, number) => number` | Wrap a partial word (high nibble = len) |
| `concat(a, b)` | — | Bit-precise concat (handles partial words) |
| `clamp(ba, len)` | `(bitArray, number) => bitArray` | Truncate to `len` bits |
| `equal(a, b)` | `(bitArray, bitArray) => boolean` | **Constant-time** XOR-accumulated |

## Examples

```js
const { bitArray, hex } = fw.runtime.resolveAll(['bitArray', 'hex']);

const bytes = hex.toBytes('48656c6c6f');           // "Hello"
const ba = bitArray.ui8_to_ba(bytes);              // SJCL bitArray
const back = bitArray.ba_to_ui8(ba);               // Uint8Array
```

### Partial word (input non-byte-aligned)

```js
// 4 bits only (= 0xa)
const ba = [bitArray.partial(4, 0xa0000000)];
bitArray.bitLength(ba);                            // 4
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const ba = libs.bitArray.ui8_to_ba(args[0]);
        self.postMessage(libs.bitArray.bitLength(ba));
    },
    { dependencies: ['bitArray'], args: [new Uint8Array([1,2,3])] }
);
```

## Notes

- **SJCL convention**: 32-bit big-endian words; the last word may be "partial" (high nibble = number of remaining bits).
- **`equal`** is constant-time for MAC / tag verification use.
- **`clamp(ba, len)`**: `len` may be < 8 — used by SHAKE / SHA-2 bit-level inputs.

## See also

- All crypto modules — consume / produce bitArray
- [hex](../../io/codec/hex.md), [b64](../../io/codec/b64.md) — string ↔ Uint8Array interop
