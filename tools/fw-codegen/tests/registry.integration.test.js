// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/registry.integration.test.js
//
// Golden compare for the `registry` subcommand against the REAL fw package:
// the copy's rendered output must be byte-identical to the committed
// types/registry.generated.d.ts (the file fw's own `types:registry:check`
// oracle validates). Plus byte-idempotence and a write→--check no-op on an
// isolated fixture package (never clobbers fw's committed file).

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { renderRegistry, runCli as regCli } from '../src/registry/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const FW = join(ROOT, 'packages', 'front', 'fw');
const COMMITTED = join(FW, 'types', 'registry.generated.d.ts');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__', 'mini-fw');
const TMP = join(import.meta.dir, '__tmp_registry__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

function runCli(args, cwd = ROOT) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe('registry — byte-identical vs the real fw original', () => {
    test('rendered output equals the committed registry.generated.d.ts', () => {
        const { text, moduleCount } = renderRegistry(FW);
        // Check internal consistency: the scanned module count must match the entries rendered.
        // Derive the expected count from the generated text itself, not a frozen number.
        const generatedEntries = text.split('\n').filter(line => line.startsWith('    ') && line.includes('ReturnType'));
        expect(moduleCount).toBe(generatedEntries.length);
        const committed = readFileSync(COMMITTED, 'utf8');
        expect(text).toBe(committed);
    });

    test('the copy agrees with fw\'s oracle (registry --check against fw → exit 0)', () => {
        const r = runCli(['registry', '--pkg', FW, '--check']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('up to date');
    });

    test('byte-idempotence: rendering fw twice yields identical output', () => {
        const a = renderRegistry(FW).text;
        const b = renderRegistry(FW).text;
        expect(a).toBe(b);
    });
});

describe('registry — write then --check no-op (isolated fixture, fw untouched)', () => {
    test('write creates the registry, a subsequent --check is a no-op (exit 0)', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'mini-fw');
        cpSync(FIX, pkg, { recursive: true });

        // Write path.
        const w = runCli(['registry', '--pkg', pkg]);
        expect(w.code).toBe(0);
        const outFile = join(pkg, 'types', 'registry.generated.d.ts');
        expect(existsSync(outFile)).toBe(true);
        const written = readFileSync(outFile, 'utf8');
        expect(written).toContain('export interface ModuleInstanceMap {');
        expect(written).toContain('alpha:');
        expect(written).toContain('beta:');

        // --check after a write is a no-op (exit 0).
        const c = runCli(['registry', '--pkg', pkg, '--check']);
        expect(c.code).toBe(0);
        expect(c.stdout).toContain('up to date');
    });

    test('fw\'s committed registry file is byte-unchanged after the suite', () => {
        // Guard: renderRegistry / the fixture path must never have written to fw.
        const { text } = renderRegistry(FW);
        expect(readFileSync(COMMITTED, 'utf8')).toBe(text);
    });
});

describe('registry — runCli branches (in-process)', () => {
    test('--help → 0; unknown flag → 2; positional → 2', () => {
        expect(regCli(['--help'])).toBe(0);
        expect(regCli(['--bogus'])).toBe(2);
        expect(regCli(['extra'])).toBe(2);
    });

    test('write path (exit 0) then --check no-op (exit 0) on an isolated fixture', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'inproc');
        cpSync(FIX, pkg, { recursive: true });
        expect(regCli(['--pkg', pkg])).toBe(0);
        expect(existsSync(join(pkg, 'types', 'registry.generated.d.ts'))).toBe(true);
        expect(regCli(['--pkg', pkg, '--check'])).toBe(0);
    });

    test('--check on an empty (never-written) fixture → out of date, exit 1', () => {
        cleanTmp();
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'unwritten');
        cpSync(FIX, pkg, { recursive: true });
        expect(regCli(['--pkg', pkg, '--check'])).toBe(1);
    });
});
