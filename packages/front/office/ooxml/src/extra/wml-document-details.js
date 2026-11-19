// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed docx details the core and `docx-large`'s
 * hooks leave in `_extras` — a run's `rtl`, character `spacing`, a
 * paragraph mark's revisions and a run's property changes (`rPrChange`);
 * a paragraph's shading, borders, own section and property changes; a
 * cell's shading; a row's table property exceptions; a section's grid,
 * columns, page numbering, text direction and other attribute-only
 * children; settings' `mathPr` and the remaining `w:` toggles, `compat`'s
 * legacy toggles. A docx walker extension registered by `docxFullBundle`:
 * every element is typed only when it is written back as read
 * (`docxProperties.hydrateLossless`), under this module's field names.
 * Left raw: what would be written out of its place — a row `trPr`'s
 * children (`wmlTableProperties` writes its own fields first) and the
 * `w14:` / `w15:` settings the core's settings sequence does not list.
 *
 * @module ooxml/extra/wml-document-details
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';
import { docxStructure } from '../docx/structure.js';

export const wmlDocumentDetails = {
    name: 'wmlDocumentDetails',
    dependencies: ['xml', 'docxProperties', 'docxStructure'],
    deps: [xml, docxProperties, docxStructure],

    factory(xml, core, structure) {
        const TOGGLE_VALUES = new Set(['true', 'false', '1', '0', 'on', 'off']);
        const elementsOf = (el) => (el.children || []).filter((c) => c.type === 'element');
        const isEmpty = (el) => elementsOf(el).length === 0 && Object.keys(el.attrs || {}).length === 0;

        // Attributes as read, the `w:` prefix dropped (other prefixes kept).
        function attrsOf(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs || {})) out[k.startsWith('w:') ? k.slice(2) : k] = v;
            return out;
        }
        function wAttrs(o) {
            const out = {};
            for (const [k, v] of Object.entries(o || {})) if (v != null && typeof v !== 'object') out[k.includes(':') ? k : 'w:' + k] = String(v);
            return out;
        }
        function isToggle(el) {
            if (elementsOf(el).length) return false;
            const keys = Object.keys(el.attrs || {});
            return keys.length === 0 || (keys.length === 1 && keys[0] === 'w:val' && TOGGLE_VALUES.has(el.attrs['w:val']));
        }

        // A kind: parse an element into a value (undefined: not this shape), render it back.
        const KINDS = {
            toggle: { parse: (el) => (isToggle(el) ? core.readToggle(el) : undefined), render: (name, v) => core.writeToggle(name, v) },
            val: { parse: (el) => el.attrs['w:val'], render: (name, v) => xml.el(name, { 'w:val': String(v) }) },
            num: { parse: (el) => Number(el.attrs['w:val']), render: (name, v) => xml.el(name, { 'w:val': String(v) }) },
            // The value of the element's own-prefix `val` attribute (`w14:val`).
            pval: { parse: (el) => el.attrs[el.name.split(':')[0] + ':val'], render: (name, v) => xml.el(name, { [name.split(':')[0] + ':val']: String(v) }) },
            attrs: { parse: (el) => (elementsOf(el).length ? undefined : attrsOf(el)), render: (name, v) => xml.el(name, wAttrs(v)) },
            // A container of attribute-only children, each once: `{ top: {…}, … }`.
            group: {
                parse(el) {
                    const out = {};
                    if (Object.keys(el.attrs || {}).length) return undefined;
                    for (const c of elementsOf(el)) {
                        const key = c.name.startsWith('w:') ? c.name.slice(2) : c.name;
                        if (elementsOf(c).length || out[key] !== undefined) return undefined;
                        out[key] = attrsOf(c);
                    }
                    return out;
                },
                render: (name, v) => xml.el(name, {}, Object.entries(v).map(([k, a]) => xml.el(k.includes(':') ? k : 'w:' + k, wAttrs(a))))
            },
            // `<w:cols>`: its attributes and its `<w:col>` children.
            cols: {
                parse(el) {
                    const kids = elementsOf(el);
                    if (kids.some((c) => c.name !== 'w:col' || elementsOf(c).length)) return undefined;
                    return { ...attrsOf(el), col: kids.map(attrsOf) };
                },
                render(name, v) {
                    const { col, ...attrs } = v;
                    return xml.el(name, wAttrs(attrs), (col || []).map((a) => xml.el('w:col', wAttrs(a))));
                }
            },
            // A property change: its attributes and the former properties.
            rPrChange: changeKind('w:rPr', (el) => core.parseRunProperties(el), (v) => core.renderRunProperties(v), 'rPr'),
            pPrChange: changeKind('w:pPr', (el) => core.parseParagraphProperties(el), (v) => core.renderParagraphProperties(v), 'pPr'),
            section: {
                parse: (el) => (isEmpty(el) ? {} : structure.parseSection(el)),
                render: (name, v) => (Object.keys(v).length === 0 ? xml.el(name, {}) : structure.renderSection(v))
            },
            tblPrEx: {
                parse: (el) => (Object.keys(el.attrs || {}).length ? undefined : (isEmpty(el) ? {} : core.parseTableProperties(el))),
                render(name, v) {
                    const el = Object.keys(v).length ? core.renderTableProperties(v) : null;
                    return xml.el(name, {}, el ? el.children : []);
                }
            },
            // `<m:mathPr>`: each child's `m:val` (or true when it has none).
            mathPr: {
                parse(el) {
                    const out = {};
                    if (Object.keys(el.attrs || {}).length) return undefined;
                    for (const c of elementsOf(el)) {
                        const key = c.name.replace(/^m:/, '');
                        const keys = Object.keys(c.attrs || {});
                        if (!c.name.startsWith('m:') || elementsOf(c).length || out[key] !== undefined) return undefined;
                        if (keys.length === 0) out[key] = true;
                        else if (keys.length === 1 && keys[0] === 'm:val') out[key] = c.attrs['m:val'];
                        else return undefined;
                    }
                    return out;
                },
                render: (name, v) => xml.el(name, {}, Object.entries(v).map(([k, val]) => xml.el('m:' + k, val === true ? {} : { 'm:val': String(val) })))
            }
        };
        function changeKind(innerName, parseInner, renderInner, key) {
            return {
                parse(el) {
                    const kids = elementsOf(el);
                    if (kids.length !== 1 || kids[0].name !== innerName) return undefined;
                    return { ...attrsOf(el), [key]: isEmpty(kids[0]) ? {} : parseInner(kids[0]) };
                },
                render(name, v) {
                    const { [key]: inner, ...attrs } = v;
                    const innerEl = (inner && Object.keys(inner).length ? renderInner(inner) : null) || xml.el(innerName, {});
                    return xml.el(name, wAttrs(attrs), [innerEl]);
                }
            };
        }

        /**
         * A bag typer from a spec `[[elementName, kind, field], …]`; with
         * `toggles`, any other toggle element types into `toggles[name]`.
         */
        function bagOf(spec, toggles) {
            const byName = new Map(spec.map(([name, kind, field]) => [name, { kind: KINDS[kind], field: field || name.replace(/^w:/, '') }]));
            function type(bag) {
                if (!bag || !bag._extras) return bag;
                const remaining = [];
                for (const c of bag._extras) {
                    const s = c && c.type === 'element' ? byName.get(c.name) : undefined;
                    const v = s ? s.kind.parse(c) : undefined;
                    if (s && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))) bag[s.field] = v;
                    else if (!s && toggles && c && c.type === 'element' && c.name.startsWith('w:') && isToggle(c)) (bag.toggles = bag.toggles || {})[c.name.slice(2)] = core.readToggle(c);
                    else remaining.push(c);
                }
                if (remaining.length) bag._extras = remaining; else delete bag._extras;
                return bag;
            }
            function untype(bag) {
                if (!bag) return bag;
                const out = { ...bag };
                const extras = out._extras ? [...out._extras] : [];
                for (const [name, s] of byName) {
                    if (out[s.field] === undefined) continue;
                    const el = s.kind.render(name, out[s.field]);
                    if (el) extras.push(el);
                    delete out[s.field];
                }
                if (toggles && out.toggles) {
                    for (const [k, v] of Object.entries(out.toggles)) { const el = core.writeToggle('w:' + k, v); if (el) extras.push(el); }
                    delete out.toggles;
                }
                if (extras.length) out._extras = extras; else delete out._extras;
                return out;
            }
            return {
                hydrate: (bag) => core.hydrateLossless(bag, type, untype),
                dehydrate: untype
            };
        }

        const run = bagOf([
            ['w:rtl', 'toggle'], ['w:spacing', 'num'],
            ['w:del', 'attrs', 'markDel'], ['w:ins', 'attrs', 'markIns'],
            ['w:moveFrom', 'attrs', 'markMoveFrom'], ['w:moveTo', 'attrs', 'markMoveTo'],
            ['w:rPrChange', 'rPrChange']
        ]);
        const paragraph = bagOf([
            ['w:shd', 'attrs'], ['w:pBdr', 'group'], ['w:sectPr', 'section'], ['w:pPrChange', 'pPrChange']
        ]);
        const cell = bagOf([['w:shd', 'attrs']]);
        // A row's `trPr` is `wmlTableProperties`', which writes its own
        // fields before its `_extras`: a child typed here would move.
        const rowBag = bagOf([['w:tblPrEx', 'tblPrEx']]);
        const section = bagOf([
            ['w:docGrid', 'attrs'], ['w:cols', 'cols'], ['w:formProt', 'toggle'], ['w:pgNumType', 'attrs'],
            ['w:textDirection', 'val'], ['w:vAlign', 'val'], ['w:lnNumType', 'attrs'], ['w:pgBorders', 'attrs'],
            ['w:noEndnote', 'toggle'], ['w:bidi', 'toggle'], ['w:rtlGutter', 'toggle'], ['w:paperSrc', 'attrs'],
            ['w:titlePg', 'toggle'], ['w:footnotePr', 'group'], ['w:endnotePr', 'group']
        ]);
        const settings = bagOf([
            // Only names the core's settings sequence places (`w14:` / `w15:`
            // ones it does not list would be written out of their order).
            ['m:mathPr', 'mathPr', 'mathPr']
        ], true);
        const compat = bagOf([], true);

        function hydrateRow(row) {
            if (!row) return row;
            return rowBag.hydrate(row);
        }
        function dehydrateRow(row) {
            if (!row) return row;
            return rowBag.dehydrate(row);
        }
        function hydrateSettings(s) {
            if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
            settings.hydrate(s);
            if (s.compat && typeof s.compat === 'object') compat.hydrate(s.compat);
            return s;
        }
        function dehydrateSettings(s) {
            if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
            const out = settings.dehydrate(s);
            if (out.compat && typeof out.compat === 'object') out.compat = compat.dehydrate(out.compat);
            return out;
        }

        return {
            hydrateRunProperties: run.hydrate, dehydrateRunProperties: run.dehydrate,
            hydrateParagraphProperties: paragraph.hydrate, dehydrateParagraphProperties: paragraph.dehydrate,
            hydrateTcPr: cell.hydrate, dehydrateTcPr: cell.dehydrate,
            hydrateRow, dehydrateRow,
            hydrateSection: section.hydrate, dehydrateSection: section.dehydrate,
            hydrateSettings, dehydrateSettings
        };
    }
};
