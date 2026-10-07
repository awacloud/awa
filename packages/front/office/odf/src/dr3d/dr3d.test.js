// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { dr3dScene } from './dr3d.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const d = dr3dScene.factory(xml);
    return { xml, d };
}

describe('dr3dScene module', () => {
    test('factory shape', () => {
        expect(dr3dScene.name).toBe('dr3dScene');
        expect(dr3dScene.dependencies).toEqual(['xml']);
    });

    test('is3dElementName recognises 3D elements', () => {
        const { d } = build();
        for (const k of ['dr3d:scene', 'dr3d:cube', 'dr3d:sphere',
            'dr3d:extrude', 'dr3d:rotate', 'dr3d:light']) {
            expect(d.is3dElementName(k)).toBe(true);
        }
        expect(d.is3dElementName('draw:rect')).toBe(false);
    });

    test('parses scene with lights + shapes', () => {
        const { xml, d } = build();
        const src =
            '<dr3d:scene dr3d:projection="parallel" dr3d:vrp="0 0 0">' +
            '<dr3d:light dr3d:diffuse-color="#ffffff" dr3d:direction="(0 0 -1)"/>' +
            '<dr3d:cube dr3d:min-edge="(-1 -1 -1)" dr3d:max-edge="(1 1 1)"/>' +
            '<dr3d:sphere dr3d:center="(0 0 0)" dr3d:size="(2 2 2)"/>' +
            '</dr3d:scene>';
        const m = d.parseScene(xml.parse(src));
        expect(m.type).toBe('dr3d-scene');
        expect(m.attrs['dr3d:projection']).toBe('parallel');
        expect(m.lights).toHaveLength(1);
        expect(m.shapes).toHaveLength(2);
        expect(m.shapes[0].kind).toBe('dr3d:cube');
        expect(m.shapes[1].kind).toBe('dr3d:sphere');
    });

    test('render roundtrip', () => {
        const { xml, d } = build();
        const m = {
            type: 'dr3d-scene',
            attrs: { 'dr3d:vrp': '0 0 0' },
            lights: [{ kind: 'dr3d:light', attrs: { 'dr3d:diffuse-color': '#ff0000' } }],
            shapes: [{ kind: 'dr3d:cube', attrs: { 'dr3d:min-edge': '(0 0 0)' } }]
        };
        const out = xml.serialize(d.renderScene(m));
        expect(out).toContain('<dr3d:scene');
        expect(out).toContain('<dr3d:light');
        expect(out).toContain('dr3d:diffuse-color="#ff0000"');
        expect(out).toContain('<dr3d:cube');
    });

    test('preserves unknown children', () => {
        const { xml, d } = build();
        const src = '<dr3d:scene><foo:bar/></dr3d:scene>';
        const m = d.parseScene(xml.parse(src));
        expect(m._extras.children).toHaveLength(1);
        const out = xml.serialize(d.renderScene(m));
        expect(out).toContain('<foo:bar/>');
    });
});
