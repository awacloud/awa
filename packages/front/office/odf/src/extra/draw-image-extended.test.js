// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { drawImageExtended } from './draw-image-extended.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = drawImageExtended.factory(xml, helper);

describe('drawImageExtended', () => {
    test('contract', () => {
        expect(drawImageExtended.name).toBe('drawImageExtended');
        expect(drawImageExtended.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parse draw:image-map with area-rectangle child', () => {
        const el = xml.el('draw:image-map', {}, [
            xml.el('draw:area-rectangle', { 'svg:x': '0' })
        ]);
        const p = ext.parseElement(el);
        expect(p.kind).toBe('image-map');
        expect(p.children[0].kind).toBe('area-rectangle');
    });
    test('hydrate/dehydrateFrame roundtrip', () => {
        const fr = { _extras: [xml.el('draw:gradient', { 'draw:name': 'g1' })] };
        ext.hydrateFrame(fr);
        expect(fr.drawExtras).toHaveLength(1);
        const out = ext.dehydrateFrame(fr);
        expect(out._extras[0].name).toBe('draw:gradient');
    });
});
