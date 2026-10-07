// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/ooxml/tests/pack-surface.integration.test.js
//
// office/BATCH_40 task 05 — proves the npm tarball of @awacloud/ooxml ships
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
const PKG_REL_DIR = 'packages/front/office/ooxml';
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
 * The package-local working files that must never reach a tarball:
 * `TODO.md`, `docs/AUDIT*.md`, `docs/DEDUPLICATION-AUDIT.md`,
 * `docs/FOLLOWUP*.md` and `docs/PLAN-PATTERN-COMPLIANCE.md`.
 *
 * @param {string[]} files tarball file paths
 * @returns {string[]} the listed paths that match
 */
function internalPages(files) {
    const internal = /^(TODO\.md|docs\/(AUDIT[^/]*\.md|DEDUPLICATION-AUDIT\.md|FOLLOWUP[^/]*\.md|PLAN-PATTERN-COMPLIANCE\.md))$/;
    return files.filter((f) => internal.test(f));
}

describe('@awacloud/ooxml pack surface (BL-1086 / BL-984 closure evidence)', () => {
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

    test('ships no package-local working file (TODO, audit, follow-up, plan-compliance pages)', () => {
        const files = packSurface();
        expect(files).not.toContain('TODO.md');
        expect(internalPages(files)).toEqual([]);
        // Non-vacuity: the docs glob is alive (shipped pages ARE listed), and
        // the matcher fires on every internal-page shape it guards while it
        // leaves shipped pages alone.
        expect(files).toContain('docs/README.md');
        expect(
            internalPages([
                'TODO.md',
                'docs/AUDIT.md',
                'docs/AUDIT2.md',
                'docs/DEDUPLICATION-AUDIT.md',
                'docs/FOLLOWUP.md',
                'docs/FOLLOWUP-RW-GAPS.md',
                'docs/PLAN-PATTERN-COMPLIANCE.md',
                'docs/README.md',
                'docs/guide/getting-started.md',
            ]),
        ).toEqual([
            'TODO.md',
            'docs/AUDIT.md',
            'docs/AUDIT2.md',
            'docs/DEDUPLICATION-AUDIT.md',
            'docs/FOLLOWUP.md',
            'docs/FOLLOWUP-RW-GAPS.md',
            'docs/PLAN-PATTERN-COMPLIANCE.md',
        ]);
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
