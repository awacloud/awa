// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The browser leg of `audio.webaudio` (row B1a).
 *
 * Bun has no Web Audio: this page runs in a browser, from a static server
 * at the repository root. On an `OfflineAudioContext` it proves that a
 * known buffer through the capture node comes back sample for sample, in
 * mono and mixed down from stereo, and that frames queued in the playback
 * node render sample for sample; it then opens a live context at 48 000 Hz
 * and reads its latencies. The result is left in `window.__webaudioCheck`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const webaudio = runtime.resolve('audio.webaudio');

const RATE = 48000;
const report = { supported: webaudio.supported(), capture: [], playback: null, live: null, ok: false };

/** A seeded noise in [-1, 1), as float32. */
function noise(n, seed) {
    let s = seed >>> 0;
    return Float32Array.from({ length: n }, () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 31 - 1;
    });
}

const differing = (a, b) => {
    let count = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) count++;
    return count;
};

/** Waits until `test()` or a timeout; true when `test()` held. */
async function until(test, ms = 2000) {
    const end = performance.now() + ms;
    while (!test() && performance.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
    return test();
}

async function captureCase(channels) {
    const length = 128 * 375;
    const context = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate: RATE });
    await webaudio.install(context);
    const data = Array.from({ length: channels }, (_, c) => noise(length, 11 + c));
    const buffer = context.createBuffer(channels, length, RATE);
    data.forEach((samples, c) => buffer.copyToChannel(samples, c));
    const source = context.createBufferSource();
    source.buffer = buffer;
    const handle = webaudio.capture(context, source);
    const frames = [];
    handle.port.onmessage = ({ data: frame }) => frames.push(frame);
    source.start(0);
    await context.startRendering();
    await until(() => frames.length >= length / 128);
    const got = new Float32Array(frames.length * 128);
    frames.forEach((frame, k) => got.set(frame, k * 128));
    const expected = channels === 1 ? data[0] : Float32Array.from(data[0], (v, i) => (v + data[1][i]) / 2);
    const sizes = new Set(frames.map((frame) => frame.length));
    report.capture.push({ channels, frames: frames.length, frameSizes: [...sizes], differing: differing(got.subarray(0, length), expected) });
}

async function playbackCase() {
    const count = 40;
    const context = new OfflineAudioContext({ numberOfChannels: 1, length: 128 * count, sampleRate: RATE });
    await webaudio.install(context);
    const handle = webaudio.playback(context, { depth: 3, max: 64 });
    const source = noise(128 * count, 29);
    for (let k = 0; k < count; k++) handle.port.postMessage(source.slice(k * 128, (k + 1) * 128));
    // The processor answers in order: once it says 40 queued, every frame is there before the rendering starts.
    const before = await Promise.race([handle.stats(), new Promise((resolve) => setTimeout(() => resolve(null), 2000))]);
    const rendered = await context.startRendering();
    report.playback = { frames: count, queuedBeforeRendering: before && before.queued, differing: differing(rendered.getChannelData(0), source) };
}

async function liveCase() {
    const context = webaudio.createContext();
    await webaudio.install(context);
    report.live = { sampleRate: context.sampleRate, state: context.state, baseLatencyMs: +(context.baseLatency * 1000).toFixed(2), outputLatencyMs: +((context.outputLatency || 0) * 1000).toFixed(2) };
    await context.close();
}

async function run() {
    if (!report.supported) return;
    await captureCase(1);
    await captureCase(2);
    await playbackCase();
    await liveCase();
    report.ok = report.capture.every((row) => row.differing === 0 && row.frames === 375) && report.playback.differing === 0 && report.live.sampleRate === RATE;
}

try {
    await run();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
window.__webaudioCheck = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
document.getElementById('state').textContent = report.error ? 'Failed.' : report.supported ? (report.ok ? 'Identical, sample for sample.' : 'DIFFERENCES FOUND.') : 'Web Audio with AudioWorklet is not available in this browser.';
