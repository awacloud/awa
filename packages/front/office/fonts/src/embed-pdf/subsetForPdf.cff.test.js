// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `subsetForPdf(font, codePoints, { cff: true })` on a name-keyed CFF font
 * (T11): the OTTO subset reads back with the same mapping, advances and
 * outlines; the writers (`encodeDict`, `writeIndex`) read back through the
 * package's own parsers; a `seac` glyph keeps its components; the
 * refusals stay.
 */

import { describe, test, expect } from 'bun:test';
import { fontsRuntime } from '../../tests/_helpers/fonttools.js';
import { cffOutlines, loadFaces, subsetRoundTrip } from '../../tests/_helpers/ofl-faces.js';

const rt = fontsRuntime();
const api = rt.resolve('fonts');
const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
const { encodeDict, writeIndex, cffClosure } = rt.resolve('embedCffSubset');
const cffMod = rt.resolve('tableCff');
const { BinaryReader } = rt.resolve('fontReader');
const { faces } = loadFaces();
const face = (id) => faces.find((f) => f.id === id);
const codeOf = (e) => { try { e(); } catch (err) { return err.code; } return null; };

describe('subsetForPdf over a name-keyed CFF font, { cff: true } (T11)', () => {
    const src = face('source-sans-3-regular').bytes;
    const font = api.read(src);
    const cps = [...'Hello, wörld! ﬁ 0123'].map((c) => c.codePointAt(0));

    test('an OTTO subset that reads back with the mapping, the advances and the outlines', () => {
        const r = subsetForPdf(font, new Set(cps), { cff: true });
        expect([...r.subsetBytes.subarray(0, 4)]).toEqual([0x4F, 0x54, 0x54, 0x4F]);
        const back = api.read(r.subsetBytes);
        expect(back.numGlyphs).toBe(r.gidMap.size);
        expect(back.numGlyphs).toBeLessThan(font.numGlyphs / 10);
        const a = cffOutlines(src, rt);
        const b = cffOutlines(r.subsetBytes, rt);
        for (const cp of cps) {
            const oldGid = font.glyphIndexForCodePoint(cp, { strict: true });
            const newGid = back.glyphIndexForCodePoint(cp, { strict: true });
            expect(newGid).toBe(r.glyphMap.get(cp));
            expect(back.getGlyphByIndex(newGid).advanceWidth).toBe(font.getGlyphByIndex(oldGid).advanceWidth);
            expect(b(newGid)).toBe(a(oldGid));
        }
        expect(r.fontDescriptor.FontFile3).toBe(r.subsetBytes);
        expect(r.fontDescriptor.FontFile2).toBeUndefined();
        expect(r.postScriptName).toMatch(/^[A-Z]{6}\+SourceSans3-Regular$/);
        expect(r.widths.length).toBe(back.numGlyphs);
    });

    test('the kept glyphs keep their names, and their charstrings byte for byte', () => {
        const r = subsetForPdf(font, new Set(cps), { cff: true });
        const before = cffMod.parseCff(rt.resolve('fontSfnt').parseSfnt(src).tables['CFF '].bytes).fonts[0];
        const after = cffMod.parseCff(rt.resolve('fontSfnt').parseSfnt(r.subsetBytes).tables['CFF '].bytes).fonts[0];
        for (const [oldGid, newGid] of r.gidMap) {
            expect(after.glyphNames[newGid]).toBe(before.glyphNames[oldGid]);
            expect([...after.charStringsIndex.items[newGid]]).toEqual([...before.charStringsIndex.items[oldGid]]);
        }
        expect(after.topDict.has(16)).toBe(false);
    });

    test('every mapped code point of the face round-trips (the ofl-faces measure)', () => {
        const r = subsetRoundTrip(src, rt);
        expect([r.missing, r.widthDiffs, r.pathDiffs]).toEqual([0, 0, 0]);
        expect(r.codePoints).toBeGreaterThan(1000);
    });

    test('the refusals: no option, a CFF2 font without it; a TrueType route unchanged', () => {
        expect(codeOf(() => subsetForPdf(font, new Set(cps)))).toBe('fonts/subset-bad-font');
        const vf = api.read(face('source-sans-3-vf-upright').bytes);
        expect(codeOf(() => subsetForPdf(vf, new Set(cps)))).toBe('fonts/subset-bad-font');
        const ttf = api.read(face('liberation-sans-regular').bytes);
        const plain = subsetForPdf(ttf, new Set(cps));
        expect(subsetForPdf(ttf, new Set(cps), { cff: true }).subsetBytes).toEqual(plain.subsetBytes);
        expect(plain.fontDescriptor.FontFile2).toBe(plain.subsetBytes);
    });

    test('a CID-keyed CFF (a Top DICT with ROS) is refused', () => {
        const cid = cffFont([[0x0C1E, [391, 392, 0]], [17, [0]]], ['CIDFont']);
        const fake = { ...font, rawSfnt: { ...font.rawSfnt, tables: { ...font.rawSfnt.tables, 'CFF ': { bytes: cid } } } };
        expect(codeOf(() => subsetForPdf(fake, new Set(cps), { cff: true }))).toBe('fonts/subset-bad-font');
    });
});

/** A one-font CFF: header, Name INDEX, `top` as its Top DICT, empty String and Global Subr INDEXes. */
function cffFont(top, names) {
    const parts = [new Uint8Array([1, 0, 4, 4]), writeIndex(names.map((n) => new TextEncoder().encode(n))),
        writeIndex([encodeDict(top)]), writeIndex([]), writeIndex([])];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

describe('the CFF writers (T11)', () => {
    test('encodeDict: integers of every width, reals, fixed 5-byte offsets; parseDict reads them back', () => {
        const entries = [[0, [391]], [5, [-50, -200, 1000, 900]], [0x0C07, [0.001, 0, 0, 0.001, 0, 0]],
            [0x0C03, [-75]], [13, [32767, -32768, 1131, -1131, 108, -108, 107, -107, 100000]], [0x0C02, [-12.5, 1.5e-7, 123456.75]]];
        const bytes = encodeDict(entries);
        const back = cffMod.parseDict(bytes);
        expect([...back.keys()]).toEqual(entries.map(([op]) => op));
        for (const [op, operands] of entries) {
            expect(back.get(op).map((v) => +v.toPrecision(10))).toEqual(operands.map((v) => +v.toPrecision(10)));
        }
        const fixed = encodeDict([[17, [7]], [18, [10, 20]]], new Set([17, 18]));
        expect(fixed.length).toBe(5 + 1 + 10 + 1);
        expect([...fixed.subarray(0, 5)]).toEqual([29, 0, 0, 0, 7]);
        expect(cffMod.parseDict(fixed).get(18)).toEqual([10, 20]);
    });

    test('writeIndex: an empty INDEX, 1- to 3-byte offsets; parseIndex reads the items back', () => {
        expect([...writeIndex([])]).toEqual([0, 0]);
        for (const size of [3, 300, 70000]) {
            const items = [new Uint8Array([1, 2]), new Uint8Array(size).fill(7), new Uint8Array(0), new Uint8Array([9])];
            const idx = cffMod.parseIndex(new BinaryReader(writeIndex(items)));
            expect(idx.count).toBe(4);
            expect(idx.offSize).toBe(size < 250 ? 1 : size < 65000 ? 2 : 3);
            expect(idx.items.map((x) => [...x])).toEqual(items.map((x) => [...x]));
        }
    });

    test('cffClosure: a seac glyph brings its base and accent glyphs, by their Standard Encoding names', () => {
        const S = cffMod.CFF_STANDARD_STRINGS;
        // gid 0 .notdef, 1 A, 2 acute, 3 Aacute (seac 0 0 A acute), 4 B.
        const sids = [S.indexOf('A'), S.indexOf('acute'), S.indexOf('Aacute'), S.indexOf('B')];
        const endchar = new Uint8Array([14]);
        // endchar with adx 0, ady 0, bchar 65 (A), achar 194 (acute): 0 is
        // 139, 65 is 139 + 65, 194 is 247 then 194 - 108.
        const seac = new Uint8Array([139, 139, 139 + 65, 247, 194 - 108, 14]);
        const fakeFont = {
            charStringsIndex: { count: 5, items: [endchar, endchar, endchar, seac, endchar] },
            glyphNames: ['.notdef', ...sids.map((s) => S[s])],
            privateDict: new Map(), localSubrIndex: null
        };
        const parsed = { globalSubrIndex: { items: [] }, fonts: [fakeFont] };
        expect([...cffClosure(parsed, new Set([0, 3]))].sort()).toEqual([0, 1, 2, 3]);
        expect([...cffClosure(parsed, new Set([0, 4]))].sort()).toEqual([0, 4]);
    });
});
