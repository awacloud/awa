// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { drawFrame } from './frame.js';
import { drawImage } from './image.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const image = drawImage.factory(xml);
    return { xml, f: drawFrame.factory(xml, image) };
}

describe('drawFrame module', () => {
    test('factory shape', () => {
        expect(drawFrame.name).toBe('drawFrame');
        expect(drawFrame.dependencies).toEqual(['xml', 'drawImage']);
        expect(typeof drawFrame.factory).toBe('function');
    });

    describe('parseFrame / renderFrame', () => {
        test('image child roundtrip', () => {
            const { xml, f } = build();
            const el = xml.parse('<draw:frame draw:name="F1" text:anchor-type="paragraph" svg:width="3cm" svg:height="2cm"><draw:image xlink:href="Pictures/a.png"/></draw:frame>');
            const fr = f.parseFrame(el);
            expect(fr.type).toBe('frame');
            expect(fr.name).toBe('F1');
            expect(fr.anchorType).toBe('paragraph');
            expect(fr.width).toBe('3cm');
            expect(fr.child.kind).toBe('image');
            expect(fr.child.href).toBe('Pictures/a.png');
            const out = xml.serialize(f.renderFrame(fr));
            expect(out).toContain('<draw:frame');
            expect(out).toContain('Pictures/a.png');
        });

        test('text-box child preserved', () => {
            const { xml, f } = build();
            const fr = f.parseFrame(xml.parse('<draw:frame draw:name="T"><draw:text-box><text:p>hi</text:p></draw:text-box></draw:frame>'));
            expect(fr.child.kind).toBe('text-box');
            expect(fr.child.children).toHaveLength(1);
            const out = xml.serialize(f.renderFrame(fr));
            expect(out).toContain('<text:p>hi</text:p>');
        });

        test('object child', () => {
            const { xml, f } = build();
            const fr = f.parseFrame(xml.parse('<draw:frame><draw:object xlink:href="./Object1"/></draw:frame>'));
            expect(fr.child.kind).toBe('object');
            expect(fr.child.href).toBe('./Object1');
        });
    });
});
