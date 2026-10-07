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
