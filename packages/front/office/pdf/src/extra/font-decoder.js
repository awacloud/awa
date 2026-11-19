// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Per-font character decoder (opt-in extra `pdfFontDecoder`):
 * a Font dict's character codes to Unicode text and glyph widths.
 *
 * Moved from `@awacloud/oconv`'s pdf reader (`read/pdf/font-decoder.js`),
 * where a copy stays until oconv is rebuilt on this one; a drift test in
 * oconv pins the two equal.
 *
 * Turns a PDF Font dict into a decoder that maps a character code to its
 * Unicode text, honouring these decode paths in priority order:
 *
 *   0. **The TeX math layouts, three font families** — a simple font whose
 *      family (the base name less a subset tag) is `TeXCMMathsSymbols`,
 *      `TeXCMMathsItalic` or `TeXCMMathsExtension` names each glyph by a
 *      Computer Modern position, and its ToUnicode repeats the names (the
 *      glyph drawn as `=` is `onequarter`, mapped to U+00BC). The
 *      encoding's glyph name gives the position (`Cn` is n; another name,
 *      its StandardEncoding code) and `@awacloud/fonts`' `encodingTexMath`
 *      the text there (cmsy, cmmi, cmex), before the ToUnicode; in
 *      Symbols, six Latin-1 names come first (`onequarter` `=`, `thorn`
 *      `+`, `eth` `(`, `Thorn` `)`, `onehalf` `[`, `C138` `]`). A position
 *      with no character of its own, a name with no position, or any other
 *      font goes on to path 1.
 *   1. **ToUnicode CMap** — when the font carries a `/ToUnicode` stream, it
 *      is decoded (`pdfFilterDispatch`) and parsed (`@awacloud/fonts`'
 *      `cmapToUnicode.parseToUnicode`) into a `code → string` map. This is
 *      the authoritative path and the one that carries the real corpus.
 *      A Symbol or Wingdings font (its base name less a subset tag and a
 *      `-` or `,` suffix: `Symbol`, `SymbolMT`, `Wingdings`) whose entry is
 *      one character in 0xF020–0xF0FF, where Microsoft's symbol fonts
 *      address their glyphs, is read again: Symbol's code (less 0xF000)
 *      through `SymbolEncoding` and the AGL, Wingdings' through the pairs
 *      Word itself writes (0xA7 → U+25AA, 0xFC → U+2713). Any other code
 *      keeps its ToUnicode text. An entry of U+FFFD (the producer knew no
 *      character) goes on to path 2, and is kept when path 2 reads
 *      nothing.
 *   2. **Encoding table + AGL hop** — a simple font's `/Encoding`
 *      (`pdfFontEncoding.resolveEncoding` over `@awacloud/fonts`'
 *      `encodingLookup`) yields a 256-slot glyph-name table; each glyph
 *      name is resolved to Unicode via `@awacloud/fonts`' `encodingAgl.
 *      glyphNameToUnicode` via the AGL (Adobe Glyph List) mapping. The
 *      table's implicit base (no `/Encoding`, or a dictionary without
 *      `/BaseEncoding`) is `StandardEncoding`, except for a symbolic
 *      (`/Flags` bit 3) `Type1` / `MMType1` font that embeds its program
 *      (`/FontFile`, read by `fontType1`; `/FontFile3` `Type1C`, or
 *      `OpenType` with a `CFF ` table, read by `fontCffProgram`): there
 *      the base is the program's built-in encoding (ISO 32000-2 §9.6.6.1,
 *      Table 112), `/Differences` over it. The program is read once per
 *      stream object; one that does not read leaves `StandardEncoding`.
 *      A `Symbol` or `ZapfDingbats` font drawn without an embedded
 *      program takes its built-in encoding as that base (`SymbolEncoding`,
 *      `ZapfDingbatsEncoding`; ISO 32000-2 §9.6.2.2). A font whose family
 *      names Dingbats resolves its glyph names (`a1` to `a206`) through
 *      `encodingAgl.dingbatsNameToUnicode`, the ITC Zapf Dingbats Glyph
 *      List, before the AGL.
 *   3. **Standard (predefined) CMap, composite fonts only** — a `Type0`
 *      font has no single-byte encoding table; without a ToUnicode entry
 *      for a code, the predefined CMap its `/Encoding` names is used when
 *      that CMap's input codes ARE Unicode: the `Uni{GB,CNS,JIS,KS}-
 *      {UCS2,UTF16}[-HW]-{H,V}` family (ISO 32000-2 §9.7.5.2), whose
 *      2-byte codes are UTF-16BE code units. A BMP code unit decodes to
 *      itself; a surrogate half is counted undecodable (`decodeShow` splits
 *      Type0 strings into 2-byte codes, or by an embedded CMap's
 *      codespace). Every other predefined CMap
 *      (`Identity-H/V` — codes are CIDs, not Unicode — and the legacy
 *      RKSJ/EUC/… CMaps, whose tables are not bundled) resolves nothing
 *      here, so its codes stay undecodable (CID→GID→Unicode font-program
 *      walking is out of this decoder's scope).
 *
 * A code that neither path resolves is **counted as undecodable and
 * omitted from the text** — never silently kept as a wrong glyph and never
 * dropped without a count (a caller turns the per-run undecodable count
 * into an explicit loss entry).
 *
 * ## Glyph widths (horizontal advance, ISO 32000-2 §9.2.4 / §9.7.4.3)
 *
 * The decoder also exposes `width(code)`: the glyph's horizontal
 * displacement w0 in thousandths of text-space units, which a page walk
 * turns into each text piece's end position. Sources,
 * in order:
 *
 *   - **Simple fonts** — `/Widths` indexed from `/FirstChar`; a code outside
 *     the array takes the descriptor's `/MissingWidth` (default 0, as the
 *     spec says). A Type 3 font's widths are scaled by its `/FontMatrix`.
 *   - **Composite fonts** — the descendant CIDFont's `/W` array (both forms,
 *     `c [w1 w2 …]` and `cFirst cLast w`), `/DW` (default 1000) for CIDs it
 *     does not list, at each code's CID: the code itself under
 *     `Identity-H`/`Identity-V`, an embedded CMap stream's mapping
 *     (`@awacloud/fonts`' `cmapCid`, its `/UseCMap` parent under it; a
 *     code it maps to none shows CID 0, ISO 32000-2 §9.7.6.3). Under a
 *     predefined CMap by another name (none is bundled) the code → CID map
 *     is unknown, so `/DW` is used. A composite font's strings are split
 *     into codes by `split`: by its embedded CMap's codespace when its
 *     codes are not all 2 bytes long (§9.7.6.2), else 2 bytes at a time.
 *   - **Standard 14 fonts without `/Widths`** — the Adobe Core 14 AFM widths
 *     shipped by `@awacloud/fonts` (`standard14Lookup`), looked up by the
 *     code's glyph name (the tables are WinAnsi-indexed; `Symbol` and
 *     `ZapfDingbats` by code).
 *
 * When a width cannot be derived from the font — `/Widths` absent on a
 * non-Standard-14 font, a malformed width array or entry, a missing
 * descendant font, a `/W` table under a predefined CMap other than
 * `Identity-H` / `-V` (whose code → CID map is not bundled), a Standard 14
 * glyph absent from the AFM table — a declared fallback (500 thousandths
 * for a simple font, 1000 for a composite one) is used and
 * `widthApproximated()` turns `true`; a page walk records it as one
 * `text/width-approximated` loss per font. A malformed width structure
 * never throws.
 *
 * Composes ONLY documented public exports of `@awacloud/pdf` and `@awacloud/fonts`
 * — no internal reach. Strict factory-only fw descriptor, capture-free
 * (`fw/no-factory-capture`), worker-safe (no DOM; `TextDecoder` only).
 *
 * @module pdf/extra/font-decoder
 */

import { pdfFont } from '../font/font.js';
import { pdfFontEncoding } from '../font/encoding.js';
import { pdfFilterDispatch } from '../syntax/filters/dispatch.js';
import { cmapToUnicode } from '@awacloud/fonts';
import { encodingLookup } from '@awacloud/fonts';
import { encodingAgl } from '@awacloud/fonts';
import { standard14Lookup } from '@awacloud/fonts';
import { fontType1 } from '@awacloud/fonts';
import { fontCffProgram } from '@awacloud/fonts';
import { fontSfnt } from '@awacloud/fonts';
import { encodingTexMath } from '@awacloud/fonts';
import { cmapCid } from '@awacloud/fonts';

export const pdfFontDecoder = {
    name: 'pdfFontDecoder',
    dependencies: [
        'pdfFont', 'pdfFontEncoding', 'pdfFilterDispatch',
        'cmapToUnicode', 'encodingLookup', 'encodingAgl', 'standard14Lookup',
        'fontType1', 'fontCffProgram', 'fontSfnt', 'encodingTexMath', 'cmapCid'
    ],
    deps: [pdfFont, pdfFontEncoding, pdfFilterDispatch, cmapToUnicode, encodingLookup, encodingAgl, standard14Lookup,
        fontType1, fontCffProgram, fontSfnt, encodingTexMath, cmapCid],

    factory(pdfFontMod, pdfFontEncMod, dispatchMod, cmapMod, encLookupMod, aglMod, s14Mod, t1Mod, cffMod, sfntMod, texMathMod, cidMod) {
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
        /**
         * A composite font's code → CID map (ISO 32000-2 §9.7.5): under
         * `Identity-H` / `-V` the code itself; under an embedded CMap
         * stream, its mapping (`cmapCid`) over its parent — the stream
         * dictionary's `/UseCMap` (a stream, read the same way, at most
         * four deep; an Identity CMap by name), else the text's `usecmap`
         * when it names an Identity CMap. `{ cidOf, codespace, vertical }`
         * (`codespace` `null` when the codes are all 2 bytes), or `null`
         * when the map is unknown: a predefined CMap by another name (none
         * is bundled), a stream that does not read. Never throws.
         */
        function cidMapOf(fontDict, resolve) {
            const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
            const isIdentity = (n) => n === 'Identity-H' || n === 'Identity-V';
            let enc;
            try { enc = deref(fontDict.entries.Encoding); } catch { return null; }
            if (enc && enc.type === 'name') {
                return isIdentity(enc.value) ? { cidOf: (code) => code, codespace: null, vertical: enc.value === 'Identity-V' } : null;
            }
            if (!enc || enc.type !== 'stream') return null;
            const read = (stream, depth) => {
                const own = cidMod.parseCidCMap(latin1(dispatchMod.decode(stream)));
                const use = deref(stream.dict.entries.UseCMap);
                if (use && use.type === 'stream') {
                    const parent = depth < 3 ? read(use, depth + 1) : null;
                    return parent ? { cmap: cidMod.chain(parent.cmap, own), identity: parent.identity } : null;
                }
                const named = use && use.type === 'name' ? use.value : (use ? null : own.useCMap);
                return { cmap: own, identity: isIdentity(named) };
            };
            let r;
            try { r = read(enc, 0); } catch { return null; }
            if (!r) return null;
            const { cmap, identity } = r;
            const wMode = deref(enc.dict.entries.WMode);
            const vertical = (wMode && wMode.type === 'int' ? wMode.value : cmap.wMode) === 1;
            const ranges = cmap.codespace.length ? cmap.codespace : (identity ? [{ bytes: 2, low: 0, high: 0xFFFF }] : []);
            if (!ranges.length) return null;
            return {
                cidOf: (code, bytes = 2) => {
                    const cid = cidMod.cidOf(cmap, code, bytes);
                    return cid !== null ? cid : (identity && bytes === 2 ? code : null);
                },
                codespace: ranges.every((c) => c.bytes === 2) ? null : ranges,
                vertical
            };
        }

        /**
         * Split a string's bytes into codes by a codespace (ISO 32000-2
         * §9.7.6.2): at each position, the shortest length at which every
         * byte lies within one range's bytes; with no match, the shortest
         * range's length. `[[code, length], …]`.
         */
        function splitByCodespace(ranges, bytes) {
            const lengths = [...new Set(ranges.map((r) => r.bytes))].sort((a, b) => a - b);
            const inRange = (r, i) => {
                for (let k = 0; k < r.bytes; k++) {
                    const shift = 8 * (r.bytes - 1 - k);
                    const lo = (r.low >>> shift) & 0xFF, hi = (r.high >>> shift) & 0xFF;
                    if (bytes[i + k] < lo || bytes[i + k] > hi) return false;
                }
                return true;
            };
            const out = [];
            let i = 0;
            while (i < bytes.length) {
                let n = 0;
                for (const len of lengths) {
                    if (i + len > bytes.length) break;
                    if (ranges.some((r) => r.bytes === len && inRange(r, i))) { n = len; break; }
                }
                if (!n) n = Math.min(lengths[0], bytes.length - i);
                let code = 0;
                for (let k = 0; k < n; k++) code = (code << 8) | bytes[i + k];
                out.push([code, n]);
                i += n;
            }
            return out;
        }

        function buildWidths(f, fontDict, resolve, encTable, cidMap) {
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
                const vertical = cidMap ? cidMap.vertical : (!!encName && /-V$/.test(encName));
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
                if (!cidMap && table.size > 0) {
                    // Under a predefined CMap other than Identity, code → CID
                    // is unknown here.
                    approx = true;
                    return { width: () => dw, vertical, approximated };
                }
                // A code the CMap maps to no CID shows CID 0 (§9.7.6.3).
                const toCid = cidMap ? cidMap.cidOf : (code) => code;
                return {
                    width(code, bytes) {
                        const cid = toCid(code, bytes);
                        const v = table.get(cid === null ? 0 : cid);
                        return v === undefined ? dw : v;
                    },
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
        /**
         * A font's `/Encoding` with its indirect parts resolved: the entry
         * itself and, inside an encoding dictionary, `/Differences` and
         * `/BaseEncoding` (pdfLaTeX writes `/Encoding n 0 R` on every Type 1
         * font; `pdfFontEncoding.resolveEncoding` takes direct values only).
         */
        function directEncoding(entry, resolve) {
            const e = entry && entry.type === 'ref' ? resolve(entry) : entry;
            if (!e || e.type !== 'dict') return e;
            const { Differences, BaseEncoding } = e.entries;
            const indirect = (v) => v && v.type === 'ref';
            if (!indirect(Differences) && !indirect(BaseEncoding)) return e;
            const entries = { ...e.entries };
            if (indirect(Differences)) entries.Differences = resolve(Differences);
            if (indirect(BaseEncoding)) entries.BaseEncoding = resolve(BaseEncoding);
            return { ...e, entries };
        }

        // A bold weight in a font name (after a subset tag `ABCDEF+`); URW's
        // own suffix too, `-Medi` / `-MediItal` (its Nimbus Roman No9 L bold).
        const BOLD_NAME = /(bold|black|heavy|semibold|demibold|demi\b|extrabold|ultrabold|-Medi(?:Ital)?$)/i;
        // `/Flags` ForceBold (ISO 32000-2 Table 121, bit 19).
        const FORCE_BOLD = 1 << 18;

        /**
         * Whether a font is bold: its name (the descendant's too for a
         * Type 0 font) names a bold weight, or its font descriptor says so
         * (`/FontWeight` >= 600, or the ForceBold flag).
         */
        function isBold(fontDict, resolve) {
            const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
            const dicts = [fontDict];
            const desc = deref(fontDict.entries.DescendantFonts);
            if (desc && desc.type === 'array' && desc.items.length) {
                const d0 = deref(desc.items[0]);
                if (d0 && d0.type === 'dict') dicts.push(d0);
            }
            for (const d of dicts) {
                const base = deref(d.entries.BaseFont);
                if (base && base.type === 'name' && BOLD_NAME.test(base.value.replace(/^[A-Z]{6}\+/, ''))) return true;
                const fd = deref(d.entries.FontDescriptor);
                if (fd && fd.type === 'dict') {
                    const fw = deref(fd.entries.FontWeight);
                    if (fw && (fw.type === 'int' || fw.type === 'real') && fw.value >= 600) return true;
                    const fl = deref(fd.entries.Flags);
                    if (fl && fl.type === 'int' && (fl.value & FORCE_BOLD) !== 0) return true;
                }
            }
            return false;
        }

        // `/Flags` Symbolic (ISO 32000-2 Table 121, bit 3).
        const SYMBOLIC = 1 << 2;
        /** Built-in encodings, by the resolved program stream (one read each). */
        const builtInCache = new WeakMap();

        /**
         * The built-in encoding of a symbolic simple font's embedded Type 1
         * or CFF program (module doc, decode path 2), or `null`: not
         * symbolic, no such program, a CID-keyed CFF, or a program that does
         * not read. Never throws.
         */
        function builtInEncoding(fontDict, resolve) {
            const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
            const fd = deref(fontDict.entries.FontDescriptor);
            if (!fd || fd.type !== 'dict') return null;
            const flags = deref(fd.entries.Flags);
            if (!flags || flags.type !== 'int' || (flags.value & SYMBOLIC) === 0) return null;
            const ff = deref(fd.entries.FontFile);
            const type1 = !!(ff && ff.type === 'stream');
            const s = type1 ? ff : deref(fd.entries.FontFile3);
            if (!s || s.type !== 'stream') return null;
            if (builtInCache.has(s)) return builtInCache.get(s);
            let table = null;
            try {
                const se = (s.dict && s.dict.entries) || {};
                if (type1) {
                    const len = (v) => { const d = deref(v); return d && d.type === 'int' ? d.value : undefined; };
                    table = t1Mod.readType1(dispatchMod.decode(s), { length1: len(se.Length1), length2: len(se.Length2) }).encoding;
                } else {
                    const kind = deref(se.Subtype);
                    let bytes = null;
                    if (kind && kind.type === 'name' && kind.value === 'Type1C') bytes = dispatchMod.decode(s);
                    else if (kind && kind.type === 'name' && kind.value === 'OpenType') {
                        const cff = sfntMod.parseSfnt(dispatchMod.decode(s)).tables['CFF '];
                        bytes = cff ? cff.bytes : null;
                    }
                    if (bytes) table = cffMod.readCff(bytes).encoding;
                }
            } catch {
                table = null;
            }
            builtInCache.set(s, table || null);
            return table || null;
        }

        // Microsoft's symbol fonts address their glyphs at 0xF020..0xF0FF
        // (the code plus 0xF000), and a ToUnicode often maps a glyph there:
        // a private-use character, not the bullet or sign drawn.
        const PUA_FIRST = 0xF020;
        const PUA_LAST = 0xF0FF;
        // Wingdings codes whose character is attested: Word maps the same
        // glyph to the private-use code in one file and to this character in
        // another.
        const WINGDINGS = new Map([[0xA7, 0x25AA], [0xFC, 0x2713]]);
        /** `SymbolEncoding`, resolved on first use (`null`: unavailable). */
        let symbolTable;

        /**
         * The remap of a ToUnicode private-use character for a Symbol or
         * Wingdings font (decode path 1): a function from the font code
         * (U+F0xx less 0xF000) to its text, or `null` for any other font.
         * Symbol reads the code through `SymbolEncoding` and the AGL;
         * Wingdings through `WINGDINGS`. A code neither knows keeps the
         * private-use character.
         */
        function symbolPuaMap(fontDict, resolve) {
            const v = fontDict.entries.BaseFont;
            const base = v && v.type === 'ref' ? resolve(v) : v;
            if (!base || base.type !== 'name') return null;
            const family = base.value.replace(/^[A-Z]{6}\+/, '').replace(/[-,].*$/, '');
            if (family === 'Symbol' || family === 'SymbolMT') {
                return (code) => {
                    if (symbolTable === undefined) {
                        try { symbolTable = encLookupMod.lookupEncoding('SymbolEncoding'); }
                        catch { symbolTable = null; }
                    }
                    const name = symbolTable ? symbolTable[code] : null;
                    const cps = name && name !== '.notdef' ? aglMod.glyphNameToUnicode(name) : null;
                    return cps && cps.length ? String.fromCodePoint(...cps) : null;
                };
            }
            if (family === 'Wingdings') {
                return (code) => (WINGDINGS.has(code) ? String.fromCodePoint(WINGDINGS.get(code)) : null);
            }
            return null;
        }

        /**
         * The built-in encoding of a Standard 14 `Symbol` or `ZapfDingbats`
         * font drawn without an embedded program (`SymbolEncoding`,
         * `ZapfDingbatsEncoding`; ISO 32000-2 §9.6.2.2), or `null`. Never
         * throws.
         */
        function standardSymbolEncoding(fontDict, resolve) {
            const deref = (v) => (v && v.type === 'ref' ? resolve(v) : v);
            const base = deref(fontDict.entries.BaseFont);
            const name = base && base.type === 'name' ? base.value : null;
            if (name !== 'Symbol' && name !== 'ZapfDingbats') return null;
            const fd = deref(fontDict.entries.FontDescriptor);
            const e = fd && fd.type === 'dict' ? fd.entries : {};
            if (e.FontFile || e.FontFile2 || e.FontFile3) return null;
            try { return encLookupMod.lookupEncoding(`${name}Encoding`); }
            catch { return null; }
        }

        /**
         * Whether a font is a Zapf Dingbats font: its family (the base name
         * less a subset tag and a `-` or `,` suffix) names Dingbats. Its
         * glyph names (`a1` to `a206`) read through the ITC Zapf Dingbats
         * Glyph List.
         */
        function isDingbats(fontDict, resolve) {
            const v = fontDict.entries.BaseFont;
            const base = v && v.type === 'ref' ? resolve(v) : v;
            if (!base || base.type !== 'name') return false;
            return /dingbats/i.test(base.value.replace(/^[A-Z]{6}\+/, '').replace(/[-,].*$/, ''));
        }

        // Decode path 0: the TeXCMMaths families and their Computer Modern
        // layout; Symbols' six Latin-1 names, measured on the Springer
        // files that carry them.
        const TEX_MATH = { TeXCMMathsSymbols: 'OMS', TeXCMMathsItalic: 'OML', TeXCMMathsExtension: 'OMX' };
        const TEX_SYMBOLS_LATIN = { onequarter: '=', thorn: '+', eth: '(', Thorn: ')', onehalf: '[', C138: ']' };
        /** Lazily-built glyph name → StandardEncoding code map (first code wins). */
        let standardIndex = null;
        function standardCodeOf(glyphName) {
            if (!standardIndex) {
                standardIndex = new Map();
                let table;
                try { table = encLookupMod.lookupEncoding('StandardEncoding'); }
                catch { table = null; }
                for (let i = 0; table && i < 256 && i < table.length; i++) {
                    if (table[i] && table[i] !== '.notdef' && !standardIndex.has(table[i])) standardIndex.set(table[i], i);
                }
            }
            const c = standardIndex.get(glyphName);
            return c === undefined ? -1 : c;
        }

        /**
         * Path 0's reading for a font (module doc): a function from a glyph
         * name to its text, or `null` (another family, or no text there),
         * or `null` itself for a font outside the three families.
         */
        function texMathText(fontDict, resolve) {
            const v = fontDict.entries.BaseFont;
            const base = v && v.type === 'ref' ? resolve(v) : v;
            if (!base || base.type !== 'name') return null;
            const family = base.value.replace(/^[A-Z]{6}\+/, '');
            const layout = Object.hasOwn(TEX_MATH, family) ? TEX_MATH[family] : null;
            if (!layout) return null;
            return (glyphName) => {
                if (layout === 'OMS' && Object.hasOwn(TEX_SYMBOLS_LATIN, glyphName)) return TEX_SYMBOLS_LATIN[glyphName];
                const m = /^C(\d{1,3})$/.exec(glyphName);
                return texMathMod.text(layout, m ? Number(m[1]) : standardCodeOf(glyphName));
            };
        }

        function buildDecoder(fontDict, resolve) {
            const f = pdfFontMod.typeFont(fontDict);
            const cidBytes = f.subtype === 'Type0' ? 2 : 1;
            const cidMap = f.subtype === 'Type0' ? cidMapOf(fontDict, resolve) : null;

            // --- ToUnicode path -------------------------------------------
            let toU = null;
            if (f.toUnicode) {
                const tu = (f.toUnicode.type === 'ref') ? resolve(f.toUnicode) : f.toUnicode;
                if (tu && tu.type === 'stream') {
                    const bytes = dispatchMod.decode(tu);
                    toU = cmapMod.parseToUnicode(latin1(bytes));
                }
            }
            const puaMap = toU ? symbolPuaMap(fontDict, resolve) : null;
            const nameToUnicode = isDingbats(fontDict, resolve)
                ? aglMod.dingbatsNameToUnicode : aglMod.glyphNameToUnicode;

            // --- Encoding-table path (simple fonts only) ------------------
            let encTable = null;
            if (f.subtype !== 'Type0') {
                const entry = directEncoding(f.encoding, resolve);
                // No base named: `resolveEncoding` asks for StandardEncoding,
                // which a symbolic font's embedded program replaces.
                const noBase = !entry || (entry.type === 'dict' && !entry.entries.BaseEncoding);
                const builtIn = noBase && (f.subtype === 'Type1' || f.subtype === 'MMType1')
                    ? (builtInEncoding(fontDict, resolve) || standardSymbolEncoding(fontDict, resolve)) : null;
                encTable = pdfFontEncMod.resolveEncoding(entry, (name) => {
                    if (builtIn && name === 'StandardEncoding') return builtIn;
                    try { return encLookupMod.lookupEncoding(name); }
                    catch { return null; }
                });
            }

            // --- TeX math layout path (three families, before ToUnicode) --
            const texMath = encTable ? texMathText(fontDict, resolve) : null;

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
                if (texMath && encTable[code]) {
                    const s = texMath(encTable[code]);
                    if (s) return s;
                }
                // A ToUnicode entry of U+FFFD says the producer knew no
                // character: the encoding's glyph name is read instead, and
                // U+FFFD kept only when it reads nothing either.
                let replacement = null;
                if (toU) {
                    const s = toU.get(code);
                    if (typeof s === 'string' && s.length) {
                        const u = s.length === 1 ? s.charCodeAt(0) : 0;
                        if (puaMap && u >= PUA_FIRST && u <= PUA_LAST) {
                            const m = puaMap(u - 0xF000);
                            if (m) return m;
                        }
                        if (s !== '\uFFFD') return s;
                        replacement = s;
                    }
                }
                if (encTable) {
                    const gname = encTable[code];
                    if (gname) {
                        const cps = nameToUnicode(gname);
                        if (cps && cps.length) return String.fromCodePoint(...cps);
                    }
                }
                if (replacement) return replacement;
                if (unicodeCodes && code > 0 && (code < 0xD800 || code > 0xDFFF)) {
                    return String.fromCharCode(code);
                }
                return null;
            }

            const widths = buildWidths(f, fontDict, resolve, encTable, cidMap);
            // A composite font's codes are read by its CMap's codespace when
            // its codes are not all 2 bytes long; else `cidBytes` at a time.
            const codespace = cidMap && cidMap.codespace;
            function split(strBytes) {
                if (codespace) return splitByCodespace(codespace, strBytes);
                const out = [];
                for (let i = 0; i + cidBytes <= strBytes.length; i += cidBytes) {
                    let code = 0;
                    for (let k = 0; k < cidBytes; k++) code = (code << 8) | strBytes[i + k];
                    out.push([code, cidBytes]);
                }
                return out;
            }

            return {
                subtype: f.subtype, cidBytes, decode, split,
                width: widths.width,
                vertical: widths.vertical,
                widthApproximated: widths.approximated,
                bold: isBold(fontDict, resolve)
            };
        }

        /**
         * Decode a show-operator string operand's bytes through a decoder,
         * splitting them by its `split` (a composite font's CMap codespace),
         * else into 1- or 2-byte codes per the font subtype.
         *
         * @param {{cidBytes: number, decode: (code: number) => (string|null), split?: (bytes: Uint8Array) => number[][]}} decoder
         * @param {Uint8Array} strBytes Raw bytes of a `string` operand.
         * @returns {{text: string, decoded: number, undecodable: number}}
         */
        function decodeShow(decoder, strBytes) {
            let text = '';
            let decoded = 0;
            let undecodable = 0;
            const codes = typeof decoder.split === 'function' ? decoder.split(strBytes) : null;
            if (codes) {
                for (const [code] of codes) {
                    const s = decoder.decode(code);
                    if (s !== null) { text += s; decoded++; }
                    else { undecodable++; }
                }
                return { text, decoded, undecodable };
            }
            const cb = decoder.cidBytes;
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
