// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv-fonts/tests/oconv-fonts.integration.test.js
//
// Guards the PUBLISHED pack surface (`npm pack --dry-run --json`), not the
// working tree: a `files` allowlist that omits `NOTICE` would silently drop
// the OFL obligation from the tarball (origin: BL-1086).

import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const PKG_DIR = resolve(import.meta.dir, '..');

/** @typedef {{files: Array<{path: string}>}} NpmPackEntry */

/**
 * Spawn the real `npm pack --dry-run --json --ignore-scripts` against the
 * package directory and return the computed tarball file-path list — the
 * authoritative selector, not a hand-derived glob match.
 *
 * @returns {string[]}
 */
function packSurface() {
    const p = Bun.spawnSync(
        ['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'],
        { cwd: PKG_DIR, stdout: 'pipe', stderr: 'pipe' }
    );
    expect(p.exitCode).toBe(0);
    /** @type {NpmPackEntry[]} */
    const parsed = JSON.parse(p.stdout.toString());
    return parsed[0].files.map((f) => f.path);
}

const VENDORED_TTF_PATHS = [
    'vendor/liberation/LiberationMono-Bold.ttf',
    'vendor/liberation/LiberationMono-BoldItalic.ttf',
    'vendor/liberation/LiberationMono-Italic.ttf',
    'vendor/liberation/LiberationMono-Regular.ttf',
    'vendor/liberation/LiberationSans-Bold.ttf',
    'vendor/liberation/LiberationSans-BoldItalic.ttf',
    'vendor/liberation/LiberationSans-Italic.ttf',
    'vendor/liberation/LiberationSans-Regular.ttf',
    'vendor/liberation/LiberationSerif-Bold.ttf',
    'vendor/liberation/LiberationSerif-BoldItalic.ttf',
    'vendor/liberation/LiberationSerif-Italic.ttf',
    'vendor/liberation/LiberationSerif-Regular.ttf'
];

describe('oconv-fonts pack surface', () => {
    test('ships NOTICE and LICENSE', () => {
        const files = packSurface();
        expect(files).toContain('NOTICE');
        expect(files).toContain('LICENSE');
    });

    test('ships README.md and CHANGELOG.md', () => {
        const files = packSurface();
        expect(files).toContain('README.md');
        expect(files).toContain('CHANGELOG.md');
    });

    test('ships all 12 vendored Liberation .ttf faces', () => {
        const files = packSurface();
        for (const path of VENDORED_TTF_PATHS) {
            expect(files).toContain(path);
        }
    });

    test('ships the vendor licence and provenance files', () => {
        const files = packSurface();
        expect(files).toContain('vendor/OFL.txt');
        expect(files).toContain('vendor/NOTICE-liberation');
        expect(files).toContain('vendor/PROVENANCE.json');
    });

    test('ships no *.test.js path', () => {
        const files = packSurface();
        const testPaths = files.filter((f) => f.endsWith('.test.js'));
        expect(testPaths).toEqual([]);
    });
});
