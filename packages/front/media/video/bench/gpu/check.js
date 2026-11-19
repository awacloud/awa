// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The browser leg of the GPU implementation (row B3a).
 *
 * Bun has no WebGL: this page runs in a browser, from a static server at
 * the repository root. It proves that `video.gl.analyse` gives, bit for
 * bit, the pyramid of the CPU kernels, that an encoder given it emits
 * the same packets, that `video.gl.render` draws the picture of the CPU's
 * decoder, and it times both. The result is left in
 * `window.__gpuCheck` and printed on the page.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../../src/main.js';
import { sequences, prng } from '../lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const gl = runtime.resolve('video.gl');
const analyse = runtime.resolve('video.gl.analyse');
const render = runtime.resolve('video.gl.render');
const pack = runtime.resolve('video.pack');
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');
const codec = runtime.resolve('video.codec');

const report = { supported: gl.supported(), renderer: null, identity: [], packets: [], timing: [], pictures: [], decoding: [], ok: false };

/** Differences between two arrays of the same length. */
function differing(a, b) {
    if (a.length !== b.length) return Math.max(a.length, b.length);
    let count = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
    return count;
}

/** Values that differ between two pyramids, over the base planes and every band. */
function comparePyramids(cpu, gpu) {
    let wrong = 0;
    for (let p = 0; p < 3; p++) wrong += differing(cpu.base[p], gpu.base[p]);
    cpu.levels.forEach((level, k) => {
        const bands = level.planes[1];
        const other = gpu.levels[k].planes[1];
        for (const name of ['gx', 'hy', 'gy']) {
            if (bands[name] === null && other[name] === null) continue;
            if (bands[name] === null || other[name] === null) { wrong += 1; continue; }
            wrong += differing(bands[name], other[name]);
        }
    });
    return wrong;
}

function frames(width, height) {
    const set = sequences({ width, height, frames: 8, fps: 24, seed: 4 });
    const list = [];
    for (const name of ['shapes', 'camera', 'scroll']) {
        const sequence = set.find((entry) => entry.name === name);
        list.push(sequence.frame(0), sequence.frame(5));
    }
    const random = prng(17);
    list.push(Uint8ClampedArray.from({ length: width * height * 4 }, () => Math.floor(random() * 256)));
    list.push(new Uint8ClampedArray(width * height * 4));
    list.push(new Uint8ClampedArray(width * height * 4).fill(255));
    // Extremes side by side: the largest differences the pyramid can meet.
    list.push(Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => ((i >> 2) + Math.floor((i >> 2) / width)) % 2 ? 255 : 0));
    return list;
}

function run() {
    if (!report.supported) return;
    const probe = gl.create({ width: 4, height: 4 });
    const info = probe.gl.getExtension('WEBGL_debug_renderer_info');
    report.renderer = info ? probe.gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : probe.gl.getParameter(probe.gl.RENDERER);
    probe.dispose();

    // 1. The same pyramid, bit for bit.
    for (const [width, height, levels, diagonal] of [[64, 32, 1, true], [64, 32, 4, true], [64, 32, 2, false], [640, 360, 2, true], [640, 360, 3, true], [1280, 720, 2, true]]) {
        const front = analyse.create({ width, height, levels, diagonal });
        let wrong = 0;
        let checked = 0;
        for (const frame of frames(width, height)) {
            const cpu = haar.forward(color.forward(frame), width, height, { levels, diagonal, exact: true });
            wrong += comparePyramids(cpu, front.forward(frame));
            checked++;
        }
        front.dispose();
        report.identity.push({ size: `${width}x${height}`, levels, diagonal, frames: checked, differing: wrong });
    }

    // 2. The same packets from an encoder given the front end.
    for (const preset of ['quality', 'standard', 'economy']) {
        const width = 640;
        const height = 360;
        const sequence = sequences({ width, height, frames: 24, fps: 24, seed: 4 }).find((entry) => entry.name === 'camera');
        const front = analyse.create({ width, height, levels: 2, diagonal: true });
        const plain = codec.createEncoder({ width, height, fps: 24, preset });
        const fronted = codec.createEncoder({ width, height, fps: 24, preset, analyse: front.forward });
        let wrong = 0;
        let count = 0;
        for (let t = 0; t < 24; t++) {
            const a = plain.push(sequence.frame(t));
            const b = fronted.push(sequence.frame(t));
            if (a.length !== b.length) wrong++;
            a.forEach((packet, k) => { count++; if (!b[k] || differing(packet, b[k]) > 0) wrong++; });
        }
        front.dispose();
        report.packets.push({ preset, packets: count, differing: wrong });
    }

    // 3. Time: the front end alone, then the whole encoder.
    for (const [width, height] of [[640, 360], [1280, 720]]) {
        const sequence = sequences({ width, height, frames: 40, fps: 24, seed: 4 }).find((entry) => entry.name === 'camera');
        const list = Array.from({ length: 40 }, (_, t) => sequence.frame(t));
        const front = analyse.create({ width, height, levels: 2, diagonal: true });
        const time = (fn) => {
            for (let t = 0; t < 5; t++) fn(list[t]);          // warm-up
            const start = performance.now();
            for (let t = 5; t < 40; t++) fn(list[t]);
            return (performance.now() - start) / 35;
        };
        const cpuFront = time((frame) => haar.forward(color.forward(frame), width, height, { levels: 2, diagonal: true, exact: true }));
        const gpuFront = time((frame) => front.forward(frame));
        const plain = codec.createEncoder({ width, height, fps: 24, preset: 'standard' });
        const fronted = codec.createEncoder({ width, height, fps: 24, preset: 'standard', analyse: front.forward });
        const cpuEncoder = time((frame) => plain.push(frame));
        const gpuEncoder = time((frame) => fronted.push(frame));
        front.dispose();
        report.timing.push({ size: `${width}x${height}`, frontCpuMs: +cpuFront.toFixed(2), frontGpuMs: +gpuFront.toFixed(2), encoderCpuMs: +cpuEncoder.toFixed(2), encoderGpuMs: +gpuEncoder.toFixed(2) });
    }

    // 4. The decoder's back end: the same picture, bit for bit, on whole decoded streams.
    const noFine = (type) => type !== pack.types.DETAIL + 1;
    const baseOnly = (type) => type < pack.types.DETAIL;
    const cases = [
        ['quality', undefined, null], ['quality', 'none', null], ['standard', undefined, null], ['economy', undefined, null],
        ['standard', { mode: 'chroma', passes: 2 }, null], ['standard', { mode: 'chroma', passes: 4 }, null],
        ['quality', undefined, noFine], ['quality', 'none', baseOnly], ['standard', { mode: 'chroma', passes: 3 }, baseOnly],
    ];
    for (const [preset, filter, keep] of cases) {
        const width = 640;
        const height = 360;
        const sequence = sequences({ width, height, frames: 20, fps: 24, seed: 4 }).find((entry) => entry.name === 'camera');
        const encoder = codec.createEncoder({ width, height, fps: 24, preset });
        const cpu = codec.createDecoder({ width, height, post: filter });
        const renderer = render.create({ width, height, levels: 2, diagonal: true });
        const gpu = codec.createDecoder({ width, height, post: filter, present: renderer.draw });
        let wrong = 0;
        let checked = 0;
        for (let t = 0; t < 20; t++) {
            for (let packet of encoder.push(sequence.frame(t))) {
                if (keep) packet = pack.writeUnits(pack.readUnits(packet).filter((unit) => keep(unit.type)));
                const picture = cpu.push(packet);
                gpu.push(packet);
                wrong += differing(picture, renderer.read());
                checked++;
            }
        }
        renderer.dispose();
        report.pictures.push({ preset, filter: filter === undefined ? 'wished' : typeof filter === 'string' ? filter : `chroma x${filter.passes}`, dropped: keep ? keep.name : 'none', pictures: checked, differing: wrong });
    }

    // 5. Time: a decoder with each back end. The GPU's is timed to the end of its drawing.
    for (const [width, height] of [[640, 360], [1280, 720]]) {
        const sequence = sequences({ width, height, frames: 40, fps: 24, seed: 4 }).find((entry) => entry.name === 'camera');
        const encoder = codec.createEncoder({ width, height, fps: 24, preset: 'standard' });
        const packets = [];
        for (let t = 0; t < 40; t++) packets.push(...encoder.push(sequence.frame(t)));
        const renderer = render.create({ width, height, levels: 2, diagonal: true });
        const context = renderer.context;
        const time = (decoder, after) => {
            for (let k = 0; k < 5; k++) { decoder.push(packets[k]); after(); }
            const start = performance.now();
            for (let k = 5; k < packets.length; k++) { decoder.push(packets[k]); after(); }
            return (performance.now() - start) / (packets.length - 5);
        };
        const cpuMs = time(codec.createDecoder({ width, height }), () => {});
        const cpuNoFilterMs = time(codec.createDecoder({ width, height, post: 'none' }), () => {});
        const gpuMs = time(codec.createDecoder({ width, height, present: renderer.draw }), () => context.finish());
        const gpuNoFilterMs = time(codec.createDecoder({ width, height, post: 'none', present: renderer.draw }), () => context.finish());
        renderer.dispose();
        report.decoding.push({ size: `${width}x${height}`, cpuMs: +cpuMs.toFixed(2), gpuMs: +gpuMs.toFixed(2), cpuNoFilterMs: +cpuNoFilterMs.toFixed(2), gpuNoFilterMs: +gpuNoFilterMs.toFixed(2) });
    }

    report.ok = report.identity.every((row) => row.differing === 0) && report.packets.every((row) => row.differing === 0) && report.pictures.every((row) => row.differing === 0);
}

try {
    run();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
window.__gpuCheck = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
document.getElementById('state').textContent = report.error ? 'Failed.' : report.supported ? (report.ok ? 'Identical, bit for bit.' : 'DIFFERENCES FOUND.') : 'WebGL2 is not available in this browser.';
