---
module: rsaKeygen
category: crypto/utils
dependencies: [bitArray, bn, random]
returns: object
worker-safe: true
status: complete
---

# rsaKeygen

> RSA key generation (FIPS 186-5 §A.1.3) — probable primes, Miller-Rabin, CRT.

**Module** `rsaKeygen` | **Source** `packages/front/fw/src/crypto/utils/rsaKeygen.js` | **Deps** `bitArray`, `bn`, `random` | **Worker-safe** yes

Generates FIPS 186-5 §A.1.3-compliant RSA pairs (probable primes variant): sieve < 2000, Miller-Rabin (rounds per Table B.1), top-2 bits forced, constraint `|p−q| > 2^(nlen/2−100)`, requirement `d > 2^(nlen/2)`, full CRT output (`dp`, `dq`, `qInv`).

All outputs are big-endian `Uint8Array`, compatible with the [`rsa`](../pkc/rsa.md) module.

## Resolve

```js
const rsaKeygen = runtime.resolve('rsaKeygen');
// Returns: { generate, generateProbablePrime, _internal }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `generate(options?)` | `({bits?, e?, drbg?}) => {publicKey, privateKey} \| false` | RSA pair or `false` on error |
| `generateProbablePrime(nbits, eBn, drbg)` | `(number, BN, DrbgInstance) => BN \| false` | Probable `nbits`-bit prime, coprime with `e` |
| `_internal.{...}` | — | `millerRabin`, `smallPrimes`, `divmod`, `lcm`, `inverseModAny` (test/KAT only) |

### `generate` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bits` | `2048 \| 3072 \| 4096` | `2048` | RSA modulus length in bits |
| `e` | `number` (odd ≥ 3) | `65537` | Public exponent |
| `drbg` | `DrbgInstance` | `random.drbg()` | SP 800-90A DRBG instance; useful for deterministic tests |

### `publicKey` / `privateKey` shape

```js
publicKey  = { n: Uint8Array, e: Uint8Array }
privateKey = { n: Uint8Array, e: Uint8Array, d: Uint8Array,
               p: Uint8Array, q: Uint8Array,
               dp: Uint8Array, dq: Uint8Array, qInv: Uint8Array }
```

All fields are big-endian `Uint8Array`. `n` and `d` have length `bits/8`; `p`, `q`, `dp`, `dq`, `qInv` have length `bits/16`.

## Examples

### Key generation and OAEP encryption

```js
const { rsaKeygen, rsa } = fw.runtime.resolveAll(['rsaKeygen', 'rsa']);

const { publicKey, privateKey } = rsaKeygen.generate({ bits: 2048 });
// publicKey  : { n, e }
// privateKey : { n, e, d, p, q, dp, dq, qInv }

const ct = rsa.oaepEncrypt(publicKey, new TextEncoder().encode('Hello'));
const pt = rsa.oaepDecrypt(privateKey, ct);
```

### RSA-4096 generation with custom exponent

```js
const rsaKeygen = fw.runtime.resolve('rsaKeygen');

const pair = rsaKeygen.generate({ bits: 4096, e: 65537 });
if (!pair) throw new Error('keygen failed');
```

### Native RSA key structure

```js
const rsaKeygen = fw.runtime.resolve('rsaKeygen');

const { publicKey, privateKey } = rsaKeygen.generate({ bits: 2048 });
// publicKey  : { n, e } — big-endian Uint8Array
// privateKey : { n, e, d, p, q, dp, dq, qInv } — big-endian Uint8Array (full CRT)
```

> **Note**: PKCS#8 / SPKI RSA serialisation is not exposed by `keyformat` (which only covers EC, Ed25519, X25519). Build ASN.1 directly via `asn1` + `pem` if external interop is required.

## Worker Usage

```js
// RSA keygen is slow in pure JS (2048 bits ≈ 1-5s) — execute in a Worker
const worker = fw.createWorker(
    function ({ libs, args }) {
        const pair = libs.rsaKeygen.generate({ bits: args[0] });
        self.postMessage(pair);
    },
    { dependencies: ['rsaKeygen'], args: [2048] }
);
const pair = await worker.run();
```

## Notes

- **Minimum key size**: only 2048, 3072, and 4096-bit sizes are accepted (FIPS 186-5 rejection); any other value returns `false` with `console.warn`. Never use fewer than 2048 bits in production.
- **Public exponent**: `e = 65537` (Fermat F4) is the recommended value. A small exponent (e.g. 3) exposes to cube-root attacks when padding is imperfect; the module accepts odd `e ≥ 3` but logs a warning for `e < 65537`.
- **Entropy**: the default DRBG (`random.drbg()`) is a CTR_DRBG-AES-256 (SP 800-90A §10.2) seeded by `crypto.getRandomValues`; worker-safe because `crypto` is available in Worker contexts.
- **`provable` / `auxiliary-prime` methods** not implemented — probable primes only (FIPS 186-5 §A.1.3). Some "provable" ACVP vectors are not covered.
- **CPU cost**: RSA-2048 ≈ 1-5s, RSA-3072 ≈ 5-20s, RSA-4096 ≈ 30-120s in pure JS (variance from prime search). Always run in a Worker to avoid blocking the main thread.
- **Small `d`**: if `d ≤ 2^(nlen/2)` (Wiener) is detected, generation restarts automatically (per FIPS 186-5 §A.1.1).

## See also

- [rsa](../pkc/rsa.md) — consumer (OAEP encrypt/decrypt, PSS sign/verify)
- [bn](./bn.md) — underlying big-integer arithmetic
- [random](./random.md) — DRBG source (CTR_DRBG-AES-256, SP 800-90A)
- [asn1](./asn1.md), [pem](./pem.md) — primitives for serialising an RSA key to PKCS#8/SPKI if required
