// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { drawShape } from './shape.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const s = drawShape.factory(xml);
    return { xml, s };
}

describe('drawShape module', () => {
    test('factory shape', () => {
        expect(drawShape.name).toBe('drawShape');
        expect(drawShape.dependencies).toEqual(['xml']);
        expect(typeof drawShape.factory).toBe('function');
    });

    test('isShapeName recognises typed shapes', () => {
        const { s } = build();
        for (const k of ['draw:rect', 'draw:circle', 'draw:ellipse', 'draw:line',
            'draw:polyline', 'draw:polygon', 'draw:path', 'draw:custom-shape']) {
            expect(s.isShapeName(k)).toBe(true);
        }
        expect(s.isShapeName('draw:frame')).toBe(false);
    });

    test('parse + render draw:rect roundtrip', () => {
        const { xml, s } = build();
        const el = xml.parse('<draw:rect svg:x="1cm" svg:y="2cm" svg:width="3cm" svg:height="4cm" draw:name="r1"/>');
        const m = s.parseShape(el);
        expect(m.kind).toBe('draw:rect');
        expect(m.attrs['svg:x']).toBe('1cm');
        const out = xml.serialize(s.renderShape(m));
        expect(out).toContain('svg:x="1cm"');
        expect(out).toContain('draw:name="r1"');
    });

    test('parse draw:line', () => {
        const { xml, s } = build();
        const el = xml.parse('<draw:line svg:x1="0cm" svg:y1="0cm" svg:x2="5cm" svg:y2="5cm"/>');
        const m = s.parseShape(el);
        expect(m.kind).toBe('draw:line');
        expect(m.attrs['svg:x1']).toBe('0cm');
    });

    test('parse draw:custom-shape with draw:enhanced-geometry', () => {
        const { xml, s } = build();
        const el = xml.parse(
            '<draw:custom-shape svg:width="5cm" svg:height="5cm">' +
            '<draw:enhanced-geometry svg:viewBox="0 0 100 100" draw:type="rectangle"/>' +
            '</draw:custom-shape>');
        const m = s.parseShape(el);
        expect(m.kind).toBe('draw:custom-shape');
        expect(m.enhancedGeometry).toBeDefined();
        expect(m.enhancedGeometry.attrs['draw:type']).toBe('rectangle');
        const out = xml.serialize(s.renderShape(m));
        expect(out).toContain('<draw:enhanced-geometry');
        expect(out).toContain('draw:type="rectangle"');
    });

    test('preserves unknown children', () => {
        const { xml, s } = build();
        const el = xml.parse('<draw:polygon svg:points="0,0 10,0 10,10"><foo:bar/></draw:polygon>');
        const m = s.parseShape(el);
        expect(m.children.length).toBe(1);
        const out = xml.serialize(s.renderShape(m));
        expect(out).toContain('<foo:bar/>');
    });
});
