// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { formForms } from './forms.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const f = formForms.factory(xml);
    return { xml, f };
}

describe('formForms module', () => {
    test('factory shape', () => {
        expect(formForms.name).toBe('formForms');
        expect(formForms.dependencies).toEqual(['xml']);
    });

    test('isFormElementName recognises typed and prefixed names', () => {
        const { f } = build();
        expect(f.isFormElementName('form:button')).toBe(true);
        expect(f.isFormElementName('form:textarea')).toBe(true);
        expect(f.isFormElementName('form:custom-unknown')).toBe(true); // prefix-fallback
        expect(f.isFormElementName('text:p')).toBe(false);
    });

    test('parses office:forms with two forms', () => {
        const { xml, f } = build();
        const src =
            '<office:forms>' +
            '<form:form form:name="F1">' +
            '<form:button form:name="b1" form:label="OK"/>' +
            '<form:text form:name="t1" form:value="hello"/>' +
            '</form:form>' +
            '<form:form form:name="F2">' +
            '<form:checkbox form:name="c1"/>' +
            '<form:listbox form:name="lb">' +
            '<form:item form:label="a" form:value="1"/>' +
            '<form:item form:label="b" form:value="2"/>' +
            '</form:listbox>' +
            '</form:form>' +
            '</office:forms>';
        const m = f.parseOfficeForms(xml.parse(src));
        expect(m.forms).toHaveLength(2);
        expect(m.forms[0].name).toBe('F1');
        expect(m.forms[0].controls).toHaveLength(2);
        expect(m.forms[0].controls[0].kind).toBe('form:button');
        expect(m.forms[1].controls[1].kind).toBe('form:listbox');
        expect(m.forms[1].controls[1].children.length).toBe(2);
    });

    test('render roundtrip', () => {
        const { xml, f } = build();
        const m = {
            forms: [
                { name: 'F1', attrs: { 'form:name': 'F1' }, controls: [
                    { kind: 'form:button', attrs: { 'form:name': 'b1', 'form:label': 'OK' } },
                    { kind: 'form:text',   attrs: { 'form:name': 't1', 'form:value': 'hi' } }
                ] }
            ]
        };
        const out = xml.serialize(f.renderOfficeForms(m));
        expect(out).toContain('<office:forms>');
        expect(out).toContain('<form:form form:name="F1">');
        expect(out).toContain('<form:button');
        expect(out).toContain('form:label="OK"');
    });

    test('parse → render → parse stability', () => {
        const { xml, f } = build();
        const src = '<office:forms><form:form form:name="F"><form:button form:name="b" form:label="X"/></form:form></office:forms>';
        const m = f.parseOfficeForms(xml.parse(src));
        const round = f.parseOfficeForms(xml.parse(xml.serialize(f.renderOfficeForms(m))));
        expect(round.forms[0].controls[0].attrs['form:label']).toBe('X');
    });
});
