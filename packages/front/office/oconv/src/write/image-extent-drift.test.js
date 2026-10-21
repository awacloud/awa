// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Drift test for the `imageExtent` MIRROR.
 *
 * The intrinsic-size rule — the pixel size and resolution read from a PNG,
 * JPEG or GIF header, 96 dpi by default, scaled down to fit 6 in × 8 in —
 * must be the SAME rule in the docx and the odt writers, or `fromMd` would
 * size one image differently depending on the target. It cannot be
 * imported: each copy lives inside an fw factory, and a factory may not
 * capture a module-scope binding (`fw/no-factory-capture`). Same discipline
 * as `./asset-bytes-drift.test.js`.
 *
 * So the two copies are pinned here, character for character, and the
 * comparison is falsified against a mutated in-memory copy so it can never
 * degrade into a tautology.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

/** This file's own directory (`src/write/`), cwd-independent. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

const SOURCES = [
    `${ROOT}/ir-to-docx.js`,
    `${ROOT}/ir-to-odt.js`
];

/**
 * Extract the `function imageExtent(` block by brace counting — the JSDoc
 * above it is deliberately NOT included: what must not drift is the RULE.
 *
 * @param {string} source Whole file text.
 * @returns {string}
 */
function extractImageExtent(source) {
    const start = source.indexOf('function imageExtent(');
    if (start < 0) throw new Error('no imageExtent in source');
    let depth = 0;
    let seen = false;
    for (let i = start; i < source.length; i += 1) {
        if (source[i] === '{') { depth += 1; seen = true; }
        else if (source[i] === '}') {
            depth -= 1;
            if (seen && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unbalanced imageExtent');
}

describe('imageExtent — the two mirrored copies', () => {
    test('each writer carries exactly one copy', async () => {
        for (const path of SOURCES) {
            const text = await Bun.file(path).text();
            const hits = text.split('function imageExtent(').length - 1;
            expect(hits, path).toBe(1);
        }
    });

    test('the two bodies are byte-identical', async () => {
        const [a, b] = await Promise.all(
            SOURCES.map(async path => extractImageExtent(await Bun.file(path).text())));
        expect(a.length).toBeGreaterThan(1000);
        expect(b).toBe(a);
    });

    test('falsification — a mutated in-memory copy is REJECTED by the same comparison', async () => {
        const canonical = extractImageExtent(await Bun.file(SOURCES[0]).text());
        const mutated = canonical.replace('const DEFAULT_DPI = 96;', 'const DEFAULT_DPI = 72;');
        expect(mutated).not.toBe(canonical);          // the mutation really applied
        expect(mutated).not.toBe(extractImageExtent(await Bun.file(SOURCES[1]).text()));
    });
});
