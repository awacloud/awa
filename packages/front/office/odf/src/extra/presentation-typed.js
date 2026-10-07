// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for the `presentation:*`
 * vocabulary.
 *
 * Recognised elements parsed into
 * `{ kind, attrs, children, _extras? }` :
 *
 *   presentation:placeholder, presentation:notes,
 *   presentation:settings, presentation:show, presentation:show-shape,
 *   presentation:show-text, presentation:hide-shape, presentation:hide-text,
 *   presentation:dim, presentation:play, presentation:event-listener,
 *   presentation:event-listeners, presentation:sound,
 *   presentation:date-time, presentation:date-time-decl,
 *   presentation:footer, presentation:footer-decl,
 *   presentation:header, presentation:header-decl,
 *   presentation:animations, presentation:transition.
 *
 * Hook : `hydrateSlide` / `dehydrateSlide`.
 *
 * @module odf/extra/presentation-typed
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const presentationTyped = {
    name: 'presentationTyped',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const PRES_NAMES = new Set([
            'presentation:placeholder',
            'presentation:notes',
            'presentation:settings',
            'presentation:show',
            'presentation:show-shape',
            'presentation:show-text',
            'presentation:hide-shape',
            'presentation:hide-text',
            'presentation:dim',
            'presentation:play',
            'presentation:event-listener',
            'presentation:event-listeners',
            'presentation:sound',
            'presentation:date-time',
            'presentation:date-time-decl',
            'presentation:footer',
            'presentation:footer-decl',
            'presentation:header',
            'presentation:header-decl',
            'presentation:animations',
            'presentation:transition'
        ]);


        function parseNode(el) {
            const out = { kind: el.name, attrs: { ...(el.attrs || {}) }, children: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (PRES_NAMES.has(c.name)) out.children.push(parseNode(c));
                else out.children.push(c);
            }
            const text = xml.textContent(el);
            if (text) out.text = text;
            return out;
        }

        function renderNode(n) {
            const kids = [];
            if (n.text != null && n.text !== '') kids.push(xml.text(String(n.text)));
            for (const c of n.children || []) {
                if (c && c.kind && PRES_NAMES.has(c.kind)) kids.push(renderNode(c));
                else kids.push(c);
            }
            return xml.el(n.kind, { ...(n.attrs || {}) }, kids);
        }

        function isPresentationName(name) { return PRES_NAMES.has(name); }

        // --- Hook : promote/demote `_extras` on slides ---

        function hydrateSlide(slide) {
            if (!slide || !slide._extras) return slide;
            const extras = Array.isArray(slide._extras) ? slide._extras
                : (slide._extras.children || []);
            if (!extras.length) return slide;
            const remaining = [];
            const items = slide.presentation || [];
            for (const c of extras) {
                if (c && c.type === 'element' && PRES_NAMES.has(c.name)) {
                    items.push(parseNode(c));
                } else {
                    remaining.push(c);
                }
            }
            if (items.length) slide.presentation = items;
            if (Array.isArray(slide._extras)) {
                if (remaining.length) slide._extras = remaining;
                else delete slide._extras;
            } else {
                if (remaining.length) slide._extras.children = remaining;
                else delete slide._extras.children;
                if (!Object.keys(slide._extras).length) delete slide._extras;
            }
            return slide;
        }

        function dehydrateSlide(slide) {
            if (!slide || !slide.presentation || !slide.presentation.length) return slide;
            const out = { ...slide };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.presentation) extras.push(renderNode(n));
            delete out.presentation;
            if (Array.isArray(slide._extras) || !slide._extras) out._extras = extras;
            else out._extras = { ...slide._extras, children: extras };
            return out;
        }

        return {
            parseNode, renderNode, isPresentationName,
            hydrateSlide, dehydrateSlide,
            PRES_NAMES
        };
    }
};
