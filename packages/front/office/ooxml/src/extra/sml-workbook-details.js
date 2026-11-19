// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: workbook elements the xlsx core leaves in `_extras`
 * — the stylesheet's slicer and timeline styles (its `extLst`) and
 * `colors`, a font's `outline` / `shadow` / `condense` / `extend`, a dxf's
 * `protection`, a table column's `xmlColumnPr` and
 * `calculatedColumnFormula`. An xlsx walker extension registered by
 * `xlsxFullBundle` (`hydrateWorkbook` / `dehydrateWorkbook`): every
 * element is typed only when it is written back as read
 * (`docxProperties.hydrateLossless`); any other stays in `_extras`.
 *
 * @module ooxml/extra/sml-workbook-details
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

export const smlWorkbookDetails = {
    name: 'smlWorkbookDetails',
    dependencies: ['xml', 'docxProperties'],
    deps: [xml, docxProperties],

    factory(xml, props) {
        const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const elements = (n) => ((n && n.children) || []).filter(c => c && c.type === 'element');
        const keysAre = (attrs, allowed) => Object.keys(attrs || {}).every(k => allowed.includes(k));
        const BOOL = { 1: true, true: true, 0: false, false: false };
        const bool = (v) => (v in BOOL ? BOOL[v] : undefined);
        const flag = (b) => (b ? '1' : '0');

        // --- The stylesheet's extLst: slicer and timeline styles ---

        const X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
        const X15 = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main';
        // field, ext uri, prefix, namespace, list / item / elements / element names, default attribute
        // The timeline-styles GUID is joined from its groups so the
        // publication scan does not read its second group as a decision id.
        const STYLE_EXTS = [
            { field: 'slicerStyles', uri: '{EB79DEF2-80B8-43e5-95BD-54CBDDF9020C}', p: 'x14', ns: X14,
              list: 'slicerStyles', item: 'slicerStyle', els: 'slicerStyleElements', el: 'slicerStyleElement', def: 'defaultSlicerStyle' },
            { field: 'timelineStyles', uri: `{${['9260A510', 'F301', '46a8', '8635', 'F512D64BE5F5'].join('-')}}`, p: 'x15', ns: X15,
              list: 'timelineStyles', item: 'timelineStyle', els: 'timelineStyleElements', el: 'timelineStyleElement', def: 'defaultTimelineStyle' }
        ];

        function parseNamedStyles(list, s) {
            if (!keysAre(list.attrs, [s.def])) return undefined;
            const out = {};
            if (list.attrs[s.def] != null) out.default = list.attrs[s.def];
            const styles = [];
            for (const it of elements(list)) {
                if (it.name !== `${s.p}:${s.item}` || !keysAre(it.attrs, ['name'])) return undefined;
                const style = { name: it.attrs.name };
                const kids = elements(it);
                if (kids.length > 1) return undefined;
                if (kids.length) {
                    if (kids[0].name !== `${s.p}:${s.els}` || Object.keys(kids[0].attrs || {}).length) return undefined;
                    style.elements = [];
                    for (const e of elements(kids[0])) {
                        if (e.name !== `${s.p}:${s.el}` || !keysAre(e.attrs, ['type', 'dxfId']) || elements(e).length) return undefined;
                        const item = { type: e.attrs.type };
                        if (e.attrs.dxfId != null) item.dxfId = Number(e.attrs.dxfId);
                        style.elements.push(item);
                    }
                }
                styles.push(style);
            }
            if (styles.length) out.styles = styles;
            return out;
        }

        function renderNamedStyles(v, s) {
            const a = v.default != null ? { [s.def]: String(v.default) } : {};
            const items = (Array.isArray(v.styles) ? v.styles : []).map(st => xml.el(`${s.p}:${s.item}`, { name: String(st.name) },
                Array.isArray(st.elements) ? [xml.el(`${s.p}:${s.els}`, {}, st.elements.map(e => {
                    const ea = { type: String(e.type) };
                    if (e.dxfId != null) ea.dxfId = String(e.dxfId);
                    return xml.el(`${s.p}:${s.el}`, ea);
                }))] : []));
            return xml.el(`${s.p}:${s.list}`, a, items);
        }

        // An extLst of known extensions only, each once, in this order.
        function parseStyleExtLst(el) {
            if (Object.keys(el.attrs || {}).length) return undefined;
            const out = {};
            let at = 0;
            for (const ext of elements(el)) {
                const i = STYLE_EXTS.findIndex(s => s.uri === (ext.attrs && ext.attrs.uri));
                if (i < at) return undefined;
                const s = STYLE_EXTS[i];
                if (!keysAre(ext.attrs, ['uri', `xmlns:${s.p}`]) || ext.attrs[`xmlns:${s.p}`] !== s.ns) return undefined;
                const kids = elements(ext);
                if (kids.length !== 1 || kids[0].name !== `${s.p}:${s.list}`) return undefined;
                const v = parseNamedStyles(kids[0], s);
                if (!v) return undefined;
                out[s.field] = v;
                at = i + 1;
            }
            return Object.keys(out).length ? out : undefined;
        }
        function renderStyleExtLst(bag) {
            const exts = STYLE_EXTS.filter(s => isPlain(bag[s.field])).map(s =>
                xml.el('ext', { uri: s.uri, [`xmlns:${s.p}`]: s.ns }, [renderNamedStyles(bag[s.field], s)]));
            return exts.length ? xml.el('extLst', {}, exts) : null;
        }

        // --- The stylesheet's colors ---

        function parseColors(el) {
            if (Object.keys(el.attrs || {}).length) return undefined;
            const out = {};
            for (const c of elements(el)) {
                if (c.name === 'indexedColors' && !out.indexed) {
                    out.indexed = [];
                    for (const r of elements(c)) {
                        if (r.name !== 'rgbColor' || !keysAre(r.attrs, ['rgb']) || r.attrs.rgb == null) return undefined;
                        out.indexed.push(r.attrs.rgb);
                    }
                } else if (c.name === 'mruColors' && !out.mru && !Object.keys(c.attrs || {}).length) {
                    out.mru = [];
                    for (const r of elements(c)) {
                        if (r.name !== 'color' || elements(r).length) return undefined;
                        out.mru.push({ ...r.attrs });
                    }
                } else return undefined;
            }
            return out;
        }
        function renderColors(v) {
            const kids = [];
            if (Array.isArray(v.indexed)) kids.push(xml.el('indexedColors', {}, v.indexed.map(rgb => xml.el('rgbColor', { rgb: String(rgb) }))));
            if (Array.isArray(v.mru)) kids.push(xml.el('mruColors', {}, v.mru.map(c => xml.el('color', { ...c }))));
            return xml.el('colors', {}, kids);
        }

        // --- Fonts, dxfs, table columns ---

        // A CT_BooleanProperty: no `val` is true.
        function parseFlag(el) {
            if (elements(el).length || !keysAre(el.attrs, ['val'])) return undefined;
            return el.attrs.val == null ? true : bool(el.attrs.val);
        }
        const flagSpec = (name) => [name, name, parseFlag, (v, n) => (v ? xml.el(n) : xml.el(n, { val: '0' }))];

        function parseProtection(el) {
            if (elements(el).length || !keysAre(el.attrs, ['locked', 'hidden'])) return undefined;
            const out = {};
            for (const k of ['locked', 'hidden']) {
                if (el.attrs[k] == null) continue;
                const b = bool(el.attrs[k]);
                if (b === undefined) return undefined;
                out[k] = b;
            }
            return out;
        }
        function renderProtection(v) {
            const a = {};
            for (const k of ['locked', 'hidden']) if (v[k] != null) a[k] = flag(v[k]);
            return xml.el('protection', a);
        }

        function parseXmlColumnPr(el) {
            if (elements(el).length || !keysAre(el.attrs, ['mapId', 'xpath', 'denormalized', 'xmlDataType'])) return undefined;
            const { mapId, xpath, denormalized, xmlDataType } = el.attrs;
            if (mapId == null || xpath == null || xmlDataType == null) return undefined;
            const out = { mapId: Number(mapId), xpath, xmlDataType };
            if (denormalized != null) {
                out.denormalized = bool(denormalized);
                if (out.denormalized === undefined) return undefined;
            }
            return out;
        }
        function renderXmlColumnPr(v) {
            const a = { mapId: String(v.mapId), xpath: String(v.xpath) };
            if (v.denormalized != null) a.denormalized = flag(v.denormalized);
            a.xmlDataType = String(v.xmlDataType);
            return xml.el('xmlColumnPr', a);
        }

        function parseFormula(el) {
            if (elements(el).length || !keysAre(el.attrs, ['array'])) return undefined;
            const out = { formula: (el.children || []).map(c => (c && c.type === 'text' ? c.value : '')).join('') };
            if (el.attrs.array != null) {
                out.array = bool(el.attrs.array);
                if (out.array === undefined) return undefined;
            }
            return out;
        }
        function renderFormula(v, name) {
            const a = v.array != null ? { array: flag(v.array) } : {};
            return xml.el(name, a, v.formula ? [xml.text(String(v.formula))] : []);
        }

        // Each bag kind: [element name, field, parse, render], in the
        // order the typed fields are written back (the schema's).
        const STYLES = [
            ['colors', 'colors', parseColors, renderColors],
            ['extLst', null, parseStyleExtLst, null]
        ];
        // CT_Font's order as Excel writes it.
        const FONT = ['condense', 'extend', 'outline', 'shadow'].map(flagSpec);
        const DXF = [['protection', 'protection', parseProtection, renderProtection]];
        const COLUMN = [
            ['calculatedColumnFormula', 'calculatedColumnFormula', parseFormula, renderFormula],
            ['xmlColumnPr', 'xmlColumnPr', parseXmlColumnPr, renderXmlColumnPr]
        ];

        function typer(spec) {
            const byName = new Map(spec.map(s => [s[0], s]));
            return function type(bag) {
                if (!bag || !Array.isArray(bag._extras)) return bag;
                const remaining = [];
                for (const c of bag._extras) {
                    const s = c && c.type === 'element' ? byName.get(c.name) : undefined;
                    const v = s ? s[2](c) : undefined;
                    if (v === undefined) { remaining.push(c); continue; }
                    if (s[1]) bag[s[1]] = v; else Object.assign(bag, v);
                }
                if (remaining.length) bag._extras = remaining; else delete bag._extras;
                return bag;
            };
        }
        function untyper(spec) {
            return function untype(bag) {
                if (!isPlain(bag)) return bag;
                const out = { ...bag };
                const typed = [];
                for (const [name, field, , render] of spec) {
                    if (field === null) {
                        // The stylesheet's extLst, from its own fields.
                        const el = renderStyleExtLst(out);
                        for (const s of STYLE_EXTS) delete out[s.field];
                        if (el) typed.push(el);
                        continue;
                    }
                    if (out[field] === undefined) continue;
                    const el = out[field] !== null && typeof out[field] !== 'undefined' ? render(out[field], name) : null;
                    if (el) typed.push(el);
                    delete out[field];
                }
                const extras = typed.concat(Array.isArray(out._extras) ? out._extras : []);
                if (extras.length) out._extras = extras; else delete out._extras;
                return out;
            };
        }
        const kinds = {
            styles: [typer(STYLES), untyper(STYLES)],
            font: [typer(FONT), untyper(FONT)],
            dxf: [typer(DXF), untyper(DXF)],
            column: [typer(COLUMN), untyper(COLUMN)]
        };
        // A bag is typed only when its untyping gives back its `_extras`
        // as read, in their order (the write puts the typed fields first,
        // in the schema's order); else it stays as read.
        function hydrate(kind, bag) {
            if (!isPlain(bag) || !Array.isArray(bag._extras)) return bag;
            const before = bag._extras;
            const typed = props.hydrateLossless({ ...bag, _extras: before.slice() }, kinds[kind][0], kinds[kind][1]);
            const back = kinds[kind][1](typed)._extras || [];
            return back.length === before.length && back.every((e, i) => props.sameElement(e, before[i])) ? typed : bag;
        }
        const dehydrate = (kind, bag) => (isPlain(bag) ? kinds[kind][1](bag) : bag);

        // The workbook's bags, inner first on hydrate, outer first on
        // dehydrate; `fn(kind, bag)` returns the bag to put back.
        function each(wb, fn, outerFirst) {
            const styles = isPlain(wb.styles) ? wb.styles : null;
            if (styles && outerFirst) wb.styles = fn('styles', styles);
            const st = isPlain(wb.styles) ? wb.styles : null;
            if (st) {
                if (Array.isArray(st.fonts)) st.fonts = st.fonts.map(f => fn('font', f));
                if (Array.isArray(st.dxfs)) {
                    st.dxfs = st.dxfs.map(d => {
                        if (!isPlain(d)) return d;
                        const out = outerFirst ? fn('dxf', d) : d;
                        if (isPlain(out.font)) out.font = fn('font', out.font);
                        return outerFirst ? out : fn('dxf', out);
                    });
                }
                if (!outerFirst) wb.styles = fn('styles', st);
            }
            for (const t of Array.isArray(wb.tables) ? wb.tables : []) {
                if (isPlain(t) && Array.isArray(t.columns)) t.columns = t.columns.map(c => fn('column', c));
            }
        }

        return {
            hydrateWorkbook(wb) { if (isPlain(wb)) each(wb, hydrate, false); return wb; },
            dehydrateWorkbook(wb) { if (isPlain(wb)) each(wb, dehydrate, true); return wb; }
        };
    }
};
