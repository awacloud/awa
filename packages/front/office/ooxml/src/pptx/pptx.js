// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PresentationML (.pptx) reader/writer.
 *
 * Targets ECMA-376 part 1 §19. `write()` emits the Transitional namespace
 * URIs.
 *
 * **Supported parts** :
 *
 * | Part | Module | Coverage |
 * |------|--------|----------|
 * | `ppt/presentation.xml` | this module | sldMasterIdLst, sldIdLst, sldSize |
 * | `ppt/slides/slide*.xml` | `pptxSlide` | shapes with typed placeholders + text bodies |
 * | `ppt/slideLayouts/slideLayout*.xml` | `pptxSlide` | layouts with placeholders |
 * | `ppt/slideMasters/slideMaster*.xml` | `pptxSlide` | master content + sldLayoutIdLst + clrMap |
 * | `ppt/theme/theme*.xml` | `pptxTheme` | clrScheme + fontScheme + fmtScheme |
 *
 * `write()` auto-generates a master + a default layout + a theme if
 * the caller doesn't provide them, so the simplest invocation
 * (`p.write({ slides: [{ title, body }] })`) produces a valid
 * PowerPoint file.
 *
 * **Document model** :
 *
 * ```js
 * { type: 'presentation',
 *   slides: [{ title?, body?, paragraphs?, shapes?, layoutRef? }],
 *   slideLayouts?: [...],   // auto-generated if absent
 *   slideMasters?: [...],   // auto-generated if absent
 *   theme?: themeObject,
 *   sldSize?: { cx, cy, type? }
 * }
 * ```
 *
 * **Read result** : `read(bytes)` returns the envelope
 * `{ presentation, package, unmodelledParts }`. `package` is the plain
 * OPC package (`{ contentTypes, parts, rels }`); `unmodelledParts` is
 * always present, `[{ partName, contentType }]` sorted by `partName`
 * (`contentType` is `null` when `[Content_Types].xml` declares none),
 * `[]` when every part was consumed. `write(presentation)` takes the
 * model (`presentation`), not the envelope.
 *
 * `write()` produces the parts its model carries; a part `read()` did not
 * model is not written back — `read()` lists it in `unmodelledParts`.
 *
 * **Extended coverage** is available through the `pptx-large` bundle (an
 * estimated ~95 % of real-world usage) and the `pptx-full` bundle (every
 * PresentationML schema element typed or preserved; the rarest elements
 * are preserved as passthroughs rather than modelled). The `.use(...)`
 * hook lets you wire extras after construction. See
 * `docs/api/bundles/README.md` and `docs/guide/coverage.md`.
 *
 * Tables / pictures / charts in slides, animations, transitions and the
 * slide layouts the slides use are typed through the core plus the
 * associated extras. Speaker notes, the notes and handout masters and the
 * view properties have typed parsers and renderers in the `pml-notes`
 * extra, but `read()` does not load those parts; it also skips the
 * layouts no slide uses and every theme other than the first slide
 * master's. All of them are listed in `unmodelledParts`.
 *
 * @module ooxml/pptx
 */

import { ooxmlErrors } from '../errors.js';
import { opcPackage } from '../opc/package.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { opcRelationships } from '../opc/relationships.js';
import { pptxSlide } from './slide.js';
import { pptxTheme } from './theme.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { pptxPicture } from './picture.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { pptxWalker } from './pptx-walker.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptx = {
    name: 'pptx',
    dependencies: ['ooxmlErrors', 'opcPackage', 'xml', 'opcRelationships',
                   'pptxSlide', 'pptxTheme', 'markupCompatibility',
                   'pptxPicture', 'drawingmlChart', 'drawingmlShape',
                   'pptxWalker', 'ooxmlShared'],
    deps: [ooxmlErrors, opcPackage, xml, opcRelationships, pptxSlide, pptxTheme, markupCompatibility, pptxPicture, drawingmlChart, drawingmlShape, pptxWalker, ooxmlShared],

    factory(errors, opc, xml, relsMod, slideMod, themeMod, mc, picMod, chartPartMod,
            shapeMod, walkerMod, shared) {
        const { ParseError, ContractError } = errors;
        const { REL_TYPE, CT, lookupCT, encodeText, decodeText,
                createRidAllocator, trackUnmodelledParts } = shared;

        const P_NS = slideMod.P_NS;
        const A_NS = slideMod.A_NS;
        const R_NS = slideMod.R_NS;
        const REL_TYPE_DOC = REL_TYPE.DOC;
        const CT_PRESENTATION = CT.PRESENTATION;

        // --- Image walking helpers ---

        function attachSlideImages(slide, slideRels, slidePart, pkg) {
            for (const shape of slide.shapes || []) {
                if (shape.type === 'picture' && shape.embedRef) {
                    const rel = slideRels.find(r => r.Id === shape.embedRef);
                    if (rel && rel.Type === picMod.REL_TYPE_IMAGE) {
                        const partName = relsMod.resolveTarget(slidePart, rel.Target);
                        const data = pkg.parts[partName];
                        if (data) {
                            const declared = lookupCT(pkg, partName);
                            shape.image = shape.image || {};
                            shape.image.data = data;
                            shape.image.contentType = declared || picMod.sniffImageType(data);
                            shape.image.rId = shape.embedRef;
                        }
                    }
                } else if (shape.type === 'chart' && shape.chartRef) {
                    const rel = slideRels.find(r => r.Id === shape.chartRef);
                    if (rel && rel.Type === chartPartMod.REL_TYPE_CHART) {
                        const partName = relsMod.resolveTarget(slidePart, rel.Target);
                        const data = pkg.parts[partName];
                        if (data) {
                            shape.chart = chartPartMod.parse(data);
                            shape._chartPartName = partName;
                            // If the chart references an embedded workbook,
                            // resolve via the chart part's own rels.
                            if (shape.chart.embeddedWorkbookRid) {
                                const chartRels = pkg.rels[partName] || [];
                                const embRel = chartRels.find(r =>
                                    r.Id === shape.chart.embeddedWorkbookRid);
                                if (embRel) {
                                    const embPart = relsMod.resolveTarget(partName, embRel.Target);
                                    if (pkg.parts[embPart]) {
                                        shape.chart.embeddedWorkbook = pkg.parts[embPart];
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // --- Default master / layout content ---

        function defaultMasterContent(layoutRefIds) {
            return {
                type: 'slideMaster',
                shapes: [],
                clrMap: xml.el('p:clrMap', {
                    bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2',
                    accent1: 'accent1', accent2: 'accent2', accent3: 'accent3',
                    accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
                    hlink: 'hlink', folHlink: 'folHlink'
                }),
                layoutIds: layoutRefIds.map((rId, i) => ({
                    id: String(2147483649 + i),
                    rId
                }))
            };
        }

        function defaultLayoutContent(type, name) {
            return {
                type: 'slideLayout',
                layoutType: type || 'obj',
                cSldName: name || 'Title and Content',
                shapes: [],
                clrMapOvr: xml.el('p:clrMapOvr', {}, [
                    xml.el('a:masterClrMapping', {})
                ])
            };
        }

        // --- Read ---

        // The archive limits of `opc.read`, picked from the read options;
        // an absent key keeps the opc default, 0 disables that check.
        function archiveLimits(o) {
            return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio } : undefined;
        }

        /**
         * Read a `.pptx` package.
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
            if (!docRel) throw new ParseError('pptx/missing-officeDocument-rel',
                'pptx: no officeDocument relationship');
            const presPart = relsMod.resolveTarget('/', docRel.Target);

            const presBytes = pkg.parts[presPart];
            if (!presBytes) throw new ParseError('pptx/missing-presentation-part',
                'pptx: missing presentation part',
                { context: { partName: presPart } });
            let presRoot;
            try {
                presRoot = mc.process(xml.parse(decodeText(presBytes)));
            } catch (e) {
                throw new ParseError('pptx/invalid-presentation-xml',
                    'pptx: failed to parse presentation XML',
                    { context: { partName: presPart }, cause: e });
            }
            const presRels = pkg.rels[presPart] || [];

            // Slide list (ordered) via sldIdLst → r:id → relationships.
            const sldList = xml.findChild(presRoot, 'p:sldIdLst');
            const slideEntries = sldList
                ? xml.findAll(sldList, 'p:sldId').map(s => ({
                    id: s.attrs.id, rId: s.attrs['r:id']
                  }))
                : [];

            // Slide master list.
            const masterList = xml.findChild(presRoot, 'p:sldMasterIdLst');
            const masterEntries = masterList
                ? xml.findAll(masterList, 'p:sldMasterId').map(m => ({
                    id: m.attrs.id, rId: m.attrs['r:id']
                  }))
                : [];

            // Optional sldSize.
            let sldSize;
            const ssEl = xml.findChild(presRoot, 'p:sldSize');
            if (ssEl) {
                sldSize = {
                    cx: Number(ssEl.attrs.cx),
                    cy: Number(ssEl.attrs.cy)
                };
                if (ssEl.attrs.type) sldSize.type = ssEl.attrs.type;
            }

            // Resolve each part.
            const slides = [];
            const slideLayouts = [];
            const slideMasters = [];
            let theme;

            // slides → layouts → masters chain
            for (const entry of slideEntries) {
                const rel = presRels.find(r => r.Id === entry.rId);
                if (!rel) continue;
                const slidePart = relsMod.resolveTarget(presPart, rel.Target);
                const sBytes = pkg.parts[slidePart];
                if (!sBytes) continue;
                const slideRoot = mc.process(xml.parse(decodeText(sBytes)));
                const slide = slideMod.parseSlide(slideRoot);
                // Resolve picture images via the slide's own relationships.
                const slideRels = pkg.rels[slidePart] || [];
                slide._partName = slidePart;
                attachSlideImages(slide, slideRels, slidePart, pkg);
                slides.push(slide);

                // Resolve the layout this slide points to.
                const layoutRel = slideRels.find(r => r.Type === slideMod.REL_TYPE_SLIDE_LAYOUT);
                if (layoutRel) {
                    const layoutPart = relsMod.resolveTarget(slidePart, layoutRel.Target);
                    if (!slideLayouts.some(l => l._partName === layoutPart)) {
                        const lBytes = pkg.parts[layoutPart];
                        if (lBytes) {
                            const layoutRoot = mc.process(xml.parse(decodeText(lBytes)));
                            const layout = slideMod.parseSlideLayout(layoutRoot);
                            layout._partName = layoutPart;
                            slideLayouts.push(layout);
                        }
                    }
                    slide.layoutRef = slideLayouts.findIndex(l => l._partName === layoutPart);
                }
            }

            // Masters from masterList.
            for (const entry of masterEntries) {
                const rel = presRels.find(r => r.Id === entry.rId);
                if (!rel) continue;
                const masterPart = relsMod.resolveTarget(presPart, rel.Target);
                const mBytes = pkg.parts[masterPart];
                if (!mBytes) continue;
                const masterRoot = mc.process(xml.parse(decodeText(mBytes)));
                const master = slideMod.parseSlideMaster(masterRoot);
                master._partName = masterPart;
                slideMasters.push(master);

                // Theme is referenced from the master.
                const masterRels = pkg.rels[masterPart] || [];
                const themeRel = masterRels.find(r => r.Type === themeMod.REL_TYPE_THEME);
                if (themeRel && !theme) {
                    const themePart = relsMod.resolveTarget(masterPart, themeRel.Target);
                    const tBytes = pkg.parts[themePart];
                    if (tBytes) theme = themeMod.parse(tBytes);
                }
            }

            // Strip internal markers.
            for (const s of slides) {
                delete s._partName;
                for (const sp of s.shapes || []) delete sp._chartPartName;
            }
            for (const l of slideLayouts) delete l._partName;
            for (const m of slideMasters) delete m._partName;

            const presentation = { type: 'presentation', slides };
            if (slideLayouts.length) presentation.slideLayouts = slideLayouts;
            if (slideMasters.length) presentation.slideMasters = slideMasters;
            if (theme)               presentation.theme = theme;
            if (sldSize)             presentation.sldSize = sldSize;

            walker.applyHydrate(presentation);
            return { presentation, package: pkg };
        }

        // --- Extension support (`.use(...)`) ---
        // Walker / dispatcher lives in `./pptx-walker.js`.
        const walker = walkerMod.createWalker();
        function use(...extensions) {
            walker.use(...extensions);
            return api;
        }

        // --- Write ---

        function write(pres) {
            if (pres == null || typeof pres !== 'object' || Array.isArray(pres)) {
                throw new ContractError('pptx/invalid-presentation',
                    'pptx.write: presentation must be an object with a slides array',
                    { context: { received: pres === null ? 'null' : typeof pres } });
            }
            if (pres.slides !== undefined && !Array.isArray(pres.slides)) {
                throw new ContractError('pptx/invalid-slides',
                    'pptx.write: presentation.slides must be an array',
                    { context: { path: 'slides', received: typeof pres.slides } });
            }
            if (walker.hasExtensions) walker.applyDehydrate(pres);
            const pkg = opc.empty();
            const slides = pres.slides || [];

            // Resolve / generate the supporting parts.
            const theme = pres.theme || themeMod.defaults();

            // Layouts: caller-provided or one default.
            let layouts = pres.slideLayouts;
            if (!layouts || !layouts.length) {
                layouts = [defaultLayoutContent('obj', 'Title and Content')];
            }

            // Masters: caller-provided or one default with the layouts.
            const masterRels = layouts.map((_, i) => `rId${i + 1}`);
            let masters = pres.slideMasters;
            if (!masters || !masters.length) {
                masters = [defaultMasterContent(masterRels)];
            } else {
                // Ensure layoutIds match the layouts list if not explicitly set.
                for (const m of masters) {
                    if (!m.layoutIds) {
                        m.layoutIds = masterRels.map((rId, i) => ({
                            id: String(2147483649 + i), rId
                        }));
                    }
                }
            }

            // --- Theme part ---
            opc.setPart(pkg, '/ppt/theme/theme1.xml',
                themeMod.bytesOf(theme), themeMod.CT_THEME);

            // --- Slide masters + their rels (theme + layouts) ---
            masters.forEach((master, i) => {
                const masterPath = `/ppt/slideMasters/slideMaster${i + 1}.xml`;
                opc.setPart(pkg, masterPath,
                    slideMod.slideMasterBytes(master),
                    slideMod.CT_SLIDE_MASTER);

                const masterRelsArr = [];
                // Layouts come first (rId1..rIdN).
                layouts.forEach((_, j) => {
                    masterRelsArr.push({
                        Id: `rId${j + 1}`,
                        Type: slideMod.REL_TYPE_SLIDE_LAYOUT,
                        Target: `../slideLayouts/slideLayout${j + 1}.xml`
                    });
                });
                masterRelsArr.push({
                    Id: `rId${layouts.length + 1}`,
                    Type: themeMod.REL_TYPE_THEME,
                    Target: '../theme/theme1.xml'
                });
                opc.setRels(pkg, masterPath, masterRelsArr);
            });

            // --- Slide layouts + rels (back to first master) ---
            layouts.forEach((layout, j) => {
                const layoutPath = `/ppt/slideLayouts/slideLayout${j + 1}.xml`;
                opc.setPart(pkg, layoutPath,
                    slideMod.slideLayoutBytes(layout),
                    slideMod.CT_SLIDE_LAYOUT);
                opc.setRels(pkg, layoutPath, [{
                    Id: 'rId1',
                    Type: slideMod.REL_TYPE_SLIDE_MASTER,
                    Target: '../slideMasters/slideMaster1.xml'
                }]);
            });

            // --- Slides + rels (each → its layout + per-slide images) ---
            // Image dedup is per-slide rather than global because each
            // slide carries its own rels part. Same-image-different-slide
            // produces two parts (Excel/PowerPoint do this too).
            const usedExts = new Set();
            let nextImageIdx = 1;
            let nextChartIdx = 1;
            const chartParts = [];
            slides.forEach((slide, k) => {
                const node = normalizeSlide(slide);
                const slidePath = `/ppt/slides/slide${k + 1}.xml`;
                const slideRels = [];
                // Per-slide rId allocator. `.claim(preferred)` honors a
                // preferred id when not yet taken and registers it; falls
                // back to `.next()` otherwise. Replaces the historical
                // `nextRid++` counter which could re-emit a preferred id
                // (collision bug) — see CHANGELOG.
                const ridAlloc = createRidAllocator({ prefix: 'rId', start: 1 });

                // Walk the slide's pictures, allocate rIds, write image parts.
                const seenData = new Map();
                for (const shape of node.shapes || []) {
                    if (shape.type === 'picture' && shape.image && shape.image.data) {
                        let item = seenData.get(shape.image.data);
                        if (!item) {
                            const ct = shape.image.contentType
                                || picMod.sniffImageType(shape.image.data);
                            const ext = picMod.extensionFor(ct);
                            const fileName = shape.image.fileName
                                || `image${nextImageIdx++}.${ext}`;
                            item = {
                                rId: ridAlloc.claim(shape.image.rId || shape.embedRef),
                                data: shape.image.data,
                                contentType: ct,
                                fileName,
                                partName: '/ppt/media/' + fileName
                            };
                            seenData.set(shape.image.data, item);
                            opc.setPart(pkg, item.partName, item.data, item.contentType);
                            usedExts.add(ext);
                            slideRels.push({
                                Id: item.rId,
                                Type: picMod.REL_TYPE_IMAGE,
                                Target: '../media/' + fileName
                            });
                        }
                        shape.embedRef = item.rId;
                    } else if (shape.type === 'chart' && shape.chart) {
                        // Allocate the chart part path + rId.
                        const chartIdx = nextChartIdx++;
                        const chartFile = `chart${chartIdx}.xml`;
                        const partName = '/ppt/charts/' + chartFile;
                        // If the chart carries an embedded workbook, write
                        // it first and patch chart.embeddedWorkbookRid so
                        // the chart XML references it.
                        if (shape.chart.embeddedWorkbook) {
                            const embFile = `Microsoft_Excel_Worksheet${chartIdx}.xlsx`;
                            const embPath = '/ppt/embeddings/' + embFile;
                            opc.setPart(pkg, embPath,
                                shape.chart.embeddedWorkbook,
                                chartPartMod.CT_EMBEDDED_XLSX);
                            pkg.contentTypes.overrides[embPath] =
                                chartPartMod.CT_EMBEDDED_XLSX;
                            shape.chart.embeddedWorkbookRid = 'rId1';
                            // Also write the chart part rels.
                            opc.setRels(pkg, partName, [{
                                Id: 'rId1',
                                Type: chartPartMod.REL_TYPE_PACKAGE,
                                Target: '../embeddings/' + embFile
                            }]);
                        }
                        opc.setPart(pkg, partName,
                            chartPartMod.bytesOf(shape.chart),
                            chartPartMod.CT_CHART);
                        chartParts.push(partName);
                        const finalRid = ridAlloc.claim(shape.chartRef);
                        slideRels.push({
                            Id: finalRid,
                            Type: chartPartMod.REL_TYPE_CHART,
                            Target: '../charts/' + chartFile
                        });
                        shape.chartRef = finalRid;
                    }
                }

                // Slide → layout rel — uses a fresh non-colliding rId.
                const layoutRid = ridAlloc.next();
                const layoutIdx = (slide.layoutRef != null && slide.layoutRef < layouts.length)
                    ? slide.layoutRef : 0;
                slideRels.push({
                    Id: layoutRid,
                    Type: slideMod.REL_TYPE_SLIDE_LAYOUT,
                    Target: `../slideLayouts/slideLayout${layoutIdx + 1}.xml`
                });

                opc.setPart(pkg, slidePath,
                    slideMod.slideBytes(node),
                    slideMod.CT_SLIDE);
                opc.setRels(pkg, slidePath, slideRels);
            });
            for (const ext of usedExts) {
                pkg.contentTypes.defaults[ext] = picMod.extToContentType(ext);
            }
            // Chart parts need explicit Override per part.
            for (const partName of chartParts) {
                pkg.contentTypes.overrides[partName] = chartPartMod.CT_CHART;
            }

            // --- presentation.xml ---
            const presChildren = [];
            presChildren.push(xml.el('p:sldMasterIdLst', {},
                masters.map((_, i) => xml.el('p:sldMasterId', {
                    id: String(2147483648 + i),
                    'r:id': `rIdMaster${i + 1}`
                }))));
            presChildren.push(xml.el('p:sldIdLst', {},
                slides.map((_, k) => xml.el('p:sldId', {
                    id: String(256 + k),
                    'r:id': `rIdSlide${k + 1}`
                }))));
            const sldSize = pres.sldSize || { cx: 9144000, cy: 6858000, type: 'screen4x3' };
            const sa = { cx: String(sldSize.cx), cy: String(sldSize.cy) };
            if (sldSize.type) sa.type = sldSize.type;
            presChildren.push(xml.el('p:sldSize', sa));
            presChildren.push(xml.el('p:notesSz', { cx: '6858000', cy: '9144000' }));

            const presXml = xml.serialize(xml.el('p:presentation',
                { 'xmlns:p': P_NS, 'xmlns:a': A_NS, 'xmlns:r': R_NS },
                presChildren));
            opc.setPart(pkg, '/ppt/presentation.xml',
                encodeText(presXml), CT_PRESENTATION);

            // presentation rels — masters (rIdMasterN) + slides (rIdSlideN)
            const presRels = [];
            masters.forEach((_, i) => presRels.push({
                Id: `rIdMaster${i + 1}`,
                Type: slideMod.REL_TYPE_SLIDE_MASTER,
                Target: `slideMasters/slideMaster${i + 1}.xml`
            }));
            slides.forEach((_, k) => presRels.push({
                Id: `rIdSlide${k + 1}`,
                Type: slideMod.REL_TYPE_SLIDE,
                Target: `slides/slide${k + 1}.xml`
            }));
            opc.setRels(pkg, '/ppt/presentation.xml', presRels);

            // package rels
            opc.setRels(pkg, '/', [{
                Id: 'rId1', Type: REL_TYPE_DOC, Target: 'ppt/presentation.xml'
            }]);

            return opc.write(pkg);
        }

        function normalizeSlide(slide) {
            // A slide can be passed as { title, body } (high-level), or with
            // a `paragraphs: [string]` shorthand, or as a fully-typed node
            // with `shapes`. We normalize to the typed form before render.
            if (slide.shapes) return slide;
            if (slide.title != null || (slide.body && slide.body.length)) {
                return slideMod.fromTitleBody(slide);
            }
            if (slide.paragraphs) {
                return {
                    type: 'slide',
                    shapes: [{
                        type: 'shape', id: 2, name: 'Text Body',
                        placeholder: { idx: 1 },
                        txBody: {
                            paragraphs: slide.paragraphs.map(line => ({
                                runs: [{ type: 'text', value: String(line) }]
                            }))
                        }
                    }]
                };
            }
            return { type: 'slide', shapes: [] };
        }

        // --- High-level helpers exposed to consumers ---

        function fromTitleBody(args) { return slideMod.fromTitleBody(args); }
        function extractTitle(slide) { return slideMod.extractTitle(slide); }
        function extractBody(slide)  { return slideMod.extractBody(slide); }

        /** Build a `{ type: 'picture' }` shape from raw image bytes. */
        function picture(data, opts) { return picMod.image(data, opts); }

        /**
         * Build a `{ type: 'shape' }` slide shape with preset geometry +
         * fill / line / text. `geom` is one of `drawingmlShape.PRESETS`
         * keys (`'rect'`, `'roundRect'`, `'ellipse'`, `'rightArrow'`,
         * `'wedgeRectCallout'`, …).
         *
         * `opts.text` accepts a string (auto-wrapped in a single-paragraph
         * text body) or a typed text body object.
         */
        function shape(geom, opts = {}) {
            const props = shapeMod.shapeProps({ geom, ...opts });
            const out = {
                type: 'shape',
                id: opts.id != null ? opts.id : 4,
                name: opts.name || 'Shape',
                shapeProps: props
            };
            if (opts.text != null) {
                if (typeof opts.text === 'string') {
                    out.txBody = {
                        paragraphs: [{
                            runs: [{ type: 'text', value: opts.text }]
                        }]
                    };
                } else {
                    out.txBody = opts.text;
                }
            }
            return out;
        }

        /**
         * Build a `{ type: 'chart' }` slide shape wrapping a chart spec
         * (built via `drawingmlChart.barChart()` / `lineChart()` /
         * `pieChart()` / `scatterChart()` / `doughnutChart()`).
         */
        function chart(spec, opts = {}) {
            return {
                type: 'chart',
                cx: opts.cx || 6000000,
                cy: opts.cy || 4000000,
                offsetX: opts.offsetX || 0,
                offsetY: opts.offsetY || 0,
                name: opts.name || 'Chart',
                ...(opts.id != null ? { id: opts.id } : {}),
                chart: spec
            };
        }

        const api = {
            read, write,
            use,
            fromTitleBody, extractTitle, extractBody,
            picture, chart, shape,
            PRESETS: shapeMod.PRESETS
        };
        return api;
    }
};
