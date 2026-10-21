// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { drawFrame } from './frame.js';
import { drawImage } from './image.js';
import { odfErrors } from '../errors.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const image = drawImage.factory(xml);
    const errors = odfErrors.factory();
    return { xml, errors, f: drawFrame.factory(xml, image, errors) };
}

describe('drawFrame module', () => {
    test('factory shape', () => {
        expect(drawFrame.name).toBe('drawFrame');
        expect(drawFrame.dependencies).toEqual(['xml', 'drawImage', 'odfErrors']);
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

describe('drawFrame — an unknown child kind', () => {
    test('renderFrame throws ContractError odf/contract-error/frame naming the kind', () => {
        const { f, errors } = build();
        const { ContractError } = errors;
        let err = null;
        try { f.renderFrame({ name: 'F', child: { kind: 'weird' } }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('odf/contract-error/frame');
        expect(err.context).toEqual({ kind: 'weird' });
    });

    test('a frame without a child still renders', () => {
        const { xml, f } = build();
        expect(xml.serialize(f.renderFrame({ name: 'F' }))).toContain('<draw:frame draw:name="F"/>');
    });
});

describe('drawFrame — hand-wired without odfErrors (the 1.0.0 two-argument wiring)', () => {
    const xml = fwXml.factory();
    const IMG = '<draw:frame draw:name="F1" text:anchor-type="as-char"><draw:image xlink:href="Pictures/a.png"/></draw:frame>';

    test('drawFrame.factory(xml, image) constructs and round-trips a frame', () => {
        const f = drawFrame.factory(xml, drawImage.factory(xml));
        const fr = f.parseFrame(xml.parse(IMG));
        expect(fr.child).toEqual(build().f.parseFrame(xml.parse(IMG)).child);
        expect(xml.serialize(f.renderFrame(fr))).toBe(xml.serialize(build().f.renderFrame(fr)));
    });

    test('an unknown child kind keeps the 1.0.0 result: no throw, a null child', () => {
        const f = drawFrame.factory(xml, drawImage.factory(xml));
        const node = f.renderFrame({ name: 'F', child: { kind: 'weird' } });
        expect(node.children).toEqual([null]);
    });
});
