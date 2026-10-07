// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { drawShapes } from './draw-shapes.js';

const xml = fwXml.factory();
const ext = drawShapes.factory(xml);

describe('drawShapes — factory', () => {
    test('contract', () => {
        expect(drawShapes.name).toBe('drawShapes');
        expect(drawShapes.dependencies).toEqual(['xml']);
    });
});

describe('drawShapes — parse/render', () => {
    test('roundtrip rect', () => {
        const el = xml.el('draw:rect', { 'svg:x': '0', 'svg:y': '0', 'svg:width': '5cm', 'svg:height': '5cm' });
        const s = ext.parseShape(el);
        expect(s.kind).toBe('draw:rect');
        const back = ext.renderShape(s);
        expect(back.name).toBe('draw:rect');
        expect(back.attrs['svg:width']).toBe('5cm');
    });
    test('custom-shape with enhanced-geometry', () => {
        const el = xml.el('draw:custom-shape', { 'draw:name': 'cs1' },
            [ xml.el('draw:enhanced-geometry',
                { 'draw:type': 'rectangle' },
                [ xml.el('draw:equation', { 'draw:name': 'E0', 'draw:formula': '1+1' }) ]) ]);
        const s = ext.parseShape(el);
        expect(s.enhancedGeometry).toBeDefined();
        expect(s.enhancedGeometry.equations).toHaveLength(1);
        const back = ext.renderShape(s);
        const reparsed = ext.parseShape(back);
        expect(reparsed.enhancedGeometry.equations[0].attrs['draw:formula']).toBe('1+1');
    });
});

describe('drawShapes — hooks', () => {
    test('hydrateFrame promotes shapes from _extras', () => {
        const rect = xml.el('draw:rect', {});
        const f = { type: 'frame', _extras: [rect] };
        ext.hydrateFrame(f);
        expect(f.shapes).toHaveLength(1);
        expect(f.shapes[0].kind).toBe('draw:rect');
    });
    test('dehydrateFrame demotes shapes back', () => {
        const f = { type: 'frame', shapes: [{ type: 'shape-ext', kind: 'draw:ellipse', attrs: {} }] };
        const out = ext.dehydrateFrame(f);
        expect(out._extras[0].name).toBe('draw:ellipse');
    });
});
