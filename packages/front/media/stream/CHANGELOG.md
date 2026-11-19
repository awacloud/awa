# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package is **not yet published**: the entries below describe its
first public surface.

## [Unreleased]

### Added

- **The frame around each unit a media stream sends** (`media.frame`):
  a 12-byte header — kind, layer, key id, a per-layer sequence, a media
  time, flags — then the payload; a writer that keeps the smaller of
  deflated or stored; `header()`, a relay's view without the payload;
  `read()`, which refuses a damaged frame and caps what it inflates.
- **A loss counter** (`createTracker()`): per layer, the frames missing
  before each one that comes, the late ones and the repeats, across the
  2³² wrap; a far jump starts the layer again, and a layer can be
  forgotten when a relay gives it back.
- **Room for end-to-end encryption**: an encrypted flag and a key id in
  the header, reserved for a later release.
