---
module: webauthn
category: dom/utils
dependencies: [random, b64]
returns: object
worker-safe: false
status: complete
---

# webauthn

> WebAuthn Level 3 — Passkeys / FIDO2 registration and authentication via base64url.

**Module** `webauthn` | **Source** `packages/front/fw/src/dom/utils/webauthn.js` | **Deps** `random`, `b64` | **Worker-safe** no

Ergonomic wrapper around `navigator.credentials.{create,get}` (W3C WebAuthn Level 3 / CTAP2).
All binary inputs and outputs are expressed in **base64url without padding** (RFC 4648 §5);
apps never manipulate raw `ArrayBuffer`s.

> **Important**: signature verification is **not** performed client-side.
> The RP server (or `sde_auth_webauthn`) validates the attestation and assertion
> from the fields returned by this module.

## Resolve

```js
const webauthn = runtime.resolve('webauthn');
// Returns: { register, authenticate, support }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `register` | `(opts: RegisterOpts) => Promise<RegistrationResult>` | Registration credential (base64url) |
| `authenticate` | `(opts?: AuthOpts) => Promise<AuthenticationResult>` | Authentication assertion (base64url) |
| `support` | `() => Promise<SupportInfo>` | Browser WebAuthn capabilities |

### `webauthn.register(opts)`

Calls `navigator.credentials.create({ publicKey })` with the provided options.

#### Options `register`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `rp` | `{id: string, name: string}` | required | Relying Party — `id` = effective domain of the origin |
| `user` | `{id: string\|Uint8Array, name, displayName}` | required | User identity ; `id` ≤ 64 bytes |
| `challenge` | `Uint8Array \| string` (base64url) | generated | Challenge 32+ bytes; `random.bytes(32)` if absent |
| `pubKeyCredParams` | `Array` | ES256 + RS256 | Accepted algorithms (`alg: -7, -257`) |
| `authenticatorSelection` | `Object` | — | `userVerification`, `residentKey`, `authenticatorAttachment` |
| `attestation` | `string` | `'none'` | `'none'` \| `'indirect'` \| `'direct'` \| `'enterprise'` |
| `timeout` | `number` | `60_000` | Timeout in milliseconds |
| `excludeCredentials` | `Array<string\|Uint8Array>` | — | Credential IDs to exclude (base64url) |

#### Return `RegistrationResult`

```js
{
    id:   string,                   // base64url (= rawId)
    rawId: string,                  // base64url
    type: 'public-key',
    response: {
        clientDataJSON:    string,  // base64url
        attestationObject: string,  // base64url (CBOR — decode server-side)
        transports?: string[],      // ['internal','usb','nfc',…] if available
    },
    authenticatorAttachment?: string,
}
```

### `webauthn.authenticate(opts?)`

Calls `navigator.credentials.get({ publicKey })`.

#### Options `authenticate`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `challenge` | `Uint8Array \| string` | generated | `random.bytes(32)` if absent |
| `rpId` | `string` | — | RP ID; absent = current origin |
| `allowCredentials` | `Array<string\|Uint8Array>` | — | Allowed credential IDs (base64url) |
| `userVerification` | `string` | `'preferred'` | `'required'` \| `'preferred'` \| `'discouraged'` |
| `timeout` | `number` | `60_000` | ms |

#### Return `AuthenticationResult`

```js
{
    id:   string,                   // base64url
    rawId: string,                  // base64url
    type: 'public-key',
    response: {
        clientDataJSON:    string,  // base64url
        authenticatorData: string,  // base64url
        signature:         string,  // base64url — verify server-side
        userHandle?:       string,  // base64url, present if resident key
    },
}
```

### `webauthn.support()`

Detects WebAuthn capabilities without user interaction.

```js
{
    available: boolean,                          // navigator.credentials.create exists
    userVerifyingPlatformAuthenticator: boolean, // Touch ID, Windows Hello, etc.
    conditionalMediation: boolean,               // autofill passkeys (CM UI)
}
```

## Examples

### Registering a passkey

```js
const webauthn = runtime.resolve('webauthn');

// 1. Check support
const caps = await webauthn.support();
if (!caps.available) throw new Error('WebAuthn not available');

// 2. Register (challenge normally comes from the server)
const cred = await webauthn.register({
    rp:   { id: 'example.com', name: 'Example App' },
    user: { id: 'user-uuid-42', name: 'alice@example.com', displayName: 'Alice' },
    authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
    },
});

// 3. Send to RP server for verification
await fetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(cred),   // everything is base64url, JSON-friendly
});
```

### Authenticating with an existing passkey

```js
const webauthn = runtime.resolve('webauthn');

// challenge provided by the server
const serverChallenge = '<base64url from /api/auth/challenge>';

const assertion = await webauthn.authenticate({
    rpId:             'example.com',
    challenge:        serverChallenge,
    userVerification: 'preferred',
    allowCredentials: ['<credentialId-base64url>'],
});

// Send to RP server
await fetch('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(assertion),
});
```

### Checking capabilities

```js
const webauthn = runtime.resolve('webauthn');
const { available, userVerifyingPlatformAuthenticator, conditionalMediation } = await webauthn.support();

if (userVerifyingPlatformAuthenticator) {
    // Offer Touch ID / Face ID / Windows Hello
}
if (conditionalMediation) {
    // Enable passkey autofill on the email field
}
```

## Notes

- Signature verification is out of scope client-side — `attestationObject` and `signature` must be transmitted to the RP server (or `sde_auth_webauthn`) which validates them against the registered public key.
- `user.id` accepts a `string` (UTF-8 encoded) or a `Uint8Array`; the result is always ≤ 64 bytes per WebAuthn L3 spec §5.4.3.
- The challenge is generated via `random.bytes(32)` if absent; in production, it should always come from the server to prevent replay attacks.
- `support()` is async only because `isUserVerifyingPlatformAuthenticatorAvailable` returns a Promise; the other two fields are synchronous.
- Transports (`usb`, `nfc`, `ble`, `internal`, `hybrid`) are included in the `register` result if the authenticator exposes them via `getTransports()`.

## See also

- [random](../../crypto/utils/random.md) — challenge generation client-side
- [b64](../../io/codec/b64.md) — standard base64 encoding (basis for base64url)
- [leaderElection](./leaderElection.md) — cross-tab coordination useful for multi-step auth flows
