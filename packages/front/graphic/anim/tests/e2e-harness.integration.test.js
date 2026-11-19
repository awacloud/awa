// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The browser smoke (`e2e/run.mjs`) cannot silently shrink.
 *
 * The smoke itself runs real browsers and is launched by hand
 * (`bun run test:e2e`); this test keeps its inputs honest under `bun test`:
 * discovery lists every page of `demos/` and `playground/`, every entry page
 * publishes the readiness contract the smoke waits for, and `e2e/` holds no
 * `*.test.*` file (which `bun test` would discover and run without a browser).
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { discoverPages, PKG_URL } from '../e2e/pages.mjs';

const PKG = join(import.meta.dir, '..');
const READY_LINE = "document.documentElement.setAttribute('data-ready', '1')";

/** Every `index.html` under the two families, by walking the directories. */
function onDisk() {
    const out = [];
    for (const family of ['demos', 'playground']) {
        if (existsSync(join(PKG, family, 'index.html'))) out.push(`${PKG_URL}/${family}/index.html`);
        for (const slug of readdirSync(join(PKG, family))) {
            const dir = join(PKG, family, slug);
            if (!slug.startsWith('_') && statSync(dir).isDirectory() && existsSync(join(dir, 'index.html'))) {
                out.push(`${PKG_URL}/${family}/${slug}/index.html`);
            }
        }
    }
    return out.sort();
}

describe('browser smoke inputs', () => {
    const pages = discoverPages(PKG);

    test('discovery lists every page of demos/ and playground/', () => {
        expect(pages.map((p) => p.url).sort()).toEqual(onDisk());
        expect(pages.length).toBeGreaterThanOrEqual(12);
    });

    test('every entry page publishes the readiness contract, once', () => {
        for (const { url, ready } of pages) {
            const html = readFileSync(join(PKG, url.slice(PKG_URL.length + 1)), 'utf8');
            expect(html.split(READY_LINE).length - 1).toBe(ready ? 1 : 0);
        }
    });

    test('e2e/ holds no file bun test would discover', () => {
        const names = readdirSync(join(PKG, 'e2e'));
        expect(names.filter((n) => /[._](test|spec)[._]/.test(n))).toEqual([]);
        expect(names).toContain('run.mjs');
    });
});
