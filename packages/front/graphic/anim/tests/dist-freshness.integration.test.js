// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Determinism and freshness of the generated `dist/` — without
 * ever writing the tracked tree.
 *
 * The driver (`tools/generate-bundles.mjs`) accepts `--out <dir>`: every run
 * here writes into a fresh temp directory. Two properties are kept apart on
 * purpose (they used to be one "regenerate over dist and compare" check, which
 * silently repaired a stale `dist/` instead of reporting it):
 *
 *   - determinism: two runs give byte-identical trees (raw bytes, every file);
 *   - freshness: a run matches the committed `dist/` byte for byte, and a
 *     mismatch names the stale files. Refresh with `bun run gen:bundles`.
 *
 * The tracked `dist/` is hashed before and after both runs: it must not move.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const DIST = join(PKG, 'dist');
const SUBTREES = ['standalone', 'build'];

/**
 * Hash every file of `<root>/standalone` and `<root>/build`.
 * @param {string} root
 * @returns {Record<string, string>} relative path → md5
 */
function snapshot(root) {
    const out = {};
    for (const sub of SUBTREES) {
        const dir = join(root, sub);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
            const p = join(dir, f);
            if (statSync(p).isFile()) out[`${sub}/${f}`] = createHash('md5').update(readFileSync(p)).digest('hex');
        }
    }
    return out;
}

/**
 * Run the driver into `outDir`.
 * @param {string} outDir
 */
function generate(outDir) {
    return spawnSync('bun', ['run', 'tools/generate-bundles.mjs', '--out', outDir], { cwd: PKG, encoding: 'utf8' });
}

describe('generated dist — determinism and freshness, tracked tree untouched', () => {
    /** @type {string[]} */
    const temps = [];
    /** @type {Record<string, string>} */
    let trackedBefore;
    /** @type {Array<ReturnType<typeof generate>>} */
    const runs = [];

    beforeAll(() => {
        trackedBefore = snapshot(DIST);
        for (let i = 0; i < 2; i += 1) {
            const dir = mkdtempSync(join(tmpdir(), 'graphic-dist-'));
            temps.push(dir);
            runs.push(generate(dir));
        }
    });

    afterAll(() => {
        for (const d of temps) rmSync(d, { recursive: true, force: true });
    });

    test('both --out runs succeed and populate the temp directory', () => {
        for (const r of runs) expect(r.status).toBe(0);
        const first = snapshot(temps[0]);
        // Non-vacuity: the temp tree holds both subtrees.
        expect(Object.keys(first).some((k) => k.startsWith('standalone/'))).toBe(true);
        expect(Object.keys(first).some((k) => k.startsWith('build/'))).toBe(true);
    });

    test('the tracked dist/ is not written by the runs', () => {
        expect(snapshot(DIST)).toEqual(trackedBefore);
    });

    test('determinism: two runs are byte-identical, every file', () => {
        expect(snapshot(temps[1])).toEqual(snapshot(temps[0]));
    });

    test('freshness: the committed dist/ matches a fresh run (refresh: bun run gen:bundles)', () => {
        const fresh = snapshot(temps[0]);
        const committed = snapshot(DIST);
        const stale = Object.keys({ ...fresh, ...committed })
            .filter((k) => fresh[k] !== committed[k])
            .sort();
        expect(stale).toEqual([]);
    });
});
