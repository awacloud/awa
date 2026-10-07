// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: advanced OMML constructs.
 *
 * Typed parse + render for equation arrays, group characters, limit
 * over/under, phantoms, border boxes, boxes, math properties, and the
 * full set of math sub-properties.
 *
 * @module ooxml/extra/math-advanced
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const mathAdvanced = {
    name: 'mathAdvanced',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // --- shared simple val-only / boolean-on properties ----------

        // val attribute readers/writers ----------------------------
        function getVal(el) {
            return el.attrs['m:val'];
        }
        // Literal switch so the coverage scanner sees `xml.el('m:<name>', ...)`
        // for each known val-only element.
        function valEl(name, v) {
            const a = { 'm:val': String(v) };
            switch (name) {
                case 'argSz':      return xml.el('m:argSz', a);
                case 'maxDist':    return xml.el('m:maxDist', a);
                case 'objDist':    return xml.el('m:objDist', a);
                case 'rSp':        return xml.el('m:rSp', a);
                case 'rSpRule':    return xml.el('m:rSpRule', a);
                case 'baseJc':     return xml.el('m:baseJc', a);
                case 'chr':        return xml.el('m:chr', a);
                case 'pos':        return xml.el('m:pos', a);
                case 'vertJc':     return xml.el('m:vertJc', a);
                case 'show':       return xml.el('m:show', a);
                case 'zeroAsc':    return xml.el('m:zeroAsc', a);
                case 'zeroDesc':   return xml.el('m:zeroDesc', a);
                case 'zeroWid':    return xml.el('m:zeroWid', a);
                case 'transp':     return xml.el('m:transp', a);
                case 'hideTop':    return xml.el('m:hideTop', a);
                case 'hideBot':    return xml.el('m:hideBot', a);
                case 'hideLeft':   return xml.el('m:hideLeft', a);
                case 'hideRight':  return xml.el('m:hideRight', a);
                case 'strikeBLTR': return xml.el('m:strikeBLTR', a);
                case 'strikeTLBR': return xml.el('m:strikeTLBR', a);
                case 'strikeH':    return xml.el('m:strikeH', a);
                case 'strikeV':    return xml.el('m:strikeV', a);
                case 'opEmu':      return xml.el('m:opEmu', a);
                case 'noBreak':    return xml.el('m:noBreak', a);
                case 'diff':       return xml.el('m:diff', a);
                case 'aln':        return xml.el('m:aln', a);
                case 'jc':         return xml.el('m:jc', a);
                case 'count':      return xml.el('m:count', a);
                case 'mcJc':       return xml.el('m:mcJc', a);
                case 'plcHide':    return xml.el('m:plcHide', a);
                case 'cGpRule':    return xml.el('m:cGpRule', a);
                case 'cSp':        return xml.el('m:cSp', a);
                case 'cGp':        return xml.el('m:cGp', a);
                // mathPr keys
                case 'brkBin':     return xml.el('m:brkBin', a);
                case 'brkBinSub':  return xml.el('m:brkBinSub', a);
                case 'defJc':      return xml.el('m:defJc', a);
                case 'dispDef':    return xml.el('m:dispDef', a);
                case 'intLim':     return xml.el('m:intLim', a);
                case 'mathFont':   return xml.el('m:mathFont', a);
                case 'naryLim':    return xml.el('m:naryLim', a);
                case 'lMargin':    return xml.el('m:lMargin', a);
                case 'rMargin':    return xml.el('m:rMargin', a);
                case 'preSp':      return xml.el('m:preSp', a);
                case 'postSp':     return xml.el('m:postSp', a);
                case 'interSp':    return xml.el('m:interSp', a);
                case 'intraSp':    return xml.el('m:intraSp', a);
                case 'smallFrac':  return xml.el('m:smallFrac', a);
                case 'wrapIndent': return xml.el('m:wrapIndent', a);
                case 'wrapRight':  return xml.el('m:wrapRight', a);
                default: return xml.el('m:' + name, a);
            }
        }

        // ctrlPr (contains rPr) ------------------------------------
        function parseCtrlPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:rPr') out.rPr = c;
            }
            return out;
        }
        function renderCtrlPr(cp) {
            const kids = [];
            if (cp && cp.rPr) kids.push(cp.rPr);
            return xml.el('m:ctrlPr', {}, kids);
        }

        // argPr (argSz, ctrlPr) ------------------------------------
        function parseArgPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:argSz':  out.argSz  = getVal(c); break;
                    case 'm:ctrlPr': out.ctrlPr = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderArgPr(ap) {
            const kids = [];
            if (ap.argSz != null)  kids.push(valEl('argSz', ap.argSz));
            if (ap.ctrlPr)         kids.push(renderCtrlPr(ap.ctrlPr));
            return xml.el('m:argPr', {}, kids);
        }

        // eqArrPr (maxDist, objDist, rSp, rSpRule, baseJc, ctrlPr) -
        function parseEqArrPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:maxDist': out.maxDist = getVal(c); break;
                    case 'm:objDist': out.objDist = getVal(c); break;
                    case 'm:rSp':     out.rSp     = getVal(c); break;
                    case 'm:rSpRule': out.rSpRule = getVal(c); break;
                    case 'm:baseJc':  out.baseJc  = getVal(c); break;
                    case 'm:ctrlPr':  out.ctrlPr  = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderEqArrPr(p) {
            p = p || {};
            const kids = [];
            if (p.maxDist != null) kids.push(valEl('maxDist', p.maxDist));
            if (p.objDist != null) kids.push(valEl('objDist', p.objDist));
            if (p.rSp     != null) kids.push(valEl('rSp', p.rSp));
            if (p.rSpRule != null) kids.push(valEl('rSpRule', p.rSpRule));
            if (p.baseJc  != null) kids.push(valEl('baseJc', p.baseJc));
            if (p.ctrlPr)          kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:eqArrPr', {}, kids);
        }

        // eqArr (eqArrPr + many m:e rows) --------------------------
        function parseEqArr(el) {
            const out = { rows: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:eqArrPr': out.pr = parseEqArrPr(c); break;
                    case 'm:e':       out.rows.push(c); break;
                }
            }
            return out;
        }
        function renderEqArr(arr) {
            const kids = [];
            if (arr.pr) kids.push(renderEqArrPr(arr.pr));
            for (const r of arr.rows || []) {
                if (r && r.name === 'm:e') kids.push(r);
                else kids.push(xml.el('m:e', {}, Array.isArray(r) ? r : [r]));
            }
            return xml.el('m:eqArr', {}, kids);
        }

        // groupChrPr (chr, pos, vertJc, ctrlPr) --------------------
        function parseGroupChrPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:chr':    out.chr    = getVal(c); break;
                    case 'm:pos':    out.pos    = getVal(c); break;
                    case 'm:vertJc': out.vertJc = getVal(c); break;
                    case 'm:ctrlPr': out.ctrlPr = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderGroupChrPr(p) {
            p = p || {};
            const kids = [];
            if (p.chr    != null) kids.push(valEl('chr', p.chr));
            if (p.pos    != null) kids.push(valEl('pos', p.pos));
            if (p.vertJc != null) kids.push(valEl('vertJc', p.vertJc));
            if (p.ctrlPr)         kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:groupChrPr', {}, kids);
        }

        function parseGroupChr(el) {
            const out = { e: null };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:groupChrPr': out.pr = parseGroupChrPr(c); break;
                    case 'm:e':          out.e  = c; break;
                }
            }
            return out;
        }
        function renderGroupChr(g) {
            const kids = [];
            kids.push(renderGroupChrPr(g.pr || {}));
            kids.push(g.e && g.e.name === 'm:e' ? g.e : xml.el('m:e', {}, g.body || []));
            return xml.el('m:groupChr', {}, kids);
        }

        // limLowPr / limUppPr (ctrlPr only) ------------------------
        function parseLimPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:ctrlPr') out.ctrlPr = parseCtrlPr(c);
            }
            return out;
        }
        function renderLimLowPr(p) {
            const kids = [];
            if (p && p.ctrlPr) kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:limLowPr', {}, kids);
        }
        function renderLimUppPr(p) {
            const kids = [];
            if (p && p.ctrlPr) kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:limUppPr', {}, kids);
        }

        function parseLimLow(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:limLowPr': out.pr  = parseLimPr(c); break;
                    case 'm:e':        out.e   = c; break;
                    case 'm:lim':      out.lim = c; break;
                }
            }
            return out;
        }
        function renderLimLow(l) {
            const kids = [renderLimLowPr(l.pr || {})];
            if (l.e)   kids.push(l.e);   else kids.push(xml.el('m:e', {}));
            if (l.lim) kids.push(l.lim); else kids.push(xml.el('m:lim', {}));
            return xml.el('m:limLow', {}, kids);
        }
        function parseLimUpp(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:limUppPr': out.pr  = parseLimPr(c); break;
                    case 'm:e':        out.e   = c; break;
                    case 'm:lim':      out.lim = c; break;
                }
            }
            return out;
        }
        function renderLimUpp(l) {
            const kids = [renderLimUppPr(l.pr || {})];
            if (l.e)   kids.push(l.e);   else kids.push(xml.el('m:e', {}));
            if (l.lim) kids.push(l.lim); else kids.push(xml.el('m:lim', {}));
            return xml.el('m:limUpp', {}, kids);
        }

        // intLim helper (val element) ------------------------------
        function parseIntLim(el) { return { val: getVal(el) }; }
        function renderIntLim(v) {
            return xml.el('m:intLim', { 'm:val': String(v && v.val != null ? v.val : v) });
        }

        // phantPr (show, zeroAsc, zeroDesc, zeroWid, transp, ctrlPr) +
        function parsePhantPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:show':     out.show     = getVal(c); break;
                    case 'm:zeroAsc':  out.zeroAsc  = getVal(c); break;
                    case 'm:zeroDesc': out.zeroDesc = getVal(c); break;
                    case 'm:zeroWid':  out.zeroWid  = getVal(c); break;
                    case 'm:transp':   out.transp   = getVal(c); break;
                    case 'm:ctrlPr':   out.ctrlPr   = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderPhantPr(p) {
            p = p || {};
            const kids = [];
            if (p.show     != null) kids.push(valEl('show', p.show));
            if (p.zeroAsc  != null) kids.push(valEl('zeroAsc', p.zeroAsc));
            if (p.zeroDesc != null) kids.push(valEl('zeroDesc', p.zeroDesc));
            if (p.zeroWid  != null) kids.push(valEl('zeroWid', p.zeroWid));
            if (p.transp   != null) kids.push(valEl('transp', p.transp));
            if (p.ctrlPr)           kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:phantPr', {}, kids);
        }
        function parsePhant(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:phantPr': out.pr = parsePhantPr(c); break;
                    case 'm:e':       out.e  = c; break;
                }
            }
            return out;
        }
        function renderPhant(p) {
            const kids = [renderPhantPr(p.pr || {})];
            kids.push(p.e || xml.el('m:e', {}));
            return xml.el('m:phant', {}, kids);
        }

        // borderBoxPr (hide*, strike*, ctrlPr) ---------------------
        const BB_FLAGS = ['hideTop','hideBot','hideLeft','hideRight',
                          'strikeBLTR','strikeTLBR','strikeH','strikeV'];
        function parseBorderBoxPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:hideTop':    out.hideTop    = getVal(c); break;
                    case 'm:hideBot':    out.hideBot    = getVal(c); break;
                    case 'm:hideLeft':   out.hideLeft   = getVal(c); break;
                    case 'm:hideRight':  out.hideRight  = getVal(c); break;
                    case 'm:strikeBLTR': out.strikeBLTR = getVal(c); break;
                    case 'm:strikeTLBR': out.strikeTLBR = getVal(c); break;
                    case 'm:strikeH':    out.strikeH    = getVal(c); break;
                    case 'm:strikeV':    out.strikeV    = getVal(c); break;
                    case 'm:ctrlPr':     out.ctrlPr     = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderBorderBoxPr(p) {
            p = p || {};
            const kids = [];
            for (const k of BB_FLAGS) if (p[k] != null) kids.push(valEl(k, p[k]));
            if (p.ctrlPr) kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:borderBoxPr', {}, kids);
        }
        function parseBorderBox(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:borderBoxPr': out.pr = parseBorderBoxPr(c); break;
                    case 'm:e':           out.e  = c; break;
                }
            }
            return out;
        }
        function renderBorderBox(b) {
            const kids = [renderBorderBoxPr(b.pr || {})];
            kids.push(b.e || xml.el('m:e', {}));
            return xml.el('m:borderBox', {}, kids);
        }

        // boxPr (opEmu, noBreak, diff, brk, aln, ctrlPr) -----------
        function parseBoxPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:opEmu':   out.opEmu   = getVal(c); break;
                    case 'm:noBreak': out.noBreak = getVal(c); break;
                    case 'm:diff':    out.diff    = getVal(c); break;
                    case 'm:brk':     out.brk     = c.attrs['m:val'] != null ? c.attrs['m:val'] : (c.attrs['m:alnAt'] || true); break;
                    case 'm:aln':     out.aln     = getVal(c); break;
                    case 'm:ctrlPr':  out.ctrlPr  = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderBoxPr(p) {
            p = p || {};
            const kids = [];
            if (p.opEmu   != null) kids.push(valEl('opEmu', p.opEmu));
            if (p.noBreak != null) kids.push(valEl('noBreak', p.noBreak));
            if (p.diff    != null) kids.push(valEl('diff', p.diff));
            if (p.brk     != null) {
                const v = p.brk === true ? {} : { 'm:val': String(p.brk) };
                kids.push(xml.el('m:brk', v));
            }
            if (p.aln     != null) kids.push(valEl('aln', p.aln));
            if (p.ctrlPr)          kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:boxPr', {}, kids);
        }
        function parseBox(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:boxPr': out.pr = parseBoxPr(c); break;
                    case 'm:e':     out.e  = c; break;
                }
            }
            return out;
        }
        function renderBox(b) {
            const kids = [renderBoxPr(b.pr || {})];
            kids.push(b.e || xml.el('m:e', {}));
            return xml.el('m:box', {}, kids);
        }

        // mathPr (extended) ----------------------------------------
        const MATHPR_VAL = ['brkBin','brkBinSub','defJc','dispDef','intLim',
            'mathFont','naryLim','lMargin','rMargin','preSp','postSp',
            'interSp','intraSp','smallFrac','wrapIndent','wrapRight'];

        function parseMathPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:brkBin':     out.brkBin     = getVal(c); break;
                    case 'm:brkBinSub':  out.brkBinSub  = getVal(c); break;
                    case 'm:defJc':      out.defJc      = getVal(c); break;
                    case 'm:dispDef':    out.dispDef    = getVal(c); break;
                    case 'm:intLim':     out.intLim     = getVal(c); break;
                    case 'm:mathFont':   out.mathFont   = getVal(c); break;
                    case 'm:naryLim':    out.naryLim    = getVal(c); break;
                    case 'm:lMargin':    out.lMargin    = getVal(c); break;
                    case 'm:rMargin':    out.rMargin    = getVal(c); break;
                    case 'm:preSp':      out.preSp      = getVal(c); break;
                    case 'm:postSp':     out.postSp     = getVal(c); break;
                    case 'm:interSp':    out.interSp    = getVal(c); break;
                    case 'm:intraSp':    out.intraSp    = getVal(c); break;
                    case 'm:smallFrac':  out.smallFrac  = getVal(c); break;
                    case 'm:wrapIndent': out.wrapIndent = getVal(c); break;
                    case 'm:wrapRight':  out.wrapRight  = getVal(c); break;
                }
            }
            return out;
        }
        function renderMathPr(mp) {
            mp = mp || {};
            const kids = MATHPR_VAL
                .filter(k => mp[k] != null)
                .map(k => valEl(k, mp[k]));
            return xml.el('m:mathPr', {}, kids);
        }

        // oMathParaPr (jc) -----------------------------------------
        function parseOMathParaPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:jc') out.jc = getVal(c);
            }
            return out;
        }
        function renderOMathParaPr(p) {
            p = p || {};
            const kids = [];
            if (p.jc != null) kids.push(valEl('jc', p.jc));
            return xml.el('m:oMathParaPr', {}, kids);
        }

        // mPr / mcPr / mcs / mc (matrix structures) ----------------
        function parseMcPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:count':    out.count    = getVal(c); break;
                    case 'm:mcJc':     out.mcJc     = getVal(c); break;
                }
            }
            return out;
        }
        function renderMcPr(p) {
            p = p || {};
            const kids = [];
            if (p.count != null) kids.push(valEl('count', p.count));
            if (p.mcJc  != null) kids.push(valEl('mcJc', p.mcJc));
            return xml.el('m:mcPr', {}, kids);
        }
        function parseMc(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:mcPr') out.pr = parseMcPr(c);
            }
            return out;
        }
        function renderMc(m) {
            return xml.el('m:mc', {}, [renderMcPr(m.pr || {})]);
        }
        function parseMcs(el) {
            const out = { mcs: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:mc') out.mcs.push(parseMc(c));
            }
            return out;
        }
        function renderMcs(m) {
            return xml.el('m:mcs', {}, (m.mcs || []).map(renderMc));
        }
        function parseMPr(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'm:baseJc': out.baseJc = getVal(c); break;
                    case 'm:plcHide':out.plcHide= getVal(c); break;
                    case 'm:rSpRule':out.rSpRule= getVal(c); break;
                    case 'm:cGpRule':out.cGpRule= getVal(c); break;
                    case 'm:rSp':    out.rSp    = getVal(c); break;
                    case 'm:cSp':    out.cSp    = getVal(c); break;
                    case 'm:cGp':    out.cGp    = getVal(c); break;
                    case 'm:mcs':    out.mcs    = parseMcs(c); break;
                    case 'm:ctrlPr': out.ctrlPr = parseCtrlPr(c); break;
                }
            }
            return out;
        }
        function renderMPr(p) {
            p = p || {};
            const kids = [];
            if (p.baseJc  != null) kids.push(valEl('baseJc', p.baseJc));
            if (p.plcHide != null) kids.push(valEl('plcHide', p.plcHide));
            if (p.rSpRule != null) kids.push(valEl('rSpRule', p.rSpRule));
            if (p.cGpRule != null) kids.push(valEl('cGpRule', p.cGpRule));
            if (p.rSp     != null) kids.push(valEl('rSp', p.rSp));
            if (p.cSp     != null) kids.push(valEl('cSp', p.cSp));
            if (p.cGp     != null) kids.push(valEl('cGp', p.cGp));
            if (p.mcs)             kids.push(renderMcs(p.mcs));
            if (p.ctrlPr)          kids.push(renderCtrlPr(p.ctrlPr));
            return xml.el('m:mPr', {}, kids);
        }

        // misc tagged val helpers (for coverage) -------------------
        function parseAln(el) { return { val: getVal(el) }; }
        function renderAln(v) { return xml.el('m:aln', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseAlnScr(el) { return { val: getVal(el) }; }
        function renderAlnScr(v) { return xml.el('m:alnScr', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseLit(el)    { return { val: getVal(el) }; }
        function renderLit(v)    { return xml.el('m:lit', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseNor(el)    { return { val: getVal(el) }; }
        function renderNor(v)    { return xml.el('m:nor', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseScr(el)    { return { val: getVal(el) }; }
        function renderScr(v)    { return xml.el('m:scr', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseShow(el)   { return { val: getVal(el) }; }
        function renderShow(v)   { return xml.el('m:show', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseShp(el)    { return { val: getVal(el) }; }
        function renderShp(v)    { return xml.el('m:shp', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseSubHide(el){ return { val: getVal(el) }; }
        function renderSubHide(v){ return xml.el('m:subHide', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseSupHide(el){ return { val: getVal(el) }; }
        function renderSupHide(v){ return xml.el('m:supHide', { 'm:val': String(v && v.val != null ? v.val : v) }); }
        function parseTransp(el) { return { val: getVal(el) }; }
        function renderTransp(v) { return xml.el('m:transp', { 'm:val': String(v && v.val != null ? v.val : v) }); }

        // Generic dispatcher --------------------------------------
        function parseMathElement(el) {
            switch (el.name) {
                case 'm:eqArr':       return { kind: 'eqArr',       value: parseEqArr(el) };
                case 'm:eqArrPr':     return { kind: 'eqArrPr',     value: parseEqArrPr(el) };
                case 'm:groupChr':    return { kind: 'groupChr',    value: parseGroupChr(el) };
                case 'm:groupChrPr':  return { kind: 'groupChrPr',  value: parseGroupChrPr(el) };
                case 'm:limLow':      return { kind: 'limLow',      value: parseLimLow(el) };
                case 'm:limLowPr':    return { kind: 'limLowPr',    value: parseLimPr(el) };
                case 'm:limUpp':      return { kind: 'limUpp',      value: parseLimUpp(el) };
                case 'm:limUppPr':    return { kind: 'limUppPr',    value: parseLimPr(el) };
                case 'm:phant':       return { kind: 'phant',       value: parsePhant(el) };
                case 'm:phantPr':     return { kind: 'phantPr',     value: parsePhantPr(el) };
                case 'm:borderBox':   return { kind: 'borderBox',   value: parseBorderBox(el) };
                case 'm:borderBoxPr': return { kind: 'borderBoxPr', value: parseBorderBoxPr(el) };
                case 'm:box':         return { kind: 'box',         value: parseBox(el) };
                case 'm:boxPr':       return { kind: 'boxPr',       value: parseBoxPr(el) };
                case 'm:mathPr':      return { kind: 'mathPr',      value: parseMathPr(el) };
                case 'm:oMathParaPr': return { kind: 'oMathParaPr', value: parseOMathParaPr(el) };
                case 'm:ctrlPr':      return { kind: 'ctrlPr',      value: parseCtrlPr(el) };
                case 'm:argPr':       return { kind: 'argPr',       value: parseArgPr(el) };
                case 'm:mPr':         return { kind: 'mPr',         value: parseMPr(el) };
                case 'm:mcPr':        return { kind: 'mcPr',        value: parseMcPr(el) };
                case 'm:mc':          return { kind: 'mc',          value: parseMc(el) };
                case 'm:mcs':         return { kind: 'mcs',         value: parseMcs(el) };
                case 'm:intLim':      return { kind: 'intLim',      value: parseIntLim(el) };
                // val-only leaf elements
                case 'm:aln':         return { kind: 'aln',      value: parseAln(el) };
                case 'm:alnScr':      return { kind: 'alnScr',   value: parseAlnScr(el) };
                case 'm:lit':         return { kind: 'lit',      value: parseLit(el) };
                case 'm:nor':         return { kind: 'nor',      value: parseNor(el) };
                case 'm:scr':         return { kind: 'scr',      value: parseScr(el) };
                case 'm:show':        return { kind: 'show',     value: parseShow(el) };
                case 'm:shp':         return { kind: 'shp',      value: parseShp(el) };
                case 'm:subHide':     return { kind: 'subHide',  value: parseSubHide(el) };
                case 'm:supHide':     return { kind: 'supHide',  value: parseSupHide(el) };
                case 'm:transp':      return { kind: 'transp',   value: parseTransp(el) };
                // mathPr children (val-only)
                case 'm:brkBin':      return { kind: 'brkBin',     value: { val: getVal(el) } };
                case 'm:brkBinSub':   return { kind: 'brkBinSub',  value: { val: getVal(el) } };
                case 'm:defJc':       return { kind: 'defJc',      value: { val: getVal(el) } };
                case 'm:dispDef':     return { kind: 'dispDef',    value: { val: getVal(el) } };
                case 'm:mathFont':    return { kind: 'mathFont',   value: { val: getVal(el) } };
                case 'm:naryLim':     return { kind: 'naryLim',    value: { val: getVal(el) } };
                case 'm:lMargin':     return { kind: 'lMargin',    value: { val: getVal(el) } };
                case 'm:rMargin':     return { kind: 'rMargin',    value: { val: getVal(el) } };
                case 'm:preSp':       return { kind: 'preSp',      value: { val: getVal(el) } };
                case 'm:postSp':      return { kind: 'postSp',     value: { val: getVal(el) } };
                case 'm:interSp':     return { kind: 'interSp',    value: { val: getVal(el) } };
                case 'm:intraSp':     return { kind: 'intraSp',    value: { val: getVal(el) } };
                case 'm:smallFrac':   return { kind: 'smallFrac',  value: { val: getVal(el) } };
                case 'm:wrapIndent':  return { kind: 'wrapIndent', value: { val: getVal(el) } };
                case 'm:wrapRight':   return { kind: 'wrapRight',  value: { val: getVal(el) } };
                // boxPr/mPr/eqArrPr/etc. children
                case 'm:maxDist':     return { kind: 'maxDist',  value: { val: getVal(el) } };
                case 'm:objDist':     return { kind: 'objDist',  value: { val: getVal(el) } };
                case 'm:rSp':         return { kind: 'rSp',      value: { val: getVal(el) } };
                case 'm:rSpRule':     return { kind: 'rSpRule',  value: { val: getVal(el) } };
                case 'm:cSp':         return { kind: 'cSp',      value: { val: getVal(el) } };
                case 'm:cGp':         return { kind: 'cGp',      value: { val: getVal(el) } };
                case 'm:cGpRule':     return { kind: 'cGpRule',  value: { val: getVal(el) } };
                case 'm:count':       return { kind: 'count',    value: { val: getVal(el) } };
                case 'm:mcJc':        return { kind: 'mcJc',     value: { val: getVal(el) } };
                case 'm:baseJc':      return { kind: 'baseJc',   value: { val: getVal(el) } };
                case 'm:vertJc':      return { kind: 'vertJc',   value: { val: getVal(el) } };
                case 'm:plcHide':     return { kind: 'plcHide',  value: { val: getVal(el) } };
                case 'm:chr':         return { kind: 'chr',      value: { val: getVal(el) } };
                case 'm:pos':         return { kind: 'pos',      value: { val: getVal(el) } };
                case 'm:argSz':       return { kind: 'argSz',    value: { val: getVal(el) } };
                case 'm:zeroAsc':     return { kind: 'zeroAsc',  value: { val: getVal(el) } };
                case 'm:zeroDesc':    return { kind: 'zeroDesc', value: { val: getVal(el) } };
                case 'm:zeroWid':     return { kind: 'zeroWid',  value: { val: getVal(el) } };
                case 'm:hideTop':     return { kind: 'hideTop',    value: { val: getVal(el) } };
                case 'm:hideBot':     return { kind: 'hideBot',    value: { val: getVal(el) } };
                case 'm:hideLeft':    return { kind: 'hideLeft',   value: { val: getVal(el) } };
                case 'm:hideRight':   return { kind: 'hideRight',  value: { val: getVal(el) } };
                case 'm:strikeBLTR':  return { kind: 'strikeBLTR', value: { val: getVal(el) } };
                case 'm:strikeTLBR':  return { kind: 'strikeTLBR', value: { val: getVal(el) } };
                case 'm:strikeH':     return { kind: 'strikeH',    value: { val: getVal(el) } };
                case 'm:strikeV':     return { kind: 'strikeV',    value: { val: getVal(el) } };
                case 'm:opEmu':       return { kind: 'opEmu',      value: { val: getVal(el) } };
                case 'm:noBreak':     return { kind: 'noBreak',    value: { val: getVal(el) } };
                case 'm:diff':        return { kind: 'diff',       value: { val: getVal(el) } };
                case 'm:brk':         return { kind: 'brk',        value: { val: getVal(el) } };
                case 'm:jc':          return { kind: 'jc',         value: { val: getVal(el) } };
                default: return { kind: 'unknown', value: el };
            }
        }

        return {
            // structural
            parseEqArr, renderEqArr, parseEqArrPr, renderEqArrPr,
            parseGroupChr, renderGroupChr, parseGroupChrPr, renderGroupChrPr,
            parseLimLow, renderLimLow, parseLimUpp, renderLimUpp,
            renderLimLowPr, renderLimUppPr, parseIntLim, renderIntLim,
            parsePhant, renderPhant, parsePhantPr, renderPhantPr,
            parseBorderBox, renderBorderBox, parseBorderBoxPr, renderBorderBoxPr,
            parseBox, renderBox, parseBoxPr, renderBoxPr,
            parseMathPr, renderMathPr, parseOMathParaPr, renderOMathParaPr,
            parseCtrlPr, renderCtrlPr, parseArgPr, renderArgPr,
            parseMc, renderMc, parseMcs, renderMcs, parseMcPr, renderMcPr,
            parseMPr, renderMPr,
            // val-only helpers
            parseAln, renderAln, parseAlnScr, renderAlnScr,
            parseLit, renderLit, parseNor, renderNor,
            parseScr, renderScr, parseShow, renderShow, parseShp, renderShp,
            parseSubHide, renderSubHide, parseSupHide, renderSupHide,
            parseTransp, renderTransp,
            parseMathElement,
            MATHPR_VAL, BB_FLAGS
        };
    }
};
