// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Video bench runner.
 *
 *   bun bench/run.js [--width 640] [--height 360] [--frames 48] [--fps 24] [--seed 1] [--only <regexp>] [--dump <dir>]
 *   bun bench/run.js --file <video.y4m> [--name clip] [--start 0] [--frames 48] [--step 1] [--scale 1] [--only <regexp>] [--dump <dir>]
 *
 * Prints one Markdown table, every sequence × every codec of
 * `codecs.js`: PSNR on luma over the run and on the worst frame, PSNR on
 * colour, SSIM, bytes per frame, raw and deflated bit rates, encode and
 * decode time per frame.
 * With `--file`, the generated sequences are replaced by an excerpt of a
 * real video in the raw `.y4m` format: `--step` keeps one frame in so
 * many, `--scale` reduces by a whole number. `--only` keeps the codecs
 * whose name matches.
 * With `--dump`, writes the middle and the last frame of each sequence,
 * source and decoded, as PNG files under `<dir>` for the eye.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sequences } from './lib/sequences.js';
import { fileSequence } from './lib/y4m.js';
import { runCodec } from './lib/harness.js';
import { encodePng } from './lib/png.js';
import { codecs } from './codecs.js';

/** Reads `--name value` from the command line. */
function option(name, fallback) {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const width = Number(option('width', 640));
const height = Number(option('height', 360));
const frames = Number(option('frames', 48));
const fps = Number(option('fps', 24));
const seed = Number(option('seed', 1));
const dumpDir = option('dump', null);
const file = option('file', null);
const only = new RegExp(option('only', '.'));
const set = file
    ? [fileSequence({ path: file, name: option('name', 'clip'), start: Number(option('start', 0)), frames, step: Number(option('step', 1)), scale: Number(option('scale', 1)) })]
    : sequences({ width, height, frames, fps, seed });

const dB = (value) => (Number.isFinite(value) ? value.toFixed(2) : value > 0 ? 'inf' : String(value));
const keep = [Math.floor(frames / 2), frames - 1];
const frameName = (t) => `f${String(t).padStart(3, '0')}`;

if (dumpDir) mkdirSync(dumpDir, { recursive: true });

const lines = [
    file
        ? `Video bench: ${file}, ${set[0].width}x${set[0].height}, ${frames} frames at ${set[0].fps} fps, deflate level 6 per packet.`
        : `Video bench: ${width}x${height}, ${frames} frames at ${fps} fps, seed ${seed}, deflate level 6 per packet.`,
    '',
    '| Sequence | Codec | PSNR-Y dB | Worst frame dB | PSNR-RGB dB | SSIM | Bytes / frame | Raw kbit/s | Deflated kbit/s | Enc ms | Dec ms |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];

for (const sequence of set) {
    if (dumpDir) {
        for (const t of keep) writeFileSync(join(dumpDir, `${sequence.name}.${frameName(t)}.source.png`), encodePng(sequence.frame(t), sequence.width, sequence.height));
    }
    for (const codec of codecs.filter((entry) => only.test(entry.name))) {
        const row = runCodec(codec, sequence, { keep: dumpDir ? keep : [] });
        if (!row.inflateChecked) throw new Error(`bench: a deflated packet of ${codec.name} did not inflate back`);
        lines.push(`| ${row.sequence} | ${row.codec} | ${dB(row.psnrLuma)} | ${dB(row.worstPsnrLuma)} | ${dB(row.psnrColour)} | ${row.ssim.toFixed(4)} | ${row.rawBytesPerFrame.toFixed(0)} | ${row.rawKbps.toFixed(0)} | ${row.deflatedKbps.toFixed(0)} | ${row.encodeMs.toFixed(2)} | ${row.decodeMs.toFixed(2)} |`);
        if (dumpDir) {
            for (const [t, picture] of row.pictures) writeFileSync(join(dumpDir, `${sequence.name}.${frameName(t)}.${codec.name}.png`), encodePng(picture, sequence.width, sequence.height));
        }
    }
}

console.log(lines.join('\n'));
