---
module: argon2
category: crypto/hash
dependencies: [blake2b]
returns: object
worker-safe: true
status: complete
---

# argon2

> Argon2id (RFC 9106) — memory-hard password hashing. Argon2d/i explicitly rejected.

**Module** `argon2` | **Source** `packages/front/fw/src/crypto/hash/argon2.js` | **Deps** `blake2b` | **Worker-safe** yes

NIST/IETF/OWASP selection for password storage. RFC 9106 §4 mandates Argon2id (d/i hybrid). `hashD` (Argon2d) and `hashI` (Argon2i) are exposed but return `false` + typed warning.

## Resolve

```js
const argon2 = runtime.resolve('argon2');
// Returns: { hash, hashD, hashI, _internal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `hash(opts)` | `({password, salt, time, memory, parallelism, tagLen, secret?, ad?}) => Uint8Array \| false` | Argon2id tag |
| `hashD()` | `() => false` | **UNSAFE reject** (cache-timing) |
| `hashI()` | `() => false` | **DEPRECATED reject** (Alwen-Blocki 2016) |
| `_internal.{Hp, compress}` | — | Test/debug primitives |

### Options `hash`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `password` | `Uint8Array` | required | Password / passphrase |
| `salt` | `Uint8Array(≥8)` | required | Unique per-user salt |
| `time` | `number ≥ 1` | required | Iterations (RFC §4 recommends 3+) |
| `memory` | `number` (KB) | required | Memory cost; 47104 (46 MiB) = OWASP minimum |
| `parallelism` | `number ≥ 1` | required | Threads (1 in JS single-thread) |
| `tagLen` | `number ≥ 4` | required | Output bytes (32 = standard) |
| `secret` | `Uint8Array` | — | Optional keyed mode (server-side pepper) |
| `ad` | `Uint8Array` | — | Optional associated data (context binding) |

## Examples

### Password storage

```js
const { argon2 } = fw.runtime.resolveAll(['argon2']);

const tag = argon2.hash({
    password: new TextEncoder().encode('correct horse battery staple'),
    salt:     random.bytes(16),                  // unique per user
    time: 3, memory: 47104, parallelism: 1, tagLen: 32
});
// Store (tag, salt) in the database; rehash at login to verify.
```

### Argon2d / Argon2i rejected

```js
argon2.hashD();   // false + console.warn('UNSAFE: Argon2d cache-timing')
argon2.hashI();   // false + console.warn('DEPRECATED: Argon2i Alwen-Blocki 2016')
```

## Worker Usage

```js
// Argon2id 47 MiB / 3 iter = ~50ms — delegate to avoid blocking the UI
const worker = fw.createWorker(
    function ({ libs, args }) {
        const tag = libs.argon2.hash(args[0]);
        self.postMessage(tag);
    },
    { dependencies: ['argon2'], args: [{ password, salt, time:3, memory:47104, parallelism:1, tagLen:32 }] }
);
```

## Notes

- **Argon2d/Argon2i rejected**: Argon2d is vulnerable to cache-timing (data-dependent addressing); Argon2i is sub-optimal (Alwen-Blocki 2016 — reduces GPU/ASIC resistance). Argon2id (`hash()`) is the only usable variant per RFC 9106 §4 MUST.
- **Salt minimum**: 8 bytes; `console.warn('INVALID')` otherwise.
- **Cost**: choose `memory ≥ 46 MiB` + `time ≥ 3` per OWASP 2023.

## See also

- [pbkdf2](./pbkdf2.md) — legacy alternative, faster but less memory-hard
- [blake2b](./blake2b.md) — underlying primitive
- [Conformance argon2.acvp.md](../../../../src/crypto/hash/argon2.acvp.md)
