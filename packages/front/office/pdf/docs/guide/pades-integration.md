# PAdES integration — sign and verify in the browser

> From PDF bytes to a signed document to a machine-readable verification
> report — the wiring, the trust-model boundaries, and what you may claim.

## What this guide covers

Bytes in, signed PDF out, then a verification report back: this guide
walks the whole PAdES (ETSI EN 319 142-1) path through `@awacloud/pdf` —
wiring the runtime, bringing your own key material, signing at levels
B/T/LT/LTA, timestamping through the `tsaSign` seam, verifying, and
reading the trust-model boundaries that gate every claim below.

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`) and its `@awacloud/fw` / `@awacloud/fonts` dependencies,
registered on one `@awacloud/fw` `ModuleRuntime`; any modern JavaScript
runtime (browser main thread or Worker, Bun, Node.js 18+). The cryptography
is synchronous and does not use Web Crypto.

The demo `apps/demo/pades` (the source monorepo's PAdES demo application,
not published) is this guide executed: every snippet below is the wiring, sign and
verify path the demo actually runs, minus its UI. Where the demo departs
from a snippet (the mock TSA, the demo certificate emitter), this guide
says so explicitly.

## Wiring

`@awacloud/pdf` publishes a declarative 5-array manifest from its `.`
export — `fw_require`, `pkg_require`, `modules`, `extras`, `bundle` — and
no runtime bootstrap of its own. An integrator wires it into one
`@awacloud/fw` `ModuleRuntime`, registering the five arrays in that
order:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import {
    fw_require, pkg_require, modules, extras, bundle
} from '@awacloud/pdf';

const runtime = new ModuleRuntime();
for (const m of fw_require)  runtime.register(m);
for (const m of pkg_require) runtime.register(m);
for (const m of modules)     runtime.register(m);
for (const m of extras)      runtime.register(m);
for (const m of bundle)      runtime.register(m);

const pdfSign      = runtime.resolve('pdfSign');
const pdfSignature = runtime.resolve('pdfSignature');
const pdfSigPades  = runtime.resolve('pdfSigPades');
```

`pdfSign` and `pdfSignature` are registered in `src/main.js` `modules`,
but none of the three source bundles (`pdf-large` / `pdf-full` /
`pdf-legacy`) wires them: those carry only the read-only `pdfSigPades`
extra. Among the committed prebuilt files, only the four Read+Write roots
(`dist/standalone/pdf-rw.js` and the other `-rw` roots) carry both the
signer and the verifier (see the package README, "Committed dist"). This
guide — like the demo — uses the manifest + `ModuleRuntime` path above,
which reaches signing without a prebuilt file.

Loading `@awacloud/pdf` on a zero-bundler page uses a bare import map. The
map below is the one the demo ships:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":     "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":    "/node_modules/@awacloud/fw/src/",
    "@awacloud/pdf":    "/node_modules/@awacloud/pdf/src/main.js",
    "@awacloud/pdf/":   "/node_modules/@awacloud/pdf/src/",
    "@awacloud/fonts":  "/node_modules/@awacloud/fonts/src/main.js",
    "@awacloud/fonts/": "/node_modules/@awacloud/fonts/src/"
}}
</script>
```

The trailing-slash keys are required because `@awacloud/pdf`'s `main.js`
imports `@awacloud/fw/crypto/...` subpaths and `pkg_require` reaches into
`@awacloud/fonts`.

**`fw_require` carries the full crypto closure today.** An earlier
measurement of this path found `@awacloud/pdf`'s `fw_require` missing four
of `rsa`/`ecc`'s own transitive dependencies (`bn`, `random`, `hex`,
`hmac`), which made `runtime.resolve('pdfSign')` throw `Module not
found: bn` unless a consumer patched the closure itself. That gap is
closed: `fw_require` (`src/main.js`) now registers `random`, `bn`,
`hmac` and `hex` alongside `rsa`, `ecc` and `ed25519`, so the loop above
is complete as written — **do not** add a four-module patch before
registering `modules`; there is nothing left to patch. The source
monorepo's PAdES demo pins this integrator path in a test that registers
the five arrays exactly as above and asserts `pdfSign`/`pdfSignature`
resolve with no extra registration step.

## Key material

`@awacloud/pdf` does not generate or manage keys for you:

> Bring your own key material. `@awacloud/pdf` accepts a DER or PEM
> certificate and an algorithm-specific private key; unwrapping a
> PKCS#12 / `.pfx` container is the integrator's responsibility.

— Do not claim otherwise. No PKCS#12 parser exists. Say: "bring your
own key material; PKCS#12 unwrapping is integrator-side." PKCS#8 / SEC1
/ SPKI / PEM *key* encoding IS available via
`@awacloud/fw/crypto/utils/{keyformat,pem}.js`.

`opts.privateKey`'s shape depends on the algorithm — the dispatch is
`_signDigest` in `src/sig/sign.js`:

| Algorithm | `opts.privateKey` shape |
|---|---|
| RSA-PSS | `{ n, e, d }` (`Uint8Array` each) |
| ECDSA | `{ curve: ecc.curves.c256\|c384\|c521, secretKey: new ecc.ecdsa.secretKey(curve, k) }` |
| Ed25519 | 64-byte `Uint8Array` (seed ‖ public key) |

If your key material arrives as PKCS#8, SEC1 or SPKI DER, or as PEM,
`@awacloud/fw` publishes the conversion — both subpaths resolve through
`@awacloud/fw`'s `exports` map's `./crypto/*.js` wildcard entry, so they
are reachable as ordinary subpath imports, not only from inside the
package:

```js
import { keyformat } from '@awacloud/fw/crypto/utils/keyformat.js';
import { pem }       from '@awacloud/fw/crypto/utils/pem.js';
import { b64 }       from '@awacloud/fw/io/codec/b64.js';

// keyformat needs its own `asn1` dependency when instantiated directly
// (it is not part of @awacloud/pdf's own fw_require closure — it is an
// integrator-side helper for key material, not something pdfSign needs).
const kf = keyformat.factory(asn1Instance);
const { d, curveOid, publicKey } = kf.decodePkcs8Ec(pkcs8Der);

// pem needs its own `b64` dependency when instantiated directly, same
// reason as keyformat above — and it is not optional here: `pem.js`'s
// `factory(b64)` parameter shadows the module's own top-level `b64`
// import, so calling `pem.factory()` with no argument leaves the
// in-scope `b64` undefined and `decode` throws on `b64.toBytes(...)`.
const b64Instance = b64.factory();
const { bytes } = pem.factory(b64Instance).decode(pemText, 'PRIVATE KEY');
```

`keyformat.js` covers PKCS#8 / SEC1 encode+decode for EC keys and
PKCS#8 / SPKI encode+decode for Edwards keys; `pem.js` covers generic
PEM block encode/decode. Neither handles a password-protected PKCS#12
container.

For a certificate, this guide's own snippets — and the demo — use a
throwaway self-signed certificate: **the demo generates a throwaway
demo certificate in your browser**, never "the library issues
certificates" — `@awacloud/fw` and `@awacloud/pdf` publish no X.509
emitter. Bring your own CA-issued certificate for anything beyond a
demo.

## Signing

A minimal PAdES-B signature, run through this guide's own verification
script under Bun:

```js
const signed = pdfSign.sign(pdfBytes, {
    cert, privateKey, algorithm: 'ed25519',
    hashAlg: 'sha512', level: 'B',
    useSignedAttrs: true,
    subFilter: 'ETSI.CAdES.detached'
});
```

**`subFilter: 'ETSI.CAdES.detached'` is not optional.** Quoting the
measured trap verbatim:

> `sign()` emits a non-PAdES SubFilter by default. With no
> `opts.subFilter`, the emitted `/SubFilter` is `adbe.pkcs7.detached`,
> which `pdfSigPades.detectPadesProfile` classifies `{ isPades: false,
> level: null }` — for **all four** levels. Passing `subFilter:
> 'ETSI.CAdES.detached'` yields `isPades: true` and levels `B-B` /
> `B-T` / `B-LT` / `B-LTA`, and the signature still verifies. Measured
> both ways.

Ed25519 always signs with SHA-512 (RFC 8419 §3.1): `hashAlg` defaults to
`'sha512'` for Ed25519, so passing it is optional, and any other value
throws `pdf/sign/ed25519-requires-sha512`. RSA-PSS and ECDSA take
`'sha256'` (the default), `'sha384'` or `'sha512'`.

### Interoperability: Ed25519 in PDF viewers

An Ed25519 signature is an ISO/TS 32002 enhancement of PDF 2.0, and the
standard asks the document to say so (ISO/TS 32002 §4). `sign()` does it
in the signing update: the Catalog's `/Extensions` declares the `ISO_`
developer extension at `/ExtensionLevel 32002`, and a document below PDF
2.0 gets `/Version /2.0` (see [`pdfSign`](../api/sig/sign.md)). ECDSA and
RSA-PSS signatures leave the Catalog's `/Extensions` and `/Version` alone.

**Adobe Acrobat Reader does not validate Ed25519 (EdDSA) signatures.**
Measured on 2026-10-05: Acrobat Reader reports an error about the
formatting of the signature for our Ed25519 output, with or without the
ISO/TS 32002 declaration, and the same error for an Ed25519 signature
produced by OpenSSL. In the same run it reports the ECDSA P-256 signature
as unmodified, with trust and time remarks only (the certificate was
self-signed). OpenSSL 3.5 and later verify the Ed25519 output with
`openssl cms -verify`, and so does `pdfSignature.verifyAllSignatures`.

Choose the algorithm by where the document will be checked: **ECDSA
P-256 when Acrobat must validate the signature**; Ed25519 when the
verifiers are known to support EdDSA.

`useSignedAttrs: true` adds the ESS `signing-certificate-v2` attribute
(RFC 5035); it is required for T/LT/LTA (the timestamp token lives in
`unsignedAttrs`, only emitted alongside `signedAttrs`) and optional for
B, where this guide always passes it for a PAdES baseline signature.

Levels, in the exact wording every public sentence about them must
quote:

| Level | Claim |
|---|---|
| B | "Produces PAdES-B (B-B) signatures in the browser." |
| T | "Produces PAdES-T signatures; the RFC 3161 timestamp token is supplied by the integrator through a `tsaSign` callback — the library performs no network call." |
| LT | "Emits the LT structure (DSS with the signer certificates). Revocation material (CRL/OCSP) is supplied by the integrator; the library neither fetches nor validates it." |
| LTA | "Emits the LTA structure (DSS + document timestamp) and re-verifies the document timestamp on read. The archival *policy* (renewal before algorithm expiry) is the integrator's." |

LT and LTA additionally take `opts.dss = { certs: [...] }` — the
certificates to embed in the Document Security Store:

```js
const signedLt = pdfSign.sign(pdfBytes, {
    cert, privateKey, algorithm: 'ed25519',
    hashAlg: 'sha512', level: 'LT',
    useSignedAttrs: true,
    subFilter: 'ETSI.CAdES.detached',
    tsaSign,                       // see "The tsaSign seam" below
    dss: { certs: [cert] }
});
```

**The signature sits in an invisible signature field.** In the same
incremental update as the `<< /Type /Sig /Filter /Adobe.PPKLite
/SubFilter /... /ByteRange [...] /Contents <...> >>` dictionary, `sign()`
writes a signature field merged with its widget annotation (`/FT /Sig`,
`/T (Signature1)` — the next free `Signature<n>` when the document
already has signature fields — `/V` pointing at that dictionary,
`/Rect [0 0 0 0]`, `/F 132`, `/P` page 1). It also adds the widget to
page 1's `/Annots` and creates or extends the Catalog's `/AcroForm` with
`/Fields` and `/SigFlags 3`, as ISO 32000-2 §12.7.5.5 requires. Existing
form fields and annotations are kept, and the LTA `/DocTimeStamp` gets a
field of its own. The field has a zero-size rectangle and no `/AP`
appearance stream. On an encrypted base the field name is encrypted too
(see [Encrypted documents](#encrypted-documents) below).

**The `/ByteRange` leaves out the whole `/Contents <…>` token.** The
gap between the two signed ranges starts at the `<` and ends after the
`>`, as ISO 32000-2 §12.8.3.3.1 requires ("it shall fit precisely in the
space between the ranges") and as PDFBox and pyHanko emit — for the
`/Sig` and for the LTA `/DocTimeStamp` alike. Signatures `sign()` wrote
by earlier versions left out the hex digits only; they still verify (see
[Verifying](#verifying)).
The signature is invisible; a visible appearance is the integrator's
document work.

### Encrypted documents

An encrypted PDF (standard security handler, AES) is signed like any
other, with its password:

```js
const signedEnc = pdfSign.sign(encryptedBytes, {
    cert, privateKey, algorithm: 'ed25519',
    useSignedAttrs: true,
    subFilter: 'ETSI.CAdES.detached',
    password: 'user-pwd'           // owner or user password; '' for an empty user password
});
```

`sign()` derives the document key from `password`, encrypts the new
field's `/T` with it and repeats the document's `/Encrypt` in the update's
trailer. With the user password, the document's permissions must allow
modifying it and adding annotations or form fields; the owner password
always signs. AES-128 (V=4, `AESV2`) and AES-256 (V=5, R=5 or R=6,
`AESV3`) are supported. RC4 and AES-GCM documents, handlers other than
the standard one, a missing or wrong password and missing permissions are
refused with a `pdf/sign/encrypted-*` error, and nothing is written. The
IV comes from `crypto.getRandomValues`, or from `opts.randomBytes` when
you pass one. Levels LT and LTA work on an encrypted document too: the DSS
streams and strings and the document timestamp's field name are encrypted
with the same key, and the hexadecimal `/Contents` of the signature and of
the document timestamp stays clear, as ISO 32000-2 §7.6.2 requires. See
the [`pdfSign` API page](../api/sig/sign.md#encrypted-base).

## Timestamping — the `tsaSign` seam

`@awacloud/pdf` never calls a Timestamp Authority itself. The contract:

- `pdfSign.sign` never performs a network call and has no TSA client.
  For `level: 'T'|'LT'|'LTA'` it requires a caller-supplied callback, and
  throws `pdf/sign/tsa-required-for-level-T` without one:

  ```js
  opts.tsaSign({ digest, hashAlg }) -> Uint8Array  // RFC 3161 TimeStampToken DER
  ```

- `digest` is the hash of the **signature value** (RFC 3161 §2.4.1
  messageImprint over the signature OCTET STRING); the returned token is
  wrapped verbatim into the CMS `unsignedAttrs` id-aa-timeStampToken
  attribute (`_buildUnsignedAttrsTsa`). LTA calls the same callback a
  second time to build the standalone DocTimeStamp.

This is the decisive structural fact: **the library's TSA seam is a
callback, so the network exception is entirely the integrator's**. It is
never inside `@awacloud/pdf`.

This is exactly what row 2 of the claim matrix (§ "What you may claim"
below) commits to: "Produces PAdES-T signatures; the RFC 3161 timestamp
token is supplied by the integrator through a `tsaSign` callback — the
library performs no network call."

### Example — an external-TSA `tsaSign`

A worked external-TSA `tsaSign` implementation, built with fw's `asn1`
primitives. The package test suite runs this exact snippet against a
stubbed TSA reply (no network); a real deployment needs a reachable TSA.

```js
import { asn1 as asn1Descriptor } from '@awacloud/fw/crypto/utils/asn1.js';
const asn1 = asn1Descriptor.factory();   // the descriptor carries no encoders

// fw's asn1 has no BOOLEAN encoder (see the guide's Key material
// section for the same gap on primitive string/time types) — hand-roll
// the one TLV TimeStampReq needs.
function encodeBoolean(v) {
    return Uint8Array.of(0x01, 0x01, v ? 0xff : 0x00);
}

// The messageImprint AlgorithmIdentifier follows the hashAlg sign() passes.
const HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};

function buildTimeStampReq(digest, hashAlg) {
    const messageImprint = asn1.encodeSequence([
        asn1.encodeSequence([ asn1.encodeOid(HASH_OIDS[hashAlg]), asn1.encodeNull() ]),
        asn1.encodeOctetString(digest)
    ]);
    return asn1.encodeSequence([
        asn1.encodeInteger(1),          // version
        messageImprint,
        encodeBoolean(true)             // certReq
    ]);
}

async function tsaSign({ digest, hashAlg }) {
    const body = buildTimeStampReq(digest, hashAlg);
    const res = await fetch(tsaUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/timestamp-query' },
        body
    });
    if (!res.ok || res.headers.get('content-type') !== 'application/timestamp-reply') {
        throw new Error('TSA request failed: ' + res.status);
    }
    const replyBytes = new Uint8Array(await res.arrayBuffer());
    // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken TimeStampToken OPTIONAL }
    const resp = asn1.parseOne(replyBytes, 0);
    const [statusInfo, token] = (resp && asn1.parseChildren(resp.value)) || [];
    if (!statusInfo) throw new Error('TSA reply is not a TimeStampResp');
    // PKIStatusInfo.status: 0 = granted, 1 = grantedWithMods — both usable.
    // readInteger returns the raw INTEGER bytes; a PKIStatus is a single byte.
    const statusNode = asn1.parseChildren(statusInfo.value)[0];
    const statusBytes = statusNode && asn1.readInteger(statusNode);
    if (!statusBytes || statusBytes.length !== 1) {
        throw new Error('TSA reply carries no PKIStatus');
    }
    const status = statusBytes[0];
    if (status !== 0 && status !== 1) {
        throw new Error('TSA refused: status ' + status);
    }
    if (!token) throw new Error('TSA granted the request but returned no token');
    // The token is the TLV to return, as-is: slice it out of the reply.
    // parseChildren offsets are relative to resp.value, which starts at resp.valueOff.
    const tokenOff = resp.valueOff + statusInfo.next;
    const tokenNode = asn1.parseOne(replyBytes, tokenOff);
    return replyBytes.subarray(tokenOff, tokenNode.next);
}
```

`sign()` is synchronous, so an async `fetch`-based `tsaSign` cannot be
plugged in directly — this is a constraint on the integration, not a
recipe to follow verbatim. A production integration either pre-fetches
the timestamp token before calling `sign()` and returns it from a
synchronous callback, or runs the whole signing step as a two-pass
integration (compute the digest, `await` the TSA, then call `sign()`
with a synchronous callback closing over the already-fetched token).

The demo itself ships neither of these — it uses a mock TSA instead,
by deliberate decision:

> **Mock TSA in-demo. Default and only path shipped. Zero network.**
>
> Rationale: the whole product story is "nothing leaves your machine",
> and the demo's headline artifact is the empty network tab. A live
> TSA call would spend that proof to demonstrate a feature the
> integrator supplies anyway. An external TSA also drags in an
> availability dependency, a CORS surface and, in the EU, a policy
> discussion the demo should not host.
>
> **Demo-UX consequence**: the timestamped levels must
> be labelled in the UI as demonstrating the *mechanism*, not a
> trusted time. Required wording, verbatim: *"Timestamped by an
> in-page demo TSA — the mechanism is real, the time source is not
> trusted. A production deployment supplies its own TSA through the
> `tsaSign` callback."* The privacy panel keeps its "0 network
> requests" claim at every level. The integration guide documents the
> external-TSA callback with a worked `fetch` example the demo never
> executes.

## Verifying

A single call verifies every signature and timestamp object in a
document:

```js
const report = pdfSignature.verifyAllSignatures(documentBytes);
// { signatures: [...], timestamps: [...] }
```

(`fwBundle` is an optional second argument — the module carries its own
default bundle.)

Each entry of `report.signatures` carries these fields, exactly as
measured:
`computedDigest`, `errors`, `hashAlg`, `objGen`, `objNum`,
`pkVerified`, `signatureAlg`, `signerCerts`, `verified` — plus one more
boolean field, `valid`, a deprecated alias of `verified`, kept for
compatibility; read `verified`.

**`verified` also requires a well-formed `/ByteRange` gap.** Each
`/Sig`'s gap must be exactly its `/Contents` value: the whole `<…>`
token (what `sign()` emits) or its hex digits only (what `sign()`
emitted in earlier versions). Any other gap — off by one byte at either
end, a delimiter only, part of the digits — gives `verified: false`
with `pdf/sig/byterange/gap-start-mismatch` and/or
`pdf/sig/byterange/gap-end-mismatch` in `errors`, even when the
public-key check itself passed (`pkVerified: true`). The digest is
always computed over the ranges the file declares. The `/DocTimeStamp`
entries of `report.timestamps` run the same gap check: a
non-exact gap gives `verified: false` with the same two codes in
`errors`, even when the imprint matched (`imprintVerified: true`), and
each entry names the accepted form in `gapForm` — `'token'`,
`'digits'`, or `null` for any other gap.

This is row 5 of the claim matrix, in the exact wording every public
sentence about verification must quote:

> "Reconstructs the PKCS#7, recomputes the `/ByteRange` digest and
> verifies the signer's public-key signature — reported as `verified`.
> This is a cryptographic check, **not** signature validation per EN
> 319 102."

The algorithms this covers (row 6): "RSA-PSS and ECDSA with
SHA-256/384/512; Ed25519 with SHA-512 (RFC 8419), declared in the document
per ISO/TS 32002. Adobe Acrobat Reader does not validate Ed25519
signatures: use ECDSA P-256 where Acrobat must validate the signature."

**The PAdES level is not on the verify result.** `verifyAllSignatures`
never returns a `level` or a `subFilter`; `pdfSigPades.detectPadesProfile`
is the only level source, and it takes three caller-supplied context
flags, derived from the raw bytes:

```js
const TS_OID_HEX = '2A864886F70D010910020E'; // id-aa-timeStampToken

function levelContext(documentBytes) {
    const txt = new TextDecoder('latin1').decode(documentBytes);
    return {
        // Case-insensitive: sign() itself emits uppercase hex, but a
        // /Contents literal from another producer is not guaranteed to be.
        hasSignatureTimestamp: new RegExp(TS_OID_HEX, 'i').test(txt),
        dss: /\/DSS/.test(txt),
        hasDocTimestampOverDss: /\/DocTimeStamp/.test(txt)
    };
}

const level = pdfSigPades.detectPadesProfile(sigDict, levelContext(documentBytes)).level;
// 'B-B' | 'B-T' | 'B-LT' | 'B-LTA' | null
```

## The verification report

A demo-shaped report layers the raw verify result with the three
derived context flags into one object. The shape below is the literal
measured output for a PAdES-T run, as the source monorepo's PAdES demo
produces it (`apps/demo/pades/src/report.js`, not published). It is the
output of one demo run; values such as `documentBytes` and the digest
differ per run.

```json
{
  "levelClaimed": "T",
  "levelDetected": "B-T",
  "isPades": true,
  "subFilter": "ETSI.CAdES.detached",
  "documentBytes": 18671,
  "signatureCount": 1,
  "byteRangeDigest": "b788862920399635f08a6e9b21b6c89b2a131854d9258657e2a3acb6a4f298772a9bb018b0b2a35d700d5827d8c5d8dbaffaad24ab59149f16e4a0f0d196451e",
  "signatureValid": "verified",
  "pkVerified": true,
  "signatureAlg": "ed25519",
  "hashAlg": "sha512",
  "signerCertCount": 1,
  "chain": "not-evaluated",
  "revocation": "not-evaluated",
  "qualified": "not-evaluated",
  "timestamps": [],
  "errors": []
}
```

Design notes:

- `signatureValid` is a **string enum**, not a boolean:
  `'verified' | 'not-verified' | 'no-signature'`. It must never be
  rendered as "valid".
- `chain`, `revocation`, `qualified` are always present and always
  `'not-evaluated'` today. Keeping the keys is what makes the omission
  visible rather than silent; a future version may widen the enum, never
  drop the key.
- `levelClaimed` vs `levelDetected` are distinct on purpose — the
  first is what the signer asked for, the second is what the bytes
  say.
- `timestamps[]` entries are only ever DocTimeStamp objects.
- `errors` carries the typed `pdf/sig/*` codes verbatim; the demo maps
  them to human text, it does not invent them.

## Trust-model boundaries

`@awacloud/pdf`'s signing surface draws a hard line between what it
verifies cryptographically and what your PKI has to supply separately:

| The library checks | Your PKI must provide |
|---|---|
| The `/ByteRange` digest and the signer's public-key signature over it; for each `/Sig` and each `/DocTimeStamp`, that the `/ByteRange` gap is exactly the `/Contents` value (the `<…>` token, or its hex digits for signatures written by earlier versions). | A certificate chain to a trust anchor. `certChain.validateChainOrder` compares issuer/subject **strings** only; it verifies no certificate signature, no validity dates, no name constraints, no trust anchor. Report as `chain: 'not-evaluated'`. |
| — nothing on read. | Revocation status. DSS `/CRLs` and `/OCSPs` are *typed on read* (`pdfSigPades.typeDSS`); nothing is fetched, parsed for status, or checked. Report as `revocation: 'not-evaluated'`. |
| — nothing; the concept does not exist in this component. | Qualified / eIDAS status. eIDAS is market context only — "qualified" is a property of a certificate and a validation process your QTSP provides, never a property of `@awacloud/pdf`. No trust-list handling exists here, in any form. |
| That an RFC 3161 token is well-formed, once written (T/LT); the DocTimeStamp timestamp, on read (LTA). | Trust in the TSA itself, and — for T/LT — verification of the embedded signature-timestamp: the id-aa-timeStampToken attribute is written but never verified on read; only standalone `/DocTimeStamp` objects (LTA) are. |
| That LT/LTA structures are emitted and, for LTA, that the document timestamp verifies on read. | Archival policy: renewal before algorithm expiry, and any decision about how long a signature must remain provable, are the integrator's. |

## What you may claim

This table is normative for every public sentence about the component.

| # | Capability | Verdict | Exact wording to use | Evidence |
|---|---|---|---|---|
| 1 | PAdES-B signing | **C** | "Produces PAdES-B (B-B) signatures in the browser." | measured B sign + verify round trip |
| 2 | PAdES-T signing | **CWC** | "Produces PAdES-T signatures; the RFC 3161 timestamp token is supplied by the integrator through a `tsaSign` callback — the library performs no network call." | measured T sign; `sign()` throws `pdf/sign/tsa-required-for-level-T` without `tsaSign` |
| 3 | PAdES-LT signing | **CWC** | "Emits the LT structure (DSS with the signer certificates). Revocation material (CRL/OCSP) is supplied by the integrator; the library neither fetches nor validates it." | measured LT sign |
| 4 | PAdES-LTA signing | **CWC** | "Emits the LTA structure (DSS + document timestamp) and re-verifies the document timestamp on read. The archival *policy* (renewal before algorithm expiry) is the integrator's." | measured LTA sign; the DocTimeStamp verifies on read |
| 5 | Signature verification | **CWC** | "Reconstructs the PKCS#7, recomputes the `/ByteRange` digest and verifies the signer's public-key signature — reported as `verified`. This is a cryptographic check, **not** signature validation per EN 319 102." | measured `verified` / `pkVerified` on a signed document |
| 6 | Algorithms | **CWC** | "RSA-PSS and ECDSA with SHA-256/384/512; Ed25519 with SHA-512 (RFC 8419), declared in the document per ISO/TS 32002. Adobe Acrobat Reader does not validate Ed25519 signatures: use ECDSA P-256 where Acrobat must validate the signature." | `HASH_TABLE` + `_signDigest` in `src/sig/sign.js`; Ed25519 (SHA-512) and ECDSA P-256 / P-384 (DER `ECDSA-Sig-Value`) measured end to end; Acrobat Reader rejection of Ed25519 measured 2026-10-05, also on an OpenSSL-produced Ed25519 signature, which OpenSSL 3.5.6 verifies |
| 7 | PAdES level detection | **CWC** | "Detects B-B / B-T / B-LT / B-LTA from the signature dictionary — only for `/SubFilter /ETSI.CAdES.detached`; `adbe.pkcs7.detached` is reported as non-PAdES." | measured `detectPadesProfile` on both SubFilters |
| 8 | Signature-timestamp verification (T/LT) | **NC** | — Do not claim. The embedded id-aa-timeStampToken attribute is written but never verified on read; only standalone `/DocTimeStamp` objects (LTA) are. | no read path verifies the embedded timestamp attribute |
| 9 | Certificate-chain validation | **NC** | — Do not claim. `certChain.validateChainOrder` compares issuer/subject **strings** only; it verifies no certificate signature, no validity dates, no name constraints, no trust anchor. Report as `chain: 'not-evaluated'`. | `validateChainOrder` in `src/sig/certChain.js` |
| 10 | Revocation (CRL/OCSP) | **NC** | — Do not claim. DSS `/CRLs` and `/OCSPs` are *typed on read* (`pdfSigPades.typeDSS`); nothing is fetched, parsed for status, or checked. Report as `revocation: 'not-evaluated'`. | `typeDSS` in `src/extra/sig-pades.js` |
| 11 | Qualified / eIDAS status | **NC** | — Do not claim, in any form, including "eIDAS-ready" or "qualified-capable". No trust-list handling exists. eIDAS may be named only as market context, never as a property of the component. | no code |
| 12 | Certificate generation | **NC (as a library claim)** | — The demo generates its own self-signed certificate; **`@awacloud/fw` and `@awacloud/pdf` publish no X.509 emitter**. Phrase as "the demo generates a throwaway demo certificate in your browser", never "the library issues certificates". | no X.509 emitter in `@awacloud/fw` or `@awacloud/pdf` |
| 13 | PKCS#12 import | **NC** | — Do not claim. No PKCS#12 parser exists. Say: "bring your own key material; PKCS#12 unwrapping is integrator-side." PKCS#8 / SEC1 / SPKI / PEM *key* encoding IS available via `@awacloud/fw/crypto/utils/{keyformat,pem}.js`. | no PKCS#12 parser in `@awacloud/fw` or `@awacloud/pdf` |
| 14 | Client-side / zero-upload | **C** | "The document never leaves the page: signing and verification are pure computation, with zero network calls." | measured zero network calls; `src/sig/sign.js` has no fetch seam |
| 15 | Zero npm runtime dependency | **C** | "Zero npm runtime dependency: `@awacloud/pdf` depends only on `@awacloud/fw` and `@awacloud/fonts`, both first-party." | `package.json` `dependencies` |
| 16 | B-LTA end-to-end assurance | **CWC** | "LTA is emitted and its document timestamp verified; a full real-chain PKCS#7 + nested DocTimeStamp end-to-end test is still an open follow-up." | `validateBLtaChain` B→T→LT→LTA round trip (`CHANGELOG.md`) |

Legend: **C** = claimable; **CWC** = claimable with the exact caveat
quoted; **NC** = not claimable.

## See also

- [Crypto — risks and limitations](./crypto.md)
- [`pdfSigPades` API reference](../api/extra/sig-pades.md)
- [`pdfSignature` API reference](../api/sig/signature.md)
- The `apps/demo/pades` README — the demo application's own guide, in the
  source monorepo (not published)
