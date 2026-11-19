// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// `perf.js`: the maths that turn per-process medians into verdicts (spread,
// thresholds, the A/A calibration, the gate), the tree resolution, and one
// small end-to-end run of each command on a cheap cell.

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spread, summarizeRun, compareRows, calibrationFrom, comparePasses, resolveSrc, parseArgs } from './perf.js';
import { median, runCell } from './perf-cell.js';

const row = (c, engine, medianMs, extra = {}) => ({ case: c, engine, medianMs, check: { parity: true }, ...extra });
const sided = (side, medians, extra = {}) => medians.map((m, proc) => row('x', 'fw', m, { side, proc, ...extra }));

describe('perf maths', () => {
    test('median and spread', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(spread([10, 11, 12])).toBeCloseTo(2 / 11, 12);
        expect(spread([5])).toBeNull();
    });

    test('summarizeRun: median of medians, spread, ratio to the oracle, parity, errors', () => {
        const s = summarizeRun([
            row('c', 'fw', 10), row('c', 'fw', 12), row('c', 'fw', 11),
            row('c', 'oracle', 1, { check: {} }), row('c', 'oracle', 1, { check: {} }),
            row('d', 'fw', 5, { check: { parity: false } }),
            { case: 'e', engine: 'fw', error: 'boom\nstack' },
        ]);
        expect(s.c.fw).toMatchObject({ medianMs: 11, procs: 3, parity: true, vsOracle: 11 });
        expect(s.c.fw.spread).toBeCloseTo(2 / 11, 12);
        expect(s.d.fw.parity).toBe(false);
        expect(s.e.fw.errors).toEqual(['boom']);
        expect(s.e.fw.medianMs).toBeNull();
    });

    test('compareRows: the threshold is the largest of floor, calibration and both spreads', () => {
        const rows = [...sided('base', [100, 101, 102]), ...sided('head', [90, 91, 92])];
        const c = compareRows(rows, { floor: 0.03 })['x|fw'];
        expect(c.delta).toBeCloseTo(91 / 101 - 1, 12);
        expect(c.threshold).toBeCloseTo(0.03, 12);
        expect(c.verdict).toBe('faster');
        expect(compareRows(rows, { floor: 0.03, calibration: { 'x|fw': 0.2 } })['x|fw'].verdict).toBe('within noise');
        const noisy = [...sided('base', [100, 140, 101]), ...sided('head', [110, 111, 112])];
        const n = compareRows(noisy, { floor: 0.03 })['x|fw'];
        expect(n.threshold).toBeCloseTo(40 / 101, 12);
        expect(n.verdict).toBe('within noise');
    });

    test('compareRows: slower, parity failure and errors fail the gate', () => {
        const slower = compareRows([...sided('base', [100, 100, 100]), ...sided('head', [120, 120, 120])]);
        expect(slower['x|fw'].verdict).toBe('slower');
        expect(comparePasses(slower)).toBe(false);
        const parity = compareRows([...sided('base', [100, 100]), ...sided('head', [100, 100], { check: { parity: false } })]);
        expect(parity['x|fw'].verdict).toBe('parity-fail');
        const err = compareRows([...sided('base', [100]), { case: 'x', engine: 'fw', side: 'head', error: 'crash' }]);
        expect(err['x|fw'].verdict).toBe('error');
        expect(comparePasses(err)).toBe(false);
        expect(comparePasses(compareRows([...sided('base', [100, 100]), ...sided('head', [101, 101])]))).toBe(true);
    });

    test('calibrationFrom keeps each cell\'s largest A/A drift', () => {
        const aa = compareRows([...sided('base', [100, 104, 102]), ...sided('head', [101, 103, 102])]);
        const d = calibrationFrom(aa)['x|fw'];
        expect(d).toBeCloseTo(Math.max(Math.abs(102 / 102 - 1), 4 / 102, 2 / 102), 12);
    });

    test('parseArgs', () => {
        expect(parseArgs(['compare', '--base', 'HEAD~1', '--procs', '5'])).toEqual({ cmd: 'compare', base: 'HEAD~1', procs: '5' });
    });
});

describe('perf trees', () => {
    test('no spec is the working tree; a package dir maps to its src', () => {
        const w = resolveSrc(undefined);
        expect(fs.existsSync(path.join(w.src, 'core/runtime.js'))).toBe(true);
        expect(resolveSrc(path.join(w.src, '..')).src).toBe(w.src);
    });

    test('a git ref is materialised once under tmp/bench', () => {
        const a = resolveSrc('HEAD');
        expect(fs.existsSync(path.join(a.src, 'core/modules.js'))).toBe(true);
        expect(a.src).toContain(path.join('tmp', 'bench', 'src-'));
        expect(resolveSrc('HEAD').src).toBe(a.src);
    });

    test('anything else is an error', () => {
        expect(() => resolveSrc('no-such-ref-or-dir-xyz')).toThrow('neither an fw src directory nor a git revision');
    });
});

describe('perf end to end', () => {
    test('runCell in-process gives a median and a parity', async () => {
        const r = await runCell({ src: resolveSrc(undefined).src, case: 'hex-encode-1MiB', engine: 'fw', reps: 2, warmup: 1 });
        expect(r.medianMs).toBeGreaterThan(0);
        expect(r.check.parity).toBe(true);
        expect((await runCell({ src: resolveSrc(undefined).src, case: 'nope', engine: 'fw' })).error).toBe('unknown case or engine');
    });

    test('run, compare and calibrate write their evidence', () => {
        const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-perf-'));
        const tool = path.join(import.meta.dir, 'perf.js');
        const common = ['--only', '^crc32', '--procs', '2', '--reps', '2', '--warmup', '1', '--out', out];
        try {
            expect(spawnSync('bun', [tool, 'run', ...common], { encoding: 'utf8' }).status).toBe(0);
            expect(spawnSync('bun', [tool, 'calibrate', ...common], { encoding: 'utf8' }).status).toBe(0);
            const cal = JSON.parse(fs.readFileSync(path.join(out, 'calibration-bun.json'), 'utf8'));
            expect(Object.keys(cal.drift)).toEqual(['crc32-1MiB|fw']);
            // HEAD against HEAD: an A/A by construction, whatever the working
            // tree holds (an uncommitted crc32 change made it "faster").
            const cmp = spawnSync('bun', [tool, 'compare', '--base', 'HEAD', '--head', 'HEAD', '--calibration', path.join(out, 'calibration-bun.json'), '--floor', '50', ...common], { encoding: 'utf8' });
            expect(cmp.status).toBe(0);
            const res = JSON.parse(fs.readFileSync(path.join(out, 'compare-bun.json'), 'utf8'));
            expect(res.compared['crc32-1MiB|fw'].verdict).toBe('within noise');
            expect(fs.readFileSync(path.join(out, 'summary-bun.md'), 'utf8')).toContain('| crc32-1MiB | fw |');
            expect(spawnSync('bun', [tool, 'nope'], { encoding: 'utf8' }).status).toBe(2);
        } finally { fs.rmSync(out, { recursive: true, force: true }); }
    }, 120000);
});
