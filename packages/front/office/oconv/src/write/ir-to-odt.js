// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconvIrToOdt` — `oconv-ir/v1` → `.odt` bytes (tier 2),
 * composing `@awacloud/odf`'s documented typed body model and producing
 * bytes through `odt.write({ body }, { styles })` ONLY: the typed body plus
 * one fixed, typed named-styles object (§ Styles part below).
 *
 * The odf typed semantic write model (`docs/api/text/{paragraph,heading,
 * list,content,style-registry}.md`) now lets this writer express run
 * emphasis (`span` flags, `code` → `monospace`), hyperlink targets (a
 * `text:a` via a `link` run), ordered-vs-bullet lists, and text-body
 * tables — all WITHOUT loss; `odt.write` synthesizes the automatic styles
 * (`awa-t-*`/`awa-l-*`, and `awa-c-b`/`awa-tb-m` for `grid` tables) and
 * font-face declarations for these fields itself, so this module never
 * builds `autoStyles` or `fontFaces` explicitly. What remains genuinely inexpressible through the
 * typed model is still DEGRADED here with an exact, non-silent loss ledger
 * entry per occurrence, never worked around with a raw-XML passthrough
 * node.
 *
 * ## Block mapping
 *
 * | IR | odt typed node | Loss |
 * |---|---|---|
 * | `heading{level}` | `{type:'heading', outlineLevel:level, styleName:'Heading_20_'+level, runs}` — the name is presentation only; the read leg recovers the level from `outlineLevel` | — |
 * | `paragraph` | `{type:'paragraph', runs}` | — |
 * | `list` (bullet or ordered) | `{type:'list', ordered, items:[{children:[…]}]}` — nesting PRESERVED; ordered lists also carry `numFormat:'1'` (md ordered lists are decimal) | — |
 * | `listItem` | one `items[]` entry, children = mapped blocks; a GFM task item (`escapes.md.task`, set by the md reader) gets a plain leading `☐ ` (U+2610, unchecked) or `☒ ` (U+2612, checked) text run in its first paragraph | `{code:'list/task-marker-dropped', detail:'[x]'\|'[ ]'}` only when a task item's first block is not a paragraph (the md reader never builds one) |
 * | `table` | typed `{type:'table', grid:true, columns, headerRows, rows:[{type:'row', cells:[{type:'cell', children:[…typed blocks]}]}]}` — leading IR rows with `header:true` become `headerRows`; cell content is fully typed by recursing `mapBlock`; `grid:true` makes `@awacloud/odf` synthesise bordered cells (`awa-c-b`) and a margins-aligned table (`awa-tb-m`) | — |
 * | `codeBlock` | one `{type:'paragraph', styleName:'Preformatted_20_Text', runs}` per line of `text` (an empty line is an empty paragraph; the one trailing newline writes none); a run of 2+ spaces, or a space that starts the line or follows a tab, is a `space` run (`text:s` — ODF collapses plain spaces), a tab a `tab` run. The `info` string is not written | — |
 * | `blockquote` | each `paragraph` child → `{type:'paragraph', styleName:'Quotations', runs}`; a nested quote's paragraphs too; any other child keeps its own mapping, emitted in place | `{code:'block/degraded', detail:'blockquote:nested'}` per nested quote; `{code:'block/degraded', detail:'blockquote-child:<kind>'}` per non-paragraph child |
 * | `hr` | an EMPTY `{type:'paragraph', styleName:'Horizontal_20_Line', runs:[]}` | — |
 * | `image` (bytes reachable) | an odt `frame` run `{type:'frame', anchorType:'as-char', width, height, child:{kind:'image', href:'Pictures/image<k>.<ext>'}}` — its intrinsic size, else `5.08cm` × `3.81cm`; a non-empty `alt` as an `svg:title` raw child (`_extras.children`) — inline in place within its paragraph's runs, or as its own `{type:'paragraph', runs:[<frame run>]}` at block position; the bytes become the package part `href` names (§ Images below) | `{code:'image/size-defaulted', detail:name}` only when no size is read |
 * | `image` (no bytes reachable) | dropped | `{code:'image/dropped', detail:name}` |
 *
 * ## Styles part
 *
 * Every write emits `styles.xml`, headings or not, through
 * `odt.write(doc, { styles })` — one fixed, input-free typed styles
 * object, the ODF counterpart of the docx writer's fixed styles set:
 *
 * - `Standard` — the root paragraph style;
 * - `Text_20_body` (`Text body`) — based on `Standard`, 0 / 0.247 cm
 *   margins;
 * - `Heading` — based on `Standard`, `next` `Text_20_body`,
 *   keep-with-next;
 * - `Heading_20_1`..`Heading_20_6` (`Heading 1`..`Heading 6`) — based on
 *   `Heading`, bold, 16/14/13/12/11/11 pt (docx parity: 32/28/26/24/22/22
 *   half-points), `style:default-outline-level` N;
 * - `Preformatted_20_Text` (`Preformatted Text`) — code: `Liberation Mono`
 *   (generic `modern`, fixed pitch) 10 pt, no margins;
 * - `Quotations` — quotes: 1 cm left and right margins;
 * - `Horizontal_20_Line` (`Horizontal Line`) — rules: a 0.5 pt grey bottom
 *   border.
 *
 * The last three are LibreOffice's built-in names (pandoc writes them too);
 * `../read/odt-to-ir.js` reads them back as a code block, a quote and a
 * rule.
 *
 * `Heading_20_N` is LibreOffice's programmatic name for "Heading N"
 * (`_20_` encodes a space). Every `text:style-name` this writer
 * references is defined in the part. The set is fixed, caller-invisible;
 * tier 3 (caller styling) is still not promised — there is no option to
 * supply or alter styles. The typed specs travel through
 * `odfStyles.serialize`; the table borders
 * and the margins alignment come from the `grid` seam of `odf`'s body
 * table model, never from a style built here.
 *
 * ## Images and `opts.assets`
 *
 * `irToOdt(ir, opts)` accepts the same `opts.assets` manifest as
 * `oconvIrToDocx.irToDocx` and `oconvIrToPdf.irToPdf`, so `oconv.fromMd`
 * threads ONE argument to all three writers. {@link assetBytes} resolves an
 * image node against it (caller `assets[name]` (or its percent-decoded form) first, then the bytes a
 * reader carried in `escapes.docx.bytes` / `escapes.odt.bytes`), and the decision is
 * taken in ONE place, `placeImage`, for both the inline and the
 * block-level call site:
 *
 * - no bytes reachable → the image is dropped, `image/dropped`;
 * - bytes reachable → the image is PLACED through `@awacloud/odf`'s typed
 *   frame run (rendered as `<draw:frame><draw:image/></draw:frame>`,
 *   anchored as a character) and its bytes travel in `odt.write`'s
 *   `doc.pictures` map, emitted as a package part. The frame takes the
 *   image's intrinsic size, read by {@link imageExtent} from its header
 *   (96 dpi when the file states none, scaled down to fit 6 in × 8 in) —
 *   the same rule as the docx writer; a header it cannot read keeps the
 *   default box, 2 in × 1.5 in (`5.08cm` × `3.81cm`), and records
 *   `image/size-defaulted` — a degrade, never a drop. A non-empty IR `alt`
 *   is written as the frame's `svg:title`, after the image (`@awacloud/odf`
 *   types no frame title: it rides in the frame's raw children, where its
 *   reader puts it).
 *
 * Part paths are `Pictures/image<k>.<ext>`: `k` is the 1-based index of
 * each distinct IR `name` in order of its first PLACED occurrence (the same
 * `name` twice → one part, written once, the first occurrence's bytes win;
 * every occurrence still gets its own frame). `<ext>` is sniffed from the
 * leading bytes — PNG signature → `png`, `FF D8 FF` → `jpg`, `GIF8` →
 * `gif`, anything else → `bin` — and the path is never derived from the
 * `name`, which may carry spaces or slashes and no extension. When no image
 * is placed, `odt.write` receives no `pictures` key at all.
 *
 * Reading such a document back through `oconvOdtToIr` (with `framesInRuns`,
 * as `oconv` does) recovers the image, its bytes and its alt text, but not
 * its name: this writer writes no `draw:name`, so the reader names the
 * image after its picture path.
 *
 * ## Run mapping
 *
 * | IR run | odt run | Loss |
 * |---|---|---|
 * | plain text | `{type:'text', value}` | — |
 * | `bold`/`italic`/`strike`/`code` (any combination) | `{type:'span', value, bold?, italic?, strike?, monospace?}` — only truthy flags set, `code` → `monospace` | — |
 * | `link` (non-empty target) | `{type:'link', href:target, runs:[inner]}` — `inner` is the flags-mapped run (`span` when formatted, else `text`) | — |
 *
 * Runs with leading/trailing/multiple spaces are emitted as plain `text`
 * runs verbatim — the reader side already tolerates this, so this mapping
 * never hand-builds a `{type:'space'}` run (kept deliberately minimal).
 *
 * **No byte-reproducibility mechanism and no such claim**: the fw
 * zip writer's `_dosDateTime(mtime ?? Date.now())` reaches the ODF
 * `pkg.write` path, so two calls at different instants may not be
 * byte-identical even though their `odt.read()` MODELS are always
 * deep-equal (this module is pure — no clock, no I/O, no randomness of
 * its own).
 *
 * **Worker-safe**: pure object mapping + `odt.write` (pure JS). The
 * factory is capture-free (`fw/no-factory-capture`).
 *
 * @module oconv/write/ir-to-odt
 */

/**
 * One entry of the loss ledger.
 * @typedef {Object} OconvOdtLoss
 * @property {string} code
 * @property {string} detail
 */

/**
 * Result of {@link module:oconv/write/ir-to-odt~irToOdt}.
 * @typedef {Object} OconvOdtResult
 * @property {Uint8Array} bytes
 * @property {OconvOdtLoss[]} losses Document order.
 */

import { oconvIr } from '../ir/ir.js';
import { odt } from '@awacloud/odf';

export const oconvIrToOdt = {
    name: 'oconvIrToOdt',
    dependencies: ['oconvIr', 'odt'],
    deps: [oconvIr, odt],

    factory(irApi, odtApi) {
        /**
         * Map one IR `run` node's formatting flags to an odt run — a
         * `span` with only the truthy flags set, or a plain `text` run
         * when none are set. `code` maps to `monospace`. NO loss either
         * way.
         *
         * @param {object} n IR run node
         * @returns {object} odt `text`/`span` run
         */
        function mapRunFlags(n) {
            const text = typeof n.text === 'string' ? n.text : '';
            const span = { type: 'span', value: text };
            let flagged = false;
            if (n.bold) { span.bold = true; flagged = true; }
            if (n.italic) { span.italic = true; flagged = true; }
            if (n.strike) { span.strike = true; flagged = true; }
            if (n.code) { span.monospace = true; flagged = true; }
            return flagged ? span : { type: 'text', value: text };
        }

        /**
         * Map one IR `run` node to one odt run, appended to `runs`. A
         * non-empty `link` target wraps the flags-mapped run in a `link`
         * run (`text:a`). NO loss.
         *
         * @param {object} n IR run node
         * @param {object[]} runs odt runs accumulator
         */
        function mapRun(n, runs) {
            const inner = mapRunFlags(n);
            if (typeof n.link === 'string' && n.link) {
                runs.push({ type: 'link', href: n.link, runs: [inner] });
            } else {
                runs.push(inner);
            }
        }

        /**
         * Image bytes for an IR `image` node: caller `assets[name]` (else its
         * percent-decoded form) first,
         * then a reader's carried bytes (`escapes.docx.bytes`, else
         * `escapes.odt.bytes` — the escapes bag), else `null`. Mirrored in ir-to-docx / ir-to-odt /
         * pdf/render/image — keep byte-identical (asset-bytes-drift.test.js).
         *
         * @param {object} node
         * @param {Object<string, Uint8Array>|undefined} assets
         * @returns {{bytes: Uint8Array, source: 'assets'|'reader'}|null}
         */
        function assetBytes(node, assets) {
            const name = node && typeof node.name === 'string' ? node.name : '';
            const own = (key) => Boolean(assets) && Object.prototype.hasOwnProperty.call(assets, key)
                && assets[key] instanceof Uint8Array;
            if (own(name)) return { bytes: assets[name], source: 'assets' };
            // The caller keys an image by its destination as written; the
            // Markdown reader percent-encodes it (`<a b.png>` -> `a%20b.png`),
            // so an exact miss tries the decoded form.
            let decoded;
            try { decoded = decodeURI(name); } catch { decoded = null; }
            if (decoded !== null && decoded !== name && own(decoded)) {
                return { bytes: assets[decoded], source: 'assets' };
            }
            const bag = node && node.escapes;
            const esc = bag && (bag.docx || bag.odt);
            if (esc && esc.bytes instanceof Uint8Array) {
                return { bytes: esc.bytes, source: 'reader' };
            }
            return null;
        }

        /**
         * Intrinsic display size of encoded image bytes, in inches, read
         * from the header ONLY (never decoded): PNG `IHDR` + `pHYs` (unit
         * metre), JPEG `SOFn` + JFIF density (dpi or dots per cm), GIF
         * logical screen; 96 dpi when the file states none. Scaled down to
         * fit 6 in × 8 in, aspect kept. `null` for any other format or a
         * malformed / truncated header. Mirrored in ir-to-docx / ir-to-odt —
         * keep byte-identical (image-extent-drift.test.js).
         *
         * @param {Uint8Array} bytes
         * @returns {{width: number, height: number}|null} Inches.
         */
        function imageExtent(bytes) {
            const DEFAULT_DPI = 96;
            const MAX_WIDTH = 6;
            const MAX_HEIGHT = 8;
            if (!(bytes instanceof Uint8Array)) return null;
            const n = bytes.length;
            const u16 = i => (bytes[i] << 8) | bytes[i + 1];
            const u32 = i => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
            const ascii = (i, len) => String.fromCharCode(...bytes.subarray(i, i + len));
            let w = 0;
            let h = 0;
            let dpiX = DEFAULT_DPI;
            let dpiY = DEFAULT_DPI;
            if (n >= 24 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') {
                w = u32(16);
                h = u32(20);
                for (let p = 8; p + 12 <= n;) {
                    const len = u32(p);
                    const type = ascii(p + 4, 4);
                    if (type === 'pHYs') {
                        if (len >= 9 && p + 17 <= n && bytes[p + 16] === 1 && u32(p + 8) > 0 && u32(p + 12) > 0) {
                            dpiX = u32(p + 8) * 0.0254;
                            dpiY = u32(p + 12) * 0.0254;
                        }
                        break;
                    }
                    if (type === 'IDAT' || type === 'IEND') break;
                    p += 12 + len;
                }
            } else if (n >= 10 && ascii(0, 4) === 'GIF8') {
                w = bytes[6] | (bytes[7] << 8);
                h = bytes[8] | (bytes[9] << 8);
            } else if (n >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
                for (let p = 2; ;) {
                    if (p + 4 > n || bytes[p] !== 0xff) return null;
                    const marker = bytes[p + 1];
                    if (marker === 0xff) { p += 1; continue; }
                    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { p += 2; continue; }
                    if (marker === 0xd9 || marker === 0xda) return null;
                    const len = u16(p + 2);
                    if (len < 2) return null;
                    if (marker === 0xe0 && len >= 14 && p + 16 <= n && ascii(p + 4, 5) === 'JFIF\u0000'
                        && (bytes[p + 11] === 1 || bytes[p + 11] === 2) && u16(p + 12) > 0 && u16(p + 14) > 0) {
                        const perInch = bytes[p + 11] === 1 ? 1 : 2.54;
                        dpiX = u16(p + 12) * perInch;
                        dpiY = u16(p + 14) * perInch;
                    }
                    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                        if (p + 9 > n) return null;
                        h = u16(p + 5);
                        w = u16(p + 7);
                        break;
                    }
                    p += 2 + len;
                }
            }
            if (!(w > 0 && h > 0)) return null;
            const width = w / dpiX;
            const height = h / dpiY;
            const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
            return { width: width * scale, height: height * scale };
        }

        /**
         * Part-path extension of an image, sniffed from its leading bytes:
         * the 8-byte PNG signature → `png`, `FF D8 FF` → `jpg`, `GIF8` →
         * `gif`, anything else (shorter input included) → `bin`.
         *
         * @param {Uint8Array} bytes
         * @returns {'png'|'jpg'|'gif'|'bin'}
         */
        function imageExtension(bytes) {
            const startsWith = (sig) => bytes.length >= sig.length
                && sig.every((b, i) => bytes[i] === b);
            if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
            if (startsWith([0xff, 0xd8, 0xff])) return 'jpg';
            if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'gif';
            return 'bin';
        }

        /**
         * The ONE place an image's fate is decided, for both call sites
         * (inline in `mapInlines`, block-level in `mapBlock`).
         *
         * - {@link assetBytes} returns `null` → `image/dropped`, and `null`
         *   is returned (the caller emits nothing).
         * - bytes reachable → an odt frame run is returned, `{type:'frame',
         *   anchorType:'as-char', width, height, child:{kind:'image', href}}`
         *   sized by {@link imageExtent} — else the default `5.08cm` ×
         *   `3.81cm` box and `image/size-defaulted` — with a non-empty `alt`
         *   as an `svg:title` in `_extras.children`.
         *   `href` is `Pictures/image<k>.<ext>`: the first placed occurrence
         *   of a `name` allocates the next `k` and records its bytes in
         *   `pictures`; a later occurrence of the same `name` reuses that
         *   path (the first occurrence's bytes win, the part is written
         *   once).
         *
         * @param {object} n IR `image` node.
         * @param {OconvOdtLoss[]} losses
         * @param {{assets: (Object<string, Uint8Array>|undefined), paths: Map<string, string>, pictures: Object<string, Uint8Array>}} ctx
         *   Per-call image state: the caller's manifest, `name` → part path,
         *   and part path → bytes (insertion order = first occurrence).
         * @returns {object|null} odt `image` run, or `null` when dropped.
         */
        function placeImage(n, losses, ctx) {
            const name = typeof n.name === 'string' ? n.name : '';
            const found = assetBytes(n, ctx.assets);
            if (!found) {
                losses.push({ code: 'image/dropped', detail: name });
                return null;
            }
            let href = ctx.paths.get(name);
            if (href === undefined) {
                href = 'Pictures/image' + (ctx.paths.size + 1) + '.' + imageExtension(found.bytes);
                ctx.paths.set(name, href);
                ctx.pictures[href] = found.bytes;
            }
            const frame = {
                type: 'frame', anchorType: 'as-char',
                width: '5.08cm', height: '3.81cm',
                child: { kind: 'image', href }
            };
            const extent = imageExtent(found.bytes);
            if (extent) {
                frame.width = (extent.width * 2.54).toFixed(3) + 'cm';
                frame.height = (extent.height * 2.54).toFixed(3) + 'cm';
            } else {
                losses.push({ code: 'image/size-defaulted', detail: name });
            }
            if (typeof n.alt === 'string' && n.alt) {
                // The alternative text, after the image (ODF frame content
                // order); odf types no frame title, so it rides in the
                // frame's raw children — the field odf's reader fills.
                frame._extras = { children: [{
                    type: 'element', name: 'svg:title', attrs: {},
                    children: [{ type: 'text', value: n.alt }]
                }] };
            }
            return frame;
        }

        /** Map an IR inline-children list (`run`/`image`) to odt runs. */
        function mapInlines(children, losses, ctx) {
            const runs = [];
            for (const n of children || []) {
                if (!n || typeof n !== 'object') continue;
                if (n.kind === 'run') { mapRun(n, runs); continue; }
                if (n.kind === 'image') {
                    const run = placeImage(n, losses, ctx);
                    if (run) runs.push(run);
                    continue;
                }
            }
            return runs;
        }

        /**
         * `heading` → a typed heading naming the fixed `Heading_20_<level>`
         * style (level clamped to 1..6; the IR validates 1..6 already).
         */
        function mapHeading(n, losses, ctx) {
            let level = Number.isInteger(n.level) ? n.level : 1;
            if (level < 1) level = 1;
            if (level > 6) level = 6;
            return {
                type: 'heading',
                outlineLevel: level,
                styleName: 'Heading_20_' + level,
                runs: mapInlines(n.children, losses, ctx)
            };
        }

        /**
         * `paragraph` → one typed paragraph, or NOTHING when its mapped run
         * list is empty (a paragraph whose images were ALL dropped: each
         * drop is already recorded by `placeImage`, and an empty odt
         * paragraph would collapse on the next CommonMark parse and break
         * idempotence). A placed image is a run, so an image-only paragraph
         * whose image is placed DOES produce a paragraph.
         */
        function mapParagraph(n, losses, ctx) {
            const runs = mapInlines(n.children, losses, ctx);
            return runs.length === 0 ? [] : [{ type: 'paragraph', runs }];
        }

        /**
         * `table` → a typed `{type:'table'}` node: one XML column
         * declaration (repeated to the widest row), the count of leading
         * header rows, and one `row`/`cell` per IR row/cell with cell
         * content fully typed by recursing `mapBlock`. `grid: true` asks
         * `@awacloud/odf` for bordered cells and a margins-aligned table.
         * NO loss.
         */
        function mapTable(n, losses, ctx) {
            const rows = n.children || [];
            let cols = 0;
            for (const row of rows) {
                const len = (row && row.children) ? row.children.length : 0;
                if (len > cols) cols = len;
            }
            let headerRows = 0;
            for (const row of rows) {
                if (row && row.header) headerRows++;
                else break;
            }
            const columns = cols > 1 ? [{ repeated: cols }] : (cols === 1 ? [{}] : []);
            const tableRows = rows.map(row => ({
                type: 'row',
                cells: ((row && row.children) || []).map(cell => ({
                    type: 'cell',
                    children: ((cell && cell.children) || []).flatMap(b => mapBlock(b, losses, ctx))
                }))
            }));
            return { type: 'table', grid: true, columns, headerRows, rows: tableRows };
        }

        /**
         * The odt runs of one code line. ODF collapses a run of plain
         * spaces and drops a line-leading one, so a run of two or more
         * spaces, and a space that starts the line or follows a tab, is a
         * `space` run (`text:s`); a tab is a `tab` run; the rest is text.
         *
         * @param {string} line One source line (no newline).
         * @returns {object[]} odt runs.
         */
        function codeLineRuns(line) {
            const runs = [];
            let buf = '';
            const flush = () => { if (buf) { runs.push({ type: 'text', value: buf }); buf = ''; } };
            for (let i = 0; i < line.length;) {
                const c = line[i];
                if (c === '\t') { flush(); runs.push({ type: 'tab' }); i += 1; continue; }
                if (c !== ' ') { buf += c; i += 1; continue; }
                let j = i;
                while (j < line.length && line[j] === ' ') j += 1;
                if (j - i > 1 || i === 0 || line[i - 1] === '\t') {
                    flush();
                    runs.push({ type: 'space', count: j - i });
                } else {
                    buf += ' ';
                }
                i = j;
            }
            flush();
            return runs;
        }

        /**
         * `codeBlock` → one `Preformatted_20_Text` paragraph per source line
         * (LibreOffice's own convention; an empty line is an empty
         * paragraph). NO loss — the `info` string has no odt carrier and is
         * not written (as on the docx and pdf targets).
         */
        function mapCodeBlock(n) {
            const text = typeof n.text === 'string' ? n.text : '';
            // CommonMark code-block text ends with exactly one newline; drop
            // it so no trailing empty paragraph is emitted (interior empty
            // lines are kept).
            const body = text.endsWith('\n') ? text.slice(0, -1) : text;
            return body.split('\n').map(line => ({
                type: 'paragraph', styleName: 'Preformatted_20_Text', runs: codeLineRuns(line)
            }));
        }

        /**
         * `blockquote` → its paragraphs styled `Quotations` (a paragraph
         * whose runs are all dropped images emits nothing, as anywhere); a
         * nested quote's paragraphs too, recording `blockquote:nested` (the
         * return leg reads one flat quote); any other child keeps its own
         * mapping and records `blockquote-child:<kind>`.
         */
        function mapQuote(n, losses, ctx) {
            const out = [];
            for (const child of n.children || []) {
                if (child && child.kind === 'paragraph') {
                    const runs = mapInlines(child.children, losses, ctx);
                    if (runs.length) out.push({ type: 'paragraph', styleName: 'Quotations', runs });
                    continue;
                }
                if (child && child.kind === 'blockquote') {
                    losses.push({ code: 'block/degraded', detail: 'blockquote:nested' });
                    for (const m of mapQuote(child, losses, ctx)) out.push(m);
                    continue;
                }
                losses.push({ code: 'block/degraded', detail: 'blockquote-child:' + (child && child.kind) });
                for (const m of mapBlock(child, losses, ctx)) out.push(m);
            }
            return out;
        }

        /**
         * The blocks of one list item, a GFM task item's marker
         * (`escapes.md.task`) drawn as a plain leading glyph run of its
         * first paragraph — ☐ (U+2610) unchecked, ☒ (U+2612) checked. A
         * task item whose first block is not a paragraph records
         * `list/task-marker-dropped`. The IR is not mutated.
         *
         * @param {object} item IR `listItem` node
         * @param {OconvOdtLoss[]} losses
         * @returns {object[]} IR blocks to map
         */
        function itemBlocks(item, losses) {
            const glyphs = { unchecked: '☐ ', checked: '☒ ' };
            const blocks = item.children || [];
            const task = item.escapes && item.escapes.md && item.escapes.md.task;
            if (!Object.hasOwn(glyphs, task)) return blocks;
            const [first, ...rest] = blocks;
            if (!first || first.kind !== 'paragraph') {
                losses.push({
                    code: 'list/task-marker-dropped',
                    detail: task === 'checked' ? '[x]' : '[ ]'
                });
                return blocks;
            }
            const glyph = irApi.node('run', { text: glyphs[task] });
            return [{ ...first, children: [glyph, ...(first.children || [])] }, ...rest];
        }

        function mapListItem(item, losses, ctx) {
            const children = [];
            for (const block of itemBlocks(item, losses)) {
                const mapped = mapBlock(block, losses, ctx);
                if (mapped) for (const m of mapped) children.push(m);
            }
            return { children };
        }

        /**
         * `list` → `{type:'list', ordered, items}`. Ordered lists also
         * carry `numFormat:'1'` (md ordered lists are decimal). NO loss.
         */
        function mapList(n, losses, ctx) {
            const items = (n.children || []).map(item => mapListItem(item, losses, ctx));
            const list = { type: 'list', ordered: !!n.ordered, items };
            if (n.ordered) list.numFormat = '1';
            return list;
        }

        /**
         * Map one IR block node to zero-or-more odt typed body nodes
         * (most map 1:1; `blockquote`/`codeBlock` may expand, `hr` is one
         * empty styled paragraph, a placed `image` becomes one paragraph holding its image
         * run and a dropped one maps to zero, and a `paragraph` whose images
         * are all dropped and that has no text run maps to zero nodes).
         *
         * @param {object} n IR block node
         * @param {OconvOdtLoss[]} losses
         * @param {object} ctx Per-call image state (see `placeImage`).
         * @returns {object[]}
         */
        function mapBlock(n, losses, ctx) {
            if (!n || typeof n !== 'object') return [];
            switch (n.kind) {
                case 'heading': return [mapHeading(n, losses, ctx)];
                case 'paragraph': return mapParagraph(n, losses, ctx);
                case 'list': return [mapList(n, losses, ctx)];
                case 'table': return [mapTable(n, losses, ctx)];
                case 'codeBlock': return mapCodeBlock(n);
                case 'blockquote': return mapQuote(n, losses, ctx);
                case 'hr':
                    return [{ type: 'paragraph', styleName: 'Horizontal_20_Line', runs: [] }];
                case 'image': {
                    const run = placeImage(n, losses, ctx);
                    return run ? [{ type: 'paragraph', runs: [run] }] : [];
                }
                default:
                    return [];
            }
        }

        /**
         * Build the single `styles` object this writer ever emits —
         * deterministic, input-free, caller-invisible: the typed named
         * paragraph styles `Standard`, `Text_20_body`, `Heading` and
         * `Heading_20_1`..`Heading_20_6` (see "Styles part" above).
         *
         * @returns {{styles: object[], automaticStyles: object[], masterStyles: object[]}}
         */
        function buildStyles() {
            const HEADING_SIZES = ['16pt', '14pt', '13pt', '12pt', '11pt', '11pt'];
            const specs = [
                { name: 'Standard', family: 'paragraph', class: 'text' },
                {
                    name: 'Text_20_body',
                    displayName: 'Text body',
                    family: 'paragraph',
                    parentStyleName: 'Standard',
                    class: 'text',
                    properties: {
                        paragraph: { 'fo:margin-top': '0cm', 'fo:margin-bottom': '0.247cm' }
                    }
                },
                {
                    name: 'Heading',
                    family: 'paragraph',
                    parentStyleName: 'Standard',
                    nextStyleName: 'Text_20_body',
                    class: 'text',
                    properties: {
                        paragraph: {
                            'fo:margin-top': '0.423cm',
                            'fo:margin-bottom': '0.141cm',
                            'fo:keep-with-next': 'always'
                        }
                    }
                }
            ];
            for (let level = 1; level <= 6; level++) {
                specs.push({
                    name: 'Heading_20_' + level,
                    displayName: 'Heading ' + level,
                    family: 'paragraph',
                    parentStyleName: 'Heading',
                    nextStyleName: 'Text_20_body',
                    defaultOutlineLevel: level,
                    class: 'text',
                    properties: {
                        text: {
                            'fo:font-size': HEADING_SIZES[level - 1],
                            'fo:font-weight': 'bold'
                        }
                    }
                });
            }
            // LibreOffice's built-in names for code, quotes and rules (pandoc
            // writes the same ones); the reader maps them back.
            specs.push({
                name: 'Preformatted_20_Text',
                displayName: 'Preformatted Text',
                family: 'paragraph',
                parentStyleName: 'Standard',
                class: 'html',
                properties: {
                    paragraph: { 'fo:margin-top': '0cm', 'fo:margin-bottom': '0cm' },
                    text: {
                        'fo:font-family': 'Liberation Mono',
                        'style:font-family-generic': 'modern',
                        'style:font-pitch': 'fixed',
                        'fo:font-size': '10pt'
                    }
                }
            }, {
                name: 'Quotations',
                displayName: 'Quotations',
                family: 'paragraph',
                parentStyleName: 'Standard',
                class: 'html',
                properties: {
                    paragraph: {
                        'fo:margin-left': '1cm', 'fo:margin-right': '1cm',
                        'fo:margin-top': '0cm', 'fo:margin-bottom': '0.247cm'
                    }
                }
            }, {
                name: 'Horizontal_20_Line',
                displayName: 'Horizontal Line',
                family: 'paragraph',
                parentStyleName: 'Standard',
                class: 'html',
                properties: {
                    paragraph: {
                        'fo:border-bottom': '0.5pt solid #808080', 'fo:padding': '0cm',
                        'fo:margin-top': '0cm', 'fo:margin-bottom': '0.247cm'
                    }
                }
            });
            return { styles: specs, automaticStyles: [], masterStyles: [] };
        }

        /**
         * Convert an `oconv-ir/v1` document to `.odt` bytes.
         *
         * @param {object} ir `oconv-ir/v1` document node.
         * @param {{assets?: Object<string, Uint8Array>}} [opts] Same
         *   `assets` manifest as `oconvIrToDocx.irToDocx` /
         *   `oconvIrToPdf.irToPdf`. An image whose bytes are reachable
         *   (`assets[name]` or its percent-decoded form, else the reader-carried `escapes.docx.bytes` / `escapes.odt.bytes`)
         *   is PLACED as a `Pictures/image<k>.<ext>` part at its intrinsic
         *   size (else the default 2 in × 1.5 in box, `image/size-defaulted`);
         *   one with no bytes
         *   is dropped (`image/dropped`) — see {@link placeImage}.
         * @returns {OconvOdtResult}
         * @throws {Error} when `ir` fails `oconvIr.validate` — same shape
         *   as `oconvIrToDocx`: `oconv: invalid ir (<code> at <path>)`.
         */
        function irToOdt(ir, opts) {
            const ctx = { assets: opts && opts.assets, paths: new Map(), pictures: {} };
            const v = irApi.validate(ir);
            if (!v.ok) {
                const first = v.errors[0];
                throw new Error(`oconv: invalid ir (${first.code} at ${first.path})`);
            }
            const losses = [];
            const body = [];
            for (const block of (ir && ir.children) || []) {
                const mapped = mapBlock(block, losses, ctx);
                for (const m of mapped) body.push(m);
            }
            // No placed image → the `pictures` key is omitted altogether.
            const doc = ctx.paths.size > 0 ? { body, pictures: ctx.pictures } : { body };
            const bytes = odtApi.write(doc, { styles: buildStyles() });
            return { bytes, losses };
        }

        return { irToOdt };
    }
};
