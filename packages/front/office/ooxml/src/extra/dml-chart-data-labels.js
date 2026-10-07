// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed data labels for charts.
 *
 * Models `<c:dLbls>` and `<c:dLbl>` (per-point label override) with the
 * common display flags (showVal, showCatName, showPercent, …),
 * positioning (`dLblPos`), `numFmt`, deeply-typed `txPr` (text body
 * paragraph runs), `leaderLines`, `showLeaderLines`, plus the legend /
 * data-table flags (`showHorzBorder`, `showVertBorder`, `showOutline`,
 * `showKeys`).
 *
 * Returns helpers consumed by chart parse/render to promote the
 * containing dLbls XML into a typed bag and back.
 *
 * @module ooxml/extra/dml-chart-data-labels
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlChartDataLabels = {
    name: 'dmlChartDataLabels',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // Boolean show* flags that appear on dLbls and dLbl.
        const FLAGS = ['showLegendKey', 'showVal', 'showCatName', 'showSerName',
            'showPercent', 'showBubbleSize', 'showLeaderLines'];

        // Data-table flags (used by `c:dTable` but commonly co-located
        // alongside dLbls in the plot area). Exposed here so that the
        // same helper module can deep-type them.
        const DTABLE_FLAGS = ['showHorzBorder', 'showVertBorder',
            'showOutline', 'showKeys'];

        function readFlag(el) {
            if (!el) return undefined;
            const v = el.attrs.val;
            if (v === undefined) return true;
            return !(v === '0' || v === 'false');
        }
        function writeFlag(name, value) {
            if (value === undefined) return null;
            return xml.el(name, { val: value ? '1' : '0' });
        }

        // --- numFmt ---

        function parseNumFmt(el) {
            return { formatCode: el.attrs.formatCode, sourceLinked: el.attrs.sourceLinked };
        }
        function renderNumFmt(n) {
            const a = {};
            if (n.formatCode != null)   a.formatCode   = n.formatCode;
            if (n.sourceLinked != null) a.sourceLinked = n.sourceLinked;
            return xml.el('c:numFmt', a);
        }

        // --- txPr: a:bodyPr / a:lstStyle / a:p (typed paragraph runs) ---

        function parseRun(el) {
            const out = { kind: 'r' };
            const rPr = xml.findChild(el, 'a:rPr');
            if (rPr) out.rPr = { ...rPr.attrs };
            const t = xml.findChild(el, 'a:t');
            if (t) out.text = xml.textContent(t);
            return out;
        }
        function renderRun(r) {
            const kids = [];
            if (r.rPr) kids.push(xml.el('a:rPr', { ...r.rPr }));
            kids.push(xml.el('a:t', {}, [xml.text(r.text || '')]));
            return xml.el('a:r', {}, kids);
        }

        function parsePara(el) {
            const out = { runs: [] };
            const pPr = xml.findChild(el, 'a:pPr');
            if (pPr) out.pPr = { ...pPr.attrs };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:r')      out.runs.push(parseRun(c));
                else if (c.name === 'a:br') out.runs.push({ kind: 'br' });
                else if (c.name === 'a:fld') out.runs.push({ kind: 'fld', attrs: { ...c.attrs } });
                else if (c.name === 'a:endParaRPr') out.endParaRPr = { ...c.attrs };
            }
            return out;
        }
        function renderPara(p) {
            const kids = [];
            if (p.pPr) kids.push(xml.el('a:pPr', { ...p.pPr }));
            for (const r of p.runs || []) {
                if (r.kind === 'br')  kids.push(xml.el('a:br', {}));
                else if (r.kind === 'fld') kids.push(xml.el('a:fld', { ...(r.attrs || {}) }));
                else                  kids.push(renderRun(r));
            }
            if (p.endParaRPr) kids.push(xml.el('a:endParaRPr', { ...p.endParaRPr }));
            return xml.el('a:p', {}, kids);
        }

        function parseTxPr(el) {
            const out = { paras: [] };
            const bodyPr = xml.findChild(el, 'a:bodyPr');
            if (bodyPr) out.bodyPr = { ...bodyPr.attrs };
            const lstStyle = xml.findChild(el, 'a:lstStyle');
            if (lstStyle) out.lstStyle = lstStyle;
            for (const c of el.children) {
                if (c.type === 'element' && c.name === 'a:p') {
                    out.paras.push(parsePara(c));
                }
            }
            return out;
        }
        function renderTxPr(t) {
            const kids = [];
            kids.push(xml.el('a:bodyPr', { ...(t.bodyPr || {}) }));
            kids.push(t.lstStyle || xml.el('a:lstStyle', {}));
            for (const p of t.paras || []) kids.push(renderPara(p));
            if (!(t.paras || []).length) kids.push(xml.el('a:p', {}));
            return xml.el('c:txPr', {}, kids);
        }

        // --- leaderLines ---
        // <c:leaderLines><c:spPr>…</c:spPr></c:leaderLines>

        function parseLeaderLines(el) {
            const out = {};
            const spPr = xml.findChild(el, 'c:spPr');
            if (spPr) out.spPr = spPr;
            return out;
        }
        function renderLeaderLines(l) {
            const kids = [];
            if (l && l.spPr) kids.push(l.spPr);
            return xml.el('c:leaderLines', {}, kids);
        }

        // --- dLbls / dLbl ---

        function parseDLbls(el) {
            if (!el) return undefined;
            const out = {};
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (FLAGS.includes(local))         { out[local] = readFlag(c); continue; }
                if (DTABLE_FLAGS.includes(local))  { out[local] = readFlag(c); continue; }
                if (local === 'dLblPos')      { out.dLblPos = c.attrs.val; continue; }
                if (local === 'separator')    { out.separator = xml.textContent(c); continue; }
                if (local === 'numFmt')       { out.numFmt = parseNumFmt(c); continue; }
                if (local === 'spPr')         { out.spPr = c; continue; }
                if (local === 'txPr')         { out.txPr = parseTxPr(c); continue; }
                if (local === 'leaderLines')  { out.leaderLines = parseLeaderLines(c); continue; }
                if (local === 'dLbl') {
                    out.dLblOverrides = out.dLblOverrides || [];
                    out.dLblOverrides.push(parseDLbl(c));
                    continue;
                }
                (out._extras = out._extras || []).push(c);
            }
            return out;
        }

        function parseDLbl(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const local = c.name.replace(/^c:/, '');
                if (local === 'idx')      { out.idx = Number(c.attrs.val); continue; }
                if (FLAGS.includes(local)) { out[local] = readFlag(c); continue; }
                if (local === 'dLblPos')  { out.dLblPos = c.attrs.val; continue; }
                if (local === 'tx')       { out.tx = c; continue; }
                if (local === 'spPr')     { out.spPr = c; continue; }
                if (local === 'numFmt')   { out.numFmt = parseNumFmt(c); continue; }
                if (local === 'txPr')     { out.txPr = parseTxPr(c); continue; }
                if (local === 'separator') { out.separator = xml.textContent(c); continue; }
                if (local === 'layout')   { out.layout = c; continue; }
                (out._extras = out._extras || []).push(c);
            }
            return out;
        }

        function renderDLbls(d) {
            if (!d) return null;
            const kids = [];
            if (d.dLblOverrides) for (const o of d.dLblOverrides) kids.push(renderDLbl(o));
            if (d.numFmt)             kids.push(renderNumFmt(d.numFmt));
            if (d.spPr)               kids.push(d.spPr);
            if (d.txPr)               kids.push(renderTxPr(d.txPr));
            if (d.dLblPos != null)    kids.push(xml.el('c:dLblPos', { val: d.dLblPos }));
            if (d.separator != null)  kids.push(xml.el('c:separator', {}, [xml.text(d.separator)]));
            for (const f of FLAGS) {
                const el = writeFlag('c:' + f, d[f]);
                if (el) kids.push(el);
            }
            if (d.leaderLines)        kids.push(renderLeaderLines(d.leaderLines));
            for (const f of DTABLE_FLAGS) {
                const el = writeFlag('c:' + f, d[f]);
                if (el) kids.push(el);
            }
            if (d._extras) for (const ex of d._extras) kids.push(ex);
            return xml.el('c:dLbls', {}, kids);
        }

        function renderDLbl(o) {
            const kids = [];
            if (o.idx != null)        kids.push(xml.el('c:idx', { val: String(o.idx) }));
            if (o.layout)             kids.push(o.layout);
            if (o.tx)                 kids.push(o.tx);
            if (o.numFmt)             kids.push(renderNumFmt(o.numFmt));
            if (o.spPr)               kids.push(o.spPr);
            if (o.txPr)               kids.push(renderTxPr(o.txPr));
            if (o.dLblPos != null)    kids.push(xml.el('c:dLblPos', { val: o.dLblPos }));
            if (o.separator != null)  kids.push(xml.el('c:separator', {}, [xml.text(o.separator)]));
            for (const f of FLAGS) {
                const el = writeFlag('c:' + f, o[f]);
                if (el) kids.push(el);
            }
            if (o._extras) for (const ex of o._extras) kids.push(ex);
            return xml.el('c:dLbl', {}, kids);
        }

        return {
            parseDLbls, renderDLbls,
            parseDLbl, renderDLbl,
            parseNumFmt, renderNumFmt,
            parseTxPr, renderTxPr,
            parsePara, renderPara,
            parseRun, renderRun,
            parseLeaderLines, renderLeaderLines,
            FLAGS, DTABLE_FLAGS
        };
    }
};
