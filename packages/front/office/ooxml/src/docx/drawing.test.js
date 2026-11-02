// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { docxDrawing } from './drawing.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const drawing = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);

// Minimal valid PNG (1×1 transparent pixel).
const PNG_1X1 = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
]);

const JPEG_PREFIX = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
const GIF_PREFIX  = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0]);
const BMP_PREFIX  = new Uint8Array([0x42, 0x4D, 0, 0, 0, 0]);

describe('docxDrawing — sniffer', () => {
    test('PNG / JPEG / GIF / BMP recognized', () => {
        expect(drawing.sniffImageType(PNG_1X1)).toBe('image/png');
        expect(drawing.sniffImageType(JPEG_PREFIX)).toBe('image/jpeg');
        expect(drawing.sniffImageType(GIF_PREFIX)).toBe('image/gif');
        expect(drawing.sniffImageType(BMP_PREFIX)).toBe('image/bmp');
    });

    test('unknown bytes fall back to octet-stream', () => {
        expect(drawing.sniffImageType(new Uint8Array([1, 2, 3, 4])))
            .toBe('application/octet-stream');
    });

    test('extensionFor maps content types to file extensions', () => {
        expect(drawing.extensionFor('image/png')).toBe('png');
        expect(drawing.extensionFor('image/jpeg')).toBe('jpg');
        expect(drawing.extensionFor('image/gif')).toBe('gif');
        expect(drawing.extensionFor('application/octet-stream')).toBe('bin');
    });
});

describe('docxDrawing — EMU conversion', () => {
    test('toEmu accepts numbers, in, cm, mm, pt, px', () => {
        expect(drawing.toEmu(914400)).toBe(914400);
        expect(drawing.toEmu('1in')).toBe(914400);
        expect(drawing.toEmu('2.5in')).toBe(2286000);
        expect(drawing.toEmu('1cm')).toBe(360000);
        expect(drawing.toEmu('10mm')).toBe(360000);
        expect(drawing.toEmu('72pt')).toBe(914400);
        expect(drawing.toEmu('96px')).toBe(914400);
    });
});

describe('docxDrawing — image() helper', () => {
    test('builds an inline drawing with sniffed content type', () => {
        const d = drawing.image(PNG_1X1, { cx: '2in', cy: '1.5in', name: 'foo.png' });
        expect(d.type).toBe('drawing');
        expect(d.mode).toBe('inline');
        expect(d.cx).toBe(1828800);
        expect(d.cy).toBe(1371600);
        expect(d.docName).toBe('foo.png');
        expect(d.image.contentType).toBe('image/png');
    });
});

describe('docxDrawing — render/parse roundtrip', () => {
    test('inline drawing roundtrip with embedRef', () => {
        const d = drawing.image(PNG_1X1, { cx: '2in', cy: '2in', name: 'pic.png' });
        d.embedRef = 'rId99';
        const xmlNode = drawing.renderDrawing(d);
        const back = drawing.parseDrawing(xmlNode);
        expect(back.mode).toBe('inline');
        expect(back.cx).toBe(d.cx);
        expect(back.cy).toBe(d.cy);
        expect(back.docName).toBe('pic.png');
        expect(back.embedRef).toBe('rId99');
        expect(back.prstGeom).toBe('rect');
    });

    test('description (alt text) roundtrips', () => {
        const d = drawing.image(PNG_1X1, {
            cx: '1in', cy: '1in', description: 'A red square'
        });
        d.embedRef = 'rIdX';
        const back = drawing.parseDrawing(drawing.renderDrawing(d));
        expect(back.description).toBe('A red square');
    });
});

// T51 (g): a drawing keeps its source; untouched, it is written from it.
describe('docxDrawing — kept source (T51 g)', () => {
    const NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
        + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
        + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const PIC = `<w:drawing ${NS}><wp:inline distT="0" distB="0" distL="0" distR="0">`
        + '<wp:extent cx="914400" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
        + '<wp:docPr id="7" name="Picture 7"><a:hlinkClick r:id="rIdL"/></wp:docPr>'
        + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png" descr="the picture"/>'
        + '<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
        + '<pic:blipFill><a:blip r:embed="rIdP" cstate="print"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        + '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm>'
        + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>'
        + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';
    const NO_LINK = PIC.replace('<a:hlinkClick r:id="rIdL"/>', '').replace('<wp:docPr id="7" name="Picture 7"></wp:docPr>', '<wp:docPr id="7" name="Picture 7"/>');
    const read = (s) => drawing.parseDrawing(xml.parse(s));
    const out = (d) => xml.serialize(drawing.renderDrawing(d));

    test('the read keeps the element and the typed fields as read', () => {
        const d = read(NO_LINK);
        expect(d._source.name).toBe('w:drawing');
        expect(d._read).toEqual({ type: 'drawing', mode: 'inline', distT: 0, distB: 0, distL: 0, distR: 0,
            cx: 914400, cy: 457200, docName: 'Picture 7', picName: 'image1.png', picId: 0,
            srcRect: d.srcRect, prstGeom: 'rect', offsetX: 0, offsetY: 0 });
        expect('embedRef' in d._read || 'docId' in d._read).toBe(false);
    });

    test('an untouched drawing is written from its source', () => {
        expect(out(read(NO_LINK))).toBe(xml.serialize(xml.parse(NO_LINK)));
    });

    test('the ids the write assigns are rewritten in the source', () => {
        const d = read(NO_LINK);
        d.embedRef = 'rImg3';
        d.docId = 12;
        const s = out(d);
        expect(s).toContain('r:embed="rImg3"');
        expect(s).toContain('<wp:docPr id="12" name="Picture 7"/>');
        expect(s).toContain('cstate="print"');
        expect(s).toContain('<a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>');
        expect(d._source.children.length).toBe(1);
        expect(xml.serialize(d._source)).toContain('r:embed="rIdP"');
    });

    test('an edited drawing is rebuilt from its typed fields', () => {
        const d = read(NO_LINK);
        d.cx = 1828800;
        const s = out(d);
        expect(s).toContain('cx="1828800"');
        expect(s).not.toContain('cstate');
        expect(s).not.toContain('picLocks');
    });

    test('a typed reference without its place in the source rebuilds it', () => {
        const d = read(NO_LINK);
        d.chartRef = 'rIdC';
        expect(out(d)).not.toContain('cstate');
    });

    test('another relationship reference needs the part to hold it', () => {
        const d = read(PIC);
        expect(out(d)).not.toContain('hlinkClick');
        const scope = (links, media) => ({ links: new Set(links), media: new Set(media) });
        expect(drawing.withRelationships(scope(['rIdX'], ['rIdP']), () => out(d))).not.toContain('hlinkClick');
        // the picture's own id must be one the part gives its media
        expect(drawing.withRelationships(scope(['rIdL'], []), () => out(d))).not.toContain('hlinkClick');
        const kept = drawing.withRelationships(scope(['rIdL'], ['rIdP']), () => out(d));
        expect(kept).toContain('<a:hlinkClick r:id="rIdL"/>');
        expect(kept).toContain('cstate="print"');
        expect(out(d)).not.toContain('hlinkClick');
    });
});
