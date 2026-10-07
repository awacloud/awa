// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PresentationML animation timing graph.
 *
 * Deeply-typed parser/renderer for the `<p:timing>` element of a slide.
 * The animation graph is a recursive tree of `par`/`seq`/`excl` time nodes
 * with various `anim*` leaves, each one carrying a common-time-node
 * (`<p:cTn>`) with start/end conditions, child time nodes, iteration,
 * and behaviour-specific descendants (tav/tavLst, to/from/by, spTgt, ...).
 *
 * Every emitted node has a `kind` discriminator so the tree can be
 * traversed uniformly. The previous `_raw` shortcut has been replaced
 * with a fully-typed shape; rendering reconstructs the XML from the
 * structure alone.
 *
 * @module ooxml/extra/pml-animations
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pmlAnimations = {
    name: 'pmlAnimations',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // Time-node element tags (children of childTnLst / tnLst)
        const TIME_NODE_TAGS = new Set([
            'p:par', 'p:seq', 'p:excl', 'p:anim', 'p:animClr',
            'p:animEffect', 'p:animMotion', 'p:animRot', 'p:animScale',
            'p:audio', 'p:video', 'p:cmd', 'p:set'
        ]);

        // Build-element tags (children of bldLst)
        const BLD_TAGS = new Set([
            'p:bldP', 'p:bldDgm', 'p:bldGraphic', 'p:bldOleChart', 'p:bldSub'
        ]);

        // ----------------------------------------------------------------
        // Sub-element parsers
        // ----------------------------------------------------------------

        function parseCondLst(el, kind) {
            // <p:stCondLst> / <p:endCondLst> / <p:prevCondLst> / <p:nextCondLst>
            const out = { kind, conds: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:cond') out.conds.push(parseCond(c));
            }
            return out;
        }

        function parseCond(el) {
            const out = { kind: 'cond', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:tgtEl') out.tgtEl = parseTgtEl(c);
                else if (c.name === 'p:tn') out.tn = { ...c.attrs };
                else if (c.name === 'p:rtn') out.rtn = { ...c.attrs };
            }
            return out;
        }

        function parseTgtEl(el) {
            const out = { kind: 'tgtEl' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:spTgt') out.spTgt = parseSpTgt(c);
                else if (c.name === 'p:sldTgt') out.sldTgt = { ...c.attrs };
                else if (c.name === 'p:sndTgt') out.sndTgt = { ...c.attrs };
                else if (c.name === 'p:inkTgt') out.inkTgt = { ...c.attrs };
            }
            return out;
        }

        function parseSpTgt(el) {
            const out = { kind: 'spTgt', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:bg')           out.bg = true;
                else if (c.name === 'p:txEl')    out.txEl = parseTxEl(c);
                else if (c.name === 'p:subSp')   out.subSp = { ...c.attrs };
                else if (c.name === 'p:oleChartEl') out.oleChartEl = { ...c.attrs };
                else if (c.name === 'p:graphicEl') out.graphicEl = true;
            }
            return out;
        }

        function parseTxEl(el) {
            const out = { kind: 'txEl' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:charRg') out.charRg = { ...c.attrs };
                else if (c.name === 'p:pRg') out.pRg = { ...c.attrs };
            }
            return out;
        }

        function parseIterate(el) {
            const out = { kind: 'iterate', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:tmAbs') out.tmAbs = { ...c.attrs };
                else if (c.name === 'p:tmPct') out.tmPct = { ...c.attrs };
            }
            return out;
        }

        function parseTavLst(el) {
            const out = { kind: 'tavLst', tavs: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'p:tav') {
                    out.tavs.push(parseTav(c));
                }
            }
            return out;
        }

        function parseTav(el) {
            const out = { kind: 'tav', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:val') out.val = parseAnimVal(c);
            }
            return out;
        }

        function parseAnimVal(el) {
            // <p:val>, <p:to>, <p:from>, <p:by>, <p:progress> — all wrap a value variant.
            let kind;
            switch (el.name) {
                case 'p:val':      kind = 'val'; break;
                case 'p:to':       kind = 'to'; break;
                case 'p:from':     kind = 'from'; break;
                case 'p:by':       kind = 'by'; break;
                case 'p:progress': kind = 'progress'; break;
                default:           kind = el.name.replace(/^p:/, '');
            }
            const out = { kind, attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:strVal') out.strVal = { ...c.attrs };
                else if (c.name === 'p:boolVal') out.boolVal = { ...c.attrs };
                else if (c.name === 'p:intVal') out.intVal = { ...c.attrs };
                else if (c.name === 'p:fltVal') out.fltVal = { ...c.attrs };
                else if (c.name === 'p:clrVal') out.clrVal = parseClrVal(c);
            }
            return out;
        }

        function parseClrVal(el) {
            const out = { kind: 'clrVal' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:rgb') out.rgb = { ...c.attrs };
                else if (c.name === 'p:hsl') out.hsl = { ...c.attrs };
            }
            return out;
        }

        function parseAttrNameLst(el) {
            const out = { kind: 'attrNameLst', names: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'p:attrName') {
                    out.names.push(xml.textContent(c));
                }
            }
            return out;
        }

        function parseCBhvr(el) {
            // Common behaviour: attrs on element + cTn + tgtEl + attrNameLst.
            const out = { kind: 'cBhvr', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:cTn') out.cTn = parseCTn(c);
                else if (c.name === 'p:tgtEl') out.tgtEl = parseTgtEl(c);
                else if (c.name === 'p:attrNameLst') out.attrNameLst = parseAttrNameLst(c);
            }
            return out;
        }

        function parseCMediaNode(el) {
            // Common media node (audio/video share this).
            const out = { kind: 'cMediaNode', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:cTn') out.cTn = parseCTn(c);
                else if (c.name === 'p:tgtEl') out.tgtEl = parseTgtEl(c);
            }
            return out;
        }

        function parseCmd(el) {
            const out = { kind: 'cmd', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:cBhvr') out.cBhvr = parseCBhvr(c);
            }
            return out;
        }

        // ----------------------------------------------------------------
        // cTn — common time node (the heart of the animation graph)
        // ----------------------------------------------------------------

        function parseCTn(el) {
            const out = { kind: 'cTn', attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'p:stCondLst':   out.stCondLst   = parseCondLst(c, 'stCondLst'); break;
                    case 'p:endCondLst':  out.endCondLst  = parseCondLst(c, 'endCondLst'); break;
                    case 'p:prevCondLst': out.prevCondLst = parseCondLst(c, 'prevCondLst'); break;
                    case 'p:nextCondLst': out.nextCondLst = parseCondLst(c, 'nextCondLst'); break;
                    case 'p:childTnLst':  out.childTnLst  = parseChildTnLst(c); break;
                    case 'p:subTnLst':    out.subTnLst    = parseChildTnLst(c, 'subTnLst'); break;
                    case 'p:iterate':     out.iterate     = parseIterate(c); break;
                    case 'p:endSync':     out.endSync     = parseCond(c); break;
                }
            }
            return out;
        }

        function parseChildTnLst(el, kind = 'childTnLst') {
            const out = { kind, children: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && TIME_NODE_TAGS.has(c.name)) {
                    out.children.push(parseTimeNode(c));
                }
            }
            return out;
        }

        // ----------------------------------------------------------------
        // Time node dispatch
        // ----------------------------------------------------------------

        function parseTimeNode(el) {
            // Accept any of the known time-node tags.
            let kind;
            switch (el.name) {
                case 'p:par':        kind = 'par'; break;
                case 'p:seq':        kind = 'seq'; break;
                case 'p:excl':       kind = 'excl'; break;
                case 'p:anim':       kind = 'anim'; break;
                case 'p:animClr':    kind = 'animClr'; break;
                case 'p:animEffect': kind = 'animEffect'; break;
                case 'p:animMotion': kind = 'animMotion'; break;
                case 'p:animRot':    kind = 'animRot'; break;
                case 'p:animScale':  kind = 'animScale'; break;
                case 'p:audio':      kind = 'audio'; break;
                case 'p:video':      kind = 'video'; break;
                case 'p:cmd':        kind = 'cmd'; break;
                case 'p:set':        kind = 'set'; break;
                default:             kind = el.name.replace(/^p:/, '');
            }
            const node = { kind, attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'p:cTn':       node.cTn = parseCTn(c); break;
                    case 'p:cBhvr':     node.cBhvr = parseCBhvr(c); break;
                    case 'p:cMediaNode': node.cMediaNode = parseCMediaNode(c); break;
                    case 'p:to':        node.to = parseAnimVal(c); break;
                    case 'p:from':      node.from = parseAnimVal(c); break;
                    case 'p:by':        node.by = parseAnimVal(c); break;
                    case 'p:tavLst':    node.tavLst = parseTavLst(c); break;
                    case 'p:progress':  node.progress = parseAnimVal(c); break;
                    case 'p:wheel':     node.wheel = { ...c.attrs }; break;
                    case 'p:videoClr':  node.videoClr = { ...c.attrs }; break;
                }
            }
            return node;
        }

        // ----------------------------------------------------------------
        // Build list (bldLst) — slide-level build configuration
        // ----------------------------------------------------------------

        function parseBld(el) {
            let local;
            switch (el.name) {
                case 'p:bldP':        local = 'bldP'; break;
                case 'p:bldDgm':      local = 'bldDgm'; break;
                case 'p:bldGraphic':  local = 'bldGraphic'; break;
                case 'p:bldOleChart': local = 'bldOleChart'; break;
                case 'p:bldSub':      local = 'bldSub'; break;
                default:              local = el.name.replace(/^p:/, '');
            }
            const out = { kind: local, attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:tmplLst') {
                    out.tmplLst = (c.children || [])
                        .filter(x => x.type === 'element' && x.name === 'p:tmpl')
                        .map(t => ({ kind: 'tmpl', attrs: { ...t.attrs } }));
                }
                else if (c.name === 'p:bldAsOne') out.bldAsOne = true;
                else if (c.name === 'p:bldSub')   out.bldSub = { kind: 'bldSub', attrs: { ...c.attrs } };
            }
            return out;
        }

        function parseBldLst(el) {
            const out = [];
            for (const c of el.children || []) {
                if (c.type === 'element' && BLD_TAGS.has(c.name)) {
                    out.push(parseBld(c));
                }
            }
            return out;
        }

        // ----------------------------------------------------------------
        // Top-level: <p:timing>
        // ----------------------------------------------------------------

        function parseTiming(timingEl) {
            if (!timingEl) return undefined;
            const out = { kind: 'timing' };
            const tnLst = xml.findChild(timingEl, 'p:tnLst');
            if (tnLst) {
                out.tnLst = [];
                for (const c of tnLst.children || []) {
                    if (c.type === 'element' && TIME_NODE_TAGS.has(c.name)) {
                        out.tnLst.push(parseTimeNode(c));
                    }
                }
            }
            const bldLst = xml.findChild(timingEl, 'p:bldLst');
            if (bldLst) out.bldLst = parseBldLst(bldLst);
            return out;
        }

        // ----------------------------------------------------------------
        // Renderers
        // ----------------------------------------------------------------

        function renderCondLst(node) {
            const conds = (node.conds || []).map(renderCond);
            switch (node.kind) {
                case 'stCondLst':   return xml.el('p:stCondLst',   {}, conds);
                case 'endCondLst':  return xml.el('p:endCondLst',  {}, conds);
                case 'prevCondLst': return xml.el('p:prevCondLst', {}, conds);
                case 'nextCondLst': return xml.el('p:nextCondLst', {}, conds);
                default:            return xml.el('p:' + node.kind, {}, conds);
            }
        }

        function renderCond(c) {
            const kids = [];
            if (c.tgtEl) kids.push(renderTgtEl(c.tgtEl));
            if (c.tn)    kids.push(xml.el('p:tn', c.tn));
            if (c.rtn)   kids.push(xml.el('p:rtn', c.rtn));
            return xml.el('p:cond', c.attrs || {}, kids);
        }

        function renderTgtEl(t) {
            const kids = [];
            if (t.spTgt)       kids.push(renderSpTgt(t.spTgt));
            if (t.sldTgt)      kids.push(xml.el('p:sldTgt', t.sldTgt));
            if (t.sndTgt)      kids.push(xml.el('p:sndTgt', t.sndTgt));
            if (t.inkTgt)      kids.push(xml.el('p:inkTgt', t.inkTgt));
            return xml.el('p:tgtEl', {}, kids);
        }

        function renderSpTgt(s) {
            const kids = [];
            if (s.bg)          kids.push(xml.el('p:bg', {}));
            if (s.txEl)        kids.push(renderTxEl(s.txEl));
            if (s.subSp)       kids.push(xml.el('p:subSp', s.subSp));
            if (s.oleChartEl)  kids.push(xml.el('p:oleChartEl', s.oleChartEl));
            if (s.graphicEl)   kids.push(xml.el('p:graphicEl', {}));
            return xml.el('p:spTgt', s.attrs || {}, kids);
        }

        function renderTxEl(t) {
            const kids = [];
            if (t.charRg) kids.push(xml.el('p:charRg', t.charRg));
            if (t.pRg)    kids.push(xml.el('p:pRg', t.pRg));
            return xml.el('p:txEl', {}, kids);
        }

        function renderIterate(it) {
            const kids = [];
            if (it.tmAbs) kids.push(xml.el('p:tmAbs', it.tmAbs));
            if (it.tmPct) kids.push(xml.el('p:tmPct', it.tmPct));
            return xml.el('p:iterate', it.attrs || {}, kids);
        }

        function renderTavLst(t) {
            return xml.el('p:tavLst', {}, (t.tavs || []).map(renderTav));
        }

        function renderTav(t) {
            const kids = [];
            if (t.val) kids.push(renderAnimVal(t.val));
            return xml.el('p:tav', t.attrs || {}, kids);
        }

        function renderAnimVal(v) {
            const kids = renderValChildren(v);
            const attrs = v.attrs || {};
            switch (v.kind) {
                case 'val':      return xml.el('p:val',      attrs, kids);
                case 'to':       return xml.el('p:to',       attrs, kids);
                case 'from':     return xml.el('p:from',     attrs, kids);
                case 'by':       return xml.el('p:by',       attrs, kids);
                case 'progress': return xml.el('p:progress', attrs, kids);
                default:         return xml.el('p:' + v.kind, attrs, kids);
            }
        }

        function renderClrVal(c) {
            const kids = [];
            if (c.rgb) kids.push(xml.el('p:rgb', c.rgb));
            if (c.hsl) kids.push(xml.el('p:hsl', c.hsl));
            return xml.el('p:clrVal', {}, kids);
        }

        function renderAttrNameLst(a) {
            return xml.el('p:attrNameLst', {},
                (a.names || []).map(n => xml.el('p:attrName', {}, [xml.text(n)])));
        }

        function renderCBhvr(b) {
            const kids = [];
            if (b.cTn)         kids.push(renderCTn(b.cTn));
            if (b.tgtEl)       kids.push(renderTgtEl(b.tgtEl));
            if (b.attrNameLst) kids.push(renderAttrNameLst(b.attrNameLst));
            return xml.el('p:cBhvr', b.attrs || {}, kids);
        }

        function renderCMediaNode(m) {
            const kids = [];
            if (m.cTn)   kids.push(renderCTn(m.cTn));
            if (m.tgtEl) kids.push(renderTgtEl(m.tgtEl));
            return xml.el('p:cMediaNode', m.attrs || {}, kids);
        }

        function renderCmd(c) {
            const kids = [];
            if (c.cBhvr) kids.push(renderCBhvr(c.cBhvr));
            return xml.el('p:cmd', c.attrs || {}, kids);
        }

        function renderCTn(c) {
            const kids = [];
            if (c.stCondLst)   kids.push(renderCondLst(c.stCondLst));
            if (c.endCondLst)  kids.push(renderCondLst(c.endCondLst));
            if (c.prevCondLst) kids.push(renderCondLst(c.prevCondLst));
            if (c.nextCondLst) kids.push(renderCondLst(c.nextCondLst));
            if (c.iterate)     kids.push(renderIterate(c.iterate));
            if (c.childTnLst && c.childTnLst.children && c.childTnLst.children.length) {
                kids.push(xml.el('p:childTnLst', {},
                    c.childTnLst.children.map(renderTimeNode)));
            }
            if (c.subTnLst && c.subTnLst.children && c.subTnLst.children.length) {
                kids.push(xml.el('p:subTnLst', {},
                    c.subTnLst.children.map(renderTimeNode)));
            }
            if (c.endSync) kids.push(xml.el('p:endSync', c.endSync.attrs || {}));
            return xml.el('p:cTn', c.attrs || {}, kids);
        }

        function renderTimeNode(node) {
            const kids = [];
            if (node.cTn)        kids.push(renderCTn(node.cTn));
            if (node.cBhvr)      kids.push(renderCBhvr(node.cBhvr));
            if (node.cMediaNode) kids.push(renderCMediaNode(node.cMediaNode));
            if (node.from)       kids.push(xml.el('p:from', node.from.attrs || {}, renderValChildren(node.from)));
            if (node.to)         kids.push(xml.el('p:to',   node.to.attrs   || {}, renderValChildren(node.to)));
            if (node.by)         kids.push(xml.el('p:by',   node.by.attrs   || {}, renderValChildren(node.by)));
            if (node.tavLst)     kids.push(renderTavLst(node.tavLst));
            if (node.progress)   kids.push(xml.el('p:progress', node.progress.attrs || {}, renderValChildren(node.progress)));
            if (node.wheel)      kids.push(xml.el('p:wheel', node.wheel));
            if (node.videoClr)   kids.push(xml.el('p:videoClr', node.videoClr));
            const attrs = node.attrs || {};
            switch (node.kind) {
                case 'par':        return xml.el('p:par',        attrs, kids);
                case 'seq':        return xml.el('p:seq',        attrs, kids);
                case 'excl':       return xml.el('p:excl',       attrs, kids);
                case 'anim':       return xml.el('p:anim',       attrs, kids);
                case 'animClr':    return xml.el('p:animClr',    attrs, kids);
                case 'animEffect': return xml.el('p:animEffect', attrs, kids);
                case 'animMotion': return xml.el('p:animMotion', attrs, kids);
                case 'animRot':    return xml.el('p:animRot',    attrs, kids);
                case 'animScale':  return xml.el('p:animScale',  attrs, kids);
                case 'audio':      return xml.el('p:audio',      attrs, kids);
                case 'video':      return xml.el('p:video',      attrs, kids);
                case 'cmd':        return xml.el('p:cmd',        attrs, kids);
                case 'set':        return xml.el('p:set',        attrs, kids);
                default:           return xml.el('p:' + node.kind, attrs, kids);
            }
        }

        function renderValChildren(v) {
            const kids = [];
            if (v.strVal)  kids.push(xml.el('p:strVal',  v.strVal));
            if (v.boolVal) kids.push(xml.el('p:boolVal', v.boolVal));
            if (v.intVal)  kids.push(xml.el('p:intVal',  v.intVal));
            if (v.fltVal)  kids.push(xml.el('p:fltVal',  v.fltVal));
            if (v.clrVal)  kids.push(renderClrVal(v.clrVal));
            return kids;
        }

        function renderBld(b) {
            const kids = [];
            if (b.tmplLst && b.tmplLst.length) {
                kids.push(xml.el('p:tmplLst', {},
                    b.tmplLst.map(t => xml.el('p:tmpl', t.attrs || {}))));
            }
            if (b.bldAsOne) kids.push(xml.el('p:bldAsOne', {}));
            if (b.bldSub)   kids.push(xml.el('p:bldSub', b.bldSub.attrs || {}));
            const attrs = b.attrs || {};
            switch (b.kind) {
                case 'bldP':        return xml.el('p:bldP',        attrs, kids);
                case 'bldDgm':      return xml.el('p:bldDgm',      attrs, kids);
                case 'bldGraphic':  return xml.el('p:bldGraphic',  attrs, kids);
                case 'bldOleChart': return xml.el('p:bldOleChart', attrs, kids);
                case 'bldSub':      return xml.el('p:bldSub',      attrs, kids);
                default:            return xml.el('p:' + b.kind, attrs, kids);
            }
        }

        function renderTiming(timing) {
            if (!timing) return null;
            const kids = [];
            if (timing.tnLst) {
                kids.push(xml.el('p:tnLst', {}, timing.tnLst.map(renderTimeNode)));
            }
            if (timing.bldLst) {
                kids.push(xml.el('p:bldLst', {}, timing.bldLst.map(renderBld)));
            }
            return xml.el('p:timing', {}, kids);
        }

        return {
            parseTiming, renderTiming,
            parseTimeNode, renderTimeNode,
            parseCTn, renderCTn,
            parseCBhvr, renderCBhvr,
            parseCond, renderCond,
            parseTgtEl, renderTgtEl,
            parseSpTgt, renderSpTgt,
            parseTxEl, renderTxEl,
            parseIterate, renderIterate,
            parseTavLst, renderTavLst,
            parseAnimVal, renderAnimVal,
            parseClrVal, renderClrVal,
            parseCMediaNode, renderCMediaNode,
            parseCmd, renderCmd,
            parseAttrNameLst, renderAttrNameLst,
            parseBld, renderBld,
            TIME_NODE_TAGS, BLD_TAGS
        };
    }
};
