# Coverage

What `@awacloud/pdf` covers of ISO 32000-2:2020 (PDF 2.0), of the ISO
technical specifications around it and of PDF 1.7 legacy reading — chapter
by chapter, with the caveats that bound each claim.

**Prerequisites** — the package `@awacloud/pdf` (root entry, plus the
`extra/*` modules or one of the three bundles for the rows marked "via
extra"); any modern JavaScript runtime. See
[`CHANGELOG.md`](../../CHANGELOG.md) for the module list.

## Coverage — ISO 32000-2:2020

| Chapter | Domain | Coverage |
|----------|---------|-----------|
| §7.2-7.5 | Syntax (tokens, objects, xref, trailer) | **100%** read + write |
| §7.4 | Filters | Through `pdfFilterDispatch` — the path `read` uses to decode cross-reference and object streams: FlateDecode (with `/Predictor` PNG 10–15 and TIFF 2, encode and decode), ASCIIHexDecode, ASCII85Decode, RunLengthDecode; DCTDecode, JPXDecode and Crypt pass through undecoded. `/DecodeParms` reach the decoders as plain values, so a predictor is applied; only scalar entries (numbers, names, booleans, strings) survive that marshalling — a dictionary, array or indirect-reference entry reaches the decoder as `undefined`. LZWDecode and CCITTFaxDecode are **not** registered in the dispatch by default (`pdf/filter/unsupported`): decode them through `extra/legacy-deprecated-filters` (LZW via `@awacloud/fw`, a full ITU-T T.4 / T.6 CCITT codec), or add them with `register(name, impl)`. JBIG2Decode: segment headers only (`extra/jbig2-read`), no image decode |
| §7.5.7-8 | Object Stream + Cross-Reference Stream | Read: cross-reference streams, mixed `/Prev` chains and hybrid-reference files, object streams materialised on demand — both decoded through the dispatch path above, so a stream whose filter the dispatch does not register cannot be read; object streams inside an encrypted document are refused (`pdf/document/objstm-encrypted`). Write: `pdfXrefStreamWriter` emits `/Type /XRef` documents (opt-in `/ObjStm` grouping); `appendIncremental` extends a cross-reference-stream base with an uncompressed `/Type /XRef` section and refuses a hybrid-reference base |
| §7.6 | Encryption (Standard SH v4/v5/v6) | v4 (AESV2/RC4-128) + v5 (AES-256) + v6 (Algorithm 2.B) decrypt **and** encrypt, plus AES-GCM (TS 32003); encrypted write via `pdfEncryptedWriter`. On read, the handlers are called by the caller: `read` refuses an encrypted file (`pdf/document/encrypted`) unless `allowEncrypted: true`, and then returns the ciphertext as is |
| §7.7-7.8 | Document structure (Catalog, Pages, Resources) | **100%** |
| §7.11 | Embedded files + Portfolios | 100% via `embedded/` + `extra/embedded-files-portfolio` |
| §8.2-8.5 | Content streams (operators, path, painting) | ~70 operators catalogued |
| §8.6 | Colour spaces | Device + Cal* + Lab + ICCBased + Indexed + Separation + DeviceN + Pattern + NChannel (via extra) |
| §8.7 | Patterns + Shading | Types 1-7 + Function 0/2/3/4 (via extra) |
| §8.9 / §8.10 | Images + XObjects (Image + Form) | 100% typed |
| §8.11 | Optional Content | 100% + `/VE` evaluator (via extra) |
| §9.6-9.9 | Fonts (Type1/Type3/TrueType/Type0/CIDFont) | 100% typed; parsing delegated to `@awacloud/fonts` |
| §11 | Transparency (groups, soft masks, blend modes) | 100% via `extra/transparency-typed` |
| §12.3 | Outlines + Destinations | 100% |
| §12.5 | Annotations (25+ subtypes) | 100% typed |
| §12.6 | Actions (GoTo / URI / Named / Launch / …) | 9 subtypes + extras |
| §12.7 | AcroForm | Btn/Tx/Ch/Sig + appearance streams |
| §12.8 | Digital signatures | PKCS#7 detached, `/ByteRange` hardened validation, real public-key verification (RSA-PSS/ECDSA/Ed25519 — see [Crypto](./crypto.md)), PAdES profile detection |
| §14.3 | Metadata | Info dict + raw XMP + extended XMP (via extra) |
| §14.6-14.8 | Tagged PDF + MCID resolution | 100% via `tagged/` |
| §14.11 | Prepress + Output Intents | 100% |
| Annex F | Linearization | Read: the `/Linearized` parameter dictionary is typed (`linearization/`); hint streams are not decoded. Write: `extra/linearization-write` builds the `/Linearized` dictionary and a zero-length hint-stream placeholder — `write` never produces a linearized file |

## ISO Technical Specifications

| TS | Spec | Status |
|----|------|--------|
| ISO 32001 | Digital signatures (PAdES B/T/LT/LTA) | profile detection via `extra/sig-pades` |
| ISO 32002 | Crypto computations | digest + signature OID dispatch; Ed25519 signatures use SHA-512 (RFC 8419) and their signing update declares the `ISO_` developer extension (`/ExtensionLevel 32002`) in the Catalog, with `/Version /2.0` below PDF 2.0 (EdDSA in viewers: see the [PAdES guide](./pades-integration.md)) |
| ISO 32003 | AES-GCM crypt filter | full, via `crypto/aesGcm` + `extra/sig-aes-gcm` |
| ISO 32004 | Document parts | typed read via `extra/document-parts` |
| ISO/TS 32005 (referenced; the TS text is not in the repository) | Redaction | read-side only: `annot/redact` types the Redact annotation (ISO 32000-2 §12.5.6.21), `extra/redaction-iso32005` types the apply-redaction audit record. No content is removed or redrawn. |
| ISO 14289-2 | PDF/UA-2 accessibility | linter via `extra/pdf-ua-tagged` |
| WTPDF 1.0 | Well-Tagged PDF | best-practice linter via `extra/well-tagged-pdf` |

## PDF 1.7 read tolerance

Via the `pdf-legacy` bundle:

| 1.7 feature | Status |
|-------------|--------|
| `%PDF-1.x` header | accepted on read |
| Standard SH v4 (RC4 v2/v3) | password check + string / stream decryption helpers in `extra/legacy-rc4-read`, called by the caller (see §7.6 above) |
| LZWDecode filter | wrapper over `@awacloud/fw/io/compress/lzw` in `extra/legacy-deprecated-filters`; not registered in the filter dispatch |
| XFA forms | read-only, opaque surface (`extra/legacy-xfa-read`); `write` re-emits `/XFA` as it was |
| Sound / Movie annotations | typed, read-only (`extra/legacy-deprecated-annots`); not converted to RichMedia |
| CCITTFaxDecode | full ITU-T T.4 / T.6 decode (K < 0 Group 4, K = 0 Group 3 1-D, K > 0 Group 3 mixed) via `extra/legacy-deprecated-filters` and `extra/ccitt-fax-decoder`; not registered in the filter dispatch |
| JBIG2Decode | segment headers only (`extra/jbig2-read`); its `decode` throws |

**Write** emits `%PDF-2.0` through `pdf.write`;
`pdfBuilder.setVersion()` / `writeDocument({ version })` emit the requested
header. The writer re-emits the objects of the model it is given: legacy
content read from a 1.x file is written back as it was, not converted.

## Extras (opt-in via `.use()` or a bundle)

The opt-in modules under `extra/*`, wired through [`.use()`](./extending.md) or one
of the three [bundles](../api/bundles/README.md) (`pdf-large`, `pdf-full`,
`pdf-legacy`). See [`docs/api/extra/README.md`](../api/extra/README.md) for
the full catalogue.

## Limitation: whole-buffer reading

`@awacloud/pdf` requires the complete document to be loaded in memory
(`Uint8Array`) before any `.read(...)` call. The PDF format places the
xref table **at the end of the file** (§7.5.4), so there is no upstream
streaming mode without linearization (header hint objects). Implications:

- Reading a 100 MB PDF → peak memory ≥ 100 MB (before the resolved-object
  cache).
- No `pdf.readStream(...)` API: a wrapper consuming a `ReadableStream`
  must accumulate the bytes first.
- A **linearized** file does not lift this limit: the reader still needs
  the whole buffer, and [`pdfLinearization`](../api/linearization/linearization.md)
  only types the `/Linearized` parameter dictionary.

This is a deliberate choice — an upstream streaming mode would require
either violating the xref-at-end spec requirement, or imposing the
linearization extension on write, both incompatible with a strict PDF 2.0
model that stays tolerant on read.

Hard parser quotas are configurable per resolved `pdfParser` instance
(`parserLimits`/`setParserLimits` are returned by the factory, not
top-level module exports):

```js
const parser = runtime.resolve('pdfParser');
console.log(parser.parserLimits.maxDepth);          // 200
console.log(parser.parserLimits.maxStreamBytes);    // 256 MiB
parser.setParserLimits({ maxStreamBytes: 64 * 1024 * 1024 }); // strict 64 MiB
```

## See also

- [Read pipeline](./read-pdf.md)
- [Extending](./extending.md)
- [Crypto — risks and limitations](./crypto.md)
- [CHANGELOG](../../CHANGELOG.md)
