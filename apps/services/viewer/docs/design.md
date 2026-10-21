# AWA Viewer — design and architecture

> `apps/services/viewer` (`@awacloud/viewer`). A browser-only document
> viewer: an installable PWA on its own, and a mountable component inside
> any page of a site. Nothing is uploaded. This page records the design pass
> (2026-10-10) and the architecture as delivered.

## 1. What it is

Open a document and **see it** — pages, layout, tables, slides, sheets —
not a Markdown reading view (that is `apps/demo/office-reader`). The viewer
never edits, never converts, never sends a byte anywhere.

| Family | Formats | Rendered as |
|---|---|---|
| Portable | PDF | paged, one `<canvas>` per page + a transparent text layer + link anchors |
| Word processing | DOCX, ODT | paper sheets (page width and margins from the section), cut at explicit page breaks |
| Spreadsheet | XLSX, ODS | a grid per visible sheet, sheet tabs |
| Presentation | PPTX, ODP | paged, one fixed-ratio slide per page, real DOM scaled per zoom |
| Text | Markdown (`.md`) | a paper sheet, `@awacloud/md` safe HTML |
| Text | plain text (`.txt`, `.csv`, `.log`, `.json`, …) | a paper sheet, `<pre>` |
| Legacy binaries | DOC, XLS, PPT (MS-CFB) | **detected**, explicit "not supported yet" (decided 2026-10-10: detect and explain; the parser belongs to `packages/front/office/msoff`, today a README only) |

## 2. What we reuse (and the gap we fill)

Measured before design:

- **Parsing is solved** — `@awacloud/pdf`, `@awacloud/ooxml`, `@awacloud/odf`,
  `@awacloud/md`, `@awacloud/fonts` (all L4). Their typed models carry what a
  renderer needs; the viewer registers the `*LargeBundle` descriptors
  (`docx`, `xlsx`, `pptx`, `odt`, `ods`, `odp`) and `mdFullBundle`.
- **Visual rendering did not exist anywhere** — every `render*` in
  ooxml/odf serializes XML; `pdf/README.md`: "Content streams are parsed to
  an operator list, not rendered". The painters are the viewer's own code:
  *model → DOM / canvas*, nothing that parses a file format.
- Reused rather than rewritten: `@awacloud/oconv`'s PDF font decoder
  (`oconvPdfFontDecoder`: ToUnicode / encoding + AGL / widths), `@awacloud/fonts`'
  table readers (`sfnt`, `head`, `maxp`, `loca`, `glyf`, `cmap`, composite
  resolution) for embedded TrueType outlines, `@awacloud/pdf`'s filters (with
  the LZW / CCITT extra), content-stream parser, resources, security handlers
  (V4/V5/V6 + the RC4 extra) and encrypted writer (test fixtures),
  `@awacloud/ooxml`'s `pptxTheme` (also reads a workbook's theme part) and
  writer (test fixtures). The painters read the typed fields the packages
  give rather than raw XML: DrawingML colours with their `mods`, picture
  crops (`srcRect`), the slide size (`presentation.sldSize`), XLSX row
  heights and hidden rows (`rowProps`), DOCX run faces per script
  (`fonts`), ODS `visibility` and ODT frames in runs (`framesInRuns`).
- `@awacloud/fw` gives everything around the painters: `ModuleRuntime`,
  `i18n`, `a11y.announce`, `keybindings`, `fullscreen`, `download`,
  `serviceWorker`, `storage`, `cache` (worker side), `zip` (fixtures), the
  sanity layer.
- `@awacloud/graphic-anim` is **not** needed: the only motion is CSS (the
  progress ring) behind `prefers-reduced-motion: no-preference`.
- Build: `site-kit app-dist` and the demos' `bundle-js` (`bundleDist`,
  `bundleWorker`) — the same pipeline as `apps/demo/*`.

Gaps filled app-locally, **promotion candidates**:

| Module | Natural home |
|---|---|
| `render/pdf/*` (canvas painter, colour spaces + functions, image decoding, TrueType glyph mapping, decrypting reader) | `@awacloud/pdf` `render/` |
| `render/numfmt.js` (SpreadsheetML number formats) | `@awacloud/ooxml` `xlsx` |
| `render/odf-style.js` (ODF style cascade → CSS) | `@awacloud/odf` |

Gaps found in packages, reported, not patched here: `@awacloud/pdf` does
not decrypt objects stored in object streams; fw has no punctuation keys in
`keybindings` (`+` / `-` zoom keys are read locally), no OS file-drop
adapter (reported to fw), no worker-side cache strategy (the demos' gap too).

## 3. Architecture (KISS)

```
apps/services/viewer/
  public/index.html          standalone PWA page (import map FIRST)
  public/manifest.webmanifest, public/sw.js, public/icons/
  examples/embed.html        the viewer inside a host page (element + script call)
  src/main.js                standalone entry: sanity first, then boot
  src/sanity.js              fw sanity `base` (standalone page only)
  src/app.js                 standalone page: language menu, PWA adapter
  src/viewer.js              mountViewer(root, opts) → controller  ← the public API
  src/element.js             <awa-viewer> light-DOM custom element over mountViewer
  src/core/
    detect.js                detect(bytes, name) → { format, family } (magic bytes first)
    runtime.js               one ModuleRuntime per viewer, engines registered on first use
    i18n.js                  fw i18n + locale negotiation
    pwa.js                   SW registration, install button, launchQueue (file handlers)
  src/i18n/en.js, fr.js      catalogs (en is the reference; a test pins fr to it)
  src/ui/
    stage.js                 presents a View: zoom, lazy page drawing, current page, sheet tabs
    toolbar.js               WAI-ARIA toolbar (roving tabindex)
    intake.js                drop + picker → File
    info.js                  details panel + omission ledger
  src/render/
    index.js                 format → painter (each loaded on first use)
    view.js dom.js html.js   the View contract, DOM builders, link / heading passes
    text.js  markdown.js     flow views
    docx.js  odt.js flow.js  word processing (+ odf-style.js, odf-text.js)
    sheet.js numfmt.js       xlsx + ods → one grid painter
    slides.js                pptx + odp → one slide painter
    clock.js                 time slicing (Date.now: fw sanity blocks performance.now)
    pdf/                     pdf.js (pages, text layer, links, annotations), paint.js
                             (operators → canvas), colour.js, image.js, glyphs.js,
                             decrypt.js, objects.js
  src/styles/tokens.css      derived copy of apps/awaforge/assets/tokens.css (a test pins it)
  src/styles/viewer.css      the component sheet, `.awv-` prefix
  src/styles/app.css         the standalone page shell
  tools/build-sw.js          build step: bundled, versioned, pre-caching worker
                             (cache-first release; a new one waits for "Update now")
  tests/                     setup-dom.js, context.js, fixtures/ (+ their builders)
```

### 3.1 The View contract

Every painter is `async render(bytes, ctx) → View`; the shell knows only
this shape:

```js
View = {
  kind: 'flow' | 'paged' | 'sheets',
  title, meta: { title?, author? },
  element?, width?,                         // flow (natural width, for "fit width")
  pages?, pageLabel?: 'page' | 'slide',     // paged
  sheets?: [{ name, element }],             // sheets
  omissions: [{ code, count }],             // what the view could not draw
  dispose()                                 // revokes object URLs, drops caches
}
Page = { width, height, draw(host, zoom): Promise<void> }   // CSS px at zoom 1
```

- **Paged** views draw lazily: a page draws when it nears the viewport
  (`IntersectionObserver`, 150 % margin), redraws on zoom, and is released
  when far away — a long PDF holds a handful of canvases.
- **Omissions** are the honest-reporting rule (`app-service.md`): a feature
  a painter skipped is counted and listed in the details panel ("What this
  view leaves out"); an empty list says "No omission recorded".
- **Responsiveness**: no painter holds the main thread for long. The PDF
  painter and image decoder give the event loop a turn every 40 ms
  (`render/clock.js`, on `Date.now`: fw sanity `base` blocks
  `performance.now`), decoded images are kept at 16 Mpx at most and cached
  under a 64-Mpx budget, the last six pages' operators are cached for zoom
  redraws; a sheet paints 250 rows at a time and formats its numbers with
  one set of `Intl` formatters. Measured on a 250-page PDF, a 60,000-cell
  XLSX and a 3,000-paragraph DOCX: longest task about 200 ms (the package
  parsers' own single blocks).

### 3.2 Embedding

```js
import { mountViewer } from '@awacloud/viewer';
const viewer = mountViewer(document.querySelector('#doc'), { locale: 'fr' });
await viewer.open(file);              // File | Blob | { name, bytes }
viewer.close(); viewer.destroy();
```

`<awa-viewer locale="fr" src="/same-origin/doc.pdf">` wraps the same call
(light DOM, so the host's tokens apply and fw's body-level live regions keep
working; registered by `defineViewerElement()`, nothing at import). The
viewer never touches `location`, `history` or global keys: keybindings and
listeners are scoped to its root, it owns no route, two viewers on a page
get distinct ids, and `destroy()` removes everything it added.

### 3.3 Security posture

- No network: painters, UI and controller contain no `fetch` / XHR /
  WebSocket / beacon / absolute URL (a source gate test). The only network
  code is same-origin and opt-in: the PWA adapter and worker, and
  `<awa-viewer src>` (cross-origin refused).
- No HTML injection: no `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
  `document.write` in shipped sources (gate test). Markdown goes through
  `@awacloud/md`'s safe mode **and** fw `sanitize`, then an inert
  `DOMParser` document whose nodes are adopted; office text is set as text.
- Remote images in Markdown are not loaded (tracking pixels); their
  alternative text is shown and the omission recorded.
- Document images become `blob:` URLs owned by the View and revoked by
  `dispose()` — except SVG pictures, given as `data:` URLs: an SVG is a
  document that can hold script, and a same-origin `blob:` SVG opened in a
  tab would run it on the app's origin (a `data:` URL cannot be opened
  top-level).
- Links in documents: `http(s):` / `mailto:` open in a new context with
  `noopener noreferrer`; in-document `#` anchors stay, prefixed with the
  viewer's id like the ids they point to (Markdown headings get GitHub's
  anchors, so a README's table of contents works) and looked up inside the
  document only; any other scheme loses its `href`.
- The standalone page runs under fw sanity `base`, **verified in a browser
  for every format** (PDF clear and encrypted, DOCX, ODT, XLSX, ODS, PPTX,
  ODP, Markdown, text).

## 4. Visual design (awaforge identity)

- **Tokens only**: `--af-*` / `--fw-*` from the awaforge layer, dark by
  default, light under the reader's preference; the viewer's aliases are
  `--awv-*` (top of `viewer.css`). The one added palette is the paper
  (awaforge light values): a document page is paper in both schemes (a gate
  test lists every colour literal of the sheet).
- **Chrome**: the awaforge header band with the mono `>_` wordmark (page
  shell); the component's toolbar on `--af-surface`; the stage as a desk
  (`--af-bg` dark, `--af-rule` light); pages as paper sheets with
  `--af-shadow`.
- **Toolbar**: Open · Close · Previous / `3 of 12` / Next · Zoom out / zoom
  presets + Fit width / Zoom in / Fit width · Full screen · Download the
  original · Details. Icon buttons have an accessible name and the same
  tooltip; 36 px targets, 44 px under coarse pointers; document-only groups
  are hidden (not just disabled) on the empty state; under 30 rem the preset
  menu folds away.
- **Empty state**: the dropzone — "Drop a document here, or choose a file",
  the formats, "Your file stays on this device." (the family's privacy
  sentence).
- **Sheets**: grid on paper, sticky row / column headers, tabs under the
  grid (spreadsheet convention).
- **Motion**: CSS only, under `prefers-reduced-motion: no-preference`.
- **Mobile**: the component's grid is `minmax(0, 1fr)` (a wide page scrolls
  inside the stage, never widens the page); a document wider than the stage
  opens fitted to its width; container queries (not media queries) so an
  embedded viewer adapts to its slot.

## 5. Accessibility (WCAG 2.2 AA)

- One `role=region` per viewer, named after the open file; the scroll stage
  is `role=document` "Document content"; the toolbar is `role=toolbar` with
  one tab stop and arrow-key roving (fields keep their own arrows).
- Keyboard: `PageDown` / `PageUp`, `Ctrl+Home` / `Ctrl+End` (paged views and
  sheets only — they scroll natively in flow documents), `+` / `-` and
  `Ctrl` + wheel zoom, `Ctrl+O` open, sheet tabs `←` `→` `Home` `End`.
- PDF canvases are `aria-hidden`; the **text layer** carries the page text
  (runs merged into line segments, spaces and line breaks between them) so it
  is selectable and read by screen readers; each page is a `role=group`
  "Page 3 of 12".
- Flow documents are real DOM: headings (style outline levels, demoted by
  `headingOffset` under the page's own `h1`), `ol` / `ul` lists (ODT), tables.
  Slides are real DOM text too.
- Status (opening, opened + length, page on explicit navigation, zoom)
  through fw `a11y.announce`; errors in `role=alert`, sentence first, code in
  `<small>`, then "Try another file".
- Contrast from the tokens in both schemes; focus ring 2 px accent.

## 6. i18n

fw `i18n` with two catalogs (`en`, `fr`). Locale: `opts.locale` → the
host's `lang` → `navigator.languages` → `en`; the standalone page remembers
the reader's choice (fw `storage`). Every UI string goes through `t()` /
`tn()` (a test checks every literal key exists); numbers, zoom percentages,
file sizes and spreadsheet values through `Intl` in the active locale.
Document content is never translated; its own language is set on the
rendered nodes where the file declares it.

## 7. Delivery (done)

| Step | State |
|---|---|
| Shell, intake, text, Markdown, PWA | done |
| PDF canvas painter + text layer + links + annotation appearances | done |
| Embedded TrueType outlines; encrypted PDFs without a reading password | done |
| DOCX / ODT painters | done |
| XLSX / ODS grids (+ number formats) | done |
| PPTX / ODP slides | done |
| Embedding (element + API), legacy-binary detection | done |
| Build (`dist/`), offline from the first visit, sanity on the standalone page | done |

Second quality pass (2026-10-10): hostile-input fuzzing (mutated fixtures
and corpus, targeted bombs: no hang, no unhandled error, never stuck
loading), image fixtures for every picture path, browser captures of every
format, accessibility and performance censuses, the built dist under its
CSP. Fixes are in the git history, one commit each.

Coverage pass (2026-10-17), after the office packages' own coverage work:
sRGB shape fills (painted with no fill before) and typed colour
transforms on fills and runs; picture crops from the typed models, in
headers, footers, layouts and masters too (the pptx reader now gives
layout and master pictures their image); the typed slide size, including
the `p:sldSize` that ooxml 1.0.0 wrote; XLSX row heights and hidden rows;
ODS collapsed and filtered rows and columns; DOCX run faces per script and
list levels that keep their style's numbering; a "too large or too
complex" message for the packages' size and nesting refusals, with the
package code.

Next candidates: CFF / Type 1 embedded fonts (name-keyed CFF charstrings
now decode every path operator), charts (Office chart series now read
from their caches), a password prompt for encrypted PDFs, automatic
pagination of flow documents, tiling patterns and soft masks, DOCX drawn
shapes, text search over the text layer, and the `msoff` parser for DOC /
XLS / PPT.
