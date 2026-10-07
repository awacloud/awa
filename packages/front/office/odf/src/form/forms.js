// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<office:forms>` container plus the
 * `<form:form>` children carrying typed form controls.
 *
 * Recognised control kinds (all `form:`):
 *
 *   button, text, checkbox, listbox, combobox, radio, date, time,
 *   file, hidden, image-frame, formatted-text, fixed-text, password,
 *   textarea, generic-control, value-range, column, grid, item,
 *   option, properties, property, list-property, connection-resource.
 *
 * Model:
 *
 * ```js
 * {
 *   forms: [
 *     { name?, attrs: {...},
 *       controls: [{ kind, attrs, children?, _extras? }],
 *       _extras? }
 *   ]
 * }
 * ```
 *
 * Controls preserve unknown attributes verbatim. Nested children of a
 * control (e.g. `form:item` inside `form:listbox`) are kept as raw XML
 * (nested control trees are not typed here; the opt-in `formsControls`
 * extra types the `form:*` vocabulary).
 *
 * @module odf/form/forms
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const formForms = {
    name: 'formForms',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const FORM_PREFIX = 'form:';

        const FORM_ELEMENTS = new Set([
            'form:form',
            'form:button', 'form:text', 'form:checkbox', 'form:listbox',
            'form:combobox', 'form:radio', 'form:date', 'form:time',
            'form:file', 'form:hidden', 'form:image-frame',
            'form:formatted-text', 'form:fixed-text', 'form:password',
            'form:textarea', 'form:generic-control', 'form:value-range',
            'form:column', 'form:grid', 'form:item', 'form:option',
            'form:properties', 'form:property', 'form:list-property',
            'form:connection-resource'
        ]);


        /** @param {string} name */
        function isFormElementName(name) {
            return FORM_ELEMENTS.has(name)
                || (typeof name === 'string' && name.startsWith(FORM_PREFIX));
        }

        /**
         * Parse `<office:forms>` and its descendant forms.
         *
         * @param {object} el
         * @returns {{forms: object[]}}
         */
        function parseOfficeForms(el) {
            const out = { forms: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'form:form') out.forms.push(parseForm(c));
            }
            return out;
        }

        function parseForm(el) {
            const a = el.attrs || {};
            const out = { attrs: { ...a }, controls: [] };
            if (a['form:name']) out.name = a['form:name'];
            const xc = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name.startsWith(FORM_PREFIX)) {
                    out.controls.push(parseControl(c));
                } else {
                    xc.push(c);
                }
            }
            if (xc.length) out._extras = { children: xc };
            return out;
        }

        function parseControl(el) {
            const out = {
                kind: el.name,
                attrs: { ...(el.attrs || {}) }
            };
            const kids = [];
            for (const c of el.children || []) {
                if (c.type === 'element') kids.push(c);
            }
            if (kids.length) out.children = kids;
            return out;
        }

        /**
         * Render an `<office:forms>` element.
         *
         * @param {{forms: object[]}} f
         * @returns {object}
         */
        function renderOfficeForms(f) {
            const kids = (f.forms || []).map(renderForm);
            return xml.el('office:forms', {}, kids);
        }

        function renderForm(form) {
            const attrs = { ...(form.attrs || {}) };
            if (form.name != null && !attrs['form:name']) attrs['form:name'] = form.name;
            const kids = (form.controls || []).map(renderControl);
            if (form._extras && form._extras.children) {
                for (const c of form._extras.children) kids.push(c);
            }
            return xml.el('form:form', attrs, kids);
        }

        function renderControl(c) {
            const kids = (c.children || []).slice();
            return xml.el(c.kind, { ...(c.attrs || {}) }, kids);
        }

        return {
            isFormElementName,
            parseOfficeForms, renderOfficeForms,
            parseForm, renderForm,
            parseControl, renderControl
        };
    }
};
