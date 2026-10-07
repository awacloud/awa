// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pptxPicture } from './picture.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const pic = pptxPicture.factory(xml, _shared);

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

describe('pptxPicture — sniffer + units', () => {
    test('sniff PNG bytes', () => {
        expect(pic.sniffImageType(PNG_1X1)).toBe('image/png');
    });
    test('toEmu accepts unit-tagged strings', () => {
        expect(pic.toEmu('1in')).toBe(914400);
        expect(pic.toEmu('1cm')).toBe(360000);
    });
    test('extToContentType + extensionFor are inverses', () => {
        for (const ext of ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff']) {
            expect(pic.extensionFor(pic.extToContentType(ext))).toBe(
                ext === 'jpg' ? 'jpg' : ext
            );
        }
    });
});

describe('pptxPicture — image() helper', () => {
    test('builds typed picture from PNG bytes', () => {
        const p = pic.image(PNG_1X1, {
            cx: '2in', cy: '1.5in', name: 'fig.png',
            description: 'Figure 1'
        });
        expect(p.type).toBe('picture');
        expect(p.cx).toBe(1828800);
        expect(p.cy).toBe(1371600);
        expect(p.name).toBe('fig.png');
        expect(p.description).toBe('Figure 1');
        expect(p.image.contentType).toBe('image/png');
    });

    test('default cy is 0.75 of cx (4:3)', () => {
        const p = pic.image(PNG_1X1, { cx: '4in' });
        expect(p.cx).toBe(3657600);
        expect(p.cy).toBe(Math.floor(3657600 * 0.75));
    });
});

describe('pptxPicture — render/parse roundtrip', () => {
    test('inline picture with embedRef + dimensions roundtrips', () => {
        const p = pic.image(PNG_1X1, {
            cx: '2in', cy: '2in', name: 'logo.png',
            description: 'Company logo'
        });
        p.embedRef = 'rIdImg1';
        p.id = 7;
        p.offsetX = 1000000;
        p.offsetY = 500000;
        const back = pic.parsePicture(pic.renderPicture(p));
        expect(back.type).toBe('picture');
        expect(back.cx).toBe(p.cx);
        expect(back.cy).toBe(p.cy);
        expect(back.id).toBe(7);
        expect(back.name).toBe('logo.png');
        expect(back.description).toBe('Company logo');
        expect(back.embedRef).toBe('rIdImg1');
        expect(back.offsetX).toBe(1000000);
        expect(back.offsetY).toBe(500000);
        expect(back.prstGeom).toBe('rect');
    });
});
