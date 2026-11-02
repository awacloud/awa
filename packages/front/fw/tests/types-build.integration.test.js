// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the fw type build stays green
 * (`fw/LIGHT_4` task 01, BL-2856).
 *
 * `tsconfig.types.json` is the build that emits the published `.d.ts` tree
 * (`bun run types`, and the types step of `tools/pkg-export build`). No fw
 * test ran it, so a `[...input.files]` spread over a `FileList` (TS2488 under
 * `lib: ["ESNext", "DOM"]`, no `DOM.Iterable`) reached master unseen and broke
 * the publication build. This test runs the same project with `--noEmit` and
 * requires zero diagnostics.
 *
 * The compiler is the workspace's INSTALLED TypeScript, resolved from
 * `node_modules` and run by the current runtime: never `bunx` / `npx`, which
 * could fall back to a network download. A missing compiler is a failure
 * naming `bun install`, not a skip.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG  = join(HERE, '..');

/**
 * Locate the installed `tsc` entry script, or `null` when TypeScript is not
 * installed in the workspace.
 *
 * @returns {string|null} Absolute path of `typescript/bin/tsc`.
 */
function resolveTsc() {
    try {
        const pkgJson = createRequire(join(PKG, 'package.json')).resolve('typescript/package.json');
        const bin = join(dirname(pkgJson), 'bin', 'tsc');
        return existsSync(bin) ? bin : null;
    } catch {
        return null;
    }
}

describe('fw type build (tsconfig.types.json)', () => {
    test('tsc --noEmit reports no diagnostic', () => {
        const tsc = resolveTsc();
        if (!tsc) {
            throw new Error('TypeScript is not installed in the workspace: run `bun install` at the repository root');
        }
        const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.types.json', '--noEmit', '--pretty', 'false'], {
            cwd: PKG,
            encoding: 'utf8',
            timeout: 120_000,
        });
        const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
        const diagnostics = out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
        if (res.status !== 0 || diagnostics.length) {
            console.error(`[types-build] tsc exit ${res.status}\n${out}`);
        }
        expect(diagnostics).toEqual([]);
        expect(res.status).toBe(0);
    }, 120_000);
});
