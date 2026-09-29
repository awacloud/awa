---
module: aes_modes
category: crypto/utils
dependencies: [bitArray, aes, cbc, ctr, gcm, kw, pad]
returns: object
worker-safe: true
status: complete
---

# aes_modes

> Uniform Uint8Array wrapper for all AES modes (CBC, CTR, GCM, KW, KWP).

**Module** `aes_modes` | **Source** `packages/front/fw/src/crypto/utils/aes_modes.js` | **Deps** `bitArray`, `aes`, `cbc`, `ctr`, `gcm`, `kw`, `pad` | **Worker-safe** yes

Fully Uint8Array API (no bitArray on the caller side). Recommended for external framework consumers that do not want to deal with the internal SJCL bitArray convention.

## Resolve

```js
const am = runtime.resolve('aes_modes');
// Returns: { cbc, ctr, gcm, kw, kwp }
```

## API

| Sub-module | Methods |
|------------|---------|
| `am.cbc` | `encrypt(key, iv, pt) → ct` (PKCS#7 included), `decrypt(key, iv, ct) → pt` |
| `am.ctr` | `encrypt(key, iv, data) → out` (involution) |
| `am.gcm` | `encrypt(key, iv, pt, aad?, tagLen?) → {ct, tag}`, `decrypt(key, iv, ct, tag, aad?) → pt \| false` |
| `am.kw` | `wrap(kek, key) → ct`, `unwrap(kek, ct) → key \| false` |
| `am.kwp` | `wrapPad(kek, key) → ct`, `unwrapPad(kek, ct) → key \| false` |

All inputs/outputs = `Uint8Array`.

## Examples

### GCM end-to-end

```js
const { aes_modes, random } = fw.runtime.resolveAll(['aes_modes', 'random']);

const key = random.bytes(32);
const iv  = random.bytes(12);
const pt  = new TextEncoder().encode('Hello, GCM!');
const aad = new TextEncoder().encode('header');

const out = aes_modes.gcm.encrypt(key, iv, pt, aad, 128);   // {ct, tag}
const dec = aes_modes.gcm.decrypt(key, iv, out.ct, out.tag, aad);
new TextDecoder().decode(dec);
```

### CBC + PKCS#7 auto

```js
const ct = aes_modes.cbc.encrypt(key, iv, new TextEncoder().encode('Hello'));   // padding included
const pt = aes_modes.cbc.decrypt(key, iv, ct);                                   // unpad included
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.aes_modes.gcm.encrypt(args[0], args[1], args[2]));
    },
    { dependencies: ['aes_modes'], args: [key, iv, pt] }
);
```

## Notes

- **Convenience wrapper**: 100% of FIPS / SP 800 conformance is delegated to `cipher/aes` + `mode/{cbc,ctr,gcm,kw}`.
- **Recommended for new code** over `aes_ctr.js` (legacy, deprecated).
- **No `nonceTracker`**: use `mode/gcm.js` directly if required.

## See also

- [cbc](../mode/cbc.md), [ctr](../mode/ctr.md), [gcm](../mode/gcm.md), [kw](../mode/kw.md) — underlying algorithms
- [aes_ctr](./aes_ctr.md) — legacy CTR-only wrapper (deprecated)
