// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { wmlVmlLegacy } from './wml-vml-legacy.js';

const xml = ooxmlXml.factory();
const ext = wmlVmlLegacy.factory(xml);

describe('extra/wml-vml-legacy', () => {
    test.each(['pict', 'object', 'control', 'movie'])(
        '%s wrapper roundtrips with v:shape attrs', (kind) => {
            const shape = {
                tag: 'v:shape',
                id: '_x0000_s1026',
                type: '#_x0000_t75',
                style: 'width:100pt;height:50pt',
                fillcolor: '#ff0000',
                strokecolor: '#000000',
                children: []
            };
            const wrapper = { kind, attrs: {}, shapes: [shape], vml: [] };
            const el = ext.renderLegacy(wrapper);
            expect(el.name).toBe('w:' + kind);
            const back = ext.parseLegacy(el);
            expect(back.kind).toBe(kind);
            expect(back.shapes).toHaveLength(1);
            expect(back.shapes[0].id).toBe('_x0000_s1026');
            expect(back.shapes[0].fillcolor).toBe('#ff0000');
            expect(back.shapes[0].strokecolor).toBe('#000000');
        }
    );

    test('preserves unknown attrs via _extraAttrs', () => {
        const shape = { tag: 'v:rect', id: 'r1', 'data-custom': 'x', children: [] };
        // can't pass data-custom because pickShapeAttrs only handles known
        // — go through render/parse with raw element instead.
        const raw = xml.el('w:pict', {}, [
            xml.el('v:rect', { id: 'r1', fillcolor: 'red', 'o:foo': 'bar' })
        ]);
        const back = ext.parseLegacy(raw);
        expect(back.shapes[0].id).toBe('r1');
        expect(back.shapes[0].fillcolor).toBe('red');
        expect(back.shapes[0]._extraAttrs).toEqual({ 'o:foo': 'bar' });

        const re = ext.renderLegacy(back);
        const back2 = ext.parseLegacy(re);
        expect(back2.shapes[0]._extraAttrs).toEqual({ 'o:foo': 'bar' });
    });
});
