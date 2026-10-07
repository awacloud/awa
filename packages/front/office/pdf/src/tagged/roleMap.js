// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview RoleMap typing per ISO 32000-2:2020 §14.7.5 + namespace
 * handling per §14.7.6 (PDF 2.0).
 *
 * `/RoleMap` maps custom structure-type names to standard ones. A chain
 * lookup may be required if a custom role maps to another custom role.
 * Cycles are detected and rejected.
 *
 * The PDF 2.0 namespace model adds `/Namespaces` and per-element `/NS`.
 * A namespace dict may carry its own `/RoleMapNS` that takes precedence
 * for elements within that namespace.
 *
 * @module pdf/tagged/roleMap
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfRoleMap = {
    name: 'pdfRoleMap',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const STANDARD_TYPES = new Set([
            // Grouping
            'Document', 'DocumentFragment', 'Part', 'Art', 'Sect', 'Div',
            'BlockQuote', 'Caption', 'TOC', 'TOCI', 'Index', 'NonStruct',
            'Private', 'Aside', 'Title', 'FENote',
            // Paragraph-like
            'P', 'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7',
            // Lists
            'L', 'LI', 'Lbl', 'LBody',
            // Tables
            'Table', 'TR', 'TH', 'TD', 'THead', 'TBody', 'TFoot',
            // Inline
            'Span', 'Quote', 'Note', 'Reference', 'BibEntry', 'Code',
            'Link', 'Annot', 'Em', 'Strong',
            // Ruby / Warichu
            'Ruby', 'RB', 'RT', 'RP', 'Warichu', 'WT', 'WP',
            // Illustration
            'Figure', 'Formula', 'Form', 'Artifact'
        ]);

        function typeRoleMap(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/tagged/role-map/not-dict',
                    'RoleMap must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const map = {};
            for (const [k, v] of Object.entries(dict.entries)) {
                if (!v || v.type !== 'name') {
                    throw new ParseError('pdf/tagged/role-map/bad-value',
                        'RoleMap values must be name objects',
                        { context: { key: k, kind: v && v.type } });
                }
                map[k] = v.value;
            }
            return { map, raw: dict };
        }

        function resolveStandardType(name, map, namespaceMap) {
            const chain = [];
            const seen = new Set();
            let cur = name;
            while (cur) {
                if (seen.has(cur)) {
                    throw new ParseError('pdf/tagged/role-map/cycle',
                        'cycle detected resolving role-map alias',
                        { context: { chain: chain.slice() } });
                }
                seen.add(cur);
                chain.push(cur);
                if (STANDARD_TYPES.has(cur)) return { standard: cur, chain };
                const nsHit = namespaceMap && namespaceMap[cur];
                const next = nsHit || (map && map[cur]);
                if (!next || next === cur) {
                    return { standard: null, chain };
                }
                cur = next;
            }
            return { standard: null, chain };
        }

        function isStandardType(name) {
            return STANDARD_TYPES.has(name);
        }

        return {
            typeRoleMap,
            resolveStandardType,
            isStandardType,
            STANDARD_TYPES
        };
    }
};
