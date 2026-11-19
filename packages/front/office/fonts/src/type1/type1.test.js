// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T17 (a), D41: Type 1 programs. Every program here is
// built and encrypted byte by byte, in its three forms (PFA, PFB, the PDF
// /FontFile form).

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { fontType1 } from './type1.js';
import { fontType1Charstring } from './charstring.js';

let readType1, cs, ParseError, ContractError;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ readType1 } = rt.resolve('fontType1'));
    cs = rt.resolve('fontType1Charstring');
    ({ ParseError, ContractError } = rt.resolve('fontErrors'));
});

// ── building a program ────────────────────────────────────────────────
const OP = {
    hstem: [1], vstem: [3], vmoveto: [4], rlineto: [5], hlineto: [6], vlineto: [7], rrcurveto: [8],
    closepath: [9], callsubr: [10], return: [11], hsbw: [13], endchar: [14], rmoveto: [21], hmoveto: [22],
    vhcurveto: [30], hvcurveto: [31], dotsection: [12, 0], vstem3: [12, 1], hstem3: [12, 2], seac: [12, 6],
    sbw: [12, 7], div: [12, 12], callothersubr: [12, 16], pop: [12, 17], setcurrentpoint: [12, 33]
};
function num(v) {
    if (v >= -107 && v <= 107) return [v + 139];
    if (v >= 108 && v <= 1131) { const w = v - 108; return [(w >> 8) + 247, w & 0xFF]; }
    if (v <= -108 && v >= -1131) { const w = -v - 108; return [(w >> 8) + 251, w & 0xFF]; }
    return [255, (v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
}
/** A charstring from tokens: numbers and operator names. */
const prog = (...t) => new Uint8Array(t.flatMap((x) => (typeof x === 'number' ? num(x) : OP[x])));
function encrypt(plain, r, prefix) {
    const src = [...prefix, ...plain];
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) {
        const c = (src[i] ^ (r >> 8)) & 0xFF;
        out[i] = c;
        r = ((c + r) * 52845 + 22719) & 0xFFFF;
    }
    return out;
}
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const PAD4 = [0x31, 0x32, 0x33, 0x34];
/** The charstring bytes as stored: encrypted with `lenIV` bytes first (−1: plain). */
const stored = (c, lenIV) => (lenIV < 0 ? c : encrypt(c, 4330, PAD4.slice(0, lenIV).concat(Array(Math.max(0, lenIV - 4)).fill(0))));

/**
 * The program: `glyphs` { name: charstring }, `subrs` [charstring], the
 * encoding (`'StandardEncoding'` or { code: name }), `lenIV`.
 */
function program({ glyphs, subrs = [], encoding = 'StandardEncoding', lenIV = 4, rd = 'RD', nd = 'ND', np = 'NP', name = 'TestT1' }) {
    const enc = encoding === 'StandardEncoding'
        ? '/Encoding StandardEncoding def\n'
        : `/Encoding 256 array\n0 1 255 {1 index exch /.notdef put} for\n${Object.entries(encoding).map(([c, n]) => `dup ${c} /${n} put\n`).join('')}readonly def\n`;
    const clear = ascii(`%!PS-AdobeFont-1.0: ${name} 001.000\n11 dict begin\n/FontInfo 2 dict dup begin /version (001.000) readonly def end readonly def\n` +
        `/FontName /${name} def\n/PaintType 0 def\n/FontType 1 def\n/FontMatrix [0.001 0 0 0.001 0 0] readonly def\n${enc}` +
        `/FontBBox {-10 -250 1000 900} readonly def\ncurrentdict end\ncurrentfile eexec\n`);
    const priv = [];
    const put = (s) => priv.push(...ascii(s));
    const bin = (b) => priv.push(...b);
    put('dup /Private 8 dict dup begin\n/RD{string currentfile exch readstring pop}executeonly def\n/ND{noaccess def}executeonly def\n/NP{noaccess put}executeonly def\n');
    if (lenIV !== 4) put(`/lenIV ${lenIV} def\n`);
    put('/BlueValues [-20 0 700 720] def\n/MinFeature{16 16}def\n/password 5839 def\n');
    put(`/Subrs ${subrs.length} array\n`);
    subrs.forEach((s, i) => { const b = stored(s, lenIV); put(`dup ${i} ${b.length} ${rd} `); bin(b); put(` ${np}\n`); });
    put(`ND\n2 index /CharStrings ${Object.keys(glyphs).length} dict dup begin\n`);
    for (const [n, c] of Object.entries(glyphs)) { const b = stored(c, lenIV); put(`/${n} ${b.length} ${rd} `); bin(b); put(` ${nd}\n`); }
    put('end\nend\nreadonly put\nnoaccess put\ndup /FontName get exch definefont pop\nmark currentfile closefile\n');
    const cipher = encrypt(priv, 55665, PAD4);
    const trailer = ascii(`${'0'.repeat(64)}\n`.repeat(8) + 'cleartomark\n');
    return { clear: new Uint8Array(clear), cipher, trailer: new Uint8Array(trailer) };
}
const hex = (b) => ascii([...b].map((x) => x.toString(16).padStart(2, '0')).join('').replace(/(.{64})/g, '$1\n'));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const pfa = (p) => cat(p.clear, new Uint8Array(hex(p.cipher)), new Uint8Array([10]), p.trailer);
const pdfForm = (p) => cat(p.clear, p.cipher); // no trailer, as PDF producers often embed it
function pfb(p) {
    const seg = (t, b) => cat(new Uint8Array([0x80, t, b.length & 0xFF, (b.length >> 8) & 0xFF, (b.length >> 16) & 0xFF, b.length >>> 24]), b);
    return cat(seg(1, p.clear), seg(2, p.cipher), seg(1, p.trailer), new Uint8Array([0x80, 3]));
}

const SQUARE = prog(50, 600, 'hsbw', 0, 0, 'rmoveto', 400, 0, 'rlineto', 0, 400, 'rlineto', -400, 0, 'rlineto', 'closepath', 'endchar');
const pts = (path) => path.map((c) => (c.type === 'C' ? ['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y] : c.type === 'Z' ? ['Z'] : [c.type, c.x, c.y]));
const codeOf = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };

describe('fontType1 — descriptors', () => {
    test('two strict factory descriptors, registered in the modules', () => {
        expect(fontType1.name).toBe('fontType1');
        expect(fontType1Charstring.name).toBe('fontType1Charstring');
        expect(modules).toContain(fontType1);
        expect(modules).toContain(fontType1Charstring);
    });
});

describe('fontType1 — the three forms', () => {
    const p = program({ glyphs: { '.notdef': prog(0, 250, 'hsbw', 'endchar'), A: SQUARE } });
    test('PFA, PFB and the PDF form give the same font', () => {
        const fonts = [pfa(p), pfb(p), pdfForm(p)].map((b) => readType1(b));
        for (const f of fonts) {
            expect(f.fontName).toBe('TestT1');
            expect(f.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
            expect(f.fontBBox).toEqual([-10, -250, 1000, 900]);
            expect(f.glyphNames).toEqual(['.notdef', 'A']);
            expect(pts(f.glyph('A').path)).toEqual([['M', 50, 0], ['L', 450, 0], ['L', 450, 400], ['L', 50, 400], ['Z']]);
            expect([f.glyph('A').advanceWidth, f.glyph('A').leftSideBearing]).toEqual([600, 50]);
        }
        expect(fonts[0].glyph('missing')).toBeNull();
    });
    test('the PDF form split at /Length1 and /Length2', () => {
        const b = cat(pdfForm(p), p.trailer);
        const f = readType1(b, { length1: p.clear.length, length2: p.cipher.length });
        expect(f.glyphNames).toEqual(['.notdef', 'A']);
    });
    test('a binary section whose first byte reads as white space is still found', () => {
        // Find a password prefix whose first cipher byte is a space or a line feed.
        for (let k = 0; k < 4096; k++) {
            const plain = [...ascii('dup /Private 2 dict dup begin\n/RD{string currentfile exch readstring pop}executeonly def\n/Subrs 0 array\n2 index /CharStrings 1 dict dup begin\n')];
            const c = stored(SQUARE, 4);
            const body = [...plain, ...ascii(`/A ${c.length} RD `), ...c, ...ascii(' ND\nend\nend\n')];
            const pre = [k & 0xFF, k >> 8, 7, 9];
            const cipher = encrypt(body, 55665, pre);
            if (cipher[0] !== 0x20 && cipher[0] !== 0x0A) continue;
            const f = readType1(cat(p.clear, cipher));
            expect(f.glyphNames).toEqual(['A']);
            return;
        }
        throw new Error('no such prefix found');
    });
});

describe('fontType1 — the private dict', () => {
    test('lenIV 4, 0 and -1 (unencrypted charstrings), and the -| |- | aliases', () => {
        for (const lenIV of [4, 0, -1]) {
            const p = program({ glyphs: { A: SQUARE }, lenIV, rd: '-|', nd: '|-', np: '|' });
            expect(pts(readType1(pfa(p)).glyph('A').path)).toHaveLength(5);
        }
    });
    test('the built-in encoding: StandardEncoding, or a dup … put array', () => {
        const std = readType1(pfa(program({ glyphs: { A: SQUARE } }))).encoding;
        expect(std).toHaveLength(256);
        expect([std[65], std[0xE1], std[0]]).toEqual(['A', 'AE', null]);
        const own = readType1(pfa(program({ glyphs: { A: SQUARE }, encoding: { 1: 'A', 200: 'zcaron' } }))).encoding;
        expect([own[1], own[200], own[65]]).toEqual(['A', 'zcaron', null]);
    });
});

describe('fontType1Charstring — the operators', () => {
    const draw = (c, more = {}) => readType1(pfa(program({ glyphs: { '.notdef': prog(0, 0, 'hsbw', 'endchar'), X: c, ...more.glyphs }, subrs: more.subrs }))).glyph('X');
    test('the line and curve families, from the side bearing point', () => {
        const g = draw(prog(10, 500, 'hsbw', 5, 'hmoveto', 100, 'hlineto', 50, 'vlineto', 0, 'vmoveto', 10, 20, 30, 40, 50, 60, 'rrcurveto',
            10, 20, 30, 40, 'vhcurveto', 10, 20, 30, 40, 'hvcurveto', 'closepath', 'endchar'));
        expect(pts(g.path)).toEqual([
            ['M', 15, 0], ['L', 115, 0], ['L', 115, 50], ['M', 115, 50],
            ['C', 125, 70, 155, 110, 205, 170], ['C', 205, 180, 225, 210, 265, 210], ['C', 275, 210, 295, 240, 295, 280], ['Z']
        ]);
    });
    test('a line with no open subpath starts one at the current point; closepath keeps the current point', () => {
        const g = draw(prog(0, 500, 'hsbw', 100, 0, 'rmoveto', 10, 0, 'rlineto', 'closepath', 0, 10, 'rlineto', 'endchar'));
        expect(pts(g.path)).toEqual([['M', 100, 0], ['L', 110, 0], ['Z'], ['M', 110, 0], ['L', 110, 10]]);
    });
    test('callsubr and return, nested', () => {
        const g = draw(prog(0, 500, 'hsbw', 0, 'callsubr', 'endchar'), { subrs: [prog(1, 'callsubr', 7, 7, 'rlineto', 'return'), prog(3, 3, 'rmoveto', 'return')] });
        expect(pts(g.path)).toEqual([['M', 3, 3], ['L', 10, 10]]);
    });
    test('flex (othersubrs 1, 2, 0): two curves, then setcurrentpoint', () => {
        const flexSubrs = [prog(3, 0, 'callothersubr', 'pop', 'pop', 'setcurrentpoint', 'return'), prog(0, 1, 'callothersubr', 'return'), prog(0, 2, 'callothersubr', 'return')];
        // reference point, then the six points of the two curves (relative moves)
        const c = prog(0, 500, 'hsbw', 0, 0, 'rmoveto', 1, 'callsubr',
            100, 0, 'rmoveto', 2, 'callsubr',
            10, 5, 'rmoveto', 2, 'callsubr', 20, 0, 'rmoveto', 2, 'callsubr', 20, 0, 'rmoveto', 2, 'callsubr',
            20, 0, 'rmoveto', 2, 'callsubr', 20, -5, 'rmoveto', 2, 'callsubr', 10, 0, 'rmoveto', 2, 'callsubr',
            50, 200, 0, 0, 'callsubr', 0, 50, 'rlineto', 'endchar');
        const g = draw(c, { subrs: flexSubrs });
        expect(pts(g.path)).toEqual([['M', 0, 0], ['C', 110, 5, 130, 5, 150, 5], ['C', 170, 5, 190, 0, 200, 0], ['L', 200, 50]]);
    });
    test('hint replacement (othersubr 3): pop hands back the subroutine number', () => {
        const subrs = [prog('return'), prog('return'), prog('return'), prog('return'), prog(20, 'hlineto', 'return')];
        const g = draw(prog(0, 500, 'hsbw', 0, 0, 'rmoveto', 4, 1, 3, 'callothersubr', 'pop', 'callsubr', 'endchar'), { subrs });
        expect(pts(g.path)).toEqual([['M', 0, 0], ['L', 20, 0]]);
    });
    test('an unknown othersubr hands its arguments back in order', () => {
        const g = draw(prog(0, 500, 'hsbw', 0, 0, 'rmoveto', 30, 40, 2, 99, 'callothersubr', 'pop', 'pop', 'rlineto', 'endchar'));
        expect(pts(g.path)).toEqual([['M', 0, 0], ['L', 30, 40]]);
    });
    test('div and setcurrentpoint; the hints read and ignored', () => {
        const g = draw(prog(0, 500, 'hsbw', 0, 10, 'hstem', 0, 10, 'vstem', 1, 2, 3, 4, 5, 6, 'hstem3', 1, 2, 3, 4, 5, 6, 'vstem3', 'dotsection',
            0, 0, 'rmoveto', 7, 2, 'div', 0, 'rlineto', 300, 300, 'setcurrentpoint', 10, 0, 'rlineto', 'endchar'));
        expect(pts(g.path)).toEqual([['M', 0, 0], ['L', 3.5, 0], ['L', 310, 300]]);
    });
    test('sbw: the side bearing point and the advance', () => {
        const g = draw(prog(20, 30, 700, 0, 'sbw', 0, 0, 'rmoveto', 5, 5, 'rlineto', 'endchar'));
        expect([g.advanceWidth, g.leftSideBearing]).toEqual([700, 20]);
        expect(pts(g.path)).toEqual([['M', 20, 30], ['L', 25, 35]]);
    });
    test('seac: the base, then the accent moved by adx - asb plus the side bearing', () => {
        const glyphs = {
            A: prog(10, 600, 'hsbw', 0, 0, 'rmoveto', 100, 0, 'rlineto', 'endchar'),
            acute: prog(40, 300, 'hsbw', 0, 600, 'rmoveto', 50, 50, 'rlineto', 'endchar')
        };
        // StandardEncoding: A = 65, acute = 194
        const g = draw(prog(10, 600, 'hsbw', 40, 200, 30, 65, 194, 'seac'), { glyphs });
        expect(g.advanceWidth).toBe(600);
        expect(pts(g.path)).toEqual([['M', 10, 0], ['L', 110, 0], ['M', 210, 630], ['L', 260, 680]]);
    });
    test('the interpreter alone: decrypt, then draw', () => {
        const c = encrypt([...SQUARE], 4330, PAD4);
        expect([...cs.decrypt(c, 4330, 4)]).toEqual([...SQUARE]);
        const out = cs.draw(SQUARE, { subrs: [], glyph: () => null });
        expect(out.advanceWidth).toBe(600);
    });
});

describe('fontType1 — errors', () => {
    test('every code', () => {
        expect(codeOf(() => readType1('x'))).toEqual(['ContractError', 'fonts/type1-bad-input']);
        expect(codeOf(() => readType1(new Uint8Array(ascii('%!PS-AdobeFont-1.0 no section'))))).toEqual(['ParseError', 'fonts/type1-no-eexec']);
        expect(codeOf(() => readType1(new Uint8Array(ascii('hello world, not a font'))))).toEqual(['ParseError', 'fonts/type1-not-type1']);
        const p = program({ glyphs: { A: SQUARE } });
        const noCs = cat(p.clear, encrypt(ascii('dup /Private 1 dict dup begin end'), 55665, PAD4));
        expect(codeOf(() => readType1(noCs))).toEqual(['ParseError', 'fonts/type1-bad-dict']);
        const loop = readType1(pfa(program({ glyphs: { A: prog(0, 500, 'hsbw', 0, 'callsubr', 'endchar') }, subrs: [prog(0, 'callsubr', 'return')] })));
        expect(codeOf(() => loop.glyph('A'))).toEqual(['ParseError', 'fonts/type1-charstring-budget']);
        const missing = readType1(pfa(program({ glyphs: { A: prog(0, 500, 'hsbw', 9, 'callsubr', 'endchar') } })));
        expect(codeOf(() => missing.glyph('A'))).toEqual(['ParseError', 'fonts/type1-missing-subr']);
        expect(ParseError).toBeDefined();
        expect(ContractError).toBeDefined();
    });
});
