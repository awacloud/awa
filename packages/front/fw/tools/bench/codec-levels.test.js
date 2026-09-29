// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { runBench } from './codec-levels.js';

// ── shape assertions ─────────────────────────────────────────────────────────

function assertHost(result) {
    expect(typeof result).toBe('object');
    expect(result.host).toBeDefined();
    expect(typeof result.host.platform).toBe('string');
    expect(typeof result.host.arch).toBe('string');
    expect(typeof result.host.cpuModel).toBe('string');
    expect(typeof result.host.bunVersion).toBe('string');
    expect(result.baseline).toBeNull();
    expect(typeof result.generatedAt).toBe('string');
}

function assertCodecCell(codec, c) {
    expect(Number.isFinite(c.deltaEncPct)).toBe(true);
    expect(Number.isFinite(c.deltaDecPct)).toBe(true);
    expect(c.deltaBytesPct).toBe(0);
    expect(c.oldBytes).toBe(c.newBytes);
    expect(c.oldBytes).toBeGreaterThan(0);
    if (codec === 'lz4') expect(c.oracle).toBeNull();
    else expect(c.oracle).toBe(true);
}

function assertLeveledShape(result, codec, corporaNames) {
    expect(result.codec).toBe(codec);
    assertHost(result);
    const levelKey = codec === 'lz4' ? '-' : '1';
    expect(Object.keys(result.levels)).toEqual([levelKey]);
    const lvl = result.levels[levelKey];
    expect(Object.keys(lvl.corpora).sort()).toEqual(corporaNames.slice().sort());
    for (const name of corporaNames) assertCodecCell(codec, lvl.corpora[name]);
    expect(Number.isFinite(lvl.deltaEncPct)).toBe(true);
    expect(Number.isFinite(lvl.deltaDecPct)).toBe(true);
    expect(lvl.deltaBytesPct).toBe(0);
}

// ── deflate / lz4 — documented shape, no baseline ───────────────────────────

describe('codec-levels bench harness — deflate / lz4 shape', () => {
    for (const codec of ['deflate', 'lz4']) {
        test(`runBench(${codec}) returns the documented JSON shape, no baseline`, async () => {
            const result = await runBench({ codec, levels: [1], reps: 1, warmup: 0, corpora: ['repeat', 'small'] });
            assertLeveledShape(result, codec, ['repeat', 'small']);
        });

        test(`runBench(${codec}) --no-interleave gives the same shape`, async () => {
            const result = await runBench({
                codec, levels: [1], reps: 1, warmup: 0, corpora: ['repeat', 'small'], interleave: false,
            });
            assertLeveledShape(result, codec, ['repeat', 'small']);
            expect(result.interleave).toBe(false);
        });
    }
});

// ── brotli — documented shape (plan's literal scenario) ────────────────────
//
// The brotli DECODER defect that previously forced this suite onto the
// 'repeat' corpus alone was fixed inside this batch (owner ruling,
// `ai/batches/types/fw/BATCH_34/_RULING_20260924_brotli-decoder.md` +
// `_FIX-brotli-decoder-report.md` — `brotli.js` amended for the decoder fix
// only, never by this task). `repeat` and `small` now round-trip cleanly,
// restoring the plan's literal test scenario. `random` is NOT exercised
// here: it still hits the separate `huffman.buildTree` frequency-ceiling
// defect (BL-1110, out of this task's perimeter, folded into task 03 —
// see `01-report.md`), independent of the decoder fix.

describe('codec-levels bench harness — brotli shape', () => {
    test('runBench(brotli) returns the documented JSON shape, no baseline', async () => {
        const result = await runBench({ codec: 'brotli', levels: [1], reps: 1, warmup: 0, corpora: ['repeat', 'small'] });
        assertLeveledShape(result, 'brotli', ['repeat', 'small']);
    });

    test('runBench(brotli) --no-interleave gives the same shape', async () => {
        const result = await runBench({
            codec: 'brotli', levels: [1], reps: 1, warmup: 0, corpora: ['repeat', 'small'], interleave: false,
        });
        assertLeveledShape(result, 'brotli', ['repeat', 'small']);
        expect(result.interleave).toBe(false);
    });
});

// ── micro — documented shape, no baseline ───────────────────────────────────

describe('codec-levels bench harness — micro shape', () => {
    function assertMicroShape(result, corporaNames, interleaveExpected) {
        expect(result.codec).toBe('micro');
        assertHost(result);
        expect(result.interleave).toBe(interleaveExpected);
        expect(Object.keys(result.levels)).toEqual(['-']);
        const lvl = result.levels['-'];
        for (const name of corporaNames) {
            const c = lvl.corpora[name];
            expect(c).toBeDefined();
            expect(Number.isFinite(c.deltaEncPct)).toBe(true);
            expect(Number.isFinite(c.deltaDecPct)).toBe(true);
            expect(c.deltaBytesPct).toBe(0);
            expect(c.oldBytes).toBe(0);
            expect(c.newBytes).toBe(0);
            expect(c.oracle).toBeNull();

            const tree = lvl.corpora[name + ':buildTree'];
            expect(tree).toBeDefined();
            expect(Number.isFinite(tree.deltaEncPct)).toBe(true);
            expect(tree.oracle).toBeNull();
        }
        expect(lvl.corpora['bitstream.rw']).toBeDefined();
        expect(lvl.corpora['bitstream.rw'].oracle).toBeNull();
        expect(Number.isFinite(lvl.deltaEncPct)).toBe(true);
        expect(lvl.deltaBytesPct).toBe(0);
    }

    test('runBench(micro) returns the documented JSON shape, no baseline', async () => {
        const result = await runBench({ codec: 'micro', reps: 1, warmup: 0, corpora: ['repeat', 'small'] });
        assertMicroShape(result, ['repeat', 'small'], true);
    });

    test('runBench(micro) --no-interleave gives the same shape', async () => {
        const result = await runBench({ codec: 'micro', reps: 1, warmup: 0, corpora: ['repeat', 'small'], interleave: false });
        assertMicroShape(result, ['repeat', 'small'], false);
    });
});

// ── oracle pin ───────────────────────────────────────────────────────────────

describe('codec-levels bench harness — oracle pin', () => {
    test('node:zlib brotli functions exist and Bun raw-deflate round-trips', () => {
        expect(typeof zlib.brotliCompressSync).toBe('function');
        expect(typeof zlib.brotliDecompressSync).toBe('function');

        const u8 = new Uint8Array([1, 2, 3]);
        const RAW = { windowBits: -15 };
        const back = Bun.inflateSync(Bun.deflateSync(u8, RAW), RAW);
        expect(Array.from(back)).toEqual(Array.from(u8));
    });
});

// ── lz4 modes (--lz4-mode speed|ratio) ──────────────────────────────────────

describe('codec-levels bench harness — lz4 modes', () => {
    test('lz4Mode defaults to speed and is echoed; other codecs echo null', async () => {
        const lz4Result = await runBench({ codec: 'lz4', reps: 1, warmup: 0, corpora: ['repeat'] });
        expect(lz4Result.lz4Mode).toBe('speed');
        const deflateResult = await runBench({ codec: 'deflate', levels: [1], reps: 1, warmup: 0, corpora: ['repeat'] });
        expect(deflateResult.lz4Mode).toBeNull();
    });

    test('speed and ratio each give an A/A live run with the byte count of that mode', async () => {
        const { lz4 } = await import('../../src/io/compress/lz4.js');
        const { buildCorpus } = await import('./_corpora.js');
        const codec = lz4.factory();
        const slices = buildCorpus('small');
        for (const mode of ['speed', 'ratio']) {
            const result = await runBench({ codec: 'lz4', reps: 1, warmup: 0, corpora: ['small'], lz4Mode: mode });
            expect(result.lz4Mode).toBe(mode);
            const cell = result.levels['-'].corpora.small;
            expect(cell.oldBytes).toBe(cell.newBytes);
            let expected = 0;
            for (const x of slices) expected += codec.compress(x, x.length, { mode })[1].length;
            expect(cell.newBytes).toBe(expected);
        }
    });

    test('an unknown lz4 mode is rejected', async () => {
        await expect(runBench({ codec: 'lz4', reps: 1, warmup: 0, corpora: ['repeat'], lz4Mode: 'turbo' })).rejects.toThrow("'turbo'");
    });

    test('the CLI flag --lz4-mode reaches the JSON output', () => {
        const out = path.join(os.tmpdir(), 'codec-levels-lz4-mode-' + process.pid + '.json');
        const res = Bun.spawnSync(['bun', path.join(import.meta.dir, 'codec-levels.js'),
            '--codec', 'lz4', '--reps', '1', '--warmup', '0', '--corpora', 'repeat', '--lz4-mode', 'ratio', '--json', out]);
        expect(res.exitCode).toBe(0);
        const json = JSON.parse(fs.readFileSync(out, 'utf8'));
        fs.rmSync(out, { force: true });
        expect(json.lz4Mode).toBe('ratio');
        expect(json.levels['-'].corpora.repeat.newBytes).toBeGreaterThan(0);
    });
});
