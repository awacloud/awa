// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Generalised old-vs-new codec bench harness — deflate,
 * brotli, lz4 and the huffman/bitstream micro-primitives — with
 * interleaved A/B timing, cross-decoding and external-oracle correctness
 * legs, and a git-ref-pinned baseline for the primitives under test.
 *
 * ## Usage
 *
 *   bun packages/front/fw/tools/bench/codec-levels.js --codec deflate|brotli|lz4|micro
 *        --baseline <git-ref>            (required for a real A/B; absent -> live both sides)
 *        [--levels 1-9 | 1,4,6,9,11]     (deflate default 1-9; brotli default 1,4,6,9,11; ignored for lz4/micro)
 *        [--reps 7] [--warmup 3] [--no-interleave] [--corpora text,source,json,random,repeat,small]
 *        [--lz4-mode speed|ratio]        (lz4 only, default speed; ignored for the other codecs)
 *        [--json <out file>]
 *
 * `--lz4-mode` selects `lz4.compress(src, len, { mode })` for every engine
 * built from the LIVE `lz4.js` - the new side, and the old side too when no
 * `--baseline` is given (so a live-vs-live run stays an A/A comparison). A
 * materialised baseline `lz4.js` is always called as `compress(src, len)`,
 * without the third argument. The mode is echoed as `lz4Mode` in the JSON
 * (`null` for the other codecs).
 *
 * KNOWN EXCLUSION — brotli + `random` + `--baseline`: with a baseline whose
 * materialised `huffman.js` predates BL-1110's frequency-ceiling fix
 * (task 03), `brotli.brotliCompressSync` on the 256 KiB `random` corpus
 * drives `huffman.buildTree`'s internal histogram past its fixed sentinel
 * frequency and throws (`undefined is not an object (evaluating
 * 't[i2].f')`) — a real, out-of-perimeter `huffman.js` defect, not a bug in
 * this harness (see `ai/batches/types/fw/BATCH_34/01-report.md`). Until
 * task 03 lands, pass `--corpora text,source,json,repeat,small` (i.e.
 * everything but `random`) for brotli runs against a pre-BL-1110 baseline;
 * every other corpus x codec combination is unaffected.
 *
 * `--baseline <ref>` resolves the ref to a full sha (`git rev-parse`) and
 * materialises `git show <sha>:.../{bitstream,huffman,lz4}.js` into
 * `<repo>/tmp/bench/baseline-<sha12>/` (gitignored at any depth, idempotent
 * overwrite), rewriting ONLY the materialised `huffman.js`'s
 * `from './bitstream.js'` specifier to the `file://` URL of the sibling
 * materialised `bitstream.js` — the baseline is self-contained. `deflate.js`
 * and `brotli.js` are never materialised: only the three primitives are
 * provenance-managed by this batch, so "old" is always the LIVE codec
 * wired with the baseline primitives, and "new" is the live codec wired
 * with the live primitives.
 *
 * ## Engines
 *
 * | codec   | old                                                   | new              |
 * |---------|--------------------------------------------------------|------------------|
 * | deflate | live `deflate.factory(oldBs, oldHf, lz77.factory())`   | live primitives  |
 * | brotli  | live `brotli.factory(oldBs, oldHf, lz77, bd, bw)`      | live primitives  |
 * | lz4     | materialised `lz4.factory()`                           | live `lz4.factory()` |
 * | micro   | `oldHf`/`oldBs`                                        | live             |
 *
 * ## Measurement
 *
 * Per cell (level x corpus, or the single `"-"` level for lz4/micro):
 * `warmup` untimed calls on BOTH engines, then `reps` timed pairs
 * (interleaved old/new/old/new/... unless `--no-interleave`, which runs all
 * of old then all of new); `encMs` (compress) and `decMs` (decompress of
 * that engine's own output) are each the MEDIAN over `reps`. The `small`
 * corpus sums 200 slice calls per timed rep, as `deflate-levels.js` does.
 *
 * Correctness legs run ONCE per cell, after timing, each throwing with the
 * cell name on failure: (1) new -> new round-trip; (2) cross —
 * `oldDec(newEnc(x)) === x` and `newDec(oldEnc(x)) === x`; (3) an external
 * oracle against the NEW engine's output — `Bun.inflateSync` (deflate) or
 * `node:zlib`'s `brotliDecompressSync` (brotli); lz4 has no independent
 * oracle (`oracle: null`).
 *
 * `micro` has no encode/decode notion — it times 4 primitive operations
 * (Δtime only, `bytes` always 0, `oracle` always `null`), keyed inside the
 * single level `"-"`'s `corpora` map:
 *   - `<corpus>`            : `encMs`/`decMs` = 200x `buildMap(lengths, 15, 0|1)`
 *                              (the encode map / the decode table) on the
 *                              code lengths from that engine's OWN
 *                              `buildTree(hist, 15)` over the corpus's
 *                              286-symbol literal histogram (literals only —
 *                              byte-value counts, no length/distance codes).
 *   - `<corpus>:buildTree`  : `encMs` = 200x `buildTree(hist, 15)` itself
 *                              (`decMs`/`bytes` unused, left at 0).
 *   - `bitstream.rw`        : ONE entry (corpus-independent), `encMs` = one
 *                              pass writing `1 << 20` values of widths
 *                              cycling 1..16 at running bit positions into a
 *                              zeroed buffer (`writeBits`, or `writeBits16`
 *                              whenever `width + (bitPos & 7) > 16` — the
 *                              2-byte `writeBits` window is otherwise too
 *                              narrow), then reading them all back
 *                              (`readBits`/`readBits16` matching the write
 *                              choice) and asserting equality (throws on
 *                              mismatch); `decMs`/`bytes` unused.
 *
 * This module has no side effects on import: the CLI (print + optional
 * JSON write) runs only under `import.meta.main`. It does NOT assert a
 * pass/fail verdict — the harness measures, the gate is read by the
 * consuming task.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { deflate } from '../../src/io/compress/deflate.js';
import { brotli } from '../../src/io/compress/brotli.js';
import { brotliDict } from '../../src/io/compress/brotli_dict.js';
import { brotliDictWords } from '../../src/io/compress/brotli_dict_words.js';
import { bitstream as liveBitstream } from '../../src/io/compress/bitstream.js';
import { huffman as liveHuffman } from '../../src/io/compress/huffman.js';
import { lz77 } from '../../src/io/compress/lz77.js';
import { lz4 as liveLz4 } from '../../src/io/compress/lz4.js';
import { buildCorpus, bytesEqual, median } from './_corpora.js';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
// packages/front/fw/tools/bench -> repo root (5 levels up).
const REPO_ROOT = path.resolve(TOOL_DIR, '../../../../..');
const PRIMITIVE_REL = {
    bitstream: 'packages/front/fw/src/io/compress/bitstream.js',
    huffman: 'packages/front/fw/src/io/compress/huffman.js',
    lz4: 'packages/front/fw/src/io/compress/lz4.js',
};

const DEFAULT_CORPORA = ['text', 'source', 'json', 'random', 'repeat', 'small'];
const DEFAULT_LEVELS_DEFLATE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DEFAULT_LEVELS_BROTLI = [1, 4, 6, 9, 11];
const RAW = { windowBits: -15 };            // raw DEFLATE, no zlib wrapper (deflate.test.js:26)
const LIT_LEN_SYMBOLS = 286;                // DEFLATE literal/length alphabet size
const BITSTREAM_RW_COUNT = 1 << 20;

// ── baseline materialisation (git rev-parse + git show + specifier rewrite) ─

function resolveFullSha(ref) {
    const res = Bun.spawnSync(['git', 'rev-parse', ref], { cwd: REPO_ROOT });
    if (res.exitCode !== 0) {
        const stderr = res.stderr ? res.stderr.toString('utf8') : '';
        throw new Error('codec-levels: git rev-parse ' + ref + ' failed: ' + stderr);
    }
    return res.stdout.toString('utf8').trim();
}

function gitShow(fullSha, relPath) {
    const res = Bun.spawnSync(['git', 'show', fullSha + ':' + relPath], { cwd: REPO_ROOT });
    if (res.exitCode !== 0) {
        const stderr = res.stderr ? res.stderr.toString('utf8') : '';
        throw new Error('codec-levels: git show ' + fullSha + ':' + relPath + ' failed: ' + stderr);
    }
    return res.stdout.toString('utf8');
}

/**
 * Materialise `bitstream.js`, `huffman.js` and `lz4.js` as they existed at
 * `ref` into `tmp/bench/baseline-<sha12>/` (idempotent overwrite), rewiring
 * ONLY the materialised `huffman.js`'s `bitstream.js` import to the
 * materialised sibling.
 *
 * @param {string} ref - a git ref (sha, branch, tag, `HEAD~N`, ...)
 * @returns {{ dir: string, sha: string, sha12: string }}
 */
export function materializeBaseline(ref) {
    const sha = resolveFullSha(ref);
    const sha12 = sha.slice(0, 12);
    const outDir = path.join(REPO_ROOT, 'tmp', 'bench', 'baseline-' + sha12);
    fs.mkdirSync(outDir, { recursive: true });

    const bsOut = path.join(outDir, 'bitstream.js');
    fs.writeFileSync(bsOut, gitShow(sha, PRIMITIVE_REL.bitstream));

    let hfSrc = gitShow(sha, PRIMITIVE_REL.huffman);
    const bsUrl = pathToFileURL(bsOut).href;
    hfSrc = hfSrc.replace("from './bitstream.js'", "from '" + bsUrl + "'");
    fs.writeFileSync(path.join(outDir, 'huffman.js'), hfSrc);

    fs.writeFileSync(path.join(outDir, 'lz4.js'), gitShow(sha, PRIMITIVE_REL.lz4));

    return { dir: outDir, sha, sha12 };
}

async function loadMaterialized(dir) {
    const [bsMod, hfMod, lzMod] = await Promise.all([
        import(pathToFileURL(path.join(dir, 'bitstream.js')).href),
        import(pathToFileURL(path.join(dir, 'huffman.js')).href),
        import(pathToFileURL(path.join(dir, 'lz4.js')).href),
    ]);
    return { bitstream: bsMod.bitstream, huffman: hfMod.huffman, lz4: lzMod.lz4 };
}

// ── engine wiring ────────────────────────────────────────────────────────────

let _dictBlobCache = null;
function loadBrotliDictBlob() {
    if (!_dictBlobCache) {
        _dictBlobCache = new Uint8Array(fs.readFileSync(path.join(REPO_ROOT, 'packages/front/fw/src/io/compress/brotli_dict.bin')));
    }
    return _dictBlobCache;
}

function buildDeflateEngine(primitives) {
    const bs = primitives.bitstream.factory();
    const hf = primitives.huffman.factory(bs);
    return deflate.factory(bs, hf, lz77.factory());
}

function buildBrotliEngine(primitives) {
    const bs = primitives.bitstream.factory();
    const hf = primitives.huffman.factory(bs);
    const lz = lz77.factory();
    const bw = brotliDictWords.factory();
    bw.setBlob(loadBrotliDictBlob());
    const bd = brotliDict.factory();
    return brotli.factory(bs, hf, lz, bd, bw);
}

function buildLz4Engine(primitives, lz4Mode) {
    const api = primitives.lz4.factory();
    // Only the live module knows `opts.mode`; a baseline keeps its 2-argument call.
    const opts = primitives.lz4 === liveLz4 ? { mode: lz4Mode } : null;
    return { compress: api.compress, decompress: api.decompress, lz4Opts: opts };
}

function buildMicroEngine(primitives) {
    const bs = primitives.bitstream.factory();
    const hf = primitives.huffman.factory(bs);
    return { bitstream: bs, huffman: hf };
}

// ── per-codec encode/decode (single call) ───────────────────────────────────

function encodeOnce(codec, engine, x, level) {
    if (codec === 'deflate') {
        const out = engine.deflateSync(x, { level });
        return { bytes: out, size: out.length };
    }
    if (codec === 'brotli') {
        const out = engine.brotliCompressSync(x, { quality: level });
        return { bytes: out, size: out.length };
    }
    if (codec === 'lz4') {
        const [size, out] = engine.lz4Opts
            ? engine.compress(x, x.length, engine.lz4Opts)
            : engine.compress(x, x.length);
        if (size === -1) throw new Error('codec-levels: lz4 compress overflow');
        return { bytes: out, size: out.length, raw: size === 0 };
    }
    throw new Error("codec-levels: encodeOnce: unsupported codec '" + codec + "'");
}

function decodeOnce(codec, engine, encRes) {
    if (codec === 'deflate') return engine.inflateSync(encRes.bytes);
    if (codec === 'brotli') return engine.brotliDecompressSync(encRes.bytes);
    if (codec === 'lz4') {
        if (encRes.raw) return encRes.bytes; // [0, copy] — no LZ4 framing to decode (lz4.test.js convention)
        const [size, out] = engine.decompress(encRes.bytes);
        if (size === -1) throw new Error('codec-levels: lz4 decompress error');
        return out;
    }
    throw new Error("codec-levels: decodeOnce: unsupported codec '" + codec + "'");
}

// ── timing (single call / small-corpus sum) ─────────────────────────────────

function timedRoundtripSingle(codec, engine, data, level) {
    const t0 = Bun.nanoseconds();
    const encRes = encodeOnce(codec, engine, data, level);
    const encNs = Bun.nanoseconds() - t0;
    const t1 = Bun.nanoseconds();
    decodeOnce(codec, engine, encRes);
    const decNs = Bun.nanoseconds() - t1;
    return { encNs, decNs, bytes: encRes.size };
}

function timedRoundtripSmall(codec, engine, slices, level) {
    let encNs = 0, decNs = 0, bytes = 0;
    for (const slice of slices) {
        const r = timedRoundtripSingle(codec, engine, slice, level);
        encNs += r.encNs; decNs += r.decNs; bytes += r.bytes;
    }
    return { encNs, decNs, bytes };
}

function pct(oldV, newV) {
    return oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
}

function measureCodecCell(codec, oldEngine, newEngine, corpusName, corpusData, level, reps, warmup, interleave) {
    const isSmall = corpusName === 'small';
    const runOnce = (engine) => isSmall
        ? timedRoundtripSmall(codec, engine, corpusData, level)
        : timedRoundtripSingle(codec, engine, corpusData, level);

    for (let w = 0; w < warmup; ++w) { runOnce(oldEngine); runOnce(newEngine); }

    const oldEnc = [], oldDec = [], newEnc = [], newDec = [];
    let oldBytes = 0, newBytes = 0;

    if (interleave) {
        for (let r = 0; r < reps; ++r) {
            const ro = runOnce(oldEngine);
            oldEnc.push(ro.encNs / 1e6); oldDec.push(ro.decNs / 1e6); oldBytes = ro.bytes;
            const rn = runOnce(newEngine);
            newEnc.push(rn.encNs / 1e6); newDec.push(rn.decNs / 1e6); newBytes = rn.bytes;
        }
    } else {
        for (let r = 0; r < reps; ++r) {
            const ro = runOnce(oldEngine);
            oldEnc.push(ro.encNs / 1e6); oldDec.push(ro.decNs / 1e6); oldBytes = ro.bytes;
        }
        for (let r = 0; r < reps; ++r) {
            const rn = runOnce(newEngine);
            newEnc.push(rn.encNs / 1e6); newDec.push(rn.decNs / 1e6); newBytes = rn.bytes;
        }
    }

    const oldEncMs = median(oldEnc), newEncMs = median(newEnc);
    const oldDecMs = median(oldDec), newDecMs = median(newDec);

    return {
        oldEncMs, newEncMs, deltaEncPct: pct(oldEncMs, newEncMs),
        oldDecMs, newDecMs, deltaDecPct: pct(oldDecMs, newDecMs),
        oldBytes, newBytes, deltaBytesPct: pct(oldBytes, newBytes),
    };
}

// ── correctness legs (run once per cell, after timing) ──────────────────────

function runCorrectnessLegs(codec, oldEngine, newEngine, corpusName, corpusData, level, cellLabel) {
    const items = corpusName === 'small' ? corpusData : [corpusData];
    let oracle = codec === 'lz4' ? null : true;

    for (const x of items) {
        const newEncRes = encodeOnce(codec, newEngine, x, level);
        const newDecoded = decodeOnce(codec, newEngine, newEncRes);
        if (!bytesEqual(newDecoded, x)) {
            throw new Error('codec-levels: ' + cellLabel + ' — new round-trip mismatch');
        }

        const oldEncRes = encodeOnce(codec, oldEngine, x, level);
        const crossOld = decodeOnce(codec, oldEngine, newEncRes); // oldDec(newEnc(x))
        if (!bytesEqual(crossOld, x)) {
            throw new Error('codec-levels: ' + cellLabel + ' — cross oldDec(newEnc(x)) mismatch');
        }
        const crossNew = decodeOnce(codec, newEngine, oldEncRes); // newDec(oldEnc(x))
        if (!bytesEqual(crossNew, x)) {
            throw new Error('codec-levels: ' + cellLabel + ' — cross newDec(oldEnc(x)) mismatch');
        }

        if (codec === 'deflate') {
            const oracleOut = new Uint8Array(Bun.inflateSync(newEncRes.bytes, RAW));
            if (!bytesEqual(oracleOut, x)) {
                throw new Error('codec-levels: ' + cellLabel + ' — deflate oracle (Bun.inflateSync) mismatch');
            }
        } else if (codec === 'brotli') {
            const oracleOut = new Uint8Array(zlib.brotliDecompressSync(Buffer.from(newEncRes.bytes)));
            if (!bytesEqual(oracleOut, x)) {
                throw new Error('codec-levels: ' + cellLabel + ' — brotli oracle (node:zlib) mismatch');
            }
        }
    }

    return oracle;
}

// ── micro (huffman/bitstream primitives) ────────────────────────────────────

// `huffman.buildTree`'s package-merge-style construction uses a fixed
// sentinel frequency (25001, `huffman.js:121`) as a stand-in for "+Infinity"
// once the real-leaf queue is exhausted; a real per-symbol frequency at or
// above that value breaks the merge-order invariant (observed: OOB access /
// `undefined` dereference in `buildTree`, out-of-perimeter — never
// written by this batch). A 16 KiB prefix keeps every one of the six
// corpora's per-byte counts comfortably under that bound (measured max
// 4917, corpus 'source'/'small') while still exercising a realistic,
// DEFLATE-block-scale histogram (production blocks are far smaller than a
// whole 256 KiB corpus).
const HIST_SAMPLE_BYTES = 16384;

function literalHistogram(corpusName, data) {
    // Plain array, NOT Uint16Array: even at the 16 KiB sample size a
    // frequent byte could in principle approach the 16-bit counter range;
    // a plain array never silently wraps.
    const hist = new Array(LIT_LEN_SYMBOLS).fill(0);
    let taken = 0;
    const bump = (u8) => {
        for (let i = 0; i < u8.length && taken < HIST_SAMPLE_BYTES; ++i, ++taken) hist[u8[i]]++;
    };
    if (corpusName === 'small') {
        for (const slice of data) { if (taken >= HIST_SAMPLE_BYTES) break; bump(slice); }
    } else {
        bump(data);
    }
    return hist;
}

function timeBuildTree(hf, hist) {
    const t0 = Bun.nanoseconds();
    let lengths = null;
    for (let i = 0; i < 200; ++i) lengths = hf.buildTree(hist, 15).t;
    return { ns: Bun.nanoseconds() - t0, lengths };
}

function timeBuildMap(hf, lengths, reversed) {
    const t0 = Bun.nanoseconds();
    for (let i = 0; i < 200; ++i) hf.buildMap(lengths, 15, reversed);
    return Bun.nanoseconds() - t0;
}

/**
 * `bitstream.rw` micro-cell: one pass writing `1 << 20` values of widths
 * cycling 1..16 at running bit positions, then reading them back and
 * asserting equality (throws the mismatched index on failure). Uses
 * `writeBits16`/`readBits16` whenever the 2-byte `writeBits`/`readBits`
 * window would be too narrow (`width + (bitPos & 7) > 16`).
 */
function bitstreamRwPass(bs) {
    const n = BITSTREAM_RW_COUNT;
    const widths = new Uint8Array(n);
    const positions = new Uint32Array(n);
    const values = new Uint32Array(n);
    let bitPos = 0;
    for (let i = 0; i < n; ++i) {
        const w = (i % 16) + 1;
        widths[i] = w;
        positions[i] = bitPos;
        // Deterministic value that fits in `w` bits.
        values[i] = w >= 32 ? 0 : (((i * 2654435761) >>> 0) & ((1 << w) - 1));
        bitPos += w;
    }
    const buf = new Uint8Array(bs.byteOffset(bitPos) + 4); // +4 guard bytes for the 24-bit write window

    const t0 = Bun.nanoseconds();
    for (let i = 0; i < n; ++i) {
        const p = positions[i];
        if (widths[i] + (p & 7) > 16) bs.writeBits16(buf, p, values[i]);
        else bs.writeBits(buf, p, values[i]);
    }
    for (let i = 0; i < n; ++i) {
        const p = positions[i];
        const w = widths[i];
        const readBack = (w + (p & 7) > 16)
            ? (bs.readBits16(buf, p) & ((1 << w) - 1))
            : bs.readBits(buf, p, (1 << w) - 1);
        if (readBack !== values[i]) {
            throw new Error('codec-levels: bitstream.rw — mismatch at index ' + i + ' (width ' + w + ', bitPos ' + p + ')');
        }
    }
    return Bun.nanoseconds() - t0;
}

async function runMicroBench({ oldEngine, newEngine, corporaNames, reps, warmup, interleave, baseline }) {
    const corpusCache = new Map();
    const getCorpus = (name) => {
        if (!corpusCache.has(name)) corpusCache.set(name, buildCorpus(name));
        return corpusCache.get(name);
    };

    const corporaOut = {};
    let aggOldEnc = 0, aggNewEnc = 0, aggOldDec = 0, aggNewDec = 0;

    for (const name of corporaNames) {
        const data = getCorpus(name);
        const hist = literalHistogram(name, data);

        // buildTree: 200x per rep, median across reps, per engine.
        const runTree = (hf) => timeBuildTree(hf, hist);
        const oldTree = [], newTree = [];
        for (let w = 0; w < warmup; ++w) { runTree(oldEngine.huffman); runTree(newEngine.huffman); }
        let oldLengths = null, newLengths = null;
        if (interleave) {
            for (let r = 0; r < reps; ++r) {
                const ro = runTree(oldEngine.huffman); oldTree.push(ro.ns / 1e6); oldLengths = ro.lengths;
                const rn = runTree(newEngine.huffman); newTree.push(rn.ns / 1e6); newLengths = rn.lengths;
            }
        } else {
            for (let r = 0; r < reps; ++r) { const ro = runTree(oldEngine.huffman); oldTree.push(ro.ns / 1e6); oldLengths = ro.lengths; }
            for (let r = 0; r < reps; ++r) { const rn = runTree(newEngine.huffman); newTree.push(rn.ns / 1e6); newLengths = rn.lengths; }
        }
        const oldTreeMs = median(oldTree), newTreeMs = median(newTree);
        corporaOut[name + ':buildTree'] = {
            oldEncMs: oldTreeMs, newEncMs: newTreeMs, deltaEncPct: pct(oldTreeMs, newTreeMs),
            oldDecMs: 0, newDecMs: 0, deltaDecPct: 0,
            oldBytes: 0, newBytes: 0, deltaBytesPct: 0, oracle: null,
        };

        // buildMap.enc / buildMap.dec: 200x each per rep, on this engine's OWN buildTree lengths.
        const oldEncArr = [], oldDecArr = [], newEncArr = [], newDecArr = [];
        for (let w = 0; w < warmup; ++w) {
            timeBuildMap(oldEngine.huffman, oldLengths, 0); timeBuildMap(oldEngine.huffman, oldLengths, 1);
            timeBuildMap(newEngine.huffman, newLengths, 0); timeBuildMap(newEngine.huffman, newLengths, 1);
        }
        if (interleave) {
            for (let r = 0; r < reps; ++r) {
                oldEncArr.push(timeBuildMap(oldEngine.huffman, oldLengths, 0) / 1e6);
                oldDecArr.push(timeBuildMap(oldEngine.huffman, oldLengths, 1) / 1e6);
                newEncArr.push(timeBuildMap(newEngine.huffman, newLengths, 0) / 1e6);
                newDecArr.push(timeBuildMap(newEngine.huffman, newLengths, 1) / 1e6);
            }
        } else {
            for (let r = 0; r < reps; ++r) {
                oldEncArr.push(timeBuildMap(oldEngine.huffman, oldLengths, 0) / 1e6);
                oldDecArr.push(timeBuildMap(oldEngine.huffman, oldLengths, 1) / 1e6);
            }
            for (let r = 0; r < reps; ++r) {
                newEncArr.push(timeBuildMap(newEngine.huffman, newLengths, 0) / 1e6);
                newDecArr.push(timeBuildMap(newEngine.huffman, newLengths, 1) / 1e6);
            }
        }
        const oldEncMs = median(oldEncArr), newEncMs = median(newEncArr);
        const oldDecMs = median(oldDecArr), newDecMs = median(newDecArr);
        corporaOut[name] = {
            oldEncMs, newEncMs, deltaEncPct: pct(oldEncMs, newEncMs),
            oldDecMs, newDecMs, deltaDecPct: pct(oldDecMs, newDecMs),
            oldBytes: 0, newBytes: 0, deltaBytesPct: 0, oracle: null,
        };
        aggOldEnc += oldEncMs; aggNewEnc += newEncMs;
        aggOldDec += oldDecMs; aggNewDec += newDecMs;
    }

    // bitstream.rw: corpus-independent, one entry.
    const oldRw = [], newRw = [];
    for (let w = 0; w < warmup; ++w) { bitstreamRwPass(oldEngine.bitstream); bitstreamRwPass(newEngine.bitstream); }
    if (interleave) {
        for (let r = 0; r < reps; ++r) {
            oldRw.push(bitstreamRwPass(oldEngine.bitstream) / 1e6);
            newRw.push(bitstreamRwPass(newEngine.bitstream) / 1e6);
        }
    } else {
        for (let r = 0; r < reps; ++r) oldRw.push(bitstreamRwPass(oldEngine.bitstream) / 1e6);
        for (let r = 0; r < reps; ++r) newRw.push(bitstreamRwPass(newEngine.bitstream) / 1e6);
    }
    const oldRwMs = median(oldRw), newRwMs = median(newRw);
    corporaOut['bitstream.rw'] = {
        oldEncMs: oldRwMs, newEncMs: newRwMs, deltaEncPct: pct(oldRwMs, newRwMs),
        oldDecMs: 0, newDecMs: 0, deltaDecPct: 0,
        oldBytes: 0, newBytes: 0, deltaBytesPct: 0, oracle: null,
    };

    return {
        codec: 'micro',
        host: hostInfo(),
        baseline: baseline || null,
        interleave,
        generatedAt: new Date().toISOString(),
        levels: {
            '-': {
                corpora: corporaOut,
                oldEncMs: aggOldEnc, newEncMs: aggNewEnc, deltaEncPct: pct(aggOldEnc, aggNewEnc),
                oldDecMs: aggOldDec, newDecMs: aggNewDec, deltaDecPct: pct(aggOldDec, aggNewDec),
                oldBytes: 0, newBytes: 0, deltaBytesPct: 0,
            },
        },
    };
}

function hostInfo() {
    return {
        platform: process.platform,
        arch: process.arch,
        cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'unknown',
        bunVersion: Bun.version,
    };
}

// ── top-level bench ──────────────────────────────────────────────────────────

/**
 * Run the generalised old-vs-new codec bench.
 *
 * @param {object} options
 * @param {'deflate'|'brotli'|'lz4'|'micro'} options.codec
 * @param {string} [options.baseline] - git ref for the OLD primitives (absent -> live both sides)
 * @param {number[]} [options.levels] - default per codec; ignored for lz4/micro
 * @param {number} [options.reps] - default 7
 * @param {number} [options.warmup] - default 3
 * @param {boolean} [options.interleave] - default true
 * @param {string[]} [options.corpora] - default all six corpora
 * @param {'speed'|'ratio'} [options.lz4Mode] - lz4 only, default 'speed' (live engines only)
 * @returns {Promise<object>} the documented JSON shape
 */
export async function runBench(options = {}) {
    const codec = options.codec;
    if (!['deflate', 'brotli', 'lz4', 'micro'].includes(codec)) {
        throw new Error("codec-levels: unknown codec '" + codec + "' (expected deflate|brotli|lz4|micro)");
    }
    const reps = options.reps ?? 7;
    const warmup = options.warmup ?? 3;
    const interleave = options.interleave !== false;
    const corporaNames = options.corpora && options.corpora.length ? options.corpora : DEFAULT_CORPORA;
    const lz4Mode = options.lz4Mode ?? 'speed';
    if (lz4Mode !== 'speed' && lz4Mode !== 'ratio') {
        throw new Error("codec-levels: unknown lz4 mode '" + lz4Mode + "' (expected speed|ratio)");
    }

    const oldPrimitives = options.baseline
        ? await loadMaterialized(materializeBaseline(options.baseline).dir)
        : { bitstream: liveBitstream, huffman: liveHuffman, lz4: liveLz4 };
    const newPrimitives = { bitstream: liveBitstream, huffman: liveHuffman, lz4: liveLz4 };

    if (codec === 'micro') {
        const oldEngine = buildMicroEngine(oldPrimitives);
        const newEngine = buildMicroEngine(newPrimitives);
        return runMicroBench({ oldEngine, newEngine, corporaNames, reps, warmup, interleave, baseline: options.baseline });
    }

    let oldEngine, newEngine, levels;
    if (codec === 'deflate') {
        oldEngine = buildDeflateEngine(oldPrimitives);
        newEngine = buildDeflateEngine(newPrimitives);
        levels = options.levels && options.levels.length ? options.levels : DEFAULT_LEVELS_DEFLATE;
    } else if (codec === 'brotli') {
        oldEngine = buildBrotliEngine(oldPrimitives);
        newEngine = buildBrotliEngine(newPrimitives);
        levels = options.levels && options.levels.length ? options.levels : DEFAULT_LEVELS_BROTLI;
    } else { // lz4
        oldEngine = buildLz4Engine(oldPrimitives, lz4Mode);
        newEngine = buildLz4Engine(newPrimitives, lz4Mode);
        levels = ['-'];
    }

    const corpusCache = new Map();
    const getCorpus = (name) => {
        if (!corpusCache.has(name)) corpusCache.set(name, buildCorpus(name));
        return corpusCache.get(name);
    };

    const levelsOut = {};
    for (const level of levels) {
        const cellLevel = codec === 'lz4' ? undefined : level;
        const corporaOut = {};
        let aggOldEnc = 0, aggNewEnc = 0, aggOldDec = 0, aggNewDec = 0, aggOldBytes = 0, aggNewBytes = 0;
        for (const name of corporaNames) {
            const data = getCorpus(name);
            const cell = measureCodecCell(codec, oldEngine, newEngine, name, data, cellLevel, reps, warmup, interleave);
            const oracle = runCorrectnessLegs(codec, oldEngine, newEngine, name, data, cellLevel, codec + ' level=' + level + ' corpus=' + name);
            corporaOut[name] = { ...cell, oracle };
            aggOldEnc += cell.oldEncMs; aggNewEnc += cell.newEncMs;
            aggOldDec += cell.oldDecMs; aggNewDec += cell.newDecMs;
            aggOldBytes += cell.oldBytes; aggNewBytes += cell.newBytes;
        }
        levelsOut[String(level)] = {
            corpora: corporaOut,
            oldEncMs: aggOldEnc, newEncMs: aggNewEnc, deltaEncPct: pct(aggOldEnc, aggNewEnc),
            oldDecMs: aggOldDec, newDecMs: aggNewDec, deltaDecPct: pct(aggOldDec, aggNewDec),
            oldBytes: aggOldBytes, newBytes: aggNewBytes, deltaBytesPct: pct(aggOldBytes, aggNewBytes),
        };
    }

    return {
        codec,
        host: hostInfo(),
        baseline: options.baseline || null,
        interleave,
        lz4Mode: codec === 'lz4' ? lz4Mode : null,
        generatedAt: new Date().toISOString(),
        levels: levelsOut,
    };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseLevels(spec) {
    if (spec.includes(',')) return spec.split(',').map(s => parseInt(s.trim(), 10));
    if (spec.includes('-')) {
        const [a, b] = spec.split('-').map(s => parseInt(s.trim(), 10));
        const out = [];
        for (let l = a; l <= b; ++l) out.push(l);
        return out;
    }
    return [parseInt(spec, 10)];
}

function parseArgv(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; ++i) {
        const a = argv[i];
        switch (a) {
            case '--codec':         opts.codec = argv[++i]; break;
            case '--baseline':      opts.baseline = argv[++i]; break;
            case '--levels':        opts.levels = parseLevels(argv[++i]); break;
            case '--reps':          opts.reps = parseInt(argv[++i], 10); break;
            case '--warmup':        opts.warmup = parseInt(argv[++i], 10); break;
            case '--no-interleave': opts.interleave = false; break;
            case '--corpora':       opts.corpora = argv[++i].split(',').map(s => s.trim()).filter(Boolean); break;
            case '--json':          opts.jsonOut = argv[++i]; break;
            case '--lz4-mode':      opts.lz4Mode = argv[++i]; break;
            default: break; // unrecognized flags are ignored by this dev harness
        }
    }
    return opts;
}

function fmtNum(n) {
    return Number(n).toFixed(3);
}

function formatMarkdown(result) {
    const lines = [];
    lines.push('# codec-levels — ' + result.codec + (result.lz4Mode ? ' mode=' + result.lz4Mode : '') + (result.baseline ? ' (baseline ' + result.baseline + ')' : ' (live vs live)'));
    lines.push('');
    lines.push('## Aggregates');
    lines.push('');
    lines.push('| Level | Old encMs | New encMs | Δenc % | Old decMs | New decMs | Δdec % | Old B | New B | Δbytes % |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const levelKey of Object.keys(result.levels)) {
        const lvl = result.levels[levelKey];
        lines.push('| ' + levelKey + ' | ' + fmtNum(lvl.oldEncMs) + ' | ' + fmtNum(lvl.newEncMs) + ' | ' + fmtNum(lvl.deltaEncPct) +
            ' | ' + fmtNum(lvl.oldDecMs) + ' | ' + fmtNum(lvl.newDecMs) + ' | ' + fmtNum(lvl.deltaDecPct) +
            ' | ' + lvl.oldBytes + ' | ' + lvl.newBytes + ' | ' + fmtNum(lvl.deltaBytesPct) + ' |');
    }
    lines.push('');
    lines.push('## Cells');
    lines.push('');
    lines.push('| Level | Corpus | Old encMs | New encMs | Δenc % | Old decMs | New decMs | Δdec % | Old B | New B | Δbytes % | Oracle |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const levelKey of Object.keys(result.levels)) {
        const lvl = result.levels[levelKey];
        for (const corpusName of Object.keys(lvl.corpora)) {
            const c = lvl.corpora[corpusName];
            lines.push('| ' + levelKey + ' | ' + corpusName + ' | ' + fmtNum(c.oldEncMs) + ' | ' + fmtNum(c.newEncMs) + ' | ' + fmtNum(c.deltaEncPct) +
                ' | ' + fmtNum(c.oldDecMs) + ' | ' + fmtNum(c.newDecMs) + ' | ' + fmtNum(c.deltaDecPct) +
                ' | ' + c.oldBytes + ' | ' + c.newBytes + ' | ' + fmtNum(c.deltaBytesPct) + ' | ' + c.oracle + ' |');
        }
    }
    return lines.join('\n');
}

async function main() {
    const opts = parseArgv(process.argv.slice(2));
    try {
        const result = await runBench(opts);
        if (opts.jsonOut) fs.writeFileSync(opts.jsonOut, JSON.stringify(result, null, 2));
        console.log(formatMarkdown(result));
    } catch (err) {
        console.error(err && err.stack ? err.stack : String(err));
    }
}

// The harness measures; the gate is read by the consuming task — exit 0 always.
if (import.meta.main) {
    main().then(() => process.exit(0));
}
