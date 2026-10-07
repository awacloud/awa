// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: workbook-level config (bookViews, fileVersion,
 * fileSharing, fileRecoveryPr, oleSize, protection, smartTagPr,
 * smartTagTypes, webPublishing, webPublishObjects, customWorkbookViews).
 *
 * Element names use no namespace prefix — SpreadsheetML's default
 * namespace is `http://schemas.openxmlformats.org/spreadsheetml/2006/main`.
 *
 * @module ooxml/extra/sml-workbook-config
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const smlWorkbookConfig = {
    name: 'smlWorkbookConfig',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        function strAttrs(o) {
            const r = {};
            for (const k of Object.keys(o || {})) if (o[k] != null) r[k] = String(o[k]);
            return r;
        }

        function parseWorkbookView(node) {
            return { ...node.attrs };
        }
        function renderWorkbookView(v) {
            return xml.el('workbookView', strAttrs(v));
        }

        function parseCustomWorkbookView(node) {
            return { ...node.attrs };
        }
        function renderCustomWorkbookView(v) {
            return xml.el('customWorkbookView', strAttrs(v));
        }

        function parseSmartTagTypes(node) {
            const items = [];
            for (const c of node.children || []) {
                if (c.type === 'element' && c.name === 'smartTagType') items.push({ ...c.attrs });
            }
            return items;
        }
        function renderSmartTagTypes(arr) {
            return xml.el('smartTagTypes', {},
                (arr || []).map(t => xml.el('smartTagType', strAttrs(t))));
        }

        function parseWebPublishObjects(node) {
            const items = [];
            for (const c of node.children || []) {
                if (c.type === 'element' && c.name === 'webPublishObject') items.push({ ...c.attrs });
            }
            return { count: node.attrs.count, items };
        }
        function renderWebPublishObjects(o) {
            const a = {};
            if (o.count != null) a.count = String(o.count);
            return xml.el('webPublishObjects', a,
                (o.items || []).map(i => xml.el('webPublishObject', strAttrs(i))));
        }

        function parseWorkbookConfig(rootChildren) {
            const out = {};
            for (const c of rootChildren) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'fileVersion':         out.fileVersion = { ...c.attrs }; continue;
                    case 'fileSharing':         out.fileSharing = { ...c.attrs }; continue;
                    case 'fileRecoveryPr':      out.fileRecoveryPr = { ...c.attrs }; continue;
                    case 'oleSize':             out.oleSize = { ...c.attrs }; continue;
                    case 'protection':          out.protection = { ...c.attrs }; continue;
                    case 'workbookProtection':  out.workbookProtection = { ...c.attrs }; continue;
                    case 'smartTagPr':          out.smartTagPr = { ...c.attrs }; continue;
                    case 'webPublishing':       out.webPublishing = { ...c.attrs }; continue;
                }
                if (c.name === 'bookViews') {
                    out.bookViews = [];
                    for (const v of c.children || []) {
                        if (v.type === 'element' && v.name === 'workbookView') {
                            out.bookViews.push(parseWorkbookView(v));
                        }
                    }
                    continue;
                }
                if (c.name === 'customWorkbookViews') {
                    out.customWorkbookViews = [];
                    for (const v of c.children || []) {
                        if (v.type === 'element' && v.name === 'customWorkbookView') {
                            out.customWorkbookViews.push(parseCustomWorkbookView(v));
                        }
                    }
                    continue;
                }
                if (c.name === 'smartTagTypes') { out.smartTagTypes = parseSmartTagTypes(c); continue; }
                if (c.name === 'webPublishObjects') { out.webPublishObjects = parseWebPublishObjects(c); continue; }
                if (c.name === 'pivotCaches') {
                    out.pivotCaches = [];
                    for (const pc of c.children || []) {
                        if (pc.type === 'element' && pc.name === 'pivotCache') {
                            out.pivotCaches.push({ ...pc.attrs });
                        }
                    }
                    continue;
                }
            }
            return out;
        }

        function renderWorkbookConfig(w) {
            const out = [];
            if (w.fileVersion)        out.push(xml.el('fileVersion',        strAttrs(w.fileVersion)));
            if (w.fileSharing)        out.push(xml.el('fileSharing',        strAttrs(w.fileSharing)));
            if (w.fileRecoveryPr)     out.push(xml.el('fileRecoveryPr',     strAttrs(w.fileRecoveryPr)));
            if (w.oleSize)            out.push(xml.el('oleSize',            strAttrs(w.oleSize)));
            if (w.protection)         out.push(xml.el('protection',         strAttrs(w.protection)));
            if (w.workbookProtection) out.push(xml.el('workbookProtection', strAttrs(w.workbookProtection)));
            if (w.smartTagPr)         out.push(xml.el('smartTagPr',         strAttrs(w.smartTagPr)));
            if (w.webPublishing)      out.push(xml.el('webPublishing',      strAttrs(w.webPublishing)));
            if (w.bookViews) {
                out.push(xml.el('bookViews', {}, w.bookViews.map(renderWorkbookView)));
            }
            if (w.customWorkbookViews) {
                out.push(xml.el('customWorkbookViews', {}, w.customWorkbookViews.map(renderCustomWorkbookView)));
            }
            if (w.smartTagTypes) out.push(renderSmartTagTypes(w.smartTagTypes));
            if (w.webPublishObjects) out.push(renderWebPublishObjects(w.webPublishObjects));
            if (w.pivotCaches) {
                out.push(xml.el('pivotCaches', {},
                    w.pivotCaches.map(pc => xml.el('pivotCache', strAttrs(pc)))));
            }
            return out;
        }

        return {
            parseWorkbookConfig, renderWorkbookConfig,
            parseWorkbookView, renderWorkbookView,
            parseCustomWorkbookView, renderCustomWorkbookView,
            parseSmartTagTypes, renderSmartTagTypes,
            parseWebPublishObjects, renderWebPublishObjects
        };
    }
};
