# `@awacloud/media-video` — what the codec can do, and where it stops

*State at 2026-11-12. Every figure is measured on the package's bench
unless it says "estimate"; rates are after the lossless stage, in steady
state (the first second left out). Level L0: a measured prototype, not a
product.*

## In short

A video codec for real time, written for the browser: an integer Haar
pyramid, only the pixels that changed are sent, and the stream is made
of layers a sender, a relay or a receiver may drop without re-encoding.
Its strong points are its **latency** (one frame, no frame is waited
for), its **light arithmetic** (integers, additions and shifts), its
**graceful degradation** and its **tolerance to lost packets** (no key
frame: the stream repairs itself). It spends more bits than a standard
codec on camera pictures.

## Rates on real video

Camera content, 640x360. Three sources: a public videoconference test
clip (two people, 30 frames a second), an animated film (24), and a
webcam recording (15):

| Preset | What it codes | Videoconference clip | Animated film | Webcam |
|---|---|---:|---:|---:|
| `quality` | 640x360, every frame | 3.6 Mbit/s | 2.1 Mbit/s | 0.74 Mbit/s |
| `standard` | 640x360, every frame | 2.5 Mbit/s | 1.6 Mbit/s | 0.59 Mbit/s |
| `economy` | 640x360, 15 frames a second at most | 1.2 Mbit/s | 0.84 Mbit/s | 0.41 Mbit/s |
| `low` | 320x180, 15 frames a second at most | 360 kbit/s | 270 kbit/s | 130 kbit/s |
| `minimal` | 320x180, 10 frames a second at most | 280 kbit/s | 210 kbit/s | 90 kbit/s |

Luma PSNR: 39 to 43 dB for `quality`, 36 to 42 for `standard`, 35 to 40
for the three others (measured against the picture at the coded size:
it says nothing of what a smaller picture loses). The three sources
differ by a factor of five at the same preset: the rate follows what the
camera sends — its noise, its detail, how much moves.

Screen content, 1280x720 at 15 frames a second, recorded on a desktop:

| Content | Preset `screen` | Without its frame vector |
|---|---:|---:|
| A document scrolled with the mouse wheel | 0.56 Mbit/s, 50.4 dB (1.0 Mbit/s in its busiest second) | 0.96 Mbit/s |
| A desktop: typing, a window dragged, windows switched | 1.3 Mbit/s, 47.7 dB (5.0 Mbit/s in its busiest second) | 1.3 Mbit/s |

A picture that does not change costs nothing after it was sent, apart
from a slow refresh.

**A warning on older figures.** The package's bench also runs generated
sequences (flat shapes, seeded noise). They flatter the codec: the same
presets measure three to seven times lower on them than on real
pictures. Quote the figures of this page.

## What the eye said

The owner graded still pictures and animated playback of the real
clips. `quality` and `standard`: good. The settings of `economy` (higher
selection thresholds): good, with a few missed pixels. A coarser
quantisation step (16) instead: too degraded. The decoder's colour
smoothing: better than the original restoration filter, on both clips.
**Not graded yet:** 15 and 10 frames a second in motion, the half-size
picture of `low` and `minimal`, and the screen content.

## Degrading without re-encoding

A packet is a set of units: the reduced picture, its colour, one unit
per level of detail. Dropping units on the way gives a valid, poorer
picture (videoconference clip, `quality`):

| Units kept | Bytes | Graded |
|---|---:|---|
| all | 100 % | good |
| without the colour | 81 % | good (black and white) |
| without the finest detail | 53 % | acceptable to limit — for a temporary drop of the link |
| the reduced picture alone | 36 % | limit |

## Adapting to the link

- By dropping units, at any point of the path, with no word to the
  encoder.
- By the encoder's settings: the preset, the quantisation step, the
  selection thresholds, the picture reduced by a whole number
  (`reduce`), a ceiling on the frame rate (`maxFps`). Half the frames
  cost about 62 % of the bytes; a quarter of the surface about 30 %.
- **Not written yet:** the loop that measures the link and chooses.

## Lost packets

There is no key frame. Each pixel is sent again within one to three
seconds whether it changed or not, a tenth of the picture a frame at
most: a decoder that lost packets, or joined late, converges without
asking for anything. Measured by simulation, on generated sequences at
640x360 and 24 frames a second:

| Loss | Camera-like content | A scrolling page, preset `screen` |
|---|---|---|
| one packet | repaired in about 1 second | 1 damaged frame |
| three packets in a row | about 1 second | about 2 seconds, a strip of a few lines |
| 2 % of the packets, at random | 0.5 dB lost on average | 2.7 dB lost on average |

With its frame vector a stream says in every packet where the picture
stands, so a decoder that missed a move catches up at the next packet
it receives. Two options trade this tolerance for bytes and are in no
preset: `delta` (differences from what the decoder holds: 7 to 14 %
fewer bytes; a scrolling page then takes seconds to heal) and `hold`
(details that did not move are not sent again: 23 to 37 % fewer bytes,
with visible traces behind what moves).

## Latency and cost

One frame of latency: nothing waits for a later frame. Time per frame
on one desktop station, single thread, in JavaScript:

| Coded size | Encode, in a browser (Chromium) | Encode and decode, in the bench's runtime (bun) |
|---|---:|---:|
| 320x180 | not measured | 3 to 4 ms, 1.5 ms |
| 640x360 | 4.3 to 4.6 ms | 11 to 13 ms, 5 to 6 ms |
| 1280x720 | 17 ms (`standard`), 30 ms (`quality`) | 37 to 53 ms, 12 to 22 ms |

The browser figures are on a public camera clip (row B3c; bun's are
older, before the detail test was made faster). **In a worker** the
encoder sustains 51 frames a second at 1280x720 (`standard`) and leaves
the page's thread 0.06 ms a frame; at 30 frames a second a frame's
packets come back 20 ms after it was given, 25 at most. Where the time
goes at 1280x720 (`standard`): the pyramid 37 %, the codec's own loops
(the detail test, gathering what is sent) 42 %, the colour 13 %, the
selection 5 %, DEFLATE 1.3 ms beside it.

**On the GPU** (WebGL2, integer shaders — the result is, bit for bit,
the CPU's; measured in Chromium on one desktop graphics card):

| Stage | 640x360 | 1280x720 |
|---|---|---|
| Decoder, a packet to its picture drawn in a canvas (`video.gl.render`) | 0.4 ms, against 4.3 on the CPU | 0.95 ms, against 16 on the CPU |
| Encoder's first stage, colour and pyramid (`video.gl.analyse`) | 18 % slower | 15 % of the encoder |

The decoder gains ten to seventeen times: its picture is drawn where it
is shown and nothing comes back to the CPU. The encoder's first stage
gains little: its result has to be read back from the GPU, which costs
most of what the shaders save. Moving the selection to the GPU too would
save at most its 5 %: not built.

## Where it stops

- **On camera pictures it spends more than a standard codec**:
  measured against the browser's own encoders on the same frames (row
  M1, WebCodecs, same PSNR on luma), 5.6 to 6.9 times what H.264, VP9 and
  AV1 need, 3.3 times VP8. It has no block motion compensation and no
  frequency transform beyond the Haar pyramid; nothing under 1.2 Mbit/s
  at 640x360 and full frame rate was graded good on the two public
  clips. Going lower means a smaller picture or fewer frames, which the
  presets `low` and `minimal` do; under about 30 dB the others are out
  of reach.
- **On screens it is the cheaper** (row M1): for the same PSNR on a
  document, H.264 needs twice its rate and VP9 2.7 times; VP8 and AV1 do
  not reach its fidelity in the rates tried.
- Its ground is elsewhere: screens and documents, very low latency,
  hardware without a video encoder, a stream that must degrade or
  survive losses without a return channel, a format under full control.
- The capture and display bindings exist (`video.grab`, `video.link`:
  a camera or screen track grabbed, coded, decoded and drawn on the GPU
  in a worker; in Chromium, 30 frames a second at 1280x720 `standard`,
  about 21 ms from a frame drawn in the source to its picture drawn —
  one measure on one station, the compositor's share left out). In
  Firefox the pictures are right too, but slower (no
  `MediaStreamTrackProcessor`), and the live demo's coded picture froze
  for the owner — open (row B2d). The live demo exists (`demo/`); the
  link sends `media.frame` frames, a layer each, which a relay can drop
  by their header alone; DEFLATE is an option of the frames. Not written yet: the
  automatic adaptation to the link, the pairing with the audio codec. Not done: any test on a real network.
- The loss figures come from generated sequences; the real clips are too
  short to read a refresh cycle on them.

## How it was judged

Every stage went through one bench (`bench/`): generated sequences, then
two public clips and three recordings made on a desktop (a scrolled
document, a desktop session, a webcam), with luma and colour PSNR, SSIM,
byte rates and time per frame; a lost-packet bench (`bench/loss.js`);
and the owner's eye over three viewing sessions. Where the figures and
the eye disagreed, the eye ruled.
