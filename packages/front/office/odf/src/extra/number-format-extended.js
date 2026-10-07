// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : extended typed coverage of every
 * `number:*` sub-element used in `<number:*-style>` definitions :
 *
 *   number:number, number:scientific-number, number:fraction,
 *   number:currency-symbol, number:text, number:embedded-text,
 *   number:day, number:day-of-week, number:month, number:year, number:era,
 *   number:week-of-year, number:quarter, number:hours, number:minutes,
 *   number:seconds, number:am-pm,
 *   number:boolean, number:text-content.
 *
 * Each element becomes
 * `{ type: 'number-fragment', kind, attrs, text? }`.
 *
 * @module odf/extra/number-format-extended
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const numberFormatExtended = {
    name: 'numberFormatExtended',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const FRAGMENTS = new Set([
            'number:number', 'number:scientific-number', 'number:fraction',
            'number:currency-symbol', 'number:text', 'number:embedded-text',
            'number:day', 'number:day-of-week', 'number:month',
            'number:year', 'number:era',
            'number:week-of-year', 'number:quarter',
            'number:hours', 'number:minutes', 'number:seconds', 'number:am-pm',
            'number:boolean', 'number:text-content'
        ]);


        function parseFragment(el) {
            if (!el || el.type !== 'element' || !FRAGMENTS.has(el.name)) return null;
            const kind = el.name.slice('number:'.length);
            const out = { type: 'number-fragment', kind, attrs: { ...(el.attrs || {}) } };
            const txt = xml.textContent(el);
            if (txt) out.text = txt;
            return out;
        }

        function renderFragment(f) {
            if (!f || f.kind == null) return null;
            const kids = f.text != null ? [xml.text(String(f.text))] : [];
            return xml.el('number:' + f.kind, { ...(f.attrs || {}) }, kids);
        }

        function hydrateStyle(s) {
            if (!s || !Array.isArray(s.parts)) return s;
            const out = s.parts.slice();
            for (let i = 0; i < out.length; i++) {
                const c = out[i];
                if (c && c.type === 'element' && FRAGMENTS.has(c.name)) {
                    out[i] = parseFragment(c);
                }
            }
            s.parts = out;
            return s;
        }

        function dehydrateStyle(s) {
            if (!s || !Array.isArray(s.parts)) return s;
            const out = s.parts.slice();
            for (let i = 0; i < out.length; i++) {
                const c = out[i];
                if (c && c.type === 'number-fragment') {
                    out[i] = renderFragment(c);
                }
            }
            s.parts = out;
            return s;
        }

        function isFragment(name) { return FRAGMENTS.has(name); }

        return {
            parseFragment, renderFragment, isFragment,
            hydrateStyle, dehydrateStyle,
            FRAGMENTS
        };
    }
};
