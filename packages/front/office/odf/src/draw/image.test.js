// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { drawImage } from './image.js';
import { drawFrame } from './frame.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, d: drawImage.factory(xml) };
}

describe('drawImage module', () => {
    test('factory shape', () => {
        expect(drawImage.name).toBe('drawImage');
        expect(drawImage.dependencies).toEqual(['xml']);
        expect(typeof drawImage.factory).toBe('function');
    });

    describe('parseImage / renderImage', () => {
        test('roundtrip', () => {
            const { xml, d } = build();
            const el = xml.parse('<draw:image xlink:href="Pictures/foo.png" xlink:type="simple"/>');
            const img = d.parseImage(el);
            expect(img.href).toBe('Pictures/foo.png');
            const out = xml.serialize(d.renderImage(img));
            expect(out).toContain('xlink:href="Pictures/foo.png"');
            expect(out).toContain('xlink:type="simple"');
            expect(out).toContain('xlink:show="embed"');
        });

        test('renderImage writes the ODF draw:mime-type, not the loext extension', () => {
            const { xml, d } = build();
            const el = d.renderImage({ href: 'Pictures/foo.png', mimeType: 'image/png' });
            expect(el.attrs['draw:mime-type']).toBe('image/png');
            expect(Object.keys(el.attrs).some(k => k.startsWith('loext:'))).toBe(false);
            const out = xml.serialize(el);
            expect(out).toContain('draw:mime-type="image/png"');
            expect(out).not.toContain('loext');
        });

        test('no mimeType emits no mime-type attribute', () => {
            const { d } = build();
            const el = d.renderImage({ href: 'Pictures/foo.png' });
            expect(el.attrs['draw:mime-type']).toBeUndefined();
            expect(el.attrs['loext:mime-type']).toBeUndefined();
        });

        test('parseImage reads both mime-type names as known attributes', () => {
            const { xml, d } = build();
            for (const name of ['loext:mime-type', 'draw:mime-type']) {
                const img = d.parseImage(xml.parse(`<draw:image xlink:href="Pictures/a.png" ${name}="image/png"/>`));
                expect(img.mimeType).toBe('image/png');
                expect(img._extras).toBeUndefined();
            }
        });

        test('a read loext:mime-type document is re-written under draw:mime-type', () => {
            const { xml, d } = build();
            const img = d.parseImage(xml.parse('<draw:image xlink:href="Pictures/a.png" loext:mime-type="image/png"/>'));
            const out = xml.serialize(d.renderImage(img));
            expect(out).toContain('draw:mime-type="image/png"');
            expect(out).not.toContain('loext:mime-type');
        });

        test('an extra loext:mime-type on a hand-built model is re-emitted verbatim after the typed attribute', () => {
            const { d } = build();
            const el = d.renderImage({ href: 'a.png', mimeType: 'image/png',
                _extras: { attrs: { 'loext:mime-type': 'image/png' } } });
            expect(el.attrs['draw:mime-type']).toBe('image/png');
            expect(el.attrs['loext:mime-type']).toBe('image/png');
        });

        test('an image frame (renderFrame, kind image) carries draw:mime-type on its draw:image', () => {
            const xml = fwXml.factory();
            const image = drawImage.factory(xml);
            const frame = drawFrame.factory(xml, image);
            const el = frame.renderFrame({ anchorType: 'as-char',
                child: { kind: 'image', href: 'Pictures/a.png', mimeType: 'image/png' } });
            const img = el.children.find(c => c.name === 'draw:image');
            expect(img.attrs['draw:mime-type']).toBe('image/png');
            expect(img.attrs['loext:mime-type']).toBeUndefined();
        });
    });

    describe('sniffImageType', () => {
        test('PNG signature', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))).toBe('image/png');
        });
        test('JPEG', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg');
        });
        test('GIF', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
        });
        test('BMP', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0x42, 0x4D, 0, 0]))).toBe('image/bmp');
        });
        test('WebP', () => {
            const { d } = build();
            const b = new Uint8Array(12);
            b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
            expect(d.sniffImageType(b)).toBe('image/webp');
        });
        test('TIFF LE', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0x49, 0x49, 0x2A, 0x00]))).toBe('image/tiff');
        });
        test('SVG by content', () => {
            const { d } = build();
            const s = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>';
            const b = new Uint8Array(s.length);
            for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
            expect(d.sniffImageType(b)).toBe('image/svg+xml');
        });
        test('unknown → octet-stream', () => {
            const { d } = build();
            expect(d.sniffImageType(new Uint8Array([0, 0, 0, 0]))).toBe('application/octet-stream');
        });
    });

    describe('extensionFor', () => {
        test('common mappings', () => {
            const { d } = build();
            expect(d.extensionFor('image/png')).toBe('png');
            expect(d.extensionFor('image/jpeg')).toBe('jpg');
            expect(d.extensionFor('whatever')).toBe('bin');
        });
    });
});
