// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: SpreadsheetDrawing connectors + group shapes.
 *
 * Covers the 12 elements of `dml-spreadsheetDrawing.xsd`:
 *
 *  - Anchors: `xdr:absoluteAnchor`, `xdr:oneCellAnchor`, `xdr:twoCellAnchor`
 *    (typed from/to with `col`, `colOff`, `row`, `rowOff` and `ext`)
 *  - Connector: `xdr:cxnSp`, `xdr:nvCxnSpPr`, `xdr:cNvCxnSpPr`
 *  - Group: `xdr:grpSp`, `xdr:grpSpPr`, `xdr:nvGrpSpPr`, `xdr:cNvGrpSpPr`
 *  - `xdr:contentPart` (linked ink content via r:id)
 *  - `xdr:style` (lnRef/fillRef/effectRef/fontRef)
 *
 * @module ooxml/extra/dml-xdr-advanced
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlXdrAdvanced = {
    name: 'dmlXdrAdvanced',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        function elements(node) {
            return (node && node.children ? node.children : [])
                .filter(c => c.type === 'element');
        }

        // ----- xdr:cNvPr (shared by nv*) -----

        function parseCNvPr(el) {
            if (!el) return undefined;
            return {
                id: el.attrs.id,
                name: el.attrs.name,
                descr: el.attrs.descr,
                title: el.attrs.title,
                hidden: el.attrs.hidden
            };
        }

        function renderCNvPr(p) {
            const a = {};
            if (p.id != null) a.id = String(p.id);
            if (p.name != null) a.name = String(p.name);
            if (p.descr != null) a.descr = String(p.descr);
            if (p.title != null) a.title = String(p.title);
            if (p.hidden != null) a.hidden = String(p.hidden);
            return xml.el('xdr:cNvPr', a);
        }

        // ----- xdr:cNvCxnSpPr -----

        function parseCNvCxnSpPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const stCxn = xml.findChild(el, 'a:stCxn');
            const endCxn = xml.findChild(el, 'a:endCxn');
            if (stCxn) out.stCxn = { ...stCxn.attrs };
            if (endCxn) out.endCxn = { ...endCxn.attrs };
            return out;
        }

        function renderCNvCxnSpPr(p) {
            const kids = [];
            if (p.stCxn)  kids.push(xml.el('a:stCxn', { ...p.stCxn }));
            if (p.endCxn) kids.push(xml.el('a:endCxn', { ...p.endCxn }));
            return xml.el('xdr:cNvCxnSpPr', p.attrs || {}, kids);
        }

        // ----- xdr:nvCxnSpPr -----

        function parseNvCxnSpPr(el) {
            if (!el) return undefined;
            const out = {};
            const cnv = xml.findChild(el, 'xdr:cNvPr');
            const cnvSp = xml.findChild(el, 'xdr:cNvCxnSpPr');
            if (cnv)   out.cNvPr = parseCNvPr(cnv);
            if (cnvSp) out.cNvCxnSpPr = parseCNvCxnSpPr(cnvSp);
            return out;
        }

        function renderNvCxnSpPr(p) {
            const kids = [];
            if (p.cNvPr)       kids.push(renderCNvPr(p.cNvPr));
            if (p.cNvCxnSpPr)  kids.push(renderCNvCxnSpPr(p.cNvCxnSpPr));
            return xml.el('xdr:nvCxnSpPr', {}, kids);
        }

        // ----- xdr:cNvGrpSpPr -----

        function parseCNvGrpSpPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const lck = xml.findChild(el, 'a:grpSpLocks');
            if (lck) out.grpSpLocks = { ...lck.attrs };
            return out;
        }

        function renderCNvGrpSpPr(p) {
            const kids = [];
            if (p.grpSpLocks) kids.push(xml.el('a:grpSpLocks', { ...p.grpSpLocks }));
            return xml.el('xdr:cNvGrpSpPr', p.attrs || {}, kids);
        }

        // ----- xdr:nvGrpSpPr -----

        function parseNvGrpSpPr(el) {
            if (!el) return undefined;
            const out = {};
            const cnv = xml.findChild(el, 'xdr:cNvPr');
            const cnvGrp = xml.findChild(el, 'xdr:cNvGrpSpPr');
            if (cnv)    out.cNvPr = parseCNvPr(cnv);
            if (cnvGrp) out.cNvGrpSpPr = parseCNvGrpSpPr(cnvGrp);
            return out;
        }

        function renderNvGrpSpPr(p) {
            const kids = [];
            if (p.cNvPr)      kids.push(renderCNvPr(p.cNvPr));
            if (p.cNvGrpSpPr) kids.push(renderCNvGrpSpPr(p.cNvGrpSpPr));
            return xml.el('xdr:nvGrpSpPr', {}, kids);
        }

        // ----- xdr:grpSpPr (preserves inner DrawingML) -----

        function parseGrpSpPr(el) {
            if (!el) return undefined;
            return { attrs: { ...el.attrs }, children: (el.children || []).slice() };
        }

        function renderGrpSpPr(p) {
            return xml.el('xdr:grpSpPr', p.attrs || {}, p.children || []);
        }

        // ----- xdr:style -----

        function parseStyle(el) {
            if (!el) return undefined;
            const out = {};
            for (const c of elements(el)) {
                if (c.name === 'a:lnRef')          out.lnRef     = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:fillRef')   out.fillRef   = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:effectRef') out.effectRef = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:fontRef')   out.fontRef   = { idx: c.attrs.idx, raw: c };
            }
            return out;
        }

        function renderStyle(s) {
            const kids = [];
            if (s.lnRef)     kids.push(s.lnRef.raw     || xml.el('a:lnRef',     { idx: String(s.lnRef.idx) }));
            if (s.fillRef)   kids.push(s.fillRef.raw   || xml.el('a:fillRef',   { idx: String(s.fillRef.idx) }));
            if (s.effectRef) kids.push(s.effectRef.raw || xml.el('a:effectRef', { idx: String(s.effectRef.idx) }));
            if (s.fontRef)   kids.push(s.fontRef.raw   || xml.el('a:fontRef',   { idx: String(s.fontRef.idx) }));
            return xml.el('xdr:style', {}, kids);
        }

        // ----- xdr:contentPart -----

        function parseContentPart(el) {
            if (!el) return undefined;
            return { rId: el.attrs['r:id'] };
        }

        function renderContentPart(p) {
            const a = {};
            if (p.rId != null) a['r:id'] = String(p.rId);
            return xml.el('xdr:contentPart', a);
        }

        // ----- xdr:cxnSp (connector shape) -----

        function parseCxnSp(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'xdr:nvCxnSpPr': out.nvCxnSpPr = parseNvCxnSpPr(c); break;
                    case 'xdr:spPr':      out.spPr = { children: (c.children || []).slice() }; break;
                    case 'xdr:style':     out.style = parseStyle(c); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderCxnSp(c) {
            const kids = [];
            if (c.nvCxnSpPr) kids.push(renderNvCxnSpPr(c.nvCxnSpPr));
            if (c.spPr)      kids.push(xml.el('xdr:spPr', {}, c.spPr.children || []));
            if (c.style)     kids.push(renderStyle(c.style));
            if (c._extras)   kids.push(...c._extras);
            return xml.el('xdr:cxnSp', c.attrs || {}, kids);
        }

        // ----- xdr:grpSp (group shape) -----

        function parseGrpSp(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs }, items: [] };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'xdr:nvGrpSpPr': out.nvGrpSpPr = parseNvGrpSpPr(c); break;
                    case 'xdr:grpSpPr':   out.grpSpPr = parseGrpSpPr(c); break;
                    case 'xdr:cxnSp':     out.items.push({ kind: 'cxnSp', node: parseCxnSp(c) }); break;
                    case 'xdr:grpSp':     out.items.push({ kind: 'grpSp', node: parseGrpSp(c) }); break;
                    case 'xdr:contentPart':
                        out.items.push({ kind: 'contentPart', node: parseContentPart(c) }); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderGrpSp(g) {
            const kids = [];
            if (g.nvGrpSpPr) kids.push(renderNvGrpSpPr(g.nvGrpSpPr));
            if (g.grpSpPr)   kids.push(renderGrpSpPr(g.grpSpPr));
            for (const it of (g.items || [])) {
                if (it.kind === 'cxnSp')            kids.push(renderCxnSp(it.node));
                else if (it.kind === 'grpSp')       kids.push(renderGrpSp(it.node));
                else if (it.kind === 'contentPart') kids.push(renderContentPart(it.node));
            }
            if (g._extras) kids.push(...g._extras);
            return xml.el('xdr:grpSp', g.attrs || {}, kids);
        }

        // ----- Anchor markers (from/to) -----

        function parseMarker(el) {
            if (!el) return undefined;
            const out = {};
            const col   = xml.findChild(el, 'xdr:col');
            const colOff= xml.findChild(el, 'xdr:colOff');
            const row   = xml.findChild(el, 'xdr:row');
            const rowOff= xml.findChild(el, 'xdr:rowOff');
            if (col)    out.col    = Number(xml.textContent(col));
            if (colOff) out.colOff = Number(xml.textContent(colOff));
            if (row)    out.row    = Number(xml.textContent(row));
            if (rowOff) out.rowOff = Number(xml.textContent(rowOff));
            return out;
        }

        function renderMarker(tag, m) {
            const kids = [];
            if (m.col != null)    kids.push(xml.el('xdr:col',    {}, [xml.text(String(m.col))]));
            if (m.colOff != null) kids.push(xml.el('xdr:colOff', {}, [xml.text(String(m.colOff))]));
            if (m.row != null)    kids.push(xml.el('xdr:row',    {}, [xml.text(String(m.row))]));
            if (m.rowOff != null) kids.push(xml.el('xdr:rowOff', {}, [xml.text(String(m.rowOff))]));
            return xml.el(tag, {}, kids);
        }

        function parseExt(el) {
            if (!el) return undefined;
            return { cx: el.attrs.cx, cy: el.attrs.cy };
        }

        function renderExt(e) {
            return xml.el('xdr:ext', { cx: String(e.cx), cy: String(e.cy) });
        }

        // ----- Anchor parsing/rendering (absolute/oneCell/twoCell) -----

        function parseAnchorBody(el) {
            const out = { attrs: { ...el.attrs }, items: [] };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'xdr:from': out.from = parseMarker(c); break;
                    case 'xdr:to':   out.to   = parseMarker(c); break;
                    case 'xdr:ext':  out.ext  = parseExt(c); break;
                    case 'xdr:pos':  out.pos  = { x: c.attrs.x, y: c.attrs.y }; break;
                    case 'xdr:cxnSp':
                        out.items.push({ kind: 'cxnSp', node: parseCxnSp(c) }); break;
                    case 'xdr:grpSp':
                        out.items.push({ kind: 'grpSp', node: parseGrpSp(c) }); break;
                    case 'xdr:contentPart':
                        out.items.push({ kind: 'contentPart', node: parseContentPart(c) }); break;
                    case 'xdr:clientData':
                        out.clientData = { ...c.attrs }; break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderAnchorChildren(a) {
            const kids = [];
            if (a.pos)  kids.push(xml.el('xdr:pos', { x: String(a.pos.x), y: String(a.pos.y) }));
            if (a.from) kids.push(renderMarker('xdr:from', a.from));
            if (a.to)   kids.push(renderMarker('xdr:to',   a.to));
            if (a.ext)  kids.push(renderExt(a.ext));
            for (const it of (a.items || [])) {
                if (it.kind === 'cxnSp')            kids.push(renderCxnSp(it.node));
                else if (it.kind === 'grpSp')       kids.push(renderGrpSp(it.node));
                else if (it.kind === 'contentPart') kids.push(renderContentPart(it.node));
            }
            if (a.clientData) kids.push(xml.el('xdr:clientData', { ...a.clientData }));
            if (a._extras)    kids.push(...a._extras);
            return kids;
        }

        function parseAbsoluteAnchor(el) {
            return el ? parseAnchorBody(el) : undefined;
        }
        function renderAbsoluteAnchor(a) {
            return xml.el('xdr:absoluteAnchor', a.attrs || {}, renderAnchorChildren(a));
        }

        function parseOneCellAnchor(el) {
            return el ? parseAnchorBody(el) : undefined;
        }
        function renderOneCellAnchor(a) {
            return xml.el('xdr:oneCellAnchor', a.attrs || {}, renderAnchorChildren(a));
        }

        function parseTwoCellAnchor(el) {
            return el ? parseAnchorBody(el) : undefined;
        }
        function renderTwoCellAnchor(a) {
            return xml.el('xdr:twoCellAnchor', a.attrs || {}, renderAnchorChildren(a));
        }

        // Back-compat passthrough names (existing API).
        function parseConnector(el) { return parseCxnSp(el); }
        function renderConnector(c) { return renderCxnSp(c); }
        function parseGroupShape(el) { return parseGrpSp(el); }
        function renderGroupShape(g) { return renderGrpSp(g); }

        return {
            parseConnector, renderConnector,
            parseGroupShape, renderGroupShape,
            parseCxnSp, renderCxnSp,
            parseGrpSp, renderGrpSp,
            parseCNvCxnSpPr, renderCNvCxnSpPr,
            parseNvCxnSpPr, renderNvCxnSpPr,
            parseCNvGrpSpPr, renderCNvGrpSpPr,
            parseNvGrpSpPr, renderNvGrpSpPr,
            parseGrpSpPr, renderGrpSpPr,
            parseStyle, renderStyle,
            parseContentPart, renderContentPart,
            parseAbsoluteAnchor, renderAbsoluteAnchor,
            parseOneCellAnchor, renderOneCellAnchor,
            parseTwoCellAnchor, renderTwoCellAnchor,
            parseCNvPr, renderCNvPr
        };
    }
};
