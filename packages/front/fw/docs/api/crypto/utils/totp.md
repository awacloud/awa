---
module: totp
category: crypto/utils
dependencies: [hmac, random, base32]
returns: object
worker-safe: true
status: complete
---

# totp

> TOTP RFC 6238 — time-based OTP generation, verification, and enrollment.

**Module** `totp` | **Source** `packages/front/fw/src/crypto/utils/totp.js` | **Deps** `hmac`, `random`, `base32` | **Worker-safe** yes

Strict TOTP (RFC 6238) implementation built on HOTP (RFC 4226). Algorithm: HMAC-SHA-1/256/512 of the time counter T (8 bytes big-endian), dynamic truncation, modulo 10^digits. Includes enrollment helpers (random secret generation, `otpauth://` URI) compatible with standard authenticators (Google Authenticator, Authy, etc.).

**Recommendation**: prefer `algorithm: 'SHA-256'` for new deployments. `'SHA-1'` is kept as the default for RFC 6238 compatibility and interoperability with existing authenticators.

## Resolve

```js
const totp = runtime.resolve('totp');
// Returns: { generate, verify, enroll, uri }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `generate` | `(secret: Uint8Array\|string, opts?) => string` | Zero-padded OTP code |
| `verify` | `(code: string, secret: Uint8Array\|string, opts?) => {valid, delta?}` | Verification result |
| `enroll` | `(opts) => {secret, secretBytes, uri}` | Secret + otpauth:// URI |
| `uri` | `(opts) => string` | otpauth://totp/... URI |

### `totp.generate(secret, opts?)`

Generates the current TOTP code for the given secret.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `algorithm` | `'SHA-1'\|'SHA-256'\|'SHA-512'` | `'SHA-1'` | HMAC algorithm |
| `digits` | `6\|7\|8` | `6` | Number of digits |
| `period` | `number` | `30` | Period in seconds |
| `t` | `number` | `Date.now()/1000` | Epoch in seconds (override) |

Returns a zero-padded `string` of length `digits` (e.g. `'012345'`).

### `totp.verify(code, secret, opts?)`

Verifies a code with a tolerance window. The comparison is **constant-time** (XOR-accumulated, no short-circuit) for the full duration of the window.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `algorithm` | `'SHA-1'\|'SHA-256'\|'SHA-512'` | `'SHA-1'` | HMAC algorithm |
| `digits` | `6\|7\|8` | `6` | Number of digits |
| `period` | `number` | `30` | Period in seconds |
| `t` | `number` | `Date.now()/1000` | Epoch in seconds (override) |
| `window` | `number` | `1` | Tolerance ±N steps |

Returns `{ valid: true, delta: number }` on success, `{ valid: false }` on failure.

### `totp.enroll(opts)`

Generates a random secret and enrollment URI. Uses `random.bytes(secretLen)` for CSPRNG generation.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | `string` | `''` | Application name |
| `account` | `string` | `''` | User identifier |
| `algorithm` | `'SHA-1'\|'SHA-256'\|'SHA-512'` | `'SHA-1'` | Algorithm |
| `digits` | `6\|7\|8` | `6` | Number of digits |
| `period` | `number` | `30` | Period |
| `secretLen` | `number` | `20` | Secret length in bytes (≥16 recommended) |

Returns `{ secret: string, secretBytes: Uint8Array, uri: string }` where `secret` is base32-encoded without padding.

### `totp.uri(opts)`

Builds a strictly-encoded `otpauth://totp/<issuer>:<account>?...` URI. `issuer` and `account` are passed through `encodeURIComponent`.

## Examples

### Basic enrollment and verification

```js
const totp = runtime.resolve('totp');

// Enrollment (new installation)
const { secret, uri } = totp.enroll({
    issuer: 'MyApp',
    account: 'user@example.com',
    algorithm: 'SHA-256', // recommended for new installations
});

// Display the URI as a QR code (app side)
console.log(uri);
// otpauth://totp/MyApp:user%40example.com?secret=...&issuer=MyApp&algorithm=SHA-256&digits=6&period=30

// Verification (server side)
const code = '123456'; // code entered by the user
const result = totp.verify(code, secret, { algorithm: 'SHA-256' });
if (result.valid) {
    console.log('MFA OK, delta=', result.delta);
}
```

### Direct generation (dev / tests)

```js
const totp = runtime.resolve('totp');

// Secret as bytes or base32
const secretBytes = new Uint8Array(20); // ... shared key
const code = totp.generate(secretBytes, { algorithm: 'SHA-1', digits: 6 });
// → '012345'  (zero-padded, varies with time)
```

### Manual URI

```js
const totp = runtime.resolve('totp');
const u = totp.uri({
    issuer: 'Foo Inc',      // → Foo%20Inc in the URI
    account: 'bob@foo.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA-1',
    digits: 6,
    period: 30,
});
// otpauth://totp/Foo%20Inc:bob%40foo.com?secret=JBSWY3DPEHPK3PXP&issuer=Foo%20Inc&...
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const code = libs.totp.generate(args.secret, { algorithm: 'SHA-256' });
        self.postMessage(code);
    },
    { dependencies: ['totp'], args: { secret: secretBytes } }
);
```

## Notes

- `'SHA-1'` is the default for RFC 6238 compatibility, but `'SHA-256'` is recommended for all new installations (better HMAC security, growing authenticator support).
- `secretLen` default 20 bytes = 160 bits, optimal for HMAC-SHA-1. Use 32 bytes for HMAC-SHA-256, 64 bytes for HMAC-SHA-512.
- `verify` always iterates the full window without short-circuiting to resist timing attacks.
- The secret returned by `enroll` is base32-encoded without `=` padding (compatible with Google Authenticator, Authy, FreeOTP, etc.).
- `random.bytes` uses `crypto.getRandomValues` directly — no Math.random.

## See also

- [hmac](../hash/hmac.md) — HMAC-SHA-1/256/512 (direct dependency)
- [base32](../../io/codec/base32.md) — RFC 4648 encoding of the secret
- [random](./random.md) — CSPRNG for secret generation
- [jws](./jws.md) — JSON Web Signature (another auth protocol)
