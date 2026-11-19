// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T17 (b), D41: a bare CFF program (a PDF's /FontFile3
// Type1C or CIDFontType0C) read as a font. Every program here is built
// byte by byte.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { fontCffProgram } from './cff.js';

let readCff, parseCff, SID;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ readCff } = rt.resolve('fontCffProgram'));
    const t = rt.resolve('tableCff');
    parseCff = t.parseCff;
    SID = (n) => t.CFF_STANDARD_STRINGS.indexOf(n);
});

// ── building a program ────────────────────────────────────────────────
const u16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function index(items) {
    if (items.length === 0) return [0, 0];
    const offs = [1];
    for (const it of items) offs.push(offs[offs.length - 1] + it.length);
    return [...u16(items.length), 4, ...offs.flatMap(u32), ...items.flat()];
}
/** A DICT operand: a five-byte integer, or a real. */
function operand(v) {
    if (Number.isInteger(v)) return [29, ...u32(v)];
    const s = String(v);
    const nib = [];
    for (const c of s) nib.push(c === '.' ? 0xA : c === '-' ? 0xE : Number(c));
    nib.push(0xF);
    if (nib.length & 1) nib.push(0xF);
    const out = [30];
    for (let i = 0; i < nib.length; i += 2) out.push((nib[i] << 4) | nib[i + 1]);
    return out;
}
/** A DICT from [operands, op] pairs. */
const dict = (entries) => entries.flatMap(([ops, op]) => [...ops.flatMap(operand), ...(op >= 0x0C00 ? [12, op & 0xFF] : [op])]);
/** A Type 2 charstring from numbers (one or two bytes) and operator bytes given as strings. */
const OPS = { rmoveto: 21, rlineto: 5, endchar: 14 };
function cs(...t) {
    return t.flatMap((x) => {
        if (typeof x === 'string') return [OPS[x]];
        if (x >= -107 && x <= 107) return [x + 139];
        if (x >= 108 && x <= 1131) return [247 + ((x - 108) >> 8), (x - 108) & 0xFF];
        if (x <= -108 && x >= -1131) return [251 + ((-x - 108) >> 8), (-x - 108) & 0xFF];
        return [28, ...u16(x & 0xFFFF)];
    });
}

/**
 * A CFF: `glyphs` [charstring bytes], `charset` the charset bytes (or
 * `charsetOp` a predefined one), `encoding` its bytes (or `encodingOp`),
 * `priv` the Private DICT entries; `cid` { fds: [{ priv, matrix }],
 * fdSelect: bytes } makes it CID-keyed; `top` more Top DICT entries.
 */
function cff({ glyphs, charset, charsetOp, encoding, encodingOp, priv = [], cid, top = [], strings = [], noCharStrings = false, major = 1 }) {
    const head = [major, 0, 4, 4];
    const name = index([ascii('TestCFF')]);
    const str = index(strings.map(ascii));
    const gsubr = index([]);
    const build = (o) => {
        const e = [...top];
        if (cid) e.push([[391, 392, 0], 0x0C1E], [[glyphs.length], 0x0C22], [[o.fdArray], 0x0C24], [[o.fdSelect], 0x0C25]);
        if (charset) e.push([[o.charset], 15]); else if (charsetOp !== undefined) e.push([[charsetOp], 15]);
        if (encoding) e.push([[o.encoding], 16]); else if (encodingOp !== undefined) e.push([[encodingOp], 16]);
        if (!noCharStrings) e.push([[o.charStrings], 17]);
        if (!cid) e.push([[o.privSize, o.priv], 18]);
        return index([dict(e)]);
    };
    const privBytes = dict(priv);
    const fdPrivs = cid ? cid.fds.map((fd) => dict(fd.priv)) : [];
    const csIndex = index(glyphs);
    const layout = (topLen) => {
        const o = {};
        let p = head.length + name.length + topLen + str.length + gsubr.length;
        if (charset) { o.charset = p; p += charset.length; }
        if (encoding) { o.encoding = p; p += encoding.length; }
        o.charStrings = p; p += csIndex.length;
        o.priv = p; o.privSize = privBytes.length; p += privBytes.length;
        if (cid) {
            o.fdPrivs = [];
            for (const fp of fdPrivs) { o.fdPrivs.push(p); p += fp.length; }
            const fdDicts = cid.fds.map((fd, k) => dict([...(fd.matrix ? [[fd.matrix, 0x0C07]] : []), [[fdPrivs[k].length, o.fdPrivs[k]], 18]]));
            o.fdArrayBytes = index(fdDicts);
            o.fdArray = p; p += o.fdArrayBytes.length;
            o.fdSelect = p;
        }
        return o;
    };
    const o = layout(build(layout(0)).length);
    const topIdx = build(o);
    return new Uint8Array([...head, ...name, ...topIdx, ...str, ...gsubr, ...(charset || []), ...(encoding || []), ...csIndex, ...privBytes,
        ...(cid ? fdPrivs.flat() : []), ...(cid ? o.fdArrayBytes : []), ...(cid ? cid.fdSelect : [])]);
}

const NOTDEF = cs('endchar');
const A = cs(50, 10, 0, 'rmoveto', 100, 0, 'rlineto', 0, 100, 'rlineto', 'endchar'); // width 50 + nominal
const B = cs(0, 0, 'rmoveto', 20, 20, 'rlineto', 'endchar'); // no width: defaultWidthX
const TWO = cs(0, 0, 'rmoveto', 10, 0, 'rlineto', 0, 20, 'rmoveto', 5, 0, 'rlineto', 'endchar');
const PRIV = [[[500], 20], [[100], 21]];
const charset0 = (...names) => [0, ...names.flatMap((n) => u16(SID(n)))];
const pts = (path) => path.map((c) => (c.type === 'C' ? ['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y] : c.type === 'Z' ? ['Z'] : [c.type, c.x, c.y]));
const codeOf = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };

describe('fontCffProgram — descriptor', () => {
    test('a strict factory descriptor, registered in the modules', () => {
        expect(fontCffProgram.name).toBe('fontCffProgram');
        expect(modules).toContain(fontCffProgram);
    });
});

describe('fontCffProgram — a name-keyed font', () => {
    const bytes = () => cff({ glyphs: [NOTDEF, A, B, TWO], charset: charset0('A', 'B', 'C'), priv: PRIV, top: [[[0, -200, 1000, 800], 5]] });
    test('the font: name, matrix, box, names, glyph indices', () => {
        const f = readCff(bytes());
        expect([f.fontName, f.cidKeyed, f.numGlyphs]).toEqual(['TestCFF', false, 4]);
        expect(f.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
        expect(f.fontBBox).toEqual([0, -200, 1000, 800]);
        expect(f.glyphNames).toEqual(['.notdef', 'A', 'B', 'C']);
        expect([f.cids, f.gidOfName('B'), f.gidOfName('Z')]).toEqual([null, 2, -1]);
        expect(f.glyph(99)).toBeNull();
    });
    test('widths: nominalWidthX plus the charstring\'s, else defaultWidthX; every contour closed', () => {
        const f = readCff(bytes());
        const a = f.glyph(1);
        expect([a.gid, a.name, a.cid, a.advanceWidth]).toEqual([1, 'A', null, 150]);
        expect(pts(a.path)).toEqual([['M', 10, 0], ['L', 110, 0], ['L', 110, 100], ['Z']]);
        expect(f.glyph(2).advanceWidth).toBe(500);
        expect(pts(f.glyph(3).path)).toEqual([['M', 0, 0], ['L', 10, 0], ['Z'], ['M', 10, 20], ['L', 15, 20], ['Z']]);
        expect(a.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
    });
    test('seac: the base, then the accent moved by (adx, ady); a missing accent leaves the base', () => {
        const ACUTE = cs(0, 600, 'rmoveto', 50, 50, 'rlineto', 'endchar');
        const SEAC = cs(200, 30, 65, 194, 'endchar');
        const f = readCff(cff({ glyphs: [NOTDEF, A, ACUTE, SEAC], charset: charset0('A', 'acute', 'Aacute'), priv: PRIV }));
        expect(pts(f.glyph(3).path)).toEqual([['M', 10, 0], ['L', 110, 0], ['L', 110, 100], ['Z'], ['M', 200, 630], ['L', 250, 680], ['Z']]);
        const g = readCff(cff({ glyphs: [NOTDEF, A, SEAC], charset: charset0('A', 'Aacute'), priv: PRIV }));
        expect(pts(g.glyph(2).path)).toEqual([['M', 10, 0], ['L', 110, 0], ['L', 110, 100], ['Z']]);
    });
});

describe('tableCff / fontCffProgram — the Encoding', () => {
    const enc = (o) => readCff(cff({ glyphs: [NOTDEF, A, B], charset: charset0('A', 'B'), priv: PRIV, ...o }));
    test('the predefined Standard (no operator, or 0) and Expert (1) encodings', () => {
        for (const o of [{}, { encodingOp: 0 }]) {
            const e = enc(o).encoding;
            expect([e.length, e[65], e[0xD0], e[0]]).toEqual([256, 'A', 'emdash', null]);
        }
        const x = enc({ encodingOp: 1 }).encoding;
        expect([x[33], x[0x40], x[0xFF]]).toEqual(['exclamsmall', null, 'Ydieresissmall']);
        const bytes = cff({ glyphs: [NOTDEF, A, B], charset: charset0('A', 'B'), priv: PRIV, encodingOp: 1 });
        expect(parseCff(bytes).fonts[0].encodingKind).toBe('expert');
    });
    test('format 0 with a supplement, and format 1', () => {
        const e0 = enc({ encoding: [0x80, 2, 65, 66, 1, 200, ...u16(SID('B'))] });
        expect([e0.encoding[65], e0.encoding[66], e0.encoding[200], e0.encoding[67]]).toEqual(['A', 'B', 'B', null]);
        const e1 = enc({ encoding: [1, 1, 97, 1] });
        expect([e1.encoding[97], e1.encoding[98], e1.encoding[65]]).toEqual(['A', 'B', null]);
        expect(parseCff(cff({ glyphs: [NOTDEF, A, B], charset: charset0('A', 'B'), priv: PRIV, encoding: [1, 1, 97, 1] })).fonts[0].encodingKind).toBe('custom');
    });
    test('an unknown format or an offset past the data gives null', () => {
        expect(enc({ encoding: [5, 0] }).encoding).toBeNull();
        expect(enc({ encodingOp: 999999 }).encoding).toBeNull();
    });
});

describe('fontCffProgram — a CID-keyed font', () => {
    const bytes = () => cff({
        glyphs: [NOTDEF, A, B],
        charset: [0, ...u16(1), ...u16(5)],
        cid: { fds: [{ priv: [[[1000], 20]] }, { priv: [[[500], 20], [[100], 21]], matrix: [0.002, 0, 0, 0.002, 0, 0] }], fdSelect: [3, ...u16(2), ...u16(0), 0, ...u16(2), 1, ...u16(3)] },
        top: [[[1, 0, 0, 1, 0, 0], 0x0C07]]
    });
    test('CIDs, the Font DICT of every glyph: its widths and its matrix times the Top DICT\'s', () => {
        const f = readCff(bytes());
        expect([f.cidKeyed, f.glyphNames, f.encoding]).toEqual([true, null, null]);
        expect(f.cids).toEqual([0, 1, 5]);
        expect([f.gidOfCid(5), f.gidOfCid(7)]).toEqual([2, -1]);
        const g1 = f.glyph(1), g2 = f.glyph(2);
        expect([g1.cid, g1.name, g1.advanceWidth]).toEqual([1, null, 50]); // its own width, FD 0's nominalWidthX 0
        expect(g1.fontMatrix).toEqual([1, 0, 0, 1, 0, 0]);
        expect([g2.cid, g2.advanceWidth]).toEqual([5, 500]);
        expect(g2.fontMatrix).toEqual([0.002, 0, 0, 0.002, 0, 0]);
    });
});

describe('fontCffProgram — errors', () => {
    test('every code', () => {
        expect(codeOf(() => readCff('x'))).toEqual(['ContractError', 'fonts/cff-bad-input']);
        expect(codeOf(() => readCff(cff({ glyphs: [NOTDEF], noCharStrings: true })))).toEqual(['ParseError', 'fonts/cff-no-charstrings']);
        expect(codeOf(() => readCff(cff({ glyphs: [NOTDEF], major: 2 })))).toEqual(['ParseError', 'fonts/cff-version']);
    });
});
