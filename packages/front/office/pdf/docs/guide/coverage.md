# Coverage

What `@awacloud/pdf` covers of ISO 32000-2:2020 (PDF 2.0), of the ISO
technical specifications around it and of PDF 1.7 legacy reading — chapter
by chapter, with the caveats that bound each claim.

**Prerequisites** — the package `@awacloud/pdf` (root entry, plus the
`extra/*` modules or one of the three bundles for the rows marked "via
extra"); any modern JavaScript runtime. See
[`CHANGELOG.md`](../../CHANGELOG.md) for the module list.

## Coverage — ISO 32000-2:2020

This table says which parts of the standard the package implements, and
how; it is not a conformance measurement. "Typed" means the read model
gives the structure named fields; a key a typer does not name stays
available untyped (in the record's raw dictionary or `_extras`). How many of the standard's keys the typers handle,
and how the written files fare against the Arlington PDF Model, is
measured in [Measured coverage](#measured-coverage) below.

| Chapter | Domain | Coverage |
|----------|---------|-----------|
| §7.2-7.5 | Syntax (tokens, objects, xref, trailer) | Read + write |
| §7.4 | Filters | Through `pdfFilterDispatch` — the path `read` uses to decode cross-reference and object streams: FlateDecode (with `/Predictor` PNG 10–15 and TIFF 2, encode and decode), ASCIIHexDecode, ASCII85Decode, RunLengthDecode; DCTDecode, JPXDecode and Crypt pass through undecoded. `/DecodeParms` reach the decoders as plain values, so a predictor is applied; only scalar entries (numbers, names, booleans, strings) survive that marshalling — a dictionary, array or indirect-reference entry reaches the decoder as `undefined`. LZWDecode and CCITTFaxDecode are **not** registered in the dispatch by default (`pdf/filter/unsupported`): decode them through `extra/legacy-deprecated-filters` (LZW via `@awacloud/fw`, a full ITU-T T.4 / T.6 CCITT codec), or add them with `register(name, impl)`. JBIG2Decode: segment headers only (`extra/jbig2-read`), no image decode |
| §7.5.7-8 | Object Stream + Cross-Reference Stream | Read: cross-reference streams, mixed `/Prev` chains and hybrid-reference files, object streams materialised on demand — both decoded through the dispatch path above, so a stream whose filter the dispatch does not register cannot be read; the object streams of an encrypted document are decrypted when the read is given a `password` (without one, under `allowEncrypted`, they are refused: `pdf/document/objstm-encrypted`). Write: `pdfXrefStreamWriter` emits `/Type /XRef` documents (opt-in `/ObjStm` grouping); `appendIncremental` extends a cross-reference-stream base with an uncompressed `/Type /XRef` section and refuses a hybrid-reference base |
| §7.6 | Encryption (Standard SH v4/v5/v6) | v4 (AESV2/RC4-128) + v5 (AES-256) + v6 (Algorithm 2.B) decrypt **and** encrypt, plus AES-GCM (TS 32003); encrypted write via `pdfEncryptedWriter`. On read, `read` refuses an encrypted file (`pdf/document/encrypted`) unless it is given `password` — it then applies the handler itself, object by object (RC4 V=1 / V=2 through the opt-in `legacyRc4`, the AES paths optionally through `fastCipher`) — or `allowEncrypted: true`, which returns the ciphertext as is |
| §7.7-7.8 | Document structure (Catalog, Pages, Resources) | Typed read + write |
| §7.11 | Embedded files + Portfolios | Typed via `embedded/` + `extra/embedded-files-portfolio` |
| §8.2-8.5 | Content streams (operators, path, painting) | ~70 operators catalogued |
| §8.6 | Colour spaces | Device + Cal* + Lab + ICCBased + Indexed + Separation + DeviceN + Pattern + NChannel (via extra) |
| §8.7 | Patterns + Shading | Types 1-7 + Function 0/2/3/4 (via extra) |
| §8.9 / §8.10 | Images + XObjects (Image + Form) | Typed |
| §8.11 | Optional Content | Typed, plus a `/VE` evaluator (via extra) |
| §9.6-9.9 | Fonts (Type1/Type3/TrueType/Type0/CIDFont) | Typed; font programs parsed by `@awacloud/fonts` |
| §11 | Transparency (groups, soft masks, blend modes) | Typed via `extra/transparency-typed` |
| §12.3 | Outlines + Destinations | Typed |
| §12.5 | Annotations (25+ subtypes) | Typed |
| §12.6 | Actions (GoTo / URI / Named / Launch / …) | 9 subtypes + extras |
| §12.7 | AcroForm | Btn/Tx/Ch/Sig + appearance streams |
| §12.8 | Digital signatures | PKCS#7 detached, `/ByteRange` hardened validation, real public-key verification (RSA-PSS/ECDSA/Ed25519 — see [Crypto](./crypto.md)), PAdES profile detection |
| §14.3 | Metadata | Info dict + raw XMP + extended XMP (via extra) |
| §14.6-14.8 | Tagged PDF + MCID resolution | Typed via `tagged/` |
| §14.11 | Prepress + Output Intents | Typed |
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

<!-- office-scorecard:begin (generated by `bun cli.ts office-scorecard render`; do not edit by hand) -->

## Measured coverage

Generated from `coverage/scorecard.json` (format `office-scorecard/v1`) in the repository, written by the unpublished tool `tools/office-scorecard`. Each figure names its suite and version, the UTC day and the commit measured, and the command that replays it; a figure is what was measured on that suite, not a claim of conformance to a standard. Low results are published as measured.

### Code coverage

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| `bun-coverage-src` bun 1.3.13 | lines 97.82 %, functions 96.08 % (mean of 130 source files) | the coverage gate's model over the declared basis (src/**) | 2026-10-26, `976d3b35e` | `bun cli.ts office-scorecard axis-a --pkg pdf` |

### Conformance suites

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`verapdf-read`](https://github.com/veraPDF/veraPDF-corpus/tree/v1.28.1) v1.28.1 | 906 / 906 | read(bytes) of the base reader returns without throwing and the document has at least one page; every file counts, -pass- and -fail- alike (their names are PDF/A or PDF/UA verdicts the reader does not judge) | 2026-11-11, `8ca1d4196` | `bun cli.ts office-scorecard axis-b --suite verapdf-read` |
| [`verapdf-read-password`](https://github.com/veraPDF/veraPDF-corpus/tree/v1.28.1) v1.28.1 | 906 / 906 | read(bytes, { password: '' }) of the base reader returns without throwing and the document has at least one page: the verapdf-read check with the reader's opt-in password, the empty user password, which opens an encrypted file that has none; every file counts | 2026-11-11, `8ca1d4196` | `bun cli.ts office-scorecard axis-b --suite verapdf-read-password` |
| [`verapdf-roundtrip`](https://github.com/veraPDF/veraPDF-corpus/tree/v1.28.1) v1.28.1 | 906 / 906 | read, write, then read again succeeds and keeps the page count; every file counts | 2026-11-11, `8ca1d4196` | `bun cli.ts office-scorecard axis-b --suite verapdf-roundtrip` |
| [`pdf-differences`](https://github.com/pdf-association/pdf-differences/tree/907fe96e52b73e491489eee545c47b119bf9989b) pdf-differences@907fe96e5 | 13 / 13 | per file, the base reader returns what the case expects: PDF-version — doc.version is the header 1.4 and doc.catalog.version the newest catalog 1.6 (the reader exposes both, computes no effective version); UnknownFilter-xrefstm, -Linearized and -OutlineObjStm — read rebuilds the unusable cross-reference chain (the default since @awacloud/pdf 2.0.0), returns the page and records pdf/document/xref-rebuilt in losses; six other UnknownFilter files — read returns the page and every in-use object resolves and decodes or throws a typed pdf/ error, at least one throwing; InlineAbbreviations — 8 inline images, each decoding with the abbreviated keys first to the same 600 bytes. Painting cases (content streams are parsed, not rendered), page labels (carried raw) and the two real-world files (not PDF Association works, issue undisclosed) are skipped; 24 cases not run, each with its reason in the scorecard | 2026-11-11, `ded8d48a9` | `bun cli.ts office-scorecard axis-b --suite pdf-differences` |
| [`arlington-read-keys`](https://github.com/pdf-association/arlington-pdf-model/tree/c48b363e9b78902deea03e958693c09339248a3a/tsv/latest) arlington@c48b363e9 | 3355 / 3357 | per named key of each Arlington dictionary or stream object (ISO 32000-2 keys; extensions not adopted by 2.0 skipped): a dictionary holding every key with a value of its first Arlington type is given to the pdf typers bound to the object (hand table, core and opt-in extras); the key is handled when a bound typer returns and leaves it out of the record's _extras, or, for a typer with no _extras channel, returns something else once the key is removed or nulled; 364 objects measured, 364 with a typer, 0 without (their keys count as not handled); arrays, maps and objects with no ISO 32000-2 named key are skipped; 308 cases not run, each with its reason in the scorecard | 2026-11-06, `48076f3ed` | `bun cli.ts office-scorecard axis-b --suite arlington-read-keys` |
| [`arlington-read-keys-surfaced`](https://github.com/pdf-association/arlington-pdf-model/tree/c48b363e9b78902deea03e958693c09339248a3a/tsv/latest) arlington@c48b363e9 | 3350 / 3357 | per named key of each Arlington dictionary or stream object (ISO 32000-2 keys; extensions not adopted by 2.0 skipped): a dictionary holding every key with a value of its first Arlington type is given to the pdf typers bound to the object (hand table, core and opt-in extras); the key is handled only when it reaches the typed record: removing it, or nulling it, changes what a bound typer returns, the record compared without raw, the input copies and _extras (a key a typer lists as known but keeps only in raw does not count — the difference with arlington-read-keys); 364 objects measured, 364 with a typer, 0 without (their keys count as not handled); arrays, maps and objects with no ISO 32000-2 named key are skipped; 308 cases not run, each with its reason in the scorecard | 2026-11-06, `48076f3ed` | `bun cli.ts office-scorecard axis-b --suite arlington-read-keys-surfaced` |
| [`arlington-write-conformance`](https://github.com/pdf-association/arlington-pdf-model/tree/c48b363e9b78902deea03e958693c09339248a3a/tsv/latest) arlington@c48b363e9 | 583 / 583 | per key instance of the documents pdfBuilder and pdf.write write (builder-blank, builder-standard-14, builder-standard-14-metrics, builder-embedded, builder-image, builder-embedded-cff, write-standard-14, write-embedded, write-embedded-cff; 131 dictionaries and streams reached from the trailer through the Arlington links): a key present passes when its object lists it, its SinceVersion holds for PDF 2.0, its value has one of the key's types valid in 2.0 and, when that type's possible values are literals, one of those valid in 2.0; every key required for 2.0 and absent (inherited keys looked up the /Parent chain) is a failing case; fn: predicates are evaluated only for versions, TRUE / FALSE, \|\| and && (fn:Extension false) — the others are not evaluated: 37 passing instances carry one, and an absent key required by one is skipped; IndirectReference, SpecialCase, DefaultValue and deprecation are not checked; array positions and map entries are walked, not counted; 41 cases not run, each with its reason in the scorecard | 2026-11-13, `430ab6ec9` | `bun cli.ts office-scorecard axis-b --suite arlington-write-conformance` |
| [`pdf-differences-recover`](https://github.com/pdf-association/pdf-differences/tree/907fe96e52b73e491489eee545c47b119bf9989b) pdf-differences@907fe96e5 | 13 / 13 | the files and expectations of pdf-differences, each read with { recoverXref: true } (the default since @awacloud/pdf 2.0.0): the cross-reference table is rebuilt from the bytes when its chain cannot be used; UnknownFilter-xrefstm, -Linearized and -OutlineObjStm — read returns the page and records pdf/document/xref-rebuilt in losses; every other file — the pdf-differences expectation, unchanged. The same files are skipped; 24 cases not run, each with its reason in the scorecard | 2026-11-11, `ded8d48a9` | `bun cli.ts office-scorecard axis-b --suite pdf-differences-recover` |
| [`verapdf-lint`](https://github.com/veraPDF/veraPDF-corpus/tree/v1.28.1) v1.28.1 | 787 / 787 | each file of the PDF/A and PDF/UA profile folders is read with pdf.read (password '' when encrypted) and linted by validatePdfABasics (its folder's profile) or validatePdfUa (part 1 or 2); it passes when, on the rules that linter checks for the profile, the rules it fails equal those veraPDF 1.30.3 (awa-oracle-verapdf:1.30.3, the folder's --flavour) fails, and it reports no error outside them; a file veraPDF cannot process, or pdf cannot read, fails (oracle image sha256:a590632ce3fca5658b30c7173b39a2764e6dd653a719dac51c02ef20f57b3a89) | 2026-11-03, `cf829daec` | `bun cli.ts office-scorecard axis-b --suite verapdf-lint` |
| [`arlington-write-conformance-legacy`](https://github.com/pdf-association/arlington-pdf-model/tree/c48b363e9b78902deea03e958693c09339248a3a/tsv/latest) arlington@c48b363e9 | 523 / 539 | per key instance of the documents pdfBuilder (every Standard 14 face with standard14: false, the 1.x output) and pdf.write write (builder-blank, builder-standard-14, builder-standard-14-metrics, builder-embedded, builder-image, builder-embedded-cff, write-standard-14, write-embedded, write-embedded-cff; 127 dictionaries and streams reached from the trailer through the Arlington links): a key present passes when its object lists it, its SinceVersion holds for PDF 2.0, its value has one of the key's types valid in 2.0 and, when that type's possible values are literals, one of those valid in 2.0; every key required for 2.0 and absent (inherited keys looked up the /Parent chain) is a failing case; fn: predicates are evaluated only for versions, TRUE / FALSE, \|\| and && (fn:Extension false) — the others are not evaluated: 33 passing instances carry one, and an absent key required by one is skipped; IndirectReference, SpecialCase, DefaultValue and deprecation are not checked; array positions and map entries are walked, not counted; 41 cases not run, each with its reason in the scorecard | 2026-11-13, `430ab6ec9` | `bun cli.ts office-scorecard axis-b --suite arlington-write-conformance-legacy` |

### Output validity, judged by an external validator

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`verapdf-pdfa`](https://github.com/veraPDF/veraPDF-library/tree/df51e09dece1d6c11c360edd3b8b0635ef966c47) verapdf@1.30.3 | 14 / 14 | each document is written claiming PDF/A-4 or PDF/A-2b (pdfBuilder's builder({ pdfA }), oconv fromMd with opts.pdf.pdfA and its default faces); it passes when veraPDF 1.30.3 reports no failed rule and no exception for it under the profile it claims, and pdf's validatePdfABasics of the read document with that profile reports no error; a document its writer refuses fails; documents: 14 (14 written, 0 round trips) | 2026-11-13, `430ab6ec9` | `bun cli.ts office-scorecard axis-c --suite verapdf-pdfa` |
| [`verapdf-pdfua`](https://github.com/veraPDF/veraPDF-library/tree/df51e09dece1d6c11c360edd3b8b0635ef966c47) verapdf@1.30.3 | 12 / 12 | each document is written claiming PDF/UA-1 or PDF/UA-2 (pdfBuilder's builder({ pdfUA, lang }) and its structure API, oconv fromMd with opts.pdf.pdfUA, opts.pdf.lang and its default faces); it passes when veraPDF 1.30.3 reports no failed rule and no exception for it under the part it claims, and pdf's validatePdfUa of the read document with that part reports no error; a document its writer refuses fails; documents: 12 (12 written, 0 round trips) | 2026-11-04, `f7adbc8aa` | `bun cli.ts office-scorecard axis-c --suite verapdf-pdfua` |

### Robustness on wild and pathological inputs

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`pdfium-resources`](https://pdfium.googlesource.com/pdfium/+/7c55203ed66b0461378323e3fcf2efaf76755241/testing/resources/) pdfium@7c55203ed66b | 239 / 239 ok | per file, pdf.read then every content stream of every page resolved, decoded and parsed to operators; ok when it returns or throws an error of the package's own hierarchy (PdfError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-11, `83906e876` | `bun cli.ts office-scorecard axis-d --suite pdfium-resources --container` |
| [`qpdf-qtest`](https://github.com/qpdf/qpdf/tree/4eba95899886e851cc41d76886483b347612f2a8) qpdf@v12.4.2 | 639 / 639 ok | per file, pdf.read then every content stream of every page resolved, decoded and parsed to operators; ok when it returns or throws an error of the package's own hierarchy (PdfError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-11, `5ecd33e36` | `bun cli.ts office-scorecard axis-d --suite qpdf-qtest --container` |
| [`qpdf-fuzz`](https://github.com/qpdf/qpdf/tree/4eba95899886e851cc41d76886483b347612f2a8) qpdf@v12.4.2 | 78 / 78 ok | per file, pdf.read then every content stream of every page resolved, decoded and parsed to operators; ok when it returns or throws an error of the package's own hierarchy (PdfError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-11, `c4d742d5c` | `bun cli.ts office-scorecard axis-d --suite qpdf-fuzz --container` |
| [`safedocs-0000`](https://digitalcorpora.org/corpora/file-corpora/cc-main-2021-31-pdf-untruncated/) cc-main-2021-31-pdf-untruncated@0000 | 1000 / 1000 ok | per PDF of the ZIP, pdf.read then every content stream of every page resolved, decoded and parsed to operators; ok when it returns or throws an error of the package's own hierarchy (PdfError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-11, `423c4bf2d` | `bun cli.ts office-scorecard axis-d --suite safedocs-0000 --container` |
| [`stressful-batch5`](https://labs.pdfa.org/stressful-corpus/pdfs_202011/batch5.tgz) stressful-pdf-corpus@pdfs_202011/batch5 | 6119 / 6119 ok | per PDF of the Stressful PDF Corpus batch5.tgz, pdf.read (a file over the 1 GiB cap read through a file byte source) then every content stream of every page resolved, decoded and parsed to operators; ok when it returns or throws an error of the package's own hierarchy (PdfError) within the budget; a failure is an untyped throw, a hang, memory past the cap or a crash of the child; budget: 10 s per case for an input up to 10 MB, plus 1 s per further MB (hard cap twice the budget); 1 GiB peak memory | 2026-11-11, `b7545cfb7` | `bun cli.ts office-scorecard axis-d --suite stressful-batch5 --container` |

### Leaderboards

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | 0.9466 | mean over the 14 documents of the normalised Indel similarity (2·LCS / (\|a\| + \|b\|), over code points) between the ground truth and the plain text of pdf's pdfPageText.pageText (no OCR, default options, its pages joined by '\n'), 0–1 | 2026-11-10, `3eeb41118` | `bun cli.ts office-scorecard axis-e --suite pypdf-benchmarks-text` |

### Other projects on the same suites

Figures other projects publish (or that their own test data fixes, marked derived), on the same suite and version as an entry above, with where and when they were read.

| Suite | Project | Result | Source | Read on |
|---|---|---|---|---|
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | pypdfium2 5.13.0 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.9522 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | pypdf 6.19.0 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.9486 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | PyMuPDF 1.28.2 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.9423 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | Tika 3.3.2 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.9306 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | pdftotext 0.86.1 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.9019 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | pdfminer.six 20260107 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.8793 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |
| [`pypdf-benchmarks-text`](https://github.com/py-pdf/benchmarks/tree/778e6c95a643a5fb0511d327a86bc5b06802af50) py-pdf/benchmarks@778e6c95a | pdfplumber 0.11.10 (the benchmark's run of 2026-10-02, mean of its score cache) | 0.7393 | [source](https://raw.githubusercontent.com/py-pdf/benchmarks/778e6c95a643a5fb0511d327a86bc5b06802af50/cache.json) | 2026-11-10 |

<!-- office-scorecard:end -->
