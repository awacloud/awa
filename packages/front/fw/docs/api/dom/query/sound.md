---
module: sound
category: dom/query
dependencies: []
returns: object
worker-safe: false
status: complete
---

# sound

> Short sound clips in memory — record from a microphone stream, shape, encode as WAV, play at any rate.

**Module** `sound` | **Source** `packages/front/fw/src/dom/query/sound.js` | **Deps** none | **Worker-safe** no

Built for clips of a second or two (a voice tag, a sound effect). A clip is an
`AudioBuffer` held in memory: nothing is written to storage and nothing is sent
anywhere. Moving a clip is the caller's business — `clip.bytes()` on one side,
`fromBytes` on the other. Main thread only (Web Audio and `MediaRecorder` do not
exist in workers); compatible with sanity `base`.

## Resolve

```js
const sound = runtime.resolve('sound');
// Returns: { support, unlock, record, fromBytes, fromBuffer, trim, normalize, play, rate, disposeAll }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `support()` | `() => {context, recorder, mimeTypes}` | What this browser offers; `mimeTypes` are the recorder formats it can write |
| `unlock()` | `() => Promise<void>` | Creates the `AudioContext` and resumes it — call it from a user gesture before the first `play` |
| `record(source, opts?)` | `(StreamHandle \| MediaStream, {maxMs = 1500, mimeType?}) => Recording` | Starts recording; stops on its own at `maxMs` |
| `fromBytes(bytes)` | `(ArrayBuffer) => Promise<Clip>` | Decodes WAV, Ogg, WebM … (`decodeAudioData`), resampled to the context's rate |
| `fromBuffer(buffer)` | `(AudioBuffer) => Clip` | A clip from samples you made |
| `trim(clip, opts?)` | `(Clip, {thresholdDb = -45}) => Clip` | Drops leading and trailing samples quieter than the threshold (a silent clip keeps one sample) |
| `normalize(clip, opts?)` | `(Clip, {peak = 0.9}) => Clip` | Scales the clip so its loudest sample is `peak` |
| `play(clip, opts?)` | `(Clip, {rate = 1, gain = 1, when?}) => Voice` | Plays it; `rate` is the playback rate (pitch and speed together), `when` a context time |
| `rate(semitones)` | `(number) => number` | `2^(s/12)`: `rate(12)` is an octave up, `rate(-5)` a fourth down |
| `disposeAll()` | `() => Promise<void>` | Stops every voice, disposes every clip, closes the context |

`trim`, `normalize` and the `from*` entries return **new** clips; the source clip is
left as it was.

### `Recording`

| Member | Description |
|---|---|
| `level()` | Live RMS level of the input, 0..1 — for a record meter; 0 once stopped |
| `stop()` | `Promise<Clip>`: stops and decodes. Idempotent: after the `maxMs` auto-stop it returns that clip |
| `cancel()` | Drops the recording; a later `stop()` rejects |

### `Clip` and `Voice`

| Member | Description |
|---|---|
| `clip.id`, `durationMs`, `sampleRate`, `channels`, `buffer` | Its identity and its `AudioBuffer` |
| `clip.bytes()` | `Promise<ArrayBuffer>`: a 16-bit PCM WAV of the clip's current buffer |
| `clip.dispose()` | Releases it; any later use of the clip throws `TypeError` |
| `voice.stop()`, `voice.ended` | Stop it; a promise that resolves when it ends or is stopped |

Misuse throws `TypeError`: a source that is not a stream, a `maxMs` that is not
positive, a `mimeType` the recorder cannot write, a disposed clip, a rate that is
not positive, a negative gain.

## Examples

```js
const { media, sound } = fw.runtime.resolveAll(['media', 'sound']);

button.addEventListener('click', async () => {
    await sound.unlock();                                  // inside the gesture
    const mic = await media.audio.start();
    const rec = sound.record(mic, { maxMs: 1500 });
    meter.update(() => rec.level());
    const clip = sound.normalize(sound.trim(await rec.stop()));
    mic.stop();

    sound.play(clip, { rate: sound.rate(4) });            // a major third up
    peer.send(await clip.bytes());                         // WAV bytes, yours to move
});

// on the receiving side
const clip = await sound.fromBytes(bytesFromPeer);
sound.play(clip, { rate: sound.rate(-3), gain: 0.8 });
```

## Notes

- **WAV clips at full scale**: 16-bit PCM holds -1..1. A recorder's decoded clip can reach a little past full scale (measured: 1.03 on Chromium's fake microphone, 6 samples in 0.6 s); `bytes()` clamps those. `normalize()` before `bytes()` keeps the peaks.
- **Rates**: `fromBytes` decodes to the context's sample rate, whatever the WAV says; the clip's `sampleRate` is that rate.
- **Measured in Chromium 148** (fake microphone): a 600 ms recording stopped by `maxMs`, its WAV decoded back within 1.4 LSB of 16 bits, trim, normalize to 0.9, and a play at `rate(5)` lasting `durationMs / rate` (125 ms for 128 expected).
- **Memory only**: the module never touches storage or the network; `disposeAll()` releases everything it holds.

## Scope and boundary

`sound` holds short clips: it records through `MediaRecorder`, keeps an `AudioBuffer` in memory and plays it. It does not process audio frame by frame. Continuous capture and playback as 128-sample frames over a port, in an `AudioWorklet`, is the `audio.webaudio` module of `@awacloud/media-audio` (monorepo directory `packages/front/media/audio`, experimental, not on npm). The two modules share no public member and each creates its own `AudioContext`; whether fw absorbs the second is re-examined in a 1.x minor.

## See also

- [media](./media.md) — the `StreamHandle` `record` takes (`media.audio.start()`)
