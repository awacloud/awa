<!--
  Copyright (c) 2026 AwaCloud SAS
  Author: Matthieu Bouilloux
  SPDX-License-Identifier: AGPL-3.0-only
  Dual-licensed; see the NOTICE file for licensing and any additional terms.
-->

# @awacloud/notepad

AWA Notepad: a plain-text editor in the browser, an installable PWA that works offline once visited. Files are opened and saved on the device; nothing is uploaded.

AWA Notepad is a plain-text editor in the browser — a Windows Notepad replacement. An
installable PWA that works offline once visited. Files are opened and saved
on the device; nothing is uploaded. Same shape as `apps/services/viewer/`:
KISS, no dependency outside the monorepo, built on `@awacloud/fw`.

## Install

In the awa development tree, the root `bun install` links the workspace; that
tree is not what the public repositories carry (see [Tests](#tests)).
Not published to the npm registry: the notepad is published as source only. Its
source is public in the awa monorepo
([`apps/services/notepad`](https://github.com/awacloud/awa/tree/main/apps/services/notepad))
and as a derived, read-only repository of the application source; issues are
tracked in the monorepo.

## Quick start

Browser-only (the editor needs a DOM; `@awacloud/notepad` resolves through
`exports` `.` → `src/notepad.js`):

```js
import { mountNotepad } from '@awacloud/notepad';
const notepad = mountNotepad(document.querySelector('#editor'), { locale: 'fr' });
await notepad.open(file, handle);   // handle optional
await notepad.save();
notepad.destroy();
```

Link `tokens.css` (or the host's awaforge layer) and `notepad.css`. The
component never touches `location`, `history` or `document.title`, and binds
its keys on its own element.

In the awa development tree, serve the repository root and open
`/apps/services/notepad/public/`; the dev server is that tree's tooling, not
runnable from the published repositories at this release.

## Features

- New, Open, Save (back to the same file through the File System Access API),
  Save as. Without that API (Firefox, Safari, phones) the toolbar says what
  happens — **Download a copy** — and the first time, why: a browser
  without it cannot write back to the opened file. Drop a file to open it.
  Installed, the app opens `.txt`, `.md`, `.json`, `.log`, source and
  configuration files… from the system, each in a window of its own;
  several files chosen or dropped together open the first here, and each
  of the others in a new window, one per click (handed over through
  IndexedDB, file handle included).
- The document's name sits in the toolbar; click it to rename in place
  (the extension kept out of the selection). With a file handle that can
  move, the file itself is renamed; otherwise the name is the next save's.
- Encodings: UTF-8, UTF-8 with BOM, UTF-16 LE / BE, Windows-1252 — detected
  on open (BOM, then strict UTF-8, else Windows-1252), changeable in the
  status bar. Saving characters Windows-1252 cannot hold asks first.
- Line endings: CRLF, LF, CR — detected, kept, changeable.
- Find / Replace (literal, match case, wraps): every match marked over the
  text as you type the search, the current one outlined, "Match 3 of 12",
  the text scrolled to it (up to 1 M characters every match is marked;
  above, the current one). Go to line, F5 inserts the date and time, word
  wrap, text size (Ctrl + wheel too).
- Undo / redo of its own (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z, and the context
  menu): typing and deleting group into steps; Insert date, Replace and
  Replace all are steps too (a script edit wipes a textarea's own undo, and
  fw sanity blocks `execCommand`). Back at the saved text, the document is
  clean again.
- Tab in the text inserts a tab (a selection over several lines is
  indented), Shift+Tab outdents (a leading tab, or up to four spaces), each
  one Undo step. To leave the text by keyboard: Escape, then Tab or
  Shift+Tab moves the focus as in a page; or Ctrl+M, which switches Tab
  between "inserts a tab" and "moves the focus" (shown in the status bar,
  kept for the session only).
- Binaries and files over 16 MiB are refused, not mangled — by their size,
  before a byte is read. From 2 MiB a file is read as a stream, its
  progress in the status bar with Cancel; from 4 MiB the status bar says
  typing may be slow (measured: a bare textarea already takes about 120 ms
  a key at 8 MB in Chromium). A text over a million characters is written
  in pieces, never copied whole once more.
- The unsaved-changes question on New / Open, the browser's own on leaving,
  and a recovery journal: unsaved text comes back after the window was
  closed, crashed or reloaded for an update — kept on the device in
  IndexedDB as the text's base plus the changes typed since (written only
  when there is something to lose, dropped once saved), one session per
  window (Web Locks), with the file handle where the browser keeps it.
- English and French; keyboard first (Ctrl+N/O/S/Shift+S/F/H/G/M, F3, Tab, Escape).
- Offline once visited, and updates that wait for you: a new release
  installs beside the running one; "A new version is ready" offers **Update
  now** (the unsaved text comes back as a draft after the reload) or
  **Later**. Same worker design as the viewer's (`public/sw.js`, a script
  over fw's `precache`: a versioned, cache-first release with the licence
  texts; network-first from the sources; the page side, `src/core/pwa.js`, is
  a thin adapter over fw's `installPrompt` and `swUpdate`). Host `sw.js`
  uncached at a stable URL.
- **Help** at the end of the toolbar (when the host passes `onHelp`) shows
  the help over the editor, in a modal panel closed by its button or Escape
  (`src/core/help.js`, the viewer's module): open, save and rename, find
  and undo, encodings, the keyboard shortcuts, recovery, installing in each
  browser, updates, offline use. Its text is `public/help/{en,fr}.html`
  (pages that also open on their own, with the viewer's `help.css`),
  pre-cached with the shell; the About panel keeps the licences, the
  version and the update check.

## Page metadata

Open Graph and Twitter tags (`og:image`: `screenshots/share.png`,
1200 × 630, a screenshot of the app), a JSON-LD `SoftwareApplication`
(free, any browser) and a `<noscript>` line; the canonical link is added
at build from `og:url` (`tools/build-csp.js`).

## Icons on Windows

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
`chrome://apps` → right-click AWA Notepad → **Create shortcuts** repairs it.

## fw modules used

`i18n`, `a11y` (announcements), `keybindings`, `fsAccess` (pickers, writes),
`fileIntake` (the fallback picker and the file drop), `download`, `focus`
(dialog focus return), `utf8` + `ui8` (UTF-8 bytes), `str.escapeRegExp`
(literal search), `date` (F5 stamp), `storage` (prefs), `indexedDB`
(recovery journal), `serviceWorker`, `installPrompt` (install button, files
the system opens the app with), `swUpdate` (waiting-release update flow),
`cache` + `precache` (worker), sanity `base` (standalone page); the build
tools hash with `webcryptoDigest` + `b64` / `hex` and draw the PNG icons with
`zlib` + `crc32`.
What fw does not have stays small and local: strict UTF-8 detection, UTF-16
and Windows-1252 codecs, line-ending handling.

## Tests

The commands below are the application's own scripts as they run in the awa
development tree. At this release they are not runnable from the published
repositories (see the end of this section).

```sh
bun test .            # unit + Happy-DOM tests
bun run lint
bun run build         # dist/: bundle, CSP, offline service worker (versioned release), then the .gz twins (gzip-dist, last)
bun run icons         # redraw public/icons/*.png (any, maskable, Apple touch) and public/favicon.ico from icon.svg's shapes
```

The build and the test suite read `tools/site-kit` (run through the root
`cli.ts`), `apps/demo/_build/`, `apps/services/tools/`, `services/site-host/`
and `apps/awaforge/assets/`, which the public repositories do not carry.

Rebuilding from source: the repository publishes the complete sources of this
application (`src/`, `public/`, the tests and the application's own build
steps in `tools/`). The tools for a complete rebuild are coming (work in
progress). At this release a rebuild is not possible from the published
repositories, the published public monorepo included.

## Maturity

L1 (`awa.maturity` in `package.json`): README, co-located unit and Happy-DOM
tests, flat `src/` layout.

## Licence

`AGPL-3.0-only`, see [`LICENSE`](./LICENSE). A commercial licence is also available;
[`NOTICE`](./NOTICE) gives the contact.

Copyright (c) 2026 AwaCloud SAS

## Links

- Website: https://notepad.awacloud.com/
- Source: [`apps/services/notepad`](https://github.com/awacloud/awa/tree/main/apps/services/notepad)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/main/SECURITY.md
- Developer site (the libraries this application is built on): https://awaforge.eu/
