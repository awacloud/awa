// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Typed DrawingML colours keep their transforms, typed pictures keep their
 * crop.
 *
 * - A shape fill `{ schemeColor | rgb }` carries `mods` (the
 *   `lumMod` / `lumOff` / `tint` / `shade` / `alpha` … children, in document
 *   order, as `{ name, val? }` — `val` a number when the element has one).
 * - Text-run fills keep the 1.0.0 model by default: an `srgbClr` is the
 *   `'RRGGBB'` string (its transforms dropped), any other fill stays verbatim
 *   in `rPr._extras`. With the `typedRunColors: true` read option, a fill that
 *   a bare `'RRGGBB'` cannot express (a scheme colour, or any colour with
 *   transforms) is typed as `rPr.color = { schemeColor | rgb, mods? }`
 *   instead; the option reaches `parseTextBody` and `pptx.read` /
 *   `xlsx.read`.
 * - `a:blipFill/a:srcRect` reaches the docx drawing and the pptx picture as
 *   `srcRect: { l?, t?, r?, b? }` (1/1000 of a percent) and is written back
 *   between `a:blip` and `a:stretch`.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from '../math/math.js';
import { drawingml } from './drawingml.js';
import { drawingmlShape } from './shape.js';
import { docxDrawing } from '../docx/drawing.js';
import { pptxPicture } from '../pptx/picture.js';
import { ooxmlErrors } from '../errors.js';
import { ooxmlShared } from '../_shared/index.js';

const shared = ooxmlShared.factory();
const xml = ooxmlXml.factory();
const dml = drawingml.factory(xml, ooxmlMath.factory(ooxmlErrors.factory(), xml), shared);
const sh = drawingmlShape.factory(xml, shared);
const drawing = docxDrawing.factory(xml, sh, shared);
const pic = pptxPicture.factory(xml, shared);

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const LUM = [{ name: 'lumMod', val: 75000 }, { name: 'lumOff', val: 25000 }];
// `serialize` prepends the XML declaration; compare the element alone.
const ser = (node) => xml.serialize(node).replace(/^<\?xml[^>]*\?>\s*/, '');

describe('shape fills keep their colour transforms', () => {
    test('a scheme fill with lumMod / lumOff keeps both, in order', () => {
        const spPr = xml.parse(`<p:spPr ${A} xmlns:p="p"><a:solidFill><a:schemeClr val="tx1">`
            + '<a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill></p:spPr>');
        expect(sh.parseFill(spPr)).toEqual({ schemeColor: 'tx1', mods: LUM });
    });

    test('an rgb fill with alpha keeps it; a bare fill has no mods', () => {
        const withAlpha = xml.parse(`<p:spPr ${A} xmlns:p="p"><a:solidFill><a:srgbClr val="FF0000">`
            + '<a:alpha val="50000"/></a:srgbClr></a:solidFill></p:spPr>');
        expect(sh.parseFill(withAlpha)).toEqual({ rgb: 'FF0000', mods: [{ name: 'alpha', val: 50000 }] });
        const bare = xml.parse(`<p:spPr ${A} xmlns:p="p"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr>`);
        expect(sh.parseFill(bare)).toEqual({ schemeColor: 'accent1' });
    });

    test('shapeProps keeps the transforms of a fill', () => {
        expect(sh.shapeProps({ fill: { schemeColor: 'accent1', mods: [{ name: 'shade', val: 50000 }] } }).fill)
            .toEqual({ schemeColor: 'accent1', mods: [{ name: 'shade', val: 50000 }] });
        expect(sh.shapeProps({ fill: { rgb: '4472C4' } }).fill).toEqual({ rgb: '4472C4' });
    });

    test('renderFill writes the transforms back', () => {
        expect(ser(sh.renderFill({ schemeColor: 'tx1', mods: LUM })))
            .toBe('<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill>');
    });
});

const rPrOf = (fill) => xml.parse(`<a:rPr ${A} lang="en-US">${fill}</a:rPr>`);
const SCHEME_LUM = '<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill>';
const TYPED = { typedRunColors: true };

describe('text-run colours by default: the 1.0.0 model', () => {
    test('a scheme run colour stays verbatim in _extras; no typed colour', () => {
        const rPr = dml.parseRunProperties(rPrOf(SCHEME_LUM));
        expect(rPr.color).toBeUndefined();
        expect(rPr._extras).toHaveLength(1);
        expect(ser(rPr._extras[0])).toBe(SCHEME_LUM);
    });

    test('an rgb run colour with a transform reads as the bare string', () => {
        const tinted = dml.parseRunProperties(rPrOf('<a:solidFill><a:srgbClr val="00AA00"><a:tint val="40000"/></a:srgbClr></a:solidFill>'));
        expect(tinted.color).toBe('00AA00');
        expect(tinted._extras).toBeUndefined();
        const off = dml.parseRunProperties(rPrOf(SCHEME_LUM), { typedRunColors: false });
        expect(off.color).toBeUndefined();
    });

    test('parseTextBody follows the option for run, field, break and defRPr fills', () => {
        const body = xml.parse(`<p:txBody ${A} xmlns:p="p"><a:bodyPr/><a:p>`
            + `<a:pPr><a:defRPr>${SCHEME_LUM}</a:defRPr></a:pPr>`
            + `<a:r><a:rPr>${SCHEME_LUM}</a:rPr><a:t>x</a:t></a:r>`
            + `<a:fld id="{1}" type="slidenum"><a:rPr>${SCHEME_LUM}</a:rPr><a:t>1</a:t></a:fld>`
            + `<a:br><a:rPr>${SCHEME_LUM}</a:rPr></a:br></a:p></p:txBody>`);
        const p = dml.parseTextBody(body).paragraphs[0];
        expect(p.runs).toHaveLength(3);
        for (const rPr of [p.pPr.defRPr, ...p.runs.map(r => r.rPr)]) {
            expect(rPr.color).toBeUndefined();
            expect(rPr._extras).toHaveLength(1);
        }
        const typed = dml.parseTextBody(body, TYPED).paragraphs[0];
        for (const rPr of [typed.pPr.defRPr, ...typed.runs.map(r => r.rPr)]) {
            expect(rPr.color).toEqual({ schemeColor: 'tx1', mods: LUM });
            expect(rPr._extras).toBeUndefined();
        }
    });
});

describe('text-run colours with typedRunColors: typed, transforms included', () => {

    test('a scheme run colour with transforms: typed object, nothing left in _extras', () => {
        const rPr = dml.parseRunProperties(rPrOf(SCHEME_LUM), TYPED);
        expect(rPr.color).toEqual({ schemeColor: 'tx1', mods: LUM });
        expect(rPr._extras).toBeUndefined();
    });

    test('an rgb run colour with a transform: typed object; a bare rgb stays a string', () => {
        const tinted = dml.parseRunProperties(rPrOf('<a:solidFill><a:srgbClr val="00AA00"><a:tint val="40000"/></a:srgbClr></a:solidFill>'), TYPED);
        expect(tinted.color).toEqual({ rgb: '00AA00', mods: [{ name: 'tint', val: 40000 }] });
        const bare = dml.parseRunProperties(rPrOf('<a:solidFill><a:srgbClr val="AA0000"/></a:solidFill>'), TYPED);
        expect(bare.color).toBe('AA0000');
    });

    test('typed run colours write back to the same XML', () => {
        const out = ser(dml.renderRunProperties(dml.parseRunProperties(rPrOf(SCHEME_LUM), TYPED)));
        expect(out).toContain(SCHEME_LUM);
    });

    test('a valueless transform (comp) round-trips; an unexpected attribute keeps the fill verbatim', () => {
        const comp = dml.parseRunProperties(rPrOf('<a:solidFill><a:schemeClr val="bg1"><a:comp/></a:schemeClr></a:solidFill>'), TYPED);
        expect(comp.color).toEqual({ schemeColor: 'bg1', mods: [{ name: 'comp' }] });
        expect(ser(dml.renderRunProperties(comp))).toContain('<a:schemeClr val="bg1"><a:comp/></a:schemeClr>');
        const odd = dml.parseRunProperties(rPrOf('<a:solidFill><a:schemeClr val="bg1"><a:lumMod val="1" x="2"/></a:schemeClr></a:solidFill>'), TYPED);
        expect(odd.color).toBeUndefined();
        expect(odd._extras).toHaveLength(1);
    });

    test('a system colour run fill stays verbatim in _extras (not typed)', () => {
        const rPr = dml.parseRunProperties(rPrOf('<a:solidFill><a:sysClr val="windowText" lastClr="000000"/></a:solidFill>'), TYPED);
        expect(rPr.color).toBeUndefined();
        expect(rPr._extras).toHaveLength(1);
    });
});

describe('typedRunColors through pptx.read and xlsx.read', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const pptx = runtime.resolve('pptx');
    const xlsx = runtime.resolve('xlsx');
    const slideMod = runtime.resolve('pptxSlide');
    const TYPED_COLOR = { schemeColor: 'tx1', mods: LUM };
    const body = () => ({ paragraphs: [{ runs: [{ type: 'text', value: 'x', rPr: { color: TYPED_COLOR } }] }] });
    const expectMode = (rPr, typed) => {
        if (typed) {
            expect(rPr.color).toEqual(TYPED_COLOR);
            expect(rPr._extras).toBeUndefined();
        } else {
            expect(rPr.color).toBeUndefined();
            expect(rPr._extras).toHaveLength(1);
        }
    };

    test('pptx: slide shapes and table cells follow the option', () => {
        const bytes = pptx.write({ slides: [{ shapes: [
            { type: 'shape', id: 2, name: 'T', txBody: body() },
            { type: 'table', id: 3, name: 'Tb', columns: [{ width: 100 }],
              rows: [{ height: 100, cells: [{ txBody: body() }] }] }
        ] }] });
        for (const typed of [false, true]) {
            const shapes = pptx.read(bytes, typed ? TYPED : undefined).presentation.slides[0].shapes;
            expectMode(shapes[0].txBody.paragraphs[0].runs[0].rPr, typed);
            expectMode(shapes[1].rows[0].cells[0].txBody.paragraphs[0].runs[0].rPr, typed);
        }
    });

    test('pptx: layouts and masters follow the option', () => {
        const sp = `<p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:rPr>${SCHEME_LUM}</a:rPr><a:t>x</a:t></a:r></a:p></p:txBody></p:sp>`;
        const ns = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ${A}`;
        for (const [parse, tag] of [[slideMod.parseSlideLayout, 'p:sldLayout'], [slideMod.parseSlideMaster, 'p:sldMaster']]) {
            const src = `<${tag} ${ns}><p:cSld><p:spTree>${sp}</p:spTree></p:cSld></${tag}>`;
            expectMode(parse(src).shapes[0].txBody.paragraphs[0].runs[0].rPr, false);
            expectMode(parse(src, TYPED).shapes[0].txBody.paragraphs[0].runs[0].rPr, true);
        }
    });

    test('xlsx: drawing shapes follow the option', () => {
        const bytes = xlsx.write({ sheets: [{ name: 'S', rows: [['x']], drawings: [{
            anchor: { kind: 'oneCell', from: { col: 1, colOff: 0, row: 1, rowOff: 0 }, ext: { cx: 100, cy: 100 } },
            shapeProps: { geom: 'rect', cx: 100, cy: 100, offsetX: 0, offsetY: 0 },
            name: 'Sh', txBody: body()
        }] }] });
        for (const typed of [false, true]) {
            const d = xlsx.read(bytes, typed ? TYPED : undefined).workbook.sheets[0].drawings[0];
            expectMode(d.txBody.paragraphs[0].runs[0].rPr, typed);
        }
    });
});

describe('picture crop (a:srcRect)', () => {
    const PIC_DOCX = '<w:drawing xmlns:w="w" xmlns:wp="wp" xmlns:r="r"><wp:inline><wp:extent cx="10" cy="10"/>'
        + `<wp:docPr id="1" name="P"/><a:graphic ${A}><a:graphicData uri="pic">`
        + '<pic:pic xmlns:pic="pic"><pic:nvPicPr><pic:cNvPr id="1" name="P"/><pic:cNvPicPr/></pic:nvPicPr>'
        + '<pic:blipFill><a:blip r:embed="rId5"/><a:srcRect l="50000" b="12500"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        + '<pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';

    test('docx: the drawing node carries srcRect and writes it back in order', () => {
        const d = drawing.parseDrawing(xml.parse(PIC_DOCX));
        expect(d.srcRect).toEqual({ l: 50000, b: 12500 });
        const out = ser(drawing.renderDrawing(d));
        expect(out).toContain('<a:blip r:embed="rId5"/><a:srcRect l="50000" b="12500"/><a:stretch>');
    });

    test('pptx: the picture carries srcRect and writes it back in order', () => {
        const p = pic.parsePicture(xml.parse(`<p:pic xmlns:p="p" ${A} xmlns:r="r"><p:nvPicPr><p:cNvPr id="4" name="P"/></p:nvPicPr>`
            + '<p:blipFill><a:blip r:embed="rId2"/><a:srcRect t="1000" r="2000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            + '<p:spPr/></p:pic>'));
        expect(p.srcRect).toEqual({ t: 1000, r: 2000 });
        expect(ser(pic.renderPicture(p))).toContain('<a:blip r:embed="rId2"/><a:srcRect t="1000" r="2000"/><a:stretch>');
    });

    test('an empty srcRect is kept as {}; no srcRect, no key and no element', () => {
        const p = pic.parsePicture(xml.parse(`<p:pic xmlns:p="p" ${A} xmlns:r="r"><p:blipFill><a:blip r:embed="rId2"/><a:srcRect/></p:blipFill></p:pic>`));
        expect(p.srcRect).toEqual({});
        expect(ser(pic.renderPicture(p))).toContain('<a:srcRect/>');
        const none = pic.parsePicture(xml.parse(`<p:pic xmlns:p="p" ${A} xmlns:r="r"><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>`));
        expect('srcRect' in none).toBe(false);
        expect(ser(pic.renderPicture(none))).not.toContain('srcRect');
    });
});
