# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Spec reference: ISO 32000-2:2020 (PDF 2.0). Legacy read tolerance:
ISO 32000-1:2008 (PDF 1.7).

## [Unreleased]

## [2.0.0] - 2026-11-19

### Breaking

- **`pdfBuilder` writes the Standard 14 metrics by default.**
  `addFont({ baseFont })` of a Standard 14 Type1 face with no
  `standard14` now carries `FirstChar`, `LastChar`, `Widths` and a
  `FontDescriptor`, which PDF 2.0 requires of every simple font (ISO
  32000-2 Table 109): the builder declares `@awacloud/fonts`'
  `standard14Lookup` and `encodingLookup` and uses them. Symbol and
  ZapfDingbats with an `/Encoding`, and a base font outside the 14, keep
  the legacy dictionary; `standard14: false` writes it on request. The
  standalone write bundles carry the two lookups (about 33 KB minified);
  the fw-variant ones declare them (next entry). pdf's Arlington write
  measure reads 387 / 387, from 327 / 343. A runtime composed without
  `pkg_require` (the README registers it) can no longer resolve
  `pdfBuilder`.

- **The fw-variant Read+Write bundles declare the `@awacloud/fonts`
  modules they use.** `@awacloud/pdf/build/pdf-rw.js`, `pdf-large-rw.js`,
  `pdf-full-rw.js` and `pdf-legacy-rw.js` no longer inline
  `standard14Lookup`, `encodingLookup` and their tables: register
  `@awacloud/fonts`' manifest on the runtime, as for the unbundled
  modules. The standalone bundles are unchanged and still need nothing.
  Each fw-variant Read+Write bundle is about 32.6 KB smaller minified
  (`pdf-rw.min.js` 226,956 → 194,324 bytes) and 60.9 KB smaller
  unminified; its `.meta.json` names the two declared modules under
  `siblingDependencies`.

- **`readDocument` opens an encrypted document with the empty password
  by default.** Read with no `password` (and without `allowEncrypted`),
  an encrypted document the empty password opens, as the user then as
  the owner, now reads, with one
  `pdf/document/opened-with-empty-password` loss carrying the permission
  bits; one it does not open still throws `pdf/document/encrypted`.
  `emptyPassword: false` keeps the 1.x refusal. `pdfMerge` refuses an
  encrypted source by name, `pdf/merge/encrypted-source`, since its
  pages would land in an unencrypted output. On the corpus, 10 of 42
  encrypted files open this way (AES), 7 more with the `legacyRc4`
  reader.

- **`readDocument` rebuilds an unusable cross-reference chain by
  default.** A wrong `startxref`, an undecodable cross-reference stream,
  no `startxref` or a trailer without `/Root` now rebuilds the table
  from the file's bytes, recorded as `pdf/document/xref-rebuilt`, unless
  `recoverXref: false`, which throws the walk's error as 1.x did. A byte
  source whose chain fails is read whole once for the rebuild, and
  `recoverXref: true` with a source no longer throws
  `pdf/document/recover-needs-bytes`. `pdfSign` and `pdfFormFill`, which
  append an incremental update, read their base with `recoverXref:
  false`. On 2,422 corpus PDFs, 27 deliberately damaged qpdf test files
  now read; no file that read changes.

### Changed

- **A composite font follows its embedded CMap.** `pdfFontDecoder`
  read a `Type0` font's glyph widths from `/W` only under `Identity-H` /
  `-V` (any other CMap gave `/DW` and `text/width-approximated`), and
  split its strings 2 bytes at a time. Under an embedded CMap stream it
  now maps each code to its CID through `@awacloud/fonts`' `cmapCid` (the
  stream's `/UseCMap` parent under it) and takes `/W` there, and reads
  the codes by the CMap's codespace when they are not all 2 bytes long:
  the decoder gains `split(bytes)` and `width(code, length)`, which
  `decodeShow` and `pdfPageText` use. A predefined CMap by another name
  keeps `/DW`. Over the reference corpus, the 10 documents with such a
  font change: their runs placed by `/W`, `text/width-approximated` gone
  from them; every other page is unchanged.

- **The TeXCMMaths fonts read as the signs they draw.** A simple font of
  the `TeXCMMathsSymbols`, `TeXCMMathsItalic` or `TeXCMMathsExtension`
  family names each glyph by a Computer Modern position, and its
  ToUnicode repeats the names: `=` was read as `¼`, `+` as `þ`, `(` and
  `)` as `ð` and `Þ`, the minus sign as U+FFFD, `/` as `=`. `pdfFontDecoder`
  now reads those three families through `@awacloud/fonts`'
  `encodingTexMath` before the ToUnicode (the glyph name gives the
  position); every other font is read as before. The decoder depends on
  `encodingTexMath`, which `@awacloud/fonts`' manifest registers.

### Added

- **`pdfPageText`'s visitor knows the losses so far.** `visit`'s `ctx`
  gains `lossCount`, the number of losses the walk has recorded before
  the operator, so a caller's own losses fall in order among the walk's,
  as `runCount` places its items among the runs.

- **Fonts with CFF outlines embed.** `pdfFontEmbed.embedSimple` and
  `embedCid` took TrueType outlines only (a CFF or CFF2 font threw
  `fonts/subset-bad-font`). They now subset any outlines and write the
  dictionaries ISO 32000-2 Table 124 asks for: a CFF font's subset is a
  `FontFile3 /OpenType` program under `/Type1` (its codes reaching their
  glyphs by name, a `/Differences` of the subset's glyph names over
  `/WinAnsiEncoding`) or a `/CIDFontType0` CIDFont (its codes the
  program's CIDs, no `/CIDToGIDMap`). A CID-keyed program (a CFF2 font's
  subset is one) has no simple form: `embedSimple` refuses it with
  `pdf/embed/cid-keyed-simple`. A TrueType font embeds as before, byte for
  byte. The builder writes a `FontFile3` stream with `/Subtype /OpenType`
  and without `/Length1`. `pdfFontEmbed` depends on `fontSfnt` and
  `fontCffProgram`, in the fonts manifest `pkg_require` carries.

- **Zapf Dingbats glyph names and the Standard 14 symbol fonts read as
  characters** (`pdfFontDecoder`). A font whose family names Dingbats
  resolves its glyph names through the ITC Zapf Dingbats Glyph List
  (`a73` → `■`), and a non-embedded `Symbol` or `ZapfDingbats` font with
  no base in `/Encoding` takes its built-in encoding (`a24` → `✘`, not
  `8`). On 2,422 corpus PDFs (first 60 pages each), the undecodable
  codes fall from 3,017 to 2,744.

- **Symbol and Wingdings private-use text read as characters**
  (`pdfFontDecoder`). A ToUnicode entry at 0xF020–0xF0FF in a `Symbol`,
  `SymbolMT` or `Wingdings` font is read again: Symbol's through
  `SymbolEncoding` and the AGL (U+F0B7 → `•`), Wingdings' for the pairs
  Word itself writes (U+F0A7 → `▪`, U+F0FC → `✓`). On 2,422 corpus PDFs
  (first 60 pages each), the private-use characters fall from 50,675 to
  438.

- **`pdfFontDecoder` reads a symbolic font's built-in encoding.** A
  symbolic `Type1` or `MMType1` font whose embedded program is `/FontFile`
  (Type 1), `/FontFile3` `Type1C`, or `/FontFile3` `OpenType` with a `CFF `
  table, and whose `/Encoding` names no base, now decodes through the
  program's built-in encoding (ISO 32000-2 §9.6.6.1), with `/Differences`
  over it. Before, `StandardEncoding` was used. pdfLaTeX's Computer Modern
  text and math, which carry no `/ToUnicode`, now come out as text: a
  comma where a semicolon came out, a period for a colon, and the minus,
  relation and Greek symbols where codes were counted undecodable. The
  decoder depends on `fontType1`, `fontCffProgram` and `fontSfnt`.

- **`pdfFormFill`, fill an AcroForm and save it.** `fill(bytes, values)`
  sets text, check-box, radio and choice fields by their full names, in
  an incremental update that keeps the prior bytes (an earlier
  signature still verifies). Each filled text field gets a generated
  appearance stream (its `/DA` font and size, one line), and the AcroForm
  gets `/NeedAppearances true`.

- **`pdfMerge`, copy pages from several documents into a new one.**
  `merge(sources, opts?)` takes each source's bytes and, optionally, the
  page indices wanted, and writes the chosen pages in order: each with
  its inherited attributes flattened and every object it reaches,
  renumbered and shared once. The sources' outlines, structure trees,
  form fields and Info are not carried; a link to a page left out loses
  its destination.

- **A read document's public reach.** `readDocument`'s result carries
  `resolve(node)` (the resolver `_raw.resolve` is), `info()` (the Info
  dictionary as decoded text, or `null`) and `pageContents(i)` (a page's
  content streams decoded and joined), so no caller needs `_raw`; `_raw`
  stays.

- **`pdfPageText`, a page text extra.** `extractPage(page, resolve,
  opts)` walks a page's content streams and returns its positioned runs
  (`text`, `x`, `y`, `xEnd`, `fontSize`, `bold`, `mcid`), its counts and
  its text losses:
  - Form XObjects are executed under cycle, depth and operator-budget
    guards;
  - `opts.cellKerns` cuts a `TJ` table row at its cell gaps;
  - `opts.visit(op, ctx)` sees every operator walked, with the CTM, the
    marked-content id, the resources in force, the form depth and the
    run count.

  `pageText(page, resolve, opts)` returns the runs joined into lines. Its
  walk is `@awacloud/oconv`'s pdf page walk without the layout opt-ins: on
  5,217 pages of 1,678 PDFs, its runs, counts and text losses equal that
  walk's. It is on `pdfFontDecoder`, so it is not in the prebuilt bundles
  either.

- **`pdfFontDecoder`, a font decoder extra.**
  `buildDecoder(fontDict, resolve)` and `decodeShow(decoder, bytes)` turn
  a Font dict's character codes into Unicode text and glyph widths:
  - text through the ToUnicode CMap, the encoding + AGL hop, or a Type 0
    font's predefined Unicode CMaps;
  - widths from `/Widths`, `/W` / `/DW`, the Standard 14 AFM widths or a
    declared fallback.

  It was moved from `@awacloud/oconv`'s pdf reader, where a copy stays
  until oconv is rebuilt on it. On 5,217 pages of 1,678 PDFs both give
  the same text items. It is registered in the extras. It is not in the
  prebuilt bundles: their generator cannot bundle a `@awacloud/fonts`
  dependency (the same gap as `pdfFontEmbed`).

- **`pdf.read` through a byte source.** `pdf.read(source, opts)` takes a
  synchronous `{ byteLength, read(offset, length) }` in place of the
  bytes. The file is read by windows: its header, its tail, each xref
  section and each object as it is resolved. A window starts at 64 KiB
  (`opts.sourceWindow`) and doubles while a parse needs it, up to the
  parser's `maxStreamBytes` plus 64 KiB (`pdf/document/source-window`).
  The result's `_raw` carries `source`; `recoverXref` needs the bytes
  (`pdf/document/recover-needs-bytes`). A `Uint8Array` reads as before.
  A 6 GB PDF of the Stressful corpus now reads within 1 GiB.

- **The Arlington tail typed.** `pdfMisc.typeSmallObject(value, kind)`
  (with `SMALL_OBJECT_KEYS`) types fifteen small objects no other typer was
  bound to: an alternate image, a page-piece data dictionary, a structure
  destination's dictionary, a fixed-print dictionary, the mark
  information, a marked-content and an object reference, a minimum bit
  depth, a namespace, a reference XObject's reference, a web capture's
  source information, a timespan, a URL alias, a user property, the
  Windows launch parameters. `pdfDocumentParts.typeDPart` copies a part's
  `/AF` (`af`), and `typePage` types `/Hid` (`hid`). The read keys of the
  Arlington PDF Model now handled: 3,355 of 3,357.
- **The public-key security handler typed.** `typeEncryptDict` types a
  public-key `/Encrypt` dictionary (no `/R`; `/R` stays required for the
  Standard handler) and its `/Recipients` (`Recipients: [Uint8Array]`). A
  new opt-in extra, `pdfCryptPublicKey` (registered by `pdf-full`), types a
  public-key crypt filter, the public-key and Standard crypt filter maps,
  and `/EncryptedPayload`. A document under the public-key handler is now
  refused by the read with `pdf/crypto/unsupported-filter` (it was
  refused with `pdf/crypto/encrypt-dict/missing-V-R`). Typing only: the
  package decrypts the Standard handler alone.
- **The builder's structure API: tagged documents.** `openElement(type,
  props?)` (`alt`, `lang`, `attributes`), `markContent()` (the current
  page's next MCID) and `closeElement()` declare the logical structure; the
  caller writes the marked content. `build()` writes the StructTreeRoot,
  the elements with their marked-content references (an MCR for another
  page), the ParentTree, the pages' StructParents and MarkInfo, and under
  `pdfUA: 2` the PDF 2.0 namespace. Misuse is a `ContractError`
  (`pdf/builder/bad-struct-type`, `bad-struct-props`, `no-open-element`,
  `open-element`). So tagged, the builder's documents conform to PDF/UA-1
  and PDF/UA-2 as veraPDF 1.30.3 judges them.
- **`builder({ pdfUA: 1 | 2, lang })`: a document claiming PDF/UA.** The
  catalog gets MarkInfo `/Marked true`, `/Lang`, ViewerPreferences
  `/DisplayDocTitle true` and an XMP packet with `pdfuaid` and the
  `addMetadata` fields (a Title required); version 1.7 (UA-1) or 2.0
  (UA-2), a trailer `/ID`, every font embedded. `pdfXmp.packet` writes
  `pdfuaid`. A bad part (`pdf/builder/bad-pdfua`), a missing language
  (`pdf/builder/pdfua-lang`) or Title (`pdf/builder/pdfua-title`), a
  `setVersion` against the part (`pdf/builder/pdfua-version`) and `pdfUA`
  with `pdfA` (`pdf/builder/pdfua-with-pdfa`) are `ContractError`s. The
  logical structure is not written yet: an untagged document so claimed
  fails only veraPDF's structure rules.
- **A font without a program is refused under `pdfA`.** `build()` throws
  `pdf/builder/pdfa-font-not-embedded` (a `ContractError`, its context
  naming the fonts) when a document claiming PDF/A registered a font with
  no embedded program; PDF/A requires every font embedded.
- **The PDF/A output intent.** Under `pdfA`, `pdfBuilder` writes the
  catalog's `/OutputIntents`: one `GTS_PDFA1` intent whose destination
  profile is a first-party sRGB ICC profile (the new `pdfSrgbIcc` module,
  generated in code from the public IEC 61966-2.1 colorimetry, no
  third-party bytes), or the caller's (`builder({ pdfA, outputIntent: {
  profile, components, identifier, info } })`; a malformed one, or one
  without `pdfA`, is a `ContractError` `pdf/builder/bad-output-intent`).
  With it, veraPDF 1.30.3 judges the builder's PDF/A-4 and PDF/A-2b
  documents — text in embedded fonts, a soft-masked image — conforming.
- **`builder({ pdfA: '4' | '2b' })`: a document claiming PDF/A.**
  `pdfBuilder` writes an XMP packet (`pdfaid` and the `addMetadata` fields)
  as the catalog's unfiltered `/Metadata`; under PDF/A-4 no trailer Info and
  version 2.0, under PDF/A-2b the Info mirrored in the XMP, version 1.7 and
  a trailer `/ID`. A `pdfA` value other than `'4'` or `'2b'`
  (`pdf/builder/bad-pdfa`) and a `setVersion` against the profile
  (`pdf/builder/pdfa-version`) are `ContractError`s. `pdfXmp.packet(fields)`
  writes the packet; `writeDocument`'s `deriveId: true` derives the `/ID`
  at any version. The output without `pdfA` is unchanged. Colours, output
  intent and fonts are not handled yet: a blank page conforms to both
  profiles, as veraPDF 1.30.3 judges it.
- **The PDF/A and PDF/UA linters read a `pdf.read` result and name the
  veraPDF rule of each finding.** `validatePdfABasics(doc, { profile })`
  (`pdfAOutputIntent`) and `validatePdfUa(doc, { part })` (`pdfUaTagged`)
  take what `pdf.read` returns — the catalog from `catalog.raw`, references
  resolved, encryption and `/P` from the trailer — as well as the hand-built
  shape they took. Each result gains `findings: [{ rule, severity, message
  }]`, `rule` the veraPDF rule id of the check for the profile (`'1b'` …
  `'4f'`) or the part (1 or 2; PDF/UA-2 is new). A profile or part out of
  range is a `ContractError` (`pdf/extra/pdfa/bad-profile`,
  `pdf/extra/pdfua/bad-part`). On a read document the linters found the
  catalog missing in every file; over the 787 PDF/A and PDF/UA files of the
  veraPDF corpus, the rules they fail now equal veraPDF 1.30.3's on those
  rules for every file.

### Fixed

- **The tarball ships the sRGB profile's provenance note.** The package's
  `files` now take `src/**/*.md`, so `src/prepress/PROVENANCE.md`, which
  `docs/api/prepress/srgb-icc.md` links, is in the npm tarball.

- **A ToUnicode entry of U+FFFD no longer hides a glyph name that
  reads.** The entry says the producer knew no character; `pdfFontDecoder` now
  reads the code through the font's encoding instead, and keeps U+FFFD
  only when that reads nothing either. With `@awacloud/fonts`' fuller
  glyph-name reading, `one.SP` reads `1` where the text had U+FFFD.

- **A stream whose `/Length` names itself no longer overflows the
  stack.** `readDocument`'s resolver reads a reference to an object it is
  already reading as null, recorded as `pdf/document/reference-cycle`,
  and the stream's data ends at its `endstream`; an object stream whose
  `/Length` names one of its members reads too. A nesting of more than 32
  objects being read throws `pdf/document/resolve-too-deep`. Found by
  qpdf's `issue-117.pdf`, which the cross-reference rebuild now reaches.

- **`Q` restores the text font.** `pdfPageText`: `q` now saves the font
  in force, its size and the leading with the CTM, `Tc`, `Tw` and `Tz`,
  and `Q` brings them back (ISO 32000-2 §8.4.1). Text drawn after a `q …
  Tf … Q`, as after a list label in a bullet font, was decoded through
  the font set inside the `q`. On 2,422 corpus PDFs (first 60 pages
  each), the undecodable codes fall from 14,410 to 3,017.

- **The PDF/UA linter's verdicts follow their rules.** A missing
  `/ViewerPreferences /DisplayDocTitle true` is an error (a "shall" of both
  parts; it was a warning); a missing catalog `/Lang` is a warning under
  PDF/UA-1, which asks only that the language be determinable (it was an
  error, wrong on 18 conforming files of the veraPDF corpus), and an error
  under PDF/UA-2; a `/Marked` held by reference is read. The PDF/A linter's
  "/MarkInfo must be a dictionary" is a warning (no PDF/A rule names it).

## [1.2.0] - 2026-11-02

### Added

- **`pdfInfo.decodeTextString(bytes)`**: decodes a pdf text string such
  as the Info `/Title` (UTF-16BE after its BOM, its language escapes
  removed; UTF-8 after its BOM; else PDFDocEncoding); anything but bytes
  throws `pdf/info/bad-text-string`. `typeInfo` still returns the strings
  as bytes.
- **`pdfXmpExtended.dcTitle(input)`**: the `dc:title` of an XMP packet —
  its `x-default` alternative, else its first, else a leaf value — which
  the leaf harvest of `parsePacket` does not reach.
- **`parseXrefTable` names the shapes it tolerated.** Its result gains
  `tolerated` (`'subsection-header-space'`, `'entry-eol-one-byte'`),
  absent for a table in the standard's shape.
- **Encrypted documents read with a password.** `read` and `readDocument`
  take `password` (a string or bytes; `''` is the empty user password):
  the Standard handler V=4 R=4, V=5 R=5 or V=5 R=6 is applied, the password
  tried as the user, then as the owner password, and every object's
  strings and stream payload are decrypted as it is read (a
  cross-reference stream, the metadata stream under `EncryptMetadata
  false` and a signature's `/Contents` stay as stored); an object
  stream is decrypted as a stream and its members read as stored. Without
  it an encrypted document still fails loud with `pdf/document/encrypted`
  — the empty password is never tried on its own. New errors on the new
  option only: `pdf/document/bad-password-option`,
  `pdf/document/bad-password`, `pdf/crypto/unsupported-filter`.
  `pdfSecurity.typeEncryptDict` accepts the typed dictionary `read` yields.
- **RC4 V=1 / V=2 read with a password, through the legacy extra.** `read`
  and `readDocument` take `legacyRc4`, the opt-in `pdfLegacyRc4Read`
  instance: under `password`, an RC4 document (R2, R3) is decrypted with it
  (the user, then the owner password). The `pdf-legacy` bundle's `read`
  passes its own. `pdfLegacyRc4Read` gains `validateOwnerPassword`. New
  error on the new option only: `pdf/document/bad-legacy-rc4-option`.
- **A fast cipher for the decrypting read, opt-in.** `readDocument` /
  `pdf.read` take `fastCipher: true` (with `password`): the key check —
  the R6 key hardening above all — and the AES-CBC string and stream
  decryption go through fw's T-table `aes.ttable.fn` instead of the
  constant-time `aes.fn` (a 30-page R6 read 0.9 s → 25 ms; a stream 0.3 →
  about 100 MB/s). Not constant-time: for a trusted, single-user host. The
  Standard handlers' read functions and `dispatchDecryptStream` take an
  optional trailing `opts`. New error on the new option only:
  `pdf/document/bad-fast-cipher-option`.
- **Cross-reference recovery, opt-in.** `readDocument` (and `pdf.read`)
  take a new `recoverXref` option: with `true`, a cross-reference chain
  the reader cannot use (a wrong offset, an undecodable cross-reference
  stream, no `startxref`, a trailer without `/Root`) is rebuilt from the
  file's bytes — object definitions in file order, object-stream
  members, the merged trailer dictionaries — and the read records
  `pdf/document/xref-rebuilt` in `losses`; `xref.sections` then holds the
  one section `{ at: null, kind: 'rebuilt', entries }`. Without the option
  every read is unchanged.
- **Standard 14 metrics in every encoding.** `pdfBuilder.addFont`'s opt-in
  `standard14` now also takes a Latin face in `MacRomanEncoding`,
  `StandardEncoding` or with no `encoding` (its built-in StandardEncoding)
  when the spec gives `encodings`, the `@awacloud/fonts` `encodingLookup`
  API: each code's width is its glyph's (the WinAnsi table's, else the
  record's `extraWidths`, else 0). Without `encodings` such a registration
  still throws `pdf/builder/bad-font`; every other output unchanged.
- **Entries the typers knew but never returned are now typed.** Each
  of these typers listed the entries as known (so they were neither
  typed nor in `_extras`, reachable only through `raw`) and now returns
  them as new optional fields, set only when the entry is present —
  numbers, integers, booleans and names by their value, strings as
  bytes, dictionaries, arrays and streams as read; a dictionary without
  them gives the record it gave before:
  - `typePage`: `lastModified`, `boxColorInfo`, `thumb`, `b`, `dur`,
    `trans`, `aa`, `pieceInfo`, `structParents`, `id`, `pz`,
    `separationInfo`, `templateInstantiated`, `presSteps`, `vp`, `af`,
    `outputIntents`, `dPart` (ISO 32000-2 Table 31);
  - `typeCatalog`: `threads`, `openAction`, `aa`, `uri`, `spiderInfo`,
    `pieceInfo`, `perms`, `legal`, `requirements`, `collection`,
    `needsRendering`, `dss`, `af`, `dPartRoot` (Table 29);
  - the four field typers: `parent`, `kids`, `tu`, `tm`, `aa` (Table 226),
    plus `da` and `q` on the button and signature fields, `dv` on the
    signature field and `rv` on the text field (Table 230);
  - `typeEmbeddedFile`: `length`, `filter`, `decodeParms`, `dl` — what
    its `bytes` are encoded with; the opt-in `typeSoundStream`: `type`,
    `length`, `filter`, `decodeParms`; `typeFontFile3OpenType`: `filter`,
    `decodeParms`;
  - `typeCollection`: `colors`, `folders`, `split`; `typeFileSpec`:
    `type`, `thumb`; `typeOutlineItem`: `se`; the opt-in
    `typeCollectionItem`, `typeCfEntry` and `typeDocMdpParams`: `type`.
- **Stream dictionary entries typed.** The core `pdfFilterDispatch`
  gains `typeStreamEntries(stream)`, for a stream or its dictionary: the
  entries every stream dictionary shares (ISO 32000-2 §7.3.8.2, Table 5)
  — `/Length` (an integer or a reference), the `/Filter` and
  `/DecodeParms` chain as read, the external-file entries `/F`,
  `/FFilter`, `/FDecodeParms`, and `/DL`. The existing functions are
  unchanged.
- **The filter decode parameters.** `typeDecodeParms(dict, filter)` on
  `pdfFilterDispatch` types the decode parameters of the Flate, LZW,
  CCITT fax, DCT, JBIG2 and Crypt filters; the decode path unchanged.
- **Viewer preferences typed.** The opt-in `pdfMisc` gains
  `typeViewerPreferences(dict)` for the catalog's `/ViewerPreferences`
  (ISO 32000-2 §12.2, Table 147): the window and display booleans, the
  page-mode, direction, area, clip and scaling names at their Table 147
  defaults when absent, `/Duplex`, `/PickTrayByPDFSize`, `/PrintPageRange`
  as `[first, last]` pairs, `/NumCopies` and `/Enforce`; every other entry
  in `_extras`. The core catalog record, which keeps the dictionary as
  read (`viewerPrefs`), is unchanged.
- **Font descriptors typed.** The opt-in `pdfFontColorTagging` gains
  `typeFontDescriptor(dict)`, a typer for the font descriptor of any
  font kind — simple, Type 3, CIDFont, or a value of a CIDFont
  descriptor's `/FD` (ISO 32000-2 §9.8, Tables 120, 122 and 123): the
  names, the family and character set strings, weight and flags, the
  bounding box, the metrics (`/Leading`, `/XHeight`, `/StemH`,
  `/AvgWidth`, `/MaxWidth`, `/MissingWidth` at their default 0 when
  absent), the font programs and `/CIDSet` (`{ num, gen }` for a
  reference), `/Style`, `/Lang` and `/FD`; every other entry in
  `_extras`. The core font typers, which return the descriptor untyped
  as `fontDescriptor`, are unchanged.
- **The font file stream keys and the font name.** `typeFontFileEntries`
  on the opt-in `pdfFontColorTagging` types a font file stream's own
  keys (`Length1`–`Length3`, `Subtype`, `Metadata`);
  `typeFontFile3OpenType` gains `length1`–`length3`; `typeStyleDict` on
  the opt-in `pdfFontCidTyped` types a CIDFont's `/Style`; the core
  `typeFont` gains `name` (`/Name`).
- **Markup and PDF 2.0 annotation entries typed.** The opt-in
  `pdfAnnotExtended` gains `typeMarkupEntries(dict)`, a companion typer
  for an annotation of any subtype: the entries PDF 2.0 adds to every
  annotation (`/ca`, `/BM`, `/Lang`, ISO 32000-2 Table 166) and, on the
  markup subtypes listed in the new `MARKUP_SUBTYPES` (§12.5.6.2
  Table 171, plus `Projection`), the markup entries of Table 172 (`/T`,
  `/Popup`, `/RC`, `/CreationDate`, `/IRT`, `/Subj`, `/RT`, `/IT`,
  `/ExData`), which the core annotation record keeps untyped in
  `_extras`. The core record and the existing typers are unchanged.
- **The annotation appearance dictionaries.** `typeAppearanceDict(dict,
  kind)` on the opt-in `pdfAnnotExtended` types the appearance
  characteristics, border style, border effect and icon fit; the line
  annotation gains `llo` and `co`, the ink annotation `path`, the
  opt-in `type3DAnnot` `3DU` and `GEO`.
- **The remaining actions.** The opt-in `typeExtendedAction` types
  Thread, Sound, Movie, RichMediaExecute, GoToDp and the PDF 1.2
  SetState and NOP; `typeAdditionalActions(dict, kind)` types the
  additional-actions dictionaries (catalog, form field, page, screen and
  widget annotation triggers). The core `typeGoTo` / `typeGoToR` read
  `SD` (`sd`).
- **The form field keys.** `typeFieldEntries(dict)` on the opt-in
  `pdfFormActionsExtended` types a field dictionary's shared keys and its
  rich text (`DS`, `RV`) beside the core field typers;
  `typeFieldLock(dict, kind)` on the opt-in `pdfMisc` types a signature
  field's lock, the FieldMDP transform parameters and the UR transform
  parameters (`urTransform`).
- **The signature and DSS dictionaries.** `typeVRIEntry(dict)` on the
  opt-in `pdfSigPades` types one VRI entry; `typeSeedValue(dict, kind)`
  and `SEED_VALUE_KEYS` type a signature field's, certificate's, `/MDP`'s
  and `/TimeStamp`'s seed value (`kind` `field`, `cert`, `mdp`,
  `timeStamp`): one field per key of its list, named after the key in
  lower case, present only when the key is; the other keys in `_extras`.
  Errors: `pdf/extra/pades/seed/not-dict`, `pdf/extra/pades/seed/kind`.
- **The signature build data.** `typeBuildData(dict, kind)` and
  `typeBuildProperties(dict)` on the opt-in `pdfSigPades` type a
  signature's `/Prop_Build` and its `Filter`, `PubSec`, `App` and `SigQ`
  entries; `typeReferenceArray`'s entries gain `digestValue` and
  `digestLocation`; the core `typeSignature` gains `type`, `changes`,
  `r` and `adbeBuild`.
- **The requirements of ISO 32000-2.** Each entry of the opt-in
  `typeRequirements` gains `type`, `v`, `penalty`, `digSig` and
  `encrypt` (present only when the key is); `REQUIREMENT_S_VALUES` holds
  the 27 requirement types of ISO 32000-2; `typeRequirementHandler(dict)`
  types a requirement handler (`type`, `s`, `script`).
- **The structure attributes of ISO 32000-2 typed.** The opt-in
  `typeStructAttribute` types the owner `NSO` (`ns` and every standard
  owner's fields), the Layout keys `TBorderStyle`, `TPadding`,
  `RubyAlign`, `RubyPosition`, `GlyphOrientationVertical`, and the
  Table's `Short`. The core `typeStructElement` reads `Ref` (`ref`).
- **The optional content dictionaries.** `typeOptionalContent(dict,
  kind)` on the opt-in `pdfOptionalContentExtended` types the optional
  content properties, the membership dictionaries and the usage
  sub-dictionaries (creator info, language, export, zoom, print, view,
  user, page element).
- **The colour and prepress dictionaries.** `typeColorPart(dict, kind)`
  on the opt-in `pdfColorSpacesExtended` types the DeviceN attributes,
  mixing hints, process and solidities, the default colour spaces and a
  dictionary of functions; `typePrepressPart(dict, kind)` on the opt-in
  `pdfXPrepress` types separations, box colour information and style,
  trap regions and the output profile reference; the opt-in
  `typeExtGState` gains `htp` (PDF 1.2's halftone phase).
- **`typeOpi(dict)`, `typeOpiDict(dict, version)` and `OPI_KEYS` on the
  opt-in `pdfXPrepress`.** Type an image or form XObject's `/OPI`
  dictionary (Open Prepress Interface): `version13` / `version20`, each
  version dictionary with one field per key of its list, named after the
  key in lower case, present only when the key is; the other keys in
  `_extras`. A non-dictionary throws `pdf/extra/pdfx/opi/not-dict`, a
  version other than `'1.3'`, `'2.0'` `pdf/extra/pdfx/opi/version`.
- **`typeHalftone(value)` and `HALFTONE_KEYS` on the opt-in
  `pdfContentOpsExtended`.** Types a halftone dictionary or stream (the
  value an ExtGState's `HT` names) by its `/HalftoneType` (1, 5, 6, 10,
  16): one field per key of its type's list, named after the key in
  lower case, present only when the key is; a type 5 halftone's colorant
  entries in `colorants`; a stream's own Table 5 keys left to
  `typeStreamEntries`; the other keys in `_extras`. A value that is
  neither a dictionary nor a stream throws `pdf/extra/halftone/not-dict`,
  a missing or unknown `/HalftoneType` `pdf/extra/halftone/bad-type`.
- **`typePattern(value)` and `PATTERN_KEYS` on the opt-in
  `pdfShadingTyped`.** Types a tiling or shading pattern (by its
  `/PatternType`; a tiling pattern's own Table 5 keys left to
  `typeStreamEntries`): one field per key of its list, named after the
  key in lower case, present only when the key is; the other keys in
  `_extras`. Errors: `pdf/extra/shading/pattern/not-dict`,
  `pdf/extra/shading/pattern/bad-type`.
- **The 3D and RichMedia dictionaries.** `type3DScene(dict, kind)` and
  `SCENE_KEYS` on the opt-in `pdf3dRichMedia` type the 3D view and scene
  dictionaries — views (ISO 32000-2's `Snapshot` and `Params` included),
  cross sections, nodes, render modes, backgrounds, lighting schemes,
  units, the 3D stream (`stream`; `type3DScene` takes a stream as well,
  its dictionary read and its own Table 5 keys left to
  `typeStreamEntries`), animation styles (`animationStyle`), references
  (`reference`), projections (`projection`), markup external data
  (`markup`) and measurement references (`measureRef`), `kind` naming
  which: one field per key of its list, named after the key in lower
  case, present only when the key is; the other keys in `_extras`. A
  non-dictionary throws
  `pdf/extra/3d/scene/not-dict`, an unknown `kind`
  `pdf/extra/3d/scene/kind`. `type3DMeasure(dict)` and `MEASURE_KEYS`
  type a 3D measurement dictionary (`RD3`, `AD3`, `PD3`, `LD3`, `3DC`);
  a non-dictionary throws `pdf/extra/3d/measure/not-dict`, a missing or
  unknown `/Subtype` `pdf/extra/3d/measure/bad-subtype`.
  `type3DActivation` reads `Style`, `Window` and `Transparent` (`style`,
  `window`, `transparent`; `null` when absent).
  `typeRichMedia(dict, kind)` and `RICH_MEDIA_KEYS` type the RichMedia
  dictionaries — activation and deactivation, animation, command,
  configuration, instance, position, presentation, settings, window and
  its width and height, `kind` naming which; a non-dictionary throws
  `pdf/extra/rm/dict/not-dict`, an unknown `kind`
  `pdf/extra/rm/dict/kind`. `typeRichMediaContent` gains `type`, the
  `/Type` name.
- **`typeMeasurement(dict, kind)` and `MEASUREMENT_KEYS` on the opt-in
  `pdfMisc`.** Types the measurement dictionaries — rectilinear and
  geospatial measures, number formats, viewports, point data, the
  coordinate systems (`geographicCS`, `projectedCS`) and a geospatial
  markup's external data (`markupGeo`), `kind` naming which: one field
  per key of its list, named after the key in lower case, present only
  when the key is, a reference read as read for every key; the other keys
  in `_extras`. A non-dictionary throws `pdf/misc/measurement/not-dict`,
  an unknown `kind` `pdf/misc/measurement/kind`.
- **`typeXObjectEntries(value, kind)` and `XOBJECT_ENTRY_KEYS` on the
  opt-in `pdfMisc`.** The companion of the core XObject typers: the keys
  of an image, image mask, soft mask, form, printer mark, trap network or
  PostScript XObject they leave out (`Alternates`, `SMaskInData`, `ID`,
  `StructParent`, `OPI`, `OC`, `AF`, `Measure`, `PtData`, `PieceInfo`,
  `LastModified`, `XUID`, the trap network and printer mark keys …), one
  field each, named after the key in lower case; no `_extras`. Errors:
  `pdf/misc/xobject/not-dict`, `pdf/misc/xobject/kind`.
- **The keys the core typers read without exposing.**
  `typeObjectEntries(value, kind)` on the opt-in `pdfMisc` types a
  thumbnail's, a CMap stream's, an ICC profile's, a page tree node's,
  a resource dictionary's, an encoding's, the trailer's and an object
  stream's keys beside the core typers; no core record changes.
- **The name, extensions and URI dictionaries.** `typeCatalogPart(dict,
  kind)` on the opt-in `pdfMisc` types the catalog's name dictionary,
  its extensions and developer extensions dictionaries and its URI
  dictionary; the core `typeCatalog` gains `extensions`.
- **The embedded file parameters and the go-to-embedded targets.**
  `pdfEmbeddedFile` exports `typeEmbeddedFileParams(dict)`, whose record
  gains `mac`; `typeFilePart(dict, kind)` on the opt-in
  `pdfEmbeddedFilesPortfolio` types a file specification's `/EF` and
  `/RF`, the Mac OS file information and the targets; `typeFileSpec`
  gains `ep` (PDF 2.0's encrypted payload).
- **The collection folders, colours, split and sub-items.**
  `typeCollectionPart(dict, kind)` on the opt-in `pdfEmbeddedFilesPortfolio`
  types them; `typeSchemaField` and `typeSort` read the optional `/Type`
  (`type`).
- **The presentation and navigation dictionaries.**
  `typePresentation(dict, kind)` on the opt-in `pdfMisc` types the
  floating window parameters, transitions, navigation nodes, beads,
  threads, slide shows, page labels, view parameters and the outline
  root; `typeNavigator` on the opt-in `pdfEmbeddedFilesPortfolio`
  gains `type` and `layout`.
- **The Web Capture dictionaries.** `typeWebCapture(dict, kind)` on the
  opt-in `pdfMisc` types the page sets, image sets, commands and command
  settings.
- **`typeMediaDict(dict, kind)` and `MEDIA_KINDS` on the opt-in
  `pdfLegacyDeprecatedAnnots`.** Types the multimedia dictionaries the
  Screen annotations and rendition actions point at (ISO 32000-2 § 13.2:
  renditions, media clips and sections, play and screen parameters, media
  criteria, durations and offsets, permissions, players, player info,
  software identifiers, minimum screen size) and the movie and
  movie-activation dictionaries: one field per key of the kind's table,
  present only when the key is, the other keys in `_extras`. A
  non-dictionary throws `pdf/legacy-annot/media-not-dict`, an unknown kind
  `pdf/legacy-annot/media-kind` (`ContractError`). The existing functions
  are unchanged.

### Changed

- **Typed records stop leaving some keys in `_extras`.** Each of these
  entries was in the record's `_extras` and is now a typed field, set only
  when the entry is present; a 1.1.0 consumer that read it from `_extras`
  finds it in the field named here (the records are a read model, nothing
  is written back from them):
  - `typeCatalog`: `Extensions` is `extensions`;
  - `typeStructElement`: `Ref` is `ref`;
  - `typeFileSpec`: `EP` is `ep`;
  - the embedded file parameters (`params` of `typeEmbeddedFile`):
    `Mac` is `mac`;
  - the ink annotation: `Path` is `path`; the line annotation: `LLO` is
    `llo` and `CO` is `co`; the opt-in `type3DAnnot`: `3DU` and `GEO`
    (named as the keys);
  - the opt-in `typeExtGState`: `HTP` is `htp`;
  - the opt-in `typeFontFile3OpenType`: `Length1` to `Length3` are
    `length1` to `length3`;
  - the opt-in `typeSchemaField` and `typeSort`: `Type` is `type`;
  - the opt-in `typeStructAttribute`: the Table's `Short` and the print
    field's `Checked` are typed, and an `NSO` owner (read as a vendor
    owner, its keys in `_extras`) is typed with `ATTRIBUTE_OWNERS` holding
    it;
  - the opt-in `typeLegal`: `HideAnnotationActions` and
    `GoToRemoteActions`, when integers, join `flags`; `OptionalContent`,
    when a boolean, is `optionalContent` (a value of another type stays in
    `_extras`).
- **`typeStructAttribute` reads `Width`, `Height` and `LineHeight` given
  as a name.** The Layout attributes `width`, `height` and `lineHeight`
  were a number or `null`; a name is now returned by its value.
- **`typeRequirements` marks all 27 requirement types of ISO 32000-2 as
  `standard`.** `standard` was `true` for `EnableJavaScripts` only.
- **`typeLaunch` keeps `Mac` and `Unix` as read, whatever their type.**
  A non-dictionary value was dropped; a dictionary still counts as a
  target, a value of another type does not.
- **`pdfDocument` declares more dependencies.** The reader now composes
  `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5` and `pdfStandardV6`, so
  a registry that composes `pdfDocument` itself also resolves fw's `aes`,
  `cbc`, `sha256`, `sha384`, `sha512`, `bitArray` and `pdfAesGcm`.

### Fixed

- **Two classic cross-reference table shapes are read.** A subsection
  header ending with spaces or tabs before its EOL, and entries of 19
  bytes (a one-byte EOL), threw `pdf/xref/bad-digit`; both are now read,
  each recorded once as a `pdf/document/xref-tolerated` loss. Any other
  entry keeps the 20-byte stride, and a malformed field still throws.
- **A page-tree `/Kids` given by reference.** `walkPageTree` refused
  a `/Pages` node whose `/Kids` is an indirect reference to an array
  (`pdf/pages/missing-kids`); any value may be indirect (ISO 32000-2
  § 7.3.10), so the reference is now resolved first. A reference to
  anything but an array still throws.
- **`/Encrypt null` is a plaintext document.** `typeTrailer` typed a
  trailer `/Encrypt null` as an encryption entry, so `readDocument`
  refused the file `pdf/document/encrypted` (and, given a password,
  built a reference with no number). A null value is an absent entry
  (ISO 32000-2 § 7.3.9): the trailer now has no `encrypt` and the file
  reads.
- **A signature's `/Contents` is written clear.** `writeEncryptedDocument`
  encrypted the `/Contents` string of a `/Type /Sig` or `/DocTimeStamp`
  dictionary, which ISO 32000-2 § 7.6.2 leaves clear (and the decrypting
  read leaves as stored); it is now written as given.
- **`encryptMetadata: false` leaves the metadata stream clear.**
  `writeEncryptedDocument` encrypted the `/Type /Metadata` stream even
  when the flag said not to (ISO 32000-2 Table 20); it is now written as
  given.
- **`typeDPart` reads the pages of a document part.** `/Start` and
  `/End` are references to the part's first and last page objects
  (ISO 32000-2 Table 408); the opt-in typer read them as integers only,
  so a conforming file gave `start` and `end` as `null`. A reference is
  now `{ num, gen }`; an integer is kept as before.

## [1.1.0] - 2026-10-21

### Added

- **Standard 14 metrics on the legacy `addFont`.** PDF 2.0 requires
  `FirstChar`, `LastChar`, `Widths` and `FontDescriptor` in every simple
  font dictionary, the Standard 14 faces included (ISO 32000-2
  Table 109). The new opt-in `standard14` option of the non-embedded
  shape takes the `@awacloud/fonts` `standard14Lookup` API and writes
  them from the Adobe Core 14 metrics (`WinAnsiEncoding` for the Latin
  faces, the built-in encoding for `Symbol` and `ZapfDingbats`); without
  it the legacy bytes are unchanged. A `standard14` value that is not that
  API, a face outside the 14, a subtype other than `Type1`, or an encoding
  the face does not take (`WinAnsiEncoding` for a Latin face, none for
  `Symbol` and `ZapfDingbats`) throws `pdf/builder/bad-font`. Committed
  `-rw` dist bundles regenerated.

### Changed

- **PDF 2.0 files written without an `/ID` now carry a derived one.**
  ISO 32000-2 Table 15 requires the trailer `/ID` in PDF 2.0;
  `pdfWriter.writeDocument` wrote one only when given, so `pdfBuilder`
  without `setId` and `pdf.write` of a document that had none emitted
  `%PDF-2.0` files without it, and the bytes of every such file change.
  When no `/ID` is given and the version is `'2.0'`, both halves are now
  the first 16 bytes of the SHA-256 of the bytes written before the
  trailer (still reproducible). An explicit `/ID` and other versions are
  unchanged, and `pdfXrefStreamWriter` still derives none. `pdfWriter`
  gains `sha256` and `bitArray` as its last, optional dependencies (a
  hand-wired `factory(errors, serializer)` keeps the old output).
  Committed dist bundles regenerated.

### Fixed

- **CIDSystemInfo entries written as strings.** Every composite embedding
  written through `pdfBuilder` changes by two entries:
  `pdfFontEmbed.embedCid` wrote the descendant CIDFont's `/CIDSystemInfo`
  `/Registry` and `/Ordering` as names (`/Adobe`, `/Identity`), and ISO
  32000-2 Table 114 makes them ASCII strings; the opt-in
  `pdfFontCidTyped.typeCIDSystemInfo` refused such a dictionary with
  `pdf/extra/cid-system-info/incomplete`. They are now strings
  (`(Adobe)`, `(Identity)`); a value already given as a typed PDF object
  is kept.
- **Portfolio schemas that carry `/Type` type.** The opt-in
  `pdfEmbeddedFilesPortfolio.typeSchema` read every schema entry as a
  field definition, so a schema carrying the optional
  `/Type /CollectionSchema` (ISO 32000-2 Table 155) threw
  `pdf/portfolio/bad-schema-field`, and `typePortfolio` threw on the whole
  collection. A name-valued `/Type` is now skipped; the fields are typed
  as before. Committed dist bundles carrying the module regenerated.
- **V=4 crypt filters resolve per class.** A `/StmF /Identity` paired
  with a named `/StrF` decrypted the streams with the `/StrF` filter;
  ISO 32000-2 Table 20 names `/StmF` the filter of every stream and
  Table 26 makes `Identity` a pass-through. Streams of such a file now
  read unchanged (as on V=5; embedded files too when `/EFF` is absent),
  and signing it writes the new streams in the clear. Committed `-rw`
  dist bundles regenerated.
- **Errors survive the fw sanity layer.** `PdfError` defined `name` by
  assignment, which throws a `TypeError` once `applyBase()` has frozen
  `Error.prototype`, so the typed error (code, context) was lost. `name` is
  now an own property set with `Object.defineProperty` (same shape:
  writable, enumerable, configurable). Committed dist bundles regenerated.

### Security

- **Stream scripts reach the sandbox linter.** A script held in a stream
  is an indirect reference inside its action dictionary (ISO 32000-2
  § 7.3.8), and the opt-in `pdfFormActionsExtended` accepted `/JS` only
  as a string or a direct stream: a JavaScript action with such a script
  threw `pdf/extra/action-ext/bad-js`, and a rendition action dropped it
  (`js: null`, no `sandboxed` flag), so `pdfSandbox.lintActions` did not
  report its script. Both keep the reference now (`js`, for the caller to
  resolve) and are marked `sandboxed`; the linter reports them. Committed
  dist bundles carrying the module regenerated.
- **FlateDecode output ceiling (decompression bomb).** `pdfFlate.decode`
  stops at 256 MiB of inflated output per stream (the ooxml/odf
  `maxUncompressed` default) and throws `pdf/flate/output-limit`; a long
  input is inflated 16 KiB at a time, so it is abandoned early instead of
  being inflated whole. `decode(bytes, params, { maxOutput })` sets another
  ceiling (`0` disables it); `pdfFlate.limits` exposes the default.

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
