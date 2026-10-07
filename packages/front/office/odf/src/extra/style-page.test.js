// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { stylePage } from './style-page.js';

const xml = fwXml.factory();
const ext = stylePage.factory(xml);

describe('stylePage — factory', () => {
    test('contract', () => {
        expect(stylePage.name).toBe('stylePage');
        expect(stylePage.dependencies).toEqual(['xml']);
    });
});

describe('stylePage — parse/render', () => {
    test('isPageName covers page-layout + columns', () => {
        expect(ext.isPageName('style:page-layout')).toBe(true);
        expect(ext.isPageName('style:columns')).toBe(true);
        expect(ext.isPageName('text:p')).toBe(false);
    });
    test('roundtrip page-layout with properties', () => {
        const el = xml.el('style:page-layout', { 'style:name': 'PL' },
            [xml.el('style:page-layout-properties', { 'fo:page-width': '210mm' })]);
        const node = ext.parseNode(el);
        const back = ext.renderNode(node);
        expect(back.name).toBe('style:page-layout');
        expect(back.children[0].name).toBe('style:page-layout-properties');
    });
});

describe('stylePage — hooks', () => {
    test('hydrateStyles partitions page-layout + master-page', () => {
        const pl = xml.el('style:page-layout', { 'style:name': 'PL' });
        const mp = xml.el('style:master-page', { 'style:name': 'Standard' });
        const styles = { styles: [pl, mp, xml.el('text:p', {})] };
        ext.hydrateStyles(styles);
        expect(styles.pageLayouts).toHaveLength(1);
        expect(styles.masterPages).toHaveLength(1);
        expect(styles.styles).toHaveLength(1);
    });
    test('dehydrateStyles emits both back into _extras', () => {
        const styles = {
            pageLayouts: [{ kind: 'style:page-layout', attrs: {}, children: [] }],
            masterPages: [{ kind: 'style:master-page', attrs: {}, children: [] }]
        };
        const out = ext.dehydrateStyles(styles);
        expect(out._extras).toHaveLength(2);
        expect(out.pageLayouts).toBeUndefined();
        expect(out.masterPages).toBeUndefined();
    });
});
