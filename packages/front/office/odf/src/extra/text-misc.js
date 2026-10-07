// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : passthrough typed coverage for any
 * residual `text:*` element not handled by a dedicated extra.
 *
 * Each element is kept as `{ kind, attrs, children, _passthrough: true }`
 * so it is preserved on a round-trip. The `hydrateParagraph` hook
 * promotes recognised text:* children of paragraphs/headings out of
 * `_extras` into a typed `text` array. Render reverses.
 *
 * @module odf/extra/text-misc
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfMiscHelper } from './_misc-helper.js';

export const textMisc = {
    name: 'textMisc',
    dependencies: ['xml', 'odfMiscHelper'],
    deps: [xml, odfMiscHelper],

    factory(xml, odfMiscHelper) {
        const ELEMENTS = new Set([
            'text:a', 'text:alphabetical-index-auto-mark-file',
            'text:alphabetical-index-mark', 'text:alphabetical-index-mark-end',
            'text:alphabetical-index-mark-start', 'text:author-initials',
            'text:author-name', 'text:bibliography-mark', 'text:chapter',
            'text:character-count', 'text:creation-date', 'text:creation-time',
            'text:creator', 'text:date', 'text:dde-connection-decl',
            'text:dde-connection-decls', 'text:description', 'text:editing-cycles',
            'text:editing-duration', 'text:file-name', 'text:image-count',
            'text:index-entry-bibliography', 'text:index-entry-chapter',
            'text:index-entry-link-end', 'text:index-entry-link-start',
            'text:index-entry-page-number', 'text:index-entry-span',
            'text:index-entry-tab-stop', 'text:index-entry-text',
            'text:index-title', 'text:initial-creator', 'text:keywords',
            'text:line-break', 'text:measure', 'text:modification-date',
            'text:modification-time', 'text:note', 'text:note-body',
            'text:note-citation', 'text:note-ref', 'text:notes-configuration',
            'text:number', 'text:numbered-paragraph', 'text:object-count',
            'text:outline-level-style', 'text:p', 'text:page-continuation',
            'text:page-count', 'text:page-number', 'text:page-variable-get',
            'text:page-variable-set', 'text:paragraph-count', 'text:print-date',
            'text:print-time', 'text:printed-by', 'text:reference-ref',
            'text:ruby', 'text:ruby-base', 'text:ruby-text', 'text:s',
            'text:script', 'text:sender-city', 'text:sender-company',
            'text:sender-country', 'text:sender-email', 'text:sender-fax',
            'text:sender-firstname', 'text:sender-initials', 'text:sender-lastname',
            'text:sender-phone-private', 'text:sender-phone-work', 'text:sender-position',
            'text:sender-postal-code', 'text:sender-state-or-province',
            'text:sender-street', 'text:sender-title', 'text:sequence',
            'text:sequence-ref', 'text:soft-page-break', 'text:span', 'text:span-extra',
            'text:subject', 'text:tab', 'text:table-count', 'text:table-formula',
            'text:template-name', 'text:time', 'text:title', 'text:toc-mark',
            'text:toc-mark-end', 'text:toc-mark-start', 'text:user-defined',
            'text:user-field-get', 'text:user-field-input', 'text:variable-decl',
            'text:variable-decls', 'text:variable-get', 'text:variable-input',
            'text:variable-set', 'text:word-count'
        ]);
        const NS = 'text:';
        const h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, NS);

        function hydrateParagraph(p) {
            if (!p || !p._extras) return p;
            const extras = Array.isArray(p._extras) ? p._extras : (p._extras.children || []);
            if (!extras.length) return p;
            const remaining = [];
            const promoted = p.text || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(h.parseElement(c));
                } else {
                    remaining.push(c);
                }
            }
            if (promoted.length) p.text = promoted;
            if (Array.isArray(p._extras)) {
                if (remaining.length) p._extras = remaining; else delete p._extras;
            } else {
                if (remaining.length) p._extras.children = remaining; else delete p._extras.children;
                if (!Object.keys(p._extras).length) delete p._extras;
            }
            return p;
        }

        function dehydrateParagraph(p) {
            if (!p || !p.text || !p.text.length) return p;
            const out = { ...p };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const t of out.text) {
                if (t && t._passthrough) extras.push(h.renderElement(t));
            }
            delete out.text;
            if (Array.isArray(p._extras) || !p._extras) out._extras = extras;
            else out._extras = { ...p._extras, children: extras };
            return out;
        }

        return {
            ...h, _passthrough: true,
            hydrateParagraph, dehydrateParagraph
        };
    }
};
