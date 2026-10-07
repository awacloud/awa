// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `image` renderer of the `md → pdf` bounded typesetter
 * — **real image placement**, consuming `@awacloud/pdf`'s
 * `pdfBuilder.addImage` seam.
 *
 * ## What actually happens to an image now
 *
 * `fromMd` gained an `assets` input: `{ '<markdown image destination>':
 * Uint8Array }`, keyed EXACTLY as the markdown wrote it. This renderer
 * resolves an IR `image` node against it (falling back to the bytes a
 * `docx → IR` read carried in `escapes.docx.bytes`) and takes one of two
 * paths:
 *
 * | Case | Result |
 * |---|---|
 * | JPEG bytes resolve | **PLACED** — `ctx.builder.addImage(...)` then a `q … cm /Im<n> Do Q` item. NO loss |
 * | nothing resolved | italic `[image: …]` placeholder + `layout/image-dropped`, `reason: 'no-bytes'` |
 * | bytes resolve, encoding not placeable | italic placeholder + `layout/image-dropped`, `reason: 'unsupported-encoding'` (plus `format` when the header reader could name it) |
 *
 * The placeholder path is the ORIGINAL v1 behaviour, unchanged: nothing is
 * ever silently dropped, and long alt text still wraps through
 * `ctx.flowChildren` in the `italic` style class.
 *
 * ## Why JPEG places and PNG does not (a measured boundary, not an omission)
 *
 * `pdfBuilder.addImage` decodes nothing — the bytes go into the XObject
 * stream verbatim behind the `/Filter` the caller names. JPEG entropy-coded
 * data IS a PDF image stream (`/DCTDecode`), so those bytes embed directly.
 * A PNG's `IDAT` is a zlib stream of *filtered scanlines*, which is NOT a
 * `/FlateDecode` image stream: embedding the file bytes would render
 * garbage, and doing it properly needs a zlib-to-Flate re-wrap (plus an
 * `/SMask` for the alpha colour types, and an `/Indexed` palette for colour
 * type 3). None of that is built here, so PNG is REFUSED with an honest
 * loss rather than guessed at — the "a pair whose fidelity cannot be
 * honestly stated is not shipped" rule applied at the format level. PNG
 * placement is not supported.
 *
 * ## Placement geometry (the typesetter's published bounds, no new rule invented)
 *
 * One image pixel is taken as one PostScript point at natural size. The box
 * is scaled DOWN to the block's column width when it is wider, preserving
 * the aspect ratio, and never scaled UP. Vertical fit is NOT re-decided
 * here: an image taller than the page is handed to the stacker exactly like
 * any other oversized block, and the stacker's existing rule applies — the
 * block starts a clean page, the item falls below the bottom margin, and
 * `layout/block-clipped` is recorded (`../stack.js` `stackPages`).
 *
 * ## The `ctx.builder` seam, and why it is not `pdfBuilder` itself
 *
 * `pdfBuilder.addImage` throws `pdf/builder/no-page` unless a page already
 * exists, and builder pages are created only AFTER stacking — a renderer
 * runs during layout, before anyone knows which page its block lands on. So
 * the facade puts a builder-SHAPED image sink on `ctx` (`{addImage(spec)}`)
 * that queues the spec by resource name, and replays it onto the real
 * `pdfBuilder` when the page that carries the item is created. The operators
 * themselves are emitted by `./text.js`, the one module that turns laid-out
 * items into a content stream.
 *
 * ## Duplication notes (deliberate)
 *
 * Two pure helpers below are MIRRORS, not imports, because an fw factory may
 * not capture a module-scope binding (`fw/no-factory-capture` — the factory
 * source is serialised into Workers and inlined by the standalone builder):
 *
 * - `assetBytes` mirrors the identical bodies in `../../ir-to-docx.js` and
 *   `../../ir-to-odt.js`; the three are pinned byte-identical by
 *   `../../asset-bytes-drift.test.js`.
 * - `readImageHeader` mirrors `../../image-header.js`; the two are pinned by
 *   a drift test in `./image.test.js`.
 *
 * ## Renderer seam contract
 *
 * ```
 * render(node, childCtx) → { items, losses, height }
 * ```
 *
 * - `node` is the `oconv-ir/v1` `image` node (block position, or lifted out
 *   of a text block's inlines by `../stack.js`).
 * - `childCtx` is the stack's child context (`measurer`, `layout`, `column`,
 *   `sizeFor`, `leading`, `linebreak`, `losses`, `render`, `flowChildren`)
 *   plus `index`, `indent`, `kind` — and, for placement, `assets`,
 *   `builder` and `imageCounter` from the facade.
 * - `items` come back in **BLOCK-LOCAL** coordinates: `x` is ABSOLUTE, `y`
 *   is the distance DOWNWARD from the block's top edge — to a text item's
 *   baseline, or to a placed image's BOTTOM edge.
 * - `losses` is the renderer's OWN list; the stack stamps `index`/`kind` on
 *   each entry and appends it to the document ledger.
 * - `height` is BODY height only — the stack adds its own `spaceAfter`.
 *
 * A renderer NEVER edits `../../ir-to-pdf.js`: `render` and `flowChildren`
 * are defined there once, for all four kinds.
 *
 * Capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/write/pdf/render/image
 */

/**
 * Image renderer module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfRenderImage')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `render(node, ctx)` | `{items: object[], losses: object[], height: number}` |
 *
 * `placeImage`, the v1 always-throwing seam that marked exactly this gap, is
 * GONE: placement is the real path above.
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (linebreak: object) => object}}
 */
import { oconvPdfLinebreak } from '../linebreak.js';

export const oconvPdfRenderImage = {
    name: 'oconvPdfRenderImage',
    dependencies: ['oconvPdfLinebreak'],
    deps: [oconvPdfLinebreak],

    factory(linebreak) {
        // Declared as a dependency, composed through `ctx.flowChildren`
        // (which already closes over the resolved linebreaker on the facade
        // side), so nothing here reads `linebreak` directly. The `void`
        // idiom for a declared-but-unused factory parameter is the one this
        // package already uses (`oconv.js`).
        void linebreak;

        /** Style class every placeholder token renders in. */
        const PLACEHOLDER_STYLE = 'italic';

        /**
         * Fixed points of space below a placed image or a placeholder line,
         * folded into this renderer's `height` return (BODY height — the
         * stack adds its own `spaceAfter` on top, see the module header).
         */
        const IMAGE_SPACE_AFTER = 6;

        /**
         * Image bytes for an IR `image` node: caller `assets[name]` first,
         * then the docx reader's carried bytes (`escapes.docx.bytes`, the
         * escapes bag), else `null`. Mirrored in ir-to-docx / ir-to-odt /
         * pdf/render/image — keep byte-identical (asset-bytes-drift.test.js).
         *
         * @param {object} node
         * @param {Object<string, Uint8Array>|undefined} assets
         * @returns {{bytes: Uint8Array, source: 'assets'|'reader'}|null}
         */
        function assetBytes(node, assets) {
            const name = node && typeof node.name === 'string' ? node.name : '';
            if (assets && Object.prototype.hasOwnProperty.call(assets, name)
                && assets[name] instanceof Uint8Array) {
                return { bytes: assets[name], source: 'assets' };
            }
            const esc = node && node.escapes && node.escapes.docx;
            if (esc && esc.bytes instanceof Uint8Array) {
                return { bytes: esc.bytes, source: 'reader' };
            }
            return null;
        }

        /**
         * MIRROR of `../../image-header.js`'s `readImageHeader` — see the
         * duplication note in the module header. Pinned byte-identical by
         * `./image.test.js`; edit BOTH copies or neither.
         *
         * @param {Uint8Array} bytes
         * @returns {{format: string, width: number, height: number,
         *   colorSpace: string, bitsPerComponent: number,
         *   filter: string|null}|null}
         */
        function readImageHeader(bytes) {
            if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;

            const u16 = (at) => ((bytes[at] << 8) | bytes[at + 1]) >>> 0;
            const u32 = (at) => (
                (bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]
            );

            // ---- PNG: an 8-byte signature, then IHDR as the FIRST chunk. --------
            const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            let isPng = true;
            for (let i = 0; i < 8; i += 1) if (bytes[i] !== PNG_SIG[i]) { isPng = false; break; }
            if (isPng) {
                // 8 signature + 4 length + 4 type + 13 IHDR data + 4 CRC.
                if (bytes.length < 33) return null;
                if (u32(8) !== 13) return null;
                if (bytes[12] !== 0x49 || bytes[13] !== 0x48
                    || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
                const width = u32(16);
                const height = u32(20);
                const bitDepth = bytes[24];
                const colorType = bytes[25];
                if (width < 1 || height < 1) return null;
                if (bitDepth !== 1 && bitDepth !== 2 && bitDepth !== 4
                    && bitDepth !== 8 && bitDepth !== 16) return null;
                // 0 = greyscale, 2 = truecolour. 3 needs a palette, 4 and 6 need an
                // alpha channel: refused rather than guessed (see the module header).
                let colorSpace = null;
                if (colorType === 0) colorSpace = 'DeviceGray';
                else if (colorType === 2) colorSpace = 'DeviceRGB';
                if (colorSpace === null) return null;
                return {
                    format: 'png',
                    width, height, colorSpace,
                    bitsPerComponent: bitDepth,
                    filter: null
                };
            }

            // ---- JPEG: SOI, then walk marker segments to the frame header. -----
            if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
            let at = 2;
            while (at + 1 < bytes.length) {
                if (bytes[at] !== 0xFF) return null;
                let marker = bytes[at + 1];
                // Fill bytes: any number of 0xFF may precede a marker code.
                while (marker === 0xFF) {
                    at += 1;
                    if (at + 1 >= bytes.length) return null;
                    marker = bytes[at + 1];
                }
                // Standalone markers carry no length field.
                if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { at += 2; continue; }
                // The scan or the end of the image: no frame header was found.
                if (marker === 0xD9 || marker === 0xDA) return null;
                if (at + 3 >= bytes.length) return null;
                const len = u16(at + 2);
                if (len < 2 || at + 2 + len > bytes.length) return null;
                // SOF0 baseline, SOF1 extended sequential, SOF2 progressive — the
                // three /DCTDecode-compatible frame headers. Every other SOF
                // (arithmetic, lossless, hierarchical) falls through and ends at
                // the SOS refusal above.
                if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
                    if (len < 8) return null;
                    const precision = bytes[at + 4];
                    const height = u16(at + 5);
                    const width = u16(at + 7);
                    const components = bytes[at + 9];
                    if (width < 1 || height < 1 || precision < 1) return null;
                    // 4 components is CMYK / YCCK: it needs a /Decode array and an
                    // Adobe APP14 transform this module does not model.
                    let colorSpace = null;
                    if (components === 1) colorSpace = 'DeviceGray';
                    else if (components === 3) colorSpace = 'DeviceRGB';
                    if (colorSpace === null) return null;
                    return {
                        format: 'jpeg',
                        width, height, colorSpace,
                        bitsPerComponent: precision,
                        filter: 'DCTDecode'
                    };
                }
                at += 2 + len;
            }
            return null;
        }

        /**
         * The `[image: …]` placeholder text for one `image` node — `alt`
         * wins, `name` is the fallback, `[image]` when both are empty.
         *
         * @param {string} name
         * @param {string} alt
         * @returns {string}
         */
        function placeholderText(name, alt) {
            if (alt !== '') return `[image: ${alt}]`;
            if (name !== '') return `[image: ${name}]`;
            return '[image]';
        }

        /**
         * The refusal path: an italic placeholder line plus exactly one
         * `layout/image-dropped` loss carrying the machine-readable reason.
         *
         * @param {object} ctx Renderer child context.
         * @param {string} name
         * @param {string} alt
         * @param {object} detailExtra `{reason, bytes}` plus an optional
         *   `format` when the header reader could name the container.
         * @returns {{items: object[], losses: object[], height: number}}
         */
        function placeholder(ctx, name, alt, detailExtra) {
            const run = {
                kind: 'run', text: placeholderText(name, alt),
                bold: false, italic: true, strike: false, code: false, link: null
            };
            const { blocks } = ctx.flowChildren(
                [{ kind: 'paragraph', children: [run] }],
                { indentDelta: 0, styleOverride: PLACEHOLDER_STYLE }
            );
            const body = blocks[0];
            const leading = ctx.layout.leading(body.sizePt);
            const x = ctx.layout.margin + body.indent;

            const items = (body.lines || []).map((line, n) => ({
                x,
                y: body.spaceBefore + (n + 1) * leading,
                style: line.tokens.length > 0 ? line.tokens[0].style : PLACEHOLDER_STYLE,
                sizePt: body.sizePt,
                tokens: line.tokens,
                index: ctx.index,
                kind: ctx.kind
            }));

            return {
                items,
                losses: [{
                    code: 'layout/image-dropped',
                    detail: { index: ctx.index, name, alt, ...detailExtra }
                }],
                height: body.spaceBefore + body.height + IMAGE_SPACE_AFTER
            };
        }

        /**
         * Render one `image` block: PLACE it when its bytes resolve to a
         * directly-embeddable encoding, otherwise draw the italic
         * placeholder and record `layout/image-dropped` with its reason.
         *
         * @param {object} node `oconv-ir/v1` `image` node (`{name, alt}`,
         *   optionally carrying `escapes.docx.bytes`).
         * @param {object} ctx Stack child context (see the module header).
         * @returns {{items: object[], losses: object[], height: number}}
         * @throws {Error} `oconv: pdf image renderer needs ctx.builder` when
         *   bytes DID resolve to a placeable image but the facade supplied
         *   no image sink / counter. Unreachable on every refusal path, so a
         *   caller that never supplies assets never meets it.
         */
        function render(node, ctx) {
            const name = node && typeof node.name === 'string' ? node.name : '';
            const alt = node && typeof node.alt === 'string' ? node.alt : '';

            const r = assetBytes(node, ctx.assets);
            if (!r) {
                return placeholder(ctx, name, alt, { reason: 'no-bytes', bytes: 0 });
            }

            const header = readImageHeader(r.bytes);
            if (header === null) {
                return placeholder(ctx, name, alt, {
                    reason: 'unsupported-encoding', bytes: r.bytes.length
                });
            }
            if (header.filter === null) {
                // Geometry known, container named — but its bytes are not a
                // PDF image stream (PNG; see the module header).
                return placeholder(ctx, name, alt, {
                    reason: 'unsupported-encoding', bytes: r.bytes.length,
                    format: header.format
                });
            }

            const counter = ctx.imageCounter;
            const sink = ctx.builder;
            if (!counter || !Number.isFinite(counter.n)
                || !sink || typeof sink.addImage !== 'function') {
                throw new Error('oconv: pdf image renderer needs ctx.builder');
            }

            const resourceName = `Im${counter.n}`;
            counter.n += 1;
            sink.addImage({
                name: resourceName,
                width: header.width,
                height: header.height,
                colorSpace: header.colorSpace,
                bitsPerComponent: header.bitsPerComponent,
                filter: header.filter,
                data: r.bytes
            });

            // One image pixel = one point at natural size; scale DOWN to the
            // column, never up. Vertical overflow is the stacker's existing
            // oversized-block rule, not a new one (see the module header).
            const indent = Number.isFinite(ctx.indent) ? ctx.indent : 0;
            const columnPt = ctx.layout.column - indent;
            const scale = header.width > columnPt ? columnPt / header.width : 1;
            const drawW = header.width * scale;
            const drawH = header.height * scale;

            return {
                items: [{
                    x: ctx.layout.margin + indent,
                    // Block-local `y` of the image's BOTTOM edge: its top
                    // edge is the block top, so the bottom is one image
                    // height below it.
                    y: drawH,
                    xobject: { name: resourceName, w: drawW, h: drawH },
                    style: 'regular',
                    sizePt: ctx.layout.sizeFor('paragraph'),
                    tokens: [],
                    index: ctx.index,
                    kind: ctx.kind
                }],
                losses: [],
                height: drawH + IMAGE_SPACE_AFTER
            };
        }

        return { render };
    }
};
