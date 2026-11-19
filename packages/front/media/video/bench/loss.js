// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Lost-packet runner of the video bench (row V13).
 *
 *   bun bench/loss.js [--width 640] [--height 360] [--frames 168] [--fps 24] [--seed 1] [--only <regexp>] [--sequences <regexp>]
 *
 * Prints one Markdown table: for the codecs of `codecs.js` whose name
 * matches `--only` (by default the pyramid codec with and without the
 * frame vector and the exact pyramid), on every sequence, what one lost
 * packet, three in a row and a seeded 2 % cost — frames damaged, the
 * worst cost on a frame, and the frames the stream took to heal.
 */

import { sequences } from './lib/sequences.js';
import { measureLoss, pattern } from './lib/loss.js';
import { codecs } from './codecs.js';

/** Reads `--name value` from the command line. */
function option(name, fallback) {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const width = Number(option('width', 640));
const height = Number(option('height', 360));
const frames = Number(option('frames', 168));
const fps = Number(option('fps', 24));
const seed = Number(option('seed', 1));
const only = new RegExp(option('only', '^layered-L2-diag-d4(-move|-exact|-exact-move)?$'));
const wanted = new RegExp(option('sequences', '.'));

const patterns = [
    ['one packet', pattern('one', { at: 30 })],
    ['three in a row', pattern('burst', { at: 30, length: 3 })],
    ['2 % at random', pattern('random', { share: 0.02, frames, seed: 41, from: 1 })],
];

const lines = [
    `Video loss bench: ${width}x${height}, ${frames} frames at ${fps} fps, seed ${seed}. A frame is damaged when the loss costs more than 1 dB of luma PSNR.`,
    '',
    '| Sequence | Codec | Loss | Lost | Kbit/s | PSNR-Y whole dB | PSNR-Y with loss dB | Damaged frames | Worst cost dB | Frames to heal | Healed |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
];

for (const sequence of sequences({ width, height, frames, fps, seed }).filter((entry) => wanted.test(entry.name))) {
    for (const codec of codecs.filter((entry) => only.test(entry.name))) {
        for (const [label, lost] of patterns) {
            const row = measureLoss(codec, sequence, lost);
            lines.push(`| ${row.sequence} | ${row.codec} | ${label} | ${row.lost} | ${((row.bytesPerFrame * 8 * fps) / 1000).toFixed(0)} | ${row.psnrWhole.toFixed(2)} | ${row.psnrLossy.toFixed(2)} | ${row.damaged} | ${row.worstGap.toFixed(1)} | ${row.repair} | ${row.healed ? 'yes' : '**no**'} |`);
        }
    }
}

console.log(lines.join('\n'));
