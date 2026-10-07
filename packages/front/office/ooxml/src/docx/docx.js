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
 * not written back — `read()` lists it in `unmodelledParts`.
 *
 * **Read result** : `read(bytes)` returns the envelope
 * `{ document, package, documentPart, hyperlinks, headers, footers,
 * images, charts?, customXml?, styles?, numbering?, settings?, comments?,
 * footnotes?, endnotes?, unmodelledParts }`. `package` is the plain OPC
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
                wordRootAttrs } = shared;
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
        // repeating-section elements are kept) and every `mc:Choice` falls
        // through to its Fallback branch. Invalid XML throws what
        // `xml.parse` throws.
        function storyRoot(bytes) {
            const root = xml.parse(decodeText(bytes));
            mc.process(root, { keepElements: REPEATING_SECTION_ELEMENTS });
            return root;
        }

        // Walk a node tree, calling `cb` on every drawing run-child.
        function walkDrawings(doc, cb) {
            walkNodes(doc, n => {
                if (n && n.type === 'drawing') cb(n);
            });
        }

        // Walk every container that may host drawings : the main body,
        // each header / footer body, every footnote, endnote and comment
        // body. Used by both read (to resolve image/chart parts) and
        // write (to collect rIds before serialization).
        function walkAllDrawings(result, cb) {
            walkDrawings(result.document || result, cb);
            for (const k of Object.keys(result.headers || {})) {
                const h = result.headers[k];
                if (h && h.body) walkDrawings(h.body, cb);
            }
            for (const k of Object.keys(result.footers || {})) {
                const f = result.footers[k];
                if (f && f.body) walkDrawings(f.body, cb);
            }
            for (const fn of (result.footnotes && result.footnotes.notes) || []) {
                if (fn && fn.body) walkDrawings(fn.body, cb);
            }
            for (const en of (result.endnotes && result.endnotes.notes) || []) {
                if (en && en.body) walkDrawings(en.body, cb);
            }
            for (const c of (result.comments && result.comments.comments) || []) {
                if (c && c.body) walkDrawings(c.body, cb);
            }
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
            return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio } : undefined;
        }

        /**
         * Read a `.docx` package.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts]
         * @param {number} [opts.maxParts] archive limit forwarded to
         *        `opc.read` (default 1024 entries; `0` disables).
         * @param {number} [opts.maxUncompressed] archive limit forwarded to
         *        `opc.read` (default 256 MiB in total; `0` disables).
         * @param {number} [opts.maxRatio] archive limit forwarded to
         *        `opc.read` (default 200 per entry; `0` disables).
         */
        function read(bytes, opts) {
            const pkg = opc.read(bytes, archiveLimits(opts));
            const { value: result, unmodelledParts } =
                trackUnmodelledParts(pkg, readPackage);
            result.unmodelledParts = unmodelledParts;
            return result;
        }

        // The read pass proper, over an access-tracking view of
        // `pkg.parts` (see `ooxmlShared.trackUnmodelledParts`).
        function readPackage(pkg) {
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
            // still dropped.
            mc.process(root, { keepElements: REPEATING_SECTION_ELEMENTS });
            const bodyEl = xml.findChild(root, 'w:body');
            if (!bodyEl) throw new ParseError('docx/missing-body',
                'docx: no <w:body> in document',
                { context: { partName: docPart } });

            const { body, sectPr } = structure.parseBody(bodyEl);
            const document = { type: 'document', body };
            if (sectPr) document.sectPr = sectPr;

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
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const data = pkg.parts[partName];
                        if (data) {
                            result.charts = result.charts || {};
                            result.charts[rel.Id] = {
                                partName,
                                chart: chartMod.parse(data)
                            };
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
                        if (b) result.numbering = numberingMod.parse(b);
                        break;
                    }
                    case settingsMod.REL_TYPE_SETTINGS: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) result.settings = settingsMod.parse(b);
                        break;
                    }
                    case commentsMod.REL_TYPE_COMMENTS: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.comments = commentsMod.parse(storyRoot(b));
                            storyParts.push([partName, bodiesOf(result.comments.comments)]);
                        }
                        break;
                    }
                    case footnotesMod.REL_TYPE_FOOTNOTES: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.footnotes = footnotesMod.parseFootnotes(storyRoot(b));
                            storyParts.push([partName, bodiesOf(result.footnotes.notes)]);
                        }
                        break;
                    }
                    case footnotesMod.REL_TYPE_ENDNOTES: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.endnotes = footnotesMod.parseEndnotes(storyRoot(b));
                            storyParts.push([partName, bodiesOf(result.endnotes.notes)]);
                        }
                        break;
                    }
                    case headersMod.REL_TYPE_HEADER: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.headers[rel.Id] = headersMod.parse(storyRoot(b), 'header');
                            storyParts.push([partName, [result.headers[rel.Id].body]]);
                        }
                        break;
                    }
                    case headersMod.REL_TYPE_FOOTER: {
                        const partName = relsMod.resolveTarget(docPart, rel.Target);
                        const b = pkg.parts[partName];
                        if (b) {
                            result.footers[rel.Id] = headersMod.parse(storyRoot(b), 'footer');
                            storyParts.push([partName, [result.footers[rel.Id].body]]);
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

            // Attach image bytes / chart specs to each <w:drawing> in
            // the body, headers, footers, footnotes, endnotes AND
            // comments — resolving its embedRef / chartRef against the
            // document rels.
            walkAllDrawings(result, drawing => {
                if (drawing.embedRef) {
                    const img = result.images[drawing.embedRef];
                    if (img) {
                        drawing.image = drawing.image || {};
                        drawing.image.data = img.data;
                        drawing.image.contentType = img.contentType;
                        drawing.image.rId = drawing.embedRef;
                    }
                }
                if (drawing.chartRef && result.charts
                    && result.charts[drawing.chartRef]) {
                    drawing.chart = result.charts[drawing.chartRef].chart;
                    drawing.kind = 'chart';
                }
            });

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
         *   `docx/numbering-missing` when a paragraph's `pPr.numPr`
         *   references a non-zero `numId` and `opts.numbering` is missing
         *   (the list reference would dangle). All checks run before any part
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
            // Reference checks run before the dehydrate pass and before any
            // part is rendered, so a throw leaves the caller's tree untouched.
            checkReferences(doc, opts);
            // Apply dehydrate hooks before rendering. The walker mutates
            // in place, so callers reusing the same doc tree see
            // properties demoted back into `_extras`. This mirrors the
            // hydrate pass on read().
            if (walker.hasExtensions) {
                walker.applyDehydrate({
                    document: doc,
                    headers: opts.headers || {},
                    footers: opts.footers || {},
                    styles: opts.styles,
                    settings: opts.settings
                });
            }
            const pkg = opc.empty();

            const hyperlinks = opts.hyperlinks || derivedHyperlinks(doc);

            // Collect drawings → assign rIds, write image parts, declare types.
            // The same image (by Uint8Array identity) is deduped to a single part.
            // Order: image and chart rIds must be set on the drawing tree
            // BEFORE renderDocument is called, so the rendered XML carries
            // the right r:embed / r:id on each drawing.
            const collected = collectImages(doc, opts.images);
            for (const ext of collected.exts) {
                pkg.contentTypes.defaults[ext] = extToContentType(ext);
            }
            for (const img of collected.list) {
                opc.setPart(pkg, img.partName, img.data, img.contentType);
            }
            const chartCollected = collectCharts(doc);
            for (const ch of chartCollected) {
                opc.setPart(pkg, ch.partName,
                    chartMod.bytesOf(ch.chart),
                    chartMod.CT_CHART);
                pkg.contentTypes.overrides[ch.partName] = chartMod.CT_CHART;
            }

            // Render document.xml.
            const documentXml = renderDocument(doc);
            opc.setPart(pkg, '/word/document.xml',
                encodeText(documentXml), CT_DOCUMENT);

            // Build the document part's relationship table.
            const docRels = [];
            const _ridAlloc = createRidAllocator({ existing: docRels });
            const claimRid = (preferred) => _ridAlloc.claim(preferred);

            function attachPart(opts_part, partName, rel) {
                opc.setPart(pkg, partName, opts_part.bytes, opts_part.contentType);
                docRels.push(rel);
            }

            // A story part's own relationship table: the hyperlink
            // relationships derived from its bodies, written when non-empty.
            function attachStoryRels(partName, bodies) {
                const rels = hyperlinkRels(derivedHyperlinks(bodies));
                if (rels.length) opc.setRels(pkg, partName, rels);
            }

            if (opts.styles) {
                attachPart(
                    { bytes: stylesMod.bytesOf(opts.styles),
                      contentType: stylesMod.CT_STYLES },
                    '/word/styles.xml',
                    { Id: claimRid(), Type: stylesMod.REL_TYPE_STYLES,
                      Target: 'styles.xml' });
            }
            if (opts.numbering) {
                attachPart(
                    { bytes: numberingMod.bytesOf(opts.numbering),
                      contentType: numberingMod.CT_NUMBERING },
                    '/word/numbering.xml',
                    { Id: claimRid(), Type: numberingMod.REL_TYPE_NUMBERING,
                      Target: 'numbering.xml' });
            }
            if (opts.settings) {
                attachPart(
                    { bytes: settingsMod.bytesOf(opts.settings),
                      contentType: settingsMod.CT_SETTINGS },
                    '/word/settings.xml',
                    { Id: claimRid(), Type: settingsMod.REL_TYPE_SETTINGS,
                      Target: 'settings.xml' });
            }
            if (opts.comments) {
                attachPart(
                    { bytes: commentsMod.bytesOf(opts.comments),
                      contentType: commentsMod.CT_COMMENTS },
                    '/word/comments.xml',
                    { Id: claimRid(), Type: commentsMod.REL_TYPE_COMMENTS,
                      Target: 'comments.xml' });
                attachStoryRels('/word/comments.xml', bodiesOf(opts.comments.comments));
            }
            if (opts.footnotes) {
                attachPart(
                    { bytes: footnotesMod.footnotesBytes(opts.footnotes),
                      contentType: footnotesMod.CT_FOOTNOTES },
                    '/word/footnotes.xml',
                    { Id: claimRid(), Type: footnotesMod.REL_TYPE_FOOTNOTES,
                      Target: 'footnotes.xml' });
                attachStoryRels('/word/footnotes.xml', bodiesOf(opts.footnotes.notes));
            }
            if (opts.endnotes) {
                attachPart(
                    { bytes: footnotesMod.endnotesBytes(opts.endnotes),
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
                        { bytes: headersMod.bytesOf(opts.headers[rId]),
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
                        { bytes: headersMod.bytesOf(opts.footers[rId]),
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

            opc.setRels(pkg, '/', [{
                Id: 'rId1', Type: REL_TYPE_DOC, Target: 'word/document.xml'
            }]);

            return opc.write(pkg);
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
        function collectImages(doc, extra) {
            const list = [];
            const byData = new Map();
            const exts = new Set();
            const _ridAlloc = createRidAllocator({ prefix: 'rImg',
                existing: extra ? Object.keys(extra) : [] });
            let nextIdx = 1;

            function nextRId() { return _ridAlloc.next(); }

            // Pre-register caller-provided extras so their rIds don't collide.
            if (extra) {
                for (const id of Object.keys(extra)) {
                    const e = extra[id];
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

            walkDrawings(doc, drawing => {
                const img = drawing.image;
                if (!img || !img.data) return;
                let item = byData.get(img.data);
                if (!item) {
                    const ct = img.contentType || drawingMod.sniffImageType(img.data);
                    const ext = drawingMod.extensionFor(ct);
                    const fileName = img.fileName || `image${nextIdx++}.${ext}`;
                    const preferredId = img.rId || drawing.embedRef;
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
                drawing.embedRef = item.rId;
            });

            return { list, exts };
        }

        /**
         * Walk the document for chart drawings, allocate rIds, file
         * names, and return a list ready to write parts + add rels.
         */
        function collectCharts(doc) {
            const out = [];
            const _ridAlloc = createRidAllocator({ prefix: 'rChart' });
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
         * list reference that would dangle without `opts.numbering` (body,
         * headers and footers). Read-only: never mutates the tree.
         */
        function checkReferences(doc, opts) {
            let lostTarget = null;
            let unresolved = null;
            let danglingNumId = null;
            const visitor = (table, where, withNumbering) => node => {
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
                if (withNumbering && danglingNumId === null && !opts.numbering
                    && node.type === 'paragraph' && node.pPr && node.pPr.numPr
                    && node.pPr.numPr.numId != null
                    && Number(node.pPr.numPr.numId) !== 0) {
                    danglingNumId = node.pPr.numPr.numId;
                }
            };
            walkRuns(doc.body, visitor(opts.hyperlinks || derivedHyperlinks(doc),
                { story: 'document' }, true));
            for (const part of storyPartsOf(opts)) {
                const headerOrFooter = part.where.key !== undefined;
                walkRuns(part.bodies, visitor(derivedHyperlinks(part.bodies),
                    part.where, headerOrFooter));
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
                    'docx.write: the document references a list (pPr.numPr) but opts.numbering is missing',
                    { context: { numId: danglingNumId } });
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
            const root = xml.el('w:document', wordRootAttrs([body]), [body]);
            return xml.serialize(root);
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
