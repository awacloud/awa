// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/catalog.test.ts
//
// `catalog` subcommand: deterministic module-catalog artifact + `--check`
// drift gate (fw-tools-migration W1d, CALL-CONTRACT.md addendum A3).
// Exercises the real fw package READ-ONLY (`renderCatalog` never writes) and
// uses isolated temp copies of the `mini-fw` fixture for every write /
// --check / unparseable case — never mutates the real tree.

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { renderCatalog, runCli as catalogCli } from '../src/catalog/index.js';
import { scanAll } from '../src/modlib/scan-modules.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const FW = join(ROOT, 'packages', 'front', 'fw');
const ENTRY = join(ROOT, 'tools', 'fw-bundler', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__', 'mini-fw');
const TMP = join(import.meta.dir, '__tmp_catalog__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

function runCli(args: string[], cwd: string = ROOT) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe('catalog — happy path against the real fw package (read-only)', () => {
    test('renders valid JSON, sorted keys, every entry shaped, measured count', () => {
        const { text, moduleCount } = renderCatalog(FW);
        const parsed = JSON.parse(text);

        expect(typeof parsed.comment).toBe('string');
        expect(parsed.comment).toContain('AUTO-GENERATED');
        // The artifact SHIPS in fw's tarball (`integrations/**/*.json`), so its
        // comment must name the published bin, not the unpublished task router.
        expect(parsed.comment).toContain('`fw-bundler catalog`');
        expect(parsed.comment).not.toMatch(/cli\.ts/);
        expect(typeof parsed.modules).toBe('object');

        const names = Object.keys(parsed.modules);
        const sorted = [...names].sort();
        expect(names).toEqual(sorted);

        for (const name of names) {
            const entry = parsed.modules[name];
            expect(typeof entry.bindingName).toBe('string');
            expect(entry.bindingName.length).toBeGreaterThan(0);
            expect(typeof entry.subpath).toBe('string');
            expect(entry.subpath.endsWith('.js')).toBe(true);
            expect(entry.subpath.includes('\\')).toBe(false);
        }

        // Measured, not hardcoded: cross-check against the shared scanner directly
        // (mirrors the fold lesson from the sibling registry test — never assert
        // a frozen count).
        const { byName, unparseable } = scanAll(join(FW, 'src'));
        expect(unparseable.length).toBe(0);
        expect(moduleCount).toBe(byName.size);
        expect(names.length).toBe(byName.size);
    });

    test('is pure — the real fw committed artifact (if any) is untouched', () => {
        const artifact = join(FW, 'integrations', '_shared', 'catalog.generated.json');
        const before = existsSync(artifact) ? readFileSync(artifact, 'utf8') : null;
        renderCatalog(FW);
        const after = existsSync(artifact) ? readFileSync(artifact, 'utf8') : null;
        expect(after).toBe(before);
    });
});

describe('catalog — byte-idempotence', () => {
    test('rendering fw twice yields identical bytes', () => {
        const a = renderCatalog(FW).text;
        const b = renderCatalog(FW).text;
        expect(a).toBe(b);
    });
});

describe('catalog — write + --check (isolated fixture, fw untouched)', () => {
    test('write creates the artifact; --check is green (exit 0) right after', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'fresh');
        cpSync(FIX, pkg, { recursive: true });

        const w = runCli(['catalog', '--pkg', pkg]);
        expect(w.code).toBe(0);
        const outFile = join(pkg, 'integrations', '_shared', 'catalog.generated.json');
        expect(existsSync(outFile)).toBe(true);
        const written = readFileSync(outFile, 'utf8');
        expect(() => JSON.parse(written)).not.toThrow();
        const parsed = JSON.parse(written);
        expect(Object.keys(parsed.modules).sort()).toEqual(['alpha', 'beta']);

        const c = runCli(['catalog', '--pkg', pkg, '--check']);
        expect(c.code).toBe(0);
        expect(c.stdout).toContain('up to date');
    });

    test('atomic write: no .tmp residue after successful run', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'atomicity');
        cpSync(FIX, pkg, { recursive: true });

        const w = runCli(['catalog', '--pkg', pkg]);
        expect(w.code).toBe(0);
        const outDir = join(pkg, 'integrations', '_shared');
        const outFile = join(outDir, 'catalog.generated.json');
        const tmpFile = outFile + '.tmp';

        expect(existsSync(outFile)).toBe(true);
        expect(existsSync(tmpFile)).toBe(false);
    });

    test('atomic write: output bytes byte-idempotent vs multiple runs', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'idempotence');
        cpSync(FIX, pkg, { recursive: true });

        // First write
        const w1 = runCli(['catalog', '--pkg', pkg]);
        expect(w1.code).toBe(0);
        const outFile = join(pkg, 'integrations', '_shared', 'catalog.generated.json');
        const bytes1 = readFileSync(outFile, 'utf8');

        // Second write (overwrite)
        const w2 = runCli(['catalog', '--pkg', pkg]);
        expect(w2.code).toBe(0);
        const bytes2 = readFileSync(outFile, 'utf8');

        // Bytes must be identical
        expect(bytes2).toBe(bytes1);
    });

    test('--check is red (exit 1) on a tampered copy', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'tampered');
        cpSync(FIX, pkg, { recursive: true });

        expect(runCli(['catalog', '--pkg', pkg]).code).toBe(0);
        const outFile = join(pkg, 'integrations', '_shared', 'catalog.generated.json');
        const original = readFileSync(outFile, 'utf8');
        writeFileSync(outFile, original.replace('"alpha"', '"zzz_renamed"'), 'utf8');

        const c = runCli(['catalog', '--pkg', pkg, '--check']);
        expect(c.code).toBe(1);
        expect(c.stderr).toContain('out of date');
    });

    test('--check is red (exit 1) when the artifact is missing', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'missing');
        cpSync(FIX, pkg, { recursive: true });

        const c = runCli(['catalog', '--pkg', pkg, '--check']);
        expect(c.code).toBe(1);
        expect(c.stderr).toContain('file absent');
    });
});

describe('catalog — unparseable module aborts fail-closed', () => {
    test('a broken module file → exit 1, nothing written', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'broken');
        cpSync(FIX, pkg, { recursive: true });

        // Same "unparseable" trigger as scan-modules' own coverage: a
        // `dependencies` array containing a non-string-literal entry.
        const brokenFile = join(pkg, 'src', 'mod', 'gamma.js');
        writeFileSync(
            brokenFile,
            "export const gamma = {\n    name: 'gamma',\n    dependencies: [someIdentifier],\n    factory() { return {}; }\n};\n",
            'utf8'
        );

        const w = runCli(['catalog', '--pkg', pkg]);
        expect(w.code).toBe(1);
        expect(w.stderr).toContain('could not be parsed');
        const outFile = join(pkg, 'integrations', '_shared', 'catalog.generated.json');
        expect(existsSync(outFile)).toBe(false);
    });
});

describe('catalog — dispatcher non-regression', () => {
    test('bundle/standalone still route; catalog is discoverable alongside them', () => {
        const bundleHelp = runCli(['bundle', '--help']);
        expect(bundleHelp.code).toBe(0);
        expect(bundleHelp.stdout).toContain('fw-bundler bundle');

        const standaloneHelp = runCli(['standalone', '--help']);
        expect(standaloneHelp.code).toBe(0);
        expect(standaloneHelp.stdout).toContain('fw-bundler standalone');

        const catalogHelp = runCli(['catalog', '--help']);
        expect(catalogHelp.code).toBe(0);
        expect(catalogHelp.stdout).toContain('fw-bundler catalog');

        const topHelp = runCli(['--help']);
        expect(topHelp.code).toBe(0);
        expect(topHelp.stdout).toContain('bundle');
        expect(topHelp.stdout).toContain('standalone');
        expect(topHelp.stdout).toContain('catalog');
    });

    test('in-process runCli branches: --help / unknown flag / positional', () => {
        expect(catalogCli(['--help'])).toBe(0);
        expect(catalogCli(['--bogus'])).toBe(2);
        expect(catalogCli(['extra'])).toBe(2);
    });
});
