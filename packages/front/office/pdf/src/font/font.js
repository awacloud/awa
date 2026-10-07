// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Font dict typing per ISO 32000-2:2020 §9.6 / §9.7.
 *
 * This module **does not parse font files**. All actual font byte
 * parsing (Type 1 PFB/PFA, TrueType/OpenType, CFF, CIDFont) is
 * delegated to `@awacloud/fonts`. Here we only type the Font dict itself
 * (`/Type /Font`, `/Subtype`, `/BaseFont`, `/Encoding`, ...).
 *
 * @module pdf/font/font
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfFont = {
    name: 'pdfFont',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const KNOWN_SUBTYPES = new Set([
            'Type0', 'Type1', 'MMType1', 'Type3', 'TrueType',
            'CIDFontType0', 'CIDFontType2'
        ]);

        function typeFont(dict, opts) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/font/not-dict',
                    'Font must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Font')) {
                throw new ParseError('pdf/font/bad-type',
                    '/Type must be /Font when present',
                    { context: { actual: e.Type.value } });
            }
            if (!e.Subtype || e.Subtype.type !== 'name') {
                throw new ParseError('pdf/font/missing-subtype',
                    'Font dict missing required /Subtype');
            }
            if (!KNOWN_SUBTYPES.has(e.Subtype.value)) {
                throw new ParseError('pdf/font/unknown-subtype',
                    `unknown font subtype "${e.Subtype.value}"`,
                    { context: { subtype: e.Subtype.value } });
            }
            const baseFont = e.BaseFont && e.BaseFont.type === 'name'
                ? e.BaseFont.value : null;

            const out = {
                subtype:    e.Subtype.value,
                baseFont,
                encoding:   e.Encoding   || null,
                firstChar:  e.FirstChar  && e.FirstChar.type === 'int' ? e.FirstChar.value : null,
                lastChar:   e.LastChar   && e.LastChar.type  === 'int' ? e.LastChar.value  : null,
                widths:     e.Widths && e.Widths.type === 'array'
                    ? e.Widths.items.filter(it => it.type === 'int' || it.type === 'real')
                                    .map(it => it.value)
                    : null,
                fontDescriptor: e.FontDescriptor || null,
                toUnicode:      e.ToUnicode      || null,
                descendantFonts: e.DescendantFonts && e.DescendantFonts.type === 'array'
                    ? e.DescendantFonts.items.slice() : null,
                standard14:     null,
                raw:            dict
            };

            if ((out.subtype === 'Type1' || out.subtype === 'MMType1')
                    && !out.fontDescriptor
                    && opts && opts.standard14
                    && baseFont
                    && opts.standard14.isStandard14(baseFont)) {
                out.standard14 = opts.standard14.lookupStandard14(baseFont);
            }

            return out;
        }

        function resolveDescendant(type0Font, resolveRef) {
            if (!type0Font || type0Font.subtype !== 'Type0') return null;
            const descs = type0Font.descendantFonts;
            if (!descs || descs.length === 0) return null;
            const d = descs[0];
            const dict = d.type === 'ref' ? resolveRef(d) : d;
            return typeFont(dict);
        }

        return { typeFont, resolveDescendant };
    }
};
