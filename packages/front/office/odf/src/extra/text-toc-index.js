// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of every ODF index
 * element family — `text:table-of-content`, `text:alphabetical-index`,
 * `text:user-index`, `text:object-index`, `text:illustration-index`,
 * `text:table-index`, `text:bibliography` and all their
 * `*-source` / `*-entry-template` / `index-title-template` /
 * `index-body` children.
 *
 * @module odf/extra/text-toc-index
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const textTocIndex = {
    name: 'textTocIndex',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'text:table-of-content', 'text:table-of-content-source',
            'text:table-of-content-entry-template',
            'text:alphabetical-index', 'text:alphabetical-index-source',
            'text:alphabetical-index-entry-template',
            'text:user-index', 'text:user-index-source',
            'text:user-index-entry-template', 'text:user-index-mark',
            'text:user-index-mark-start', 'text:user-index-mark-end',
            'text:object-index', 'text:object-index-source',
            'text:object-index-entry-template',
            'text:illustration-index', 'text:illustration-index-source',
            'text:illustration-index-entry-template',
            'text:table-index', 'text:table-index-source',
            'text:table-index-entry-template',
            'text:bibliography', 'text:bibliography-source',
            'text:bibliography-entry-template', 'text:bibliography-configuration',
            'text:sort-key',
            'text:index-title-template', 'text:index-body', 'text:index-title',
            'text:index-source-styles', 'text:index-source-style',
            'text:index-entry-link-start', 'text:index-entry-link-end',
            'text:index-entry-chapter', 'text:index-entry-page-number',
            'text:index-entry-bibliography', 'text:index-entry-tab-stop',
            'text:index-entry-text', 'text:index-entry-span'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'text:', 'text-index');

        function parseIndex(el) { return f.parseElement(el); }
        function renderIndex(obj) { return f.renderElement(obj); }

        function hydrateBody(body) {
            if (!body || !Array.isArray(body)) return body;
            const out = body.slice();
            for (let i = 0; i < out.length; i++) {
                const c = out[i];
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    out[i] = parseIndex(c);
                }
            }
            return out;
        }

        function dehydrateBody(body) {
            if (!body || !Array.isArray(body)) return body;
            const out = body.slice();
            for (let i = 0; i < out.length; i++) {
                const c = out[i];
                if (c && c.type === 'text-index') {
                    out[i] = renderIndex(c);
                }
            }
            return out;
        }

        return {
            ...f, parseIndex, renderIndex,
            hydrateBody, dehydrateBody
        };
    }
};
