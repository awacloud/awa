// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Choice field typing per ISO 32000-2:2020 §12.7.5.4.
 *
 * @module pdf/form/choice
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfChoiceField = {
    name: 'pdfChoiceField',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const F_COMBO              = 1 << 17;
        const F_EDIT               = 1 << 18;
        const F_SORT               = 1 << 19;
        const F_MULTI_SELECT       = 1 << 21;
        const F_DO_NOT_SPELLCHECK  = 1 << 22;
        const F_COMMIT_ON_SEL_CHG  = 1 << 26;

        const KNOWN = new Set([
            'Type', 'FT', 'Parent', 'Kids', 'T', 'TU', 'TM', 'Ff', 'V', 'DV',
            'AA', 'DA', 'Q', 'Opt', 'TI', 'I', 'AP'
        ]);

        function intOr(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function isStringy(v) { return !!(v && (v.type === 'string' || v.type === 'name')); }

        function toOpt(v) {
            if (!v) return [];
            if (v.type !== 'array') {
                throw new ParseError('pdf/form/ch/bad-opt',
                    '/Opt must be an array when present',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (isType(it, 'string')) {
                    out.push({ export: it.value, display: it.value });
                } else if (isType(it, 'name')) {
                    out.push({ export: it.value, display: it.value });
                } else if (isType(it, 'array')) {
                    if (it.items.length !== 2) {
                        throw new ParseError('pdf/form/ch/bad-opt-entry',
                            '/Opt sub-array must have exactly two elements',
                            { context: { len: it.items.length } });
                    }
                    const a = it.items[0], b = it.items[1];
                    if (!isStringy(a) || !isStringy(b)) {
                        throw new ParseError('pdf/form/ch/bad-opt-entry',
                            '/Opt sub-array elements must be strings',
                            { context: { kinds: [a && a.type, b && b.type] } });
                    }
                    out.push({ export: a.value, display: b.value });
                } else {
                    throw new ParseError('pdf/form/ch/bad-opt-entry',
                        '/Opt entries must be strings or [export, display] arrays',
                        { context: { kind: it && it.type } });
                }
            }
            return out;
        }

        function toV(v) {
            if (!v) return null;
            if (isStringy(v)) return [v.value];
            if (v.type === 'array') {
                const out = [];
                for (const it of v.items) {
                    if (!isStringy(it)) {
                        throw new ParseError('pdf/form/ch/bad-v',
                            '/V array entries must be strings',
                            { context: { kind: it && it.type } });
                    }
                    out.push(it.value);
                }
                return out;
            }
            return null;
        }

        function toIndices(v) {
            if (!v || v.type !== 'array') return [];
            const out = [];
            for (const it of v.items) {
                if (it && (it.type === 'int' || it.type === 'real')) out.push(it.value | 0);
            }
            return out;
        }

        function typeChoiceField(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/ch/not-dict',
                    'choice field must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.FT && (e.FT.type !== 'name' || e.FT.value !== 'Ch')) {
                throw new ParseError('pdf/form/ch/bad-ft',
                    '/FT must be /Ch for a choice field',
                    { context: { actual: e.FT.value } });
            }

            const flags = intOr(e.Ff, 0);
            const combo = (flags & F_COMBO) !== 0;
            const out = {
                ft: 'Ch',
                flags,
                kind: combo ? 'combo' : 'list',
                editable:         combo && ((flags & F_EDIT)             !== 0),
                sort:             (flags & F_SORT)               !== 0,
                multiSelect:      !combo && ((flags & F_MULTI_SELECT)    !== 0),
                doNotSpellCheck:  (flags & F_DO_NOT_SPELLCHECK)  !== 0,
                commitOnSelChange:(flags & F_COMMIT_ON_SEL_CHG)  !== 0,
                opt: toOpt(e.Opt),
                v:   toV(e.V),
                dv:  toV(e.DV),
                i:   toIndices(e.I),
                ti:  intOr(e.TI, 0),
                da:  isType(e.DA, 'string') ? e.DA.value : null,
                q:   intOr(e.Q, 0),
                t:   isType(e.T, 'string')  ? e.T.value  : null,
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeChoiceField };
    }
};
