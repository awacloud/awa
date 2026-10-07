// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PresentationML slide transitions.
 *
 * Models `<p:transition>` (a child of slide / slideMaster / slideLayout)
 * including the typed effect element (cut/fade/wipe/...) and optional
 * sound action. Each effect kind preserves its specific attribute set
 * (e.g. wipe.dir, push.dir, split.orient/dir, wheel.spokes).
 *
 * @module ooxml/extra/pml-transitions
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pmlTransitions = {
    name: 'pmlTransitions',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // All effect kinds known to the PML transition catalog.
        const EFFECT_TAGS = [
            'cut', 'fade', 'wipe', 'push', 'split', 'dissolve', 'pull',
            'wedge', 'wheel', 'cover', 'uncover', 'zoom', 'randomBar',
            'comb', 'flash', 'circle', 'diamond', 'plus', 'newsflash',
            'random', 'blinds', 'checker', 'strips'
        ];

        function parseTransition(el) {
            if (!el) return undefined;
            const out = { attrs: { ...el.attrs } };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'p:cut':
                    case 'p:fade':
                    case 'p:wipe':
                    case 'p:push':
                    case 'p:split':
                    case 'p:dissolve':
                    case 'p:pull':
                    case 'p:wedge':
                    case 'p:wheel':
                    case 'p:cover':
                    case 'p:uncover':
                    case 'p:zoom':
                    case 'p:randomBar':
                    case 'p:comb':
                    case 'p:flash':
                    case 'p:circle':
                    case 'p:diamond':
                    case 'p:plus':
                    case 'p:newsflash':
                    case 'p:random':
                    case 'p:blinds':
                    case 'p:checker':
                    case 'p:strips':
                        out.effect = { kind: c.name.replace(/^p:/, ''), attrs: { ...c.attrs } };
                        break;
                    case 'p:sndAc':
                        out.sndAc = parseSoundAction(c);
                        break;
                    case 'p:extLst':
                        out.extLst = true;
                        break;
                }
            }
            return out;
        }

        function parseSoundAction(el) {
            const out = { kind: 'sndAc' };
            const stSnd = xml.findChild(el, 'p:stSnd');
            if (stSnd) {
                out.startSound = { ...stSnd.attrs };
                // <p:stSnd> wraps an <p:snd> element with the actual r:embed
                const snd = xml.findChild(stSnd, 'p:snd');
                if (snd) out.startSound = { ...out.startSound, ...snd.attrs };
            }
            const endSnd = xml.findChild(el, 'p:endSnd');
            if (endSnd) out.endSound = true;
            return out;
        }

        function renderEffect(effect) {
            const a = effect.attrs || {};
            switch (effect.kind) {
                case 'cut':       return xml.el('p:cut',       a);
                case 'fade':      return xml.el('p:fade',      a);
                case 'wipe':      return xml.el('p:wipe',      a);
                case 'push':      return xml.el('p:push',      a);
                case 'split':     return xml.el('p:split',     a);
                case 'dissolve':  return xml.el('p:dissolve',  a);
                case 'pull':      return xml.el('p:pull',      a);
                case 'wedge':     return xml.el('p:wedge',     a);
                case 'wheel':     return xml.el('p:wheel',     a);
                case 'cover':     return xml.el('p:cover',     a);
                case 'uncover':   return xml.el('p:uncover',   a);
                case 'zoom':      return xml.el('p:zoom',      a);
                case 'randomBar': return xml.el('p:randomBar', a);
                case 'comb':      return xml.el('p:comb',      a);
                case 'flash':     return xml.el('p:flash',     a);
                case 'circle':    return xml.el('p:circle',    a);
                case 'diamond':   return xml.el('p:diamond',   a);
                case 'plus':      return xml.el('p:plus',      a);
                case 'newsflash': return xml.el('p:newsflash', a);
                case 'random':    return xml.el('p:random',    a);
                case 'blinds':    return xml.el('p:blinds',    a);
                case 'checker':   return xml.el('p:checker',   a);
                case 'strips':    return xml.el('p:strips',    a);
                default:          return xml.el('p:' + effect.kind, a);
            }
        }

        function renderTransition(t) {
            if (!t) return null;
            const kids = [];
            if (t.effect) kids.push(renderEffect(t.effect));
            if (t.sndAc) {
                const sndKids = [];
                if (t.sndAc.startSound) sndKids.push(xml.el('p:stSnd', t.sndAc.startSound));
                if (t.sndAc.endSound)   sndKids.push(xml.el('p:endSnd', {}));
                kids.push(xml.el('p:sndAc', {}, sndKids));
            }
            return xml.el('p:transition', t.attrs || {}, kids);
        }

        return { parseTransition, renderTransition, parseSoundAction, renderEffect, EFFECT_TAGS };
    }
};
