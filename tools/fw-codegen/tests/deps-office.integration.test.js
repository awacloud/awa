// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-office.integration.test.js
//
// The two office-blocking defects of `fw-codegen deps` (tools/LIGHT_9):
//   1. the scan embarked generated `src/bundles/prebuilt/**` bundles, whose
//      host-injected `dependencies` resolve nowhere → whole package aborted;
//   2. no cross-package fw-name resolution + abort-on-first-miss, so a
//      consumer package (office) could never be generated at all.
//
// Exercised on fixture packages — the real office trees are the single-writer
// perimeter of office/BATCH_9 and are never touched here.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { parseFile } from '@awacloud/tool-fw-bundler/modlib';
import { planDeps, runDeps, runCli as depsCli, filterScan, DEFAULT_IGNORE } from '../src/deps/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__');
const TMP = join(import.meta.dir, '__tmp_deps_office__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

/** Copy a pristine fixture to a fresh temp package the injector may mutate. */
function freshFixture(name) {
    const pkg = join(TMP, name);
    rmSync(pkg, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    cpSync(join(FIX, name), pkg, { recursive: true });
    return pkg;
}

function spawnCli(args) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

const read = (pkg, ...seg) => readFileSync(join(pkg, 'src', ...seg), 'utf8');
const names = (entries) => entries.map((e) => e.info.moduleName).sort();

// ─────────────────────────────────────────────────────────────────────────
// Task 01 — the scan ignores generated bundles
// ─────────────────────────────────────────────────────────────────────────

describe('deps — defect 1 : generated bundles are out of the scan', () => {
    let pkg;
    beforeEach(() => { pkg = freshFixture('deps-ignore'); });

    test('default run plans only the real modules and no longer aborts', () => {
        const { plan, unresolved, ignored } = planDeps({ pkg });
        // `delta` (under legacy/) is unresolvable but does NOT abort gamma.
        expect(names(plan)).toEqual(['gamma']);
        expect(unresolved.map((u) => u.moduleName)).toEqual(['delta']);
        expect(ignored.length).toBe(2);            // both prebuilt bundles
    });

    test('--check ignores prebuilt (reports the real modules only)', () => {
        const r = spawnCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('gamma');
        expect(r.stderr).not.toContain('pkgPackage');
    });

    test('a custom --ignore glob filters its target, unioned with the default', () => {
        const { plan, unresolved, ignored } = planDeps({ pkg, ignore: ['legacy/**'] });
        expect(names(plan)).toEqual(['gamma']);
        expect(unresolved).toEqual([]);
        expect(ignored.length).toBe(3);            // 2 prebuilt + legacy/delta.js
        expect(depsCli(['--pkg', pkg, '--ignore', 'legacy/**', '--check'])).toBe(1);
        expect(depsCli(['--pkg', pkg, '--ignore', 'legacy/**'])).toBe(0);
        expect(depsCli(['--pkg', pkg, '--ignore', 'legacy/**', '--check'])).toBe(0);
    });

    test('duplicate-name leak: an ignored prebuilt is never the import target', () => {
        // `bundles/prebuilt/alpha-inlined.js` re-declares the name `alpha`.
        runDeps({ pkg, ignore: ['legacy/**'] });
        const gamma = read(pkg, 'mod', 'gamma.js');
        expect(gamma).toContain("import { alpha } from './alpha.js';");
        expect(gamma).not.toContain('bundles/prebuilt');
        expect(gamma).toContain('deps: [alpha]');
    });

    test('--ignore without a value → usage error (exit 2)', () => {
        expect(depsCli(['--pkg', pkg, '--ignore'])).toBe(2);
        expect(depsCli(['--ignore', '--check'])).toBe(2);
        const r = spawnCli(['deps', '--pkg', pkg, '--ignore']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('requires a value');
    });

    test('filterScan is pure and rebuilds both indexes from the survivors', () => {
        const srcDir = join(pkg, 'src');
        const scanned = {
            byFile: new Map([
                [join(srcDir, 'mod', 'alpha.js'), { file: join(srcDir, 'mod', 'alpha.js'), moduleName: 'alpha' }],
                [join(srcDir, 'bundles', 'prebuilt', 'x.js'), { file: join(srcDir, 'bundles', 'prebuilt', 'x.js'), moduleName: 'alpha' }],
            ]),
            unparseable: [{ file: join(srcDir, 'bundles', 'prebuilt', 'y.js') }],
        };
        const out = filterScan(scanned, srcDir);
        expect(out.byFile.size).toBe(1);
        expect(out.byName.get('alpha').file).toBe(join(srcDir, 'mod', 'alpha.js'));
        expect(out.unparseable).toEqual([]);
        expect(scanned.byFile.size).toBe(2);       // input untouched
        expect(DEFAULT_IGNORE).toEqual(['bundles/prebuilt/**']);
    });

    test('a genuine duplicate among SURVIVING files still throws', () => {
        const srcDir = join(pkg, 'src');
        const dup = (f) => [join(srcDir, 'mod', f), { file: join(srcDir, 'mod', f), moduleName: 'alpha' }];
        expect(() => filterScan({ byFile: new Map([dup('a.js'), dup('b.js')]), unparseable: [] }, srcDir))
            .toThrow(/duplicate module name "alpha"/);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 02 — cross-package fw resolution + skip-and-continue
// ─────────────────────────────────────────────────────────────────────────

describe('deps — defect 2 : static @awacloud/fw name resolution', () => {
    let pkg;
    beforeEach(() => { pkg = freshFixture('deps-fw'); });

    test('a name cited by main.js resolves with its verbatim specifier', () => {
        const { plan } = planDeps({ pkg });
        const beta = plan.find((e) => e.info.moduleName === 'beta');
        expect(beta.addedImports).toEqual([
            "import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';",
        ]);
        runDeps({ pkg });
        const src = read(pkg, 'mod', 'beta.js');
        expect(src).toContain("import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';");
        expect(src).toContain('deps: [htmlEntities]');
    });

    test('a descriptor-local @awacloud/fw import wins over main.js', () => {
        const { plan } = planDeps({ pkg });
        const local = plan.find((e) => e.info.moduleName === 'localImport');
        expect(local.addedImports).toEqual([]);    // already in scope
        runDeps({ pkg });
        const src = read(pkg, 'mod', 'local-import.js');
        expect(src).toContain("from '@awacloud/fw/io/codec/url-alt.js'");
        expect(src).not.toContain("'@awacloud/fw/io/codec/url.js'");   // main.js specifier unused
        expect(src).toContain('deps: [url]');
    });

    test('aliased imports resolve — local alias becomes the deps entry', () => {
        runDeps({ pkg });
        const local = read(pkg, 'mod', 'aliased-local.js');
        expect(local).toContain('deps: [urlMod]');
        expect(local.match(/@awacloud\/fw/g).length).toBe(1);          // no second import

        const viaMain = read(pkg, 'mod', 'aliased-main.js');
        expect(viaMain).toContain("import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';");
        expect(viaMain).toContain('deps: [sanitize]');
    });

    test('an fw name imported by main.js but absent from fw_require stays unresolved', () => {
        const { unresolved } = planDeps({ pkg });
        const g = unresolved.find((u) => u.moduleName === 'guarded');
        expect(g).toBeDefined();
        expect(g.missing).toEqual(['secPolicy']);
    });

    test('a module with an unresolvable name is skipped; siblings are still written', () => {
        const { plan, unresolved } = planDeps({ pkg });
        expect(names(plan)).toEqual(['aliasedLocal', 'aliasedMain', 'beta', 'localImport']);
        expect(unresolved.map((u) => u.moduleName).sort()).toEqual(['guarded', 'skipped']);
        expect(unresolved.find((u) => u.moduleName === 'skipped').missing).toEqual(['ghostName']);

        const res = runDeps({ pkg });
        expect(res.updated.length).toBe(4);
        expect(res.unresolved.length).toBe(2);
        expect(read(pkg, 'mod', 'beta.js')).toContain('deps: [htmlEntities]');
    });

    test('no partial deps array is ever written for a skipped module', () => {
        const before = read(pkg, 'mod', 'skipped.js');
        runDeps({ pkg });
        expect(read(pkg, 'mod', 'skipped.js')).toBe(before);
        // The scanner is the oracle: no `deps` FIELD was injected (the fixture
        // comment mentions `deps` in prose, so a substring check would lie).
        for (const f of ['skipped.js', 'guarded.js']) {
            expect(parseFile(join(pkg, 'src', 'mod', f)).hasDepsField).toBe(false);
        }
    });

    test('apply exits 1 with the skip list; --dry-run stays exit 0 (frozen contract)', () => {
        const dry = spawnCli(['deps', '--pkg', pkg, '--dry-run']);
        expect(dry.code).toBe(0);
        expect(dry.stdout).toContain('SKIPPED');
        expect(dry.stdout).toContain('skipped');
        expect(dry.stdout).toContain('ghostName');

        const apply = spawnCli(['deps', '--pkg', pkg]);
        expect(apply.code).toBe(1);
        expect(apply.stdout).toContain('4 file(s) updated');
        expect(apply.stderr).toContain('SKIPPED');
        expect(apply.stderr).toContain('guarded');
    });

    test('--check appends the skip list to the failure output', () => {
        const r = spawnCli(['deps', '--pkg', pkg, '--check']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('beta');
        expect(r.stderr).toContain('SKIPPED');
        expect(r.stderr).toContain('secPolicy');
    });

    test('re-running after apply is idempotent for the written modules', () => {
        runDeps({ pkg });
        const after1 = read(pkg, 'mod', 'beta.js');
        const { plan } = planDeps({ pkg });
        expect(plan.length).toBe(0);
        runDeps({ pkg });
        expect(read(pkg, 'mod', 'beta.js')).toBe(after1);
    });
});
