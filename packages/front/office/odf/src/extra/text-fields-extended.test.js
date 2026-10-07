// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textFieldsExtended } from './text-fields-extended.js';

const xml = fwXml.factory();
const ext = textFieldsExtended.factory(xml);

describe('textFieldsExtended — factory', () => {
    test('contract', () => {
        expect(textFieldsExtended.name).toBe('textFieldsExtended');
        expect(textFieldsExtended.dependencies).toEqual(['xml']);
    });
});

describe('textFieldsExtended — parse/render', () => {
    test('isExtendedFieldName covers variable-set', () => {
        expect(ext.isExtendedFieldName('text:variable-set')).toBe(true);
        expect(ext.isExtendedFieldName('text:date')).toBe(false);
    });
    test('roundtrip variable-set', () => {
        const f = { type: 'field-ext', kind: 'variable-set',
            attrs: { 'text:name': 'X', 'office:value-type': 'string' }, value: 'hello' };
        const el = ext.renderField(f);
        const parsed = ext.parseField(el);
        expect(parsed.kind).toBe('variable-set');
        expect(parsed.value).toBe('hello');
        expect(parsed.attrs['text:name']).toBe('X');
    });
});

describe('textFieldsExtended — hooks', () => {
    test('hydrateParagraph promotes extended fields from _extras', () => {
        const el = xml.el('text:placeholder', { 'text:placeholder-type': 'text' },
            [xml.text('<name>')]);
        const p = { type: 'paragraph', _extras: [el] };
        ext.hydrateParagraph(p);
        expect(p.fields).toHaveLength(1);
        expect(p.fields[0].kind).toBe('placeholder');
        expect(p.fields[0].value).toBe('<name>');
    });
    test('dehydrateParagraph emits the field back into _extras', () => {
        const p = { type: 'paragraph', fields: [
            { type: 'field-ext', kind: 'expression',
              attrs: { 'text:formula': '1+2' }, value: '3' }
        ] };
        const out = ext.dehydrateParagraph(p);
        expect(out._extras).toHaveLength(1);
        expect(out._extras[0].name).toBe('text:expression');
        expect(out.fields).toBeUndefined();
    });
});
