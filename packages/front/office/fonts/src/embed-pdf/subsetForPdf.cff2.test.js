// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * T12: CID-keyed CFF and CFF2 under `subsetForPdf(…, { cff: true })`.
 * A CID-keyed subset keeps its FDs; a CFF2 font is subset to its default
 * instance as a static CID-keyed CFF program (D34 A). The CFF2 charstring
 * decoder, the charstring conversion (subroutines inlined, `blend`
 * evaluated, long operators split) and the CFF2 Private DICT's `blend`.
 */

import { describe, test, expect } from 'bun:test';
import { fontsRuntime } from '../../tests/_helpers/fonttools.js';
import { cffOutlines, loadFaces, subsetRoundTrip } from '../../tests/_helpers/ofl-faces.js';

const rt = fontsRuntime();
const api = rt.resolve('fonts');
const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
const { encodeDict, writeIndex, subsetCidCff, convertCff2Charstring, evalCff2Dict } = rt.resolve('embedCffSubset');
const cffMod = rt.resolve('tableCff');
const { parseSfnt } = rt.resolve('fontSfnt');
const { faces } = loadFaces();
const face = (id) => faces.find((f) => f.id === id);
const codeOf = (e) => { try { e(); } catch (err) { return err.code; } return null; };

/** Charstring / DICT number bytes (Type 2 encoding, small integers). */
const n = (v) => {
    if (v >= -107 && v <= 107) return [v + 139];
    if (v >= 108 && v <= 1131) { const w = v - 108; return [(w >> 8) + 247, w & 0xFF]; }
    if (v >= -1131 && v <= -108) { const w = -v - 108; return [(w >> 8) + 251, w & 0xFF]; }
    return [28, (v >> 8) & 0xFF, v & 0xFF];
};
const cs = (...parts) => Uint8Array.from(parts.flat());
const concat = (parts) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

describe('decodeCharstring, CFF2 mode (T12)', () => {
    // regions: vsindex 0 has 2 regions, vsindex 1 has 3.
    const cff2 = { regionCounts: [2, 3], vsindex: 0 };
    // 10 (deltas 1 2) blend, 20 rmoveto; callsubr 0 (bias 107: index -107) → 30 0 rlineto;
    // 1 vsindex; 5 0 (deltas 7 8 9) blend 6 rlineto (n = 1, k = 3).
    const subr = cs(n(30), n(0), [5]);
    const glyph = cs(n(10), n(1), n(2), n(1), [16], n(20), [21], n(-107), [10], n(1), [15], n(5), n(7), n(8), n(9), n(1), [16], n(6), [5]);

    test('blend at the default, vsindex, a subroutine without return, no width, no endchar', () => {
        const r = cffMod.decodeCharstring(glyph, { localSubrs: [subr], cff2 });
        expect(r.commands).toEqual([{ type: 'M', x: 10, y: 20 }, { type: 'L', x: 40, y: 20 }, { type: 'L', x: 45, y: 26 }]);
        expect(r.width).toBeUndefined();
    });

    test('converted to a CFF charstring: the same outline, the width first, endchar last, no subroutine call', () => {
        const out = convertCff2Charstring(glyph, { localSubrs: [subr], globalSubrs: [], regionCounts: [2, 3], vsindex: 0, width: 500 });
        const r = cffMod.decodeCharstring(out, {});
        expect(r.commands).toEqual([{ type: 'M', x: 10, y: 20 }, { type: 'L', x: 40, y: 20 }, { type: 'L', x: 45, y: 26 }]);
        expect(r.width).toBe(500);
        expect(out[out.length - 1]).toBe(14);
        expect([...out].filter((b) => b === 10 || b === 29 || b === 15 || b === 16)).toEqual([]);
    });

    test('an operator over 48 operands is split into operators of the same meaning', () => {
        const pairs = Array.from({ length: 40 }, (_, i) => [n(i % 7 - 3), n(i % 5 + 1)]).flat(2);
        const long = cs(n(0), n(0), [21], pairs, [5], pairs.slice(0, 60), [7]);
        const out = convertCff2Charstring(long, { localSubrs: [], globalSubrs: [], regionCounts: [], vsindex: 0, width: 300 });
        const a = cffMod.decodeCharstring(long, { cff2: { regionCounts: [], vsindex: 0 } }).commands;
        expect(cffMod.decodeCharstring(out, {}).commands).toEqual(a);
        // No operator carries more than 48 operands.
        let args = 0;
        let max = 0;
        for (let i = 0; i < out.length;) {
            const b0 = out[i++];
            if (b0 >= 32) { args++; if (b0 >= 247 && b0 <= 254) i++; else if (b0 === 255) i += 4; continue; }
            if (b0 === 28) { args++; i += 2; continue; }
            if (b0 === 12) i++;
            max = Math.max(max, args);
            args = 0;
        }
        expect(max).toBeLessThanOrEqual(48);
    });

    test('a CFF2 Private DICT: blend evaluated at the default, vsindex and Subrs dropped', () => {
        // BlueValues -10 0 (deltas 2 3 · 4 5) 2 blend; vsindex 0; StdHW 50; Subrs 99.
        const priv = cs(n(-10), n(0), n(2), n(3), n(4), n(5), n(2), [23], [6], n(0), [22], n(50), [10], n(99), [19]);
        expect(evalCff2Dict(priv, [2])).toEqual([[6, [-10, 0]], [10, [50]]]);
    });
});

describe('subsetCidCff: a CID-keyed CFF keeps its FDs (T12)', () => {
    // Four glyphs: 0 .notdef (FD 0), 1 (FD 1, calls its local subr), 2 (FD 0), 3 (FD 1); CIDs 0, 10, 20, 30.
    const local1 = cs(n(5), n(5), [5], [11]);
    const glyphs = [cs([14]), cs(n(0), n(0), [21], n(-107), [10], [14]), cs(n(1), n(2), [21], [14]), cs(n(3), n(4), [21], [14])];
    function build() {
        const FIXED = new Set([15, 17, 18, 0x0C24, 0x0C25, 19]);
        const priv0 = encodeDict([[20, [0]]]);
        const subrsAt = (len) => encodeDict([[20, [0]], [19, [len]]], FIXED).length;
        const priv1 = encodeDict([[20, [0]], [19, [subrsAt(0)]]], FIXED);
        const localIdx = writeIndex([local1]);
        const charset = cs([0], [0, 10], [0, 20], [0, 30]);
        const fdSelect = cs([3], [0, 4], [0, 0, 0], [0, 1, 1], [0, 2, 0], [0, 3, 1], [0, 4]);
        const charStrings = writeIndex(glyphs);
        const strings = writeIndex([new TextEncoder().encode('Adobe'), new TextEncoder().encode('Identity')]);
        const fdArrayOf = (p0, p1) => writeIndex([encodeDict([[18, [priv0.length, p0]]], FIXED), encodeDict([[18, [priv1.length, p1]]], FIXED)]);
        const topOf = (o) => encodeDict([[0x0C1E, [391, 392, 0]], [0x0C22, [31]], [15, [o.charset]], [17, [o.cs]], [0x0C24, [o.fd]], [0x0C25, [o.sel]]], FIXED);
        const head = cs([1, 0, 4, 4]);
        const name = writeIndex([new TextEncoder().encode('Cid')]);
        const gsubr = writeIndex([]);
        const fixedLen = head.length + name.length + writeIndex([topOf({ charset: 0, cs: 0, fd: 0, sel: 0 })]).length + strings.length + gsubr.length;
        const o = { charset: fixedLen };
        o.sel = o.charset + charset.length;
        o.cs = o.sel + fdSelect.length;
        o.fd = o.cs + charStrings.length;
        const fdLen = fdArrayOf(0, 0).length;
        const p0 = o.fd + fdLen;
        const p1 = p0 + priv0.length;
        return concat([head, name, writeIndex([topOf(o)]), strings, gsubr, charset, fdSelect, charStrings, fdArrayOf(p0, p1), priv0, priv1, localIdx]);
    }

    test('the kept glyphs keep their CIDs, FDs and outlines; the FDSelect follows them', () => {
        const bytes = build();
        const parsed = cffMod.parseCff(bytes);
        expect(parsed.fonts[0].fdSelect && [...parsed.fonts[0].fdSelect]).toEqual([0, 1, 0, 1]);
        const out = cffMod.parseCff(subsetCidCff(parsed, bytes, [0, 1, 3]));
        const f = out.fonts[0];
        expect(f.topDict.get(0x0C1E)).toEqual([391, 392, 0]);
        expect([...f.charset]).toEqual([0, 10, 30]);
        expect([...f.fdSelect]).toEqual([0, 1, 1]);
        expect(f.fdArray.length).toBe(2);
        const outline = (p, gid) => {
            const { privateDict, localSubrIndex } = cffMod.privateForGlyph(p.fonts[0], gid);
            return cffMod.decodeCharstring(p.fonts[0].charStringsIndex.items[gid], {
                globalSubrs: p.globalSubrIndex.items, localSubrs: localSubrIndex ? localSubrIndex.items : [],
                nominalWidthX: privateDict && privateDict.get(21) ? privateDict.get(21)[0] : 0
            }).commands;
        };
        expect(outline(out, 1)).toEqual(outline(parsed, 1));
        expect(outline(out, 1)).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 5, y: 5 }]);
        expect(outline(out, 2)).toEqual(outline(parsed, 3));
    });
});

describe('subsetForPdf over the vendored CFF2 face, { cff: true } (T12, D34 A)', () => {
    const src = face('source-sans-3-vf-upright').bytes;
    const font = api.read(src);
    const cps = [...'Hello, wörld! 0123 ﬁ'].map((c) => c.codePointAt(0));

    test('the default instance as a static CID-keyed CFF: no CFF2, no variation tables', () => {
        const r = subsetForPdf(font, new Set(cps), { cff: true });
        const tables = Object.keys(parseSfnt(r.subsetBytes).tables).sort();
        expect(tables).toEqual(['CFF ', 'OS/2', 'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'post']);
        const top = cffMod.parseCff(parseSfnt(r.subsetBytes).tables['CFF '].bytes).fonts[0];
        expect(top.topDict.get(0x0C1E)).toEqual([391, 392, 0]);
        expect(r.fontDescriptor.FontFile3).toBe(r.subsetBytes);
        const back = api.read(r.subsetBytes);
        const a = cffOutlines(src, rt);
        const b = cffOutlines(r.subsetBytes, rt);
        for (const cp of cps) {
            const oldGid = font.glyphIndexForCodePoint(cp, { strict: true });
            const newGid = back.glyphIndexForCodePoint(cp, { strict: true });
            expect(back.getGlyphByIndex(newGid).advanceWidth).toBe(font.getGlyphByIndex(oldGid).advanceWidth);
            expect(b(newGid)).toBe(a(oldGid));
        }
    });

    test('every mapped code point of the face round-trips', () => {
        const r = subsetRoundTrip(src, rt);
        expect([r.missing, r.widthDiffs, r.pathDiffs]).toEqual([0, 0, 0]);
        expect(r.codePoints).toBeGreaterThan(1000);
    });

    test('without the option the face is refused; a CFF2 font with two FDs is refused', () => {
        expect(codeOf(() => subsetForPdf(font, new Set(cps)))).toBe('fonts/subset-bad-font');
        const fake = { ...font, rawSfnt: { ...font.rawSfnt, tables: { ...font.rawSfnt.tables, CFF2: { bytes: twoFdCff2() } } } };
        expect(codeOf(() => subsetForPdf(fake, new Set(cps), { cff: true }))).toBe('fonts/subset-bad-font');
    });
});

/** A CFF2 INDEX (32-bit count, 1-byte offsets) of `items`. */
function cff2Index(items) {
    if (items.length === 0) return new Uint8Array(4);
    const head = [0, 0, 0, items.length, 1];
    let off = 1;
    head.push(off);
    for (const it of items) { off += it.length; head.push(off); }
    return concat([Uint8Array.from(head), ...items]);
}

/** A one-glyph CFF2 program whose FDArray holds two Font DICTs. */
function twoFdCff2() {
    const FIXED = new Set([17, 18, 0x0C24]);
    const privAt = (p) => encodeDict([[18, [0, p]]], FIXED);
    const topOf = (csAt, fdAt) => encodeDict([[17, [csAt]], [0x0C24, [fdAt]]], FIXED);
    const topLen = topOf(0, 0).length;
    const head = Uint8Array.from([2, 0, 5, topLen >> 8, topLen & 0xFF]);
    const gsubr = cff2Index([]);
    const charStrings = cff2Index([cs(n(0), n(0), [21])]);
    const csAt = head.length + topLen + gsubr.length;
    const fdAt = csAt + charStrings.length;
    const fdLen = cff2Index([privAt(0), privAt(0)]).length;
    const end = fdAt + fdLen;
    return concat([head, topOf(csAt, fdAt), gsubr, charStrings, cff2Index([privAt(end), privAt(end)])]);
}
