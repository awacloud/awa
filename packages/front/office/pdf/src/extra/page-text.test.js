// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T7 (b): the extra pdfPageText — a page's positioned text runs and its plain
// text (D5 A, D35). Its walk is oconv's page walk without oconv's layout
// opt-ins; oconv's text tests are ported here (every leg but the rules and
// pictures), followed by the visitor hook, `pageText` and the registration.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras } from '../main.js';
import { pdfFullBundle } from '../bundles/pdf-full.js';
import { pdfFontDecoder } from './font-decoder.js';
import { pdfPageText } from './page-text.js';

let pdf;
let obj;
let extractPage;
let pageText;
let xrefStm;
let cmapApi;
let ContractError;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(pkg_require);
    rt.registerAll(modules);
    rt.register(pdfFontDecoder);
    rt.register(pdfPageText);

    pdf = rt.resolve('pdf');
    obj = rt.resolve('pdfParser').obj;
    ({ extractPage, pageText } = rt.resolve('pdfPageText'));
    xrefStm = rt.resolve('pdfXrefStreamWriter');
    cmapApi = rt.resolve('cmapToUnicode');
    ({ ContractError } = rt.resolve('pdfErrors'));
});

const enc = (s) => new TextEncoder().encode(s);
const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4;

/**
 * A minimal single-page PDF around one content stream, built through the
 * published `pdfParser.obj` + `pdf.write` surfaces.
 *
 * @param {{contentBytes: Uint8Array, contentDictExtra?: object,
 *   resourcesEntries?: object, extraIndirects?: object[]}} spec
 * @returns {Uint8Array}
 */
function buildDoc(spec) {
    const contentDict = obj.dict({
        Length: obj.int(spec.contentBytes.length),
        ...(spec.contentDictExtra || {})
    });
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0),
            Resources: obj.dict(spec.resourcesEntries || {})
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(contentDict, spec.contentBytes) },
        ...(spec.extraIndirects || [])
    ];
    return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

/** The one page of `spec`'s document and its resolver. */
function onePage(spec) {
    const doc = pdf.read(buildDoc(spec));
    return [doc.pages[0], doc._raw.resolve];
}

/** Build the doc and run `extractPage` on its one page, under `opts`. */
function extract(spec, opts) {
    const [page, resolve] = onePage(spec);
    return extractPage(page, resolve, opts);
}

/** A simple font giving 500 thousandths to each code 32..122 (one glyph = 5 units at 10 pt). */
function flatFont(num) {
    const w = [];
    for (let c = 32; c <= 122; c++) w.push(obj.int(500));
    return {
        num, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'),
            FirstChar: obj.int(32), LastChar: obj.int(122), Widths: obj.array(w)
        })
    };
}

const nums = (arr) => obj.array(arr.map((n) => (Number.isInteger(n) ? obj.int(n) : obj.real(n))));

/**
 * One Form XObject indirect.
 *
 * @param {number} num
 * @param {string} content
 * @param {{matrix?: number[], resources?: object}} [opts]
 * @returns {object}
 */
function form(num, content, opts = {}) {
    const bytes = enc(content);
    return {
        num, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: nums([0, 0, 612, 792]),
            ...(opts.matrix ? { Matrix: nums(opts.matrix) } : {}),
            ...(opts.resources ? { Resources: opts.resources } : {}),
            Length: obj.int(bytes.length)
        }), bytes)
    };
}

/** A 1x1 grey image XObject. */
function image(num) {
    return { num, gen: 0, value: obj.stream(obj.dict({
        Type: obj.name('XObject'), Subtype: obj.name('Image'),
        Width: obj.int(1), Height: obj.int(1), ColorSpace: obj.name('DeviceGray'),
        BitsPerComponent: obj.int(8), Length: obj.int(1)
    }), new Uint8Array([0])) };
}

describe('pdfPageText — descriptor and registration', () => {
    test('a strict factory descriptor on the decoder, resources, filters, content and errors', () => {
        expect(pdfPageText.name).toBe('pdfPageText');
        expect(pdfPageText.dependencies).toEqual([
            'pdfErrors', 'pdfResources', 'pdfFilterDispatch', 'pdfContentStream', 'pdfFontDecoder'
        ]);
        expect(typeof pdfPageText.factory).toBe('function');
    });

    test('registered in the extras, not in pdf-full (its generator cannot bundle a fonts dependency)', () => {
        expect(extras).toContain(pdfPageText);
        expect(pdfFullBundle.dependencies).not.toContain('pdfPageText');
    });
});

describe('pdfPageText — xobject/form-dropped', () => {
    test('a Form XObject whose stream cannot decode records xobject/form-dropped with a reason, no run', () => {
        const FORM = 10;
        const { losses, runs, counts } = extract({
            contentBytes: enc('q 1 0 0 1 0 0 cm /Fm1 Do Q\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(FORM, 0) }) },
            extraIndirects: [{
                num: FORM, gen: 0, value: obj.stream(obj.dict({
                    Type: obj.name('XObject'), Subtype: obj.name('Form'),
                    BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
                    // A real filter name `pdfFilterDispatch` has no decoder for.
                    Filter: obj.name('CCITTFaxDecode'),
                    Length: obj.int(4)
                }), new Uint8Array([1, 2, 3, 4]))
            }]
        });
        expect(losses).toEqual([{ code: 'xobject/form-dropped', detail: 'Fm1: undecodable stream' }]);
        expect(runs).toEqual([]);
        expect(counts.operators).toBeGreaterThan(0);
    });

    test('an empty Form XObject is executed: no loss, no run', () => {
        const FORM = 10;
        const { losses, runs } = extract({
            contentBytes: enc('q 1 0 0 1 0 0 cm /Fm1 Do Q\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(FORM, 0) }) },
            extraIndirects: [{
                num: FORM, gen: 0, value: obj.stream(obj.dict({
                    Type: obj.name('XObject'), Subtype: obj.name('Form'),
                    BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
                    Length: obj.int(0)
                }), new Uint8Array(0))
            }]
        });
        expect(losses).toEqual([]);
        expect(runs).toEqual([]);
    });
});

describe('pdfPageText — content/undecodable', () => {
    test('a content stream whose filter cannot decode is skipped, named by its object number and its cause', () => {
        const { losses, runs, counts } = extract({
            contentBytes: new Uint8Array([1, 2, 3, 4]),
            contentDictExtra: { Filter: obj.name('CCITTFaxDecode') }
        });
        expect(losses).toEqual([{ code: 'content/undecodable', detail: `stream ${CONTENT}: filter "CCITTFaxDecode" not registered` }]);
        expect(runs).toEqual([]);
        expect(counts.operators).toBe(0);
    });

    test('falsification: an unsupported filter surfaces its own error text, a different filter a different cause', () => {
        const a = extract({
            contentBytes: new Uint8Array([1, 2, 3, 4]),
            contentDictExtra: { Filter: obj.name('JBIG2Decode') }
        });
        expect(a.losses).toHaveLength(1);
        expect(a.losses[0].code).toBe('content/undecodable');
        expect(a.losses[0].detail).toContain('JBIG2Decode');
        expect(a.losses[0].detail).not.toContain('CCITTFaxDecode');
    });

    test('non-vacuity: a resolvable, parsable content stream records nothing', () => {
        const { losses, counts } = extract({ contentBytes: enc('q 1 0 0 1 0 0 cm Q\n') });
        expect(losses).toEqual([]);
        expect(counts.operators).toBeGreaterThan(0);
    });

    test('a stream that cannot be resolved records the thrown cause too (first catch site)', () => {
        const page = { contents: [{ type: 'ref', num: 7, gen: 0 }] };
        const { losses, runs } = extractPage(page, () => { throw new Error('object 7 is free'); });
        expect(losses).toEqual([{ code: 'content/undecodable', detail: 'stream 7: object 7 is free' }]);
        expect(runs).toEqual([]);
    });

    test('a multi-line, over-long message is collapsed to one line and capped at 160 characters', () => {
        const page = { contents: [{ type: 'ref', num: 9, gen: 0 }] };
        const long = `first line\n\tsecond   line\r\n${'x'.repeat(400)}`;
        const { losses } = extractPage(page, () => { throw new Error(long); });
        expect(losses).toHaveLength(1);
        const cause = losses[0].detail.slice('stream 9: '.length);
        expect(losses[0].detail.startsWith('stream 9: first line second line xxx')).toBe(true);
        expect(cause).not.toMatch(/[\r\n\t]/);
        expect(cause.length).toBe(160);
    });

    test('a thrown non-Error value is stringified; an empty message falls back to the value text', () => {
        const page = { contents: [{ type: 'ref', num: 5, gen: 0 }] };
        const a = extractPage(page, () => { throw 'plain string'; });
        expect(a.losses).toEqual([{ code: 'content/undecodable', detail: 'stream 5: plain string' }]);
        const b = extractPage(page, () => { throw new Error(''); });
        expect(b.losses).toEqual([{ code: 'content/undecodable', detail: 'stream 5: Error' }]);
    });

    test('a page with no content and no resources gives nothing, never throws', () => {
        expect(extractPage({}, () => null)).toEqual({ runs: [], counts: { operators: 0, decoded: 0, undecodable: 0 }, losses: [] });
        expect(pageText({}, () => null)).toBe('');
    });
});

describe('pdfPageText — text/font-unresolved', () => {
    test('a `Tf` naming a font absent from /Resources counts its run undecodable, pushes no run', () => {
        const { losses, runs, counts } = extract({
            contentBytes: enc('BT /F1 12 Tf (Hello) Tj ET\n'),
            resourcesEntries: {}
        });
        expect(losses).toEqual([{ code: 'text/font-unresolved', detail: 'F1' }]);
        expect(runs).toEqual([]);
        expect(counts.undecodable).toBe('Hello'.length);
        expect(counts.decoded).toBe(0);
    });

    test('a TJ whose wide kern makes a space with no current font does not throw: a space run, not bold, the loss recorded', () => {
        for (const content of ['BT [(abc) -500 (def)] TJ ET\n', 'BT /F9 12 Tf [(abc) -500 (def)] TJ ET\n']) {
            const { losses, runs, counts } = extract({ contentBytes: enc(content), resourcesEntries: {} });
            expect(losses.map((l) => l.code)).toEqual(['text/font-unresolved', 'text/undecodable']);
            expect(runs.map((i) => [i.text, i.bold])).toEqual([[' ', false]]);
            expect(counts.undecodable).toBe(6);
            expect(counts.decoded).toBe(0);
        }
    });

    test('non-vacuity: the SAME content with a resolvable font records neither loss', () => {
        const uMap = new Map();
        for (let c = 0x20; c <= 0x7e; c++) uMap.set(c, String.fromCharCode(c));
        const toUni = cmapApi.buildToUnicode(uMap);
        const TOUNI = 20, FONT = 21;
        const { losses, runs } = extract({
            contentBytes: enc('BT /F1 12 Tf (Hello) Tj ET\n'),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [
                { num: FONT, gen: 0, value: obj.dict({
                    Type: obj.name('Font'), Subtype: obj.name('Type1'),
                    BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
                }) },
                { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), enc(toUni)) }
            ]
        });
        expect(losses).toEqual([]);
        expect(runs).toHaveLength(1);
        const { xEnd, ...rest } = runs[0];
        expect(rest).toEqual({ x: 0, y: 0, fontSize: 12, text: 'Hello', mcid: null, bold: false });
        // Standard 14 Helvetica, no /Widths: the AFM widths H e l l o =
        // 722 + 556 + 222 + 222 + 556 = 2278 thousandths → 2.278 × 12 pt.
        expect(xEnd).toBeCloseTo(27.336, 9);
    });
});

/**
 * A one-page PDF with an xref stream + object streams: every non-stream
 * indirect (catalog, pages, page, resource and font dicts) is compressed
 * into an `/ObjStm`.
 */
function buildObjStmDoc(spec) {
    const contentDict = obj.dict({ Length: obj.int(spec.contentBytes.length) });
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0),
            Resources: spec.resources
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(contentDict, spec.contentBytes) },
        ...spec.extraIndirects
    ];
    return xrefStm.writeXrefStreamDocument({
        indirects, root: { num: CATALOG, gen: 0 }, version: '1.7', useObjStm: true
    });
}

/** A Type0 font (CIDFontType0 descendant) with an optional ToUnicode CMap. */
function type0Font(numbers, opts) {
    const [FONT, CID, TOUNI] = numbers;
    const out = [
        { num: FONT, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type0'),
            BaseFont: obj.name('ABCDEF+Sub-Identity-H'),
            Encoding: obj.name(opts.encoding || 'Identity-H'),
            DescendantFonts: obj.array([obj.ref(CID, 0)]),
            ...(opts.toUnicode ? { ToUnicode: obj.ref(TOUNI, 0) } : {})
        }) },
        { num: CID, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('CIDFontType0'),
            BaseFont: obj.name('ABCDEF+Sub'),
            CIDSystemInfo: obj.dict({
                Registry: obj.string(enc('Adobe')), Ordering: obj.string(enc('Identity')), Supplement: obj.int(0)
            })
        }) }
    ];
    if (opts.toUnicode) {
        const src = cmapApi.buildToUnicode(opts.toUnicode);
        out.push({ num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(src.length) }), enc(src)) });
    }
    return out;
}

describe('pdfPageText — font resolution', () => {
    const RES = 30, GS = 31, FONTS = 32, F1 = 40, CID1 = 41, TU1 = 42;
    const cidMap = new Map([[0x0001, 'é'], [0x0002, 't'], [0x0003, 'é']]);
    const read = (bytes) => { const doc = pdf.read(bytes); return extractPage(doc.pages[0], doc._raw.resolve); };

    test('an indirect /ExtGState + a Type0 font in an object stream decodes through ToUnicode', () => {
        const { losses, runs, counts } = read(buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <000100020003> Tj ET\n'),
            resources: obj.ref(RES, 0),
            extraIndirects: [
                { num: RES, gen: 0, value: obj.dict({
                    Font: obj.dict({ F1: obj.ref(F1, 0) }),
                    ExtGState: obj.ref(GS, 0),
                    ProcSet: obj.array([obj.name('PDF'), obj.name('Text')])
                }) },
                { num: GS, gen: 0, value: obj.dict({ GS1: obj.dict({ Type: obj.name('ExtGState') }) }) },
                ...type0Font([F1, CID1, TU1], { toUnicode: cidMap })
            ]
        }));
        expect(losses).toEqual([]);
        expect(runs.map((i) => i.text)).toEqual(['été']);
        expect(counts).toMatchObject({ decoded: 3, undecodable: 0 });
    });

    test('an indirect /Font category whose font dict sits in an object stream resolves', () => {
        const { losses, runs } = read(buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <0001> Tj ET\n'),
            resources: obj.dict({ Font: obj.ref(FONTS, 0) }),
            extraIndirects: [
                { num: FONTS, gen: 0, value: obj.dict({ F1: obj.ref(F1, 0) }) },
                ...type0Font([F1, CID1, TU1], { toUnicode: cidMap })
            ]
        }));
        expect(losses).toEqual([]);
        expect(runs.map((i) => i.text)).toEqual(['é']);
    });

    test('honest loss: a Type0 Identity-H font with no ToUnicode stays a ledgered text/undecodable run', () => {
        const { losses, runs, counts } = read(buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <00010002> Tj ET\n'),
            resources: obj.dict({ Font: obj.dict({ F1: obj.ref(F1, 0) }), ExtGState: obj.ref(GS, 0) }),
            extraIndirects: [{ num: GS, gen: 0, value: obj.dict({}) }, ...type0Font([F1, CID1, TU1], {})]
        }));
        expect(losses).toEqual([{ code: 'text/undecodable', detail: '2 code(s)' }]);
        expect(runs).toEqual([]);
        expect(counts).toMatchObject({ decoded: 0, undecodable: 2 });
    });

    test('standard CMap: a Type0 UniJIS-UCS2-H font with no ToUnicode decodes its UCS-2 codes', () => {
        const { losses, runs } = read(buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <65E5672C> Tj ET\n'),
            resources: obj.dict({ Font: obj.dict({ F1: obj.ref(F1, 0) }) }),
            extraIndirects: type0Font([F1, CID1, TU1], { encoding: 'UniJIS-UCS2-H' })
        }));
        expect(losses).toEqual([]);
        expect(runs.map((i) => i.text)).toEqual(['日本']);
    });

    test('a font dict that fails to build a decoder is unresolved; a direct font dict keyed by its map', () => {
        const { losses, runs } = extract({
            contentBytes: enc('BT /F1 10 Tf (ab) Tj /F2 10 Tf (cd) Tj ET\n'),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(50, 0), F2: flatFont(0).value }) },
            extraIndirects: [{ num: 50, gen: 0, value: obj.int(3) }]
        });
        expect(losses).toEqual([{ code: 'text/font-unresolved', detail: 'F1' }]);
        expect(runs.map((i) => [i.text, i.x, i.xEnd])).toEqual([['cd', 0, 10]]);
    });
});

describe('pdfPageText — run end position (advance model)', () => {
    const FONT = 50;
    /** Extract `content` shown with /F1 = a flat-500 simple font (or `fontDict`). */
    function run(content, fontDict) {
        return extract({
            contentBytes: enc(content),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [fontDict ? { num: FONT, gen: 0, value: fontDict } : flatFont(FONT)]
        });
    }
    const ends = (runs) => runs.map((i) => [i.text, i.x, i.xEnd]);

    test('xEnd = x + Σ w0/1000 × Tfs, and the next Tj without Td starts there', () => {
        const { runs, losses } = run('BT /F1 10 Tf (ab) Tj (cd) Tj ET\n');
        expect(ends(runs)).toEqual([['ab', 0, 10], ['cd', 10, 20]]);
        expect(losses).toEqual([]);
    });

    test('Tc, Tw (single-byte code 32 only) and Tz scale the advance', () => {
        // a, space, b: (5 + 2) + (5 + 2 + 3) + (5 + 2) = 24, × Th 0.5 = 12.
        const { runs } = run('BT /F1 10 Tf 2 Tc 3 Tw 50 Tz (a b) Tj ET\n');
        expect(ends(runs)).toEqual([['a b', 0, 12]]);
    });

    test('the device-space end follows the CTM, like x', () => {
        const { runs } = run('2 0 0 2 100 0 cm BT /F1 10 Tf (ab) Tj ET\n');
        expect(ends(runs)).toEqual([['ab', 100, 120]]);
    });

    test('q/Q save and restore Tc, Tw and Tz with the graphics state', () => {
        const { runs } = run('BT /F1 10 Tf q 5 Tc 9 Tw 200 Tz Q (a b) Tj ET\n');
        expect(ends(runs)).toEqual([['a b', 0, 15]]);
    });

    // T25 (e): the font and its size, and the leading, are text state, which
    // is part of the graphics state (ISO 32000-2 §8.4.1). A list label drawn
    // as `q /F2 Tf (label) Tj Q` leaves the body text after it in the font
    // set before the `q`.
    const bulletFont = () => {
        const w = [];
        for (let c = 32; c <= 122; c++) w.push(obj.int(500));
        return obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Bullets'),
            Encoding: obj.dict({
                BaseEncoding: obj.name('WinAnsiEncoding'),
                Differences: obj.array([obj.int(97), obj.name('bullet')])
            }),
            FirstChar: obj.int(32), LastChar: obj.int(122), Widths: obj.array(w)
        });
    };
    const twoFonts = (content) => extract({
        contentBytes: enc(content),
        resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0), F2: obj.ref(FONT + 1, 0) }) },
        extraIndirects: [flatFont(FONT), { num: FONT + 1, gen: 0, value: bulletFont() }]
    });

    test('Q restores the font, its size and the leading set before q', () => {
        const out = twoFonts('BT /F1 10 Tf 12 TL q /F2 20 Tf 30 TL (a) Tj Q (a) Tj T* (a) Tj ET\n');
        expect(out.runs.map((i) => [i.text, i.x, i.xEnd, i.y])).toEqual([
            ['\u2022', 0, 10, 0], ['a', 10, 15, 0], ['a', 0, 5, -12]
        ]);
    });

    test('a Q with nothing saved keeps the font in force', () => {
        const out = twoFonts('BT /F2 10 Tf Q (a) Tj ET\n');
        expect(out.runs.map((i) => i.text)).toEqual(['\u2022']);
    });

    test("' moves to the next line then shows; \" sets Tw and Tc first; TD sets the leading; Tm places", () => {
        const q1 = run('BT /F1 10 Tf 12 TL 0 100 Td (ab) \' ET\n');
        expect(q1.runs.map((i) => [i.text, i.y, i.x, i.xEnd])).toEqual([['ab', 88, 0, 10]]);
        const q2 = run('BT /F1 10 Tf 12 TL 0 100 Td 4 1 (a b) " (a) Tj ET\n');
        expect(q2.runs.map((i) => [i.text, i.y, i.x, i.xEnd])).toEqual([
            ['a b', 88, 0, 22], ['a', 88, 22, 28]
        ]);
        const q3 = run('BT /F1 10 Tf 0 100 TD (a) Tj 0 -14 TD (b) Tj T* (c) Tj 1 0 0 1 50 60 Tm (d) Tj ET\n');
        expect(q3.runs.map((i) => [i.text, i.x, i.y])).toEqual([['a', 0, 100], ['b', 0, 86], ['c', 0, 72], ['d', 50, 60]]);
    });

    test('TJ numeric adjustments move the end by −n/1000 × Tfs × Th', () => {
        const { runs } = run('BT /F1 10 Tf [(a) -300 (b)] TJ ET\n');
        expect(ends(runs)).toEqual([['a b', 0, 13]]);
        const back = run('BT /F1 10 Tf [(a) 100 (b)] TJ ET\n');
        expect(ends(back.runs)).toEqual([['ab', 0, 9]]);
    });

    test('a TJ kern gap never doubles a space already on either side', () => {
        const { runs } = run('BT /F1 10 Tf [(a ) -300 (b) -300 ( c) -300 -300 (d)] TJ ET\n');
        expect(runs.map((i) => i.text)).toEqual(['a b c d']);
    });

    test.each([
        [-149, 'ab'],
        [-150, 'ab'],
        [-151, 'a b'],
        [-166, 'a b'],
        [-200, 'a b']
    ])('a TJ adjustment of %p thousandths yields %p (space iff −n/1000 > 0.15)', (n, expected) => {
        const { runs } = run(`BT /F1 10 Tf [(a) ${n} (b)] TJ ET\n`);
        expect(runs.map((i) => i.text)).toEqual([expected]);
    });

    test('drift: the TJ word-space threshold equals the word gap of pageText\'s line pass', () => {
        // The same 0.15 em on both sides: a TJ adjustment of −n thousandths,
        // and two shows n thousandths of an em apart on one line.
        const sweep = [100, 140, 149, 150, 151, 152, 160, 166, 199, 200, 250];
        const tj = (n) => run(`BT /F1 10 Tf [(a) ${-n} (b)] TJ ET\n`).runs[0].text === 'a b';
        const line = (n) => {
            const [page, resolve] = onePage({
                contentBytes: enc(`BT /F1 10 Tf (a) Tj ${(n / 100).toFixed(2)} 0 Td (b) Tj ET\n`),
                resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
                extraIndirects: [flatFont(FONT)]
            });
            return pageText(page, resolve) === 'a b';
        };
        // `Td` moves from the line start: b's x = n / 100, a ends at 5, so
        // the gap is n / 100 − 5 = (n − 500) / 100 … shift the sweep by 500.
        const decisions = sweep.map((n) => [n, tj(n), line(n + 500)]);
        for (const [n, t, l] of decisions) expect([n, t]).toEqual([n, l]);
        expect(decisions.filter(([, t]) => t).map(([n]) => n)[0]).toBe(151);
        expect(decisions.some(([, t]) => !t)).toBe(true);
    });

    test('no /Widths on a non-Standard-14 font: 500 fallback, ONE text/width-approximated per font, no throw', () => {
        const { runs, losses } = run('BT /F1 10 Tf (ab) Tj (cd) Tj ET\n', obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('NotAStandardFont'), Encoding: obj.name('WinAnsiEncoding')
        }));
        expect(ends(runs)).toEqual([['ab', 0, 10], ['cd', 10, 20]]);
        expect(losses).toEqual([{ code: 'text/width-approximated', detail: 'F1' }]);
    });

    test('a malformed /Widths (not an array) falls back and records, never throws', () => {
        const { runs, losses } = run('BT /F1 10 Tf (ab) Tj ET\n', obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'),
            FirstChar: obj.int(32), Widths: obj.name('Oops')
        }));
        expect(ends(runs)).toEqual([['ab', 0, 10]]);
        expect(losses).toEqual([{ code: 'text/width-approximated', detail: 'F1' }]);
    });

    test('a show under an unresolved font advances nothing and pushes no run', () => {
        const { runs, losses } = run('BT /F9 10 Tf (ab) Tj [(cd)] TJ /F1 10 Tf (ef) Tj ET\n');
        expect(ends(runs)).toEqual([['ef', 0, 10]]);
        expect(losses.map((l) => l.code)).toEqual([
            'text/font-unresolved', 'text/font-unresolved', 'text/undecodable'
        ]);
    });

    test('a marked-content id is the innermost in scope; EMC restores the outer one', () => {
        const { runs } = run('/P <</MCID 3>> BDC /Span <</MCID 4>> BDC BT /F1 10 Tf (a) Tj ET EMC BT /F1 10 Tf (b) Tj ET EMC /X BMC BT /F1 10 Tf (c) Tj ET EMC EMC BT /F1 10 Tf (d) Tj ET\n');
        expect(runs.map((i) => [i.text, i.mcid])).toEqual([['a', 4], ['b', 3], ['c', null], ['d', null]]);
    });
});

describe('pdfPageText — Form XObject execution', () => {
    const FONT = 60;
    const fontRes = () => obj.dict({ F1: obj.ref(FONT, 0) });
    const place = (runs) => runs.map((i) => [i.text, i.x, i.y, i.xEnd]);

    test('/Matrix is concatenated onto the CTM (Matrix × CTM) and the advance model runs under it', () => {
        const { runs, losses } = extract({
            contentBytes: enc('1 0 0 1 0 100 cm /Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf 5 10 Td (ab) Tj (cd) Tj ET\n', {
                    matrix: [2, 0, 0, 2, 100, 50],
                    resources: obj.dict({ Font: fontRes() })
                }),
                flatFont(FONT)
            ]
        });
        expect(losses).toEqual([]);
        expect(place(runs)).toEqual([['ab', 110, 170, 130], ['cd', 130, 170, 150]]);
        expect(runs[0].fontSize).toBe(20);
    });

    test('the graphics and text state are restored on return, even after an unbalanced Q inside the form', () => {
        const { runs, losses } = extract({
            contentBytes: enc('q 1 0 0 1 0 100 cm /Fm1 Do BT /F1 10 Tf (ab) Tj ET Q\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'Q Q 1 0 0 1 7 0 cm 5 Tc 50 Tz BT /F1 10 Tf (x) Tj ET\n', {
                    matrix: [1, 0, 0, 1, 0, 20]
                }),
                flatFont(FONT)
            ]
        });
        expect(losses).toEqual([]);
        expect(place(runs)).toEqual([['x', 7, 120, 12], ['ab', 0, 100, 10]]);
    });

    test('a form with no /Resources of its own resolves fonts from the page', () => {
        const { runs, losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'BT /F1 10 Tf (inherited) Tj ET\n'), flatFont(FONT)]
        });
        expect(losses).toEqual([]);
        expect(runs.map((i) => i.text)).toEqual(['inherited']);
    });

    test('a form /Resources with indirect categories, or one malformed category, keeps its fonts', () => {
        const FONTS = 20, GS = 21;
        const { runs, losses } = extract({
            contentBytes: enc('/Fm1 Do /Fm2 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0), Fm2: obj.ref(11, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf (one) Tj ET\n', {
                    resources: obj.dict({ Font: obj.ref(FONTS, 0), ExtGState: obj.ref(GS, 0) })
                }),
                form(11, 'BT /F1 10 Tf (two) Tj ET\n', {
                    resources: obj.dict({ Font: fontRes(), ExtGState: obj.int(3) })
                }),
                { num: FONTS, gen: 0, value: fontRes() },
                { num: GS, gen: 0, value: obj.dict({}) },
                flatFont(FONT)
            ]
        });
        expect(losses).toEqual([]);
        expect(runs.map((i) => i.text)).toEqual(['one', 'two']);
    });

    test('nested forms (depth 2) compose both matrices; the mcid in scope at Do carries into the form', () => {
        const { runs, losses } = extract({
            contentBytes: enc('/P <</MCID 7>> BDC /Fa Do EMC\n'),
            resourcesEntries: { XObject: obj.dict({ Fa: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'EMC /Fb Do\n', {
                    matrix: [1, 0, 0, 1, 10, 0],
                    resources: obj.dict({ XObject: obj.dict({ Fb: obj.ref(11, 0) }) })
                }),
                form(11, 'BT /F1 10 Tf (deep) Tj ET\n', {
                    matrix: [1, 0, 0, 1, 0, 20],
                    resources: obj.dict({ Font: fontRes() })
                }),
                flatFont(FONT)
            ]
        });
        expect(losses).toEqual([]);
        expect(place(runs)).toEqual([['deep', 10, 20, 30]]);
        expect(runs[0].mcid).toBe(7);
    });

    test('an image draw, inside a form or inline, is no loss of text and no run', () => {
        const { runs, losses, counts } = extract({
            contentBytes: enc('/Fm1 Do /Im1 Do /Nope Do 3 Do BI /W 1 /H 1 /CS /G /BPC 8 ID \x00 EI\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0), Im1: obj.ref(12, 0) }) },
            extraIndirects: [
                form(10, 'q 10 0 0 10 0 0 cm /Im1 Do Q\n', {
                    resources: obj.dict({ XObject: obj.dict({ Im1: obj.ref(12, 0) }) })
                }),
                image(12)
            ]
        });
        expect(losses).toEqual([]);
        expect(runs).toEqual([]);
        expect(counts.operators).toBe(5 + 4);
    });

    test('cycle guard: a form reached again from inside itself records xobject/form-cycle, keeps its first pass', () => {
        const { runs, losses } = extract({
            contentBytes: enc('/Fa Do\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fa: obj.ref(10, 0), Fb: obj.ref(11, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf (a) Tj ET /Fb Do\n'),
                form(11, 'BT /F1 10 Tf (b) Tj ET /Fa Do\n'),
                flatFont(FONT)
            ]
        });
        expect(losses).toEqual([{ code: 'xobject/form-cycle', detail: 'Fa' }]);
        expect(runs.map((i) => i.text)).toEqual(['a', 'b']);
    });

    test('depth guard: forms execute 12 deep; the 13th records xobject/form-depth', () => {
        const links = [];
        for (let i = 0; i < 14; i++) {
            links.push(form(100 + i, `BT /F1 10 Tf (L${i}) Tj ET /Fn Do\n`, {
                resources: obj.dict({
                    Font: fontRes(),
                    XObject: obj.dict(i < 13 ? { Fn: obj.ref(101 + i, 0) } : {})
                })
            }));
        }
        const { runs, losses } = extract({
            contentBytes: enc('/Fn Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fn: obj.ref(100, 0) }) },
            extraIndirects: [...links, flatFont(FONT)]
        });
        expect(runs.map((i) => i.text)).toEqual(Array.from({ length: 12 }, (_, i) => `L${i}`));
        expect(losses).toEqual([{ code: 'xobject/form-depth', detail: 'Fn' }]);
    });

    test('budget guard: form draws stop once a page ran 1,000,000 operators inside forms, one xobject/form-budget', () => {
        const draw10 = (name) => `${Array.from({ length: 10 }, () => `/${name} Do`).join(' ')}\n`;
        const leaf = `${'q Q '.repeat(1000)}\n`;
        const { runs, losses, counts } = extract({
            contentBytes: enc(draw10('A')),
            resourcesEntries: { XObject: obj.dict({ A: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, draw10('B'), { resources: obj.dict({ XObject: obj.dict({ B: obj.ref(11, 0) }) }) }),
                form(11, draw10('C'), { resources: obj.dict({ XObject: obj.dict({ C: obj.ref(12, 0) }) }) }),
                form(12, leaf)
            ]
        });
        expect(runs).toEqual([]);
        expect(losses).toEqual([{ code: 'xobject/form-budget', detail: 'A' }]);
        expect(counts.operators).toBe(10 + 5 * 200110);
    });

    test('formOpBudget: a small budget stops form draws early, one xobject/form-budget', () => {
        const spec = {
            contentBytes: enc('/Fm Do /Fm Do /Fm Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'q Q q Q\n')]
        };
        const small = extract(spec, { formOpBudget: 5 });
        expect(small.losses).toEqual([{ code: 'xobject/form-budget', detail: 'Fm' }]);
        expect(small.counts.operators).toBe(3 + 2 * 4);
        expect(extract(spec, { formOpBudget: 1000 }).losses).toEqual([]);
    });

    test.each([0, -1, 1.5, '5', NaN, Infinity, 2 ** 53, null])('formOpBudget %p throws pdf/page-text/bad-form-op-budget before any stream is decoded', (v) => {
        let resolved = 0;
        const page = { contents: [{ type: 'ref', num: 4, gen: 0 }] };
        const call = () => extractPage(page, () => { resolved++; return null; }, { formOpBudget: v });
        expect(call).toThrow(ContractError);
        try { call(); } catch (e) { expect(e.code).toBe('pdf/page-text/bad-form-op-budget'); }
        expect(() => pageText(page, () => null, { formOpBudget: v })).toThrow(ContractError);
        expect(resolved).toBe(0);
    });

    test('a /Subtype /Form that is not a stream records xobject/form-dropped with its reason, never throws', () => {
        const { runs, losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [{ num: 10, gen: 0, value: obj.dict({ Type: obj.name('XObject'), Subtype: obj.name('Form') }) }]
        });
        expect(runs).toEqual([]);
        expect(losses).toEqual([{ code: 'xobject/form-dropped', detail: 'Fm1: not a stream' }]);
    });

    test('a form whose stream cannot parse records xobject/form-dropped, unparsable stream', () => {
        const { losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'BT (unterminated Tj\n')]
        });
        expect(losses).toEqual([{ code: 'xobject/form-dropped', detail: 'Fm1: unparsable stream' }]);
    });
});

describe('pdfPageText — a TJ cut at its cell gaps, opts.cellKerns', () => {
    const FONT = 50;
    function run(content, opts) {
        return extract({
            contentBytes: enc(content),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [flatFont(FONT)]
        }, opts);
    }
    const ends = (runs) => runs.map((i) => [i.text, i.x, i.xEnd]);
    const ROW = 'BT /F1 10 Tf [(Name) -2000 (12) -1500 (3.40)] TJ ET\n';

    test('two gaps over 1 em between drawn strings: one run per part, each where its first string is drawn', () => {
        expect(ends(run(ROW, { cellKerns: true }).runs)).toEqual([['Name', 0, 20], ['12', 40, 50], ['3.40', 65, 85]]);
        expect(run(ROW, { cellKerns: true }).counts.decoded).toBe(run(ROW).counts.decoded);
    });

    test('without the option, one gap, gaps of 1 em or less, or a trailing or leading kern: one run', () => {
        expect(ends(run(ROW).runs)).toEqual([['Name 12 3.40', 0, 85]]);
        expect(ends(run(ROW, { cellKerns: false }).runs)).toEqual([['Name 12 3.40', 0, 85]]);
        const one = (content) => run(content, { cellKerns: true }).runs.map((i) => i.text);
        expect(one('BT /F1 10 Tf [(4) -2000 (Results)] TJ ET\n')).toEqual(['4 Results']);
        expect(one('BT /F1 10 Tf [(a) -1000 (b) -1000 (c)] TJ ET\n')).toEqual(['a b c']);
        expect(one('BT /F1 10 Tf [(a) -2000 (b) -2000] TJ ET\n')).toEqual(['a b ']);
        expect(one('BT /F1 10 Tf [-3000 (a) -2000 (b)] TJ ET\n')).toEqual([' a b']);
        expect(one('BT /F1 10 Tf [(a) -2000 () -2000 (b)] TJ ET\n')).toEqual(['a b']);
    });
});

describe('pdfPageText — the visitor hook, opts.visit', () => {
    const FONT = 70;
    const spec = (content, extra = {}) => ({
        contentBytes: enc(content),
        resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }), ...extra.resources },
        extraIndirects: [flatFont(FONT), ...(extra.indirects || [])]
    });

    test('called once per operator walked, before the walk applies it: ctm, mcid, depth, runCount', () => {
        const seen = [];
        const visit = (op, ctx) => seen.push([op.op, ctx.ctm.slice(), ctx.mcid, ctx.depth, ctx.runCount]);
        const { runs, counts } = extract(spec('q 2 0 0 2 10 0 cm /P <</MCID 1>> BDC BT /F1 10 Tf (ab) Tj ET EMC Q\n'), { visit });
        const I = [1, 0, 0, 1, 0, 0], M = [2, 0, 0, 2, 10, 0];
        expect(seen).toEqual([
            ['q', I, null, 0, 0], ['cm', I, null, 0, 0], ['BDC', M, null, 0, 0],
            ['BT', M, 1, 0, 0], ['Tf', M, 1, 0, 0], ['Tj', M, 1, 0, 0], ['ET', M, 1, 0, 1],
            ['EMC', M, 1, 0, 1], ['Q', M, null, 0, 1]
        ]);
        expect(counts.operators).toBe(seen.length);
        expect(runs.map((r) => r.text)).toEqual(['ab']);
    });

    test('inside a form: depth 1, the form\'s resources, its matrix in the ctm; the page again after it', () => {
        const seen = [];
        const visit = (op, ctx) => seen.push([op.op, ctx.depth, Object.keys(ctx.resources.XObject || {}), ctx.ctm[5]]);
        extract(spec('/Fm1 Do BT ET\n', {
            resources: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            indirects: [form(10, 'q Q\n', { matrix: [1, 0, 0, 1, 0, 30], resources: obj.dict({ XObject: obj.dict({ Im9: obj.ref(12, 0) }) }) }), image(12)]
        }), { visit });
        expect(seen).toEqual([
            ['Do', 0, ['Fm1'], 0], ['q', 1, ['Im9'], 30], ['Q', 1, ['Im9'], 30], ['BT', 0, ['Fm1'], 0], ['ET', 0, ['Fm1'], 0]
        ]);
    });

    test('enough to place a caller\'s own items among the runs: image draws, in order', () => {
        const items = [];
        const visit = (op, ctx) => {
            if (op.op === 'BI') items.push({ at: ctx.runCount, kind: 'image', mcid: ctx.mcid });
            if (op.op !== 'Do') return;
            const e = ctx.resources && ctx.resources.XObject ? ctx.resources.XObject[op.args[0].value] : null;
            if (e && e.type === 'ref' && e.num === 12) items.push({ at: ctx.runCount, kind: 'image', mcid: ctx.mcid });
        };
        const { runs } = extract(spec('BT /F1 10 Tf (a) Tj ET /P <</MCID 2>> BDC /Im1 Do EMC BT /F1 10 Tf (b) Tj ET BI /W 1 /H 1 /CS /G /BPC 8 ID \x00 EI\n', {
            resources: { XObject: obj.dict({ Im1: obj.ref(12, 0) }) },
            indirects: [image(12)]
        }), { visit });
        expect(runs.map((r) => r.text)).toEqual(['a', 'b']);
        expect(items).toEqual([{ at: 1, kind: 'image', mcid: 2 }, { at: 2, kind: 'image', mcid: null }]);
    });

    // T77: ctx.lossCount places a caller's own losses among the walk's.
    test('lossCount: the losses recorded before the operator', () => {
        const seen = [];
        const visit = (op, ctx) => seen.push([op.op, ctx.lossCount]);
        const { losses } = extract(spec('BT /F9 10 Tf (a) Tj ET BT /F1 10 Tf (b) Tj /F8 10 Tf (c) Tj ET\n'), { visit });
        expect(losses.map((l) => l.code)).toEqual(['text/font-unresolved', 'text/font-unresolved']);
        expect(seen).toEqual([
            ['BT', 0], ['Tf', 0], ['Tj', 0], ['ET', 1], ['BT', 1], ['Tf', 1], ['Tj', 1], ['Tf', 1], ['Tj', 1], ['ET', 2]
        ]);
    });

    test('what the visitor throws reaches the caller; a visit that is not a function throws pdf/page-text/bad-visit', () => {
        expect(() => extract(spec('q Q\n'), { visit: () => { throw new Error('boom'); } })).toThrow('boom');
        for (const visit of [3, 'f', {}, null]) {
            let err = null;
            try { extract(spec('q Q\n'), { visit }); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('pdf/page-text/bad-visit');
        }
        // An absent visit is no visit.
        expect(extract(spec('q Q\n'), { visit: undefined }).counts.operators).toBe(2);
    });
});

describe('pdfPageText — pageText, the runs joined into lines', () => {
    const FONT = 80;
    const text = (content, opts) => {
        const [page, resolve] = onePage({
            contentBytes: enc(content),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [flatFont(FONT)]
        });
        return pageText(page, resolve, opts);
    };

    test('runs within 0.5 × the font size of a line\'s baseline join it; a larger jump opens a line, either way', () => {
        expect(text('BT /F1 10 Tf 0 700 Td (one) Tj 0 4 Td (two) Tj 0 -20 Td (three) Tj 0 40 Td (up) Tj ET\n'))
            .toBe('one two\nthree\nup');
    });

    test('one space over a gap or an overlap of more than 0.15 em, none at or under it, never doubled', () => {
        // (a) ends at 5, b starts at the Td; 0.15 em at 10 pt is 1.5.
        const at = (d) => text(`BT /F1 10 Tf (a) Tj ${d} 0 Td (b) Tj ET\n`);
        expect(at(7)).toBe('a b');      // a gap of 2
        expect(at(6.5)).toBe('ab');     // a gap of 1.5, the threshold itself
        expect(at(4)).toBe('ab');       // an overlap of 1
        expect(at(3)).toBe('a b');      // an overlap of 2
        expect(text('BT /F1 10 Tf (a ) Tj 15 0 Td (b) Tj ET\n')).toBe('a b');
    });

    test('an exact duplicate run of a line is dropped; a line drawn backwards gets no space', () => {
        expect(text('BT /F1 10 Tf 100 100 Td (dup) Tj 0 0 Td (dup) Tj ET BT /F1 10 Tf 100.2 100 Td (dup) Tj ET\n')).toBe('dup');
        expect(text('BT /F1 10 Tf 100 100 Td (b) Tj -50 0 Td (a) Tj ET\n')).toBe('ba');
    });

    test('lines are trimmed and blank ones dropped; opts reach extractPage (cellKerns)', () => {
        expect(text('BT /F1 10 Tf 0 700 Td (  x  ) Tj 0 -20 Td (   ) Tj 0 -20 Td (y) Tj ET\n')).toBe('x\ny');
        const row = 'BT /F1 10 Tf [(Name) -2000 (12) -1500 (3.40)] TJ ET\n';
        expect(text(row)).toBe('Name 12 3.40');
        expect(text(row, { cellKerns: true })).toBe('Name 12 3.40');
        expect(text('BT /F1 10 Tf [(a) -2000 (b) -2000 (c)] TJ ET\n', { cellKerns: true })).toBe('a b c');
    });

    test('a run with no font size takes the line\'s, else 0.5 pt; a zero em adds no space', () => {
        expect(text('BT /F1 0 Tf (a) Tj ET BT /F1 0 Tf 0.3 0 Td (b) Tj ET BT /F1 0 Tf 20 0 Td (c) Tj ET\n')).toBe('abc');
    });
});

// T78: a composite font under an embedded CMap stream advances by /W at
// each code's CID, not /DW.
describe('pdfPageText — a composite font under an embedded CMap (T78)', () => {
    test('the run ends where /W at the CID puts it', () => {
        const FONT = 80, CIDF = 81, CMAP = 82, TOU = 83;
        const cmapSrc = '1 begincodespacerange <0000> <FFFF> endcodespacerange 1 begincidchar <0101> 5 endcidchar';
        const touSrc = cmapApi.buildToUnicode(new Map([[0x0101, 'A'], [0x0102, 'B']]));
        const { runs, losses } = extract({
            contentBytes: enc('BT /F1 10 Tf <01010102> Tj ET\n'),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [
                { num: FONT, gen: 0, value: obj.dict({
                    Type: obj.name('Font'), Subtype: obj.name('Type0'), BaseFont: obj.name('Sub'),
                    Encoding: obj.ref(CMAP, 0), DescendantFonts: obj.array([obj.ref(CIDF, 0)]), ToUnicode: obj.ref(TOU, 0)
                }) },
                { num: CIDF, gen: 0, value: obj.dict({
                    Type: obj.name('Font'), Subtype: obj.name('CIDFontType0'), BaseFont: obj.name('Sub'),
                    DW: obj.int(1000), W: obj.array([obj.int(5), obj.array([obj.int(250)])])
                }) },
                { num: CMAP, gen: 0, value: obj.stream(obj.dict({ Type: obj.name('CMap'), Length: obj.int(cmapSrc.length) }), enc(cmapSrc)) },
                { num: TOU, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(touSrc.length) }), enc(touSrc)) }
            ]
        });
        expect(runs.map((r) => [r.text, r.x, r.xEnd])).toEqual([['AB', 0, 12.5]]);
        expect(losses).toEqual([]);
    });
});
