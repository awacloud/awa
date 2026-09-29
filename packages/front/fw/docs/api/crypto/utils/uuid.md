---
module: uuid
category: crypto/utils
dependencies: [hex]
returns: object
worker-safe: true
status: complete
---

# uuid

> UUID v1 (time-based) + v4 (random) — RFC 4122 / RFC 9562, compact or canonical formats.

**Module** `uuid` | **Source** `packages/front/fw/src/crypto/utils/uuid.js` | **Deps** `hex` | **Worker-safe** yes

Default randomness source: `crypto.getRandomValues` (Web Crypto `RandomSource`, SP 800-90B-grade). `'compact'` format (32 hex without dashes) is the default for back-compat; use `'rfc4122'` for the canonical dashed format.

## Resolve

```js
const uuid = runtime.resolve('uuid');
// Returns: { v1, v4 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `v1` | `(raw?: boolean, prng?: false \| Function, format?: 'compact'\|'rfc4122') => Uint8Array \| string` | UUID v1 time-based |
| `v4` | `(raw?: boolean, prng?: false \| Function, format?: 'compact'\|'rfc4122') => Uint8Array \| string` | UUID v4 random |

### Common parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `raw` | `boolean` | `false` | `true` → returns raw `Uint8Array(16)` (version + variant patched) |
| `prng` | `false \| (buf: Uint8Array) => Uint8Array\|void` | `false` | Entropy override — **test/replay only**; production must use `false` |
| `format` | `'compact'\|'rfc4122'` | `'compact'` | String output format (ignored if `raw=true`) |

### Output formats

| Value | Output | Example |
|-------|--------|---------|
| `'compact'` (default) | 32 hex without dashes | `91c274f29a0d4ce69d5db2c3d4e5f607` |
| `'rfc4122'` | 36-char canonical RFC 4122 §3 | `91c274f2-9a0d-4ce6-9d5d-b2c3d4e5f607` |

## Examples

### v4 random (production)

```js
const uuid = runtime.resolve('uuid');

uuid.v4();                          // "91c274f29a0d4ce69d5db2c3d4e5f607"
uuid.v4(false, false, 'rfc4122');   // "91c274f2-9a0d-4ce6-9d5d-b2c3d4e5f607"
uuid.v4(true);                      // Uint8Array(16)
```

### v1 time-based

```js
uuid.v1();                          // compact hex
uuid.v1(false, false, 'rfc4122');   // canonical with dashes
```

### Validation with valid

```js
const valid = runtime.resolve('valid');
const id = uuid.v4(false, false, 'rfc4122');
valid.test(id, { type: 'string', format: 'uuid' }); // true
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        self.postMessage(libs.uuid.v4(false, false, 'rfc4122'));
    },
    { dependencies: ['uuid'] }
);
```

## Notes

- **Randomness source**: `crypto.getRandomValues` (Web Crypto `RandomSource`). Custom `prng` with automatic fallback to `crypto.getRandomValues` if the callback does not modify the buffer.
- **v1 uses a random MAC** (multicast bit forced per RFC 4122 §4.5) — no hardware MAC accessible in the browser.
- **Back-compat**: default `format='compact'` returns 32 hex without dashes, identical to the historical API of this framework.
- **v3 / v5 / v6 / v7 / v8 not implemented** — RFC 9562 §5.6-5.8; v7 (timestamp-sortable) would be useful for DB IDs.
- Requires `globalThis.crypto.getRandomValues` — available in browsers, Node ≥ 19, Bun, Deno. Throws if absent.

## See also

- [hex](../../io/codec/hex.md) — direct dependency, encodes UUID bytes to string
- [valid](../../io/utils/valid.md) — `format: 'uuid'` for validating an RFC 4122 UUID
- [random](./random.md) — underlying CSPRNG (CTR_DRBG-AES-256)
- [Conformance uuid.acvp.md](../../../../src/crypto/utils/uuid.acvp.md)
