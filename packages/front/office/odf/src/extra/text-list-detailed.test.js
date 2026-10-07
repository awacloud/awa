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
    test('dehydrateStyles emits list-styles back into _extras', () => {
        const styles = {
            listStyles: [{ type: 'list-style', name: 'L', attrs: {}, levels: [] }]
        };
        const out = ext.dehydrateStyles(styles);
        expect(out._extras).toHaveLength(1);
        expect(out.listStyles).toBeUndefined();
    });
    test('hydrateList promotes list-header', () => {
        const hEl = xml.el('text:list-header', {}, [xml.el('text:p', {})]);
        const list = { type: 'list', _extras: [hEl] };
        ext.hydrateList(list);
        expect(list.headers).toHaveLength(1);
    });
});
