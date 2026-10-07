// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Structure Tree Root typing per ISO 32000-2:2020 §14.7.2.
 *
 * The `/Type /StructTreeRoot` dict is referenced by the Catalog's
 * `/StructTreeRoot` entry and anchors the logical structure tree used by
 * Tagged PDF (§14.8) and PDF/UA-2 (ISO 14289-2). Unknown entries land in
 * `_extras`.
 *
 * @module pdf/tagged/structTree
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfStructTree = {
    name: 'pdfStructTree',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Type', 'K', 'IDTree', 'ParentTree', 'ParentTreeNextKey',
            'RoleMap', 'ClassMap', 'Namespaces', 'AF', 'PronunciationLexicon'
        ]);

        function typeStructTreeRoot(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/tagged/struct-tree/not-dict',
                    'StructTreeRoot must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'StructTreeRoot')) {
                throw new ParseError('pdf/tagged/struct-tree/bad-type',
                    '/Type entry must be /StructTreeRoot',
                    { context: { actual: e.Type.value } });
            }

            const out = { raw: dict, _extras: {} };

            if (e.K !== undefined) out.kids = readKids(e.K);
            if (e.IDTree)             out.idTree            = e.IDTree;
            if (e.ParentTree)         out.parentTree        = e.ParentTree;
            if (e.ParentTreeNextKey && (e.ParentTreeNextKey.type === 'int'
                                     || e.ParentTreeNextKey.type === 'real')) {
                out.parentTreeNextKey = e.ParentTreeNextKey.value | 0;
            }
            if (e.RoleMap   && e.RoleMap.type   === 'dict')  out.roleMap   = e.RoleMap;
            if (e.ClassMap  && e.ClassMap.type  === 'dict')  out.classMap  = e.ClassMap;
            if (e.Namespaces && e.Namespaces.type === 'array') out.namespaces = e.Namespaces;
            if (e.AF) out.af = e.AF;
            if (e.PronunciationLexicon) out.pronunciationLexicon = e.PronunciationLexicon;

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }

            return out;
        }

        function readKids(k) {
            if (!k) return [];
            if (k.type === 'array') {
                const out = [];
                for (const item of k.items) {
                    if (item.type !== 'ref' && item.type !== 'dict') {
                        throw new ParseError('pdf/tagged/struct-tree/bad-kid',
                            'StructTreeRoot /K array entries must be refs or dicts',
                            { context: { kind: item.type } });
                    }
                    out.push(item);
                }
                return out;
            }
            if (k.type === 'ref' || k.type === 'dict') return [k];
            throw new ParseError('pdf/tagged/struct-tree/bad-kid',
                'StructTreeRoot /K must be a ref, dict, or array',
                { context: { kind: k.type } });
        }

        return { typeStructTreeRoot };
    }
};
