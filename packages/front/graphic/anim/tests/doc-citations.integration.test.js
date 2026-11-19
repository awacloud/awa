// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Path citations in the package resolve.
 *
 * Comments and pages cite repository files in backticks (a spike, a
 * convention page, a plan). When a cited file moves, the citation dangles
 * silently. This test scans the package's shipped trees for backtick-quoted
 * paths under `ai/`, `docs/`, `spikes/`, `packages/`, `apps/` and `tools/`
 * that end in a file extension or `/` (an optional `:line` suffix is
 * dropped), and requires each one to exist in the package or in the
 * repository. Brace or glob forms are skipped. One prefix is exempt:
 * `packages/front/@anim-old/`, the owner's legacy code, git-ignored and
 * present in the main checkout only.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const PKG = join(import.meta.dir, '..');
const REPO = join(PKG, '..', '..', '..', '..');
const TREES = ['src', 'tests', 'docs', 'demos', 'playground', 'tools', 'README.md', 'CHANGELOG.md'];
const EXEMPT = 'packages/front/@anim-old/';
const CITE = /`((?:ai|docs|spikes|packages|apps|tools)\/[A-Za-z0-9_@./-]+?)(?::\d+(?:[-,]\d+)*)?`/g;

function walk(p) {
    if (!existsSync(p)) return [];
    if (!statSync(p).isDirectory()) return /\.(js|mjs|ts|md|html|json)$/.test(p) ? [p] : [];
    return readdirSync(p, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() && e.name === 'node_modules' ? [] : walk(join(p, e.name))));
}

function citations() {
    const out = [];
    for (const t of TREES) {
        for (const file of walk(join(PKG, t))) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(CITE)) {
                const path = m[1].replace(/[.,]+$/, '');
                if (!/(\.[A-Za-z0-9]+|\/)$/.test(path)) continue; // an id, not a file path
                if (path.startsWith(EXEMPT)) continue;
                const line = text.slice(0, m.index).split('\n').length;
                out.push({ where: `${relative(PKG, file).replace(/\\/g, '/')}:${line}`, path, here: dirname(file) });
            }
        }
    }
    return out;
}

describe('path citations resolve', () => {
    const all = citations();

    test('the scan sees citations', () => {
        expect(all.length).toBeGreaterThan(20);
    });

    test('every cited path exists in the package or the repository', () => {
        const dangling = all
            .filter(({ path, here }) => ![join(PKG, path), join(REPO, path), join(here, path)].some((c) => existsSync(c)))
            .map(({ where, path }) => `${where} ${path}`);
        expect(dangling).toEqual([]);
    });
});
