// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdf` → `oconv-ir/v1` reader — **tier 1, text-first only**
 * (a FROZEN tier).
 *
 * Converts a document already read by `@awacloud/pdf`'s public `pdf.read(bytes)`
 * façade into a pivot IR document (`oconvIr`, `../ir/ir.js`). Pure
 * transformation over the parsed structure plus on-demand content-stream
 * decode through the extraction layer (`./pdf/*`) — no I/O of its own,
 * Worker-safe by construction.
 *
 * ## Reading bounds (FROZEN — do not widen here)
 *
 * pdf→md v1 is **tier 1, text-first**: real text extracted through the
 * font's ToUnicode CMap or the encoding-table + AGL hop (`./pdf/
 * font-decoder.js`); **scanned / OCR is permanently out**; there is **no
 * layout inference** (no column detection, no reading-order reconstruction
 * across regions) and **no paragraph reconstruction beyond text-positioning
 * heuristics** (`./pdf/paragraph-group.js`). Everything a page carries
 * beyond flowing text — headings (untagged, by default), emphasis, lists, tables,
 * images, page geometry — is a tier-1 drop; the ones the reader can DETECT
 * are recorded as explicit losses (below), the rest are matrix drops, and
 * text itself is never silently dropped.
 *
 * ## Two paths
 *
 * - **Tagged fast path** — when the document carries a `/StructTreeRoot`
 *   (`./pdf/struct.js`), structure is derived from the logical tree, walked
 *   in `/K` order with its tags mapped through the `/RoleMap`, text keyed
 *   to struct elements through marked-content ids (`/MCID`): `H1`..`H6` →
 *   IR `heading{level}`; an inline element (`Span`, `Link`, `Note`,
 *   `Reference`, `Quote`, `Code` …) joins the enclosing block's text in
 *   order; any other element gives its inline content as `paragraph`s
 *   between its block children. All the pieces of one block are joined by
 *   the untagged path's paragraph rule below (a line wrap is a space, a
 *   same-line gap over 0.15 em too, a word split across ids none). `L` →
 *   IR `list`: each `LI` an item holding its `LBody`'s blocks, a numeric
 *   `Lbl` making it ordered, a marker `Lbl` (bullet, number, letter, roman
 *   numeral) dropped and another kept at the item's start. `Table` → IR
 *   `table`: `TR` rows, directly or through `THead` / `TBody` / `TFoot`,
 *   `TH` / `TD` cells holding their blocks, a `THead` row or an all-`TH`
 *   row a header; its `Caption` around it. A `Table` without a `TR` is
 *   flattened and recorded as `struct/dropped`.
 * - **Untagged fall-back** — text pieces in content-stream order are grouped
 *   into lines and paragraphs by vertical position; within a line, one space
 *   is inferred where the horizontal gap (or overlap) between a piece's end
 *   and the next piece's start is a real word gap, and a piece that exactly duplicates
 *   the previous one (same text, same place within 0.5 pt) is dropped
 *   ({@link module:oconv/read/pdf/paragraph-group}'s `groupParagraphs`,
 *   mirrored inside this factory — see the drift note below). No heading is
 *   inferred on this path by default.
 *
 * ## Opt-in inference on the untagged path (`opts.infer`)
 *
 * The tier-1 bounds above stay the default. `opts.infer`, a list of
 * inference names, turns on what it names, on the untagged path only (a
 * tagged document's structure wins):
 *
 * - `'headings'` — headings from font size. The body size is the font size,
 *   rounded to 0.5 pt, that carries the most characters over the document;
 *   a piece is heading-sized at ≥ 1.15 × the body size. On each page the
 *   pieces are cut into runs, in content order, at each change of class
 *   (heading-sized or not) and, inside the heading-sized class, of rounded
 *   size; each run is grouped by the unchanged paragraph rule; a paragraph
 *   of a heading-sized run is a heading when it has at most 150 characters
 *   and a letter. Its level is the rank of its run's size among the
 *   document's heading sizes, the largest 1, capped at 6. The thresholds
 *   are measured (opendataloader-bench's 200 documents: 1.1, 1.2 and 1.3 ×,
 *   80 and 250 characters score lower); an inference, not a structure the
 *   file states.
 *   By weight too: the pieces are taken by line (the paragraph rule's
 *   first pass), a line is bold when every piece of it is (the font's
 *   `bold`, `./pdf/font-decoder.js`), and the runs are also cut where a
 *   body-sized line's boldness changes; a paragraph of a bold run with at
 *   most 80 characters and a letter is a heading, its level after the
 *   size-ranked ones (their count + 1, capped at 6). A bold word inside a
 *   body line changes nothing.
 * - `'tables'` — tables from aligned text. A line's cells are its pieces
 *   left to right, a new cell where a piece starts more than 0.8 em right
 *   of the previous piece's end; a run of two or more consecutive lines of
 *   two or more cells is a candidate; its sorted cell starts give the
 *   column anchors (a new anchor more than 1.5 em past the last); the
 *   columns are the anchors two rows or more use, and with two columns or
 *   more and no cell over 40 characters (body text set in columns is not
 *   a table) the run is a table — one row per line, each cell in its
 *   nearest column, the first row a header. It stands where its first line was;
 *   its lines leave the text flow. Ruled tables come first: the page's
 *   rules (`oconvPdfTextExtract`'s `rules`, asked only under `'tables'`)
 *   that cross within 2 units form grids; a grid of 3 distinct ys and 3 xs
 *   or more is a table when its text reaches 2 rows, 2 columns and 30 % of
 *   its cells (each piece in the cell its start lies in); its pieces leave
 *   the flow and the aligned-text rule runs on the lines that remain.
 *   Measured as the heading thresholds were
 *   (0.8 em against 1.0 / 1.2, 1.5 em against 0.8 / 1.0, 40 characters
 *   against 25–50).
 * - `'running'` — running headers and footers left out. On a document of
 *   3 pages or more, a line (a page's pieces within 1 pt of one height, in
 *   content order) in the top or the bottom 12 % of its page's `/MediaBox`
 *   is a running line when its pattern (its text, each run of digits read
 *   as `#`, spaces collapsed) recurs within 2 pt of the same height on at
 *   least half the pages and 3: its pieces leave the page before any block
 *   is built, one `text/running-dropped` per pattern and height recording
 *   the pattern. Measured on pypdf-benchmarks' 14 documents: 0.9287 →
 *   0.9300.
 *
 * `undefined` and `[]` read as without the option; anything else than a
 * list of distinct known names throws `oconv: bad pdf infer`.
 *
 * ## Line-end hyphens (`opts.lineHyphens`)
 *
 * The paragraph rule joins two lines with one space, except a soft hyphen
 * (U+00AD) ending a line after a letter, the next starting with a letter:
 * it is dropped and the word joined, always. A hyphen (U+002D, U+2010)
 * after a letter, the next line starting with a lowercase letter, joins
 * only under the opt-in `opts.lineHyphens`: `'drop'` without the hyphen
 * (`infor-` + `mation` → `information`, but a compound cut at its own
 * hyphen loses it), `'keep'` with it (`infor-mation`, `well-known`). It
 * applies to every paragraph the rule builds, on both paths. `undefined`
 * reads as without it; another value throws `oconv: bad pdf line hyphens`.
 *
 * ## Opt-in record of a silent case (`opts.declare`)
 *
 * `opts.declare`, a list of names, records what the reader otherwise does
 * silently. `'positional'`: a document read on the untagged path whose IR
 * holds a paragraph, a heading or a table records one
 * `struct/positional` loss, after the extraction's, its detail naming
 * what was built from positioning (`paragraphs`, then `headings` and
 * `tables` when `opts.infer` asked for them). `undefined` and `[]` read
 * as without it; anything else than distinct known names throws
 * `oconv: bad pdf declare`.
 *
 * ## Opt-in parts (`opts.include`)
 *
 * `opts.include`, a list of names, brings back what tier 1 drops.
 * `'images'`: a placeable picture — a JPEG or JPX image XObject passed
 * through, or a raw-pixel one written as a PNG, see
 * {@link module:oconv/read/pdf/text-extract} (its `opts.images`) — becomes
 * a block IR `image` (`name` `image-<obj>.jpg` / `.jp2` / `.png`, `alt` `''`, its
 * bytes and media type in `escapes.pdf = { bytes, contentType }`). On the
 * untagged path a page's items are cut at each such picture: each text
 * part goes through the rules above (and `opts.infer`'s), the picture
 * stands between them, in content order. On the tagged path a picture is
 * placed with the struct element that lists its marked-content id, after
 * that element's text; a picture no element lists, or drawn outside marked
 * content, records `image/dropped` (detail the picture, as for a draw). A placed
 * picture whose `/SMask` or `/Mask` was not applied (a JPEG or JPX
 * one's always; a PNG's when it is not a same-size soft mask or a
 * colour-key array) records `image/mask-dropped` (detail the asset name):
 * the picture is kept without its mask. Every
 * other picture keeps its `image/dropped`. `undefined` and `[]` read as
 * without it; anything else than distinct known names throws
 * `oconv: bad pdf include`.
 *
 * In both paths **page boundaries become IR `hr`** (thematic break) nodes —
 * the frozen `oconv-ir/v1` vocabulary has no section node, so `hr` is the
 * pivot's section-break marker between consecutive pages.
 *
 * ## Decode coverage is REPORTED, never assumed
 *
 * The result carries `coverage` — per-page and total
 * `{ operators, decoded, undecodable }` counts feeding the loss ledger
 * (honest-loss-matrix discipline: never claim `losses = 0` from a
 * prototype). See the loss-matrix for the measured figure on the
 * vendored real corpus.
 *
 * ## Loss codes emitted (this module + `./pdf/*`)
 *
 * | Code | Meaning |
 * |---|---|
 * | `text/undecodable` | ≥1 char code resolved to no Unicode (counted) |
 * | `text/font-unresolved` | a show op ran with no resolvable current font |
 * | `text/width-approximated` | a font's glyph widths fell back to a declared width (once per font resource per page) |
 * | `image/dropped` | an image XObject / inline image, inside a form too, once per draw (tier 1 keeps none; under `include: ['images']`, every picture but a placed one); detail = the picture, its name, object and size (`./pdf/text-extract.js`) |
 * | `image/mask-dropped` | (under `include: ['images']`) a placed picture's soft mask or mask, not applied (detail = the asset name) |
 * | `xobject/form-dropped` | a Form XObject whose stream cannot be used (detail names the reason); a usable form is executed |
 * | `xobject/form-cycle` | a Form XObject drawn from inside itself, not re-entered |
 * | `xobject/form-depth` | a Form XObject nested deeper than 12, not executed |
 * | `xobject/form-budget` | form draws past the page's form-operator budget (default 1,000,000, `opts.formOpBudget`), skipped (once per page) |
 * | `content/undecodable` | a content stream failed to decode/parse; detail = `stream <objNum>: <cause>` (the thrown error's message) |
 * | `struct/dropped` | (tagged path) a `Table` without a `TR` row, flattened |
 * | `text/running-dropped` | (untagged path, under `infer: ['running']`) a running header or footer line left out of every page; detail = its pattern (digits read as `#`) |
 * | `struct/positional` | (untagged path, under `declare: ['positional']`) the structure built from positioning — once per document |
 *
 * Composes ONLY documented public exports of `@awacloud/pdf` / `@awacloud/fonts`
 * — never a package internal. A capability missing upstream is never
 * patched here (compose-never-reimplement): the affected element is
 * recorded as a loss.
 *
 * @module oconv/read/pdf-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { oconvPdfTextExtract } from './pdf/text-extract.js';
import { oconvPdfStruct } from './pdf/struct.js';

export const oconvPdfToIr = {
    name: 'oconvPdfToIr',
    dependencies: ['oconvIr', 'oconvPdfTextExtract', 'oconvPdfStruct'],
    deps: [oconvIr, oconvPdfTextExtract, oconvPdfStruct],

    factory(oconvIrMod, textExtractMod, structMod) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper it uses is declared inside its own body, including the
        // paragraph-grouping algorithm mirrored from ./pdf/paragraph-group.js
        // (see that file's header for the duplication note + drift-test
        // pointer).
        const { node, doc } = oconvIrMod;

        /**
         * Mirrors `./pdf/text-extract.js`'s own copy (fw/no-factory-capture
         * — capture-free factories duplicate rather than import a shared
         * helper): `undefined` accepts the default; otherwise the value
         * must satisfy `Number.isSafeInteger(v) && v >= 1`, else throws
         * `oconv: bad form op budget`. Applied here too, before the first
         * page is extracted, so a zero-page document still refuses a bad
         * value; a drift test runs one shared table of good/bad
         * values through both entry points and asserts identical outcomes.
         *
         * @param {*} v
         * @throws {Error} `oconv: bad form op budget`
         */
        function assertFormOpBudget(v) {
            if (v === undefined) return;
            if (!Number.isSafeInteger(v) || v < 1) {
                throw new Error('oconv: bad form op budget');
            }
        }

        /** The inference names `opts.infer` may list. */
        const INFER_NAMES = new Set(['headings', 'tables', 'running']);

        /**
         * `undefined` reads as no inference; otherwise an array of distinct
         * names of `INFER_NAMES`, else throws `oconv: bad pdf infer`. The
         * facade applies the same rule (a drift test runs one table
         * through both).
         *
         * @param {*} v
         * @returns {Set<string>}
         * @throws {Error} `oconv: bad pdf infer`
         */
        function inferSet(v) {
            if (v === undefined) return new Set();
            if (!Array.isArray(v) || new Set(v).size !== v.length
                    || !v.every((n) => typeof n === 'string' && INFER_NAMES.has(n))) {
                throw new Error('oconv: bad pdf infer');
            }
            return new Set(v);
        }

        // A running line (`infer: ['running']`): in the top or bottom 12 %
        // of its page, its pattern recurring within 2 pt of one height on at
        // least half the pages, and 3.
        const RUNNING_BAND = 0.12;
        const RUNNING_SHARE = 0.5;
        const RUNNING_MIN_PAGES = 3;

        /** Remove the running lines of an untagged document's pages, recording each pattern. */
        function dropRunning(perPage, pages, losses) {
            if (perPage.length < RUNNING_MIN_PAGES) return;
            const found = [];
            perPage.forEach((page, pi) => {
                const box = pages[pi] && pages[pi].mediaBox;
                const lo = box ? Math.min(box[1], box[3]) : 0;
                const hi = box ? Math.max(box[1], box[3]) : 792;
                const band = RUNNING_BAND * (hi - lo);
                const lines = [];
                for (const it of page.items) {
                    if (it.kind !== 'text' || !it.text || !Number.isFinite(it.y)) continue;
                    if (it.y < hi - band && it.y > lo + band) continue;
                    const line = lines.find((l) => Math.abs(l.y - it.y) <= 1);
                    if (line) line.pieces.push(it);
                    else lines.push({ y: it.y, pieces: [it] });
                }
                for (const l of lines) {
                    const pattern = l.pieces.map((q) => q.text).join(' ').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
                    if (pattern) found.push({ pattern, y: l.y, page: pi, pieces: l.pieces });
                }
            });
            const min = Math.max(RUNNING_MIN_PAGES, Math.ceil(RUNNING_SHARE * perPage.length));
            const byPattern = new Map();
            for (const f of found) {
                if (!byPattern.has(f.pattern)) byPattern.set(f.pattern, []);
                byPattern.get(f.pattern).push(f);
            }
            const gone = new Set();
            for (const [pattern, list] of byPattern) {
                list.sort((a, b) => a.y - b.y);
                let cluster = [];
                const close = () => {
                    if (new Set(cluster.map((f) => f.page)).size >= min) {
                        for (const f of cluster) for (const q of f.pieces) gone.add(q);
                        losses.push({ code: 'text/running-dropped', detail: pattern });
                    }
                    cluster = [];
                };
                for (const f of list) {
                    if (cluster.length && f.y - cluster[0].y > 2) close();
                    cluster.push(f);
                }
                if (cluster.length) close();
            }
            if (gone.size) for (const page of perPage) page.items = page.items.filter((it) => !gone.has(it));
        }

        /** The silent cases `opts.declare` may ask to record (A44a). */
        const DECLARE_NAMES = new Set(['positional']);

        /**
         * `undefined` reads as nothing declared; otherwise an array of
         * distinct names of `DECLARE_NAMES`, else throws `oconv: bad pdf
         * declare`.
         *
         * @param {*} v
         * @returns {Set<string>}
         * @throws {Error} `oconv: bad pdf declare`
         */
        function declareSet(v) {
            if (v === undefined) return new Set();
            if (!Array.isArray(v) || new Set(v).size !== v.length
                    || !v.every((n) => typeof n === 'string' && DECLARE_NAMES.has(n))) {
                throw new Error('oconv: bad pdf declare');
            }
            return new Set(v);
        }

        /** The parts `opts.include` may bring back (A59a). */
        const INCLUDE_NAMES = new Set(['images']);

        /**
         * `undefined` reads as nothing included; otherwise an array of
         * distinct names of `INCLUDE_NAMES`, else throws `oconv: bad pdf
         * include`.
         *
         * @param {*} v
         * @returns {Set<string>}
         * @throws {Error} `oconv: bad pdf include`
         */
        function includeSet(v) {
            if (v === undefined) return new Set();
            if (!Array.isArray(v) || new Set(v).size !== v.length
                    || !v.every((n) => typeof n === 'string' && INCLUDE_NAMES.has(n))) {
                throw new Error('oconv: bad pdf include');
            }
            return new Set(v);
        }

        /* ── paragraph-group (mirror of ./pdf/paragraph-group.js) ────────── */

        /**
         * Two lines of one paragraph joined: a soft hyphen (U+00AD) ending the
         * first after a letter, the next starting with a letter, is dropped and
         * the word joined; under `lineHyphens` a hyphen (U+002D, U+2010) after a
         * letter, the next starting with a lowercase letter, too — `'drop'`
         * without it, `'keep'` with it; else one space.
         */
        function joinLines(lines, lineHyphens) {
            let out = lines[0];
            for (let i = 1; i < lines.length; i++) {
                const next = lines[i];
                if (/\p{L}\u00ad$/u.test(out) && /^\p{L}/u.test(next)) out = out.slice(0, -1) + next;
                else if (lineHyphens && /\p{L}[-\u2010]$/u.test(out) && /^\p{Ll}/u.test(next)) {
                    out = (lineHyphens === 'drop' ? out.slice(0, -1) : out) + next;
                } else out += ' ' + next;
            }
            return out;
        }

        function groupParagraphs(pieces, opts) {
            const gapFactor = (opts && typeof opts.gapFactor === 'number') ? opts.gapFactor : 1.6;
            const yTol = (opts && typeof opts.yTol === 'number') ? opts.yTol : 0.5;
            const wordGap = (opts && typeof opts.wordGap === 'number') ? opts.wordGap : 0.15;
            const lineHyphens = opts ? opts.lineHyphens : undefined;

            const lines = [];
            let cur = null;
            for (const p of pieces || []) {
                if (!p || !p.text) continue;
                const fs = p.fontSize > 0 ? p.fontSize : 0;
                const tol = Math.max(yTol * (fs || (cur ? cur.fs : 0)), 0.5);
                if (cur && Math.abs(p.y - cur.y) <= tol) {
                    cur.pieces.push(p);
                    if (fs > cur.fs) cur.fs = fs;
                } else {
                    if (cur) lines.push(cur);
                    cur = { y: p.y, fs, pieces: [p] };
                }
            }
            if (cur) lines.push(cur);

            for (const ln of lines) {
                // Drop an exact duplicate of the previous piece.
                const ps = [];
                for (const q of ln.pieces) {
                    const last = ps[ps.length - 1];
                    if (last && q.text === last.text
                            && Math.abs(q.x - last.x) <= 0.5 && Math.abs(q.y - last.y) <= 0.5) continue;
                    ps.push(q);
                }
                let forward = true;
                for (let i = 0; i < ps.length && forward; i++) {
                    const q = ps[i];
                    if (!Number.isFinite(q.x) || !Number.isFinite(q.xEnd) || q.xEnd < q.x
                            || (i > 0 && q.x < ps[i - 1].x)) forward = false;
                }
                let text = ps[0].text;
                for (let i = 1; i < ps.length; i++) {
                    const prev = ps[i - 1];
                    const p = ps[i];
                    const em = prev.fontSize > 0 ? prev.fontSize : (p.fontSize > 0 ? p.fontSize : 0);
                    // A gap or an overlap wider than `wordGap` em.
                    if (forward && em > 0 && Math.abs(p.x - prev.xEnd) > wordGap * em
                            && !/\s$/.test(text) && !/^\s/.test(p.text)) {
                        text += ' ';
                    }
                    text += p.text;
                }
                ln.text = text;
            }

            const paras = [];
            let para = null;
            let prev = null;
            for (const ln of lines) {
                const text = ln.text.trim();
                if (!text) { prev = ln; continue; }
                if (!para) {
                    para = [text];
                } else {
                    const gap = prev.y - ln.y;
                    const fs = prev.fs || ln.fs || 12;
                    if (gap < 0 || gap > gapFactor * fs) {
                        paras.push(joinLines(para, lineHyphens));
                        para = [text];
                    } else {
                        para.push(text);
                    }
                }
                prev = ln;
            }
            if (para) paras.push(joinLines(para, lineHyphens));
            return paras;
        }

        /* ── IR shaping ──────────────────────────────────────────────────── */

        const HEADING_LEVEL = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };
        // Inline structure types: their text joins the enclosing block's.
        const INLINE_TAGS = new Set(['Span', 'Link', 'Note', 'Reference', 'BibEntry', 'Code', 'Quote', 'Annot',
            'Ruby', 'RB', 'RT', 'RP', 'Warichu', 'WT', 'WP', 'Sub', 'Em', 'Strong', 'Lbl']);
        // A list label markdown writes itself: a bullet, or a number, letter
        // or roman numeral with its punctuation; a numeric one orders the list.
        const LABEL_MARKER = /^(?:[\u2022\u25e6\u25aa\u25ab\u2023\u2043\u25cf\u25cb\u25a0\u25a1\u2013\u2014*\u00b7-]|\(?\d+[.)]?|\(?[a-zA-Z][.)]|\(?[ivxlcdmIVXLCDM]+[.)])$/;
        const NUMERIC_LABEL = /^\(?\d+[.)]?$/;

        function paragraphNode(text) {
            return node('paragraph', {}, [node('run', { text })]);
        }

        /** A placed picture's IR `image`; its mask recorded as dropped. */
        function imageNode(it, losses) {
            if (it.masked) losses.push({ code: 'image/mask-dropped', detail: it.name });
            return node('image', { name: it.name, alt: '', escapes: { pdf: { bytes: it.bytes, contentType: it.contentType } } });
        }

        /**
         * A page's items cut at each placeable picture (`include:
         * ['images']`): `{ text }` parts (the text items) and `{ image }`
         * parts, in content order; one text part when there is none.
         */
        function pageParts(items) {
            const parts = [];
            let cur = [];
            for (const it of items) {
                if (it.kind === 'image' && it.bytes) {
                    parts.push({ text: cur }, { image: it });
                    cur = [];
                } else if (it.kind === 'text') {
                    cur.push(it);
                }
            }
            parts.push({ text: cur });
            return parts;
        }

        // Headings from font size (opt-in, `infer: ['headings']`): the
        // thresholds of the module header.
        const HEADING_RATIO = 1.15;
        const HEADING_MAX_CHARS = 150;
        const BOLD_HEADING_MAX_CHARS = 80;
        // Tables from aligned text (opt-in, `infer: ['tables']`).
        const CELL_GAP_EM = 0.8;
        const COLUMN_TOL_EM = 1.5;
        const CELL_MAX_CHARS = 40;
        const WORD_GAP_EM = 0.15;
        // Ruled tables (A14b2): rules cross within GRID_TOL; a grid's cells
        // must hold text in GRID_MIN_FILL of them or more.
        const GRID_TOL = 2;
        const GRID_MIN_FILL = 0.3;

        /** Sorted values, those within `tol` of the last kept merged into it. */
        function clusterValues(vals, tol) {
            const out = [];
            for (const v of [...vals].sort((a, b) => a - b)) {
                if (out.length === 0 || v - out[out.length - 1] > tol) out.push(v);
            }
            return out;
        }

        /** A page's grids from its rules: `{ ys, xs }`, ys top down. */
        function findGrids(rules) {
            const hs = rules.filter((r) => r.y1 - r.y0 <= 0.5);
            const vs = rules.filter((r) => r.x1 - r.x0 <= 0.5 && r.y1 - r.y0 > 0.5);
            const parent = [...hs, ...vs].map((_, i) => i);
            const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
            for (let a = 0; a < hs.length; a++) {
                for (let b = 0; b < vs.length; b++) {
                    const h = hs[a];
                    const v = vs[b];
                    if (v.x0 >= h.x0 - GRID_TOL && v.x0 <= h.x1 + GRID_TOL && h.y0 >= v.y0 - GRID_TOL && h.y0 <= v.y1 + GRID_TOL) {
                        parent[find(a)] = find(hs.length + b);
                    }
                }
            }
            const comps = new Map();
            [...hs, ...vs].forEach((r, i) => {
                const k = find(i);
                if (!comps.has(k)) comps.set(k, { h: [], v: [] });
                (i < hs.length ? comps.get(k).h : comps.get(k).v).push(r);
            });
            const out = [];
            for (const c of comps.values()) {
                if (c.h.length < 2 || c.v.length < 2) continue;
                const ys = clusterValues(c.h.map((r) => r.y0), GRID_TOL).reverse();
                const xs = clusterValues(c.v.map((r) => r.x0), GRID_TOL);
                if (ys.length >= 3 && xs.length >= 3) out.push({ ys, xs });
            }
            return out;
        }

        /** A grid's table from a page's pieces, or null: `{ rows, pieces }`. */
        function gridTable(g, textItems, paraOpts) {
            const nr = g.ys.length - 1;
            const nc = g.xs.length - 1;
            const cellPieces = Array.from({ length: nr }, () => Array.from({ length: nc }, () => []));
            const pieces = new Set();
            for (const p of textItems) {
                let r = -1;
                let c = -1;
                for (let k = 0; k < nr; k++) if (p.y <= g.ys[k] && p.y >= g.ys[k + 1]) { r = k; break; }
                for (let k = 0; k < nc; k++) if (p.x >= g.xs[k] - 1 && p.x < g.xs[k + 1]) { c = k; break; }
                if (r >= 0 && c >= 0) { cellPieces[r][c].push(p); pieces.add(p); }
            }
            const rows = cellPieces.map((row) => row.map((ps) => groupParagraphs(ps, paraOpts).join(' ').trim()));
            const filled = rows.flat().filter((t) => t).length;
            const rowsWith = rows.filter((r) => r.some((t) => t)).length;
            let colsWith = 0;
            for (let k = 0; k < nc; k++) if (rows.some((r) => r[k])) colsWith++;
            if (rowsWith < 2 || colsWith < 2 || filled < GRID_MIN_FILL * nr * nc) return null;
            return { rows: rows.filter((r) => r.some((t) => t)), pieces };
        }
        const roundSize = (fs) => Math.round(fs * 2) / 2;

        /** The rounded size carrying the most characters, 0 without text. */
        function bodySize(perPage) {
            const weight = new Map();
            for (const page of perPage) {
                for (const it of page.items) {
                    if (it.kind !== 'text' || !(it.fontSize > 0) || !it.text) continue;
                    const s = roundSize(it.fontSize);
                    weight.set(s, (weight.get(s) || 0) + it.text.length);
                }
            }
            let best = 0;
            let bestWeight = -1;
            for (const [s, w] of weight) {
                if (w > bestWeight) { best = s; bestWeight = w; }
            }
            return best;
        }

        /**
         * A page's pieces by line, as the paragraph rule's first pass: a
         * piece within half its size of the line's baseline joins it.
         */
        function piecesByLine(textItems) {
            const lines = [];
            let cur = null;
            for (const p of textItems) {
                const fs = p.fontSize > 0 ? p.fontSize : 0;
                const tol = Math.max(0.5 * (fs || (cur ? cur.fs : 0)), 0.5);
                if (cur && Math.abs(p.y - cur.y) <= tol) {
                    cur.pieces.push(p);
                    if (fs > cur.fs) cur.fs = fs;
                } else {
                    if (cur) lines.push(cur);
                    cur = { y: p.y, fs, pieces: [p] };
                }
            }
            if (cur) lines.push(cur);
            return lines.map((ln) => ln.pieces);
        }

        /**
         * One page's blocks with headings inferred: `{ text, size, bold }`,
         * `size` a size heading's rounded size, `bold` a bold-line heading,
         * a paragraph neither.
         */
        /** A line's cells: its pieces left to right, cut at a gap over `CELL_GAP_EM`. */
        function lineCells(line) {
            const ps = line.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.xEnd)).sort((a, b) => a.x - b.x);
            const cells = [];
            let cur = null;
            let prev = null;
            for (const p of ps) {
                const em = p.fontSize > 0 ? p.fontSize : 0;
                const gap = prev ? p.x - prev.xEnd : 0;
                if (cur && em > 0 && gap > CELL_GAP_EM * em) { cells.push(cur); cur = null; }
                if (!cur) {
                    cur = { x: p.x, text: p.text };
                } else {
                    const pem = prev.fontSize > 0 ? prev.fontSize : em;
                    if (pem > 0 && Math.abs(gap) > WORD_GAP_EM * pem && !/\s$/.test(cur.text) && !/^\s/.test(p.text)) cur.text += ' ';
                    cur.text += p.text;
                }
                prev = p;
            }
            if (cur) cells.push(cur);
            return cells.map((c) => ({ x: c.x, text: c.text.trim() })).filter((c) => c.text);
        }

        /** A page's tables: `{ from, to, rows }`, `from` / `to` the line indexes. */
        function findTables(lines) {
            const cells = lines.map(lineCells);
            const out = [];
            let i = 0;
            while (i < lines.length) {
                if (cells[i].length < 2) { i++; continue; }
                let j = i;
                while (j + 1 < lines.length && cells[j + 1].length >= 2) j++;
                const em = lines[i][0].fontSize > 0 ? lines[i][0].fontSize : 0;
                if (j > i && em > 0) {
                    const tol = COLUMN_TOL_EM * em;
                    const starts = cells.slice(i, j + 1).flat().map((c) => c.x).sort((a, b) => a - b);
                    const anchors = [];
                    for (const x of starts) {
                        if (anchors.length === 0 || x - anchors[anchors.length - 1] > tol) anchors.push(x);
                    }
                    const columns = anchors.filter((a) => cells.slice(i, j + 1)
                        .filter((row) => row.some((c) => Math.abs(c.x - a) <= tol)).length >= 2);
                    const short = cells.slice(i, j + 1).every((row) => row.every((c) => c.text.length <= CELL_MAX_CHARS));
                    if (columns.length >= 2 && short) {
                        const rows = cells.slice(i, j + 1).map((row) => {
                            const out2 = new Array(columns.length).fill('');
                            for (const c of row) {
                                let best = 0;
                                for (let k = 1; k < columns.length; k++) {
                                    if (Math.abs(columns[k] - c.x) < Math.abs(columns[best] - c.x)) best = k;
                                }
                                out2[best] = out2[best] ? out2[best] + ' ' + c.text : c.text;
                            }
                            return out2;
                        });
                        out.push({ from: i, to: j, rows });
                    }
                }
                i = j + 1;
            }
            return out;
        }

        /**
         * One page's blocks, the opt-in inference applied: `{ text, size,
         * bold }` (`size` a size heading's rounded size, `bold` a bold-line
         * heading, a paragraph neither) or `{ table }` (its rows of cell
         * texts). `body` 0 turns the headings off.
         */
        function pageBlocks(textItems, body, tables, rules, paraOpts) {
            const out = [];
            const lines = piecesByLine(textItems);
            // Ruled tables first: their pieces leave the flow.
            const gone = new Set();
            const gridAt = new Map();
            if (tables) {
                for (const g of findGrids(rules)) {
                    const t = gridTable(g, textItems.filter((p) => !gone.has(p)), paraOpts);
                    if (!t) continue;
                    const first = textItems.find((p) => t.pieces.has(p));
                    gridAt.set(first, t.rows);
                    for (const p of t.pieces) gone.add(p);
                }
            }
            const found = tables ? findTables(lines.map((line) => line.filter((p) => !gone.has(p)))) : [];
            const tableAt = new Map();
            for (const t of found) for (let k = t.from; k <= t.to; k++) tableAt.set(k, t);
            let run = [];
            // The run's key: a heading size, -1 for whole bold lines at
            // body size, 0 for body text.
            let key = null;
            const flush = () => {
                if (run.length === 0) return;
                for (const text of groupParagraphs(run, paraOpts)) {
                    if (!text) continue;
                    const letter = /\p{L}/u.test(text);
                    const size = key > 0 && text.length <= HEADING_MAX_CHARS && letter ? key : 0;
                    const bold = key === -1 && text.length <= BOLD_HEADING_MAX_CHARS && letter;
                    out.push({ text, size, bold });
                }
                run = [];
            };
            lines.forEach((line, li) => {
                const t = tableAt.get(li);
                if (t) {
                    if (t.from === li) { flush(); key = null; out.push({ table: t.rows }); }
                    return;
                }
                const boldLine = body > 0 && line.every((p) => p.bold === true);
                for (const p of line) {
                    if (gridAt.has(p)) { flush(); key = null; out.push({ table: gridAt.get(p) }); }
                    if (gone.has(p)) continue;
                    const big = body > 0 && p.fontSize >= body * HEADING_RATIO ? roundSize(p.fontSize) : 0;
                    const k = big > 0 ? big : (boldLine ? -1 : 0);
                    if (key !== null && k !== key) flush();
                    key = k;
                    run.push(p);
                }
            });
            flush();
            return out;
        }

        function tableNode(rows) {
            return node('table', {}, rows.map((r, ri) => node('row', { header: ri === 0 },
                r.map((text) => node('cell', {}, text ? [paragraphNode(text)] : [])))));
        }

        function buildUntagged(perPage, infer, losses, paraOpts) {
            const body = infer.has('headings') ? bodySize(perPage) : 0;
            const tables = infer.has('tables');
            if (body > 0 || tables) {
                const pages = perPage.map((page) => {
                    const rules = page.items.filter((it) => it.kind === 'rule');
                    return pageParts(page.items).flatMap((part) => (part.image
                        ? [{ image: part.image }]
                        : pageBlocks(part.text, body, tables, rules, paraOpts)));
                });
                const sizes = [...new Set(pages.flat().filter((b) => b.size > 0).map((b) => b.size))]
                    .sort((a, b) => b - a);
                const boldLevel = Math.min(sizes.length + 1, 6);
                const blocks = [];
                pages.forEach((page, pi) => {
                    if (pi > 0) blocks.push(node('hr', {}));
                    for (const b of page) {
                        if (b.image) {
                            blocks.push(imageNode(b.image, losses));
                        } else if (b.table) {
                            blocks.push(tableNode(b.table));
                        } else if (b.size > 0) {
                            blocks.push(node('heading', { level: Math.min(sizes.indexOf(b.size) + 1, 6) }, [node('run', { text: b.text })]));
                        } else if (b.bold) {
                            blocks.push(node('heading', { level: boldLevel }, [node('run', { text: b.text })]));
                        } else {
                            blocks.push(paragraphNode(b.text));
                        }
                    }
                });
                return blocks;
            }
            const blocks = [];
            for (let pi = 0; pi < perPage.length; pi++) {
                if (pi > 0) blocks.push(node('hr', {}));
                for (const part of pageParts(perPage[pi].items)) {
                    if (part.image) {
                        blocks.push(imageNode(part.image, losses));
                        continue;
                    }
                    for (const p of groupParagraphs(part.text, paraOpts)) {
                        if (p) blocks.push(paragraphNode(p));
                    }
                }
            }
            return blocks;
        }

        function buildTagged(structure, perPage, losses, paraOpts) {
            // (pageIndex:mcid) → its text pieces in content order.
            const piecesByMcid = new Map();
            for (let pi = 0; pi < perPage.length; pi++) {
                for (const it of perPage[pi].items) {
                    if (it.kind !== 'text' || it.mcid === null || it.mcid === undefined) continue;
                    const key = pi + ':' + it.mcid;
                    if (!piecesByMcid.has(key)) piecesByMcid.set(key, []);
                    piecesByMcid.get(key).push(it);
                }
            }
            // (pageIndex:mcid) → its placeable pictures (`include:
            // ['images']`); one a struct element lists is placed with it.
            const picturesByMcid = new Map();
            const pictures = [];
            for (let pi = 0; pi < perPage.length; pi++) {
                for (const it of perPage[pi].items) {
                    if (it.kind !== 'image' || !it.bytes) continue;
                    pictures.push(it);
                    if (it.mcid === null || it.mcid === undefined) continue;
                    const key = pi + ':' + it.mcid;
                    if (!picturesByMcid.has(key)) picturesByMcid.set(key, []);
                    picturesByMcid.get(key).push(it);
                }
            }
            const placed = new Set();
            const idKey = (k) => k.pageIndex + ':' + k.mcid;

            /** An element's ids in /K order, its descendants' included. */
            function idsOf(el, out) {
                for (const k of el.kids) {
                    if (k.mcid !== undefined) out.push(k);
                    else idsOf(k, out);
                }
                return out;
            }
            /** The text of ids: all their pieces joined by the paragraph rule (A47). */
            function textOf(ids) {
                const pieces = ids.flatMap((k) => piecesByMcid.get(idKey(k)) || []);
                return groupParagraphs(pieces, paraOpts).join(' ').replace(/\s+/g, ' ').trim();
            }

            // The top-level blocks; a page change between two of them is an `hr`.
            const top = [];
            let lastPage = 0;
            let pageSeen = false;
            function push(out, n, page) {
                if (out === top) {
                    if (pageSeen && page !== lastPage) top.push(node('hr', {}));
                    lastPage = page;
                    pageSeen = true;
                }
                out.push(n);
            }
            /** The block of some inline content (`make(text)`), then its pictures. */
            function inlineBlocks(ids, out, make) {
                if (!ids.length) return;
                const text = textOf(ids);
                const pics = ids.flatMap((k) => picturesByMcid.get(idKey(k)) || []).filter((it) => !placed.has(it));
                if (text) push(out, make(text), ids[0].pageIndex);
                for (const it of pics) {
                    placed.add(it);
                    push(out, imageNode(it, losses), ids[0].pageIndex);
                }
            }
            const pageOfEl = (el) => {
                const ids = idsOf(el, []);
                return ids.length ? ids[0].pageIndex : el.pageIndex;
            };

            /**
             * An element's blocks: a heading, a list, a table, or its inline
             * content as paragraphs between its block children, in /K order.
             */
            function blocksOf(el, out) {
                const level = HEADING_LEVEL[el.tag];
                if (level) {
                    inlineBlocks(idsOf(el, []), out, (text) => node('heading', { level }, [node('run', { text })]));
                    return;
                }
                if (el.tag === 'L') { listOf(el, out); return; }
                if (el.tag === 'Table') {
                    if (tableOf(el, out)) return;
                    losses.push({ code: 'struct/dropped', detail: 'Table' });
                }
                let ids = [];
                for (const k of el.kids) {
                    if (k.mcid !== undefined) ids.push(k);
                    else if (INLINE_TAGS.has(k.tag)) idsOf(k, ids);
                    else {
                        inlineBlocks(ids, out, paragraphNode);
                        ids = [];
                        blocksOf(k, out);
                    }
                }
                inlineBlocks(ids, out, paragraphNode);
            }

            /** An `L` as an IR list: each `LI` an item, its `Lbl` read for the kind and dropped when a marker. */
            function listOf(el, out) {
                const items = [];
                let ordered = null;
                for (const k of el.kids) {
                    const blocks = [];
                    if (k.mcid !== undefined) inlineBlocks([k], blocks, paragraphNode);
                    else if (k.tag === 'L' && items.length) { listOf(k, items[items.length - 1]); continue; }
                    else if (k.tag === 'LI') {
                        let label = '';
                        const body = [];
                        for (const c of k.kids) {
                            if (c.mcid === undefined && c.tag === 'Lbl') label = [label, textOf(idsOf(c, []))].filter(Boolean).join(' ');
                            else if (c.mcid === undefined && c.tag === 'LBody') body.push(...c.kids);
                            else body.push(c);
                        }
                        if (label && ordered === null) ordered = NUMERIC_LABEL.test(label);
                        blocksOf({ tag: 'LBody', pageIndex: k.pageIndex, kids: body }, blocks);
                        if (label && !LABEL_MARKER.test(label)) {
                            const first = blocks[0];
                            if (first && first.kind === 'paragraph') blocks[0] = paragraphNode(label + ' ' + first.children.map((r) => r.text).join(''));
                            else blocks.unshift(paragraphNode(label));
                        }
                    } else blocksOf(k, blocks);
                    if (blocks.length) items.push(blocks);
                }
                if (!items.length) return;
                const list = node('list', { ordered: ordered === true }, items.map((b) => node('listItem', {}, b)));
                push(out, list, pageOfEl(el));
            }

            /** A `Table` with rows as an IR table (its captions around it); `false` without a `TR`. */
            function tableOf(el, out) {
                const rows = [];
                const before = [];
                const after = [];
                const visit = (k, head) => {
                    if (k.mcid !== undefined) (rows.length ? after : before).push(k);
                    else if (k.tag === 'TR') rows.push({ el: k, head });
                    else if (k.tag === 'THead' || k.tag === 'TBody' || k.tag === 'TFoot') {
                        for (const c of k.kids) visit(c, k.tag === 'THead');
                    } else (rows.length ? after : before).push(k);
                };
                for (const k of el.kids) visit(k, false);
                if (!rows.length) return false;
                const around = (kids) => {
                    for (const k of kids) {
                        if (k.mcid !== undefined) inlineBlocks([k], out, paragraphNode);
                        else blocksOf(k, out);
                    }
                };
                around(before);
                const irRows = rows.map(({ el: row, head }) => {
                    const cells = row.kids.map((c) => {
                        const blocks = [];
                        if (c.mcid !== undefined) inlineBlocks([c], blocks, paragraphNode);
                        else blocksOf({ tag: 'TD', pageIndex: c.pageIndex, kids: c.kids }, blocks);
                        return node('cell', {}, blocks);
                    });
                    const allTh = row.kids.length > 0 && row.kids.every((c) => c.mcid === undefined && c.tag === 'TH');
                    return node('row', { header: head || allTh }, cells);
                });
                if (irRows.some((r) => r.children.some((c) => c.children.length))) push(out, node('table', {}, irRows), pageOfEl(el));
                around(after);
                return true;
            }

            for (const root of structure.tree) blocksOf(root, top);
            // A picture no struct element lists is not placed.
            for (const it of pictures) {
                if (!placed.has(it)) losses.push({ code: 'image/dropped', detail: it.detail });
            }
            return top;
        }

        /**
         * Convert `readResult` (the value of `pdf.read(bytes)`) into an
         * `oconv-ir/v1` document, its loss ledger, and the measured decode
         * coverage.
         *
         * @param {object} readResult Value of `pdf.read(bytes)` — must carry
         *   `pages` and `_raw.resolve`.
         * @param {{formOpBudget?: number, infer?: string[], declare?: string[], include?: string[], lineHyphens?: string}} [opts]
         *   `formOpBudget` — forwarded to every `extractPage` call. `infer` —
         *   the opt-in inference of the untagged path (`'headings'`,
         *   `'tables'`, see the module header). `declare` — the opt-in
         *   record of a silent case (`'positional'`, see the module header).
         *   `include` — the opt-in parts (`'images'`, see the module header).
         *   `lineHyphens` — `'drop'` or `'keep'`, how a hyphen ending a line
         *   joins (see the module header).
         *   All validated at entry, before the first page is extracted, so a
         *   zero-page document still refuses a bad value.
         * @returns {{ir: object, losses: {code: string, detail: string}[],
         *   coverage: {pages: object[], total: object, tagged: boolean}}}
         * @throws {Error} `oconv: bad form op budget` when `opts.formOpBudget`
         *   is present and is not a safe integer >= 1.
         * @throws {Error} `oconv: bad pdf infer` when `opts.infer` is present
         *   and is not an array of distinct known inference names.
         * @throws {Error} `oconv: bad pdf declare` when `opts.declare` is
         *   present and is not an array of distinct known names.
         * @throws {Error} `oconv: bad pdf include` when `opts.include` is
         *   present and is not an array of distinct known names.
         * @throws {Error} `oconv: bad pdf line hyphens` when
         *   `opts.lineHyphens` is present and is neither `'drop'` nor `'keep'`.
         */
        function pdfToIr(readResult, opts) {
            assertFormOpBudget(opts && opts.formOpBudget);
            const infer = inferSet(opts && opts.infer);
            const declare = declareSet(opts && opts.declare);
            const include = includeSet(opts && opts.include);
            const lineHyphens = opts ? opts.lineHyphens : undefined;
            if (lineHyphens !== undefined && lineHyphens !== 'drop' && lineHyphens !== 'keep') {
                throw new Error('oconv: bad pdf line hyphens');
            }
            const paraOpts = lineHyphens === undefined ? undefined : { lineHyphens };
            const resolve = readResult && readResult._raw && readResult._raw.resolve;
            const pages = (readResult && readResult.pages) || [];
            const losses = [];
            const perPage = [];
            const coveragePages = [];

            // `'tables'` reads ruled tables: the pages' rules are asked for.
            let pageOpts = infer.has('tables') ? { ...opts, rules: true } : opts;
            // `'images'`: the placeable pictures' bytes are asked for.
            if (include.has('images')) pageOpts = { ...pageOpts, images: true };
            for (const page of pages) {
                const ex = textExtractMod.extractPage(page, resolve, pageOpts);
                perPage.push(ex);
                for (const l of ex.losses) losses.push(l);
                coveragePages.push(ex.counts);
            }

            const structure = structMod.readStructure(readResult, resolve);
            if (!structure && infer.has('running')) dropRunning(perPage, pages, losses);
            const blocks = structure
                ? buildTagged(structure, perPage, losses, paraOpts)
                : buildUntagged(perPage, infer, losses, paraOpts);
            // `'positional'`: the untagged structure was built from
            // positioning; one record, after the extraction's.
            if (!structure && declare.has('positional')
                    && blocks.some((b) => b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'table')) {
                const built = ['paragraphs', ...['headings', 'tables'].filter((n) => infer.has(n))];
                losses.push({ code: 'struct/positional', detail: built.join(', ') });
            }

            const total = coveragePages.reduce((a, c) => ({
                operators: a.operators + c.operators,
                decoded: a.decoded + c.decoded,
                undecodable: a.undecodable + c.undecodable
            }), { operators: 0, decoded: 0, undecodable: 0 });

            return {
                ir: doc(blocks),
                losses,
                coverage: { pages: coveragePages, total, tagged: !!structure }
            };
        }

        return { pdfToIr };
    }
};
