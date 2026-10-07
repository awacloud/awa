// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconv-ir/v1` → `.pdf` bytes writer — the bounded `md → pdf`
 * typesetter's FACADE. It owns the whole `md → pdf` write pipeline and is
 * the only module in the family that talks to `@awacloud/pdf`.
 *
 * ```
 *   opts.pdf ─► oconvPdfBox.resolveLayout      (the ONE option validator)
 *   opts.pdf.fonts ─┐
 *   default tier ───┴► oconvPdfMetrics.createMeasurer  (the font routes)
 *     (writeOpts.defaultFaces, else oconvDefaultFaces.defaultFaces())
 *   ir ─► oconvPdfStack.layoutDocument(ir, ctx)        (flow + page stacking)
 *          ├─ ctx.linebreak = oconvPdfLinebreak        (call-time, MANDATORY)
 *          └─ ctx.render / ctx.flowChildren            (renderer seam, defined here)
 *   pages ─► oconvPdfRenderText.pageContent            (content streams)
 *   fonts ─► pdfFontEmbed + pdfBuilder.addFont         (both routes)
 *   ─► pdfBuilder.build() ─► bytes
 * ```
 *
 * Composes ONLY published surfaces: `pdfBuilder`, `pdfFontEmbed`, `fonts`,
 * this package's own pdf-writer modules and the `oconvDefaultFaces` NAME
 * (see "The default-face tier" below). A capability missing
 * upstream is never patched from here.
 *
 * ## Why `ctx.linebreak` is not a `dependencies` entry of the stack
 *
 * `oconvPdfStack` and `oconvPdfLinebreak` are both contractually
 * `dependencies: []` (they compose with call-time arguments only, which is
 * what keeps them worker-safe and capture-free). The consequence is
 * load-bearing HERE: `flowBlocks` THROWS `oconv: pdf stack needs
 * ctx.linebreak` unless this facade puts the RESOLVED linebreaker on the
 * context it builds (`stack.js` `flowBlocks`, the `linebreak` guard). This
 * module is where the two are joined.
 *
 * ## The two font routes
 *
 * - **Standard 14 (default)** — one
 *   `addFont({name, baseFont, subtype, encoding: 'WinAnsiEncoding'})` per
 *   style class the document uses; the renderer encodes WinAnsi bytes with
 *   the table `oconvPdfMetrics` measured the widths with. Text is emitted as
 *   CP1252 literal strings AND every Standard 14 font dict names
 *   `/Encoding /WinAnsiEncoding`, so bytes 0x80–0xFF (accented letters, the
 *   em dash, the bullet markers) decode back to the characters drawn instead
 *   of falling to the font's built-in StandardEncoding. No font program is
 *   embedded, vendored or downloaded.
 * - **Embedded (explicit or default bytes)** — `opts.pdf.fonts` per style
 *   class, or the default-face tier for a class the caller left out. Font
 *   subsetting needs the FULL code-point set of the document, which is only
 *   known once everything is laid out, hence the **two passes**: lay out, walk
 *   every laid-out item to collect code points per style, THEN
 *   `pdfFontEmbed.embedSimple` (every code point WinAnsi-representable) or
 *   `embedCid` (otherwise), then `addFont({name, embedded})` on every page
 *   that uses the style — `pdfBuilder` caches an embed result by IDENTITY,
 *   so N pages share ONE font object. Every
 *   embedded entry carries `hasGlyph(cp)` so a code point the
 *   resolved face has no glyph for is recorded, never drawn silently as
 *   `.notdef`.
 *
 * **Every drawn segment has a font entry.** The code-point walk
 * keys a style that is not one of `oconvPdfMetrics.STYLE_CLASSES` as
 * `regular` — the same degrade `measurer.face` applies — so
 * `fonts[style] || fonts.regular` is defined, and subset over the right code
 * points, for every segment `pageContent` draws. (`pageContent` throws
 * `oconv: pdf font missing <style>` should that guarantee ever break.)
 * Measured before the guarantee: through the
 * published renderers an all-bold document on the embedded route with
 * `pageNumbers: false` draws every segment; the silent path was reachable
 * only through an item carrying a style outside `STYLE_CLASSES`.
 *
 * ## The default-face tier
 *
 * Precedence, resolved PER STYLE CLASS (verbatim, frozen):
 *
 * ```
 * explicit opts.pdf.fonts[class] > registered oconvDefaultFaces[class] > Standard 14
 * ```
 *
 * This facade depends on the module NAME `oconvDefaultFaces` and never
 * imports the companion face pack. `main.js` registers a stand-in under that
 * name at version `0.0.0` (`./pdf/default-faces.js`) whose `defaultFaces()`
 * returns `null`; a real pack registered on the same runtime carries a
 * higher version and displaces it in either registration order, which is
 * all it takes to switch the default tier on. With only the stand-in, every
 * call is byte-identical to a call made before the tier existed.
 *
 * The tier is computed per call: `writeOpts.defaultFaces` (the registered
 * map carried across a worker boundary by structured clone — descriptors are
 * never serialized with bytes) wins WHOLE over the registered descriptor's
 * map when it is neither `undefined` nor `null`; the per-class rule between
 * explicit and default then applies inside `oconvPdfMetrics.createMeasurer`.
 * A call supplying every class explicitly is therefore unaffected by a
 * registered pack.
 *
 * ## Determinism (measured)
 *
 * `irToPdf` injects NO date and NO document `/ID`: it calls `addMetadata`
 * with `Producer`/`Creator` only, never `setId`. `@awacloud/pdf`'s plain
 * write path reads no clock and no randomness — `document/builder.js`'s only
 * date handling is the `DATE_INFO` classifier applied to CALLER-supplied
 * metadata, and `document/writer.js` + `syntax/serializer.js` contain
 * neither `Date` nor `Math.random`. The property therefore holds on THIS
 * path only: `document/encryptedWriter.js` uses `Math.random()` for its file
 * key, so an encrypted document would not be byte-identical across runs.
 * `md → pdf` never enters that path (pinned by `ir-to-pdf.test.js`).
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Detail | Meaning |
 * |---|---|---|
 * | `layout/font-fallback` | `{style, baseFont}` | a style class resolved to its Standard 14 face while at least one class is embedded (explicit OR default) — the pure Standard 14 route is a CHOICE, not a fallback |
 * | `layout/s14-variant-metrics-approx` | `{styles}` | DEFENSIVE FALLBACK — fires only if the fonts package regresses to a shared width table across Standard 14 variants (the fonts package now ships real per-variant tables); not reachable against the real `@awacloud/fonts` |
 * | `text/unencodable` | `{count, sample}` | ONE record per document, on BOTH routes: how many character occurrences could not be drawn faithfully — on the Standard 14 route not WinAnsi-representable (each emitted as `?`), on the embedded route (explicit or default face) no glyph in the resolved face (drawn as `.notdef`) — and a sample of the distinct characters |
 *
 * ## Images
 *
 * `writeOpts.assets` carries `{ '<markdown image destination>': Uint8Array }`
 * down to `oconvPdfRenderImage`, which resolves each IR `image` node and,
 * for a directly-embeddable encoding (JPEG today), places it. Placement
 * needs a `pdfBuilder` page, and pages exist only AFTER stacking, so this
 * facade hands the renderer a builder-SHAPED image SINK on `ctx.builder`:
 * the renderer queues an `addImage` spec under a document-unique `Im<n>`
 * name, and the emission loop replays each spec onto the real builder on the
 * page whose items reference it. `./pdf/render/text.js` draws the operators.
 *
 * Every other code (`layout/line-overflow`, `layout/block-clipped`,
 * `layout/unhandled-block`, the linebreaker's `inline/strike-dropped` and
 * `inline/code-emphasis-dropped`, the renderers' own) passes through from the
 * stage that produced it. Front matter is already stripped by `fromMd`
 * (`frontmatter/stripped`) before this writer sees the IR.
 *
 * Worker-safe (pure composition; caller font bytes and the posted default
 * map travel by structured clone) and capture-free
 * (`fw/no-factory-capture`).
 *
 * @module oconv/write/ir-to-pdf
 */

/**
 * One fidelity loss recorded while writing.
 *
 * @typedef {Object} IrToPdfLoss
 * @property {string} code Stable loss code (see the table above).
 * @property {*} [detail] Stage-specific specifics — an object for the pdf
 *   pipeline's own codes, a string for the codes inherited from the readers.
 * @property {string} [index] Dotted flow-block path, when the producing
 *   stage knew one.
 * @property {string} [kind] Originating IR kind, likewise.
 */

/**
 * Result of `irToPdf`.
 *
 * @typedef {Object} IrToPdfResult
 * @property {Uint8Array} bytes The PDF bytes.
 * @property {IrToPdfLoss[]} losses Pipeline-ordered fidelity losses.
 * @property {number} pages Number of pages emitted.
 */

/**
 * `md → pdf` writer facade module descriptor.
 *
 * Public API (`runtime.resolve('oconvIrToPdf')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `RESOURCE_NAMES` | style class → PDF resource name |
 * | `irToPdf(ir, pdfOpts?, writeOpts?)` | {@link IrToPdfResult} |
 *
 * @type {{name: string, dependencies: string[], factory: Function}}
 */
import { oconvIr } from '../ir/ir.js';
import { oconvPdfMetrics } from './pdf/metrics.js';
import { oconvPdfBox } from './pdf/box.js';
import { oconvPdfLinebreak } from './pdf/linebreak.js';
import { oconvPdfStack } from './pdf/stack.js';
import { oconvPdfRenderText } from './pdf/render/text.js';
import { oconvPdfRenderList } from './pdf/render/list.js';
import { oconvPdfRenderCode } from './pdf/render/code.js';
import { oconvPdfRenderTable } from './pdf/render/table.js';
import { oconvPdfRenderImage } from './pdf/render/image.js';
import { pdfBuilder } from '@awacloud/pdf';
import { pdfFontEmbed } from '@awacloud/pdf';
import { fonts } from '@awacloud/fonts';
// Aliased to the dependency NAME: `deps` entries must read as `dependencies`
// (fw-codegen deps --check compares them textually, the `mdMod as md` A3
// precedent); the bound value is the `oconvDefaultFacesAbsent` stand-in.
import { oconvDefaultFacesAbsent as oconvDefaultFaces } from './pdf/default-faces.js';

export const oconvIrToPdf = {
    name: 'oconvIrToPdf',
    dependencies: [
        'oconvIr',
        'oconvPdfMetrics', 'oconvPdfBox', 'oconvPdfLinebreak', 'oconvPdfStack',
        'oconvPdfRenderText',
        'oconvPdfRenderList', 'oconvPdfRenderCode',
        'oconvPdfRenderTable', 'oconvPdfRenderImage',
        'pdfBuilder', 'pdfFontEmbed', 'fonts',
        'oconvDefaultFaces'
    ],
    deps: [oconvIr, oconvPdfMetrics, oconvPdfBox, oconvPdfLinebreak, oconvPdfStack, oconvPdfRenderText, oconvPdfRenderList, oconvPdfRenderCode, oconvPdfRenderTable, oconvPdfRenderImage, pdfBuilder, pdfFontEmbed, fonts, oconvDefaultFaces],

    factory(irApi, metrics, box, linebreak, stack, renderText,
            renderList, renderCode, renderTable, renderImage,
            pdfBuilderApi, pdfFontEmbedApi, fontsApi, defaultFacesApi) {
        // `fonts` is part of the declared dependency set so this facade's own
        // registration graph is complete and `fw-codegen deps` can resolve
        // every name: the parsed `Font` objects it hands to `pdfFontEmbed`
        // are produced by `oconvPdfMetrics`' own `fonts.read` (both font routes),
        // so nothing is read from it here. Same `void` idiom as `oconv.js`.
        void fontsApi;

        /** Style class → PDF resource name used in the content streams. */
        const RESOURCE_NAMES = Object.freeze({
            regular:    'FR',
            bold:       'FB',
            italic:     'FI',
            boldItalic: 'FZ',
            code:       'FM'
        });

        /**
         * Style classes a shared Standard 14 width table would mis-measure —
         * the diagnostic set for the DEFENSIVE `s14VariantApprox` fallback
         * below. The fonts package now ships real per-variant tables, so
         * against the real `@awacloud/fonts` this set is never
         * the reason a loss fires.
         */
        const BOLD_BEARING = Object.freeze(['bold', 'boldItalic']);

        /** How many distinct unencodable characters the loss samples. */
        const UNENCODABLE_SAMPLE = 8;

        /** IR block kind → the renderer that owns it. */
        const RENDERERS = Object.freeze({
            list:      renderList,
            codeBlock: renderCode,
            table:     renderTable,
            image:     renderImage
        });

        /**
         * Re-enter the stack's `flowBlocks` for a nested block list — a list
         * item's children, a table cell's blocks. Defined HERE, once — the
         * renderer seam is frozen and shared by every renderer.
         *
         * The returned blocks are FLOW blocks, not page items: the caller
         * (a renderer) places them in its own BLOCK-LOCAL space, which is the
         * only coordinate system it is allowed to produce.
         *
         * @param {object} parentCtx The renderer's own child context.
         * @param {object[]} blocks IR block nodes to flow.
         * @param {{indentDelta?: number, styleOverride?: string,
         *   ruleX?: number|null}} [opts] `indentDelta` defaults to
         *   `oconvPdfStack.INDENT_STEP`; `styleOverride` forces every token's
         *   style class (e.g. `'code'`), applied by wrapping the linebreaker
         *   rather than by any edit to the stack.
         * @returns {{blocks: object[], height: number}} `height` is the total
         *   extent, `spaceBefore`/`spaceAfter` included.
         */
        function flowChildrenAt(parentCtx, blocks, opts) {
            const o = opts || {};
            const delta = Number.isFinite(o.indentDelta) ? o.indentDelta : stack.INDENT_STEP;
            const baseIndent = Number.isFinite(parentCtx.indent) ? parentCtx.indent : 0;
            const parentLb = parentCtx.linebreak;
            const childCtx = {
                ...parentCtx,
                indent: baseIndent + delta,
                indexPrefix: parentCtx.index,
                ruleX: o.ruleX === undefined
                    ? (parentCtx.ruleX === undefined ? null : parentCtx.ruleX)
                    : o.ruleX,
                linebreak: o.styleOverride
                    ? {
                        ...parentLb,
                        breakInlines: (inlines, measurer, sizePt, columnPt) =>
                            parentLb.breakInlines(inlines, measurer, sizePt, columnPt, o.styleOverride)
                    }
                    : parentLb
            };
            const flowed = stack.flowBlocks({ kind: 'document', children: blocks || [] }, childCtx);
            let height = 0;
            for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
            return { blocks: flowed, height };
        }

        /**
         * The renderer dispatcher the stack calls for `list`/`codeBlock`/`table`/
         * `image`. Also installs the renderer-facing `flowChildren` binding,
         * so a renderer receives it already bound to ITS OWN context.
         *
         * @param {object} node IR block node.
         * @param {object} childCtx `{...ctx, index, indent, kind}`.
         * @returns {{items: object[], losses: object[], height?: number}}
         */
        function render(node, childCtx) {
            const kind = node && node.kind;
            const renderer = RENDERERS[kind];
            if (!renderer || typeof renderer.render !== 'function') {
                return {
                    items: [],
                    losses: [{
                        code: 'layout/unhandled-block',
                        detail: { kind: String(kind) }
                    }]
                };
            }
            const rendererCtx = {
                ...childCtx,
                flowChildren: (blocks, opts) => flowChildrenAt(childCtx, blocks, opts)
            };
            return renderer.render(node, rendererCtx);
        }

        /**
         * Walk every laid-out item and collect the code points each style
         * class actually puts on the page — pass 2's input, and the ONLY
         * honest basis for a font subset.
         *
         * @param {object[]} pages
         * @param {boolean} pageNumbers Whether page numbers are stamped.
         * @returns {Map<string, Set<number>>} Style class → code points.
         */
        function collectCodePoints(pages, pageNumbers) {
            /** @type {Map<string, Set<number>>} */
            const byStyle = new Map();
            const add = (style, text) => {
                // Font-entry guarantee: a style that is not one of
                // `metrics.STYLE_CLASSES` is keyed as `regular`, mirroring
                // `measurer.face`'s degrade and `pageContent`'s
                // `fonts[style] || fonts.regular` lookup — so the `regular`
                // entry exists, and its subset carries these code points,
                // for every segment such a style draws.
                const key = metrics.STYLE_CLASSES.includes(style) ? style : 'regular';
                let set = byStyle.get(key);
                if (!set) { set = new Set(); byStyle.set(key, set); }
                for (const ch of String(text)) set.add(ch.codePointAt(0));
            };
            for (const page of pages) {
                for (const item of page.items || []) {
                    if (item.text !== undefined) {
                        add(item.style, item.text);
                        continue;
                    }
                    for (const t of item.tokens || []) {
                        if (t && t.text !== undefined) add(t.style, t.text);
                    }
                }
                // The page number is drawn by the renderer, not by the
                // stacker, so its digits are invisible to the walk above —
                // and a missing digit would make an embedded `encode()`
                // throw at emission time.
                if (pageNumbers) add('regular', String(page.number));
            }
            return byStyle;
        }

        /**
         * Build the style class → font-entry map `pageContent` consumes, and
         * register nothing yet (registration is per page).
         *
         * @param {object} measurer
         * @param {Map<string, Set<number>>} byStyle
         * @returns {Object<string, object>} Style class → font entry.
         */
        function buildFonts(measurer, byStyle) {
            /** @type {Object<string, object>} */
            const fonts = {};
            for (const style of metrics.STYLE_CLASSES) {
                const face = measurer.face(style);
                const res = RESOURCE_NAMES[style];
                const widthOf = (text, sizePt) => measurer.widthOf(text, style, sizePt);
                if (face.source !== 'embedded') {
                    fonts[style] = {
                        res, source: 'standard14', baseFont: face.baseFont, widthOf
                    };
                    continue;
                }
                const cps = [...(byStyle.get(style) || new Set())].sort((a, b) => a - b);
                // An embedded face nothing used needs no subset: skipping it
                // keeps a zero-code-point `embedSimple` (which throws) off
                // the path, and `pageContent` can never reference it.
                if (cps.length === 0) continue;
                const winAnsiOnly = cps.every((cp) => metrics.winAnsiByte(cp) !== null);
                const embedded = winAnsiOnly
                    ? pdfFontEmbedApi.embedSimple(face.font, cps)
                    : pdfFontEmbedApi.embedCid(face.font, cps);
                // Glyph probe: the resolved face's own cmap is the truth about
                // which code points it can draw. A miss (`undefined`, `null`
                // or glyph 0 = `.notdef`) is recorded by `pageContent` and
                // collapses into the document's single `text/unencodable`.
                const font = face.font;
                const hasGlyph = (cp) => {
                    const gid = font.glyphIndexForCodePoint(cp);
                    return gid !== undefined && gid !== null && gid !== 0;
                };
                fonts[style] = { res, source: 'embedded', embedded, hasGlyph, widthOf };
            }
            return fonts;
        }

        /**
         * Style class of a PDF resource name — the reverse of
         * {@link RESOURCE_NAMES}, needed because `pageContent` reports the
         * resource names it referenced, and `addFont` needs the entry.
         *
         * @param {Object<string, object>} fonts
         * @param {string} res
         * @returns {object|null}
         */
        function entryForRes(fonts, res) {
            for (const style of Object.keys(fonts)) {
                if (fonts[style].res === res) return fonts[style];
            }
            return null;
        }

        /**
         * Convert an `oconv-ir/v1` document to PDF bytes.
         *
         * @param {object} ir The IR document node.
         * @param {object} [pdfOpts] The caller's `opts.pdf` block — validated
         *   in ONE place (`oconvPdfBox.resolveLayout`).
         * @param {{assets?: Object<string, Uint8Array>,
         *           defaultFaces?: Object<string, Uint8Array>|null}} [writeOpts]
         *   `assets`: image bytes, keyed by the markdown image destination
         *   EXACTLY as written. Kept separate from `pdfOpts` on
         *   purpose: `pdfOpts` is the TYPESETTING block `resolveLayout`
         *   validates key by key, and an unknown key there throws — assets
         *   are content, not layout. Omitted or `undefined` reproduces the
         *   behaviour from before image placement exactly (every image refused with
         *   `reason: 'no-bytes'`). `defaultFaces`: a posted default-face map
         *   (`FontMap`, keys `regular|bold|italic|boldItalic|mono`) — the
         *   registered `oconvDefaultFaces` map carried across a worker
         *   boundary; when neither `undefined` nor `null` it replaces the
         *   registered descriptor's map WHOLE.
         * @returns {IrToPdfResult}
         * @throws {Error} `oconv: bad pdf option <key>` on an invalid option.
         * @throws {Error} `oconv: bad pdf font <style>` on unreadable font
         *   bytes or an unknown `opts.pdf.fonts` key; `oconv: bad default
         *   font <key>` for the same two cases on the default-face map.
         * @throws {Error} `oconv: invalid ir (<code> at <path>)` when the IR
         *   does not validate.
         */
        function irToPdf(ir, pdfOpts, writeOpts) {
            const layout = box.resolveLayout(pdfOpts);
            // The default-face tier, computed PER CALL. A posted map
            // (`writeOpts.defaultFaces`, the registered map carried across a
            // worker boundary) wins WHOLE over the registered descriptor's;
            // the per-class rule between explicit and default then applies
            // inside `createMeasurer`.
            const posted = writeOpts && writeOpts.defaultFaces;
            const registered = defaultFacesApi.defaultFaces();          // null for the stand-in
            const defaultFonts = (posted !== undefined && posted !== null) ? posted : (registered || undefined);
            const measurer = metrics.createMeasurer({ fonts: pdfOpts && pdfOpts.fonts, defaultFonts });
            /** @type {IrToPdfLoss[]} */
            const losses = [];

            for (const style of measurer.fallbacks) {
                losses.push({
                    code: 'layout/font-fallback',
                    detail: { style, baseFont: measurer.face(style).baseFont }
                });
            }

            const check = irApi.validate(ir);
            if (!check.ok) {
                const first = check.errors[0];
                throw new Error(`oconv: invalid ir (${first.code} at ${first.path})`);
            }

            // --- The image seam ----------------------------------------
            // `pdfBuilder.addImage` needs a CURRENT PAGE, and builder pages
            // exist only after stacking — a renderer runs during layout. So
            // the renderer talks to a builder-SHAPED sink that queues the
            // XObject spec by resource name, and the emission loop below
            // replays each spec onto the real builder on the page whose
            // items actually reference it. `imageCounter` is an OBJECT so it
            // survives the `{...ctx}` spreads the stack and `render` do.
            /** @type {Map<string, object>} Resource name → `addImage` spec. */
            const imageSpecs = new Map();
            const imageSink = {
                addImage(spec) { imageSpecs.set(String(spec.name), spec); return imageSink; }
            };

            const ctx = {
                measurer,
                layout,
                column: layout.column,
                sizeFor: layout.sizeFor,
                leading: layout.leading,
                // MANDATORY: `flowBlocks` throws without it (see the header).
                linebreak,
                losses,
                // Base path prefix; `flowBlocks` stamps the real per-block
                // index and the stack hands it to `render` as `ctx.index`.
                index: null,
                render,
                assets: writeOpts && writeOpts.assets,
                builder: imageSink,
                imageCounter: { n: 0 }
            };
            // Assigned after the literal so the closure can name `ctx`
            // itself. Renderers receive their OWN bound copy from `render`;
            // this one serves a standalone caller re-entering the flow.
            ctx.flowChildren = (blocks, opts) => flowChildrenAt(ctx, blocks, opts);

            const { pages } = stack.layoutDocument(ir, ctx);

            const byStyle = collectCodePoints(pages, layout.pageNumbers);
            const boldMeasured = BOLD_BEARING.filter((style) => {
                const set = byStyle.get(style);
                return !!set && set.size > 0 && measurer.face(style).source === 'standard14';
            });
            if (measurer.s14VariantApprox && boldMeasured.length > 0) {
                losses.push({
                    code: 'layout/s14-variant-metrics-approx',
                    detail: { styles: boldMeasured }
                });
            }

            const fonts = buildFonts(measurer, byStyle);

            /** Raw per-character records; collapsed into ONE loss below. */
            const unencodable = [];
            const builder = pdfBuilderApi.builder();
            for (const page of pages) {
                const { bytes, usedFonts } = renderText.pageContent(page, fonts, layout, unencodable);
                builder.addPage({ mediaBox: [0, 0, layout.pageWidth, layout.pageHeight] });
                for (const res of usedFonts) {
                    const entry = entryForRes(fonts, res);
                    if (!entry) continue;
                    builder.addFont(entry.source === 'embedded'
                        ? { name: res, embedded: entry.embedded }
                        : { name: res, baseFont: entry.baseFont, subtype: 'Type1', encoding: 'WinAnsiEncoding' });
                }
                // Register only the images this page's items actually draw:
                // an image whose block was clipped away never placed an item
                // and must not leave an orphan XObject behind.
                const drawn = new Set();
                for (const item of page.items || []) {
                    if (item.xobject) drawn.add(String(item.xobject.name));
                }
                for (const res of drawn) {
                    const spec = imageSpecs.get(res);
                    if (spec) builder.addImage(spec);
                }
                builder.addContent(bytes);
            }

            if (unencodable.length > 0) {
                const distinct = [];
                for (const rec of unencodable) {
                    if (distinct.length >= UNENCODABLE_SAMPLE) break;
                    if (!distinct.includes(rec.char)) distinct.push(rec.char);
                }
                losses.push({
                    code: 'text/unencodable',
                    detail: { count: unencodable.length, sample: distinct.join('') }
                });
            }

            // NO date, NO /ID — see the determinism note in the header.
            builder.addMetadata({ Producer: '@awacloud/oconv', Creator: '@awacloud/oconv' });

            return { bytes: builder.build(), losses, pages: pages.length };
        }

        return { RESOURCE_NAMES, irToPdf };
    }
};
