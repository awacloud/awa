---
module: pbkdf2
category: crypto/hash
dependencies: [bitArray, utf8, hmac]
returns: function
worker-safe: true
status: complete
---

# pbkdf2

> PBKDF2 (RFC 2898 / SP 800-132) — password-based KDF, default 600 000 iterations (OWASP 2023).

**Module** `pbkdf2` | **Source** `packages/front/fw/src/crypto/hash/pbkdf2.js` | **Deps** `bitArray`, `utf8`, `hmac` | **Worker-safe** yes

The factory returns a **callable function** (with `.derive` alias + `.MIN_RECOMMENDED_COUNT` constant). Default PRF = HMAC-SHA-256.

## Resolve

```js
const pbkdf2 = runtime.resolve('pbkdf2');
// pbkdf2 is callable + exposes .derive, .MIN_RECOMMENDED_COUNT, .DEFAULT_COUNT
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `pbkdf2(password, salt, count, lengthBits, Prff?)` | `(string\|bitArray, string\|bitArray, number, number, hmac?) => bitArray \| []` | DK |
| `pbkdf2.derive` | alias for the main function | — |
| `pbkdf2.MIN_RECOMMENDED_COUNT` | `100000` | OWASP minimum |
| `pbkdf2.DEFAULT_COUNT` | `600000` | OWASP 2023 |

## Examples

### Standard password hashing

```js
const pbkdf2 = fw.runtime.resolve('pbkdf2');

const dk = pbkdf2(
    'correct horse battery staple',
    'unique-per-user-salt',                       // ≥ 16 bytes in production
    600000,                                       // OWASP 2023
    256                                           // bits = 32 bytes
);
```

### PBKDF2-HMAC-SHA-512

`Prff` expects a module in `hmac` format (with a `.fn` property constructable on `(key)`). To fix a hash other than SHA-256, wrap `hmac.fn`:

```js
const { pbkdf2, hmac, sha512 } = fw.runtime.resolveAll(['pbkdf2', 'hmac', 'sha512']);

// "hmac-shaped" adapter that pins the hash to SHA-512
const hmacSha512 = {
    fn: function (key) { return new hmac.fn(key, sha512); }
};

const dk = pbkdf2(pwd, salt, 600000, 256, hmacSha512);
```

### Edge case length=0

```js
pbkdf2(pwd, salt, 1000, 0);   // → [] (audit Finding 4 fix)
```

## Worker Usage

```js
// PBKDF2 600k iterations = ~500ms — delegate to a Worker to avoid blocking the UI
const worker = fw.createWorker(
    function ({ libs, args }) {
        const dk = libs.pbkdf2(args[0], args[1], 600000, 256);
        self.postMessage(dk);
    },
    { dependencies: ['pbkdf2'], args: [password, salt] }
);
```

## Notes

- **Default 600 000 iter** (OWASP 2023). `count < 100000` emits `console.warn('WEAK')` but does not abort (compat with KAT vectors).
- **`length=0`** returns `[]` (audit post-upgrade Finding 4 — previously returned a phantom block).
- **SP 800-132 limits**: `count ≥ 1000` + `length ≤ (2³² - 1) × hashLen`. No explicit validation beyond the `WEAK` warning.

## See also

- [hmac](./hmac.md), [argon2](./argon2.md) — modern alternatives (Argon2id recommended for password storage)
- [hkdf](./hkdf.md) — non-PBE KDF
- [Conformance pbkdf2.acvp.md](../../../../src/crypto/hash/pbkdf2.acvp.md)
