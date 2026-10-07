// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/pack-surface.integration.test.js
//
// office/LIGHT_8 (BL-1907) — pins what the npm tarball of @awacloud/oconv
// ships, against the PUBLISHED artifact (`npm pack --dry-run --json
// --ignore-scripts`), never the working tree. Before LIGHT_8 `files[]`
// omitted `NOTICE`, and npm-packlist does not auto-include a root NOTICE, so
// the tarball (73 entries) shipped no notice at all — lot-2 readiness leg 4
// red. The package surface (LICENSE, NOTICE, README.md, CHANGELOG.md,
// package.json) is pinned literally; every licence text the NOTICE names by
// relative path must travel too; no test file nor the md→pdf
// `_test-runtime.js` scaffold may leak. Writes nothing (dry run, no tarball).
//
// packSurface() is the same spawn-and-parse helper as
// fonts/tests/pack-surface.integration.test.js (argv array, no shell). When
// `npm` is absent the tests are SKIPPED under a named reason — reported,
// never silently green.

import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const PKG_DIR = resolve(import.meta.dir, '..');
const NPM = Bun.which('npm');
const SKIP_REASON = 'npm not on PATH — pack surface not measured';

if (!NPM) console.warn(`[oconv pack-surface] SKIPPED: ${SKIP_REASON}`);

/** @typedef {{files: Array<{path: string}>}} NpmPackEntry */

/** @type {string[] | null} */
let cached = null;

/**
 * Spawn the real `npm pack --dry-run --json --ignore-scripts` against the
 * package directory once and return the computed tarball file-path list.
 *
 * @returns {string[]}
 */
function packSurface() {
    if (cached) return cached;
    const p = Bun.spawnSync(
        ['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'],
        { cwd: PKG_DIR, stdout: 'pipe', stderr: 'pipe' }
    );
    expect(p.exitCode).toBe(0);
    /** @type {NpmPackEntry[]} */
    const parsed = JSON.parse(p.stdout.toString());
    cached = parsed[0].files.map((f) => f.path);
    return cached;
}

/**
 * Relative paths of the licence texts the NOTICE names — the
 * "see the <path> file" and "licence text: <path>" forms used across the
 * office NOTICE files.
 *
 * @param {string} notice
 * @returns {string[]}
 */
function noticeLicencePaths(notice) {
    const paths = new Set();
    for (const m of notice.matchAll(/see the ([\w./-]+) file/gi)) paths.add(m[1]);
    for (const m of notice.matchAll(/licen[cs]e text:\s*([\w./-]+)/gi)) paths.add(m[1]);
    return [...paths];
}

describe.skipIf(!NPM)(`@awacloud/oconv pack surface (BL-1907)${NPM ? '' : ` — SKIPPED: ${SKIP_REASON}`}`, () => {
    test('ships the mandatory package surface, NOTICE included', () => {
        const files = packSurface();
        for (const f of ['LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'package.json', 'src/main.js']) {
            expect(files, `packed ${f}`).toContain(f);
        }
    });

    test('ships every licence text the NOTICE names by relative path', () => {
        const files = packSurface();
        const paths = noticeLicencePaths(readFileSync(resolve(PKG_DIR, 'NOTICE'), 'utf8'));
        expect(paths).toContain('LICENSE');
        for (const p of paths) expect(files, `NOTICE-named licence text ${p}`).toContain(p);
    });

    test('ships no test file and no _test-runtime.js scaffold', () => {
        const files = packSurface();
        expect(files.filter((f) => /\.test\.js$/.test(f))).toEqual([]);
        expect(files).not.toContain('src/write/pdf/_test-runtime.js');
        // BL-2111: the only tests/ members are the two Apache POI legal texts
        // the NOTICE points at (files[] Q1) - an exact set, no fixture payload.
        expect(files.filter((f) => f.startsWith('tests/')).sort()).toEqual([
            'tests/_fixtures/corpus/LICENSE-apache-2.0',
            'tests/_fixtures/corpus/NOTICE-apache-poi'
        ]);
    });

    test('non-vacuity control: the NOTICE pin fails against a listing without it', () => {
        const files = packSurface();
        const filtered = files.filter((f) => f !== 'NOTICE');
        expect(filtered.length).toBe(files.length - 1);
        expect(() => expect(filtered).toContain('NOTICE')).toThrow();
    });
});
