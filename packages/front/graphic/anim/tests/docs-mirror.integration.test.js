// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * `docs/api/` mirrors `src/`: one page per shipped module
 * (`ai/conventions/documentation.md`: "docs/api/ mirrors src/ exactly", an
 * L3 requirement of `ai/conventions/monorepo.md`). A shipped module is
 * `src/**` `*.js` minus the co-located tests and the `src/perf/` gate
 * utility, the same set the `files` allowlist ships. An `index.js` is
 * mirrored by `<dir>/index.md`. Each page names its source file, so a page
 * cannot drift onto another module unnoticed.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PKG = join(import.meta.dir, '..');
const SRC = join(PKG, 'src');

/** @returns {string[]} `src`-relative module paths, `/`-separated, no `.js`. */
function shippedModules(dir = SRC) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
            if (relative(SRC, abs) !== 'perf') out.push(...shippedModules(abs));
        } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
            out.push(relative(SRC, abs).split(sep).join('/').slice(0, -3));
        }
    }
    return out.sort();
}

describe('docs/api mirrors src', () => {
    const modules = shippedModules();

    test('the scan finds the modules (never a vacuous pass)', () => {
        expect(modules.length).toBeGreaterThan(20);
        expect(modules).toContain('main');
        expect(modules).toContain('anim/timeline');
    });

    test('every shipped module has its docs/api page', () => {
        const missing = modules.filter((m) => !existsSync(join(PKG, 'docs', 'api', `${m}.md`)));
        expect(missing).toEqual([]);
    });

    test('every mirror page names its source file', () => {
        const wrong = modules
            .filter((m) => existsSync(join(PKG, 'docs', 'api', `${m}.md`)))
            .filter((m) => !readFileSync(join(PKG, 'docs', 'api', `${m}.md`), 'utf8').includes(`src/${m}.js`));
        expect(wrong).toEqual([]);
    });
});
