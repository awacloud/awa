// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The audio lost-packet bench (row B1c).
 *
 *   bun bench/loss.js --file <audio.flac|.wav> [--start 0] [--seconds 20] [--name excerpt]
 *                     [--rate 48000] [--presets voice,full-low] [--wav <dir>]
 *
 * Runs `audio.codec` over an excerpt of a real file, mixed to mono and
 * converted to the bench's rate, and withholds packets from the decoder
 * by seeded patterns — none, random losses of 1, 3 and 10 %, bursts of
 * three — with the very same losses for every concealment mode
 * (`decoder.lose()` fills each hole: silence, repeat, fade, extend). Prints one
 * Markdown table against the source: the spectral distances (0–5 kHz and
 * the whole band), the segmental SNR, the share of packets lost. With
 * `--wav`, writes the source and each decoded signal as 16-bit WAV files.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../src/main.js';
import { readWav, decodeFlac, toMono, resample } from './lib/audiofile.js';
import { prng } from './lib/signals.js';
import { segmentalSnr } from './lib/metrics.js';
import { logSpectralDistance } from './lib/spectral.js';
import { encodeWav } from './lib/wav.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');

/** Reads `--name value` from the command line. */
function option(name, fallback) {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const file = option('file', null);
if (!file) {
    console.error('usage: bun bench/loss.js --file <audio> [--start s] [--seconds s] [--name n] [--rate 48000] [--presets a,b] [--wav dir]');
    process.exit(2);
}
const rate = Number(option('rate', 48000));
const seconds = Number(option('seconds', 20));
const start = Number(option('start', 0));
const name = option('name', 'excerpt');
const presets = option('presets', 'voice,full-low').split(',');
const wavDir = option('wav', null);

/** The excerpt, mono, at the bench's rate, whole frames. */
function excerpt() {
    const bytes = readFileSync(file);
    let audio;
    if (file.toLowerCase().endsWith('.flac')) {
        const head = decodeFlac(bytes, { start: 0, count: 0 });
        audio = decodeFlac(bytes, { start: Math.round(start * head.rate), count: Math.round(seconds * head.rate) });
    } else {
        const whole = readWav(bytes);
        const from = Math.round(start * whole.rate);
        audio = { rate: whole.rate, channels: whole.channels.map((c) => c.subarray(from, from + Math.round(seconds * whole.rate))) };
    }
    const mono = resample(toMono(audio.channels), audio.rate, rate);
    return mono.subarray(0, Math.floor(mono.length / 128) * 128);
}

/** Which of `count` packets are lost, by a seeded pattern. */
function pattern(kind, count) {
    const random = prng(kind.length * 7919 + count);
    const lost = new Uint8Array(count);
    if (kind === 'none') return lost;
    if (kind.startsWith('random-')) {
        const p = Number(kind.slice(7)) / 100;
        for (let k = 0; k < count; k++) lost[k] = random() < p ? 1 : 0;
    } else if (kind === 'bursts-3') {
        // A burst of three begins at 1 % of the packets: about 3 % lost, in runs.
        for (let k = 0; k < count; k++) if (random() < 0.01) lost.fill(1, k, Math.min(count, k + 3));
    }
    return lost;
}

const source = excerpt();
const frames = source.length / 128;
const kinds = ['none', 'random-1', 'random-3', 'random-10', 'bursts-3'];
const modes = ['silence', 'repeat', 'fade', 'extend'];
if (wavDir) {
    mkdirSync(wavDir, { recursive: true });
    writeFileSync(join(wavDir, `${name}.source.wav`), encodeWav(source, rate));
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const lines = [
    `Audio loss bench: ${file}, from ${start} s for ${seconds} s, mono at ${rate} Hz, ${frames} packets; the same losses for every mode.`,
    '',
    '| Signal | Preset | Losses | Lost % | Mode | LSD 0-5k dB | LSD full dB | Seg. SNR dB |',
    '|---|---|---|---:|---|---:|---:|---:|',
];
for (const preset of presets) {
    const encoder = codec.createEncoder({ rate, preset });
    const packets = [];
    for (let f = 0; f < frames; f++) packets.push(encoder.push(source.subarray(f * 128, (f + 1) * 128))[0]);
    const delay = codec.delay({ rate, preset });
    for (const kind of kinds) {
        const lost = pattern(kind, frames);
        const share = (100 * lost.reduce((a, b) => a + b, 0)) / frames;
        for (const mode of kind === 'none' ? ['silence'] : modes) {
            const decoder = codec.createDecoder({ rate, conceal: mode });
            const out = new Float32Array(source.length);
            for (let f = 0; f < frames; f++) out.set((lost[f] ? decoder.lose() : decoder.push(packets[f]))[0], f * 128);
            const label = kind === 'none' ? '—' : mode;
            lines.push(`| ${name} | ${preset} | ${kind} | ${share.toFixed(1)} | ${label} | ${f2(logSpectralDistance(source, out, { rate, maxHz: 5000, delay }))} | ${f2(logSpectralDistance(source, out, { rate, delay }))} | ${f2(segmentalSnr(source, out, { delay }))} |`);
            if (wavDir) writeFileSync(join(wavDir, `${name}.${preset}.${kind}${kind === 'none' ? '' : `.${mode}`}.wav`), encodeWav(out, rate));
        }
    }
}
console.log(lines.join('\n'));
