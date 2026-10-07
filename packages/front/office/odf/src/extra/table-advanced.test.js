// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { tableAdvanced } from './table-advanced.js';

const xml = fwXml.factory();
const ext = tableAdvanced.factory(xml);

describe('tableAdvanced — factory', () => {
    test('contract', () => {
        expect(tableAdvanced.name).toBe('tableAdvanced');
        expect(tableAdvanced.dependencies).toEqual(['xml']);
    });
});

describe('tableAdvanced — parse/render', () => {
    test('recursive parse of data-pilot-table', () => {
        const el = xml.el('table:data-pilot-table', { 'table:name': 'PT' },
            [
                xml.el('table:data-pilot-field', { 'table:source-field-name': 'A' },
                    [ xml.el('table:data-pilot-member', { 'table:name': 'X' }) ])
            ]);
        const tree = ext.parseNode(el);
        expect(tree.kind).toBe('table:data-pilot-table');
        expect(tree.children).toHaveLength(1);
        expect(tree.children[0].kind).toBe('table:data-pilot-field');
        expect(tree.children[0].children).toHaveLength(1);
    });
    test('render roundtrip', () => {
        const tree = { kind: 'table:filter', attrs: {},
            children: [{ kind: 'table:filter-condition', attrs: { 'table:value': '5' }, children: [] }] };
        const el = ext.renderNode(tree);
        const back = ext.parseNode(el);
        expect(back.children[0].attrs['table:value']).toBe('5');
    });
});

describe('tableAdvanced — hooks', () => {
    test('hydrateTable promotes advanced nodes from _extras', () => {
        const el = xml.el('table:database-range', { 'table:name': 'DB' });
        const t = { type: 'table', _extras: [el] };
        ext.hydrateTable(t);
        expect(t.advanced).toHaveLength(1);
        expect(t.advanced[0].kind).toBe('table:database-range');
    });
    test('dehydrateTable demotes back to _extras', () => {
        const t = { type: 'table', advanced: [
            { kind: 'table:scenario', attrs: {}, children: [] }
        ] };
        const out = ext.dehydrateTable(t);
        expect(out._extras).toHaveLength(1);
        expect(out._extras[0].name).toBe('table:scenario');
    });
});
