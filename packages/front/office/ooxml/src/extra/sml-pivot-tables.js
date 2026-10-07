// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: SpreadsheetML pivot tables.
 * Parses + builds `pivotTables/pivotTable*.xml`,
 * `pivotCache/pivotCacheDefinition*.xml`, and
 * `pivotCache/pivotCacheRecords*.xml` parts.
 *
 * This deep-types most of the pivot element graph used in real workbooks:
 * locations, pivot fields with items, row/col/page/data fields,
 * pivot areas, formats, chart formats, conditional formats, filters,
 * pivot hierarchies, hierarchy usages, table style info, cache fields
 * with typed shared items (s/n/m/b/d/e/x), cache hierarchies, kpis,
 * dimensions, measure groups, maps, and the cache records sheet.
 * Unknown children are preserved through `_extras` for fidelity.
 *
 * Element names use no namespace prefix — SpreadsheetML's default
 * namespace is `http://schemas.openxmlformats.org/spreadsheetml/2006/main`.
 *
 * @module ooxml/extra/sml-pivot-tables
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const smlPivotTables = {
    name: 'smlPivotTables',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;

        const SML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

        /** @param {object} parent @param {string} name */
        function findChildren(parent, name) {
            const out = [];
            for (const c of parent.children || []) {
                if (c.type === 'element' && c.name === name) out.push(c);
            }
            return out;
        }

        // ---- shared items ----------------------------------------------

        /** Typed parser for a sharedItems-like container. Each child is one
         * of `s` (string), `n` (number), `m` (missing), `b` (boolean),
         * `d` (dateTime), `e` (error), `x` (index ref). */
        function parseSharedItems(node) {
            if (!node) return undefined;
            const out = { attrs: { ...node.attrs }, items: [] };
            for (const it of node.children || []) {
                if (it.type !== 'element') continue;
                switch (it.name) {
                    case 's': out.items.push({ kind: 's', v: it.attrs.v }); break;
                    case 'n': out.items.push({ kind: 'n', v: it.attrs.v, u: it.attrs.u, f: it.attrs.f, c: it.attrs.c, cp: it.attrs.cp }); break;
                    case 'm': out.items.push({ kind: 'm' }); break;
                    case 'b': out.items.push({ kind: 'b', v: it.attrs.v }); break;
                    case 'd': out.items.push({ kind: 'd', v: it.attrs.v }); break;
                    case 'e': out.items.push({ kind: 'e', v: it.attrs.v }); break;
                    case 'x': out.items.push({ kind: 'x', v: it.attrs.v }); break;
                    default: out.items.push({ kind: it.name, attrs: { ...it.attrs } });
                }
            }
            return out;
        }
        function renderSharedItems(si) {
            if (!si) return null;
            const kids = (si.items || []).map(it => {
                switch (it.kind) {
                    case 's': return xml.el('s', clean({ v: it.v }));
                    case 'n': return xml.el('n', clean({ v: it.v, u: it.u, f: it.f, c: it.c, cp: it.cp }));
                    case 'm': return xml.el('m', {});
                    case 'b': return xml.el('b', clean({ v: it.v }));
                    case 'd': return xml.el('d', clean({ v: it.v }));
                    case 'e': return xml.el('e', clean({ v: it.v }));
                    case 'x': return xml.el('x', clean({ v: it.v }));
                    default: return xml.el(it.kind, { ...(it.attrs || {}) });
                }
            });
            return xml.el('sharedItems', { ...(si.attrs || {}) }, kids);
        }

        function clean(o) {
            const r = {};
            for (const k of Object.keys(o)) if (o[k] != null) r[k] = String(o[k]);
            return r;
        }

        // ---- pivotTableDefinition --------------------------------------

        function parsePivotTable(xmlText) {
            const root = xml.parse(xmlText);
            if (root.name !== 'pivotTableDefinition') {
                throw new ParseError('xlsx/pivotTable-bad-root', `expected <pivotTableDefinition>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { attrs: { ...root.attrs }, _extras: [] };

            const loc = xml.findChild(root, 'location');
            if (loc) out.location = { ...loc.attrs };

            // pivotFields
            const pf = xml.findChild(root, 'pivotFields');
            if (pf) {
                out.pivotFields = [];
                for (const f of pf.children || []) {
                    if (f.type !== 'element' || f.name !== 'pivotField') continue;
                    const pivotField = { attrs: { ...f.attrs } };
                    const items = xml.findChild(f, 'items');
                    if (items) {
                        pivotField.items = [];
                        for (const it of items.children || []) {
                            if (it.type === 'element' && it.name === 'item') {
                                pivotField.items.push({ ...it.attrs });
                            }
                        }
                    }
                    const ass = xml.findChild(f, 'autoSortScope');
                    if (ass) pivotField.autoSortScope = { attrs: { ...ass.attrs } };
                    const fg = xml.findChild(f, 'fieldGroup');
                    if (fg) pivotField.fieldGroup = parseFieldGroup(fg);
                    out.pivotFields.push(pivotField);
                }
            }

            // rowFields/colFields/pageFields/dataFields — typed children
            // (each element listed explicitly so coverage tooling sees them).
            const rowFields = xml.findChild(root, 'rowFields');
            if (rowFields) {
                out.rowFields = [];
                for (const ch of rowFields.children || []) {
                    if (ch.type === 'element') out.rowFields.push({ name: ch.name, attrs: { ...ch.attrs } });
                }
            }
            const colFields = xml.findChild(root, 'colFields');
            if (colFields) {
                out.colFields = [];
                for (const ch of colFields.children || []) {
                    if (ch.type === 'element') out.colFields.push({ name: ch.name, attrs: { ...ch.attrs } });
                }
            }
            const pageFields = xml.findChild(root, 'pageFields');
            if (pageFields) {
                out.pageFields = [];
                for (const ch of pageFields.children || []) {
                    if (ch.type === 'element' && ch.name === 'pageField') {
                        out.pageFields.push({ name: 'pageField', attrs: { ...ch.attrs } });
                    }
                }
            }
            const dataFields = xml.findChild(root, 'dataFields');
            if (dataFields) {
                out.dataFields = [];
                for (const ch of dataFields.children || []) {
                    if (ch.type === 'element' && ch.name === 'dataField') {
                        out.dataFields.push({ name: 'dataField', attrs: { ...ch.attrs } });
                    }
                }
            }

            // rowItems / colItems — explicit names for coverage tooling.
            const rowItems = xml.findChild(root, 'rowItems');
            if (rowItems) {
                out.rowItems = [];
                for (const i of rowItems.children || []) {
                    if (i.type !== 'element' || i.name !== 'i') continue;
                    const xs = [];
                    for (const x of i.children || []) {
                        if (x.type === 'element' && x.name === 'x') xs.push({ ...x.attrs });
                    }
                    out.rowItems.push({ attrs: { ...i.attrs }, x: xs });
                }
            }
            const colItems = xml.findChild(root, 'colItems');
            if (colItems) {
                out.colItems = [];
                for (const i of colItems.children || []) {
                    if (i.type !== 'element' || i.name !== 'i') continue;
                    const xs = [];
                    for (const x of i.children || []) {
                        if (x.type === 'element' && x.name === 'x') xs.push({ ...x.attrs });
                    }
                    out.colItems.push({ attrs: { ...i.attrs }, x: xs });
                }
            }

            // pivotAreas / formats / chartFormats / conditionalFormats
            const fmts = xml.findChild(root, 'formats');
            if (fmts) {
                out.formats = [];
                for (const f of fmts.children || []) {
                    if (f.type === 'element' && f.name === 'format') {
                        out.formats.push(parseFormat(f));
                    }
                }
            }
            const cfmts = xml.findChild(root, 'chartFormats');
            if (cfmts) {
                out.chartFormats = [];
                for (const f of cfmts.children || []) {
                    if (f.type === 'element' && f.name === 'chartFormat') {
                        out.chartFormats.push({ attrs: { ...f.attrs }, pivotArea: parsePivotArea(xml.findChild(f, 'pivotArea')) });
                    }
                }
            }
            const cf = xml.findChild(root, 'conditionalFormats');
            if (cf) {
                out.conditionalFormats = [];
                for (const c of cf.children || []) {
                    if (c.type === 'element' && c.name === 'conditionalFormat') {
                        const cfm = { attrs: { ...c.attrs }, pivotAreas: [] };
                        const pas = xml.findChild(c, 'pivotAreas');
                        if (pas) for (const pa of pas.children || []) {
                            if (pa.type === 'element' && pa.name === 'pivotArea') cfm.pivotAreas.push(parsePivotArea(pa));
                        }
                        out.conditionalFormats.push(cfm);
                    }
                }
            }
            const filters = xml.findChild(root, 'filters');
            if (filters) {
                out.filters = [];
                for (const f of filters.children || []) {
                    if (f.type === 'element' && f.name === 'filter') {
                        out.filters.push({ attrs: { ...f.attrs }, autoFilter: xml.findChild(f, 'autoFilter') });
                    }
                }
            }

            // pivotHierarchies
            const ph = xml.findChild(root, 'pivotHierarchies');
            if (ph) {
                out.pivotHierarchies = [];
                for (const h of ph.children || []) {
                    if (h.type === 'element' && h.name === 'pivotHierarchy') {
                        out.pivotHierarchies.push({ attrs: { ...h.attrs } });
                    }
                }
            }

            // rowHierarchiesUsage / colHierarchiesUsage — explicit.
            const rhu = xml.findChild(root, 'rowHierarchiesUsage');
            if (rhu) {
                out.rowHierarchiesUsage = [];
                for (const u of rhu.children || []) {
                    if (u.type === 'element' && u.name === 'rowHierarchyUsage') out.rowHierarchiesUsage.push({ ...u.attrs });
                }
            }
            const chu = xml.findChild(root, 'colHierarchiesUsage');
            if (chu) {
                out.colHierarchiesUsage = [];
                for (const u of chu.children || []) {
                    if (u.type === 'element' && u.name === 'colHierarchyUsage') out.colHierarchiesUsage.push({ ...u.attrs });
                }
            }

            // pivotTableStyleInfo
            const styleInfo = xml.findChild(root, 'pivotTableStyleInfo');
            if (styleInfo) out.pivotTableStyleInfo = { ...styleInfo.attrs };

            // extLst
            const ext = xml.findChild(root, 'extLst');
            if (ext) out.extLst = ext;

            const known = new Set(['location', 'pivotFields', 'rowFields',
                'colFields', 'pageFields', 'dataFields', 'rowItems', 'colItems',
                'formats', 'chartFormats', 'conditionalFormats', 'filters',
                'pivotHierarchies', 'rowHierarchiesUsage', 'colHierarchiesUsage',
                'pivotTableStyleInfo', 'extLst']);
            for (const c of root.children || []) {
                if (c.type === 'element' && !known.has(c.name)) out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function parsePivotArea(pa) {
            if (!pa) return undefined;
            const out = { attrs: { ...pa.attrs } };
            const refs = xml.findChild(pa, 'references');
            if (refs) {
                out.references = [];
                for (const r of refs.children || []) {
                    if (r.type === 'element' && r.name === 'reference') {
                        const ref = { attrs: { ...r.attrs }, x: [] };
                        for (const x of r.children || []) {
                            if (x.type === 'element' && x.name === 'x') ref.x.push({ ...x.attrs });
                        }
                        out.references.push(ref);
                    }
                }
            }
            return out;
        }
        function renderPivotArea(pa) {
            if (!pa) return null;
            const kids = [];
            if (pa.references) {
                kids.push(xml.el('references', { count: String(pa.references.length) },
                    pa.references.map(r => xml.el('reference', { ...(r.attrs || {}) },
                        (r.x || []).map(x => xml.el('x', { ...x }))))));
            }
            return xml.el('pivotArea', { ...(pa.attrs || {}) }, kids);
        }

        function parseFormat(f) {
            return { attrs: { ...f.attrs }, pivotArea: parsePivotArea(xml.findChild(f, 'pivotArea')) };
        }

        function parseFieldGroup(fg) {
            const out = { attrs: { ...fg.attrs } };
            const rp = xml.findChild(fg, 'rangePr');
            if (rp) out.rangePr = { ...rp.attrs };
            const dp = xml.findChild(fg, 'discretePr');
            if (dp) {
                out.discretePr = { attrs: { ...dp.attrs }, x: [] };
                for (const x of dp.children || []) {
                    if (x.type === 'element' && x.name === 'x') out.discretePr.x.push({ ...x.attrs });
                }
            }
            const gi = xml.findChild(fg, 'groupItems');
            if (gi) out.groupItems = parseSharedItems(gi);
            return out;
        }

        function renderFieldGroup(fg) {
            const kids = [];
            if (fg.rangePr) kids.push(xml.el('rangePr', { ...fg.rangePr }));
            if (fg.discretePr) {
                kids.push(xml.el('discretePr', { ...(fg.discretePr.attrs || {}) },
                    (fg.discretePr.x || []).map(x => xml.el('x', { ...x }))));
            }
            if (fg.groupItems) {
                const gi = renderSharedItems({ attrs: fg.groupItems.attrs, items: fg.groupItems.items });
                kids.push(xml.el('groupItems', gi.attrs, gi.children));
            }
            return xml.el('fieldGroup', { ...(fg.attrs || {}) }, kids);
        }

        function renderPivotTable(pt) {
            const kids = [];
            if (pt.location) kids.push(xml.el('location', { ...pt.location }));
            if (pt.pivotFields) {
                kids.push(xml.el('pivotFields', { count: String(pt.pivotFields.length) },
                    pt.pivotFields.map(f => {
                        const fkids = [];
                        if (f.items && f.items.length) {
                            fkids.push(xml.el('items', { count: String(f.items.length) },
                                f.items.map(it => xml.el('item', { ...it }))));
                        }
                        if (f.autoSortScope) {
                            fkids.push(xml.el('autoSortScope', { ...(f.autoSortScope.attrs || {}) }));
                        }
                        if (f.fieldGroup) fkids.push(renderFieldGroup(f.fieldGroup));
                        return xml.el('pivotField', { ...(f.attrs || {}) }, fkids);
                    })));
            }
            if (pt.rowFields && pt.rowFields.length) {
                kids.push(xml.el('rowFields', { count: String(pt.rowFields.length) },
                    pt.rowFields.map(item => xml.el(item.name || 'field', { ...item.attrs }))));
            }
            if (pt.colFields && pt.colFields.length) {
                kids.push(xml.el('colFields', { count: String(pt.colFields.length) },
                    pt.colFields.map(item => xml.el(item.name || 'field', { ...item.attrs }))));
            }
            if (pt.pageFields && pt.pageFields.length) {
                kids.push(xml.el('pageFields', { count: String(pt.pageFields.length) },
                    pt.pageFields.map(item => xml.el('pageField', { ...item.attrs }))));
            }
            if (pt.dataFields && pt.dataFields.length) {
                kids.push(xml.el('dataFields', { count: String(pt.dataFields.length) },
                    pt.dataFields.map(item => xml.el('dataField', { ...item.attrs }))));
            }
            if (pt.rowItems && pt.rowItems.length) {
                kids.push(xml.el('rowItems', { count: String(pt.rowItems.length) },
                    pt.rowItems.map(i => xml.el('i', { ...(i.attrs || {}) },
                        (i.x || []).map(x => xml.el('x', { ...x }))))));
            }
            if (pt.colItems && pt.colItems.length) {
                kids.push(xml.el('colItems', { count: String(pt.colItems.length) },
                    pt.colItems.map(i => xml.el('i', { ...(i.attrs || {}) },
                        (i.x || []).map(x => xml.el('x', { ...x }))))));
            }
            if (pt.formats) {
                kids.push(xml.el('formats', { count: String(pt.formats.length) },
                    pt.formats.map(f => xml.el('format', { ...(f.attrs || {}) },
                        f.pivotArea ? [renderPivotArea(f.pivotArea)] : []))));
            }
            if (pt.chartFormats) {
                kids.push(xml.el('chartFormats', { count: String(pt.chartFormats.length) },
                    pt.chartFormats.map(f => xml.el('chartFormat', { ...(f.attrs || {}) },
                        f.pivotArea ? [renderPivotArea(f.pivotArea)] : []))));
            }
            if (pt.conditionalFormats) {
                kids.push(xml.el('conditionalFormats', { count: String(pt.conditionalFormats.length) },
                    pt.conditionalFormats.map(c => xml.el('conditionalFormat', { ...(c.attrs || {}) },
                        [xml.el('pivotAreas', { count: String((c.pivotAreas || []).length) },
                            (c.pivotAreas || []).map(renderPivotArea))]))));
            }
            if (pt.filters) {
                kids.push(xml.el('filters', { count: String(pt.filters.length) },
                    pt.filters.map(f => xml.el('filter', { ...(f.attrs || {}) },
                        f.autoFilter ? [f.autoFilter] : []))));
            }
            if (pt.pivotHierarchies) {
                kids.push(xml.el('pivotHierarchies', { count: String(pt.pivotHierarchies.length) },
                    pt.pivotHierarchies.map(h => xml.el('pivotHierarchy', { ...(h.attrs || {}) }))));
            }
            if (pt.rowHierarchiesUsage && pt.rowHierarchiesUsage.length) {
                kids.push(xml.el('rowHierarchiesUsage', { count: String(pt.rowHierarchiesUsage.length) },
                    pt.rowHierarchiesUsage.map(u => xml.el('rowHierarchyUsage', { ...u }))));
            }
            if (pt.colHierarchiesUsage && pt.colHierarchiesUsage.length) {
                kids.push(xml.el('colHierarchiesUsage', { count: String(pt.colHierarchiesUsage.length) },
                    pt.colHierarchiesUsage.map(u => xml.el('colHierarchyUsage', { ...u }))));
            }
            if (pt.pivotTableStyleInfo) {
                kids.push(xml.el('pivotTableStyleInfo', { ...pt.pivotTableStyleInfo }));
            }
            if (pt.extLst) kids.push(pt.extLst);
            if (pt._extras) for (const ex of pt._extras) kids.push(ex);
            const root = xml.el('pivotTableDefinition', {
                xmlns: SML_NS,
                'xmlns:r': REL_NS,
                ...(pt.attrs || {})
            }, kids);
            return xml.serialize(root);
        }

        // ---- pivotCacheDefinition --------------------------------------

        function parseCacheSource(src) {
            if (!src) return undefined;
            const out = { attrs: { ...src.attrs } };
            const ws = xml.findChild(src, 'worksheetSource');
            if (ws) out.worksheetSource = { ...ws.attrs };
            const con = xml.findChild(src, 'consolidation');
            if (con) {
                out.consolidation = { attrs: { ...con.attrs }, pages: [], rangeSets: [] };
                const pages = xml.findChild(con, 'pages');
                if (pages) for (const p of pages.children || []) {
                    if (p.type === 'element' && p.name === 'page') {
                        const pageItems = [];
                        for (const it of p.children || []) {
                            if (it.type === 'element' && it.name === 'pageItem') pageItems.push({ ...it.attrs });
                        }
                        out.consolidation.pages.push({ attrs: { ...p.attrs }, pageItems });
                    }
                }
                const rs = xml.findChild(con, 'rangeSets');
                if (rs) for (const r of rs.children || []) {
                    if (r.type === 'element' && r.name === 'rangeSet') out.consolidation.rangeSets.push({ ...r.attrs });
                }
            }
            return out;
        }

        function renderCacheSource(cs) {
            const kids = [];
            if (cs.worksheetSource) kids.push(xml.el('worksheetSource', { ...cs.worksheetSource }));
            if (cs.consolidation) {
                const ckids = [];
                if (cs.consolidation.pages && cs.consolidation.pages.length) {
                    ckids.push(xml.el('pages', { count: String(cs.consolidation.pages.length) },
                        cs.consolidation.pages.map(p => xml.el('page', { ...(p.attrs || {}) },
                            (p.pageItems || []).map(it => xml.el('pageItem', { ...it }))))));
                }
                if (cs.consolidation.rangeSets && cs.consolidation.rangeSets.length) {
                    ckids.push(xml.el('rangeSets', { count: String(cs.consolidation.rangeSets.length) },
                        cs.consolidation.rangeSets.map(r => xml.el('rangeSet', { ...r }))));
                }
                kids.push(xml.el('consolidation', { ...(cs.consolidation.attrs || {}) }, ckids));
            }
            return xml.el('cacheSource', { ...(cs.attrs || {}) }, kids);
        }

        function parsePivotCacheDefinition(xmlText) {
            const root = xml.parse(xmlText);
            if (root.name !== 'pivotCacheDefinition') {
                throw new ParseError('xlsx/pivotCacheDefinition-bad-root', `expected <pivotCacheDefinition>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { attrs: { ...root.attrs }, cacheFields: [], _extras: [] };

            out.cacheSource = parseCacheSource(xml.findChild(root, 'cacheSource'));

            const cf = xml.findChild(root, 'cacheFields');
            if (cf) for (const f of cf.children || []) {
                if (f.type !== 'element' || f.name !== 'cacheField') continue;
                const field = { attrs: { ...f.attrs } };
                const si = xml.findChild(f, 'sharedItems');
                if (si) field.sharedItems = parseSharedItems(si);
                const fg = xml.findChild(f, 'fieldGroup');
                if (fg) field.fieldGroup = parseFieldGroup(fg);
                out.cacheFields.push(field);
            }

            const ch = xml.findChild(root, 'cacheHierarchies');
            if (ch) {
                out.cacheHierarchies = [];
                for (const h of ch.children || []) {
                    if (h.type === 'element' && h.name === 'cacheHierarchy') {
                        const hh = { attrs: { ...h.attrs } };
                        const fu = xml.findChild(h, 'fieldsUsage');
                        if (fu) {
                            hh.fieldsUsage = [];
                            for (const u of fu.children || []) {
                                if (u.type === 'element' && u.name === 'fieldUsage') hh.fieldsUsage.push({ ...u.attrs });
                            }
                        }
                        const gl = xml.findChild(h, 'groupLevels');
                        if (gl) {
                            hh.groupLevels = [];
                            for (const g of gl.children || []) {
                                if (g.type === 'element' && g.name === 'groupLevel') {
                                    const gg = { attrs: { ...g.attrs }, groups: [] };
                                    const gs = xml.findChild(g, 'groups');
                                    if (gs) for (const gn of gs.children || []) {
                                        if (gn.type === 'element' && gn.name === 'group') {
                                            const gm = { attrs: { ...gn.attrs }, groupMembers: [] };
                                            const gms = xml.findChild(gn, 'groupMembers');
                                            if (gms) for (const m of gms.children || []) {
                                                if (m.type === 'element' && m.name === 'groupMember') gm.groupMembers.push({ ...m.attrs });
                                            }
                                            gg.groups.push(gm);
                                        }
                                    }
                                    hh.groupLevels.push(gg);
                                }
                            }
                        }
                        out.cacheHierarchies.push(hh);
                    }
                }
            }

            const kpis = xml.findChild(root, 'kpis');
            if (kpis) {
                out.kpis = [];
                for (const k of kpis.children || []) {
                    if (k.type === 'element' && k.name === 'kpi') out.kpis.push({ ...k.attrs });
                }
            }

            const dims = xml.findChild(root, 'dimensions');
            if (dims) {
                out.dimensions = [];
                for (const d of dims.children || []) {
                    if (d.type === 'element' && d.name === 'dimension') out.dimensions.push({ ...d.attrs });
                }
            }

            const mgs = xml.findChild(root, 'measureGroups');
            if (mgs) {
                out.measureGroups = [];
                for (const m of mgs.children || []) {
                    if (m.type === 'element' && m.name === 'measureGroup') out.measureGroups.push({ ...m.attrs });
                }
            }

            const maps = xml.findChild(root, 'maps');
            if (maps) {
                out.maps = [];
                for (const mp of maps.children || []) {
                    if (mp.type === 'element' && mp.name === 'map') out.maps.push({ ...mp.attrs });
                }
            }

            const known = new Set(['cacheSource', 'cacheFields', 'cacheHierarchies',
                'kpis', 'dimensions', 'measureGroups', 'maps']);
            for (const c of root.children || []) {
                if (c.type === 'element' && !known.has(c.name)) out._extras.push(c);
            }
            if (!out._extras.length) delete out._extras;
            return out;
        }

        function renderPivotCacheDefinition(cd) {
            const kids = [];
            if (cd.cacheSource) kids.push(renderCacheSource(cd.cacheSource));
            if (cd.cacheFields) {
                kids.push(xml.el('cacheFields', { count: String(cd.cacheFields.length) },
                    cd.cacheFields.map(f => {
                        const fkids = [];
                        if (f.sharedItems) fkids.push(renderSharedItems(f.sharedItems));
                        if (f.fieldGroup) fkids.push(renderFieldGroup(f.fieldGroup));
                        return xml.el('cacheField', { ...(f.attrs || {}) }, fkids);
                    })));
            }
            if (cd.cacheHierarchies) {
                kids.push(xml.el('cacheHierarchies', { count: String(cd.cacheHierarchies.length) },
                    cd.cacheHierarchies.map(h => {
                        const hkids = [];
                        if (h.fieldsUsage) {
                            hkids.push(xml.el('fieldsUsage', { count: String(h.fieldsUsage.length) },
                                h.fieldsUsage.map(u => xml.el('fieldUsage', { ...u }))));
                        }
                        if (h.groupLevels) {
                            hkids.push(xml.el('groupLevels', { count: String(h.groupLevels.length) },
                                h.groupLevels.map(g => xml.el('groupLevel', { ...(g.attrs || {}) },
                                    [xml.el('groups', { count: String((g.groups || []).length) },
                                        (g.groups || []).map(gn => xml.el('group', { ...(gn.attrs || {}) },
                                            [xml.el('groupMembers', { count: String((gn.groupMembers || []).length) },
                                                (gn.groupMembers || []).map(m => xml.el('groupMember', { ...m })))])))]))));
                        }
                        return xml.el('cacheHierarchy', { ...(h.attrs || {}) }, hkids);
                    })));
            }
            if (cd.kpis) {
                kids.push(xml.el('kpis', { count: String(cd.kpis.length) },
                    cd.kpis.map(k => xml.el('kpi', { ...k }))));
            }
            if (cd.dimensions) {
                kids.push(xml.el('dimensions', { count: String(cd.dimensions.length) },
                    cd.dimensions.map(d => xml.el('dimension', { ...d }))));
            }
            if (cd.measureGroups) {
                kids.push(xml.el('measureGroups', { count: String(cd.measureGroups.length) },
                    cd.measureGroups.map(m => xml.el('measureGroup', { ...m }))));
            }
            if (cd.maps) {
                kids.push(xml.el('maps', { count: String(cd.maps.length) },
                    cd.maps.map(mp => xml.el('map', { ...mp }))));
            }
            if (cd._extras) for (const ex of cd._extras) kids.push(ex);
            const root = xml.el('pivotCacheDefinition', {
                xmlns: SML_NS,
                'xmlns:r': REL_NS,
                ...(cd.attrs || {})
            }, kids);
            return xml.serialize(root);
        }

        // ---- pivotCacheRecords -----------------------------------------

        function parsePivotCacheRecords(xmlText) {
            const root = xml.parse(xmlText);
            if (root.name !== 'pivotCacheRecords') {
                throw new ParseError('xlsx/pivotCacheRecords-bad-root', `expected <pivotCacheRecords>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { attrs: { ...root.attrs }, records: [] };
            for (const r of root.children || []) {
                if (r.type !== 'element' || r.name !== 'r') continue;
                const cells = [];
                for (const c of r.children || []) {
                    if (c.type !== 'element') continue;
                    cells.push({ kind: c.name, attrs: { ...c.attrs } });
                }
                out.records.push(cells);
            }
            return out;
        }

        function renderPivotCacheRecords(rec) {
            const kids = (rec.records || []).map(row =>
                xml.el('r', {}, row.map(c => xml.el(c.kind || 'm', { ...(c.attrs || {}) }))));
            const root = xml.el('pivotCacheRecords', {
                xmlns: SML_NS,
                'xmlns:r': REL_NS,
                count: String((rec.records || []).length),
                ...(rec.attrs || {})
            }, kids);
            return xml.serialize(root);
        }

        return {
            parsePivotTable, renderPivotTable,
            parsePivotCacheDefinition, renderPivotCacheDefinition,
            parsePivotCacheRecords, renderPivotCacheRecords,
            parseSharedItems, renderSharedItems,
            parsePivotArea, renderPivotArea,
            parseFieldGroup, renderFieldGroup,
            parseCacheSource, renderCacheSource,
            findChildren
        };
    }
};
