// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/pack-surface.integration.test.ts
//
// BL-641 regression: `@awacloud/tool-fw-bundler` declared no `files`
// allowlist, so npm's default rule shipped the entire working tree minus
// `.gitignore` — 46 packed files including 8 test files and 15
// `tests/__fixtures__/**` golden fixtures ("the single highest-priority
// actionable gap found in this spike" — `02-subrepo-content-shape/FINDINGS.md`).
//
// This spawns the real `npm pack --dry-run --json --ignore-scripts` (the
// authoritative selector — W0 constraint 6) against the package directory and
// asserts the computed surface carries no `tests/` path and no
// `__fixtures__/` path. `--ignore-scripts` is required (W0 constraint 6);
// there is no `prepack` on this package today, but the flag is part of the
// measurement discipline regardless.

import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const PKG_DIR = resolve(import.meta.dir, '..');

interface NpmPackEntry {
    files: Array<{ path: string }>;
}

function packSurface(): string[] {
    const p = Bun.spawnSync(
        ['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'],
        { cwd: PKG_DIR, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(p.exitCode).toBe(0);
    const parsed = JSON.parse(p.stdout.toString()) as NpmPackEntry[];
    return parsed[0]!.files.map((f) => f.path);
}

describe('tool-fw-bundler pack surface (BL-641 regression)', () => {
    test('ships no tests/ path', () => {
        const files = packSurface();
        const testPaths = files.filter((f) => f.startsWith('tests/'));
        expect(testPaths).toEqual([]);
    });

    test('ships no __fixtures__/ path', () => {
        const files = packSurface();
        const fixturePaths = files.filter((f) => f.includes('__fixtures__/'));
        expect(fixturePaths).toEqual([]);
    });

    test('still ships the declared consumer surface', () => {
        const files = packSurface();
        expect(files).toContain('package.json');
        expect(files).toContain('src/index.ts');
        expect(files).toContain('bin/fw-bundler.ts');
        expect(files).toContain('README.md');
    });
});
