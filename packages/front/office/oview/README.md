# @awacloud/oview

Embed a browser-only document viewer in any page: PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, Markdown and text, as `mountViewer()` or the `<awa-viewer>` element. Nothing is uploaded.

The embeddable core of AWA Viewer: mount a browser-only document viewer for
PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), OpenDocument (ODT, ODS,
ODP), Markdown and plain text inside any page, as a function call
(`mountViewer()`) or as the `<awa-viewer>` element. Nothing is uploaded: the
viewer reads the file on the device and sends nothing anywhere. The
standalone installable application built on this package is
`@awacloud/viewer`
([`apps/services/viewer`](https://github.com/awacloud/awa/tree/@awacloud/oview@0.3.0/apps/services/viewer)).

## Install

```bash
npm install @awacloud/oview
```

Inside the awa monorepo the package is a workspace member, linked by:

```bash
bun install
```

Runtime dependencies are `@awacloud/*` packages only (`workspace:*` in the
monorepo): `@awacloud/fw`, `pdf`, `ooxml`, `odf`, `md`, `fonts`, `oconv`. No
third-party npm package runs in the page.

## Quick start

In a page (browser-only: the viewer needs a DOM, so this snippet does not
run on a server runtime; `@awacloud/oview` resolves through `exports` `.` →
`src/main.js`):

```js
import { mountViewer } from '@awacloud/oview';

const viewer = mountViewer(document.querySelector('#doc'), { locale: 'fr', headingOffset: 2 });
await viewer.open(file);          // File | Blob | { name, bytes }
viewer.setLocale('en');
viewer.destroy();                 // removes everything it added
```

or as markup (browser-only too; `@awacloud/oview/element.js` resolves through
`exports` `./element.js` → `src/element.js`):

```html
<link rel="stylesheet" href="…/src/styles/viewer.css">
<awa-viewer src="/docs/report.pdf" locale="fr" style="height: 80vh"></awa-viewer>
<script type="module">
    import { defineViewerElement } from '@awacloud/oview/element.js';
    defineViewerElement();
</script>
```

The host links `viewer.css` (plus `tokens.css` when the site does not
already carry the awaforge tokens) and gives the viewer a height.

## Options

| Option | Default | Meaning |
|---|---|---|
| `locale` | host `lang`, then the browser | `en` or `fr` |
| `headingOffset` | `1` | levels a document's headings move down under the page outline |
| `runtime` | a new `ModuleRuntime` | an fw runtime to share with a host that runs fw |
| `onOpen`, `onError`, `onClose` | — | callbacks (`<awa-viewer>` dispatches `awa-viewer-open` / `awa-viewer-error`) |
| `onHelp` | — | shows a Help button at the end of the toolbar; the host opens its help |
| `onMore` | — | receives the files chosen or dropped together beyond the first (which the viewer opens); without it the viewer says how many it left |
| `samples` | `[]` | documents to try (`{ label, load }`), offered under the dropzone; the host loads them, the viewer itself fetches nothing |

## What it shows

| Family | Formats | View |
|---|---|---|
| Portable | PDF | one canvas per page, drawn when it nears the screen — vector paths, colour spaces, images, shadings, embedded TrueType, Type 1 and CFF outlines, annotation appearances — with a selectable text layer read by screen readers and clickable web links; files encrypted without a reading password open |
| Word processing | DOCX, ODT | paper sheets: style cascade, lists with real counters, tables (widths, merged cells, borders, shading), images, links, footnotes (DOCX), cut at explicit page breaks |
| Spreadsheet | XLSX, ODS | one grid per visible sheet, sticky row / column headers, column widths, row heights, hidden rows and columns left out, merged cells, cell styles, values as last saved (XLSX number formats in the reader's locale) |
| Presentation | PPTX, ODP | one page per slide, real DOM text scaled per zoom: layout / master inheritance, theme colours, backgrounds, pictures, tables (PPTX) |
| Text | Markdown, `.txt` / `.csv` / `.log`… | a paper sheet; Markdown through `@awacloud/md` in safe mode, remote images not loaded |
| Legacy | DOC, XLS, PPT (97–2003) | detected and explained — no parser exists in the repository yet (`packages/front/office/msoff`) |

Whatever a view cannot draw is counted and listed under **Document details →
What this view leaves out** (honest reporting: an empty list says "no
omission recorded", never "nothing lost").

## Copy with formatting

A toolbar button (and `Ctrl+Shift+C` / `Cmd+Shift+C`) copies the open
document as `text/html` plus Markdown, so a paste into a word processor
keeps its headings, emphasis, lists, tables, links and, from Word and
OpenDocument text, its pictures; fonts, colours and page layout are not
carried. See [`docs/copy-with-formatting.md`](./docs/copy-with-formatting.md).

## Style cascade (`@awacloud/oview/cascade.js`)

The viewer's own DOCX and OpenDocument style cascade, for a consumer that
lays a document out itself (an editor, a converter) and wants the styles
resolved exactly as the viewer paints them. It is the same code the
painters run, not a copy.

```js
import { createDocxCascade, docxParagraphCss, docxRunCss } from '@awacloud/oview/cascade.js';

const read = docx.read(bytes);                   // @awacloud/ooxml
const cascade = createDocxCascade(read.styles);
const { p, r, headingLevel, styleId } = cascade.paragraph(para.pPr);
const run = cascade.run(r, runNode.rPr);         // character style, then direct formatting
Object.assign(el.style, docxParagraphCss(p), docxRunCss(run));
```

| Export | Does |
|---|---|
| `createDocxCascade(styles)` | `styles` = `docx.read().styles`. `paragraph(pPr, listPPr?, cell?)` → `{ p, r, headingLevel, styleId, title }`: document defaults → the `basedOn` chain (root first, cycles cut) → a numbering level's `pPr` → direct formatting; a table style's cell properties when `cell` is given. `run(baseRPr, rPr)`: the character style (`rStyle`) between the paragraph's run base and the direct run formatting. `table(tblPr)`, `tableStyle(id)`: table style properties and conditional formats |
| `mergeDocxProps(...bags)` | the merge the cascade uses: later bags win, `indent` / `spacing` / `lang` / `fonts` / `numPr` merged per attribute |
| `docxParagraphCss(p)`, `docxRunCss(r)` | resolved bags → CSS, a plain object with camelCase property names |
| `createOdfCascade(read)` | `read` = an `odt` / `ods` / `odp` `read()` result (`@awacloud/odf`). `resolve(name, family)` → one property bag per group (`paragraph`, `text`, `tableCell`…) keyed by attribute local name, `parent-style-name` chain and family default folded in, relative font sizes multiplied out; `face(name)` → the font family a font face declares; `get(name, family)` → the style itself |
| `odfParagraphCss(p)`, `odfTextCss(t, face)`, `odfBoxCss(b)`, `odfCellCss(c)` | ODF bags → CSS, same shape as the DOCX ones |

The contract: pure and read-only (plain objects in, plain objects out, the
input never mutated), no DOM, no fw runtime, no side effect at import — the
entry loads where no `document` exists. What it does not do: numbering
formats and list counters, contextual spacing and the space-after /
space-before sum between neighbouring paragraphs, page layout (sections,
page size, margins, headers and footers). The painters do those while they
walk the document.

## Keyboard

| Keys | Action |
|---|---|
| `Tab` | toolbar (one stop; `←` `→` `Home` `End` inside), then the document |
| `PageDown` / `PageUp`, `Ctrl+Home` / `Ctrl+End` | next / previous / first / last page or slide (documents and sheets scroll natively) |
| `+` / `-` / `0`, `Ctrl` + wheel | zoom in / out / 100 % (`Ctrl` + `+` stays the browser's own zoom) |
| `Ctrl+O` | open a file |
| `Ctrl+Shift+C` (`Cmd+Shift+C`) | copy the document with its formatting (the toolbar button is the primary path: desktop Chrome and Edge keep this chord for the DevTools element picker) |
| `←` `→` on the sheet tabs | change sheet |

## Embedding notes

- The viewer owns no route: it never touches `location` / `history`, binds
  its keys on its own element, and `destroy()` removes everything it added;
  two viewers on a page get distinct ids.
- Light DOM (no shadow root): the host's tokens apply and fw's body-level
  live regions keep working.
- `<awa-viewer src>` opens a SAME-ORIGIN document only; a cross-origin URL is
  refused, the viewer never contacts a third party.
- Nothing registers at import: call `defineViewerElement()` once.
- The component never hardens the realm (fw sanity): that is the host
  page's decision.

## Development

Serve the **repository root**: the browser resolves `@awacloud/*` through an
import map against `/packages/…`, with no bundler.

```bash
bun cli.ts local_web --dir . --port 8793 --no-cert
```

This command, like the test commands below, needs the awa development tree
(its root `cli.ts` and workspace); the public repositories do not carry it.

Embedding demo: `http://localhost:8793/packages/front/office/oview/examples/embed.html`
(the element opening a document of the site through `src`, and a script
call).

## Tests

```bash
bun test packages/front/office/oview/
```

```bash
cd packages/front/office/oview && bunx eslint --no-warn-ignored .
```

Unit and Happy-DOM tests co-located in `src/`: format detection, catalogs,
number formats, every painter on real files (the office corpus plus this
package's fixtures), the PDF interpreter against a recording 2D context, the
controller end to end, the style cascade sub-path (loaded in a child
process with no DOM), and source gates (no network, no HTML injection, the
component sheet's colours, the cascade's import closure, no internal
reference in what ships). The pack
surface and the exports map are checked in `tests/`. Canvas rendering and
layout are checked in a browser.

Fixtures: `tests/fixtures/rich.{odt,ods,odp}` are built by
`tests/fixtures/build-odf.js` (fw `zip`), `rich.xlsx` by
`tests/fixtures/build-ooxml.js` (the `@awacloud/ooxml` writer), `rich.docx`
by `tests/fixtures/build-docx.js` (hand-written WordprocessingML: Word 2013+
defaults, lists, table styles with conditional formats, header and footer),
the encrypted PDFs by `tests/fixtures/build-pdf.js` (`pdfEncryptedWriter`,
deterministic randomness), and the image fixtures `images.{pdf,docx,pptx,odt,odp}`
by `tests/fixtures/build-images.js` — every picture path of every painter
(JPEG RGB / grey / CMYK, Flate 1–16 bits, Indexed, `/Decode`, every mask
kind, inline images, transforms, resampling, the memory guard; PNG, JPEG,
GIF, SVG, EMF / WMF, crops, floating pictures, alternative text), with
first-party PNG / GIF / baseline-JPEG encoders (`image-encoders.js`). The
outputs are committed.

## Layout

| Path | Role |
|---|---|
| `src/main.js` | the package entry: `mountViewer`, `defineViewerElement`, `detect`, `negotiateLocale`, `LOCALES`, `MAX_DOCUMENT_BYTES` |
| `src/viewer.js` | `mountViewer()` — the public API and controller |
| `src/element.js` | `defineViewerElement()` — `<awa-viewer>` |
| `src/cascade.js` | the style cascade sub-path (re-exports `render/docx-style` and `render/odf-style`) |
| `src/core/` | `detect` (magic bytes), `runtime` (lazy engines on one fw runtime), `i18n` (fw `i18n` + negotiation) |
| `src/i18n/` | `en` (reference) and `fr` catalogs |
| `src/ui/` | `stage` (zoom, lazy pages, sheets), `toolbar` (WAI-ARIA), `intake` (drop / picker), `info` (details and omissions), `copy` (the two clipboard flavours) |
| `src/render/` | the painters: `text`, `markdown`, `docx`, `odt`, `sheet` (+ `numfmt`), `slides`, `pdf/` (`pdf`, `paint`, `colour`, `image`, `glyphs`, `decrypt`, `objects`), shared `dom`, `view`, `html`, `flow`, `docx-style`, `odf-style`, `odf-text`, `clock` (time slicing) |
| `src/styles/` | `tokens.css` (awaforge copy), `viewer.css` (component) |
| `tests/` | `setup-dom.js`, `context.js`, `fixtures/` (+ their builders), the pack-surface test |
| `examples/embed.html` | the viewer inside a host page (element + script call) |

## Known limits

- Size: a document over 256 MiB is refused before it is read (a tab would
  not survive it); a text file shows its first 5 million characters and
  reports the rest. PDF pages are drawn as they near the screen, so the
  browser's own Find (Ctrl+F) and a screen reader reach the drawn pages
  only; there is no search inside the viewer yet.
- A page whose drawing fails says so on the page and is counted under
  "What this view leaves out".
- PDF: embedded TrueType, Type 1 and CFF programs (`/FontFile2`,
  `/FontFile`, `/FontFile3`) are drawn from their own outlines; a composite
  font maps its codes to CIDs under `Identity-H` / `Identity-V` or an
  embedded CMap (with its `/UseCMap` parent), each code at the length
  its codespace gives. A composite font under a predefined CMap by
  another name, or a program that does not read, is drawn glyph by glyph
  with a matching system face, at the PDF's own positions, and reported. Encrypted
  PDFs open when no password is needed to read them (AES-128/256, RC4) unless
  their objects sit in object streams; a file that needs a password is
  refused with an explanation (no password prompt yet). JPEG 2000 / JBIG2
  images, mesh shadings, tiling patterns and soft masks are reported, not
  drawn.
- DOCX / ODT: no automatic pagination (sheets end at explicit page breaks);
  charts, drawn shapes and equations are reported. A picture anchored to the
  page (not its paragraph) stays at its paragraph.
- XLSX / ODS: a sheet paints at most 2,000 rows, 200 columns and 100,000
  cells (rows past the first 250 arrive in later slices).
- Pictures in EMF / WMF (vector metafiles) are shown as a labelled
  placeholder and reported.
- PPTX / ODP: preset geometries other than rectangles, rounded rectangles and
  ellipses are drawn as their box; charts, media and animations are
  reported, and so are ODP tables (PPTX tables are drawn).
- DOC / XLS / PPT: not supported until `packages/front/office/msoff` exists.

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/oview` | `src/main.js` | `mountViewer()`, `defineViewerElement()`, `detect`, `negotiateLocale`, `LOCALES`, `MAX_DOCUMENT_BYTES` |
| `@awacloud/oview/viewer.js` | `src/viewer.js` | `mountViewer()`, `detect`, `negotiateLocale`, `LOCALES`, `MAX_DOCUMENT_BYTES` |
| `@awacloud/oview/element.js` | `src/element.js` | `defineViewerElement()` |
| `@awacloud/oview/cascade.js` | `src/cascade.js` | `createDocxCascade`, `mergeDocxProps`, `docxRunCss`, `docxParagraphCss`, `createOdfCascade`, `odfTextCss`, `odfParagraphCss`, `odfBoxCss`, `odfCellCss` — see [Style cascade](#style-cascade-awacloudoviewcascadejs) |
| `@awacloud/oview/viewer.css` | `src/styles/viewer.css` | component sheet |
| `@awacloud/oview/tokens.css` | `src/styles/tokens.css` | awaforge token layer, when the host has none |
| `@awacloud/oview/package.json` | `package.json` | the manifest |

## Maturity

L2 (`awa.maturity` in `package.json`): README, co-located unit and Happy-DOM
tests, integration tests in `tests/`, a `files` allowlist, a CHANGELOG and a
`docs/README.md` index. Published to npm as `@awacloud/oview`.

## Licence

`AGPL-3.0-only`, see [`LICENSE`](./LICENSE). A commercial licence is also
available: `@awacloud/oview` is included in the AWA Convert licence
(https://awacloud.com/offers/convert); [`NOTICE`](./NOTICE) gives the contact.

Copyright (c) 2026 AwaCloud SAS

## Links

- Source: [`packages/front/office/oview`](https://github.com/awacloud/awa/tree/@awacloud/oview@0.3.0/packages/front/office/oview)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/@awacloud/oview@0.3.0/SECURITY.md
- Documentation: [design and architecture](./docs/design.md), [copy with formatting](./docs/copy-with-formatting.md)
- Website: https://awaforge.eu/
- Product: https://viewer.awacloud.com/
