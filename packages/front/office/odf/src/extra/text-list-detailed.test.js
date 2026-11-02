// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textListDetailed } from './text-list-detailed.js';

const xml = fwXml.factory();
const ext = textListDetailed.factory(xml);

describe('textListDetailed — factory', () => {
    test('contract', () => {
        expect(textListDetailed.name).toBe('textListDetailed');
        expect(textListDetailed.dependencies).toEqual(['xml']);
    });
});

describe('textListDetailed — parse/render', () => {
    test('roundtrip list-style with levels', () => {
        const ls = {
            type: 'list-style', name: 'L1', attrs: { 'style:name': 'L1' },
            levels: [
                { type: 'level-number', attrs: { 'text:level': '1', 'style:num-format': '1' } },
                { type: 'level-bullet', attrs: { 'text:level': '2', 'text:bullet-char': '·' } }
            ]
        };
        const el = ext.renderListStyle(ls);
        const parsed = ext.parseListStyle(el);
        expect(parsed.levels).toHaveLength(2);
        expect(parsed.levels[0].type).toBe('level-number');
    });
});

describe('textListDetailed — hooks', () => {
    test('hydrateStyles promotes list-style from styles bag', () => {
        const lsEl = xml.el('text:list-style', { 'style:name': 'L1' },
            [xml.el('text:list-level-style-bullet', { 'text:level': '1' })]);
        const styles = { styles: [lsEl] };
        ext.hydrateStyles(styles);
        expect(styles.listStyles).toHaveLength(1);
        expect(styles.listStyles[0].name).toBe('L1');
        expect(styles.styles).toEqual([]);
    });
    test('dehydrateStyles puts list styles back into office:styles and leaves _extras alone', () => {
        const faces = { children: [xml.el('office:font-face-decls', {}, [])] };
        const styles = {
            styles: [xml.el('style:style', { 'style:name': 'S' })], _extras: faces,
            listStyles: [{ type: 'list-style', name: 'L', attrs: { 'style:name': 'L' }, levels: [] },
                { type: 'outline-style', name: 'Outline', attrs: { 'style:name': 'Outline' }, levels: [] }]
        };
        const out = ext.dehydrateStyles(styles);
        expect(out.styles.map((e) => e.name)).toEqual(['style:style', 'text:list-style', 'text:outline-style']);
        expect(out._extras).toBe(faces);
        expect(out.listStyles).toBeUndefined();
        expect(styles.styles).toHaveLength(1);
    });
    test('a list style of office:automatic-styles records its container and goes back there', () => {
        const auto = xml.el('text:list-style', { 'style:name': 'L9' },
            [xml.el('text:list-level-style-number', { 'text:level': '1', 'style:num-format': '1' })]);
        const named = xml.el('text:list-style', { 'style:name': 'WWNum1' }, []);
        const styles = { styles: [named], automaticStyles: [auto], masterStyles: [] };
        ext.hydrateStyles(styles);
        expect(styles.listStyles.map((s) => [s.name, s.container])).toEqual([['WWNum1', undefined], ['L9', 'automaticStyles']]);
        expect('container' in styles.listStyles[0]).toBe(false);
        const out = ext.dehydrateStyles(styles);
        expect(out.styles.map((e) => e.attrs['style:name'])).toEqual(['WWNum1']);
        expect(out.automaticStyles.map((e) => e.attrs['style:name'])).toEqual(['L9']);
        expect(xml.serialize(out.automaticStyles[0])).toBe(xml.serialize(auto));
    });
    test('the _extras array carrier round-trips as an array', () => {
        const styles = { _extras: [xml.el('text:list-style', { 'style:name': 'X' }, []), xml.el('x:other', {})] };
        ext.hydrateStyles(styles);
        const out = ext.dehydrateStyles(styles);
        expect(out._extras.map((e) => e.name)).toEqual(['x:other', 'text:list-style']);
    });
    test('hydrateList promotes list-header', () => {
        const hEl = xml.el('text:list-header', {}, [xml.el('text:p', {})]);
        const list = { type: 'list', _extras: [hEl] };
        ext.hydrateList(list);
        expect(list.headers).toHaveLength(1);
    });
});
