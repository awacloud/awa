// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<text:tracked-changes>` container plus
 * inline change markers (`text:change`, `text:change-start`,
 * `text:change-end`).
 *
 * Two surfaces:
 *
 * 1. **Container** at the top of `<office:text>`:
 *    `<text:tracked-changes>` holding `<text:changed-region>` entries.
 *    Each region wraps either `<text:insertion>`, `<text:deletion>`,
 *    or `<text:format-change>` carrying an `<office:change-info>` with
 *    `dc:creator`, `dc:date`, and an optional body of paragraphs
 *    (preserved as raw XML).
 *
 * 2. **Inline markers** placed inside paragraphs to point at a region:
 *    `<text:change>`, `<text:change-start>`, `<text:change-end>`.
 *
 * Container model:
 *
 * ```js
 * {
 *   trackedChanges: [
 *     { id, kind: 'insertion' | 'deletion' | 'format-change',
 *       creator?, date?, body?: [rawXml…], _extras? }
 *   ]
 * }
 * ```
 *
 * Marker model: `{ type: 'change-marker', kind, id?, _extras? }`.
 *
 * @module odf/text/tracked
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textTracked = {
    name: 'textTracked',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const MARKER_KINDS = new Set([
            'text:change',
            'text:change-start',
            'text:change-end'
        ]);

        const REGION_KINDS = {
            'text:insertion': 'insertion',
            'text:deletion': 'deletion',
            'text:format-change': 'format-change'
        };

        const KIND_TO_TAG = {
            'insertion': 'text:insertion',
            'deletion': 'text:deletion',
            'format-change': 'text:format-change'
        };


        /** @param {string} name */
        function isChangeMarkerName(name) {
            return MARKER_KINDS.has(name);
        }

        /**
         * Parse an inline change marker element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseChangeMarker(el) {
            const a = el.attrs || {};
            const out = { type: 'change-marker', kind: el.name };
            if (a['text:change-id'] != null) out.id = a['text:change-id'];
            const xa = {};
            let any = false;
            for (const k of Object.keys(a)) {
                if (k !== 'text:change-id') { xa[k] = a[k]; any = true; }
            }
            if (any) out._extras = { attrs: xa };
            return out;
        }

        /**
         * Render an inline change marker model.
         *
         * @param {object} m
         * @returns {object}
         */
        function renderChangeMarker(m) {
            const attrs = {};
            if (m.id != null) attrs['text:change-id'] = m.id;
            if (m._extras && m._extras.attrs) {
                for (const k of Object.keys(m._extras.attrs)) attrs[k] = m._extras.attrs[k];
            }
            return xml.el(m.kind, attrs, []);
        }

        /**
         * Parse a `<text:tracked-changes>` element.
         *
         * @param {object} el
         * @returns {{trackedChanges: object[]}}
         */
        function parseTrackedChanges(el) {
            const out = { trackedChanges: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'text:changed-region') {
                    out.trackedChanges.push(parseRegion(c));
                }
            }
            return out;
        }

        function parseRegion(el) {
            const a = el.attrs || {};
            const reg = { id: a['text:id'] || a['xml:id'] || '' };
            const xa = {};
            let any = false;
            for (const k of Object.keys(a)) {
                if (k !== 'text:id' && k !== 'xml:id') { xa[k] = a[k]; any = true; }
            }
            let bodyXml = null;
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (REGION_KINDS[c.name]) {
                    reg.kind = REGION_KINDS[c.name];
                    // change-info
                    for (const k of c.children || []) {
                        if (k.type !== 'element') continue;
                        if (k.name === 'office:change-info') {
                            parseChangeInfo(k, reg);
                        } else {
                            if (!bodyXml) bodyXml = [];
                            bodyXml.push(k);
                        }
                    }
                    // Preserve unknown attrs on the change wrapper
                    for (const ak of Object.keys(c.attrs || {})) {
                        xa['_changeAttr:' + ak] = c.attrs[ak];
                        any = true;
                    }
                }
            }
            if (bodyXml) reg.body = bodyXml;
            if (any) reg._extras = { attrs: xa };
            return reg;
        }

        function parseChangeInfo(el, reg) {
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'dc:creator') reg.creator = xml.textContent(c);
                else if (c.name === 'dc:date') reg.date = xml.textContent(c);
            }
        }

        /**
         * Render a tracked-changes container model.
         *
         * @param {{trackedChanges: object[]}} t
         * @returns {object}
         */
        function renderTrackedChanges(t) {
            const regions = (t.trackedChanges || []).map(renderRegion);
            return xml.el('text:tracked-changes', {}, regions);
        }

        function renderRegion(r) {
            const regAttrs = {};
            if (r.id) regAttrs['text:id'] = r.id;
            const changeAttrs = {};
            if (r._extras && r._extras.attrs) {
                for (const k of Object.keys(r._extras.attrs)) {
                    if (k.startsWith('_changeAttr:')) {
                        changeAttrs[k.slice('_changeAttr:'.length)] = r._extras.attrs[k];
                    } else {
                        regAttrs[k] = r._extras.attrs[k];
                    }
                }
            }
            const ciChildren = [];
            if (r.creator != null) ciChildren.push(xml.el('dc:creator', {}, [xml.text(String(r.creator))]));
            if (r.date != null) ciChildren.push(xml.el('dc:date', {}, [xml.text(String(r.date))]));
            const changeKids = [xml.el('office:change-info', {}, ciChildren)];
            if (r.body) for (const b of r.body) changeKids.push(b);
            const tag = KIND_TO_TAG[r.kind] || 'text:insertion';
            return xml.el('text:changed-region', regAttrs, [
                xml.el(tag, changeAttrs, changeKids)
            ]);
        }

        return {
            isChangeMarkerName, parseChangeMarker, renderChangeMarker,
            parseTrackedChanges, renderTrackedChanges,
            MARKER_KINDS
        };
    }
};
