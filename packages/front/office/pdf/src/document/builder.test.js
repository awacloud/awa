// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfBuilder } from './builder.js';
import { pdfWriter } from './writer.js';
import { pdfDocument } from './document.js';
import { pdfShared } from '../_shared/index.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfCatalog } from './catalog.js';
import { pdfPage } from './page.js';
import { pdfPages } from './pages.js';
import { pdfFont } from '../font/font.js';
import { pdfErrors } from '../errors.js';

const errors = pdfErrors.factory();
const { RenderError } = errors;
const _shared    = pdfShared.factory();
const _tokenizer = pdfTokenizer.factory(errors, _shared);
const _parserObj = pdfParserObj.factory();
const _parser    = pdfParser.factory(errors, _parserObj, _tokenizer);
const _xref      = pdfXref.factory(errors, _tokenizer, _parser);
const _trailer   = pdfTrailer.factory(errors, _parserObj);
const _serializer = pdfSerializer.factory(errors);
const _catalog   = pdfCatalog.factory(errors, _parserObj);
const _page      = pdfPage.factory(errors, _parserObj);
const _pages     = pdfPages.factory(errors, _parserObj);
const _writer    = pdfWriter.factory(errors, _serializer);
const { readDocument } = pdfDocument.factory(
    errors, _tokenizer, _parser, _xref, _trailer, _catalog, _page, _pages
);
const { builder } = pdfBuilder.factory(errors, _parserObj, _writer);
const { typeFont } = pdfFont.factory(errors, _parserObj);

const td = new TextDecoder('latin1');

describe('pdfBuilder — module shape', () => {
    test('descriptor shape', () => {
        expect(pdfBuilder.name).toBe('pdfBuilder');
        expect(pdfBuilder.dependencies).toEqual(
            ['pdfErrors', 'pdfParserObj', 'pdfWriter']);
        expect(pdfBuilder.factory.toString()).toContain('function');
    });

    test('factory exposes builder()', () => {
        expect(typeof builder).toBe('function');
        const b = builder();
        for (const m of ['addPage', 'addContent', 'addFont', 'addImage',
                'addMetadata', 'setVersion', 'setId', 'build']) {
            expect(typeof b[m]).toBe('function');
        }
    });

    test('published surface order is frozen', () => {
        expect(Object.keys(builder())).toEqual([
            'addPage', 'addContent', 'addFont', 'addImage', 'addMetadata',
            'setVersion', 'setId', 'build'
        ]);
    });
});

describe('pdfBuilder — minimal documents', () => {
    test('1-page minimal PDF builds and re-reads', () => {
        const bytes = builder()
            .addPage({ mediaBox: [0, 0, 612, 792] })
            .build();
        expect(bytes).toBeInstanceOf(Uint8Array);
        const txt = td.decode(bytes);
        expect(txt.startsWith('%PDF-2.0')).toBe(true);
        expect(txt.includes('%%EOF')).toBe(true);

        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);
        expect(doc.pages[0].mediaBox[2]).toBe(612);
        expect(doc.pages[0].mediaBox[3]).toBe(792);
    });

    test('default mediaBox is letter', () => {
        const bytes = builder().addPage().build();
        const doc = readDocument(bytes);
        expect(doc.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
    });

    test('chaining returns the builder', () => {
        const b = builder();
        expect(b.addPage()).toBe(b);
        expect(b.setVersion('2.0')).toBe(b);
        expect(b.addMetadata({ Title: 'x' })).toBe(b);
    });
});

describe('pdfBuilder — multi-page + content', () => {
    test('3-page document with distinct content streams', () => {
        const bytes = builder()
            .addPage().addContent('BT /F1 12 Tf 100 700 Td (Page1) Tj ET')
            .addPage().addContent('BT /F1 12 Tf 100 700 Td (Page2) Tj ET')
            .addPage().addContent('BT /F1 12 Tf 100 700 Td (Page3) Tj ET')
            .build();
        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(3);
        for (const p of doc.pages) {
            expect(p.contents.length).toBe(1);
        }
    });

    test('addContent accepts Uint8Array', () => {
        const raw = new TextEncoder().encode('BT ET');
        const bytes = builder().addPage().addContent(raw).build();
        const doc = readDocument(bytes);
        expect(doc.pages[0].contents.length).toBe(1);
    });

    test('addContent before addPage throws', () => {
        expect(() => builder().addContent('BT ET')).toThrow(RenderError);
    });

    test('addFont before addPage throws', () => {
        expect(() => builder().addFont({
            name: 'F1', baseFont: 'Helvetica'
        })).toThrow(RenderError);
    });
});

describe('pdfBuilder — fonts in Resources', () => {
    test('addFont registers font in page Resources', () => {
        const bytes = builder()
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
            .addContent('BT /F1 12 Tf 100 700 Td (Hi) Tj ET')
            .build();

        const doc = readDocument(bytes);
        const res = doc.pages[0].resources;
        expect(res).toBeTruthy();
        expect(res.type).toBe('dict');
        const fontEntry = res.entries.Font;
        expect(fontEntry).toBeTruthy();
        expect(fontEntry.type).toBe('dict');
        expect(fontEntry.entries.F1).toBeTruthy();
        expect(fontEntry.entries.F1.type).toBe('ref');
    });

    test('multiple fonts on the same page', () => {
        const bytes = builder()
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addFont({ name: 'F2', baseFont: 'Times-Roman' })
            .build();
        const doc = readDocument(bytes);
        const fonts = doc.pages[0].resources.entries.Font;
        expect(Object.keys(fonts.entries).sort()).toEqual(['F1', 'F2']);
    });

    test('bad font spec throws', () => {
        const b = builder().addPage();
        expect(() => b.addFont(null)).toThrow(RenderError);
        expect(() => b.addFont({ name: 'F1' })).toThrow(RenderError);
        expect(() => b.addFont({ baseFont: 'Helvetica' })).toThrow(RenderError);
    });
});

describe('pdfBuilder — metadata', () => {
    test('Info dict ends up in trailer', () => {
        const bytes = builder()
            .addPage()
            .addMetadata({
                Title: 'My PDF',
                Author: 'Tester',
                Creator: 'awa/pdf'
            })
            .build();
        const txt = td.decode(bytes);
        expect(txt).toContain('/Info');

        const doc = readDocument(bytes);
        // The trailer should carry /Info.
        expect(doc.trailer.raw.entries.Info).toBeTruthy();
    });

    test('no metadata → no /Info in trailer', () => {
        const bytes = builder().addPage().build();
        const txt = td.decode(bytes);
        // /Info entry should not appear in the trailer.
        const trailerStart = txt.indexOf('trailer');
        const trailer = txt.substring(trailerStart);
        expect(trailer.includes('/Info')).toBe(false);
    });

    test('bad metadata input throws', () => {
        expect(() => builder().addMetadata(null)).toThrow(RenderError);
        expect(() => builder().addMetadata('x')).toThrow(RenderError);
    });
});

describe('pdfBuilder — version + ID', () => {
    test('setVersion 1.7 emits %PDF-1.7 header', () => {
        const bytes = builder().setVersion('1.7').addPage().build();
        const txt = td.decode(bytes);
        expect(txt.startsWith('%PDF-1.7')).toBe(true);
    });

    test('setVersion default is 2.0', () => {
        const bytes = builder().addPage().build();
        const txt = td.decode(bytes);
        expect(txt.startsWith('%PDF-2.0')).toBe(true);
    });

    test('setVersion rejects bad input', () => {
        expect(() => builder().setVersion('X')).toThrow(RenderError);
        expect(() => builder().setVersion(2)).toThrow(RenderError);
    });

    test('setId hex string ends up in trailer /ID', () => {
        const hex = '0123456789ABCDEF0123456789ABCDEF';
        const bytes = builder().setId(hex).addPage().build();
        const txt = td.decode(bytes);
        expect(txt).toContain('/ID');
        const doc = readDocument(bytes);
        expect(doc.trailer.id).toBeTruthy();
    });

    test('setId accepts two parts', () => {
        const bytes = builder()
            .setId('00112233445566778899AABBCCDDEEFF',
                   'FFEEDDCCBBAA99887766554433221100')
            .addPage()
            .build();
        const doc = readDocument(bytes);
        expect(doc.trailer.id).toBeTruthy();
    });

    test('setId rejects bad hex', () => {
        expect(() => builder().setId('A')).toThrow(RenderError); // odd
        expect(() => builder().setId(123)).toThrow(RenderError);
    });
});

describe('pdfBuilder — error paths', () => {
    test('build without pages throws', () => {
        expect(() => builder().build()).toThrow(RenderError);
    });

    test('addPage bad box throws on build', () => {
        const b = builder().addPage({ mediaBox: [0, 0] });
        expect(() => b.build()).toThrow(RenderError);
    });
});

describe('pdfBuilder — multi-content per page', () => {
    test('two content streams on one page → /Contents array', () => {
        const bytes = builder()
            .addPage()
            .addContent('q')
            .addContent('Q')
            .build();
        const doc = readDocument(bytes);
        expect(doc.pages[0].contents.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Embedded fonts — `addFont({ name, embedded })` (office/BATCH_33 task 02,
// BL-953). The `embedded` value is a `pdfFontEmbed.embedSimple` / `embedCid`
// result; here it is FAKED with typed `obj` dicts so the unit tier stays free
// of `@awacloud/fonts`. The real-`Font` proof lives in
// `tests/builder-embedded-font.integration.test.js`.
// ---------------------------------------------------------------------------

const obj = _parserObj.obj;
const te = new TextEncoder();

async function sha256Hex(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)]
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Every `N 0 obj` header in the emitted file — the indirect count. */
function countIndirects(bytes) {
    return (td.decode(bytes).match(/^\d+ 0 obj$/gm) || []).length;
}

const FAKE_PROGRAM = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0x11, 0x22, 0x33, 0x44]);
const FAKE_CMAP = te.encode('/CIDInit /ProcSet findresource begin\nendcmap\n');

function fakeDescriptor() {
    return obj.dict({
        Type:        obj.name('FontDescriptor'),
        FontName:    obj.name('ABCDEF+Fake'),
        Flags:       obj.int(32),
        ItalicAngle: obj.int(0),
        StemV:       obj.int(80),
        FontBBox:    obj.array([obj.int(0), obj.int(-200), obj.int(1000), obj.int(900)])
    });
}

/** Shape of `pdfFontEmbed.embedSimple` (`src/font/embed.js:385-395`). */
function fakeSimpleEmbed(fontFileKey) {
    const descriptor = fakeDescriptor();
    const toUnicodeStream = obj.stream(obj.dict({}), FAKE_CMAP);
    return {
        subtype: 'TrueType',
        fontDict: obj.dict({
            Type:      obj.name('Font'),
            Subtype:   obj.name('TrueType'),
            BaseFont:  obj.name('ABCDEF+Fake'),
            Encoding:  obj.name('WinAnsiEncoding'),
            FirstChar: obj.int(65),
            LastChar:  obj.int(66),
            Widths:    obj.array([obj.int(500), obj.int(600)]),
            FontDescriptor: descriptor,
            ToUnicode:      toUnicodeStream
        }),
        descriptor,
        toUnicodeStream,
        fontFile: FAKE_PROGRAM,
        fontFileKey: fontFileKey || 'FontFile2',
        encode: (t) => te.encode(t),
        widthOf: () => 500,
        codePoints: [65, 66]
    };
}

/** Shape of `pdfFontEmbed.embedCid` (`src/font/embed.js:455-465`). */
function fakeCidEmbed() {
    const descriptor = fakeDescriptor();
    const toUnicodeStream = obj.stream(obj.dict({}), FAKE_CMAP);
    const cidFontDict = obj.dict({
        Type:          obj.name('Font'),
        Subtype:       obj.name('CIDFontType2'),
        BaseFont:      obj.name('ABCDEF+Fake'),
        CIDSystemInfo: obj.dict({
            Registry:   obj.string(te.encode('Adobe'), 'lit'),
            Ordering:   obj.string(te.encode('Identity'), 'lit'),
            Supplement: obj.int(0)
        }),
        FontDescriptor: descriptor,
        DW:             obj.int(1000),
        W:              obj.array([obj.int(0), obj.array([obj.int(500), obj.int(600)])]),
        CIDToGIDMap:    obj.name('Identity')
    });
    return {
        type0Dict: obj.dict({
            Type:            obj.name('Font'),
            Subtype:         obj.name('Type0'),
            BaseFont:        obj.name('ABCDEF+Fake'),
            Encoding:        obj.name('Identity-H'),
            DescendantFonts: obj.array([cidFontDict]),
            ToUnicode:       toUnicodeStream
        }),
        cidFontDict,
        descriptor,
        toUnicodeStream,
        fontFile: FAKE_PROGRAM,
        fontFileKey: 'FontFile2',
        encode: () => new Uint8Array(0),
        widthOf: () => 500,
        codePoints: [65, 66]
    };
}

/** Structural snapshot of the dicts the caller owns — mutation detector. */
function embedSnapshot(e) {
    return JSON.stringify({
        descriptor: e.descriptor,
        toUnicodeStream: e.toUnicodeStream,
        fontDict: e.fontDict ?? null,
        type0Dict: e.type0Dict ?? null,
        cidFontDict: e.cidFontDict ?? null
    });
}

function deref(doc, o) {
    return (o && o.type === 'ref') ? doc._raw.resolve(o) : o;
}

describe('pdfBuilder — legacy addFont bytes are frozen (BL-953 regression pin)', () => {
    // Pinned by running `build()` on the UNMODIFIED builder before the
    // embedded-font seam was added (office/BATCH_33 task 02, 2026-09-02).
    // Any drift here means the new `addFont` shape leaked into the legacy path.
    const LEGACY_PIN = [
        {
            label: '1 page, 1 legacy font, content + Info + ID',
            build: () => builder()
                .setVersion('2.0')
                .addPage({ mediaBox: [0, 0, 612, 792] })
                .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
                .addContent('BT /F1 12 Tf 100 700 Td (Hello world) Tj ET')
                .addMetadata({ Title: 'Hello', Author: 'awa', Producer: 'awa/pdf' })
                .setId('0123456789ABCDEF0123456789ABCDEF')
                .build(),
            length: 770,
            sha256: '9807953faf828587ba7ea03505c9ecf6b35f5e60dcd6cc99c8797b96460c7b77'
        },
        {
            label: '2 pages, 3 legacy fonts, two-part ID',
            build: () => builder()
                .addPage()
                .addFont({ name: 'F1', baseFont: 'Helvetica' })
                .addFont({ name: 'F2', baseFont: 'Times-Roman', subtype: 'TrueType' })
                .addContent('BT /F1 12 Tf (A) Tj ET')
                .addPage()
                .addFont({ name: 'F1', baseFont: 'Courier' })
                .addContent('BT /F1 12 Tf (B) Tj ET')
                .setId('00112233445566778899AABBCCDDEEFF',
                       'FFEEDDCCBBAA99887766554433221100')
                .build(),
            length: 1086,
            sha256: '8493c50a50a24706d172537957ced54d2b887a90001605c6a67b5be7c45b259d'
        }
    ];

    for (const c of LEGACY_PIN) {
        test(`byte-identical — ${c.label}`, async () => {
            const bytes = c.build();
            expect(bytes.length).toBe(c.length);
            expect(await sha256Hex(bytes)).toBe(c.sha256);
        });
    }
});

describe('pdfBuilder — addFont validation (both shapes)', () => {
    test('neither baseFont nor embedded throws', () => {
        const b = builder().addPage();
        expect(() => b.addFont({ name: 'F1' })).toThrow(RenderError);
    });

    test('both baseFont and embedded throws (exactly one)', () => {
        const b = builder().addPage();
        expect(() => b.addFont({
            name: 'F1', baseFont: 'Helvetica', embedded: fakeSimpleEmbed()
        })).toThrow(RenderError);
    });

    test('embedded missing a required member throws', () => {
        const b = builder().addPage();
        for (const drop of ['fontFile', 'descriptor', 'toUnicodeStream', 'fontDict']) {
            const e = fakeSimpleEmbed();
            delete e[drop];
            expect(() => b.addFont({ name: 'F1', embedded: e }),
                `dropping ${drop} must be rejected`).toThrow(RenderError);
        }
    });

    test('embedded with a non-Uint8Array fontFile throws', () => {
        const e = fakeSimpleEmbed();
        e.fontFile = [1, 2, 3];
        expect(() => builder().addPage().addFont({ name: 'F1', embedded: e }))
            .toThrow(RenderError);
    });

    test('embedded carrying BOTH routes throws (fontDict xor type0Dict)', () => {
        const e = fakeCidEmbed();
        e.fontDict = fakeSimpleEmbed().fontDict;
        expect(() => builder().addPage().addFont({ name: 'F1', embedded: e }))
            .toThrow(RenderError);
    });

    test('composite embedded without cidFontDict throws', () => {
        const e = fakeCidEmbed();
        delete e.cidFontDict;
        expect(() => builder().addPage().addFont({ name: 'F1', embedded: e }))
            .toThrow(RenderError);
    });

    test('the error code is pdf/builder/bad-font', () => {
        try {
            builder().addPage().addFont({ name: 'F1', embedded: {} });
            throw new Error('expected a throw');
        } catch (err) {
            expect(err).toBeInstanceOf(RenderError);
            expect(err.code).toBe('pdf/builder/bad-font');
        }
    });

    test('addFont({ name, embedded }) is chainable', () => {
        const b = builder().addPage();
        expect(b.addFont({ name: 'F1', embedded: fakeSimpleEmbed() })).toBe(b);
    });
});

describe('pdfBuilder — embedded font, simple route', () => {
    test('allocates 3 indirects more than a legacy registration', () => {
        const legacy = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' }).build();
        const embedded = builder().addPage()
            .addFont({ name: 'F1', embedded: fakeSimpleEmbed() }).build();
        // legacy: page + font + catalog + pages = 4.
        expect(countIndirects(legacy)).toBe(4);
        // embedded: program + descriptor + ToUnicode + font dict = 4 for the
        // font itself, i.e. +3 over the single legacy font object.
        expect(countIndirects(embedded) - countIndirects(legacy)).toBe(3);
        expect(countIndirects(embedded)).toBe(7);
    });

    test('every indirect is wired: page → font → descriptor → FontFile2', () => {
        const e = fakeSimpleEmbed();
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e })
            .addContent('BT /F1 12 Tf 72 700 Td <4142> Tj ET')
            .build();
        const doc = readDocument(bytes);

        const res = deref(doc, doc.pages[0].resources);
        const fontRef = res.entries.Font.entries.F1;
        expect(fontRef.type).toBe('ref');

        const fontDict = deref(doc, fontRef);
        expect(fontDict.entries.Subtype.value).toBe('TrueType');
        expect(fontDict.entries.Encoding.value).toBe('WinAnsiEncoding');

        // /FontDescriptor and /ToUnicode are refs, never inline.
        expect(fontDict.entries.FontDescriptor.type).toBe('ref');
        expect(fontDict.entries.ToUnicode.type).toBe('ref');

        const desc = deref(doc, fontDict.entries.FontDescriptor);
        expect(desc.entries.FontName.value).toBe('ABCDEF+Fake');
        expect(desc.entries.FontFile2.type).toBe('ref');

        const program = deref(doc, desc.entries.FontFile2);
        expect(program.type).toBe('stream');
        expect(program.dict.entries.Length1.value).toBe(FAKE_PROGRAM.length);
        expect(program.dict.entries.Length.value).toBe(FAKE_PROGRAM.length);

        const toU = deref(doc, fontDict.entries.ToUnicode);
        expect(toU.type).toBe('stream');
        expect(toU.dict.entries.Length.value).toBe(FAKE_CMAP.length);
    });

    test('the caller-owned dicts are never mutated', () => {
        const e = fakeSimpleEmbed();
        const before = embedSnapshot(e);
        builder().addPage().addFont({ name: 'F1', embedded: e }).build();
        expect(embedSnapshot(e)).toBe(before);
        // The original still carries its INLINE descriptor / ToUnicode.
        expect(e.fontDict.entries.FontDescriptor.type).toBe('dict');
        expect(e.fontDict.entries.ToUnicode.type).toBe('stream');
        expect(e.descriptor.entries.FontFile2).toBeUndefined();
    });

    test('fontFileKey FontFile3 adds /Subtype /OpenType to the program stream', () => {
        const e = fakeSimpleEmbed('FontFile3');
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e }).build();
        const doc = readDocument(bytes);
        const fontDict = deref(doc, deref(doc, doc.pages[0].resources)
            .entries.Font.entries.F1);
        const desc = deref(doc, fontDict.entries.FontDescriptor);
        expect(desc.entries.FontFile2).toBeUndefined();
        expect(desc.entries.FontFile3.type).toBe('ref');
        const program = deref(doc, desc.entries.FontFile3);
        expect(program.dict.entries.Subtype.value).toBe('OpenType');
    });
});

describe('pdfBuilder — embedded font, composite route', () => {
    test('allocates 4 indirects more than a legacy registration', () => {
        const legacy = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' }).build();
        const embedded = builder().addPage()
            .addFont({ name: 'F1', embedded: fakeCidEmbed() }).build();
        expect(countIndirects(embedded) - countIndirects(legacy)).toBe(4);
        expect(countIndirects(embedded)).toBe(8);
    });

    test('Type0 → DescendantFonts ref → CIDFont → descriptor → FontFile2', () => {
        const e = fakeCidEmbed();
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: e }).build();
        const doc = readDocument(bytes);

        const fontDict = deref(doc, deref(doc, doc.pages[0].resources)
            .entries.Font.entries.F1);
        expect(fontDict.entries.Subtype.value).toBe('Type0');
        expect(fontDict.entries.Encoding.value).toBe('Identity-H');
        expect(fontDict.entries.ToUnicode.type).toBe('ref');

        const df = fontDict.entries.DescendantFonts;
        expect(df.type).toBe('array');
        expect(df.items.length).toBe(1);
        expect(df.items[0].type).toBe('ref');

        const cid = deref(doc, df.items[0]);
        expect(cid.entries.Subtype.value).toBe('CIDFontType2');
        expect(cid.entries.CIDToGIDMap.value).toBe('Identity');
        expect(cid.entries.FontDescriptor.type).toBe('ref');

        const desc = deref(doc, cid.entries.FontDescriptor);
        expect(desc.entries.FontFile2.type).toBe('ref');
        const program = deref(doc, desc.entries.FontFile2);
        expect(program.dict.entries.Length1.value).toBe(FAKE_PROGRAM.length);
    });

    test('the caller-owned dicts are never mutated', () => {
        const e = fakeCidEmbed();
        const before = embedSnapshot(e);
        builder().addPage().addFont({ name: 'F1', embedded: e }).build();
        expect(embedSnapshot(e)).toBe(before);
        expect(e.type0Dict.entries.DescendantFonts.items[0].type).toBe('dict');
        expect(e.cidFontDict.entries.FontDescriptor.type).toBe('dict');
    });
});

describe('pdfBuilder — embedded font identity cache', () => {
    test('one embed result over two pages is allocated once', () => {
        const e = fakeSimpleEmbed();
        const bytes = builder()
            .addPage().addFont({ name: 'F1', embedded: e })
            .addPage().addFont({ name: 'FA', embedded: e })
            .build();
        const doc = readDocument(bytes);

        const r0 = deref(doc, doc.pages[0].resources).entries.Font.entries.F1;
        const r1 = deref(doc, doc.pages[1].resources).entries.Font.entries.FA;
        expect(r0.num).toBe(r1.num);

        // 2 pages + 4 font indirects + catalog + pages = 8 (not 12).
        expect(countIndirects(bytes)).toBe(8);
        expect(td.decode(bytes).match(/\/Length1/g).length).toBe(1);
    });

    test('two distinct embed results are allocated separately', () => {
        const a = fakeSimpleEmbed();
        const b = fakeSimpleEmbed();
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: a })
            .addFont({ name: 'F2', embedded: b })
            .build();
        const doc = readDocument(bytes);
        const fonts = deref(doc, doc.pages[0].resources).entries.Font;
        expect(fonts.entries.F1.num).not.toBe(fonts.entries.F2.num);
        expect(td.decode(bytes).match(/\/Length1/g).length).toBe(2);
    });

    test('mixed legacy + embedded fonts coexist on one page', () => {
        const bytes = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
            .addFont({ name: 'F2', embedded: fakeCidEmbed() })
            .build();
        const doc = readDocument(bytes);
        const fonts = deref(doc, doc.pages[0].resources).entries.Font;
        expect(Object.keys(fonts.entries).sort()).toEqual(['F1', 'F2']);
        expect(deref(doc, fonts.entries.F1).entries.BaseFont.value).toBe('Helvetica');
        expect(deref(doc, fonts.entries.F2).entries.Subtype.value).toBe('Type0');
    });
});

describe('pdfBuilder — non-embedded font dictionary is shared per distinct triple', () => {
    const fontObjects = (bytes) =>
        (td.decode(bytes).match(/^\d+ 0 obj\n<<[^]*?endobj$/gm) || [])
            .filter((o) => /\/Type \/Font\b/.test(o));

    const fontRef = (doc, pageIndex, name) =>
        deref(doc, doc.pages[pageIndex].resources).entries.Font.entries[name];

    test('the same face registered on 3 pages is ONE object, referenced by all pages', () => {
        const b = builder();
        for (let i = 0; i < 3; i++) {
            b.addPage()
                .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
                .addContent('BT /F1 12 Tf (x) Tj ET');
        }
        const bytes = b.build();
        expect(fontObjects(bytes)).toHaveLength(1);

        const doc = readDocument(bytes);
        const refs = [0, 1, 2].map((i) => fontRef(doc, i, 'F1'));
        for (const r of refs) expect(r.type).toBe('ref');
        expect(refs[1].num).toBe(refs[0].num);
        expect(refs[2].num).toBe(refs[0].num);
        const dict = deref(doc, refs[0]);
        expect(dict.entries.BaseFont.value).toBe('Helvetica');
        expect(dict.entries.Encoding.value).toBe('WinAnsiEncoding');
    });

    test('an absent subtype and an explicit Type1 share', () => {
        const bytes = builder()
            .addPage().addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addPage().addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
            .build();
        expect(fontObjects(bytes)).toHaveLength(1);
    });

    test('a different subtype or a different encoding stays a distinct object', () => {
        const bytes = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addFont({ name: 'F2', baseFont: 'Helvetica', subtype: 'TrueType' })
            .addFont({ name: 'F3', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
            .addFont({ name: 'F4', baseFont: 'Helvetica', encoding: 'MacRomanEncoding' })
            .addFont({ name: 'F5', baseFont: 'Times-Roman' })
            .build();
        expect(fontObjects(bytes)).toHaveLength(5);
        const doc = readDocument(bytes);
        const nums = ['F1', 'F2', 'F3', 'F4', 'F5'].map((n) => fontRef(doc, 0, n).num);
        expect(new Set(nums).size).toBe(5);
    });

    test('one face under two resource names on one page: one object, two names', () => {
        const bytes = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addFont({ name: 'F2', baseFont: 'Helvetica' })
            .build();
        expect(fontObjects(bytes)).toHaveLength(1);
        const doc = readDocument(bytes);
        const fonts = deref(doc, doc.pages[0].resources).entries.Font;
        expect(Object.keys(fonts.entries).sort()).toEqual(['F1', 'F2']);
        expect(fonts.entries.F1.num).toBe(fonts.entries.F2.num);
    });

    test('the embedded route keeps its own counts alongside a shared legacy font', () => {
        const e = fakeSimpleEmbed();
        const bytes = builder()
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addFont({ name: 'F2', embedded: e })
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addFont({ name: 'F2', embedded: e })
            .build();
        // 2 pages + 1 shared legacy font + 4 embedded indirects
        // + catalog + pages = 9.
        expect(countIndirects(bytes)).toBe(9);
        expect(td.decode(bytes).match(/\/Length1/g).length).toBe(1);
    });

    test('the cache is per builder: a second builder does not see the first one\'s entries', () => {
        const a = builder().addPage().addFont({ name: 'F1', baseFont: 'Helvetica' }).build();
        const b = builder().addPage().addFont({ name: 'F1', baseFont: 'Helvetica' }).build();
        expect(fontObjects(a)).toHaveLength(1);
        expect(fontObjects(b)).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Image XObjects — `addImage` (office/BATCH_35 task 01, the seam BL-980 needs).
// The seam decodes nothing, so every fixture here is a synthetic byte array:
// what goes in must come back out byte-identical.
// ---------------------------------------------------------------------------

/**
 * 2x2 DeviceRGB, 8bpc. Deliberately carries CR (0x0D) and LF (0x0A) bytes and
 * a NUL: the stream must be recovered by /Length, never by scanning.
 */
const RGB_2X2 = Uint8Array.from([
    0xFF, 0x00, 0x00,  0x00, 0xFF, 0x00,
    0x0D, 0x0A, 0x00,  0x65, 0x6E, 0x64
]);

/** 2x2 DeviceGray, 8bpc — the soft-mask companion of RGB_2X2. */
const GRAY_2X2 = Uint8Array.from([0x00, 0x40, 0x80, 0xFF]);

function imageSpec(over) {
    return Object.assign({
        name:             'Im0',
        width:            2,
        height:           2,
        colorSpace:       'DeviceRGB',
        bitsPerComponent: 8,
        data:             RGB_2X2
    }, over || {});
}

function maskSpec(over) {
    return Object.assign({
        width:            2,
        height:           2,
        colorSpace:       'DeviceGray',
        bitsPerComponent: 8,
        data:             GRAY_2X2
    }, over || {});
}

function sameBytes(a, b) {
    if (!(a instanceof Uint8Array) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** `/Resources /XObject` of one page, already dereferenced. */
function xobjectsOf(doc, pageIndex) {
    const res = deref(doc, doc.pages[pageIndex || 0].resources);
    const x = res.entries.XObject;
    return x ? deref(doc, x) : null;
}

/** The stream behind `/Resources /XObject /<name>`. */
function imageOf(doc, name, pageIndex) {
    const dict = xobjectsOf(doc, pageIndex);
    return deref(doc, dict.entries[name]);
}

/** Assert a spec is rejected as `pdf/builder/bad-image` naming `key`. */
function expectBadImage(spec, key, label) {
    let thrown = null;
    try {
        builder().addPage().addImage(spec);
    } catch (err) { thrown = err; }
    expect(thrown, `${label || key} must be rejected`).toBeInstanceOf(RenderError);
    expect(thrown.code).toBe('pdf/builder/bad-image');
    if (key) expect(thrown.context.keys).toContain(key);
}

describe('pdfBuilder — addImage guards', () => {
    test('addImage before addPage throws pdf/builder/no-page', () => {
        let thrown = null;
        try { builder().addImage(imageSpec()); } catch (err) { thrown = err; }
        expect(thrown).toBeInstanceOf(RenderError);
        expect(thrown.code).toBe('pdf/builder/no-page');
    });

    test('a non-object spec throws bad-image', () => {
        for (const bad of [null, undefined, 'Im0', 42]) {
            let thrown = null;
            try { builder().addPage().addImage(bad); } catch (err) { thrown = err; }
            expect(thrown).toBeInstanceOf(RenderError);
            expect(thrown.code).toBe('pdf/builder/bad-image');
        }
    });

    test('name must be a non-empty string', () => {
        const noName = imageSpec();
        delete noName.name;
        expectBadImage(noName, 'name', 'missing name');
        expectBadImage(imageSpec({ name: '' }), 'name', 'empty name');
        expectBadImage(imageSpec({ name: 7 }), 'name', 'non-string name');
    });

    test('width must be a positive safe integer', () => {
        for (const w of [0, -1, 2.5, '2', undefined, NaN]) {
            expectBadImage(imageSpec({ width: w }), 'width', `width=${String(w)}`);
        }
    });

    test('height must be a positive safe integer', () => {
        for (const h of [0, -1, 2.5, '2', undefined, NaN]) {
            expectBadImage(imageSpec({ height: h }), 'height', `height=${String(h)}`);
        }
    });

    test('colorSpace must be a non-empty string', () => {
        expectBadImage(imageSpec({ colorSpace: '' }), 'colorSpace');
        expectBadImage(imageSpec({ colorSpace: undefined }), 'colorSpace');
    });

    test('bitsPerComponent must be a positive safe integer', () => {
        expectBadImage(imageSpec({ bitsPerComponent: 0 }), 'bitsPerComponent');
        expectBadImage(imageSpec({ bitsPerComponent: 8.5 }), 'bitsPerComponent');
    });

    test('data must be a Uint8Array', () => {
        expectBadImage(imageSpec({ data: [1, 2, 3] }), 'data');
        expectBadImage(imageSpec({ data: RGB_2X2.buffer }), 'data');
        expectBadImage(imageSpec({ data: undefined }), 'data');
    });

    test('filter, when given, must be a non-empty string', () => {
        expectBadImage(imageSpec({ filter: '' }), 'filter');
        expectBadImage(imageSpec({ filter: 3 }), 'filter');
    });

    test('decodeParms must be a typed dict', () => {
        expectBadImage(imageSpec({ decodeParms: { Predictor: 15 } }), 'decodeParms');
        expectBadImage(imageSpec({ decodeParms: obj.array([]) }), 'decodeParms');
    });

    test('a nested sMask is rejected', () => {
        const nested = imageSpec({ sMask: maskSpec({ sMask: maskSpec() }) });
        let thrown = null;
        try { builder().addPage().addImage(nested); } catch (err) { thrown = err; }
        expect(thrown).toBeInstanceOf(RenderError);
        expect(thrown.code).toBe('pdf/builder/bad-image');
        expect(thrown.context.keys).toContain('sMask');
        expect(thrown.context.sMask).toBe(true);
    });

    test('a malformed sMask is rejected on its own keys', () => {
        let thrown = null;
        try {
            builder().addPage().addImage(imageSpec({ sMask: maskSpec({ width: 0 }) }));
        } catch (err) { thrown = err; }
        expect(thrown).toBeInstanceOf(RenderError);
        expect(thrown.code).toBe('pdf/builder/bad-image');
        expect(thrown.context.keys).toContain('width');
        expect(thrown.context.sMask).toBe(true);
    });

    test('a rejected image allocates nothing', () => {
        const b = builder().addPage();
        expect(() => b.addImage(imageSpec({ width: 0 }))).toThrow(RenderError);
        const bytes = b.build();          // `build()` is single-use.
        const doc = readDocument(bytes);
        expect(deref(doc, doc.pages[0].resources).entries.XObject).toBeUndefined();
        // page + catalog + pages only.
        expect(countIndirects(bytes)).toBe(3);
    });
});

describe('pdfBuilder — addImage happy path', () => {
    test('the image lands in /Resources /XObject as an indirect stream', () => {
        const bytes = builder()
            .addPage({ mediaBox: [0, 0, 612, 792] })
            .addImage(imageSpec())
            .addContent('q 200 0 0 200 72 500 cm /Im0 Do Q')
            .build();

        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);

        const xo = xobjectsOf(doc, 0);
        expect(xo.type).toBe('dict');
        expect(Object.keys(xo.entries)).toEqual(['Im0']);
        expect(xo.entries.Im0.type).toBe('ref');

        const img = deref(doc, xo.entries.Im0);
        expect(img.type).toBe('stream');
        expect(img.dict.entries.Type.value).toBe('XObject');
        expect(img.dict.entries.Subtype.value).toBe('Image');
        expect(img.dict.entries.Width.value).toBe(2);
        expect(img.dict.entries.Height.value).toBe(2);
        expect(img.dict.entries.ColorSpace.value).toBe('DeviceRGB');
        expect(img.dict.entries.BitsPerComponent.value).toBe(8);
        expect(img.dict.entries.Length.value).toBe(RGB_2X2.length);
        // The bytes come back verbatim — nothing decoded, nothing re-encoded.
        expect(sameBytes(img.raw, RGB_2X2)).toBe(true);
    });

    test('addImage is chainable, exactly like addFont', () => {
        const b = builder().addPage();
        expect(b.addImage(imageSpec())).toBe(b);
    });

    test('filter omitted → no /Filter; given → /Filter /DCTDecode', () => {
        const plain = readDocument(
            builder().addPage().addImage(imageSpec()).build());
        expect(imageOf(plain, 'Im0').dict.entries.Filter).toBeUndefined();

        const jpeg = readDocument(builder().addPage()
            .addImage(imageSpec({ filter: 'DCTDecode' })).build());
        const d = imageOf(jpeg, 'Im0').dict.entries.Filter;
        expect(d.type).toBe('name');
        expect(d.value).toBe('DCTDecode');
    });

    test('decodeParms is passed through unchanged', () => {
        const parms = obj.dict({
            Predictor: obj.int(15),
            Colors:    obj.int(3),
            Columns:   obj.int(2)
        });
        const bytes = builder().addPage()
            .addImage(imageSpec({ filter: 'FlateDecode', decodeParms: parms }))
            .build();
        const dp = imageOf(readDocument(bytes), 'Im0').dict.entries.DecodeParms;
        expect(dp.type).toBe('dict');
        expect(dp.entries.Predictor.value).toBe(15);
        expect(dp.entries.Colors.value).toBe(3);
        expect(dp.entries.Columns.value).toBe(2);
        // The caller's typed dict is never mutated.
        expect(Object.keys(parms.entries).sort())
            .toEqual(['Colors', 'Columns', 'Predictor']);
    });

    test('no /DecodeParms and no /SMask when not asked for', () => {
        const img = imageOf(readDocument(
            builder().addPage().addImage(imageSpec()).build()), 'Im0');
        expect(img.dict.entries.DecodeParms).toBeUndefined();
        expect(img.dict.entries.SMask).toBeUndefined();
    });

    test('two images on one page → both named in /XObject', () => {
        const bytes = builder().addPage()
            .addImage(imageSpec({ name: 'Im0' }))
            .addImage(imageSpec({ name: 'Im1', colorSpace: 'DeviceGray',
                                  width: 2, height: 2, data: GRAY_2X2 }))
            .build();
        const doc = readDocument(bytes);
        const xo = xobjectsOf(doc, 0);
        expect(Object.keys(xo.entries).sort()).toEqual(['Im0', 'Im1']);
        expect(xo.entries.Im0.num).not.toBe(xo.entries.Im1.num);
        expect(sameBytes(imageOf(doc, 'Im1').raw, GRAY_2X2)).toBe(true);
    });

    test('two pages each name only their own image', () => {
        const bytes = builder()
            .addPage().addImage(imageSpec({ name: 'ImA' }))
            .addPage().addImage(imageSpec({ name: 'ImB' }))
            .build();
        const doc = readDocument(bytes);
        expect(Object.keys(xobjectsOf(doc, 0).entries)).toEqual(['ImA']);
        expect(Object.keys(xobjectsOf(doc, 1).entries)).toEqual(['ImB']);
    });

    test('a page with no image carries no /XObject at all', () => {
        const bytes = builder()
            .addPage().addImage(imageSpec())
            .addPage()
            .build();
        const doc = readDocument(bytes);
        expect(xobjectsOf(doc, 0)).toBeTruthy();
        expect(deref(doc, doc.pages[1].resources).entries.XObject).toBeUndefined();
    });
});

describe('pdfBuilder — addImage soft mask', () => {
    test('/SMask references its own XObject, not named in the page dict', () => {
        const bytes = builder().addPage()
            .addImage(imageSpec({ sMask: maskSpec() }))
            .build();
        const doc = readDocument(bytes);

        const xo = xobjectsOf(doc, 0);
        // The mask is referenced, never named.
        expect(Object.keys(xo.entries)).toEqual(['Im0']);

        const img = imageOf(doc, 'Im0');
        expect(img.dict.entries.SMask.type).toBe('ref');
        const mask = deref(doc, img.dict.entries.SMask);
        expect(mask.type).toBe('stream');
        expect(mask.dict.entries.Subtype.value).toBe('Image');
        expect(mask.dict.entries.ColorSpace.value).toBe('DeviceGray');
        expect(sameBytes(mask.raw, GRAY_2X2)).toBe(true);
        // Allocated FIRST: the mask's object number precedes the image's.
        expect(img.dict.entries.SMask.num).toBeLessThan(xo.entries.Im0.num);
    });

    test('a masked image costs one indirect more than an unmasked one', () => {
        const plain = builder().addPage().addImage(imageSpec()).build();
        const masked = builder().addPage()
            .addImage(imageSpec({ sMask: maskSpec() })).build();
        // page + image + catalog + pages = 4.
        expect(countIndirects(plain)).toBe(4);
        expect(countIndirects(masked) - countIndirects(plain)).toBe(1);
    });

    test('a mask may carry its own filter and decodeParms', () => {
        const bytes = builder().addPage().addImage(imageSpec({
            sMask: maskSpec({
                filter: 'FlateDecode',
                decodeParms: obj.dict({ Predictor: obj.int(12) })
            })
        })).build();
        const doc = readDocument(bytes);
        const mask = deref(doc, imageOf(doc, 'Im0').dict.entries.SMask);
        expect(mask.dict.entries.Filter.value).toBe('FlateDecode');
        expect(mask.dict.entries.DecodeParms.entries.Predictor.value).toBe(12);
    });
});

describe('pdfBuilder — addImage coexistence and passthrough', () => {
    test('a page with a font AND an image carries both /Font and /XObject', () => {
        const bytes = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
            .addImage(imageSpec())
            .addContent('BT /F1 12 Tf 72 700 Td (Hi) Tj ET '
                + 'q 200 0 0 200 72 400 cm /Im0 Do Q')
            .build();
        const doc = readDocument(bytes);
        const res = deref(doc, doc.pages[0].resources);

        const fonts = deref(doc, res.entries.Font);
        expect(Object.keys(fonts.entries)).toEqual(['F1']);
        expect(deref(doc, fonts.entries.F1).entries.BaseFont.value).toBe('Helvetica');

        const xo = deref(doc, res.entries.XObject);
        expect(Object.keys(xo.entries)).toEqual(['Im0']);
        expect(sameBytes(imageOf(doc, 'Im0').raw, RGB_2X2)).toBe(true);
    });

    test('an embedded font and an image coexist', () => {
        const bytes = builder().addPage()
            .addFont({ name: 'F1', embedded: fakeCidEmbed() })
            .addImage(imageSpec())
            .build();
        const doc = readDocument(bytes);
        const res = deref(doc, doc.pages[0].resources);
        const font = deref(doc, deref(doc, res.entries.Font).entries.F1);
        expect(font.entries.Subtype.value).toBe('Type0');
        expect(deref(doc, res.entries.XObject).entries.Im0.type).toBe('ref');
    });

    // MEASURED RULE (pre-existing, unchanged): `buildPageObject` merges
    // `extraResources` with `if (!resEntries[k])`, so a resource class the
    // builder itself produced WINS and the caller's same-named entry is
    // dropped. The control legs below pin that this is exactly how /Font
    // already behaves.
    test('a built /XObject wins over a caller-supplied one (like /Font)', () => {
        const decoy = obj.dict({ Decoy: obj.ref(9999, 0) });
        const bytes = builder()
            .addPage({ resources: obj.dict({ XObject: decoy }) })
            .addImage(imageSpec())
            .build();
        const xo = xobjectsOf(readDocument(bytes), 0);
        expect(Object.keys(xo.entries)).toEqual(['Im0']);
        expect(xo.entries.Decoy).toBeUndefined();
    });

    test('control — a built /Font wins over a caller-supplied one', () => {
        const decoy = obj.dict({ Decoy: obj.ref(9999, 0) });
        const bytes = builder()
            .addPage({ resources: obj.dict({ Font: decoy }) })
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .build();
        const doc = readDocument(bytes);
        const res = deref(doc, doc.pages[0].resources);
        expect(Object.keys(deref(doc, res.entries.Font).entries)).toEqual(['F1']);
    });

    test('with no addImage on the page, the caller /XObject passes through', () => {
        const bytes = builder()
            .addPage({ resources: obj.dict({
                XObject: obj.dict({ Mine: obj.ref(1, 0) })
            }) })
            .addContent('q Q')
            .build();
        const xo = xobjectsOf(readDocument(bytes), 0);
        expect(Object.keys(xo.entries)).toEqual(['Mine']);
    });

    test('other caller resource classes still merge alongside /XObject', () => {
        const bytes = builder()
            .addPage({ resources: obj.dict({
                ProcSet: obj.array([obj.name('PDF'), obj.name('ImageC')])
            }) })
            .addImage(imageSpec())
            .build();
        const doc = readDocument(bytes);
        const res = deref(doc, doc.pages[0].resources);
        expect(res.entries.ProcSet.type).toBe('array');
        expect(res.entries.ProcSet.items.map(i => i.value))
            .toEqual(['PDF', 'ImageC']);
        expect(Object.keys(deref(doc, res.entries.XObject).entries))
            .toEqual(['Im0']);
    });
});

describe('pdfBuilder — addImage determinism', () => {
    const buildTwice = () => builder()
        .setVersion('2.0')
        .addPage({ mediaBox: [0, 0, 612, 792] })
        .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
        .addImage(imageSpec({ filter: 'DCTDecode', sMask: maskSpec() }))
        .addContent('q 200 0 0 200 72 500 cm /Im0 Do Q')
        .addMetadata({ Title: 'Img', Producer: 'awa/pdf' })
        .setId('0123456789ABCDEF0123456789ABCDEF')
        .build();

    test('building the same document twice is byte-identical', async () => {
        const a = buildTwice();
        const b = buildTwice();
        expect(a.length).toBe(b.length);
        expect(await sha256Hex(a)).toBe(await sha256Hex(b));
    });
});

describe('pdfBuilder — full e2e example', () => {
    test('builds a Hello World PDF', () => {
        const bytes = builder()
            .setVersion('2.0')
            .addPage({ mediaBox: [0, 0, 612, 792] })
            .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
            .addContent('BT /F1 12 Tf 100 700 Td (Hello world) Tj ET')
            .addMetadata({ Title: 'Hello', Author: 'awa', Producer: 'awa/pdf' })
            .build();

        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);
        expect(doc.pages[0].contents.length).toBe(1);
        expect(doc.pages[0].resources.entries.Font.entries.F1).toBeTruthy();
        expect(doc.trailer.raw.entries.Info).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Standard-14 `/Encoding` on `addFont` (office/BATCH_51 task 02, BL-1241 pdf
// side). Absent `encoding` is covered byte-for-byte by the LEGACY_PIN block
// above (sha256 of two documents built through the legacy shape).
// ---------------------------------------------------------------------------

describe('pdfBuilder — addFont encoding (Standard-14 /Encoding)', () => {
    function fontDictOf(bytes, name = 'F1') {
        const doc = readDocument(bytes);
        const res = deref(doc, doc.pages[0].resources);
        return deref(doc, res.entries.Font.entries[name]);
    }

    for (const enc of ['WinAnsiEncoding', 'MacRomanEncoding', 'StandardEncoding']) {
        test(`${enc} is emitted as /Encoding /${enc}`, () => {
            const bytes = builder().addPage()
                .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: enc })
                .build();
            const text = td.decode(bytes);
            expect(text).toContain(
                `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /${enc} >>`);
            const fd = fontDictOf(bytes);
            expect(fd.entries.Encoding.type).toBe('name');
            expect(fd.entries.Encoding.value).toBe(enc);
        });
    }

    test('key order: existing keys first, Encoding last', () => {
        const fd = fontDictOf(builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Times-Roman', subtype: 'TrueType',
                encoding: 'WinAnsiEncoding' }).build());
        expect(Object.keys(fd.entries))
            .toEqual(['Type', 'Subtype', 'BaseFont', 'Encoding']);
        expect(fd.entries.Subtype.value).toBe('TrueType');
    });

    test('absent (or undefined) encoding emits no /Encoding key and the same bytes', () => {
        const mk = (extra) => builder().setVersion('2.0').addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica', ...extra })
            .setId('0123456789ABCDEF0123456789ABCDEF')
            .build();
        const plain = mk({});
        const undef = mk({ encoding: undefined });
        expect(td.decode(plain)).not.toContain('/Encoding');
        expect(sameBytes(plain, undef)).toBe(true);
        // The encoded variant differs from the plain one by exactly the
        // inserted key (plus the shifted xref offsets downstream).
        const enc = td.decode(mk({ encoding: 'WinAnsiEncoding' }));
        expect(enc).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    });

    test('invalid encoding throws bad-font with { name, encoding } context', () => {
        for (const bad of ['MacExpertEncoding', 'winansiencoding', '', null, 7, {}]) {
            let err;
            try {
                builder().addPage().addFont({ name: 'F9', baseFont: 'Helvetica', encoding: bad });
            } catch (e) { err = e; }
            expect(err).toBeInstanceOf(RenderError);
            expect(err.code).toBe('pdf/builder/bad-font');
            expect(err.context.name).toBe('F9');
            expect(err.context.encoding).toBe(bad);
        }
    });

    test('encoding together with embedded throws bad-font', () => {
        let err;
        try {
            builder().addPage().addFont({
                name: 'F1', embedded: fakeSimpleEmbed(), encoding: 'WinAnsiEncoding'
            });
        } catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('pdf/builder/bad-font');
        expect(err.context).toEqual({ name: 'F1', encoding: 'WinAnsiEncoding' });
    });

    test('read-back: typeFont exposes /Encoding /WinAnsiEncoding; Tj keeps the 0x97 byte', () => {
        // BL-1241 measured case: 0x97 is EM DASH (U+2014) under WinAnsi. The
        // text extractor that maps the byte to a code point lives in
        // `@awacloud/oconv`, outside this package, so this asserts the two
        // halves that are pdf's: the font dict carries the encoding, and the
        // content stream carries the raw byte.
        const content = new Uint8Array([
            ...new TextEncoder().encode('BT /F1 12 Tf 72 700 Td ('),
            0x61, 0x97, 0x62,
            ...new TextEncoder().encode(') Tj ET')
        ]);
        const bytes = builder().addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' })
            .addContent(content)
            .build();
        const font = typeFont(fontDictOf(bytes));
        expect(font.baseFont).toBe('Helvetica');
        expect(font.encoding.type).toBe('name');
        expect(font.encoding.value).toBe('WinAnsiEncoding');
        // Byte-level search: a latin1 TextDecoder maps 0x97 to U+2014 here.
        const tail = Array.from(bytes);
        const at = tail.indexOf(0x97);
        expect(at).toBeGreaterThan(0);
        expect(tail[at - 1]).toBe(0x61);
        expect(tail[at + 1]).toBe(0x62);
    });
});
