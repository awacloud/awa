// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: gradient / blip / pattern fills.
 *
 * Typed parse + render for the full DrawingML fill graph: gradient
 * (gsLst, gs, lin, path, tileRect), blip (blip, srcRect, tile, stretch,
 * fillRect), pattern (fgClr/bgClr) and the typed color tree (prstClr,
 * hslClr, scrgbClr, srgbClr, schemeClr, sysClr).
 *
 * @module ooxml/extra/dml-fills-advanced
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const dmlFillsAdvanced = {
    name: 'dmlFillsAdvanced',
    dependencies: ['xml', 'ooxmlShared'],
    deps: [xml, ooxmlShared],

    factory(xml, shared) {
        // Shared DML color codec — fills-advanced flavour deliberately
        // drops child color transforms on the flat `<a:gs>` / `<a:fgClr>`
        // / `<a:bgClr>` colors (they are tracked elsewhere when needed,
        // e.g. by `dmlEffects`). `withMods: false` preserves that
        // historical semantics so existing round-trips do not gain
        // spurious `<a:lumMod>` etc. children on render.
        const codec = shared.createDmlColorCodec(xml);
        const COLOR_TAGS = codec.COLOR_TAGS;

        function parseColor(el) { return codec.parseColor(el, { withMods: false }); }
        function renderColor(c) { return codec.renderColor(c, { withMods: false }); }
        function findFirstColor(el) { return codec.findFirstColor(el, { withMods: false }); }

        // ---- gradient fill --------------------------------------
        function parseGradFill(el) {
            const out = { attrs: { ...el.attrs }, stops: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:gsLst': {
                        for (const gs of c.children || []) {
                            if (gs.type === 'element' && gs.name === 'a:gs') {
                                out.stops.push({
                                    pos: gs.attrs.pos,
                                    color: findFirstColor(gs)
                                });
                            }
                        }
                        break;
                    }
                    case 'a:lin':      out.lin      = { ...c.attrs }; break;
                    case 'a:path':     out.path     = parseGradPath(c); break;
                    case 'a:tileRect': out.tileRect = { ...c.attrs }; break;
                }
            }
            return out;
        }
        function parseGradPath(el) {
            const out = { attrs: { ...el.attrs } };
            const ftr = (el.children || []).find(c => c.type === 'element' && c.name === 'a:fillToRect');
            if (ftr) out.fillToRect = { ...ftr.attrs };
            return out;
        }
        function renderGradFill(g) {
            const kids = [];
            if (g.stops) {
                kids.push(xml.el('a:gsLst', {}, g.stops.map(s => {
                    const sub = [];
                    if (s.color) sub.push(renderColor(s.color));
                    return xml.el('a:gs', { pos: String(s.pos) }, sub);
                })));
            }
            if (g.lin)      kids.push(xml.el('a:lin', { ...g.lin }));
            if (g.path)     kids.push(renderGradPath(g.path));
            if (g.tileRect) kids.push(xml.el('a:tileRect', { ...g.tileRect }));
            return xml.el('a:gradFill', g.attrs || {}, kids);
        }
        function renderGradPath(p) {
            const kids = [];
            if (p.fillToRect) kids.push(xml.el('a:fillToRect', { ...p.fillToRect }));
            return xml.el('a:path', p.attrs || {}, kids);
        }

        // ---- blip fill ------------------------------------------
        function parseBlipFill(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:blip':    out.blip    = { ...c.attrs }; break;
                    case 'a:srcRect': out.srcRect = { ...c.attrs }; break;
                    case 'a:tile': {
                        out.mode = 'tile';
                        out.tile = { ...c.attrs };
                        break;
                    }
                    case 'a:stretch': {
                        out.mode = 'stretch';
                        const fr = (c.children || []).find(x => x.type === 'element' && x.name === 'a:fillRect');
                        if (fr) out.fillRect = { ...fr.attrs };
                        else    out.fillRect = {};
                        break;
                    }
                }
            }
            return out;
        }
        function renderBlipFill(b) {
            const kids = [];
            if (b.blip)    kids.push(xml.el('a:blip',    { ...b.blip }));
            if (b.srcRect) kids.push(xml.el('a:srcRect', { ...b.srcRect }));
            if (b.mode === 'tile')    kids.push(xml.el('a:tile', { ...(b.tile || {}) }));
            if (b.mode === 'stretch') kids.push(xml.el('a:stretch', {}, [xml.el('a:fillRect', { ...(b.fillRect || {}) })]));
            return xml.el('a:blipFill', b.attrs || {}, kids);
        }

        // ---- pattern fill ---------------------------------------
        function parsePattFill(el) {
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:fgClr': out.fgClr = findFirstColor(c); break;
                    case 'a:bgClr': out.bgClr = findFirstColor(c); break;
                }
            }
            return out;
        }
        function renderPattFill(p) {
            const kids = [];
            if (p.fgClr) kids.push(xml.el('a:fgClr', {}, [renderColor(p.fgClr)]));
            if (p.bgClr) kids.push(xml.el('a:bgClr', {}, [renderColor(p.bgClr)]));
            return xml.el('a:pattFill', p.attrs || {}, kids);
        }

        // Top-level dispatcher (for parse-context coverage detection).
        function parseAny(el) {
            switch (el.name) {
                case 'a:gradFill':   return parseGradFill(el);
                case 'a:blipFill':   return parseBlipFill(el);
                case 'a:pattFill':   return parsePattFill(el);
                case 'a:gsLst':      return el;
                case 'a:gs':         return { pos: el.attrs.pos };
                case 'a:lin':        return { ...el.attrs };
                case 'a:path':       return parseGradPath(el);
                case 'a:tileRect':   return { ...el.attrs };
                case 'a:fillToRect': return { ...el.attrs };
                case 'a:blip':       return { ...el.attrs };
                case 'a:srcRect':    return { ...el.attrs };
                case 'a:tile':       return { ...el.attrs };
                case 'a:stretch':    return el;
                case 'a:fillRect':   return { ...el.attrs };
                case 'a:fgClr':
                case 'a:bgClr':      return findFirstColor(el);
                case 'a:srgbClr':
                case 'a:schemeClr':
                case 'a:prstClr':
                case 'a:hslClr':
                case 'a:scrgbClr':
                case 'a:sysClr':     return parseColor(el);
                default: return null;
            }
        }

        return {
            parseAny,
            parseGradFill, renderGradFill,
            parseBlipFill, renderBlipFill,
            parsePattFill, renderPattFill,
            parseColor, renderColor,
            COLOR_TAGS
        };
    }
};
