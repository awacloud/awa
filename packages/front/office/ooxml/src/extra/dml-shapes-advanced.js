// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: custom geometry + connectors + 3D.
 *
 * Typed parse + render for custGeom (avLst, gdLst, ahLst, cxnLst, rect,
 * pathLst with full path command set + adjust handles + connection
 * sites), connector shapes (cxnSp, cNvCxnSpPr) and the 3D scene
 * (scene3d, sp3d, bevelT, bevelB, lightRig, flatTx, extrusionClr,
 * contourClr).
 *
 * @module ooxml/extra/dml-shapes-advanced
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlShapesAdvanced = {
    name: 'dmlShapesAdvanced',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const PATH_OPS = ['moveTo', 'lnTo', 'arcTo', 'cubicBezTo', 'quadBezTo', 'close'];

        // ---- Path commands --------------------------------------
        function parsePathCommand(el) {
            const local = el.name.replace(/^a:/, '');
            switch (el.name) {
                case 'a:moveTo':
                case 'a:lnTo':
                case 'a:cubicBezTo':
                case 'a:quadBezTo': {
                    const points = (el.children || [])
                        .filter(c => c.type === 'element' && c.name === 'a:pt')
                        .map(pt => ({ x: pt.attrs.x, y: pt.attrs.y }));
                    return { op: local, points };
                }
                case 'a:arcTo':
                    return { op: 'arcTo', attrs: { ...el.attrs } };
                case 'a:close':
                    return { op: 'close' };
                default: return null;
            }
        }
        function renderPathCommand(cmd) {
            const pts = (cmd.points || []).map(pt =>
                xml.el('a:pt', { x: String(pt.x), y: String(pt.y) }));
            switch (cmd.op) {
                case 'moveTo':     return xml.el('a:moveTo', {}, pts);
                case 'lnTo':       return xml.el('a:lnTo', {}, pts);
                case 'cubicBezTo': return xml.el('a:cubicBezTo', {}, pts);
                case 'quadBezTo':  return xml.el('a:quadBezTo', {}, pts);
                case 'arcTo':      return xml.el('a:arcTo', cmd.attrs || {});
                case 'close':      return xml.el('a:close', {});
                default: return null;
            }
        }

        // ---- Path -----------------------------------------------
        function parsePath(el) {
            const out = { attrs: { ...el.attrs }, commands: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                const cmd = parsePathCommand(c);
                if (cmd) out.commands.push(cmd);
            }
            return out;
        }
        function renderPath(p) {
            return xml.el('a:path', p.attrs || {}, (p.commands || []).map(renderPathCommand).filter(Boolean));
        }

        // ---- gd (formula guide) ---------------------------------
        function parseGd(el) {
            return { name: el.attrs.name, fmla: el.attrs.fmla };
        }
        function renderGd(g) {
            return xml.el('a:gd', { name: String(g.name), fmla: String(g.fmla) });
        }

        // ---- ah (adjust handles) --------------------------------
        function parseAhPolar(el) {
            const out = { attrs: { ...el.attrs } };
            const pos = (el.children || []).find(c => c.type === 'element' && c.name === 'a:pos');
            if (pos) out.pos = { ...pos.attrs };
            return out;
        }
        function renderAhPolar(a) {
            const kids = [];
            if (a.pos) kids.push(xml.el('a:pos', { ...a.pos }));
            return xml.el('a:ahPolar', a.attrs || {}, kids);
        }
        function parseAhXY(el) {
            const out = { attrs: { ...el.attrs } };
            const pos = (el.children || []).find(c => c.type === 'element' && c.name === 'a:pos');
            if (pos) out.pos = { ...pos.attrs };
            return out;
        }
        function renderAhXY(a) {
            const kids = [];
            if (a.pos) kids.push(xml.el('a:pos', { ...a.pos }));
            return xml.el('a:ahXY', a.attrs || {}, kids);
        }

        // ---- cxn (connection site) ------------------------------
        function parseCxn(el) {
            const out = { attrs: { ...el.attrs } };
            const pos = (el.children || []).find(c => c.type === 'element' && c.name === 'a:pos');
            if (pos) out.pos = { ...pos.attrs };
            return out;
        }
        function renderCxn(c) {
            const kids = [];
            if (c.pos) kids.push(xml.el('a:pos', { ...c.pos }));
            return xml.el('a:cxn', c.attrs || {}, kids);
        }

        // ---- pt (path point — used as bare element too) ---------
        function parsePt(el) { return { x: el.attrs.x, y: el.attrs.y }; }
        function renderPt(p) { return xml.el('a:pt', { x: String(p.x), y: String(p.y) }); }

        // ---- Containers -----------------------------------------
        function parseAvLst(el) {
            const out = { gds: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'a:gd') out.gds.push(parseGd(c));
            }
            return out;
        }
        function renderAvLst(a) {
            return xml.el('a:avLst', {}, (a && a.gds || []).map(renderGd));
        }
        function parseGdLst(el) {
            const out = { gds: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'a:gd') out.gds.push(parseGd(c));
            }
            return out;
        }
        function renderGdLst(g) {
            return xml.el('a:gdLst', {}, (g && g.gds || []).map(renderGd));
        }
        function parseAhLst(el) {
            const out = { ahs: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:ahPolar': out.ahs.push({ kind: 'ahPolar', ...parseAhPolar(c) }); break;
                    case 'a:ahXY':    out.ahs.push({ kind: 'ahXY',    ...parseAhXY(c) });    break;
                }
            }
            return out;
        }
        function renderAhLst(a) {
            const kids = (a && a.ahs || []).map(h =>
                h.kind === 'ahPolar' ? renderAhPolar(h) : renderAhXY(h));
            return xml.el('a:ahLst', {}, kids);
        }
        function parseCxnLst(el) {
            const out = { cxns: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'a:cxn') out.cxns.push(parseCxn(c));
            }
            return out;
        }
        function renderCxnLst(c) {
            return xml.el('a:cxnLst', {}, (c && c.cxns || []).map(renderCxn));
        }
        function parseRect(el) { return { ...el.attrs }; }
        function renderRect(r) {
            const a = r || {};
            return xml.el('a:rect', {
                l: String(a.l || 0), t: String(a.t || 0),
                r: String(a.r || 0), b: String(a.b || 0)
            });
        }
        function parsePathLst(el) {
            const out = { paths: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'a:path') out.paths.push(parsePath(c));
            }
            return out;
        }
        function renderPathLst(p) {
            return xml.el('a:pathLst', {}, (p && p.paths || []).map(renderPath));
        }

        // ---- custGeom -------------------------------------------
        function parseCustGeom(el) {
            const out = { paths: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:avLst':   out.avLst   = parseAvLst(c); break;
                    case 'a:gdLst':   out.gdLst   = parseGdLst(c); break;
                    case 'a:ahLst':   out.ahLst   = parseAhLst(c); break;
                    case 'a:cxnLst':  out.cxnLst  = parseCxnLst(c); break;
                    case 'a:rect':    out.rect    = parseRect(c); break;
                    case 'a:pathLst': {
                        const pl = parsePathLst(c);
                        out.paths   = pl.paths;   // back-compat
                        out.pathLst = pl;
                        break;
                    }
                }
            }
            return out;
        }
        function renderCustGeom(c) {
            return xml.el('a:custGeom', {}, [
                renderAvLst(c.avLst),
                renderGdLst(c.gdLst),
                renderAhLst(c.ahLst),
                renderCxnLst(c.cxnLst),
                renderRect(c.rect),
                renderPathLst(c.pathLst || { paths: c.paths || [] })
            ]);
        }

        // ---- Connector shape (cxnSp / cNvCxnSpPr) ---------------
        function parseCxnSp(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:cNvCxnSpPr' || c.name === 'p:cNvCxnSpPr' || c.name === 'xdr:cNvCxnSpPr') {
                    out.cNvCxnSpPr = { name: c.name, attrs: { ...c.attrs } };
                }
            }
            return out;
        }
        function renderCxnSp(c) {
            const kids = [];
            if (c.cNvCxnSpPr) {
                kids.push(xml.el('a:cNvCxnSpPr', c.cNvCxnSpPr.attrs || {}));
            }
            return xml.el('a:cxnSp', c.attrs || {}, kids);
        }

        // ---- 3D scene -------------------------------------------
        function parseLightRig(el) {
            const out = { attrs: { ...el.attrs } };
            const r = (el.children || []).find(c => c.type === 'element' && c.name === 'a:rot');
            if (r) out.rot = { ...r.attrs };
            return out;
        }
        function renderLightRig(l) {
            const kids = [];
            if (l && l.rot) kids.push(xml.el('a:rot', { ...l.rot }));
            return xml.el('a:lightRig', (l && l.attrs) || {}, kids);
        }
        function parseScene3d(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:camera':   out.camera   = { attrs: { ...c.attrs } }; break;
                    case 'a:lightRig': out.lightRig = parseLightRig(c); break;
                    case 'a:flatTx':   out.flatTx   = { ...c.attrs }; break;
                }
            }
            return out;
        }
        function renderScene3d(s) {
            s = s || {};
            const kids = [];
            if (s.camera)   kids.push(xml.el('a:camera', s.camera.attrs || {}));
            if (s.lightRig) kids.push(renderLightRig(s.lightRig));
            if (s.flatTx)   kids.push(xml.el('a:flatTx', { ...s.flatTx }));
            return xml.el('a:scene3d', {}, kids);
        }

        function parseBevel(el) { return { attrs: { ...el.attrs } }; }

        function parseSp3d(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:bevelT':       out.bevelT       = parseBevel(c); break;
                    case 'a:bevelB':       out.bevelB       = parseBevel(c); break;
                    case 'a:extrusionClr': out.extrusionClr = { children: c.children || [] }; break;
                    case 'a:contourClr':   out.contourClr   = { children: c.children || [] }; break;
                }
            }
            return out;
        }
        function renderSp3d(s) {
            s = s || {};
            const kids = [];
            if (s.bevelT)       kids.push(xml.el('a:bevelT', s.bevelT.attrs || {}));
            if (s.bevelB)       kids.push(xml.el('a:bevelB', s.bevelB.attrs || {}));
            if (s.extrusionClr) kids.push(xml.el('a:extrusionClr', {}, s.extrusionClr.children || []));
            if (s.contourClr)   kids.push(xml.el('a:contourClr',   {}, s.contourClr.children || []));
            return xml.el('a:sp3d', s.attrs || {}, kids);
        }

        // Top-level dispatcher (for parse-context coverage detection).
        function parseAny(el) {
            switch (el.name) {
                case 'a:custGeom': return parseCustGeom(el);
                case 'a:pathLst':  return parsePathLst(el);
                case 'a:path':     return parsePath(el);
                case 'a:moveTo':
                case 'a:lnTo':
                case 'a:cubicBezTo':
                case 'a:quadBezTo':
                case 'a:arcTo':
                case 'a:close':    return parsePathCommand(el);
                case 'a:gd':       return parseGd(el);
                case 'a:gdLst':    return parseGdLst(el);
                case 'a:avLst':    return parseAvLst(el);
                case 'a:ahLst':    return parseAhLst(el);
                case 'a:ahPolar':  return parseAhPolar(el);
                case 'a:ahXY':     return parseAhXY(el);
                case 'a:cxnLst':   return parseCxnLst(el);
                case 'a:cxn':      return parseCxn(el);
                case 'a:rect':     return parseRect(el);
                case 'a:pt':       return parsePt(el);
                case 'a:cxnSp':    return parseCxnSp(el);
                case 'a:scene3d':  return parseScene3d(el);
                case 'a:sp3d':     return parseSp3d(el);
                case 'a:lightRig': return parseLightRig(el);
                case 'a:bevelT':
                case 'a:bevelB':   return parseBevel(el);
                case 'a:flatTx':   return { ...el.attrs };
                case 'a:extrusionClr':
                case 'a:contourClr': return { children: el.children || [] };
                case 'a:cNvCxnSpPr': return { attrs: { ...el.attrs } };
                default: return null;
            }
        }

        return {
            parseAny,
            // custGeom
            parseCustGeom, renderCustGeom,
            parsePath, renderPath,
            parsePathLst, renderPathLst,
            parsePathCommand, renderPathCommand,
            parseGd, renderGd,
            parseAvLst, renderAvLst,
            parseGdLst, renderGdLst,
            parseAhLst, renderAhLst,
            parseAhPolar, renderAhPolar,
            parseAhXY, renderAhXY,
            parseCxnLst, renderCxnLst,
            parseCxn, renderCxn,
            parseRect, renderRect,
            parsePt, renderPt,
            // connectors
            parseCxnSp, renderCxnSp,
            // 3D
            parseScene3d, renderScene3d,
            parseSp3d, renderSp3d,
            parseLightRig, renderLightRig,
            PATH_OPS
        };
    }
};
