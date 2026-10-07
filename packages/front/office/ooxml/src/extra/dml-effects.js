// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: shape effects.
 *
 * Typed parse + render for the full DrawingML effect graph: effectLst,
 * effectDag, shadows (outer/inner/preset), glow, reflection, soft edge,
 * blur, fillOverlay, color transforms (lum, tint, shade, grayscl,
 * duotone, clrChange, clrRepl, alpha*, biLevel) and effect xfrm.
 *
 * @module ooxml/extra/dml-effects
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const dmlEffects = {
    name: 'dmlEffects',
    dependencies: ['xml', 'ooxmlShared'],
    deps: [xml, ooxmlShared],

    factory(xml, shared) {
        // Shared DML color codec — `withMods: true` preserves the
        // `lumMod` / `lumOff` / `tint` / `shade` / `alpha*` / `lum` /
        // `grayscl` / `duotone` / `clrChange` / `clrRepl` / `biLevel`
        // children on `color.mods`, which is the effects-flavour
        // semantics this module exposes.
        const codec = shared.createDmlColorCodec(xml);
        const COLOR_TAGS = codec.COLOR_TAGS;

        function parseColor(el)  { return codec.parseColor(el,  { withMods: true }); }
        function renderColor(c)  { return codec.renderColor(c,  { withMods: true }); }
        function findFirstColor(el) { return codec.findFirstColor(el, { withMods: true }); }
        const parseColorMod  = codec.parseColorMod;
        const renderColorMod = codec.renderColorMod;

        // ---- Effects --------------------------------------------
        function parseEffect(el) {
            switch (el.name) {
                case 'a:outerShdw':   return { kind: 'outerShdw',   attrs: { ...el.attrs }, color: findFirstColor(el) };
                case 'a:innerShdw':   return { kind: 'innerShdw',   attrs: { ...el.attrs }, color: findFirstColor(el) };
                case 'a:prstShdw':    return { kind: 'prstShdw',    attrs: { ...el.attrs }, color: findFirstColor(el) };
                case 'a:glow':        return { kind: 'glow',        attrs: { ...el.attrs }, color: findFirstColor(el) };
                case 'a:reflection':  return { kind: 'reflection',  attrs: { ...el.attrs } };
                case 'a:softEdge':    return { kind: 'softEdge',    attrs: { ...el.attrs } };
                case 'a:blur':        return { kind: 'blur',        attrs: { ...el.attrs } };
                case 'a:fillOverlay': {
                    const inner = (el.children || []).filter(c => c.type === 'element');
                    return { kind: 'fillOverlay', attrs: { ...el.attrs }, fills: inner };
                }
                default: return null;
            }
        }
        function renderEffect(e) {
            const cKids = e.color ? [renderColor(e.color)] : [];
            switch (e.kind) {
                case 'outerShdw':  return xml.el('a:outerShdw',  e.attrs || {}, cKids);
                case 'innerShdw':  return xml.el('a:innerShdw',  e.attrs || {}, cKids);
                case 'prstShdw':   return xml.el('a:prstShdw',   e.attrs || {}, cKids);
                case 'glow':       return xml.el('a:glow',       e.attrs || {}, cKids);
                case 'reflection': return xml.el('a:reflection', e.attrs || {});
                case 'softEdge':   return xml.el('a:softEdge',   e.attrs || {});
                case 'blur':       return xml.el('a:blur',       e.attrs || {});
                case 'fillOverlay':return xml.el('a:fillOverlay', e.attrs || {}, e.fills || []);
                default: return null;
            }
        }

        // ---- effectLst -----------------------------------------
        function parseEffectLst(el) {
            const out = { effects: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                const eff = parseEffect(c);
                if (eff) out.effects.push(eff);
            }
            return out;
        }
        function renderEffectLst(e) {
            const kids = (e.effects || []).map(renderEffect).filter(Boolean);
            return xml.el('a:effectLst', {}, kids);
        }

        // ---- effectDag (effects with nested refs) --------------
        function parseEffectDag(el) {
            const out = { attrs: { ...el.attrs }, effects: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                const eff = parseEffect(c);
                if (eff) out.effects.push(eff);
            }
            return out;
        }
        function renderEffectDag(e) {
            const kids = (e.effects || []).map(renderEffect).filter(Boolean);
            return xml.el('a:effectDag', e.attrs || {}, kids);
        }

        // ---- effect ref (named effect inside effectDag) ---------
        function parseEffectRef(el) { return { ref: el.attrs.ref }; }
        function renderEffectRef(e) { return xml.el('a:effect', { ref: String(e.ref) }); }

        // ---- effectStyle / effectStyleLst (theme) ---------------
        function parseEffectStyle(el) {
            const out = {};
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'a:effectLst': out.effectLst = parseEffectLst(c); break;
                    case 'a:effectDag': out.effectDag = parseEffectDag(c); break;
                }
            }
            return out;
        }
        function renderEffectStyle(s) {
            const kids = [];
            if (s.effectLst) kids.push(renderEffectLst(s.effectLst));
            if (s.effectDag) kids.push(renderEffectDag(s.effectDag));
            return xml.el('a:effectStyle', {}, kids);
        }
        function parseEffectStyleLst(el) {
            const out = { styles: [] };
            for (const c of el.children || []) {
                if (c.type === 'element' && c.name === 'a:effectStyle') {
                    out.styles.push(parseEffectStyle(c));
                }
            }
            return out;
        }
        function renderEffectStyleLst(l) {
            return xml.el('a:effectStyleLst', {}, (l.styles || []).map(renderEffectStyle));
        }

        // ---- effect xfrm ---------------------------------------
        function parseXfrm(el) { return { attrs: { ...el.attrs } }; }
        function renderXfrm(x) { return xml.el('a:xfrm', x.attrs || {}); }

        // Top-level dispatcher for parse-context detection.
        function parseAny(el) {
            switch (el.name) {
                case 'a:effectLst': return parseEffectLst(el);
                case 'a:effectDag': return parseEffectDag(el);
                case 'a:xfrm':      return parseXfrm(el);
                case 'a:outerShdw':
                case 'a:innerShdw':
                case 'a:prstShdw':
                case 'a:glow':
                case 'a:reflection':
                case 'a:softEdge':
                case 'a:blur':
                case 'a:fillOverlay':
                    return parseEffect(el);
                case 'a:lum':
                case 'a:tint':
                case 'a:shade':
                case 'a:grayscl':
                case 'a:duotone':
                case 'a:clrChange':
                case 'a:clrRepl':
                case 'a:alphaMod':
                case 'a:alphaModFix':
                case 'a:alphaCeiling':
                case 'a:alphaFloor':
                case 'a:alphaRepl':
                case 'a:biLevel':
                case 'a:lumMod':
                case 'a:lumOff':
                    return parseColorMod(el);
                case 'a:effect':         return parseEffectRef(el);
                case 'a:effectStyle':    return parseEffectStyle(el);
                case 'a:effectStyleLst': return parseEffectStyleLst(el);
                default: return null;
            }
        }

        return {
            parseAny,
            parseEffectLst, renderEffectLst,
            parseEffectDag, renderEffectDag,
            parseEffect, renderEffect,
            parseColor, renderColor,
            parseColorMod, renderColorMod,
            parseXfrm, renderXfrm,
            parseEffectRef, renderEffectRef,
            parseEffectStyle, renderEffectStyle,
            parseEffectStyleLst, renderEffectStyleLst,
            COLOR_TAGS
        };
    }
};
