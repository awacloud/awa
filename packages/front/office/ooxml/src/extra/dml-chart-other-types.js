// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed parse/render for the remaining chart-type
 * shapes — bubble, radar, stock, of-pie — plus pivot-format helpers.
 *
 * Each chart-type renders/parses its `<c:plotArea>` child shape (e.g.
 * `<c:bubbleChart>`). Series inner data containers (xVal/yVal/cat
 * numRef/strRef) are kept as raw nodes for full roundtrip; the typed
 * fields surface the bits a host actually steers (idx, varyColors,
 * bubbleScale, ofPieType, splitType, …).
 *
 * @module ooxml/extra/dml-chart-other-types
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlChartOtherTypes = {
    name: 'dmlChartOtherTypes',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const TYPES = ['bubbleChart', 'radarChart', 'stockChart', 'ofPieChart'];

        // --- helpers ---

        function readBool(el) {
            if (!el) return undefined;
            const v = el.attrs.val;
            if (v === undefined) return true;
            return !(v === '0' || v === 'false');
        }
        function writeBool(name, b) {
            if (b === undefined) return null;
            return xml.el(name, { val: b ? '1' : '0' });
        }
        // Generic ser parser — collects known fields, keeps unknowns as raw.
        // `fieldMap` maps local element name → handler(el, out).
        function parseSerGeneric(serEl, fieldMap) {
            const out = { _extras: [] };
            for (const c of serEl.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'idx')   { out.idx   = Number(c.attrs.val); continue; }
                if (local === 'order') { out.order = Number(c.attrs.val); continue; }
                if (local === 'tx')    { out.tx = c; continue; }
                if (local === 'spPr')  { out.spPr = c; continue; }
                const h = fieldMap[local];
                if (h) { h(c, out); continue; }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderSerHead(s) {
            const kids = [];
            if (s.idx   != null) kids.push(xml.el('c:idx',   { val: String(s.idx) }));
            if (s.order != null) kids.push(xml.el('c:order', { val: String(s.order) }));
            if (s.tx)            kids.push(s.tx);
            if (s.spPr)          kids.push(s.spPr);
            return kids;
        }

        // --- bubbleChart ---

        function parseBubbleChart(el) {
            const out = { kind: 'bubbleChart', ser: [], _extras: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'varyColors')      { out.varyColors = readBool(c); continue; }
                if (local === 'bubbleScale')     { out.bubbleScale = Number(c.attrs.val); continue; }
                if (local === 'showNegBubbles')  { out.showNegBubbles = readBool(c); continue; }
                if (local === 'sizeRepresents')  { out.sizeRepresents = c.attrs.val; continue; }
                if (local === 'ser') {
                    out.ser.push(parseSerGeneric(c, {
                        bubble3D:   (e, o) => { o.bubble3D = readBool(e); },
                        bubbleSize: (e, o) => { o.bubbleSize = e; },
                        xVal:       (e, o) => { o.xVal = e; },
                        yVal:       (e, o) => { o.yVal = e; },
                        invertIfNegative: (e, o) => { o.invertIfNegative = readBool(e); }
                    }));
                    continue;
                }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderBubbleChart(c) {
            const kids = [];
            const vc = writeBool('c:varyColors', c.varyColors);
            if (vc) kids.push(vc);
            for (const s of c.ser || []) {
                const sk = renderSerHead(s);
                if (s.invertIfNegative !== undefined) {
                    sk.push(xml.el('c:invertIfNegative', { val: s.invertIfNegative ? '1' : '0' }));
                }
                if (s.xVal) sk.push(s.xVal);
                if (s.yVal) sk.push(s.yVal);
                if (s.bubbleSize) sk.push(s.bubbleSize);
                if (s.bubble3D !== undefined) {
                    sk.push(xml.el('c:bubble3D', { val: s.bubble3D ? '1' : '0' }));
                }
                if (s._extras) for (const ex of s._extras) sk.push(ex);
                kids.push(xml.el('c:ser', {}, sk));
            }
            if (c.bubbleScale != null) {
                kids.push(xml.el('c:bubbleScale', { val: String(c.bubbleScale) }));
            }
            if (c.showNegBubbles !== undefined) {
                kids.push(xml.el('c:showNegBubbles', { val: c.showNegBubbles ? '1' : '0' }));
            }
            if (c.sizeRepresents != null) {
                kids.push(xml.el('c:sizeRepresents', { val: c.sizeRepresents }));
            }
            if (c._extras) for (const ex of c._extras) kids.push(ex);
            return xml.el('c:bubbleChart', {}, kids);
        }

        // --- radarChart ---

        function parseRadarChart(el) {
            const out = { kind: 'radarChart', ser: [], _extras: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'radarStyle') { out.radarStyle = c.attrs.val; continue; }
                if (local === 'varyColors') { out.varyColors = readBool(c); continue; }
                if (local === 'ser') {
                    out.ser.push(parseSerGeneric(c, {
                        cat: (e, o) => { o.cat = e; },
                        val: (e, o) => { o.val = e; }
                    }));
                    continue;
                }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderRadarChart(c) {
            const kids = [];
            if (c.radarStyle != null) kids.push(xml.el('c:radarStyle', { val: c.radarStyle }));
            const vc = writeBool('c:varyColors', c.varyColors);
            if (vc) kids.push(vc);
            for (const s of c.ser || []) {
                const sk = renderSerHead(s);
                if (s.cat) sk.push(s.cat);
                if (s.val) sk.push(s.val);
                if (s._extras) for (const ex of s._extras) sk.push(ex);
                kids.push(xml.el('c:ser', {}, sk));
            }
            if (c._extras) for (const ex of c._extras) kids.push(ex);
            return xml.el('c:radarChart', {}, kids);
        }

        // --- stockChart ---

        function parseStockChart(el) {
            const out = { kind: 'stockChart', ser: [], _extras: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'ser') {
                    out.ser.push(parseSerGeneric(c, {
                        cat: (e, o) => { o.cat = e; },
                        val: (e, o) => { o.val = e; }
                    }));
                    continue;
                }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderStockChart(c) {
            const kids = [];
            for (const s of c.ser || []) {
                const sk = renderSerHead(s);
                if (s.cat) sk.push(s.cat);
                if (s.val) sk.push(s.val);
                if (s._extras) for (const ex of s._extras) sk.push(ex);
                kids.push(xml.el('c:ser', {}, sk));
            }
            if (c._extras) for (const ex of c._extras) kids.push(ex);
            return xml.el('c:stockChart', {}, kids);
        }

        // --- ofPieChart ---

        function parseCustSplit(el) {
            const out = { secondPiePt: [] };
            for (const c of xml.findAll(el, 'c:secondPiePt')) {
                out.secondPiePt.push(Number(c.attrs.val));
            }
            return out;
        }

        function renderCustSplit(cs) {
            const kids = [];
            for (const idx of cs.secondPiePt || []) {
                kids.push(xml.el('c:secondPiePt', { val: String(idx) }));
            }
            return xml.el('c:custSplit', {}, kids);
        }

        function parseOfPieChart(el) {
            const out = { kind: 'ofPieChart', ser: [], _extras: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'ofPieType')      { out.ofPieType = c.attrs.val; continue; }
                if (local === 'varyColors')     { out.varyColors = readBool(c); continue; }
                if (local === 'gapWidth')       { out.gapWidth = Number(c.attrs.val); continue; }
                if (local === 'splitType')      { out.splitType = c.attrs.val; continue; }
                if (local === 'splitPos')       { out.splitPos = Number(c.attrs.val); continue; }
                if (local === 'secondPieSize')  { out.secondPieSize = Number(c.attrs.val); continue; }
                if (local === 'custSplit')      { out.custSplit = parseCustSplit(c); continue; }
                if (local === 'ser') {
                    out.ser.push(parseSerGeneric(c, {
                        cat: (e, o) => { o.cat = e; },
                        val: (e, o) => { o.val = e; }
                    }));
                    continue;
                }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderOfPieChart(c) {
            const kids = [];
            if (c.ofPieType != null) kids.push(xml.el('c:ofPieType', { val: c.ofPieType }));
            const vc = writeBool('c:varyColors', c.varyColors);
            if (vc) kids.push(vc);
            for (const s of c.ser || []) {
                const sk = renderSerHead(s);
                if (s.cat) sk.push(s.cat);
                if (s.val) sk.push(s.val);
                if (s._extras) for (const ex of s._extras) sk.push(ex);
                kids.push(xml.el('c:ser', {}, sk));
            }
            if (c.gapWidth != null)      kids.push(xml.el('c:gapWidth',      { val: String(c.gapWidth) }));
            if (c.splitType != null)     kids.push(xml.el('c:splitType',     { val: c.splitType }));
            if (c.splitPos != null)      kids.push(xml.el('c:splitPos',      { val: String(c.splitPos) }));
            if (c.custSplit)             kids.push(renderCustSplit(c.custSplit));
            if (c.secondPieSize != null) kids.push(xml.el('c:secondPieSize', { val: String(c.secondPieSize) }));
            if (c._extras) for (const ex of c._extras) kids.push(ex);
            return xml.el('c:ofPieChart', {}, kids);
        }

        // --- chart-type dispatcher (back-compat passthrough API) ---

        const PARSERS = {
            bubbleChart: parseBubbleChart,
            radarChart:  parseRadarChart,
            stockChart:  parseStockChart,
            ofPieChart:  parseOfPieChart
        };
        const RENDERERS = {
            bubbleChart: renderBubbleChart,
            radarChart:  renderRadarChart,
            stockChart:  renderStockChart,
            ofPieChart:  renderOfPieChart
        };

        function parseChartByType(el) {
            const local = el.name.replace(/^c:/, '');
            const p = PARSERS[local];
            if (p) return p(el);
            return { kind: local, _raw: el };
        }
        function renderChartByType(c) {
            if (c && c._raw) return c._raw;
            const r = c && RENDERERS[c.kind];
            if (r) return r(c);
            return xml.el('c:' + (c && c.kind), {});
        }

        // --- pivotFmt / pivotFmts ---

        function parsePivotFmt(el) {
            const out = { _extras: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'idx')    { out.idx = Number(c.attrs.val); continue; }
                if (local === 'spPr')   { out.spPr = c; continue; }
                if (local === 'txPr')   { out.txPr = c; continue; }
                if (local === 'marker') { out.marker = c; continue; }
                if (local === 'dLbl')   { out.dLbl = c; continue; }
                out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderPivotFmt(p) {
            const kids = [];
            if (p.idx != null) kids.push(xml.el('c:idx', { val: String(p.idx) }));
            if (p.spPr)   kids.push(p.spPr);
            if (p.txPr)   kids.push(p.txPr);
            if (p.marker) kids.push(p.marker);
            if (p.dLbl)   kids.push(p.dLbl);
            if (p._extras) for (const ex of p._extras) kids.push(ex);
            return xml.el('c:pivotFmt', {}, kids);
        }

        function parsePivotFmts(el) {
            return xml.findAll(el, 'c:pivotFmt').map(parsePivotFmt);
        }
        function renderPivotFmts(arr) {
            return xml.el('c:pivotFmts', {}, (arr || []).map(renderPivotFmt));
        }

        // --- pivotSource / dTable / userShapes (raw passthroughs) ---

        function parsePivotSource(el) { return { _raw: el, attrs: { ...el.attrs } }; }
        function renderPivotSource(p) { return p._raw || xml.el('c:pivotSource', p.attrs || {}); }

        function parseDTable(el) { return { _raw: el, attrs: { ...el.attrs } }; }
        function renderDTable(d) { return d._raw || xml.el('c:dTable', d.attrs || {}); }

        function parseUserShapes(el) { return { _raw: el, attrs: { ...el.attrs } }; }
        function renderUserShapes(u) { return u._raw || xml.el('c:userShapes', u.attrs || {}); }

        return {
            TYPES,
            parseChartByType, renderChartByType,
            parseBubbleChart, renderBubbleChart,
            parseRadarChart,  renderRadarChart,
            parseStockChart,  renderStockChart,
            parseOfPieChart,  renderOfPieChart,
            parsePivotFmt,    renderPivotFmt,
            parsePivotFmts,   renderPivotFmts,
            parsePivotSource, renderPivotSource,
            parseDTable,      renderDTable,
            parseUserShapes,  renderUserShapes
        };
    }
};
