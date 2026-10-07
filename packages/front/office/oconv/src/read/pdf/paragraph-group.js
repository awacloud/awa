// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Deterministic text-positioning → paragraph grouping shared
 * by `pdf-to-ir.js`'s untagged fall-back path (tier 1 reading bounds).
 *
 * The extraction layer (`./text-extract.js`) emits, in content-stream
 * order, a flat list of positioned text pieces
 * (`{ text, x, y, fontSize, xEnd }`, one per show operator, page-local
 * device coordinates with the PDF origin at the bottom-left; `xEnd` is where
 * the piece ends). {@link groupParagraphs} is the ONLY paragraph
 * reconstruction the tier-1 reader performs: it uses vertical position
 * deltas to split lines and paragraphs, and the horizontal gap between two
 * pieces of one line only to decide a word space (no column detection, no
 * font/style inference, no layout analysis). The rule, in two passes:
 *
 *   1. **Lines** — consecutive pieces whose baseline `y` is within
 *      `yTol × fontSize` of the current line's baseline join into one line
 *      (text concatenated in content order — the reader never re-orders
 *      runs). A larger jump (either direction) opens a new line. A piece
 *      that exactly duplicates the previous piece of its line (same text,
 *      |Δx| ≤ 0.5 pt and |Δy| ≤ 0.5 pt — a label drawn twice at one place)
 *      is dropped. Between
 *      two pieces of a line, exactly one space is inserted when the next
 *      piece starts more than `wordGap × fontSize` (the previous piece's
 *      size) right of the previous piece's `xEnd`, OR more than the same
 *      `wordGap × fontSize` LEFT of it (an overlap), AND neither side is already whitespace. A gap or an
 *      overlap of at most `wordGap` em inserts nothing (the corpus's
 *      overlaps are almost all below 0.05 em: kerned apostrophes, syllables
 *      split across two shows, rounding); a line
 *      whose pieces go backwards (right-to-left or rotated text), or a
 *      piece without `xEnd`, gets no insertion. The default `wordGap`,
 *      0.15 em, is measured: on the three ANSSI guides the gaps between
 *      same-line pieces form two clusters — italic corrections and
 *      punctuation below 0.15 em, justified inter-word spaces from about
 *      0.166 em up — and 0.15 is the largest threshold that keeps every
 *      word space (0.2 already re-glues words). The `TJ` pass of
 *      `./text-extract.js` reads a kern as a word space on the SAME 0.15 em
 *      threshold; each module holds its own copy of the value
 *      and a drift test in `./text-extract.test.js` pins them equal.
 *   2. **Paragraphs** — successive lines join into one paragraph until the
 *      downward baseline gap exceeds `gapFactor × fontSize` (a blank-line
 *      sized gap) OR the baseline moves UP the page (`gap < 0` — a new
 *      column or region); either opens a new paragraph. Lines inside a
 *      paragraph are joined with a single space.
 *
 * Everything a real page carries beyond this — headings, emphasis, lists,
 * tables, columns, reading order across regions — is a documented tier-1
 * drop (the reader records the ones it can DETECT as explicit losses; the
 * rest are matrix drops, never silent per-piece drops of text itself).
 *
 * > **Duplication note (deliberate).** `oconvPdfToIr` carries its own inline
 * > copy of this algorithm because an fw factory may not capture a
 * > module-scope binding (`fw/no-factory-capture` — the factory source is
 * > serialised into Workers and inlined by the standalone builder). The two
 * > copies are pinned together by a drift test in `../pdf-to-ir.test.js`
 * > (same discipline as `../sheet-grid.js` / `../slide-section.js`).
 *
 * Pure module: no imports, no I/O, no `@awacloud/*` coupling — operates on a
 * plain array of `{ text, x, y, fontSize, xEnd? }` (never mutated; NEW
 * strings are always returned). Worker-safe by construction.
 *
 * @module oconv/read/pdf/paragraph-group
 */

/**
 * Group positioned text pieces into paragraph strings.
 *
 * @param {{text: string, x: number, y: number, fontSize: number, xEnd?: number}[]} pieces
 *   Positioned text pieces in content-stream order. Empty-text pieces are
 *   ignored.
 * @param {{gapFactor?: number, yTol?: number, wordGap?: number}} [opts]
 *   `gapFactor` (default 1.6) — new paragraph when the downward baseline
 *   gap exceeds this multiple of the previous line's font size. `yTol`
 *   (default 0.5) — same-line tolerance as a multiple of font size.
 *   `wordGap` (default 0.15) — one space between two same-line pieces when
 *   the horizontal gap, or the overlap, exceeds this multiple of the
 *   previous piece's font size.
 * @returns {string[]} One string per reconstructed paragraph (never empty
 *   strings; may be `[]`).
 */
export function groupParagraphs(pieces, opts) {
    const gapFactor = (opts && typeof opts.gapFactor === 'number') ? opts.gapFactor : 1.6;
    const yTol = (opts && typeof opts.yTol === 'number') ? opts.yTol : 0.5;
    const wordGap = (opts && typeof opts.wordGap === 'number') ? opts.wordGap : 0.15;

    // Pass 1 — lines.
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

    // Join each line's pieces in content order. One space goes between two
    // pieces iff the next starts more than `wordGap` em (the previous
    // piece's font size) right OR left of the previous piece's end AND
    // neither side is already whitespace. A line whose pieces go backwards (right-to-left
    // or rotated text), or a piece with no end position, gets no insertion.
    for (const ln of lines) {
        // An exact duplicate of the previous piece — same text, within
        // 0.5 pt in x and in y (a label drawn twice at one place, e.g. a
        // shadowed diagram label) — is dropped before the line is joined.
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
            // A gap OR an overlap (the next piece starting left of the
            // previous one's end) wider than `wordGap` em.
            if (forward && em > 0 && Math.abs(p.x - prev.xEnd) > wordGap * em
                    && !/\s$/.test(text) && !/^\s/.test(p.text)) {
                text += ' ';
            }
            text += p.text;
        }
        ln.text = text;
    }

    // Pass 2 — paragraphs.
    const paras = [];
    let para = null;
    let prev = null;
    for (const ln of lines) {
        const text = ln.text.trim();
        if (!text) { prev = ln; continue; }
        if (!para) {
            para = [text];
        } else {
            const gap = prev.y - ln.y;               // > 0 going down the page
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
