// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: the xlsx parts the core's read leaves unmodelled —
 * the calculation chain, the external links, the XML maps, the
 * connections, the query tables, and the pivot caches and tables (through
 * `smlPivotTables`). An xlsx walker extension registered by
 * `xlsxFullBundle`, on the package hooks:
 *
 * - `hydratePackage(workbook, ctx)` runs inside `xlsx.read`'s pass, before
 *   the other hooks. Each part is read only when it is written back as read
 *   (its re-rendered root `sameElement` to its source, namespace
 *   declarations aside) in the Transitional namespace, and its
 *   relationships are ones the write rebuilds. A part read is consumed: it
 *   leaves `unmodelledParts`.
 * - `dehydratePackage(workbook, ctx)` runs in `xlsx.write` after the core
 *   has built its package: it writes those parts, their relationships, the
 *   workbook's `externalReferences` and their content types.
 *
 * The calculation chain names its sheets by id; the model holds each
 * entry's sheet position, and the write names the ids the core writes. It
 * keeps only the entries whose cell holds a formula in the written model,
 * so an edited workbook never names a cell without one.
 *
 * @module ooxml/extra/sml-package-parts
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { opcPackage } from '../opc/package.js';
import { opcRelationships } from '../opc/relationships.js';
import { docxProperties } from '../docx/properties.js';
import { ooxmlShared } from '../_shared/index.js';
import { smlPivotTables } from './sml-pivot-tables.js';

export const smlPackageParts = {
    name: 'smlPackageParts',
    dependencies: ['xml', 'opcPackage', 'opcRelationships', 'docxProperties', 'ooxmlShared', 'smlPivotTables'],
    deps: [xml, opcPackage, opcRelationships, docxProperties, ooxmlShared, smlPivotTables],

    factory(xml, opc, relsMod, props, shared, piv) {
        const { NS, decodeText, encodeText } = shared;
        const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        const R_NS = NS.R;
        const REL = {
            CALC_CHAIN: R_NS + '/calcChain',
            EXTERNAL_LINK: R_NS + '/externalLink',
            EXTERNAL_LINK_PATH: R_NS + '/externalLinkPath',
            XML_MAPS: R_NS + '/xmlMaps',
            CONNECTIONS: R_NS + '/connections',
            QUERY_TABLE: R_NS + '/queryTable',
            PIVOT_DEF: R_NS + '/pivotCacheDefinition',
            PIVOT_RECORDS: R_NS + '/pivotCacheRecords',
            PIVOT_TABLE: R_NS + '/pivotTable'
        };
        const CTP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
        const CT = {
            CALC_CHAIN: CTP + 'calcChain+xml',
            EXTERNAL_LINK: CTP + 'externalLink+xml',
            XML_MAPS: 'application/xml',
            CONNECTIONS: CTP + 'connections+xml',
            QUERY_TABLE: CTP + 'queryTable+xml',
            PIVOT_DEF: CTP + 'pivotCacheDefinition+xml',
            PIVOT_RECORDS: CTP + 'pivotCacheRecords+xml',
            PIVOT_TABLE: CTP + 'pivotTable+xml'
        };
        const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const elements = (n) => ((n && n.children) || []).filter(c => c && c.type === 'element');
        const textOf = (n) => ((n && n.children) || []).map(c => (c && c.type === 'text' ? c.value : '')).join('');

        // --- Attributes, typed by a spec: [attribute, field, kind] ---

        const BOOL = { 1: true, true: true, 0: false, false: false };
        function parseAttrs(el, spec, out = {}) {
            const known = new Map(spec.map(s => [s[0], s]));
            for (const [k, v] of Object.entries(el.attrs || {})) {
                const s = known.get(k);
                if (!s) return undefined;
                const [, field, kind] = s;
                if (kind === 'int') {
                    if (!/^-?\d+$/.test(v)) return undefined;
                    out[field] = Number(v);
                } else if (kind === 'bool' || kind === 'word') {
                    if (!(v in BOOL)) return undefined;
                    out[field] = BOOL[v];
                } else out[field] = v;
            }
            return out;
        }
        function renderAttrs(obj, spec) {
            const a = {};
            for (const [attr, field, kind] of spec) {
                const v = obj[field];
                if (v == null) continue;
                if (kind === 'bool') a[attr] = v ? '1' : '0';
                else if (kind === 'word') a[attr] = v ? 'true' : 'false';
                else a[attr] = String(v);
            }
            return a;
        }

        // The root's namespace declarations and mc:Ignorable (the default
        // namespace aside: the write is Transitional).
        function nsAttrs(root) {
            const out = {};
            for (const [k, v] of Object.entries(root.attrs || {})) {
                if (k.startsWith('xmlns:') || k === 'mc:Ignorable') out[k] = v;
            }
            return out;
        }
        const withNs = (model, attrs) => ({ xmlns: SS_NS, ...(isPlain(model.ns) ? model.ns : {}), ...attrs });

        // --- The guard ---

        const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {})
            .filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:') && k !== 'mc:Ignorable')) });
        const same = (a, b) => props.sameElement(noNs(a), noNs(b));
        function rootOf(parts, name) {
            const bytes = parts[name];
            if (!bytes) return null;
            try {
                const root = xml.parse(decodeText(bytes));
                return root.attrs && root.attrs.xmlns === SS_NS ? root : null;
            } catch { return null; }
        }
        // parse(root) written back by render(model) as read, or undefined.
        function readBack(root, parse, render) {
            if (!root) return undefined;
            let model;
            try { model = parse(root); } catch { return undefined; }
            if (model === undefined) return undefined;
            return same(render(model), root) ? model : undefined;
        }
        const relsOf = (ctx, part) => ctx.rels[part] || [];

        // --- The calculation chain ---

        const CALC_CELL = [['r', 'ref', 'str'], ['i', 'i', 'int'], ['s', 'childChain', 'bool'],
            ['l', 'newLevel', 'bool'], ['t', 'newThread', 'bool'], ['a', 'array', 'bool']];
        function parseCalcChain(root, sheetIds) {
            if (Object.keys(root.attrs).some(k => k !== 'xmlns' && !k.startsWith('xmlns:') && k !== 'mc:Ignorable')) return undefined;
            const cells = [];
            let sheet;
            for (const c of elements(root)) {
                if (c.name !== 'c') return undefined;
                const a = parseAttrs(c, CALC_CELL);
                if (!a || a.ref == null || elements(c).length) return undefined;
                if (a.i != null) {
                    sheet = sheetIds.indexOf(String(a.i));
                    if (sheet < 0) return undefined;
                    a.sheetGiven = true;
                } else if (sheet === undefined) return undefined;
                delete a.i;
                a.sheet = sheet;
                cells.push(a);
            }
            return { ns: nsAttrs(root), cells };
        }
        // `idOf(position)` names a sheet; `i` is written where the source
        // had it or where the sheet changes.
        function renderCalcChain(model, idOf) {
            let prev;
            const kids = model.cells.map((c, n) => {
                const a = renderAttrs(c, CALC_CELL.filter(s => s[0] !== 'i'));
                const id = idOf(c.sheet);
                if (c.sheetGiven || n === 0 || c.sheet !== prev) a.i = String(id);
                prev = c.sheet;
                return xml.el('c', { r: a.r, ...(a.i != null ? { i: a.i } : {}), ...a });
            });
            return xml.el('calcChain', withNs(model, {}), kids);
        }

        // A1 → [row, col], 0-based.
        function refAt(ref) {
            const m = /^([A-Z]+)(\d+)$/.exec(String(ref));
            if (!m) return null;
            let col = 0;
            for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
            return [Number(m[2]) - 1, col - 1];
        }
        // The row a 0-based row number names: by `rowNumbers` when the sheet
        // has them (its rows are dense), else by index.
        function rowAt(sheet, n) {
            if (!sheet || !Array.isArray(sheet.rows)) return null;
            if (!Array.isArray(sheet.rowNumbers)) return sheet.rows[n];
            const i = sheet.rowNumbers.indexOf(n + 1);
            return i < 0 ? null : sheet.rows[i];
        }
        // The array formulas' ranges of a sheet, [r0, c0, r1, c1] 0-based.
        const arrayRanges = new WeakMap();
        function rangesOf(sheet) {
            if (arrayRanges.has(sheet)) return arrayRanges.get(sheet);
            const out = [];
            for (const row of Array.isArray(sheet.rows) ? sheet.rows : []) {
                for (const cell of Array.isArray(row) ? row : []) {
                    if (!isPlain(cell) || cell.formulaType !== 'array' || typeof cell.formulaRef !== 'string') continue;
                    const [a, b] = cell.formulaRef.split(':');
                    const p = refAt(a), q = refAt(b || a);
                    if (p && q) out.push([p[0], p[1], q[0], q[1]]);
                }
            }
            arrayRanges.set(sheet, out);
            return out;
        }
        // A cell holds a formula: its own, or it lies in an array formula's
        // range (whose cells carry no <f> of their own).
        function holdsFormula(sheet, ref) {
            const at = refAt(ref);
            if (!at || !isPlain(sheet)) return false;
            const row = rowAt(sheet, at[0]);
            const cell = Array.isArray(row) ? row[at[1]] : null;
            if (isPlain(cell) && cell.formula != null && (cell.formula !== '' || cell.formulaType != null)) return true;
            return rangesOf(sheet).some(([r0, c0, r1, c1]) => at[0] >= r0 && at[0] <= r1 && at[1] >= c0 && at[1] <= c1);
        }

        // --- External links ---

        const DEFINED_NAME = [['name', 'name', 'str'], ['refersTo', 'refersTo', 'str'], ['sheetId', 'sheetId', 'int']];
        const SHEET_DATA = [['sheetId', 'sheetId', 'int'], ['refreshError', 'refreshError', 'bool']];
        const EXT_CELL = [['r', 'ref', 'str'], ['t', 't', 'str'], ['vm', 'vm', 'int']];
        function parseExternalLink(root, rId) {
            if (Object.keys(noNs(root).attrs).length) return undefined;
            const kids = elements(root);
            if (kids.length !== 1 || kids[0].name !== 'externalBook') return undefined;
            const bookEl = kids[0];
            const bookNs = {};
            for (const [k, v] of Object.entries(bookEl.attrs || {})) {
                if (k === 'r:id') { if (v !== rId) return undefined; } else if (k.startsWith('xmlns:')) bookNs[k] = v;
                else return undefined;
            }
            const book = {};
            if (Object.keys(bookNs).length) book.ns = bookNs;
            for (const c of elements(bookEl)) {
                if (Object.keys(c.attrs || {}).length) return undefined;
                if (c.name === 'sheetNames' && !book.sheetNames) {
                    book.sheetNames = [];
                    for (const s of elements(c)) {
                        if (s.name !== 'sheetName' || Object.keys(s.attrs).join() !== 'val') return undefined;
                        book.sheetNames.push(s.attrs.val);
                    }
                } else if (c.name === 'definedNames' && !book.definedNames) {
                    book.definedNames = [];
                    for (const d of elements(c)) {
                        const v = d.name === 'definedName' && !elements(d).length ? parseAttrs(d, DEFINED_NAME) : undefined;
                        if (!v) return undefined;
                        book.definedNames.push(v);
                    }
                } else if (c.name === 'sheetDataSet' && !book.sheetDataSet) {
                    book.sheetDataSet = [];
                    for (const sd of elements(c)) {
                        const v = sd.name === 'sheetData' ? parseAttrs(sd, SHEET_DATA) : undefined;
                        if (!v) return undefined;
                        v.rows = [];
                        for (const r of elements(sd)) {
                            if (r.name !== 'row' || Object.keys(r.attrs).join() !== 'r') return undefined;
                            const row = { r: Number(r.attrs.r), cells: [] };
                            for (const cell of elements(r)) {
                                const cv = cell.name === 'cell' ? parseAttrs(cell, EXT_CELL) : undefined;
                                if (!cv) return undefined;
                                const vs = elements(cell);
                                if (vs.length > 1 || (vs.length && (vs[0].name !== 'v' || Object.keys(vs[0].attrs).length))) return undefined;
                                if (vs.length) cv.v = textOf(vs[0]);
                                row.cells.push(cv);
                            }
                            v.rows.push(row);
                        }
                        book.sheetDataSet.push(v);
                    }
                } else return undefined;
            }
            return { ns: nsAttrs(root), book };
        }
        function renderExternalLink(model, rId) {
            const b = model.book || {};
            const kids = [];
            if (Array.isArray(b.sheetNames)) kids.push(xml.el('sheetNames', {}, b.sheetNames.map(n => xml.el('sheetName', { val: String(n) }))));
            if (Array.isArray(b.definedNames)) kids.push(xml.el('definedNames', {}, b.definedNames.map(d => xml.el('definedName', renderAttrs(d, DEFINED_NAME)))));
            if (Array.isArray(b.sheetDataSet)) {
                kids.push(xml.el('sheetDataSet', {}, b.sheetDataSet.map(sd => xml.el('sheetData', renderAttrs(sd, SHEET_DATA),
                    (sd.rows || []).map(r => xml.el('row', { r: String(r.r) }, (r.cells || []).map(c =>
                        xml.el('cell', renderAttrs(c, EXT_CELL), c.v != null ? [xml.el('v', {}, [xml.text(String(c.v))])] : []))))))));
            }
            const book = xml.el('externalBook', { ...(isPlain(b.ns) ? b.ns : {}), 'r:id': rId }, kids);
            return xml.el('externalLink', withNs(model, {}), [book]);
        }

        // --- XML maps ---

        const SCHEMA = [['ID', 'id', 'str'], ['SchemaRef', 'schemaRef', 'str'], ['Namespace', 'namespace', 'str']];
        const MAP = [['ID', 'id', 'int'], ['Name', 'name', 'str'], ['RootElement', 'rootElement', 'str'],
            ['SchemaID', 'schemaId', 'str'], ['ShowImportExportValidationErrors', 'showImportExportValidationErrors', 'word'],
            ['AutoFit', 'autoFit', 'word'], ['Append', 'append', 'word'], ['PreserveSortAFLayout', 'preserveSortAFLayout', 'word'],
            ['PreserveFormat', 'preserveFormat', 'word']];
        function parseXmlMaps(root) {
            if (root.name !== 'MapInfo') return undefined;
            const top = parseAttrs(noNs(root), [['SelectionNamespaces', 'selectionNamespaces', 'str']]);
            if (!top) return undefined;
            const out = { ns: nsAttrs(root), ...top, schemas: [], maps: [] };
            for (const c of elements(root)) {
                if (c.name === 'Schema') {
                    const s = parseAttrs(c, SCHEMA);
                    if (!s) return undefined;
                    s.content = (c.children || []).filter(k => k && k.type === 'element');
                    out.schemas.push(s);
                } else if (c.name === 'Map') {
                    const m = parseAttrs(c, MAP);
                    if (!m || elements(c).length) return undefined;
                    out.maps.push(m);
                } else return undefined;
            }
            return out;
        }
        function renderXmlMaps(model) {
            const a = withNs(model, {});
            if (model.selectionNamespaces != null) a.SelectionNamespaces = String(model.selectionNamespaces);
            return xml.el('MapInfo', a, [
                ...(model.schemas || []).map(s => xml.el('Schema', renderAttrs(s, SCHEMA), Array.isArray(s.content) ? s.content : [])),
                ...(model.maps || []).map(m => xml.el('Map', renderAttrs(m, MAP)))
            ]);
        }

        // --- Connections ---

        const CONNECTION = [['id', 'id', 'int'], ['name', 'name', 'str'], ['type', 'type', 'int'],
            ['refreshedVersion', 'refreshedVersion', 'int'], ['minRefreshableVersion', 'minRefreshableVersion', 'int'],
            ['background', 'background', 'bool'], ['saveData', 'saveData', 'bool'], ['keepAlive', 'keepAlive', 'bool'],
            ['deleted', 'deleted', 'bool'], ['onlyUseConnectionFile', 'onlyUseConnectionFile', 'bool'],
            ['refreshOnLoad', 'refreshOnLoad', 'bool'], ['savePassword', 'savePassword', 'bool'], ['new', 'new', 'bool'],
            ['interval', 'interval', 'int'], ['reconnectionMethod', 'reconnectionMethod', 'int'],
            ['credentials', 'credentials', 'str'], ['singleSignOnId', 'singleSignOnId', 'str'],
            ['sourceFile', 'sourceFile', 'str'], ['odcFile', 'odcFile', 'str'], ['description', 'description', 'str'],
            ['xr16:uid', 'uid', 'str']];
        const DB_PR = [['connection', 'connection', 'str'], ['command', 'command', 'str'],
            ['serverCommand', 'serverCommand', 'str'], ['commandType', 'commandType', 'int']];
        const WEB_PR = [['xml', 'xml', 'bool'], ['sourceData', 'sourceData', 'bool'], ['parsePre', 'parsePre', 'bool'],
            ['consecutive', 'consecutive', 'bool'], ['firstRow', 'firstRow', 'bool'], ['xl97', 'xl97', 'bool'],
            ['textDates', 'textDates', 'bool'], ['xl2000', 'xl2000', 'bool'], ['url', 'url', 'str'], ['post', 'post', 'str'],
            ['htmlTables', 'htmlTables', 'bool'], ['htmlFormat', 'htmlFormat', 'str'], ['editPage', 'editPage', 'str']];
        const PARAMETER = [['name', 'name', 'str'], ['sqlType', 'sqlType', 'int'], ['parameterType', 'parameterType', 'str'],
            ['refreshOnChange', 'refreshOnChange', 'bool'], ['prompt', 'prompt', 'str'], ['boolean', 'boolean', 'bool'],
            ['double', 'double', 'str'], ['integer', 'integer', 'int'], ['string', 'string', 'str'], ['cell', 'cell', 'str']];
        function parseConnections(root) {
            if (root.name !== 'connections' || Object.keys(noNs(root).attrs).length) return undefined;
            const list = [];
            for (const c of elements(root)) {
                const conn = c.name === 'connection' ? parseAttrs(c, CONNECTION) : undefined;
                if (!conn) return undefined;
                for (const k of elements(c)) {
                    if (k.name === 'dbPr' && !conn.dbPr && !elements(k).length) conn.dbPr = parseAttrs(k, DB_PR);
                    else if (k.name === 'webPr' && !conn.webPr && !elements(k).length) conn.webPr = parseAttrs(k, WEB_PR);
                    else if (k.name === 'parameters' && !conn.parameters && Object.keys(k.attrs).every(a => a === 'count')) {
                        conn.parameters = elements(k).map(p => (p.name === 'parameter' && !elements(p).length ? parseAttrs(p, PARAMETER) : undefined));
                        if (conn.parameters.some(p => !p)) return undefined;
                        if (k.attrs.count != null && Number(k.attrs.count) !== conn.parameters.length) return undefined;
                        conn.parametersCount = k.attrs.count != null;
                    } else return undefined;
                    if ((k.name === 'dbPr' && !conn.dbPr) || (k.name === 'webPr' && !conn.webPr)) return undefined;
                }
                list.push(conn);
            }
            return { ns: nsAttrs(root), connections: list };
        }
        function renderConnections(model) {
            return xml.el('connections', withNs(model, {}), (model.connections || []).map(conn => {
                const kids = [];
                if (isPlain(conn.dbPr)) kids.push(xml.el('dbPr', renderAttrs(conn.dbPr, DB_PR)));
                if (isPlain(conn.webPr)) kids.push(xml.el('webPr', renderAttrs(conn.webPr, WEB_PR)));
                if (Array.isArray(conn.parameters)) {
                    kids.push(xml.el('parameters', conn.parametersCount ? { count: String(conn.parameters.length) } : {},
                        conn.parameters.map(p => xml.el('parameter', renderAttrs(p, PARAMETER)))));
                }
                return xml.el('connection', renderAttrs(conn, CONNECTION), kids);
            }));
        }

        // --- Query tables ---

        const QUERY_TABLE = [['name', 'name', 'str'], ['headers', 'headers', 'bool'], ['rowNumbers', 'rowNumbers', 'bool'],
            ['disableRefresh', 'disableRefresh', 'bool'], ['backgroundRefresh', 'backgroundRefresh', 'bool'],
            ['firstBackgroundRefresh', 'firstBackgroundRefresh', 'bool'], ['refreshOnLoad', 'refreshOnLoad', 'bool'],
            ['growShrinkType', 'growShrinkType', 'str'], ['fillFormulas', 'fillFormulas', 'bool'],
            ['removeDataOnSave', 'removeDataOnSave', 'bool'], ['disableEdit', 'disableEdit', 'bool'],
            ['preserveFormatting', 'preserveFormatting', 'bool'], ['adjustColumnWidth', 'adjustColumnWidth', 'bool'],
            ['intermediate', 'intermediate', 'bool'], ['connectionId', 'connectionId', 'int'],
            ['autoFormatId', 'autoFormatId', 'int'], ['applyNumberFormats', 'applyNumberFormats', 'bool'],
            ['applyBorderFormats', 'applyBorderFormats', 'bool'], ['applyFontFormats', 'applyFontFormats', 'bool'],
            ['applyPatternFormats', 'applyPatternFormats', 'bool'], ['applyAlignmentFormats', 'applyAlignmentFormats', 'bool'],
            ['applyWidthHeightFormats', 'applyWidthHeightFormats', 'bool']];
        const REFRESH = [['preserveSortFilterLayout', 'preserveSortFilterLayout', 'bool'],
            ['fieldIdWrapped', 'fieldIdWrapped', 'bool'], ['headersInLastRefresh', 'headersInLastRefresh', 'bool'],
            ['minimumVersion', 'minimumVersion', 'int'], ['nextId', 'nextId', 'int'],
            ['unboundColumnsLeft', 'unboundColumnsLeft', 'int'], ['unboundColumnsRight', 'unboundColumnsRight', 'int']];
        const FIELD = [['id', 'id', 'int'], ['name', 'name', 'str'], ['dataBound', 'dataBound', 'bool'],
            ['rowNumbers', 'rowNumbers', 'bool'], ['fillFormulas', 'fillFormulas', 'bool'], ['clipped', 'clipped', 'bool'],
            ['tableColumnId', 'tableColumnId', 'int']];
        function parseQueryTable(root) {
            if (root.name !== 'queryTable') return undefined;
            const qt = parseAttrs(noNs(root), QUERY_TABLE);
            if (!qt) return undefined;
            qt.ns = nsAttrs(root);
            for (const c of elements(root)) {
                if (c.name !== 'queryTableRefresh' || qt.refresh) return undefined;
                const r = parseAttrs(c, REFRESH);
                if (!r) return undefined;
                for (const k of elements(c)) {
                    if (k.name !== 'queryTableFields' || r.fields || Object.keys(k.attrs).some(a => a !== 'count')) return undefined;
                    r.fields = elements(k).map(f => (f.name === 'queryTableField' && !elements(f).length ? parseAttrs(f, FIELD) : undefined));
                    if (r.fields.some(f => !f)) return undefined;
                    if (k.attrs.count != null && Number(k.attrs.count) !== r.fields.length) return undefined;
                    r.fieldsCount = k.attrs.count != null;
                }
                qt.refresh = r;
            }
            return qt;
        }
        function renderQueryTable(qt) {
            const kids = [];
            if (isPlain(qt.refresh)) {
                const r = qt.refresh;
                kids.push(xml.el('queryTableRefresh', renderAttrs(r, REFRESH), Array.isArray(r.fields)
                    ? [xml.el('queryTableFields', r.fieldsCount ? { count: String(r.fields.length) } : {},
                        r.fields.map(f => xml.el('queryTableField', renderAttrs(f, FIELD))))] : []));
            }
            return xml.el('queryTable', withNs(qt, renderAttrs(qt, QUERY_TABLE)), kids);
        }

        // --- Read ---

        function wbRel(ctx, type) {
            const rel = (ctx.wbRels || []).find(r => r.Type === type && r.TargetMode !== 'External');
            return rel ? relsMod.resolveTarget(ctx.wbPart, rel.Target) : null;
        }
        function noRels(ctx, part) { return relsOf(ctx, part).length === 0; }
        const keysOnly = (attrs, allowed) => Object.keys(attrs || {}).every(k => allowed.includes(k));

        function hydratePackage(wb, ctx) {
            if (!isPlain(wb) || !ctx) return wb;
            // The calculation chain.
            const ccPart = wbRel(ctx, REL.CALC_CHAIN);
            if (ccPart && noRels(ctx, ccPart)) {
                const ids = ctx.sheetIds || [];
                const m = readBack(rootOf(ctx.parts, ccPart), r => parseCalcChain(r, ids), mm => renderCalcChain(mm, p => ids[p]));
                if (m) { wb.calcChain = m; ctx.consume(ccPart); }
            }
            // The external links, in the workbook's externalReferences order.
            const refs = xml.findChild(ctx.wbRoot, 'externalReferences');
            if (refs) {
                const links = [];
                for (const ref of elements(refs)) {
                    const rel = ref.name === 'externalReference' ? (ctx.wbRels || []).find(r => r.Id === ref.attrs['r:id']) : null;
                    const part = rel && rel.Type === REL.EXTERNAL_LINK ? relsMod.resolveTarget(ctx.wbPart, rel.Target) : null;
                    const lr = part ? relsOf(ctx, part) : [];
                    if (!part || lr.length !== 1 || lr[0].Type !== REL.EXTERNAL_LINK_PATH || lr[0].TargetMode !== 'External') { links.length = 0; break; }
                    const m = readBack(rootOf(ctx.parts, part), r => parseExternalLink(r, lr[0].Id), mm => renderExternalLink(mm, lr[0].Id));
                    if (!m) { links.length = 0; break; }
                    m.target = lr[0].Target;
                    links.push({ model: m, part });
                }
                if (links.length) {
                    wb.externalLinks = links.map(l => l.model);
                    for (const l of links) ctx.consume(l.part);
                }
            }
            // The XML maps, the connections.
            for (const [type, field, parse, render] of [[REL.XML_MAPS, 'xmlMaps', parseXmlMaps, renderXmlMaps],
                [REL.CONNECTIONS, 'connections', parseConnections, renderConnections]]) {
                const part = wbRel(ctx, type);
                if (!part || !noRels(ctx, part)) continue;
                const m = readBack(rootOf(ctx.parts, part), parse, render);
                if (m) { wb[field] = m; ctx.consume(part); }
            }
            // A table's query table.
            (Array.isArray(wb.tables) ? wb.tables : []).forEach((t, k) => {
                const tPart = (ctx.tableParts || [])[k];
                if (!isPlain(t) || !tPart) return;
                const tr = relsOf(ctx, tPart);
                if (tr.length !== 1 || tr[0].Type !== REL.QUERY_TABLE) return;
                const part = relsMod.resolveTarget(tPart, tr[0].Target);
                if (!noRels(ctx, part)) return;
                const m = readBack(rootOf(ctx.parts, part), parseQueryTable, renderQueryTable);
                if (m) { t.queryTable = m; ctx.consume(part); }
            });
            readPivots(wb, ctx);
            return wb;
        }

        // --- Pivot caches and tables (smlPivotTables) ---

        // A toolkit part written back as read, or undefined.
        function readToolkit(ctx, part, parse, render) {
            const text = ctx.parts[part] ? decodeText(ctx.parts[part]) : null;
            return text == null ? undefined : readBack(rootOf(ctx.parts, part), () => parse(text), m => xml.parse(render(m)));
        }

        function readPivots(wb, ctx) {
            const caches = [];
            const used = [];
            for (const pc of elements(xml.findChild(ctx.wbRoot, 'pivotCaches'))) {
                if (pc.name !== 'pivotCache' || !keysOnly(pc.attrs, ['cacheId', 'r:id']) || !/^\d+$/.test(pc.attrs.cacheId || '')) continue;
                const rel = (ctx.wbRels || []).find(r => r.Id === pc.attrs['r:id']);
                if (!rel || rel.Type !== REL.PIVOT_DEF) continue;
                const dPart = relsMod.resolveTarget(ctx.wbPart, rel.Target);
                const root = rootOf(ctx.parts, dPart);
                const dRels = relsOf(ctx, dPart);
                const rid = root ? root.attrs['r:id'] : undefined;
                // Its one relationship, to its records, the one its r:id names.
                if (!root || dRels.length > 1 || (rid != null) !== (dRels.length === 1)) continue;
                if (dRels.length && (dRels[0].Id !== rid || dRels[0].Type !== REL.PIVOT_RECORDS || dRels[0].TargetMode === 'External')) continue;
                const definition = readToolkit(ctx, dPart, piv.parsePivotCacheDefinition, piv.renderPivotCacheDefinition);
                if (!definition) continue;
                const entry = { cacheId: Number(pc.attrs.cacheId), definition };
                const parts = [dPart];
                if (dRels.length) {
                    const rPart = relsMod.resolveTarget(dPart, dRels[0].Target);
                    const records = noRels(ctx, rPart) ? readToolkit(ctx, rPart, piv.parsePivotCacheRecords, piv.renderPivotCacheRecords) : undefined;
                    if (!records) continue;
                    entry.records = records;
                    parts.push(rPart);
                }
                caches.push(entry);
                used.push(dPart);
                for (const part of parts) ctx.consume(part);
            }
            if (!caches.length) return;
            wb.pivotCaches = caches;
            (Array.isArray(wb.sheets) ? wb.sheets : []).forEach((sheet, k) => {
                const sPart = (ctx.sheetParts || [])[k];
                if (!isPlain(sheet) || !sPart) return;
                const tables = [];
                for (const r of relsOf(ctx, sPart)) {
                    if (r.Type !== REL.PIVOT_TABLE || r.TargetMode === 'External') continue;
                    const tPart = relsMod.resolveTarget(sPart, r.Target);
                    const tRels = relsOf(ctx, tPart);
                    if (tRels.length !== 1 || tRels[0].Type !== REL.PIVOT_DEF) continue;
                    const cache = used.indexOf(relsMod.resolveTarget(tPart, tRels[0].Target));
                    if (cache < 0) continue;
                    const table = readToolkit(ctx, tPart, piv.parsePivotTable, piv.renderPivotTable);
                    if (!table) continue;
                    tables.push({ table, cache });
                    ctx.consume(tPart);
                }
                if (tables.length) sheet.pivotTables = tables;
            });
        }

        // --- Write ---

        function addRel(pkg, part, type, target) {
            const list = (pkg.rels[part] || []).slice();
            const used = new Set(list.map(r => r.Id));
            let n = list.length + 1;
            while (used.has(`rId${n}`)) n++;
            list.push({ Id: `rId${n}`, Type: type, Target: target });
            opc.setRels(pkg, part, list);
            return `rId${n}`;
        }
        const addWbRel = (pkg, ctx, type, target) => addRel(pkg, ctx.wbPart, type, target);

        // CT_Workbook's sequence, up to the children this extra writes.
        const WB_SEQ = ['fileVersion', 'fileSharing', 'workbookPr', 'workbookProtection', 'bookViews', 'sheets',
            'functionGroups', 'externalReferences', 'definedNames', 'calcPr', 'oleSize', 'customWorkbookViews',
            'pivotCaches'];
        function insertWbChild(pkg, ctx, el) {
            const root = xml.parse(decodeText(pkg.parts[ctx.wbPart]));
            const kids = root.children.slice();
            const rank = WB_SEQ.indexOf(el.name);
            let at = kids.length;
            for (let i = 0; i < kids.length; i++) {
                const k = kids[i];
                const r = k && k.type === 'element' ? WB_SEQ.indexOf(k.name) : -1;
                if (r < 0 || r > rank) { at = i; break; }
            }
            kids.splice(at, 0, el);
            root.children = kids;
            opc.setPart(pkg, ctx.wbPart, encodeText(xml.serialize(root)), pkg.contentTypes.overrides[ctx.wbPart]);
        }

        function dehydratePackage(wb, ctx) {
            if (!isPlain(wb) || !ctx || !ctx.package) return wb;
            const pkg = ctx.package;
            const sheets = Array.isArray(wb.sheets) ? wb.sheets : [];
            const put = (name, el, ct) => opc.setPart(pkg, name, encodeText(xml.serialize(el)), ct);
            // The calculation chain: the entries whose cell holds a formula.
            if (isPlain(wb.calcChain) && Array.isArray(wb.calcChain.cells)) {
                const cells = wb.calcChain.cells.filter(c => isPlain(c) && Number.isInteger(c.sheet)
                    && c.sheet < sheets.length && holdsFormula(sheets[c.sheet], c.ref));
                if (cells.length) {
                    put('/xl/calcChain.xml', renderCalcChain({ ...wb.calcChain, cells }, p => p + 1), CT.CALC_CHAIN);
                    addWbRel(pkg, ctx, REL.CALC_CHAIN, 'calcChain.xml');
                }
            }
            // The external links, and the workbook's externalReferences.
            const links = (Array.isArray(wb.externalLinks) ? wb.externalLinks : []).filter(l => isPlain(l) && l.target);
            if (links.length) {
                const refs = links.map((l, k) => {
                    const name = `/xl/externalLinks/externalLink${k + 1}.xml`;
                    put(name, renderExternalLink(l, 'rId1'), CT.EXTERNAL_LINK);
                    opc.setRels(pkg, name, [{ Id: 'rId1', Type: REL.EXTERNAL_LINK_PATH, Target: String(l.target), TargetMode: 'External' }]);
                    return xml.el('externalReference', { 'r:id': addWbRel(pkg, ctx, REL.EXTERNAL_LINK, `externalLinks/externalLink${k + 1}.xml`) });
                });
                insertWbChild(pkg, ctx, xml.el('externalReferences', {}, refs));
            }
            if (isPlain(wb.xmlMaps)) {
                put('/xl/xmlMaps.xml', renderXmlMaps(wb.xmlMaps), CT.XML_MAPS);
                addWbRel(pkg, ctx, REL.XML_MAPS, 'xmlMaps.xml');
            }
            if (isPlain(wb.connections)) {
                put('/xl/connections.xml', renderConnections(wb.connections), CT.CONNECTIONS);
                addWbRel(pkg, ctx, REL.CONNECTIONS, 'connections.xml');
            }
            // A written table's query table.
            let q = 0;
            for (const t of Array.isArray(wb.tables) ? wb.tables : []) {
                const tPart = isPlain(t) && isPlain(t.queryTable) && ctx.tablePartOf ? ctx.tablePartOf(t) : null;
                if (!tPart || !pkg.parts[tPart]) continue;
                const name = `/xl/queryTables/queryTable${++q}.xml`;
                put(name, renderQueryTable(t.queryTable), CT.QUERY_TABLE);
                opc.setRels(pkg, tPart, [{ Id: 'rId1', Type: REL.QUERY_TABLE, Target: `../queryTables/queryTable${q}.xml` }]);
            }
            writePivots(wb, ctx, pkg, sheets);
            return wb;
        }

        function writePivots(wb, ctx, pkg, sheets) {
            const caches = Array.isArray(wb.pivotCaches) ? wb.pivotCaches : [];
            const ok = caches.map(c => isPlain(c) && isPlain(c.definition) && Number.isInteger(c.cacheId));
            if (!ok.some(Boolean)) return;
            const refs = [];
            caches.forEach((c, i) => {
                if (!ok[i]) return;
                const dName = `pivotCacheDefinition${i + 1}.xml`;
                const attrs = { ...(c.definition.attrs || {}) };
                if (isPlain(c.records)) {
                    const rid = attrs['r:id'] || 'rId1';
                    attrs['r:id'] = rid;
                    const rName = `pivotCacheRecords${i + 1}.xml`;
                    opc.setPart(pkg, '/xl/pivotCache/' + rName, encodeText(piv.renderPivotCacheRecords(c.records)), CT.PIVOT_RECORDS);
                    opc.setRels(pkg, '/xl/pivotCache/' + dName, [{ Id: rid, Type: REL.PIVOT_RECORDS, Target: rName }]);
                } else delete attrs['r:id'];
                opc.setPart(pkg, '/xl/pivotCache/' + dName, encodeText(piv.renderPivotCacheDefinition({ ...c.definition, attrs })), CT.PIVOT_DEF);
                const rid = addWbRel(pkg, ctx, REL.PIVOT_DEF, 'pivotCache/' + dName);
                refs.push(xml.el('pivotCache', { cacheId: String(c.cacheId), 'r:id': rid }));
            });
            insertWbChild(pkg, ctx, xml.el('pivotCaches', {}, refs));
            let n = 0;
            sheets.forEach((sheet, k) => {
                const sPart = (ctx.sheetParts || [])[k];
                for (const pt of isPlain(sheet) && Array.isArray(sheet.pivotTables) ? sheet.pivotTables : []) {
                    if (!isPlain(pt) || !isPlain(pt.table) || !ok[pt.cache] || !sPart) continue;
                    const tName = `pivotTable${++n}.xml`;
                    opc.setPart(pkg, '/xl/pivotTables/' + tName, encodeText(piv.renderPivotTable(pt.table)), CT.PIVOT_TABLE);
                    opc.setRels(pkg, '/xl/pivotTables/' + tName, [{ Id: 'rId1', Type: REL.PIVOT_DEF, Target: `../pivotCache/pivotCacheDefinition${pt.cache + 1}.xml` }]);
                    addRel(pkg, sPart, REL.PIVOT_TABLE, '../pivotTables/' + tName);
                }
            });
        }

        return { hydratePackage, dehydratePackage };
    }
};
