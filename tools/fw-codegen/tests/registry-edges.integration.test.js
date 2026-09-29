// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/registry-edges.integration.test.js
//
// Refusal branches of the `registry` subcommand, driven IN-PROCESS (a spawned
// CLI contributes no instrumentation to the parent `--coverage` run — see
// ai/memory/types/tools.md 2026-08-29). Every refusal is asserted on its
// DIAGNOSTIC (message shape + exit code), and each one is paired with the
// nearest-neighbour case that must still succeed.
//
// Branches targeted:
//   src/registry/index.js:135-140  renderRegistry() throws on an unparseable file
//   src/registry/index.js:159-165  runCli() reports unparseable → exit 1
//   src/registry/index.js:112-114  non-identifier module name → quoted key
//   modlib/scan-modules.js:161-168 parseFile → `_unparseable: true`
//   modlib/scan-modules.js:218-227 scanAll → unparseable bucket + duplicate throw

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { scanAll } from '@awacloud/tool-fw-bundler/modlib';
import { renderRegistry, runCli as regCli } from '../src/registry/index.js';

const FIXTURES = join(import.meta.dir, '__fixtures__');
const UNPARSEABLE = join(FIXTURES, 'edge-unparseable');
const DUP = join(FIXTURES, 'edge-dup');
const MINI = join(FIXTURES, 'mini-fw');
const TMP = join(import.meta.dir, 'tmp', 'registry-edges');

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

/**
 * Run `fn` with console/stdout captured so an in-process CLI call can be
 * asserted on its DIAGNOSTIC as well as its exit code. Restores the real
 * sinks even when `fn` throws.
 */
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

describe('registry — unparseable module file', () => {
    test('the fixture really is what modlib calls unparseable (non-vacuity)', () => {
        // Guard: if modlib ever stopped flagging this shape, every refusal
        // assertion below would pass for the wrong reason.
        const { byName, unparseable } = scanAll(join(UNPARSEABLE, 'src'));
        expect(unparseable.map((u) => u.moduleName)).toEqual(['broken']);
        expect(unparseable[0]._unparseable).toBe(true);
        expect([...byName.keys()]).toEqual(['fine']);
    });

    test('renderRegistry() throws naming the offending file — exit path 135-140', () => {
        expect(() => renderRegistry(UNPARSEABLE)).toThrow(
            /\[codegen-types\] 1 file\(s\) could not be parsed/,
        );
        expect(() => renderRegistry(UNPARSEABLE)).toThrow(/broken\.js/);
    });

    test('runCli reports the unparseable file and exits 1 — exit path 159-165', () => {
        const r = capture(() => regCli(['--pkg', UNPARSEABLE]));
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/\[codegen-types\] 1 file\(s\) could not be parsed/);
        expect(r.stderr).toMatch(/broken\.js/);
        // Refusal is total: nothing was written on the way out.
        expect(existsSync(join(UNPARSEABLE, 'types'))).toBe(false);
    });

    test('twin: the same call on a clean package still writes and exits 0', () => {
        // Nearest neighbour — proves the exit 1 above is about the unparseable
        // file, not about the fixture path or the --pkg seam.
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'clean');
        cpSync(MINI, pkg, { recursive: true });
        const r = capture(() => regCli(['--pkg', pkg]));
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/wrote .*registry\.generated\.d\.ts \(2 modules\)/);
        expect(existsSync(join(pkg, 'types', 'registry.generated.d.ts'))).toBe(true);
    });
});

describe('registry — duplicate module name (shared scanner contract)', () => {
    test('renderRegistry() propagates scanAll\'s duplicate-name throw', () => {
        expect(() => renderRegistry(DUP)).toThrow(
            /\[scan-modules\] duplicate module name "twin"/,
        );
    });

    test('twin: two DISTINCT names in the same shape render fine', () => {
        // Nearest neighbour — the throw is about the collision, not about a
        // two-module fixture.
        const { text, moduleCount } = renderRegistry(MINI);
        expect(moduleCount).toBe(2);
        expect(text).toContain('alpha:');
        expect(text).toContain('beta:');
    });
});

describe('registry — non-identifier module names are quoted', () => {
    test('a module named `io-hex` renders as a quoted key — render() 112-114', () => {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'quoted');
        cpSync(MINI, pkg, { recursive: true });
        const modFile = join(pkg, 'src', 'mod', 'alpha.js');
        writeFileSync(
            modFile,
            readFileSync(modFile, 'utf8').replace("name: 'alpha'", "name: 'io-hex'"),
            'utf8',
        );

        const { text } = renderRegistry(pkg);
        expect(text).toContain("    'io-hex': ReturnType<");
        // …and the sibling identifier-shaped name in the SAME render is NOT
        // quoted, so the assertion cannot pass by quoting everything.
        expect(text).toContain('    beta: ReturnType<');
        expect(text).not.toContain("'beta':");
    });
});

describe('registry — types/ is created on demand', () => {
    test('write succeeds on a package with no types/ dir yet', () => {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'no-types');
        cpSync(MINI, pkg, { recursive: true });
        rmSync(join(pkg, 'types'), { recursive: true, force: true });
        expect(existsSync(join(pkg, 'types'))).toBe(false);

        const r = capture(() => regCli(['--pkg', pkg]));
        expect(r.code).toBe(0);
        expect(existsSync(resolve(pkg, 'types', 'registry.generated.d.ts'))).toBe(true);
    });
});
