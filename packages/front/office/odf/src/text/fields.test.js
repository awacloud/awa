// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textFields } from './fields.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const f = textFields.factory(xml);
    return { xml, f };
}

describe('textFields module', () => {
    test('factory shape', () => {
        expect(textFields.name).toBe('textFields');
        expect(textFields.dependencies).toEqual(['xml']);
        expect(typeof textFields.factory).toBe('function');
    });

    describe('isFieldName', () => {
        test('recognises common fields', () => {
            const { f } = build();
            expect(f.isFieldName('text:date')).toBe(true);
            expect(f.isFieldName('text:page-number')).toBe(true);
            expect(f.isFieldName('text:variable-set')).toBe(true);
            expect(f.isFieldName('text:span')).toBe(false);
        });
    });

    describe('parseField / renderField', () => {
        test('roundtrip with attrs and value', () => {
            const { xml, f } = build();
            const el = xml.parse('<text:date style:data-style-name="N1">2026-05-13</text:date>');
            const fd = f.parseField(el);
            expect(fd.kind).toBe('date');
            expect(fd.value).toBe('2026-05-13');
            expect(fd.attrs['style:data-style-name']).toBe('N1');
            const out = xml.serialize(f.renderField(fd));
            expect(out).toContain('<text:date');
            expect(out).toContain('2026-05-13');
        });
        test('variable-set roundtrip', () => {
            const { xml, f } = build();
            const fd = f.parseField(xml.parse('<text:variable-set text:name="x" office:value="3"/>'));
            expect(fd.kind).toBe('variable-set');
            expect(fd.attrs['text:name']).toBe('x');
        });
    });
});
