// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML (.xlsx) reader/writer — orchestrator.
 *
 * Targets ECMA-376 part 1 §18. `write()` emits the Transitional namespace
 * URIs.
 *
 * **Supported parts** :
 *
 * | Part | Module | Coverage |
 * |------|--------|----------|
 * | `xl/workbook.xml` | this module | sheet list + defined names |
 * | `xl/worksheets/sheet*.xml` | this module | rows, cells (n/s/b/inlineStr/str), formulas, merges, cols, sheetViews, autoFilter, hyperlinks, dataValidations, tableParts |
 * | `xl/sharedStrings.xml` | this module | dedup auto-built |
 * | `xl/styles.xml` | `xlsxStyles` | numFmts, fonts, fills, borders, cellXfs, cellStyles |
 * | `xl/tables/table*.xml` | `xlsxTables` | tables with columns, autoFilter, tableStyleInfo |
 *
 * **Document model** :
 *
 * ```js
 * { type: 'workbook',
 *   sheets: [{
 *     name, rows, merges?, cols?,
 *     sheetViews?, autoFilter?, hyperlinks?, dataValidations?,
 *     tableRefs?,    // references to tables defined in `tables` below
 *     _extras?
 *   }],
 *   definedNames?: [{ name, value, scope?, hidden? }],
 *   sharedStrings?: [string],
 *   tables?: [xlsxTablesObject]   // separate xl/tables/ parts
 * }
 *
 * cell := { type: 'cell',
 *           value, t, formula?, ref?,
 *           s?: number,            // cellXfs index
 *           hyperlinkRef?: string  // soft hint (sheet.hyperlinks holds the rel)
 *         }
 * ```
 *
 * **Read result** : `read(bytes, opts?)` returns the envelope
 * `{ workbook, package, unmodelledParts }`. `package` is the plain OPC
 * package (`{ contentTypes, parts, rels }`); `unmodelledParts` is always
 * present, `[{ partName, contentType }]` sorted by `partName`
 * (`contentType` is `null` when `[Content_Types].xml` declares none),
 * `[]` when every part was consumed. `write(workbook)` takes the model
 * (`workbook`), not the envelope.
 *
 * Inside a modelled part, elements the model does not type are kept in
 * `_extras` and re-emitted on write. `write()` produces the parts its
 * model carries; a part `read()` did not model is not written back —
 * `read()` lists it in `unmodelledParts`. The legacy VML drawing that
 * carries comment shapes is one such part: `write()` generates a new one
 * from the comments model.
 *
 * **Extended coverage** is available through the `xlsx-large` bundle (an
 * estimated ~95 % of real-world usage) and the `xlsx-full` bundle (every
 * SpreadsheetML schema element typed or preserved; the rarest elements
 * are preserved as passthroughs rather than modelled). The `.use(...)`
 * hook lets you wire extras after construction. See
 * `docs/api/bundles/README.md` and `docs/guide/coverage.md`.
 *
 * Charts, conditional formatting + dxfs and comments (classic +
 * threaded) are read and written by the core. Pivot tables, the calc
 * chain and form controls have typed parsers and renderers in the
 * associated extras, but `read()` does not load those parts: they are
 * listed in `unmodelledParts`.
 *
 * @module ooxml/xlsx
 */

import { ooxmlErrors } from '../errors.js';
import { opcPackage } from '../opc/package.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { opcRelationships } from '../opc/relationships.js';
import { xlsxStyles } from './styles.js';
import { xlsxTables } from './tables.js';
import { xlsxConditionalFormatting } from './conditionalFormatting.js';
import { xlsxComments } from './comments.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { xlsxDrawings } from './drawings.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { xlsxThreadedComments } from './threadedComments.js';
import { xlsxWalker } from './xlsx-walker.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsx = {
    name: 'xlsx',
    dependencies: ['ooxmlErrors', 'opcPackage', 'xml', 'opcRelationships',
                   'xlsxStyles', 'xlsxTables', 'xlsxConditionalFormatting',
                   'xlsxComments', 'markupCompatibility',
                   'xlsxDrawings', 'drawingmlChart',
                   'xlsxThreadedComments', 'xlsxWalker', 'ooxmlShared'],
    deps: [ooxmlErrors, opcPackage, xml, opcRelationships, xlsxStyles, xlsxTables, xlsxConditionalFormatting, xlsxComments, markupCompatibility, xlsxDrawings, drawingmlChart, xlsxThreadedComments, xlsxWalker, ooxmlShared],

    factory(errors, opc, xml, relsMod, stylesMod, tablesMod, cfMod, commentsMod, mc,
            drawingsMod, chartMod, tcMod, walkerMod, shared) {
        const { ParseError, ContractError } = errors;
        const { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText,
                createRidAllocator, trackUnmodelledParts } = shared;

        const SS_NS = NS.SS;
        const RELS_NS = NS.R;
        const REL_TYPE_DOC = REL_TYPE.DOC;
        const REL_TYPE_SHEET = REL_TYPE.SHEET;
        const REL_TYPE_SHARED_STRINGS = REL_TYPE.SHARED_STRINGS;
        const REL_TYPE_HYPERLINK = REL_TYPE.HYPERLINK;
        const CT_WORKBOOK = CT.WORKBOOK;
        const CT_SHEET = CT.SHEET;
        const CT_SHARED_STRINGS = CT.SHARED_STRINGS;

        // Worksheet pre-scan patterns: `<row` / `<c` start tags only.
        const ROW_TAG_RE = /<row[\s>/]/g;
        const CELL_TAG_RE = /<c[\s>/]/g;

        // --- Address helpers ---

        function colName(idx) {
            let s = '';
            let n = idx + 1;
            while (n > 0) {
                const r = (n - 1) % 26;
                s = String.fromCharCode(65 + r) + s;
                n = ((n - 1) / 26) | 0;
            }
            return s;
        }

        function colIndex(name) {
            let n = 0;
            for (let i = 0; i < name.length; i++) {
                const c = name.charCodeAt(i);
                if (c < 65 || c > 90) break;
                n = n * 26 + (c - 64);
            }
            return n - 1;
        }

        function cellRef(rowIdx, colIdx) { return colName(colIdx) + (rowIdx + 1); }

        function parseRef(ref) {
            const m = ref.match(/^([A-Z]+)(\d+)$/);
            if (!m) return null;
            return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
        }

        /**
         * Resolve user-friendly threaded comments :
         * - `id` auto-generated if missing
         * - `personId` resolved from `author` (display name) — looks up
         *   `workbook.persons` (creating a new entry if needed) and
         *   patches both `personId` and the workbook persons array
         * - `parentId` may be `<int>` referring to an entry index in the
         *   same array (or a raw GUID string)
         */
        function resolveThreadedComments(entries, workbook) {
            workbook.persons = workbook.persons || [];
            const personByName = new Map();
            for (const p of workbook.persons) {
                if (p.displayName) personByName.set(p.displayName, p);
            }
            const out = [];
            const idByIdx = new Map();
            entries.forEach((entry, idx) => {
                const resolved = { ...entry };
                if (!resolved.id) resolved.id = tcMod.generateId();
                if (!resolved.personId && resolved.author) {
                    let person = personByName.get(resolved.author);
                    if (!person) {
                        person = {
                            id: tcMod.generateId(),
                            displayName: resolved.author,
                            providerId: 'None'
                        };
                        workbook.persons.push(person);
                        personByName.set(resolved.author, person);
                    }
                    resolved.personId = person.id;
                }
                delete resolved.author;
                if (typeof resolved.parentId === 'number') {
                    resolved.parentId = idByIdx.get(resolved.parentId);
                }
                idByIdx.set(idx, resolved.id);
                out.push(resolved);
            });
            return out;
        }

        // --- Image content-type sniffing (mirror of docxDrawing/pptxPicture) ---

        function sniffImageType(bytes) {
            if (!bytes || bytes.length < 4) return 'application/octet-stream';
            const b = bytes;
            if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
            if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
            if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
            if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
            if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                && b.length >= 12
                && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
                return 'image/webp';
            }
            return 'application/octet-stream';
        }

        function imageExtensionFor(contentType) {
            switch (contentType) {
                case 'image/png':  return 'png';
                case 'image/jpeg': return 'jpg';
                case 'image/gif':  return 'gif';
                case 'image/bmp':  return 'bmp';
                case 'image/webp': return 'webp';
                case 'image/tiff': return 'tiff';
                default:           return 'bin';
            }
        }

        function extToImageContentType(ext) {
            switch (ext) {
                case 'png':  return 'image/png';
                case 'jpg':
                case 'jpeg': return 'image/jpeg';
                case 'gif':  return 'image/gif';
                case 'bmp':  return 'image/bmp';
                case 'webp': return 'image/webp';
                case 'tiff': return 'image/tiff';
                default:     return 'application/octet-stream';
            }
        }

        // --- Shared strings ---

        function parseSharedStrings(text) {
            const root = xml.parse(text);
            const out = [];
            for (const si of xml.findAll(root, 'si')) {
                let s = '';
                for (const c of si.children) {
                    if (c.type !== 'element') continue;
                    if (c.name === 't') s += xml.textContent(c);
                    else if (c.name === 'r') {
                        const t = xml.findChild(c, 't');
                        if (t) s += xml.textContent(t);
                    }
                }
                out.push(s);
            }
            return out;
        }

        function serializeSharedStrings(strings) {
            const items = strings.map(s => xml.el('si', {}, [
                xml.el('t', { 'xml:space': 'preserve' }, [xml.text(s)])
            ]));
            return xml.serialize(xml.el('sst',
                { xmlns: SS_NS,
                  count: String(strings.length),
                  uniqueCount: String(strings.length) },
                items));
        }

        // --- Extension support (`.use(...)`) ---
        // Walker / dispatcher lives in `./xlsx-walker.js`. Idempotent
        // registration is enforced inside it.
        const walker = walkerMod.createWalker();
        function use(...extensions) {
            walker.use(...extensions);
            return api;
        }

        // --- Write ---

        function write(workbook) {
            if (workbook == null || typeof workbook !== 'object'
                || Array.isArray(workbook)) {
                throw new ContractError('xlsx/invalid-workbook',
                    'xlsx.write: workbook must be an object with a sheets array',
                    { context: { received: workbook === null ? 'null' : typeof workbook } });
            }
            if (workbook.sheets !== undefined && !Array.isArray(workbook.sheets)) {
                throw new ContractError('xlsx/invalid-sheets',
                    'xlsx.write: workbook.sheets must be an array',
                    { context: { path: 'sheets', received: typeof workbook.sheets } });
            }
            if (walker.hasExtensions) walker.applyDehydrate(workbook);
            const pkg = opc.empty();
            const sheets = workbook.sheets || [];

            // Shared strings — built lazily as cells are emitted.
            const sst = [];
            const sstIndex = new Map();
            function internString(s) {
                if (sstIndex.has(s)) return sstIndex.get(s);
                const idx = sst.length;
                sst.push(s);
                sstIndex.set(s, idx);
                return idx;
            }

            // Tables — flatten to per-table parts. `sheet.tableRefs` holds
            // `tableId` values; the actual table objects live in
            // `workbook.tables`.
            const tablesById = {};
            for (const t of workbook.tables || []) {
                tablesById[t.id] = t;
            }

            // Track per-sheet hyperlinks to write the relationships part.
            const sheetHyperlinkRels = sheets.map(() => []);
            // Track per-sheet "extra" rels (comments + VML drawing + drawing).
            const sheetExtraRels = sheets.map(() => ({
                legacyDrawingRid: null,
                drawingRid: null,
                rels: []
            }));

            // Allocate comments + VML drawing parts before rendering the
            // worksheet XML so the legacyDrawing rId is known when emitting
            // <legacyDrawing r:id=…/>.
            sheets.forEach((sheet, i) => {
                const extra = sheetExtraRels[i];
                if (sheet.comments && sheet.comments.length) {
                    // Reserve rId slots that don't collide with hyperlinks
                    // (which use rIdH*) or table parts (rId*). We use a
                    // dedicated namespace `rIdC*` / `rIdV*`.
                    const commentsRid = `rIdC${i + 1}`;
                    const vmlRid = `rIdV${i + 1}`;
                    extra.rels.push({
                        Id: commentsRid,
                        Type: commentsMod.REL_TYPE_COMMENTS,
                        Target: `../comments${i + 1}.xml`
                    });
                    extra.rels.push({
                        Id: vmlRid,
                        Type: commentsMod.REL_TYPE_VML_DRAWING,
                        Target: `../drawings/vmlDrawing${i + 1}.vml`
                    });
                    extra.legacyDrawingRid = vmlRid;
                }
                if (sheet.drawings && sheet.drawings.length) {
                    const drawingRid = `rIdD${i + 1}`;
                    extra.rels.push({
                        Id: drawingRid,
                        Type: drawingsMod.REL_TYPE_DRAWING,
                        Target: `../drawings/drawing${i + 1}.xml`
                    });
                    extra.drawingRid = drawingRid;
                }
            });

            // Render each worksheet's XML.
            const sheetXmls = sheets.map((sheet, sheetIdx) =>
                renderWorksheet(sheet, sheetIdx, internString,
                                sheetHyperlinkRels[sheetIdx],
                                sheetExtraRels[sheetIdx]));

            const useSharedStrings = sst.length > 0;
            const useStyles = !!workbook.styles;

            // /xl/workbook.xml
            const wbChildren = [];
            wbChildren.push(xml.el('sheets', {}, sheets.map((s, i) => {
                const a = {
                    name: s.name || `Sheet${i + 1}`,
                    sheetId: String(i + 1),
                    'r:id': `rId${i + 1}`
                };
                if (s.state) a.state = s.state;
                return xml.el('sheet', a);
            })));
            if (workbook.definedNames && workbook.definedNames.length) {
                wbChildren.push(xml.el('definedNames', {},
                    workbook.definedNames.map(dn => {
                        const a = { name: dn.name };
                        if (dn.scope != null) a.localSheetId = String(dn.scope);
                        if (dn.hidden) a.hidden = '1';
                        return xml.el('definedName', a, [xml.text(dn.value)]);
                    })));
            }
            const workbookXml = xml.serialize(xml.el('workbook',
                { xmlns: SS_NS, 'xmlns:r': RELS_NS }, wbChildren));
            opc.setPart(pkg, '/xl/workbook.xml',
                encodeText(workbookXml), CT_WORKBOOK);

            // workbook → sheet & sharedStrings & styles relationships
            const wbRels = sheets.map((_, i) => ({
                Id: `rId${i + 1}`,
                Type: REL_TYPE_SHEET,
                Target: `worksheets/sheet${i + 1}.xml`
            }));
            let nextWbRid = sheets.length + 1;
            if (useSharedStrings) {
                wbRels.push({
                    Id: `rId${nextWbRid++}`,
                    Type: REL_TYPE_SHARED_STRINGS,
                    Target: 'sharedStrings.xml'
                });
                opc.setPart(pkg, '/xl/sharedStrings.xml',
                    encodeText(serializeSharedStrings(sst)),
                    CT_SHARED_STRINGS);
            }
            if (useStyles) {
                wbRels.push({
                    Id: `rId${nextWbRid++}`,
                    Type: stylesMod.REL_TYPE_STYLES,
                    Target: 'styles.xml'
                });
                opc.setPart(pkg, '/xl/styles.xml',
                    stylesMod.bytesOf(workbook.styles),
                    stylesMod.CT_STYLES);
            }
            // Workbook rels are finalised AFTER the sheets loop because
            // threaded comments resolution may append to workbook.persons.
            // We capture nextWbRid in a closure-accessible place.

            // worksheets + their relationships (hyperlinks + tables + comments + drawings)
            let needCommentsCT = false;
            let needVmlCT = false;
            let nextChartIdx = 1;
            let nextImageIdx = 1;
            const usedImageExts = new Set();
            const chartParts = [];
            sheetXmls.forEach((wsXml, i) => {
                opc.setPart(pkg, `/xl/worksheets/sheet${i + 1}.xml`,
                    encodeText(wsXml), CT_SHEET);
                const wsRels = [];
                // Hyperlink relationships first.
                for (const h of sheetHyperlinkRels[i]) wsRels.push(h);
                // Table parts.
                for (const tableId of (sheets[i].tableRefs || [])) {
                    const t = tablesById[tableId];
                    if (!t) continue;
                    const wsRid = `rId${wsRels.length + 1}`;
                    const target = `../tables/table${tableId}.xml`;
                    wsRels.push({
                        Id: wsRid, Type: tablesMod.REL_TYPE_TABLE, Target: target
                    });
                    opc.setPart(pkg, `/xl/tables/table${tableId}.xml`,
                        tablesMod.bytesOf(t), tablesMod.CT_TABLE);
                }
                // Comments + VML drawing part.
                const sheet = sheets[i];
                if (sheet.comments && sheet.comments.length) {
                    needCommentsCT = true;
                    needVmlCT = true;
                    // Build the comments part — authors deduped automatically.
                    const commentsObj = { authors: sheet.commentAuthors || [],
                                          comments: sheet.comments };
                    opc.setPart(pkg, `/xl/comments${i + 1}.xml`,
                        commentsMod.bytesOf(commentsObj),
                        commentsMod.CT_COMMENTS);

                    // VML drawing part — one shape per comment.
                    const cellRefs = sheet.comments.map(c => parseRef(c.ref))
                        .filter(Boolean);
                    opc.setPart(pkg, `/xl/drawings/vmlDrawing${i + 1}.vml`,
                        commentsMod.vmlBytes(cellRefs),
                        commentsMod.CT_VML_DRAWING);
                }
                // Push all extra rels (comments + drawing) regardless —
                // either may be present without the other.
                for (const r of sheetExtraRels[i].rels) wsRels.push(r);

                // Threaded comments part (modern Office 2018+ extension).
                if (sheet.threadedComments && sheet.threadedComments.length) {
                    const tcEntries = resolveThreadedComments(
                        sheet.threadedComments, workbook);
                    opc.setPart(pkg,
                        `/xl/threadedComments/threadedComment${i + 1}.xml`,
                        tcMod.threadedCommentsBytes(tcEntries),
                        tcMod.CT_THREADED_COMMENTS);
                    pkg.contentTypes.overrides[
                        `/xl/threadedComments/threadedComment${i + 1}.xml`] =
                        tcMod.CT_THREADED_COMMENTS;
                    wsRels.push({
                        Id: `rIdTc${i + 1}`,
                        Type: tcMod.REL_TYPE_THREADED_COMMENT,
                        Target: `../threadedComments/threadedComment${i + 1}.xml`
                    });
                }

                // Drawings part (charts + images anchored to cells).
                if (sheet.drawings && sheet.drawings.length) {
                    const drawingPath = `/xl/drawings/drawing${i + 1}.xml`;
                    const drawingRels = [];
                    let nextDrawingRid = 1;
                    const seenImages = new Map();
                    const entries = [];

                    for (const d of sheet.drawings) {
                        if (d.shapeProps && !d.chart && !d.image) {
                        // Inline shape (xdr:sp) — no extra parts needed.
                        entries.push({
                            type: 'shape',
                            anchor: d.anchor,
                            id: d.id, name: d.name,
                            description: d.description,
                            shapeProps: d.shapeProps,
                            txBody: d.txBody
                        });
                    } else if (d.chart) {
                            // Allocate a chart part globally + add rel from drawing.
                            const chartFile = `chart${nextChartIdx++}.xml`;
                            const partName = '/xl/charts/' + chartFile;
                            opc.setPart(pkg, partName,
                                chartMod.bytesOf(d.chart),
                                chartMod.CT_CHART);
                            chartParts.push(partName);
                            const rId = `rId${nextDrawingRid++}`;
                            drawingRels.push({
                                Id: rId,
                                Type: chartMod.REL_TYPE_CHART,
                                Target: '../charts/' + chartFile
                            });
                            entries.push({
                                type: 'chart',
                                anchor: d.anchor,
                                graphicFrameId: d.id || (entries.length + 2),
                                graphicFrameName: d.name || `Chart ${entries.length + 1}`,
                                cx: d.cx, cy: d.cy,
                                offsetX: d.offsetX, offsetY: d.offsetY,
                                chartRef: rId
                            });
                        } else if (d.image && d.image.data) {
                            let item = seenImages.get(d.image.data);
                            if (!item) {
                                const ct = d.image.contentType
                                    || sniffImageType(d.image.data);
                                const ext = imageExtensionFor(ct);
                                const fileName = `image${nextImageIdx++}.${ext}`;
                                const partName = '/xl/media/' + fileName;
                                opc.setPart(pkg, partName, d.image.data, ct);
                                usedImageExts.add(ext);
                                const rId = `rId${nextDrawingRid++}`;
                                drawingRels.push({
                                    Id: rId,
                                    Type: REL_TYPE.IMAGE,
                                    Target: '../media/' + fileName
                                });
                                item = { rId, partName, ext };
                                seenImages.set(d.image.data, item);
                            }
                            entries.push({
                                type: 'picture',
                                anchor: d.anchor,
                                picId: d.id || (entries.length + 2),
                                picName: d.name || `Picture ${entries.length + 1}`,
                                description: d.description,
                                title: d.title,
                                cx: d.cx, cy: d.cy,
                                offsetX: d.offsetX, offsetY: d.offsetY,
                                embedRef: item.rId,
                                prstGeom: d.prstGeom || 'rect'
                            });
                        } else if (d._node) {
                            entries.push({ type: 'graphicFrame',
                                            anchor: d.anchor, _node: d._node });
                        }
                    }

                    opc.setPart(pkg, drawingPath,
                        drawingsMod.bytesOf({ entries }),
                        drawingsMod.CT_DRAWING);
                    if (drawingRels.length) {
                        opc.setRels(pkg, drawingPath, drawingRels);
                    }
                }

                if (wsRels.length) {
                    opc.setRels(pkg, `/xl/worksheets/sheet${i + 1}.xml`, wsRels);
                }
            });
            // Declare content types for drawings + charts + images.
            for (let i = 0; i < sheets.length; i++) {
                if (sheets[i].drawings && sheets[i].drawings.length) {
                    pkg.contentTypes.overrides[`/xl/drawings/drawing${i + 1}.xml`] =
                        drawingsMod.CT_DRAWING;
                }
            }
            for (const partName of chartParts) {
                pkg.contentTypes.overrides[partName] = chartMod.CT_CHART;
            }
            for (const ext of usedImageExts) {
                pkg.contentTypes.defaults[ext] = extToImageContentType(ext);
            }
            // Declare content types for comments / VML if any were written.
            // Comments are an Override (per-part), VML is a Default (vml ext).
            if (needVmlCT) {
                pkg.contentTypes.defaults.vml = commentsMod.CT_VML_DRAWING;
            }
            if (needCommentsCT) {
                for (let i = 0; i < sheets.length; i++) {
                    if (sheets[i].comments && sheets[i].comments.length) {
                        pkg.contentTypes.overrides[`/xl/comments${i + 1}.xml`] =
                            commentsMod.CT_COMMENTS;
                    }
                }
            }

            // Persons part — emitted last because threaded comment write
            // logic above may have appended to workbook.persons.
            if (workbook.persons && workbook.persons.length) {
                wbRels.push({
                    Id: `rId${nextWbRid}`,
                    Type: tcMod.REL_TYPE_PERSON,
                    Target: 'persons/person.xml'
                });
                opc.setPart(pkg, '/xl/persons/person.xml',
                    tcMod.personsBytes(workbook.persons),
                    tcMod.CT_PERSONS);
                pkg.contentTypes.overrides['/xl/persons/person.xml'] =
                    tcMod.CT_PERSONS;
            }
            opc.setRels(pkg, '/xl/workbook.xml', wbRels);

            // package rels
            opc.setRels(pkg, '/', [{
                Id: 'rId1',
                Type: REL_TYPE_DOC,
                Target: 'xl/workbook.xml'
            }]);

            return opc.write(pkg);
        }

        function renderWorksheet(sheet, sheetIdx, internString, hyperlinkRels, extraRels) {
            const children = [];

            // <sheetViews> — view configuration (frozen panes, zoom, gridlines).
            if (sheet.sheetViews && sheet.sheetViews.length) {
                children.push(xml.el('sheetViews', {},
                    sheet.sheetViews.map(renderSheetView)));
            }

            // <cols>
            if (sheet.cols && sheet.cols.length) {
                children.push(xml.el('cols', {}, sheet.cols.map(col => {
                    const a = { min: String(col.min), max: String(col.max) };
                    if (col.width != null) {
                        a.width = String(col.width);
                        a.customWidth = '1';
                    }
                    if (col.hidden)    a.hidden = '1';
                    if (col.style != null) a.style = String(col.style);
                    if (col.bestFit)   a.bestFit = '1';
                    return xml.el('col', a);
                })));
            }

            // <sheetData>
            const rows = (sheet.rows || []).map((row, r) => {
                const cells = row.map((val, c) => renderCell(val, r, c, internString));
                const a = { r: String(r + 1) };
                return xml.el('row', a, cells);
            });
            children.push(xml.el('sheetData', {}, rows));

            // <autoFilter>
            if (sheet.autoFilter) {
                children.push(xml.el('autoFilter', { ref: sheet.autoFilter.ref }));
            }

            // <mergeCells>
            if (sheet.merges && sheet.merges.length) {
                children.push(xml.el('mergeCells',
                    { count: String(sheet.merges.length) },
                    sheet.merges.map(ref => xml.el('mergeCell', { ref }))));
            }

            // <conditionalFormatting> blocks
            // ECMA-376 schema places these AFTER mergeCells and BEFORE
            // dataValidations / hyperlinks.
            if (sheet.conditionalFormatting && sheet.conditionalFormatting.length) {
                for (const block of sheet.conditionalFormatting) {
                    children.push(cfMod.renderBlock(block));
                }
            }

            // <dataValidations>
            if (sheet.dataValidations && sheet.dataValidations.length) {
                children.push(xml.el('dataValidations',
                    { count: String(sheet.dataValidations.length) },
                    sheet.dataValidations.map(renderDataValidation)));
            }

            // <hyperlinks>
            if (sheet.hyperlinks && sheet.hyperlinks.length) {
                const _ridAlloc = createRidAllocator({ prefix: 'rIdH' });
                const hlinks = sheet.hyperlinks.map(h => {
                    const a = { ref: h.ref };
                    if (h.target) {
                        const rId = _ridAlloc.next();
                        hyperlinkRels.push({
                            Id: rId, Type: REL_TYPE_HYPERLINK,
                            Target: h.target,
                            TargetMode: h.external !== false ? 'External' : undefined
                        });
                        a['r:id'] = rId;
                    }
                    if (h.location) a.location = h.location;
                    if (h.tooltip)  a.tooltip = h.tooltip;
                    if (h.display)  a.display = h.display;
                    return xml.el('hyperlink', a);
                });
                // Clean undefined attrs (TargetMode for internal links).
                for (const rel of hyperlinkRels) {
                    if (rel.TargetMode === undefined) delete rel.TargetMode;
                }
                children.push(xml.el('hyperlinks', {}, hlinks));
            }

            // <drawing> — refers to xl/drawings/drawing{N}.xml that
            // holds anchored charts / images. Emitted before <legacyDrawing>
            // per ECMA-376 schema ordering.
            if (extraRels && extraRels.drawingRid) {
                children.push(xml.el('drawing',
                    { 'r:id': extraRels.drawingRid }));
            }

            // <legacyDrawing> — bridges the worksheet to the VML drawing
            // that holds the comment shapes. Emitted before <tableParts>
            // per ECMA-376 schema ordering.
            if (extraRels && extraRels.legacyDrawingRid) {
                children.push(xml.el('legacyDrawing',
                    { 'r:id': extraRels.legacyDrawingRid }));
            }

            // <tableParts>
            if (sheet.tableRefs && sheet.tableRefs.length) {
                let i = hyperlinkRels.length + 1;
                children.push(xml.el('tableParts',
                    { count: String(sheet.tableRefs.length) },
                    sheet.tableRefs.map(() =>
                        xml.el('tablePart', { 'r:id': `rId${i++}` }))));
            }

            if (sheet._extras) for (const ex of sheet._extras) children.push(ex);

            return xml.serialize(xml.el('worksheet',
                { xmlns: SS_NS, 'xmlns:r': RELS_NS }, children));
        }

        function renderSheetView(sv) {
            const a = {};
            if (sv.workbookViewId != null) a.workbookViewId = String(sv.workbookViewId);
            else                            a.workbookViewId = '0';
            if (sv.zoomScale != null)     a.zoomScale = String(sv.zoomScale);
            if (sv.tabSelected)           a.tabSelected = '1';
            if (sv.showGridLines === false) a.showGridLines = '0';
            if (sv.rightToLeft)           a.rightToLeft = '1';
            const children = [];
            if (sv.pane) {
                const pa = {};
                if (sv.pane.xSplit != null)      pa.xSplit = String(sv.pane.xSplit);
                if (sv.pane.ySplit != null)      pa.ySplit = String(sv.pane.ySplit);
                if (sv.pane.topLeftCell)         pa.topLeftCell = sv.pane.topLeftCell;
                if (sv.pane.activePane)          pa.activePane = sv.pane.activePane;
                if (sv.pane.state)               pa.state = sv.pane.state;
                children.push(xml.el('pane', pa));
            }
            return xml.el('sheetView', a, children);
        }

        function renderDataValidation(dv) {
            const a = { sqref: dv.sqref };
            if (dv.type)              a.type = dv.type;
            if (dv.operator)          a.operator = dv.operator;
            if (dv.allowBlank != null) a.allowBlank = writeBoolAttr(dv.allowBlank);
            if (dv.showDropDown != null) a.showDropDown = writeBoolAttr(dv.showDropDown);
            if (dv.showInputMessage != null) a.showInputMessage = writeBoolAttr(dv.showInputMessage);
            if (dv.showErrorMessage != null) a.showErrorMessage = writeBoolAttr(dv.showErrorMessage);
            if (dv.errorStyle)        a.errorStyle = dv.errorStyle;
            if (dv.errorTitle)        a.errorTitle = dv.errorTitle;
            if (dv.error)             a.error = dv.error;
            if (dv.promptTitle)       a.promptTitle = dv.promptTitle;
            if (dv.prompt)            a.prompt = dv.prompt;
            const children = [];
            if (dv.formula1) children.push(xml.el('formula1', {}, [xml.text(dv.formula1)]));
            if (dv.formula2) children.push(xml.el('formula2', {}, [xml.text(dv.formula2)]));
            return xml.el('dataValidation', a, children);
        }

        function renderCell(val, r, c, internString) {
            const ref = cellRef(r, c);
            const cell = normalizeCell(val);

            const a = { r: ref };
            if (cell.s != null) a.s = String(cell.s);

            // Formula cell — emit <f> + cached value if any.
            if (cell.formula) {
                const inner = [xml.el('f', {}, [xml.text(cell.formula)])];
                if (cell.value != null && cell.value !== '') {
                    inner.push(xml.el('v', {}, [xml.text(String(cell.value))]));
                }
                if (cell.t && cell.t !== 'n') a.t = cell.t;
                return xml.el('c', a, inner);
            }

            if (cell.t === 'inlineStr') {
                a.t = 'inlineStr';
                return xml.el('c', a, [
                    xml.el('is', {}, [
                        xml.el('t', { 'xml:space': 'preserve' },
                            [xml.text(String(cell.value))])
                    ])
                ]);
            }
            if (cell.t === 's') {
                const idx = internString(String(cell.value));
                a.t = 's';
                return xml.el('c', a, [xml.el('v', {}, [xml.text(String(idx))])]);
            }
            if (cell.t === 'b') {
                a.t = 'b';
                return xml.el('c', a, [xml.el('v', {}, [xml.text(cell.value ? '1' : '0')])]);
            }
            // numeric — empty cell carries no <v>.
            if (cell.value === null || cell.value === undefined) {
                return xml.el('c', a, []);
            }
            return xml.el('c', a, [xml.el('v', {}, [xml.text(String(cell.value))])]);
        }

        function normalizeCell(val) {
            if (val == null) return { value: null, t: 'n' };
            if (typeof val === 'object' && val.type === 'cell') {
                if (val.formula) return { ...val, t: val.t || 'n' };
                if (val.t)        return val;
                return { ...val, t: inferT(val.value) };
            }
            return {
                type: 'cell',
                value: typeof val === 'number' ? val
                     : typeof val === 'boolean' ? val
                     : String(val),
                t: inferT(val)
            };
        }

        function inferT(v) {
            if (typeof v === 'number') return 'n';
            if (typeof v === 'boolean') return 'b';
            return 's';
        }

        // --- Read ---

        // The archive limits of `opc.read`, picked from the read options;
        // an absent key keeps the opc default, 0 disables that check.
        function archiveLimits(o) {
            return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio } : undefined;
        }

        /**
         * Read a `.xlsx` package.
         *
         * @param {Uint8Array} bytes
         * @param {object} [readOpts] the xlsx resource caps
         *        (`maxSheets`, `maxRowsPerSheet`, `maxCellsPerSheet`) and
         *        the archive limits below.
         * @param {number} [readOpts.maxParts] archive limit forwarded to
         *        `opc.read` (default 1024 entries; `0` disables).
         * @param {number} [readOpts.maxUncompressed] archive limit forwarded
         *        to `opc.read` (default 256 MiB in total; `0` disables).
         * @param {number} [readOpts.maxRatio] archive limit forwarded to
         *        `opc.read` (default 200 per entry; `0` disables).
         */
        function read(bytes, readOpts) {
            const pkg = opc.read(bytes, archiveLimits(readOpts));
            const { value: result, unmodelledParts } =
                trackUnmodelledParts(pkg, p => readPackage(p, readOpts));
            result.unmodelledParts = unmodelledParts;
            return result;
        }

        // The read pass proper, over an access-tracking view of
        // `pkg.parts` (see `ooxmlShared.trackUnmodelledParts`).
        function readPackage(pkg, readOpts) {
            const pkgRels = pkg.rels['/'] || [];
            const docRel = pkgRels.find(r => r.Type.endsWith('/officeDocument'));
            if (!docRel) throw new ParseError('xlsx/missing-officeDocument-rel',
                'xlsx: no officeDocument relationship');
            const wbPart = relsMod.resolveTarget('/', docRel.Target);

            const wbBytes = pkg.parts[wbPart];
            if (!wbBytes) throw new ParseError('xlsx/missing-workbook-part',
                `xlsx: missing workbook ${wbPart}`,
                { context: { partName: wbPart } });
            // Resource caps, resolved once. `maxSheets` is checked against the
            // workbook's sheet list; the row and cell caps are checked on a
            // pre-scan of each worksheet part's text, before it is parsed,
            // and again while its rows are mapped (gap-padding cells
            // included). The opc read limits bound the part bytes first.
            // A cap of 0 disables that check.
            const limits = {
                maxSheets: (readOpts && readOpts.maxSheets !== undefined)
                    ? readOpts.maxSheets : 64,
                maxRowsPerSheet: (readOpts && readOpts.maxRowsPerSheet !== undefined)
                    ? readOpts.maxRowsPerSheet : 200000,
                maxCellsPerSheet: (readOpts && readOpts.maxCellsPerSheet !== undefined)
                    ? readOpts.maxCellsPerSheet : 5000000
            };
            let wbRoot;
            try {
                wbRoot = mc.process(xml.parse(decodeText(wbBytes)));
            } catch (e) {
                throw new ParseError('xlsx/invalid-workbook-xml',
                    'xlsx: failed to parse workbook XML',
                    { context: { partName: wbPart }, cause: e });
            }
            const wbRels = pkg.rels[wbPart] || [];

            // Optional shared strings.
            let sharedStrings = [];
            const sstRel = wbRels.find(r => r.Type === REL_TYPE_SHARED_STRINGS
                                          || r.Type.endsWith('/sharedStrings'));
            if (sstRel) {
                const sstPart = relsMod.resolveTarget(wbPart, sstRel.Target);
                const sstBytes = pkg.parts[sstPart];
                if (sstBytes) sharedStrings = parseSharedStrings(decodeText(sstBytes));
            }

            // Optional styles.
            let styles;
            const stylesRel = wbRels.find(r => r.Type === stylesMod.REL_TYPE_STYLES);
            if (stylesRel) {
                const stylesPart = relsMod.resolveTarget(wbPart, stylesRel.Target);
                const stylesBytes = pkg.parts[stylesPart];
                if (stylesBytes) styles = stylesMod.parse(stylesBytes);
            }

            // Optional persons (threaded comments registry, workbook-level).
            let persons;
            const personsRel = wbRels.find(r => r.Type === tcMod.REL_TYPE_PERSON);
            if (personsRel) {
                const personsPart = relsMod.resolveTarget(wbPart, personsRel.Target);
                const personsBytes = pkg.parts[personsPart];
                if (personsBytes) persons = tcMod.parsePersons(personsBytes);
            }

            // Defined names (workbook-level).
            const definedNames = [];
            const dnEl = xml.findChild(wbRoot, 'definedNames');
            if (dnEl) {
                for (const c of xml.findAll(dnEl, 'definedName')) {
                    const dn = { name: c.attrs.name, value: xml.textContent(c) };
                    if (c.attrs.localSheetId != null) dn.scope = Number(c.attrs.localSheetId);
                    if (c.attrs.hidden === '1')       dn.hidden = true;
                    definedNames.push(dn);
                }
            }

            // Sheets + collected tables.
            const sheets = [];
            const tables = [];
            const sheetsEl = xml.findChild(wbRoot, 'sheets');
            if (sheetsEl) {
                const sheetEls = xml.findAll(sheetsEl, 'sheet');
                if (limits.maxSheets && sheetEls.length > limits.maxSheets) {
                    throw new ParseError('xlsx/limit-exceeded',
                        `xlsx: workbook declares more sheets than allowed`,
                        { context: { limit: 'maxSheets',
                            max: limits.maxSheets, actual: sheetEls.length } });
                }
                for (const sEl of sheetEls) {
                    const rid = sEl.attrs['r:id'];
                    const rel = wbRels.find(r => r.Id === rid);
                    if (!rel) continue;
                    const wsPart = relsMod.resolveTarget(wbPart, rel.Target);
                    const wsBytes = pkg.parts[wsPart];
                    if (!wsBytes) continue;

                    const wsRels = pkg.rels[wsPart] || [];
                    const sheet = parseSheet(decodeText(wsBytes), sharedStrings, wsRels,
                        limits, wsPart);
                    sheet.name = sEl.attrs.name;
                    if (sEl.attrs.state) sheet.state = sEl.attrs.state;

                    // Resolve tablePart references → actual table objects.
                    if (sheet._tableRefs) {
                        sheet.tableRefs = [];
                        for (const tableRid of sheet._tableRefs) {
                            const tRel = wsRels.find(r => r.Id === tableRid);
                            if (!tRel) continue;
                            const tPart = relsMod.resolveTarget(wsPart, tRel.Target);
                            const tBytes = pkg.parts[tPart];
                            if (!tBytes) continue;
                            const t = tablesMod.parse(decodeText(tBytes));
                            tables.push(t);
                            sheet.tableRefs.push(t.id);
                        }
                        delete sheet._tableRefs;
                    }

                    // Comments part — typed parse + author resolution.
                    const commentsRel = wsRels.find(r =>
                        r.Type === commentsMod.REL_TYPE_COMMENTS);
                    if (commentsRel) {
                        const commentsPart = relsMod.resolveTarget(wsPart, commentsRel.Target);
                        const cBytes = pkg.parts[commentsPart];
                        if (cBytes) {
                            const parsed = commentsMod.parse(decodeText(cBytes));
                            sheet.comments = parsed.comments;
                            if (parsed.authors && parsed.authors.length) {
                                sheet.commentAuthors = parsed.authors;
                            }
                        }
                    }
                    delete sheet._legacyDrawingRid;

                    // Threaded comments part (modern).
                    const tcRel = wsRels.find(r =>
                        r.Type === tcMod.REL_TYPE_THREADED_COMMENT);
                    if (tcRel) {
                        const tcPart = relsMod.resolveTarget(wsPart, tcRel.Target);
                        const tcBytes = pkg.parts[tcPart];
                        if (tcBytes) {
                            sheet.threadedComments = tcMod.parseThreadedComments(
                                decodeText(tcBytes));
                        }
                    }

                    // Drawings part — anchors + charts + images.
                    if (sheet._drawingRid) {
                        const drawingRel = wsRels.find(r => r.Id === sheet._drawingRid);
                        if (drawingRel) {
                            const drawingPart = relsMod.resolveTarget(wsPart, drawingRel.Target);
                            const dBytes = pkg.parts[drawingPart];
                            if (dBytes) {
                                const parsed = drawingsMod.parse(decodeText(dBytes));
                                const drawingRels = pkg.rels[drawingPart] || [];
                                sheet.drawings = resolveDrawingEntries(
                                    parsed.entries, drawingPart, drawingRels, pkg);
                            }
                        }
                    }
                    delete sheet._drawingRid;

                    sheets.push(sheet);
                }
            }

            const workbook = { type: 'workbook', sheets, sharedStrings };
            if (styles)              workbook.styles = styles;
            if (definedNames.length) workbook.definedNames = definedNames;
            if (tables.length)       workbook.tables = tables;
            if (persons && persons.length) workbook.persons = persons;

            walker.applyHydrate(workbook);
            return { workbook, package: pkg };
        }

        function resolveDrawingEntries(entries, drawingPart, drawingRels, pkg) {
            const out = [];
            for (const e of entries) {
                const entry = {
                    anchor: e.anchor,
                    cx: e.cx, cy: e.cy,
                    offsetX: e.offsetX, offsetY: e.offsetY
                };
                if (e.graphicFrameId != null) entry.id = e.graphicFrameId;
                else if (e.picId != null)     entry.id = e.picId;
                else if (e.id != null)        entry.id = e.id;
                if (e.graphicFrameName)       entry.name = e.graphicFrameName;
                else if (e.picName)           entry.name = e.picName;
                else if (e.name)              entry.name = e.name;
                if (e.description)            entry.description = e.description;
                if (e.title)                  entry.title = e.title;
                if (e.prstGeom)               entry.prstGeom = e.prstGeom;

                if (e.type === 'chart' && e.chartRef) {
                    const rel = drawingRels.find(r => r.Id === e.chartRef);
                    if (rel) {
                        const chartPart = relsMod.resolveTarget(drawingPart, rel.Target);
                        const cBytes = pkg.parts[chartPart];
                        if (cBytes) {
                            entry.chart = chartMod.parse(decodeText(cBytes));
                        }
                    }
                } else if (e.type === 'picture' && e.embedRef) {
                    const rel = drawingRels.find(r => r.Id === e.embedRef);
                    if (rel) {
                        const imgPart = relsMod.resolveTarget(drawingPart, rel.Target);
                        const data = pkg.parts[imgPart];
                        if (data) {
                            const ct = pkg.contentTypes
                                && pkg.contentTypes.defaults
                                && pkg.contentTypes.defaults[
                                    imgPart.slice(imgPart.lastIndexOf('.') + 1).toLowerCase()
                                ];
                            entry.image = {
                                data,
                                contentType: ct || sniffImageType(data),
                                rId: e.embedRef
                            };
                        }
                    }
                } else if (e.type === 'shape' && e.shapeProps) {
                    entry.shapeProps = e.shapeProps;
                    if (e.txBody) entry.txBody = e.txBody;
                } else if (e._node) {
                    entry._node = e._node;
                }
                out.push(entry);
            }
            return out;
        }

        function limitExceeded(limit, max, actual, partName) {
            return new ParseError('xlsx/limit-exceeded',
                `xlsx: sheet exceeds ${limit}`,
                { context: { limit, max, actual, partName } });
        }

        function countMatches(re, text) {
            re.lastIndex = 0;
            let n = 0;
            while (re.exec(text) !== null) n++;
            return n;
        }

        /**
         * Count the `<row>` and `<c>` start tags of a worksheet part's raw
         * text and throw when a cap is exceeded — before the XML tree is
         * built. `<rowBreaks>`, `<cols>` and `<cfRule>` do not match.
         */
        function preScanSheet(text, limits, partName) {
            if (limits.maxRowsPerSheet) {
                const rows = countMatches(ROW_TAG_RE, text);
                if (rows > limits.maxRowsPerSheet) {
                    throw limitExceeded('maxRowsPerSheet',
                        limits.maxRowsPerSheet, rows, partName);
                }
            }
            if (limits.maxCellsPerSheet) {
                const cells = countMatches(CELL_TAG_RE, text);
                if (cells > limits.maxCellsPerSheet) {
                    throw limitExceeded('maxCellsPerSheet',
                        limits.maxCellsPerSheet, cells, partName);
                }
            }
        }

        function parseSheet(text, sharedStrings, wsRels, limits, partName) {
            preScanSheet(text, limits, partName);
            const root = mc.process(xml.parse(text));
            const sheet = { rows: [] };

            const svs = xml.findChild(root, 'sheetViews');
            if (svs) sheet.sheetViews = xml.findAll(svs, 'sheetView').map(parseSheetView);

            const cols = xml.findChild(root, 'cols');
            if (cols) sheet.cols = xml.findAll(cols, 'col').map(parseColEl);

            const data = xml.findChild(root, 'sheetData');
            if (data) {
                // Every cell the reader materialises — the empty cells padded
                // in for column gaps included — spends one unit of budget.
                const budget = { max: limits.maxCellsPerSheet, used: 0, partName };
                for (const rEl of xml.findAll(data, 'row')) {
                    if (limits.maxRowsPerSheet
                        && sheet.rows.length >= limits.maxRowsPerSheet) {
                        throw limitExceeded('maxRowsPerSheet',
                            limits.maxRowsPerSheet, sheet.rows.length + 1, partName);
                    }
                    sheet.rows.push(parseRow(rEl, sharedStrings, budget));
                }
            }

            const af = xml.findChild(root, 'autoFilter');
            if (af) sheet.autoFilter = { ref: af.attrs.ref };

            const mergeEl = xml.findChild(root, 'mergeCells');
            if (mergeEl) sheet.merges = xml.findAll(mergeEl, 'mergeCell').map(m => m.attrs.ref);

            const cfBlocks = xml.findAll(root, 'conditionalFormatting');
            if (cfBlocks.length) {
                sheet.conditionalFormatting = cfBlocks.map(b => cfMod.parseBlock(b));
            }

            const dvs = xml.findChild(root, 'dataValidations');
            if (dvs) sheet.dataValidations = xml.findAll(dvs, 'dataValidation').map(parseDataValidation);

            const hl = xml.findChild(root, 'hyperlinks');
            if (hl) {
                sheet.hyperlinks = xml.findAll(hl, 'hyperlink').map(hEl => {
                    const out = { ref: hEl.attrs.ref };
                    if (hEl.attrs['r:id']) {
                        const rid = hEl.attrs['r:id'];
                        const rel = wsRels.find(r => r.Id === rid);
                        if (rel) {
                            out.target = rel.Target;
                            out.external = rel.TargetMode === 'External';
                        }
                    }
                    if (hEl.attrs.location) out.location = hEl.attrs.location;
                    if (hEl.attrs.tooltip)  out.tooltip = hEl.attrs.tooltip;
                    if (hEl.attrs.display)  out.display = hEl.attrs.display;
                    return out;
                });
            }

            const tparts = xml.findChild(root, 'tableParts');
            if (tparts) sheet._tableRefs = xml.findAll(tparts, 'tablePart').map(tp => tp.attrs['r:id']);

            const legacyDrawing = xml.findChild(root, 'legacyDrawing');
            if (legacyDrawing && legacyDrawing.attrs['r:id']) {
                sheet._legacyDrawingRid = legacyDrawing.attrs['r:id'];
            }

            const drawingEl = xml.findChild(root, 'drawing');
            if (drawingEl && drawingEl.attrs['r:id']) {
                sheet._drawingRid = drawingEl.attrs['r:id'];
            }

            return sheet;
        }

        function parseSheetView(sv) {
            const out = {};
            const a = sv.attrs;
            if (a.workbookViewId != null) out.workbookViewId = Number(a.workbookViewId);
            if (a.zoomScale != null)      out.zoomScale = Number(a.zoomScale);
            if (a.tabSelected === '1')    out.tabSelected = true;
            if (a.showGridLines === '0')  out.showGridLines = false;
            if (a.rightToLeft === '1')    out.rightToLeft = true;
            const pane = xml.findChild(sv, 'pane');
            if (pane) {
                const p = {};
                if (pane.attrs.xSplit != null)   p.xSplit = Number(pane.attrs.xSplit);
                if (pane.attrs.ySplit != null)   p.ySplit = Number(pane.attrs.ySplit);
                if (pane.attrs.topLeftCell)      p.topLeftCell = pane.attrs.topLeftCell;
                if (pane.attrs.activePane)       p.activePane = pane.attrs.activePane;
                if (pane.attrs.state)            p.state = pane.attrs.state;
                out.pane = p;
            }
            return out;
        }

        function parseColEl(c) {
            const out = { min: Number(c.attrs.min), max: Number(c.attrs.max) };
            if (c.attrs.width)         out.width = Number(c.attrs.width);
            if (c.attrs.hidden === '1') out.hidden = true;
            if (c.attrs.style != null)  out.style = Number(c.attrs.style);
            if (c.attrs.bestFit === '1') out.bestFit = true;
            return out;
        }

        function parseDataValidation(el) {
            const out = { sqref: el.attrs.sqref };
            for (const k of ['type', 'operator', 'errorStyle',
                              'errorTitle', 'error', 'promptTitle', 'prompt']) {
                if (el.attrs[k]) out[k] = el.attrs[k];
            }
            for (const k of ['allowBlank', 'showDropDown',
                              'showInputMessage', 'showErrorMessage']) {
                if (el.attrs[k] != null) out[k] = readBoolAttr(el.attrs[k]);
            }
            const f1 = xml.findChild(el, 'formula1');
            const f2 = xml.findChild(el, 'formula2');
            if (f1) out.formula1 = xml.textContent(f1);
            if (f2) out.formula2 = xml.textContent(f2);
            return out;
        }

        /**
         * Spend one cell of the sheet's budget; throw the moment the total
         * exceeds `budget.max` (`0` = unbounded).
         */
        function spendCell(budget) {
            budget.used++;
            if (budget.max && budget.used > budget.max) {
                throw limitExceeded('maxCellsPerSheet', budget.max,
                    budget.used, budget.partName);
            }
        }

        function parseRow(rEl, sharedStrings, budget) {
            const row = [];
            let expectedCol = 0;
            for (const cEl of xml.findAll(rEl, 'c')) {
                if (cEl.attrs.r) {
                    const pos = parseRef(cEl.attrs.r);
                    if (pos) {
                        while (expectedCol < pos.col) {
                            spendCell(budget);
                            row.push({ type: 'cell', value: null, t: 'n' });
                            expectedCol++;
                        }
                    }
                }
                spendCell(budget);
                row.push(parseCell(cEl, sharedStrings));
                expectedCol++;
            }
            return row;
        }

        function parseCell(cEl, sharedStrings) {
            const t = cEl.attrs.t || 'n';
            const ref = cEl.attrs.r;
            const fEl = xml.findChild(cEl, 'f');
            const formula = fEl ? xml.textContent(fEl) : undefined;
            const s = cEl.attrs.s != null ? Number(cEl.attrs.s) : undefined;

            let value;
            if (t === 'inlineStr') {
                const is = xml.findChild(cEl, 'is');
                const tEl = is && xml.findChild(is, 't');
                value = tEl ? xml.textContent(tEl) : '';
            } else if (t === 's') {
                const vEl = xml.findChild(cEl, 'v');
                const idx = vEl ? Number(xml.textContent(vEl)) : -1;
                value = sharedStrings[idx] != null ? sharedStrings[idx] : '';
            } else if (t === 'b') {
                const vEl = xml.findChild(cEl, 'v');
                value = vEl && xml.textContent(vEl) === '1';
            } else if (t === 'str') {
                const vEl = xml.findChild(cEl, 'v');
                value = vEl ? xml.textContent(vEl) : '';
            } else { // numeric
                const vEl = xml.findChild(cEl, 'v');
                if (vEl) {
                    const raw = xml.textContent(vEl);
                    const num = Number(raw);
                    value = Number.isFinite(num) ? num : raw;
                } else {
                    value = null;
                }
            }

            const out = { type: 'cell', value, t };
            if (formula)      out.formula = formula;
            if (ref)          out.ref = ref;
            if (s !== undefined) out.s = s;
            return out;
        }

        const api = {
            read, write,
            use,
            colName, colIndex, cellRef, parseRef,
            parseSharedStrings, serializeSharedStrings,
            CT_WORKBOOK, CT_SHEET, CT_SHARED_STRINGS,
            REL_TYPE_DOC, REL_TYPE_SHEET, REL_TYPE_SHARED_STRINGS,
            REL_TYPE_HYPERLINK
        };
        return api;
    }
};
