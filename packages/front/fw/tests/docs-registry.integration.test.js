// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The docs say what the module registry says. Each module page
 * under `docs/api/` declares its dependencies twice (the frontmatter
 * `dependencies:` and the `**Deps**` header line): both must equal the
 * module descriptor's `dependencies`. Every registry module has a page, and
 * every module count written in the docs is the registry's length.
 */

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import modules from '../src/core/modules.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const DOCS = join(PKG, 'docs', 'api');
const byName = new Map(modules.map((m) => [m.name, m]));
const nameOf = (spec) => spec.split('@')[0];
const sorted = (a) => [...a].sort();

/** Registry modules documented inside another page. */
const COVERED_BY = { uiSessionCore: 'uiSession.md', uiSessionDirect: 'uiSession.md', uiSessionList: 'uiSession.md' };

function pages() {
    const out = [];
    (function walk(d) {
        for (const e of readdirSync(d)) {
            const p = join(d, e);
            if (statSync(p).isDirectory()) walk(p);
            else if (e.endsWith('.md')) out.push(p);
        }
    })(DOCS);
    return out.map((file) => {
        const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        const name = fm && /^module:\s*(\S+)/m.exec(fm[1]);
        return { file, text, front: fm ? fm[1] : null, name: name ? name[1] : null };
    });
}
const PAGES = pages().filter((p) => p.name && byName.has(p.name));

describe('docs/api module pages agree with the registry', () => {
    test('the frontmatter dependencies equal the descriptor', () => {
        const drift = [];
        for (const p of PAGES) {
            const want = sorted((byName.get(p.name).dependencies || []).map(nameOf));
            const m = /^dependencies:\s*\[(.*)\]\s*$/m.exec(p.front);
            const got = m ? sorted(m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)) : null;
            if (JSON.stringify(got) !== JSON.stringify(want)) drift.push(`${relative(DOCS, p.file)}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
        }
        expect(drift).toEqual([]);
    });

    test('the **Deps** header line equals the descriptor', () => {
        const drift = [];
        for (const p of PAGES) {
            const line = /\*\*Deps\*\*\s+([^|\n]+)\|/.exec(p.text);
            if (!line) { drift.push(`${relative(DOCS, p.file)}: no **Deps** line`); continue; }
            const txt = line[1].trim();
            const got = txt === 'none' ? [] : sorted([...txt.matchAll(/`([^`]+)`/g)].map((x) => nameOf(x[1])));
            const want = sorted((byName.get(p.name).dependencies || []).map(nameOf));
            if (JSON.stringify(got) !== JSON.stringify(want)) drift.push(`${relative(DOCS, p.file)}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
        }
        expect(drift).toEqual([]);
    });

    test('every registry module has a page', () => {
        const documented = new Set(PAGES.map((p) => p.name));
        const missing = modules.map((m) => m.name).filter((n) => !documented.has(n) && !COVERED_BY[n]);
        expect(missing).toEqual([]);
        for (const page of new Set(Object.values(COVERED_BY))) {
            expect(PAGES.some((p) => p.file.endsWith(page))).toBe(true);
        }
    });

    test('the module pages are not vacuous: most of the registry is checked', () => {
        expect(PAGES.length).toBeGreaterThan(200);
    });
});

describe('module counts written in the docs', () => {
    const N = String(modules.length);
    const COUNTS = [
        ['README.md', /\*\*(\d+) autonomous modules\*\*/],
        ['docs/api/core/modules.md', /flat array of all (\d+) fw module descriptors/],
        ['docs/tools/codegen.md', /registry\.generated\.d\.ts \((\d+) modules\)/],
    ];
    for (const [file, re] of COUNTS) {
        test(`${file} says ${N}`, () => {
            const m = re.exec(readFileSync(join(PKG, file), 'utf8'));
            expect(m, `${file}: no count found by ${re}`).not.toBe(null);
            expect(m[1]).toBe(N);
        });
    }
});
