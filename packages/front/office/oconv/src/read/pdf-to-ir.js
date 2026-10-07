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
 * beyond flowing text — headings (untagged), emphasis, lists, tables,
 * images, page geometry — is a tier-1 drop; the ones the reader can DETECT
 * are recorded as explicit losses (below), the rest are matrix drops, and
 * text itself is never silently dropped.
 *
 * ## Two paths
 *
 * - **Tagged fast path** — when the document carries a `/StructTreeRoot`
 *   (`./pdf/struct.js`), structure is derived from the logical tree:
 *   `H1`..`H6` struct elements → IR `heading{level}`, `P`/text-ish tags →
 *   `paragraph`, with text keyed to struct elements through marked-content
 *   ids (`/MCID`). `Table` / `L` containers are flattened (their descendant
 *   text is kept as paragraphs) and recorded as `struct/dropped`.
 * - **Untagged fall-back** — text pieces in content-stream order are grouped
 *   into lines and paragraphs by vertical position; within a line, one space
 *   is inferred where the horizontal gap (or overlap) between a piece's end
 *   and the next piece's start is a real word gap, and a piece that exactly duplicates
 *   the previous one (same text, same place within 0.5 pt) is dropped
 *   ({@link module:oconv/read/pdf/paragraph-group}'s `groupParagraphs`,
 *   mirrored inside this factory — see the drift note below). No heading is
 *   inferred on this path.
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
 * | `image/dropped` | an image XObject / inline image, inside a form too (tier 1 keeps none) |
 * | `xobject/form-dropped` | a Form XObject whose stream cannot be used (detail names the reason); a usable form is executed |
 * | `xobject/form-cycle` | a Form XObject drawn from inside itself, not re-entered |
 * | `xobject/form-depth` | a Form XObject nested deeper than 12, not executed |
 * | `xobject/form-budget` | form draws past the page's form-operator budget (default 1,000,000, `opts.formOpBudget`), skipped (once per page) |
 * | `content/undecodable` | a content stream failed to decode/parse; detail = `stream <objNum>: <cause>` (the thrown error's message) |
 * | `struct/dropped` | (tagged path) a `Table`/`L` container flattened |
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

        /* ── paragraph-group (mirror of ./pdf/paragraph-group.js) ────────── */

        function groupParagraphs(pieces, opts) {
            const gapFactor = (opts && typeof opts.gapFactor === 'number') ? opts.gapFactor : 1.6;
            const yTol = (opts && typeof opts.yTol === 'number') ? opts.yTol : 0.5;
            const wordGap = (opts && typeof opts.wordGap === 'number') ? opts.wordGap : 0.15;

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
                        paras.push(para.join(' '));
                        para = [text];
                    } else {
                        para.push(text);
                    }
                }
                prev = ln;
            }
            if (para) paras.push(para.join(' '));
            return paras;
        }

        /* ── IR shaping ──────────────────────────────────────────────────── */

        const HEADING_LEVEL = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };
        const CONTAINER_DROP = new Set(['Table', 'L']);

        function paragraphNode(text) {
            return node('paragraph', {}, [node('run', { text })]);
        }

        function buildUntagged(perPage) {
            const blocks = [];
            for (let pi = 0; pi < perPage.length; pi++) {
                if (pi > 0) blocks.push(node('hr', {}));
                const textItems = perPage[pi].items.filter((it) => it.kind === 'text');
                for (const p of groupParagraphs(textItems)) {
                    if (p) blocks.push(paragraphNode(p));
                }
            }
            return blocks;
        }

        function buildTagged(structure, perPage, losses) {
            // (pageIndex:mcid) → concatenated text.
            const textByMcid = new Map();
            for (let pi = 0; pi < perPage.length; pi++) {
                for (const it of perPage[pi].items) {
                    if (it.kind !== 'text' || it.mcid === null || it.mcid === undefined) continue;
                    const key = pi + ':' + it.mcid;
                    textByMcid.set(key, (textByMcid.get(key) || '') + it.text);
                }
            }
            function gather(el) {
                return el.mcids
                    .map((m) => textByMcid.get(el.pageIndex + ':' + m) || '')
                    .filter(Boolean)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            const blocks = [];
            let lastPage = 0;
            let pageSeen = false;
            for (const el of structure.order) {
                if (CONTAINER_DROP.has(el.tag)) {
                    losses.push({ code: 'struct/dropped', detail: el.tag });
                }
                if (!el.mcids.length) continue;
                const text = gather(el);
                if (!text) continue;
                if (pageSeen && el.pageIndex !== lastPage) blocks.push(node('hr', {}));
                lastPage = el.pageIndex;
                pageSeen = true;
                const level = HEADING_LEVEL[el.tag];
                if (level) blocks.push(node('heading', { level }, [node('run', { text })]));
                else blocks.push(paragraphNode(text));
            }
            return blocks;
        }

        /**
         * Convert `readResult` (the value of `pdf.read(bytes)`) into an
         * `oconv-ir/v1` document, its loss ledger, and the measured decode
         * coverage.
         *
         * @param {object} readResult Value of `pdf.read(bytes)` — must carry
         *   `pages` and `_raw.resolve`.
         * @param {{formOpBudget?: number}} [opts] `formOpBudget` — forwarded
         *   to every `extractPage` call. Validated at entry,
         *   before the first page is extracted, so a zero-page document
         *   still refuses a bad value (`assertFormOpBudget`).
         * @returns {{ir: object, losses: {code: string, detail: string}[],
         *   coverage: {pages: object[], total: object, tagged: boolean}}}
         * @throws {Error} `oconv: bad form op budget` when `opts.formOpBudget`
         *   is present and is not a safe integer >= 1.
         */
        function pdfToIr(readResult, opts) {
            assertFormOpBudget(opts && opts.formOpBudget);
            const resolve = readResult && readResult._raw && readResult._raw.resolve;
            const pages = (readResult && readResult.pages) || [];
            const losses = [];
            const perPage = [];
            const coveragePages = [];

            for (const page of pages) {
                const ex = textExtractMod.extractPage(page, resolve, opts);
                perPage.push(ex);
                for (const l of ex.losses) losses.push(l);
                coveragePages.push(ex.counts);
            }

            const structure = structMod.readStructure(readResult, resolve);
            const blocks = structure
                ? buildTagged(structure, perPage, losses)
                : buildUntagged(perPage);

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
