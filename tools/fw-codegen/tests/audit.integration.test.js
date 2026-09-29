// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/audit.integration.test.js
//
// The `audit` subcommand — ported logic-verbatim from fw's `tools/types/audit`.
// Two proofs: (1) a fixture module tree exercises the LOSSY/INFER/INLINE/TYPED
// classification + dependent-count ranking; (2) a golden-compare against the
// committed goldens (fw extracted from git history at the MANIFEST's
// captureSha — proven byte-identical to fw's own `types/audit` stdout on
// that input before the originals were removed; see
// __fixtures__/golden/README.md).

import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'node:path';

import { scanAll } from '@awacloud/tool-fw-bundler/modlib';
import { computeAudit, renderAudit, runCli as auditCli } from '../src/audit/index.js';
import { extractFwAt, readManifest, readGolden } from './golden-fw.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const FW = join(ROOT, 'packages', 'front', 'fw');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FIX = join(import.meta.dir, '__fixtures__', 'audit-src');

function runCli(args, cwd = ROOT) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe('audit — fixture module tree buckets', () => {
    test('classifies LOSSY/INFER/INLINE/TYPED and ranks by dependent count', () => {
        const result = computeAudit(FIX);
        expect(result.total).toBe(5);
        expect(result.unparseable).toEqual([]);

        expect(result.lossy.map((r) => r.name)).toEqual(['lossyMod']);
        expect(result.lossy[0].deps).toBe(1); // userMod depends on lossyMod
        expect(result.lossy[0].ret).toBe('Object');

        expect(result.infer.map((r) => r.name)).toEqual(['inferMod']);
        expect(result.infer[0].ret).toBeNull();

        expect(result.inline.map((r) => r.name)).toEqual(['inlineMod']);
        expect(result.inline[0].ret).toBe('{ foo: string }');

        expect(result.typed.map((r) => r.name).sort()).toEqual(['typedMod', 'userMod']);
    });

    test('renderAudit prints the LOSSY/INLINE/INFER sections + summary counts', () => {
        const text = renderAudit(FIX);
        expect(text).toContain('Factory return-type audit — 5 modules');
        expect(text).toContain('TYPED  (named @returns type)  : 2');
        expect(text).toContain('INLINE (anonymous {…} @returns): 1');
        expect(text).toContain('INFER  (no @returns)          : 1');
        expect(text).toContain('LOSSY  (wide @returns)        : 1');
        expect(text).toContain('LOSSY — fix these (by dependents desc)');
        expect(text).toContain('lossyMod');
        expect(text).toContain('deps: 1');
        expect(text).toContain('@returns {Object}');
        expect(text).toContain('INLINE — promote anonymous {…} to a named @typedef');
        expect(text).toContain('INFER — verify (inference may be loose)');
        expect(text).toContain('(2 TYPED modules omitted — already a named, exported type.)');
    });

    test('--lossy-only omits the INFER section + the TYPED-omitted line', () => {
        const text = renderAudit(FIX, { lossyOnly: true });
        expect(text).toContain('LOSSY — fix these (by dependents desc)');
        expect(text).not.toContain('INFER — verify');
        expect(text).not.toContain('TYPED modules omitted');
    });
});

describe('audit — golden-compare vs the committed goldens (frozen fw@captureSha)', () => {
    const FROZEN = extractFwAt(readManifest().captureSha);

    test('renderAudit(frozen fw) is byte-identical to the golden', () => {
        expect(renderAudit(FROZEN)).toBe(readGolden('fw-audit.txt').toString('utf8'));
    });

    test('`codegen audit --pkg <frozen fw>` CLI output is byte-identical to the golden', () => {
        const r = runCli(['audit', '--pkg', FROZEN]);
        expect(r.code).toBe(0);
        expect(r.stdout).toBe(readGolden('fw-audit.txt').toString('utf8'));
    });

    test('--lossy-only agrees with its golden', () => {
        const r = runCli(['audit', '--pkg', FROZEN, '--lossy-only']);
        expect(r.code).toBe(0);
        expect(r.stdout).toBe(readGolden('fw-audit.lossy-only.txt').toString('utf8'));
    });

    test('scans the same module catalog size as the shared modlib scanner', () => {
        const { byFile } = scanAll(join(FW, 'src'));
        expect(computeAudit(FW).total).toBe(byFile.size);
    });
});

describe('audit — runCli branches (in-process)', () => {
    test('--help → 0; unknown flag → 2; positional → 2', () => {
        expect(auditCli(['--help'])).toBe(0);
        expect(auditCli(['--bogus'])).toBe(2);
        expect(auditCli(['extra'])).toBe(2);
    });

    test('reads the fixture via --pkg (in-process, exit 0)', () => {
        expect(auditCli(['--pkg', FIX])).toBe(0);
    });
});

describe('audit — CLI dispatch (spawned)', () => {
    test('audit --help → exit 0 (routes into subcommand)', () => {
        const r = runCli(['audit', '--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('fw-codegen audit');
    });

    test('audit unknown flag → usage error, exit 2', () => {
        const r = runCli(['audit', '--bogus']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('Unknown flag');
    });

    test('top-level --help now lists audit alongside registry/deps', () => {
        const r = runCli(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('registry');
        expect(r.stdout).toContain('deps');
        expect(r.stdout).toContain('audit');
    });
});

describe('audit — additive-contract guard (registry/deps unaffected)', () => {
    test('registry --check against fw still passes (frozen G1 contract unchanged)', () => {
        const r = runCli(['registry', '--pkg', FW, '--check']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('up to date');
    });

    test('unknown top-level command still exits 2 (audit did not widen dispatch)', () => {
        const r = runCli(['frobnicate']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('unknown command');
    });
});
