// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Text field typing per ISO 32000-2:2020 §12.7.5.3.
 *
 * @module pdf/form/text
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfTextField = {
    name: 'pdfTextField',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const F_MULTILINE         = 1 << 12;
        const F_PASSWORD          = 1 << 13;
        const F_FILE_SELECT       = 1 << 20;
        const F_DO_NOT_SPELLCHECK = 1 << 22;
        const F_DO_NOT_SCROLL     = 1 << 23;
        const F_COMB              = 1 << 24;
        const F_RICH_TEXT         = 1 << 25;

        const KNOWN = new Set([
            'Type', 'FT', 'Parent', 'Kids', 'T', 'TU', 'TM', 'Ff', 'V', 'DV',
            'AA', 'DA', 'Q', 'MaxLen', 'AP', 'RV'
        ]);

        function intOr(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function toTextValue(v) {
            if (!v) return null;
            if (v.type === 'string') return v.value;
            if (v.type === 'stream' && v.raw)  return v.raw;
            return null;
        }

        function typeTextField(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/tx/not-dict',
                    'text field must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.FT && (e.FT.type !== 'name' || e.FT.value !== 'Tx')) {
                throw new ParseError('pdf/form/tx/bad-ft',
                    '/FT must be /Tx for a text field',
                    { context: { actual: e.FT.value } });
            }

            const flags = intOr(e.Ff, 0);
            const out = {
                ft: 'Tx',
                flags,
                multiline:        (flags & F_MULTILINE)         !== 0,
                password:         (flags & F_PASSWORD)          !== 0,
                fileSelect:       (flags & F_FILE_SELECT)       !== 0,
                doNotSpellCheck:  (flags & F_DO_NOT_SPELLCHECK) !== 0,
                doNotScroll:      (flags & F_DO_NOT_SCROLL)     !== 0,
                comb:             (flags & F_COMB)              !== 0,
                richText:         (flags & F_RICH_TEXT)         !== 0,
                v:      toTextValue(e.V),
                dv:     toTextValue(e.DV),
                maxLen: e.MaxLen ? intOr(e.MaxLen, null) : null,
                da:     isType(e.DA, 'string') ? e.DA.value : null,
                q:      intOr(e.Q, 0),
                t:      isType(e.T, 'string')  ? e.T.value  : null,
                raw:    dict,
                _extras: {}
            };

            if (out.comb && out.maxLen == null) {
                throw new ParseError('pdf/form/tx/comb-without-maxlen',
                    'Comb flag set but /MaxLen is missing',
                    { context: { flags } });
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeTextField };
    }
};
