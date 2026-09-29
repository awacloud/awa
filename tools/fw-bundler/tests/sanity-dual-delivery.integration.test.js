// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/sanity-dual-delivery.integration.test.js
//
// buildSanity() — R1b dual-delivery recipe (ai/plans/fw-sanity/spikes/
// w0-module-mode/FINDINGS.md, "frozen outputs" §2): the ESM sanity tiers
// (base, community) yield self-applying classic-<script> artifacts, and the
// --no-sanity-log patch is anchored + single-match-asserted. Driven through
// the real bundle pipeline (parseArgs + runBundle — the same functions
// `runCli` wraps; bundle.integration.test.js already treats this as "the
// real CLI path") over the bundler's own tests/__fixtures__/mini-fw fixture,
// mirroring the W0 spike probe
// (ai/plans/fw-sanity/spikes/w0-module-mode/b-classic-delivery.probe.mjs).
//
// No golden byte-compare here: tests/__fixtures__/golden/ captures ONLY
// `--no-sanity` preset builds (grep-verified — no `sanity` artifact appears
// in MANIFEST.json or any committed *.min.js there), so the sanity build
// path has no existing golden to regenerate. Recorded, not silently skipped
// — see 04-report.md.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs, runBundle } from '../src/bundle/index.js';

const MINI_FW = join(import.meta.dir, '__fixtures__', 'mini-fw');
const TMP = join(import.meta.dir, 'tmp', 'sanity-dual-delivery');

const TIERS = ['base', 'community'];
const EXPORT_RE = /(^|[;}\s])export\s*[{*]/;
const IMPORT_RE = /(^|[;}\s])import\s*[{*'"]/;
const SELF_APPLIES_RE = /\w+\(\);?\s*$/;

function cloneFixture(name) {
    const dir = join(TMP, name);
    rmSync(dir, { recursive: true, force: true });
    cpSync(MINI_FW, dir, { recursive: true });
    return dir;
}

function outDir(fixtureDir) {
    return join(fixtureDir, 'dist', 'build');
}

// Reset TMP synchronously, BEFORE any describe body runs: `describe()`
// callbacks execute top-to-bottom during module evaluation (test
// registration), ahead of any `beforeAll` hook execution — a top-level
// `beforeAll` here would wipe the fixtures the describe bodies below clone
// eagerly (see `cloneFixture('log')` / `cloneFixture('nolog')`).
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
});

describe('buildSanity — R1b recipe, default (log) build', () => {
    const fixture = cloneFixture('log');
    let out;

    beforeAll(async () => {
        const results = await runBundle(parseArgs(['--sanity-only', '--pkg', fixture]));
        expect(results.length).toBe(1);
        out = outDir(fixture);
    });

    for (const tier of TIERS) {
        test(`sanity-${tier}-classic.min.js has no import/export and self-applies`, () => {
            const src = readFileSync(join(out, `sanity-${tier}-classic.min.js`), 'utf8');
            expect(EXPORT_RE.test(src)).toBe(false);
            expect(IMPORT_RE.test(src)).toBe(false);
            expect(SELF_APPLIES_RE.test(src.trim())).toBe(true);
        });

        test(`sanity-${tier}-classic.min.js ships the [SECURITY] literal (log build)`, () => {
            const src = readFileSync(join(out, `sanity-${tier}-classic.min.js`), 'utf8');
            expect(src.includes('[SECURITY]')).toBe(true);
        });
    }

    test('sanity.min.js alias is byte-identical to sanity-base-classic.min.js', () => {
        const alias = readFileSync(join(out, 'sanity.min.js'));
        const base = readFileSync(join(out, 'sanity-base-classic.min.js'));
        expect(Buffer.compare(alias, base)).toBe(0);
    });
});

describe('buildSanity — R1b recipe, --no-sanity-log build', () => {
    const fixture = cloneFixture('nolog');
    let out;

    beforeAll(async () => {
        const results = await runBundle(parseArgs(['--sanity-only', '--no-sanity-log', '--pkg', fixture]));
        expect(results.length).toBe(1);
        out = outDir(fixture);
    });

    for (const tier of TIERS) {
        test(`sanity-${tier}-classic.min.js has no import/export and self-applies (nolog)`, () => {
            const src = readFileSync(join(out, `sanity-${tier}-classic.min.js`), 'utf8');
            expect(EXPORT_RE.test(src)).toBe(false);
            expect(IMPORT_RE.test(src)).toBe(false);
            expect(SELF_APPLIES_RE.test(src.trim())).toBe(true);
        });

        test(`sanity-${tier}-classic.min.js ships ZERO [SECURITY] literals (nolog build, DCE-folded)`, () => {
            const src = readFileSync(join(out, `sanity-${tier}-classic.min.js`), 'utf8');
            expect(src.includes('[SECURITY]')).toBe(false);
        });
    }
});

describe('--no-sanity-log — exactly-one-match enforcement (FINDINGS §c.2 measured trap)', () => {
    test('clean fixture (single declaration per tier) — build succeeds', async () => {
        const fixture = cloneFixture('nolog-clean-check');
        const results = await runBundle(parseArgs(['--sanity-only', '--no-sanity-log', '--pkg', fixture]));
        expect(results.length).toBe(1);
    });

    test('declaration duplicated in a doc string — build fails loudly, names the tier + count', async () => {
        const fixture = cloneFixture('nolog-duplicate');
        const basePath = join(fixture, 'src', 'sanity', 'base.js');
        const original = readFileSync(basePath, 'utf8');
        // Reproduces the FINDINGS §c.2 measured trap: a doc/template string
        // that merely SPELLS OUT the declaration text on its own line is, to a
        // naive text scan, indistinguishable from the real declaration.
        const duplicated = original.replace(
            'const LOG_ATTEMPTS = true;',
            'const DOC = `\nconst LOG_ATTEMPTS = true;\n`;\nconst LOG_ATTEMPTS = true;',
        );
        expect(duplicated).not.toBe(original);
        writeFileSync(basePath, duplicated);

        await expect(
            runBundle(parseArgs(['--sanity-only', '--no-sanity-log', '--pkg', fixture])),
        ).rejects.toThrow(/base\.js, found 2/);
    });

    test('declaration absent — build fails loudly, names the tier + count', async () => {
        const fixture = cloneFixture('nolog-absent');
        const basePath = join(fixture, 'src', 'sanity', 'base.js');
        const original = readFileSync(basePath, 'utf8');
        const stripped = original.replace('const LOG_ATTEMPTS = true;', 'const LOG_ATTEMPTS_RENAMED = true;');
        expect(stripped).not.toBe(original);
        writeFileSync(basePath, stripped);

        await expect(
            runBundle(parseArgs(['--sanity-only', '--no-sanity-log', '--pkg', fixture])),
        ).rejects.toThrow(/base\.js, found 0/);
    });
});
