# `cms-oracle` fixtures

External-oracle fixtures for the CMS encodings that `pdfSign` emits and
`pdfSignature` verifies. The package's own verifier once accepted its own
defective CMS forms, so a test that only round-trips `sign()` through
`verifyAllSignatures` proves nothing about interoperability. The two PDFs
here carry a `/Contents` CMS produced by **OpenSSL**, not by this package,
over this package's own `/ByteRange` content.

`tests/cms-oracle.integration.test.js` reads them. It checks that our verifier
accepts both and rejects a one-byte tamper of the covered content. It also
checks that our `sign()` output has the same structure as OpenSSL's: the ECDSA
`signature` is a DER `SEQUENCE { INTEGER, INTEGER }`, and the Ed25519
SignerInfo `digestAlgorithm` is id-sha512. **No test runs `openssl`.** A
missing fixture fails the suite with the regeneration command and never skips.

**Throwaway keys, never an identity. Keys are not committed.** The keys and
self-signed certificates live in the git-ignored `tmp/cms-oracle-keys/` of the
generating station. The certificates travel only inside each fixture's CMS
`certificates` field. No `.pem`, `.der` or key file belongs in this directory.

## Files

| File | Bytes | sha256 | Signature |
|---|---|---|---|
| `ecdsa-p256-sha256-openssl.pdf` | 17680 | `407a352468e60b1330925480e0cb043082d2c1b851228ccf24803ffcfac7d6e0` | ECDSA P-256, SHA-256, CMS 750 bytes |
| `ed25519-sha512-openssl.pdf` | 17680 | `865ac4442295b4e74badaa026be9df3d277d159989050c990ecf229e1e297a35` | Ed25519, SHA-512 (RFC 8419), CMS 713 bytes |
| `generate.mjs` | — | — | The generator (manual, owner station only) |

Generated on **2026-10-04** with:

```
$ openssl version
OpenSSL 3.5.6 7 Apr 2026 (Library: OpenSSL 3.5.6 7 Apr 2026)
```

**OpenSSL version requirement.** EdDSA CMS signing needs a recent OpenSSL.
OpenSSL 3.2.1 (the build shipped with Git for Windows on the generating
station) refuses it with `CMS_add1_signer: unsupported signature algorithm`.
With no `-md`, it fails with `no default digest` instead. The fixtures were
produced by running the unchanged generator under Debian 13 (WSL), whose
`openssl` is 3.5.6. ECDSA signing works on both versions.

ECDSA signatures are randomized, so a regeneration produces different bytes.
After a regeneration, update the table above with the sha256 values that the
generator prints.

## Regenerating

From the repository root, with an `openssl` on `PATH` that signs EdDSA CMS:

```
bun packages/front/office/pdf/tests/_fixtures/cms-oracle/generate.mjs packages/front/office/pdf/tests/_fixtures/cms-oracle
```

`--keys <dir>` overrides the key directory, which defaults to
`<repo>/tmp/cms-oracle-keys/`. The generator refuses any path under `apps/`.

### What the generator does

1. Builds the base document with `pdfBuilder`: one page, Helvetica, and the
   text line `awa pdf CMS oracle`.
2. Creates the keys and certificates when they are absent:

   ```
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout <keys>/p256-key.pem -out <keys>/p256-cert.pem -subj "/CN=awa pdf CMS oracle P-256" -days 3650
   openssl req -x509 -newkey ed25519 -nodes -keyout <keys>/ed-key.pem -out <keys>/ed-cert.pem -subj "/CN=awa pdf CMS oracle Ed25519" -days 3650
   ```

3. For each case, it reserves the signature dictionary with
   `pdfSign._emitWithPlaceholder(base, 8192, 'ETSI.CAdES.detached')` and
   writes the `/ByteRange`-covered bytes to `<keys>/content-<case>.bin`.
   Then it signs them detached (`-nodetach` is never passed) and self-checks
   the result:

   ```
   openssl cms -sign -binary -nosmimecap -md <sha256|sha512> -signer <cert> -inkey <key> -in <keys>/content-<case>.bin -outform DER -out <keys>/cms-<case>.der
   openssl cms -verify -binary -inform DER -in <keys>/cms-<case>.der -content <keys>/content-<case>.bin -noverify -out /dev/null
   ```

   It checks that the DER is a CMS `SignedData` ContentInfo. It writes the
   upper-case hex at the `/Contents` offset, pads it with `0` to the
   placeholder length, and writes `<outDir>/<case>-openssl.pdf`.
4. Runs the reverse oracle (next section).
5. Prints the sha256 of every fixture it wrote.

## Reverse oracle

The generator also signs the same base with **our** `sign()`, using the same
OpenSSL keys. The P-256 `d` comes from `openssl ec -in p256-key.pem -noout -text`,
the Ed25519 seed from `openssl pkey -in ed-key.pem -noout -text`, and the
certificate is the PEM text. It splits each output by its last `/ByteRange`
and runs `openssl cms -verify … -noverify` on it. It covers two forms of
`sign()`: the default (`adbe.pkcs7.detached`, no signed attributes) and the
PAdES form (`ETSI.CAdES.detached`, `useSignedAttrs: true`). This is evidence
recorded here, not a test.

To re-read the reverse oracle without touching the committed fixtures,
point the generator at a scratch directory; ECDSA signatures are
randomized, so a run into this directory would change the fixture bytes:

```
bun packages/front/office/pdf/tests/_fixtures/cms-oracle/generate.mjs tmp/cms-oracle-rerun/out
```

It still writes its working files (content, CMS and `ours-*` outputs) into
the key directory.

Result on 2026-10-04, OpenSSL 3.5.6 (`openssl cms -verify` exit code in
brackets), after the signed-attributes fix below:

| `sign()` output | `openssl cms -verify` |
|---|---|
| ECDSA P-256 / SHA-256, default form | **OK** (0, `CMS Verification successful`) |
| ECDSA P-256 / SHA-256, PAdES form | **OK** (0, `CMS Verification successful`) |
| Ed25519 / SHA-512, PAdES form | **OK** (0, `CMS Verification successful`) |
| Ed25519 / SHA-512, default form | **FAIL** (4, `invalid eddsa instance for attempted operation`), an OpenSSL limitation |

Before the fix, on the same date, the Ed25519 PAdES form failed too
(exit 4, `ED25519 digest_verify`). The two Ed25519 failures had different
causes.

- **PAdES form: a `sign()` encoding defect, fixed on 2026-10-04.**
  `sign()` used to write the signed attributes in a fixed order:
  contentType, messageDigest, signingTime, signingCertificateV2. That
  `SET OF` was not in DER order, which RFC 5652 §5.4 requires for the
  signed bytes. For EdDSA, OpenSSL re-encodes the attributes in DER order
  before it verifies, so it checked different bytes from the ones that
  were signed. Three checks confirmed the diagnosis:
  - `openssl pkeyutl -verify -rawin` accepted our Ed25519 signature over
    our attribute bytes as written;
  - `openssl cms -cmsout` reordered the attributes when it re-encoded;
  - the same attributes, sorted and signed again with the same key,
    passed `openssl cms -verify`.

  The ECDSA outputs carried the same unsorted set and still passed, because
  only OpenSSL's EdDSA verification path is sensitive to the order. Since
  the fix, `sign()` sorts the encoded attributes bytewise before it builds
  the set (X.690 §11.6) and signs the sorted bytes. For the Ed25519
  output that order is contentType, signingTime, signingCertificateV2,
  messageDigest, as `openssl cms -cmsout -print` shows. The
  verifier still checks the attributes as received, so signatures written
  in the old order keep verifying.
- **Default form: OpenSSL does not implement it.** RFC 8419 allows EdDSA
  without signed attributes, with the signature computed over the content.
  OpenSSL 3.5.6 cannot sign that form either:
  `openssl cms -sign -noattr` with an Ed25519 key fails with the same
  `invalid eddsa instance for attempted operation`.

Our verifier accepts both OpenSSL fixtures, and the test suite pins that
result.

**Acrobat Reader, 2026-10-05.** Adobe Acrobat Reader rejects `ed25519-sha512-openssl.pdf` with an error about the formatting of the signature, as it rejects our own Ed25519 output: it does not validate EdDSA signatures, which OpenSSL 3.5.6 verifies. In the same check it reported our ECDSA P-256 `sign()` outputs as unmodified (trust and time remarks only).
