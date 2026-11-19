// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Row M1 — the video codec against the browser's own
 * encoders (WebCodecs: H.264, VP8, VP9, AV1) on the same real frames, at
 * the same PSNR on luma.
 *
 * Ours: each preset, the packets sent as `media.frame` frames a unit with
 * the lossless stage (the wire), the decoder's own picture (a reduced one
 * enlarged by repeating pixels, as the bench does). Theirs: a ladder of bit
 * rates, `latencyMode: 'realtime'`, one key picture at the start, decoded
 * by WebCodecs and read back through a canvas; their input converted here
 * to I420 limited range (see `toI420`). Every source frame is
 * compared with the picture shown at its time. The report is left in
 * `window.__m1` and posted to the server's `/report`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate as deflateModule } from '@awacloud/fw/io/compress/deflate.js';
import { mediaVideoModules } from '../../src/main.js';
import { frameModule } from '@awacloud/media-stream/frame';
import { psnrLuma, psnrOf } from '../lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
runtime.registerDeep(deflateModule);
runtime.registerDeep(frameModule);
const codec = runtime.resolve('video.codec');
const pack = runtime.resolve('video.pack');
const frame = runtime.resolve('media.frame');
const deflate = runtime.resolve('deflate');

const state = document.getElementById('state');
const out = document.getElementById('report');
const report = { userAgent: navigator.userAgent, clips: [], ok: false };

const CLIPS = [
    { name: 'visio (KristenAndSara)', file: 'KristenAndSara_1280x720_60.first300.y4m', step: 2, scale: 2, count: 60, presets: ['quality', 'standard', 'low'], ladder: [100, 200, 400, 700, 1000, 1500, 2500, 4000] },
    { name: 'a document capture', file: 'capture-document.1280x720.15fps.y4m', step: 1, scale: 2, count: 45, presets: ['standard', 'screen'], ladder: [15, 30, 60, 120, 250, 500] },
    { name: 'a desk capture', file: 'Bureau.1280x720.15fps.y4m', step: 1, scale: 2, count: 45, presets: ['standard', 'screen'], ladder: [25, 50, 100, 200, 400, 800] },
];
const MARKET = [
    { name: 'H.264', codec: 'avc1.42001f', extra: { avc: { format: 'annexb' } } },
    { name: 'VP8', codec: 'vp8', extra: {} },
    { name: 'VP9', codec: 'vp09.00.10.08', extra: {} },
    { name: 'AV1', codec: 'av01.0.04M.08', extra: {} },
];

/** PSNR over the whole run, as the bench gives it: from the summed squared error. */
const overall = (scores) => psnrOf(scores.reduce((a, s) => a + s.sse, 0) / scores.reduce((a, s) => a + s.count, 0));
const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : null);

/**
 * The frame as I420, BT.709, limited range, said so in its colour space. Handed RGBA, Chromium's
 * H.264, VP8 and VP9 encoders convert it at full range but tag the stream limited: the decoder then
 * stretches it again (a picture brighter by about 5 levels, a PSNR stuck near 28 to 31 dB however high
 * the rate). Converted here and tagged as it is, every encoder gets the same input, read back right.
 */
function toI420(rgba, w, h) {
    const ys = w * h;
    const cs = (w / 2) * (h / 2);
    const out = new Uint8Array(ys + 2 * cs);
    const at = (i) => [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255];
    for (let i = 0; i < ys; i++) {
        const [r, g, b] = at(i * 4);
        out[i] = Math.round(16 + 219 * (0.2126 * r + 0.7152 * g + 0.0722 * b));
    }
    for (let y = 0; y < h / 2; y++) {
        for (let x = 0; x < w / 2; x++) {
            let cb = 0;
            let cr = 0;
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const [r, g, b] = at(((2 * y + dy) * w + 2 * x + dx) * 4);
                    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    cb += (b - luma) / 1.8556;
                    cr += (r - luma) / 1.5748;
                }
            }
            out[ys + y * (w / 2) + x] = Math.round(128 + (224 * cb) / 4);
            out[ys + cs + y * (w / 2) + x] = Math.round(128 + (224 * cr) / 4);
        }
    }
    return out;
}
const LIMITED_709 = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };

async function load({ file, step, scale, count }) {
    const response = await fetch(`/frames?file=${file}&start=0&count=${count}&step=${step}&scale=${scale}`);
    if (!response.ok) throw new Error(`frames of ${file}: ${response.status}`);
    const width = Number(response.headers.get('x-width'));
    const height = Number(response.headers.get('x-height'));
    const fps = Number(response.headers.get('x-fps'));
    const all = new Uint8ClampedArray(await response.arrayBuffer());
    const size = width * height * 4;
    return { width, height, fps, frames: Array.from({ length: count }, (_, t) => all.slice(t * size, (t + 1) * size)) };
}

/** Ours: the frames on the wire, the picture shown at each source frame's time. */
function ours(clip, preset) {
    const { width, height, fps, frames } = clip;
    const encoder = codec.createEncoder({ width, height, fps, preset });
    const factor = codec.presets[preset].reduce || 1;
    const decoder = codec.createDecoder({ width: width / factor, height: height / factor });
    const writer = frame.createWriter({ kind: 'video', deflate, lossless: true });
    let wire = 0;
    let shown = null;
    const scores = [];
    frames.forEach((source, t) => {
        for (const packet of encoder.push(source)) {
            for (const unit of pack.readUnits(packet)) wire += writer.write(unit.bytes, { layer: unit.type, time: t }).length;
            const small = decoder.push(packet);
            if (factor === 1) shown = new Uint8ClampedArray(small);
            else {
                const w = width / factor;
                shown = new Uint8ClampedArray(width * height * 4);
                for (let y = 0; y < height; y++) {
                    const row = Math.floor(y / factor) * w;
                    for (let x = 0; x < width; x++) shown.set(small.subarray((row + Math.floor(x / factor)) * 4, (row + Math.floor(x / factor)) * 4 + 4), (y * width + x) * 4);
                }
            }
        }
        if (shown) scores.push(psnrLuma(source, shown));
    });
    return { codec: 'ours', preset, kbps: r2((wire * 8) / (frames.length / fps) / 1000), psnr: r2(overall(scores)), compared: scores.length };
}

/** Theirs: one rate of one codec, encoded and decoded by WebCodecs. */
async function theirs(clip, market, kbps) {
    const { width, height, fps, frames } = clip;
    const config = { codec: market.codec, width, height, bitrate: kbps * 1000, framerate: fps, latencyMode: 'realtime', ...market.extra };
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) return { codec: market.name, asked: kbps, error: 'not supported here' };
    const chunks = [];
    let failure = null;
    const encoder = new VideoEncoder({ output: (chunk) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ type: chunk.type, timestamp: chunk.timestamp, data }); }, error: (e) => { failure = String(e); } });
    encoder.configure(config);
    frames.forEach((rgba, t) => {
        const input = new VideoFrame(toI420(rgba, width, height), { format: 'I420', codedWidth: width, codedHeight: height, timestamp: Math.round((t * 1e6) / fps), duration: Math.round(1e6 / fps), colorSpace: LIMITED_709 });
        encoder.encode(input, { keyFrame: t === 0 });
        input.close();
    });
    await encoder.flush();
    encoder.close();
    if (failure) return { codec: market.name, asked: kbps, error: failure };
    const bytes = chunks.reduce((sum, c) => sum + c.data.length, 0);
    // Decoded and read back through a canvas, kept by timestamp.
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pictures = new Map();
    const decoder = new VideoDecoder({ output: (picture) => { context.drawImage(picture, 0, 0, width, height); pictures.set(picture.timestamp, context.getImageData(0, 0, width, height).data); picture.close(); }, error: (e) => { failure = String(e); } });
    decoder.configure({ codec: market.codec, codedWidth: width, codedHeight: height });
    for (const c of chunks) decoder.decode(new EncodedVideoChunk({ type: c.type, timestamp: c.timestamp, data: c.data }));
    await decoder.flush();
    decoder.close();
    if (failure) return { codec: market.name, asked: kbps, error: failure };
    const scores = [];
    let shown = null;
    frames.forEach((source, t) => {
        const picture = pictures.get(Math.round((t * 1e6) / fps));
        if (picture) shown = picture;
        if (shown) scores.push(psnrLuma(source, shown));
    });
    return { codec: market.name, asked: kbps, kbps: r2((bytes * 8) / (frames.length / fps) / 1000), psnr: r2(overall(scores)), compared: scores.length, decoded: pictures.size };
}

/** The rate a ladder needs for a PSNR, interpolated on log rate; null outside it. */
function rateAt(ladder, psnr) {
    const points = ladder.filter((p) => p.psnr !== null && p.kbps > 0).sort((a, b) => a.psnr - b.psnr);
    for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        if (psnr >= a.psnr && psnr <= b.psnr && b.psnr > a.psnr) {
            const f = (psnr - a.psnr) / (b.psnr - a.psnr);
            return Math.exp(Math.log(a.kbps) + f * (Math.log(b.kbps) - Math.log(a.kbps)));
        }
    }
    return null;
}

async function main() {
    for (const spec of CLIPS) {
        state.textContent = `Loading ${spec.name}…`;
        const clip = await load(spec);
        const row = { clip: spec.name, size: `${clip.width}x${clip.height}`, fps: clip.fps, frames: clip.frames.length, ours: [], market: {} };
        for (const preset of spec.presets) row.ours.push(ours(clip, preset));
        for (const market of MARKET) {
            row.market[market.name] = [];
            for (const kbps of spec.ladder) {
                state.textContent = `${spec.name}: ${market.name} at ${kbps} kbit/s…`;
                row.market[market.name].push(await theirs(clip, market, kbps));
            }
        }
        row.same = row.ours.map((point) => ({
            preset: point.preset,
            kbps: point.kbps,
            psnr: point.psnr,
            theirs: Object.fromEntries(Object.entries(row.market).map(([name, ladder]) => {
                const needed = rateAt(ladder, point.psnr);
                return [name, needed === null ? null : { kbps: r2(needed), oursOverTheirs: r2(point.kbps / needed) }];
            })),
        }));
        report.clips.push(row);
        out.textContent = JSON.stringify(report, null, 2);
    }
    report.ok = report.clips.every((c) => c.ours.every((p) => p.compared === c.frames));
}

try {
    await main();
    state.textContent = report.ok ? 'Done.' : 'Done, with gaps.';
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
    state.textContent = `Failed: ${report.error}`;
}
out.textContent = JSON.stringify(report, null, 2);
window.__m1 = report;
await fetch('/report?name=m1-video', { method: 'POST', body: JSON.stringify(report, null, 2) }).catch(() => {});
