// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textMetaExtended } from './text-meta-extended.js';

const xml = fwXml.factory();
const ext = textMetaExtended.factory(xml);

describe('textMetaExtended', () => {
    test('contract', () => {
        expect(textMetaExtended.name).toBe('textMetaExtended');
        expect(textMetaExtended.dependencies).toEqual(['xml']);
    });
    test('parse/render text:meta', () => {
        const el = xml.el('text:meta', { 'xml:id': 'm1' });
        const p = ext.parseMeta(el);
        expect(p.kind).toBe('text:meta');
        const back = ext.renderMeta(p);
        expect(back.name).toBe('text:meta');
        expect(back.attrs['xml:id']).toBe('m1');
    });
    test('pickRdfa filters attrs', () => {
        const r = ext.pickRdfa({ 'xhtml:about': '#x', 'xhtml:property': 'dc:title', foo: 'bar' });
        expect(r['xhtml:about']).toBe('#x');
        expect(r.foo).toBeUndefined();
    });
    test('hydrate/dehydrate paragraph RDFa', () => {
        const p = { type: 'paragraph', attrs: { 'xhtml:about': '#x' } };
        ext.hydrateParagraph(p);
        expect(p.rdfa['xhtml:about']).toBe('#x');
        const out = ext.dehydrateParagraph(p);
        expect(out.attrs['xhtml:about']).toBe('#x');
    });
    test('hydrate promotes text:meta-field from _extras', () => {
        const p = { type: 'paragraph', _extras: [xml.el('text:meta-field', { 'xml:id': 'a' })] };
        ext.hydrateParagraph(p);
        expect(p.metaNodes).toHaveLength(1);
    });
});
