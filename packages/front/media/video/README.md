# @awacloud/media-video

> **Work in progress - Experimental - R&D.** This package is shared as
> source in the monorepo only: it is not published to npm, its API may
> change or disappear, and it carries no support commitment.

Video codec for low-latency streaming in the browser, an add-on of
`@awacloud/fw`. Maturity **L2**, the monorepo's internal level: the codec, its GPU drawing, the frame grab and its
worker link work and are measured on real video;
the API may still change before a first release.

## Installation

Not yet published: inside the monorepo the package is a workspace —
`"@awacloud/media-video": "workspace:*"` in a package's `dependencies`, then
`bun install`. It needs `@awacloud/fw` and `@awacloud/media-stream`.

## Aim

Take captured frames to packets and packets back to pictures, with low
latency, under full control, in a form made for end-to-end encrypted
streams: the package produces and consumes byte units; compression
happens before them, encryption and transport outside.

The design: an integer colour approximation, a Haar pyramid, and
per-pixel conditional replenishment — only what changed is sent, and
every pixel is refreshed within a bounded delay, so a lost packet costs
time, never the stream. Each Haar pass is a separable quality layer:
dropping the tail units of a packet lowers the quality, down to luma
only, without re-encoding.

## Status

What the codec can do on real video, what was graded by eye, and where it stops:
[docs/capabilities.md](docs/capabilities.md).

| Part | State |
|---|---|
| Scaffold, wiring guard | done |
| Bench (generated sequences, PSNR, SSIM, bytes, time) | done |
| Colour approximation (`video.color`), Haar pyramid (`video.haar`) | done |
| Selection of changed pixels (`video.select`, three rules compared) | done |
| Geometry and the packet of units (`video.pack`) | done |
| The codec (`video.codec`): encoder, decoder, options, lost packets | done |
| Content that only moves (`video.motion`, and the `motion` option of the codec) | done — a scrolling page 30 times cheaper when the vector is a multiple of 2^levels |
| The exact pyramid (`exact`: differences kept whole, any vector then as good as an aligned one) | done — an option, as `motion` is: a packet lost while the picture moves costs more |
| Lost packets (`bench/loss.js`; the position a moving stream carries, by which a decoder that missed a move catches up) | done — one lost packet on a scrolling page: 1 damaged frame with the vector, 18 without |
| Quantisation of the details (`quant`) and a 4-bit coding (`coding: 'nibbles'`, `video.nibbles`) | done — options; a step of 4 saves 28 to 41 % of the bytes for 1.3 to 3 dB |
| The stages the patent names and the code never had (`video.strips`, `baseCoding`, `smooth`, `minGroup`, `correct`) | measured — options, none a default: the strips lose after DEFLATE, the smoothing gains 2 to 7 % |
| Restoration filter (`video.post`, the decoder's choice: the original, the patent's blur, a colour-only smoothing) | written — no default: generated frames cannot judge it, the eye and real captures will |
| The presets and the ruled defaults (row V11) | done — `quality`, `standard`, `economy`, `screen` |
| Real video in the bench (`bench/lib/y4m.js`, `bench/run.js --file clip.y4m --scale 2 --step 2`) | measured on two clips — the real rates are 3 to 7 times the generated ones |
| Differences from what the decoder holds (`delta`, `hold`) | done — options; with the frame vector a lost packet then takes seconds to heal |
| The GPU, first part (`video.gl`, a WebGL2 helper; `video.gl.analyse`, the encoder's colour and pyramid; check page `bench/gpu/check.html`) | done — bit for bit the CPU in Chromium; it does not pay yet (read-back) |
| The decoder on the GPU (`video.gl.render`, the picture drawn into a canvas; `createDecoder({ present })`) | done — bit for bit the CPU in Chromium, ten to seventeen times faster |
| Where the encoder's time goes, in Chromium, and the encoder in a worker (`bench/gpu/profile.html`, row B3c) | measured — the selection is 5 % of the encoder: it stays on the CPU; the detail test, the largest stage, made twice as fast; a worker holds 51 frames a second at 1280x720 |
| The pixel grab (`video.grab`: a camera or screen track read in a worker as RGBA at the codec's size and rate; check page `bench/grab/check.html`) | done in Chromium — the processor's way pixel for pixel; the bitmaps way for other browsers written, not proven (row B2a) |
| The codec in a worker from the grab to the picture (`video.link`; loop-back page `bench/link/loop.html`) | done in Chromium — every picture read back from the canvas was the frame sent; drawn on the GPU (row B2b); in Firefox too, but 16 frames a second of 30 on a canvas source (rows B2c, B2d) |
| DEFLATE as an option of `video.link` (`open` `deflate`, the fw `deflate` given to `attach`) | done (row B4c); now the frame's lossless stage, the smaller kept (row B5b2) |
| The packets sent in `media.frame` frames, a layer each (`@awacloud/media-stream`): pictures put back together, a relay's drop by the header alone, a lost frame counted | done (row B5b2) |
| The live video demo (`demo/`: a camera or a screen through the codec, the layers a relay drops to switch, before and after side by side) | done (row B4b) |

## Live demo

`demo/index.html`: your camera or a screen through the codec, live — the
frames read in a worker, coded, decoded and drawn on the GPU there —
beside the source with a slider between them; every preset, the size,
the GPU or a 2D canvas, and the layers a relay would drop (the finest
details, all of them, the colour) to switch while it runs; the rates
sent and kept, the frame rates and the times every second. Build its
worker first (`bun run build:workers` in this package: a module worker
does not see the page's import map), then serve the repository root
with any static server on `localhost` or `127.0.0.1` and open
`/packages/front/media/video/demo/`. `?source=test` runs it on
a generated moving picture, without the camera. Checked in Chromium;
in Firefox the coded picture froze on its first image for the owner
(row B2d, open). The rates shown are the codec's packets as they leave
it, then on the wire (a frame a layer, headers in: about 3 % more)
and past the relay; a switch turns on the lossless stage (each frame
keeps the smaller of deflated or stored) — 15 to 21 % less on camera
video, about two thirds less on a document.

## Quick start

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '@awacloud/media-video';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
```

## Modules

| Module | What it carries |
|---|---|
| `video.color` | the integer colour approximation: a luma and two colour differences centred on 127, as three byte planes; error at most 2 levels |
| `video.haar` | the two-dimensional Haar pyramid on byte planes, 1 to 6 passes; options `diagonal` (keep the diagonal band) and `chroma` (`base` or `all`) |
| `video.codec` | the encoder and the decoder of the layered stream; options: passes, diagonal band, selection rule, detail test, geometry form |
| `video.motion` | exploration: one vector for a frame that only moves (a page that scrolls, a camera that pans), and the tiles that follow it |
| `video.pack` | the geometry of a frame as a bitmask or run lengths, the shorter; a packet of units (base, colour, one per detail level) any of which may be dropped |
| `video.select` | which pixels to send, by one of three rules — the two of the original design (change between frames) and `reference` (difference from the value last sent, luma and colour) — with a keep delay per pixel, a refresh budget, and thresholds that follow the amount of change |
| `video.nibbles` | the detail values as 4-bit codes with runs of zeros |
| `video.post` | the decoder's colour smoothing, the filter a stream may wish |
| `video.reduce` | a picture reduced by a whole number and enlarged back (the `low` and `minimal` presets) |
| `video.strips` | exploration, not an option: the geometry as strips |
| `video.gl`, `video.gl.analyse`, `video.gl.render` | WebGL2 with integer passes; the encoder's front end on the GPU (an option); the decoder's picture drawn from its pyramid, bit for bit the CPU's |
| `video.grab` | a camera or screen track read in a worker: the frames themselves (`MediaStreamTrackProcessor`) or bitmaps of a video element, fitted to the size asked, at the rate asked |
| `video.link` | the codec in a worker, from the grab to the picture on the GPU; `media.frame` frames a layer each, put back together on arrival; a relay's drop by the header |

```js
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');

const planes = color.forward(rgba);                                    // [red difference, luma, blue difference]
const pyramid = haar.forward(planes, width, height, { levels: 2, diagonal: true });
const picture = color.inverse(haar.inverse(pyramid));                  // RGBA
const smaller = color.inverse(haar.inverse(pyramid, { levels: 1 }));   // one layer less, enlarged
```

The defaults are the design's, for a camera picture: no diagonal band,
colour at the smallest size only. On screen content keep the diagonal
band: without it text is lost.

## The codec

```js
const codec = runtime.resolve('video.codec');
const pack = runtime.resolve('video.pack');

const encoder = codec.createEncoder({ width: 640, height: 360, fps: 24, preset: 'quality' });
const decoder = codec.createDecoder(encoder.coded);                 // the size the encoder codes; follows the filter the stream wishes

for (const packet of encoder.push(rgba)) {       // no packet: nothing changed
    show(decoder.push(packet));                  // RGBA; reused at the next call
    // A relay or a receiver may drop units: here everything but the base and the colour.
    const lighter = pack.writeUnits(pack.readUnits(packet).filter((unit) => unit.type < pack.types.DETAIL));
}
```

| Preset | What it is | Measured at 640x360, 24 fps (generated sequences) |
|---|---|---|
| `quality` | exact pyramid, step 2 | 436 to 511 kbit/s, 39 to 40.6 dB |
| `standard` | exact pyramid, step 4 | 365 to 413 kbit/s, 38 to 38.9 dB |
| `economy` | `standard` with higher selection thresholds, 15 frames a second at most | see the real figures below |
| `low`, `minimal` | `economy` on a picture reduced by 2; then at 10 frames a second | see below |
| `screen` | `quality` plus the frame vector and its position | a scrolling page at 706 kbit/s, 47.6 dB |

Presets are starting points; every option given wins over them:
`levels`, `diagonal`, `exact`, `quant`, `coding`, `smooth`, `detail`,
`select` (the `reference` rule with its colour test by default; the
original `history` and `complete` rules are options), `motion`, `post`,
`delta`, `hold`, `maxFps`, `reduce`, `analyse` (the GPU front end).
The five camera presets (all but `screen`) wish the decoder's colour smoothing
(`video.post`); a decoder follows the wish or sets its own `post`.
**These figures come from generated sequences. On real video (rows V14
and V15: a videoconference clip and an animated film, 640x360, steady
state) the presets need three to seven times more:**

| Preset | Real video, 640x360 | The owner's eye |
|---|---|---|
| `quality` | 2.1 to 3.6 Mbit/s, 39.3 to 39.9 dB | good |
| `standard` | 1.6 to 2.5 Mbit/s, 36.2 to 37.6 dB | good |
| `economy` (15 frames a second at most) | 0.84 to 1.2 Mbit/s, 35.4 to 35.7 dB | its settings good at full rate; 15 frames a second not seen yet |
| `low` (`economy` on a half-size picture) | 270 to 360 kbit/s | not seen yet |
| `minimal` (`low` at 10 frames a second) | 210 to 280 kbit/s | not seen yet |

Other levers, options in no preset: `delta` (the selected pixels as
differences from what the decoder holds: 7 to 14 % fewer bytes at the
same picture) and `hold` (a detail that did not move is left as held: 23
to 37 % fewer, with traces behind what moves). A coarser step (16) was
graded too degraded on real video.

A lost packet leaves old pixels where the picture has not moved since;
the refresh of the selection repairs them within about three seconds.
A move by a multiple
of 2^levels costs nothing in quality; any other loses some, because the
pyramid is rebuilt from the moved picture. For screen content, one pass.

## Bench

Every codec of the package is judged on one bench, under `bench/`
(tooling: outside `src/`, not shipped).

```bash
bun bench/run.js --dump ../../../../evidence/media-codecs/video-bench/run
```

It generates five sequences from a seed — a still scene, the same with
moving shapes, the same under a camera noise, scrolling screen content,
a scene cut — runs every codec of `bench/codecs.js` over them frame by
frame, and prints one table: PSNR on luma over the run and on the worst
frame, PSNR on colour, SSIM, bytes per frame, raw and deflated bit rate
(each packet deflated on its own through the fw `deflate` module),
encode and decode time. With `--dump` it writes the middle and the last
frame of each sequence, source and decoded, as PNG files.

What is compared with each source frame is the picture a viewer would
have at that instant: a codec that sends nothing for a frame is judged
on what it left on screen. The figures are objective: they do not
replace the eye. Times are measurements, never gates. Three reference
codecs (`identity`, `rgb555`, `hold4`) have scores known in advance. A
candidate has the shape
`{ name, createEncoder({ width, height, fps }), createDecoder({ width, height }) }`.

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
| `@awacloud/media-video` | `src/main.js` — the registration array of the package's modules |

## Maturity

L2 (beta): a README, tests (`src/**/*.test.js`, `tests/`), an explicit
`files` allowlist, a CHANGELOG, a `docs/` index. Not yet published.

## Licence

AGPL-3.0-only — see `LICENSE`. Copyright (c) 2026 AwaCloud SAS.
