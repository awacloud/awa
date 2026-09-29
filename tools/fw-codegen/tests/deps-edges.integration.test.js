// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-edges.integration.test.js
//
// Reporting / refusal branches of the `deps` subcommand, driven IN-PROCESS (a
// spawned CLI contributes no instrumentation to the parent `--coverage` run).
// Every refusal is asserted on its DIAGNOSTIC and paired with the nearest
// neighbour that must still pass.
//
// Branches targeted:
//   src/deps/index.js:88-94    parseArgs value() — a flag with no value → exit 2
//   src/deps/index.js:103      positional argument → exit 2
//   src/deps/index.js:184-187  filterScan keeps a NON-ignored unparseable entry
//   src/deps/index.js:383-387  topLevelBindings namespace / default+namespace
//   src/deps/index.js:815-820  resolveExpectedIdentifiers unresolved push
//   src/deps/index.js:932-935  runCli non-canonical-shape warning loop
//   src/deps/index.js:938-944  runCli reportSkips body
//   src/deps/index.js:980-985  runCli --dry-run per-module listing
//
// Nothing here ever writes to a committed fixture: the write path runs on a
// copy under the gitignored tests/tmp/, everything else uses --check or
// --dry-run, which the frozen contract pins as read-only.

import { describe, test, expect, afterAll } from 'bun:test';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';

import { planDeps, filterScan, runCli as depsCli } from '../src/deps/index.js';

const FIXTURES = join(import.meta.dir, '__fixtures__');
const UNPARSEABLE = join(FIXTURES, 'edge-unparseable');
const UNRESOLVED = join(FIXTURES, 'edge-unresolved');
const DRIFT = join(FIXTURES, 'edge-drift');
const BINDINGS = join(FIXTURES, 'edge-bindings');
const DEPS_SRC = join(FIXTURES, 'deps-src');
const TMP = join(import.meta.dir, 'tmp', 'deps-edges');

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

describe('deps — parseArgs refuses malformed argv', () => {
    test('--pkg with no value → exit 2, named diagnostic', () => {
        const r = capture(() => depsCli(['--pkg']));
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/\[codegen-deps\] Flag --pkg requires a value\./);
    });

    test('--src swallowed by the next flag → exit 2 (a flag is not a value)', () => {
        const r = capture(() => depsCli(['--src', '--check']));
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/\[codegen-deps\] Flag --src requires a value\./);
    });

    test('--ignore with no value → exit 2', () => {
        const r = capture(() => depsCli(['--ignore']));
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/\[codegen-deps\] Flag --ignore requires a value\./);
    });

    test('a positional argument → exit 2', () => {
        const r = capture(() => depsCli(['extra']));
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/\[codegen-deps\] Unexpected positional argument: extra/);
    });

    test('twin: the SAME flags with values parse and run — exit 0', () => {
        // Nearest neighbour: proves the exit 2s above are about the missing
        // value, not about the flag being rejected outright.
        const r = capture(() => depsCli(['--check', '--pkg', DEPS_SRC, '--ignore', 'nothing/**']));
        expect(r.code).toBe(1); // deps-src is deliberately missing gamma's deps
        expect(r.stderr).toMatch(/FAIL : 1 module\(s\) missing `deps` field/);
        const s = capture(() => depsCli(['--check', '--src', join(BINDINGS, 'src')]));
        expect(s.code).toBe(1);
        expect(s.stdout).toMatch(/scanned 1 pending module\(s\)/);
    });
});

describe('deps — a non-canonical (unparseable) module file', () => {
    test('filterScan keeps it when no ignore glob matches — 184-187', () => {
        const { unparseable, ignored, byName } = filterScan(
            {
                byFile: new Map(),
                unparseable: [{ file: join(UNPARSEABLE, 'src', 'mod', 'broken.js') }],
            },
            join(UNPARSEABLE, 'src'),
        );
        expect(unparseable).toHaveLength(1);
        expect(ignored).toEqual([]);
        expect(byName.size).toBe(0);
    });

    test('twin: an ignore glob moves the SAME entry to `ignored`', () => {
        const { unparseable, ignored } = filterScan(
            {
                byFile: new Map(),
                unparseable: [{ file: join(UNPARSEABLE, 'src', 'mod', 'broken.js') }],
            },
            join(UNPARSEABLE, 'src'),
            ['mod/broken.js'],
        );
        expect(unparseable).toEqual([]);
        expect(ignored).toHaveLength(1);
    });

    test('planDeps reports it without planning a rewrite for it', () => {
        const { plan, unparseable } = planDeps({ pkg: UNPARSEABLE });
        expect(unparseable.map((u) => u.moduleName)).toEqual(['broken']);
        expect(plan).toEqual([]);
    });

    test('runCli warns `non-canonical shape — left untouched` and still exits 0 — 932-935', () => {
        const r = capture(() => depsCli(['--check', '--pkg', UNPARSEABLE]));
        expect(r.code).toBe(0);
        expect(r.stderr).toMatch(/1 file\(s\) had a non-canonical shape — left untouched:/);
        expect(r.stderr).toMatch(/broken\.js/);
        expect(r.stdout).toMatch(/OK : every module with non-empty dependencies has a matching deps field/);
    });

    test('twin: a package with no unparseable file emits no such warning', () => {
        const r = capture(() => depsCli(['--check', '--pkg', DRIFT]));
        expect(r.stderr).not.toMatch(/non-canonical shape/);
    });
});

describe('deps — unresolvable dependency names are SKIPPED and reported', () => {
    test('--check lists the skipped module with its missing name — 938-944', () => {
        const r = capture(() => depsCli(['--check', '--pkg', UNRESOLVED]));
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/FAIL : 1 module\(s\) missing `deps` field/);
        expect(r.stderr).toMatch(/1 module\(s\) SKIPPED — unresolvable dependency:/);
        expect(r.stderr).toMatch(/- needs {2}\(.*needs\.js\) {2}missing: ghost/);
        // `solid` resolves fully, so it is NOT in the skip list — the report is
        // per-module, not a blanket failure.
        expect(r.stderr).not.toMatch(/- solid/);
    });

    test('planDeps agrees: exactly one unresolved entry, empty plan', () => {
        const { plan, unresolved } = planDeps({ pkg: UNRESOLVED });
        expect(plan).toEqual([]);
        expect(unresolved.map((u) => u.moduleName)).toEqual(['needs']);
        expect(unresolved[0].missing).toEqual(['ghost']);
    });
});

describe('deps — content drift whose expectation cannot be re-derived', () => {
    test('--check reports `(unresolvable)` for the expected side — 815-820', () => {
        const r = capture(() => depsCli(['--check', '--pkg', DRIFT]));
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/FAIL : 1 module\(s\) have a stale `deps` field/);
        expect(r.stderr).toMatch(/expected: \[\] {2}\(unresolvable\)/);
        expect(r.stderr).toMatch(/found: {4}\[alpha\]/);
    });

    test('planDeps exposes the same row programmatically', () => {
        const { contentDrift } = planDeps({ pkg: DRIFT });
        expect(contentDrift.map((d) => d.moduleName)).toEqual(['populated']);
        expect(contentDrift[0].expected).toBeNull();
        expect(contentDrift[0].found).toEqual(['alpha']);
    });

    test('twin: a package with no populated module reports no drift', () => {
        expect(planDeps({ pkg: DEPS_SRC }).contentDrift).toEqual([]);
    });
});

describe('deps — namespace imports count as top-level bindings (A3 oracle)', () => {
    test('--dry-run plans nsimport and adds ZERO imports — 383-387 + 980-985', () => {
        const r = capture(() => depsCli(['--dry-run', '--pkg', BINDINGS]));
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/1 module\(s\) to update \(dry-run\)/);
        expect(r.stdout).toMatch(/── nsimport {2}\(.*nsimport\.js\)/);
        // `alpha` is already imported, so the plan adds no import statement —
        // and the A3 phantom guard clears it through `topLevelBindings`.
        expect(r.stdout).toMatch(/\+ 0 import\(s\), deps: \[alpha\]/);
    });

    test('the dry run wrote nothing: the fixture is byte-unchanged', () => {
        const before = readFileSync(join(BINDINGS, 'src', 'mod', 'nsimport.js'), 'utf8');
        capture(() => depsCli(['--dry-run', '--pkg', BINDINGS]));
        expect(readFileSync(join(BINDINGS, 'src', 'mod', 'nsimport.js'), 'utf8')).toBe(before);
    });

    test('twin: the real write on a COPY injects `deps: [alpha]` and no import', () => {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(TMP, { recursive: true });
        const pkg = join(TMP, 'bindings');
        cpSync(BINDINGS, pkg, { recursive: true });
        const r = capture(() => depsCli(['--pkg', pkg]));
        expect(r.code).toBe(0);
        const written = readFileSync(join(pkg, 'src', 'mod', 'nsimport.js'), 'utf8');
        expect(written).toContain('deps: [alpha],');
        // The namespace imports survived untouched — no duplicate import line.
        // Anchored at column 0: the fixture's header comment quotes both forms.
        expect(written.match(/^import \* as helpers from/gm)).toHaveLength(1);
        expect(written.match(/^import base, \* as extras from/gm)).toHaveLength(1);
        expect(written.match(/^import \{ alpha \} from/gm)).toHaveLength(1);
    });
});
