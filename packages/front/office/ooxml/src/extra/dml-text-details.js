// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed DrawingML text details and theme script fonts
 * the pptx core leaves in `_extras`. A run's fill colour, effects, gradient
 * fill, highlight, East Asian / complex-script / symbol fonts, hyperlinks
 * and underline-follows-text flags; a paragraph's line and paragraph
 * spacing, bullet colour / size / font and tab stops (and its `defRPr`'s
 * details, as a run's); a paragraph's end properties (`a:endParaRPr`); the
 * theme's per-script fonts. A pptx walker extension registered by
 * `pptxFullBundle`: every element is typed only when it is written back as
 * read (`docxProperties.hydrateLossless`), under this module's field
 * names; any other stays in `_extras`.
 *
 * @module ooxml/extra/dml-text-details
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';
import { docxProperties } from '../docx/properties.js';
import { drawingml } from '../drawingml/drawingml.js';
import { dmlEffects } from './dml-effects.js';
import { dmlFillsAdvanced } from './dml-fills-advanced.js';

export const dmlTextDetails = {
    name: 'dmlTextDetails',
    dependencies: ['xml', 'ooxmlShared', 'docxProperties', 'drawingml', 'dmlEffects', 'dmlFillsAdvanced'],
    deps: [xml, ooxmlShared, docxProperties, drawingml, dmlEffects, dmlFillsAdvanced],

    factory(xml, shared, props, dml, effects, fills) {
        const codec = shared.createDmlColorCodec(xml);
        const elementsOf = (el) => (el.children || []).filter((c) => c && c.type === 'element');
        const attrKeys = (el) => Object.keys(el.attrs || {});
        const isLeaf = (el) => elementsOf(el).length === 0;
        const strAttrs = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k, String(v)]));
        const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

        // A kind: parse an element into a value (undefined: not this shape), render it back.
        const KINDS = {
            // A childless element's attributes, as read.
            attrs: { parse: (el) => (isLeaf(el) && attrKeys(el).length ? { ...el.attrs } : undefined), render: (name, v) => xml.el(name, strAttrs(v)) },
            // An empty element: `true`.
            flag: { parse: (el) => (isLeaf(el) && !attrKeys(el).length ? true : undefined), render: (name, v) => (v === true ? xml.el(name, {}) : null) },
            // A childless element's `val`, a number.
            num: {
                parse: (el) => (isLeaf(el) && attrKeys(el).join() === 'val' ? Number(el.attrs.val) : undefined),
                render: (name, v) => xml.el(name, { val: String(v) })
            },
            // One colour child (the shared codec's, transforms kept).
            color: {
                parse(el) {
                    const kids = elementsOf(el);
                    if (kids.length !== 1 || attrKeys(el).length) return undefined;
                    return codec.parseColor(kids[0], { withMods: true }) || undefined;
                },
                render(name, v) {
                    const c = codec.renderColor(v, { withMods: true });
                    return c ? xml.el(name, {}, [c]) : null;
                }
            },
            // `<a:lnSpc>` / `<a:spcBef>` / `<a:spcAft>`: `{ pct }` or `{ pts }`.
            spacing: {
                parse(el) {
                    const kids = elementsOf(el);
                    if (kids.length !== 1 || attrKeys(el).length) return undefined;
                    const c = kids[0];
                    if (!isLeaf(c) || attrKeys(c).join() !== 'val') return undefined;
                    if (c.name === 'a:spcPct') return { pct: Number(c.attrs.val) };
                    if (c.name === 'a:spcPts') return { pts: Number(c.attrs.val) };
                    return undefined;
                },
                render(name, v) {
                    if (!isPlain(v)) return null;
                    const inner = v.pct != null ? xml.el('a:spcPct', { val: String(v.pct) }) : (v.pts != null ? xml.el('a:spcPts', { val: String(v.pts) }) : null);
                    return inner ? xml.el(name, {}, [inner]) : null;
                }
            },
            // `<a:tabLst>`: its `<a:tab>` children's attributes.
            tabs: {
                parse(el) {
                    const kids = elementsOf(el);
                    if (attrKeys(el).length || kids.some((c) => c.name !== 'a:tab' || !isLeaf(c))) return undefined;
                    return kids.map((c) => ({ ...c.attrs }));
                },
                render: (name, v) => (Array.isArray(v) ? xml.el(name, {}, v.map((a) => xml.el('a:tab', strAttrs(a)))) : null)
            },
            effectLst: { parse: (el) => (attrKeys(el).length ? undefined : effects.parseEffectLst(el)), render: (name, v) => effects.renderEffectLst(v) },
            gradFill: { parse: (el) => fills.parseGradFill(el), render: (name, v) => fills.renderGradFill(v) },
            // `<a:font>` (a theme's script font): its attributes, a list.
            fonts: { parse: (el) => (isLeaf(el) && attrKeys(el).length ? [{ ...el.attrs }] : undefined), render: (name, v) => v.map((a) => xml.el(name, strAttrs(a))) }
        };

        /**
         * A bag typer from a spec `[[elementName, kind, field?], …]`: the
         * typed fields go back first, before the bag's other `_extras`.
         */
        function bagOf(spec) {
            const byName = new Map(spec.map(([name, kind, field]) => [name, { kind: KINDS[kind], field: field || name.replace(/^a:/, '') }]));
            function type(bag) {
                if (!bag || !Array.isArray(bag._extras)) return bag;
                const remaining = [];
                for (const c of bag._extras) {
                    const s = c && c.type === 'element' ? byName.get(c.name) : undefined;
                    const v = s ? s.kind.parse(c) : undefined;
                    if (v === undefined) { remaining.push(c); continue; }
                    bag[s.field] = Array.isArray(v) && Array.isArray(bag[s.field]) ? bag[s.field].concat(v) : v;
                }
                if (remaining.length) bag._extras = remaining; else delete bag._extras;
                return bag;
            }
            function untype(bag) {
                if (!bag || typeof bag !== 'object') return bag;
                const out = { ...bag };
                const typed = [];
                for (const [name, s] of byName) {
                    if (out[s.field] === undefined) continue;
                    const r = s.kind.render(name, out[s.field]);
                    for (const el of Array.isArray(r) ? r : [r]) if (el) typed.push(el);
                    delete out[s.field];
                }
                const extras = typed.concat(Array.isArray(out._extras) ? out._extras : []);
                if (extras.length) out._extras = extras; else delete out._extras;
                return out;
            }
            return {
                hydrate: (bag) => (isPlain(bag) ? props.hydrateLossless(bag, type, untype) : bag),
                dehydrate: (bag) => (isPlain(bag) ? untype(bag) : bag)
            };
        }

        const run = bagOf([
            ['a:solidFill', 'color'], ['a:effectLst', 'effectLst'], ['a:gradFill', 'gradFill'], ['a:highlight', 'color'],
            ['a:latin', 'attrs'], ['a:ea', 'attrs'], ['a:cs', 'attrs'], ['a:sym', 'attrs'],
            ['a:hlinkClick', 'attrs'], ['a:hlinkMouseOver', 'attrs'],
            ['a:uFillTx', 'flag'], ['a:uLnTx', 'flag'], ['a:noFill', 'flag']
        ]);
        const paragraph = bagOf([
            ['a:lnSpc', 'spacing'], ['a:spcBef', 'spacing'], ['a:spcAft', 'spacing'],
            ['a:buClr', 'color'], ['a:buSzPct', 'num'], ['a:buSzPts', 'num'], ['a:buFont', 'attrs'],
            ['a:buClrTx', 'flag'], ['a:buSzTx', 'flag'], ['a:buFontTx', 'flag'], ['a:tabLst', 'tabs']
        ]);
        const fontKind = bagOf([['a:font', 'fonts', 'fonts']]);

        function hydrateParagraphProperties(pPr) {
            if (!isPlain(pPr)) return pPr;
            paragraph.hydrate(pPr);
            if (isPlain(pPr.defRPr)) run.hydrate(pPr.defRPr);
            return pPr;
        }
        function dehydrateParagraphProperties(pPr) {
            if (!isPlain(pPr)) return pPr;
            const out = paragraph.dehydrate(pPr);
            if (isPlain(out.defRPr)) out.defRPr = run.dehydrate(out.defRPr);
            return out;
        }

        // `<a:endParaRPr>`: the core's run properties (colours typed), its
        // other attributes in `extraAttrs`, its children's details as a run's
        // (an `a:latin` with attributes beyond its typeface in `latin`, the
        // core's `font` keeping the typeface only).
        const RPR_ATTRS = new Set(['lang', 'sz', 'b', 'i', 'strike', 'u', 'baseline']);
        const richLatin = (c) => c && c.type === 'element' && c.name === 'a:latin' && attrKeys(c).some((k) => k !== 'typeface');
        function parseEnd(el) {
            const latin = (el.children || []).find(richLatin);
            const out = dml.parseRunProperties(latin ? { ...el, children: el.children.filter((c) => c !== latin) } : el, { typedRunColors: true }) || {};
            if (latin) out._extras = [latin, ...(out._extras || [])];
            const extraAttrs = {};
            for (const [k, v] of Object.entries(el.attrs || {})) if (!RPR_ATTRS.has(k)) extraAttrs[k] = v;
            if (Object.keys(extraAttrs).length) out.extraAttrs = extraAttrs;
            return run.hydrate(out);
        }
        function renderEnd(v) {
            const { extraAttrs, ...rest } = run.dehydrate(v);
            const r = dml.renderRunProperties(rest);
            return xml.el('a:endParaRPr', { ...(r ? r.attrs : {}), ...strAttrs(extraAttrs) }, r ? r.children : []);
        }
        // Typed when it is the paragraph's last leftover, held once, and
        // written back as read.
        function hydrateParagraph(p) {
            if (!isPlain(p) || !Array.isArray(p._extras) || p.endParaRPr !== undefined) return p;
            const last = p._extras[p._extras.length - 1];
            if (!last || last.type !== 'element' || last.name !== 'a:endParaRPr') return p;
            if (p._extras.filter((c) => c && c.name === 'a:endParaRPr').length !== 1) return p;
            const v = parseEnd(last);
            if (!props.sameElement(renderEnd(v), last)) return p;
            p.endParaRPr = v;
            if (p._extras.length === 1) delete p._extras; else p._extras = p._extras.slice(0, -1);
            return p;
        }
        function dehydrateParagraph(p) {
            if (!isPlain(p) || p.endParaRPr === undefined) return p;
            const { endParaRPr, ...out } = p;
            out._extras = (Array.isArray(out._extras) ? out._extras : []).concat(isPlain(endParaRPr) ? [renderEnd(endParaRPr)] : []);
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function eachFontKind(theme, fn) {
            const fs = isPlain(theme) && isPlain(theme.fontScheme) ? theme.fontScheme : null;
            if (!fs) return;
            for (const k of ['majorFont', 'minorFont']) if (isPlain(fs[k])) fs[k] = fn(fs[k]);
        }
        function hydrateTheme(theme) { eachFontKind(theme, fontKind.hydrate); return theme; }
        function dehydrateTheme(theme) {
            if (!isPlain(theme) || !isPlain(theme.fontScheme)) return theme;
            const out = { ...theme, fontScheme: { ...theme.fontScheme } };
            eachFontKind(out, fontKind.dehydrate);
            return out;
        }

        return {
            hydrateRunProperties: run.hydrate, dehydrateRunProperties: run.dehydrate,
            hydrateParagraphProperties, dehydrateParagraphProperties,
            hydrateParagraph, dehydrateParagraph,
            hydrateTheme, dehydrateTheme
        };
    }
};
