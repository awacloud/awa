// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T7 (a): oconv's pdf font decoder, moved into pdf as the extra pdfFontDecoder
// (D5 A, D35); these are its tests, ported to the pdf runtime.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
// pdf's pkg_require carries the whole @awacloud/fonts manifest: with it, every
// pdf + fonts module the decoder depends on.
import { fw_require, pkg_require, modules, extras } from '../main.js';
import { pdfFontDecoder } from './font-decoder.js';

let obj;
let cmap;
let buildDecoder;
let decodeShow;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(pkg_require);
    rt.registerAll(modules);
    rt.register(pdfFontDecoder);

    obj = rt.resolve('pdfParser').obj;
    cmap = rt.resolve('cmapToUnicode');
    ({ buildDecoder, decodeShow } = rt.resolve('pdfFontDecoder'));
});

const enc = (s) => new TextEncoder().encode(s);
const identity = (r) => r;

describe('pdfFontDecoder — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(pdfFontDecoder.name).toBe('pdfFontDecoder');
        expect(pdfFontDecoder.dependencies).toEqual([
            'pdfFont', 'pdfFontEncoding', 'pdfFilterDispatch',
            'cmapToUnicode', 'encodingLookup', 'encodingAgl', 'standard14Lookup',
            'fontType1', 'fontCffProgram', 'fontSfnt', 'encodingTexMath', 'cmapCid'
        ]);
        expect(typeof pdfFontDecoder.factory).toBe('function');
    });
});

describe('pdfFontDecoder — ToUnicode path', () => {
    test('decodes single-byte codes through the font ToUnicode CMap', () => {
        const uMap = new Map([[0x41, 'A'], [0x42, 'B'], [0x43, 'C']]);
        const toUniSrc = cmap.buildToUnicode(uMap);
        const fontDict = obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica'),
            ToUnicode: obj.stream(obj.dict({}), enc(toUniSrc))
        });
        const dec = buildDecoder(fontDict, identity);
        expect(dec.subtype).toBe('Type1');
        expect(dec.cidBytes).toBe(1);
        const r = decodeShow(dec, new Uint8Array([0x41, 0x42, 0x43]));
        expect(r).toEqual({ text: 'ABC', decoded: 3, undecodable: 0 });
    });

    test('Type0 font reads 2-byte codes through ToUnicode', () => {
        const uMap = new Map([[0x0041, 'A'], [0x0042, 'B']]);
        const toUniSrc = cmap.buildToUnicode(uMap);
        const fontDict = obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'),
            BaseFont: obj.name('Sub'),
            ToUnicode: obj.stream(obj.dict({}), enc(toUniSrc))
        });
        const dec = buildDecoder(fontDict, identity);
        expect(dec.cidBytes).toBe(2);
        const r = decodeShow(dec, new Uint8Array([0x00, 0x41, 0x00, 0x42]));
        expect(r).toEqual({ text: 'AB', decoded: 2, undecodable: 0 });
    });
});

describe('pdfFontDecoder — encoding-table + AGL path', () => {
    test('Differences glyphs resolve via the AGL hop; unknown names are undecodable', () => {
        // No ToUnicode → the encoding table + encodingAgl.glyphNameToUnicode
        // path is taken (task 02). `uni0041` resolves through the AGL uni-form
        // heuristic; `B` through the vendored AGL named-glyph table; a made-up
        // name resolves to nothing and is counted undecodable, never dropped.
        const fontDict = obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica'),
            Encoding: obj.dict({
                Differences: obj.array([
                    obj.int(65), obj.name('uni0041'), obj.name('B'),
                    obj.name('nonexistentglyphname')
                ])
            })
        });
        const dec = buildDecoder(fontDict, identity);
        // 65 → 'uni0041' → 'A'; 66 → 'B' (AGL table) → 'B';
        // 67 → 'nonexistentglyphname' → null (undecodable).
        const r = decodeShow(dec, new Uint8Array([65, 66, 67]));
        expect(r.text).toBe('AB');
        expect(r.decoded).toBe(2);
        expect(r.undecodable).toBe(1);
    });

    test('an indirect /Encoding, and indirect /Differences inside it, resolve through the resolver', () => {
        // pdfLaTeX writes `/Encoding 52 0 R` on every Type 1 font: the font
        // used to be dropped (every code undecodable, the font unresolved).
        const differences = obj.array([obj.int(65), obj.name('uni0041'), obj.name('B')]);
        const encoding = obj.dict({ Type: obj.name('Encoding'), Differences: obj.ref(31, 0) });
        const objects = new Map([['30 0', encoding], ['31 0', differences]]);
        const resolve = (r) => (r && r.type === 'ref' ? objects.get(`${r.num} ${r.gen}`) : r);
        const fontDict = obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('CMR10'),
            Encoding: obj.ref(30, 0)
        });
        const dec = buildDecoder(fontDict, resolve);
        const r = decodeShow(dec, new Uint8Array([65, 66]));
        expect(r).toEqual({ text: 'AB', decoded: 2, undecodable: 0 });
    });
});

describe('pdfFontDecoder — undecodable', () => {
    test('a Type0 font with no ToUnicode counts every code as undecodable', () => {
        const fontDict = obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'),
            BaseFont: obj.name('CID')
        });
        const dec = buildDecoder(fontDict, identity);
        const r = decodeShow(dec, new Uint8Array([0x00, 0x41, 0x12, 0x34]));
        expect(r).toEqual({ text: '', decoded: 0, undecodable: 2 });
    });
});

describe('pdfFontDecoder — standard CMap path (BATCH_41 task 05)', () => {
    const type0 = (encoding) => obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type0'),
        BaseFont: obj.name('Sub'), Encoding: obj.name(encoding)
    });

    test('a Uni*-UCS2 predefined CMap decodes BMP codes as UTF-16 code units', () => {
        const dec = buildDecoder(type0('UniGB-UCS2-H'), identity);
        const r = decodeShow(dec, new Uint8Array([0x4E, 0x2D, 0x00, 0x41]));
        expect(r).toEqual({ text: '\u4E2DA', decoded: 2, undecodable: 0 });
    });

    test('a surrogate half under a Uni*-UTF16 CMap is counted undecodable, not guessed', () => {
        const dec = buildDecoder(type0('UniJIS-UTF16-H'), identity);
        const r = decodeShow(dec, new Uint8Array([0xD8, 0x3D, 0x00, 0x42]));
        expect(r).toEqual({ text: 'B', decoded: 1, undecodable: 1 });
    });

    test('Identity-H without ToUnicode decodes nothing — codes are CIDs, an honest loss', () => {
        const dec = buildDecoder(type0('Identity-H'), identity);
        const r = decodeShow(dec, new Uint8Array([0x00, 0x41, 0x00, 0x42]));
        expect(r).toEqual({ text: '', decoded: 0, undecodable: 2 });
    });

    test('a legacy predefined CMap whose table is not bundled decodes nothing', () => {
        const dec = buildDecoder(type0('90ms-RKSJ-H'), identity);
        const r = decodeShow(dec, new Uint8Array([0x82, 0xA0]));
        expect(r).toEqual({ text: '', decoded: 0, undecodable: 1 });
    });
});

describe('pdfFontDecoder — glyph widths, simple fonts', () => {
    const simple = (entries) => obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'),
        BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'), ...entries
    });

    test('/Widths indexed from /FirstChar; outside the array → /MissingWidth', () => {
        const dec = buildDecoder(simple({
            FirstChar: obj.int(65), LastChar: obj.int(67),
            Widths: obj.array([obj.int(600), obj.real(610.5), obj.int(620)]),
            FontDescriptor: obj.dict({ Type: obj.name('FontDescriptor'), MissingWidth: obj.int(250) })
        }), identity);
        expect([dec.width(65), dec.width(66), dec.width(67)]).toEqual([600, 610.5, 620]);
        expect([dec.width(64), dec.width(68)]).toEqual([250, 250]);
        expect(dec.vertical).toBe(false);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('outside the array with no /MissingWidth → 0, as the spec defaults it (not an approximation)', () => {
        const dec = buildDecoder(simple({ FirstChar: obj.int(65), Widths: obj.array([obj.int(600)]) }), identity);
        expect(dec.width(90)).toBe(0);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('indirect /Widths and /FontDescriptor resolve through the resolver', () => {
        const W = obj.ref(8, 0);
        const FD = obj.ref(9, 0);
        const table = new Map([
            [8, obj.array([obj.int(700)])],
            [9, obj.dict({ MissingWidth: obj.int(111) })]
        ]);
        const resolve = (r) => (r && r.type === 'ref' ? table.get(r.num) : r);
        const dec = buildDecoder(simple({ FirstChar: obj.int(65), Widths: W, FontDescriptor: FD }), resolve);
        expect([dec.width(65), dec.width(66)]).toEqual([700, 111]);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a non-numeric /Widths entry falls back to 500 for that code and marks the font approximated', () => {
        const dec = buildDecoder(simple({
            FirstChar: obj.int(65), Widths: obj.array([obj.int(600), obj.name('bad')])
        }), identity);
        expect(dec.width(65)).toBe(600);
        expect(dec.widthApproximated()).toBe(false);
        expect(dec.width(66)).toBe(500);
        expect(dec.widthApproximated()).toBe(true);
    });

    test('/Widths without a usable /FirstChar, or not an array: 500 fallback, approximated, no throw', () => {
        const noFirst = buildDecoder(simple({ Widths: obj.array([obj.int(600)]) }), identity);
        expect(noFirst.width(65)).toBe(500);
        expect(noFirst.widthApproximated()).toBe(true);
        const notArray = buildDecoder(simple({ FirstChar: obj.int(65), Widths: obj.int(3) }), identity);
        expect(notArray.width(65)).toBe(500);
        expect(notArray.widthApproximated()).toBe(true);
        const danglingRef = buildDecoder(simple({ FirstChar: obj.int(65), Widths: obj.ref(99, 0) }),
            () => { throw new Error('unresolvable'); });
        expect(danglingRef.width(65)).toBe(500);
        expect(danglingRef.widthApproximated()).toBe(true);
    });

    test('a Type 3 font scales its widths by /FontMatrix', () => {
        const dec = buildDecoder(obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type3'),
            FontMatrix: obj.array([obj.real(0.01), obj.int(0), obj.int(0), obj.real(0.01), obj.int(0), obj.int(0)]),
            FirstChar: obj.int(65), Widths: obj.array([obj.int(50)])
        }), identity);
        expect(dec.width(65)).toBeCloseTo(500, 9);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a non-Standard-14 font with no /Widths: 500 fallback, approximated', () => {
        const dec = buildDecoder(simple({}), identity);
        expect(dec.width(65)).toBe(500);
        expect(dec.widthApproximated()).toBe(true);
    });
});

describe('pdfFontDecoder — glyph widths, Standard 14 AFM metrics', () => {
    const s14 = (baseFont, encoding) => obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name(baseFont),
        ...(encoding ? { Encoding: obj.name(encoding) } : {})
    });

    test('Helvetica without /Widths takes the shipped AFM widths, by glyph name', () => {
        const dec = buildDecoder(s14('Helvetica', 'WinAnsiEncoding'), identity);
        // A 667, a 556, space 278, Euro (WinAnsi 0x80) 556.
        expect([dec.width(65), dec.width(97), dec.width(32), dec.width(0x80)]).toEqual([667, 556, 278, 556]);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('the glyph NAME selects the AFM width, not the raw code (StandardEncoding quoteright = 222)', () => {
        // StandardEncoding code 0x27 is `quoteright` (WinAnsi 0x92, 222 in
        // Helvetica), where WinAnsi 0x27 is `quotesingle` (191).
        const dec = buildDecoder(s14('Helvetica'), identity);
        expect(dec.width(0x27)).toBe(222);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a .notdef code takes the table slot for the code itself and is not an approximation', () => {
        // StandardEncoding has no glyph at 0x95; the WinAnsi slot (bullet) is 350.
        const dec = buildDecoder(s14('Helvetica'), identity);
        expect(dec.width(0x95)).toBe(350);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a named glyph the AFM table lacks falls back to 500 and marks the font approximated', () => {
        // StandardEncoding 0xAE is `fi`, absent from the WinAnsi-indexed table.
        const dec = buildDecoder(s14('Helvetica'), identity);
        expect(dec.width(0xAE)).toBe(500);
        expect(dec.widthApproximated()).toBe(true);
    });

    test('Symbol is indexed by code (built-in encoding)', () => {
        const dec = buildDecoder(s14('Symbol'), identity);
        const w = dec.width(0x41);
        expect(w).toBeGreaterThan(0);
        expect(dec.widthApproximated()).toBe(false);
    });
});

describe('pdfFontDecoder — glyph widths, composite fonts', () => {
    const composite = (encoding, cidEntries, descendant = true) => obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name('Sub'),
        Encoding: obj.name(encoding),
        ...(descendant ? {
            DescendantFonts: obj.array([obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('CIDFontType2'), BaseFont: obj.name('Sub'),
                ...cidEntries
            })])
        } : {})
    });

    test('/W in both forms — `c [w1 w2 …]` and `cFirst cLast w` — and /DW for the rest', () => {
        const dec = buildDecoder(composite('Identity-H', {
            DW: obj.int(900),
            W: obj.array([
                obj.int(1), obj.array([obj.int(600), obj.int(700)]),
                obj.int(5), obj.int(10), obj.int(800)
            ])
        }), identity);
        expect([dec.width(1), dec.width(2), dec.width(3)]).toEqual([600, 700, 900]);
        expect([dec.width(5), dec.width(7), dec.width(10), dec.width(11)]).toEqual([800, 800, 800, 900]);
        expect(dec.vertical).toBe(false);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('no /DW defaults to 1000; Identity-V is flagged vertical', () => {
        const dec = buildDecoder(composite('Identity-V', {}), identity);
        expect(dec.width(42)).toBe(1000);
        expect(dec.vertical).toBe(true);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a /W table under a non-identity CMap: code → CID unknown, /DW used, approximated', () => {
        const dec = buildDecoder(composite('UniJIS-UCS2-H', {
            DW: obj.int(900), W: obj.array([obj.int(1), obj.array([obj.int(600)])])
        }), identity);
        expect(dec.width(1)).toBe(900);
        expect(dec.widthApproximated()).toBe(true);
    });

    test('a missing descendant font: 1000 fallback, approximated', () => {
        const dec = buildDecoder(composite('Identity-H', {}, false), identity);
        expect(dec.width(1)).toBe(1000);
        expect(dec.widthApproximated()).toBe(true);
    });

    test('a malformed /W keeps the entries before the fault, marks approximated, never throws', () => {
        const dec = buildDecoder(composite('Identity-H', {
            W: obj.array([
                obj.int(1), obj.array([obj.int(600), obj.name('x')]),
                obj.int(3), obj.int(4), obj.name('bad')
            ])
        }), identity);
        expect([dec.width(1), dec.width(2), dec.width(3)]).toEqual([600, 1000, 1000]);
        expect(dec.widthApproximated()).toBe(true);
        const notArray = buildDecoder(composite('Identity-H', { W: obj.int(7), DW: obj.name('x') }), identity);
        expect(notArray.width(1)).toBe(1000);
        expect(notArray.widthApproximated()).toBe(true);
    });
});

describe('pdfFontDecoder — bold (A13b)', () => {
    const font = (entries) => obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), ...entries });
    test('a bold weight in the name, the subset tag removed', () => {
        expect(buildDecoder(font({ BaseFont: obj.name('Helvetica-Bold') }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('ABCDEF+ArialMT-SemiboldItalic') }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('Helvetica') }), identity).bold).toBe(false);
        expect(buildDecoder(font({ BaseFont: obj.name('Times-Roman') }), identity).bold).toBe(false);
    });
    test('the font descriptor: a weight of 600 or more, the ForceBold flag', () => {
        const fdict = (entries) => obj.dict({ Type: obj.name('FontDescriptor'), FontName: obj.name('X'), ...entries });
        expect(buildDecoder(font({ BaseFont: obj.name('X'), FontDescriptor: fdict({ FontWeight: obj.int(700) }) }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('X'), FontDescriptor: fdict({ FontWeight: obj.int(400) }) }), identity).bold).toBe(false);
        expect(buildDecoder(font({ BaseFont: obj.name('X'), FontDescriptor: fdict({ Flags: obj.int(262144 + 32) }) }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('X'), FontDescriptor: fdict({ Flags: obj.int(32) }) }), identity).bold).toBe(false);
    });
    test('a Type 0 font: its descendant counts', () => {
        const t0 = obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name('X-Identity-H'),
            Encoding: obj.name('Identity-H'),
            DescendantFonts: obj.array([obj.dict({ Type: obj.name('Font'), Subtype: obj.name('CIDFontType2'),
                BaseFont: obj.name('NotoSans-Black'), CIDSystemInfo: obj.dict({}) })]) });
        expect(buildDecoder(t0, identity).bold).toBe(true);
    });
    test('URW\'s weight suffix (T25 a): `-Medi` and `-MediItal` are bold, a Medium weight is not', () => {
        expect(buildDecoder(font({ BaseFont: obj.name('NimbusRomNo9L-Medi') }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('ABCDEF+NimbusRomNo9L-MediItal') }), identity).bold).toBe(true);
        expect(buildDecoder(font({ BaseFont: obj.name('NimbusRomNo9L-Regu') }), identity).bold).toBe(false);
        expect(buildDecoder(font({ BaseFont: obj.name('Inter-Medium') }), identity).bold).toBe(false);
        expect(buildDecoder(font({ BaseFont: obj.name('Mediator-Regular') }), identity).bold).toBe(false);
    });
});

describe('pdfFontDecoder — registered (T7 a)', () => {
    test('one of the extras; not in pdf-full, whose generator cannot bundle a fonts dependency (as pdfFontEmbed)', async () => {
        expect(extras).toContain(pdfFontDecoder);
        const { pdfFullBundle } = await import('../bundles/pdf-full.js');
        expect(pdfFullBundle.dependencies).not.toContain('pdfFontDecoder');
    });
});

// ── T17 (d): a symbolic font's built-in encoding (ISO 32000-2 §9.6.6.1) ──
const latin1 = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xFF));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const t1num = (v) => (v >= -107 && v <= 107 ? [v + 139] : [((v - 108) >> 8) + 247, (v - 108) & 0xFF]);
function encrypt(plain, r) {
    return [49, 50, 51, 52, ...plain].map((p) => { const c = (p ^ (r >> 8)) & 0xFF; r = ((c + r) * 52845 + 22719) & 0xFFFF; return c; });
}
/** A Type 1 program whose built-in encoding is `encoding` (code → name). */
function type1Program(encoding) {
    const clear = latin1('%!PS-AdobeFont-1.0: T1 1\n/FontName /T1 def\n/FontType 1 def\n/FontMatrix [0.001 0 0 0.001 0 0] readonly def\n' +
        `/Encoding 256 array\n0 1 255 {1 index exch /.notdef put} for\n${Object.entries(encoding).map(([c, n]) => `dup ${c} /${n} put\n`).join('')}readonly def\ncurrentfile eexec\n`);
    const empty = [...t1num(0), ...t1num(500), 13, 14];
    const priv = [...latin1('dup /Private 2 dict dup begin\n/Subrs 0 array\n2 index /CharStrings 4 dict dup begin\n')];
    for (const n of ['.notdef', 'A', 'B', 'C']) { const e = encrypt(empty, 4330); priv.push(...latin1(`/${n} ${e.length} RD `), ...e, ...latin1(' ND\n')); }
    priv.push(...latin1('end\nend\nmark currentfile closefile\n'));
    const cipher = Uint8Array.from(encrypt(priv, 55665));
    return { bytes: cat(clear, cipher), length1: clear.length, length2: cipher.length };
}
const u16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
function cffIndex(items) {
    const offs = [1];
    for (const it of items) offs.push(offs[offs.length - 1] + it.length);
    return [...u16(items.length), 4, ...offs.flatMap(u32), ...items.flat()];
}
const int5 = (v) => [29, ...u32(v)];
/** A name-keyed bare CFF: glyphs A (SID 34) and B (SID 35), Encoding format 0 A → 1, B → 123. */
function cffProgram() {
    const head = [1, 0, 4, 4];
    const name = cffIndex([[0x43]]);
    const str = [0, 0], gsubr = [0, 0];
    const charset = [0, ...u16(34), ...u16(35)];
    const encoding = [0, 2, 1, 123];
    const csIdx = cffIndex([[14], [139, 14], [139, 14]]);
    const priv = [...int5(500), 20];
    const top = (o) => cffIndex([[...int5(o.charset), 15, ...int5(o.encoding), 16, ...int5(o.cs), 17, ...int5(priv.length), ...int5(o.priv), 18]]);
    const lay = (topLen) => {
        const o = {};
        let p = head.length + name.length + topLen + str.length + gsubr.length;
        o.charset = p; p += charset.length;
        o.encoding = p; p += encoding.length;
        o.cs = p; p += csIdx.length;
        o.priv = p;
        return o;
    };
    const o = lay(top(lay(0)).length);
    return Uint8Array.from([...head, ...name, ...top(o), ...str, ...gsubr, ...charset, ...encoding, ...csIdx, ...priv]);
}
/** A simple Type1 font around an embedded program. */
function embeddedFont({ flags = 4, encoding, fontFile, fontFile3, toUnicode } = {}) {
    const fd = { Type: obj.name('FontDescriptor'), FontName: obj.name('T1'), Flags: obj.int(flags) };
    if (fontFile) fd.FontFile = fontFile;
    if (fontFile3) fd.FontFile3 = fontFile3;
    const e = { Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('T1'), FontDescriptor: obj.dict(fd) };
    if (encoding) e.Encoding = encoding;
    if (toUnicode) e.ToUnicode = toUnicode;
    return obj.dict(e);
}
function type1File(encoding) {
    const p = type1Program(encoding);
    return obj.stream(obj.dict({ Length1: obj.int(p.length1), Length2: obj.int(p.length2), Length3: obj.int(0) }), p.bytes);
}
const BUILT_IN = { 1: 'A', 65: 'C', 123: 'B' };
const codes = (...c) => new Uint8Array(c);

describe('pdfFontDecoder — a symbolic font\'s built-in encoding (T17 d)', () => {
    test('no /Encoding: the embedded Type 1 program\'s built-in encoding is the base', () => {
        const dec = buildDecoder(embeddedFont({ fontFile: type1File(BUILT_IN) }), identity);
        // 1: empty in StandardEncoding; 123: braceleft there.
        expect(decodeShow(dec, codes(1, 123, 65))).toEqual({ text: 'ABC', decoded: 3, undecodable: 0 });
    });

    test('a dictionary without /BaseEncoding: /Differences over the built-in encoding', () => {
        const encoding = obj.dict({ Type: obj.name('Encoding'), Differences: obj.array([obj.int(123), obj.name('D')]) });
        const dec = buildDecoder(embeddedFont({ fontFile: type1File(BUILT_IN), encoding }), identity);
        expect(decodeShow(dec, codes(1, 123))).toEqual({ text: 'AD', decoded: 2, undecodable: 0 });
    });

    test('a Type1C program: its CFF Encoding is the base', () => {
        const fontFile3 = obj.stream(obj.dict({ Subtype: obj.name('Type1C') }), cffProgram());
        const dec = buildDecoder(embeddedFont({ fontFile3 }), identity);
        expect(decodeShow(dec, codes(1, 123))).toEqual({ text: 'AB', decoded: 2, undecodable: 0 });
    });

    test('/ToUnicode keeps its priority over the built-in encoding', () => {
        const toUnicode = obj.stream(obj.dict({}), enc(cmap.buildToUnicode(new Map([[1, 'Z']]))));
        const dec = buildDecoder(embeddedFont({ fontFile: type1File(BUILT_IN), toUnicode }), identity);
        expect(decodeShow(dec, codes(1, 123))).toEqual({ text: 'ZB', decoded: 2, undecodable: 0 });
    });

    test('the program is read once per stream, however many decoders are built', () => {
        const fontFile = type1File(BUILT_IN);
        const raw = fontFile.raw;
        let reads = 0;
        Object.defineProperty(fontFile, 'raw', { get() { reads++; return raw; } });
        const font = embeddedFont({ fontFile });
        buildDecoder(font, identity);
        const first = reads;
        buildDecoder(font, identity);
        expect(first).toBeGreaterThan(0);
        expect(reads).toBe(first);
    });

    test('a nonsymbolic font keeps StandardEncoding as its base', () => {
        const dec = buildDecoder(embeddedFont({ flags: 32, fontFile: type1File(BUILT_IN) }), identity);
        expect(decodeShow(dec, codes(65, 123, 1))).toEqual({ text: 'A{', decoded: 2, undecodable: 1 });
    });

    test('a named /Encoding is unchanged', () => {
        const dec = buildDecoder(embeddedFont({ fontFile: type1File(BUILT_IN), encoding: obj.name('WinAnsiEncoding') }), identity);
        expect(decodeShow(dec, codes(65, 123))).toEqual({ text: 'A{', decoded: 2, undecodable: 0 });
    });

    test('a program that does not read leaves StandardEncoding, without throwing', () => {
        const fontFile = obj.stream(obj.dict({ Length1: obj.int(4), Length2: obj.int(0), Length3: obj.int(0) }), enc('junk'));
        const dec = buildDecoder(embeddedFont({ fontFile }), identity);
        expect(decodeShow(dec, codes(65, 1))).toEqual({ text: 'A', decoded: 1, undecodable: 1 });
    });
});

// T25 (e) — Microsoft's symbol fonts: a ToUnicode entry at U+F020..U+F0FF.

describe('pdfFontDecoder — Symbol and Wingdings private-use ToUnicode (T25 e)', () => {
    /** A Type0 font named `base` whose ToUnicode maps each code of `pairs`. */
    function symbolFont(base, pairs) {
        const toUniSrc = cmap.buildToUnicode(new Map(pairs));
        return obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name(base),
            Encoding: obj.name('Identity-H'),
            ToUnicode: obj.stream(obj.dict({}), enc(toUniSrc))
        });
    }
    const show = (dec, ...cids) => decodeShow(dec, new Uint8Array(cids.flatMap((c) => [c >> 8, c & 0xFF]))).text;

    test('a SymbolMT code mapped to U+F0B7 reads through SymbolEncoding: a bullet', () => {
        const dec = buildDecoder(symbolFont('ABCDEF+SymbolMT', [[0x78, ''], [0x10, ''], [0x20, '']]), identity);
        expect(show(dec, 0x78, 0x10, 0x20)).toBe('•−=');
    });

    test('Symbol with a style suffix is the same family', () => {
        const dec = buildDecoder(symbolFont('Symbol,Bold', [[0x01, '']]), identity);
        expect(show(dec, 0x01)).toBe('≤');
    });

    test('a Wingdings code mapped to U+F0A7 or U+F0FC reads as the attested character', () => {
        const dec = buildDecoder(symbolFont('BCDEFG+Wingdings-Regular', [[0x83, ''], [0x39, '']]), identity);
        expect(show(dec, 0x83, 0x39)).toBe('▪✓');
    });

    test('a Wingdings code outside the attested pairs keeps its private-use text', () => {
        const dec = buildDecoder(symbolFont('Wingdings', [[0x84, '']]), identity);
        expect(show(dec, 0x84)).toBe('');
    });

    test('another family, or a ToUnicode outside U+F020..U+F0FF, keeps its text', () => {
        const pairs = [[0x01, ''], [0x02, '•'], [0x03, ''], [0x04, '']];
        for (const base of ['Wingdings2', 'Wingdings3', 'Calibri', 'ABCDEF+SymbolNeu']) {
            const dec = buildDecoder(symbolFont(base, pairs), identity);
            expect(show(dec, 0x01, 0x02, 0x03)).toBe('•');
        }
        const sym = buildDecoder(symbolFont('SymbolMT', pairs), identity);
        expect(show(sym, 0x02, 0x03, 0x04)).toBe('•');
    });
});

// T25 (f) — Zapf Dingbats glyph names, and the Standard 14 symbol fonts'
// built-in encodings.

describe('pdfFontDecoder — Zapf Dingbats names, built-in Symbol and ZapfDingbats (T25 f)', () => {
    const simple = (base, entries = {}) => obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name(base), ...entries
    });
    const named = (code, name) => ({
        Encoding: obj.dict({ Differences: obj.array([obj.int(code), obj.name(name)]) })
    });
    const show = (dec, ...c) => decodeShow(dec, new Uint8Array(c));

    test('a Dingbats subset whose /Differences name a73 decodes U+25A0', () => {
        const dec = buildDecoder(simple('ABCDEF+Dingbats', named(110, 'a73')), identity);
        expect(show(dec, 110)).toEqual({ text: '■', decoded: 1, undecodable: 0 });
    });

    test('a non-embedded ZapfDingbats or Symbol with no /Encoding takes its built-in encoding', () => {
        expect(show(buildDecoder(simple('ZapfDingbats'), identity), 0x38).text).toBe('✘');
        expect(show(buildDecoder(simple('Symbol'), identity), 0x61).text).toBe('α');
    });

    test('another family naming a73 stays undecodable', () => {
        const dec = buildDecoder(simple('ABCDEF+Calibri', named(110, 'a73')), identity);
        expect(show(dec, 110)).toEqual({ text: '', decoded: 0, undecodable: 1 });
    });

    test('an embedded ZapfDingbats, or a named /Encoding, keeps its base', () => {
        const fontFile3 = obj.stream(obj.dict({ Subtype: obj.name('Type1C') }), enc('junk'));
        const embedded = simple('ZapfDingbats', {
            FontDescriptor: obj.dict({ Type: obj.name('FontDescriptor'), Flags: obj.int(32), FontFile3: fontFile3 })
        });
        expect(show(buildDecoder(embedded, identity), 0x38).text).toBe('8');
        const winAnsi = simple('ZapfDingbats', { Encoding: obj.name('WinAnsiEncoding') });
        expect(show(buildDecoder(winAnsi, identity), 0x38).text).toBe('8');
    });
});

// T73 (D54 A, b) — the TeXCMMaths fonts (Springer) name each glyph by a
// Computer Modern position and their ToUnicode repeats the lie: the
// layouts of fonts' encodingTexMath are read first, for those three
// families only.

describe('pdfFontDecoder — the TeXCMMaths fonts read through the TeX math layouts (T73)', () => {
    /** A simple font `base` whose Differences name `names` from code 26 and whose ToUnicode maps them to `lies`. */
    function texFont(base, names, lies) {
        const toUniSrc = cmap.buildToUnicode(new Map(lies.map((s, i) => [26 + i, s])));
        return obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name(base),
            Encoding: obj.dict({
                BaseEncoding: obj.name('WinAnsiEncoding'),
                Differences: obj.array([obj.int(26), ...names.map((n) => obj.name(n))])
            }),
            ToUnicode: obj.stream(obj.dict({}), enc(toUniSrc))
        });
    }
    const text = (dec, n) => decodeShow(dec, new Uint8Array(Array.from({ length: n }, (_, i) => 26 + i))).text;

    test('Symbols: the Latin-1 names and the cmsy positions read as the signs drawn', () => {
        const dec = buildDecoder(texFont('EEKVNO+TeXCMMathsSymbols',
            ['onequarter', 'C0', 'j', 'exclam', 'thorn', 'eth', 'Thorn', 'onehalf', 'C138', 'C6'],
            ['\u00BC', '\uFFFD', 'j', '!', '\u00FE', '\u00F0', '\u00DE', '\u00BD', '\uFFFD', '\uFFFD']), identity);
        expect(text(dec, 10)).toBe('=\u2212|\u2192+()[]\u00B1');
    });

    test('Italic: equal and colon are cmmi\'s slash and period', () => {
        const dec = buildDecoder(texFont('TeXCMMathsItalic', ['equal', 'colon', 'x'], ['=', ':', 'x']), identity);
        expect(text(dec, 3)).toBe('/.x');
    });

    test('Extension: C0 is cmex\'s left parenthesis, where Symbols\' C0 is the minus', () => {
        const ext = buildDecoder(texFont('ABCDEF+TeXCMMathsExtension', ['C0', 'C1', 'X'], ['\uFFFD', '\uFFFD', 'X']), identity);
        expect(text(ext, 3)).toBe('()\u2211');
        const sym = buildDecoder(texFont('ABCDEF+TeXCMMathsSymbols', ['C0'], ['\uFFFD']), identity);
        expect(text(sym, 1)).toBe('\u2212');
    });

    test('a position with no character of its own keeps today\'s path', () => {
        const dec = buildDecoder(texFont('TeXCMMathsExtension', ['C48'], ['\u239B']), identity);
        expect(text(dec, 1)).toBe('\u239B');
    });

    test('the same dictionary under another family keeps its ToUnicode', () => {
        for (const base of ['ABCDEF+CMSY10', 'TeXCMMathsSymbolsX', 'Times-Roman']) {
            const dec = buildDecoder(texFont(base, ['onequarter', 'C0', 'j'], ['\u00BC', '\uFFFD', 'j']), identity);
            expect(text(dec, 3)).toBe('\u00BC\uFFFDj');
        }
    });
});

// T74 — a ToUnicode entry of U+FFFD: the producer knew no character, so the
// encoding's glyph name is read instead.
describe('pdfFontDecoder — a U+FFFD ToUnicode entry reads through its glyph name (T74)', () => {
    function fffdFont(name) {
        const toUniSrc = cmap.buildToUnicode(new Map([[0x13, '\uFFFD'], [0x41, 'A']]));
        return obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('ABCDEF+Brill-Roman'),
            Encoding: obj.dict({ BaseEncoding: obj.name('WinAnsiEncoding'), Differences: obj.array([obj.int(0x13), obj.name(name)]) }),
            ToUnicode: obj.stream(obj.dict({}), enc(toUniSrc))
        });
    }

    test('a code the ToUnicode maps to U+FFFD and the encoding names one.SP decodes 1', () => {
        const r = decodeShow(buildDecoder(fffdFont('one.SP'), identity), new Uint8Array([0x13, 0x41]));
        expect(r).toEqual({ text: '1A', decoded: 2, undecodable: 0 });
    });

    test('a name that reads nothing keeps the U+FFFD', () => {
        const r = decodeShow(buildDecoder(fffdFont('C0'), identity), new Uint8Array([0x13]));
        expect(r).toEqual({ text: '\uFFFD', decoded: 1, undecodable: 0 });
    });
});

// T78 — a composite font's embedded CMap: code → CID for its widths, and
// its codespace for the length of each code.
describe('pdfFontDecoder — a composite font under an embedded CMap (T78)', () => {
    const latin = (s) => new TextEncoder().encode(s);
    /** A Type0 font whose /Encoding is a CMap stream `src`, its CIDFont's `W`, its ToUnicode `pairs`. */
    function cmapFont(src, { w, dw, useCMap, pairs } = {}) {
        const encDict = { Type: obj.name('CMap'), CMapName: obj.name('T-H') };
        if (useCMap) encDict.UseCMap = useCMap;
        return obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name('Sub'),
            Encoding: obj.stream(obj.dict(encDict), latin(src)),
            DescendantFonts: obj.array([obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('CIDFontType0'), BaseFont: obj.name('Sub'),
                ...(dw !== undefined ? { DW: obj.int(dw) } : {}),
                ...(w ? { W: w } : {})
            })]),
            ...(pairs ? { ToUnicode: obj.stream(obj.dict({}), latin(cmap2(pairs))) } : {})
        });
    }
    const cmap2 = (pairs) => cmap.buildToUnicode(new Map(pairs));
    // Built in the tests: `obj` is set in beforeAll.
    const w5 = () => obj.array([obj.int(5), obj.array([obj.int(250)])]);
    const CS2 = '1 begincodespacerange <0000> <FFFF> endcodespacerange';

    test("/W at the code's CID, not /DW, and no approximation", () => {
        const dec = buildDecoder(cmapFont(`${CS2} 1 begincidchar <0101> 5 endcidchar`, { w: w5(), dw: 900 }), identity);
        expect(dec.width(0x0101, 2)).toBe(250);
        expect(dec.width(0x0102, 2)).toBe(900);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('the mapping in its /UseCMap stream: the same', () => {
        const parent = obj.stream(obj.dict({ Type: obj.name('CMap') }), latin(`${CS2} 1 begincidrange <0100> <0101> 4 endcidrange`));
        const dec = buildDecoder(cmapFont('/P-H usecmap', { w: w5(), dw: 900, useCMap: parent }), identity);
        expect(dec.width(0x0101, 2)).toBe(250);
        expect(dec.widthApproximated()).toBe(false);
    });

    test('a codespace of 1 and 2 bytes splits each code at its length, decoded through the ToUnicode', () => {
        const dec = buildDecoder(cmapFont('2 begincodespacerange <00> <7F> <8140> <FEFE> endcodespacerange 1 begincidchar <41> 3 endcidchar',
            { pairs: [[0x41, 'A'], [0x8140, '　']] }), identity);
        expect(dec.split(new Uint8Array([0x41, 0x81, 0x40]))).toEqual([[0x41, 1], [0x8140, 2]]);
        expect(decodeShow(dec, new Uint8Array([0x41, 0x81, 0x40]))).toEqual({ text: 'A　', decoded: 2, undecodable: 0 });
    });

    test('an Identity-H font splits 2 bytes at a time, as before', () => {
        const dec = buildDecoder(obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name('Sub'), Encoding: obj.name('Identity-H'),
            DescendantFonts: obj.array([obj.dict({ Type: obj.name('Font'), Subtype: obj.name('CIDFontType2'), W: w5() })])
        }), identity);
        expect(dec.split(new Uint8Array([0, 5, 0, 6]))).toEqual([[5, 2], [6, 2]]);
        expect(dec.width(5, 2)).toBe(250);
    });
});
