// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML (.docx) reader/writer — orchestrates all
 * the part-level modules.
 *
 * Targets ECMA-376 part 1 §17. `write()` emits the Transitional namespace
 * URIs. `read()` locates elements by their `w:` prefix and does not
 * consult the namespace URI, so the body of a document whose `w:` prefix
 * is bound to the Strict URI is read the same way, then written back with
 * the Transitional URIs.
 *
 * **Supported parts** :
 *
 * | Part | Module | Element types covered |
 * |------|--------|----------------------|
 * | `word/document.xml` | this module + `docxStructure` | paragraphs, runs, tables, sections, hyperlinks, bookmarks, ins/del, footnote/endnote/comment refs |
 * | `word/styles.xml` | `docxStyles` | docDefaults, paragraph/character/table styles |
 * | `word/numbering.xml` | `docxNumbering` | abstract numberings + concrete num instances |
 * | `word/settings.xml` | `docxSettings` | common toggles + zoom + tabStop, preserve-unknowns for the rest |
 * | `word/comments.xml` | `docxComments` | full comment bodies + author/date/initials |
 * | `word/footnotes.xml` | `docxFootnotes` | separator/continuation/normal footnote bodies |
 * | `word/endnotes.xml` | `docxFootnotes` | endnote bodies (same model) |
 * | `word/header*.xml` | `docxHeaders` | header bodies, multiple per section |
 * | `word/footer*.xml` | `docxHeaders` | footer bodies, multiple per section |
 *
 * Inside a modelled part, unknown elements at any container level are
 * preserved in `_extras` arrays and re-emitted on write. `write()`
 * produces the parts its model carries; a part `read()` did not model is
 * not written back — `read()` lists it in `unmodelledParts` — unless the
 * read result is passed as the `carry` write option.
 *
 * **Read result** : `read(bytes)` returns the envelope
 * `{ document, package, documentPart, hyperlinks, headers, footers,
 * images, charts?, customXml?, styles?, numbering?, settings?, comments?,
 * footnotes?, endnotes?, unmodelledParts }`. `document._relationships`,
 * when the body's XML names relationships the model does not write
 * itself (an OLE object, an ActiveX control, a SmartArt diagram, an
 * external picture link …), is `{ part, package }`: the source document
 * part name and the slice of the package those relationships reach,
 * which `write()` writes back. `package` is the plain OPC
 * package (`{ contentTypes, parts, rels }`); `unmodelledParts` is always
 * present, `[{ partName, contentType }]` sorted by `partName`
 * (`contentType` is `null` when `[Content_Types].xml` declares none),
 * `[]` when every part was consumed. `write(document, opts)` takes the
 * model, not the envelope: the `document` tree, plus the part objects
 * (`styles`, `numbering`, `settings`, `comments`, `footnotes`,
 * `endnotes`, `headers`, `footers`, `hyperlinks`, `customXml`) as `opts`.
 *
 * **Extended coverage** is available through the `docx-large` bundle (an
 * estimated ~95 % of real-world usage) and the `docx-full` bundle (every
 * WordprocessingML schema element typed or preserved; the rarest elements
 * are preserved as passthroughs rather than modelled). The `.use(...)` hook lets you wire extras after construction.
 * See `docs/api/bundles/README.md` and `docs/guide/coverage.md`.
 *
 * Inline images / DrawingML shapes, charts, legacy VML, OMML, custom XML
 * data binding and `mc:AlternateContent` are all typed through the core
 * plus the associated extras.
 *
 * @module ooxml/docx
 */

import { ooxmlErrors } from '../errors.js';
import { docxText } from './docx-text.js';
import { opcPackage } from '../opc/package.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { opcRelationships } from '../opc/relationships.js';
import { docxStructure } from './structure.js';
import { docxStyles } from './styles.js';
import { docxNumbering } from './numbering.js';
import { docxSettings } from './settings.js';
import { docxComments } from './comments.js';
import { docxFootnotes } from './footnotes.js';
import { docxHeaders } from './headers.js';
import { docxDrawing } from './drawing.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { docxCustomXml } from './customXml.js';
import { docxWalker } from './docx-walker.js';
import { ooxmlShared } from '../_shared/index.js';

export const docx = {
    name: 'docx',
    dependencies: ['ooxmlErrors', 'docxText',
        'opcPackage', 'xml', 'opcRelationships',
        'docxStructure', 'docxStyles', 'docxNumbering',
        'docxSettings', 'docxComments', 'docxFootnotes', 'docxHeaders',
        'docxDrawing', 'markupCompatibility', 'drawingmlChart',
        'docxCustomXml', 'docxWalker', 'ooxmlShared'
    ],
    deps: [ooxmlErrors, docxText, opcPackage, xml, opcRelationships, docxStructure, docxStyles, docxNumbering, docxSettings, docxComments, docxFootnotes, docxHeaders, docxDrawing, markupCompatibility, drawingmlChart, docxCustomXml, docxWalker, ooxmlShared],

    factory(errors, textMod, opc, xml, relsMod, structure, stylesMod,
            numberingMod, settingsMod, commentsMod, footnotesMod, headersMod,
            drawingMod, mc, chartMod, customXmlMod, walkerMod, shared) {
        const { ParseError, ContractError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText,
                createRidAllocator, lookupCT, trackUnmodelledParts,
                wordRootAttrs, WORD_EXTENSION_PREFIXES } = shared;
        const _toText = textMod.toText;

        const W_NS = NS.W;
        // Word 2012 elements kept through markup-compatibility processing
        // on read ([MS-DOCX] 2.5.1.10 / 2.5.1.11), in `word/document.xml`
        // and in every header, footer, footnotes, endnotes and comments part.
        const REPEATING_SECTION_ELEMENTS = Object.freeze(
            ['w15:repeatingSection', 'w15:repeatingSectionItem']);
        const REL_TYPE_DOC = REL_TYPE.DOC;
        const REL_TYPE_HYPERLINK = REL_TYPE.HYPERLINK;
        const CT_DOCUMENT = CT.DOCUMENT;

        // --- Helpers ---

        // Parse a story part (header, footer, footnotes, endnotes,
        // comments) and run markup-compatibility processing on its root
        // with the same options as `word/document.xml`, before the part's
        // module maps it: ignorable w14 / w15 content is dropped (the two
        // repeating-section elements are kept; the Office extension
        // prefixes are ignorable whether the part lists them or not, as
        // the writer will) and every `mc:Choice` falls
        // through to its Fallback branch, unless `keepAlternate` (the read
        // option `alternateContent: 'keep'`) leaves each
        // `mc:AlternateContent` in place. Invalid XML throws what
        // `xml.parse` throws.
        function storyRoot(bytes, keepAlternate, keepExtensions) {
            const root = xml.parse(decodeText(bytes));
            mc.process(root, mcOptions(keepAlternate === true, keepExtensions === true));
            return root;
        }

        // Markup-compatibility options of a part: the Office extension
        // prefixes are ignorable (removed) unless the read option
        // `extensions: 'keep'` makes them understood (kept).
        function mcOptions(keepAlternate, keepExtensions) {
            const opts = { keepElements: REPEATING_SECTION_ELEMENTS, preserveAlternateContent: keepAlternate,
                ignorablePrefixes: WORD_EXTENSION_PREFIXES };
            if (keepExtensions) opts.supportedPrefixes = WORD_EXTENSION_PREFIXES;
            return opts;
        }

        // The `chartRef` of every typed drawing of a tree: with
        // `alternateContent: 'keep'` only these chart parts are parsed, so
        // a chart a kept Choice alone references stays unconsumed.
        function chartRefsOf(tree) {
            const refs = new Set();
            walkDrawings(tree, d => { if (d.chartRef) refs.add(d.chartRef); });
            return refs;
        }

        // Walk a node tree, calling `cb` on every drawing run-child.
        function walkDrawings(doc, cb) {
            walkNodes(doc, n => {
                if (n && n.type === 'drawing') cb(n);
            });
        }

        // Read: a drawing visitor copying image bytes / chart specs onto
        // each drawing whose embedRef / chartRef is a key of `images` /
        // `charts` (the tables of the part that holds it).
        function attachDrawing(images, charts) {
            return drawing => {
                const img = drawing.embedRef && images[drawing.embedRef];
                if (img) {
                    drawing.image = drawing.image || {};
                    drawing.image.data = img.data;
                    drawing.image.contentType = img.contentType;
                    drawing.image.rId = drawing.embedRef;
                }
                const svg = drawing.svgRef && images[drawing.svgRef];
                if (svg) {
                    drawing.image = drawing.image || {};
                    drawing.image.svg = { data: svg.data, contentType: SVG_CT, rId: drawing.svgRef };
                }
                if (drawing.chartRef && charts && charts[drawing.chartRef]) {
                    drawing.chart = charts[drawing.chartRef].chart;
                    drawing.kind = 'chart';
                }
            };
        }

        // Read: the image and chart tables of one story part, from its own
        // relationships (same shapes as the read result's `images` /
        // `charts`).
        function storyDrawingTables(pkg, partName, wantChart) {
            const images = {};
            const charts = {};
            for (const rel of pkg.rels[partName] || []) {
                if (rel.TargetMode === 'External') continue;
                if (rel.Type === drawingMod.REL_TYPE_IMAGE) {
                    const target = relsMod.resolveTarget(partName, rel.Target);
                    const data = pkg.parts[target];
                    if (!data) continue;
                    images[rel.Id] = { partName: target, data,
                        contentType: lookupCT(pkg, target) || drawingMod.sniffImageType(data) };
                } else if (rel.Type === chartMod.REL_TYPE_CHART) {
                    if (wantChart && !wantChart.has(rel.Id)) continue;
                    const target = relsMod.resolveTarget(partName, rel.Target);
                    const data = pkg.parts[target];
                    if (data) charts[rel.Id] = { partName: target, chart: chartMod.parse(data) };
                }
            }
            return { images, charts };
        }

        function walkNodes(node, cb) {
            if (!node) return;
            if (Array.isArray(node)) { for (const n of node) walkNodes(n, cb); return; }
            cb(node);
            if (node.body)     walkNodes(node.body, cb);
            if (node.children) walkNodes(node.children, cb);
            if (node.rows)     walkNodes(node.rows, cb);
            if (node.cells)    walkNodes(node.cells, cb);
            // runs may carry a drawing payload nested under .drawing
            if (node.drawing)  walkNodes(node.drawing, cb);
            // SDT containers wrap their inner block content
            if (node.content)  walkNodes(node.content, cb);
            // Drawings can host textboxes whose content is itself a block
            // of paragraphs / runs / drawings — descend so nested images
            // (image-in-textbox-in-shape) are not silently dropped.
            if (node.txbxContent) walkNodes(node.txbxContent, cb);
            // Markup-compatibility fallback content — when MC kept the
            // legacy branch, drawings inside can still resolve images.
            if (node.altContent)  walkNodes(node.altContent, cb);
        }

        // --- Extension support (`.use(...)`) ---
        //
        // Consumers can plug already-instantiated extension objects
        // (results of `extraModule.factory(xml, core)`). After read(),
        // each visited rPr/pPr/table/row/tcPr/settings node is offered
        // to extensions implementing the matching `hydrate*` hook;
        // before write(), the corresponding `dehydrate*` hook runs.
        // Hook names: hydrateRunProperties, hydrateParagraphProperties,
        // hydrateTable, hydrateRow, hydrateTcPr, hydrateSettings (and
        // their `dehydrate*` counterparts). Extensions implement any
        // subset; missing hooks are skipped.
        //
        // The actual walker / dispatcher lives in `./docx-walker.js`;
        // we wire a fresh instance here (idempotent registration is
        // baked into the walker's `use`).
        const walker = walkerMod.createWalker();

        function use(...extensions) {
            walker.use(...extensions);
            return api;
        }

        // --- Read ---

        // The archive limits of `opc.read`, picked from the read options;
        // an absent key keeps the opc default, 0 disables that check.
        function archiveLimits(o) {
            return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio, maxDepth: o.maxDepth } : undefined;
        }

        /**
         * Read a `.docx` package.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts]
         * @param {number} [opts.maxParts] archive limit forwarded to
         *        `opc.read` (default 8192 entries; `0` disables).
         * @param {number} [opts.maxUncompressed] archive limit forwarded to
         *        `opc.read` (default 256 MiB in total; `0` disables).
         * @param {number} [opts.maxRatio] archive limit forwarded to
         *        `opc.read` (default 200 per entry; `0` disables).
         * @param {number} [opts.maxDepth] archive limit forwarded to
         *        `opc.read`: element depth of any XML part (default
         *        1000; `0` disables).
         * @param {'fallback'|'keep'|'choice'} [opts.alternateContent='fallback']
         *        `'fallback'` resolves every `mc:AlternateContent` to its
         *        `mc:Fallback`; `'keep'` leaves it in place, verbatim, for
         *        the write (a chart only a kept Choice references is then
         *        left unconsumed, so `carry` writes it back); `'choice'`
         *        reads a run's construct whose one `mc:Choice` holds one
         *        `w:drawing` and requires only `wps`, `wpg` or `wpc` as that
         *        drawing, typed, with `alternate: { requires, fallback }`
         *        (the write wraps it back unless it was edited), and every
         *        other construct as `'keep'` does.
         * @param {'drop'|'keep'} [opts.extensions='drop'] `'drop'` removes
         *        the elements and attributes of the Office extension
         *        namespaces (`w14`, `w15`, `w16*`, `wp14`) as markup
         *        compatibility allows; `'keep'` keeps them in the model
         *        (in the `_extras` of the bags that hold them), for a
         *        save-back.
         */
        function read(bytes, opts) {
            const alternate = opts && opts.alternateContent !== undefined ? opts.alternateContent : 'fallback';
            if (alternate !== 'fallback' && alternate !== 'keep' && alternate !== 'choice') {
                throw new ContractError('docx/invalid-alternate-content',
                    "docx.read: opts.alternateContent must be 'fallback', 'keep' or 'choice'",
                    { context: { received: alternate === null ? 'null' : typeof alternate === 'string' ? alternate : typeof alternate } });
            }
            const extensions = opts && opts.extensions !== undefined ? opts.extensions : 'drop';
            if (extensions !== 'drop' && extensions !== 'keep') {
                throw new ContractError('docx/invalid-extensions',
                    "docx.read: opts.extensions must be 'drop' or 'keep'",
                    { context: { received: extensions === null ? 'null' : typeof extensions === 'string' ? extensions : typeof extensions } });
            }
            const pkg = opc.read(bytes, archiveLimits(opts));
            const { value: result, unmodelledParts } =
                trackUnmodelledParts(pkg, p => {
                    try {
                        return structure.withChoiceDrawings(alternate === 'choice',
                            () => readPackage(p, alternate !== 'fallback', extensions === 'keep'));
                    } catch (e) {
                        throw typedPartXml(e);
                    }
                });
            result.unmodelledParts = unmodelledParts;
            // From the plain package, after the typed read: the slice is
            // not a consumed part, so `unmodelledParts` stays as it is.
            for (const keep of keptParts.get(result) || []) {
                const kept = keptRelationships(pkg, keep.part, keep.named, keep.written || writtenIds(result));
                const model = typeof keep.model === 'function' ? keep.model() : keep.model;
                if (kept && model) model._relationships = kept;
            }
            return result;
        }

        // A relationship reference in a part's XML: an `r:*` attribute or
        // `o:relid` (the reference repair reads them the same way).
        const REFERENCE_ATTR = /\b(?:r:[A-Za-z]+|o:relid)="([^"]+)"/g;

        // Per read result, the parts whose relationships are kept, set by
        // the read pass: `{ model, part, named, written }` — the model
        // object that gets `_relationships` (or a function returning it),
        // its source part, the ids its XML names once markup compatibility
        // is processed (a branch the read drops names none) and the ids the
        // writer writes itself (null for the document: `writtenIds`).
        const keptParts = new WeakMap();

        /** The relationship ids `bytes` (a part not markup-processed) names. */
        function idsIn(bytes) {
            const out = new Set();
            for (const m of decodeText(bytes).matchAll(REFERENCE_ATTR)) out.add(m[1]);
            return out;
        }

        /**
         * The ids a story part's writer writes itself: its hyperlinks, and
         * the pictures, svg pictures and charts of its typed drawings.
         */
        function storyWrittenIds(rels, bodies) {
            const ids = new Set((rels || []).filter(r => r && r.Type === REL_TYPE_HYPERLINK).map(r => r.Id));
            walkDrawings(bodies, d => {
                if (d.image && d.image.data && d.embedRef) ids.add(d.embedRef);
                if (d.svgRef && svgOf(d.image)) ids.add(d.svgRef);
                if (d.chart && d.chartRef) ids.add(d.chartRef);
            });
            return ids;
        }

        /** The relationship ids `el`'s tree names (an `r:*` attribute or `o:relid`). */
        function referencedIds(el, out = new Set()) {
            if (!el || el.type !== 'element') return out;
            for (const [k, v] of Object.entries(el.attrs || {})) {
                if ((k === 'o:relid' || /^r:[A-Za-z]+$/.test(k)) && v) out.add(v);
            }
            for (const c of el.children || []) referencedIds(c, out);
            return out;
        }

        /**
         * The document relationship ids the read returns in its own maps,
         * which the writer writes from them (the hyperlinks, the headers
         * and footers by their keys, the pictures it holds the bytes of
         * through `images`, the charts of its typed drawings): not kept.
         */
        function writtenIds(result) {
            const ids = new Set([...Object.keys(result.hyperlinks), ...Object.keys(result.headers),
                ...Object.keys(result.footers)]);
            for (const [id, img] of Object.entries(result.images)) if (img && img.data instanceof Uint8Array) ids.add(id);
            walkDrawings(result.document, d => { if (d.chart && d.chartRef) ids.add(d.chartRef); });
            return ids;
        }

        /**
         * The relationships of `part` among the `named` ids, those of the
         * `written` ids left out, with the slice of `pkg` they reach: `{ part,
         * package }`, `package` shaped as `carry.package` (`parts` the
         * internal targets and, recursively, theirs — the bytes as read,
         * shared —; `rels` the part's kept relationships and those
         * targets' own; `contentTypes` the source defaults and those
         * targets' overrides). An internal relationship whose target the
         * package lacks (a truncated source) is not kept: the repair could
         * not write it. Null when none is kept.
         */
        function keptRelationships(pkg, part, named, written) {
            if (!named || !named.size) return null;
            const own = (pkg.rels[part] || []).filter(r => r && named.has(r.Id)
                && typeof r.Type === 'string' && typeof r.Target === 'string' && !written.has(r.Id)
                && (r.TargetMode === 'External' || pkg.parts[relsMod.resolveTarget(part, r.Target)] !== undefined));
            if (!own.length) return null;
            const slice = {
                parts: {},
                rels: { [part]: own.map(r => ({ ...r })) },
                contentTypes: { defaults: { ...pkg.contentTypes.defaults }, overrides: {} }
            };
            const reach = (from, rel) => {
                if (!rel || rel.TargetMode === 'External' || typeof rel.Target !== 'string') return;
                const name = relsMod.resolveTarget(from, rel.Target);
                if (name in slice.parts || !pkg.parts[name]) return;
                slice.parts[name] = pkg.parts[name];
                const ct = pkg.contentTypes.overrides[name];
                if (ct) slice.contentTypes.overrides[name] = ct;
                const sub = pkg.rels[name];
                if (!sub || !sub.length) return;
                slice.rels[name] = sub.map(r => ({ ...r }));
                for (const r of sub) reach(name, r);
            };
            for (const r of own) reach(part, r);
            return { part, package: slice };
        }

        /** The ids of a `_relationships` value (`keptOf`'s), `[]` for null. */
        function keptIdsOf(kept) {
            return kept ? kept.package.rels[kept.part].map(r => r && r.Id).filter(id => typeof id === 'string') : [];
        }

        /**
         * The other parts' `_relationships`, by the part name the writer
         * gives each (its comments, notes, numbering, settings, and its
         * headers and footers in their `opts` key order).
         */
        function storyKeptOf(opts) {
            const out = new Map();
            const put = (written, model) => { const k = keptOf(model); if (k) out.set(written, k); };
            put('/word/comments.xml', opts.comments);
            put('/word/footnotes.xml', opts.footnotes);
            put('/word/endnotes.xml', opts.endnotes);
            put('/word/numbering.xml', opts.numbering);
            put('/word/settings.xml', opts.settings);
            Object.keys(opts.headers || {}).forEach((rId, i) => put(`/word/header${i + 1}.xml`, opts.headers[rId]));
            Object.keys(opts.footers || {}).forEach((rId, i) => put(`/word/footer${i + 1}.xml`, opts.footers[rId]));
            return out;
        }

        /** `doc._relationships` when it has the shape `read()` gives it, else null. */
        function keptOf(doc) {
            const k = doc && doc._relationships;
            const p = k && typeof k === 'object' ? k.package : null;
            if (typeof k?.part !== 'string' || !p || typeof p !== 'object' || !p.parts || typeof p.parts !== 'object'
                || !p.rels || typeof p.rels !== 'object' || !Array.isArray(p.rels[k.part])
                || !p.contentTypes || typeof p.contentTypes !== 'object') return null;
            return k;
        }

        // A part the read pass parses without a typed wrapper of its own
        // (styles, numbering, notes, comments, headers …): the fw XML
        // parser's `xml/parse-error` becomes this package's ParseError,
        // the parser's error kept as `cause`. Any other error is returned
        // as it is.
        function typedPartXml(e) {
            if (!e || e.code !== 'xml/parse-error') return e;
            return new ParseError('docx/invalid-part-xml',
                `docx: failed to parse a part's XML (${e.message})`, { cause: e });
        }

        // The read pass proper, over an access-tracking view of
        // `pkg.parts` (see `ooxmlShared.trackUnmodelledParts`).
        function readPackage(pkg, keepAlternate, keepExtensions) {
            const pkgRels = pkg.rels['/'] || [];
            const docRel = pkgRels.find(r => r.Type === REL_TYPE_DOC
                                           || r.Type.endsWith('/officeDocument'));
            if (!docRel) throw new ParseError('docx/missing-officeDocument-rel',
                'docx: no officeDocument relationship');
            const docPart = relsMod.resolveTarget('/', docRel.Target);

            const partBytes = pkg.parts[docPart];
            if (!partBytes) throw new ParseError('docx/missing-document-part',
                `docx: missing part ${docPart}`, { context: { partName: docPart } });

            let root;
            try {
                root = xml.parse(decodeText(partBytes));
            } catch (e) {
                throw new ParseError('docx/invalid-xml',
                    'docx: failed to parse document XML',
                    { context: { partName: docPart }, cause: e });
            }
            // Process markup-compatibility extensions before structural
            // mapping. Without this, w14/w15/w16 elements from Office 2010+
            // files would leak into _extras and confuse the model. The two
            // Word 2012 repeating-section elements are kept: they are
            // modelled as `blockSdt` kinds. Every other w15 element is
            // still dropped. The Office extension prefixes the writer lists
            // in `mc:Ignorable` are ignorable here whether this part lists
            // them or not, so a read of the written part reads as this one.
            mc.process(root, mcOptions(keepAlternate, keepExtensions));
            const keeps = [{ model: null, part: docPart, named: referencedIds(root), written: null }];
            // A story part read from its markup-processed root.
            // A chart part: every id it names kept (the chart writer
            // writes no relationship; the workbook it names among them).
            const keepChart = (chart, partName, data) => {
                keeps.push({ model: chart, part: partName, named: idsIn(data), written: new Set(), bodies: null });
            };
            const storyKeep = (partName, rootEl) => {
                const keep = { model: null, part: partName, named: referencedIds(rootEl), written: null, bodies: null };
                keeps.push(keep);
                return keep;
            };
            const bodyEl = xml.findChild(root, 'w:body');
            if (!bodyEl) throw new ParseError('docx/missing-body',
                'docx: no <w:body> in document',
                { context: { partName: docPart } });

            const { body, sectPr, extras } = structure.parseBody(bodyEl);
            const document = { type: 'document', body };
            if (sectPr) document.sectPr = sectPr;
            // Any other body child, verbatim (written before w:sectPr).
            if (extras.length) document._extras = extras;
            const backgroundEl = xml.findChild(root, 'w:background');
            if (backgroundEl) document.background = parseBackground(backgroundEl);

            // Collect the document part's relationships and resolve linked parts.
            const docRels = pkg.rels[docPart] || [];
            const result = {
                document,
                package: pkg,
                documentPart: docPart,
                hyperlinks: {},
                headers: {},
                footers: {},
                images: {}
            };
            keeps[0].model = document;
            keptParts.set(result, keeps);
            // Story parts parsed below, each as `[partName, bodies]`: their
            // hyperlinks resolve against that part's own relationships.
            const storyParts = [];

            for (const rel of docRels) {
                switch (rel.Type) {
                    case REL_TYPE_HYPERLINK:
                        result.hyperlinks[rel.Id] = {
                            target: rel.Target,
                            external: rel.TargetMode === 'External'
                        };
                        break;
                    case drawingMod.REL_TYPE_IMAGE: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const data = pkg.parts[partName];
                        // Prefer the declared content type from [Content_Types].xml,
                        // fall back to magic-byte sniffing.
                        const declared = lookupCT(pkg, partName);
                        result.images[rel.Id] = {
                            partName,
                            data,
                            contentType: declared || drawingMod.sniffImageType(data)
                        };
                        break;
                    }
                    case chartMod.REL_TYPE_CHART: {
                        // Kept alternate content: parsed below, when a
                        // typed drawing references it.
                        if (keepAlternate) break;
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const data = pkg.parts[partName];
                        if (data) {
                            result.charts = result.charts || {};
                            result.charts[rel.Id] = {
                                partName,
                                chart: chartMod.parse(data)
                            };
                            keepChart(result.charts[rel.Id].chart, partName, data);
                        }
                        break;
                    }
                    case customXmlMod.REL_TYPE_CUSTOM_XML: {
                        const itemPart = relsMod.resolveTarget(docPart, rel.Target);
                        const itemBytes = pkg.parts[itemPart];
                        if (!itemBytes) break;
                        result.customXml = result.customXml || [];
                        const entry = {
                            id: result.customXml.length + 1,
                            xml: decodeText(itemBytes),
                            partName: itemPart
                        };
                        // Resolve the item's customXmlProps rel.
                        const itemRels = pkg.rels[itemPart] || [];
                        const propsRel = itemRels.find(r =>
                            r.Type === customXmlMod.REL_TYPE_CUSTOM_XML_PROPS);
                        if (propsRel) {
                            const propsPart = relsMod.resolveTarget(itemPart, propsRel.Target);
                            const propsBytes = pkg.parts[propsPart];
                            if (propsBytes) {
                                const props = customXmlMod.parseProps(propsBytes);
                                entry.storeItemID = props.storeItemID;
                                if (props.schemaRefs) entry.schemaRefs = props.schemaRefs;
                                entry.propsPart = propsPart;
                            }
                        }
                        result.customXml.push(entry);
                        break;
                    }
                    case stylesMod.REL_TYPE_STYLES: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) result.styles = stylesMod.parse(b);
                        break;
                    }
                    case numberingMod.REL_TYPE_NUMBERING: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.numbering = numberingMod.parse(b);
                            keeps.push({ model: result.numbering, part: partName, named: idsIn(b), written: new Set(), bodies: null });
                        }
                        break;
                    }
                    case settingsMod.REL_TYPE_SETTINGS: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.settings = settingsMod.parse(b);
                            // An extension's settings hook replaces the object: the
                            // field goes on the one the read returns.
                            keeps.push({ model: () => result.settings, part: partName, named: idsIn(b), written: new Set(), bodies: null });
                        }
                        break;
                    }
                    case commentsMod.REL_TYPE_COMMENTS: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            const rootEl = storyRoot(b, keepAlternate, keepExtensions);
                            result.comments = commentsMod.parse(rootEl);
                            storyParts.push([partName, bodiesOf(result.comments.comments)]);
                            Object.assign(storyKeep(partName, rootEl), { model: result.comments, bodies: bodiesOf(result.comments.comments) });
                        }
                        break;
                    }
                    case footnotesMod.REL_TYPE_FOOTNOTES: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            const rootEl = storyRoot(b, keepAlternate, keepExtensions);
                            result.footnotes = footnotesMod.parseFootnotes(rootEl);
                            storyParts.push([partName, bodiesOf(result.footnotes.notes)]);
                            Object.assign(storyKeep(partName, rootEl), { model: result.footnotes, bodies: bodiesOf(result.footnotes.notes) });
                        }
                        break;
                    }
                    case footnotesMod.REL_TYPE_ENDNOTES: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            const rootEl = storyRoot(b, keepAlternate, keepExtensions);
                            result.endnotes = footnotesMod.parseEndnotes(rootEl);
                            storyParts.push([partName, bodiesOf(result.endnotes.notes)]);
                            Object.assign(storyKeep(partName, rootEl), { model: result.endnotes, bodies: bodiesOf(result.endnotes.notes) });
                        }
                        break;
                    }
                    case headersMod.REL_TYPE_HEADER: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            const rootEl = storyRoot(b, keepAlternate, keepExtensions);
                            result.headers[rel.Id] = headersMod.parse(rootEl, 'header');
                            storyParts.push([partName, [result.headers[rel.Id].body]]);
                            Object.assign(storyKeep(partName, rootEl), { model: result.headers[rel.Id], bodies: [result.headers[rel.Id].body] });
                        }
                        break;
                    }
                    case headersMod.REL_TYPE_FOOTER: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            const rootEl = storyRoot(b, keepAlternate, keepExtensions);
                            result.footers[rel.Id] = headersMod.parse(rootEl, 'footer');
                            storyParts.push([partName, [result.footers[rel.Id].body]]);
                            Object.assign(storyKeep(partName, rootEl), { model: result.footers[rel.Id], bodies: [result.footers[rel.Id].body] });
                        }
                        break;
                    }
                }
            }

            // Copy each resolvable hyperlink's target onto its node: the
            // body against the document's relationships, a story part
            // against its own (`pkg.rels`, so no part is consumed).
            attachTargets(document.body, result.hyperlinks);
            for (const [partName, bodies] of storyParts) {
                attachTargets(bodies, hyperlinkTable(pkg.rels[partName]));
            }

            // Attach image bytes / chart specs to each <w:drawing>,
            // resolving its embedRef / chartRef against the relationships of
            // the part that holds it: the body against the document part's,
            // each header, footer, footnotes, endnotes and comments part
            // against its own.
            if (keepAlternate) {
                const wanted = chartRefsOf(document);
                for (const rel of docRels) {
                    if (rel.Type !== chartMod.REL_TYPE_CHART || rel.TargetMode === 'External' || !wanted.has(rel.Id)) continue;
                    const partName = relsMod.resolveTarget(docPart, rel.Target);
                    const data = pkg.parts[partName];
                    if (!data) continue;
                    result.charts = result.charts || {};
                    result.charts[rel.Id] = { partName, chart: chartMod.parse(data) };
                    keepChart(result.charts[rel.Id].chart, partName, data);
                }
            }
            walkDrawings(document, attachDrawing(result.images, result.charts));
            for (const [partName, bodies] of storyParts) {
                const own = storyDrawingTables(pkg, partName, keepAlternate ? chartRefsOf(bodies) : null);
                for (const ch of Object.values(own.charts)) keepChart(ch.chart, ch.partName, pkg.parts[ch.partName]);
                walkDrawings(bodies, attachDrawing(own.images, own.charts));
            }

            for (const keep of keeps) {
                if (keep.bodies) keep.written = storyWrittenIds(pkg.rels[keep.part], keep.bodies);
            }

            walker.applyHydrate(result);
            return result;
        }

        // --- Write ---

        /**
         * Write a typed document tree to `.docx` bytes.
         *
         * `opts`:
         *   - `styles`       — object accepted by `docxStyles.serialize`
         *   - `numbering`    — `docxNumbering` object
         *   - `settings`     — `docxSettings` object
         *   - `comments`     — `docxComments` object
         *   - `footnotes`    — `docxFootnotes.serializeFootnotes` object
         *   - `endnotes`     — `docxFootnotes.serializeEndnotes` object
         *   - `headers`      — `{ rId: { type: 'header', body: […] } }`
         *   - `footers`      — `{ rId: { type: 'footer', body: […] } }`
         *   - `hyperlinks`   — `{ rId: { target, external? } }`
         *   - `images`       — `{ rId: { data, contentType?, fileName? } }`
         *                      (caller-supplied image parts, pre-registered so
         *                      their rIds do not collide)
         *   - `customXml`    — `[{ xml, storeItemID?, schemaRefs? }]` (custom
         *                      XML data parts; a missing `storeItemID` is
         *                      generated and patched back onto the item)
         *   - `carry`        — the `{ package, unmodelledParts }` envelope
         *                      `read()` returns: every listed part is
         *                      written with its bytes, its content type and
         *                      its relationships (see `applyCarry`); absent,
         *                      the output is unchanged
         *   - `danglingNumbering` — `'throw'` (default) or `'keep'`: with
         *                      `'keep'` a list reference to a num the
         *                      numbering does not declare (or with no
         *                      `numbering`) is written as given, as `read()`
         *                      reads it, instead of the two numbering throws
         *   - `preserveInput` — `true` writes from a structured clone of the
         *                      model and of these options (`carry`, only
         *                      read, excepted): the dehydrate pass and the
         *                      ids the writer assigns (`embedRef`, `docId`,
         *                      `storeItemID`) leave the given ones as they
         *                      were; the bytes are the same. Default `false`
         *   - `cleanup`      — an array of named cleanups, each applied to a
         *                      structured clone (the caller's model is left
         *                      alone): `'emptyProperties'` drops every `rPr`
         *                      / `pPr` that is an empty object (an empty
         *                      `<w:rPr/>` / `<w:pPr/>` read from the source,
         *                      written back otherwise) from the body and the
         *                      headers, footers, footnotes, endnotes and
         *                      comments. Default: none
         *
         * Section properties referencing headers/footers (`headerReferences`,
         * `footerReferences`) must use the same `rId` keys as in `opts.headers`
         * / `opts.footers`.
         *
         * Hyperlink relationships: the document part's table is
         * `opts.hyperlinks` when passed (it replaces the map derived from the
         * body's `hyperlink` nodes), else that derived map (`rId` + `target`;
         * `TargetMode="External"` unless the node's `external` is `false`).
         * Each header, footer, footnotes, endnotes and comments part gets its
         * own table, derived the same way from its nodes, written when
         * non-empty.
         *
         * @throws {ContractError} `docx/hyperlink-missing-rid` when a
         *   `hyperlink` node in the body or any story part (header, footer,
         *   footnotes, endnotes, comments) carries a non-empty `target` but
         *   neither an `rId` nor an `anchor` (its target would be lost);
         *   `docx/hyperlink-unresolved-rid` when a `hyperlink` node's
         *   non-empty `rId` is not a key of the table written for its part
         *   (`context.rId`, `context.story`, plus `context.key` for a header
         *   or footer) — the reference would dangle;
         *   `docx/numbering-missing` when a `pPr.numPr` references a
         *   non-zero `numId` and `opts.numbering` is missing — in the body,
         *   any header, footer, footnotes, endnotes or comments part, or
         *   `opts.styles` (a style or the docDefaults); `docx/numbering-
         *   unknown-num` when `opts.numbering` is passed but its `nums` do
         *   not declare that `numId`. Both carry `context.numId`,
         *   `context.story` (`'document'`, `'header'`, `'footer'`,
         *   `'footnotes'`, `'endnotes'`, `'comments'`, `'styles'`), plus
         *   `context.key` for a header or footer and `context.styleId` for
         *   a style (the list reference would dangle) — neither with
         *   `danglingNumbering: 'keep'`; `docx/invalid-dangling-numbering`
         *   for another value of that option; `docx/invalid-preserve-input`
         *   when `opts.preserveInput` is neither `true` nor `false`; `docx/invalid-cleanup`
         *   when `opts.cleanup` is not an array of distinct known cleanup names; `docx/invalid-carry`
         *   when `opts.carry` is given and is not that envelope. All checks run before any part
         *   is rendered and before the dehydrate pass, so a throw leaves the
         *   caller's tree untouched.
         */
        function write(doc, opts) {
            if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
                throw new ContractError('docx/invalid-document',
                    'docx.write: document must be an object with a body',
                    { context: { received: doc === null ? 'null' : typeof doc } });
            }
            if (doc.body !== undefined && !Array.isArray(doc.body)) {
                throw new ContractError('docx/invalid-body',
                    'docx.write: document.body must be an array',
                    { context: { path: 'body', received: typeof doc.body } });
            }
            opts = opts || {};
            if (opts.preserveInput !== undefined && typeof opts.preserveInput !== 'boolean') {
                throw new ContractError('docx/invalid-preserve-input',
                    'docx.write: opts.preserveInput must be true or false',
                    { context: { received: opts.preserveInput === null ? 'null' : typeof opts.preserveInput } });
            }
            const cleanup = cleanupSpec(opts.cleanup);
            if (opts.preserveInput || cleanup.size) {
                // One clone of the model and of the options the writer may
                // patch, so bytes they share stay shared; the read envelope
                // `carry`, only read, is not copied.
                const { carry: envelope, ...rest } = opts;
                const copy = structuredClone({ doc, opts: rest });
                doc = copy.doc;
                opts = envelope === undefined ? copy.opts : { ...copy.opts, carry: envelope };
            }
            if (cleanup.has('emptyProperties')) {
                dropEmptyProperties(doc);
                for (const key of CLEANUP_STORIES) if (opts[key]) dropEmptyProperties(opts[key]);
            }
            const carry = carrySpec(opts);
            // Reference checks run before the dehydrate pass and before any
            // part is rendered, so a throw leaves the caller's tree untouched.
            checkReferences(doc, opts);
            // Apply dehydrate hooks before rendering. The walker mutates
            // in place, so callers reusing the same doc tree see
            // properties demoted back into `_extras`. This mirrors the
            // hydrate pass on read().
            // A settings hook returns a new object (the caller's settings
            // are left alone): the part is written from what it returns.
            // The styles and numbering hooks likewise: those parts are
            // written from what the walker leaves.
            let settings = opts.settings;
            let stylesPart = opts.styles;
            let numberingPart = opts.numbering;
            if (walker.hasExtensions) {
                const parts = {
                    document: doc,
                    headers: opts.headers || {},
                    footers: opts.footers || {},
                    footnotes: opts.footnotes,
                    endnotes: opts.endnotes,
                    comments: opts.comments,
                    styles: opts.styles,
                    numbering: opts.numbering,
                    settings: opts.settings
                };
                walker.applyDehydrate(parts);
                settings = parts.settings;
                stylesPart = parts.styles;
                numberingPart = parts.numbering;
            }
            assignDocIds(doc, opts);
            const pkg = opc.empty();
            // The body's kept relationships (`read()`'s `document._relationships`):
            // their ids are held and reserved as carried ones are.
            const kept = keptOf(doc);
            const keptIds = keptIdsOf(kept);
            // The story parts' kept relationships, by the part written.
            const storyKept = storyKeptOf(opts);

            const hyperlinks = opts.hyperlinks || derivedHyperlinks(doc);

            // Collect drawings → assign rIds, write image parts, declare types.
            // The same image (by Uint8Array identity) is deduped to a single part.
            // Order: image and chart rIds must be set on the drawing tree
            // BEFORE renderDocument is called, so the rendered XML carries
            // the right r:embed / r:id on each drawing.
            const collected = collectImages(doc, opts.images, keptIds);
            const chartCollected = collectCharts(doc, keptIds);
            // Story-part drawings: their own relationships, shared media.
            const story = collectStoryDrawings(opts, collected, chartCollected.length, storyKept);
            for (const ext of collected.exts) {
                pkg.contentTypes.defaults[ext] = extToContentType(ext);
            }
            for (const img of collected.list.concat(story.media)) {
                opc.setPart(pkg, img.partName, img.data, img.contentType);
            }
            // With `carry`, an unedited chart (its model equal to what its
            // source part parses to) is written as read: the parts of it the
            // model does not type (styles, alternate content …) are kept.
            const chartSources = carry
                ? new Map(chartOwners(carry, chartCollected.concat(story.charts)).map(([src, written]) => [written, src]))
                : null;
            for (const ch of chartCollected.concat(story.charts)) {
                opc.setPart(pkg, ch.partName,
                    unchangedChartBytes(carry, chartSources, ch) || chartMod.bytesOf(ch.chart),
                    chartMod.CT_CHART);
                pkg.contentTypes.overrides[ch.partName] = chartMod.CT_CHART;
            }

            // Render document.xml. A drawing written from its kept source
            // may name the relationships this part holds: its hyperlinks,
            // its carried relationships, its pictures and charts.
            const docMedia = new Set(collected.list.map(i => i.rId).concat(chartCollected.map(c => c.rId)));
            const docLinks = new Set(Object.keys(hyperlinks));
            const writerIds = new Set([...docMedia, ...docLinks,
                ...Object.keys(opts.headers || {}), ...Object.keys(opts.footers || {})]);
            if (carry) for (const id of carry.docIds) if (!writerIds.has(id)) docLinks.add(id);
            for (const id of keptIds) if (!writerIds.has(id)) docLinks.add(id);
            const documentXml = drawingMod.withRelationships({ links: docLinks, media: docMedia },
                () => structure.withParaIds(() => renderDocument(doc)));
            opc.setPart(pkg, '/word/document.xml',
                encodeText(documentXml), CT_DOCUMENT);

            // Build the document part's relationship table.
            const docRels = [];
            const _ridAlloc = createRidAllocator({ existing: docRels });
            // Carried relationships keep their source ids: the writer's own
            // ids are allocated around them.
            if (carry) for (const id of carry.docIds) _ridAlloc.register(id);
            // So are the body's kept ones.
            for (const id of keptIds) _ridAlloc.register(id);
            // So are the ids the writer keeps from the model (headers and
            // footers by their opts keys, hyperlinks, pictures, charts,
            // custom XML items): no fresh id may take one of them.
            for (const id of Object.keys(opts.headers || {})) _ridAlloc.register(id);
            for (const id of Object.keys(opts.footers || {})) _ridAlloc.register(id);
            for (const id of Object.keys(hyperlinks)) _ridAlloc.register(id);
            for (const img of collected.list) _ridAlloc.register(img.rId);
            for (const ch of chartCollected) _ridAlloc.register(ch.rId);
            (opts.customXml || []).forEach((_, i) => _ridAlloc.register(`rIdCx${i + 1}`));
            const claimRid = (preferred) => _ridAlloc.claim(preferred);

            function attachPart(opts_part, partName, rel) {
                opc.setPart(pkg, partName, opts_part.bytes, opts_part.contentType);
                docRels.push(rel);
            }

            // A story part's own relationship table: the hyperlink
            // relationships derived from its bodies, then those of its
            // pictures and charts, written when non-empty.
            function attachStoryRels(partName, bodies) {
                const rels = hyperlinkRels(derivedHyperlinks(bodies))
                    .concat(story.rels.get(partName) || []);
                if (rels.length) opc.setRels(pkg, partName, rels);
            }

            // Render a story part (`fn`) with the relationships it holds, as
            // the document: its derived hyperlinks, its pictures and charts,
            // and the carried relationships that keep their ids (one the
            // part's own table already holds gets a fresh id).
            function inStory(partName, bodies, fn) {
                const links = new Set(Object.keys(derivedHyperlinks(bodies)));
                const media = new Set((story.rels.get(partName) || []).map(r => r.Id));
                const carried = carry ? carry.rels.get(partName) || [] : [];
                for (const { rel } of carried) {
                    if (!links.has(rel.Id) && !media.has(rel.Id)) links.add(rel.Id);
                }
                for (const id of keptIdsOf(storyKept.get(partName))) {
                    if (!media.has(id)) links.add(id);
                }
                return drawingMod.withRelationships({ links, media }, () => structure.withParaIds(fn));
            }

            if (stylesPart) {
                attachPart(
                    { bytes: stylesMod.bytesOf(stylesPart),
                      contentType: stylesMod.CT_STYLES },
                    '/word/styles.xml',
                    { Id: claimRid(), Type: stylesMod.REL_TYPE_STYLES,
                      Target: 'styles.xml' });
            }
            if (numberingPart) {
                attachPart(
                    { bytes: numberingMod.bytesOf(numberingPart),
                      contentType: numberingMod.CT_NUMBERING },
                    '/word/numbering.xml',
                    { Id: claimRid(), Type: numberingMod.REL_TYPE_NUMBERING,
                      Target: 'numbering.xml' });
            }
            if (settings) {
                attachPart(
                    { bytes: settingsMod.bytesOf(settings),
                      contentType: settingsMod.CT_SETTINGS },
                    '/word/settings.xml',
                    { Id: claimRid(), Type: settingsMod.REL_TYPE_SETTINGS,
                      Target: 'settings.xml' });
            }
            if (opts.comments) {
                attachPart(
                    { bytes: inStory('/word/comments.xml', bodiesOf(opts.comments.comments),
                        () => commentsMod.bytesOf(opts.comments)),
                      contentType: commentsMod.CT_COMMENTS },
                    '/word/comments.xml',
                    { Id: claimRid(), Type: commentsMod.REL_TYPE_COMMENTS,
                      Target: 'comments.xml' });
                attachStoryRels('/word/comments.xml', bodiesOf(opts.comments.comments));
            }
            if (opts.footnotes) {
                attachPart(
                    { bytes: inStory('/word/footnotes.xml', bodiesOf(opts.footnotes.notes),
                        () => footnotesMod.footnotesBytes(opts.footnotes)),
                      contentType: footnotesMod.CT_FOOTNOTES },
                    '/word/footnotes.xml',
                    { Id: claimRid(), Type: footnotesMod.REL_TYPE_FOOTNOTES,
                      Target: 'footnotes.xml' });
                attachStoryRels('/word/footnotes.xml', bodiesOf(opts.footnotes.notes));
            }
            if (opts.endnotes) {
                attachPart(
                    { bytes: inStory('/word/endnotes.xml', bodiesOf(opts.endnotes.notes),
                        () => footnotesMod.endnotesBytes(opts.endnotes)),
                      contentType: footnotesMod.CT_ENDNOTES },
                    '/word/endnotes.xml',
                    { Id: claimRid(), Type: footnotesMod.REL_TYPE_ENDNOTES,
                      Target: 'endnotes.xml' });
                attachStoryRels('/word/endnotes.xml', bodiesOf(opts.endnotes.notes));
            }
            if (opts.headers) {
                let i = 1;
                for (const rId of Object.keys(opts.headers)) {
                    const target = `header${i}.xml`;
                    attachPart(
                        { bytes: inStory(`/word/${target}`, [opts.headers[rId].body],
                            () => headersMod.bytesOf(opts.headers[rId])),
                          contentType: headersMod.CT_HEADER },
                        `/word/${target}`,
                        { Id: rId, Type: headersMod.REL_TYPE_HEADER, Target: target });
                    attachStoryRels(`/word/${target}`, [opts.headers[rId].body]);
                    i++;
                }
            }
            if (opts.footers) {
                let i = 1;
                for (const rId of Object.keys(opts.footers)) {
                    const target = `footer${i}.xml`;
                    attachPart(
                        { bytes: inStory(`/word/${target}`, [opts.footers[rId].body],
                            () => headersMod.bytesOf(opts.footers[rId])),
                          contentType: headersMod.CT_FOOTER },
                        `/word/${target}`,
                        { Id: rId, Type: headersMod.REL_TYPE_FOOTER, Target: target });
                    attachStoryRels(`/word/${target}`, [opts.footers[rId].body]);
                    i++;
                }
            }
            docRels.push(...hyperlinkRels(hyperlinks));
            // Image relationships.
            for (const img of collected.list) {
                docRels.push({
                    Id: img.rId,
                    Type: drawingMod.REL_TYPE_IMAGE,
                    Target: 'media/' + img.fileName
                });
            }
            // Chart relationships (parts already written above).
            for (const ch of chartCollected) {
                docRels.push({
                    Id: ch.rId,
                    Type: chartMod.REL_TYPE_CHART,
                    Target: 'charts/' + ch.fileName
                });
            }
            // Custom XML parts (data binding source for SDTs).
            const customXml = opts.customXml || [];
            customXml.forEach((item, i) => {
                const idx = i + 1;
                const itemPath = `/customXml/item${idx}.xml`;
                const propsPath = `/customXml/itemProps${idx}.xml`;
                const storeItemID = item.storeItemID
                    || customXmlMod.generateStoreItemID();
                opc.setPart(pkg, itemPath,
                    encodeText(item.xml || '<root/>'),
                    'application/xml');
                opc.setPart(pkg, propsPath,
                    customXmlMod.propsBytes({
                        storeItemID,
                        schemaRefs: item.schemaRefs
                    }),
                    customXmlMod.CT_CUSTOM_XML_PROPS);
                pkg.contentTypes.overrides[propsPath] =
                    customXmlMod.CT_CUSTOM_XML_PROPS;
                pkg.contentTypes.defaults.xml = 'application/xml';

                // item → itemProps relationship (in customXml/_rels).
                opc.setRels(pkg, itemPath, [{
                    Id: 'rId1',
                    Type: customXmlMod.REL_TYPE_CUSTOM_XML_PROPS,
                    Target: `itemProps${idx}.xml`
                }]);

                // document → item relationship.
                docRels.push({
                    Id: `rIdCx${idx}`,
                    Type: customXmlMod.REL_TYPE_CUSTOM_XML,
                    Target: `../customXml/item${idx}.xml`
                });

                // Patch back the assigned storeItemID so the caller can
                // wire matching dataBindings on the SDTs.
                item.storeItemID = storeItemID;
            });

            if (docRels.length) opc.setRels(pkg, '/word/document.xml', docRels);

            if (carry) {
                applyCarry(pkg, carry);
                repairReferences(pkg, carry, chartOwners(carry, chartCollected.concat(story.charts)));
            } else {
                opc.setRels(pkg, '/', [{
                    Id: 'rId1', Type: REL_TYPE_DOC, Target: 'word/document.xml'
                }]);
                // The kept relationships each part's XML still names.
                if (kept) repairReferences(pkg, { pkg: kept.package, owners: [] }, [[kept.part, '/word/document.xml']]);
                for (const [written, k] of storyKept) repairReferences(pkg, { pkg: k.package, owners: [] }, [[k.part, written]]);
                for (const ch of chartCollected.concat(story.charts)) {
                    const k = keptOf(ch.chart);
                    if (k) repairReferences(pkg, { pkg: k.package, owners: [] }, [[k.part, ch.partName]]);
                }
            }

            return opc.write(pkg);
        }

        // --- Carry (write option) ---

        /**
         * Validate `opts.carry` and work out what it carries: the parts listed in
         * `unmodelledParts` that the package holds, and, per part the writer
         * writes (the package, the document, the headers and footers mapped
         * through their `opts` keys — the source relationship ids — and the
         * comments, footnotes and endnotes parts), the source internal
         * relationships whose target is one of them. `null` without the
         * option.
         */
        function carrySpec(opts) {
            if (opts.carry === undefined) return null;
            const c = opts.carry;
            const p = c && typeof c === 'object' ? c.package : null;
            if (!p || typeof p !== 'object'
                || !p.parts || typeof p.parts !== 'object'
                || !p.rels || typeof p.rels !== 'object'
                || !p.contentTypes || typeof p.contentTypes !== 'object'
                || !Array.isArray(c.unmodelledParts)) {
                throw new ContractError('docx/invalid-carry',
                    'docx.write: opts.carry must be the { package, unmodelledParts } envelope read() returns',
                    { context: { received: c === null ? 'null' : typeof c } });
            }
            const listed = [];
            for (const u of c.unmodelledParts) {
                const name = u && u.partName;
                if (typeof name === 'string' && p.parts[name] && !listed.includes(name)) listed.push(name);
            }
            const owners = [['/', '/']];
            const docRel = (p.rels['/'] || []).find(r => r && typeof r.Type === 'string'
                && (r.Type === REL_TYPE_DOC || r.Type.endsWith('/officeDocument')));
            if (docRel) {
                const srcDoc = relsMod.resolveTarget('/', docRel.Target);
                const srcRels = p.rels[srcDoc] || [];
                const internal = srcRels.filter(r => r && r.TargetMode !== 'External'
                    && typeof r.Target === 'string');
                const target = r => relsMod.resolveTarget(srcDoc, r.Target);
                owners.push([srcDoc, '/word/document.xml']);
                const story = (keys, type, prefix) => keys.forEach((k, i) => {
                    const r = internal.find(x => x.Id === k && x.Type === type);
                    if (r) owners.push([target(r), `/word/${prefix}${i + 1}.xml`]);
                });
                story(Object.keys(opts.headers || {}), headersMod.REL_TYPE_HEADER, 'header');
                story(Object.keys(opts.footers || {}), headersMod.REL_TYPE_FOOTER, 'footer');
                for (const [given, type, written] of [
                    [opts.styles, stylesMod.REL_TYPE_STYLES, '/word/styles.xml'],
                    [opts.numbering, numberingMod.REL_TYPE_NUMBERING, '/word/numbering.xml'],
                    [opts.settings, settingsMod.REL_TYPE_SETTINGS, '/word/settings.xml'],
                    [opts.comments, commentsMod.REL_TYPE_COMMENTS, '/word/comments.xml'],
                    [opts.footnotes, footnotesMod.REL_TYPE_FOOTNOTES, '/word/footnotes.xml'],
                    [opts.endnotes, footnotesMod.REL_TYPE_ENDNOTES, '/word/endnotes.xml']
                ]) {
                    const r = given ? internal.find(x => x.Type === type) : null;
                    if (r) owners.push([target(r), written]);
                }
            }
            const rels = new Map();
            const add = (written, entry) => {
                if (!rels.has(written)) rels.set(written, []);
                rels.get(written).push(entry);
            };
            for (const [src, written] of owners) {
                for (const r of p.rels[src] || []) {
                    if (!r || typeof r.Target !== 'string' || typeof r.Type !== 'string') continue;
                    // An external relationship has no part: carried as is,
                    // but hyperlinks, which the model writes, stay its own.
                    if (r.TargetMode === 'External') {
                        if (r.Type !== REL_TYPE_HYPERLINK) add(written, { rel: r, target: null });
                        continue;
                    }
                    const t = relsMod.resolveTarget(src, r.Target);
                    if (listed.includes(t)) add(written, { rel: r, target: t });
                }
            }
            const docIds = (rels.get('/word/document.xml') || []).map(x => x.rel.Id);
            const srcDoc = docRel ? relsMod.resolveTarget('/', docRel.Target) : null;
            return { pkg: p, listed, rels, docIds, owners, srcDoc };
        }

        /**
         * Write the carried parts with their bytes and content types, then
         * their relationships: from the parts the writer wrote (a carried id
         * the table already holds gets a fresh one), each carried part's own
         * relationships as read, and the package relationships with the
         * document's on a free id. A carried part whose name the writer used
         * is written under a free name in the same folder, every relationship
         * to it re-targeted.
         */
        function applyCarry(pkg, spec) {
            const src = spec.pkg;
            const taken = new Set(Object.keys(pkg.parts).concat(spec.listed));
            const names = new Map();
            for (const name of spec.listed) {
                names.set(name, pkg.parts[name] ? freePartName(name, taken) : name);
            }
            for (const name of spec.listed) {
                const fin = names.get(name);
                pkg.parts[fin] = src.parts[name];
                carryContentType(pkg, src, name, fin);
            }
            // The source Target when it still reaches the part, else a
            // relative one from the owner written.
            const pointTo = (owner, rel, target) => {
                if (target === null) return rel.Target;
                const fin = names.get(target) || target;
                return relsMod.resolveTarget(owner, rel.Target) === fin
                    ? rel.Target : relativeTarget(owner, fin);
            };
            const carriedRel = (rel, Id, Target) => (rel.TargetMode === 'External'
                ? { Id, Type: rel.Type, Target, TargetMode: 'External' }
                : { Id, Type: rel.Type, Target });
            for (const [owner, list] of spec.rels) {
                if (owner === '/') continue;
                const table = (pkg.rels[owner] || []).slice();
                // A fresh id avoids the written ids and every carried one.
                const ids = createRidAllocator({ existing: table.concat(list.map(x => x.rel)) });
                for (const { rel, target } of list) {
                    const Id = table.some(x => x.Id === rel.Id) ? ids.next() : rel.Id;
                    table.push(carriedRel(rel, Id, pointTo(owner, rel, target)));
                }
                opc.setRels(pkg, owner, table);
            }
            for (const name of spec.listed) {
                const own = src.rels[name];
                if (!own || !own.length) continue;
                const fin = names.get(name);
                opc.setRels(pkg, fin, own.map(r => {
                    if (!r || r.TargetMode === 'External' || typeof r.Target !== 'string') return { ...r };
                    const t = relsMod.resolveTarget(name, r.Target);
                    return names.has(t) ? { ...r, Target: pointTo(fin, r, t) } : { ...r };
                }));
            }
            const rootCarried = spec.rels.get('/') || [];
            const rootIds = createRidAllocator({ existing: rootCarried.map(x => x.rel.Id) });
            opc.setRels(pkg, '/', [
                { Id: rootIds.claim('rId1'), Type: REL_TYPE_DOC, Target: 'word/document.xml' },
                ...rootCarried.map(({ rel, target }) => carriedRel(rel, rel.Id, pointTo('/', rel, target)))
            ]);
        }

        /**
         * The content type of a carried part: its source override, else the
         * source default of its extension — an override when the written
         * package's default for that extension differs.
         */
        function carryContentType(pkg, src, name, fin) {
            const srcDefaults = src.contentTypes.defaults || {};
            const srcOverrides = src.contentTypes.overrides || {};
            if (srcOverrides[name]) {
                pkg.contentTypes.overrides[fin] = srcOverrides[name];
                return;
            }
            const ext = extensionOf(name);
            const key = Object.keys(srcDefaults).find(k => k.toLowerCase() === ext);
            if (!ext || !key) return;
            const mine = Object.keys(pkg.contentTypes.defaults).find(k => k.toLowerCase() === ext);
            if (!mine) pkg.contentTypes.defaults[key] = srcDefaults[key];
            else if (pkg.contentTypes.defaults[mine] !== srcDefaults[key]) {
                pkg.contentTypes.overrides[fin] = srcDefaults[key];
            }
        }

        /** The source bytes of a chart whose model is unedited, else null. */
        function unchangedChartBytes(spec, sources, ch) {
            const srcName = sources && sources.get(ch.partName);
            const data = srcName && spec.pkg.parts[srcName];
            if (!data) return null;
            let read;
            try { read = chartMod.parse(data); } catch { return null; }
            // The kept relationships are not chart content.
            const { _relationships, ...model } = ch.chart;
            return sameModel(read, model) ? data : null;
        }

        // Structural equality of two plain model values (`Object.is` on the
        // leaves, so a NaN equals a NaN).
        function sameModel(a, b) {
            if (Object.is(a, b)) return true;
            if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const ka = Object.keys(a), kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (const k of ka) {
                if (!Object.prototype.hasOwnProperty.call(b, k) || !sameModel(a[k], b[k])) return false;
            }
            return true;
        }

        /**
         * Each written chart part with its source part: through the source
         * relationship id it kept, in the source of the part that holds it
         * (the document, or a header or footer matched through the owners).
         */
        function chartOwners(spec, charts) {
            const out = [];
            for (const ch of charts) {
                const written = ch.owner || '/word/document.xml';
                const pair = written === '/word/document.xml' ? [spec.srcDoc, written]
                    : spec.owners.find(([, w]) => w === written);
                const srcOwner = pair && pair[0];
                if (!srcOwner) continue;
                const r = (spec.pkg.rels[srcOwner] || []).find(x => x && x.Id === ch.rId
                    && x.Type === chartMod.REL_TYPE_CHART && x.TargetMode !== 'External' && typeof x.Target === 'string');
                if (r) out.push([relsMod.resolveTarget(srcOwner, r.Target), ch.partName]);
            }
            return out;
        }

        /**
         * With `carry`: every relationship id a written part's XML still
         * references (an `r:*` attribute, `o:relid`) that its written table
         * lacks and its source part's table holds is written back under that
         * id — an external one as read, an internal one with its target
         * part (the bytes read, reused when the package holds the same bytes
         * under that name, else under a free name) and that part's own
         * relationships, recursively. `owners` are `[source part, written
         * part]` pairs.
         */
        function repairReferences(pkg, spec, more) {
            const src = spec.pkg;
            const copied = new Map();
            const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
            function copyPart(name) {
                if (copied.has(name)) return copied.get(name);
                const data = src.parts[name];
                if (!data) return null;
                const exists = pkg.parts[name];
                const fin = exists && !same(exists, data)
                    ? freePartName(name, new Set(Object.keys(pkg.parts))) : name;
                copied.set(name, fin);
                if (pkg.parts[fin]) return fin;
                pkg.parts[fin] = data;
                carryContentType(pkg, src, name, fin);
                const own = src.rels[name] || [];
                if (own.length) {
                    const table = [];
                    for (const r of own) {
                        if (!r || r.TargetMode === 'External' || typeof r.Target !== 'string') { table.push({ ...r }); continue; }
                        const t = copyPart(relsMod.resolveTarget(name, r.Target));
                        if (t) table.push({ ...r, Target: relativeTarget(fin, t) });
                    }
                    opc.setRels(pkg, fin, table);
                }
                return fin;
            }
            for (const [srcPart, written] of spec.owners.concat(more)) {
                if (written === '/' || !pkg.parts[written] || !/\.xml$/i.test(written)) continue;
                const ids = new Set();
                for (const m of decodeText(pkg.parts[written]).matchAll(REFERENCE_ATTR)) ids.add(m[1]);
                const table = (pkg.rels[written] || []).slice();
                const have = new Set(table.map(x => x.Id));
                let changed = false;
                for (const id of ids) {
                    if (have.has(id)) continue;
                    const rel = (src.rels[srcPart] || []).find(x => x && x.Id === id);
                    if (!rel || typeof rel.Target !== 'string' || typeof rel.Type !== 'string') continue;
                    if (rel.TargetMode === 'External') {
                        table.push({ Id: id, Type: rel.Type, Target: rel.Target, TargetMode: 'External' });
                    } else {
                        const fin = copyPart(relsMod.resolveTarget(srcPart, rel.Target));
                        if (!fin) continue;
                        table.push({ Id: id, Type: rel.Type, Target: relativeTarget(written, fin) });
                    }
                    have.add(id);
                    changed = true;
                }
                if (changed) opc.setRels(pkg, written, table);
            }
        }

        /** `name` with `_<n>` before its extension, the first one not in `taken` (which gains it). */
        function freePartName(name, taken) {
            const slash = name.lastIndexOf('/');
            const dot = name.lastIndexOf('.');
            const cut = dot > slash ? dot : name.length;
            let n = 1;
            while (taken.has(`${name.slice(0, cut)}_${n}${name.slice(cut)}`)) n++;
            const out = `${name.slice(0, cut)}_${n}${name.slice(cut)}`;
            taken.add(out);
            return out;
        }

        /** The lower-case extension of a part name, `''` without one. */
        function extensionOf(name) {
            const file = name.slice(name.lastIndexOf('/') + 1);
            const dot = file.lastIndexOf('.');
            return dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
        }

        /** A relationship Target from `fromPart` (`'/'` for the package) to `toPart`. */
        function relativeTarget(fromPart, toPart) {
            const from = fromPart === '/' ? [] : fromPart.slice(1).split('/').slice(0, -1);
            const to = toPart.slice(1).split('/');
            let i = 0;
            while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
            return from.slice(i).map(() => '..').concat(to.slice(i)).join('/');
        }

        function extToContentType(ext) {
            switch (ext) {
                case 'png':  return 'image/png';
                case 'jpg':  return 'image/jpeg';
                case 'jpeg': return 'image/jpeg';
                case 'gif':  return 'image/gif';
                case 'bmp':  return 'image/bmp';
                case 'webp': return 'image/webp';
                case 'tiff': return 'image/tiff';
                case 'svg':  return 'image/svg+xml';
                case 'emf':  return 'image/x-emf';
                case 'wmf':  return 'image/x-wmf';
                default:     return 'application/octet-stream';
            }
        }

        const SVG_CT = 'image/svg+xml';
        // A picture's SVG (`image.svg`) with bytes, as a media entry (its
        // content type `image/svg+xml` unless given: no signature to sniff).
        function svgOf(img) {
            const svg = img && img.svg;
            if (!svg || !(svg.data instanceof Uint8Array)) return null;
            return { data: svg.data, contentType: svg.contentType || SVG_CT, fileName: svg.fileName };
        }

        /**
         * Walk the document, collect drawings that carry an `image.data`
         * payload, dedup by `Uint8Array` identity, assign rIds (`rImgN`),
         * file names (`/word/media/imageN.<ext>`), and content types.
         * The drawing's `embedRef` is patched in place with the assigned rId.
         *
         * `extra` lets the caller inject extra image entries
         * (`{ rId: { data, contentType, fileName? } }`) — useful when the
         * document references an `embedRef` already present (e.g. on
         * round-trips).
         */
        function collectImages(doc, extra, reserved) {
            const list = [];
            const byData = new Map();
            const exts = new Set();
            const _ridAlloc = createRidAllocator({ prefix: 'rImg',
                existing: extra ? Object.keys(extra) : [] });
            for (const id of reserved || []) _ridAlloc.register(id);
            let nextIdx = 1;

            function nextRId() { return _ridAlloc.next(); }

            // Pre-register caller-provided extras so their rIds don't collide.
            if (extra) {
                for (const id of Object.keys(extra)) {
                    const e = extra[id];
                    // No bytes, no part: an external picture `read()` lists
                    // in `images` (its relationship has no part to write).
                    if (!e || !(e.data instanceof Uint8Array)) continue;
                    const ct = e.contentType || drawingMod.sniffImageType(e.data);
                    const ext = drawingMod.extensionFor(ct);
                    const fileName = e.fileName || `image${nextIdx++}.${ext}`;
                    const partName = '/word/media/' + fileName;
                    const item = {
                        rId: id, data: e.data, contentType: ct,
                        fileName, partName
                    };
                    list.push(item);
                    byData.set(e.data, item);
                    exts.add(ext);
                }
            }

            // One media part per bytes (identity), its id the preferred one.
            function itemFor(img, preferredId) {
                let item = byData.get(img.data);
                if (!item) {
                    const ct = img.contentType || drawingMod.sniffImageType(img.data);
                    const ext = drawingMod.extensionFor(ct);
                    const fileName = img.fileName || `image${nextIdx++}.${ext}`;
                    const rId = preferredId || nextRId();
                    if (preferredId) _ridAlloc.register(preferredId);
                    item = {
                        rId, data: img.data, contentType: ct,
                        fileName, partName: '/word/media/' + fileName
                    };
                    list.push(item);
                    byData.set(img.data, item);
                    exts.add(ext);
                }
                return item;
            }

            walkDrawings(doc, drawing => {
                const img = drawing.image;
                if (!img) return;
                if (img.data) drawing.embedRef = itemFor(img, img.rId || drawing.embedRef).rId;
                const svg = svgOf(img);
                if (svg) drawing.svgRef = img.svg.rId = itemFor(svg, img.svg.rId || drawing.svgRef).rId;
            });

            // A media part for an image met outside the document body (a
            // story part): same naming and dedup, no document relationship.
            function addMedia(img) {
                const ct = img.contentType || drawingMod.sniffImageType(img.data);
                const ext = drawingMod.extensionFor(ct);
                const fileName = img.fileName || `image${nextIdx++}.${ext}`;
                const item = { data: img.data, contentType: ct,
                    fileName, partName: '/word/media/' + fileName };
                byData.set(img.data, item);
                exts.add(ext);
                return item;
            }

            return { list, exts, byData, addMedia };
        }

        /**
         * Pictures and charts of the story parts (headers, footers,
         * footnotes, endnotes, comments). Each story part gets its own
         * relationships — rIds live in the part's own table, kept clear of
         * its hyperlink rIds — to media parts shared package-wide through
         * `images` (dedup by bytes identity) and to chart parts numbered
         * after the `chartCount` document charts. Patches each drawing's
         * `embedRef` / `chartRef` in place, like `collectImages`.
         *
         * @returns {{ rels: Map<string, Array<object>>, media: Array<object>,
         *   charts: Array<object> }} relationships by story part name, plus
         *   the media and chart parts to write.
         */
        function collectStoryDrawings(opts, images, chartCount, kept) {
            const rels = new Map();
            const media = [];
            const charts = [];
            let chartIdx = chartCount;
            function visit(partName, bodies) {
                const alloc = createRidAllocator({
                    existing: Object.keys(derivedHyperlinks(bodies)) });
                for (const id of keptIdsOf(kept && kept.get(partName))) alloc.register(id);
                const ridOf = new Map();
                const out = [];
                // The part's relationship to the media part of `img`.
                function ridFor(img, preferredId) {
                    let item = images.byData.get(img.data);
                    if (!item) {
                        item = images.addMedia(img);
                        media.push(item);
                    }
                    let rId = ridOf.get(item);
                    if (!rId) {
                        rId = alloc.claim(preferredId);
                        ridOf.set(item, rId);
                        out.push({ Id: rId, Type: drawingMod.REL_TYPE_IMAGE,
                            Target: 'media/' + item.fileName });
                    }
                    return rId;
                }
                walkDrawings(bodies, drawing => {
                    const img = drawing.image;
                    if (img && img.data) drawing.embedRef = ridFor(img, img.rId || drawing.embedRef);
                    const svg = svgOf(img);
                    if (svg) drawing.svgRef = img.svg.rId = ridFor(svg, img.svg.rId || drawing.svgRef);
                    if (drawing.chart) {
                        const fileName = `chart${++chartIdx}.xml`;
                        const rId = alloc.claim(drawing.chartRef);
                        charts.push({ fileName, partName: '/word/charts/' + fileName,
                            chart: drawing.chart, rId, owner: partName });
                        out.push({ Id: rId, Type: chartMod.REL_TYPE_CHART,
                            Target: 'charts/' + fileName });
                        drawing.chartRef = rId;
                        drawing.kind = 'chart';
                    }
                });
                if (out.length) rels.set(partName, out);
            }
            if (opts.comments) visit('/word/comments.xml', bodiesOf(opts.comments.comments));
            if (opts.footnotes) visit('/word/footnotes.xml', bodiesOf(opts.footnotes.notes));
            if (opts.endnotes) visit('/word/endnotes.xml', bodiesOf(opts.endnotes.notes));
            Object.keys(opts.headers || {}).forEach((rId, i) =>
                visit(`/word/header${i + 1}.xml`, [opts.headers[rId].body]));
            Object.keys(opts.footers || {}).forEach((rId, i) =>
                visit(`/word/footer${i + 1}.xml`, [opts.footers[rId].body]));
            return { rels, media, charts };
        }

        /**
         * Walk the document for chart drawings, allocate rIds, file
         * names, and return a list ready to write parts + add rels.
         */
        function collectCharts(doc, reserved) {
            const out = [];
            const _ridAlloc = createRidAllocator({ prefix: 'rChart' });
            for (const id of reserved || []) _ridAlloc.register(id);
            let nextIdx = 1;
            function nextRId() { return _ridAlloc.next(); }
            walkDrawings(doc, drawing => {
                if (!drawing.chart) return;
                if (drawing.chartRef) _ridAlloc.register(drawing.chartRef);
                const rId = drawing.chartRef || nextRId();
                const fileName = `chart${nextIdx++}.xml`;
                const partName = '/word/charts/' + fileName;
                out.push({ rId, fileName, partName, chart: drawing.chart });
                drawing.chartRef = rId;
                drawing.kind = 'chart';
            });
            return out;
        }

        // `write`'s named cleanups, and the story options they also clean.
        const CLEANUPS = new Set(['emptyProperties']);
        const CLEANUP_STORIES = ['headers', 'footers', 'footnotes', 'endnotes', 'comments'];

        /** The validated `opts.cleanup` names (empty when absent). */
        function cleanupSpec(value) {
            if (value === undefined) return new Set();
            const ok = Array.isArray(value)
                && value.every((n) => CLEANUPS.has(n))
                && new Set(value).size === value.length;
            if (!ok) {
                throw new ContractError('docx/invalid-cleanup',
                    'docx.write: opts.cleanup must be an array of distinct names among: '
                        + [...CLEANUPS].join(', '),
                    { context: { received: Array.isArray(value) ? value.map(String) : (value === null ? 'null' : typeof value) } });
            }
            return new Set(value);
        }

        /**
         * Delete, in place, every `rPr` / `pPr` key whose value is an empty
         * object once its own nested properties are cleaned (a `pPr` holding
         * only an empty `rPr` goes too). Bytes are not walked.
         */
        function dropEmptyProperties(node) {
            if (!node || typeof node !== 'object' || ArrayBuffer.isView(node)) return;
            if (Array.isArray(node)) { for (const n of node) dropEmptyProperties(n); return; }
            for (const key of Object.keys(node)) {
                const v = node[key];
                dropEmptyProperties(v);
                if ((key === 'rPr' || key === 'pPr') && v && typeof v === 'object' && !Array.isArray(v)
                    && Object.keys(v).every((k) => v[k] === undefined)) {
                    delete node[key];
                }
            }
        }

        function derivedHyperlinks(doc) {
            const out = {};
            walkRuns(doc, node => {
                if (node && node.type === 'hyperlink' && node.rId && node.target) {
                    out[node.rId] = {
                        target: node.target,
                        external: node.external !== false
                    };
                }
            });
            return out;
        }

        /**
         * Pre-render reference checks of `write()`, over the document body
         * and every header, footer, footnotes, endnotes and comments body
         * (same recursion as `walkRuns`). Throws on the first hyperlink
         * whose target would be lost, then on the first hyperlink `rId`
         * with no relationship in the table written for its part (the body:
         * `opts.hyperlinks` when passed, else the map derived from the body;
         * a story part: the map derived from that part), then on the first
         * list reference (`pPr.numPr.numId`, non-zero) that would dangle
         * without `opts.numbering`, then on the first one `opts.numbering`
         * does not declare in `nums`. The list checks cover the body, every
         * story part and `opts.styles` (each style and the docDefaults).
         * Read-only: never mutates the tree.
         */
        function checkReferences(doc, opts) {
            const dangling = opts.danglingNumbering === undefined ? 'throw' : opts.danglingNumbering;
            if (dangling !== 'throw' && dangling !== 'keep') {
                throw new ContractError('docx/invalid-dangling-numbering',
                    "docx.write: opts.danglingNumbering must be 'throw' or 'keep'",
                    { context: { received: dangling === null ? 'null' : typeof dangling } });
            }
            let lostTarget = null;
            let unresolved = null;
            let danglingNumId = null;
            let unknownNumId = null;
            const declaredNums = opts.numbering
                ? new Set((opts.numbering.nums || []).map(n => Number(n && n.numId)))
                : null;
            function checkNumPr(numPr, where) {
                // 'keep': a list reference is written as given, declared or not.
                if (dangling === 'keep') return;
                if (!numPr || numPr.numId == null || Number(numPr.numId) === 0) return;
                if (!declaredNums) {
                    if (danglingNumId === null) danglingNumId = { numId: numPr.numId, ...where };
                } else if (unknownNumId === null && !declaredNums.has(Number(numPr.numId))) {
                    unknownNumId = { numId: numPr.numId, ...where };
                }
            }
            const visitor = (table, where) => node => {
                if (!node || typeof node !== 'object') return;
                if (node.type === 'hyperlink') {
                    if (lostTarget === null
                        && typeof node.target === 'string' && node.target !== ''
                        && !node.rId && !node.anchor) {
                        lostTarget = node.target;
                    }
                    if (unresolved === null
                        && typeof node.rId === 'string' && node.rId !== ''
                        && !hasOwn(table, node.rId)) {
                        unresolved = { rId: node.rId, ...where };
                    }
                }
                if (node.type === 'paragraph' && node.pPr) checkNumPr(node.pPr.numPr, where);
            };
            walkRuns(doc.body, visitor(opts.hyperlinks || derivedHyperlinks(doc),
                { story: 'document' }));
            for (const part of storyPartsOf(opts)) {
                walkRuns(part.bodies, visitor(derivedHyperlinks(part.bodies), part.where));
            }
            if (opts.styles) {
                const dd = opts.styles.docDefaults;
                if (dd && dd.pPr) checkNumPr(dd.pPr.numPr, { story: 'styles' });
                for (const s of opts.styles.styles || []) {
                    if (s && s.pPr) checkNumPr(s.pPr.numPr, { story: 'styles', styleId: s.styleId });
                }
            }
            if (lostTarget !== null) {
                throw new ContractError('docx/hyperlink-missing-rid',
                    'docx.write: a hyperlink with a target needs an rId (pass one, e.g. hyperlink(text, target, { rId }))',
                    { context: { target: lostTarget } });
            }
            if (unresolved !== null) {
                throw new ContractError('docx/hyperlink-unresolved-rid',
                    `docx.write: hyperlink rId "${unresolved.rId}" has no relationship in the ${unresolved.story} part (give the node a target, or pass the relationship in opts.hyperlinks for the document body)`,
                    { context: unresolved });
            }
            if (danglingNumId !== null) {
                throw new ContractError('docx/numbering-missing',
                    `docx.write: the ${danglingNumId.story} part references a list (pPr.numPr) but opts.numbering is missing`,
                    { context: danglingNumId });
            }
            if (unknownNumId !== null) {
                throw new ContractError('docx/numbering-unknown-num',
                    `docx.write: numId ${unknownNumId.numId} (${unknownNumId.story} part) is not declared in opts.numbering.nums`,
                    { context: unknownNumId });
            }
        }

        // The one walker of the hyperlink passes (copy on read, derive on
        // write, reference checks): they all see the same nodes.
        function walkRuns(node, cb) {
            if (!node) return;
            if (Array.isArray(node)) { for (const n of node) walkRuns(n, cb); return; }
            cb(node);
            if (node.body) walkRuns(node.body, cb);
            if (node.children) walkRuns(node.children, cb);
            if (node.rows) walkRuns(node.rows, cb);
            if (node.cells) walkRuns(node.cells, cb);
        }

        function hasOwn(obj, key) {
            return Object.prototype.hasOwnProperty.call(obj, key);
        }

        /**
         * Gives every drawing of the document body and of the story parts
         * a `wp:docPr` id unique among them (ECMA-376 Part 1 § 20.4.2.5).
         * A drawing keeps its `docId` (a non-negative integer) when no
         * drawing met before holds it; a later duplicate and a drawing
         * without one get the smallest unused id from 1. Patches `docId`
         * in place, as `collectImages` patches `embedRef`.
         */
        function assignDocIds(doc, opts) {
            const drawings = [];
            const collect = drawing => { drawings.push(drawing); };
            walkDrawings(doc, collect);
            for (const items of [opts.comments && opts.comments.comments,
                opts.footnotes && opts.footnotes.notes,
                opts.endnotes && opts.endnotes.notes]) {
                walkDrawings(bodiesOf(items), collect);
            }
            for (const story of [opts.headers || {}, opts.footers || {}]) {
                for (const rId of Object.keys(story)) walkDrawings([story[rId] && story[rId].body], collect);
            }
            const used = new Set();
            const pending = [];
            for (const drawing of drawings) {
                const id = drawing.docId;
                if (Number.isInteger(id) && id >= 0 && !used.has(id)) used.add(id);
                else pending.push(drawing);
            }
            let next = 1;
            for (const drawing of pending) {
                while (used.has(next)) next++;
                drawing.docId = next;
                used.add(next);
            }
        }

        // The bodies of a footnotes / endnotes / comments item list.
        function bodiesOf(items) {
            return (items || []).map(item => item && item.body);
        }

        // `{ rId: { target, external } }` for the hyperlink relationships
        // of one part's relationship table (the shape of the read result's
        // `hyperlinks`).
        function hyperlinkTable(rels) {
            const out = {};
            for (const rel of rels || []) {
                if (rel.Type !== REL_TYPE_HYPERLINK) continue;
                out[rel.Id] = {
                    target: rel.Target,
                    external: rel.TargetMode === 'External'
                };
            }
            return out;
        }

        // Read: copy `target` and `external` onto every hyperlink node whose
        // `rId` is a key of `relsById`.
        function attachTargets(body, relsById) {
            walkRuns(body, node => {
                if (node.type === 'hyperlink' && node.rId && hasOwn(relsById, node.rId)) {
                    const rel = relsById[node.rId];
                    node.target = rel.target;
                    node.external = rel.external;
                }
            });
        }

        // Write: the relationship objects of a `{ rId: { target, external? } }`
        // table (`TargetMode="External"` when `external` is truthy).
        function hyperlinkRels(table) {
            return Object.keys(table).map(id => {
                const h = table[id];
                const rel = { Id: id, Type: REL_TYPE_HYPERLINK, Target: h.target };
                if (h.external) rel.TargetMode = 'External';
                return rel;
            });
        }

        // The story parts `write()` emits from `opts`, in document order
        // (headers, footers, footnotes, endnotes, comments), each with the
        // bodies its hyperlinks live in and the `context` fields naming it.
        function storyPartsOf(opts) {
            const out = [];
            for (const [story, parts] of [['header', opts.headers], ['footer', opts.footers]]) {
                if (!parts) continue;
                for (const key of Object.keys(parts)) {
                    out.push({ where: { story, key },
                        bodies: parts[key] ? [parts[key].body] : [] });
                }
            }
            for (const story of ['footnotes', 'endnotes']) {
                if (opts[story]) {
                    out.push({ where: { story }, bodies: bodiesOf(opts[story].notes) });
                }
            }
            if (opts.comments) {
                out.push({ where: { story: 'comments' },
                    bodies: bodiesOf(opts.comments.comments) });
            }
            return out;
        }

        // The `w:document` root declares `w` and `r`; when the body holds a
        // Word 2012 element (a repeating section), it also declares `mc` and
        // the `w15` namespace and marks `w15` ignorable for older consumers
        // (`ooxmlShared.wordRootAttrs`, shared with the story parts).
        function renderDocument(doc) {
            const bodyChildren = structure.renderBodyChildren(doc);
            const body = xml.el('w:body', {}, bodyChildren);
            const children = doc.background ? [renderBackground(doc.background), body] : [body];
            const root = xml.el('w:document', wordRootAttrs(children), children);
            return xml.serialize(root);
        }

        // The page background (CT_Background, before the body): its four
        // attributes typed, its children (a VML v:background, a drawing)
        // kept verbatim in `_extras`.
        const BACKGROUND_ATTRS = [['color', 'w:color'], ['themeColor', 'w:themeColor'],
            ['themeTint', 'w:themeTint'], ['themeShade', 'w:themeShade']];

        function parseBackground(el) {
            const out = {};
            for (const [k, a] of BACKGROUND_ATTRS) if (el.attrs[a] != null) out[k] = el.attrs[a];
            const kids = el.children.filter((c) => c.type === 'element');
            if (kids.length) out._extras = kids;
            return out;
        }

        function renderBackground(bg) {
            const attrs = {};
            for (const [k, a] of BACKGROUND_ATTRS) if (bg[k] != null) attrs[a] = String(bg[k]);
            return xml.el('w:background', attrs, bg._extras ? bg._extras.slice() : []);
        }

        // --- Convenience helpers ---

        function fromText(paragraphs) {
            return {
                type: 'document',
                body: paragraphs.map(text => paragraph(text))
            };
        }

        function paragraph(text, opts = {}) {
            const node = {
                type: 'paragraph',
                children: [run(text, opts.rPr)]
            };
            if (opts.pPr) node.pPr = opts.pPr;
            return node;
        }

        function run(text, rPr) {
            const node = { type: 'run', children: [{ type: 'text', value: text }] };
            if (rPr) node.rPr = rPr;
            return node;
        }

        function hyperlink(text, target, opts = {}) {
            return {
                type: 'hyperlink',
                rId: opts.rId,
                target,
                external: opts.external !== false,
                children: [run(text, opts.rPr || { color: '0563C1', underline: 'single' })]
            };
        }

        function tableFromRows(rows) {
            return {
                type: 'table',
                rows: rows.map(row => ({
                    type: 'row',
                    cells: row.map(cellText => ({
                        type: 'cell',
                        children: [paragraph(cellText)]
                    }))
                }))
            };
        }

        /**
         * Build a run wrapping a single inline image. `data` is the raw
         * image bytes (PNG/JPEG/GIF/BMP/WebP/TIFF). Sizes accept numbers
         * (EMU) or strings with units (`'2in'`, `'5cm'`, `'200px'`).
         */
        function imageRun(data, opts = {}) {
            return {
                type: 'run',
                children: [drawingMod.image(data, opts)]
            };
        }

        /**
         * Build a run wrapping an inline chart. `spec` is a chart object
         * built via `drawingmlChart.barChart()` / `lineChart()` / etc.
         */
        function chartRun(spec, opts = {}) {
            return {
                type: 'run',
                children: [drawingMod.chart(spec, opts)]
            };
        }

        /**
         * Build a run wrapping an inline shape (rectangle, callout, …).
         * `geom` is one of `drawingmlShape.PRESETS` keys.
         */
        function shapeRun(geom, opts = {}) {
            return {
                type: 'run',
                children: [drawingMod.shape(geom, opts)]
            };
        }

        // --- Word fields helpers ---

        /**
         * Build a simple field paragraph child (`<w:fldSimple>`).
         * Common instructions : `'PAGE'`, `'NUMPAGES'`, `'DATE'`,
         * `'TIME'`, `'TOC \\o "1-3"'`, `'MERGEFIELD <name>'`,
         * `'HYPERLINK "<url>"'`.
         *
         * `displayText` is the cached result Word shows before refresh.
         */
        function fieldSimple(instr, displayText, rPr) {
            return {
                type: 'fldSimple',
                instr,
                dirty: true,
                children: displayText != null
                    ? [run(displayText, rPr)]
                    : []
            };
        }

        /**
         * Build the standard 5-run sequence for a complex field
         * (`<w:fldChar w:fldCharType="begin"/>` … `end`). Returns an
         * **array of paragraph children** to splice into a paragraph.
         */
        function fieldComplex(instr, displayText, rPr) {
            return [
                { type: 'run', children: [{ type: 'fldChar', kind: 'begin', dirty: true }] },
                { type: 'run', children: [{ type: 'instrText', value: ' ' + instr + ' ' }] },
                { type: 'run', children: [{ type: 'fldChar', kind: 'separate' }] },
                run(displayText != null ? String(displayText) : '', rPr),
                { type: 'run', children: [{ type: 'fldChar', kind: 'end' }] }
            ];
        }

        // --- Content control builders ---

        /**
         * Build an inline plain-text content control (`<w:sdt>` with
         * `<w:text/>` kind). Wraps a single run carrying the default
         * placeholder text.
         */
        function boundText(props, defaultText, rPr) {
            return {
                type: 'sdt',
                properties: { kind: 'text', ...(props || {}) },
                children: [run(defaultText, rPr)]
            };
        }

        /** Block-level content control wrapping the given block children. */
        function blockSdt(props, children) {
            return {
                type: 'blockSdt',
                properties: { ...(props || {}) },
                children: children || []
            };
        }

        /**
         * Block SDT carrying `<w15:repeatingSectionItem/>` ([MS-DOCX]
         * 2.5.1.11) — one row template inside a section.
         */
        function repeatingSectionItem(children, props) {
            return {
                type: 'blockSdt',
                properties: { kind: 'repeatingSectionItem', ...(props || {}) },
                children: children || []
            };
        }

        /**
         * Block SDT carrying `<w15:repeatingSection>` ([MS-DOCX]
         * 2.5.1.10, Word 2012 namespace) — a content control Word renders
         * as a list of rows the user can add/remove. `props.sectionTitle`
         * becomes the `<w15:sectionTitle>` child and
         * `props.doNotAllowInsertDeleteSection: true` the
         * `<w15:doNotAllowInsertDeleteSection/>` child. `items` is an
         * array of `repeatingSectionItem` block SDTs. `write()` declares
         * the `w15` namespace (ignorable) on the document root.
         */
        function repeatingSection(props, items) {
            return {
                type: 'blockSdt',
                properties: { kind: 'repeatingSection', ...(props || {}) },
                children: items || []
            };
        }

        // --- Templating helpers ---

        /** Walk a node tree, calling `cb` on each SDT (inline or block). */
        function walkSdts(node, cb) {
            if (!node) return;
            if (Array.isArray(node)) { for (const n of node) walkSdts(n, cb); return; }
            if (node.type === 'sdt' || node.type === 'blockSdt') cb(node);
            if (node.body)     walkSdts(node.body, cb);
            if (node.children) walkSdts(node.children, cb);
            if (node.rows)     walkSdts(node.rows, cb);
            if (node.cells)    walkSdts(node.cells, cb);
        }

        /**
         * Deep-clone a docx node tree. Raw XML nodes (`type: 'element'` /
         * `type: 'text'`) are preserved by reference — they're treated as
         * opaque. Typed structures are cloned so substitution is safe.
         */
        function cloneNode(node) {
            if (node == null) return node;
            if (Array.isArray(node)) return node.map(cloneNode);
            if (typeof node !== 'object') return node;
            if (node.type === 'element' || node.type === 'text') return node;
            const out = {};
            for (const k of Object.keys(node)) {
                out[k] = cloneNode(node[k]);
            }
            return out;
        }

        /**
         * Substitute SDT contents in a node tree by `tag → value` mapping.
         *
         * For each SDT (inline or block) whose `properties.tag` matches
         * a key in `data` :
         *
         * - **Inline SDT** (`type: 'sdt'`) — children replaced with a
         *   single run carrying the value as text.
         * - **Block SDT** (`type: 'blockSdt'`) — children replaced with
         *   a single paragraph carrying the value as text.
         *
         * Repeating section / item SDTs are skipped (they're handled by
         * `expandRepeating`). Mutates `node` in place. Returns `node`.
         */
        function substituteByTag(node, data) {
            walkSdts(node, sdt => {
                const tag = sdt.properties && sdt.properties.tag;
                if (!tag || !(tag in data)) return;
                if (sdt.properties.kind === 'repeatingSection'
                    || sdt.properties.kind === 'repeatingSectionItem') return;
                const value = data[tag];
                if (sdt.type === 'blockSdt') {
                    sdt.children = [paragraph(String(value))];
                } else {
                    sdt.children = [run(String(value))];
                }
            });
            return node;
        }

        /**
         * Expand a repeating section against an array of records.
         *
         * The first child of `section` is the **item template**
         * (a `repeatingSectionItem` block). For each record in `data`,
         * the template is deep-cloned and `substituteByTag` is applied
         * with the record. The cloned items become `section.children`.
         *
         * Mutates `section` in place. Returns `section`.
         */
        function expandRepeating(section, data) {
            if (!section || !Array.isArray(section.children)
                || !section.children.length) {
                return section;
            }
            const itemTemplate = section.children[0];
            section.children = (data || []).map(record => {
                const cloned = cloneNode(itemTemplate);
                substituteByTag(cloned, record);
                return cloned;
            });
            return section;
        }

        function bookmark(name, id, children) {
            // Wraps `children` (paragraph children, e.g. runs) between
            // bookmarkStart/End markers — caller injects them into a paragraph.
            return [
                { type: 'bookmarkStart', id, name },
                ...(children || []),
                { type: 'bookmarkEnd', id }
            ];
        }

        function listParagraph(text, numId, ilvl = 0, opts = {}) {
            const pPr = { ...(opts.pPr || {}), numPr: { numId, ilvl } };
            return paragraph(text, { ...opts, pPr });
        }

        // --- Plain-text extraction (helper) ---
        // Implementation lives in ./docx-text.js.

        const api = {
            read, write,
            use,
            fromText, paragraph, run, hyperlink, tableFromRows,
            bookmark, listParagraph, imageRun, chartRun, shapeRun,
            fieldSimple, fieldComplex,
            boundText, blockSdt, repeatingSection, repeatingSectionItem,
            walkSdts, cloneNode, substituteByTag, expandRepeating,
            toText: _toText,
            W_NS, REL_TYPE_DOC, REL_TYPE_HYPERLINK, CT_DOCUMENT
        };
        return api;
    }
};
