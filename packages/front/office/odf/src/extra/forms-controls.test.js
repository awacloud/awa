// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { formsControls } from './forms-controls.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = formsControls.factory(xml, helper);

describe('formsControls', () => {
    test('contract', () => {
        expect(formsControls.name).toBe('formsControls');
        expect(formsControls.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parse/render office:forms with full control set', () => {
        const root = xml.el('office:forms', {}, [
            xml.el('form:form', { 'form:name': 'F' }, [
                xml.el('form:button', { 'form:name': 'b1' }),
                xml.el('form:listbox', { 'form:name': 'lb' }, [
                    xml.el('form:option', { 'form:label': 'A' }),
                    xml.el('form:option', { 'form:label': 'B' })
                ]),
                xml.el('form:value-range', { 'form:max-value': '100' })
            ])
        ]);
        const forms = ext.parseForms(root);
        expect(forms.controls).toHaveLength(1);
        expect(forms.controls[0].kind).toBe('form');
        expect(forms.controls[0].children).toHaveLength(3);
        const back = ext.renderForms(forms);
        expect(back.name).toBe('office:forms');
        expect(back.children[0].name).toBe('form:form');
    });
});
