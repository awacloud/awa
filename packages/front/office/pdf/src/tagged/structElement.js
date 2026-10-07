// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Structure Element typing per ISO 32000-2:2020 §14.7.3.
 *
 * A `/Type /StructElem` dict represents a node in the logical structure
 * tree. Heterogeneous `/K` is normalized to
 * `[{ kind: 'elem'|'mcid'|'mcr'|'objr', ... }]`.
 *
 * @module pdf/tagged/structElement
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfStructElement = {
    name: 'pdfStructElement',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Type', 'S', 'P', 'ID', 'Pg', 'K', 'A', 'C', 'R', 'T', 'Lang',
            'Alt', 'E', 'ActualText', 'AF', 'NS', 'PhoneticAlphabet', 'Phoneme'
        ]);

        function typeStructElement(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/tagged/struct-elem/not-dict',
                    'StructElem must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'StructElem')) {
                throw new ParseError('pdf/tagged/struct-elem/bad-type',
                    '/Type entry must be /StructElem',
                    { context: { actual: e.Type.value } });
            }
            if (!e.S || e.S.type !== 'name') {
                throw new ParseError('pdf/tagged/struct-elem/missing-s',
                    'StructElem missing required /S (structure type) name',
                    { context: { type: e.S && e.S.type } });
            }

            const out = {
                s:    e.S.value,
                raw:  dict,
                _extras: {}
            };

            if (e.P  && e.P.type === 'ref')    out.p  = e.P;
            if (e.Pg && e.Pg.type === 'ref')   out.pg = e.Pg;
            if (e.ID && e.ID.type === 'string') out.id = e.ID.value;
            if (e.A)                            out.a  = e.A;
            if (e.C && (e.C.type === 'name' || e.C.type === 'array')) out.c = e.C;
            if (e.R && (e.R.type === 'int' || e.R.type === 'real'))   out.r = e.R.value | 0;
            if (e.T          && e.T.type === 'string')         out.t          = e.T.value;
            if (e.Lang       && e.Lang.type === 'string')      out.lang       = e.Lang.value;
            if (e.Alt        && e.Alt.type === 'string')       out.alt        = e.Alt.value;
            if (e.E          && e.E.type === 'string')         out.e          = e.E.value;
            if (e.ActualText && e.ActualText.type === 'string') out.actualText = e.ActualText.value;
            if (e.AF) out.af = e.AF;
            if (e.NS && e.NS.type === 'ref') out.ns = e.NS;
            if (e.PhoneticAlphabet && e.PhoneticAlphabet.type === 'name') {
                out.phoneticAlphabet = e.PhoneticAlphabet.value;
            }
            if (e.Phoneme && e.Phoneme.type === 'string') out.phoneme = e.Phoneme.value;

            if (e.K !== undefined) out.k = readKids(e.K);

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }

            return out;
        }

        function readKids(k) {
            if (!k) return [];
            if (k.type === 'array') {
                const out = [];
                for (const item of k.items) out.push(classifyKid(item));
                return out;
            }
            return [classifyKid(k)];
        }

        function classifyKid(item) {
            if (!item || !item.type) {
                throw new ParseError('pdf/tagged/struct-elem/bad-kid',
                    'StructElem /K entry is malformed',
                    { context: { item } });
            }
            if (item.type === 'int') return { kind: 'mcid', mcid: item.value | 0 };
            if (item.type === 'ref') return { kind: 'elem', ref: item };
            if (item.type === 'dict') {
                const t = item.entries.Type;
                const tn = t && t.type === 'name' ? t.value : null;
                if (tn === 'MCR') {
                    return {
                        kind: 'mcr',
                        pg:   item.entries.Pg,
                        stm:  item.entries.Stm,
                        stmOwn: item.entries.StmOwn,
                        mcid: (item.entries.MCID && item.entries.MCID.type === 'int')
                            ? item.entries.MCID.value | 0 : null,
                        raw:  item
                    };
                }
                if (tn === 'OBJR') {
                    return {
                        kind: 'objr',
                        pg:   item.entries.Pg,
                        obj:  item.entries.Obj,
                        raw:  item
                    };
                }
                if (item.entries.MCID && item.entries.MCID.type === 'int') {
                    return { kind: 'mcr', mcid: item.entries.MCID.value | 0, raw: item };
                }
            }
            throw new ParseError('pdf/tagged/struct-elem/bad-kid',
                'StructElem /K entry must be ref, int, MCR-dict, or OBJR-dict',
                { context: { kind: item.type } });
        }

        return { typeStructElement };
    }
};
