# @awacloud/viewer

AWA Viewer opens a document and shows it on your device. A browser-only
document viewer for PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX),
OpenDocument (ODT, ODS, ODP), Markdown and plain text — an installable PWA on
its own, or a component inside any page of a site. Nothing is uploaded.

Design and architecture: [`docs/design.md`](docs/design.md).

## Install

Part of the monorepo workspaces (`apps/services/*`):

```bash
bun install
```

Runtime dependencies are monorepo packages only (`workspace:*`): `@awacloud/fw`,
`pdf`, `ooxml`, `odf`, `md`, `fonts`, `oconv`. No npm package runs in the page.

Not published to the npm registry: AWA Viewer is published as source only, in
the public repository ([`apps/services/viewer`](https://github.com/awacloud/awa/tree/main/apps/services/viewer)).
To embed it today, serve those sources with the monorepo packages it imports
and map them with an import map, as [`examples/embed.html`](examples/embed.html)
does. An embeddable library package is planned.

## Quick start

In a page:

```js
import { mountViewer } from '@awacloud/viewer';

const viewer = mountViewer(document.querySelector('#doc'), { locale: 'fr', headingOffset: 2 });
await viewer.open(file);          // File | Blob | { name, bytes }
viewer.setLocale('en');
viewer.destroy();                 // removes everything it added
```

or as markup:

```html
<link rel="stylesheet" href="…/src/styles/viewer.css">
<awa-viewer src="/docs/report.pdf" locale="fr" style="height: 80vh"></awa-viewer>
<script type="module">
    import { defineViewerElement } from '@awacloud/viewer/element.js';
    defineViewerElement();
</script>
```

The host gives the viewer a height and links `viewer.css` (plus
`tokens.css` when the site does not already carry the awaforge tokens). The
viewer owns no route, never touches `location` / `history`, binds its keys on
its own element, and uses light DOM so the host's tokens apply. `src` opens a
same-origin document only.

| Option | Default | Meaning |
|---|---|---|
| `locale` | host `lang`, then the browser | `en` or `fr` |
| `headingOffset` | `1` | levels a document's headings move down under the page outline |
| `runtime` | a new `ModuleRuntime` | an fw runtime to share with a host that runs fw |
| `onOpen`, `onError`, `onClose` | — | callbacks (`<awa-viewer>` dispatches `awa-viewer-open` / `awa-viewer-error`) |

Serve the **repository root** while developing: the browser resolves
`@awacloud/*` through an import map against `/packages/…`, with no bundler.

```bash
bun cli.ts local_web --dir . --port 8793 --no-cert
```

- standalone PWA: `http://localhost:8793/apps/services/viewer/public/`
- embedding demo: `http://localhost:8793/apps/services/viewer/examples/embed.html`

## What it shows

| Family | Formats | View |
|---|---|---|
| Portable | PDF | one canvas per page, drawn when it nears the screen — vector paths, colour spaces, images, shadings, embedded TrueType outlines, annotation appearances — with a selectable text layer read by screen readers and clickable web links; files encrypted without a reading password open |
| Word processing | DOCX, ODT | paper sheets: style cascade, lists with real counters, tables (widths, merged cells, borders, shading), images, links, footnotes (DOCX), cut at explicit page breaks |
| Spreadsheet | XLSX, ODS | one grid per visible sheet, sticky row / column headers, column widths, row heights, hidden rows and columns left out, merged cells, cell styles, values as last saved (XLSX number formats in the reader's locale) |
| Presentation | PPTX, ODP | one page per slide, real DOM text scaled per zoom: layout / master inheritance, theme colours, backgrounds, pictures, tables (PPTX) |
| Text | Markdown, `.txt` / `.csv` / `.log`… | a paper sheet; Markdown through `@awacloud/md` in safe mode, remote images not loaded |
| Legacy | DOC, XLS, PPT (97–2003) | detected and explained — no parser exists in the repository yet (`packages/front/office/msoff`) |

Whatever a view cannot draw is counted and listed under **Document details →
What this view leaves out** (honest reporting: an empty list says "no
omission recorded", never "nothing lost").

## Keyboard

| Keys | Action |
|---|---|
| `Tab` | toolbar (one stop; `←` `→` `Home` `End` inside), then the document |
| `PageDown` / `PageUp`, `Ctrl+Home` / `Ctrl+End` | next / previous / first / last page or slide (documents and sheets scroll natively) |
| `+` / `-` / `0`, `Ctrl` + wheel | zoom in / out / 100 % (`Ctrl` + `+` stays the browser's own zoom) |
| `Ctrl+O` | open a file |
| `←` `→` on the sheet tabs | change sheet |

## Standalone PWA

### Build

```bash
cd apps/services/viewer && bun run build
```

`site-kit app-dist` makes a self-contained `dist/` (page, sources, the
licence pair and vendored licence notices from the import map), the demos'
`bundle-js` folds the module graph into one minified `src/main.js` (~2 MB;
the import map stays as the licensing manifest), `tools/build-csp.js` adds
the page's CSP, and `tools/build-sw.js` bundles the service worker with a
content version and the app-shell pre-cache list.
The build and the test suite run from the full awa monorepo toolchain: they
read `tools/site-kit`, `apps/demo/_build/`, `apps/services/tools/`,
`services/site-host/` and `apps/awaforge/assets/`, which the public
repository does not carry.
Serve it at an origin root:

```bash
bun tools/site-kit/src/index.ts serve --dist apps/services/viewer/dist --no-vendor --port 8794
```

The build also gives the page a Content Security Policy (`tools/build-csp.js`:
own origin only, no frame or plugin, scripts limited to the bundle and the
hashed import map, document images as `blob:`).

The standalone page hardens its realm with fw sanity `base` (`src/sanity.js`,
imported first by `src/main.js`; `data-sanity` on the viewer element says
whether it applied). The embeddable component never does: hardening a realm
is the host page's decision.

### PWA

`public/manifest.webmanifest` declares file handlers (an installed viewer
opens PDF, Office, OpenDocument, Markdown and text files from the system),
one window per file (`launch_type: multiple-clients`, `client_mode:
navigate-new`). Files chosen or dropped together inside the page: the
first opens, the others wait on a "more files" line and each "Open … in a
new window" click opens one in a new window, the file handed over through
IndexedDB (`src/core/handoff.js`; fw sanity blocks `window.open`, and a
browser allows one new window per click). The embeddable component hands
the extra files to its host (`onMore`), or says how many it left.
`public/sw.js` pre-caches a release at install — every file the page needs
and the licence texts, the list and the content version the build injects —
and serves it cache-first, so a built viewer works offline from its first
visit and always runs one release whole; the page shows "Works offline once
visited." only once the worker controls it. Documents never pass through the
worker.

Updates never break a running page: a new release installs beside the old
one and waits; the page shows "A new version of the viewer is ready" with
**Update now** / **Later**, and only **Update now** lets it take over and
reloads (then the old release's cache is deleted). `src/core/pwa.js` also
checks on demand (`checkForUpdates()`: current, ready or offline) and asks
the worker which release it serves (`version()`). From the sources (no
build) the worker stays network-first, so development runs the code on
disk. Host `sw.js` uncached (`Cache-Control: no-cache`) at a stable URL.

### Help

The toolbar ends with **Help** when the host passes `onHelp`; the page
shows its help over the app, in a modal panel closed by its button or
Escape (`src/core/help.js`, the same module as AWA Notepad's): how to open
and read, the keyboard shortcuts, how to install in each browser and open
files with the app, updates, offline use, in the reader's language. The
text is `public/help/{en,fr}.html` — whole pages that still open on their
own (their sheet `help.css` is AWA Notepad's too) — whose `<main>` the
panel rebuilds from a short list of text elements (nothing injected; the
contents links scroll inside the panel). Pre-cached by the worker like the
rest of the shell, so Help works offline. The About panel keeps the
licences, the version and the update check.

### Showcase samples and page metadata

Under the dropzone, "No document at hand? Try a sample: PDF · Word ·
OpenDocument · Excel · PowerPoint · Markdown" opens one of six documents
from `public/samples/{en,fr}/` in the reader's language, each presenting
one of our licences with the web site's own copy, each designed in the
apps' palette and made by the licence it presents: `awa-pdf.pdf` (AWA PDF:
a brochure drawn with the PDF builder, Liberation Sans embedded),
`awa-office.docx` (AWA Office: a brochure from the Word writer — styles,
header with the logo, footer, shaded tables), `awa-convert.odt` (AWA
Convert: written in Markdown, converted, then given a reference stylesheet
as a template would), `offers.xlsx` (a styled price list, frozen header)
and `offers.pptx` (a presentation — a cover, the four offers as cards, a
slide per offer, a call to action), `awa-markdown.md` (AWA Markdown, with
its own code example). `tools/designs.js` lays the PDF, Word and
OpenDocument ones out. Each says its terms as "Commercial licence or
AGPL-3.0-only." The page loads them
(same origin, on demand; the worker keeps them once opened); the component
only offers them (`samples` option) and says in its details that a sample
is one. `bun run samples` (`tools/build-samples.js`) rebuilds them from the
site's offer pages (`apps/awacloud/content/pages/offers*.json`) through
oconv and the ooxml writers; a guard test rebuilds and compares, so a
change on the site reddens it until they are rebuilt.

The page carries Open Graph and Twitter tags (`og:image` is
`screenshots/share.png`, 1200 × 630, a screenshot of the app), a JSON-LD
`SoftwareApplication` (free, any browser) and a `<noscript>` line; the
canonical link is added at build from `og:url` (`tools/build-csp.js`), as
`site-kit app-dist` refuses an external link in the source page.
`apps/services/tools/screenshots.mjs` re-shoots the install and share
screenshots.

## Tests

```bash
bun test apps/services/viewer/
```

Unit and Happy-DOM tests co-located in `src/`: format detection, catalogs,
number formats, every painter on real files (the office corpus plus this
app's fixtures), the PDF interpreter against a recording 2D context, the
controller end to end, and source gates (no network, no HTML injection,
import-map targets, the token copy). Canvas rendering and layout are checked
in a browser.

```bash
cd apps/services/viewer && bunx eslint --no-warn-ignored .
```

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
| `src/viewer.js` | `mountViewer()` — the public API and controller |
| `src/element.js` | `defineViewerElement()` — `<awa-viewer>` |
| `src/app.js`, `src/main.js`, `src/sanity.js` | the standalone page (language menu, PWA, realm hardening) |
| `src/core/` | `detect` (magic bytes), `runtime` (lazy engines on one fw runtime), `i18n` (fw `i18n` + negotiation), `pwa` |
| `src/i18n/` | `en` (reference) and `fr` catalogs |
| `src/ui/` | `stage` (zoom, lazy pages, sheets), `toolbar` (WAI-ARIA), `intake` (drop / picker), `info` (details and omissions) |
| `src/render/` | the painters: `text`, `markdown`, `docx`, `odt`, `sheet` (+ `numfmt`), `slides`, `pdf/` (`pdf`, `paint`, `colour`, `image`, `glyphs`, `decrypt`, `objects`), shared `dom`, `view`, `html`, `flow`, `odf-style`, `odf-text`, `clock` (time slicing) |
| `tools/build-csp.js`, `tools/build-sw.js` | build steps: the page's CSP; the bundled, versioned, pre-caching service worker |
| `tools/build-icons.js` | `bun run icons`: draws `public/icons/*.png` (`any` and `maskable`, 192 and 512 px, the 180 px Apple touch icon) from the shapes of `icon.svg`, through the shared `../tools/icons.js`; a guard test redraws and compares |
| `src/styles/` | `tokens.css` (awaforge copy), `viewer.css` (component), `app.css` (standalone page) |
| `public/` | `index.html`, manifest, service worker, icons |
| `examples/embed.html` | the viewer inside a host page (element + script call) |

## Known limits

- Size: a document over 256 MiB is refused before it is read (a tab would
  not survive it); a text file shows its first 5 million characters and
  reports the rest. PDF pages are drawn as they near the screen, so the
  browser's own Find (Ctrl+F) and a screen reader reach the drawn pages
  only; there is no search inside the viewer yet.
- A page whose drawing fails says so on the page and is counted under
  "What this view leaves out".
- PDF: embedded TrueType programs are drawn from their own outlines; CFF and
  Type 1 programs are not parsed yet (text drawn glyph by glyph with a
  matching system face, at the PDF's own positions, and reported). Encrypted
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
| `@awacloud/viewer` | `src/viewer.js` | `mountViewer()`, `detect`, `negotiateLocale`, `LOCALES` |
| `@awacloud/viewer/element.js` | `src/element.js` | `defineViewerElement()` |
| `@awacloud/viewer/viewer.css` | `src/styles/viewer.css` | component sheet |
| `@awacloud/viewer/tokens.css` | `src/styles/tokens.css` | awaforge token layer, when the host has none |

## Maturity

L1 (`awa.maturity` in `package.json`): README, co-located unit and Happy-DOM
tests over every painter on real files, flat `src/` layout; canvas rendering
and layout are checked in a browser. Published as source only (GitHub), not
on the npm registry.

## Licence

`AGPL-3.0-only`, see [`LICENSE`](./LICENSE). A commercial licence is also
available: AWA Viewer is included in the AWA Convert licence
(https://awacloud.com/offers/convert); [`NOTICE`](./NOTICE) gives the contact.

Copyright (c) 2026 AwaCloud SAS

## Links

- Website: https://viewer.awacloud.com/
- Source: [`apps/services/viewer`](https://github.com/awacloud/awa/tree/main/apps/services/viewer)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/main/SECURITY.md
- Documentation: [design and architecture](./docs/design.md)
- Offers: https://awacloud.com/offers/convert (AWA Convert)
