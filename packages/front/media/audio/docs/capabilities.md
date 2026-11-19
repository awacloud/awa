# `@awacloud/media-audio` — what the codec can do, and where it stops

*State at 2026-11-13. Every figure is measured on the package's bench
unless it says "estimate". Level L0: a measured prototype, not a
product.*

## In short

An audio codec for real time, written for the browser: an integer
wavelet on very short frames, a quantisation that follows the level of
the sound, a 4-bit coding. Its strong points are its **latency** (a
frame is 2.9 ms; the codec adds 0 to 1.2 ms), its **light arithmetic**
(integers, additions and shifts) and a stream whose every packet stands
alone. It is not a low-rate speech coder.

## Rates

Measured on real recordings (a film soundtrack, an orchestra, an
audiobook), mono, 44.1 kHz:

| Preset | What it keeps | Rate | Listening |
|---|---|---:|---|
| `voice` | up to 5.5 kHz | 85 to 93 kbit/s | graded good by ear |
| `voice-low` | up to 5.5 kHz, coarser | 68 to 76 kbit/s | graded good by ear |
| `music` | up to 8 kHz | 217 to 247 kbit/s | graded good by ear |
| `full-fixed` | the whole band, one fixed step | 100 to 239 kbit/s | graded very good by ear |
| `full-low` | the whole band, 7 bits under the peak | 217 to 278 kbit/s | graded very good by ear |
| `full` | the whole band, 9 bits under the peak | 320 to 395 kbit/s | graded very good; the best on fades |

Presets are starting points: the band kept (`decimation`), the
precision (`bits`, or a fixed `step`) and the softening of the decoder
are options.

**Going lower.** On the audiobook, `voice` goes from 93 kbit/s at 6
bits to 62 at 4 bits and 47 at 2 bits. These lower points are measured,
not yet listened to. **About 47 kbit/s is today's floor**: it comes from
the packet rate (345 packets a second), which is the price of the
latency.

## Adapting while the stream runs

The precision changes at any packet (`setBits`, `setStep`), with no
negotiation: a packet says everything its decoder needs. The band kept
is chosen when the encoder is created; a decoder follows a stream that
changes it.

## Lost packets

Every packet decodes alone: a lost packet costs its own frame (2.7 ms
at 48 000 Hz) and nothing after it — the next packet decodes as if the
lost one had never come (tested). The decoder fills the hole when told a
packet is missing (`decoder.lose()`): silence, the frame before
repeated, that frame faded out, or the waveform extended from its last
period and crossfaded into the next good frame. Measured on real
excerpts (row B1c), against the source: 1 % of packets lost costs about
0.2 dB of spectral distance, 3 % about 0.6 dB, 10 % 2 to 2.6 dB with
silence; extended (row B1d, an option in development), 10 % costs 0.4
to 0.6 dB less than with silence — to the ear less crackle, but brighter
than the source. The default stays silence (the owner, after
listening).
Knowing that a packet is missing is the stream framing's: the frames of
`@awacloud/media-stream` carry a sequence, and `audio.link` tells the
decoder.

## Latency and cost

- A frame is 128 samples: 2.9 ms. The cascade presets (`voice`,
  `music`) add 0.6 to 1.2 ms for their filters; the full-band presets
  add nothing.
- About 7 to 10 microseconds a frame to encode on a desktop station, in
  JavaScript.

## Where it stops

- **It is not a vocoder.** Speech coders built on a model of the voice
  work at a few kbit/s; this codec's floor is about ten times higher.
- Against Opus, the browser's own (row M1, WebCodecs, the same three
  real excerpts): about **twice Opus's rate** for the same spectral
  distance (1.6 to 2.5 times) or segmental SNR (1.0 to 2.5 times), with
  any of Opus's frame lengths; at `full` Opus does not reach its
  fidelity within 192 kbit/s. Both measures reward the waveform, which
  this codec keeps: Opus, a perceptual coder, may sound as good at much
  lower rates — the ear decides.
  It is the right tool when latency, light arithmetic or full control of
  the format matter more than the last kilobit.
- It works at 44 100 and 48 000 Hz, no other rate. At 48 000 Hz it is
  the chain graded at 44 100 Hz, its band moved up by 9 %; measured on
  real recordings (it scores better than converting to 44 100 Hz and
  back) and kept by ear against the alternatives.
- An activity gate (`audio.gate`, row A8a: a hold counter or a peak
  follower) is an option of `audio.link` (row A8b): nothing leaves while
  it is shut but one frame saying silence and its level, and the
  playback may fill the silence with a comfort noise (white; over the
  whole band brighter than a low ambience), played 10 dB under the
  silence's level. Both are opt-in; asked for, the gate takes the
  owner's values (a counter, 0.004, a hold of 96 frames). The saving is
  the content's (0 to 28 % on the three excerpts).
- A mixer (`audio.mix`, row A9): the limiter by default (the owner,
  after listening: the best everywhere), the sum (good at ordinary
  levels), the R&D's envelope, the average. On three real excerpts
  ordinary channels hardly clip; the envelope deforms the mix even when
  nothing would clip.
- **Estimate, not built:** a telephone band, longer frames and silence
  suppression should bring speech towards 20 to 30 kbit/s, for a few
  milliseconds more latency.

## How it was judged

Each candidate went through the same bench (`bench/`, generated signals
and real excerpts, a waveform figure and a spectral one) and through the
owner's ear over five listening sessions. Where the figures and the ear
disagreed, the ear ruled.
