// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
// Relative import of the sibling @awacloud/pdf manifest: @awacloud/pdf is not (yet) a
// declared dependency of @awacloud/oconv's package.json (task 06 adds it as a
// registration), so the bare specifier does not resolve from here. pdf's
// pkg_require transitively carries the whole @awacloud/fonts manifest, so this one
// import supplies every pdf + fonts module the decoder depends on.
import { fw_require, pkg_require, modules } from '../../../../pdf/src/main.js';
import { oconvPdfFontDecoder } from './font-decoder.js';

let obj;
let cmap;
let buildDecoder;
let decodeShow;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(pkg_require);
    rt.registerAll(modules);
    rt.register(oconvPdfFontDecoder);

    obj = rt.resolve('pdfParser').obj;
    cmap = rt.resolve('cmapToUnicode');
    ({ buildDecoder, decodeShow } = rt.resolve('oconvPdfFontDecoder'));
});

const enc = (s) => new TextEncoder().encode(s);
const identity = (r) => r;

describe('oconvPdfFontDecoder — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvPdfFontDecoder.name).toBe('oconvPdfFontDecoder');
        expect(oconvPdfFontDecoder.dependencies).toEqual([
            'pdfFont', 'pdfFontEncoding', 'pdfFilterDispatch',
            'cmapToUnicode', 'encodingLookup', 'encodingAgl', 'standard14Lookup'
        ]);
        expect(typeof oconvPdfFontDecoder.factory).toBe('function');
    });
});

describe('oconvPdfFontDecoder — ToUnicode path', () => {
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

describe('oconvPdfFontDecoder — encoding-table + AGL path', () => {
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
});

describe('oconvPdfFontDecoder — undecodable', () => {
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

describe('oconvPdfFontDecoder — standard CMap path (BATCH_41 task 05)', () => {
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

describe('oconvPdfFontDecoder — glyph widths, simple fonts', () => {
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

describe('oconvPdfFontDecoder — glyph widths, Standard 14 AFM metrics', () => {
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

describe('oconvPdfFontDecoder — glyph widths, composite fonts', () => {
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
