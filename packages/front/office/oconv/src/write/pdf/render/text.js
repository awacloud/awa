// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Content-stream emission for the `md → pdf` bounded
 * typesetter, covering BOTH font routes (Standard 14 and embedded) and the
 * rule / page-number marks the stack emits.
 *
 * One page of laid-out items in, one PDF content stream out. Nothing here
 * decides *where* anything goes: `./../stack.js` already placed every item
 * in PDF user space (origin bottom-left, `y` a text BASELINE or a rule
 * rect's bottom edge). This module only encodes.
 *
 * ## What it emits
 *
 * | Item | Operators |
 * |---|---|
 * | text | one `BT /<res> <size> Tf 1 0 0 1 <x> <y> Tm <string> Tj ET` per STYLE SEGMENT |
 * | rule (`hr`, blockquote bar, a renderer's rect) | `<x> <y> <w> <h> re f` |
 * | image (`item.xobject`) | `q <w> 0 0 <h> <x> <y> cm /<name> Do Q` |
 * | page number (`pageNumbers`, default `true`) | one text block, body size, regular face, centred at `y = margin / 2` |
 *
 * The image case is the ONE addition image placement makes to this module, and it is
 * deliberately here rather than in `./image.js`: a renderer runs during
 * LAYOUT, when no page exists yet, and this module is the single place that
 * turns laid-out items into operators. It registers nothing — the XObject
 * spec the image renderer queued is replayed onto `pdfBuilder` by the facade
 * (`../../ir-to-pdf.js`) once the page it landed on is created.
 *
 * Every style segment carries its OWN explicit text matrix (`Tm`), so the
 * glyph origins in the file are exactly the origins the linebreaker and the
 * stacker computed — nothing is left to an implicit advance, and a
 * measurement bug can never be hidden by the viewer's own advances.
 *
 * ## The two encodings
 *
 * - **Standard 14 route** — a PDF literal string of **WinAnsi** bytes, with
 *   the three literal-string escapes (`(`, `)`, `\`). A code point WinAnsi
 *   cannot represent degrades to the `'?'` byte and is RECORDED (see
 *   `losses` below), never silently dropped. The `winAnsiByte` table comes
 *   from `oconvPdfMetrics` — the SAME table the widths were measured with,
 *   which is the whole reason this module declares that dependency.
 * - **Embedded route** — `entry.embedded.encode(text)` (`pdfFontEmbed`)
 *   rendered as a **hex string** `<…>`. Hex is
 *   used for BOTH embedded sub-routes: under `Identity-H` a code is two
 *   bytes and a literal string would have to escape arbitrary binary, and
 *   under `WinAnsiEncoding` hex is merely more verbose, never wrong. When
 *   the resolved `FontEntry` carries a `hasGlyph` probe, every
 *   code point of a segment is checked before encoding and a `false`
 *   result is RECORDED into the same scratch sink `literalBytes` uses —
 *   one record per OCCURRENCE, exactly like an unencodable Standard 14
 *   code point. Encoding and the emitted bytes are unchanged either way:
 *   the glyph still renders as `.notdef`, the point is that it is no
 *   longer silent. No `hasGlyph` ⇒ no check (backward compatible).
 *
 * ## No silent empty draw
 *
 * `putSegment` throws `oconv: pdf font missing <style>` when neither the
 * segment's own style nor `regular` resolves to a `fonts` entry, and the
 * page-number block throws `oconv: pdf font missing regular` under the
 * same condition. The facade (`../../ir-to-pdf.js`) guarantees an entry
 * for every drawable segment — a violated guarantee must be loud, never
 * an empty page.
 *
 * ## Links
 *
 * v1 draws NO link annotation (the typesetter's published limits).
 * `stack.js` carries a line's uniform `link` target through for a later
 * version; links render as plain text with no PDF
 * annotation and no loss recorded — a published refusal.
 *
 * Worker-safe, capture-free (`fw/no-factory-capture`): every constant and
 * helper is declared inside `factory()`, whose single parameter is the
 * resolved `oconvPdfMetrics` instance.
 *
 * @module oconv/write/pdf/render/text
 */

/**
 * Content-stream emitter module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfRenderText')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `pageContent(page, fonts, layout, losses)` | `{bytes: Uint8Array, usedFonts: Set<string>}` |
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (metrics: object) => object}}
 */
import { oconvPdfMetrics } from '../metrics.js';

export const oconvPdfRenderText = {
    name: 'oconvPdfRenderText',
    dependencies: ['oconvPdfMetrics'],
    deps: [oconvPdfMetrics],

    factory(metrics) {
        /**
         * One entry of the `fonts` map `pageContent` receives — built by the
         * facade (`../../ir-to-pdf.js`), one per style class actually used.
         *
         * @typedef {object} FontEntry
         * @property {string} res PDF resource name (`/FR`, `/FB`, …) — the
         *   name the facade also registered with `pdfBuilder.addFont`.
         * @property {'standard14'|'embedded'} source Which encoding applies.
         * @property {object} [embedded] The `pdfFontEmbed` result on the
         *   embedded route; its `encode(text)` returns the character codes.
         * @property {(codePoint: number) => boolean} [hasGlyph] Present on
         *   embedded entries once the facade supplies it; absent
         *   on Standard 14 entries. When present, every code point of a
         *   drawn segment is checked and a `false` result is recorded into
         *   the scratch sink — see "No silent empty draw" above.
         * @property {(text: string, sizePt: number) => number} widthOf
         *   Advance width in points — the facade closes this over the SAME
         *   `oconvPdfMetrics` measurer the layout was computed with. Used
         *   only to centre the page number; every other x is already placed.
         */

        /** Escape / degrade bytes of a PDF literal string. */
        const LIT_OPEN = 0x28;
        const LIT_CLOSE = 0x29;
        const BACKSLASH = 0x5C;
        const QUESTION_MARK = 0x3F;

        /**
         * `'/'` kept out of the emitted template literals: the
         * operand separator is data, not syntax, and building it
         * from a code point keeps a stray `/` out of grep results over the
         * emitter's own source.
         */
        const SLASH = String.fromCharCode(47);

        /** Page-number baseline = this fraction of the margin. */
        const PAGE_NUMBER_MARGIN_RATIO = 0.5;

        /**
         * Round to 3 decimals and print without an exponent — PDF numbers
         * have no exponent form, so `String(1e-7)` would be a syntax error.
         *
         * @param {number} n
         * @returns {string}
         */
        function num(n) {
            const r = Math.round(n * 1000) / 1000;
            return Object.is(r, -0) ? '0' : String(r);
        }

        /**
         * Uppercase hex of a byte sequence — the body of a PDF hex string.
         *
         * @param {Uint8Array|number[]} bytes
         * @returns {string}
         */
        function toHex(bytes) {
            let out = '';
            for (const b of bytes) out += b.toString(16).padStart(2, '0').toUpperCase();
            return out;
        }

        /**
         * WinAnsi literal-string body for `text`, with the three escapes.
         * An unrepresentable code point becomes `'?'` and appends ONE record
         * to `sink` — the facade collapses those into a single
         * `text/unencodable` loss per document.
         *
         * @param {string} text
         * @param {object} item The laid-out item the text came from.
         * @param {object[]} sink
         * @returns {number[]} Byte values.
         */
        function literalBytes(text, item, sink) {
            const out = [];
            for (const ch of text) {
                const cp = ch.codePointAt(0);
                const b = metrics.winAnsiByte(cp);
                if (b === null) {
                    sink.push({
                        char: ch,
                        codePoint: cp,
                        index: item.index,
                        kind: item.kind
                    });
                    out.push(QUESTION_MARK);
                    continue;
                }
                if (b === LIT_OPEN || b === LIT_CLOSE || b === BACKSLASH) out.push(BACKSLASH);
                out.push(b);
            }
            return out;
        }

        /**
         * Split one laid-out item into style SEGMENTS with absolute `x`.
         *
         * A pre-rendered `text` item (a page number, or anything a renderer
         * supplies as a plain string) is one segment at the item's own
         * style; a token-bearing item groups consecutive tokens sharing a
         * style class, each segment starting where the previous one ended.
         *
         * @param {object} item
         * @returns {{style: string, text: string, x: number}[]}
         */
        function segmentsOf(item) {
            if (item.text !== undefined) {
                return String(item.text) === ''
                    ? []
                    : [{ style: item.style || 'regular', text: String(item.text), x: item.x }];
            }
            const segments = [];
            for (const t of item.tokens || []) {
                const last = segments[segments.length - 1];
                const style = t.style || 'regular';
                const text = t.text === undefined ? '' : String(t.text);
                const width = Number.isFinite(t.width) ? t.width : 0;
                if (last && last.style === style) {
                    last.text += text;
                    last.width += width;
                } else {
                    segments.push({ style, text, width, x: 0 });
                }
            }
            let x = item.x;
            for (const seg of segments) { seg.x = x; x += seg.width; }
            return segments;
        }

        /**
         * Emit one page's content stream.
         *
         * `losses` is a SCRATCH sink, not the document's loss ledger: this
         * function appends one raw record per unrepresentable code point
         * (`{char, codePoint, index, kind}`) and the facade collapses the
         * whole document's records into ONE `text/unencodable` loss carrying
         * `{count, sample}`. Passing the ledger itself would put one loss per
         * character in front of the caller.
         *
         * @param {{number: number, items: object[]}} page A page from
         *   `oconvPdfStack.stackPages`.
         * @param {Object<string, FontEntry>} fonts Style class → font entry,
         *   for every class this document actually uses.
         * @param {object} layout `oconvPdfBox.resolveLayout()`.
         * @param {object[]} losses Scratch sink (see above).
         * @returns {{bytes: Uint8Array, usedFonts: Set<string>}} `usedFonts`
         *   holds the PDF resource NAMES this stream references — exactly
         *   what the caller must register on the page.
         */
        function pageContent(page, fonts, layout, losses) {
            const encoder = new TextEncoder();
            /** @type {number[]} */
            const out = [];
            /** @type {Set<string>} */
            const usedFonts = new Set();
            const put = (s) => { for (const b of encoder.encode(s)) out.push(b); };
            const sink = Array.isArray(losses) ? losses : [];
            const fontMap = fonts || {};

            /**
             * Emit one text segment as its own `BT … Tm … Tj ET` block.
             *
             * @param {object} item
             * @param {{style: string, text: string, x: number}} seg
             */
            const putSegment = (item, seg) => {
                const entry = fontMap[seg.style] || fontMap.regular;
                if (!entry) {
                    // The facade (`../../ir-to-pdf.js`) guarantees an entry
                    // for every drawable segment; a violated
                    // guarantee must be loud, never an empty page.
                    throw new Error(`oconv: pdf font missing ${seg.style}`);
                }
                usedFonts.add(entry.res);
                const size = Number.isFinite(item.sizePt) ? item.sizePt : layout.baseSize;
                put(`BT ${SLASH}${entry.res} ${num(size)} Tf 1 0 0 1 ${num(seg.x)} ${num(item.y)} Tm `);
                if (entry.source === 'embedded') {
                    if (typeof entry.hasGlyph === 'function') {
                        for (const ch of seg.text) {
                            const cp = ch.codePointAt(0);
                            if (entry.hasGlyph(cp) === false) {
                                sink.push({
                                    char: ch,
                                    codePoint: cp,
                                    index: item.index,
                                    kind: item.kind
                                });
                            }
                        }
                    }
                    put(`<${toHex(entry.embedded.encode(seg.text))}>`);
                } else {
                    put('(');
                    for (const b of literalBytes(seg.text, item, sink)) out.push(b);
                    put(')');
                }
                put(' Tj ET\n');
            };

            for (const item of page.items || []) {
                if (item.rule) {
                    const r = item.rule;
                    put(`${num(r.x)} ${num(r.y)} ${num(r.w)} ${num(r.h)} re f\n`);
                }
                if (item.xobject) {
                    // A placed image. The XObject itself is
                    // registered on the page by the facade, which replays
                    // the spec the renderer queued; here we only draw it.
                    // `item.x`/`item.y` are the image box's BOTTOM-LEFT
                    // corner, which is exactly the origin `cm` maps the unit
                    // square onto.
                    const x = item.xobject;
                    put(`q ${num(x.w)} 0 0 ${num(x.h)} ${num(item.x)} ${num(item.y)} cm `
                        + `${SLASH}${x.name} Do Q\n`);
                }
                for (const seg of segmentsOf(item)) {
                    // Only a genuinely EMPTY segment is skipped. A
                    // whitespace-only one is NOT: it happens whenever two
                    // differently-styled words are separated by a space
                    // token of a third style (`italic word` SPACE `bold
                    // word`), and dropping it welds the two words together
                    // for every text extractor downstream — measured on the
                    // embedded-route oracle, which decoded
                    // `emphasisstrongboth` until the space segments were
                    // emitted. A naive emitter would skip them.
                    if (seg.text === '') continue;
                    putSegment(item, seg);
                }
            }

            if (layout.pageNumbers) {
                const entry = fontMap.regular;
                const label = String(page.number);
                if (label !== '' && !entry) {
                    // A non-empty label is always drawn; today it must not
                    // be silently skipped for a missing `regular` entry.
                    throw new Error('oconv: pdf font missing regular');
                }
                if (entry && label !== '') {
                    const width = entry.widthOf(label, layout.baseSize);
                    putSegment({
                        x: (layout.pageWidth - width) / 2,
                        y: layout.margin * PAGE_NUMBER_MARGIN_RATIO,
                        style: 'regular',
                        sizePt: layout.baseSize,
                        text: label,
                        index: `page:${page.number}`,
                        kind: 'pageNumber'
                    }, {
                        style: 'regular',
                        text: label,
                        x: (layout.pageWidth - width) / 2
                    });
                }
            }

            return { bytes: new Uint8Array(out), usedFonts };
        }

        return { pageContent };
    }
};
