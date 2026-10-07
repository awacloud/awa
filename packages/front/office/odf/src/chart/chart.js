// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<chart:chart>` element (the root of an
 * ODF chart sub-document).
 *
 * In ODF, an embedded chart lives in its own package sub-directory
 * (`Object N/content.xml`). This module exposes parsing for the
 * `chart:chart` element itself plus `bytesOf` / `parseBytes` helpers
 * for the corresponding content document. It does not wire the
 * sub-document into the package (manifest registration, picture preview).
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'chart',
 *   chartClass?,                       // chart:class attribute
 *   title?, subtitle?, legend?,        // raw XML elements
 *   plotArea?: { axes: [...], series: [...], _extras? },
 *   _extras?
 * }
 * ```
 *
 * Axes / series / data-points are preserved as flat typed objects with
 * `{ kind, attrs, children?, _extras? }`.
 *
 * @module odf/chart/chart
 */



import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const chartChart = {
    name: 'chartChart',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        void errors;
        const { XML_DECL_STANDALONE: XML_DECL, encodeText, decodeText,
                parseXmlOrThrow, findDeep, declareNamespaces } = shared;


        /**
         * Parse a `<chart:chart>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseChart(el) {
            const out = { type: 'chart' };
            const a = el.attrs || {};
            if (a['chart:class']) out.chartClass = a['chart:class'];
            const known = new Set(['chart:class']);
            const xa = {};
            let any = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; any = true; }
            }
            const xc = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'chart:title') out.title = c;
                else if (c.name === 'chart:subtitle') out.subtitle = c;
                else if (c.name === 'chart:legend') out.legend = c;
                else if (c.name === 'chart:plot-area') out.plotArea = parsePlotArea(c);
                else xc.push(c);
            }
            if (any || xc.length) {
                out._extras = {};
                if (any) out._extras.attrs = xa;
                if (xc.length) out._extras.children = xc;
            }
            return out;
        }

        function parsePlotArea(el) {
            const out = { axes: [], series: [], attrs: { ...(el.attrs || {}) } };
            const xc = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'chart:axis') out.axes.push(parseAxis(c));
                else if (c.name === 'chart:series') out.series.push(parseSeries(c));
                else xc.push(c);
            }
            if (xc.length) out._extras = { children: xc };
            return out;
        }

        function parseAxis(el) {
            return {
                kind: 'axis',
                attrs: { ...(el.attrs || {}) },
                children: (el.children || []).filter(c => c.type === 'element')
            };
        }

        function parseSeries(el) {
            const out = {
                kind: 'series',
                attrs: { ...(el.attrs || {}) },
                dataPoints: [],
                children: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'chart:data-point') {
                    out.dataPoints.push({ kind: 'data-point', attrs: { ...(c.attrs || {}) } });
                } else {
                    out.children.push(c);
                }
            }
            return out;
        }

        /**
         * Render a chart model to a `<chart:chart>` element.
         *
         * @param {object} c
         * @returns {object}
         */
        function renderChart(c) {
            const attrs = {};
            if (c.chartClass) attrs['chart:class'] = c.chartClass;
            if (c._extras && c._extras.attrs) {
                for (const k of Object.keys(c._extras.attrs)) attrs[k] = c._extras.attrs[k];
            }
            const children = [];
            if (c.title) children.push(c.title);
            if (c.subtitle) children.push(c.subtitle);
            if (c.legend) children.push(c.legend);
            if (c.plotArea) children.push(renderPlotArea(c.plotArea));
            if (c._extras && c._extras.children) {
                for (const k of c._extras.children) children.push(k);
            }
            return xml.el('chart:chart', attrs, children);
        }

        function renderPlotArea(p) {
            const kids = [];
            for (const a of p.axes || []) kids.push(renderAxis(a));
            for (const s of p.series || []) kids.push(renderSeries(s));
            if (p._extras && p._extras.children) {
                for (const c of p._extras.children) kids.push(c);
            }
            return xml.el('chart:plot-area', { ...(p.attrs || {}) }, kids);
        }

        function renderAxis(a) {
            return xml.el('chart:axis', { ...(a.attrs || {}) }, (a.children || []).slice());
        }

        function renderSeries(s) {
            const kids = [];
            for (const d of s.dataPoints || []) {
                kids.push(xml.el('chart:data-point', { ...(d.attrs || {}) }, []));
            }
            if (s.children) for (const c of s.children) kids.push(c);
            return xml.el('chart:series', { ...(s.attrs || {}) }, kids);
        }

        /**
         * Parse a chart `content.xml` byte payload.
         *
         * @param {Uint8Array|string} bytes
         * @returns {object} chart model
         */
        function parseBytes(bytes) {
            const td = typeof bytes === 'string' ? bytes : decodeText(bytes);
            const root = parseXmlOrThrow(td, 'chart');
            // The chart content document root is <office:document-content>
            // → <office:body> → <office:chart> → <chart:chart>.
            const chartEl = findDeep(root, 'chart:chart');
            if (!chartEl) {
                // Tolerate raw <chart:chart> as well
                if (root.name === 'chart:chart') return parseChart(root);
                return parseChart(xml.el('chart:chart', {}, []));
            }
            return parseChart(chartEl);
        }

        /**
         * Serialize a chart model as a chart `content.xml` byte payload. The
         * `office:document-content` root declares every namespace prefix the
         * output uses, from the known table; a prefix it does not know
         * throws `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} c
         * @returns {Uint8Array}
         */
        function bytesOf(c) {
            const doc = xml.el('office:document-content', {}, [
                xml.el('office:body', {}, [
                    xml.el('office:chart', {}, [renderChart(c)])
                ])
            ]);
            declareNamespaces(doc, { part: 'content.xml', module: 'chart' });
            return encodeText(XML_DECL + '\r\n' + xml.serializeNode(doc));
        }

        return { parseChart, renderChart, parseBytes, bytesOf };
    }
};
