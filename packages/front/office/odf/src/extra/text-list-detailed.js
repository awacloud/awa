// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for `text:list-style`,
 * `text:list-level-style-*`, `text:outline-style` and `text:list-header`.
 *
 * Promotes these elements from `styles._extras` (or `_extras` on any
 * carrier) into typed bags : `{ type, name, levels: [...], attrs }`.
 *
 * Hooks : `hydrateStyles` / `dehydrateStyles` on the styles document,
 * plus `hydrateList` / `dehydrateList` to promote `text:list-header`
 * entries inside a list body.
 *
 * @module odf/extra/text-list-detailed
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textListDetailed = {
    name: 'textListDetailed',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const LIST_STYLE_NAMES = new Set([
            'text:list-style',
            'text:outline-style'
        ]);
        const LEVEL_KIND = {
            'text:list-level-style-number': 'level-number',
            'text:list-level-style-bullet': 'level-bullet',
            'text:list-level-style-image':  'level-image',
            'text:outline-level-style':     'level-outline'
        };
        const LEVEL_KIND_TO_TAG = {
            'level-number':  'text:list-level-style-number',
            'level-bullet':  'text:list-level-style-bullet',
            'level-image':   'text:list-level-style-image',
            'level-outline': 'text:outline-level-style'
        };


        function parseLevel(el) {
            const out = {
                type: LEVEL_KIND[el.name] || 'level-other',
                attrs: { ...(el.attrs || {}) }
            };
            const props = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                props.push(c);
            }
            if (props.length) out._extras = { children: props };
            return out;
        }

        function renderLevel(lvl) {
            const tag = LEVEL_KIND_TO_TAG[lvl.type] || 'text:list-level-style-number';
            const kids = (lvl._extras && lvl._extras.children) || [];
            return xml.el(tag, { ...(lvl.attrs || {}) }, kids);
        }

        function parseListStyle(el) {
            const out = {
                type: el.name === 'text:outline-style' ? 'outline-style' : 'list-style',
                name: (el.attrs && (el.attrs['style:name'] || el.attrs['style:display-name'])) || '',
                attrs: { ...(el.attrs || {}) },
                levels: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (LEVEL_KIND[c.name]) out.levels.push(parseLevel(c));
            }
            return out;
        }

        function renderListStyle(ls) {
            const tag = ls.type === 'outline-style' ? 'text:outline-style' : 'text:list-style';
            const kids = (ls.levels || []).map(renderLevel);
            return xml.el(tag, { ...(ls.attrs || {}) }, kids);
        }

        function parseListHeader(el) {
            const out = { type: 'list-header', attrs: { ...(el.attrs || {}) }, children: [] };
            for (const c of el.children || []) {
                if (c.type === 'element') out.children.push(c);
            }
            return out;
        }
        function renderListHeader(h) {
            return xml.el('text:list-header', { ...(h.attrs || {}) }, h.children || []);
        }

        // --- Hooks ---

        // A list or outline style's usual container: office:styles. One met
        // elsewhere records it (`container`) so it goes back there.
        const HOME = 'styles';

        function hydrateStyles(styles) {
            if (!styles) return styles;
            const containers = ['styles', 'automaticStyles', 'masterStyles'];
            for (const k of containers) {
                if (!Array.isArray(styles[k])) continue;
                const remaining = [];
                const listStyles = styles.listStyles || [];
                for (const s of styles[k]) {
                    if (s && s.type === 'element' && LIST_STYLE_NAMES.has(s.name)) {
                        const ls = parseListStyle(s);
                        if (k !== HOME) ls.container = k;
                        listStyles.push(ls);
                    } else {
                        remaining.push(s);
                    }
                }
                if (listStyles.length) styles.listStyles = listStyles;
                styles[k] = remaining;
            }
            // Also accept _extras carriers
            if (Array.isArray(styles._extras)) {
                const remaining = [];
                const listStyles = styles.listStyles || [];
                for (const s of styles._extras) {
                    if (s && s.type === 'element' && LIST_STYLE_NAMES.has(s.name)) {
                        const ls = parseListStyle(s);
                        ls.container = '_extras';
                        listStyles.push(ls);
                    } else {
                        remaining.push(s);
                    }
                }
                if (listStyles.length) styles.listStyles = listStyles;
                if (remaining.length) styles._extras = remaining;
                else delete styles._extras;
            }
            return styles;
        }

        // Each list style back into its container, after the elements left
        // there; `_extras` (the root's other children) is never replaced.
        // The given model is not changed: the containers are copied.
        function dehydrateStyles(styles) {
            if (!styles || !styles.listStyles || !styles.listStyles.length) return styles;
            const out = { ...styles };
            for (const ls of out.listStyles) {
                const k = ls.container || HOME;
                // the first push into a container copies it
                if (out[k] === styles[k]) out[k] = Array.isArray(styles[k]) ? [...styles[k]] : [];
                out[k].push(renderListStyle(ls));
            }
            delete out.listStyles;
            return out;
        }

        function hydrateList(list) {
            if (!list || !list._extras) return list;
            const extras = Array.isArray(list._extras) ? list._extras : list._extras.children || [];
            if (!extras.length) return list;
            const remaining = [];
            const headers = list.headers || [];
            for (const c of extras) {
                if (c && c.type === 'element' && c.name === 'text:list-header') {
                    headers.push(parseListHeader(c));
                } else {
                    remaining.push(c);
                }
            }
            if (headers.length) list.headers = headers;
            if (Array.isArray(list._extras)) {
                if (remaining.length) list._extras = remaining;
                else delete list._extras;
            } else if (remaining.length !== extras.length) {
                // the promoted headers leave `children` (dehydrate puts them back)
                if (remaining.length) list._extras.children = remaining;
                else delete list._extras.children;
                if (!Object.keys(list._extras).length) delete list._extras;
            }
            return list;
        }

        function dehydrateList(list) {
            if (!list || !list.headers || !list.headers.length) return list;
            const out = { ...list };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const h of out.headers) extras.push(renderListHeader(h));
            delete out.headers;
            if (Array.isArray(list._extras)) out._extras = extras;
            else out._extras = { ...(list._extras || {}), children: extras };
            return out;
        }

        return {
            parseListStyle, renderListStyle,
            parseLevel, renderLevel,
            parseListHeader, renderListHeader,
            hydrateStyles, dehydrateStyles,
            hydrateList, dehydrateList,
            LIST_STYLE_NAMES, LEVEL_KIND
        };
    }
};
