// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { metaExtended } from './meta-extended.js';

const xml = fwXml.factory();
const ext = metaExtended.factory(xml);

describe('metaExtended', () => {
    test('contract', () => {
        expect(metaExtended.name).toBe('metaExtended');
        expect(metaExtended.dependencies).toEqual(['xml']);
    });
    test('parse/render full meta body', () => {
        const meta = xml.el('office:meta', {}, [
            xml.el('dc:title', {}, [xml.text('Hi')]),
            xml.el('meta:generator', {}, [xml.text('Awa/1.0')]),
            xml.el('meta:keyword', {}, [xml.text('odf')]),
            xml.el('meta:keyword', {}, [xml.text('test')]),
            xml.el('meta:document-statistic', { 'meta:word-count': '42' }),
            xml.el('meta:user-defined', { 'meta:name': 'Dept' }, [xml.text('R&D')])
        ]);
        const m = ext.parseMetaBody(meta);
        expect(m.text.title).toBe('Hi');
        expect(m.text.generator).toBe('Awa/1.0');
        expect(m.text.keywords).toEqual(['odf', 'test']);
        expect(m.attrs.documentStatistic['meta:word-count']).toBe('42');
        expect(m.attrs.userDefined[0].text).toBe('R&D');
        const back = ext.renderMetaBody(m);
        expect(back.name).toBe('office:meta');
        const names = back.children.map((c) => c.name);
        expect(names).toContain('dc:title');
        expect(names).toContain('meta:keyword');
        expect(names).toContain('meta:user-defined');
    });
});
