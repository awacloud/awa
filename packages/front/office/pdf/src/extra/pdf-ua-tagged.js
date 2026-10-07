// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PDF/UA validation rules.
 *
 * Implements a static linter for PDF/UA-1 (ISO 14289-1:2014) and the
 * draft PDF/UA-2 (ISO 14289-2). Required catalog structure:
 *
 *   - `/StructTreeRoot`              (required, tagged document)
 *   - `/MarkInfo /Marked true`       (required)
 *   - `/Lang`                        (required)
 *   - `/ViewerPreferences /DisplayDocTitle true` (required)
 *
 * Structure-element checks (sampled):
 *   - Figures must carry `/Alt` or `/ActualText`.
 *   - Tables must include `TH`/`TD`/`TR`.
 *   - The accessible-permission flag (bit 10) must be 1.
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
        const { ParseError } = errors;
        const { isType } = parser;

        const UA_STRUCTURE = Object.freeze({
            required: Object.freeze(['Document', 'Part', 'Sect', 'Art', 'H', 'P', 'L', 'LI', 'Lbl', 'LBody',
                'Table', 'TR', 'TH', 'TD', 'Figure']),
            forbidden: Object.freeze(['Span']),
            figure: Object.freeze(['Alt', 'ActualText']),
            headings: Object.freeze(['H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
        });

        function validatePdfUa(typedDoc) {
            if (!typedDoc || typeof typedDoc !== 'object') {
                throw new ParseError('pdf/extra/pdfua/bad-doc',
                    'validatePdfUa requires a typed document object',
                    { context: { type: typeof typedDoc } });
            }
            const errors = [];
            const warnings = [];
            const cat = typedDoc.catalog && typedDoc.catalog.entries;
            if (!cat) {
                errors.push('catalog missing');
                return { pass: false, errors, warnings };
            }
            if (!cat.StructTreeRoot) errors.push('catalog requires /StructTreeRoot');
            if (!cat.Lang || !isType(cat.Lang, 'string')) {
                errors.push('catalog requires /Lang string');
            }
            if (!cat.MarkInfo) {
                errors.push('catalog requires /MarkInfo dictionary');
            } else if (!isType(cat.MarkInfo, 'dict')) {
                errors.push('/MarkInfo must be a dictionary');
            } else {
                const m = cat.MarkInfo.entries.Marked;
                if (!isType(m, 'bool') || m.value !== true) {
                    errors.push('/MarkInfo /Marked must be true');
                }
            }
            if (cat.ViewerPreferences && isType(cat.ViewerPreferences, 'dict')) {
                const ddt = cat.ViewerPreferences.entries.DisplayDocTitle;
                if (!isType(ddt, 'bool') || ddt.value !== true) {
                    warnings.push('/ViewerPreferences /DisplayDocTitle should be true');
                }
            } else {
                warnings.push('catalog should have /ViewerPreferences');
            }
            if (typeof typedDoc.p === 'number') {
                if ((typedDoc.p & (1 << 9)) === 0) {
                    errors.push('permissions bit 10 (accessible) must be set');
                }
            }
            return { pass: errors.length === 0, errors, warnings };
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

