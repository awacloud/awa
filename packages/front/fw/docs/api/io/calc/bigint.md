---
module: bigint
category: io/calc
dependencies: []
returns: object
worker-safe: true
status: complete
---

# bigint

> BigInt helpers — bytes conversions, modular arithmetic, Miller-Rabin primality.

**Module** `bigint` | **Source** `packages/front/fw/src/io/calc/bigint.js` | **Deps** none | **Worker-safe** yes

Utilities around native `BigInt`: bytes ↔ BigInt conversion (BE/LE, signed/unsigned), modular arithmetic (modPow, modInv, gcd), probabilistic primality, uniform sampling. Crypto-friendly but in `io/calc/` to stay generic and reusable outside the crypto context.

## Resolve

```js
const bigint = runtime.resolve('bigint');
// Returns: { toBytes, fromBytes, bitLength, byteLength, modPow, modInv, gcd, lcm, isPrime, randomBetween, parse, toString }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `toBytes` | `(bi: BigInt, options?) => Uint8Array` | Bytes representation |
| `fromBytes` | `(bytes: Uint8Array, options?) => BigInt` | BigInt from bytes |
| `bitLength` | `(bi: BigInt) => number` | Number of significant bits |
| `byteLength` | `(bi: BigInt) => number` | `ceil(bitLength / 8)` |
| `modPow` | `(base, exp, mod: BigInt) => BigInt` | `(base^exp) mod mod` |
| `modInv` | `(a, mod: BigInt) => BigInt` | Modular inverse |
| `gcd` | `(a, b: BigInt) => BigInt` | GCD |
| `lcm` | `(a, b: BigInt) => BigInt` | LCM |
| `isPrime` | `(n: BigInt, rounds?: number) => boolean` | Probabilistic Miller-Rabin |
| `randomBetween` | `(min, max: BigInt, rngFn) => BigInt` | Uniform integer in [min, max] |
| `parse` | `(str: string, radix?: number) => BigInt` | Parsing |
| `toString` | `(bi: BigInt, radix?: number) => string` | Formatting |

### `toBytes` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `byteLength` | `number` | minimal | Forces the length; throws if insufficient |
| `endian` | `'be' \| 'le'` | `'be'` | Big-endian or little-endian |
| `signed` | `boolean` | `false` | Two's complement encoding |

## Examples

### Bytes conversions

```js
const bigint = runtime.resolve('bigint');

bigint.toBytes(255n);                          // Uint8Array([255])
bigint.toBytes(256n);                          // Uint8Array([1, 0])
bigint.toBytes(-1n, { signed: true, byteLength: 4 }); // Uint8Array([0xff, 0xff, 0xff, 0xff])

const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
bigint.fromBytes(bytes);                       // 0xdeadbeefn
bigint.fromBytes(bytes, { endian: 'le' });     // 0xefbeadden
```

### Modular arithmetic

```js
bigint.modPow(2n, 10n, 1000n)    // 24n  (2^10 = 1024, 1024 mod 1000 = 24)
bigint.modInv(3n, 11n)           // 4n   (3 * 4 = 12 ≡ 1 mod 11)
bigint.gcd(12n, 18n)             // 6n
bigint.isPrime(8191n)            // true (Mersenne prime 2^13-1)
```

### Uniform random (for crypto key)

```js
const random = runtime.resolve('random');

const key = bigint.randomBetween(0n, (1n << 256n) - 1n, (n) => random.bytes(n));
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const r = libs.bigint.modPow(args.base, args.exp, args.mod);
        self.postMessage(r.toString());
    },
    { dependencies: ['bigint'], args: { base: 2n, exp: 100n, mod: 1000000007n } }
);
```

## Notes

- Miller-Rabin 20 rounds → error probability < 2⁻⁴⁰. For crypto-grade primality: increase `rounds` or use deterministic tests on ranges < 3.3 × 10²⁴.
- `randomBetween` uses rejection sampling for uniformity — `rngFn` must return uniformly distributed bytes.
- No BigInt polyfill — targeted environments: Chrome ≥ 67, Firefox ≥ 68, Node ≥ 10.4, Bun.
- `modInv` throws `'bigint: no modular inverse'` if `gcd(a, mod) ≠ 1`.

## See also

- [random](../../crypto/utils/random.md) — entropy source for `randomBetween`
- [easing](./easing.md) — easing functions for animations
