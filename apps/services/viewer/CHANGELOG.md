# Changelog

All notable changes to `@awacloud/viewer` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See [`README.md`](./README.md) for the usage guide.

## [0.1.0] — 2026-10-19

### Added

- **PDF.** One canvas per page, drawn when it nears the screen: vector
  paths, colour spaces, images, shadings, embedded TrueType outlines and
  annotation appearances, with a selectable text layer that screen readers
  read and web links that can be clicked. A file encrypted without a
  reading password opens; a file that needs a password is refused with an
  explanation.
- **Word processing (DOCX, ODT).** Paper sheets with the style cascade,
  lists with real counters, tables (widths, merged cells, borders,
  shading), images, links and footnotes (DOCX), cut at explicit page
  breaks.
- **Spreadsheets (XLSX, ODS).** One grid per visible sheet with sticky row
  and column headers, column widths, row heights, merged cells and cell
  styles; hidden rows and columns are left out and values are shown as last
  saved, XLSX number formats in the reader's locale.
- **Presentations (PPTX, ODP).** One page per slide, real text scaled per
  zoom, with layout and master inheritance, theme colours, backgrounds,
  pictures and tables (PPTX).
- **Markdown and plain text.** A paper sheet for Markdown, rendered in
  safe mode with remote images not loaded, and for `.txt`, `.csv` and
  `.log` files.
- **Legacy Office files (DOC, XLS, PPT).** Detected and explained; they are
  not drawn.
- **Honest reporting.** Whatever a view cannot draw is counted and listed
  under "Document details", "What this view leaves out"; an empty list says
  "no omission recorded".
- **An embeddable component.** `mountViewer()` mounts AWA Viewer inside
  any page and the `<awa-viewer>` element does the same from markup, with
  `locale` and `headingOffset` options, open, error and close callbacks,
  keyboard control on its own element and light DOM so the host's design
  tokens apply. It owns no route and never touches the page's location or
  history.
- **An installable PWA.** The standalone page declares file handlers, so an
  installed AWA Viewer opens PDF, Office, OpenDocument, Markdown and text files
  from the system, one window per file; files dropped together open the
  first and offer the others in new windows, one per click. A release is
  pre-cached whole at install and served cache-first, so AWA Viewer works
  offline after its first visit, and an update installs beside the running
  one and waits for "Update now" or "Later". Documents never pass through
  the service worker.
- **A help panel.** A modal panel over the app, closed by its button or
  Escape, in English and French: how to open and read, keyboard shortcuts,
  installing in each browser, updates and offline use. It works offline.
- **Showcase samples.** Six sample documents (PDF, Word, OpenDocument,
  Excel, PowerPoint, Markdown) in the reader's language, opened on demand
  from the page under the dropzone.

Live on `viewer.awacloud.com` since 2026-10-19.
