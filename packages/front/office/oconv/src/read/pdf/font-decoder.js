// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Per-font character decoder for the tier-1 pdf reader
 * (within the frozen tier-1 bounds).
 *
 * Turns a PDF Font dict into a decoder that maps a character code to its
 * Unicode text, honouring the tier-1 decode paths in priority order:
 *
 *   1. **ToUnicode CMap** — when the font carries a `/ToUnicode` stream, it
 *      is decoded (`pdfFilterDispatch`) and parsed (`@awacloud/fonts`'
 *      `cmapToUnicode.parseToUnicode`) into a `code → string` map. This is
 *      the authoritative path and the one that carries the real corpus
 *      (see the reader's module doc for the measured coverage).
 *   2. **Encoding table + AGL hop** — a simple font's `/Encoding`
 *      (`pdfFontEncoding.resolveEncoding` over `@awacloud/fonts`'
 *      `encodingLookup`) yields a 256-slot glyph-name table; each glyph
 *      name is resolved to Unicode via `@awacloud/fonts`' `encodingAgl.
 *      glyphNameToUnicode` via the AGL (Adobe Glyph List) mapping.
 *   3. **Standard (predefined) CMap, composite fonts only** — a `Type0`
 *      font has no single-byte encoding table; without a ToUnicode entry
 *      for a code, the predefined CMap its `/Encoding` names is used when
 *      that CMap's input codes ARE Unicode: the `Uni{GB,CNS,JIS,KS}-
 *      {UCS2,UTF16}[-HW]-{H,V}` family (ISO 32000-2 §9.7.5.2), whose
 *      2-byte codes are UTF-16BE code units. A BMP code unit decodes to
 *      itself; a surrogate half is counted undecodable (the reader splits
 *      Type0 strings into 2-byte codes). Every other predefined CMap
 *      (`Identity-H/V` — codes are CIDs, not Unicode — and the legacy
 *      RKSJ/EUC/… CMaps, whose tables are not bundled) resolves nothing
 *      here, so its codes stay undecodable (CID→GID→Unicode font-program
 *      walking is out of tier-1 scope).
 *
 * A code that neither path resolves is **counted as undecodable and
 * omitted from the text** — never silently kept as a wrong glyph and never
 * dropped without a count (the reader turns the per-run
 * undecodable count into an explicit loss entry).
 *
 * ## Glyph widths (horizontal advance, ISO 32000-2 §9.2.4 / §9.7.4.3)
 *
 * The decoder also exposes `width(code)`: the glyph's horizontal
 * displacement w0 in thousandths of text-space units, which the page walk
 * (`./text-extract.js`) turns into each text piece's end position. Sources,
 * in order:
 *
 *   - **Simple fonts** — `/Widths` indexed from `/FirstChar`; a code outside
 *     the array takes the descriptor's `/MissingWidth` (default 0, as the
 *     spec says). A Type 3 font's widths are scaled by its `/FontMatrix`.
 *   - **Composite fonts** — the descendant CIDFont's `/W` array (both forms,
 *     `c [w1 w2 …]` and `cFirst cLast w`), `/DW` (default 1000) for CIDs it
 *     does not list. Codes are CIDs only under `Identity-H`/`Identity-V`;
 *     under any other CMap the code → CID map is unknown, so `/DW` is used.
 *   - **Standard 14 fonts without `/Widths`** — the Adobe Core 14 AFM widths
 *     shipped by `@awacloud/fonts` (`standard14Lookup`), looked up by the
 *     code's glyph name (the tables are WinAnsi-indexed; `Symbol` and
 *     `ZapfDingbats` by code).
 *
 * When a width cannot be derived from the font — `/Widths` absent on a
 * non-Standard-14 font, a malformed width array or entry, a missing
 * descendant font, a `/W` table under a non-identity CMap, a Standard 14
 * glyph absent from the AFM table — a declared fallback (500 thousandths
 * for a simple font, 1000 for a composite one) is used and
 * `widthApproximated()` turns `true`; the page walk records it as one
 * `text/width-approximated` loss per font. A malformed width structure
 * never throws.
 *
 * Composes ONLY documented public exports of `@awacloud/pdf` and `@awacloud/fonts`
 * — no internal reach. Strict factory-only fw descriptor, capture-free
 * (`fw/no-factory-capture`), worker-safe (no DOM; `TextDecoder` only).
 *
 * @module oconv/read/pdf/font-decoder
 */

import { pdfFont } from '@awacloud/pdf';
import { pdfFontEncoding } from '@awacloud/pdf';
import { pdfFilterDispatch } from '@awacloud/pdf';
import { cmapToUnicode } from '@awacloud/fonts';
import { encodingLookup } from '@awacloud/fonts';
import { encodingAgl } from '@awacloud/fonts';
import { standard14Lookup } from '@awacloud/fonts';

export const oconvPdfFontDecoder = {
    name: 'oconvPdfFontDecoder',
    dependencies: [
        'pdfFont', 'pdfFontEncoding', 'pdfFilterDispatch',
        'cmapToUnicode', 'encodingLookup', 'encodingAgl', 'standard14Lookup'
    ],
    deps: [pdfFont, pdfFontEncoding, pdfFilterDispatch, cmapToUnicode, encodingLookup, encodingAgl, standard14Lookup],

    factory(pdfFontMod, pdfFontEncMod, dispatchMod, cmapMod, encLookupMod, aglMod, s14Mod) {
        // Capture-free: every helper this factory needs is declared in its
        // own body (fw/no-factory-capture).

        /** Decode raw stream bytes as latin1 into a JS string (CMap source). */
        function latin1(bytes) {
            return new TextDecoder('latin1').decode(bytes);
        }

        /** Declared fallback widths (thousandths of text space). */
        const FALLBACK_SIMPLE = 500;
        const FALLBACK_COMPOSITE = 1000;
        /** Highest CID a `/W` entry may reach (CIDs are 2-byte values). */
        const MAX_CID = 0xFFFF;

        /** Lazily-built glyph name → WinAnsi code map (Standard 14 AFM index). */
        let winAnsiIndex = null;
        function winAnsiCodeOf(glyphName) {
            if (!winAnsiIndex) {
                winAnsiIndex = new Map();
                let table;
                try { table = encLookupMod.lookupEncoding('WinAnsiEncoding'); }
                catch { table = null; }
                // Last occurrence wins: the lookup table names `quoteright`
                // and `quoteleft` at their ASCII slots too, while the AFM
                // tables hold them at 0x92/0x91 (and the ASCII slots carry
                // `quotesingle`/`grave` widths). Other repeats (space,
                // hyphen) have equal widths in every slot.
                for (let i = 0; table && i < 256 && i < table.length; i++) {
                    if (table[i]) winAnsiIndex.set(table[i], i);
                }
            }
            const c = winAnsiIndex.get(glyphName);
            return c === undefined ? null : c;
        }

        /**
         * Build the width side of one font (module doc, § Glyph widths).
         * Never throws: every malformed structure falls back to the declared
         * width and marks the font approximated.
         *
         * @param {object} f Typed font (`pdfFont.typeFont`).
         * @param {object} fontDict Raw Font dict.
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @param {(string|null)[]|null} encTable Simple-font glyph-name table.
         * @returns {{width: (code: number) => number, vertical: boolean,
         *   approximated: () => boolean}}
         */
        function buildWidths(f, fontDict, resolve, encTable) {
            let approx = false;
            const approximated = () => approx;
            function deref(v) {
                if (v && v.type === 'ref') {
                    try { return typeof resolve === 'function' ? resolve(v) : null; }
                    catch { return null; }
                }
                return v || null;
            }
            function num(v) {
                const d = deref(v);
                return (d && (d.type === 'int' || d.type === 'real') && Number.isFinite(d.value))
                    ? d.value : null;
            }
            function fixed(w, vertical) {
                approx = true;
                return { width: () => w, vertical, approximated };
            }
            const e = (fontDict && fontDict.entries) || {};

            if (f.subtype === 'Type0') {
                const enc = deref(e.Encoding);
                const encName = (enc && enc.type === 'name') ? enc.value : null;
                const vertical = !!encName && /-V$/.test(encName);
                const identity = encName === 'Identity-H' || encName === 'Identity-V';
                const descs = deref(e.DescendantFonts);
                const d0 = (descs && descs.type === 'array') ? deref(descs.items[0]) : null;
                if (!d0 || d0.type !== 'dict') return fixed(FALLBACK_COMPOSITE, vertical);
                let dw = d0.entries.DW === undefined ? 1000 : num(d0.entries.DW);
                if (dw === null) { dw = FALLBACK_COMPOSITE; approx = true; }
                const table = new Map();
                const w = d0.entries.W === undefined ? null : deref(d0.entries.W);
                if (d0.entries.W !== undefined && (!w || w.type !== 'array')) approx = true;
                const items = (w && w.type === 'array') ? w.items : [];
                let i = 0;
                while (i < items.length) {
                    const c = num(items[i]);
                    const next = deref(items[i + 1]);
                    if (c === null || !Number.isInteger(c) || c < 0 || !next) { approx = true; break; }
                    if (next.type === 'array') {
                        // `c [w1 w2 …]` — consecutive CIDs from c.
                        for (let k = 0; k < next.items.length && c + k <= MAX_CID; k++) {
                            const v = num(next.items[k]);
                            if (v === null) approx = true;
                            else table.set(c + k, v);
                        }
                        i += 2;
                    } else {
                        // `cFirst cLast w` — one width for the whole range.
                        const last = num(next);
                        const v = num(items[i + 2]);
                        if (last === null || v === null || !Number.isInteger(last)) { approx = true; break; }
                        for (let k = c; k <= Math.min(last, MAX_CID); k++) table.set(k, v);
                        i += 3;
                    }
                }
                if (!identity && table.size > 0) {
                    // Under a non-identity CMap, code → CID is unknown here.
                    approx = true;
                    return { width: () => dw, vertical, approximated };
                }
                return {
                    width(code) { const v = table.get(code); return v === undefined ? dw : v; },
                    vertical,
                    approximated
                };
            }

            // Simple font.
            let scale = 1;
            if (f.subtype === 'Type3') {
                const fm = deref(e.FontMatrix);
                const a = (fm && fm.type === 'array') ? num(fm.items[0]) : null;
                if (a !== null) scale = a * 1000;
                else approx = true;
            }
            if (e.Widths !== undefined) {
                const wArr = deref(e.Widths);
                const first = num(e.FirstChar);
                if (!wArr || wArr.type !== 'array' || first === null || !Number.isInteger(first)) {
                    return fixed(FALLBACK_SIMPLE, false);
                }
                const table = wArr.items.map(num);
                let missing = 0;
                const fd = deref(e.FontDescriptor);
                if (fd && fd.type === 'dict' && fd.entries.MissingWidth !== undefined) {
                    const mw = num(fd.entries.MissingWidth);
                    if (mw === null) approx = true;
                    else missing = mw;
                }
                return {
                    width(code) {
                        const idx = code - first;
                        if (idx < 0 || idx >= table.length) return missing * scale;
                        const v = table[idx];
                        if (v === null) { approx = true; return FALLBACK_SIMPLE; }
                        return v * scale;
                    },
                    vertical: false,
                    approximated
                };
            }

            // No /Widths: a Standard 14 font takes the shipped AFM widths.
            const base = deref(e.BaseFont);
            const baseName = (base && base.type === 'name') ? base.value : null;
            let s14 = null;
            if (baseName) {
                try { s14 = s14Mod.isStandard14(baseName) ? s14Mod.lookupStandard14(baseName) : null; }
                catch { s14 = null; }
            }
            if (!s14 || !s14.widths) return fixed(FALLBACK_SIMPLE, false);
            const symbolic = baseName === 'Symbol' || baseName === 'ZapfDingbats';
            const afm = s14.widths;
            return {
                width(code) {
                    const gname = (!symbolic && encTable) ? encTable[code] : null;
                    if (gname && gname !== '.notdef') {
                        // A named glyph the AFM table lacks is a real width miss.
                        const idx = winAnsiCodeOf(gname);
                        const v = (idx !== null && idx < afm.length) ? afm[idx] : 0;
                        if (v) return v;
                        approx = true;
                        return FALLBACK_SIMPLE;
                    }
                    // Symbolic font (built-in encoding), or a code with no
                    // glyph in the font's encoding (.notdef — already counted
                    // undecodable): the table's slot for the code itself.
                    const v = (code >= 0 && code < afm.length) ? afm[code] : 0;
                    if (v) return v;
                    if (symbolic) approx = true;
                    return FALLBACK_SIMPLE;
                },
                vertical: false,
                approximated
            };
        }

        /**
         * Build a decoder for one resolved Font dict.
         *
         * @param {object} fontDict Typed-object PDF Font dictionary.
         * @param {(ref: object) => object} resolve Indirect-ref resolver
         *   (`readResult._raw.resolve`).
         * @returns {{subtype: string, cidBytes: number,
         *   decode: (code: number) => (string|null),
         *   width: (code: number) => number, vertical: boolean,
         *   widthApproximated: () => boolean}}
         */
        function buildDecoder(fontDict, resolve) {
            const f = pdfFontMod.typeFont(fontDict);
            const cidBytes = f.subtype === 'Type0' ? 2 : 1;

            // --- ToUnicode path -------------------------------------------
            let toU = null;
            if (f.toUnicode) {
                const tu = (f.toUnicode.type === 'ref') ? resolve(f.toUnicode) : f.toUnicode;
                if (tu && tu.type === 'stream') {
                    const bytes = dispatchMod.decode(tu);
                    toU = cmapMod.parseToUnicode(latin1(bytes));
                }
            }

            // --- Encoding-table path (simple fonts only) ------------------
            let encTable = null;
            if (f.subtype !== 'Type0') {
                encTable = pdfFontEncMod.resolveEncoding(f.encoding, (name) => {
                    try { return encLookupMod.lookupEncoding(name); }
                    catch { return null; }
                });
            }

            // --- Standard CMap path (composite fonts only) ----------------
            // Predefined CMaps whose input codes are UTF-16BE code units.
            let unicodeCodes = false;
            if (f.subtype === 'Type0') {
                const enc = f.encoding;
                const encName = (enc && enc.type === 'name') ? enc.value : null;
                unicodeCodes = !!encName
                    && /^Uni(GB|CNS|JIS|KS)-(UCS2|UTF16)(-HW)?-[HV]$/.test(encName);
            }

            function decode(code) {
                if (toU) {
                    const s = toU.get(code);
                    if (typeof s === 'string' && s.length) return s;
                }
                if (encTable) {
                    const gname = encTable[code];
                    if (gname) {
                        const cps = aglMod.glyphNameToUnicode(gname);
                        if (cps && cps.length) return String.fromCodePoint(...cps);
                    }
                }
                if (unicodeCodes && code > 0 && (code < 0xD800 || code > 0xDFFF)) {
                    return String.fromCharCode(code);
                }
                return null;
            }

            const widths = buildWidths(f, fontDict, resolve, encTable);

            return {
                subtype: f.subtype, cidBytes, decode,
                width: widths.width,
                vertical: widths.vertical,
                widthApproximated: widths.approximated
            };
        }

        /**
         * Decode a show-operator string operand's bytes through a decoder,
         * splitting into 1- or 2-byte codes per the font subtype.
         *
         * @param {{cidBytes: number, decode: (code: number) => (string|null)}} decoder
         * @param {Uint8Array} strBytes Raw bytes of a `string` operand.
         * @returns {{text: string, decoded: number, undecodable: number}}
         */
        function decodeShow(decoder, strBytes) {
            const cb = decoder.cidBytes;
            let text = '';
            let decoded = 0;
            let undecodable = 0;
            for (let i = 0; i + cb <= strBytes.length; i += cb) {
                let code = 0;
                for (let k = 0; k < cb; k++) code = (code << 8) | strBytes[i + k];
                const s = decoder.decode(code);
                if (s !== null) { text += s; decoded++; }
                else { undecodable++; }
            }
            return { text, decoded, undecodable };
        }

        return { buildDecoder, decodeShow };
    }
};
