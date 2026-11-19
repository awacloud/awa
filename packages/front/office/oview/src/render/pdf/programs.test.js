// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview office-coverage-3 T17 (c), D41: Type 1 and CFF programs
 * (`/FontFile`, `/FontFile3`) drawn from their own outlines. Each PDF is
 * written byte by byte around a program built byte by byte, and drawn
 * against a recording 2D context.
 *
 * @module oview/render/pdf/programs.test
 */
import '../../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, beforeAll } from 'bun:test';
import { renderContext } from '../../../tests/context.js';
import { renderPdf } from './pdf.js';

class FakePath {
    constructor() { this.cmds = []; }
    moveTo(...a) { this.cmds.push(['M', ...a]); }
    lineTo(...a) { this.cmds.push(['L', ...a]); }
    bezierCurveTo(...a) { this.cmds.push(['C', ...a]); }
    quadraticCurveTo(...a) { this.cmds.push(['Q', ...a]); }
    rect(...a) { this.cmds.push(['R', ...a]); }
    arc(...a) { this.cmds.push(['A', ...a]); }
    closePath() { this.cmds.push(['Z']); }
    addPath(p) { this.cmds.push(...p.cmds); }
}
function recorder() {
    const calls = [];
    const g = {
        calls, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', globalCompositeOperation: 'source-over',
        lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, imageSmoothingEnabled: true,
        setTransform() {}, translate() {},
        transform(...a) { calls.push(['transform', ...a]); },
        scale(...a) { calls.push(['scale', ...a]); },
        save() {}, restore() {}, setLineDash() {},
        fill(p) { calls.push(['fill', p.cmds]); },
        stroke() {}, clip() {}, fillRect() {}, drawImage() {},
        fillText(t) { calls.push(['text', t]); }, strokeText() {},
        measureText(t) { return { width: 32 * t.length }; },
        createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }
    };
    return g;
}
beforeAll(() => { globalThis.Path2D = /** @type {any} */ (FakePath); });

async function draw(bytes) {
    const proto = /** @type {any} */ (globalThis.HTMLCanvasElement?.prototype);
    const original = proto.getContext;
    let rec = null;
    proto.getContext = function getContext() { rec = recorder(); return rec; };
    try {
        const view = await renderPdf(bytes, renderContext());
        await view.pages?.[0].draw(document.createElement('div'), 1);
        return { calls: /** @type {any} */ (rec)?.calls || [], omissions: view.omissions.map((o) => o.code) };
    } finally {
        proto.getContext = original;
    }
}

// ── a PDF, written by hand ────────────────────────────────────────────
const latin1 = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xFF));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
/** `objects`: strings, or { dict, data } streams; object k + 1 is objects[k]. Page content shows `content`. */
function pdf(fontObjects, content) {
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        { dict: '', data: latin1(`BT /F1 20 Tf 10 10 Td ${content} Tj ET`) },
        ...fontObjects
    ];
    const parts = [latin1('%PDF-1.7\n')];
    let at = parts[0].length;
    const offsets = [];
    objs.forEach((o, k) => {
        offsets.push(at);
        const body = typeof o === 'string'
            ? latin1(`${k + 1} 0 obj\n${o}\nendobj\n`)
            : cat(latin1(`${k + 1} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`), o.data, latin1('\nendstream\nendobj\n'));
        parts.push(body);
        at += body.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    parts.push(latin1(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
    return cat(...parts);
}

// ── a Type 1 program ──────────────────────────────────────────────────
const T1OP = { hsbw: [13], rmoveto: [21], rlineto: [5], closepath: [9], endchar: [14] };
const t1num = (v) => (v >= -107 && v <= 107 ? [v + 139] : v >= 108 && v <= 1131 ? [((v - 108) >> 8) + 247, (v - 108) & 0xFF] : [255, (v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
const t1 = (...t) => t.flatMap((x) => (typeof x === 'number' ? t1num(x) : T1OP[x]));
function encrypt(plain, r) {
    return [49, 50, 51, 52, ...plain].map((p) => { const c = (p ^ (r >> 8)) & 0xFF; r = ((c + r) * 52845 + 22719) & 0xFFFF; return c; });
}
const SQ = (w) => t1(0, 600, 'hsbw', 0, 0, 'rmoveto', w, 0, 'rlineto', 0, w, 'rlineto', 'closepath', 'endchar');
function type1({ matrix = '0.001 0 0 0.001 0 0', encoding = { 65: 'A' } } = {}) {
    const clear = latin1(`%!PS-AdobeFont-1.0: T1 1\n/FontName /T1 def\n/FontType 1 def\n/FontMatrix [${matrix}] readonly def\n` +
        `/Encoding 256 array\n0 1 255 {1 index exch /.notdef put} for\n${Object.entries(encoding).map(([c, n]) => `dup ${c} /${n} put\n`).join('')}readonly def\ncurrentfile eexec\n`);
    const glyphs = { '.notdef': t1(0, 0, 'hsbw', 'endchar'), A: SQ(100), B: SQ(50) };
    const priv = [...latin1('dup /Private 2 dict dup begin\n/Subrs 0 array\n2 index /CharStrings 3 dict dup begin\n')];
    for (const [n, c] of Object.entries(glyphs)) { const e = encrypt(c, 4330); priv.push(...latin1(`/${n} ${e.length} RD `), ...e, ...latin1(' ND\n')); }
    priv.push(...latin1('end\nend\nmark currentfile closefile\n'));
    const cipher = Uint8Array.from(encrypt(priv, 55665));
    return { bytes: cat(clear, cipher), length1: clear.length, length2: cipher.length };
}
function type1Font({ encoding = '', ...o } = {}) {
    const p = type1(o);
    return [
        `<< /Type /Font /Subtype /Type1 /BaseFont /T1 /FirstChar 65 /LastChar 66 /Widths [600 600] /FontDescriptor 6 0 R ${encoding} >>`,
        '<< /Type /FontDescriptor /FontName /T1 /Flags 32 /FontBBox [0 0 600 600] /ItalicAngle 0 /Ascent 600 /Descent 0 /CapHeight 600 /StemV 80 /FontFile 7 0 R >>',
        { dict: `/Length1 ${p.length1} /Length2 ${p.length2} /Length3 0`, data: p.bytes }
    ];
}

// ── a CFF program ─────────────────────────────────────────────────────
const u16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
function index(items) {
    if (items.length === 0) return [0, 0];
    const offs = [1];
    for (const it of items) offs.push(offs[offs.length - 1] + it.length);
    return [...u16(items.length), 4, ...offs.flatMap(u32), ...items.flat()];
}
const int5 = (v) => [29, ...u32(v)];
// 0 0 rmoveto w 0 rlineto 0 w rlineto endchar (Type 2: closed by the reader)
const csq = (w) => [139, 139, 21, ...t1num(w), 139, 5, 139, ...t1num(w), 5, 14];
/** A CFF: name-keyed (charset A = SID 34) or CID-keyed (CIDs 1 and 5). */
function cff({ cid = false } = {}) {
    const head = [1, 0, 4, 4];
    const name = index([[...'C'].map((c) => c.charCodeAt(0))]);
    const str = index([]), gsubr = index([]);
    const glyphs = cid ? [[14], csq(100), csq(50)] : [[14], csq(100)];
    const charset = cid ? [0, ...u16(1), ...u16(5)] : [0, ...u16(34)];
    const csIdx = index(glyphs);
    const priv = [...int5(600), 20];
    const fdPriv = priv;
    const top = (o) => index([[
        ...(cid ? [...int5(391), ...int5(392), ...int5(0), 12, 30, ...int5(o.fdArray), 12, 36, ...int5(o.fdSelect), 12, 37] : []),
        ...int5(o.charset), 15, ...int5(o.cs), 17, ...(cid ? [] : [...int5(priv.length), ...int5(o.priv), 18])
    ]]);
    const lay = (topLen) => {
        const o = {};
        let p = head.length + name.length + topLen + str.length + gsubr.length;
        o.charset = p; p += charset.length;
        o.cs = p; p += csIdx.length;
        o.priv = p; p += priv.length;
        o.fdArrayBytes = index([[...int5(fdPriv.length), ...int5(o.priv), 18]]);
        o.fdArray = p; p += o.fdArrayBytes.length;
        o.fdSelect = p;
        return o;
    };
    const o = lay(top(lay(0)).length);
    return Uint8Array.from([...head, ...name, ...top(o), ...str, ...gsubr, ...charset, ...csIdx, ...priv, ...(cid ? [...o.fdArrayBytes, 0, 0, 0, 0] : [])]);
}

const SQUARE = (w) => [['M', 0, 0], ['L', w, 0], ['L', w, w], ['Z']];
const glyphFills = (calls) => calls.filter((c) => c[0] === 'fill').map((c) => c[1]);

describe('Type 1 programs (/FontFile)', () => {
    test('through the built-in encoding: the glyph drawn, nothing substituted', async () => {
        const { calls, omissions } = await draw(pdf(type1Font(), '(A)'));
        expect(glyphFills(calls)).toEqual([SQUARE(100)]);
        expect(calls.some((c) => c[0] === 'text')).toBe(false);
        expect(calls).toContainEqual(['scale', 0.001, 0.001]);
        expect(omissions).not.toContain('pdf/font-substituted');
    });
    test('through /Differences over the built-in encoding', async () => {
        const { calls } = await draw(pdf(type1Font({ encoding: '/Encoding << /Differences [66 /A 67 /B] >>' }), '(BC)'));
        expect(glyphFills(calls)).toEqual([SQUARE(100), SQUARE(50)]);
    });
    test('a font matrix that is not a uniform scale is drawn as a transform', async () => {
        const { calls } = await draw(pdf(type1Font({ matrix: '0.001 0 0.0002 0.001 0 0' }), '(A)'));
        expect(calls).toContainEqual(['transform', 0.001, 0, 0.0002, 0.001, 0, 0]);
    });
    test('a program that does not read is still substituted', async () => {
        const objs = type1Font();
        objs[2] = { dict: '/Length1 4 /Length2 4 /Length3 0', data: latin1('junkjunk') };
        const { calls, omissions } = await draw(pdf(objs, '(A)'));
        expect(omissions).toContain('pdf/font-substituted');
        expect(calls.some((c) => c[0] === 'text')).toBe(true);
    });
});

describe('CFF programs (/FontFile3)', () => {
    test('Type1C through a named encoding', async () => {
        const objs = [
            '<< /Type /Font /Subtype /Type1 /BaseFont /C /FirstChar 65 /LastChar 65 /Widths [600] /Encoding /WinAnsiEncoding /FontDescriptor 6 0 R >>',
            '<< /Type /FontDescriptor /FontName /C /Flags 32 /FontBBox [0 0 600 600] /ItalicAngle 0 /Ascent 600 /Descent 0 /CapHeight 600 /StemV 80 /FontFile3 7 0 R >>',
            { dict: '/Subtype /Type1C', data: cff() }
        ];
        const { calls, omissions } = await draw(pdf(objs, '(A)'));
        expect(glyphFills(calls)).toEqual([SQUARE(100)]);
        expect(omissions).not.toContain('pdf/font-substituted');
    });
    test('CIDFontType0C under Identity-H: the code is the CID', async () => {
        const objs = [
            '<< /Type /Font /Subtype /Type0 /BaseFont /C /Encoding /Identity-H /DescendantFonts [8 0 R] >>',
            '<< /Type /FontDescriptor /FontName /C /Flags 4 /FontBBox [0 0 600 600] /ItalicAngle 0 /Ascent 600 /Descent 0 /CapHeight 600 /StemV 80 /FontFile3 7 0 R >>',
            { dict: '/Subtype /CIDFontType0C', data: cff({ cid: true }) },
            '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /C /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 600 >>'
        ];
        const { calls, omissions } = await draw(pdf(objs, '<00050001>'));
        expect(glyphFills(calls)).toEqual([SQUARE(50), SQUARE(100)]);
        expect(omissions).not.toContain('pdf/font-substituted');
    });
});

// T75 — a composite font under an embedded CMap stream: code → CID through
// fonts' cmapCid (the CFF's CIDs 1 and 5 draw squares of 100 and 50).
describe('composite fonts under an embedded CMap (T75)', () => {
    const CS2 = '1 begincodespacerange <0000> <FFFF> endcodespacerange';
    const RANGE = '1 begincidrange <0100> <0100> 5 endcidrange 1 begincidchar <0101> 1 endcidchar';
    /** The Type0 font of the Identity-H test, its /Encoding object 9 (and 10, 11, …: `more`). */
    function cmapFont(cmap, cmapDict = '', more = []) {
        return [
            '<< /Type /Font /Subtype /Type0 /BaseFont /C /Encoding 9 0 R /DescendantFonts [8 0 R] >>',
            '<< /Type /FontDescriptor /FontName /C /Flags 4 /FontBBox [0 0 600 600] /ItalicAngle 0 /Ascent 600 /Descent 0 /CapHeight 600 /StemV 80 /FontFile3 7 0 R >>',
            { dict: '/Subtype /CIDFontType0C', data: cff({ cid: true }) },
            '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /C /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 600 >>',
            { dict: `/Type /CMap /CMapName /T-H ${cmapDict}`, data: latin1(cmap) },
            ...more
        ];
    }

    test('the CMap stream maps the codes to their CIDs: the two glyphs drawn', async () => {
        const { calls, omissions } = await draw(pdf(cmapFont(`${CS2} ${RANGE}`), '<01000101>'));
        expect(glyphFills(calls)).toEqual([SQUARE(50), SQUARE(100)]);
        expect(calls.some((c) => c[0] === 'text')).toBe(false);
        expect(omissions).not.toContain('pdf/font-substituted');
    });

    test('a /UseCMap stream under it holds the mapping: drawn too', async () => {
        const objs = cmapFont(`/Base-H usecmap ${CS2}`, '/UseCMap 10 0 R',
            [{ dict: '/Type /CMap /CMapName /Base-H', data: latin1(`${CS2} ${RANGE}`) }]);
        const { calls, omissions } = await draw(pdf(objs, '<01000101>'));
        expect(glyphFills(calls)).toEqual([SQUARE(50), SQUARE(100)]);
        expect(omissions).not.toContain('pdf/font-substituted');
    });

    // T79: re-pinned. The painter reads the codes by the decoder's split
    // (T78), so a codespace of 1 and 2 bytes is drawn from the outlines.
    test('a CMap whose codespace is 1 and 2 bytes: each code at its length, drawn', async () => {
        const objs = cmapFont('2 begincodespacerange <00> <7F> <8000> <FFFF> endcodespacerange 2 begincidchar <41> 5 <8140> 1 endcidchar');
        const { calls, omissions } = await draw(pdf(objs, '<418140>'));
        expect(glyphFills(calls)).toEqual([SQUARE(50), SQUARE(100)]);
        expect(omissions).not.toContain('pdf/font-substituted');
    });
});
