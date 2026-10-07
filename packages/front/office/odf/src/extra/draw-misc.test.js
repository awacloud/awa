// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { drawMisc } from './draw-misc.js';
import { odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();
const helper = odfMiscHelper.factory(xml);
const ext = drawMisc.factory(xml, helper);

describe('drawMisc', () => {
    test('contract', () => {
        expect(drawMisc.name).toBe('drawMisc');
        expect(drawMisc.dependencies).toEqual(['xml', 'odfMiscHelper']);
    });
    test('parse/render draw:glue-point', () => {
        const el = xml.el('draw:glue-point', { 'draw:id': '1' });
        const p = ext.parseElement(el);
        expect(p.kind).toBe('glue-point');
        expect(ext.renderElement(p).attrs['draw:id']).toBe('1');
    });
    test('hydrate/dehydrateFrame roundtrip', () => {
        const f = { _extras: [xml.el('draw:layer', { 'draw:name': 'L1' })] };
        ext.hydrateFrame(f);
        expect(f.drawNodes).toHaveLength(1);
        const back = ext.dehydrateFrame(f);
        expect(back._extras[0].name).toBe('draw:layer');
    });
});
