// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/cutover-baseline.harness.test.ts
//
// Unit tests for the cut-over baseline harness COMPARE + NORMALIZATION logic,
// exercised on SYNTHETIC capture dirs (no fw builds run here — the real fw
// capture is exercised by the mandatory double-capture proof run, recorded in
// the batch report). Frozen semantics: FINDINGS §4 (byte-equality for
// bundle/standalone/registry after normalization, order-insensitive set
// equality for the audit buckets).

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    normalizeMeta, parseAudit, sha256, compareCaptures,
} from './cutover-baseline.harness.ts';

const TMP = join(import.meta.dir, '__cutover_tmp__');

interface AuditShape { counts: Record<string, number>; sets: Record<string, string[]> }
interface SpecFile { name: string; bytes: string }
interface CaptureSpec {
    scripts?: 'original' | 'rewired';
    bundle?: SpecFile[];
    standalone?: { modules: string[]; files: SpecFile[] };
    registry?: SpecFile[];
    audit?: AuditShape;
}

function fileRecs(dir: string, sub: string, files: SpecFile[]) {
    if (files.length) mkdirSync(join(dir, sub), { recursive: true });
    return files.map((f) => {
        writeFileSync(join(dir, sub, f.name), f.bytes, 'utf8');
        return { name: f.name, sha256: sha256(f.bytes) };
    });
}

function makeCapture(dir: string, spec: CaptureSpec): string {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const bundle = spec.bundle ?? [];
    const standalone = spec.standalone ?? { modules: [], files: [] };
    const registry = spec.registry ?? [];
    const audit = spec.audit ?? { counts: { total: 0, lossy: 0, inline: 0, infer: 0, typed: 0 }, sets: { lossy: [], inline: [], infer: [] } };
    const auditJson = JSON.stringify(audit, null, 2) + '\n';
    mkdirSync(join(dir, 'audit'), { recursive: true });
    writeFileSync(join(dir, 'audit', 'audit.normalized.json'), auditJson, 'utf8');

    const manifest = {
        harness: 'cutover-baseline',
        version: 1,
        capturedAt: new Date().toISOString(),
        scripts: spec.scripts ?? 'original',
        fwPkgRoot: 'packages/front/fw',
        normalization: {
            metaBuiltAt: 'none — BL-697: emitted meta carries no builtAt',
            standaloneBuilt: 'none — BL-697: emitted ESM carries no `// Built:` banner',
        },
        artifacts: {
            bundle: { scripts: ['prebuild:minimal', 'prebuild:core', 'prebuild:site'], files: fileRecs(dir, 'bundle', bundle) },
            standalone: { modules: standalone.modules, files: fileRecs(dir, 'standalone', standalone.files) },
            registry: { files: fileRecs(dir, 'registry', registry) },
            audit: { sha256: sha256(auditJson), counts: audit.counts, sets: audit.sets },
        },
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return dir;
}

const BASE: CaptureSpec = {
    bundle: [
        { name: 'fw.minimal.min.js', bytes: 'export const a=1;' },
        { name: 'fw.core.min.js', bytes: 'export const b=2;' },
    ],
    standalone: { modules: [], files: [] },
    registry: [{ name: 'registry.generated.d.ts', bytes: 'export interface M {}\n' }],
    audit: {
        counts: { total: 3, lossy: 0, inline: 1, infer: 2, typed: 0 },
        sets: { lossy: [], inline: ['hybridKem'], infer: ['webcryptoHkdf', 'webcryptoPbkdf2'] },
    },
};

beforeEach(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

// INVERTED by BL-697/BL-698 (D35(b)). `normalizeMeta` used to neutralize the
// emitted `builtAt` timestamp; the bundler no longer emits one, so the
// normalization was removed and a `builtAt` reappearing in a capture must now
// FAIL the compare rather than be excused. `normalizeStandalone` was deleted
// outright with its subject (the `// Built:` banner) — the standalone output's
// stamp-freedom is pinned where the real generator runs, in
// `standalone.integration.test.js`.
describe('normalizeMeta — stamp-freedom is asserted, not normalized away (§4 criterion 1)', () => {
    test('a meta with no builtAt round-trips to a canonical byte image', () => {
        const a = JSON.stringify({ kind: 'preset', name: 'minimal', bytes: { min: 10 }, hashSha256: { min: 'abc' } });
        const b = JSON.stringify({ kind: 'preset', name: 'minimal', bytes: { min: 10 }, hashSha256: { min: 'abc' } }, null, 4);
        // Same content, different incidental formatting → same normalized image.
        expect(a).not.toBe(b);
        expect(normalizeMeta(a)).toBe(normalizeMeta(b));
        expect(normalizeMeta(a)).not.toContain('builtAt');
        expect(normalizeMeta(a).endsWith('\n')).toBe(true);
    });

    test('two metas differing only in builtAt no longer normalize equal (a resurrected stamp FAILS the compare)', () => {
        const a = JSON.stringify({ kind: 'preset', name: 'minimal', bytes: { min: 10 }, hashSha256: { min: 'abc' }, builtAt: '2026-07-22T10:00:00.000Z' });
        const b = JSON.stringify({ kind: 'preset', name: 'minimal', bytes: { min: 10 }, hashSha256: { min: 'abc' }, builtAt: '2026-07-22T11:59:59.999Z' });
        expect(normalizeMeta(a)).not.toBe(normalizeMeta(b));
        // Discrimination: the difference really is the timestamp, not the
        // surrounding fields (which are byte-identical in both inputs).
        expect(normalizeMeta(a)).toContain('2026-07-22T10:00:00.000Z');
        expect(normalizeMeta(b)).toContain('2026-07-22T11:59:59.999Z');
    });

    test('a meta differing in a real field does NOT normalize equal', () => {
        const a = JSON.stringify({ name: 'minimal', bytes: { min: 10 } });
        const b = JSON.stringify({ name: 'minimal', bytes: { min: 11 } });
        expect(normalizeMeta(a)).not.toBe(normalizeMeta(b));
    });
});

describe('parseAudit — bucket extraction (order-insensitive sets)', () => {
    const STDOUT = [
        '',
        'Factory return-type audit — 201 modules',
        '  TYPED  (named @returns type)  : 198  → exported type alias',
        '  INLINE (anonymous {…} @returns): 1  ← fix targets',
        '  INFER  (no @returns)          : 2',
        '  LOSSY  (wide @returns)        : 0  ← fix targets',
        '',
        '── INLINE — promote anonymous {…}',
        '  hybridKem  deps: 0  @returns {{ xwing: XwingApi }}  — src/crypto/pkc/hybridKem.js',
        '',
        '── INFER — verify (inference may be loose)',
        '  webcryptoHkdf    deps: 0  (inferred)  — src/crypto/webcrypto/hkdf.js',
        '  webcryptoPbkdf2  deps: 0  (inferred)  — src/crypto/webcrypto/pbkdf2.js',
        '',
        '(198 TYPED modules omitted — already a named, exported type.)',
    ].join('\n');

    test('parses counts and sorted name sets', () => {
        const r = parseAudit(STDOUT);
        expect(r.counts).toEqual({ total: 201, typed: 198, inline: 1, infer: 2, lossy: 0 });
        expect(r.sets.lossy).toEqual([]);
        expect(r.sets.inline).toEqual(['hybridKem']);
        expect(r.sets.infer).toEqual(['webcryptoHkdf', 'webcryptoPbkdf2']);
    });
});

describe('compareCaptures — §4 pass/fail', () => {
    test('identical dirs → all PASS', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const b = makeCapture(join(TMP, 'b'), BASE);
        const r = compareCaptures(a, b);
        expect(r.overall).toBe(true);
        expect(r.criteria.map((c) => c.pass)).toEqual([true, true, true, true]);
    });

    test('one flipped byte in a bundle artifact → bundle FAIL', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const flipped = { ...BASE, bundle: [
            { name: 'fw.minimal.min.js', bytes: 'export const a=2;' }, // flipped 1→2
            { name: 'fw.core.min.js', bytes: 'export const b=2;' },
        ] };
        const b = makeCapture(join(TMP, 'b'), flipped);
        const r = compareCaptures(a, b);
        expect(r.overall).toBe(false);
        const bundle = r.criteria.find((c) => c.name === 'bundle')!;
        expect(bundle.pass).toBe(false);
        expect(bundle.detail).toContain('fw.minimal.min.js');
    });

    test('audit sets reordered but equal → audit PASS', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const reordered = { ...BASE, audit: {
            counts: { total: 3, lossy: 0, inline: 1, infer: 2, typed: 0 },
            sets: { lossy: [], inline: ['hybridKem'], infer: ['webcryptoPbkdf2', 'webcryptoHkdf'] }, // swapped order
        } };
        const b = makeCapture(join(TMP, 'b'), reordered);
        const r = compareCaptures(a, b);
        const audit = r.criteria.find((c) => c.name === 'audit')!;
        expect(audit.pass).toBe(true);
        expect(r.overall).toBe(true);
    });

    test('audit membership diff → audit FAIL', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const changed = { ...BASE, audit: {
            counts: { total: 3, lossy: 1, inline: 0, infer: 2, typed: 0 },
            sets: { lossy: ['hybridKem'], inline: [], infer: ['webcryptoHkdf', 'webcryptoPbkdf2'] },
        } };
        const b = makeCapture(join(TMP, 'b'), changed);
        const r = compareCaptures(a, b);
        const audit = r.criteria.find((c) => c.name === 'audit')!;
        expect(audit.pass).toBe(false);
        expect(audit.detail).toMatch(/membership|counts/);
    });

    test('missing artifact → bundle FAIL with a named reason', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const dropped = { ...BASE, bundle: [{ name: 'fw.minimal.min.js', bytes: 'export const a=1;' }] };
        const b = makeCapture(join(TMP, 'b'), dropped);
        const r = compareCaptures(a, b);
        const bundle = r.criteria.find((c) => c.name === 'bundle')!;
        expect(bundle.pass).toBe(false);
        expect(bundle.detail).toContain('fw.core.min.js');
    });

    test('registry byte diff → registry FAIL', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const changed = { ...BASE, registry: [{ name: 'registry.generated.d.ts', bytes: 'export interface M { x: 1 }\n' }] };
        const b = makeCapture(join(TMP, 'b'), changed);
        const r = compareCaptures(a, b);
        const reg = r.criteria.find((c) => c.name === 'registry')!;
        expect(reg.pass).toBe(false);
    });

    test('differing standalone module set → standalone FAIL', () => {
        const a = makeCapture(join(TMP, 'a'), BASE);
        const withMod = { ...BASE, standalone: { modules: ['hex'], files: [{ name: 'hex.js', bytes: 'export default {};\n' }] } };
        const b = makeCapture(join(TMP, 'b'), withMod);
        const r = compareCaptures(a, b);
        const sa = r.criteria.find((c) => c.name === 'standalone')!;
        expect(sa.pass).toBe(false);
    });
});
