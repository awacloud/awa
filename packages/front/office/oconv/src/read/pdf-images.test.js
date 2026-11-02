// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The pdf reader's pictures under the opt-in `include: ['images']`
 * (`toMd`'s `pdfInclude`): a JPEG or JPX image XObject placed as an IR
 * `image` at its place in the flow, its bytes in `escapes.pdf`; every other
 * picture still `image/dropped`; the writers reading `escapes.pdf`.
 */
/* global Bun */
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { readPng } from '../../tests/_fixtures/png-reader.js';

const ASSET_DIR = fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/', import.meta.url));
const PX_JPEG = new Uint8Array(readFileSync(`${ASSET_DIR}px.jpg`));
// A JP2 file starts with its signature box (ISO/IEC 15444-1 I.5.1); the
// reader checks the box, never decodes the codestream.
const JP2 = new Uint8Array([0, 0, 0, 12, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A,
    0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x6A, 0x70, 0x32, 0x20, 0, 0, 0, 0, 0x6A, 0x70, 0x32, 0x20]);
// A raw JPEG 2000 codestream (SOC, SIZ): no JP2 box, so not a `.jp2` file.
const J2C = new Uint8Array([0xFF, 0x4F, 0xFF, 0x51, 0, 0x29, 0, 0]);
const FIXED_AT = '2026-10-26T00:00:00Z';

let oconvApi;
let pdfApi;
let obj;
let dispatch;
let pdfToIr;
let extractPage;
let validate;
let irToMd;
let irToDocx;
let irToOdt;
let irToPdf;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    oconvApi = rt.resolve('oconv');
    pdfApi = rt.resolve('pdf');
    obj = rt.resolve('pdfParser').obj;
    dispatch = rt.resolve('pdfFilterDispatch');
    ({ pdfToIr } = rt.resolve('oconvPdfToIr'));
    ({ extractPage } = rt.resolve('oconvPdfTextExtract'));
    ({ validate } = rt.resolve('oconvIr'));
    ({ irToMd } = rt.resolve('oconvIrToMd'));
    ({ irToDocx } = rt.resolve('oconvIrToDocx'));
    ({ irToOdt } = rt.resolve('oconvIrToOdt'));
    ({ irToPdf } = rt.resolve('oconvIrToPdf'));
});

const enc = (s) => new TextEncoder().encode(s);
const text = (y, s, size = 12) => `BT /F1 ${size} Tf 72 ${y} Td (${s}) Tj ET\n`;
const DRAW = 'q 100 0 0 100 72 500 cm /Im1 Do Q\n';

/** An image XObject stream: `entries` merged over a 1 × 1 DeviceGray picture. */
function image(bytes, entries = {}) {
    return obj.stream(obj.dict({
        Type: obj.name('XObject'), Subtype: obj.name('Image'),
        Width: obj.int(1), Height: obj.int(1),
        ColorSpace: obj.name('DeviceGray'), BitsPerComponent: obj.int(8),
        Length: obj.int(bytes.length), ...entries
    }), bytes);
}
const dct = (entries = {}) => image(PX_JPEG, { Filter: obj.name('DCTDecode'), ...entries });

/**
 * One page drawing `content` with Helvetica `/F1`; `xobjects` maps a
 * resource name to `{ num, value, gen? }` (each written as its own object);
 * `extra` adds objects; `catalog` adds catalog entries.
 */
function genPdf(content, xobjects = {}, { extra = [], catalog = {} } = {}) {
    const xo = {};
    const indirects = [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0), ...catalog }) },
        { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
        { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) }
    ];
    for (const [name, x] of Object.entries(xobjects)) {
        xo[name] = obj.ref(x.num, x.gen || 0);
        indirects.push({ num: x.num, gen: x.gen || 0, value: x.value });
    }
    const res = { Font: obj.dict({ F1: obj.ref(5, 0) }) };
    if (Object.keys(xo).length) res.XObject = obj.dict(xo);
    indirects.push({ num: 3, gen: 0, value: obj.dict({
        Type: obj.name('Page'), Parent: obj.ref(2, 0),
        MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
        Contents: obj.ref(4, 0), Resources: obj.dict(res)
    }) });
    indirects.push(...extra);
    return pdfApi.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
}

/** Text, a picture `/Im1`, text: the untagged case. */
function between(xobject, draw = DRAW) {
    return genPdf(text(720, 'Before the picture.') + draw + text(300, 'After the picture.'), { Im1: { num: 7, ...xobject } });
}

const read = (bytes, opts) => pdfToIr(pdfApi.read(bytes), opts);
const IMAGES = { include: ['images'] };
const kinds = (ir) => ir.children.map((n) => n.kind);

describe('oconvPdfToIr — include: images, the untagged path', () => {
    test('a JPEG XObject becomes an IR image between the paragraphs, its bytes in escapes.pdf', () => {
        const { ir, losses } = read(between({ value: dct() }), IMAGES);
        expect(validate(ir).ok).toBe(true);
        expect(kinds(ir)).toEqual(['paragraph', 'image', 'paragraph']);
        const img = ir.children[1];
        expect(img.name).toBe('image-7.jpg');
        expect(img.alt).toBe('');
        expect(img.escapes.pdf.contentType).toBe('image/jpeg');
        expect(Bun.deepEquals(img.escapes.pdf.bytes, PX_JPEG)).toBe(true);
        expect(losses).toEqual([]);
    });

    test('without the option the picture is dropped as before', () => {
        for (const opts of [undefined, {}, { include: [] }]) {
            const { ir, losses } = read(between({ value: dct() }), opts);
            expect(kinds(ir)).toEqual(['paragraph', 'paragraph']);
            expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' }]);
        }
    });

    test('a FlateDecode then DCTDecode chain is decoded down to the JPEG', () => {
        const flated = dispatch.encodeChain(PX_JPEG, ['FlateDecode']);
        const xo = image(flated, { Filter: obj.array([obj.name('FlateDecode'), obj.name('DCTDecode')]) });
        const { ir, losses } = read(between({ value: xo }), IMAGES);
        expect(losses).toEqual([]);
        expect(Bun.deepEquals(ir.children[1].escapes.pdf.bytes, PX_JPEG)).toBe(true);
    });

    test('the abbreviated filter name reads alike, and the generation names the asset', () => {
        const xo = image(PX_JPEG, { Filter: obj.name('DCT') });
        const { ir } = read(between({ value: xo, gen: 2 }), IMAGES);
        expect(ir.children[1].name).toBe('image-7-2.jpg');
    });

    test('a JP2 file is passed through as image/jp2', () => {
        const xo = image(JP2, { Filter: obj.name('JPXDecode') });
        const { ir, losses } = read(between({ value: xo }), IMAGES);
        expect(losses).toEqual([]);
        expect(ir.children[1].name).toBe('image-7.jp2');
        expect(ir.children[1].escapes.pdf.contentType).toBe('image/jp2');
        expect(Bun.deepEquals(ir.children[1].escapes.pdf.bytes, JP2)).toBe(true);
    });

    test('a soft-masked or colour-key-masked JPEG is placed, its mask recorded as dropped', () => {
        const masks = [
            { SMask: obj.ref(8, 0) },
            { Mask: obj.array([obj.int(0), obj.int(10)]) }
        ];
        for (const m of masks) {
            const bytes = genPdf(text(720, 'Masked.') + DRAW, { Im1: { num: 7, value: dct(m) } },
                { extra: [{ num: 8, gen: 0, value: image(new Uint8Array([255])) }] });
            const { ir, losses } = read(bytes, IMAGES);
            expect(kinds(ir)).toEqual(['paragraph', 'image']);
            expect(losses).toEqual([{ code: 'image/mask-dropped', detail: 'image-7.jpg' }]);
        }
    });

    test('every other picture keeps image/dropped and no IR image', () => {
        const cases = [
            image(new Uint8Array([0, 0, 0, 0]), { ColorSpace: obj.name('DeviceCMYK') }),
            dct({ ImageMask: obj.bool(true) }),
            dct({ Decode: obj.array([obj.int(1), obj.int(0)]) }),
            image(PX_JPEG, { Filter: obj.array([obj.name('DCTDecode'), obj.name('FlateDecode')]) }),
            image(J2C, { Filter: obj.name('JPXDecode') }),
            image(new Uint8Array([1, 2, 3]), { Filter: obj.name('DCTDecode') })
        ];
        for (const xo of cases) {
            const { ir, losses } = read(between({ value: xo }), IMAGES);
            expect(kinds(ir)).toEqual(['paragraph', 'paragraph']);
            expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' }]);
        }
    });

    test('an inline image stays dropped', () => {
        const inline = 'q 10 0 0 10 72 500 cm BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI Q\n';
        const { ir, losses } = read(genPdf(text(720, 'Inline.') + inline), IMAGES);
        expect(kinds(ir)).toEqual(['paragraph']);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'inline (1x1)' }]);
    });

    test('a default Decode array is accepted', () => {
        const xo = dct({ Decode: obj.array([obj.int(0), obj.int(1)]) });
        expect(kinds(read(between({ value: xo }), IMAGES).ir)).toEqual(['paragraph', 'image', 'paragraph']);
    });

    test('a picture drawn inside a form is placed', () => {
        const formContent = '/Im1 Do\n';
        const form = obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(1), obj.int(1)]),
            Resources: obj.dict({ XObject: obj.dict({ Im1: obj.ref(7, 0) }) }),
            Length: obj.int(formContent.length)
        }), enc(formContent));
        const bytes = genPdf(text(720, 'Before.') + 'q 100 0 0 100 72 500 cm /Fm1 Do Q\n' + text(300, 'After.'),
            { Fm1: { num: 9, value: form } }, { extra: [{ num: 7, gen: 0, value: dct() }] });
        const { ir, losses } = read(bytes, IMAGES);
        expect(kinds(ir)).toEqual(['paragraph', 'image', 'paragraph']);
        expect(ir.children[1].name).toBe('image-7.jpg');
        expect(losses).toEqual([]);
    });

    test('a picture drawn twice is placed twice, listed once in the md assets', () => {
        const bytes = genPdf(text(720, 'One.') + DRAW + text(500, 'Two.') + DRAW, { Im1: { num: 7, value: dct() } });
        const { ir } = read(bytes, IMAGES);
        expect(kinds(ir)).toEqual(['paragraph', 'image', 'paragraph', 'image']);
        const md = irToMd(ir, { sourceFormat: 'pdf', convertedAt: FIXED_AT, losses: [] }, { frontMatter: 'none' });
        expect(md.assets.length).toBe(1);
        expect(md.assets[0].name).toBe('image-7.jpg');
        expect(Bun.deepEquals(md.assets[0].bytes, PX_JPEG)).toBe(true);
    });

    test('under pdfInfer the picture stands between a heading and a table', () => {
        const content = text(740, 'Big Title', 24) + text(700, 'Body text that sets the body size here.')
            + DRAW
            + 'BT /F1 12 Tf 72 300 Td (Name) Tj 200 0 Td (Qty) Tj ET\n'
            + 'BT /F1 12 Tf 72 285 Td (Apple) Tj 200 0 Td (3) Tj ET\n';
        const { ir } = read(genPdf(content, { Im1: { num: 7, value: dct() } }),
            { include: ['images'], infer: ['headings', 'tables'] });
        expect(kinds(ir)).toEqual(['heading', 'paragraph', 'image', 'table']);
    });

    test('the extraction carries the placeable picture on its item, with no loss', () => {
        const doc = pdfApi.read(between({ value: dct({ SMask: obj.ref(8, 0) }) }));
        const ex = extractPage(doc.pages[0], doc._raw.resolve, { images: true });
        const img = ex.items.find((it) => it.kind === 'image');
        expect(img.name).toBe('image-7.jpg');
        expect(img.resource).toBe('Im1');
        expect(img.contentType).toBe('image/jpeg');
        expect(img.masked).toBe(true);
        expect(ex.losses).toEqual([]);
        const plain = extractPage(doc.pages[0], doc._raw.resolve);
        expect(plain.items.find((it) => it.kind === 'image')).toEqual({ kind: 'image', mcid: null });
    });
});

describe('oconvPdfToIr — include: images, the tagged path', () => {
    /** A Figure (mcid 0, the picture) then a P (mcid 1, text); `figure` false leaves the picture unlisted. */
    function tagged(figure = true) {
        const content = '/Figure <</MCID 0>> BDC ' + DRAW + 'EMC\n'
            + '/P <</MCID 1>> BDC ' + text(300, 'Caption text.') + 'EMC\n';
        const kids = [obj.ref(12, 0)];
        if (figure) kids.unshift(obj.ref(11, 0));
        return genPdf(content, { Im1: { num: 7, value: dct() } }, {
            catalog: { StructTreeRoot: obj.ref(10, 0), MarkInfo: obj.dict({ Marked: obj.bool(true) }) },
            extra: [
                { num: 10, gen: 0, value: obj.dict({ Type: obj.name('StructTreeRoot'), K: obj.array(kids) }) },
                { num: 11, gen: 0, value: obj.dict({ Type: obj.name('StructElem'), S: obj.name('Figure'), P: obj.ref(10, 0), Pg: obj.ref(3, 0), K: obj.int(0) }) },
                { num: 12, gen: 0, value: obj.dict({ Type: obj.name('StructElem'), S: obj.name('P'), P: obj.ref(10, 0), Pg: obj.ref(3, 0), K: obj.int(1) }) }
            ]
        });
    }

    test('a Figure listing the picture places it in reading order', () => {
        const { ir, losses, coverage } = read(tagged(), IMAGES);
        expect(coverage.tagged).toBe(true);
        expect(kinds(ir)).toEqual(['image', 'paragraph']);
        expect(losses).toEqual([]);
    });

    test('a picture no struct element lists is dropped', () => {
        const { ir, losses } = read(tagged(false), IMAGES);
        expect(kinds(ir)).toEqual(['paragraph']);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' }]);
    });

    test('without the option the Figure places nothing', () => {
        const { ir, losses } = read(tagged());
        expect(kinds(ir)).toEqual(['paragraph']);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' }]);
    });
});

describe('oconvPdfToIr — include validation', () => {
    test('anything but a list of distinct known names throws oconv: bad pdf include', () => {
        const bytes = between({ value: dct() });
        for (const include of ['images', ['images', 'images'], ['tables'], [1], null]) {
            expect(() => read(bytes, { include })).toThrow('oconv: bad pdf include');
        }
    });
});

describe('oconv.toMd — pdfInclude', () => {
    test("pdfInclude: ['images'] writes the picture and returns its bytes as an asset", async () => {
        const r = await oconvApi.toMd({ name: 'p.pdf', bytes: between({ value: dct() }), convertedAt: FIXED_AT, pdfInclude: ['images'] });
        expect(r.markdown).toContain('](image-7.jpg)');
        expect(r.assets.length).toBe(1);
        expect(r.assets[0]).toMatchObject({ kind: 'image', name: 'image-7.jpg' });
        expect(Bun.deepEquals(r.assets[0].bytes, PX_JPEG)).toBe(true);
        expect(r.losses).toEqual([]);
    });

    test('without it, or with [], the markdown is byte-identical to today', async () => {
        const bytes = between({ value: dct() });
        const without = await oconvApi.toMd({ name: 'p.pdf', bytes, convertedAt: FIXED_AT });
        expect(without.assets).toEqual([]);
        const empty = await oconvApi.toMd({ name: 'p.pdf', bytes, convertedAt: FIXED_AT, pdfInclude: [] });
        expect(empty.markdown).toBe(without.markdown);
    });

    test('throws oconv: pdf include needs format pdf for another source', async () => {
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: new Uint8Array([1]), convertedAt: FIXED_AT, pdfInclude: ['images'] }))
            .rejects.toThrow('oconv: pdf include needs format pdf');
    });

    test('a bad value on a pdf call is refused (oconv: bad pdf include)', async () => {
        await expect(oconvApi.toMd({ name: 'p.pdf', bytes: between({ value: dct() }), convertedAt: FIXED_AT, pdfInclude: 'images' }))
            .rejects.toThrow('oconv: bad pdf include');
    });
});

describe('the writers read escapes.pdf', () => {
    test('docx and odt carry the picture, the pdf writer places it', async () => {
        const { ir } = read(between({ value: dct() }), IMAGES);
        const docx = irToDocx(ir, {});
        expect(docx.losses.map((l) => l.code)).not.toContain('image/dropped');
        const back = await oconvApi.toMd({ name: 'b.docx', bytes: docx.bytes, convertedAt: FIXED_AT });
        expect(back.assets.some((a) => a.bytes && Bun.deepEquals(a.bytes, PX_JPEG))).toBe(true);
        const odt = irToOdt(ir, {});
        expect(odt.losses.map((l) => l.code)).not.toContain('image/dropped');
        const pdf = irToPdf(ir, undefined, {});
        expect(pdf.losses.map((l) => l.code).filter((c) => c.startsWith('image/'))).toEqual([]);
    });
});

describe('oconvPdfToIr — include: images, raw pixels written as PNG', () => {
    const raw = (bytes, entries = {}) => image(new Uint8Array(bytes), entries);
    const rgb = (w, h, bytes, entries = {}) => raw(bytes, { Width: obj.int(w), Height: obj.int(h), ColorSpace: obj.name('DeviceRGB'), ...entries });
    const grey = (w, h, bytes, entries = {}) => raw(bytes, { Width: obj.int(w), Height: obj.int(h), ...entries });
    /** The placed picture's PNG, read back, and the read's losses. */
    function placedPng(xobject, extra = []) {
        const bytes = genPdf(text(720, 'Pixels.') + DRAW, { Im1: { num: 7, value: xobject } }, { extra });
        const { ir, losses } = read(bytes, IMAGES);
        const img = ir.children.find((n) => n.kind === 'image');
        return { img, losses, png: img ? readPng(img.escapes.pdf.bytes) : null };
    }
    const smask = (w, h, bytes, entries = {}) => [{ num: 8, gen: 0, value: grey(w, h, bytes, entries) }];
    const pixels = (png) => png.rows.map((r) => [...r]);

    test('DeviceRGB with a same-size soft mask becomes RGBA', () => {
        const { img, losses, png } = placedPng(rgb(2, 1, [255, 0, 0, 0, 0, 255], { SMask: obj.ref(8, 0) }), smask(2, 1, [255, 0]));
        expect(img.name).toBe('image-7.png');
        expect(img.escapes.pdf.contentType).toBe('image/png');
        expect(losses).toEqual([]);
        expect(png).toMatchObject({ width: 2, height: 1, bitDepth: 8, colorType: 6 });
        expect(pixels(png)).toEqual([[255, 0, 0, 255, 0, 0, 255, 0]]);
    });

    test('a Flate stream with a PNG predictor decodes to the samples', () => {
        // Row 1 filter None, row 2 filter Sub (each byte minus the one 3 bytes left).
        const rows = [0, 10, 20, 30, 40, 50, 60, 1, 5, 5, 5, 2, 2, 2];
        const flated = dispatch.encodeChain(new Uint8Array(rows), ['FlateDecode']);
        const xo = rgb(2, 2, [...flated], {
            Filter: obj.name('FlateDecode'),
            DecodeParms: obj.dict({ Predictor: obj.int(15), Colors: obj.int(3), BitsPerComponent: obj.int(8), Columns: obj.int(2) })
        });
        const { png, losses } = placedPng(xo);
        expect(losses).toEqual([]);
        expect(png.colorType).toBe(2);
        expect(pixels(png)).toEqual([[10, 20, 30, 40, 50, 60], [5, 5, 5, 7, 7, 7]]);
    });

    test('Indexed on DeviceRGB with a soft mask becomes RGBA from the palette', () => {
        const cs = obj.array([obj.name('Indexed'), obj.name('DeviceRGB'), obj.int(1), obj.string(new Uint8Array([1, 2, 3, 4, 5, 6]))]);
        const { png } = placedPng(grey(2, 1, [1, 0], { ColorSpace: cs, SMask: obj.ref(8, 0) }), smask(2, 1, [128, 255]));
        expect(png.colorType).toBe(6);
        expect(pixels(png)).toEqual([[4, 5, 6, 128, 1, 2, 3, 255]]);
    });

    test('Indexed on DeviceGray without a mask stays a palette, the grey replicated', () => {
        const cs = obj.array([obj.name('Indexed'), obj.name('DeviceGray'), obj.int(1), obj.string(new Uint8Array([0, 200]))]);
        const { png } = placedPng(grey(2, 1, [1, 0], { ColorSpace: cs }));
        expect(png.colorType).toBe(3);
        expect([...png.palette]).toEqual([0, 0, 0, 200, 200, 200]);
        expect(pixels(png)).toEqual([[1, 0]]);
    });

    test('Indexed with Decode [1 0] inverts the index', () => {
        const cs = obj.array([obj.name('Indexed'), obj.name('DeviceRGB'), obj.int(1), obj.string(new Uint8Array([1, 2, 3, 4, 5, 6]))]);
        const { png } = placedPng(grey(2, 1, [0b10000000], { ColorSpace: cs, BitsPerComponent: obj.int(1), Decode: obj.array([obj.int(1), obj.int(0)]) }));
        expect(png).toMatchObject({ bitDepth: 1, colorType: 3 });
        expect(pixels(png)[0][0] & 0b11000000).toBe(0b01000000);
    });

    test('ICCBased N 3 keeps its samples and carries the profile; an Indexed base on it too', () => {
        const profile = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const icc = { num: 9, gen: 0, value: obj.stream(obj.dict({ N: obj.int(3), Length: obj.int(profile.length) }), profile) };
        const direct = placedPng(rgb(1, 1, [9, 8, 7], { ColorSpace: obj.array([obj.name('ICCBased'), obj.ref(9, 0)]) }), [icc]);
        expect(direct.png.colorType).toBe(2);
        expect([...direct.png.icc]).toEqual([...profile]);
        expect(pixels(direct.png)).toEqual([[9, 8, 7]]);
        const cs = obj.array([obj.name('Indexed'), obj.array([obj.name('ICCBased'), obj.ref(9, 0)]), obj.int(0), obj.string(new Uint8Array([10, 20, 30]))]);
        const indexed = placedPng(grey(1, 1, [0], { ColorSpace: cs }), [icc]);
        expect(indexed.png.colorType).toBe(3);
        expect([...indexed.png.icc]).toEqual([...profile]);
        expect([...indexed.png.palette]).toEqual([10, 20, 30]);
    });

    test('DeviceGray 1-bit with Decode [1 0] is inverted', () => {
        const { png } = placedPng(grey(3, 1, [0b10100000], { BitsPerComponent: obj.int(1), Decode: obj.array([obj.int(1), obj.int(0)]) }));
        expect(png).toMatchObject({ bitDepth: 1, colorType: 0 });
        expect(pixels(png)[0][0] & 0b11100000).toBe(0b01000000);
    });

    test('a colour-key mask makes the pixels in its ranges transparent', () => {
        const xo = rgb(2, 1, [0, 0, 0, 255, 0, 0], { Mask: obj.array([0, 0, 0, 0, 0, 0].map((v) => obj.int(v))) });
        const { png, losses } = placedPng(xo);
        expect(losses).toEqual([]);
        expect(pixels(png)).toEqual([[0, 0, 0, 0, 255, 0, 0, 255]]);
    });

    test('DeviceRGB 4-bit is widened to 8', () => {
        const { png } = placedPng(rgb(1, 1, [0xF8, 0x00], { BitsPerComponent: obj.int(4) }));
        expect(png).toMatchObject({ bitDepth: 8, colorType: 2 });
        expect(pixels(png)).toEqual([[255, 136, 0]]);
    });

    test('16-bit grey with an 8-bit soft mask becomes 16-bit grey + alpha', () => {
        const { png } = placedPng(grey(1, 1, [0x12, 0x34], { BitsPerComponent: obj.int(16), SMask: obj.ref(8, 0) }), smask(1, 1, [255]));
        expect(png).toMatchObject({ bitDepth: 16, colorType: 4 });
        expect(pixels(png)).toEqual([[0x12, 0x34, 0xFF, 0xFF]]);
    });

    test('a stencil mask, a soft mask of another size or with Matte: placed without alpha, recorded', () => {
        const cases = [
            [rgb(1, 1, [1, 2, 3], { Mask: obj.ref(8, 0) }), [{ num: 8, gen: 0, value: grey(1, 1, [0], { ImageMask: obj.bool(true), BitsPerComponent: obj.int(1) }) }]],
            [rgb(1, 1, [1, 2, 3], { SMask: obj.ref(8, 0) }), smask(2, 1, [0, 0])],
            [rgb(1, 1, [1, 2, 3], { SMask: obj.ref(8, 0) }), smask(1, 1, [0], { Matte: obj.array([obj.int(0), obj.int(0), obj.int(0)]) })]
        ];
        for (const [xo, extra] of cases) {
            const { png, losses } = placedPng(xo, extra);
            expect(png.colorType).toBe(2);
            expect(losses).toEqual([{ code: 'image/mask-dropped', detail: 'image-7.png' }]);
        }
    });

    test('a short stream stays dropped', () => {
        const { img, losses } = placedPng(rgb(2, 2, [1, 2, 3]));
        expect(img).toBeUndefined();
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 2x2)' }]);
    });

    test('without the option a raw-pixel picture is dropped as before', () => {
        const { ir, losses } = read(between({ value: rgb(1, 1, [1, 2, 3]) }));
        expect(kinds(ir)).toEqual(['paragraph', 'paragraph']);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' }]);
    });

    test('toMd returns the PNG as an asset', async () => {
        const r = await oconvApi.toMd({ name: 'p.pdf', bytes: between({ value: rgb(1, 1, [1, 2, 3]) }), convertedAt: FIXED_AT, pdfInclude: ['images'] });
        expect(r.markdown).toContain('](image-7.png)');
        expect(readPng(r.assets[0].bytes).rows.map((x) => [...x])).toEqual([[1, 2, 3]]);
    });
});
