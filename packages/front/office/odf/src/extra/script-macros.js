// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of
 * `<office:scripts>` / `<office:script>` and the
 * `script:event-listener` + `office:event-listeners` /
 * `office:event-listener` family.
 *
 * @module odf/extra/script-macros
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const scriptMacros = {
    name: 'scriptMacros',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ELEMENTS = new Set([
            'office:scripts', 'office:script',
            'office:event-listeners', 'office:event-listener',
            'script:event-listener'
        ]);


        function parseScript(el) {
            if (!el || el.type !== 'element' || !ELEMENTS.has(el.name)) return null;
            const out = { type: 'script-node', kind: el.name,
                attrs: { ...(el.attrs || {}) } };
            const kids = [];
            for (const c of el.children || []) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    kids.push(parseScript(c));
                } else { kids.push(c); }
            }
            if (kids.length) out.children = kids;
            return out;
        }

        function renderScript(obj) {
            if (!obj || obj.kind == null) return null;
            const kids = [];
            for (const c of obj.children || []) {
                if (c && c.type === 'script-node') kids.push(renderScript(c));
                else kids.push(c);
            }
            return xml.el(obj.kind, { ...(obj.attrs || {}) }, kids);
        }

        function hydrateMetadata(meta) {
            if (!meta || !meta._extras) return meta;
            const extras = Array.isArray(meta._extras) ? meta._extras : (meta._extras.children || []);
            const remaining = [];
            const promoted = meta.scripts || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(parseScript(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) meta.scripts = promoted;
            if (Array.isArray(meta._extras)) {
                if (remaining.length) meta._extras = remaining; else delete meta._extras;
            } else {
                if (remaining.length) meta._extras.children = remaining; else delete meta._extras.children;
                if (!Object.keys(meta._extras).length) delete meta._extras;
            }
            return meta;
        }

        function dehydrateMetadata(meta) {
            if (!meta || !meta.scripts || !meta.scripts.length) return meta;
            const out = { ...meta };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const s of out.scripts) extras.push(renderScript(s));
            delete out.scripts;
            if (Array.isArray(meta._extras) || !meta._extras) out._extras = extras;
            else out._extras = { ...meta._extras, children: extras };
            return out;
        }

        return {
            parseScript, renderScript,
            hydrateMetadata, dehydrateMetadata,
            ELEMENTS
        };
    }
};
