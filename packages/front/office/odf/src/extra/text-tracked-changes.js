// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for `<text:tracked-changes>`
 * containers and inline change markers.
 *
 * Promotes the elements `text:tracked-changes`, `text:changed-region`,
 * `text:insertion`, `text:deletion`, `text:format-change`,
 * `text:change`, `text:change-start`, `text:change-end`,
 * `text:change-info` into typed bags.
 *
 * The extension does not modify any core module. It returns an extension
 * object exposing the relevant `hydrateMetadata` / `hydrateParagraph`
 * hooks (and `parseTrackedChanges` / `renderTrackedChanges` helpers).
 *
 * @module odf/extra/text-tracked-changes
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textTrackedChanges = {
    name: 'textTrackedChanges',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const REGION_KINDS = {
            'text:insertion':     'insertion',
            'text:deletion':      'deletion',
            'text:format-change': 'format-change'
        };
        const KIND_TO_TAG = {
            'insertion':     'text:insertion',
            'deletion':      'text:deletion',
            'format-change': 'text:format-change'
        };
        const MARKER_KINDS = new Set([
            'text:change',
            'text:change-start',
            'text:change-end'
        ]);


        function parseChangeInfo(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'dc:creator') out.creator = xml.textContent(c);
                else if (c.name === 'dc:date') out.date = xml.textContent(c);
            }
            return out;
        }

        function renderChangeInfo(info) {
            const kids = [];
            if (info && info.creator != null) {
                kids.push(xml.el('dc:creator', {}, [xml.text(String(info.creator))]));
            }
            if (info && info.date != null) {
                kids.push(xml.el('dc:date', {}, [xml.text(String(info.date))]));
            }
            return xml.el('office:change-info', {}, kids);
        }

        function parseRegion(el) {
            const a = el.attrs || {};
            const reg = { type: 'changed-region', id: a['text:id'] || a['xml:id'] || '' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (REGION_KINDS[c.name]) {
                    reg.kind = REGION_KINDS[c.name];
                    const sub = { attrs: { ...(c.attrs || {}) }, body: [] };
                    for (const k of c.children || []) {
                        if (k.type !== 'element') continue;
                        if (k.name === 'office:change-info') {
                            sub.info = parseChangeInfo(k);
                        } else {
                            sub.body.push(k);
                        }
                    }
                    reg.change = sub;
                }
            }
            return reg;
        }

        function renderRegion(reg) {
            const tag = KIND_TO_TAG[reg.kind] || 'text:insertion';
            const sub = reg.change || {};
            const kids = [];
            if (sub.info) kids.push(renderChangeInfo(sub.info));
            for (const b of sub.body || []) kids.push(b);
            const attrs = {};
            if (reg.id) attrs['text:id'] = reg.id;
            return xml.el('text:changed-region', attrs, [
                xml.el(tag, { ...(sub.attrs || {}) }, kids)
            ]);
        }

        function parseTrackedChanges(el) {
            const regions = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'text:changed-region') regions.push(parseRegion(c));
            }
            return { type: 'tracked-changes', regions };
        }

        function renderTrackedChanges(tc) {
            const regions = (tc.regions || []).map(renderRegion);
            return xml.el('text:tracked-changes', {}, regions);
        }

        function parseChangeMarker(el) {
            const out = { type: 'change-marker', kind: el.name };
            if (el.attrs && el.attrs['text:change-id'] != null) {
                out.id = el.attrs['text:change-id'];
            }
            return out;
        }

        function renderChangeMarker(m) {
            const attrs = {};
            if (m.id != null) attrs['text:change-id'] = m.id;
            return xml.el(m.kind, attrs, []);
        }

        // --- Hooks ---

        function hydrateParagraph(p) {
            if (!p || !p._extras) return p;
            const extras = Array.isArray(p._extras) ? p._extras : p._extras.children || [];
            if (!Array.isArray(extras) || !extras.length) return p;
            const remaining = [];
            const markers = p.changeMarkers || [];
            for (const c of extras) {
                if (c && c.type === 'element' && MARKER_KINDS.has(c.name)) {
                    markers.push(parseChangeMarker(c));
                } else {
                    remaining.push(c);
                }
            }
            if (markers.length) p.changeMarkers = markers;
            if (Array.isArray(p._extras)) {
                if (remaining.length) p._extras = remaining;
                else delete p._extras;
            } else {
                p._extras.children = remaining;
                if (!remaining.length) delete p._extras.children;
                if (!Object.keys(p._extras).length) delete p._extras;
            }
            return p;
        }

        function dehydrateParagraph(p) {
            if (!p || !p.changeMarkers || !p.changeMarkers.length) return p;
            const out = { ...p };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const m of out.changeMarkers) extras.push(renderChangeMarker(m));
            delete out.changeMarkers;
            if (Array.isArray(p._extras) || !p._extras) {
                out._extras = extras;
            } else {
                out._extras = { ...p._extras, children: extras };
            }
            return out;
        }

        function hydrateMetadata(meta) {
            // tracked-changes lives at top of office:text — not in meta —
            // but the hook is exposed for completeness.
            return meta;
        }

        return {
            parseTrackedChanges, renderTrackedChanges,
            parseChangeMarker, renderChangeMarker,
            parseChangeInfo, renderChangeInfo,
            hydrateParagraph, dehydrateParagraph,
            hydrateMetadata,
            MARKER_KINDS
        };
    }
};
