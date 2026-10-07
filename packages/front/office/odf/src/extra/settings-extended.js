// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : deeper typing for the ODF
 * `<office:settings>` block — `config:config-item`,
 * `config:config-item-set`, `config:config-item-map-named`,
 * `config:config-item-map-indexed`, `config:config-item-map-entry`.
 *
 * Each is typed as
 * `{ type: 'config-node', kind, attrs, text?, items? }`.
 *
 * @module odf/extra/settings-extended
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const settingsExtended = {
    name: 'settingsExtended',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const CONFIG_TAGS = new Set([
            'config:config-item',
            'config:config-item-set',
            'config:config-item-map-named',
            'config:config-item-map-indexed',
            'config:config-item-map-entry'
        ]);


        function parseConfig(el) {
            if (!el || el.type !== 'element' || !CONFIG_TAGS.has(el.name)) return null;
            const kind = el.name.slice('config:'.length);
            const out = { type: 'config-node', kind, attrs: { ...(el.attrs || {}) } };
            if (kind === 'config-item') {
                out.text = xml.textContent(el);
            } else {
                const items = [];
                for (const c of el.children || []) {
                    if (c && c.type === 'element' && CONFIG_TAGS.has(c.name)) {
                        items.push(parseConfig(c));
                    }
                }
                if (items.length) out.items = items;
            }
            return out;
        }

        function renderConfig(obj) {
            if (!obj || obj.kind == null) return null;
            const name = 'config:' + obj.kind;
            if (obj.kind === 'config-item') {
                return xml.el(name, { ...(obj.attrs || {}) },
                    obj.text != null ? [xml.text(String(obj.text))] : []);
            }
            const kids = (obj.items || []).map(renderConfig);
            return xml.el(name, { ...(obj.attrs || {}) }, kids);
        }

        function hydrateSettings(s) {
            if (!s || !s._extras) return s;
            const extras = Array.isArray(s._extras) ? s._extras : (s._extras.children || []);
            const remaining = [];
            const promoted = s.config || [];
            for (const c of extras) {
                if (c && c.type === 'element' && CONFIG_TAGS.has(c.name)) {
                    promoted.push(parseConfig(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) s.config = promoted;
            if (Array.isArray(s._extras)) {
                if (remaining.length) s._extras = remaining; else delete s._extras;
            } else {
                if (remaining.length) s._extras.children = remaining; else delete s._extras.children;
                if (!Object.keys(s._extras).length) delete s._extras;
            }
            return s;
        }

        function dehydrateSettings(s) {
            if (!s || !s.config || !s.config.length) return s;
            const out = { ...s };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const c of out.config) extras.push(renderConfig(c));
            delete out.config;
            if (Array.isArray(s._extras) || !s._extras) out._extras = extras;
            else out._extras = { ...s._extras, children: extras };
            return out;
        }

        return {
            parseConfig, renderConfig,
            hydrateSettings, dehydrateSettings,
            CONFIG_TAGS
        };
    }
};
