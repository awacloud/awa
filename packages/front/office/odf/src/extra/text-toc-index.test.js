// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textTocIndex } from './text-toc-index.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = textTocIndex.factory(xml, helper);

describe('textTocIndex', () => {
    test('contract', () => {
        expect(textTocIndex.name).toBe('textTocIndex');
        expect(textTocIndex.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('roundtrip text:table-of-content + nested source + entry-template', () => {
        const el = xml.el('text:table-of-content', {}, [
            xml.el('text:table-of-content-source', { 'text:outline-level': '3' }, [
                xml.el('text:table-of-content-entry-template',
                    { 'text:outline-level': '1', 'text:style-name': 'Index' }, [])
            ])
        ]);
        const p = ext.parseIndex(el);
        expect(p.kind).toBe('table-of-content');
        expect(p.children).toHaveLength(1);
        expect(p.children[0].kind).toBe('table-of-content-source');
        const back = ext.renderIndex(p);
        expect(back.name).toBe('text:table-of-content');
        expect(back.children[0].name).toBe('text:table-of-content-source');
    });
    test('hydrateBody promotes index nodes', () => {
        const body = [xml.el('text:bibliography', {}, []), { type: 'paragraph' }];
        const out = ext.hydrateBody(body);
        expect(out[0].type).toBe('text-index');
        expect(out[0].kind).toBe('bibliography');
    });
});
