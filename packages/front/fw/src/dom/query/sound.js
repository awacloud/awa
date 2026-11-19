// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Short sound clips in memory: record from a microphone stream,
 * shape, encode, and play back at any rate (Web Audio + MediaRecorder).
 *
 * Built for clips of a second or two (a voice tag, a sound effect): a clip is
 * an `AudioBuffer` held in memory. Nothing is written to storage and nothing
 * is sent anywhere — moving a clip is the caller's business, through
 * `clip.bytes()` (a 16-bit PCM WAV) and `fromBytes` on the other side.
 *
 * ```
 * support()                     → { context, recorder, mimeTypes }
 * unlock()                      → Promise<void>      create / resume the AudioContext (in a user gesture)
 * record(handle, { maxMs, mimeType }) → Recording { level(), stop(), cancel() }
 * fromBytes(arrayBuffer)        → Promise<Clip>       decodeAudioData (WAV, Ogg, WebM …)
 * fromBuffer(audioBuffer)       → Clip                a synthesised sound
 * trim(clip, { thresholdDb })   → Clip                drop leading / trailing silence
 * normalize(clip, { peak })     → Clip                scale to a peak
 * play(clip, { rate, gain, when }) → Voice { stop(), ended }
 * rate(semitones)               → number              2^(s/12)
 * disposeAll()                  → Promise<void>      stop voices, drop clips, close the context
 * ```
 *
 * `record` takes a `StreamHandle` from the `media` module (`media.audio.start()`)
 * or a bare `MediaStream`. The context is created lazily; browsers start it
 * suspended until a user gesture, so call `unlock()` from a click before the
 * first `play`. Main thread only: Web Audio and MediaRecorder do not exist in
 * workers. Compatible with sanity `base` (no `Math.random`, no timing APIs —
 * clip ids are a counter, durations come from the buffers).
 */

/**
 * A clip held in memory.
 * @typedef {object} SoundClip
 * @property {string} id
 * @property {number} durationMs
 * @property {number} sampleRate
 * @property {number} channels
 * @property {AudioBuffer} buffer
 * @property {() => Promise<ArrayBuffer>} bytes A 16-bit PCM WAV of the current buffer.
 * @property {() => void} dispose Release the buffer; any later use throws `TypeError`.
 */

/**
 * A recording in progress.
 * @typedef {object} SoundRecording
 * @property {() => number} level Live RMS level, 0..1 (0 once stopped).
 * @property {() => Promise<SoundClip>} stop Stop and decode; idempotent (the auto-stop at `maxMs` included).
 * @property {() => void} cancel Drop it; `stop()` then rejects.
 */

/**
 * A clip playing.
 * @typedef {object} SoundVoice
 * @property {() => void} stop
 * @property {Promise<void>} ended Resolves when the voice ends or is stopped.
 */

/**
 * Public API returned by `sound.factory()`.
 * @typedef {object} SoundAPI
 * @property {() => {context: boolean, recorder: boolean, mimeTypes: string[]}} support
 * @property {() => Promise<void>} unlock
 * @property {(source: object, opts?: {maxMs?: number, mimeType?: string}) => SoundRecording} record
 * @property {(bytes: ArrayBuffer) => Promise<SoundClip>} fromBytes
 * @property {(buffer: AudioBuffer) => SoundClip} fromBuffer
 * @property {(clip: SoundClip, opts?: {thresholdDb?: number}) => SoundClip} trim
 * @property {(clip: SoundClip, opts?: {peak?: number}) => SoundClip} normalize
 * @property {(clip: SoundClip, opts?: {rate?: number, gain?: number, when?: number}) => SoundVoice} play
 * @property {(semitones: number) => number} rate
 * @property {() => Promise<void>} disposeAll
 */

export const sound = {
    name: 'sound',
    version: '1.0.0',
    type: 'fw.dom.query',
    dependencies: [],

    /** @returns {SoundAPI} */
    factory() {
        const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];

        /** @type {AudioContext|null} */
        let _ctx = null;
        let _seq = 0;
        /** @type {Set<SoundClip>} */
        const _clips = new Set();
        /** @type {Set<{source: AudioBufferSourceNode}>} */
        const _voices = new Set();

        const _Ctx = () => (typeof AudioContext !== 'undefined' ? AudioContext
            // @ts-ignore - the prefixed constructor of older Safari
            : (globalThis.webkitAudioContext || null));
        const _Rec = () => (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);

        /** The context, created on first need. */
        function _context() {
            if (_ctx) return _ctx;
            const C = _Ctx();
            if (!C) throw new TypeError('sound: Web Audio is not available here');
            _ctx = new C();
            return _ctx;
        }

        function support() {
            const R = _Rec();
            return {
                context: !!_Ctx(),
                recorder: !!R,
                mimeTypes: R && typeof R.isTypeSupported === 'function' ? MIME_CANDIDATES.filter((t) => R.isTypeSupported(t)) : [],
            };
        }

        async function unlock() {
            const ctx = _context();
            if (ctx.state !== 'running') await ctx.resume();
        }

        /** Wrap an AudioBuffer of the current context as a clip. */
        function _clip(buffer) {
            let alive = true;
            const live = () => { if (!alive) throw new TypeError('sound: the clip was disposed'); };
            /** @type {SoundClip} */
            const clip = {
                id: 'clip-' + (++_seq),
                durationMs: buffer.length * 1000 / buffer.sampleRate,
                sampleRate: buffer.sampleRate,
                channels: buffer.numberOfChannels,
                buffer,
                bytes: async () => { live(); return _wav(buffer); },
                dispose: () => { alive = false; _clips.delete(clip); },
            };
            Object.defineProperty(clip, '_live', { value: live });
            _clips.add(clip);
            return clip;
        }

        /** @param {SoundClip} clip */
        function _check(clip) {
            // @ts-ignore - the private liveness probe set by _clip
            if (!clip || typeof clip._live !== 'function') throw new TypeError('sound: not a clip');
            // @ts-ignore
            clip._live();
        }

        /** A fresh buffer of the context holding `channels` arrays. */
        function _bufferFrom(arrays, sampleRate) {
            const out = _context().createBuffer(arrays.length, Math.max(1, arrays[0].length), sampleRate);
            arrays.forEach((a, c) => out.getChannelData(c).set(a));
            return out;
        }

        const _channels = (buffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

        function fromBuffer(buffer) {
            if (!buffer || typeof buffer.getChannelData !== 'function' || !(buffer.length > 0)) {
                throw new TypeError('sound: fromBuffer needs a non-empty AudioBuffer');
            }
            return _clip(_bufferFrom(_channels(buffer), buffer.sampleRate));
        }

        async function fromBytes(bytes) {
            if (!(bytes instanceof ArrayBuffer)) throw new TypeError('sound: fromBytes needs an ArrayBuffer');
            // decodeAudioData detaches its input in some engines: decode a copy
            const buffer = await _context().decodeAudioData(bytes.slice(0));
            return _clip(buffer);
        }

        function trim(clip, opts) {
            _check(clip);
            const db = opts && opts.thresholdDb !== undefined ? opts.thresholdDb : -45;
            if (typeof db !== 'number' || !Number.isFinite(db) || db > 0) throw new TypeError('sound: thresholdDb must be a finite number <= 0');
            const thr = 10 ** (db / 20);
            const ch = _channels(clip.buffer);
            const loud = (i) => ch.some((a) => Math.abs(a[i]) > thr);
            let first = 0;
            while (first < clip.buffer.length && !loud(first)) first++;
            if (first === clip.buffer.length) return _clip(_bufferFrom(ch.map(() => new Float32Array(1)), clip.sampleRate));
            let last = clip.buffer.length - 1;
            while (last > first && !loud(last)) last--;
            return _clip(_bufferFrom(ch.map((a) => a.slice(first, last + 1)), clip.sampleRate));
        }

        function normalize(clip, opts) {
            _check(clip);
            const peak = opts && opts.peak !== undefined ? opts.peak : 0.9;
            if (typeof peak !== 'number' || !(peak > 0 && peak <= 1)) throw new TypeError('sound: peak must be in (0, 1]');
            const ch = _channels(clip.buffer);
            let max = 0;
            for (const a of ch) for (const x of a) max = Math.max(max, Math.abs(x));
            const k = max === 0 ? 1 : peak / max;
            return _clip(_bufferFrom(ch.map((a) => a.map((x) => x * k)), clip.sampleRate));
        }

        function play(clip, opts) {
            _check(clip);
            const o = opts || {};
            const r = o.rate === undefined ? 1 : o.rate;
            const g = o.gain === undefined ? 1 : o.gain;
            if (typeof r !== 'number' || !(r > 0) || !Number.isFinite(r)) throw new TypeError('sound: rate must be a positive number');
            if (typeof g !== 'number' || !(g >= 0) || !Number.isFinite(g)) throw new TypeError('sound: gain must be a non-negative number');
            if (o.when !== undefined && (typeof o.when !== 'number' || !(o.when >= 0))) throw new TypeError('sound: when must be a time >= 0');
            const ctx = _context();
            const source = ctx.createBufferSource();
            source.buffer = clip.buffer;
            source.playbackRate.value = r;
            const gain = ctx.createGain();
            gain.gain.value = g;
            source.connect(gain).connect(ctx.destination);
            const voice = { source };
            let done;
            const ended = new Promise((res) => { done = res; });
            source.onended = () => {
                _voices.delete(voice);
                try { source.disconnect(); gain.disconnect(); } catch (_e) { /* already disconnected */ }
                done();
            };
            _voices.add(voice);
            source.start(o.when);
            return {
                stop() { try { source.stop(); } catch (_e) { /* not started or already stopped */ } },
                ended,
            };
        }

        const rate = (semitones) => 2 ** (semitones / 12);

        function record(source, opts) {
            const stream = source && source.stream ? source.stream : source;
            if (!stream || typeof stream.getAudioTracks !== 'function') throw new TypeError('sound: record needs a StreamHandle or a MediaStream');
            const o = opts || {};
            const maxMs = o.maxMs === undefined ? 1500 : o.maxMs;
            if (typeof maxMs !== 'number' || !(maxMs > 0) || !Number.isFinite(maxMs)) throw new TypeError('sound: maxMs must be a positive number');
            const R = _Rec();
            if (!R) throw new TypeError('sound: MediaRecorder is not available here');
            let mimeType = o.mimeType;
            if (mimeType !== undefined && !(typeof R.isTypeSupported === 'function' && R.isTypeSupported(mimeType))) {
                throw new TypeError('sound: the recorder cannot write ' + mimeType);
            }
            if (mimeType === undefined) mimeType = support().mimeTypes[0];

            const ctx = _context();
            const input = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            input.connect(analyser);
            const frame = new Float32Array(analyser.fftSize);
            const recorder = mimeType ? new R(stream, { mimeType }) : new R(stream);
            const chunks = [];
            let state = 'recording';
            /** @type {Promise<SoundClip>|null} */
            let result = null;
            let settle;
            const release = () => { try { input.disconnect(); analyser.disconnect(); } catch (_e) { /* gone */ } };

            recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onstop = () => { if (settle) settle(); };
            recorder.start();
            const timer = setTimeout(() => { finish(); }, maxMs);

            function finish() {
                if (result) return result;
                if (state === 'cancelled') return Promise.reject(new Error('sound: recording cancelled'));
                state = 'stopping';
                clearTimeout(timer);
                result = new Promise((res) => { settle = res; })
                    .then(() => new Blob(chunks, { type: recorder.mimeType }).arrayBuffer())
                    .then((ab) => ctx.decodeAudioData(ab))
                    .then((buffer) => { state = 'stopped'; release(); return _clip(buffer); });
                if (recorder.state !== 'inactive') recorder.stop(); else settle();
                return result;
            }

            return {
                level() {
                    if (state !== 'recording') return 0;
                    analyser.getFloatTimeDomainData(frame);
                    let sum = 0;
                    for (const x of frame) sum += x * x;
                    return Math.min(1, Math.sqrt(sum / frame.length));
                },
                stop: finish,
                cancel() {
                    if (state !== 'recording') return;
                    state = 'cancelled';
                    clearTimeout(timer);
                    recorder.ondataavailable = null;
                    recorder.onstop = null;
                    if (recorder.state !== 'inactive') recorder.stop();
                    release();
                },
            };
        }

        async function disposeAll() {
            for (const v of Array.from(_voices)) { try { v.source.stop(); } catch (_e) { /* not playing */ } }
            _voices.clear();
            for (const c of Array.from(_clips)) c.dispose();
            const ctx = _ctx;
            _ctx = null;
            if (ctx && ctx.state !== 'closed') await ctx.close();
        }

        /** A 16-bit PCM WAV (RIFF) of an AudioBuffer, channels interleaved. */
        function _wav(buffer) {
            const ch = _channels(buffer);
            const n = buffer.length;
            const out = new ArrayBuffer(44 + n * ch.length * 2);
            const v = new DataView(out);
            const tag = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
            tag(0, 'RIFF'); v.setUint32(4, 36 + n * ch.length * 2, true); tag(8, 'WAVE');
            tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch.length, true);
            v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * ch.length * 2, true);
            v.setUint16(32, ch.length * 2, true); v.setUint16(34, 16, true);
            tag(36, 'data'); v.setUint32(40, n * ch.length * 2, true);
            let o = 44;
            for (let i = 0; i < n; i++) {
                for (const a of ch) {
                    // x 32768 then clamp: the scale decoders divide by
                    v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(a[i] * 32768))), true);
                    o += 2;
                }
            }
            return out;
        }

        return { support, unlock, record, fromBytes, fromBuffer, trim, normalize, play, rate, disposeAll };
    }
};
