// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for `text:meta`,
 * `text:meta-field`, `text:rdf-metadata` plus paragraph-level RDFa
 * attributes (`xhtml:about`, `xhtml:property`, `xhtml:content`,
 * `xhtml:datatype`).
 *
 * @module odf/extra/text-meta-extended
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textMetaExtended = {
    name: 'textMetaExtended',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const META_KINDS = new Set([
            'text:meta', 'text:meta-field', 'text:rdf-metadata'
        ]);

        const RDFA_ATTRS = ['xhtml:about', 'xhtml:property', 'xhtml:content', 'xhtml:datatype'];


        function parseMeta(el) {
            const out = {
                type: 'text-meta', kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: [...(el.children || [])]
            };
            return out;
        }

        function renderMeta(m) {
            return xml.el(m.kind, { ...(m.attrs || {}) }, m.children || []);
        }

        function pickRdfa(attrs) {
            const out = {};
            if (!attrs) return out;
            for (const a of RDFA_ATTRS) {
                if (attrs[a] != null) out[a] = attrs[a];
            }
            return out;
        }

        function hydrateParagraph(p) {
            if (!p) return p;
            // Promote RDFa attrs into typed bag if present in raw attrs.
            const rdfa = pickRdfa(p.attrs);
            if (Object.keys(rdfa).length) p.rdfa = rdfa;
            // Promote text:meta-* children from _extras.
            if (p._extras) {
                const extras = Array.isArray(p._extras) ? p._extras : (p._extras.children || []);
                const remaining = [];
                const promoted = p.metaNodes || [];
                for (const c of extras) {
                    if (c && c.type === 'element' && META_KINDS.has(c.name)) {
                        promoted.push(parseMeta(c));
                    } else { remaining.push(c); }
                }
                if (promoted.length) p.metaNodes = promoted;
                if (Array.isArray(p._extras)) {
                    if (remaining.length) p._extras = remaining; else delete p._extras;
                } else {
                    if (remaining.length) p._extras.children = remaining; else delete p._extras.children;
                    if (!Object.keys(p._extras).length) delete p._extras;
                }
            }
            return p;
        }

        function dehydrateParagraph(p) {
            if (!p) return p;
            const out = { ...p };
            if (out.rdfa) {
                out.attrs = { ...(out.attrs || {}), ...out.rdfa };
                delete out.rdfa;
            }
            if (out.metaNodes && out.metaNodes.length) {
                const extras = Array.isArray(out._extras) ? [...out._extras]
                    : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
                for (const n of out.metaNodes) extras.push(renderMeta(n));
                delete out.metaNodes;
                if (Array.isArray(p._extras) || !p._extras) out._extras = extras;
                else out._extras = { ...p._extras, children: extras };
            }
            return out;
        }

        return {
            parseMeta, renderMeta, pickRdfa,
            hydrateParagraph, dehydrateParagraph,
            META_KINDS, RDFA_ATTRS
        };
    }
};
