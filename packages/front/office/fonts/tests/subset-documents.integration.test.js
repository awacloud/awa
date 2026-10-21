// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — the documents of
 * `tests/_helpers/subset-documents.js` (what the office-scorecard axis C
 * hands to OTS) are `subsetForPdf` outputs that read back with the
 * package's reader, map every code point of their set, come from sources
 * checked against their provenance records, and are written the same way
 * twice.
 */
import { describe, test, expect } from 'bun:test';
import { fontsRuntime } from './_helpers/fonttools.js';
import { SAMPLE_TEXT, codePointSets, subsetDocuments, subsetSources } from './_helpers/subset-documents.js';

const rt = fontsRuntime();
const api = rt.resolve('fonts');
const sources = subsetSources();
const set = subsetDocuments(rt);

describe('subset documents — sources', () => {
    test('the twelve Liberation faces, Kalnia Glaze and the two CFF faces, once each', () => {
        expect(sources.map((s) => s.id)).toEqual([
            'kalnia-glaze',
            'liberation-mono-bold', 'liberation-mono-bold-italic', 'liberation-mono-italic', 'liberation-mono-regular',
            'liberation-sans-bold', 'liberation-sans-bold-italic', 'liberation-sans-italic', 'liberation-sans-regular',
            'liberation-serif-bold', 'liberation-serif-bold-italic', 'liberation-serif-italic', 'liberation-serif-regular',
            'source-sans-3-regular', 'source-sans-3-vf-upright',
        ]);
    });

    test('the text set is the face\'s mapped code points of the sample sentence; full is every mapped one', () => {
        const font = api.read(sources.find((s) => s.id === 'liberation-sans-regular').bytes);
        const { text, full } = codePointSets(font);
        expect(text).toEqual([...new Set([...SAMPLE_TEXT].map((c) => c.codePointAt(0)))].sort((a, b) => a - b));
        expect(full.length).toBe(font.unicodeMap.size);
        const stub = { unicodeMap: new Map([[0x54, 1], [0x41, 2]]) };
        expect(codePointSets(stub)).toEqual({ text: [0x54], full: [0x41, 0x54] });
    });
});

describe('subset documents — documents', () => {
    test('two documents per glyf face; the CFF faces skipped with the typed refusal', () => {
        expect(set.docs.length).toBe(26);
        expect(set.docs.every((d) => d.ext === 'ttf')).toBe(true);
        expect(new Set(set.docs.map((d) => d.id)).size).toBe(26);
        expect(set.skipped.map((s) => s.case)).toEqual([
            'source-sans-3-regular/text.ttf', 'source-sans-3-regular/full.ttf',
            'source-sans-3-vf-upright/text.ttf', 'source-sans-3-vf-upright/full.ttf',
        ]);
        expect(set.skipped.every((s) => s.reason.includes('fonts/subset-bad-font'))).toBe(true);
    });

    test('each subset reads back and maps every code point of its set; its source is the face', () => {
        const byId = Object.fromEntries(sources.map((s) => [s.id, s.bytes]));
        for (const d of set.docs) {
            expect(d.source).toEqual(byId[d.id.slice(0, d.id.indexOf('/'))]);
            const back = api.read(d.bytes);
            const unmapped = d.codePoints.filter((cp) => back.glyphIndexForCodePoint(cp, { strict: true }) < 0);
            expect({ id: d.id, unmapped }).toEqual({ id: d.id, unmapped: [] });
            expect(back.unicodeMap.size).toBe(d.codePoints.length);
        }
    });

    test('the text subset is smaller than the full one, for every face', () => {
        for (let i = 0; i < set.docs.length; i += 2) {
            const [text, full] = [set.docs[i], set.docs[i + 1]];
            expect([text.id.endsWith('/text'), full.id.endsWith('/full')]).toEqual([true, true]);
            expect(text.bytes.length).toBeLessThan(full.bytes.length);
        }
    });

    test('written the same way twice (the evidence hashes are stable)', () => {
        const again = subsetDocuments(rt);
        expect(again.docs.map((d) => d.bytes)).toEqual(set.docs.map((d) => d.bytes));
    });
});
