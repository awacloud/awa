// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Row M1 — the audio codec against Opus, the browser's own
 * (WebCodecs), on the three real excerpts at 48 kHz mono.
 *
 * Ours: each preset; the rate on the wire is frames of four packets, each
 * behind its length, a 12-byte header a frame (`audio.link`, D20). Opus: a
 * ladder of rates with frames of 20 ms (its default), 10 ms and 2.5 ms
 * (its shortest); its delay found by correlation. Both measured with the
 * bench's segmental SNR and log-spectral distance (to 5 kHz and the whole
 * band). The report is left in `window.__m1` and posted to `/report`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../../src/main.js';
import { segmentalSnr } from '../lib/metrics.js';
import { logSpectralDistance } from '../lib/spectral.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');

const RATE = 48000;
const SECONDS = 20;
const GROUP = 4;
const HEADER = 12;
const EXCERPTS = [
    { name: 'audiobook (speech)', file: 'audiobook-tgimh149.wav', start: 60 },
    { name: 'Coriolan (orchestra)', file: 'coriolan-musopen.flac', start: 30 },
    { name: 'Sintel (film soundtrack)', file: 'sintel-master-st.flac', start: 30 },
];
const LADDER = [12, 16, 24, 32, 48, 64, 96, 128, 192];
const DURATIONS = [20000, 10000, 2500];

const state = document.getElementById('state');
const out = document.getElementById('report');
const report = { userAgent: navigator.userAgent, excerpts: [], ok: false };
const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : null);

async function load({ file, start }) {
    const bytes = await (await fetch(`/audio/${file}`)).arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes);
    const from = Math.round(start * RATE);
    const n = Math.floor((SECONDS * RATE) / 128) * 128;
    const mono = new Float32Array(n);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
        const channel = decoded.getChannelData(c).subarray(from, from + n);
        for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
    }
    return mono;
}

function measure(source, decoded, delay) {
    return {
        segmentalSnr: r2(segmentalSnr(source, decoded, { delay })),
        spectral5k: r2(logSpectralDistance(source, decoded, { rate: RATE, maxHz: 5000, delay })),
        spectralFull: r2(logSpectralDistance(source, decoded, { rate: RATE, delay })),
    };
}

function ours(source, preset) {
    const config = { rate: RATE, preset };
    const encoder = codec.createEncoder(config);
    const decoder = codec.createDecoder({ rate: RATE });
    const decoded = new Float32Array(source.length + 4096);
    let at = 0;
    let raw = 0;
    let lengths = 0;
    let packets = 0;
    for (let f = 0; f < source.length / 128; f++) {
        for (const packet of encoder.push(source.subarray(f * 128, (f + 1) * 128))) {
            packets++;
            raw += packet.length;
            lengths += packet.length < 128 ? 1 : 2;
            for (const frame of decoder.push(packet)) {
                decoded.set(frame, at);
                at += frame.length;
            }
        }
    }
    const wire = raw + lengths + Math.ceil(packets / GROUP) * HEADER;
    return { codec: 'ours', preset, rawKbps: r2((raw * 8) / SECONDS / 1000), kbps: r2((wire * 8) / SECONDS / 1000), delayMs: r2((codec.delay(config) * 1000) / RATE), ...measure(source, decoded.subarray(0, at), codec.delay(config)) };
}

/** The lag (0 to `max` samples) that best aligns `out` on `ref`, on one second of it. */
function lagOf(ref, decoded, max = 4096) {
    const from = RATE;
    const length = RATE;
    let best = 0;
    let score = -Infinity;
    for (let lag = 0; lag <= max; lag++) {
        let sum = 0;
        for (let i = from; i < from + length; i++) sum += ref[i] * decoded[i + lag];
        if (sum > score) {
            score = sum;
            best = lag;
        }
    }
    return best;
}

async function opus(source, kbps, frameDuration) {
    const config = { codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: kbps * 1000, opus: { frameDuration } };
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) return { codec: 'Opus', asked: kbps, frameMs: frameDuration / 1000, error: 'not supported here' };
    let failure = null;
    const chunks = [];
    const encoder = new AudioEncoder({ output: (chunk) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ timestamp: chunk.timestamp, duration: chunk.duration, data }); }, error: (e) => { failure = String(e); } });
    encoder.configure(config);
    const step = 480;
    for (let at = 0; at < source.length; at += step) {
        const data = source.slice(at, at + step);
        const input = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfChannels: 1, numberOfFrames: data.length, timestamp: Math.round((at * 1e6) / RATE), data });
        encoder.encode(input);
        input.close();
    }
    await encoder.flush();
    encoder.close();
    if (failure) return { codec: 'Opus', asked: kbps, frameMs: frameDuration / 1000, error: failure };
    const bytes = chunks.reduce((sum, c) => sum + c.data.length, 0);
    const parts = [];
    const decoder = new AudioDecoder({ output: (data) => { const plane = new Float32Array(data.numberOfFrames); data.copyTo(plane, { planeIndex: 0, format: 'f32-planar' }); parts.push({ timestamp: data.timestamp, plane }); data.close(); }, error: (e) => { failure = String(e); } });
    decoder.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1 });
    for (const c of chunks) decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: c.timestamp, duration: c.duration, data: c.data }));
    await decoder.flush();
    decoder.close();
    if (failure) return { codec: 'Opus', asked: kbps, frameMs: frameDuration / 1000, error: failure };
    parts.sort((a, b) => a.timestamp - b.timestamp);
    const decoded = new Float32Array(parts.reduce((sum, p) => sum + p.plane.length, 0));
    let at = 0;
    for (const p of parts) {
        decoded.set(p.plane, at);
        at += p.plane.length;
    }
    const delay = lagOf(source, decoded);
    return { codec: 'Opus', asked: kbps, frameMs: frameDuration / 1000, kbps: r2((bytes * 8) / SECONDS / 1000), delaySamples: delay, ...measure(source, decoded, delay) };
}

/** The rate a ladder needs for a measure (higher better, or lower better), interpolated on log rate. */
function rateAt(ladder, key, target, higherIsBetter) {
    const points = ladder.filter((p) => p[key] !== null && p.kbps > 0).map((p) => ({ x: higherIsBetter ? p[key] : -p[key], kbps: p.kbps })).sort((a, b) => a.x - b.x);
    const x = higherIsBetter ? target : -target;
    for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        if (x >= a.x && x <= b.x && b.x > a.x) return Math.exp(Math.log(a.kbps) + ((x - a.x) / (b.x - a.x)) * (Math.log(b.kbps) - Math.log(a.kbps)));
    }
    return null;
}

async function main() {
    for (const spec of EXCERPTS) {
        state.textContent = `Loading ${spec.name}…`;
        const source = await load(spec);
        const row = { excerpt: spec.name, seconds: SECONDS, ours: Object.keys(codec.presets).map((preset) => ours(source, preset)), opus: {} };
        for (const duration of DURATIONS) {
            const ladder = [];
            for (const kbps of LADDER) {
                state.textContent = `${spec.name}: Opus ${duration / 1000} ms at ${kbps} kbit/s…`;
                ladder.push(await opus(source, kbps, duration));
            }
            row.opus[`${duration / 1000} ms`] = ladder;
        }
        row.same = row.ours.map((point) => ({
            preset: point.preset,
            kbps: point.kbps,
            spectral5k: point.spectral5k,
            segmentalSnr: point.segmentalSnr,
            opus: Object.fromEntries(Object.entries(row.opus).map(([frames, ladder]) => {
                const forSpectral = rateAt(ladder, 'spectral5k', point.spectral5k, false);
                const forSnr = rateAt(ladder, 'segmentalSnr', point.segmentalSnr, true);
                return [frames, {
                    spectral5k: forSpectral === null ? null : { kbps: r2(forSpectral), oursOverOpus: r2(point.kbps / forSpectral) },
                    segmentalSnr: forSnr === null ? null : { kbps: r2(forSnr), oursOverOpus: r2(point.kbps / forSnr) },
                }];
            })),
        }));
        report.excerpts.push(row);
        out.textContent = JSON.stringify(report, null, 2);
    }
    report.ok = report.excerpts.every((e) => Object.values(e.opus).every((ladder) => ladder.every((p) => !p.error)));
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
await fetch('/report?name=m1-audio', { method: 'POST', body: JSON.stringify(report, null, 2) }).catch(() => {});
