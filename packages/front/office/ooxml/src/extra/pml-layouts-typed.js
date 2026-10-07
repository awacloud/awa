// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed catalog of slide layout types.
 *
 * Each `<p:sldLayout type="…">` value is one of an enumerated set of kinds
 * (~37). This module exposes the catalog and a builder that scaffolds an
 * empty layout part for a given type, plus a typed parser that surfaces
 * the layout-level attributes (type, preserve, userDrawn, showMasterSp,
 * showMasterPhAnim) and the major children (cSld, clrMapOvr, transition,
 * timing, hf).
 *
 * @module ooxml/extra/pml-layouts-typed
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pmlLayoutsTyped = {
    name: 'pmlLayoutsTyped',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // Full ECMA-376 catalog of slide layout types.
        const LAYOUT_TYPES = [
            'title', 'tx', 'twoColTx', 'tbl', 'txAndChart', 'chartAndTx',
            'dgm', 'chart', 'txAndClipArt', 'clipArtAndTx', 'titleOnly',
            'blank', 'txAndObj', 'objAndTx', 'objOnly', 'obj', 'txAndMedia',
            'mediaAndTx', 'objOverTx', 'txOverObj', 'txAndTwoObj',
            'twoObjAndTx', 'twoObjOverTx', 'fourObj', 'vertTx',
            'clipArtAndVertTx', 'vertTitleAndTx', 'vertTitleAndTxOverChart',
            'twoObj', 'objAndTwoObj', 'twoObjAndObj', 'cust', 'secHead',
            'twoTxTwoObj', 'objTx', 'picTx'
        ];

        // The 18 commonly used layout kinds (text, two-column text, objects,
        // table, chart, picture, diagram, media, section header, title-only,
        // blank, custom, vertical text); `buildLayout` scaffolds each of them.
        const PRIMARY_LAYOUT_TYPES = [
            'obj', 'tx', 'twoColTx', 'twoObj', 'objAndTx', 'vertTitleAndTx',
            'vertTx', 'titleOnly', 'blank', 'tbl', 'chart', 'cust', 'secHead',
            'txAndObj', 'pic', 'dgm', 'mediaAndTx', 'fourObj'
        ];

        function buildLayout({ type = 'obj', name = '', preserve = '1',
                               userDrawn, showMasterSp, showMasterPhAnim } = {}) {
            const attrs = {
                'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'xmlns:p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
                type,
                preserve
            };
            if (userDrawn !== undefined)        attrs.userDrawn = String(userDrawn);
            if (showMasterSp !== undefined)     attrs.showMasterSp = String(showMasterSp);
            if (showMasterPhAnim !== undefined) attrs.showMasterPhAnim = String(showMasterPhAnim);

            const root = xml.el('p:sldLayout', attrs, [
                xml.el('p:cSld', name ? { name } : {}, [
                    xml.el('p:spTree', {}, [
                        xml.el('p:nvGrpSpPr', {}, [
                            xml.el('p:cNvPr', { id: '1', name: '' }),
                            xml.el('p:cNvGrpSpPr', {}),
                            xml.el('p:nvPr', {})
                        ]),
                        xml.el('p:grpSpPr', {})
                    ])
                ]),
                xml.el('p:clrMapOvr', {}, [xml.el('a:masterClrMapping', {})])
            ]);
            return xml.serialize(root);
        }

        function parseLayout(text) {
            const root = typeof text === 'string' ? xml.parse(text) : text;
            if (root && root.name === 'p:sldLayout') {
                // recognized root element
            }
            const out = {
                kind: 'sldLayout',
                type: root.attrs.type || 'cust',
                preserve: root.attrs.preserve,
                userDrawn: root.attrs.userDrawn,
                showMasterSp: root.attrs.showMasterSp,
                showMasterPhAnim: root.attrs.showMasterPhAnim,
                matchingName: root.attrs.matchingName
            };
            for (const c of root.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'p:cSld':
                        out.cSld = { name: c.attrs.name, raw: c };
                        break;
                    case 'p:clrMapOvr':
                        out.clrMapOvr = parseClrMapOvr(c);
                        break;
                    case 'p:transition':
                        out.transition = { raw: c, attrs: { ...c.attrs } };
                        break;
                    case 'p:timing':
                        out.timing = { raw: c };
                        break;
                    case 'p:hf':
                        out.hf = { kind: 'hf', attrs: { ...c.attrs } };
                        break;
                }
            }
            return out;
        }

        function parseClrMapOvr(el) {
            const out = { kind: 'clrMapOvr' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:masterClrMapping')   out.masterClrMapping = true;
                else if (c.name === 'a:overrideClrMapping') out.overrideClrMapping = { ...c.attrs };
            }
            return out;
        }

        function parseLayoutType(text) {
            const root = typeof text === 'string' ? xml.parse(text) : text;
            return root.attrs.type || 'cust';
        }

        return {
            LAYOUT_TYPES, PRIMARY_LAYOUT_TYPES,
            buildLayout, parseLayout, parseLayoutType, parseClrMapOvr
        };
    }
};
