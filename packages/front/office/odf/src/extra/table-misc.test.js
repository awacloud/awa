// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { tableMisc } from './table-misc.js';
import { odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();
const helper = odfMiscHelper.factory(xml);
const ext = tableMisc.factory(xml, helper);

describe('tableMisc', () => {
    test('contract', () => {
        expect(tableMisc.name).toBe('tableMisc');
        expect(tableMisc.dependencies).toEqual(['xml', 'odfMiscHelper']);
    });
    test('parse/render table:title', () => {
        const el = xml.el('table:title', {});
        const p = ext.parseElement(el);
        expect(p.kind).toBe('title');
        expect(ext.renderElement(p).name).toBe('table:title');
    });
    test('hydrate/dehydrateTable roundtrip', () => {
        const t = { _extras: [xml.el('table:named-expression', { 'table:name': 'X' })] };
        ext.hydrateTable(t);
        expect(t.tableNodes).toHaveLength(1);
        const back = ext.dehydrateTable(t);
        expect(back._extras[0].name).toBe('table:named-expression');
    });
});
