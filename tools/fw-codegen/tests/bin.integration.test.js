// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/bin.integration.test.js
//
// BL-642 (O4 ruling): `bin/fw-codegen.ts` is a thin delegate to
// `src/index.ts` (a bare side-effect import — no argument parsing
// duplicated). Asserts the delegate preserves the tool's exit-code contract
// exactly: 0 on --help, 2 on an unknown subcommand.

import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const BIN = join(ROOT, 'tools', 'fw-codegen', 'bin', 'fw-codegen.ts');

function run(args) {
    const p = Bun.spawnSync(['bun', BIN, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return {
        code: p.exitCode,
        stdout: p.stdout.toString(),
        stderr: p.stderr.toString(),
    };
}

describe('fw-codegen standalone bin — exit-code contract preserved', () => {
    test('--help → exit 0', () => {
        const r = run(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('registry');
    });

    test('unknown subcommand → exit 2', () => {
        const r = run(['frobnicate']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('unknown command');
    });

    test('no command → exit 2', () => {
        const r = run([]);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('missing command');
    });
});
