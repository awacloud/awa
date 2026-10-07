// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { dr3d3d } from './dr3d-3d.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = dr3d3d.factory(xml, helper);

describe('dr3d3d', () => {
    test('contract', () => {
        expect(dr3d3d.name).toBe('dr3d3d');
        expect(dr3d3d.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parses dr3d:scene with light + cube', () => {
        const el = xml.el('dr3d:scene', { 'dr3d:projection': 'parallel' }, [
            xml.el('dr3d:light', { 'dr3d:diffuse-color': '#fff' }),
            xml.el('dr3d:cube', { 'dr3d:size': '5cm 5cm 5cm' })
        ]);
        const s = ext.parseScene(el);
        expect(s.kind).toBe('scene');
        expect(s.children).toHaveLength(2);
        const back = ext.renderScene(s);
        expect(back.name).toBe('dr3d:scene');
    });
});
