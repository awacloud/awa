# Changelog

All notable changes to `@awacloud/notepad` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See [`README.md`](./README.md) for the usage guide.

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
