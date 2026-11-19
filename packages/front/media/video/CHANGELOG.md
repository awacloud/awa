# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package is **not yet published**: the entries below describe its
first public surface.

## [Unreleased]

### Added

- **A layered video codec for low-latency streams** (`video.codec`): an
  integer colour transform and Haar pyramid, the pixels that changed
  selected and sent as a base, a colour unit and one unit a detail
  level, any of which a relay may drop; presets from `quality` to
  `minimal`, and `screen` for documents and scrolling.
- **The decoder's picture drawn on the GPU** (`video.gl.render`), bit for
  bit the CPU's, and an optional GPU front end for the encoder
  (`video.gl.analyse`).
- **Camera and screen frames read in a worker** (`video.grab`): the
  frames themselves where the browser gives them, bitmaps of a video
  element elsewhere; fitted to the size asked, at the rate asked, robust
  to a frame clock that stalls or goes back.
- **The codec in a worker** (`video.link`): from the grab to the picture
  drawn, sent as `@awacloud/media-stream` frames — one a layer — and put
  back together on arrival; a relay's drop of layers by the header
  alone; an optional lossless stage.
- **A live demo** (`demo/`, not shipped): a camera or a screen through
  the codec, beside the source, with the layers a relay would drop.
