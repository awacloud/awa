---
module: bn
category: crypto/utils
dependencies: [bitArray, random]
returns: object
worker-safe: true
status: complete
---

# bn

> Big Number — arbitrary-precision integer arithmetic (SJCL-derived, BSD-2-Clause; see [provenance](../../../dev/provenance.md)) for ECDSA / RSA.

**Module** `bn` | **Source** `packages/front/fw/src/crypto/utils/bn.js` | **Deps** `bitArray`, `random` | **Worker-safe** yes

Representation: array of 24-bit limbs. Underlying [`ecc`](../pkc/ecc.md), [`rsa`](../pkc/rsa.md), [`rsaKeygen`](./rsaKeygen.md).

## Resolve

```js
const bn = runtime.resolve('bn');
// Returns: BN constructor + statics
```

## API (excerpt)

| Method | Signature | Returns |
|--------|-----------|---------|
| `bn.fromBits(bits)` / `.toBits()` | — | bitArray ↔ BN conversion |
| `new bn(hex)` / `.toHex()` | `(hex: string)` / `() => string` | Construct from hex string `'0x…'` (or number) ↔ hex serialisation `'0x…'` |
| `add` / `sub` / `mul` / `mod` / `mulmod` / `power` / `powermod` | — | Arithmetic |
| `inverseMod(p)` | — | Modular inverse (extended Euclidean) |
| `equals(other)` | — | Comparison (constant-time with same-limb-length) |

> **API note**: the hex method is named `toHex()` and **not** `toString()`. `Object.prototype.toString` is frozen by `sanity/base.js`; assigning `Bn.prototype.toString` would raise `TypeError: Cannot assign to read only property 'toString'`. All BN ↔ hex conversions go through `toHex` / the constructor.

## Examples

```js
const bn = fw.runtime.resolve('bn');
const a = new bn('0x1234');
const b = new bn('0xabcd');
const c = a.mulmod(b, new bn('0xffff'));   // (a*b) mod 0xffff
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const a = new libs.bn(args[0]);
        self.postMessage(a.power(args[1]).toHex());
    },
    { dependencies: ['bn'], args: ['0x1234', 5] }
);
```

## Notes

- **24-bit limbs**: trade-off inherited from the SJCL-derived design, for IEEE-754 precision + JS performance.
- **`powermod`**: square-and-multiply with k-ary window (~O(bitLen) modmult).
- **`equals`**: constant-time when BNs have the same limb length (prefer `.normalize()` before security-critical comparisons).

## See also

- [ecc](../pkc/ecc.md), [rsa](../pkc/rsa.md), [rsaKeygen](./rsaKeygen.md) — consumers
- [bitArray](./bitArray.md) — bit-representation primitive
