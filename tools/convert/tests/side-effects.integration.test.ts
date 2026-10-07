// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/side-effects.integration.test.ts — the evidence behind
 * `"sideEffects": false` in `package.json`.
 *
 * Importing the package's `.` export (`src/core.ts`) must do nothing
 * observable: no output on stdout or stderr, no new global, and nothing but
 * the documented exports. Each check runs in a FRESH process, so no earlier
 * import in this test run can hide an effect. It runs on every available
 * runtime of the CLI matrix; an absent runtime is skipped, never passed.
 *
 * The two entry points (`src/index.ts`, `src/mcp.ts`) act only under an
 * `import.meta.main` guard; importing `src/mcp.ts` is checked here too.
 */

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = join(import.meta.dir, '..', 'src');

function available(bin: string): boolean {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    return r.error === undefined && r.status === 0;
}

function probe(bin: 'bun' | 'node', file: string): { status: number | null; stdout: string; stderr: string } {
    const script =
        `const before = new Set(Object.getOwnPropertyNames(globalThis));` +
        `const mod = await import(${JSON.stringify(pathToFileURL(file).href)});` +
        `const added = Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k));` +
        `process.stdout.write(JSON.stringify({ exports: Object.keys(mod).sort(), added }));`;
    const args = bin === 'node' ? ['--input-type=module', '-e', script] : ['-e', script];
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('importing the package has no side effect', () => {
    for (const bin of ['bun', 'node'] as const) {
        const t = available(bin) ? test : test.skip;

        t(`${bin}: src/core.ts adds no global and writes nothing`, () => {
            const r = probe(bin, join(SRC, 'core.ts'));
            expect(r.stderr).toBe('');
            expect(r.status).toBe(0);
            expect(JSON.parse(r.stdout)).toEqual({
                exports: ['CONVERT_PAIRS', 'FROM_MD_TARGETS', 'TO_MD_FORMATS', 'convert', 'fromMd', 'isCoreError', 'toHtml', 'toMd'],
                added: [],
            });
        }, 30_000);
    }

    test('bun: src/mcp.ts does not start the server when imported', () => {
        const r = probe('bun', join(SRC, 'mcp.ts'));
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(JSON.parse(r.stdout).added).toEqual([]);
    }, 30_000);
});
