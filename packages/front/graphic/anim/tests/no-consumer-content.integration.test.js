// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The library is a set of plugins: a consumer's own content
 * (brand assets, icons, colours, fonts) is passed in as options and never
 * baked into the shipped source. The salvaged legacy pages were built for
 * one consumer, so a port can carry its content over by accident; this guard
 * scans the CODE of every shipped `src/` module (comments stripped, test
 * files excluded) for the content of the legacy consumer the hypertree was
 * salvaged from. Provenance notes in comments stay allowed.
 */

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');

/** Every shipped module under `src/` (no unit test, no type declaration). */
function shippedModules(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...shippedModules(p));
        else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) out.push(p);
    }
    return out;
}

/**
 * Drop block and line comments. Coarse on purpose (a `//` inside a string
 * cuts the rest of that line), which can only hide content, never invent it:
 * the denied fragments below contain no `//`.
 */
function codeOnly(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** The legacy consumer's content: its name, icon paths, branch colours, font. */
const DENIED = [
    { what: 'consumer name', re: /towards/i },
    { what: 'legacy link icon path', re: /M16\.469,8\.924/ },
    { what: 'legacy info icon path', re: /M12\.323,2\.398/ },
    { what: 'legacy branch colour', re: /#00838a|#e7501e|#fdc400/i },
    { what: 'legacy font', re: /open sans/i },
];

describe('no consumer content in the shipped source', () => {
    test('the scan sees the modules', () => {
        expect(shippedModules(SRC).length).toBeGreaterThan(20);
    });

    test('no shipped module carries the legacy consumer content', () => {
        const hits = [];
        for (const file of shippedModules(SRC)) {
            const code = codeOnly(readFileSync(file, 'utf8'));
            for (const { what, re } of DENIED) {
                if (re.test(code)) hits.push(`${relative(SRC, file)}: ${what}`);
            }
        }
        expect(hits).toEqual([]);
    });
});
