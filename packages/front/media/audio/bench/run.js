// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Audio bench runner.
 *
 *   bun bench/run.js [--rate 44100] [--seconds 4] [--seed 1] [--wav <dir>]
 *   bun bench/run.js --file <audio.flac|.wav> [--start 0] [--seconds 20] [--name excerpt] [--only <regexp>] [--wav <dir>]
 *
 * Prints one Markdown table, every signal × every codec of `codecs.js`:
 * SNR, segmental SNR, log-spectral distance up to 5 kHz and over the whole
 * band (lower is better),
 * raw and deflated bit rates, time per frame, and the latency the codec
 * adds to the 2.9 ms of a frame (its delay and what it buffers).
 * With `--file`, the generated signals are replaced by an excerpt of a
 * real file, mixed to mono and converted to the rate of the bench;
 * `--only` keeps the codecs whose name matches.
 * With `--wav`, writes each source and each decoded signal as 16-bit WAV
 * files under `<dir>` for listening.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signals } from './lib/signals.js';
import { runCodec } from './lib/harness.js';
import { encodeWav } from './lib/wav.js';
import { readWav, decodeFlac, toMono, resample } from './lib/audiofile.js';
import { FRAME } from './lib/signals.js';
import { codecs } from './codecs.js';

/** Reads `--name value` from the command line. */
function option(name, fallback) {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const rate = Number(option('rate', 44100));
const seconds = Number(option('seconds', 4));
const seed = Number(option('seed', 1));
const wavDir = option('wav', null);
const file = option('file', null);
const only = option('only', null);

/** An excerpt of a real file as one bench signal: mono, at the bench's rate, whole frames. */
function excerpt() {
    const bytes = readFileSync(file);
    const start = Number(option('start', 0));
    let audio;
    if (file.toLowerCase().endsWith('.flac')) {
        // The frames are parsed up to the excerpt; the MD5 check needs the whole file and is done apart.
        const head = decodeFlac(bytes, { start: 0, count: 0 });
        audio = decodeFlac(bytes, { start: Math.round(start * head.rate), count: Math.round(seconds * head.rate) });
    } else {
        const whole = readWav(bytes);
        const from = Math.round(start * whole.rate);
        audio = { rate: whole.rate, channels: whole.channels.map((c) => c.subarray(from, from + Math.round(seconds * whole.rate))) };
    }
    const mono = resample(toMono(audio.channels), audio.rate, rate);
    return { name: option('name', 'excerpt'), samples: mono.subarray(0, Math.floor(mono.length / FRAME) * FRAME) };
}

const list = file ? [excerpt()] : signals({ rate, seconds, seed });
const chosen = only ? codecs.filter((codec) => new RegExp(only).test(codec.name)) : codecs;

const dB = (value) => (Number.isFinite(value) ? value.toFixed(2) : value > 0 ? 'inf' : String(value));
const kbps = (bytesPerSecond) => ((bytesPerSecond * 8) / 1000).toFixed(1);

if (wavDir) mkdirSync(wavDir, { recursive: true });

const lines = [
    file
        ? `Audio bench: ${file}, from ${option('start', 0)} s for ${seconds} s, mono at ${rate} Hz, frame 128, deflate level 6 per packet.`
        : `Audio bench: rate ${rate} Hz, ${seconds} s, seed ${seed}, frame 128, deflate level 6 per packet.`,
    '',
    '| Signal | Codec | SNR dB | Seg. SNR dB | LSD 0-5k dB | LSD full dB | Raw kbit/s | Deflated kbit/s | µs / frame | Latency ms |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];

for (const signal of list) {
    if (wavDir) writeFileSync(join(wavDir, `${signal.name}.source.wav`), encodeWav(signal.samples, rate));
    for (const codec of chosen) {
        const row = runCodec(codec, signal, rate);
        if (!row.inflateChecked) throw new Error(`bench: a deflated packet of ${codec.name} did not inflate back`);
        lines.push(`| ${row.signal} | ${row.codec} | ${dB(row.snr)} | ${dB(row.segmentalSnr)} | ${row.spectralDistance.toFixed(2)} | ${row.spectralDistanceFull.toFixed(2)} | ${kbps(row.rawBytesPerSecond)} | ${kbps(row.deflatedBytesPerSecond)} | ${row.microsPerFrame.toFixed(1)} | ${row.latencyMs.toFixed(1)} |`);
        if (wavDir) writeFileSync(join(wavDir, `${signal.name}.${codec.name}.wav`), encodeWav(row.decoded, rate));
    }
}

console.log(lines.join('\n'));
