// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// `sound`: record short clips from a microphone stream, keep them in memory,
// play them back at any rate. Bun has no Web Audio, so these tests run on a
// small stand-in (an AudioContext that holds sample arrays, a MediaRecorder
// that emits one chunk, a decodeAudioData that reads WAV); the sample maths,
// the WAV bytes and the state machines are what they check. The browser leg
// (a real microphone stream in headless Chromium) is the lane's evidence.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { sound } from './sound.js';

// ── Web Audio stand-in ────────────────────────────────────────────────────────

class FakeBuffer {
    constructor(channels, length, sampleRate) {
        this.numberOfChannels = channels;
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this._d = Array.from({ length: channels }, () => new Float32Array(length));
    }
    getChannelData(c) { return this._d[c]; }
    copyToChannel(src, c, start = 0) { this._d[c].set(src, start); }
}

/** Read a 16-bit PCM WAV back into a FakeBuffer (what a browser's decoder does). */
function decodeWav(ab) {
    if (ab.byteLength < 44) return null;
    const v = new DataView(ab);
    const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
    const channels = v.getUint16(22, true);
    const rate = v.getUint32(24, true);
    const bytes = v.getUint32(40, true);
    const frames = bytes / 2 / channels;
    const b = new FakeBuffer(channels, frames, rate);
    for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) b._d[c][i] = v.getInt16(44 + (i * channels + c) * 2, true) / 32768;
    return b;
}

let sources = [];
class FakeContext {
    constructor() { this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0; this.destination = { node: 'out' }; FakeContext.made++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(ch, len, sr) { return new FakeBuffer(ch, len, sr); }
    createGain() { return { gain: { value: 1 }, connect(n) { return n; }, disconnect() {} }; }
    createBufferSource() {
        const src = {
            buffer: null, playbackRate: { value: 1 }, onended: null, startedAt: null, stopped: false,
            connect(n) { return n; }, disconnect() {},
            start(when) { src.startedAt = when === undefined ? 0 : when; sources.push(src); },
            stop() { src.stopped = true; if (src.onended) src.onended(); },
        };
        return src;
    }
    createMediaStreamSource(stream) { return { stream, connect(n) { return n; }, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, connect(n) { return n; }, disconnect() {}, getFloatTimeDomainData(a) { a.fill(0.5); } }; }
    decodeAudioData(ab) {
        const wav = decodeWav(ab);
        if (wav) return Promise.resolve(wav);
        // a recorder chunk: 0.6 s of a 0.25 tone
        const b = new FakeBuffer(1, 28800, 48000);
        b._d[0].fill(0.25);
        return Promise.resolve(b);
    }
}
FakeContext.made = 0;

class FakeRecorder {
    constructor(stream, opts) { this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
        this.state = 'inactive';
        if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3])]) });
        if (this.onstop) this.onstop();
    }
    static isTypeSupported(t) { return t.startsWith('audio/webm'); }
}

const stream = () => ({ getAudioTracks: () => [{ kind: 'audio' }], getTracks: () => [] });
const handle = () => ({ id: 's1', type: 'audio', stream: stream(), stop() {} });

let saved;
beforeEach(() => {
    saved = { AudioContext: globalThis.AudioContext, MediaRecorder: globalThis.MediaRecorder };
    globalThis.AudioContext = FakeContext;
    globalThis.MediaRecorder = FakeRecorder;
    sources = [];
});
afterEach(() => {
    globalThis.AudioContext = saved.AudioContext;
    globalThis.MediaRecorder = saved.MediaRecorder;
});

/** A clip from given samples (mono, 48 kHz). */
function clipOf(s, samples) {
    const b = new FakeBuffer(1, samples.length, 48000);
    b._d[0].set(samples);
    return s.fromBuffer(b);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('sound — metadata and support', () => {
    test('descriptor', () => {
        expect(sound.name).toBe('sound');
        expect(sound.type).toBe('fw.dom.query');
        expect(sound.dependencies).toEqual([]);
    });

    test('support() reflects the globals', () => {
        expect(sound.factory().support()).toEqual({ context: true, recorder: true, mimeTypes: ['audio/webm;codecs=opus', 'audio/webm'] });
        delete globalThis.AudioContext; delete globalThis.MediaRecorder;
        expect(sound.factory().support()).toEqual({ context: false, recorder: false, mimeTypes: [] });
    });

    test('rate(semitones) = 2^(s/12)', () => {
        const s = sound.factory();
        expect(s.rate(0)).toBe(1);
        expect(s.rate(12)).toBe(2);
        expect(s.rate(-12)).toBe(0.5);
        expect(s.rate(7)).toBeCloseTo(1.4983, 4);
    });

    test('unlock() creates one context and resumes it', async () => {
        const s = sound.factory();
        const before = FakeContext.made;
        await s.unlock(); await s.unlock();
        expect(FakeContext.made - before).toBe(1);
    });
});

describe('sound — clips', () => {
    test('fromBuffer exposes the clip', () => {
        const c = clipOf(sound.factory(), new Float32Array(4800));
        expect(c).toMatchObject({ durationMs: 100, sampleRate: 48000, channels: 1 });
        expect(typeof c.id).toBe('string');
    });

    test('bytes() is a 16-bit PCM WAV that decodes back to the samples', async () => {
        const s = sound.factory();
        const samples = Float32Array.from([0, 0.5, -0.5, 0.999, -1, 0.25]);
        const wav = await clipOf(s, samples).bytes();
        const v = new DataView(wav);
        expect(wav.byteLength).toBe(44 + samples.length * 2);
        expect([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, 1, 48000, 16]);
        const back = await s.fromBytes(wav);
        for (let i = 0; i < samples.length; i++) expect(Math.abs(back.buffer.getChannelData(0)[i] - samples[i])).toBeLessThan(1 / 32767 + 1e-6);
    });

    test('trim drops leading and trailing silence, the source is untouched', () => {
        const s = sound.factory();
        const c = clipOf(s, Float32Array.from([0, 0.001, 0.5, 0, 0.6, 0.002, 0]));
        const t = s.trim(c);                                   // -45 dB ≈ 0.0056
        expect(Array.from(t.buffer.getChannelData(0))).toEqual([0.5, 0, Math.fround(0.6)]);
        expect(c.buffer.length).toBe(7);
        expect(t.id).not.toBe(c.id);
    });

    test('trim of a silent clip keeps one sample', () => {
        const s = sound.factory();
        expect(s.trim(clipOf(s, new Float32Array(100))).buffer.length).toBe(1);
    });

    test('normalize scales the peak, the source is untouched', () => {
        const s = sound.factory();
        const c = clipOf(s, Float32Array.from([0.1, -0.3, 0.2]));
        const n = s.normalize(c, { peak: 0.9 });
        expect(Array.from(n.buffer.getChannelData(0)).map((x) => +x.toFixed(4))).toEqual([0.3, -0.9, 0.6]);
        expect(c.buffer.getChannelData(0)[1]).toBeCloseTo(-0.3, 6);
        expect(s.normalize(clipOf(s, new Float32Array(3))).buffer.getChannelData(0)[0]).toBe(0);
    });

    test('a disposed clip refuses every use', async () => {
        const s = sound.factory();
        const c = clipOf(s, new Float32Array(10));
        c.dispose();
        expect(() => s.play(c)).toThrow(TypeError);
        expect(() => s.trim(c)).toThrow(TypeError);
        await expect(c.bytes()).rejects.toBeInstanceOf(TypeError);
    });
});

describe('sound — voices', () => {
    test('play sets rate and gain, starts at when, stops, and ends', async () => {
        const s = sound.factory();
        await s.unlock();
        const c = clipOf(s, new Float32Array(480));
        const v = s.play(c, { rate: s.rate(5), gain: 0.4, when: 1.5 });
        const src = sources[0];
        expect(src.playbackRate.value).toBeCloseTo(2 ** (5 / 12), 9);
        expect(src.startedAt).toBe(1.5);
        expect(src.buffer).toBe(c.buffer);
        v.stop();
        await v.ended;
        expect(src.stopped).toBe(true);
    });

    test('rate or gain out of range is a TypeError', () => {
        const s = sound.factory();
        const c = clipOf(s, new Float32Array(10));
        expect(() => s.play(c, { rate: 0 })).toThrow(TypeError);
        expect(() => s.play(c, { gain: -1 })).toThrow(TypeError);
    });
});

describe('sound — recording', () => {
    test('record → level → stop gives a clip', async () => {
        const s = sound.factory();
        await s.unlock();
        const r = s.record(handle());
        expect(r.level()).toBeCloseTo(0.5, 6);
        const c = await r.stop();
        expect(c.durationMs).toBe(600);
        expect(await r.stop()).toBe(c);                        // idempotent
    });

    test('maxMs stops on its own; stop() then returns that clip', async () => {
        const s = sound.factory();
        const r = s.record(handle(), { maxMs: 30 });
        await new Promise((res) => setTimeout(res, 80));
        const c = await r.stop();
        expect(c.durationMs).toBe(600);
    });

    test('cancel drops the recording: stop() rejects', async () => {
        const s = sound.factory();
        const r = s.record(stream());                          // a bare MediaStream works too
        r.cancel();
        await expect(r.stop()).rejects.toThrow('cancelled');
        expect(r.level()).toBe(0);
    });

    test('misuse is a TypeError', () => {
        const s = sound.factory();
        expect(() => s.record({})).toThrow(TypeError);
        expect(() => s.record(handle(), { maxMs: 0 })).toThrow(TypeError);
        expect(() => s.record(handle(), { mimeType: 'audio/wav' })).toThrow(TypeError);   // the recorder cannot
    });
});

describe('sound — disposeAll', () => {
    test('stops voices, disposes clips, closes the context', async () => {
        const s = sound.factory();
        await s.unlock();
        const c = clipOf(s, new Float32Array(48));
        s.play(c);
        await s.disposeAll();
        expect(sources[0].stopped).toBe(true);
        expect(() => s.play(c)).toThrow(TypeError);
        // a later use opens a fresh context
        const before = FakeContext.made;
        clipOf(s, new Float32Array(4));
        expect(FakeContext.made - before).toBe(1);
    });
});
