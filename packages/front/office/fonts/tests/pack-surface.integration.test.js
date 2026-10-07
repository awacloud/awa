// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/fonts/tests/pack-surface.integration.test.js
//
// office/BATCH_40 task 05 — proves the npm tarball of @awacloud/fonts ships
// what it owes (NOTICE, the Adobe Core 14 AFM notice the fonts NOTICE points
// at, every declared `exports` target, the generated `dist/build` and
// `dist/standalone` surfaces, the generated standard-14 widths table) and
// nothing internal (TODO.md, `.test.js`/`.test.html` files, the eleven
// `_test-runtime.js` scaffolds, the six vendored `.afm` source files
// themselves — BL-984: AFM-derived data ships WITH Adobe's notice, the AFMs
// do not ship) — against the PUBLISHED artifact (`npm pack --dry-run --json
// --ignore-scripts`), never the working tree. `files[]` is an allow-list: a
// glob that matches nothing is a defect, not a no-op.
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
const PKG_REL_DIR = 'packages/front/office/fonts';
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

describe('@awacloud/fonts pack surface (BL-1086 / BL-984 closure evidence)', () => {
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

    // The package-local TODO / audit / follow-up / plan documents are working
    // files, not part of the published artifact. They are no longer in the
    // package directory at all, and `files[]` carries no negation for them: the
    // tarball must simply not list one. The matcher is the same one the
    // non-vacuity control below runs against a synthetic listing.
    const INTERNAL_DOC_PATTERNS = [
        /^TODO\.md$/,
        /^docs\/AUDIT[^/]*\.md$/,
        /^docs\/FOLLOWUP[^/]*\.md$/,
        /^docs\/PLAN-PATTERN-COMPLIANCE\.md$/,
        /^docs\/DEDUPLICATION-AUDIT\.md$/,
    ];

    /** @param {string[]} files */
    function internalDocsIn(files) {
        return files.filter((f) => INTERNAL_DOC_PATTERNS.some((re) => re.test(f)));
    }

    test('excludes TODO.md and every package-local audit / follow-up / plan page', () => {
        const files = packSurface();
        expect(files).not.toContain('TODO.md');
        expect(internalDocsIn(files)).toEqual([]);
        // `docs` itself still ships: the absence above is not an empty docs tree.
        expect(files).toContain('docs/README.md');
        // `files[]` carries no `!docs/...` negation any more.
        expect(PKG_JSON.files.filter((entry) => /^!docs\//.test(entry))).toEqual([]);
    });

    test('non-vacuity control: the internal-doc matcher fires on every excluded path', () => {
        const synthetic = [
            'package.json',
            'docs/README.md',
            'TODO.md',
            'docs/AUDIT.md',
            'docs/AUDIT2.md',
            'docs/FOLLOWUP.md',
            'docs/FOLLOWUP-OTHER.md',
            'docs/PLAN-PATTERN-COMPLIANCE.md',
            'docs/DEDUPLICATION-AUDIT.md',
        ];
        expect(internalDocsIn(synthetic)).toEqual(synthetic.slice(2));
        expect(() => expect(internalDocsIn(synthetic)).toEqual([])).toThrow();
        // and it stays quiet on shipped documentation pages
        expect(internalDocsIn(['docs/api/errors.md', 'docs/guide/getting-started.md', 'README.md'])).toEqual([]);
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
        expect(attributions.length).toBeGreaterThan(0);
        for (const attr of attributions) {
            const textPath = attr.text.replace(`${PKG_REL_DIR}/`, '');
            expect(files, `attribution "${attr.component}" text path`).toContain(textPath);
        }
    });

    test('ships the Adobe AFM notice and the generated standard-14 widths table, but no .afm source', () => {
        const files = packSurface();
        expect(files).toContain('vendor/afm/NOTICE-adobe-afm.html');
        expect(files).toContain('src/standard14/_widths.generated.js');
        expect(files.filter((f) => f.endsWith('.afm'))).toEqual([]);
    });

    // BL-1687 (office/BATCH_49): the fonts NOTICE points at this licence text
    // ("licence text: third-party/NOTICE-adobe-glyph-list"), so it must travel
    // in the tarball. Pinned literally, not only via the license-templates leg.
    const AGL_NOTICE = 'third-party/NOTICE-adobe-glyph-list';

    test('ships the Adobe Glyph List notice the NOTICE points at', () => {
        const files = packSurface();
        expect(files).toContain(AGL_NOTICE);
        const notice = readFileSync(resolve(PKG_DIR, 'NOTICE'), 'utf8');
        expect(notice).toContain(AGL_NOTICE);
    });

    test('non-vacuity control: the AGL pin fails against a listing without that entry', () => {
        const files = packSurface();
        const filtered = files.filter((f) => f !== AGL_NOTICE);
        expect(filtered.length).toBe(files.length - 1);
        expect(() => expect(filtered).toContain(AGL_NOTICE)).toThrow();
    });
});
