// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Button field typing per ISO 32000-2:2020 §12.7.5.2.
 *
 * @module pdf/form/button
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfButtonField = {
    name: 'pdfButtonField',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const FLAG_NO_TOGGLE_OFF    = 1 << 14;
        const FLAG_RADIO            = 1 << 15;
        const FLAG_PUSHBUTTON       = 1 << 16;
        const FLAG_RADIOS_IN_UNISON = 1 << 25;

        const KNOWN = new Set([
            'Type', 'FT', 'Parent', 'Kids', 'T', 'TU', 'TM', 'Ff', 'V', 'DV',
            'AA', 'DA', 'Q', 'Opt', 'AP', 'AS'
        ]);

        function intOr(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function toOpt(v) {
            if (!v) return [];
            if (v.type !== 'array') {
                throw new ParseError('pdf/form/btn/bad-opt',
                    '/Opt must be an array when present',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (isType(it, 'string'))     out.push(it.value);
                else if (isType(it, 'name'))  out.push(it.value);
                else {
                    throw new ParseError('pdf/form/btn/bad-opt-entry',
                        '/Opt entries must be strings or names',
                        { context: { kind: it && it.type } });
                }
            }
            return out;
        }

        function typeButtonField(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/btn/not-dict',
                    'button field must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.FT && (e.FT.type !== 'name' || e.FT.value !== 'Btn')) {
                throw new ParseError('pdf/form/btn/bad-ft',
                    '/FT must be /Btn for a button field',
                    { context: { actual: e.FT.value } });
            }

            const flags = intOr(e.Ff, 0);
            const isPush  = (flags & FLAG_PUSHBUTTON) !== 0;
            const isRadio = (flags & FLAG_RADIO)      !== 0;
            let kind;
            if (isPush)       kind = 'pushbutton';
            else if (isRadio) kind = 'radio';
            else              kind = 'checkbox';

            const out = {
                ft: 'Btn',
                flags,
                kind,
                noToggleToOff:  (flags & FLAG_NO_TOGGLE_OFF)    !== 0,
                radiosInUnison: (flags & FLAG_RADIOS_IN_UNISON) !== 0,
                v:   isType(e.V,  'name')   ? e.V.value  : null,
                dv:  isType(e.DV, 'name')   ? e.DV.value : null,
                opt: toOpt(e.Opt),
                t:   isType(e.T,  'string') ? e.T.value  : null,
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeButtonField };
    }
};
