# Changelog

All notable changes to `@awacloud/notepad` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See [`README.md`](./README.md) for the usage guide.

## [Unreleased]

### Added

- **Icons Windows draws without downsampling.** The manifest lists 16, 32,
  48 and 256 px icons beside 192 and 512 px, for the `.ico` Chrome writes
  when the app is installed on Windows, and the pages link a multi-size
  `favicon.ico` (16 to 256 px). All drawn by `bun run icons` from the
  shapes of `icon.svg`. The README says what this does and does not prove
  about the lost-icon symptom, and how to repair a lost icon.

### Changed

- **Precompressed JavaScript.** `bun run build` now ends with the demos'
  `gzip-dist` step: every file of 512 B or more that is not already
  compressed gets a gzip-9 `.gz` twin (`src/main.js` 121,544 B →
  42,115 B), which the site host serves to a client that accepts gzip.
  The service worker's pre-cache list is unchanged (no `.gz`).
- The file picker fallback and the OS file drop, the install prompt, the update flow
  and the service worker now use `@awacloud/fw`'s `fileIntake`, `installPrompt`,
  `swUpdate` and `precache`; behaviour unchanged.

### Fixed

- `public/sw.js` is valid UTF-8 again: two em dashes in its comments had
  been saved as Windows-1252 bytes. A guard test now checks that every
  text file under `public/` decodes as UTF-8.

## [0.1.0] — 2026-10-19

### Added

- **Open and save through the File System Access API.** New, Open, Save
  (back to the same file), Save as and rename in place; drop a file to open
  it. Without that API (Firefox, Safari, phones) the toolbar offers
  "Download a copy" and says why, since such a browser cannot write back to
  the opened file. Installed, AWA Notepad opens `.txt`, `.md`, `.json`, `.log`,
  source and configuration files from the system, each in its own window.
- **Encodings and line endings.** UTF-8, UTF-8 with BOM, UTF-16 LE and BE
  and Windows-1252, detected on open and changeable in the status bar;
  saving characters Windows-1252 cannot hold asks first. CRLF, LF and CR
  are detected, kept and changeable.
- **Find and replace.** Literal search with match case and wrap, every
  match marked over the text as you type, "Match 3 of 12", plus Replace,
  Replace all, Go to line, word wrap and text size.
- **Undo and redo.** An undo history of its own: typing and deleting group
  into steps, and Insert date, Replace and Replace all are steps too; back
  at the saved text, the document is clean again.
- **Safe with large and binary files.** Binaries and files over 16 MiB are
  refused before a byte is read; from 2 MiB a file is read as a stream with
  progress and Cancel in the status bar.
- **A recovery journal.** Unsaved text comes back after the window was
  closed, crashed or reloaded for an update, kept on the device (written
  only when there is something to lose and dropped once saved), one session
  per window.
- **An installable PWA that works offline.** A release is cached whole and
  served cache-first, so AWA Notepad works offline after its first visit;
  an update installs beside the running one and waits for "Update now"
  (the unsaved text comes back as a draft after the reload) or "Later".
- **A help panel.** A modal panel over the editor, closed by its button or
  Escape, in English and French: open, save and rename, find and undo,
  encodings, keyboard shortcuts, recovery, installing in each browser,
  updates and offline use.

Live on `notepad.awacloud.com` since 2026-10-19.
