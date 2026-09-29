---
module: jws
category: crypto/utils
dependencies: [bitArray, utf8, b64, hmac, sha256, sha512, ed25519]
returns: object
worker-safe: true
status: complete
---

# jws

> JSON Web Signature (RFC 7515) — sign/verify HS*/EdDSA tokens (JWT alternative).

**Module** `jws` | **Source** `packages/front/fw/src/crypto/utils/jws.js` | **Deps** `bitArray`, `utf8`, `b64`, `hmac`, `sha256`, `sha512`, `ed25519` | **Worker-safe** yes

Compact `header.payload.signature` format (Base64url segments). Supported algorithms: HS256, HS512, EdDSA. (HS384 not supported — no `sha384` dep in the factory.)

## Resolve

```js
const jws = runtime.resolve('jws');
// Returns: { sign, verify, signJwt, verifyJwt }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `sign(payload, alg, key, extraHeader?)` | `(Uint8Array, 'HS256'\|'HS512'\|'EdDSA', Uint8Array, Object?) => string \| false` | Compact JWS token |
| `verify(token, key, opts?)` | `(string, Uint8Array, {expectedAlg?, expectedTyp?}) => {header, payload} \| false` | Verified result or `false` |
| `signJwt(claims, alg, key)` | `(Object, string, Uint8Array) => string \| false` | Sign shortcut with `typ:'JWT'` |
| `verifyJwt(token, key, opts?)` | `(string, Uint8Array, {expectedAlg?, expectedTyp?}) => {header, payload, claims} \| false` | Verify + parse JSON claims |

### `verify` / `verifyJwt` — options

| Option | Type | Description |
|--------|------|-------------|
| `expectedAlg` | `string \| string[]` | Algorithm allowlist (anti-alg-confusion / downgrade) |
| `expectedTyp` | `string` | Expected value of the `typ` field (anti-cross-protocol confusion) |

## Examples

### HS256 / JWT

```js
const { jws } = fw.runtime.resolveAll(['jws']);

// Raw JWS (Uint8Array payload)
const payload = new TextEncoder().encode(JSON.stringify({ sub: '42' }));
const token = jws.sign(payload, 'HS256', secretKey);
const out   = jws.verify(token, secretKey, { expectedAlg: 'HS256' });
// { header: {alg:'HS256', typ:'JWS'}, payload: Uint8Array }

// JWT shortcut (stringifies claims + typ:'JWT')
const jwt = jws.signJwt({ sub: '42', exp: 9999999999 }, 'HS256', secretKey);
const res = jws.verifyJwt(jwt, secretKey, { expectedAlg: 'HS256', expectedTyp: 'JWT' });
// { header, payload, claims: { sub: '42', exp: 9999999999 } }
```

### EdDSA

```js
const { jws, ed25519 } = fw.runtime.resolveAll(['jws', 'ed25519']);
const { secretKey, publicKey } = ed25519.keyPair(random.bytes(32));

const payload = new TextEncoder().encode(JSON.stringify({ sub: '42' }));
const token = jws.sign(payload, 'EdDSA', secretKey);
const out   = jws.verify(token, publicKey, { expectedAlg: 'EdDSA' });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const payload = new TextEncoder().encode(JSON.stringify(args[0]));
        self.postMessage(libs.jws.sign(payload, 'HS256', args[1]));
    },
    { dependencies: ['jws'], args: [{ sub: '42' }, secretKey] }
);
```

## Notes

- **`verify` with `expectedAlg`**: always pass `expectedAlg` to prevent alg-confusion attacks (RFC 8725 §3.1) — e.g. an attacker flipping HS512→HS256 in the header.
- **`expectedTyp`**: use to prevent cross-protocol token reuse (e.g. a generic JWS token accepted as a JWT).
- **HS384 not supported** — no `sha384` dependency declared in the factory; warns if attempted.
- **alg='none'** not accepted (RFC 8725 §3.1) — returns `false` + `console.warn('INVALID')`.
- **HMAC verify constant-time**: XOR-accumulated comparison, no early-exit.

## See also

- [hmac](../hash/hmac.md), [ed25519](../pkc/ed25519.md) — primitives
- [b64](../../io/codec/b64.md) — Base64url encoding
