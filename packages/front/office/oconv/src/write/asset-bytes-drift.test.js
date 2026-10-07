// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Drift test for the `assetBytes` MIRROR (BL-980, office/BATCH_35 task 02).
 *
 * The asset-resolution rule — caller `assets[name]` first, then the docx
 * reader's carried `escapes.docx.bytes`, else `null` — must be the SAME rule
 * in all three writers, or `fromMd` would resolve an image differently
 * depending on the target. It cannot be imported: every copy lives inside an
 * fw factory, and a factory may not capture a module-scope binding
 * (`fw/no-factory-capture` — the factory source is serialised into Workers
 * and inlined by the standalone builder). Same discipline as
 * `../read/pdf/paragraph-group.js` (`ai/memory/types/office.md` 2026-07-21).
 *
 * So the three copies are pinned here, character for character, and the
 * comparison is falsified against a mutated in-memory copy so it can never
 * degrade into a tautology.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

/** This file's own directory (`src/write/`), cwd-independent (BL-1564). */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

const SOURCES = [
    `${ROOT}/ir-to-docx.js`,
    `${ROOT}/ir-to-odt.js`,
    `${ROOT}/pdf/render/image.js`
];

/**
 * Extract the `function assetBytes(` block by brace counting — the JSDoc
 * above it is deliberately NOT included: what must not drift is the RULE.
 *
 * @param {string} source Whole file text.
 * @returns {string}
 */
function extractAssetBytes(source) {
    const start = source.indexOf('function assetBytes(');
    if (start < 0) throw new Error('no assetBytes in source');
    let depth = 0;
    let seen = false;
    for (let i = start; i < source.length; i += 1) {
        if (source[i] === '{') { depth += 1; seen = true; }
        else if (source[i] === '}') {
            depth -= 1;
            if (seen && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unbalanced assetBytes');
}

describe('assetBytes — the three mirrored copies', () => {
    test('every writer carries exactly one copy', async () => {
        for (const path of SOURCES) {
            const text = await Bun.file(path).text();
            const hits = text.split('function assetBytes(').length - 1;
            expect(hits, path).toBe(1);
        }
    });

    test('the three bodies are byte-identical', async () => {
        const bodies = [];
        for (const path of SOURCES) {
            bodies.push(extractAssetBytes(await Bun.file(path).text()));
        }
        expect(bodies[0].length).toBeGreaterThan(200);
        expect(bodies[1]).toBe(bodies[0]);
        expect(bodies[2]).toBe(bodies[0]);
    });

    test('falsification — a mutated in-memory copy is REJECTED by the same comparison', async () => {
        const canonical = extractAssetBytes(await Bun.file(SOURCES[0]).text());
        const mutated = canonical.replace("source: 'reader'", "source: 'READER'");
        expect(mutated).not.toBe(canonical);          // the mutation really applied
        expect(mutated).not.toBe(extractAssetBytes(await Bun.file(SOURCES[2]).text()));
    });

    test('the rule itself, evaluated from the extracted text: assets win, then escapes, then null', async () => {
        const body = extractAssetBytes(await Bun.file(SOURCES[0]).text());
        const assetBytes = new Function(`${body}; return assetBytes;`)();

        const fromAssets = Uint8Array.from([1]);
        const fromReader = Uint8Array.from([2]);
        const node = (extra) => ({ kind: 'image', name: 'a.png', ...extra });
        const carried = { escapes: { docx: { bytes: fromReader } } };

        expect(assetBytes(node(), { 'a.png': fromAssets }))
            .toEqual({ bytes: fromAssets, source: 'assets' });
        expect(assetBytes(node(carried), undefined))
            .toEqual({ bytes: fromReader, source: 'reader' });
        expect(assetBytes(node(carried), { 'a.png': fromAssets }))
            .toEqual({ bytes: fromAssets, source: 'assets' });
        expect(assetBytes(node(), { 'other.png': fromAssets })).toBeNull();
        expect(assetBytes(node(), { 'a.png': [1, 2, 3] })).toBeNull();   // not a Uint8Array
        expect(assetBytes(node(), undefined)).toBeNull();
        expect(assetBytes(null, undefined)).toBeNull();
        // A key inherited from the prototype chain is NOT an own key.
        expect(assetBytes(node(), Object.create({ 'a.png': fromAssets }))).toBeNull();
    });
});
