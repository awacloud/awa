// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AcroForm dict typing per ISO 32000-2:2020 §12.7.3.
 *
 * @module pdf/form/acroform
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAcroForm = {
    name: 'pdfAcroForm',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const KNOWN = new Set([
            'Fields', 'NeedAppearances', 'SigFlags', 'CO', 'DR', 'DA', 'Q', 'XFA'
        ]);

        function toBool(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'bool') return dflt;
            return !!v.value;
        }

        function toInt(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function toRefArray(v, errCode) {
            if (!v) return [];
            if (v.type !== 'array') {
                throw new ParseError(errCode,
                    'expected an array of indirect references',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (!it || it.type !== 'ref') {
                    throw new ParseError(errCode,
                        'array entry must be an indirect reference',
                        { context: { kind: it && it.type } });
                }
                out.push({ num: it.num, gen: it.gen });
            }
            return out;
        }

        function typeAcroForm(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/acroform/not-dict',
                    'AcroForm must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            const fields = toRefArray(e.Fields, 'pdf/form/acroform/bad-fields');

            const out = {
                fields,
                needAppearances: toBool(e.NeedAppearances, false),
                sigFlags: toInt(e.SigFlags, 0),
                co: e.CO ? toRefArray(e.CO, 'pdf/form/acroform/bad-co') : [],
                dr: isType(e.DR, 'dict') ? e.DR : null,
                da: isType(e.DA, 'string') ? e.DA.value : null,
                q:  toInt(e.Q, 0),
                raw: dict,
                _extras: {}
            };

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            if (e.XFA) out._extras.XFA = e.XFA;

            return out;
        }

        return { typeAcroForm };
    }
};
