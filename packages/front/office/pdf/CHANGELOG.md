# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Spec reference: ISO 32000-2:2020 (PDF 2.0). Legacy read tolerance:
ISO 32000-1:2008 (PDF 1.7).

## [Unreleased]

## [1.0.0] - 2026-10-07

### Added

- **Core surface (L0)** — typed object graph + classical xref + page-tree
  walker. `pdfErrors` exposes `PdfError`, `ParseError`, `RenderError`,
  `ContractError`, `EncryptionError`; every throw in the package uses these
  classes with a kebab-case, namespaced `code` and a structured `context`.
  `pdfTokenizer` (binary lexer, ISO 32000-2 §7.2), `pdfParser`/`pdfParserObj`/
  `pdfParserStream` (typed object parser, §7.3 — `null`/`bool`/`int`/`real`/
  `name`/`string`/`array`/`dict`/`ref`/`stream`), `pdfXref` (classical xref,
  §7.5.4), `pdfTrailer`, `pdfCatalog` (§7.7.2), `pdfPages` (balanced
  page-tree walker, cycle + depth detection), `pdfPage` (§7.7.3.3),
  `pdfDocument` (top-level reader, `/Prev` xref chaining). Top-level `pdf`
  factory exposes `.read()`, `.header()`, `.use(...)` (idempotent by name),
  `.usedExtension()`, `.write()`.
- **Writer + filters (L1)** — `pdfSerializer` (typed-object → bytes,
  canonical real-number formatting, `#xx` name escapes, automatic hex form
  for binary strings), `pdfWriter` (`writeDocument(...)` emits the header it
  is given, `%PDF-2.0` by default),
  `pdfBuilder` (constructive DSL — `addPage`/`addContent`/`addFont`/
  `addMetadata`/`setVersion`/`setId`/`.build()` — builds a document
  from-scratch with no `pdf.read()` upstream). Five filters: `pdfFlate`
  (delegates to `@awacloud/fw/io/compress/zlib`, full `/Predictor` PNG (10–15,
  incl. optimum) + TIFF (2) encode **and** decode), `pdfAsciiHex`,
  `pdfAscii85` (incl. `z` shorthand + `~>` EOD), `pdfRunLength`,
  `pdfFilterDispatch` (`/Filter`+`/DecodeParms` chain walker, abbreviation
  table, DCT/JPX passthrough). Compressed-object readers `pdfObjStream`
  (§7.5.7) and `pdfCrossRefStream` (§7.5.8).
- **Content streams + fonts + AcroForm (L2)** — `pdfContentStream` (~70
  operators per ISO 32000-2 Table 60, inline-image `BI…ID…EI` capture),
  `pdfContentOps` (operator catalogue), `pdfGraphics` (`GStateStack`,
  `q`/`Q`, CTM), `pdfText` (Td/TD/Tm/T* tracking, `extractText`),
  `pdfColor`, `pdfImages` (XObject typing), `pdfResources` (page-tree
  parent-chain resolution). Font glue to `@awacloud/fonts`: `pdfFont` (every
  ISO subtype), `pdfFontEncoding`, `pdfType3`, `pdfFontEmbed` (single
  adapter to `@awacloud/fonts/embed-pdf` for subset embedding). AcroForm
  baseline: `pdfAcroForm`, `pdfFieldTree`, `pdfButtonField`, `pdfTextField`,
  `pdfChoiceField`, `pdfSignatureField`, `pdfAppearance`.
- **Annotations, tagged PDF, OCG, outlines/actions/destinations, embedded
  files, linearization, metadata, prepress, associated files (L3)** —
  `pdfAnnot` orchestrator + 12 subtype typers (Text, Link, FreeText,
  shape family via `pdfShapeAnnot`, markup family via `pdfMarkupAnnot`,
  Ink, Stamp, FileAttachment, Widget, Popup, Projection, Redact —
  ISO 32005). `pdfStructTree`/`pdfStructElement`/`pdfRoleMap`/
  `pdfParentTree`/`pdfClassMap`/`pdfMarkedContent` (StructTreeRoot
  walking, heterogeneous `/K` children, RoleMap + Namespaces per Table
  364–365, MCID resolution + extraction). `pdfOCG`/`pdfOCConfig`.
  `pdfOutline`, `pdfDestination`, `pdfAction` + GoTo/GoToR/GoToE/URI/
  Named/Launch typers. `pdfFileSpec`/`pdfEmbeddedFile`/`pdfCollection`
  (PDF Portfolio). `pdfLinearization` (types the `/Linearized` parameter
  dictionary, read-only). `pdfInfo`/`pdfXmp`.
  `pdfOutputIntent`/`pdfPageBoundary` (PDF/A, PDF/X, PDF/E; effective
  Crop/Trim/Bleed/Art box resolution). `pdfAssociatedFiles` (`/AF` +
  `/AFRelationship`, PDF 2.0).
- **Encryption, decrypt + encrypt (L3)** — `pdfSecurity` (Security Handler
  dispatcher), `pdfStandardV4` (PDF 1.6/ISO 32000-1 §7.6.3 — AESV2
  AES-128-CBC and V2 RC4-128, `/O`/`/U` derivation, per-object key
  derivation, string/stream/embedded-file encrypt **and** decrypt
  round-trip), `pdfStandardV5` (PDF 1.7 — AES-256-CBC + SHA-256),
  `pdfStandardV6` (PDF 2.0 — Algorithm 2.B hardening loop + Algorithm 8
  FEK unwrap, SHA-256/384/512 selection), `pdfPermissions` (`/Perms`
  Algorithm 13), `pdfAesGcm` (TS 32003 AES-GCM crypt filter, decode
  **and** encode), `pdfEncryptedWriter` (`writeDocument`-style encrypted
  write path — V4/V5 R=5/V6 R=6, `/CFM AESV4` GCM opt-in). All crypto via
  `@awacloud/fw/crypto/*` (pure JS, worker-safe). `read` does not decrypt:
  it refuses an encrypted file unless `allowEncrypted: true` is passed, and
  the handlers are then called by the caller.
- **Digital signatures, verify + generate** —
  `pdfSignature`/`pdfByteRange`/`pdfTimestamp`/`pdfCertChain`/
  `pdfDssBuilder`: Sig/DocTimeStamp typing, PKCS#7 detached blob locator,
  ByteRange compute/extract, RFC 3161 TSP parser, X.509 cert chain
  extraction (CMS SignedData + PEM), structural chain ordering check, DSS
  dict typing. **`verifySignature(...)` performs full public-key
  verification** — `verifyPk` wires RSA-PSS (PKCS#1 v1.5 refused per fw
  policy), ECDSA (P-256/P-384/P-521), Ed25519; the result carries
  `verified: true` (alias `valid`), `pkVerified: true`, `computedDigest`
  when the digest chain and PK-verify both succeed — the digest-only
  structural pass this superseded is gone (see Security).
  **`pdfSign.sign(pdfBytes, opts)`** generates PAdES signatures at all
  four levels: **B** (single embedded PKCS#7, no TSA), **T** (adds an
  RFC 3161 timestamp token via a caller-supplied
  `opts.tsaSign({ digest, hashAlg })` callback), **LT** (appends a `/DSS`
  dict with certs via `pdfIncrementalWriter`), **LTA** (appends a
  `/DocTimeStamp` on top of the LT bytes). `verifyAllSignatures` /
  `validateBLtaChain` round-trip a full B→T→LT→LTA chain end-to-end
  (`tsaVerified`/`imprintVerified` on the reconstructed `DocTimeStamp`).
  `validateDocMdp(ref)` validates MDP `/P` 1/2/3 + `/DigestMethod` +
  `/V` `1.2`/`2.2` tolerance. Algorithms: RSA-PSS, ECDSA, Ed25519 across
  both verify and sign.
- **Constructive + incremental writers** — `pdfIncrementalWriter`
  .`appendIncremental(pdfBytes, updates)` emits `originalBytes ‖
  updatedObjs ‖ xref ‖ trailer ‖ %%EOF` with a `/Prev` chain (the
  mechanism `pdfSign`'s LT/LTA levels build on). `pdfXrefStreamWriter`
  (`src/document/xrefStreamWriter.js`) implements
  `writeXrefStreamDocument(model, opts)` — native `/Type /XRef` emission
  (PDF 1.5+/2.0) with an opt-in `useObjStm` grouping non-stream indirects
  into compressed `/Type /ObjStm` wrappers (§7.5.7). It is registered in
  `src/main.js` `modules`, re-exported by name from the root entry, and
  ships in every Read+Write `dist/` root.
- **Parser hardening** — `parserLimits` (`maxDepth: 200`,
  `maxArrayLen: 1_000_000`, `maxStreamBytes: 256 MiB`), adjustable at
  runtime via `setParserLimits(partial)`; `findEndstream` accepts an
  explicit `maxScanBytes`.
- **Shared helper factory `pdfShared`** (`src/_shared/index.js`) —
  canonical magic bytes (`HEADER_PREFIX`, `EOF_MARKER`, `BINARY_MARKER`),
  frozen `ASCII` byte-constant table, character-class predicates per
  §7.2 (`isWs`/`isEol`/`isDigit`/`isHex`/`isDelim`/`isRegular`/
  `hexNibble`), the `HEX_LO` lookup table, codec instances and wrappers
  (`encodeAscii`/`decodeUtf8`/`decodeUtf8Lenient`/`decodeLatin1`), byte
  helpers (`pad10`/`hexLit`/`bytesEqual`/`concatBytes`). `pdfTokenizer`
  and the top-level `pdf` declare it as a dependency; the filters, the
  writer and the serializer still carry their own inline copies of some of
  these helpers. `pdfSigOids` consolidates the OID → dispatch-label tables
  (`DIGEST_OIDS`, `SIG_DISPATCH_OIDS`, `KEY_ALG_OIDS`,
  `SIG_ALG_OIDS_VERBOSE`, `OID_TST_INFO`, `OID_AA_TIMESTAMP`, `shortOid`)
  previously duplicated across `signature.js`/`timestamp.js`/`certChain.js`
  into one factory, which all three now declare as a dependency.
- **Coverage extras** (opt-in, the `extras` array of `src/main.js` — 32
  modules under `src/extra/` — tree-shaken when unused) reach the PDF 2.0
  long-tail + PDF 1.7 read tolerance:
  **P0** (common) — `content-ops-extended`,
  `font-cid-typed`, `font-color-tagging`, `tagged-pdf-typed`,
  `annot-extended`, `pdf-a-output-intent`, `pdf-ua-tagged`. **P1**
  (extended) — `form-actions-extended`, `color-spaces-extended`,
  `shading-typed`, `transparency-typed`, `sig-pades`, `sig-aes-gcm`,
  `document-parts` (ISO TS 32004), `redaction-iso32005`,
  `pdf-x-prepress`, `well-tagged-pdf` (WTPDF 1.0),
  `optional-content-extended`, `embedded-files-portfolio`,
  `associated-files`, `xmp-extended`. **P2** (tail) —
  `linearization-write` (builds the `/Linearized` dictionary and a
  zero-length hint-stream placeholder; it does not produce a linearized
  file), `3d-richmedia`, `jbig2-read` (segment-header enumeration, decode
  intentionally not implemented), `legacy-xfa-read`,
  `legacy-rc4-read` (RC4 known-answer-test verified),
  `legacy-deprecated-filters` (LZWDecode via fw + DCT/JPX passthrough;
  CCITTFax delegates to the sibling `ccitt-fax-decoder` codec — see
  below), `legacy-deprecated-annots` (Sound/Movie/Screen typing). **P3**
  (misc) — `misc` (SpiderInfo/Threads/Legal/Requirements/NeedsRendering),
  `info-dict-deprecated` (Info dict lint). Plus two modules added after
  the initial P0–P3 pass: **`pdf-sandbox`** (`pdfSandbox.lintActions(...)`
  — classifies `/Launch`/`/JavaScript`/`/SubmitForm`/`/ImportData`/`/URI`,
  bundled opt-in via `pdf-full`) and **`ccitt-fax-decoder`** (a **full
  ITU-T T.4/T.6 codec**, encode + decode, for K<0 Group 4, K=0 Group 3
  1D, K>0 Group 3 mixed — split out once the original header-only stub
  was completed; consumed by `legacy-deprecated-filters` as a
  dependency, and covered by both suites' tests). The legacy decoders are
  called through their extras' own API; they are not registered into
  `pdfFilterDispatch`.
- **Bundles** — three ergonomic compositions of core + extras, each a
  pure fw descriptor consumed via `ModuleRuntime.resolve(...)`:
  **`pdfLargeBundle`** (`@awacloud/pdf/pdf-large`, P0+P1, the common PDF
  2.0 features), **`pdfFullBundle`** (`@awacloud/pdf/pdf-full`, +P2+P3,
  every PDF 2.0 extra), **`pdfLegacyBundle`** (`@awacloud/pdf/pdf-legacy`, +
  `legacy-*` family, reads PDF 1.7; `write` still emits a `%PDF-2.0`
  header and re-emits legacy content — XFA, RC4 encryption, LZW streams,
  Sound/Movie annotations — as it was read, without converting it). Each
  resolved bundle exposes `.read`, `.write`, `.use`, `.usedExtension`,
  `.header`, and every wired extra under its factory name; re-applying a
  bundle is a no-op. See `docs/api/bundles/README.md` for the per-bundle
  extras breakdown.
- **Pre-built bundles — two-surface `dist/`, Read and Read+Write families.**
  `tools/generate-bundles.mjs` (`bun run gen:bundles`, a thin wrapper
  around `@awacloud/tool-prebuild-generator`) emits two path-discriminated
  surfaces side by side under `dist/`: `dist/standalone/<root>.
  {js,min.js,meta.json}` (`dependencies: []`, every fw + pdf-local
  factory inlined, zero runtime registration) and
  `dist/build/<root>.{js,min.js,meta.json}` (declares the fw modules as
  dependencies, inlines only the pdf-local factories, smallest payload).
  The roots form a two-family × size matrix: the four assembly roots
  (`pdf`, `pdf-large`, `pdf-full`, `pdf-legacy`) are the **Read** family,
  and four `-rw` roots (`pdf-rw`, `pdf-large-rw`, `pdf-full-rw`,
  `pdf-legacy-rw`) form the **Read+Write** family — each the Read root's
  segment plus the write inventory, with `pdfXrefStreamWriter` shipping in
  every `-rw` root — on both surfaces, 8 roots × 2 surfaces. Strictly
  additive: adding the `-rw` roots left the four Read roots unchanged.
  `dist/build/index.js` is a barrel re-exporting the whole `@awacloud/pdf`
  namespace. `package.json` exposes `./build/*` and `./standalone/*`.
  Output is byte-deterministic across runs (no build stamp); the root
  `.gitignore`'s blanket `dist/` exclusion is re-included via the
  package's own `.gitignore` (`!dist/`+`!dist/**`). See
  [`docs/api/bundles/dist-matrix.md`](docs/api/bundles/dist-matrix.md).
- **Documentation** — `docs/README.md` top-level index; `docs/api/` one
  page per source module (core, `_shared/`, `extra/`, `bundles/`),
  following the `@awacloud/fw` module-page format; `docs/guide/` — getting
  started, read pipeline, extension hook, coverage (with `parserLimits`),
  crypto (AES-CBC malleability risk, `verified` vs `valid` semantics,
  `auditByteRange`, `pdfSandbox`), PDF 1.7 legacy reading, and PAdES
  signing and verification.
- **Tests + integration** — one sibling test file per source module,
  co-located in `src/`; integration suite under `tests/`:
  `roundtrip.integration.test.js` (wires the full stack through
  `@awacloud/fw` `ModuleRuntime`, read → write → read on fixtures sized 1–10
  pages, every `factory.toString()` transportability assertion),
  `legacy-conversion.test.js` (`%PDF-1.x` header tolerance),
  `fuzz.test.js` (empty/garbage/truncated/no-xref/bad-header inputs →
  typed `PdfError`, never a bare `Error`), `_helpers/build.js` (shared
  fixture builder). The package's coverage floor is `awa.coverageFloor` in
  `package.json`.
- **Architecture** — clean binary format (no ZIP; `%PDF-2.0` header +
  indirect objects + xref + trailer); worker-safe factories
  (`factory.toString()` serializable, no closure on mutable
  module-level state — see Changed); zero external dependency beyond
  `@awacloud/fw` + `@awacloud/fonts` (both workspace); content stream parsed to
  an operator list, not interpreted (rendering / coordinate math is
  left to the caller); fonts always delegated to `@awacloud/fonts` (even
  standard-14 metrics); AcroForm field inheritance resolved at lookup
  time, never collapsed onto children, to preserve roundtrip fidelity;
  bundle composition is layered (`pdf-full ⊃ pdf-large`,
  `pdf-legacy ⊃ pdf-full`).
- **Package surface** — `package.json` exposes:

  ```
  .                  src/main.js          5 descriptor arrays + every core descriptor by name
  ./pdf              src/pdf.js           top-level orchestrator only
  ./errors           src/errors.js        pdfErrors
  ./serializer       src/syntax/serializer.js
  ./filters/*        src/syntax/filters/*.js
  ./annot/*          src/annot/*.js
  ./tagged/*         src/tagged/*.js
  ./crypto/*         src/crypto/*.js
  ./sig/*            src/sig/*.js
  ./ocg/*            src/ocg/*.js
  ./action/*         src/action/*.js
  ./embedded/*       src/embedded/*.js
  ./metadata/*       src/metadata/*.js
  ./prepress/*       src/prepress/*.js
  ./extra/*          src/extra/*.js       the opt-in extras
  ./bundles/*        src/bundles/*.js     3 compositions
  ./pdf-large        src/bundles/pdf-large.js
  ./pdf-full         src/bundles/pdf-full.js
  ./pdf-legacy       src/bundles/pdf-legacy.js
  ./build/*          dist/build/*         two-surface prebuilt (fw-DI variant)
  ./standalone/*     dist/standalone/*    two-surface prebuilt (framework-free)
  ```

  Note: `src/document/*` (writer, builder, incremental/xref-stream
  writers, catalog, pages, resources) has no dedicated subpath export —
  reachable only through the root entry's additive named re-exports
  (below). `awa.maturity: "L4"` (the initial core surface shipped at
  L0, then progressed L0 → L1 → L2 → L3 → L4 through the factory-only
  refactor and the read/write gap closure).
- **`addFont` `encoding` option.** A non-embedded `addFont`
  spec accepts an optional `encoding` — `WinAnsiEncoding`,
  `MacRomanEncoding` or `StandardEncoding` — emitted as `/Encoding /<name>`
  after the existing keys, so a Standard-14 simple font can declare how its
  codes map to glyphs. Absent (or `undefined`) emits nothing and the bytes
  are unchanged; an unknown value, or `encoding` combined with `embedded`,
  throws `pdf/builder/bad-font` with `{ name, encoding }` in its `context`.
- **`./<family>/*.js` export twins.** All twelve wildcard families
  of the `exports` map (`./filters/*`, `./annot/*`, `./tagged/*`,
  `./crypto/*`, `./sig/*`, `./ocg/*`, `./action/*`, `./embedded/*`,
  `./metadata/*`, `./prepress/*`, `./extra/*`, `./bundles/*`) gain a
  `./<family>/*.js` twin, so a specifier written with the `.js` suffix
  (e.g. `@awacloud/pdf/extra/sig-pades.js`) resolves to the same file under
  Node and under a browser prefix import map. The existing forms are
  unchanged.
- **`pdf.write(model, opts)` options.** `strict` forwards to
  `assembleIndirects`; the lenient skip list is exposed as `skippedObjects`
  and through `onSkipped`.
- **`sign()` signs encrypted bases.** The signature field's `/T` is
  encrypted with the document key derived from `opts.password` (standard
  security handler, AESV2/AESV3); RC4 and AES-GCM bases are refused with
  typed errors. This supersedes the encrypted-base exception (signature-only
  update, no field) noted under Fixed.
- **PAdES LT and LTA on encrypted bases.** The DSS streams, the VRI
  strings and the document-timestamp field are encrypted with the document
  key; the signature `/Contents` stay clear, as the standard requires.
- **External-oracle tests.** OpenSSL-produced ECDSA and Ed25519 CMS
  signatures verify, and `sign()` output matches their structure.
- **Ed25519 signatures declare ISO/TS 32002.** The Ed25519 signing update
  re-emits the Catalog with `/Extensions` declaring the `ISO_` developer
  extension (`/ExtensionLevel 32002`, ISO/TS 32002 §4), merged with any
  existing extensions dictionary, and sets `/Version /2.0` on a document
  below PDF 2.0. A malformed `/Extensions` is refused
  (`pdf/sign/bad-extensions`). ECDSA and RSA-PSS output is unchanged.

### Changed

- **API reference pages and source comments describe each opt-in module by
  what it covers** — internal milestone labels are removed from the `extra/`
  pages and the module, crypto and signature comments.
- **Standard 14 font dictionaries are shared across pages.**
  `pdfBuilder.addFont` (non-embedded) writes one font dictionary per
  distinct `(baseFont, subtype, encoding)` and every page that uses it
  references that object. A document that repeats a font on several pages
  gets smaller: a 3-page document using 4 faces drops from 12 font
  dictionaries to 4. Documents without a repeated font are unchanged.
- **Truncated FlateDecode streams decode to their prefix.**
  `pdfFlate.decode` returns the bytes decoded before a FlateDecode stream
  ends without its final block, flagged by a non-enumerable
  `truncated: true`, instead of throwing `pdf/flate/inflate-failed`.
  Content streams of such files now extract. Other inflate errors still
  throw `pdf/flate/inflate-failed`.
- **Documentation pass.** The README follows the published-package
  layout (installation, quick start, sub-path table with targets, maturity,
  licence, project links) with executed quick-start snippets and no
  hand-typed counts; guides open with their purpose and prerequisites; the
  coverage and bundle pages state what the filter dispatch, the legacy
  extras and `write` actually do; reference pages were checked against the
  resolved module surfaces; a `pdfShared` reference page was added; links
  to the historical audit pages, which no longer ship, were removed.
- **The Read+Write prebuilt bundles include signature verification.**
  Every `-rw` root under `dist/build/` and `dist/standalone/` ships
  `pdfSignature` beside `pdfSign`, so an invoked bundle exposes
  `verifySignature` and `verifyAllSignatures`. Each `-rw` `.min.js` grows by
  about 21.8 KB (6.4 KB gzipped); the Read bundles are unchanged.
- **Dist** — dist regenerated with the licence banner: every committed
  `dist/**/*.js` / `.min.js` opens with the package's `/*! … */` legal block
  (content from the source repository's licence matrix), each `*.meta.json`
  `bytes` entry is measured on the final bytes, and there is no `builtAt`
  timestamp — `bun run gen:bundles` is byte-deterministic; the fixed
  `sign.js` (no hard-coded `/Root 1 0 R` trailer; whole-token `/ByteRange`
  gap) ships in every `-rw` bundle.
- **`/ByteRange` gap: the signer emits the whole `<…>` token; the verifier
  accepts exactly two forms.** `pdfSign.sign` (the `/Sig`, and the
  LTA `/DocTimeStamp` through the same emitter) now leaves the whole
  `/Contents <…>` token out of the signed ranges, delimiters included —
  ISO 32000-2 §12.8.3.3.1 requires the string to "fit precisely in the space
  between the ranges", and PDFBox and pyHanko emit and check that form (b).
  It previously left out the hex digits only (form a).
  `computeByteRange` takes the token span as an optional fourth argument
  (`opts.token`, new code `pdf/sig/byterange/bad-token`); its three-argument
  call is unchanged. `auditByteRange` accepts a gap that is exactly the token
  or exactly the digits, and reports which in the additive `gapForm` field
  (`'token' | 'digits' | null`); before, it accepted the token only and
  flagged `pdfSign`'s own output. `verifySignature` / `verifyAllSignatures`
  now apply that rule to every `/Sig`: any other gap gives `verified: false`
  with `gap-start-mismatch` / `gap-end-mismatch` in `errors`. This is a
  tightening — measured on 2026-09-23, the verify path had no gap check at
  all: a gap of `<` + digits, or digits + `>`, re-signed over its own ranges
  verified `true`; both are now refused. Signatures written in form (a) —
  every signed PDF committed in the repo — are not re-signed and keep
  verifying.
- **`/DocTimeStamp` `/ByteRange` gap check.** `verifyAllSignatures` applies
  the same rule to every `/DocTimeStamp`: a gap that is not exactly the
  `<…>` token or exactly the hex digits gives `verified: false` with
  `gap-start-mismatch` / `gap-end-mismatch` in `errors` (`imprintVerified`
  still reports the imprint alone), and each `timestamps[]` entry gains the
  additive `gapForm` field (`'token' | 'digits' | null`, present on every
  entry). A tightening: an off-by-one DocTimeStamp gap re-stamped over its
  own ranges verified `true` before.
- **Package contents** — the npm tarball ships `NOTICE` (dual licence +
  trademark notice, commercial-licence contact) next to `LICENSE`; the pre-publication
  checklist no longer ships. Package `description` corrected: the shipped
  signature surface covers PKCS#7/PAdES sign **and** verify.
- **`main.js` restructured as a declarative manifest** — no runtime
  bootstrap, no re-export of resolved instances, no import of built
  bundles. Exports `fw_require` (the `@awacloud/fw` factories consumed by
  fw-bound modules, completed with every provider's transitive deps, e.g.
  `zlib`→`deflate`→`bitstream`/`huffman`, `pem`→`b64`,
  `rsa`/`ecc`→`bn`/`random`/`hex`/`hmac`), `pkg_require` (cross-package
  bridge re-exporting `@awacloud/fonts`' own `fw_require`+`modules` plus 4
  internal `embed-pdf/subsetForPdf/*` helper descriptors it doesn't itself
  export, so `pdfFontEmbed`'s full dependency graph resolves through a bare
  `@awacloud/pdf` registration), `modules` (the core factories,
  topologically ordered), `extras` (opt-in), `bundle` (3 descriptors).
  Every `modules` descriptor is additionally re-exported by binding name so
  a sibling composer (e.g. `@awacloud/oconv`, `@awacloud/facturx`) can
  resolve any pdf dependency through the bare `@awacloud/pdf` specifier —
  purely additive, the five arrays stay byte-unchanged; the `extras` and
  `bundle` descriptors are not re-exported by name.
  `tools/generate-bundles.mjs` is a thin wrapper over
  `@awacloud/tool-prebuild-generator` (see Added — two-surface `dist/`).
- **Factory-only strict** — the five error classes
  (`PdfError`/`ParseError`/`RenderError`/`ContractError`/
  `EncryptionError`) are declared **inside** `pdfErrors`'s factory body;
  every consumer declares `'pdfErrors'` as a dependency and destructures
  the classes from the injected `errors` parameter instead of a
  top-level `import { ParseError } from '../errors.js'`. Each
  `pdfErrors.factory()` call therefore creates its own classes; a
  `ModuleRuntime` caches the resolved instance, so the modules of one
  runtime share them. The transitional ESM compatibility shim that
  temporarily re-exported the five classes as named bindings is fully
  retired (see Removed). `pdfSigOids` likewise moved its 8 top-level
  `export const`/`export function` OID tables into its factory body, with
  `signature.js`/`timestamp.js`/`certChain.js` receiving them via DI.
  Across the refactor, every factory in the package is worker-safe:
  module-level constants/helpers a factory body referenced are relocated
  or inlined into that factory, so `factory.toString()` rehydrates in a
  Web Worker without resolving an external module symbol (pinned by
  `tests/roundtrip.integration.test.js`'s worker-safety assertion over
  every registered factory).
- **Bundles simplified to pure fw descriptors** — `pdfLargeBundle`/
  `pdfFullBundle`/`pdfLegacyBundle` are `{ name, dependencies, factory }`
  descriptors whose factory wires each resolved extra into the core
  `pdf` via `.use({ name, register })` and returns the enriched
  instance; consumption is exclusively `ModuleRuntime.resolve(...)`
  (see Removed for the retired imperative builders).
- **`verifySignature(...)` result shape (breaking)** — carries
  `verified`, `valid` (alias, mirrors `verified`), `pkVerified`,
  `computedDigest`, in place of the earlier structural-only
  `{ valid: errors.length === 0, errors, signerCerts, hashAlg,
  signatureAlg }`. See Security for the vulnerability this closes.
  `pdfSignature.dependencies` gained `'bitArray'`.
- **Error codes namespaced by origin** — granular kebab-case codes
  (`pdf/flate/bad-predictor`, `pdf/sig/byterange/*`, `pdf/parser/*`, …)
  replace earlier placeholder-style codes; every raised error carries a
  structured `context`. `pdf/ts/parse` and `pdf/ts/parse-failed` records
  keep the underlying error as `cause`; a `pdf/sig/digest-failed` record is
  `{ code, message }`, with the underlying error's message appended to
  `message`.
- **Hash streaming for `/ByteRange`** — `verifySignature` uses
  `hashMod.fn` + `update`/`finalize` when `bitArray` is available,
  avoiding an `O(document size)` intermediate buffer allocation;
  falls back to `hashMod.hash(...)` otherwise.
- **`standardV6` scratch buffer** — the hardening loop (Algorithm 2.B)
  reuses a scratch buffer for AES-128 key scheduling instead of
  allocating per round.
- **Packaging** — `awa.maturity` progressed `L0` → `L1` → `L2` → `L3` →
  `L4`; `package.json` carries `description`, `keywords`, `engines`,
  `sideEffects: false`, and the legal and project metadata (`license`
  `AGPL-3.0-only`, `author`, `repository`, `bugs`, `homepage`); `LICENSE`
  and `NOTICE` ship in the tarball.
- **`sign()` documentation.** The `sign()` JSDoc lists every option the
  body reads.
- **Ed25519 viewer support documented.** Adobe Acrobat Reader does not
  validate Ed25519 (EdDSA) signatures, including OpenSSL-produced ones;
  OpenSSL 3.5 and later verify them. The PAdES guide recommends ECDSA P-256
  where Acrobat must validate the signature, and its algorithm claim row
  carries that caveat.

### Deprecated

- **`valid` on signature verification results.** The `valid` field of
  `verifySignature` / `verifyAllSignatures` results (signatures and
  document timestamps) is deprecated: read `verified`. It carries the same
  value and is kept for compatibility.

### Fixed

- **Identity crypt filters on V=5 mean no encryption.** On V=5 (R=5 and
  R=6) files, a `/StmF`, `/StrF` or `/EFF` named `Identity`, or absent,
  now resolves to `Identity`: those strings and streams are left as they
  are instead of being decrypted as AES-256, and `sign()` no longer
  encrypts its new strings on such files.
- **The PAdES guide's external-TSA example runs.** The `tsaSign` example
  is executed by the test suite, and the guide's verification-report
  sample shows SHA-512 for Ed25519.
- **Source comments match the code.** The comments of the legacy-filters
  extra, the writer, the filter dispatcher, the legacy bundle, `pdfShared`
  and the font-embed adapter describe the current behaviour: CCITT decoder
  delegation, header bytes, the dispatch map, no conversion on write, and
  the codec helpers.
- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package now point at the public repository at this release's
  tag, so they resolve from the tarball; references to sources that are not
  published are plain-text citations.

- **`readDocument` opens PDF 1.5+ cross-reference streams and object
  streams.** The top-level reader now picks a cross-reference form per
  section: an `xref` keyword takes the classical table path, anything
  else is parsed as a `/Type /XRef` stream (§7.5.8). Mixed `/Prev`
  chains (a classical incremental section over an xref-stream base, or
  the reverse) and hybrid-reference files (a classical trailer carrying
  `/XRefStm`) resolve end to end, and objects held in a `/Type /ObjStm`
  container (§7.5.7) are materialised on demand by `doc._raw.resolve`,
  each container decoded once per document. `xref.sections[i]` gains
  `kind` (`'table' | 'stream'`) and an indirect materialised from a
  container carries `objStm`; the public `readDocument` signature and
  return shape are otherwise unchanged.
- **`/DecodeParms` reach the decoders as plain values.** Filter dispatch
  now marshals the typed dictionary (or array of dictionaries) into plain
  parameters, so a `/Predictor` (e.g. PNG predictor 12 on cross-reference
  streams) is actually applied instead of silently skipped.
- **`readDocument` survives two real-world shapes.** `/Root` is resolved
  across a chain of cross-reference streams whose sections carry it in
  different trailers (merged newest first), and a non-catalog object marked
  free but still referenced degrades to a recorded loss instead of a throw;
  the returned document gains a `losses` array for these.
  A document whose catalog itself is free is still refused.
- **Indirect page resources are resolved.** `typeResources` /
  `resolvePageResources` accept an optional `resolveRef`, so a page whose
  `/ExtGState` (or another resource category) is an indirect reference no
  longer drops the whole resource map, fonts included.
- **`appendIncremental` extends cross-reference-stream bases** with an
  uncompressed `/Type /XRef` section carrying `/Prev` and `/Root`; the
  classical-table path is byte-unchanged. A hybrid-reference base (a
  classical trailer with `/XRefStm`) is refused with
  `pdf/incremental/hybrid-base`, and a `startxref` that designates neither
  form with `pdf/incremental/unsupported-base`. `pdfXref` gains
  `readXrefStreamDict` and `buildXrefStream`.
- **Signing over cross-reference-stream and object-stream bases now yields
  a document that re-reads.** `pdfSign.sign()` appends the signature (and
  the LTA DocTimeStamp) through `pdfIncrementalWriter`, so the signature
  section follows the base's cross-reference form (table or stream) and
  carries `/Root`, `/Info` and `/ID` from the merged trailer instead of a
  hard-coded `/Root 1 0 R`. The signature takes the first object number at
  or past the merged `/Size`, so it no longer overwrites an object held in
  an object stream. At LT/LTA the Catalog is resolved through
  `readDocument` from `/Root`, whatever its number or container, instead
  of a byte scan for `1 0 obj`. A hybrid-reference base is refused
  with `pdf/incremental/hybrid-base`, and nothing is written.
  `pdfIncrementalWriter` gains `appendIncrementalWithOffsets` and
  `readBaseTrailer`, and `appendIncremental`'s output is unchanged.
  `pdfSign` gains a `pdfDocument` dependency, appended last. It is required
  only at LT/LTA and reported as `pdf/sign/no-document-reader`. Every level
  now requires `pdfIncrementalWriter`.

- **`pdfSign.sign()` registers the signature in a signature
  field.** The `/Sig` update now also writes an invisible `/FT /Sig`
  field merged with its widget (`/T Signature<n>`, `/V`, `/Rect [0 0 0 0]`,
  `/F 132`, `/P` page 1), the page 1 `/Annots` entry and the Catalog
  `/AcroForm` (`/Fields`, `/SigFlags 3`), per ISO 32000-2 §12.7.5.5, so
  viewers list the signature. The LTA `/DocTimeStamp` gets its own field.
  `pdf/sign/no-document-reader` now fires at **every** level, because the
  field needs the Catalog and page 1 — this supersedes the LT/LTA-only rule
  above. An encrypted base keeps the signature-only update (no field).
- **`assembleIndirects` reports the objects it could not
  resolve.** Read-then-write no longer drops an unresolvable object
  without a trace: every skipped `{ num, gen, code }` is listed on the
  returned array's non-enumerable `skippedObjects` property, and
  `assembleIndirects(model, { strict: true })` throws a `RenderError` coded
  `pdf/writer/unresolvable-objects` whose `context.objects` is that list.
  The default stays lenient and the output for a fully resolvable model is
  unchanged.
- **ECDSA signature value is DER.** The ECDSA CMS signature value is now
  the DER `ECDSA-Sig-Value`; the verifier accepts the DER form and the
  earlier raw r||s.
- **Ed25519 signs over SHA-512.** Ed25519 signatures use SHA-512 as
  RFC 8419 requires; `hashAlg` defaults to `sha512` for Ed25519 and any
  other value is refused (`pdf/sign/ed25519-requires-sha512`).
- **One-byte `/ToUnicode` codespace for simple fonts.** `embedSimple`
  writes a one-byte `/ToUnicode` codespace matching its WinAnsi codes.
- **Update trailers repeat `/Encrypt`.** Incremental updates written by
  `pdfIncrementalWriter` / `pdfXref.buildXrefStream` can repeat the base's
  `/Encrypt` (`opts.encrypt`); `sign()` does so over encrypted bases.
- **CMS signed attributes in DER order.** CMS signed attributes are written
  in DER SET OF order, so verifiers that re-encode them (OpenSSL with
  Ed25519) accept the signature.

### Removed

- **`pdfParserStream`**, the stream-body helpers module. No module depended
  on it and `pdfParser` carries its own helpers. It is no longer in
  `modules` and no longer a named export of `@awacloud/pdf`.
- **The `prebuilt/` bundle directory** that used to sit under
  `src/bundles/`, and `tools/generate-prebuilds.mjs`/
  `bun run gen:prebuilds` — retired in favour of the two-surface
  `dist/build/` + `dist/standalone/` convention (see Added). Exported
  factory names and resolve keys are unchanged; only the on-disk
  location and generator moved (`tools/generate-bundles.mjs`/
  `bun run gen:bundles`).
- **Imperative bundle builders** `buildPdfLarge`, `buildPdfFull`,
  `buildPdfLegacy` and the constants `PDF_LARGE_EXTRAS`,
  `PDF_FULL_EXTRAS`, `PDF_LEGACY_EXTRAS` — consumption is now
  exclusively `ModuleRuntime.resolve('pdfLargeBundle' | 'pdfFullBundle'
  | 'pdfLegacyBundle')`; the extras list lives in
  `bundleDescriptor.dependencies`.
- **Named re-exports of extras from the bundle entry points** — import
  an extra from its canonical module (`@awacloud/pdf/extra/...`), or
  register the `extras` array exported by `@awacloud/pdf` (the root entry
  does not re-export extras by name).
- **Top-level error-class named exports** (`PdfError`, `ParseError`,
  `RenderError`, `ContractError`, `EncryptionError`) from `@awacloud/pdf`/
  `@awacloud/pdf/errors`, and the transitional ESM compatibility shim that
  temporarily preserved them during the factory-only migration.
  Consumers resolve via `pdfErrors`:

  ```js
  import { pdfErrors } from '@awacloud/pdf';
  const { PdfError, ParseError, isPdfError } = pdfErrors.factory();
  ```

  or `runtime.resolve('pdfErrors')`.

### Security

- **The encrypted writer uses cryptographic randomness only.**
  `pdfEncryptedWriter` no longer falls back to `Math.random` for keys,
  salts and IVs. It uses `encrypt.randomBytes` when given, else
  `crypto.getRandomValues`; with neither it throws an `EncryptionError`
  with code `pdf/crypto/enc-writer/no-random`.
- **Signature verification — end of the silent false-positive.**
  Before public-key wiring, `verifySignature(...)` returned
  `valid: errors.length === 0` without ever invoking `rsa.pssVerify` /
  `ecc.verify` / `ed25519.verify` — a PKCS#7 structurally valid but
  cryptographically forged signature reported `valid: true` to a naïve
  consumer. `verified`/`valid` are now `true` only once the digest
  chain **and** PK-verify both succeed (see Changed).
- **`auditByteRange(...)`** (`src/sig/byteRange.js`) — public helper
  detecting six `/ByteRange` attack vectors: `self-overlap`,
  `gap-start-mismatch`, `gap-end-mismatch`, `cross-overlap`,
  `incomplete-coverage` (opt-in `requireFullCoverage`),
  `non-zero-start`. Exposed via `runtime.resolve('pdfByteRange')`.
- **Sandboxed action flag** — every typer for `/Launch`, `/JavaScript`,
  `/SubmitForm`, `/ImportData`, `/URI` adds `sandboxed: true` to its
  returned record, alongside the existing `securityWarning`, so a naïve
  consumer can't mistake a typed action record for an execution
  instruction. The opt-in `pdfSandbox` module (`pdf-full` bundle)
  additionally exposes `lintActions([...])` → `{ hasErrors,
  hasActiveContent, issues }`.
- **Parser hardening** — see Added (`parserLimits`): depth cap, array
  literal cap, stream fallback-scan quota, each raising a typed
  `pdf/parser/*` error.
- **Encryption** — Standard Security Handler V4/V5/V6 decrypt + encrypt
  (AES-128/256-CBC, and RC4-128 through the V4 handler's `V2` crypt
  filter), AES-GCM (TS 32003) decrypt + encrypt. The older RC4 revisions
  (40-bit R2, 128-bit R3) are read-only, through the opt-in
  `legacy-rc4-read` extra of the `pdf-legacy` bundle.
