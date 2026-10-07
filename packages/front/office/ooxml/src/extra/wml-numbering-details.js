// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: detailed numbering (w:numbering).
 *
 * Typed parse/render for `<w:lvl>`, `<w:abstractNum>`, `<w:num>`,
 * `<w:lvlOverride>` and all their children: `nfc`, `isLgl`, `suff`,
 * `lvlPicBulletId`, `legacy`, `lvlRestart`, `pStyle`, `tplc`, `nsid`,
 * `tmpl`, `multiLevelType`, `numFmt`, `start`, `lvlText`, `lvlJc`,
 * `numStyleLink`, `styleLink`, `lvlOverride`, `startOverride`,
 * `numStart`, `numRestart`, `numPicBullet`, `abstractNumId`.
 *
 * @module ooxml/extra/wml-numbering-details
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const wmlNumberingDetails = {
    name: 'wmlNumberingDetails',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // ---- helpers ----
        const findChild = xml.findChild;
        function readToggle(el) {
            if (!el) return undefined;
            const v = el.attrs['w:val'];
            if (v === undefined) return true;
            return !(v === '0' || v === 'false' || v === 'off');
        }
        function valOf(el) { return el && el.attrs ? el.attrs['w:val'] : undefined; }

        // ---- <w:lvl> ----
        // Children: w:start, w:numFmt, w:lvlText, w:lvlJc, w:nfc, w:isLgl,
        //   w:suff, w:lvlPicBulletId, w:legacy, w:lvlRestart, w:pStyle,
        //   w:numFmt, w:pPr, w:rPr (we keep pPr/rPr as raw nodes).
        function parseLvl(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:start':           out.start = valOf(c); break;
                    case 'w:numFmt':          out.numFmt = valOf(c); break;
                    case 'w:lvlText':         out.lvlText = valOf(c); break;
                    case 'w:lvlJc':           out.lvlJc = valOf(c); break;
                    case 'w:nfc':             out.nfc = valOf(c); break;
                    case 'w:suff':            out.suff = valOf(c); break;
                    case 'w:lvlPicBulletId':  out.lvlPicBulletId = valOf(c); break;
                    case 'w:lvlRestart':      out.lvlRestart = valOf(c); break;
                    case 'w:pStyle':          out.pStyle = valOf(c); break;
                    case 'w:isLgl':           out.isLgl = readToggle(c); break;
                    case 'w:legacy':          out.legacy = { ...c.attrs }; break;
                    case 'w:pPr':             out.pPr = c; break;
                    case 'w:rPr':             out.rPr = c; break;
                    default:
                        (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderLvl(lvl) {
            const kids = [];
            if (lvl.start != null)          kids.push(xml.el('w:start', { 'w:val': String(lvl.start) }));
            if (lvl.numFmt != null)         kids.push(xml.el('w:numFmt', { 'w:val': String(lvl.numFmt) }));
            if (lvl.lvlText != null)        kids.push(xml.el('w:lvlText', { 'w:val': String(lvl.lvlText) }));
            if (lvl.lvlJc != null)          kids.push(xml.el('w:lvlJc', { 'w:val': String(lvl.lvlJc) }));
            if (lvl.nfc != null)            kids.push(xml.el('w:nfc', { 'w:val': String(lvl.nfc) }));
            if (lvl.suff != null)           kids.push(xml.el('w:suff', { 'w:val': String(lvl.suff) }));
            if (lvl.lvlPicBulletId != null) kids.push(xml.el('w:lvlPicBulletId', { 'w:val': String(lvl.lvlPicBulletId) }));
            if (lvl.lvlRestart != null)     kids.push(xml.el('w:lvlRestart', { 'w:val': String(lvl.lvlRestart) }));
            if (lvl.pStyle != null)         kids.push(xml.el('w:pStyle', { 'w:val': String(lvl.pStyle) }));
            if (lvl.isLgl === true)         kids.push(xml.el('w:isLgl', {}));
            else if (lvl.isLgl === false)   kids.push(xml.el('w:isLgl', { 'w:val': '0' }));
            if (lvl.legacy)                 kids.push(xml.el('w:legacy', { ...lvl.legacy }));
            if (lvl.pPr)                    kids.push(lvl.pPr);
            if (lvl.rPr)                    kids.push(lvl.rPr);
            if (lvl._extras) for (const e of lvl._extras) kids.push(e);
            return xml.el('w:lvl', lvl.attrs || {}, kids);
        }

        // ---- <w:abstractNum> ----
        // Children: w:nsid, w:multiLevelType, w:tmpl, w:tplc, w:name,
        //   w:styleLink, w:numStyleLink, w:lvl[]
        function parseAbstractNum(el) {
            const out = { attrs: { ...el.attrs }, lvls: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:nsid':           out.nsid = valOf(c); break;
                    case 'w:multiLevelType': out.multiLevelType = valOf(c); break;
                    case 'w:tmpl':           out.tmpl = valOf(c); break;
                    case 'w:tplc':           out.tplc = valOf(c); break;
                    case 'w:name':           out.name = valOf(c); break;
                    case 'w:styleLink':      out.styleLink = valOf(c); break;
                    case 'w:numStyleLink':   out.numStyleLink = valOf(c); break;
                    case 'w:lvl':            out.lvls.push(parseLvl(c)); break;
                    default:
                        (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }

        function renderAbstractNum(an) {
            const kids = [];
            if (an.nsid != null)            kids.push(xml.el('w:nsid', { 'w:val': String(an.nsid) }));
            if (an.multiLevelType != null)  kids.push(xml.el('w:multiLevelType', { 'w:val': String(an.multiLevelType) }));
            if (an.tmpl != null)            kids.push(xml.el('w:tmpl', { 'w:val': String(an.tmpl) }));
            if (an.tplc != null)            kids.push(xml.el('w:tplc', { 'w:val': String(an.tplc) }));
            if (an.name != null)            kids.push(xml.el('w:name', { 'w:val': String(an.name) }));
            if (an.styleLink != null)       kids.push(xml.el('w:styleLink', { 'w:val': String(an.styleLink) }));
            if (an.numStyleLink != null)    kids.push(xml.el('w:numStyleLink', { 'w:val': String(an.numStyleLink) }));
            if (an.lvls) for (const lvl of an.lvls) kids.push(renderLvl(lvl));
            if (an._extras) for (const e of an._extras) kids.push(e);
            return xml.el('w:abstractNum', an.attrs || {}, kids);
        }

        // ---- <w:lvlOverride> ----
        // Attrs: w:ilvl. Children: w:startOverride, w:lvl
        function parseLvlOverride(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:startOverride') { out.startOverride = valOf(c); continue; }
                if (c.name === 'w:numStart')      { out.numStart = valOf(c); continue; }
                if (c.name === 'w:numRestart')    { out.numRestart = valOf(c); continue; }
                if (c.name === 'w:lvl')           { out.lvl = parseLvl(c); continue; }
                (out._extras = out._extras || []).push(c);
            }
            return out;
        }
        function renderLvlOverride(lo) {
            const kids = [];
            if (lo.startOverride != null) kids.push(xml.el('w:startOverride', { 'w:val': String(lo.startOverride) }));
            if (lo.numStart != null)      kids.push(xml.el('w:numStart', { 'w:val': String(lo.numStart) }));
            if (lo.numRestart != null)    kids.push(xml.el('w:numRestart', { 'w:val': String(lo.numRestart) }));
            if (lo.lvl) kids.push(renderLvl(lo.lvl));
            if (lo._extras) for (const e of lo._extras) kids.push(e);
            return xml.el('w:lvlOverride', lo.attrs || {}, kids);
        }

        // ---- <w:num> ----
        // Children: w:abstractNumId, w:lvlOverride[]
        function parseNum(el) {
            const out = { attrs: { ...el.attrs }, lvlOverrides: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:abstractNumId') { out.abstractNumId = valOf(c); continue; }
                if (c.name === 'w:lvlOverride')   { out.lvlOverrides.push(parseLvlOverride(c)); continue; }
                (out._extras = out._extras || []).push(c);
            }
            return out;
        }
        function renderNum(n) {
            const kids = [];
            if (n.abstractNumId != null) kids.push(xml.el('w:abstractNumId', { 'w:val': String(n.abstractNumId) }));
            if (n.lvlOverrides) for (const lo of n.lvlOverrides) kids.push(renderLvlOverride(lo));
            if (n._extras) for (const e of n._extras) kids.push(e);
            return xml.el('w:num', n.attrs || {}, kids);
        }

        // ---- <w:numPicBullet> ----
        function parseNumPicBullet(el) {
            return { attrs: { ...el.attrs }, children: el.children.filter(c => c.type === 'element') };
        }
        function renderNumPicBullet(b) {
            return xml.el('w:numPicBullet', b.attrs || {}, b.children || []);
        }

        return {
            parseLvl, renderLvl,
            parseAbstractNum, renderAbstractNum,
            parseNum, renderNum,
            parseLvlOverride, renderLvlOverride,
            parseNumPicBullet, renderNumPicBullet,
            findChild
        };
    }
};
