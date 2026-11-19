# L4 evidence

The monorepo's maturity scale asks three things of a package at L4, beyond
L3 (published docs mirror, licence, verified coverage): a **frozen public
API with a deprecation cycle**, **conformance vectors where a standard
applies**, and **proof in production**. This page sets out, for
`@awacloud/fw`, what backs each one and what does not. Every line names the
file that carries it.

## 1. Frozen public API

| What | Where |
|---|---|
| The surface, the SemVer rules and the deprecation cycle | [`docs/guide/stability.md`](../guide/stability.md) |
| The surface, machine-readable: 457 entry points, 208 registry modules with their API key trees, 232 declaration files hashed | [`docs/api/surface.json`](../api/surface.json) |
| The gate that keeps the package equal to it | `tests/api-surface.integration.test.js`, `bun run api:surface:check` (also run by `prepack`) |
| The API pages agree with it (every key a page lists exists) | `tests/docs-surface.integration.test.js` |
| No API object carries a `_` key; the internal slot is non-enumerable and read-only | `src/core/internal.test.js` |
| Every breaking change since the first release, with its migration | [`CHANGELOG.md`](../../CHANGELOG.md), **Breaking** |

What the gate does not see — a changed default, a new throw — is pinned by
each module's own tests against its documented behaviour.

## 2. Conformance vectors

### Cryptography

Every module that implements a FIPS, SP 800 or RFC algorithm runs the
standard's own vectors in its test file; the full matrix, with counts, is
[`src/crypto/NIST_CONFORMANCE.md`](../../src/crypto/NIST_CONFORMANCE.md):

- FIPS 180-4, 197, 202 and SP 800-38A–F, 90A: the publications' examples
  plus inline NIST ACVP sub-samples (AFT and Monte Carlo chains, byte-exact);
- FIPS 203, 204, 205 (ML-KEM, ML-DSA, SLH-DSA): the ACVP key generation,
  signature and encapsulation sets in `tests/_vectors/`, plus Wycheproof
  subsets for ML-KEM, ML-DSA and X25519;
- RFC 8032, 7748, 8439, 8017, 7693, 9106, 5869, 8018: the RFCs' test
  vectors;
- the hybrid combiners: the IETF X-Wing KAT and the LAMPS composite
  interop vectors, with a reproducible self-KAT
  ([`pqc-hybrid-evidence.md`](./pqc-hybrid-evidence.md));
- JOSE and key formats: RFC 8037 § A.4, RFC 7468 § 5.

### Codecs and compression

| Module | Standard | Vectors |
|---|---|---|
| zlib, gzip, deflate | RFC 1950, 1951, 1952 | An external oracle at test time, both directions: `node:zlib` decodes what fw writes at every level, and fw decodes what `node:zlib` writes at every level, strategy and window size; preset dictionaries, multi-member gzip and trailer checks included (`src/io/compress/oracle.test.js`) |
| brotli | RFC 7932 | `node:zlib`'s brotli, both directions: fw decodes its output at every quality, streamed in small pushes (`src/io/compress/brotli*.test.js`), and it decodes fw's output at every quality, with and without the dictionary blob (`src/io/compress/brotli-oracle.test.js`) |
| zip | APPNOTE 6.3.x | Archives written by foreign tools — CPython's `zipfile`, .NET Framework's `ZipFile`, 7-Zip and libarchive — read entry by entry, Deflate64 refused (`src/io/compress/zip-foreign.test.js`, the archives in `tests/_vectors/zip-foreign/`); fw's own archives tested, listed and extracted by Info-ZIP UnZip where installed (`src/io/compress/zip-infozip-oracle.test.js`) |
| lzw | GIF89a, TIFF 6.0 § 13, PDF `LZWDecode` | GDI+ both ways: fw decodes the LZW data of GIF (8- and 4-bit) and TIFF (indexed, RGB) images GDI+ wrote (`src/io/compress/lzw-foreign.test.js`, `tests/_vectors/lzw-foreign/`), and GDI+ reads back GIFs fw encoded (`src/io/compress/lzw-gdiplus-oracle.test.js`, Windows) |
| msgpack | MessagePack spec | kawanet/msgpack-test-suite (MIT, vendored in `tests/_vectors/msgpack-test-suite/`): every listed encoding of 85 values decodes, and fw encodes each to one of them (`src/io/codec/msgpack-suite.test.js`) |
| base64, base32, base16 | RFC 4648 § 10 | The section's vectors, encode and decode (`src/io/codec/rfc4648.test.js`) |
| crc32, adler32 | CRC-32/ISO-HDLC, RFC 1950 | The `123456789` check value; `node:zlib` as the oracle |
| cbor | RFC 8949 | Every App. A example decoded; every App. F not-well-formed item refused (`src/io/codec/cbor-rfc8949.test.js`) |
| url | WHATWG URL | The runtime's `URL` and `URLSearchParams` as the oracle on a URL and query corpus (`src/io/codec/url.oracle.test.js`) |
| unicode | UAX #15 | The runtime's `String.prototype.normalize` as the oracle, the four forms (`src/io/text/unicode.oracle.test.js`) |

Where the vectors are still thin:

- **zip** — no archive from Info-ZIP's `zip` writer (the station has its
  reader only), and the Win32 UnZip build ignores the UTF-8 flag, so its
  name check covers the ASCII names there;
- **adf** — no external KDBX 3.x vector (the reference implementations are
  GPL-licensed, none is vendored): the expected values are computed by an
  independent composition of the underlying AES-256 and SHA-256, which run
  their own ACVP vectors.

## 3. In production

Measured on 2026-11-11 by fetching each site's page and its entry script:
fw is identified in the served bytes by its licence banner and runtime
symbols.

| Site | What it is | How fw is served |
|---|---|---|
| `viewer.awacloud.com` | AWA Viewer, the document viewer PWA (PDF, Office, OpenDocument, Markdown) | Bundled in the app's entry script |
| `notepad.awacloud.com` | AWA Notepad, the offline plain-text editor PWA | Bundled in the app's entry script |
| `writer.awacloud.com` | AWA Writer, the DOCX / ODT word processor PWA | Bundled in the app's entry script |
| `awacloud.com` | The company website | The site's hydration script (static site generator, selective hydration) |
| `awaforge.eu` | The awaforge website | The site's hydration script |
| `towards.fr` | The towards website | The site's hydration script |

Every awa product library builds on fw as well: the office libraries (pdf,
ooxml, odf, md, fonts, oconv, oview), the SDE and SDC runtimes, site-kit,
ui-templates and graphic-anim.
