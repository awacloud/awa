// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Where the encoder spends its time in a browser, and what a
 * worker costs (row B3c, measured before anything is built).
 *
 * 1. The encoder is built from its own factory with every dependency
 *    wrapped by a timer, so each stage is timed inside the real encoder,
 *    on real clips: the colour conversion, the pyramid, the selection,
 *    the frame vector, the packing; what is left is the codec's own loops
 *    (the detail test, gathering the selected values). DEFLATE, the
 *    transport stage, is timed apart. The wrapped encoder is first checked
 *    to emit the packets of the plain one.
 * 2. The same encoder in a module worker: what the page's thread still
 *    spends a frame, how many frames a second the worker sustains, and the
 *    delay from a frame given to its packets back, at the source's rate.
 *
 * Needs the scratch server `evidence/media-codecs/serve-b3c.ts`, which
 * serves the real clips as RGBA frames. The result is left in
 * `window.__b3cProfile` and printed on the page.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';
import { mediaVideoModules } from '../../src/main.js';
import { codecModule } from '../../src/codec/codec.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
runtime.registerDeep(zlib);
const codec = runtime.resolve('video.codec');
const deflate = runtime.resolve('deflate');
const gl = runtime.resolve('video.gl');
const analyse = runtime.resolve('video.gl.analyse');

const WARM = 5;
const COUNT = 30;
const report = { renderer: null, clips: [], stages: [], workers: [], ok: false };
const state = document.getElementById('state');

/** Timers that count each call's own time, its nested timed calls left out. */
function profiler() {
    const spent = Object.create(null);
    const stack = [];
    function wrapFn(name, fn, wrapResult = null) {
        return (...args) => {
            const frame = { child: 0 };
            stack.push(frame);
            const t0 = performance.now();
            let result;
            try {
                result = fn(...args);
            } finally {
                const elapsed = performance.now() - t0;
                stack.pop();
                spent[name] = (spent[name] ?? 0) + elapsed - frame.child;
                if (stack.length > 0) stack[stack.length - 1].child += elapsed;
            }
            return wrapResult ? wrapResult(result) : result;
        };
    }
    function wrapApi(prefix, api, nested = {}) {
        const out = {};
        for (const [key, value] of Object.entries(api)) {
            out[key] = typeof value === 'function' ? wrapFn(`${prefix}.${key}`, value, nested[key] ? (r) => wrapApi(prefix, r) : null) : value;
        }
        return out;
    }
    return { spent, wrapFn, wrapApi, reset: () => { for (const key of Object.keys(spent)) delete spent[key]; } };
}

/** The encoder factory with its dependencies timed. */
function timedCodec(p) {
    const deps = codecModule.dependencies.map((name) => p.wrapApi(name.replace('video.', ''), runtime.resolve(name), name === 'video.select' ? { create: true } : {}));
    return codecModule.factory(...deps);
}

async function fetchClip({ file, start, step, scale }) {
    const response = await fetch(`/frames?file=${encodeURIComponent(file)}&start=${start}&count=${COUNT}&step=${step}&scale=${scale}`);
    if (!response.ok) throw new Error(`frames of ${file}: ${response.status}`);
    const width = Number(response.headers.get('x-width'));
    const height = Number(response.headers.get('x-height'));
    const fps = Number(response.headers.get('x-fps'));
    const bytes = new Uint8ClampedArray(await response.arrayBuffer());
    const size = width * height * 4;
    const frames = Array.from({ length: COUNT }, (_, t) => bytes.subarray(t * size, (t + 1) * size));
    return { width, height, fps, frames };
}

const differs = (a, b) => a.length !== b.length || a.some((v, i) => v !== b[i]);

/** One clip × preset: every stage's time a coded frame. */
function stages(clip, label, preset, { gpuFront = false } = {}) {
    const { width, height, fps, frames } = clip;
    const p = profiler();
    const timed = timedCodec(p);
    let front = null;
    const extra = {};
    if (gpuFront) {
        front = analyse.create({ width, height, levels: 2, diagonal: true });
        extra.analyse = p.wrapFn('gl.analyse', front.forward);
    }
    // The timed encoder emits the plain encoder's packets.
    const plain = codec.createEncoder({ width, height, fps, preset });
    const encoder = timed.createEncoder({ width, height, fps, preset, ...extra });
    const push = p.wrapFn('codec (own loops)', (frame) => encoder.push(frame));
    let same = true;
    let bytes = 0;
    for (let t = 0; t < COUNT; t++) {
        if (t === WARM) p.reset();
        const expected = plain.push(frames[t]);
        const packets = push(frames[t]);
        if (packets.length !== expected.length || packets.some((packet, k) => differs(packet, expected[k]))) same = false;
        for (const packet of packets) {
            const out = p.wrapFn('deflate', () => deflate.deflateSync(packet, { level: 6 }))();
            if (t >= WARM) bytes += out.length;
        }
    }
    front?.dispose();
    const every = Math.round(fps / encoder.coded.fps);
    const codedFrames = Array.from({ length: COUNT - WARM }, (_, k) => k + WARM).filter((t) => t % every === 0).length;
    const per = Object.fromEntries(Object.entries(p.spent).map(([name, ms]) => [name, +(ms / codedFrames).toFixed(2)]));
    const encodeMs = Object.entries(per).filter(([name]) => name !== 'deflate').reduce((sum, [, ms]) => sum + ms, 0);
    return { clip: label, size: `${width}x${height}`, preset: preset + (gpuFront ? ' + GPU front' : ''), codedFrames, samePackets: same, kbps: +((bytes * 8) / ((COUNT - WARM) / fps) / 1000).toFixed(0), encodeMs: +encodeMs.toFixed(2), deflateMs: per.deflate ?? 0, stages: per };
}

/** Waits for the next message of a worker that satisfies `test`. */
function next(worker, test) {
    return new Promise((resolve) => {
        const listener = ({ data }) => {
            if (!test(data)) return;
            worker.removeEventListener('message', listener);
            resolve(data);
        };
        worker.addEventListener('message', listener);
    });
}

/** The encoder in a worker: unpaced (throughput), then at the source's rate (delay). */
async function workerLeg(clip, label, preset) {
    const { width, height, fps, frames } = clip;
    const worker = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
    const config = { width, height, fps, preset };
    const result = { clip: label, size: `${width}x${height}`, preset };
    for (const mode of ['unpaced', 'paced']) {
        worker.postMessage({ type: 'config', config });
        await next(worker, (data) => data.type === 'ready');
        const copies = frames.map((frame) => frame.slice().buffer);
        const sent = new Float64Array(COUNT);
        const back = new Float64Array(COUNT);
        let encodeMs = 0;
        let mainMs = 0;
        let replies = 0;
        const done = new Promise((resolve) => {
            const listener = ({ data }) => {
                if (data.type !== 'packets') return;
                const t0 = performance.now();
                back[data.t] = t0;
                if (data.t >= WARM) encodeMs += data.encodeMs + data.deflateMs;
                replies++;
                mainMs += performance.now() - t0;
                if (replies === COUNT) {
                    worker.removeEventListener('message', listener);
                    resolve();
                }
            };
            worker.addEventListener('message', listener);
        });
        const send = (t) => {
            const t0 = performance.now();
            sent[t] = t0;
            worker.postMessage({ type: 'frame', t, buffer: copies[t] }, [copies[t]]);
            if (t >= WARM) mainMs += performance.now() - t0;
        };
        if (mode === 'unpaced') {
            for (let t = 0; t < COUNT; t++) send(t);
        } else {
            const origin = performance.now();
            for (let t = 0; t < COUNT; t++) {
                const wait = origin + (t * 1000) / fps - performance.now();
                if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
                send(t);
            }
        }
        await done;
        const delays = Array.from({ length: COUNT - WARM }, (_, k) => back[k + WARM] - sent[k + WARM]);
        if (mode === 'unpaced') {
            result.workerFps = +(((COUNT - WARM) * 1000) / (back[COUNT - 1] - back[WARM - 1])).toFixed(1);
            result.workerMsPerFrame = +(encodeMs / (COUNT - WARM)).toFixed(2);
        } else {
            result.pacedDelayMeanMs = +(delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(2);
            result.pacedDelayMaxMs = +Math.max(...delays).toFixed(2);
            result.mainThreadMsPerFrame = +(mainMs / (COUNT - WARM)).toFixed(3);
        }
    }
    worker.terminate();
    return result;
}

async function run() {
    const probe = gl.supported() ? gl.create({ width: 4, height: 4 }) : null;
    if (probe) {
        const info = probe.gl.getExtension('WEBGL_debug_renderer_info');
        report.renderer = info ? probe.gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : probe.gl.getParameter(probe.gl.RENDERER);
        probe.dispose();
    }
    const camera = { file: 'KristenAndSara_1280x720_60.first300.y4m', start: 60, step: 2 };
    const screen = { file: 'capture-document.1280x720.15fps.y4m', start: 30, step: 1 };
    const plan = [
        [camera, 1, 'camera (public clip)', ['quality', 'standard', 'economy'], 'standard'],
        [camera, 2, 'camera (public clip)', ['quality', 'standard', 'economy'], 'standard'],
        [screen, 1, 'scrolled document (owner)', ['screen', 'standard'], null],
        [screen, 2, 'scrolled document (owner)', ['screen'], null],
    ];
    for (const [source, scale, label, presets, gpuPreset] of plan) {
        state.textContent = `Loading ${label} at 1/${scale}…`;
        const clip = await fetchClip({ ...source, scale });
        report.clips.push({ clip: label, size: `${clip.width}x${clip.height}`, fps: clip.fps, frames: COUNT });
        // A first run, thrown away: the engine's compiler warms up on it, not on the first preset measured.
        if (report.stages.length === 0) stages(clip, label, 'standard');
        for (const preset of presets) {
            state.textContent = `Profiling ${label}, ${clip.width}x${clip.height}, ${preset}…`;
            report.stages.push(stages(clip, label, preset));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (gpuPreset && probe) report.stages.push(stages(clip, label, gpuPreset, { gpuFront: true }));
        if (scale === 1) {
            state.textContent = `Worker, ${label}…`;
            report.workers.push(await workerLeg(clip, label, presets[0] === 'screen' ? 'screen' : 'standard'));
        }
    }
    report.ok = report.stages.every((row) => row.samePackets);
}

try {
    await run();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
window.__b3cProfile = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
state.textContent = report.error ? 'Failed.' : report.ok ? 'Done; the timed encoder emitted the plain one’s packets.' : 'DONE, BUT THE TIMED ENCODER DIFFERED.';
