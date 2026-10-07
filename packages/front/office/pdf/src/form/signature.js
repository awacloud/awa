// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Signature field typing per ISO 32000-2:2020 §12.7.5.5.
 *
 * @module pdf/form/signature
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfSignatureField = {
    name: 'pdfSignatureField',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const KNOWN = new Set([
            'Type', 'FT', 'Parent', 'Kids', 'T', 'TU', 'TM', 'Ff', 'V', 'DV',
            'AA', 'DA', 'Q', 'Lock', 'SV', 'AP'
        ]);

        function intOr(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function typeSignatureField(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/sig/not-dict',
                    'signature field must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.FT && (e.FT.type !== 'name' || e.FT.value !== 'Sig')) {
                throw new ParseError('pdf/form/sig/bad-ft',
                    '/FT must be /Sig for a signature field',
                    { context: { actual: e.FT.value } });
            }

            let v = null;
            if (e.V) {
                if (e.V.type === 'ref' || e.V.type === 'dict') v = e.V;
                else {
                    throw new ParseError('pdf/form/sig/bad-v',
                        '/V must be a dict or indirect reference',
                        { context: { kind: e.V.type } });
                }
            }

            let lock = null;
            if (e.Lock) {
                if (e.Lock.type === 'ref' || e.Lock.type === 'dict') lock = e.Lock;
                else {
                    throw new ParseError('pdf/form/sig/bad-lock',
                        '/Lock must be a dict or indirect reference',
                        { context: { kind: e.Lock.type } });
                }
            }

            let sv = null;
            if (e.SV) {
                if (e.SV.type === 'ref' || e.SV.type === 'dict') sv = e.SV;
                else {
                    throw new ParseError('pdf/form/sig/bad-sv',
                        '/SV must be a dict or indirect reference',
                        { context: { kind: e.SV.type } });
                }
            }

            const out = {
                ft: 'Sig',
                flags:  intOr(e.Ff, 0),
                v,
                lock,
                sv,
                t:      isType(e.T, 'string') ? e.T.value : null,
                signed: v !== null,
                raw:    dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeSignatureField };
    }
};
