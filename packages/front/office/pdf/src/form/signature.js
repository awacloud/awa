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
            // Field-dictionary entries (ISO 32000-2 Table 226) the record
            // had left out, each only when present (a PDF null is the
            // entry's absence): a string by its bytes, the rest as read.
            const has = (x) => !!x && x.type !== 'null';
            if (has(e.Parent)) out.parent = e.Parent;
            if (has(e.Kids))   out.kids   = e.Kids;
            if (isType(e.TU, 'string')) out.tu = e.TU.value;
            if (isType(e.TM, 'string')) out.tm = e.TM.value;
            if (has(e.AA))     out.aa     = e.AA;
            if (isType(e.DA, 'string')) out.da = e.DA.value;
            if (isType(e.Q, 'int'))     out.q  = e.Q.value;
            if (has(e.DV)) out.dv = e.DV;

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeSignatureField };
    }
};
