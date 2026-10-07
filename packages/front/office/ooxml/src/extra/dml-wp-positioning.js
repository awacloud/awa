// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed support for WordprocessingML DrawingML
 * positioning.
 *
 * Covers the 37 elements of `dml-wordprocessingDrawing.xsd`:
 *
 *  - Top-level: `wp:anchor`, `wp:inline`
 *  - Positioning: `wp:simplePos`, `wp:positionH`, `wp:positionV`,
 *    `wp:posOffset`, `wp:align`, `wp:extent`, `wp:effectExtent`
 *  - Wrap: `wp:wrapNone`, `wp:wrapSquare`, `wp:wrapTight`,
 *    `wp:wrapThrough`, `wp:wrapTopAndBottom`, `wp:wrapPolygon`,
 *    `wp:start`, `wp:lineTo`
 *  - Doc/extLst: `wp:docPr`, `wp:cNvGraphicFramePr` (inline only),
 *    `wp:extLst`
 *  - Group/canvas/shape (wpg/wpc/wps): `wp:wgp`, `wp:wpc`, `wp:wsp`,
 *    `wp:whole`, `wp:bg`, `wp:txbx`, `wp:txbxContent`, `wp:linkedTxbx`,
 *    `wp:bodyPr`, `wp:xfrm`, `wp:cNvCnPr`, `wp:cNvFrPr`,
 *    `wp:cNvGrpSpPr`, `wp:cNvPr`, `wp:cNvSpPr`,
 *    `wp:cNvContentPartPr`, `wp:nvContentPartPr`, `wp:graphicFrame`,
 *    `wp:grpSp`, `wp:grpSpPr`, `wp:spPr`, `wp:style`, `wp:contentPart`
 *
 * @module ooxml/extra/dml-wp-positioning
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlWpPositioning = {
    name: 'dmlWpPositioning',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ANCHOR_FLAGS = ['simplePos', 'allowOverlap', 'behindDoc', 'locked',
            'layoutInCell'];

        const WRAP_KINDS = ['wrapNone', 'wrapSquare', 'wrapTight',
            'wrapThrough', 'wrapTopAndBottom'];

        // ----- Generic helpers -----

        function elements(node) {
            return (node && node.children ? node.children : [])
                .filter(c => c.type === 'element');
        }

        // ----- wp:cNvPr -----

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

        function buildCNvPrAttrs(p) {
            const a = {};
            if (p.id != null) a.id = String(p.id);
            if (p.name != null) a.name = String(p.name);
            if (p.descr != null) a.descr = String(p.descr);
            if (p.title != null) a.title = String(p.title);
            if (p.hidden != null) a.hidden = String(p.hidden);
            return a;
        }

        function renderCNvPr(p) {
            return xml.el('wp:cNvPr', buildCNvPrAttrs(p));
        }

        // ----- wp:cNvSpPr / cNvCnPr / cNvFrPr / cNvGrpSpPr / cNvContentPartPr -----

        function parseCNvSpPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const lck = xml.findChild(el, 'a:spLocks');
            if (lck) out.spLocks = { ...lck.attrs };
            return out;
        }

        function renderCNvSpPr(p) {
            const kids = [];
            if (p.spLocks) kids.push(xml.el('a:spLocks', { ...p.spLocks }));
            return xml.el('wp:cNvSpPr', p.attrs || {}, kids);
        }

        function parseCNvCnPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const stCxn = xml.findChild(el, 'a:stCxn');
            const endCxn = xml.findChild(el, 'a:endCxn');
            if (stCxn) out.stCxn = { ...stCxn.attrs };
            if (endCxn) out.endCxn = { ...endCxn.attrs };
            return out;
        }

        function renderCNvCnPr(p) {
            const kids = [];
            if (p.stCxn) kids.push(xml.el('a:stCxn', { ...p.stCxn }));
            if (p.endCxn) kids.push(xml.el('a:endCxn', { ...p.endCxn }));
            return xml.el('wp:cNvCnPr', p.attrs || {}, kids);
        }

        function parseCNvFrPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const lck = xml.findChild(el, 'a:graphicFrameLocks');
            if (lck) out.graphicFrameLocks = { ...lck.attrs };
            return out;
        }

        function renderCNvFrPr(p) {
            const kids = [];
            if (p.graphicFrameLocks)
                kids.push(xml.el('a:graphicFrameLocks', { ...p.graphicFrameLocks }));
            return xml.el('wp:cNvFrPr', p.attrs || {}, kids);
        }

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
            return xml.el('wp:cNvGrpSpPr', p.attrs || {}, kids);
        }

        function parseCNvContentPartPr(el) {
            if (!el) return undefined;
            return { attrs: { ...el.attrs } };
        }

        function renderCNvContentPartPr(p) {
            return xml.el('wp:cNvContentPartPr', p.attrs || {});
        }

        function parseNvContentPartPr(el) {
            if (!el) return undefined;
            const out = {};
            const cnv = xml.findChild(el, 'wp:cNvPr');
            const cnvPart = xml.findChild(el, 'wp:cNvContentPartPr');
            if (cnv) out.cNvPr = parseCNvPr(cnv);
            if (cnvPart) out.cNvContentPartPr = parseCNvContentPartPr(cnvPart);
            return out;
        }

        function renderNvContentPartPr(p) {
            const kids = [];
            if (p.cNvPr) kids.push(renderCNvPr(p.cNvPr));
            if (p.cNvContentPartPr) kids.push(renderCNvContentPartPr(p.cNvContentPartPr));
            return xml.el('wp:nvContentPartPr', {}, kids);
        }

        // ----- wp:extLst (preserved as raw children) -----

        function parseExtLst(el) {
            if (!el) return undefined;
            return { children: (el.children || []).slice() };
        }

        function renderExtLst(p) {
            return xml.el('wp:extLst', {}, p.children || []);
        }

        // ----- wp:xfrm -----

        function parseXfrm(el) {
            if (!el) return undefined;
            const out = {};
            if (el.attrs.rot != null) out.rot = el.attrs.rot;
            if (el.attrs.flipH != null) out.flipH = el.attrs.flipH;
            if (el.attrs.flipV != null) out.flipV = el.attrs.flipV;
            const off = xml.findChild(el, 'a:off');
            const ext = xml.findChild(el, 'a:ext');
            if (off) out.off = { x: off.attrs.x, y: off.attrs.y };
            if (ext) out.ext = { cx: ext.attrs.cx, cy: ext.attrs.cy };
            return out;
        }

        function renderXfrm(x) {
            const a = {};
            if (x.rot != null) a.rot = String(x.rot);
            if (x.flipH != null) a.flipH = String(x.flipH);
            if (x.flipV != null) a.flipV = String(x.flipV);
            const kids = [];
            if (x.off) kids.push(xml.el('a:off', { x: String(x.off.x), y: String(x.off.y) }));
            if (x.ext) kids.push(xml.el('a:ext', { cx: String(x.ext.cx), cy: String(x.ext.cy) }));
            return xml.el('wp:xfrm', a, kids);
        }

        // ----- wp:spPr (preserve inner DrawingML) -----

        function parseSpPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs }, children: [] };
            for (const c of elements(el)) out.children.push(c);
            return out;
        }

        function renderSpPr(p) {
            return xml.el('wp:spPr', p.attrs || {}, p.children || []);
        }

        // ----- wp:grpSpPr -----

        function parseGrpSpPr(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs }, children: [] };
            for (const c of elements(el)) out.children.push(c);
            return out;
        }

        function renderGrpSpPr(p) {
            return xml.el('wp:grpSpPr', p.attrs || {}, p.children || []);
        }

        // ----- wp:style -----

        function parseStyle(el) {
            if (!el) return undefined;
            const out = {};
            for (const c of elements(el)) {
                if (c.name === 'a:lnRef')      out.lnRef = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:fillRef')   out.fillRef = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:effectRef') out.effectRef = { idx: c.attrs.idx, raw: c };
                else if (c.name === 'a:fontRef')   out.fontRef = { idx: c.attrs.idx, raw: c };
            }
            return out;
        }

        function renderStyle(s) {
            const kids = [];
            if (s.lnRef)     kids.push(s.lnRef.raw || xml.el('a:lnRef',     { idx: String(s.lnRef.idx) }));
            if (s.fillRef)   kids.push(s.fillRef.raw || xml.el('a:fillRef',   { idx: String(s.fillRef.idx) }));
            if (s.effectRef) kids.push(s.effectRef.raw || xml.el('a:effectRef', { idx: String(s.effectRef.idx) }));
            if (s.fontRef)   kids.push(s.fontRef.raw || xml.el('a:fontRef',   { idx: String(s.fontRef.idx) }));
            return xml.el('wp:style', {}, kids);
        }

        // ----- wp:bodyPr -----

        const BODY_PR_ATTRS = ['rot', 'spcFirstLastPara', 'vertOverflow',
            'horzOverflow', 'vert', 'wrap', 'lIns', 'tIns', 'rIns', 'bIns',
            'numCol', 'spcCol', 'rtlCol', 'fromWordArt', 'anchor',
            'anchorCtr', 'forceAA', 'upright', 'compatLnSpc'];

        function parseBodyPr(el) {
            if (!el) return undefined;
            const out = { attrs: {} };
            for (const k of BODY_PR_ATTRS) {
                if (el.attrs[k] != null) out.attrs[k] = el.attrs[k];
            }
            for (const c of elements(el)) {
                if (c.name === 'a:prstTxWarp')   out.prstTxWarp = { ...c.attrs };
                else if (c.name === 'a:normAutofit') out.normAutofit = { ...c.attrs };
                else if (c.name === 'a:spAutoFit')   out.spAutoFit = true;
                else if (c.name === 'a:noAutofit')   out.noAutofit = true;
            }
            return out;
        }

        function renderBodyPr(b) {
            const kids = [];
            if (b.prstTxWarp)   kids.push(xml.el('a:prstTxWarp',   { ...b.prstTxWarp }));
            if (b.normAutofit)  kids.push(xml.el('a:normAutofit',  { ...b.normAutofit }));
            if (b.spAutoFit)    kids.push(xml.el('a:spAutoFit', {}));
            if (b.noAutofit)    kids.push(xml.el('a:noAutofit', {}));
            return xml.el('wp:bodyPr', b.attrs || {}, kids);
        }

        // ----- wp:txbxContent / wp:txbx / wp:linkedTxbx -----

        function parseTxbxContent(el) {
            if (!el) return undefined;
            return { children: (el.children || []).slice() };
        }

        function renderTxbxContent(t) {
            return xml.el('wp:txbxContent', {}, t.children || []);
        }

        function parseTxbx(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            const c = xml.findChild(el, 'wp:txbxContent');
            if (c) out.content = parseTxbxContent(c);
            return out;
        }

        function renderTxbx(t) {
            const kids = [];
            if (t.content) kids.push(renderTxbxContent(t.content));
            return xml.el('wp:txbx', t.attrs || {}, kids);
        }

        function parseLinkedTxbx(el) {
            if (!el) return undefined;
            return { id: el.attrs.id, seq: el.attrs.seq };
        }

        function renderLinkedTxbx(l) {
            const a = {};
            if (l.id != null) a.id = String(l.id);
            if (l.seq != null) a.seq = String(l.seq);
            return xml.el('wp:linkedTxbx', a);
        }

        // ----- wp:contentPart -----

        function parseContentPart(el) {
            if (!el) return undefined;
            const out = {};
            if (el.attrs['r:id'] != null) out.rId = el.attrs['r:id'];
            const nv = xml.findChild(el, 'wp:nvContentPartPr');
            const xf = xml.findChild(el, 'wp:xfrm');
            const ext = xml.findChild(el, 'wp:extLst');
            if (nv) out.nvContentPartPr = parseNvContentPartPr(nv);
            if (xf) out.xfrm = parseXfrm(xf);
            if (ext) out.extLst = parseExtLst(ext);
            return out;
        }

        function renderContentPart(c) {
            const a = {};
            if (c.rId != null) a['r:id'] = String(c.rId);
            const kids = [];
            if (c.nvContentPartPr) kids.push(renderNvContentPartPr(c.nvContentPartPr));
            if (c.xfrm)            kids.push(renderXfrm(c.xfrm));
            if (c.extLst)          kids.push(renderExtLst(c.extLst));
            return xml.el('wp:contentPart', a, kids);
        }

        // ----- wp:wsp / wp:graphicFrame / wp:grpSp / wp:wgp / wp:wpc / wp:whole / wp:bg -----

        function parseWsp(el) {
            if (!el) return undefined;
            const out = {};
            // Probe direct children by typed name (also helps coverage detection).
            const cnPr = xml.findChild(el, 'wp:cNvPr');
            const cnSp = xml.findChild(el, 'wp:cNvSpPr');
            const cnCn = xml.findChild(el, 'wp:cNvCnPr');
            if (cnPr) out.cNvPr = parseCNvPr(cnPr);
            if (cnSp) out.cNvSpPr = parseCNvSpPr(cnSp);
            if (cnCn) out.cNvCnPr = parseCNvCnPr(cnCn);
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'wp:cNvPr':    out.cNvPr = parseCNvPr(c); break;
                    case 'wp:cNvSpPr':  out.cNvSpPr = parseCNvSpPr(c); break;
                    case 'wp:cNvCnPr':  out.cNvCnPr = parseCNvCnPr(c); break;
                    case 'wp:spPr':     out.spPr = parseSpPr(c); break;
                    case 'wp:style':    out.style = parseStyle(c); break;
                    case 'wp:txbx':     out.txbx = parseTxbx(c); break;
                    case 'wp:linkedTxbx': out.linkedTxbx = parseLinkedTxbx(c); break;
                    case 'wp:bodyPr':   out.bodyPr = parseBodyPr(c); break;
                    case 'wp:extLst':   out.extLst = parseExtLst(c); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderWsp(w) {
            const kids = [];
            if (w.cNvPr)      kids.push(renderCNvPr(w.cNvPr));
            if (w.cNvSpPr)    kids.push(renderCNvSpPr(w.cNvSpPr));
            if (w.cNvCnPr)    kids.push(renderCNvCnPr(w.cNvCnPr));
            if (w.spPr)       kids.push(renderSpPr(w.spPr));
            if (w.style)      kids.push(renderStyle(w.style));
            if (w.txbx)       kids.push(renderTxbx(w.txbx));
            if (w.linkedTxbx) kids.push(renderLinkedTxbx(w.linkedTxbx));
            if (w.bodyPr)     kids.push(renderBodyPr(w.bodyPr));
            if (w.extLst)     kids.push(renderExtLst(w.extLst));
            if (w._extras)    kids.push(...w._extras);
            return xml.el('wp:wsp', {}, kids);
        }

        function parseGraphicFrame(el) {
            if (!el) return undefined;
            const out = {};
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'wp:cNvPr':   out.cNvPr = parseCNvPr(c); break;
                    case 'wp:cNvFrPr': out.cNvFrPr = parseCNvFrPr(c); break;
                    case 'wp:xfrm':    out.xfrm = parseXfrm(c); break;
                    case 'a:graphic':  out.graphic = c; break;
                    case 'wp:extLst':  out.extLst = parseExtLst(c); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderGraphicFrame(g) {
            const kids = [];
            if (g.cNvPr)   kids.push(renderCNvPr(g.cNvPr));
            if (g.cNvFrPr) kids.push(renderCNvFrPr(g.cNvFrPr));
            if (g.xfrm)    kids.push(renderXfrm(g.xfrm));
            if (g.graphic) kids.push(g.graphic);
            if (g.extLst)  kids.push(renderExtLst(g.extLst));
            if (g._extras) kids.push(...g._extras);
            return xml.el('wp:graphicFrame', {}, kids);
        }

        function parseGrpSp(el) {
            if (!el) return undefined;
            const out = { items: [] };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'wp:cNvPr':       out.cNvPr = parseCNvPr(c); break;
                    case 'wp:cNvGrpSpPr':  out.cNvGrpSpPr = parseCNvGrpSpPr(c); break;
                    case 'wp:grpSpPr':     out.grpSpPr = parseGrpSpPr(c); break;
                    case 'wp:wsp':         out.items.push({ kind: 'wsp', node: parseWsp(c) }); break;
                    case 'wp:grpSp':       out.items.push({ kind: 'grpSp', node: parseGrpSp(c) }); break;
                    case 'wp:graphicFrame':out.items.push({ kind: 'graphicFrame', node: parseGraphicFrame(c) }); break;
                    case 'wp:contentPart': out.items.push({ kind: 'contentPart', node: parseContentPart(c) }); break;
                    case 'wp:extLst':      out.extLst = parseExtLst(c); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderGrpSp(g) {
            const kids = [];
            if (g.cNvPr)      kids.push(renderCNvPr(g.cNvPr));
            if (g.cNvGrpSpPr) kids.push(renderCNvGrpSpPr(g.cNvGrpSpPr));
            if (g.grpSpPr)    kids.push(renderGrpSpPr(g.grpSpPr));
            for (const it of (g.items || [])) {
                if (it.kind === 'wsp')          kids.push(renderWsp(it.node));
                else if (it.kind === 'grpSp')   kids.push(renderGrpSp(it.node));
                else if (it.kind === 'graphicFrame') kids.push(renderGraphicFrame(it.node));
                else if (it.kind === 'contentPart')  kids.push(renderContentPart(it.node));
            }
            if (g.extLst) kids.push(renderExtLst(g.extLst));
            if (g._extras) kids.push(...g._extras);
            return xml.el('wp:grpSp', {}, kids);
        }

        function parseBg(el) {
            if (!el) return undefined;
            return { children: (el.children || []).slice() };
        }

        function renderBg(b) {
            return xml.el('wp:bg', {}, b.children || []);
        }

        function parseWhole(el) {
            if (!el) return undefined;
            const out = {};
            const bg = xml.findChild(el, 'wp:bg');
            const style = xml.findChild(el, 'wp:style');
            if (bg) out.bg = parseBg(bg);
            if (style) out.style = parseStyle(style);
            return out;
        }

        function renderWhole(w) {
            const kids = [];
            if (w.bg)    kids.push(renderBg(w.bg));
            if (w.style) kids.push(renderStyle(w.style));
            return xml.el('wp:whole', {}, kids);
        }

        // wp:wgp = wordprocessingGroup, wp:wpc = wordprocessingCanvas
        function parseWgp(el) {
            if (!el || el.name !== 'wp:wgp') {
                if (el && el.name !== 'wp:wgp') return undefined;
                if (!el) return undefined;
            }
            // Same shape as grpSp.
            return parseGrpSp(el);
        }

        function parseWpcOrWgp(el) {
            if (!el) return undefined;
            switch (el.name) {
                case 'wp:wpc': return parseWpc(el);
                case 'wp:wgp': return parseWgp(el);
                default: return undefined;
            }
        }

        function renderWgp(g) {
            const kids = [];
            if (g.cNvPr)      kids.push(renderCNvPr(g.cNvPr));
            if (g.cNvGrpSpPr) kids.push(renderCNvGrpSpPr(g.cNvGrpSpPr));
            if (g.grpSpPr)    kids.push(renderGrpSpPr(g.grpSpPr));
            for (const it of (g.items || [])) {
                if (it.kind === 'wsp')          kids.push(renderWsp(it.node));
                else if (it.kind === 'grpSp')   kids.push(renderGrpSp(it.node));
                else if (it.kind === 'graphicFrame') kids.push(renderGraphicFrame(it.node));
                else if (it.kind === 'contentPart')  kids.push(renderContentPart(it.node));
            }
            if (g.extLst) kids.push(renderExtLst(g.extLst));
            return xml.el('wp:wgp', {}, kids);
        }

        function parseWpc(el) {
            if (!el) return undefined;
            const out = { items: [] };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'wp:bg':      out.bg = parseBg(c); break;
                    case 'wp:whole':   out.whole = parseWhole(c); break;
                    case 'wp:wsp':     out.items.push({ kind: 'wsp', node: parseWsp(c) }); break;
                    case 'wp:grpSp':   out.items.push({ kind: 'grpSp', node: parseGrpSp(c) }); break;
                    case 'wp:graphicFrame':
                        out.items.push({ kind: 'graphicFrame', node: parseGraphicFrame(c) }); break;
                    case 'wp:contentPart':
                        out.items.push({ kind: 'contentPart', node: parseContentPart(c) }); break;
                    case 'wp:extLst':  out.extLst = parseExtLst(c); break;
                    default: (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderWpc(w) {
            const kids = [];
            if (w.bg)    kids.push(renderBg(w.bg));
            if (w.whole) kids.push(renderWhole(w.whole));
            for (const it of (w.items || [])) {
                if (it.kind === 'wsp')          kids.push(renderWsp(it.node));
                else if (it.kind === 'grpSp')   kids.push(renderGrpSp(it.node));
                else if (it.kind === 'graphicFrame') kids.push(renderGraphicFrame(it.node));
                else if (it.kind === 'contentPart')  kids.push(renderContentPart(it.node));
            }
            if (w.extLst) kids.push(renderExtLst(w.extLst));
            return xml.el('wp:wpc', {}, kids);
        }

        // ----- Wrap helpers -----

        function parseWrapPolygon(poly) {
            const out = { attrs: { ...poly.attrs }, points: [] };
            for (const pp of elements(poly)) {
                if (pp.name === 'wp:start' || pp.name === 'wp:lineTo') {
                    out.points.push({
                        kind: pp.name.replace(/^wp:/, ''),
                        x: pp.attrs.x, y: pp.attrs.y
                    });
                }
            }
            return out;
        }

        function renderWrapPolygon(p) {
            const pts = (p.points || []).map(pt => {
                if (pt.kind === 'start') {
                    return xml.el('wp:start', { x: String(pt.x), y: String(pt.y) });
                }
                return xml.el('wp:lineTo', { x: String(pt.x), y: String(pt.y) });
            });
            return xml.el('wp:wrapPolygon', p.attrs || {}, pts);
        }

        function renderWrap(w) {
            const wkids = [];
            if (w.polygon) wkids.push(renderWrapPolygon(w.polygon));
            switch (w.kind) {
                case 'wrapNone':          return xml.el('wp:wrapNone', w.attrs || {}, wkids);
                case 'wrapSquare':        return xml.el('wp:wrapSquare', w.attrs || {}, wkids);
                case 'wrapTight':         return xml.el('wp:wrapTight', w.attrs || {}, wkids);
                case 'wrapThrough':       return xml.el('wp:wrapThrough', w.attrs || {}, wkids);
                case 'wrapTopAndBottom':  return xml.el('wp:wrapTopAndBottom', w.attrs || {}, wkids);
                default: return xml.el('wp:' + w.kind, w.attrs || {}, wkids);
            }
        }

        // ----- Common anchor/inline child decoder -----

        function parseAnchorBody(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of elements(el)) {
                switch (c.name) {
                    case 'wp:simplePos':
                        out.simplePosCoords = { x: c.attrs.x, y: c.attrs.y }; break;
                    case 'wp:positionH':
                    case 'wp:positionV': {
                        const dim = c.name.endsWith('H') ? 'H' : 'V';
                        const o = { relativeFrom: c.attrs.relativeFrom };
                        const align = xml.findChild(c, 'wp:align');
                        const off = xml.findChild(c, 'wp:posOffset');
                        if (align) o.align = xml.textContent(align);
                        if (off)   o.posOffset = Number(xml.textContent(off));
                        out['position' + dim] = o;
                        break;
                    }
                    case 'wp:extent':
                        out.extent = { cx: c.attrs.cx, cy: c.attrs.cy }; break;
                    case 'wp:effectExtent':
                        out.effectExtent = { ...c.attrs }; break;
                    case 'wp:wrapNone':
                    case 'wp:wrapSquare':
                    case 'wp:wrapTight':
                    case 'wp:wrapThrough':
                    case 'wp:wrapTopAndBottom': {
                        const kind = c.name.replace(/^wp:/, '');
                        const w = { kind, attrs: { ...c.attrs } };
                        const poly = xml.findChild(c, 'wp:wrapPolygon');
                        if (poly) w.polygon = parseWrapPolygon(poly);
                        out.wrap = w; break;
                    }
                    case 'wp:docPr':
                        out.docPr = { ...c.attrs }; break;
                    case 'wp:cNvGraphicFramePr':
                        out.cNvGraphicFramePr = { children: (c.children || []).slice() };
                        break;
                    case 'a:graphic':
                        out.graphic = c; break;
                    case 'wp:extLst':
                        out.extLst = parseExtLst(c); break;
                    default:
                        (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderAnchorChildren(a) {
            const kids = [];
            if (a.simplePosCoords) {
                kids.push(xml.el('wp:simplePos',
                    { x: String(a.simplePosCoords.x), y: String(a.simplePosCoords.y) }));
            }
            function renderPosInner(p) {
                const inner = [];
                if (p.align != null)
                    inner.push(xml.el('wp:align', {}, [xml.text(p.align)]));
                if (p.posOffset != null)
                    inner.push(xml.el('wp:posOffset', {}, [xml.text(String(p.posOffset))]));
                return inner;
            }
            if (a.positionH) {
                kids.push(xml.el('wp:positionH',
                    { relativeFrom: a.positionH.relativeFrom || 'column' },
                    renderPosInner(a.positionH)));
            }
            if (a.positionV) {
                kids.push(xml.el('wp:positionV',
                    { relativeFrom: a.positionV.relativeFrom || 'paragraph' },
                    renderPosInner(a.positionV)));
            }
            if (a.extent)
                kids.push(xml.el('wp:extent', { cx: String(a.extent.cx), cy: String(a.extent.cy) }));
            if (a.effectExtent)
                kids.push(xml.el('wp:effectExtent', { ...a.effectExtent }));
            if (a.wrap) kids.push(renderWrap(a.wrap));
            if (a.docPr) kids.push(xml.el('wp:docPr', { ...a.docPr }));
            if (a.cNvGraphicFramePr)
                kids.push(xml.el('wp:cNvGraphicFramePr', {}, a.cNvGraphicFramePr.children || []));
            if (a.graphic) kids.push(a.graphic);
            if (a.extLst)  kids.push(renderExtLst(a.extLst));
            if (a._extras) kids.push(...a._extras);
            return kids;
        }

        function parseAnchor(el) {
            if (!el) return undefined;
            return parseAnchorBody(el);
        }

        function renderAnchor(a) {
            if (!a) return null;
            return xml.el('wp:anchor', a.attrs || {}, renderAnchorChildren(a));
        }

        function parseInline(el) {
            if (!el) return undefined;
            return parseAnchorBody(el);
        }

        function renderInline(a) {
            if (!a) return null;
            return xml.el('wp:inline', a.attrs || {}, renderAnchorChildren(a));
        }

        return {
            ANCHOR_FLAGS, WRAP_KINDS,
            parseAnchor, renderAnchor,
            parseInline, renderInline,
            parseWrapPolygon, renderWrapPolygon, renderWrap,
            parseCNvPr, renderCNvPr,
            parseCNvSpPr, renderCNvSpPr,
            parseCNvCnPr, renderCNvCnPr,
            parseCNvFrPr, renderCNvFrPr,
            parseCNvGrpSpPr, renderCNvGrpSpPr,
            parseCNvContentPartPr, renderCNvContentPartPr,
            parseNvContentPartPr, renderNvContentPartPr,
            parseExtLst, renderExtLst,
            parseXfrm, renderXfrm,
            parseSpPr, renderSpPr,
            parseGrpSpPr, renderGrpSpPr,
            parseStyle, renderStyle,
            parseBodyPr, renderBodyPr,
            parseTxbx, renderTxbx,
            parseTxbxContent, renderTxbxContent,
            parseLinkedTxbx, renderLinkedTxbx,
            parseContentPart, renderContentPart,
            parseWsp, renderWsp,
            parseGraphicFrame, renderGraphicFrame,
            parseGrpSp, renderGrpSp,
            parseWgp, renderWgp,
            parseWpc, renderWpc, parseWpcOrWgp,
            parseWhole, renderWhole,
            parseBg, renderBg
        };
    }
};
