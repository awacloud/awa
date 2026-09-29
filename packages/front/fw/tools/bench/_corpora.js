// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Deterministic bench corpora + PRNG + comparison helpers,
 * shared by `deflate-levels.js` and `codec-levels.js`.
 *
 * Moved verbatim (behaviour-identical) out of `deflate-levels.js:60-140,
 * 176-186` (fw/BATCH_34 task 01) so the generalised harness can reuse the
 * same six deterministic corpora without duplicating them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
// packages/front/fw/tools/bench -> repo root (5 levels up).
const REPO_ROOT = path.resolve(TOOL_DIR, '../../../../..');

export const CORPUS_SEED = 0x9E3779B9;
export const CORPUS_BYTES = 256 * 1024;

// ── deterministic xorshift32 PRNG ───────────────────────────────────────────

export function makeXorshift32(seed) {
    let x = seed >>> 0;
    return function next() {
        x ^= (x << 13); x >>>= 0;
        x ^= (x >>> 17);
        x ^= (x << 5);  x >>>= 0;
        return x >>> 0;
    };
}

// ── deterministic corpora ───────────────────────────────────────────────────

function corpusText() {
    return fs.readFileSync(path.join(REPO_ROOT, 'packages/front/fw/src/io/compress/brotli_dict.bin'));
}

function corpusSource() {
    return fs.readFileSync(path.join(REPO_ROOT, 'packages/front/fw/src/io/compress/brotli.js'));
}

function corpusJson() {
    const rng = makeXorshift32(CORPUS_SEED);
    let out = '[';
    let n = 0;
    while (out.length < CORPUS_BYTES) {
        const score = (rng() % 100000) / 1000;
        const tagCount = 1 + (rng() % 3);
        const tags = [];
        for (let i = 0; i < tagCount; ++i) tags.push('"tag' + (rng() % 50) + '"');
        out += '{"id":' + n + ',"name":"user' + n + '","score":' + score + ',"tags":[' + tags.join(',') + ']},';
        n++;
    }
    const bytes = new TextEncoder().encode(out);
    return bytes.length > CORPUS_BYTES ? bytes.subarray(0, CORPUS_BYTES) : bytes;
}

function corpusRandom() {
    const rng = makeXorshift32(CORPUS_SEED);
    const out = new Uint8Array(CORPUS_BYTES);
    for (let i = 0; i < CORPUS_BYTES; ++i) out[i] = rng() & 0xFF;
    return out;
}

function corpusRepeat() {
    const rng = makeXorshift32(CORPUS_SEED);
    const pattern = new Uint8Array(97);
    for (let i = 0; i < 97; ++i) pattern[i] = rng() & 0xFF;
    const out = new Uint8Array(CORPUS_BYTES);
    for (let i = 0; i < CORPUS_BYTES; ++i) out[i] = pattern[i % 97];
    return out;
}

// 200 consecutive 2 KiB slices drawn from `source`, cyclically extended past
// EOF (the file is smaller than 200*2048 bytes) — the ooxml many-small-parts
// shape: many independent `deflateSync` calls, timing summed per rep.
function corpusSmall() {
    const src = corpusSource();
    const sliceSize = 2048;
    const slices = [];
    for (let i = 0; i < 200; ++i) {
        const offset = i * sliceSize;
        const slice = new Uint8Array(sliceSize);
        for (let j = 0; j < sliceSize; ++j) slice[j] = src[(offset + j) % src.length];
        slices.push(slice);
    }
    return slices;
}

export function buildCorpus(name) {
    switch (name) {
        case 'text':   return corpusText();
        case 'source': return corpusSource();
        case 'json':   return corpusJson();
        case 'random': return corpusRandom();
        case 'repeat': return corpusRepeat();
        case 'small':  return corpusSmall();
        default: throw new Error("bench corpora: unknown corpus '" + name + "'");
    }
}

// ── comparison helpers ──────────────────────────────────────────────────────

export function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
    return true;
}

export function median(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
