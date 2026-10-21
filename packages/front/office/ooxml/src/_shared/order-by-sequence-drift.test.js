// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Drift test for the schema-order helpers (`sequence`, `orderBySequence`).
 *
 * They live in two factories: `ooxmlShared` (styles, numbering, settings
 * use it) and `docxProperties` (which has no `ooxmlShared` dependency, and
 * whose instance `docxStructure` uses). A factory may not capture a
 * module-scope binding (its source is serialised into Workers and inlined
 * by the standalone builder), so the code cannot be imported: the two
 * copies are pinned here, character for character, and the comparison is
 * falsified against a mutated copy.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = [`${SRC}/_shared/index.js`, `${SRC}/docx/properties.js`];

/** The text from `// --- Schema order ---` to the end of `orderBySequence`. */
function extract(source) {
    const start = source.indexOf('        // --- Schema order ---');
    const fn = source.indexOf('function orderBySequence(', start);
    if (start < 0 || fn < 0) throw new Error('no schema-order helpers in source');
    let depth = 0;
    for (let i = source.indexOf('{', fn); i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unbalanced orderBySequence');
}

describe('schema-order helpers — the two copies stay identical', () => {
    test('ooxmlShared and docxProperties carry the same code', async () => {
        const [a, b] = await Promise.all(SOURCES.map((p) => Bun.file(p).text()));
        const ca = extract(a);
        expect(ca).toContain('function sequence(names)');
        expect(extract(b)).toBe(ca);
    });

    test('the comparison sees a one-character change', async () => {
        const a = await Bun.file(SOURCES[0]).text();
        const mutated = a.replace('change - 0.5', 'change - 0.25');
        expect(mutated).not.toBe(a);
        expect(extract(mutated)).not.toBe(extract(a));
    });
});
