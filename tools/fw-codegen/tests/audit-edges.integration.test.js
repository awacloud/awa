// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/audit-edges.integration.test.js
//
// Refusal / degraded-input branches of the `audit` subcommand, driven
// IN-PROCESS (a spawned CLI contributes no instrumentation to the parent
// `--coverage` run). Each refusal is asserted on its DIAGNOSTIC and paired
// with the nearest-neighbour case that must still succeed.
//
// Branches targeted:
//   src/audit/index.js:237-239  runCli() unparseable-file stderr line
//   src/audit/index.js:233-235  computeAudit() throw → exit 1
//   src/audit/index.js:80-104   factoryReturnsType edge shapes
//   src/audit/index.js:185-195  printTable early return on an empty bucket

import { describe, test, expect, afterAll } from 'bun:test';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeAudit, renderAudit, runCli as auditCli } from '../src/audit/index.js';

const FIXTURES = join(import.meta.dir, '__fixtures__');
const UNPARSEABLE = join(FIXTURES, 'edge-unparseable');
const DUP = join(FIXTURES, 'edge-dup');
const AUDIT_SRC = join(FIXTURES, 'audit-src');
const TMP = join(import.meta.dir, 'tmp', 'audit-edges');

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

/** See registry-edges.integration.test.js — same capture contract. */
function capture(fn) {
    const out = [];
    const err = [];
    const realLog = console.log;
    const realErr = console.error;
    const realWarn = console.warn;
    const realWrite = process.stdout.write;
    console.log = (...a) => { out.push(a.join(' ')); };
    console.error = (...a) => { err.push(a.join(' ')); };
    console.warn = (...a) => { err.push(a.join(' ')); };
    process.stdout.write = (s) => { out.push(String(s)); return true; };
    try {
        const code = fn();
        return { code, stdout: out.join('\n'), stderr: err.join('\n') };
    } finally {
        console.log = realLog;
        console.error = realErr;
        console.warn = realWarn;
        process.stdout.write = realWrite;
    }
}

describe('audit — an unparseable file is reported, not fatal', () => {
    test('computeAudit surfaces it in the `unparseable` bucket', () => {
        const result = computeAudit(UNPARSEABLE);
        expect(result.unparseable.map((u) => u.moduleName)).toEqual(['broken']);
        // The parseable neighbour is still classified normally.
        expect(result.total).toBe(1);
        expect(result.infer.map((r) => r.name)).toEqual(['fine']);
    });

    test('runCli warns on stderr and still exits 0 with a report — 237-239', () => {
        const r = capture(() => auditCli(['--pkg', UNPARSEABLE]));
        expect(r.code).toBe(0);
        expect(r.stderr).toMatch(/\[codegen-audit\] 1 unparseable file\(s\)\./);
        expect(r.stdout).toContain('Factory return-type audit — 1 modules');
    });

    test('twin: a fully parseable package emits NO unparseable line', () => {
        const r = capture(() => auditCli(['--pkg', AUDIT_SRC]));
        expect(r.code).toBe(0);
        expect(r.stderr).not.toMatch(/unparseable file/);
        expect(r.stdout).toContain('Factory return-type audit — 5 modules');
    });
});

describe('audit — computeAudit throw → exit 1', () => {
    test('a duplicate module name is reported and exits 1 — 233-235', () => {
        const r = capture(() => auditCli(['--pkg', DUP]));
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/\[codegen-audit\] \[scan-modules\] duplicate module name "twin"/);
    });

    test('a package with no src/ at all is reported and exits 1', () => {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(join(TMP, 'no-src'), { recursive: true });
        const r = capture(() => auditCli(['--pkg', join(TMP, 'no-src')]));
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/\[codegen-audit\] .*(ENOENT|no such file)/i);
    });

    test('twin: the same in-process entry on a good package exits 0', () => {
        expect(capture(() => auditCli(['--pkg', AUDIT_SRC])).code).toBe(0);
    });
});

describe('audit — factoryReturnsType edge shapes', () => {
    /** Write a one-module package under TMP and audit it. */
    function auditOne(name, moduleSrc) {
        const pkg = join(TMP, name);
        mkdirSync(join(pkg, 'src', 'mod'), { recursive: true });
        writeFileSync(join(pkg, 'src', 'mod', 'only.js'), moduleSrc, 'utf8');
        return computeAudit(pkg);
    }

    test('a `*/ factory` with no `/**` opener anywhere → inferred (openIdx < 0)', () => {
        // The comment-close is a bare `*/` produced by a `/* … */` block that
        // was never opened with `/**`, so `lastIndexOf('/**')` misses.
        const r = auditOne(
            'no-jsdoc-open',
            [
                'export const only = {',
                "    name: 'only',",
                '    dependencies: [],',
                '    /* not jsdoc */',
                '    factory() { return { x: 1 }; },',
                '};',
                '',
            ].join('\n'),
        );
        expect(r.infer.map((x) => x.name)).toEqual(['only']);
        expect(r.infer[0].ret).toBeNull();
    });

    test('a JSDoc `@returns` with no `{` → inferred (at < 0)', () => {
        const r = auditOne(
            'returns-no-brace',
            [
                'export const only = {',
                "    name: 'only',",
                '    dependencies: [],',
                '    /**',
                '     * @returns the thing',
                '     */',
                '    factory() { return { x: 1 }; },',
                '};',
                '',
            ].join('\n'),
        );
        expect(r.infer.map((x) => x.name)).toEqual(['only']);
    });

    test('the singular `@return` spelling is honoured (`@returns?`)', () => {
        const r = auditOne(
            'return-singular',
            [
                'export const only = {',
                "    name: 'only',",
                '    dependencies: [],',
                '    /**',
                '     * @return {Object} wide on purpose',
                '     */',
                '    factory() { return { x: 1 }; },',
                '};',
                '',
            ].join('\n'),
        );
        expect(r.lossy.map((x) => x.name)).toEqual(['only']);
        expect(r.lossy[0].ret).toBe('Object');
    });

    test('nested braces are depth-balanced, not cut at the first `}`', () => {
        const r = auditOne(
            'nested-braces',
            [
                'export const only = {',
                "    name: 'only',",
                '    dependencies: [],',
                '    /**',
                '     * @returns {{ a: { b: number } }} nested',
                '     */',
                '    factory() { return { a: { b: 1 } }; },',
                '};',
                '',
            ].join('\n'),
        );
        expect(r.inline.map((x) => x.name)).toEqual(['only']);
        expect(r.inline[0].ret).toBe('{ a: { b: number } }');
    });
});

describe('audit — formatReport with empty buckets', () => {
    test('a single INFER module prints no LOSSY/INLINE table (printTable early return)', () => {
        const pkg = join(TMP, 'one-bucket');
        mkdirSync(join(pkg, 'src', 'mod'), { recursive: true });
        writeFileSync(
            join(pkg, 'src', 'mod', 'only.js'),
            [
                'export const only = {',
                "    name: 'only',",
                '    dependencies: [],',
                '    factory() { return { x: 1 }; },',
                '};',
                '',
            ].join('\n'),
            'utf8',
        );
        const text = renderAudit(pkg);
        expect(text).toContain('Factory return-type audit — 1 modules');
        expect(text).toContain('LOSSY  (wide @returns)        : 0');
        expect(text).not.toContain('LOSSY — fix these');
        expect(text).not.toContain('INLINE — promote');
        // …and the one non-empty bucket IS printed, so the negatives above are
        // not passing because the formatter printed nothing at all.
        expect(text).toContain('INFER — verify (inference may be loose)');
    });
});
