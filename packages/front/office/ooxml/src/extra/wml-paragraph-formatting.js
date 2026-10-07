// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed support for the secondary `<w:pPr>` children
 * (tabs, framePr, kinsoku flags, …).
 *
 * Same wrapping pattern as `wml-run-formatting`: delegates to
 * `docxProperties` for the core fields, then promotes/demotes between
 * `_extras` and typed fields for the secondary set.
 *
 * ## Elements covered
 *
 * - **Toggles** : `widowControl`, `adjustRightInd`, `snapToGrid`,
 *   `contextualSpacing`, `mirrorIndents`, `suppressAutoHyphens`,
 *   `kinsoku`, `wordWrap`, `overflowPunct`, `topLinePunct`, `autoSpaceDE`,
 *   `autoSpaceDN`, `bidi`, `keepNext`, `keepLines`, `pageBreakBefore`,
 *   `suppressLineNumbers`, `suppressOverlap`
 * - **Val-bearing** : `outlineLvl`, `divId`, `cnfStyle`, `textAlignment`,
 *   `textDirection`, `textboxTightWrap`
 * - **Complex** : `tabs` (sequence of `<w:tab>`), `framePr` (multi-attr)
 *
 * @module ooxml/extra/wml-paragraph-formatting
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

export const wmlParagraphFormatting = {
    name: 'wmlParagraphFormatting',
    dependencies: ['xml', 'docxProperties'],
    deps: [xml, docxProperties],

    factory(xml, core) {
        // tabs: parent <w:tabs> with child <w:tab w:val="left" w:pos="720" w:leader="dot"/>
        function parseTabs(el) {
            const tabs = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tab') {
                    const t = {};
                    if (c.attrs['w:val'])    t.val = c.attrs['w:val'];
                    if (c.attrs['w:pos'])    t.pos = Number(c.attrs['w:pos']);
                    if (c.attrs['w:leader']) t.leader = c.attrs['w:leader'];
                    tabs.push(t);
                }
            }
            return tabs.length ? tabs : undefined;
        }
        function renderTabs(tabs) {
            if (!tabs || !tabs.length) return null;
            const kids = tabs.map(t => {
                const a = {};
                if (t.val != null)    a['w:val'] = String(t.val);
                if (t.pos != null)    a['w:pos'] = String(t.pos);
                if (t.leader != null) a['w:leader'] = String(t.leader);
                return xml.el('w:tab', a);
            });
            return xml.el('w:tabs', {}, kids);
        }

        // framePr: many attrs, no children.
        const FRAME_ATTRS = ['w', 'h', 'hSpace', 'vSpace', 'x', 'y',
            'wrap', 'hAnchor', 'vAnchor', 'xAlign', 'yAlign',
            'hRule', 'anchorLock', 'lines', 'dropCap'];
        function parseFramePr(el) {
            const out = {};
            for (const a of FRAME_ATTRS) {
                if (el.attrs['w:' + a] != null) out[a] = el.attrs['w:' + a];
            }
            return Object.keys(out).length ? out : undefined;
        }
        function renderFramePr(fp) {
            if (!fp) return null;
            const a = {};
            for (const k of FRAME_ATTRS) {
                if (fp[k] != null) a['w:' + k] = String(fp[k]);
            }
            return xml.el('w:framePr', a);
        }

        function hydrate(pPr) {
            if (!pPr || !pPr._extras) return pPr;
            const remaining = [];
            for (const c of pPr._extras) {
                if (c.type !== 'element') { remaining.push(c); continue; }
                switch (c.name) {
                    // toggles
                    case 'w:widowControl':         pPr.widowControl         = core.readToggle(c); break;
                    case 'w:adjustRightInd':       pPr.adjustRightInd       = core.readToggle(c); break;
                    case 'w:snapToGrid':           pPr.snapToGrid           = core.readToggle(c); break;
                    case 'w:contextualSpacing':    pPr.contextualSpacing    = core.readToggle(c); break;
                    case 'w:mirrorIndents':        pPr.mirrorIndents        = core.readToggle(c); break;
                    case 'w:suppressAutoHyphens':  pPr.suppressAutoHyphens  = core.readToggle(c); break;
                    case 'w:kinsoku':              pPr.kinsoku              = core.readToggle(c); break;
                    case 'w:wordWrap':             pPr.wordWrap             = core.readToggle(c); break;
                    case 'w:overflowPunct':        pPr.overflowPunct        = core.readToggle(c); break;
                    case 'w:topLinePunct':         pPr.topLinePunct         = core.readToggle(c); break;
                    case 'w:autoSpaceDE':          pPr.autoSpaceDE          = core.readToggle(c); break;
                    case 'w:autoSpaceDN':          pPr.autoSpaceDN          = core.readToggle(c); break;
                    case 'w:bidi':                 pPr.bidi                 = core.readToggle(c); break;
                    case 'w:keepNext':             pPr.keepNext             = core.readToggle(c); break;
                    case 'w:keepLines':            pPr.keepLines            = core.readToggle(c); break;
                    case 'w:pageBreakBefore':      pPr.pageBreakBefore      = core.readToggle(c); break;
                    case 'w:suppressLineNumbers':  pPr.suppressLineNumbers  = core.readToggle(c); break;
                    case 'w:suppressOverlap':      pPr.suppressOverlap      = core.readToggle(c); break;
                    // val-bearing
                    case 'w:outlineLvl':       pPr.outlineLvl       = Number(c.attrs['w:val']); break;
                    case 'w:divId':            pPr.divId            = c.attrs['w:val']; break;
                    case 'w:textAlignment':    pPr.textAlignment    = c.attrs['w:val']; break;
                    case 'w:textDirection':    pPr.textDirection    = c.attrs['w:val']; break;
                    case 'w:textboxTightWrap': pPr.textboxTightWrap = c.attrs['w:val']; break;
                    case 'w:cnfStyle':         pPr.cnfStyle         = c.attrs['w:val']; break;
                    // complex
                    case 'w:tabs':    { const v = parseTabs(c);    if (v) pPr.tabs = v; break; }
                    case 'w:framePr': { const v = parseFramePr(c); if (v) pPr.framePr = v; break; }
                    default:
                        remaining.push(c);
                }
            }
            if (remaining.length) pPr._extras = remaining;
            else delete pPr._extras;
            return pPr;
        }

        function dehydrate(pPr) {
            if (!pPr) return pPr;
            const out = { ...pPr };
            const extras = out._extras ? [...out._extras] : [];
            // toggles — emit via xml.el directly so each name is visible to
            // the coverage scanner.
            const tA = v => v === false ? { 'w:val': '0' } : {};
            if (out.widowControl        !== undefined) { extras.push(xml.el('w:widowControl',        tA(out.widowControl)));        delete out.widowControl; }
            if (out.adjustRightInd      !== undefined) { extras.push(xml.el('w:adjustRightInd',      tA(out.adjustRightInd)));      delete out.adjustRightInd; }
            if (out.snapToGrid          !== undefined) { extras.push(xml.el('w:snapToGrid',          tA(out.snapToGrid)));          delete out.snapToGrid; }
            if (out.contextualSpacing   !== undefined) { extras.push(xml.el('w:contextualSpacing',   tA(out.contextualSpacing)));   delete out.contextualSpacing; }
            if (out.mirrorIndents       !== undefined) { extras.push(xml.el('w:mirrorIndents',       tA(out.mirrorIndents)));       delete out.mirrorIndents; }
            if (out.suppressAutoHyphens !== undefined) { extras.push(xml.el('w:suppressAutoHyphens', tA(out.suppressAutoHyphens))); delete out.suppressAutoHyphens; }
            if (out.kinsoku             !== undefined) { extras.push(xml.el('w:kinsoku',             tA(out.kinsoku)));             delete out.kinsoku; }
            if (out.wordWrap            !== undefined) { extras.push(xml.el('w:wordWrap',            tA(out.wordWrap)));            delete out.wordWrap; }
            if (out.overflowPunct       !== undefined) { extras.push(xml.el('w:overflowPunct',       tA(out.overflowPunct)));       delete out.overflowPunct; }
            if (out.topLinePunct        !== undefined) { extras.push(xml.el('w:topLinePunct',        tA(out.topLinePunct)));        delete out.topLinePunct; }
            if (out.autoSpaceDE         !== undefined) { extras.push(xml.el('w:autoSpaceDE',         tA(out.autoSpaceDE)));         delete out.autoSpaceDE; }
            if (out.autoSpaceDN         !== undefined) { extras.push(xml.el('w:autoSpaceDN',         tA(out.autoSpaceDN)));         delete out.autoSpaceDN; }
            if (out.bidi                !== undefined) { extras.push(xml.el('w:bidi',                tA(out.bidi)));                delete out.bidi; }
            if (out.keepNext            !== undefined) { extras.push(xml.el('w:keepNext',            tA(out.keepNext)));            delete out.keepNext; }
            if (out.keepLines           !== undefined) { extras.push(xml.el('w:keepLines',           tA(out.keepLines)));           delete out.keepLines; }
            if (out.pageBreakBefore     !== undefined) { extras.push(xml.el('w:pageBreakBefore',     tA(out.pageBreakBefore)));     delete out.pageBreakBefore; }
            if (out.suppressLineNumbers !== undefined) { extras.push(xml.el('w:suppressLineNumbers', tA(out.suppressLineNumbers))); delete out.suppressLineNumbers; }
            if (out.suppressOverlap     !== undefined) { extras.push(xml.el('w:suppressOverlap',     tA(out.suppressOverlap)));     delete out.suppressOverlap; }
            // val-bearing — explicit per-name xml.el calls.
            if (out.outlineLvl       != null) { extras.push(xml.el('w:outlineLvl',       { 'w:val': String(out.outlineLvl) }));       delete out.outlineLvl; }
            if (out.divId            != null) { extras.push(xml.el('w:divId',            { 'w:val': String(out.divId) }));            delete out.divId; }
            if (out.textAlignment    != null) { extras.push(xml.el('w:textAlignment',    { 'w:val': String(out.textAlignment) }));    delete out.textAlignment; }
            if (out.textDirection    != null) { extras.push(xml.el('w:textDirection',    { 'w:val': String(out.textDirection) }));    delete out.textDirection; }
            if (out.textboxTightWrap != null) { extras.push(xml.el('w:textboxTightWrap', { 'w:val': String(out.textboxTightWrap) })); delete out.textboxTightWrap; }
            if (out.cnfStyle         != null) { extras.push(xml.el('w:cnfStyle',         { 'w:val': String(out.cnfStyle) }));         delete out.cnfStyle; }
            // complex
            if (out.tabs)    { extras.push(renderTabs(out.tabs));       delete out.tabs; }
            if (out.framePr) { extras.push(renderFramePr(out.framePr)); delete out.framePr; }
            if (extras.length) out._extras = extras;
            return out;
        }

        function parseParagraphProperties(pPrEl) {
            return hydrate(core.parseParagraphProperties(pPrEl));
        }
        function renderParagraphProperties(pPr) {
            return core.renderParagraphProperties(dehydrate(pPr));
        }

        return {
            parseParagraphProperties, renderParagraphProperties,
            hydrate, dehydrate,
            // Hook aliases for the docx `.use(...)` walker.
            hydrateParagraphProperties: hydrate,
            dehydrateParagraphProperties: dehydrate,
            parseTabs, renderTabs,
            parseFramePr, renderFramePr
        };
    }
};
