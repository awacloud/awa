// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { styleMisc } from './style-misc.js';
import { odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();
const helper = odfMiscHelper.factory(xml);
const ext = styleMisc.factory(xml, helper);

describe('styleMisc — factory + roundtrip', () => {
    test('contract', () => {
        expect(styleMisc.name).toBe('styleMisc');
        expect(styleMisc.dependencies).toEqual(['xml', 'odfMiscHelper']);
        expect(ext._passthrough).toBe(true);
    });
    test('parse/render style:tab-stop', () => {
        const el = xml.el('style:tab-stop', { 'style:position': '2cm' });
        const p = ext.parseElement(el);
        expect(p.kind).toBe('tab-stop');
        expect(ext.renderElement(p).attrs['style:position']).toBe('2cm');
    });
    test('hydrate/dehydrate roundtrip', () => {
        const s = { _extras: [xml.el('style:font-face', { 'style:name': 'Arial' })] };
        ext.hydrateStyles(s);
        expect(s.styleNodes).toHaveLength(1);
        const back = ext.dehydrateStyles(s);
        expect(back._extras[0].name).toBe('style:font-face');
    });
});
