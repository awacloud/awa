// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oview/tests/pack-surface.integration.test.js
//
// Proves the npm tarball of @awacloud/oview ships what it owes (the licence
// pair, README, CHANGELOG, docs, the entry, the controller, the element, the
// two sheets) and nothing internal (no test file, no `tests/`, no
// `examples/`) — against the PUBLISHED artifact (`npm pack --dry-run --json
// --ignore-scripts`), never the working tree. `files[]` is an allow-list.
// Then the exports map: every target exists on disk, and the package entry
// yields exactly its documented named exports.

import { describe, test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PKG_DIR = resolve(import.meta.dir, '..');
const PKG_JSON = JSON.parse(readFileSync(resolve(PKG_DIR, 'package.json'), 'utf8'));

/** @typedef {{files: Array<{path: string}>}} NpmPackEntry */

/**
 * Run the real `npm pack --dry-run --json --ignore-scripts` in the package
 * directory (argv array, no shell) and return the tarball's file paths.
 *
 * @returns {string[]}
 */
function packSurface() {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: PKG_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    /** @type {NpmPackEntry[]} */
    const parsed = JSON.parse(out);
    return parsed[0].files.map((f) => f.path.replace(/\\/g, '/'));
}

describe('@awacloud/oview pack surface', () => {
    const files = packSurface();

    test('ships the licence pair, the documents, the entry and the component', () => {
        for (const path of [
            'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'docs/README.md', 'docs/design.md',
            'src/main.js', 'src/viewer.js', 'src/element.js', 'src/styles/viewer.css', 'src/styles/tokens.css',
            'src/cascade.js', 'src/render/docx-style.js', 'src/render/odf-style.js'
        ]) {
            expect(files, path).toContain(path);
        }
    });

    test('ships no test file, no tests/ and no examples/ path', () => {
        expect(files.filter((f) => f.endsWith('.test.js'))).toEqual([]);
        expect(files.filter((f) => f.startsWith('tests/'))).toEqual([]);
        expect(files.filter((f) => f.startsWith('examples/'))).toEqual([]);
    });
});

describe('@awacloud/oview exports map', () => {
    test('every exports target exists on disk', () => {
        const targets = Object.entries(PKG_JSON.exports);
        expect(targets.length).toBeGreaterThan(0);
        for (const [specifier, target] of targets) {
            expect(existsSync(resolve(PKG_DIR, String(target))), `${specifier} -> ${target}`).toBe(true);
        }
    });

    test('the package entry yields exactly its named exports', async () => {
        const mod = await import('@awacloud/oview');
        expect(Object.keys(mod).sort()).toEqual(
            ['mountViewer', 'MAX_DOCUMENT_BYTES', 'detect', 'negotiateLocale', 'LOCALES', 'defineViewerElement'].sort()
        );
    });

    test('the cascade sub-path is exported and yields exactly its named exports', async () => {
        expect(PKG_JSON.exports['./cascade.js']).toBe('./src/cascade.js');
        const mod = await import('@awacloud/oview/cascade.js');
        expect(Object.keys(mod).sort()).toEqual([
            'createDocxCascade', 'mergeDocxProps', 'docxRunCss', 'docxParagraphCss',
            'createOdfCascade', 'odfTextCss', 'odfParagraphCss', 'odfBoxCss', 'odfCellCss'
        ].sort());
    });
});
