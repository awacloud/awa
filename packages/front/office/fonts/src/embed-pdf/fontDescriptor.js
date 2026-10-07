// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview embed-pdf — Build PDF FontDescriptor dictionary fields
 * from a parsed Font (the output of `fonts.read`).
 *
 * Returns a POJO suitable to be serialised as a PDF dictionary :
 *
 * ```js
 * {
 *     FontName: 'ABCDEF+Roboto-Regular',
 *     Flags:    0x000004 | 0x000020 | …,
 *     ItalicAngle: 0,
 *     Ascent:   1900,
 *     Descent: -500,
 *     CapHeight: 1456,
 *     StemV:    80,
 *     FontBBox: [xMin, yMin, xMax, yMax],
 *     FontFile2: <Uint8Array of TTF bytes>      // for TrueType subsets
 *     FontFile3: <Uint8Array of CFF bytes>      // for OpenType / CFF subsets
 * }
 * ```
 *
 * Flag bits (PDF 32000-1 §9.8.2) :
 *  - 0x000001 FixedPitch
 *  - 0x000002 Serif
 *  - 0x000004 Symbolic
 *  - 0x000008 Script
 *  - 0x000020 Nonsymbolic
 *  - 0x000040 Italic
 *  - 0x010000 AllCap
 *  - 0x020000 SmallCap
 *  - 0x040000 ForceBold
 *
 * Strict factory-only.
 *
 * @module fonts/embed-pdf/fontDescriptor
 */

import { fontErrors } from '../errors.js';

export const embedFontDescriptor = {
    name: 'embedFontDescriptor',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ContractError } = errors;
        const FLAG_FIXED_PITCH  = 0x000001;
        const FLAG_SERIF        = 0x000002;
        const FLAG_SYMBOLIC     = 0x000004;
        const FLAG_SCRIPT       = 0x000008;
        const FLAG_NONSYMBOLIC  = 0x000020;
        const FLAG_ITALIC       = 0x000040;
        const FLAG_ALL_CAP      = 0x010000;
        const FLAG_SMALL_CAP    = 0x020000;
        const FLAG_FORCE_BOLD   = 0x040000;
        const PDF_FONT_FLAG = Object.freeze({
            FIXED_PITCH: FLAG_FIXED_PITCH, SERIF: FLAG_SERIF, SYMBOLIC: FLAG_SYMBOLIC,
            SCRIPT: FLAG_SCRIPT, NONSYMBOLIC: FLAG_NONSYMBOLIC, ITALIC: FLAG_ITALIC,
            ALL_CAP: FLAG_ALL_CAP, SMALL_CAP: FLAG_SMALL_CAP, FORCE_BOLD: FLAG_FORCE_BOLD
        });
        /**
         * @param {object} font  — output of `fonts.read(bytes)`
         * @param {{ subsetBytes?: Uint8Array, isCff?: boolean, namePrefix?: string }} [opts]
         * @returns {object}
         */
        function buildFontDescriptor(font, opts) {
            if (!font) throw new ContractError('fonts/fd-no-font', 'buildFontDescriptor requires a Font');
            opts = opts || {};
            const { head, hhea, os2, post, names, flavor } = font;
            const isCff = opts.isCff ?? (flavor === 'opentype');

            let flags = 0;
            if (post && post.isFixedPitch) flags |= FLAG_FIXED_PITCH;
            if (os2 && os2.sFamilyClass != null) {
                const fam = (os2.sFamilyClass >>> 8) & 0xFF;
                if (fam === 1 || fam === 2 || fam === 3 || fam === 4 || fam === 5 || fam === 7) flags |= FLAG_SERIF;
                if (fam === 10) flags |= FLAG_SCRIPT;
                if (fam === 12) flags |= FLAG_SYMBOLIC;
            }
            if (post && post.italicAngle && post.italicAngle !== 0) flags |= FLAG_ITALIC;
            if (head && (head.macStyle & 0x02)) flags |= FLAG_ITALIC;
            if (!(flags & FLAG_SYMBOLIC)) flags |= FLAG_NONSYMBOLIC;
            if (head && (head.macStyle & 0x01)) flags |= FLAG_FORCE_BOLD;

            const xMin = head?.xMin ?? 0;
            const yMin = head?.yMin ?? 0;
            const xMax = head?.xMax ?? 0;
            const yMax = head?.yMax ?? 0;

            const fontName = (opts.namePrefix ? opts.namePrefix + '+' : '')
                           + (names?.postScriptName || names?.fullName || names?.family || 'Font');

            const out = {
                FontName: fontName,
                Flags:       flags,
                ItalicAngle: post?.italicAngle ?? 0,
                Ascent:      os2?.sTypoAscender ?? hhea?.ascender ?? 0,
                Descent:     os2?.sTypoDescender ?? hhea?.descender ?? 0,
                CapHeight:   os2?.sCapHeight ?? hhea?.ascender ?? 0,
                StemV:       80,
                FontBBox:    [xMin, yMin, xMax, yMax]
            };
            if (opts.subsetBytes) {
                if (isCff) out.FontFile3 = opts.subsetBytes;
                else       out.FontFile2 = opts.subsetBytes;
            }
            return out;
        }
        return { buildFontDescriptor, PDF_FONT_FLAG };
    }
};
