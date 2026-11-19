// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview What the published tarball contains.
 *
 * The file set comes from `npm pack --dry-run --json` (no network, no
 * write), the same listing a publication produces: a file present in the
 * working tree is not thereby shipped (npm adds `package.json`, `README` and
 * `LICENSE` by itself, never `NOTICE`). The tarball must carry the notice
 * files, must not carry the repo-only material, and its text files must not
 * cite the monorepo's internal records (batch ids, backlog ids, `ai/` paths),
 * which mean nothing to a reader of the package.
 *
 * A missing `npm` is a failure naming the cause, not a skip.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PKG = join(import.meta.dir, '..');

/** @returns {string[]} The tarball's file paths. */
function packedFiles() {
    const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: PKG, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
    });
    if (res.error || res.status !== 0) {
        throw new Error(`npm pack --dry-run failed (is npm installed?): ${res.error || res.stderr}`);
    }
    const out = res.stdout.slice(res.stdout.indexOf('['));
    return JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, '/'));
}

/**
 * Internal references: batch and backlog ids, and the monorepo's `ai/` records;
 * and the process vocabulary of how the package was built — task numbers,
 * "this batch" / "batch report", spike `FINDINGS` and `spikes/` paths (spikes
 * do not ship), wave (`W2`) and gate (`G1`) ids. None of them means anything
 * to a reader of the package.
 */
const INTERNAL = new RegExp([
    String.raw`\b[A-Za-z-]+\/BATCH_\d+|\bBATCH_\d+|\bLIGHT_\d+|\bBL-\d+`,
    String.raw`\bai\/(?:plans|batches|memory|archives|conventions|program|roadmap|extra|sessions|BACKLOG)\b`,
    String.raw`\b[Tt]asks?\s+\d+\b`,
    String.raw`\b(?:[Tt]his|[Tt]he|[Ss]ame|[Ss]ibling)\s+batch\b|\bbatch(?:'s|\s+report)\b`,
    String.raw`\bFINDINGS\b|\bspikes\/`,
    String.raw`(?<![\w#\/.-])[WG]\d(?![\w])`,
].join('|'), 'g');
const TEXT = /\.(js|mjs|ts|md|html|json|css|txt)$|(^|\/)(NOTICE|LICENSE|README)$/;

describe('the published tarball', () => {
    const files = packedFiles();

    test('ships the licence and notice files', () => {
        for (const f of ['package.json', 'README.md', 'LICENSE', 'NOTICE']) expect(files).toContain(f);
    });

    test('does not ship the repo-only material', () => {
        expect(files).not.toContain('TODO.md');
        expect(files).not.toContain('demos/GAPS.md');
        expect(files.filter((f) => f.startsWith('src/perf/'))).toEqual([]);
        expect(files.filter((f) => /\.test\.js$|^tests\/|^spikes\//.test(f))).toEqual([]);
    });

    test('ships the demos and playground (owner ruling: standalone dev-portal serve)', () => {
        expect(files.some((f) => f.startsWith('demos/'))).toBe(true);
        expect(files.some((f) => f.startsWith('playground/'))).toBe(true);
    });

    test('no shipped text file cites an internal record', () => {
        const hits = [];
        for (const f of files.filter((p) => TEXT.test(p))) {
            const lines = readFileSync(join(PKG, f), 'utf8').split('\n');
            lines.forEach((line, i) => {
                for (const m of line.matchAll(INTERNAL)) hits.push(`${f}:${i + 1} ${m[0]}`);
            });
        }
        expect(hits).toEqual([]);
    });
});
