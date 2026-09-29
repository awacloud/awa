// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-content-drift.integration.test.js
//
// BL-5 — `--check` used to verify only that a `deps` field EXISTS
// (`hasDepsField`), never that its identifiers still resolve to what
// `dependencies` declares. A rename, a hand-edit, or a stale copy-paste
// leaves a `deps` array full of a wrong-but-still-real identifier and the
// old `--check` passed regardless.
//
// Red-probed on a `tmp/` COPY of a committed fixture — never a live package
// (measured separately: 0 drift across fw + every office/oconv/facturx
// consumer before this leg landed).

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { planDeps, runCli as depsCli } from '../src/deps/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__', 'deps-drift');
const TMP = join(import.meta.dir, '__tmp_content_drift__');
const DELTA = join(TMP, 'pkg', 'src', 'mod', 'delta.js');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

/** Copy the pristine (clean, non-drifted) fixture to a fresh temp package. */
function freshFixture() {
    cleanTmp();
    mkdirSync(TMP, { recursive: true });
    const pkg = join(TMP, 'pkg');
    cpSync(FIX, pkg, { recursive: true });
    return pkg;
}

/**
 * Doctor the tmp copy of delta.js: add a second, differently-named binding
 * for `alpha` and point `deps` at THAT instead — a real, bound identifier,
 * but the wrong one relative to `dependencies: ['alpha']`. This is the exact
 * shape a hand-edit/rename leaves behind.
 */
function introduceDrift() {
    const src = readFileSync(DELTA, 'utf8');
    const doctored = src
        .replace(
            "import { alpha } from './alpha.js';",
            "import { alpha } from './alpha.js';\nimport { alpha as stale } from './alpha.js';"
        )
        .replace('deps: [alpha]', 'deps: [stale]');
    writeFileSync(DELTA, doctored, 'utf8');
}

function runCli(args) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

let pkg;
beforeEach(() => { pkg = freshFixture(); });

describe('deps --check — content leg (BL-5)', () => {
    test('clean fixture: delta already matches, no drift reported', () => {
        const { contentDrift } = planDeps({ pkg });
        expect(contentDrift).toEqual([]);
    });

    test('clean fixture: --check exits 0', () => {
        const r = runCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('OK');
    });

    test('doctored fixture: planDeps reports the drift (expected vs found)', () => {
        introduceDrift();
        const { contentDrift } = planDeps({ pkg });
        expect(contentDrift).toEqual([
            expect.objectContaining({ moduleName: 'delta', expected: ['alpha'], found: ['stale'] }),
        ]);
    });

    test('doctored fixture: --check exits 1, naming the module and both arrays', () => {
        introduceDrift();
        const r = runCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('delta');
        expect(r.stderr).toContain('expected: [alpha]');
        expect(r.stderr).toContain('found:    [stale]');
    });

    test('doctored fixture: --dry-run is unaffected — exits 0, writes nothing (frozen G1 contract)', () => {
        introduceDrift();
        const before = readFileSync(DELTA, 'utf8');
        const r = runCli(['deps', '--pkg', pkg, '--dry-run']);
        expect(r.code).toBe(0);
        expect(readFileSync(DELTA, 'utf8')).toBe(before);
    });

    test('doctored fixture: apply (no flags) does not silently "fix" an already-populated module', () => {
        // rewriteFile short-circuits on `hasDepsField` — an already-populated
        // module is never touched, drifted or not. The doctored file is
        // therefore byte-identical after a plain apply: the content leg's
        // "Fix:" hint (manual correction) is the only path, not a flag.
        introduceDrift();
        const before = readFileSync(DELTA, 'utf8');
        const r = runCli(['deps', '--pkg', pkg]);
        expect(r.code).toBe(0);
        expect(readFileSync(DELTA, 'utf8')).toBe(before);
    });

    test('in-process runCli branches: check flips 0 → 1 → 0 across the doctor/repair cycle', () => {
        expect(depsCli(['--pkg', pkg, '--check'])).toBe(0);
        introduceDrift();
        expect(depsCli(['--pkg', pkg, '--check'])).toBe(1);
        // Repair by hand (what the "Fix:" hint asks for) restores green.
        writeFileSync(DELTA, readFileSync(join(FIX, 'src', 'mod', 'delta.js'), 'utf8'), 'utf8');
        expect(depsCli(['--pkg', pkg, '--check'])).toBe(0);
    });
});
