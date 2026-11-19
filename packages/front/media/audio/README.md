# @awacloud/media-audio

> **Work in progress - Experimental - R&D.** This package is shared as
> source in the monorepo only: it is not published to npm, its API may
> change or disappear, and it carries no support commitment.

Audio codec for low-latency streaming in the browser, an add-on of
`@awacloud/fw`. Maturity **L2**, the monorepo's internal level: the codec, its Web Audio graph and its worker link
work and are measured on real recordings;
the API may still change before a first release.

## Installation

Not yet published: inside the monorepo the package is a workspace —
`"@awacloud/media-audio": "workspace:*"` in a package's `dependencies`, then
`bun install`. It needs `@awacloud/fw` and `@awacloud/media-stream`.

## Aim

Take captured audio to packets and packets back to audio, with low
latency, under full control, in a form made for end-to-end encrypted
streams: the package produces and consumes byte units; compression
happens before them, encryption and transport outside.

Voice first, every kind of audio after. The stream is layered: dropping
the tail units of a packet lowers the quality and never breaks the
stream.

## Status

What the codec can do on real recordings, what was graded by ear, and where it stops:
[docs/capabilities.md](docs/capabilities.md).

| Part | State |
|---|---|
| **The codec (`audio.codec`)** | written — retained after the bench and the owner's listening sessions |
| Bench (generated signals and real files; SNR, spectral distance, bytes, time, latency) | done |
| Baseline (the original chain: `audio.baseline`) | done — the reference the codec was measured against |
| Experiments not retained (Haar, blocks of frames, sparse points) | measured; kept in the bench |
| 48 000 Hz, the browsers' rate | written — the same chain, the default rate |
| The activity gate (`audio.gate`), comfort noise at the playback, the mixer (`audio.mix`) | done — the gate and the comfort noise opt-in (a counter, 0.004, a hold of 96 frames when asked; the noise 10 dB under the silence's level); the limiter the mixer's default |
| The Web Audio graph (`audio.webaudio`: context, capture and playback nodes in an AudioWorklet; check page `bench/webaudio/check.html`) | done — sample for sample in Chromium (row B1a) |
| The codec in a worker between capture and playback (`audio.link`; loop-back page `bench/webaudio/loop.html`) | done — 11.7 ms inside the graph for `voice` at a reserve of 3 frames, no underrun in Chromium (row B1b) |
| The live demo (`demo/`: the microphone through the codec, live) | done (row B4a) |
| Lost packets on the audio side (`decoder.lose()`, `bench/loss.js`) | done — measured on real excerpts; silence by default, `repeat`, `fade` and `extend` (in development) as options |

## Live demo

`demo/index.html`: your microphone through the codec, live — capture
worklet, the codec in a worker, playback worklet — with every preset,
the reserve and `trim` to switch while it runs, the microphone without
the codec to compare, and the rate, delay, underruns and codec times
every second. Build its worker first (`bun run build:workers` in this
package: a module worker does not see the page's import map), then
serve the repository root with any static server on `localhost` or
`127.0.0.1` (the microphone needs a secure context) and open
`/packages/front/media/audio/demo/`. Use headphones.
`?source=test` runs it on a muted tone, without the microphone.
The packets travel in frames of four (`@awacloud/media-stream`, row
B5b1): the figures give the rate on the wire, headers in, and the
frames lost and concealed. A switch turns on the lossless stage — each
frame keeps the smaller of deflated or stored, so on this codec's
packets it changes next to nothing.

## Quick start

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '@awacloud/media-audio';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
```

## The codec

```js
const codec = runtime.resolve('audio.codec');

const encoder = codec.createEncoder({ rate: 48000, preset: 'voice' });   // or 44100, the default
const decoder = codec.createDecoder();               // follows the rate its stream says: decoder.rate

for (const packet of encoder.push(frame)) {          // frame: 128 samples, Float32Array
    for (const samples of decoder.push(packet)) play(samples);
}
encoder.setBits(5);                                  // fewer bytes, from the next frame on
const [hole] = decoder.lose();                       // a packet known to be lost: the frame that fills it
```

A lost packet costs its own frame and nothing after it.
`createDecoder({ conceal })` chooses what fills the hole: `'silence'`
(the default), `'repeat'` (the frame before), `'fade'` (the frame before
faded out, the next good one faded in), `'extend'` (in development: the
waveform carried on from its last period, its level falling linearly a
fifth a frame, the next good frame reached by a 64-sample crossfade —
row B1d; the best of the four on the spectral distance, less crackle to
the ear, but brighter than the source: not yet for a default).

| Preset | Shape | Rate on real excerpts |
|---|---|---|
| `voice` | low-pass, ÷4, wavelet at 6 bits, softened decoder | 85 to 93 kbit/s |
| `voice-low` | the same at 5 bits | 68 to 76 kbit/s |
| `music` | low-pass, ÷2, wavelet at 9 bits | 217 to 247 kbit/s |
| `full` | the wavelet alone, 9 bits, nothing cut | 320 to 395 kbit/s |
| `full-low` | the same at 7 bits — to the owner's ear, as good | 217 to 278 kbit/s |
| `full-fixed` | the wavelet alone at a fixed step of 64 | 100 to 239 kbit/s |

Presets are starting points: `decimation` (4, 2, 1), `bits` (1 to 14)
or `step` (a fixed power of two) and `soft` override them, and the
softening is the decoder's choice. With `bits` the step follows the
level of each frame, so quality does not depend on volume; a fixed
`step` costs fewer bytes and drops what falls under it — heard only
where music fades. A packet says everything a decoder needs. The codec adds
0.6 to 1.2 ms to the 2.9 ms of a frame in its cascade shape, nothing
in its full-band shape.

Rates: 44 100 Hz (the default) and 48 000 Hz. At 48 000 Hz the chain is
the same, sample for sample — a filter acts on the normalised
frequency — so the band a cascade preset keeps moves up by 1.088
(`voice` to 6 kHz, `music` to 8.7 kHz), a frame lasts 2.67 ms, and a
second costs 4 to 8 % more bytes (375 packets instead of 344.5). The
header byte says the rate; a decoder created with a rate refuses a
stream of the other.

## Modules

| Module | What it carries |
|---|---|
| `audio.planes` | samples as one to three byte planes; the depth travels in the packet and can change at every frame |
| `audio.fir` | the three 49-tap low-pass filters of the original chain (`8k`, `12k`, `16k`, designed for 44 100 Hz) and their streaming form |
| `audio.resample` | integer-factor decimation and interpolation (`fir`, `cosine`, `linear`), exact and continuous across frames |
| `audio.baseline` | the original voice chain — filter, decimation, planes — as the baseline of the bench |
| `audio.nibbles` | integers in 4-bit codes: bands with runs of zeros, plain sequences |
| `audio.codec` | the retained codec: cascade or full band, options and presets |
| `audio.webaudio` | the Web Audio graph of the bindings: an `AudioContext` at 48 000 Hz, the worklet module installed, a capture node that gives frames of 128 samples on a port, a playback node with a jitter buffer (`depth` 3, `max`, `trim` one second by default — ruled by the owner's ear; underruns, drops and trims counted) |
| `audio.link` | the codec in a worker: frames from a capture port encoded, decoded to a playback port; the packets sent in `media.frame` frames of four (`group`), looped back or on a transport port; a lost frame concealed from the sequence; the frame's lossless stage as an option (`open` `deflate`, the fw `deflate` given to `attach`); an activity gate as an option (`gate`: one frame says silence); counts and times on request |
| `audio.gate` | the activity gate: a frame's RMS against a threshold, kept open by a hold counter or a peak follower (row A8a) |
| `audio.mix` | a mixer of frames: the sum, the R&D's envelope (finding a4 fixed), the average, or a limiter (row A9) |
| `audio.wavelet` | an exactly reversible integer wavelet pyramid per frame (Haar or 5/3 lifting), quantised by power-of-two steps, fixed or following the level, in a byte or a 4-bit coding; a compact packet that can still be cut after any band |

`audio.webaudio` moves audio as frames: 128 samples on a port, in an
`AudioWorklet`, for a codec in a worker. It records and plays no clip.
Short clips in memory (record through `MediaRecorder`, trim, normalize,
play at a rate) are the `sound` module of `@awacloud/fw`
(`dom/query/sound`). The two share no public member and each creates its
own `AudioContext`; whether fw absorbs this module is re-examined in a
fw 1.x minor.

```js
const baseline = runtime.resolve('audio.baseline');
const config = { rate: 44100, profile: '8k', depth: 1, interpolation: 'cosine' };
const encoder = baseline.createEncoder(config);
const decoder = baseline.createDecoder(config);

for (const packet of encoder.push(frame)) {        // frame: Float32Array
    for (const samples of decoder.push(packet)) play(samples);
}
encoder.setDepth(2);                               // more bytes, from the next frame on
```

The baseline is a reference to measure against, not the codec to use:
its original pairings of filter and rate alias, and it works at
44 100 Hz only.

## Bench

Every codec of the package is judged on one bench, under `bench/`
(tooling: outside `src/`, not shipped).

```bash
bun bench/run.js --wav ../../../../evidence/media-codecs/audio-bench/run
```

It generates five signals from a seed (a tone, a sweep, white noise, a
voiced-like signal in bursts, the same with hiss), runs every codec of
`bench/codecs.js` over them frame by frame, and prints one table: SNR,
segmental SNR, log-spectral distance (up to 5 kHz and over the whole
band; lower is better), raw and deflated bit rate (each packet deflated
on its own through the fw `deflate` module), time per frame. With `--wav` it
writes the sources and the decoded signals for listening.

The figures are objective: they do not replace listening. Time per frame
is a measurement, never a gate. Three reference codecs (`identity`,
`pcm16`, `pcm8`) have scores known in advance and prove the bench before
any candidate is read on it. A candidate has the shape
`{ name, delay, createEncoder(rate), createDecoder(rate) }`; one that
buffers adds `latency` (samples) and a `flush()` on its encoder.
Experiments that are not (yet) modules live under `bench/experiments/`.

A real file can replace the generated signals — PCM WAV or FLAC, read
by the bench's own decoders, mixed to mono and converted to the bench's
rate:

```bash
bun bench/run.js --file path/to/audio.flac --start 100 --seconds 20 --name excerpt --only "^(pcm16|lift5-q64-nib)$"
```

## Tests

From this package's directory:

```bash
bun test .
```

```bash
bunx eslint . --max-warnings 0
```

The browser legs (Web Audio, WebGL, the frame grab, the workers) run as
pages under `bench/`; build the workers first (`bun run build:workers`).

## Exposed sub-paths

| Sub-path | Target |
|---|---|
| `@awacloud/media-audio` | `src/main.js` — the registration array of the package's modules |

## Maturity

L2 (beta): a README, tests (`src/**/*.test.js`, `tests/`), an explicit
`files` allowlist, a CHANGELOG, a `docs/` index. Not yet published.

## Licence

AGPL-3.0-only — see `LICENSE`. Copyright (c) 2026 AwaCloud SAS.
