// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — proves fw/no-factory-capture is wired NON-VACUOUSLY.
 *
 * BATCH_2 root cause: the fw flat config scopes the rule to fw's own
 * `src/**\/\*.js`, so running eslint over graphic files produced exit 0 even
 * though 12 real capture errors existed (the rule never ran). This test guards
 * against that regression by:
 *
 *   1. Writing a temp fixture that deliberately captures a module-scope binding
 *      inside a factory (the exact anti-pattern the rule must catch).
 *   2. Running ESLint over the fixture using THIS package's eslint.config.js.
 *   3. Asserting the run exits non-zero AND the output contains the
 *      fw/no-factory-capture rule id — proving the rule actually ran and fired.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');

// Per-run-unique fixture directory placed under src/ so it matches the
// 'src/**/*.js' files glob in eslint.config.js. mkdtempSync (rather than a
// fixed '_lint_fixture_tmp' name) avoids a collision when this suite runs
// concurrently with itself against the same worktree (e.g. two overlapping
// `bun test` invocations) — a shared fixed name lets one run's afterAll
// rmSync race the other run's still-in-flight eslint spawn.
const FIXTURE_DIR  = mkdtempSync(join(PACKAGE_ROOT, 'src', '_lint_fixture_'));
const FIXTURE_FILE = join(FIXTURE_DIR, 'capturing-factory.js');

// A module descriptor whose factory closes over a module-scope import binding.
// This is the exact anti-pattern fw/no-factory-capture must catch.
const CAPTURING_FIXTURE = `
// Deliberate capture — module-scope binding referenced inside factory.
const CAPTURED_CONSTANT = { foo: 'bar' };

export const badModule = {
    name: 'bad.module',
    dependencies: [],
    deps: [],
    factory() {
        // VIOLATION: CAPTURED_CONSTANT is a module-scope binding, not a dep param.
        return CAPTURED_CONSTANT;
    },
};
`.trimStart();

// Write the fixture file into the freshly minted unique directory.
writeFileSync(FIXTURE_FILE, CAPTURING_FIXTURE, 'utf8');

// Clean up after the suite.
afterAll(() => {
    try { rmSync(FIXTURE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('fw/no-factory-capture wiring (non-vacuous)', () => {
    test('eslint exits non-zero when a factory captures a module-scope binding', () => {
        // Run ESLint from the package root so it picks up eslint.config.js.
        // --no-warn-ignored: suppress warnings about files excluded by ignores
        //   (our fixture is under src/ so it is included, not ignored).
        // We lint ONLY the fixture to keep the run fast.
        const result = spawnSync(
            'bunx',
            ['eslint', '--no-warn-ignored', FIXTURE_FILE],
            {
                cwd: PACKAGE_ROOT,
                encoding: 'utf8',
                // Windows: shell needed for bunx
                shell: process.platform === 'win32',
            },
        );

        // ESLint exits non-zero when errors are found.
        expect(result.status).not.toBe(0);
    });

    test('eslint output mentions fw/no-factory-capture for the capturing fixture', () => {
        const result = spawnSync(
            'bunx',
            ['eslint', '--no-warn-ignored', FIXTURE_FILE],
            {
                cwd: PACKAGE_ROOT,
                encoding: 'utf8',
                shell: process.platform === 'win32',
            },
        );

        const output = (result.stdout ?? '') + (result.stderr ?? '');
        // The rule id appears in ESLint's output as "fw/no-factory-capture".
        expect(output).toContain('fw/no-factory-capture');
    });

    test('eslint output mentions the captured binding name (CAPTURED_CONSTANT)', () => {
        const result = spawnSync(
            'bunx',
            ['eslint', '--no-warn-ignored', FIXTURE_FILE],
            {
                cwd: PACKAGE_ROOT,
                encoding: 'utf8',
                shell: process.platform === 'win32',
            },
        );

        const output = (result.stdout ?? '') + (result.stderr ?? '');
        expect(output).toContain('CAPTURED_CONSTANT');
    });
});
