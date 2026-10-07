// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of the full ODF
 * `form:*` control vocabulary (button, text, textarea, fixed-text,
 * image, image-frame, checkbox, radio, listbox, option, combobox, item,
 * password, formatted-text, number, date, time, file, hidden, frame,
 * value-range, grid, column, generic-control, properties, property,
 * list-property, list-value, connection-resource, item-list,
 * button-control, event-listener).
 *
 * @module odf/extra/forms-controls
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const formsControls = {
    name: 'formsControls',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'form:form',
            'form:button', 'form:text', 'form:textarea', 'form:fixed-text',
            'form:image', 'form:image-frame',
            'form:checkbox', 'form:radio',
            'form:listbox', 'form:option', 'form:combobox', 'form:item',
            'form:password', 'form:formatted-text', 'form:number',
            'form:date', 'form:time', 'form:file', 'form:hidden',
            'form:frame', 'form:value-range',
            'form:grid', 'form:column', 'form:generic-control',
            'form:properties', 'form:property',
            'form:list-property', 'form:list-value',
            'form:connection-resource', 'form:item-list',
            'form:button-control', 'form:event-listener'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'form:', 'form-control');

        function parseForms(el) {
            // el is <office:forms> or <form:form>. Walk children, promoting
            // every form:* into typed nodes.
            const out = { type: 'forms', attrs: { ...(el.attrs || {}) }, controls: [] };
            for (const c of el.children || []) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    out.controls.push(f.parseElement(c));
                } else if (c && c.type === 'element') {
                    (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderForms(forms) {
            const kids = (forms.controls || []).map((c) => f.renderElement(c));
            if (forms._extras) for (const e of forms._extras) kids.push(e);
            return xml.el('office:forms', { ...(forms.attrs || {}) }, kids);
        }

        return { ...f, parseForms, renderForms };
    }
};
