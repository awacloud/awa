// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : extended typed support for the ODF text
 * fields not covered by the core `textFields` module.
 *
 * Recognised elements:
 *   text:variable-decl, text:variable-set, text:variable-get,
 *   text:user-field-decl, text:user-field-get, text:user-field-input,
 *   text:sequence-decl, text:expression,
 *   text:database-display, text:database-next, text:database-row-select,
 *   text:database-row-number, text:database-name,
 *   text:hidden-paragraph, text:hidden-text, text:conditional-text,
 *   text:placeholder, text:execute-macro,
 *   text:dde-connection, text:dde-connection-decl, text:meta-field.
 *
 * @module odf/extra/text-fields-extended
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textFieldsExtended = {
    name: 'textFieldsExtended',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const EXT_FIELDS = new Set([
            'text:variable-decl',
            'text:variable-set',
            'text:variable-get',
            'text:user-field-decl',
            'text:user-field-get',
            'text:user-field-input',
            'text:sequence-decl',
            'text:expression',
            'text:database-display',
            'text:database-next',
            'text:database-row-select',
            'text:database-row-number',
            'text:database-name',
            'text:hidden-paragraph',
            'text:hidden-text',
            'text:conditional-text',
            'text:placeholder',
            'text:execute-macro',
            'text:dde-connection',
            'text:dde-connection-decl',
            'text:meta-field'
        ]);


        function isExtendedFieldName(name) { return EXT_FIELDS.has(name); }

        function parseField(el) {
            const kind = el.name.replace(/^text:/, '');
            const out = { type: 'field-ext', kind, attrs: { ...(el.attrs || {}) } };
            const value = xml.textContent(el);
            if (value) out.value = value;
            const childEls = [];
            for (const c of el.children || []) {
                if (c.type === 'element') childEls.push(c);
            }
            if (childEls.length) out._extras = { children: childEls };
            return out;
        }

        function renderField(f) {
            const name = `text:${f.kind}`;
            const kids = [];
            if (f.value != null && f.value !== '') kids.push(xml.text(String(f.value)));
            if (f._extras && f._extras.children) {
                for (const c of f._extras.children) kids.push(c);
            }
            return xml.el(name, { ...(f.attrs || {}) }, kids);
        }

        // --- Hook : paragraph-level promotion ---

        function hydrateParagraph(p) {
            if (!p || !p._extras) return p;
            const extras = Array.isArray(p._extras) ? p._extras : (p._extras.children || []);
            if (!extras.length) return p;
            const remaining = [];
            const promoted = p.fields || [];
            for (const c of extras) {
                if (c && c.type === 'element' && EXT_FIELDS.has(c.name)) {
                    promoted.push(parseField(c));
                } else {
                    remaining.push(c);
                }
            }
            if (promoted.length) p.fields = promoted;
            if (Array.isArray(p._extras)) {
                if (remaining.length) p._extras = remaining;
                else delete p._extras;
            } else {
                if (remaining.length) p._extras.children = remaining;
                else delete p._extras.children;
                if (!Object.keys(p._extras).length) delete p._extras;
            }
            return p;
        }

        function dehydrateParagraph(p) {
            if (!p || !p.fields || !p.fields.length) return p;
            const out = { ...p };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const f of out.fields) extras.push(renderField(f));
            delete out.fields;
            if (Array.isArray(p._extras) || !p._extras) out._extras = extras;
            else out._extras = { ...p._extras, children: extras };
            return out;
        }

        return {
            isExtendedFieldName, parseField, renderField,
            hydrateParagraph, dehydrateParagraph,
            EXT_FIELDS
        };
    }
};
