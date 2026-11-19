# Changelog

All notable changes to `@awacloud/oview` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-19

### Changed

- **PDF: a composite font's codes at their own length.** The painter
  read a `Type0` string 2 bytes at a time, so a font whose embedded CMap
  has codes of 1 and 2 bytes kept its system face. It now reads the codes
  by the font decoder's `split` (the CMap's codespace) and passes each
  code's length to its width and to the program's glyph lookup; `Tw`
  applies to a 1-byte code 32.

- **PDF: the font decoder is pdf's.** The engine resolves
  `@awacloud/pdf`'s `pdfFontDecoder` extra where it found
  `@awacloud/oconv`'s copy, which oconv dropped; the pdf engine no longer
  imports oconv. Rendering is unchanged.

### Added

- **PDF: a composite font under an embedded CMap drawn from its outlines.**
  A `Type0` font whose `/Encoding` is an embedded CMap stream, not
  `Identity-H` / `-V`, maps its codes to CIDs through `@awacloud/fonts`'
  `cmapCid`, the stream's `/UseCMap` parent under it; its glyphs are drawn
  from the program instead of a system face. A predefined CMap by another
  name, or a CMap whose codes are not all two bytes long, keeps the
  system face and its report.

- **PDF: embedded Type 1 and CFF fonts drawn from their own outlines.**
  `/FontFile` (Type 1) and `/FontFile3` (`Type1C`, `CIDFontType0C`, and
  `OpenType` with a `CFF ` or `glyf` table) join `/FontFile2`: a simple
  font's codes reach their glyphs through the PDF encoding (`/Encoding`, its
  `/BaseEncoding` and `/Differences`, over the program's built-in
  encoding), a composite font's under an Identity CMap through the CIDs; a
  font matrix that is not a uniform scale is drawn as a transform. Such
  text was drawn in a system face and reported as `pdf/font-substituted`.

## [0.2.0] - 2026-11-02

### Added

- The package: the embeddable core of AWA Viewer, moved out of the
  standalone application `@awacloud/viewer`, which keeps the PWA shell —
  `mountViewer()`, `defineViewerElement()` (the `<awa-viewer>` element),
  `detect`, `negotiateLocale`, `LOCALES`, `MAX_DOCUMENT_BYTES`, the
  component sheet `viewer.css` and the token layer `tokens.css`.
- **Copy with formatting.** A toolbar button and the `Ctrl+Shift+C` /
  `Cmd+Shift+C` chord copy the open document as `text/html` plus Markdown
  (`text/plain`), so a paste into a word processor keeps its headings,
  emphasis, lists, tables and links, and its pictures from Word and
  OpenDocument text (PNG, JPEG, GIF and WebP as `data:` URIs, up to 10 MiB).
  Fonts, colours, page layout and PDF pictures are not carried. The
  clipboard is written inside the user gesture; without rich write the
  Markdown is copied as text, and without a clipboard the button is hidden.
  A short-lived card over the document shows the copy on screen (copying,
  then copied or failed), with the same words announced to screen readers.
  See `docs/copy-with-formatting.md`.
- **The style cascade as a sub-path.** `@awacloud/oview/cascade.js` exports
  the viewer's own DOCX and OpenDocument style cascade — `createDocxCascade`,
  `mergeDocxProps`, `docxRunCss`, `docxParagraphCss`, `createOdfCascade`,
  `odfTextCss`, `odfParagraphCss`, `odfBoxCss`, `odfCellCss` — for a
  consumer that lays documents out itself. Pure: no DOM, no fw runtime, no
  side effect at import; the painters run the same code (the DOCX cascade
  moved to `src/render/docx-style.js`, rendering unchanged).

### Changed

- Tracked moves in a docx paint in the accepted view: the move
  destination is shown, the move source is not (its runs carry `w:t`, so
  it would show the moved text twice).

- File intake (picker, drop, keyboard dropzone) and the zoom keys now go through
  `@awacloud/fw`'s `fileIntake` and `keybindings` (`Plus`, `Equal`, `Minus`,
  `0`); same behaviour, no hand-written listener left.
