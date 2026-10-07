// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textMisc } from './text-misc.js';
import { odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();
const helper = odfMiscHelper.factory(xml);
const ext = textMisc.factory(xml, helper);

describe('textMisc — factory', () => {
    test('contract', () => {
        expect(textMisc.name).toBe('textMisc');
        expect(textMisc.dependencies).toEqual(['xml', 'odfMiscHelper']);
        expect(ext._passthrough).toBe(true);
        expect(ext.ELEMENTS.size).toBeGreaterThan(50);
    });
});

describe('textMisc — parse/render', () => {
    test('passthrough roundtrip', () => {
        const el = xml.el('text:author-name', { 'text:fixed': 'true' });
        const p = ext.parseElement(el);
        expect(p._passthrough).toBe(true);
        expect(p.kind).toBe('author-name');
        const back = ext.renderElement(p);
        expect(back.name).toBe('text:author-name');
        expect(back.attrs['text:fixed']).toBe('true');
    });
});

describe('textMisc — hooks', () => {
    test('hydrateParagraph promotes text:* into .text[]', () => {
        const p = { type: 'paragraph', _extras: [xml.el('text:page-count', {})] };
        ext.hydrateParagraph(p);
        expect(p.text).toHaveLength(1);
        expect(p.text[0].kind).toBe('page-count');
    });
    test('dehydrateParagraph reverses', () => {
        const p = { type: 'paragraph',
            text: [{ _passthrough: true, kind: 'page-count', attrs: {}, children: [] }] };
        const out = ext.dehydrateParagraph(p);
        expect(out._extras[0].name).toBe('text:page-count');
    });
});
