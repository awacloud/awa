// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/wasm-crypto/tests/bin.integration.test.ts
//
// BL-642 (O4 ruling): `bin/wasm-crypto.ts` is a thin delegate to the
// exported `run()` in `src/index.ts` (`../src/index.ts` gates its own
// dispatch behind `import.meta.main`, so a bare side-effect import would not
// run it when re-imported from `bin/`). Asserts the delegate preserves
// wasm-crypto's OWN exit-code contract exactly.
//
// Note: unlike fw-bundler/fw-codegen (which map an unknown subcommand to the
// generic usage code 2), wasm-crypto's own `run()` maps a missing or unknown
// subcommand to `1` (`src/index.ts`: "wasm-crypto: unknown subcommand …" /
// "missing subcommand" both `return 1`) — this is the tool's own, pre-existing
// choice, not a defect of the wrapper. "Preserving the tool's exit codes
// exactly" (the plan's own delegation rule) means the wrapper must reproduce
// `1` here, not the `2` a generic template might expect.

import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const BIN = join(ROOT, 'tools', 'wasm-crypto', 'bin', 'wasm-crypto.ts');

function run(args: string[]) {
    const p = Bun.spawnSync(['bun', BIN, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return {
        code: p.exitCode,
        stdout: p.stdout.toString(),
        stderr: p.stderr.toString(),
    };
}

describe('wasm-crypto standalone bin — exit-code contract preserved', () => {
    test('--help → exit 0', () => {
        const r = run(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('Subcommands');
    });

    test('unknown subcommand → exit 1 (wasm-crypto\'s own contract, not the generic 2)', () => {
        const r = run(['frobnicate']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('unknown subcommand');
    });

    test('no subcommand → exit 1', () => {
        const r = run([]);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('missing subcommand');
    });
});
