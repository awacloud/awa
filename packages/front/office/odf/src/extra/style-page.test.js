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
    test('dehydrateStyles puts each back into its container and leaves _extras alone', () => {
        const faces = { children: [xml.el('office:font-face-decls', {}, [])] };
        const styles = {
            styles: [], automaticStyles: [xml.el('style:style', { 'style:name': 'A' })], masterStyles: [],
            _extras: faces,
            pageLayouts: [{ kind: 'style:page-layout', attrs: { 'style:name': 'PL' }, children: [] }],
            masterPages: [{ kind: 'style:master-page', attrs: { 'style:name': 'MP' }, children: [] }]
        };
        const out = ext.dehydrateStyles(styles);
        expect(out.automaticStyles.map((e) => e.name)).toEqual(['style:style', 'style:page-layout']);
        expect(out.masterStyles.map((e) => e.name)).toEqual(['style:master-page']);
        expect(out._extras).toBe(faces);
        expect(out.pageLayouts).toBeUndefined();
        expect(out.masterPages).toBeUndefined();
        // the given model is left as it was
        expect(styles.automaticStyles).toHaveLength(1);
        expect(styles.pageLayouts).toHaveLength(1);
    });

    test('an element hydrated from another container goes back there', () => {
        const pl = xml.el('style:page-layout', { 'style:name': 'PL' });
        const styles = { styles: [pl], automaticStyles: [], masterStyles: [] };
        ext.hydrateStyles(styles);
        expect(styles.pageLayouts[0].container).toBe('styles');
        const out = ext.dehydrateStyles(styles);
        expect(out.styles.map((e) => e.name)).toEqual(['style:page-layout']);
        expect(out.automaticStyles).toEqual([]);
        expect(out.styles[0].attrs).toEqual({ 'style:name': 'PL' });
    });

    test('an element in its usual container carries no container field', () => {
        const styles = { styles: [], automaticStyles: [xml.el('style:page-layout', {})],
            masterStyles: [xml.el('style:master-page', {})] };
        ext.hydrateStyles(styles);
        expect('container' in styles.pageLayouts[0]).toBe(false);
        expect('container' in styles.masterPages[0]).toBe(false);
    });

    test('the _extras array carrier round-trips as an array', () => {
        const styles = { _extras: [xml.el('style:master-page', { 'style:name': 'M' }), xml.el('x:other', {})] };
        ext.hydrateStyles(styles);
        const out = ext.dehydrateStyles(styles);
        expect(out._extras.map((e) => e.name)).toEqual(['x:other', 'style:master-page']);
    });

    test('parseNode keeps text in place: a header keeps its words', () => {
        const header = xml.el('style:header', {}, [
            xml.el('text:p', { 'text:style-name': 'Header' }, [
                { type: 'text', value: 'Page ' }, xml.el('text:page-number', {}, [{ type: 'text', value: '1' }]),
                { type: 'text', value: ' of the report' }])]);
        const mp = xml.el('style:master-page', { 'style:name': 'Standard' }, [header]);
        const back = ext.renderNode(ext.parseNode(mp));
        expect(xml.serialize(back)).toBe(xml.serialize(mp));
    });
});
