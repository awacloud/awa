// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/odf/tests/pack-surface.integration.test.js
//
// office/BATCH_40 task 05 — proves the npm tarball of @awacloud/odf ships
// what it owes (NOTICE, every declared `exports` target, the generated
// `dist/build` and `dist/standalone` surfaces) and nothing internal
// (TODO.md, test collateral) — against the PUBLISHED artifact (`npm pack
// --dry-run --json --ignore-scripts`), never the working tree. `files[]` is
// an allow-list: a glob that matches nothing is a defect, not a no-op.
//
// packSurface() below is the same spawn-and-parse helper as
// oconv-fonts/tests/oconv-fonts.integration.test.js:35-44 (BL-1086 closure
// evidence precedent) — one authoritative selector, never a hand-derived
// glob match.

import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const PKG_DIR = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_DIR, '../../../../');
const PKG_REL_DIR = 'packages/front/office/odf';
const PKG_JSON = JSON.parse(readFileSync(resolve(PKG_DIR, 'package.json'), 'utf8'));

/** @typedef {{files: Array<{path: string}>}} NpmPackEntry */

/**
 * Spawn the real `npm pack --dry-run --json --ignore-scripts` against the
 * package directory and return the computed tarball file-path list.
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

/**
 * Resolve one `exports` map value to its target path string (following the
 * `{"default": "..."}` conditional-exports shape used by the office `.fw.`
 * `dist` pair). Returns null when no string target can be derived.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function resolveExportTarget(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        if ('default' in value && typeof value.default === 'string') return value.default;
        const first = Object.values(value).find((v) => typeof v === 'string');
        if (first) return first;
    }
    return null;
}

/**
 * Whether a tarball path is a package-local working note: the root `TODO.md`
 * or one of the `docs/` audit / follow-up / plan-compliance page families.
 *
 * @param {string} path
 * @returns {boolean}
 */
function isWorkingNote(path) {
    return path === 'TODO.md'
        || /^docs\/(AUDIT[^/]*|DEDUPLICATION-AUDIT|FOLLOWUP[^/]*|PLAN-PATTERN-COMPLIANCE)\.md$/.test(path);
}

describe('@awacloud/odf pack surface (BL-1086 / BL-984 closure evidence)', () => {
    test('ships the mandatory package surface', () => {
        const files = packSurface();
        expect(files).toContain('package.json');
        expect(files).toContain('README.md');
        expect(files).toContain('CHANGELOG.md');
        expect(files).toContain('LICENSE');
        expect(files).toContain('NOTICE');
        expect(files).toContain('src/main.js');
    });

    test('ships no test files and no _test-runtime.js collateral', () => {
        const files = packSurface();
        expect(files.filter((f) => /\.test\.(js|html)$/.test(f))).toEqual([]);
        expect(files.filter((f) => /(^|\/)_test-runtime\.js$/.test(f))).toEqual([]);
    });

    test('excludes TODO.md and every package-local working-note page', () => {
        const files = packSurface();
        expect(files).not.toContain('TODO.md');
        // The audit / follow-up pages are no longer in the package at all (they
        // live in the repository archive), so there is no `files[]` negation to
        // read any more: the leg asserts their ABSENCE from the tarball.
        expect(files.filter(isWorkingNote), 'working-note pages in the tarball').toEqual([]);
        // Non-vacuity controls: the predicate fires on every name it must refuse,
        // and the tarball is not vacuously clean because `docs` is excluded
        // wholesale (it ships its real pages).
        for (const name of [
            'TODO.md',
            'docs/AUDIT.md',
            'docs/AUDIT2.md',
            'docs/DEDUPLICATION-AUDIT.md',
            'docs/FOLLOWUP.md',
            'docs/FOLLOWUP-RW-GAPS.md',
            'docs/PLAN-PATTERN-COMPLIANCE.md'
        ]) {
            expect(isWorkingNote(name), `control: ${name} must be recognised`).toBe(true);
        }
        for (const name of ['docs/README.md', 'docs/guide/coverage.md', 'docs/api/README.md']) {
            expect(isWorkingNote(name), `control: ${name} must not be refused`).toBe(false);
        }
        expect(files).toContain('docs/README.md');
        expect(files.some((f) => f.startsWith('docs/guide/'))).toBe(true);
        expect(files.some((f) => f.startsWith('docs/api/'))).toBe(true);
    });

    test('every declared exports target is reachable in the tarball', () => {
        const files = packSurface();
        const specifiers = Object.entries(PKG_JSON.exports ?? {});
        expect(specifiers.length).toBeGreaterThan(0);
        for (const [specifier, value] of specifiers) {
            const target = resolveExportTarget(value);
            if (!target) continue;
            const relative = target.replace(/^\.\//, '');
            if (relative.includes('*')) {
                const prefix = relative.split('*')[0];
                const hasMatch = files.some((f) => f.startsWith(prefix));
                expect(hasMatch, `pattern export "${specifier}" -> "${relative}" has no listed path under "${prefix}"`).toBe(true);
            } else {
                expect(files, `literal export "${specifier}" -> "${relative}"`).toContain(relative);
            }
        }
        expect(files.some((f) => f.startsWith('dist/build/'))).toBe(true);
        expect(files.some((f) => f.startsWith('dist/standalone/'))).toBe(true);
    });

    test('ships every license-templates.json attribution text path for this package', () => {
        const files = packSurface();
        const licenseTemplates = JSON.parse(
            readFileSync(resolve(REPO_ROOT, 'docs/publication/license-templates.json'), 'utf8')
        );
        const attributions = licenseTemplates.notice?.attributions?.[PKG_REL_DIR] ?? [];
        for (const attr of attributions) {
            const textPath = attr.text.replace(`${PKG_REL_DIR}/`, '');
            expect(files, `attribution "${attr.component}" text path`).toContain(textPath);
        }
    });
});
