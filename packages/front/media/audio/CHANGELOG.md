# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package is **not yet published**: the entries below describe its
first public surface.

## [Unreleased]

### Added

- **A layered audio codec for low-latency streams** (`audio.codec`):
  frames of 128 samples at 48 000 Hz (by default) or 44 100 Hz, an
  integer 5/3 wavelet behind an optional low-pass and decimation, six
  presets from `voice` to `full`, each packet decoding on its own.
- **Lost packets filled by the decoder** (`decoder.lose()`): silence by
  default; the frame before repeated, faded, or the waveform extended
  (in development) as options.
- **The Web Audio graph** (`audio.webaudio`): an audio context, a capture
  node and a playback node in an AudioWorklet, with a reserve, a trim of
  lasting delay, and an optional comfort noise during announced silences.
- **The codec in a worker** (`audio.link`): the frames from capture to
  playback without the page's thread, sent in `@awacloud/media-stream`
  frames of four packets; losses concealed from the sequence; an
  optional lossless stage and an optional activity gate.
- **An activity gate** (`audio.gate`): a frame's level against a
  threshold, kept open by a hold counter or a peak follower.
- **A mixer** (`audio.mix`): several channels into one by a limiter (the
  default), a plain sum, an envelope or an average.
- **A live demo** (`demo/`, not shipped): the microphone through the
  codec, every option to switch while it runs.
