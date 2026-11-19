// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The loop-back of row B1b, measured: a generated source →
 * capture worklet → `audio.link` in a worker (encoder, decoder) →
 * playback worklet, on a live context at 48 000 Hz.
 *
 * Two more capture nodes watch the source and the playback output; all
 * three start on the same render quantum (the graph is built while the
 * context is suspended), so the delay inside the graph is read by
 * correlation, in samples, one second after the start and again near the
 * end. The source is a noise low-passed at 4 kHz, which every preset
 * keeps. The playback is not connected to the speakers: the run is
 * silent. Each run lasts ten seconds; the jitter buffer is tried at
 * depths 1 to 4, without and with `trim` (a window of one second), then
 * other presets, then with the page's thread kept busy. The result is
 * left in `window.__loopCheck`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const webaudio = runtime.resolve('audio.webaudio');
const codec = runtime.resolve('audio.codec');

const SECONDS = Number(new URLSearchParams(location.search).get('seconds') ?? 10);
const report = { seconds: SECONDS, context: null, runs: [], ok: false };
const state = document.getElementById('state');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A seeded noise, as float32, at a modest level. */
function noise(n, seed) {
    let s = seed >>> 0;
    return Float32Array.from({ length: n }, () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return 0.3 * (s / 2 ** 31 - 1);
    });
}

/** Sends a message to the worker and waits for the answer of a type (or an error). */
function ask(worker, message, type, transfer = []) {
    return new Promise((resolve, reject) => {
        const listener = ({ data }) => {
            if (data.type !== type && data.type !== 'error') return;
            worker.removeEventListener('message', listener);
            if (data.type === 'error') reject(new Error(data.message));
            else resolve(data);
        };
        worker.addEventListener('message', listener);
        worker.postMessage(message, transfer);
    });
}

const concat = (frames) => {
    const out = new Float32Array(frames.length * 128);
    frames.forEach((frame, k) => out.set(frame, k * 128));
    return out;
};

/** The lag of `b` behind `a` with the highest normalised correlation, from 0 to `maxLag`. */
function lagOf(a, b, { from, length, maxLag }) {
    let best = { lag: -1, score: -Infinity };
    let ea = 0;
    for (let i = from; i < from + length; i++) ea += a[i] * a[i];
    for (let lag = 0; lag <= maxLag; lag++) {
        let dot = 0;
        let eb = 0;
        for (let i = from; i < from + length; i++) {
            const v = b[i + lag];
            dot += a[i] * v;
            eb += v * v;
        }
        const score = eb > 0 ? dot / Math.sqrt(ea * eb) : 0;
        if (score > best.score) best = { lag, score };
    }
    return best;
}

async function run(context, worker, buffer, { preset, depth, trim = 0, busy = false, group = 4 }) {
    await context.suspend();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 4000;
    source.connect(band);
    const capture = webaudio.capture(context, band);
    const watchIn = webaudio.capture(context, band);
    const player = webaudio.playback(context, { depth, max: 32, trim });
    player.node.disconnect();                       // silent: not to the speakers
    const watchOut = webaudio.capture(context, player.node);
    const seen = [];
    const heard = [];
    watchIn.port.onmessage = ({ data }) => seen.push(data);
    watchOut.port.onmessage = ({ data }) => heard.push(data);
    await ask(worker, { type: 'open', capture: capture.port, playback: player.port, config: { rate: context.sampleRate, preset }, group }, 'opened', [capture.port, player.port]);
    source.start();
    await context.resume();
    // The page's thread kept busy: 60 ms of work every 100 ms.
    let spin = null;
    if (busy) {
        spin = setInterval(() => {
            const end = performance.now() + 60;
            while (performance.now() < end) { /* busy */ }
        }, 100);
    }
    await sleep(SECONDS * 1000);
    if (spin) clearInterval(spin);
    const stats = await ask(worker, { type: 'stats' }, 'stats');
    await context.suspend();
    source.stop();
    for (const node of [band, capture.node, watchIn.node, player.node, watchOut.node]) node.disconnect();
    await ask(worker, { type: 'close' }, 'closed');

    const a = concat(seen);
    const b = concat(heard);
    const rate = context.sampleRate;
    const window = rate / 4;
    const maxLag = 4800;
    const early = lagOf(a, b, { from: rate, length: window, maxLag });
    const lateFrom = Math.min(a.length, b.length) - window - maxLag - 1;
    const late = lagOf(a, b, { from: lateFrom, length: window, maxLag });
    const codecDelay = codec.delay({ rate, preset });
    return {
        preset,
        depth,
        trim,
        busy,
        group,
        frames: stats.frames,
        kbps: +((stats.bytes * 8) / (stats.frames * 128 / context.sampleRate) / 1000).toFixed(1),
        wireKbps: +((stats.wireBytes * 8) / (stats.frames * 128 / context.sampleRate) / 1000).toFixed(1),
        encodeUsPerFrame: +((stats.encodeMs * 1000) / stats.frames).toFixed(1),
        decodeUsPerFrame: +((stats.decodeMs * 1000) / Math.max(1, stats.decoded)).toFixed(1),
        playback: stats.playback,
        delayEarlySamples: early.lag,
        delayLateSamples: late.lag,
        delayLateMs: +((late.lag * 1000) / rate).toFixed(2),
        // A frame leaves when its group is full: the first packet of a group waits for the others.
        expectedSamples: (depth + 1) * 128 + codecDelay + (group - 1) * 128,
        correlation: +Math.min(early.score, late.score).toFixed(3),
        codecDelaySamples: codecDelay,
    };
}

async function main() {
    const context = webaudio.createContext();
    await webaudio.install(context);
    report.context = { sampleRate: context.sampleRate, baseLatencyMs: +(context.baseLatency * 1000).toFixed(2), outputLatencyMs: +((context.outputLatency || 0) * 1000).toFixed(2) };
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    buffer.copyToChannel(noise(context.sampleRate * 2, 5), 0);
    const worker = new Worker(new URL('../../dist/workers/loop.js', import.meta.url), { type: 'module' });
    const plan = [
        ...[1, 2, 3, 4].flatMap((depth) => [{ preset: 'voice', depth }, { preset: 'voice', depth, trim: 375 }]),
        { preset: 'music', depth: 3, trim: 375 },
        { preset: 'full-low', depth: 3, trim: 375 },
        { preset: 'voice', depth: 3, trim: 375, busy: true },
        // Row B5b1: one packet a frame against four (ruling D20).
        ...[1, 2, 3].map((depth) => ({ preset: 'voice', depth, trim: 375, group: 1 })),
        { preset: 'full-low', depth: 3, trim: 375, group: 1 },
    ];
    for (const item of plan) {
        state.textContent = `Running ${item.preset}, depth ${item.depth}, trim ${item.trim ?? 0}, group ${item.group ?? 4}${item.busy ? ', page busy' : ''}…`;
        report.runs.push(await run(context, worker, buffer, item));
    }
    worker.terminate();
    await context.close();
    report.ok = report.runs.every((row) => row.frames > 0 && row.correlation > 0.8);
}

try {
    await main();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
window.__loopCheck = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
state.textContent = report.error ? 'Failed.' : report.ok ? 'Done.' : 'DONE, BUT A RUN DID NOT CORRELATE.';
