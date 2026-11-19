// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PDF/UA validation rules.
 *
 * Implements a static linter for PDF/UA-1 (ISO 14289-1:2014) and PDF/UA-2
 * (ISO 14289-2:2024) over a `pdf.read` result or a hand-built document.
 * Catalog checks, each with veraPDF's rule id for the part:
 *
 *   - `/StructTreeRoot`              (required: 7.1-t11, part 2 8.2.1-t1)
 *   - `/MarkInfo /Marked true`       (required: 6.2-t1)
 *   - `/Lang`                        (part 2 only: 8.4.4-t1; a warning
 *                                    under part 1)
 *   - `/ViewerPreferences /DisplayDocTitle true` (required: 7.1-t10,
 *                                    part 2 8.11.2-t1)
 *   - the accessible-permission flag (bit 10) of an encrypted document
 *                                    (part 1: 7.16-t1)
 *
 * Structure-element checks (sampled):
 *   - Figures must carry `/Alt` or `/ActualText`.
 *
 * @module pdf/extra/pdf-ua-tagged
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfUaTagged = {
    name: 'pdfUaTagged',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError, ContractError } = errors;
        const { isType } = parser;

        const UA_STRUCTURE = Object.freeze({
            required: Object.freeze(['Document', 'Part', 'Sect', 'Art', 'H', 'P', 'L', 'LI', 'Lbl', 'LBody',
                'Table', 'TR', 'TH', 'TD', 'Figure']),
            forbidden: Object.freeze(['Span']),
            figure: Object.freeze(['Alt', 'ActualText']),
            headings: Object.freeze(['H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
        });

        // veraPDF's rule id (`<clause>-t<test>`) of each check, per part.
        const UA_RULES = Object.freeze({
            1: Object.freeze({ structTree: '7.1-t11', marked: '6.2-t1', docTitle: '7.1-t10', lang: null, accessible: '7.16-t1' }),
            2: Object.freeze({ structTree: '8.2.1-t1', marked: '6.2-t1', docTitle: '8.11.2-t1', lang: '8.4.4-t1', accessible: null })
        });

        /**
         * What the checks read of `doc`: its catalog entries, a resolver of
         * references (identity without one) and the `/P` of its encryption
         * dictionary. `doc` is a `pdf.read` result (`catalog.raw`,
         * `_raw.resolve`, the trailer's `/Encrypt`) or the hand-built shape
         * (`catalog.entries`, `p`).
         */
        function lintView(doc) {
            const resolver = doc._raw && typeof doc._raw.resolve === 'function' ? doc._raw.resolve : null;
            const deref = (v) => (resolver && v && v.type === 'ref' ? resolver(v) : v);
            const catalog = doc.catalog && (doc.catalog.entries || (doc.catalog.raw && doc.catalog.raw.entries));
            let p = typeof doc.p === 'number' ? doc.p : undefined;
            const enc = doc.trailer && doc.trailer.encrypt;
            if (p === undefined && enc) {
                const e = deref(enc.type ? enc : { type: 'ref', num: enc.num, gen: enc.gen });
                const P = isType(e, 'dict') ? deref(e.entries.P) : null;
                if (isType(P, 'int')) p = P.value;
            }
            return { catalog, deref, p };
        }

        /**
         * Lint `doc`'s catalog against PDF/UA: `opts.part` 1 (default,
         * ISO 14289-1) or 2 (ISO 14289-2). Each error and warning is also a
         * finding naming veraPDF's rule of its check for that part (null
         * when no rule of the part states it).
         */
        function validatePdfUa(typedDoc, opts) {
            if (!typedDoc || typeof typedDoc !== 'object') {
                throw new ParseError('pdf/extra/pdfua/bad-doc',
                    'validatePdfUa requires a typed document object',
                    { context: { type: typeof typedDoc } });
            }
            const part = opts && opts.part !== undefined ? opts.part : 1;
            if (part !== 1 && part !== 2) {
                throw new ContractError('pdf/extra/pdfua/bad-part',
                    'validatePdfUa: opts.part must be 1 or 2',
                    { context: { received: typeof part === 'number' ? String(part) : typeof part } });
            }
            const rules = UA_RULES[part];
            const errors = [];
            const warnings = [];
            const findings = [];
            const error = (rule, message) => { errors.push(message); findings.push({ rule, severity: 'error', message }); };
            const warning = (rule, message) => { warnings.push(message); findings.push({ rule, severity: 'warning', message }); };
            const { catalog: cat, deref, p } = lintView(typedDoc);
            if (!cat) {
                error(null, 'catalog missing');
                return { pass: false, errors, warnings, findings };
            }
            if (!cat.StructTreeRoot) error(rules.structTree, 'catalog requires /StructTreeRoot');
            if (!isType(deref(cat.Lang), 'string')) {
                // Part 1 asks the language to be determinable, which a
                // structure element or marked content may state instead.
                if (part === 2) error(rules.lang, 'catalog requires /Lang string');
                else warning(rules.lang, 'catalog has no /Lang string');
            }
            const markInfo = deref(cat.MarkInfo);
            if (!markInfo) {
                error(rules.marked, 'catalog requires /MarkInfo dictionary');
            } else if (!isType(markInfo, 'dict')) {
                error(rules.marked, '/MarkInfo must be a dictionary');
            } else {
                const m = deref(markInfo.entries.Marked);
                if (!isType(m, 'bool') || m.value !== true) {
                    error(rules.marked, '/MarkInfo /Marked must be true');
                }
            }
            const prefs = deref(cat.ViewerPreferences);
            const ddt = isType(prefs, 'dict') ? deref(prefs.entries.DisplayDocTitle) : null;
            if (!isType(ddt, 'bool') || ddt.value !== true) {
                error(rules.docTitle, 'catalog requires /ViewerPreferences /DisplayDocTitle true');
            }
            if (rules.accessible && typeof p === 'number' && (p & (1 << 9)) === 0) {
                error(rules.accessible, 'permissions bit 10 (accessible) must be set');
            }
            return { pass: errors.length === 0, errors, warnings, findings };
        }

        function validateUaStructElement(node) {
            if (!node || typeof node !== 'object') {
                throw new ParseError('pdf/extra/pdfua/struct/bad-node',
                    'validateUaStructElement requires a node',
                    { context: { type: typeof node } });
            }
            const errors = [];
            const warnings = [];
            if (node.s === 'Figure') {
                if (!node.alt && !node.actualText) {
                    errors.push('Figure requires /Alt or /ActualText');
                }
            }
            if (UA_STRUCTURE.forbidden.includes(node.s)) {
                warnings.push('avoid /' + node.s + ' as a top-level structure type');
            }
            return { pass: errors.length === 0, errors, warnings };
        }

        return {
            validatePdfUa,
            validateUaStructElement,
            UA_STRUCTURE
        };
    }
};

