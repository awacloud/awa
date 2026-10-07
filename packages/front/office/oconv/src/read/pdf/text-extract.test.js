// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for `oconvPdfTextExtract` (`extractPage`) — the tier-1 pdf reader's
 * page-level content-stream walk.
 *
 * BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C29): three loss codes this
 * module contributes had NO producing test anywhere in the suite —
 * `xobject/form-dropped`, `content/undecodable`, `text/font-unresolved`. Each
 * is driven here through the published `@awacloud/pdf` object builder
 * (`pdfParser.obj`) + `pdf.write`/`pdf.read`, exactly the recipe
 * `../pdf-to-ir.test.js`'s `genUntagged` already uses — never a hand-rolled
 * byte stream.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
// Relative import of the sibling @awacloud/pdf manifest — see font-decoder.test.js
// for why the bare specifier is not used here (task 06 adds the package dep).
import { fw_require, pkg_require, modules } from '../../../../pdf/src/main.js';
import { oconvPdfFontDecoder } from './font-decoder.js';
import { oconvPdfTextExtract } from './text-extract.js';
import { groupParagraphs } from './paragraph-group.js';

let pdf;
let obj;
let extractPage;
let xrefStm;
let cmapApi;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(pkg_require);
    rt.registerAll(modules);
    rt.register(oconvPdfFontDecoder);
    rt.register(oconvPdfTextExtract);

    pdf = rt.resolve('pdf');
    obj = rt.resolve('pdfParser').obj;
    ({ extractPage } = rt.resolve('oconvPdfTextExtract'));
    xrefStm = rt.resolve('pdfXrefStreamWriter');
    cmapApi = rt.resolve('cmapToUnicode');
});

const enc = (s) => new TextEncoder().encode(s);
const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4;

/**
 * A minimal single-page PDF around one content stream, built through the
 * published `pdfParser.obj` + `pdf.write` surfaces (never a hand-rolled byte
 * stream). Mirrors `../pdf-to-ir.test.js`'s `genUntagged`, generalised so
 * each test can supply its own resources, content bytes and a raw content
 * dict (for a filter that cannot decode).
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

/**
 * Build the doc and run `extractPage` on its one page. `opts` forwards to
 * `extractPage`'s own third argument (e.g. `{ formOpBudget }`, BL-1610).
 */
function extract(spec, opts) {
    const doc = pdf.read(buildDoc(spec));
    return extractPage(doc.pages[0], doc._raw.resolve, opts);
}

describe('oconvPdfTextExtract — xobject/form-dropped (C29)', () => {
    // Re-pointed by office/BATCH_43 task 04: this pin encoded the dropped-form
    // bound (every Form `Do` recorded `xobject/form-dropped`, text lost). Forms
    // are now executed; the code survives only for a form whose stream cannot
    // be used, with a reason in its detail.
    test('a Form XObject whose stream cannot decode records xobject/form-dropped with a reason, no item', () => {
        const FORM = 10;
        const { losses, items, counts } = extract({
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
        expect(items).toEqual([]);
        expect(counts.operators).toBeGreaterThan(0);
    });

    test('an empty Form XObject is executed: no loss, no item', () => {
        const FORM = 10;
        const { losses, items } = extract({
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
        expect(items).toEqual([]);
    });
});

describe('oconvPdfTextExtract — content/undecodable (C29)', () => {
    test('a content stream whose filter cannot decode is skipped, named by its object number and its cause', () => {
        // `CCITTFaxDecode` is a real PDF filter name, but `pdfFilterDispatch`
        // has no decoder registered for it (dispatch.js: "not implemented at
        // L1") — `dispatchMod.decode(stream)` throws, caught by `pageOps`'s
        // own try/catch around decode+parse. The detail carries the thrown
        // message after the object number (measured text, quoted once):
        //   stream 4: filter "CCITTFaxDecode" not registered
        const { losses, items, counts } = extract({
            contentBytes: new Uint8Array([1, 2, 3, 4]),
            contentDictExtra: { Filter: obj.name('CCITTFaxDecode') }
        });
        expect(losses).toHaveLength(1);
        expect(losses[0].code).toBe('content/undecodable');
        expect(losses[0].detail).toMatch(/^stream \d+: .+/);
        expect(losses[0].detail.startsWith(`stream ${CONTENT}: `)).toBe(true);
        expect(losses[0].detail).toBe(`stream ${CONTENT}: filter "CCITTFaxDecode" not registered`);
        expect(items).toEqual([]);
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
        const { losses, items } = extractPage(page, () => { throw new Error('object 7 is free'); });
        expect(losses).toEqual([{ code: 'content/undecodable', detail: 'stream 7: object 7 is free' }]);
        expect(items).toEqual([]);
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
        expect(typeof losses[0].detail).toBe('string');
    });

    test('a thrown non-Error value is stringified; an empty message falls back to the value text', () => {
        const page = { contents: [{ type: 'ref', num: 5, gen: 0 }] };
        const a = extractPage(page, () => { throw 'plain string'; });
        expect(a.losses).toEqual([{ code: 'content/undecodable', detail: 'stream 5: plain string' }]);
        const b = extractPage(page, () => { throw new Error(''); });
        expect(b.losses).toEqual([{ code: 'content/undecodable', detail: 'stream 5: Error' }]);
    });
});

describe('oconvPdfTextExtract — text/font-unresolved (C29)', () => {
    test('a `Tf` naming a font absent from /Resources counts its run undecodable, pushes no text item', () => {
        const { losses, items, counts } = extract({
            contentBytes: enc('BT /F1 12 Tf (Hello) Tj ET\n'),
            resourcesEntries: {}                      // no /Font sub-dict at all
        });
        expect(losses).toEqual([{ code: 'text/font-unresolved', detail: 'F1' }]);
        expect(items).toEqual([]);
        expect(counts.undecodable).toBe('Hello'.length);
        expect(counts.decoded).toBe(0);
    });

    test('non-vacuity: the SAME content with a resolvable font records neither loss', () => {
        const uMap = new Map();
        for (let c = 0x20; c <= 0x7e; c++) uMap.set(c, String.fromCharCode(c));
        const cmap = new ModuleRuntime();
        cmap.registerAll(fw_require);
        cmap.registerAll(pkg_require);
        cmap.registerAll(modules);
        const toUni = cmap.resolve('cmapToUnicode').buildToUnicode(uMap);
        const TOUNI = 20, FONT = 21;
        const { losses, items } = extract({
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
        expect(losses.map((l) => l.code)).not.toContain('text/font-unresolved');
        expect(losses.map((l) => l.code)).not.toContain('content/undecodable');
        expect(items).toHaveLength(1);
        const { xEnd, ...rest } = items[0];
        expect(rest).toEqual({ kind: 'text', x: 0, y: 0, fontSize: 12, text: 'Hello', mcid: null });
        // Standard 14 Helvetica, no /Widths: the AFM widths H e l l o =
        // 722 + 556 + 222 + 222 + 556 = 2278 thousandths → 2.278 × 12 pt.
        expect(xEnd).toBeCloseTo(27.336, 9);
        expect(losses.map((l) => l.code)).not.toContain('text/width-approximated');
    });
});

// ---------------------------------------------------------------------------
// BATCH_41 task 05 (BL-1546) — font-resource resolution.
//
// Measured cause on anssi-guide-selection_crypto-1.0.pdf: every page's
// `/Resources` carries `/ExtGState` as an INDIRECT reference; before the fix
// `pdfResources.typeResources` rejected any non-dict category value
// (`pdf/resources/bad-subdict`), `extractPage` caught that and dropped the
// WHOLE resource map, so every `Tf` resolved no font. The font dicts
// themselves live in object streams (`/Type /ObjStm`) and were always
// reachable through `readResult._raw.resolve`.
// ---------------------------------------------------------------------------

/**
 * Build a one-page PDF with an xref STREAM + object streams
 * (`pdfXrefStreamWriter`, `useObjStm: true`): every non-stream indirect
 * (catalog, pages, page, resource dicts, font dicts) is compressed into an
 * `/ObjStm`, exactly the real document's shape.
 *
 * @param {{contentBytes: Uint8Array, resources: object, extraIndirects: object[]}} spec
 * @returns {Uint8Array}
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

/**
 * A Type0 font (CIDFontType0 descendant) with an optional ToUnicode CMap.
 *
 * @param {number[]} nums `[font, cidFont, toUnicode]` object numbers
 * @param {{encoding?: string, toUnicode?: Map<number, string>}} opts
 * @returns {object[]} indirects
 */
function type0Font(nums, opts) {
    const [FONT, CID, TOUNI] = nums;
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

/**
 * `true` when `num 0 obj` appears as a top-level (uncompressed) object.
 *
 * @param {Uint8Array} bytes
 * @param {number} num
 * @returns {boolean}
 */
function isTopLevel(bytes, num) {
    return new RegExp(`(^|[^0-9])${num} 0 obj`).test(new TextDecoder('latin1').decode(bytes));
}

describe('oconvPdfTextExtract — font resolution (BL-1546)', () => {
    const RES = 30, GS = 31, FONTS = 32, F1 = 40, CID1 = 41, TU1 = 42;
    const cidMap = new Map([[0x0001, 'é'], [0x0002, 't'], [0x0003, 'é']]);

    test('measured shape: indirect /ExtGState + Type0 font in an object stream decodes through ToUnicode', () => {
        const bytes = buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <000100020003> Tj ET\n'),
            resources: obj.ref(RES, 0),
            extraIndirects: [
                { num: RES, gen: 0, value: obj.dict({
                    Font: obj.dict({ F1: obj.ref(F1, 0) }),
                    ExtGState: obj.ref(GS, 0),           // the measured indirect category
                    ProcSet: obj.array([obj.name('PDF'), obj.name('Text')])
                }) },
                { num: GS, gen: 0, value: obj.dict({ GS1: obj.dict({ Type: obj.name('ExtGState') }) }) },
                ...type0Font([F1, CID1, TU1], { toUnicode: cidMap })
            ]
        });
        // The font dicts are compressed in an /ObjStm, not top-level objects.
        expect(isTopLevel(bytes, F1)).toBe(false);
        expect(isTopLevel(bytes, CID1)).toBe(false);
        expect(isTopLevel(bytes, RES)).toBe(false);

        const doc = pdf.read(bytes);
        const { losses, items, counts } = extractPage(doc.pages[0], doc._raw.resolve);
        expect(losses).toEqual([]);
        expect(items.map((i) => i.text)).toEqual(['été']);
        expect(counts).toMatchObject({ decoded: 3, undecodable: 0 });
    });

    test('an indirect /Font category whose font dict sits in an object stream resolves', () => {
        const bytes = buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <0001> Tj ET\n'),
            resources: obj.dict({ Font: obj.ref(FONTS, 0) }),
            extraIndirects: [
                { num: FONTS, gen: 0, value: obj.dict({ F1: obj.ref(F1, 0) }) },
                ...type0Font([F1, CID1, TU1], { toUnicode: cidMap })
            ]
        });
        expect(isTopLevel(bytes, FONTS)).toBe(false);
        expect(isTopLevel(bytes, F1)).toBe(false);
        const doc = pdf.read(bytes);
        const { losses, items } = extractPage(doc.pages[0], doc._raw.resolve);
        expect(losses.map((l) => l.code)).not.toContain('text/font-unresolved');
        expect(items.map((i) => i.text)).toEqual(['é']);
    });

    test('honest loss: a Type0 Identity-H font with no ToUnicode stays a ledgered text/undecodable run', () => {
        const bytes = buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <00010002> Tj ET\n'),
            resources: obj.dict({ Font: obj.dict({ F1: obj.ref(F1, 0) }), ExtGState: obj.ref(GS, 0) }),
            extraIndirects: [
                { num: GS, gen: 0, value: obj.dict({}) },
                ...type0Font([F1, CID1, TU1], {})           // no ToUnicode; Identity-H codes are CIDs
            ]
        });
        const doc = pdf.read(bytes);
        const { losses, items, counts } = extractPage(doc.pages[0], doc._raw.resolve);
        // The font RESOLVES (no font-unresolved) — its codes do not decode.
        expect(losses).toEqual([{ code: 'text/undecodable', detail: '2 code(s)' }]);
        expect(items).toEqual([]);
        expect(counts).toMatchObject({ decoded: 0, undecodable: 2 });
    });

    test('standard CMap: a Type0 UniJIS-UCS2-H font with no ToUnicode decodes its UCS-2 codes', () => {
        const bytes = buildObjStmDoc({
            contentBytes: enc('BT /F1 12 Tf <65E5672C> Tj ET\n'),     // U+65E5 U+672C
            resources: obj.dict({ Font: obj.dict({ F1: obj.ref(F1, 0) }) }),
            extraIndirects: type0Font([F1, CID1, TU1], { encoding: 'UniJIS-UCS2-H' })
        });
        const doc = pdf.read(bytes);
        const { losses, items } = extractPage(doc.pages[0], doc._raw.resolve);
        expect(losses).toEqual([]);
        expect(items.map((i) => i.text)).toEqual(['日本']);
    });
});

// ---------------------------------------------------------------------------
// Piece end position — the ISO 32000-2 §9.4.4 advance model.
//
// Every case uses a simple font whose `/Widths` give 500 thousandths to each
// code 32..122, at 10 pt, so one glyph advances 5 text-space units before
// Tc / Tw / Tz / TJ adjustments — every expected figure is hand-derivable.
// ---------------------------------------------------------------------------

describe('oconvPdfTextExtract — piece end position (advance model)', () => {
    const FONT = 50;
    const widths500 = () => {
        const w = [];
        for (let c = 32; c <= 122; c++) w.push(obj.int(500));
        return w;
    };
    /** Extract `content` shown with /F1 = a flat-500 simple font (or `fontDict`). */
    function run(content, fontDict) {
        return extract({
            contentBytes: enc(content),
            resourcesEntries: { Font: obj.dict({ F1: obj.ref(FONT, 0) }) },
            extraIndirects: [{ num: FONT, gen: 0, value: fontDict || obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('Type1'),
                BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'),
                FirstChar: obj.int(32), LastChar: obj.int(122), Widths: obj.array(widths500())
            }) }]
        });
    }
    const ends = (items) => items.map((i) => [i.text, i.x, i.xEnd]);

    test('xEnd = x + Σ w0/1000 × Tfs, and the next Tj without Td starts there', () => {
        const { items, losses } = run('BT /F1 10 Tf (ab) Tj (cd) Tj ET\n');
        expect(ends(items)).toEqual([['ab', 0, 10], ['cd', 10, 20]]);
        expect(losses).toEqual([]);
    });

    test('Tc, Tw (single-byte code 32 only) and Tz scale the advance', () => {
        // a, space, b: (5 + 2) + (5 + 2 + 3) + (5 + 2) = 24, × Th 0.5 = 12.
        const { items } = run('BT /F1 10 Tf 2 Tc 3 Tw 50 Tz (a b) Tj ET\n');
        expect(ends(items)).toEqual([['a b', 0, 12]]);
    });

    test('the device-space end follows the CTM, like x', () => {
        const { items } = run('2 0 0 2 100 0 cm BT /F1 10 Tf (ab) Tj ET\n');
        expect(ends(items)).toEqual([['ab', 100, 120]]);
    });

    test('q/Q save and restore Tc, Tw and Tz with the graphics state', () => {
        const { items } = run('BT /F1 10 Tf q 5 Tc 9 Tw 200 Tz Q (a b) Tj ET\n');
        expect(ends(items)).toEqual([['a b', 0, 15]]);
    });

    test("' moves to the next line then shows; \" sets Tw and Tc first", () => {
        // `'`: T* (leading 12) then show "ab" — 10 wide, from x 0.
        const q1 = run('BT /F1 10 Tf 12 TL 0 100 Td (ab) \' ET\n');
        expect(q1.items.map((i) => [i.text, i.y, i.x, i.xEnd])).toEqual([['ab', 88, 0, 10]]);
        // `"`: aw 4, ac 1 → a (5+1), space (5+1+4), b (5+1) = 22; the NEXT
        // show keeps Tc 1: a = 6 → 22..28.
        const q2 = run('BT /F1 10 Tf 12 TL 0 100 Td 4 1 (a b) " (a) Tj ET\n');
        expect(q2.items.map((i) => [i.text, i.y, i.x, i.xEnd])).toEqual([
            ['a b', 88, 0, 22], ['a', 88, 22, 28]
        ]);
    });

    test('TJ numeric adjustments move the end by −n/1000 × Tfs × Th', () => {
        // a (5) + kern +3 (−300) + b (5) = 13; 0.3 em > the 0.15 em word
        // gap infers one space (BL-1599, office/BATCH_49/02).
        const { items } = run('BT /F1 10 Tf [(a) -300 (b)] TJ ET\n');
        expect(ends(items)).toEqual([['a b', 0, 13]]);
        // A positive adjustment moves left: a (5) − 1 (100) + b (5) = 9.
        const back = run('BT /F1 10 Tf [(a) 100 (b)] TJ ET\n');
        expect(ends(back.items)).toEqual([['ab', 0, 9]]);
    });

    test('a TJ kern gap never doubles a space already on either side', () => {
        const { items } = run('BT /F1 10 Tf [(a ) -300 (b) -300 ( c) -300 -300 (d)] TJ ET\n');
        expect(items.map((i) => i.text)).toEqual(['a b c d']);
    });

    // BL-1599 (office/BATCH_49/02): a TJ adjustment n yields a word space iff
    // −n / 1000 > wordGap (0.15 em, the line pass's default). Red before the
    // fix (measured 2026-10-02): the threshold was n ≤ −200, so −151 and
    // −166 (a justified line's shrunk word space) came back glued, "ab".
    test.each([
        [-149, 'ab'],
        [-150, 'ab'],
        [-151, 'a b'],
        [-166, 'a b'],
        [-200, 'a b']
    ])('a TJ adjustment of %p thousandths yields %p (space iff −n/1000 > 0.15)', (n, expected) => {
        const { items } = run(`BT /F1 10 Tf [(a) ${n} (b)] TJ ET\n`);
        expect(items.map((i) => i.text)).toEqual([expected]);
    });

    test('drift: the TJ word-space threshold equals the line pass default wordGap', () => {
        // `text-extract.js` and `paragraph-group.js` each hold the 0.15 em
        // constant (fw/no-factory-capture: no shared import); this sweep
        // pins them equal to the thousandth of an em. For each n the TJ
        // pass sees an adjustment of −n thousandths; the line pass sees two
        // pieces n thousandths of an em apart (em = 1000, so exact).
        const sweep = [100, 140, 149, 150, 151, 152, 160, 166, 199, 200, 250];
        const tj = (n) => run(`BT /F1 10 Tf [(a) ${-n} (b)] TJ ET\n`).items[0].text === 'a b';
        const line = (n) => groupParagraphs([
            { text: 'a', x: 0, xEnd: 1000, y: 0, fontSize: 1000 },
            { text: 'b', x: 1000 + n, xEnd: 2000 + n, y: 0, fontSize: 1000 }
        ])[0] === 'a b';
        const decisions = sweep.map((n) => [n, tj(n), line(n)]);
        for (const [n, t, l] of decisions) expect([n, t]).toEqual([n, l]);
        // Non-vacuity: the sweep straddles the threshold (150 → 151).
        expect(decisions.filter(([, t]) => t).map(([n]) => n)[0]).toBe(151);
        expect(decisions.some(([, t]) => !t)).toBe(true);
    });

    test('no /Widths on a non-Standard-14 font: 500 fallback, ONE text/width-approximated per font, no throw', () => {
        const { items, losses } = run('BT /F1 10 Tf (ab) Tj (cd) Tj ET\n', obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('NotAStandardFont'), Encoding: obj.name('WinAnsiEncoding')
        }));
        expect(ends(items)).toEqual([['ab', 0, 10], ['cd', 10, 20]]);
        expect(losses).toEqual([{ code: 'text/width-approximated', detail: 'F1' }]);
    });

    test('a malformed /Widths (not an array) falls back and records, never throws', () => {
        const { items, losses } = run('BT /F1 10 Tf (ab) Tj ET\n', obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'),
            FirstChar: obj.int(32), Widths: obj.name('Oops')
        }));
        expect(ends(items)).toEqual([['ab', 0, 10]]);
        expect(losses).toEqual([{ code: 'text/width-approximated', detail: 'F1' }]);
    });

    test('a show under an unresolved font advances nothing and pushes no item', () => {
        const { items, losses } = run('BT /F9 10 Tf (ab) Tj [(cd)] TJ /F1 10 Tf (ef) Tj ET\n');
        expect(ends(items)).toEqual([['ef', 0, 10]]);
        expect(losses.map((l) => l.code)).toEqual([
            'text/font-unresolved', 'text/font-unresolved', 'text/undecodable'
        ]);
    });
});

// ---------------------------------------------------------------------------
// Form XObject execution (ISO 32000-2 §8.10.1) — office/BATCH_43 task 04.
//
// Every case reuses the flat-500 simple font (one glyph = 5 text-space units
// at 10 pt) so positions and ends are hand-derivable.
// ---------------------------------------------------------------------------

describe('oconvPdfTextExtract — Form XObject execution', () => {
    const FONT = 60;
    const flatFont = () => {
        const w = [];
        for (let c = 32; c <= 122; c++) w.push(obj.int(500));
        return {
            num: FONT, gen: 0, value: obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('Type1'),
                BaseFont: obj.name('Flat'), Encoding: obj.name('WinAnsiEncoding'),
                FirstChar: obj.int(32), LastChar: obj.int(122), Widths: obj.array(w)
            })
        };
    };
    const fontRes = () => obj.dict({ F1: obj.ref(FONT, 0) });
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
    const place = (items) => items.filter((i) => i.kind === 'text').map((i) => [i.text, i.x, i.y, i.xEnd]);

    test('/Matrix is concatenated onto the CTM (Matrix × CTM) and the advance model runs under it', () => {
        // Page CTM translates by (0, 100); the form's Matrix scales by 2 and
        // translates by (100, 50). Text-space (5, 10) → form (110, 70) →
        // page (110, 170). "ab" advances 10 text units = 20 device units,
        // and the following "cd" (no Td) starts where "ab" ended.
        const { items, losses } = extract({
            contentBytes: enc('1 0 0 1 0 100 cm /Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf 5 10 Td (ab) Tj (cd) Tj ET\n', {
                    matrix: [2, 0, 0, 2, 100, 50],
                    resources: obj.dict({ Font: fontRes() })
                }),
                flatFont()
            ]
        });
        expect(losses).toEqual([]);
        expect(place(items)).toEqual([['ab', 110, 170, 130], ['cd', 130, 170, 150]]);
        expect(items[0].fontSize).toBe(20);
    });

    test('the graphics and text state are restored on return, even after an unbalanced Q inside the form', () => {
        // The form pops past its own entry state and sets Tc 5 / Tz 50; the
        // page text after `Do` still runs at the page CTM with Tc 0, Tz 100.
        const { items, losses } = extract({
            contentBytes: enc('q 1 0 0 1 0 100 cm /Fm1 Do BT /F1 10 Tf (ab) Tj ET Q\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'Q Q 1 0 0 1 7 0 cm 5 Tc 50 Tz BT /F1 10 Tf (x) Tj ET\n', {
                    matrix: [1, 0, 0, 1, 0, 20]
                }),
                flatFont()
            ]
        });
        expect(losses).toEqual([]);
        // Form text: the unbalanced Qs reset to the form's entry CTM
        // (0, 120), then cm moves it to (7, 120); x advances (5 + 5) × 0.5.
        expect(place(items)).toEqual([['x', 7, 120, 12], ['ab', 0, 100, 10]]);
    });

    test('a form with no /Resources of its own resolves fonts from the page', () => {
        const { items, losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'BT /F1 10 Tf (inherited) Tj ET\n'), flatFont()]
        });
        expect(losses).toEqual([]);
        expect(items.map((i) => i.text)).toEqual(['inherited']);
    });

    test('a form /Resources with indirect categories, or one malformed category, keeps its fonts', () => {
        const FONTS = 20, GS = 21;
        const { items, losses } = extract({
            contentBytes: enc('/Fm1 Do /Fm2 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0), Fm2: obj.ref(11, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf (one) Tj ET\n', {
                    resources: obj.dict({ Font: obj.ref(FONTS, 0), ExtGState: obj.ref(GS, 0) })
                }),
                // `/ExtGState 3` is neither a dict nor a ref: the map as a
                // whole fails to type, its /Font category still resolves.
                form(11, 'BT /F1 10 Tf (two) Tj ET\n', {
                    resources: obj.dict({ Font: fontRes(), ExtGState: obj.int(3) })
                }),
                { num: FONTS, gen: 0, value: fontRes() },
                { num: GS, gen: 0, value: obj.dict({}) },
                flatFont()
            ]
        });
        expect(losses).toEqual([]);
        expect(items.map((i) => i.text)).toEqual(['one', 'two']);
    });

    test('nested forms (depth 2) compose both matrices; the mcid in scope at Do carries into the form', () => {
        const { items, losses } = extract({
            contentBytes: enc('/P <</MCID 7>> BDC /Fa Do EMC\n'),
            resourcesEntries: { XObject: obj.dict({ Fa: obj.ref(10, 0) }) },
            extraIndirects: [
                // An unbalanced EMC inside Fa never pops the page's MCID 7.
                form(10, 'EMC /Fb Do\n', {
                    matrix: [1, 0, 0, 1, 10, 0],
                    resources: obj.dict({ XObject: obj.dict({ Fb: obj.ref(11, 0) }) })
                }),
                form(11, 'BT /F1 10 Tf (deep) Tj ET\n', {
                    matrix: [1, 0, 0, 1, 0, 20],
                    resources: obj.dict({ Font: fontRes() })
                }),
                flatFont()
            ]
        });
        expect(losses).toEqual([]);
        expect(place(items)).toEqual([['deep', 10, 20, 30]]);
        expect(items[0].mcid).toBe(7);
    });

    test('an image drawn inside a form records one image/dropped and one image item, no form loss', () => {
        const IMG = 12;
        const { items, losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, 'q 10 0 0 10 0 0 cm /Im1 Do Q\n', {
                    resources: obj.dict({ XObject: obj.dict({ Im1: obj.ref(IMG, 0) }) })
                }),
                { num: IMG, gen: 0, value: obj.stream(obj.dict({
                    Type: obj.name('XObject'), Subtype: obj.name('Image'),
                    Width: obj.int(1), Height: obj.int(1), ColorSpace: obj.name('DeviceGray'),
                    BitsPerComponent: obj.int(8), Length: obj.int(1)
                }), new Uint8Array([0])) }
            ]
        });
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1' }]);
        expect(items).toEqual([{ kind: 'image', mcid: null }]);
    });

    test('cycle guard: a form reached again from inside itself records xobject/form-cycle, keeps its first pass', () => {
        // Fa → Fb → Fa: Fa and Fb each run once, the inner Fa is not re-entered.
        const { items, losses } = extract({
            contentBytes: enc('/Fa Do\n'),
            resourcesEntries: { Font: fontRes(), XObject: obj.dict({ Fa: obj.ref(10, 0), Fb: obj.ref(11, 0) }) },
            extraIndirects: [
                form(10, 'BT /F1 10 Tf (a) Tj ET /Fb Do\n'),
                form(11, 'BT /F1 10 Tf (b) Tj ET /Fa Do\n'),
                flatFont()
            ]
        });
        expect(losses).toEqual([{ code: 'xobject/form-cycle', detail: 'Fa' }]);
        expect(items.map((i) => i.text)).toEqual(['a', 'b']);
    });

    test('depth guard: forms execute 12 deep; the 13th records xobject/form-depth', () => {
        // Link i shows "L<i>" and draws link i + 1; 14 links.
        const links = [];
        for (let i = 0; i < 14; i++) {
            links.push(form(100 + i, `BT /F1 10 Tf (L${i}) Tj ET /Fn Do\n`, {
                resources: obj.dict({
                    Font: fontRes(),
                    XObject: obj.dict(i < 13 ? { Fn: obj.ref(101 + i, 0) } : {})
                })
            }));
        }
        const { items, losses } = extract({
            contentBytes: enc('/Fn Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fn: obj.ref(100, 0) }) },
            extraIndirects: [...links, flatFont()]
        });
        expect(items.map((i) => i.text)).toEqual(Array.from({ length: 12 }, (_, i) => `L${i}`));
        expect(losses).toEqual([{ code: 'xobject/form-depth', detail: 'Fn' }]);
    });

    test('budget guard: form draws stop once a page ran 1,000,000 operators inside forms, one xobject/form-budget', () => {
        // The page draws A 10 times; A draws B 10 times, B draws the
        // 2000-operator leaf C 10 times: one A run executes 10 + 100 +
        // 200,000 = 200,110 form operators. Five A runs pass 1,000,000
        // (1,000,550), so the sixth A draw is skipped — as are the rest,
        // with one loss.
        const draw10 = (name) => `${Array.from({ length: 10 }, () => `/${name} Do`).join(' ')}\n`;
        const leaf = `${'q Q '.repeat(1000)}\n`;
        const { items, losses, counts } = extract({
            contentBytes: enc(draw10('A')),
            resourcesEntries: { XObject: obj.dict({ A: obj.ref(10, 0) }) },
            extraIndirects: [
                form(10, draw10('B'), { resources: obj.dict({ XObject: obj.dict({ B: obj.ref(11, 0) }) }) }),
                form(11, draw10('C'), { resources: obj.dict({ XObject: obj.dict({ C: obj.ref(12, 0) }) }) }),
                form(12, leaf)
            ]
        });
        expect(items).toEqual([]);
        expect(losses).toEqual([{ code: 'xobject/form-budget', detail: 'A' }]);
        // 10 page operators + 5 × 200,110 form operators.
        expect(counts.operators).toBe(10 + 5 * 200110);
    });

    // BL-1610 — the budget above (1,000,000, the default) is now
    // configurable via `extractPage`'s third argument. This pin is a
    // SEPARATE fixture, deliberately not the 1,000,000 one above, which
    // stays unedited and green as the default-unchanged pin.
    test('formOpBudget: a small budget stops form draws early, one xobject/form-budget, counts.operators matches the fixture', () => {
        // The page draws Fm 3 times; Fm runs 4 operators (q Q q Q). With
        // formOpBudget 5: draw 1 runs (formOps 0 < 5) → formOps 4; draw 2
        // runs (4 < 5) → formOps 8; draw 3 is skipped (8 >= 5), one loss.
        const { items, losses, counts } = extract({
            contentBytes: enc('/Fm Do /Fm Do /Fm Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'q Q q Q\n')]
        }, { formOpBudget: 5 });
        expect(items).toEqual([]);
        expect(losses).toEqual([{ code: 'xobject/form-budget', detail: 'Fm' }]);
        // 3 page-level `Do` operators + 2 executed form runs × 4 operators.
        expect(counts.operators).toBe(3 + 2 * 4);
    });

    test('formOpBudget: a budget large enough never records the loss on the same fixture', () => {
        const { losses } = extract({
            contentBytes: enc('/Fm Do /Fm Do /Fm Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm: obj.ref(10, 0) }) },
            extraIndirects: [form(10, 'q Q q Q\n')]
        }, { formOpBudget: 1000 });
        expect(losses).toEqual([]);
    });

    test('a /Subtype /Form that is not a stream records xobject/form-dropped with its reason, never throws', () => {
        const { items, losses } = extract({
            contentBytes: enc('/Fm1 Do\n'),
            resourcesEntries: { XObject: obj.dict({ Fm1: obj.ref(10, 0) }) },
            extraIndirects: [{ num: 10, gen: 0, value: obj.dict({ Type: obj.name('XObject'), Subtype: obj.name('Form') }) }]
        });
        expect(items).toEqual([]);
        expect(losses).toEqual([{ code: 'xobject/form-dropped', detail: 'Fm1: not a stream' }]);
    });
});
