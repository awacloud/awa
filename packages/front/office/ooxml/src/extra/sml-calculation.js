// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: SpreadsheetML calculation chain + workbook calc
 * properties.
 *
 * Element names use no namespace prefix — SpreadsheetML's default
 * namespace is `http://schemas.openxmlformats.org/spreadsheetml/2006/main`.
 *
 * Excel regenerates the calc chain on open, so this is mostly a
 * preservation aid (keeps the file valid for strict consumers).
 *
 * @module ooxml/extra/sml-calculation
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const smlCalculation = {
    name: 'smlCalculation',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const SML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

        const CALC_PR_ATTRS = ['calcId', 'calcMode', 'fullCalcOnLoad',
            'refMode', 'iterate', 'iterateCount', 'iterateDelta',
            'fullPrecision', 'calcCompleted', 'calcOnSave',
            'concurrentCalc', 'concurrentManualCount', 'forceFullCalc'];

        function parseCalcChain(text) {
            const root = xml.parse(text);
            const cells = [];
            for (const c of root.children || []) {
                if (c.type !== 'element' || c.name !== 'c') continue;
                const a = c.attrs || {};
                cells.push({
                    r: a.r,
                    i: a.i,
                    s: a.s,
                    l: a.l,
                    a: a.a,
                    t: a.t
                });
            }
            return { attrs: { ...root.attrs }, cells };
        }

        function renderCalcChain(cc) {
            const kids = (cc.cells || []).map(c => {
                const a = {};
                if (c.r != null) a.r = String(c.r);
                if (c.i != null) a.i = String(c.i);
                if (c.s != null) a.s = String(c.s);
                if (c.l != null) a.l = String(c.l);
                if (c.a != null) a.a = String(c.a);
                if (c.t != null) a.t = String(c.t);
                return xml.el('c', a);
            });
            const root = xml.el('calcChain', {
                xmlns: SML_NS,
                ...(cc.attrs || {})
            }, kids);
            return xml.serialize(root);
        }

        /** Parse a `<calcPr>` element node into a typed object. Accepts
         * either an element node or an attribute bag. */
        function parseCalcPr(input) {
            const a = (input && input.attrs) ? input.attrs : (input || {});
            const out = {};
            for (const k of CALC_PR_ATTRS) {
                if (a[k] != null) out[k] = a[k];
            }
            return out;
        }

        function renderCalcPr(cp) {
            const a = {};
            for (const k of CALC_PR_ATTRS) if (cp[k] != null) a[k] = String(cp[k]);
            return xml.el('calcPr', a);
        }

        return { parseCalcChain, renderCalcChain, parseCalcPr, renderCalcPr };
    }
};
