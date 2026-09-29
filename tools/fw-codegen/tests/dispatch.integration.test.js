// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/dispatch.integration.test.js
//
// CLI dispatch (src/index.ts) exit-code contract + proof the `@awacloud/tool-fw-bundler/modlib`
// substrate is consumed (no re-copied scan-modules). Dispatch is spawned (the
// entry runs process.exit on import).

import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const ENTRY = join(ROOT, 'tools', 'fw-codegen', 'src', 'index.ts');
const FW = join(ROOT, 'packages', 'front', 'fw');

function run(args) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe('fw-codegen CLI dispatch — exit codes', () => {
    test('no command → usage error, exit 2', () => {
        const r = run([]);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('missing command');
    });

    test('--help → exit 0, lists subcommands', () => {
        const r = run(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('registry');
        expect(r.stdout).toContain('deps');
    });

    test('unknown command → usage error, exit 2', () => {
        const r = run(['frobnicate']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('unknown command');
    });

    test('registry --help → exit 0 (routes into subcommand)', () => {
        const r = run(['registry', '--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('fw-codegen registry');
    });

    test('deps --help → exit 0 (routes into subcommand)', () => {
        const r = run(['deps', '--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('fw-codegen deps');
    });

    test('registry unknown flag → usage error, exit 2', () => {
        const r = run(['registry', '--bogus']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('Unknown flag');
    });

    test('deps unknown flag → usage error, exit 2', () => {
        const r = run(['deps', '--bogus']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('Unknown flag');
    });
});

describe('modlib consumption (no re-copied scan-modules)', () => {
    test('registry --check against fw resolves @awacloud/tool-fw-bundler/modlib and passes the oracle', () => {
        const r = run(['registry', '--pkg', FW, '--check']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('up to date');
    });

    test('no scan-modules.js is re-copied into this package', async () => {
        const { readdirSync, statSync } = await import('node:fs');
        const pkgSrc = join(ROOT, 'tools', 'fw-codegen', 'src');
        const walk = (dir) => {
            for (const ent of readdirSync(dir)) {
                const p = join(dir, ent);
                if (statSync(p).isDirectory()) walk(p);
                else expect(ent).not.toBe('scan-modules.js');
            }
        };
        walk(pkgSrc);
    });
});
