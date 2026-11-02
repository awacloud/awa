# @awacloud/viewer

AWA Viewer opens a document and shows it on your device. A browser-only
document viewer for PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX),
OpenDocument (ODT, ODS, ODP), Markdown and plain text — an installable PWA on
its own, or a component inside any page of a site. Nothing is uploaded.

This package is the standalone application: the installable, offline PWA
shell. The viewer itself — the component, the painters and the stylesheets —
is [`@awacloud/oview`](https://github.com/awacloud/awa/tree/main/packages/front/office/oview). Design and architecture:
[`docs/design.md`](https://github.com/awacloud/awa/blob/main/packages/front/office/oview/docs/design.md) of that package.

## Install

Part of the monorepo workspaces (`apps/services/*`):

```bash
bun install
```

Runtime dependencies are monorepo packages only (`workspace:*`): `@awacloud/fw`,
`oview` (the viewer core), `pdf`, `ooxml`, `odf`, `md`, `fonts`, `oconv`. No npm
package runs in the page.

Not published to the npm registry: AWA Viewer is published as source only, in
the public repository ([`apps/services/viewer`](https://github.com/awacloud/awa/tree/main/apps/services/viewer)).
To embed the viewer in your own page, use
[`@awacloud/oview`](https://github.com/awacloud/awa/tree/main/packages/front/office/oview), not this application.

## Quick start

Embedding: [`@awacloud/oview`](https://github.com/awacloud/awa/tree/main/packages/front/office/oview) (`mountViewer`, `<awa-viewer>`).

```js
import { mountViewer } from '@awacloud/oview';

const viewer = mountViewer(document.querySelector('#doc'), { locale: 'fr' });
await viewer.open(file);          // File | Blob | { name, bytes }
```

The options, the markup form and the embedding notes are in the package README.

Serve the **repository root** while developing: the browser resolves
`@awacloud/*` through an import map against `/packages/…`, with no bundler.

```bash
bun cli.ts local_web --dir . --port 8793 --no-cert
```

- standalone PWA: `http://localhost:8793/apps/services/viewer/public/`

## What it shows

PDF, Word, Excel, PowerPoint, OpenDocument, Markdown and text, with an honest
list of whatever a view cannot draw: see "What it shows" in the
[`@awacloud/oview` README](https://github.com/awacloud/awa/tree/main/packages/front/office/oview#what-it-shows).

## Keyboard

The viewer's keys (toolbar, pages, zoom, open, sheet tabs) are listed in the
[`@awacloud/oview` README](https://github.com/awacloud/awa/tree/main/packages/front/office/oview#keyboard).

## Standalone PWA

### Build

```bash
cd apps/services/viewer && bun run build
```

`site-kit app-dist` makes a self-contained `dist/` (page, sources, the
licence pair and vendored licence notices from the import map), the demos'
`bundle-js` folds the module graph into one minified `src/main.js` (~2 MB;
the import map stays as the licensing manifest), `tools/build-csp.js` adds
the page's CSP, `tools/build-sw.js` bundles the service worker with a
content version and the app-shell pre-cache list, and the demos'
`gzip-dist` writes a gzip-9 `.gz` twin for every file of 512 B or more that is not already compressed (`src/main.js` ~2.2 MB → ~0.63 MB), which
`services/site-host` serves to a client that accepts gzip. It runs last,
so no twin is older than the file it compresses; the pre-cache list names
no `.gz` (the browser decodes).
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
browser allows one new window per click). The component hands the extra
files to its host (`onMore`).
`public/sw.js` is a fw `precache` worker: it pre-caches a release at install —
every file the page needs and the licence texts, the list and the content
version the build injects — and serves it cache-first, so a built viewer works offline from its first
visit and always runs one release whole; the page shows "Works offline once
visited." only once the worker controls it. Documents never pass through the
worker.

Updates never break a running page: a new release installs beside the old
one and waits; the page shows "A new version of the viewer is ready" with
**Update now** / **Later**, and only **Update now** lets it take over and
reloads (then the old release's cache is deleted). `src/core/pwa.js` wires
fw's `installPrompt` (the install button, the launch queue) and `swUpdate`
(the worker's updates); the About panel checks on demand (`checkForUpdates()`:
current, ready or offline) and asks the worker which release it serves
(`version()`). From the sources (no
build) the worker stays network-first, so development runs the code on
disk. Host `sw.js` uncached (`Cache-Control: no-cache`) at a stable URL.

### Icons on Windows

Chrome on Windows does not use a site's `.ico` for an installed app: at
install it writes its own `.ico` into the profile
(`…\User Data\<profile>\Web Applications\…`) from the manifest's icons,
and the shortcut runs `chrome_proxy.exe` with that icon. So the manifest
lists the exact Windows sizes — 16, 32, 48 and 256 px PNGs beside 192 and
512 — and Chrome no longer downsamples the 192 px tile for them;
`public/favicon.ico` (the same four tiles, PNG images in an ICO, drawn by
`bun run icons`) serves the tab, the bookmark and the shortcut fallbacks.
Whether this ends the reported loss of an installed app's icon is **not
proved**. When it recurs, look for Chrome's `.ico` in that folder: present,
the Windows icon cache lost it; absent, Chrome removed it. Either way,
`chrome://apps` → right-click AWA Viewer → **Create shortcuts** repairs it.

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
bun test ./apps/services/viewer/
```

Unit and Happy-DOM tests co-located in `src/` and `tests/`: the page boot
(`app.test.js`), the panels (About, Help, more files, handoff), the PWA
adapter over the real fw `installPrompt` and `swUpdate` modules, the shell
translator and catalogs, the service worker in a fake worker scope, the
samples opened through the component, the build's CSP step, and source gates
(no network, no HTML injection, import-map targets, the derived stylesheets).
The component's own tests (format detection, every painter on real files, the
PDF interpreter, the controller) run in `@awacloud/oview`. Canvas rendering
and layout are checked in a browser.

```bash
cd apps/services/viewer && bunx eslint --no-warn-ignored .
```

## Layout

| Path | Role |
|---|---|
| `src/app.js`, `src/main.js`, `src/sanity.js` | the standalone page (language menu, PWA, realm hardening) over `@awacloud/oview` |
| `src/core/` | `about`, `help`, `more` and `handoff` (the page's panels), `i18n` (the page's translator), `pwa` (adapter over fw `installPrompt` and `swUpdate`) |
| `src/i18n/` | `en` (reference) and `fr` catalogs of the page shell |
| `src/styles/` | `app.css` (standalone page); `tokens.css`, `viewer.css` — derived copies of the package's, pinned by the guards test |
| `public/` | `index.html`, manifest, service worker (fw `precache`), icons, help pages, samples |
| `tools/build-csp.js`, `tools/build-sw.js` | build steps: the page's CSP; the bundled, versioned, pre-caching service worker |
| `tools/build-icons.js` | `bun run icons`: draws `public/icons/*.png` (`any` 16, 32, 48, 192, 256 and 512 px, `maskable` 192 and 512 px, the 180 px Apple touch icon) and `public/favicon.ico` from the shapes of `icon.svg`, through the shared `../tools/icons.js`; a guard test redraws and compares |
| `tools/build-samples.js`, `tools/designs.js` | `bun run samples`: the showcase documents |

## Known limits

What the viewer cannot draw yet (PDF fonts and shadings, pagination, charts,
legacy Office files, size limits) is listed in the
[`@awacloud/oview` README](https://github.com/awacloud/awa/tree/main/packages/front/office/oview#known-limits).

## Exposed sub-paths

This package exposes no library surface; embed `@awacloud/oview`.

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
- Documentation: [design and architecture](https://github.com/awacloud/awa/blob/main/packages/front/office/oview/docs/design.md) (`@awacloud/oview`)
- Offers: https://awacloud.com/offers/convert (AWA Convert)
