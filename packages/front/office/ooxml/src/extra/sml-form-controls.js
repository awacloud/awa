// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: legacy ActiveX form controls + OLE objects.
 *
 * Surfaces typed `ocxPr` (id, license, persistence, autoLoad) plus typed
 * `oleObjects/oleObject` and `controls/control/controlPr` for the
 * SpreadsheetML side. ActiveX parts live under `xl/activeX/activeX*.xml`
 * and reference companion binary persistence streams; OLE references
 * resolve to drawing IDs through relationships.
 *
 * Element names use no namespace prefix — SpreadsheetML's default
 * namespace is `http://schemas.openxmlformats.org/spreadsheetml/2006/main`.
 *
 * @module ooxml/extra/sml-form-controls
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const smlFormControls = {
    name: 'smlFormControls',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;

        const ACTIVEX_NS = 'http://schemas.microsoft.com/office/2006/activeX';

        function strAttrs(o) {
            const r = {};
            for (const k of Object.keys(o || {})) if (o[k] != null) r[k] = String(o[k]);
            return r;
        }

        // --- ActiveX control part (xl/activeX/activeX*.xml) -------------

        function parseActiveX(text) {
            const root = xml.parse(text);
            const out = { attrs: { ...root.attrs }, ocxPr: [] };
            for (const c of root.children || []) {
                if (c.type !== 'element' || c.name !== 'ocxPr') continue;
                const a = c.attrs || {};
                out.ocxPr.push({
                    name: a.name,
                    value: a.value,
                    license: a.license,
                    persistence: a.persistence,
                    autoLoad: a.autoLoad,
                    id: a.id
                });
            }
            return out;
        }

        function renderActiveX(node) {
            // Allow passthrough of an element node.
            if (node && node.type === 'element' && node.name) {
                return xml.serialize(node);
            }
            const o = node || {};
            const kids = (o.ocxPr || []).map(p => xml.el('ocxPr', strAttrs(p)));
            const attrs = {
                xmlns: ACTIVEX_NS,
                ...(o.attrs || {})
            };
            const root = xml.el('ocx', attrs, kids);
            return xml.serialize(root);
        }

        // --- oleObjects / oleObject -------------------------------------

        function parseOleObjects(node) {
            if (!node || node.name !== 'oleObjects') {
                throw new ParseError('xlsx/oleObjects-bad-root', `expected <oleObjects>, got <${node && node.name}>`, { context: { elementName: node && node.name } });
            }
            const out = [];
            for (const c of node.children || []) {
                if (c.type !== 'element' || c.name !== 'oleObject') continue;
                const o = { ...c.attrs };
                const objectPr = xml.findChild(c, 'objectPr');
                if (objectPr) {
                    o.objectPr = { attrs: { ...objectPr.attrs } };
                    const anchor = xml.findChild(objectPr, 'anchor');
                    if (anchor) o.objectPr.anchor = { attrs: { ...anchor.attrs } };
                }
                out.push(o);
            }
            return out;
        }

        function renderOleObjects(arr) {
            return xml.el('oleObjects', {},
                (arr || []).map(o => {
                    const a = strAttrs({
                        progId: o.progId, dvAspect: o.dvAspect, link: o.link,
                        oleUpdate: o.oleUpdate, autoLoad: o.autoLoad,
                        shapeId: o.shapeId, 'r:id': o['r:id'] || o.rId
                    });
                    const kids = [];
                    if (o.objectPr) {
                        const opKids = [];
                        if (o.objectPr.anchor) opKids.push(xml.el('anchor', strAttrs(o.objectPr.anchor.attrs || {})));
                        kids.push(xml.el('objectPr', strAttrs(o.objectPr.attrs || {}), opKids));
                    }
                    return xml.el('oleObject', a, kids);
                }));
        }

        // --- controls / control / controlPr -----------------------------

        function parseControls(node) {
            if (!node || node.name !== 'controls') {
                throw new ParseError('xlsx/controls-bad-root', `expected <controls>, got <${node && node.name}>`, { context: { elementName: node && node.name } });
            }
            const out = [];
            for (const c of node.children || []) {
                if (c.type !== 'element' || c.name !== 'control') continue;
                const ctl = { ...c.attrs };
                const cp = xml.findChild(c, 'controlPr');
                if (cp) {
                    ctl.controlPr = { attrs: { ...cp.attrs } };
                    const anchor = xml.findChild(cp, 'anchor');
                    if (anchor) ctl.controlPr.anchor = { attrs: { ...anchor.attrs } };
                }
                out.push(ctl);
            }
            return out;
        }

        function renderControls(arr) {
            return xml.el('controls', {},
                (arr || []).map(c => {
                    const a = strAttrs({
                        shapeId: c.shapeId,
                        name: c.name,
                        'r:id': c['r:id'] || c.rId
                    });
                    const kids = [];
                    if (c.controlPr) {
                        const cpKids = [];
                        if (c.controlPr.anchor) cpKids.push(xml.el('anchor', strAttrs(c.controlPr.anchor.attrs || {})));
                        kids.push(xml.el('controlPr', strAttrs(c.controlPr.attrs || {}), cpKids));
                    }
                    return xml.el('control', a, kids);
                }));
        }

        // Backward-compat passthrough used by existing smoke test.
        function parseControl(text) { return xml.parse(text); }
        function renderControl(node) { return xml.serialize(node); }

        return {
            parseActiveX, renderActiveX,
            parseOleObjects, renderOleObjects,
            parseControls, renderControls,
            parseControl, renderControl
        };
    }
};
