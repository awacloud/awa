// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `docs/CONTRACT.md` against the live registry.
 *
 * The contract page freezes every descriptor's name / type / dependencies
 * tuple and the registration order. It drifted once: a module was appended
 * to `graphicModules` and the page kept its old table, listing and counts.
 * This test parses the page's descriptor table, its `graphicModules`
 * listing and its "**N modules**" counts, and compares each with the live
 * `graphicModules` export.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { graphicModules } from '../src/main.js';

const PAGE = readFileSync(join(import.meta.dir, '..', 'docs', 'CONTRACT.md'), 'utf8');

/** The text of one `## ` section, heading excluded. */
function section(heading) {
    const start = PAGE.indexOf(`\n## ${heading}`);
    if (start < 0) throw new Error(`CONTRACT.md: no section "${heading}"`);
    const body = PAGE.slice(PAGE.indexOf('\n', start + 1) + 1);
    const end = body.indexOf('\n## ');
    return end < 0 ? body : body.slice(0, end);
}

/** The descriptor table rows: `{ name, type, dependencies }`, in page order. */
function tableRows() {
    return section('Module descriptor table').split('\n')
        .filter((l) => l.startsWith('| `graphic.'))
        .map((l) => {
            const cells = l.split('|').slice(1, -1).map((c) => c.trim());
            const name = /`([^`]+)`/.exec(cells[0])[1];
            const type = /`([^`]+)`/.exec(cells[1])[1];
            const list = /`\[([^\]]*)\]`/.exec(cells[2]);
            const dependencies = list && list[1].trim()
                ? list[1].split(',').map((d) => d.trim().replace(/^'|'$/g, ''))
                : [];
            return { name, type, dependencies };
        });
}

/** The names of the `graphicModules` listing's code block, in order. */
function listing() {
    const body = section('`graphicModules` registration order');
    const block = /```js\n([\s\S]*?)```/.exec(body)[1];
    return [...block.matchAll(/^\s+(graphic\.[A-Za-z0-9]+),/gm)].map((m) => m[1]);
}

describe('docs/CONTRACT.md matches the live registry', () => {
    const live = graphicModules.map((m) => ({ name: m.name, type: m.type, dependencies: [...m.dependencies] }));

    test('the descriptor table lists every module, in registry order, with its type and dependencies', () => {
        expect(tableRows()).toEqual(live);
    });

    test('the graphicModules listing is the registry order', () => {
        expect(listing()).toEqual(live.map((m) => m.name));
    });

    test('every "N modules" count on the page is the live count', () => {
        const counts = [...PAGE.matchAll(/\*\*(\d+) modules\.?\*\*/g)].map((m) => Number(m[1]));
        expect(counts.length).toBeGreaterThan(0);
        expect(counts).toEqual(counts.map(() => graphicModules.length));
    });
});
