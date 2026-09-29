// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps.integration.test.js
//
// The `deps` one-shot injector. Running it against fw is now a no-op (fw is
// fully deps-populated), so equivalence is proved on a FIXTURE package with a
// module missing its `deps` field. The injected `deps: [...]` + sibling imports
// are compared SEMANTICALLY (normalized), since insertion offsets vary.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { scanAll } from '@awacloud/tool-fw-bundler/modlib';
import { planDeps, runDeps, runCli as depsCli } from '../src/deps/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__', 'deps-src');
const TMP = join(import.meta.dir, '__tmp_deps__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

/** Copy the pristine fixture to a fresh temp package the injector may mutate. */
function freshFixture() {
    cleanTmp();
    mkdirSync(TMP, { recursive: true });
    const pkg = join(TMP, 'pkg');
    cpSync(FIX, pkg, { recursive: true });
    return pkg;
}

function runCli(args) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

/**
 * Normalize an injected module source into a comparable shape:
 * the set of `{ binding: from }` imports plus the ordered `deps: [...]` names.
 */
function normalize(src) {
    const imports = {};
    const importRe = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(src)) !== null) {
        for (const b of m[1].split(',')) imports[b.trim().split(/\s+as\s+/)[0]] = m[2];
    }
    const depsM = src.match(/(^|[\s,{])deps\s*:\s*\[([^\]]*)\]/);
    const deps = depsM
        ? depsM[2].split(',').map((s) => s.trim()).filter(Boolean)
        : null;
    return { imports, deps };
}

let pkg;
beforeEach(() => { pkg = freshFixture(); });

describe('deps — semantic equivalence of injected deps[] + imports', () => {
    test('gamma starts WITHOUT a deps field (fixture precondition)', () => {
        const { byName } = scanAll(join(pkg, 'src'));
        expect(byName.get('gamma').hasDepsField).toBe(false);
        expect(byName.get('gamma').dependencies).toEqual(['alpha']);
    });

    test('planDeps proposes exactly one edit (gamma) with the expected import', () => {
        const { plan } = planDeps({ pkg });
        expect(plan.length).toBe(1);
        expect(plan[0].info.moduleName).toBe('gamma');
        expect(plan[0].addedImports).toEqual(["import { alpha } from './alpha.js';"]);
    });

    test('runDeps injects a normalized-equivalent import + deps: [alpha]', () => {
        runDeps({ pkg });
        const gamma = readFileSync(join(pkg, 'src', 'mod', 'gamma.js'), 'utf8');
        const norm = normalize(gamma);
        // Semantic (normalized) equivalence — offsets/whitespace irrelevant.
        expect(norm.imports).toEqual({ alpha: './alpha.js' });
        expect(norm.deps).toEqual(['alpha']);

        // The injected source is still parseable back to the same dependency contract.
        const { byName } = scanAll(join(pkg, 'src'));
        expect(byName.get('gamma').hasDepsField).toBe(true);
        expect(byName.get('gamma').depNames).toEqual(['alpha']);
    });

    test('idempotence: a second injection is a no-op', () => {
        runDeps({ pkg });
        const after1 = readFileSync(join(pkg, 'src', 'mod', 'gamma.js'), 'utf8');
        const { plan } = planDeps({ pkg });
        expect(plan.length).toBe(0);
        runDeps({ pkg });
        const after2 = readFileSync(join(pkg, 'src', 'mod', 'gamma.js'), 'utf8');
        expect(after2).toBe(after1);
    });
});

describe('deps — --check agrees with the injector state', () => {
    test('--check before injection fails (exit 1, names the missing module)', () => {
        const r = runCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('gamma');
    });

    test('--dry-run reports the plan but writes nothing (exit 0)', () => {
        const before = readFileSync(join(pkg, 'src', 'mod', 'gamma.js'), 'utf8');
        const r = runCli(['deps', '--pkg', pkg, '--dry-run']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('gamma');
        expect(readFileSync(join(pkg, 'src', 'mod', 'gamma.js'), 'utf8')).toBe(before);
    });

    test('--check after injection passes (exit 0)', () => {
        runDeps({ pkg });
        const r = runCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('OK');
    });
});

describe('deps — runCli branches (in-process)', () => {
    test('--help → 0; unknown flag → 2', () => {
        expect(depsCli(['--help'])).toBe(0);
        expect(depsCli(['--bogus'])).toBe(2);
    });

    test('--check → 1 (missing), apply → 0, --check → 0, --dry-run → 0', () => {
        expect(depsCli(['--pkg', pkg, '--check'])).toBe(1);
        expect(depsCli(['--pkg', pkg])).toBe(0);
        expect(depsCli(['--pkg', pkg, '--check'])).toBe(0);
        expect(depsCli(['--pkg', pkg, '--dry-run'])).toBe(0);
    });

    test('--src overrides --pkg for the scan root', () => {
        expect(depsCli(['--src', join(pkg, 'src'), '--check'])).toBe(1);
    });
});
