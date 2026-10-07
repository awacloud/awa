// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : extended typed support for advanced
 * `<text:section>` features — `text:section-source`, `text:section-decl`,
 * `text:dde-connection` inside a section, plus the
 * `text:protected` / `text:condition` / `text:display` attributes.
 *
 * @module odf/extra/text-sections-advanced
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const textSectionsAdvanced = {
    name: 'textSectionsAdvanced',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'text:section-source', 'text:section-decl', 'text:dde-connection',
            'text:dde-connection-decl', 'text:dde-connection-decls'
        ]);

        const SECTION_ATTRS = ['text:protected', 'text:condition', 'text:display', 'text:protection-key'];

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'text:', 'text-section-aux');

        function hydrateSection(s) {
            if (!s) return s;
            if (s.attrs) {
                const promoted = {};
                for (const a of SECTION_ATTRS) {
                    if (s.attrs[a] != null) promoted[a] = s.attrs[a];
                }
                if (Object.keys(promoted).length) s.protection = promoted;
            }
            if (s._extras) {
                const extras = Array.isArray(s._extras) ? s._extras : (s._extras.children || []);
                const remaining = [];
                const promoted = s.sectionNodes || [];
                for (const c of extras) {
                    if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                        promoted.push(f.parseElement(c));
                    } else { remaining.push(c); }
                }
                if (promoted.length) s.sectionNodes = promoted;
                if (Array.isArray(s._extras)) {
                    if (remaining.length) s._extras = remaining; else delete s._extras;
                } else {
                    if (remaining.length) s._extras.children = remaining; else delete s._extras.children;
                    if (!Object.keys(s._extras).length) delete s._extras;
                }
            }
            return s;
        }

        function dehydrateSection(s) {
            if (!s) return s;
            const out = { ...s };
            if (out.protection) {
                out.attrs = { ...(out.attrs || {}), ...out.protection };
                delete out.protection;
            }
            if (out.sectionNodes && out.sectionNodes.length) {
                const extras = Array.isArray(out._extras) ? [...out._extras]
                    : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
                for (const n of out.sectionNodes) extras.push(f.renderElement(n));
                delete out.sectionNodes;
                if (Array.isArray(s._extras) || !s._extras) out._extras = extras;
                else out._extras = { ...s._extras, children: extras };
            }
            return out;
        }

        return {
            ...f,
            hydrateSection, dehydrateSection,
            SECTION_ATTRS
        };
    }
};
