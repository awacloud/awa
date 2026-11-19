// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.webaudio` (row B1a). Bun has no Web Audio:
 * the module is checked to refuse cleanly, and its two worklet processors
 * are run here on their own, the worklet scope stood in for. The graph
 * itself is proven in Chromium (`bench/webaudio/check.html`).
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const webaudio = runtime.resolve('audio.webaudio');

// ── A stand-in for the worklet scope ────────────────────────────────────
const registered = new Map();
let dir = null;

/** A port that records what it posts; `receive` plays the other side. */
function fakePort() {
    const port = { sent: [], onmessage: null, postMessage(data, transfer) { port.sent.push({ data, transfer }); }, receive(data) { port.onmessage?.({ data }); } };
    return port;
}

beforeAll(async () => {
    globalThis.AudioWorkletProcessor = class {
        constructor() {
            this.port = fakePort();
        }
    };
    globalThis.registerProcessor = (name, ctor) => registered.set(name, ctor);
    dir = mkdtempSync(join(tmpdir(), 'awa-webaudio-'));
    const file = join(dir, 'processors.js');
    writeFileSync(file, webaudio.processorSource);
    await import(pathToFileURL(file).href);
});

afterAll(() => {
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
    if (dir) rmSync(dir, { recursive: true, force: true });
});

const ramp = (from, n) => Float32Array.from({ length: n }, (_, i) => (from + i) / 1024);

describe('audio.webaudio without Web Audio', () => {
    test('says it is not supported, and refuses with a clear error', () => {
        expect(webaudio.supported()).toBe(false);
        expect(() => webaudio.createContext()).toThrow(/Web Audio/);
        expect(() => webaudio.install({})).toThrow(/Web Audio/);
        expect(() => webaudio.capture({}, {})).toThrow(/Web Audio/);
        expect(() => webaudio.playback({})).toThrow(/Web Audio/);
    });

    test('refuses a rate the codec does not take', () => {
        expect(() => webaudio.createContext({ rate: 32000 })).toThrow(RangeError);
    });

    test('names its two processors and gives their module as text', () => {
        expect(webaudio.processors).toEqual({ capture: 'awa-capture', playback: 'awa-playback' });
        expect(typeof webaudio.processorSource).toBe('string');
        expect([...registered.keys()].sort()).toEqual(['awa-capture', 'awa-playback']);
    });
});

describe('audio.webaudio defaults (D17)', () => {
    test('the playback keeps a reserve of 3 and trims over one second, unless told otherwise', () => {
        const made = [];
        globalThis.AudioContext = function AudioContext() {};
        globalThis.AudioWorkletNode = class {
            constructor(context, name, options) {
                made.push({ name, options });
                this.port = { close() {} };
            }
            connect() {}
            disconnect() {}
        };
        try {
            const context = (rate) => ({ sampleRate: rate, destination: {} });
            webaudio.playback(context(48000));
            webaudio.playback(context(44100));
            webaudio.playback(context(48000), { trim: 0 });
            webaudio.playback(context(48000), { depth: 4, trim: 100 });
            webaudio.playback(context(48000), { comfort: true });
            webaudio.playback(context(48000), { comfort: true, comfortDb: -20 });
            expect(made.map((m) => m.options.processorOptions)).toEqual([
                { depth: 3, max: 16, trim: 375, comfort: false, comfortDb: -10 },
                { depth: 3, max: 16, trim: 345, comfort: false, comfortDb: -10 },
                { depth: 3, max: 16, trim: 0, comfort: false, comfortDb: -10 },
                { depth: 4, max: 16, trim: 100, comfort: false, comfortDb: -10 },
                { depth: 3, max: 16, trim: 375, comfort: true, comfortDb: -10 },
                { depth: 3, max: 16, trim: 375, comfort: true, comfortDb: -20 },
            ]);
            expect(() => webaudio.playback(context(48000), { comfortDb: 3 })).toThrow(RangeError);
        } finally {
            delete globalThis.AudioContext;
            delete globalThis.AudioWorkletNode;
        }
    });
});

describe('audio.webaudio install (pass P)', () => {
    test('a failed install is not kept: the documented fallback with a url can try again', async () => {
        globalThis.AudioContext = function AudioContext() {};
        globalThis.AudioWorkletNode = class {};
        const revoked = [];
        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;
        URL.createObjectURL = () => 'blob:awa-test';
        URL.revokeObjectURL = (url) => revoked.push(url);
        try {
            const asked = [];
            const context = { audioWorklet: { addModule: (url) => { asked.push(url); return url.startsWith('blob:') ? Promise.reject(new Error('blocked by the page policy')) : Promise.resolve(); } } };
            await expect(webaudio.install(context)).rejects.toThrow(/policy/);
            await webaudio.install(context, { url: '/processors.js' });
            expect(asked).toEqual(['blob:awa-test', '/processors.js']);
            expect(revoked).toEqual(['blob:awa-test']);
            // Installed once, kept: a second call does not load again.
            await webaudio.install(context, { url: '/processors.js' });
            expect(asked).toHaveLength(2);
        } finally {
            URL.createObjectURL = realCreate;
            URL.revokeObjectURL = realRevoke;
            delete globalThis.AudioContext;
            delete globalThis.AudioWorkletNode;
        }
    });
});

describe('the capture processor', () => {
    const make = () => new (registered.get('awa-capture'))({ processorOptions: { frame: 128 } });

    test('gives frames of 128 samples, the input sample for sample, each one transferred', () => {
        const processor = make();
        const input = ramp(0, 128);
        expect(processor.process([[input]], [[new Float32Array(128)]])).toBe(true);
        expect(processor.port.sent).toHaveLength(1);
        const { data, transfer } = processor.port.sent[0];
        expect(data).toEqual(input);
        expect(transfer).toEqual([data.buffer]);
    });

    test('regroups any input size into frames of 128, in order', () => {
        const processor = make();
        const source = ramp(0, 128 * 5);
        let at = 0;
        for (const size of [64, 64, 200, 56, 100, 156]) {
            processor.process([[source.subarray(at, at + size)]], [[new Float32Array(size)]]);
            at += size;
        }
        const frames = processor.port.sent.map((message) => message.data);
        expect(frames).toHaveLength(5);
        frames.forEach((frame, k) => expect(frame).toEqual(source.subarray(k * 128, (k + 1) * 128)));
    });

    test('mixes several channels down to their mean, and counts no input as silence', () => {
        const processor = make();
        const left = ramp(0, 128);
        const right = ramp(512, 128);
        processor.process([[left, right]], [[new Float32Array(128)]]);
        expect(processor.port.sent[0].data).toEqual(Float32Array.from(left, (v, i) => (v + right[i]) / 2));
        processor.process([[]], [[new Float32Array(128)]]);
        expect(processor.port.sent[1].data).toEqual(new Float32Array(128));
    });
});

describe('the playback processor', () => {
    const make = (options = { depth: 3, max: 6 }) => new (registered.get('awa-playback'))({ processorOptions: options });
    const quantum = (processor, size = 128) => {
        const out = [new Float32Array(size)];
        expect(processor.process([], [out])).toBe(true);
        return out[0];
    };
    const stats = (processor) => {
        processor.port.receive({ type: 'stats' });
        return processor.port.sent.at(-1).data;
    };

    test('waits for `depth` frames, then plays them in order', () => {
        const processor = make();
        const frames = [0, 1, 2, 3].map((k) => ramp(k * 128, 128));
        processor.port.receive(frames[0]);
        processor.port.receive(frames[1]);
        expect(quantum(processor)).toEqual(new Float32Array(128));       // two queued: still waiting
        processor.port.receive(frames[2]);
        processor.port.receive(frames[3]);
        for (const frame of frames) expect(quantum(processor)).toEqual(frame);
        expect(stats(processor)).toEqual({ type: 'stats', queued: 0, played: 4, underruns: 0, dropped: 0, trimmed: 0, silences: 0, comforted: 0 });
    });

    test('plays silence on an underrun, counts it, and waits for `depth` again', () => {
        const processor = make();
        for (let k = 0; k < 3; k++) processor.port.receive(ramp(k * 128, 128));
        for (let k = 0; k < 3; k++) quantum(processor);
        expect(quantum(processor)).toEqual(new Float32Array(128));
        expect(stats(processor).underruns).toBe(1);
        processor.port.receive(ramp(0, 128));
        expect(quantum(processor)).toEqual(new Float32Array(128));       // one queued: waiting, not another underrun
        expect(stats(processor).underruns).toBe(1);
    });

    test('drops the oldest frames beyond `max`', () => {
        const processor = make({ depth: 1, max: 2 });
        const frames = [0, 1, 2, 3].map((k) => ramp(k * 128, 128));
        for (const frame of frames) processor.port.receive(frame);
        expect(stats(processor)).toMatchObject({ queued: 2, dropped: 2 });
        expect(quantum(processor)).toEqual(frames[2]);
        expect(quantum(processor)).toEqual(frames[3]);
    });

    test('without trim, a queue that grew stays grown', () => {
        const processor = make({ depth: 2, max: 32 });
        for (let k = 0; k < 6; k++) processor.port.receive(ramp(k * 128, 128));
        for (let k = 6; k < 26; k++) {
            processor.port.receive(ramp(k * 128, 128));
            quantum(processor);
        }
        expect(stats(processor)).toMatchObject({ queued: 6, trimmed: 0 });
    });

    test('with trim, an excess that lasts a whole window is dropped, oldest first', () => {
        const processor = make({ depth: 2, max: 32, trim: 4 });
        for (let k = 0; k < 6; k++) processor.port.receive(ramp(k * 128, 128));
        const played = [];
        for (let k = 6; k < 12; k++) {
            processor.port.receive(ramp(k * 128, 128));
            played.push(quantum(processor)[0] * 1024 / 128);
        }
        // Four quanta with six frames queued at their start: four over the depth of 2 go; frames 4 to 7.
        expect(played).toEqual([0, 1, 2, 3, 8, 9]);
        expect(stats(processor)).toMatchObject({ queued: 2, trimmed: 4, dropped: 0 });
    });

    test('with trim, an excess that does not last is kept', () => {
        const processor = make({ depth: 2, max: 32, trim: 4 });
        for (let k = 0; k < 2; k++) processor.port.receive(ramp(k * 128, 128));
        // One quantum in the window starts with only the depth queued: nothing is in excess for the whole window.
        let next = 2;
        for (let q = 0; q < 8; q++) {
            if (q !== 1) processor.port.receive(ramp(next++ * 128, 128));
            if (q === 2) processor.port.receive(ramp(next++ * 128, 128));
            quantum(processor);
        }
        expect(stats(processor).trimmed).toBe(0);
    });

    test('fills outputs of any size from the queue, and every output channel alike', () => {
        const processor = make({ depth: 2, max: 8 });
        const source = ramp(0, 256);
        processor.port.receive(source.slice(0, 128));
        processor.port.receive(source.slice(128, 256));
        const a = quantum(processor, 100);
        const out = [new Float32Array(156), new Float32Array(156)];
        processor.process([], [out]);
        expect(a).toEqual(source.subarray(0, 100));
        expect(out[0]).toEqual(source.subarray(100, 256));
        expect(out[1]).toEqual(out[0]);
    });

    const rms = (frame) => Math.sqrt(frame.reduce((sum, v) => sum + v * v, 0) / frame.length);

    test('with comfort, an announced silence plays a noise under its level, not counted as underruns (row A8b, D22)', () => {
        const processor = make({ depth: 2, max: 8, comfort: true, comfortDb: -10 });
        for (let k = 0; k < 2; k++) processor.port.receive(ramp(k * 128, 128));
        quantum(processor);
        processor.port.receive({ type: 'silence', level: 0.01 });
        quantum(processor);
        const noise = [];
        for (let k = 0; k < 40; k++) noise.push(...quantum(processor));
        // The owner: under the conversation's level — 10 dB under the level announced.
        expect(Math.abs(rms(Float32Array.from(noise)) / (0.01 * 10 ** (-10 / 20)) - 1)).toBeLessThan(0.1);
        expect(stats(processor)).toMatchObject({ underruns: 0, silences: 1, comforted: 40 });
        // Frames back: the reserve is waited for, the noise goes on meanwhile, then the frames play.
        processor.port.receive(ramp(0, 128));
        expect(rms(quantum(processor))).toBeGreaterThan(0.002);
        processor.port.receive(ramp(128, 128));
        expect(quantum(processor)).toEqual(ramp(0, 128));
        expect(quantum(processor)).toEqual(ramp(128, 128));
    });

    test('without comfort, an announced silence plays zeros and counts no underrun; an unannounced one still does', () => {
        const processor = make({ depth: 1, max: 8 });
        processor.port.receive(ramp(0, 128));
        quantum(processor);
        processor.port.receive({ type: 'silence', level: 0.01 });
        expect(quantum(processor)).toEqual(new Float32Array(128));
        expect(quantum(processor)).toEqual(new Float32Array(128));
        expect(stats(processor)).toMatchObject({ underruns: 0, silences: 1, comforted: 0 });
        processor.port.receive(ramp(0, 128));
        quantum(processor);
        quantum(processor);
        expect(stats(processor).underruns).toBe(1);
    });
});

describe('audio.webaudio playback stats (pass P)', () => {
    test('stats() passes every count through, and gives null when the processor does not answer in time', async () => {
        globalThis.AudioContext = function AudioContext() {};
        let answer = true;
        globalThis.AudioWorkletNode = class {
            constructor() {
                const listeners = new Set();
                this.port = {
                    addEventListener: (type, fn) => listeners.add(fn),
                    removeEventListener: (type, fn) => listeners.delete(fn),
                    start() {},
                    close() {},
                    postMessage: () => {
                        if (!answer) return;
                        const data = { type: 'stats', queued: 1, played: 2, underruns: 0, dropped: 0, trimmed: 0, silences: 3, comforted: 40 };
                        setTimeout(() => { for (const fn of listeners) fn({ data }); }, 1);
                    },
                };
            }
            connect() {}
            disconnect() {}
        };
        try {
            const handle = webaudio.playback({ sampleRate: 48000, destination: {} });
            expect(await handle.stats()).toEqual({ queued: 1, played: 2, underruns: 0, dropped: 0, trimmed: 0, silences: 3, comforted: 40 });
            answer = false;
            expect(await handle.stats({ wait: 20 })).toBeNull();
        } finally {
            delete globalThis.AudioContext;
            delete globalThis.AudioWorkletNode;
        }
    });
});
