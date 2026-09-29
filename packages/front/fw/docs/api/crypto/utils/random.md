---
module: random
category: crypto/utils
dependencies: [bitArray, aes, sha256]
returns: object
worker-safe: true
status: complete
---

# random

> CTR_DRBG-AES-256 (SP 800-90A) + RCT/APT (SP 800-90B) — cryptographic RNG with FIPS self-test.

**Module** `random` | **Source** `packages/front/fw/src/crypto/utils/random.js` | **Deps** `bitArray`, `aes`, `sha256` | **Worker-safe** yes

The framework's sole randomness source. `Math.random` and `crypto.randomUUID` are blocked by `sanity/base.js`.

## Resolve

```js
const random = runtime.resolve('random');
// Returns: { fill, float, int, bytes, words, bits, range, drbg,
//             health, isReady, selfTest, _internal }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `bytes(n)` | `(number) => Uint8Array \| false` | n random bytes direct (OS RBG) |
| `words(n)` | `(number) => number[]` | n × 32-bit words (signed int32) |
| `bits(n)` | `(number) => bitArray \| false` | n random bits (SJCL bitArray) |
| `int(min, max)` | `(number, number) => number` | Integer in [min, max] (rejection sampling, no modulo bias) |
| `float()` | `() => number` | Float in [0, 1) |
| `range(min, max)` | `(number, number) => number` | Float in [min, max) |
| `fill(typedArray)` | `(TypedArray) => TypedArray` | In-place fill |
| `drbg(options?)` | `({personalisation?, aesKeyBits?, df?}) => DrbgInstance \| false` | Dedicated CTR_DRBG instance |
| `health` | `{feed, reset, isDead}` | Continuous health-tests SP 800-90B |
| `isReady()` | `() => boolean` | `true` if `crypto.getRandomValues` is available |
| `selfTest()` | `() => boolean` | Re-run the CTR_DRBG POST KAT |
| `_internal.makeDrbg(opts?)` | — | Parametric builder (test-only) |

### `drbg(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `personalisation` | `Uint8Array` | — | Domain separation per-app (recommended) |
| `aesKeyBits` | `128 \| 192 \| 256` | `256` | Override security strength |
| `df` | `boolean` | `false` | Block_Cipher_df (SP 800-90A §10.4.2) |

Returns `{ generate(n, ai?), reseed(ai?), addAdditionalInput(bytes), uninstantiate(), isLive, reseedCounter, securityStrength }`.

## Examples

### Random bytes

```js
const random = fw.runtime.resolve('random');
const key = random.bytes(32);          // AES-256 key
const iv  = random.bytes(12);          // GCM nonce
```

### CTR_DRBG explicit (FIPS 140-3 compliant)

```js
const drbg = random.drbg({
    personalisation: new TextEncoder().encode('app-id-v1.0')
});
const out = drbg.generate(64);   // 512 bits
drbg.reseed();                   // re-pull entropy
```

### Health-tests RCT/APT

```js
random.health.feed(suspectedNonRandomBuffer);
if (random.health.isDead) {
    // Entropy source compromised — all generation is aborted
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        self.postMessage(libs.random.bytes(32));
    },
    { dependencies: ['random'] }
);
```

## Notes

- **POST KAT**: auto-test on first `drbg(...)` call against the official NIST CAVP vector; latched-fail stops all generation on mismatch.
- **RCT + APT active** on every buffer from `crypto.getRandomValues`; latched-dead disables all generation if the entropy source is compromised.
- **`int(min, max)`**: rejection sampling — no modulo bias.
- **`drbg({df:true, aesKeyBits:128})`**: 5 ACVP modes covered under `CRYPTO_FULL=1`.

## See also

- [aes](../cipher/aes.md), [sha256](../hash/sha256.md) — DRBG primitives
- [Conformance random.acvp.md](../../../../src/crypto/utils/random.acvp.md)
