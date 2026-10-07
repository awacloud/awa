// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: WTPDF 1.0 (Well-Tagged PDF) linter.
 *
 * @module pdf/extra/well-tagged-pdf
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfWellTagged = {
    name: 'pdfWellTagged',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, _p) {
        const { ParseError } = errors;

        /** Frozen catalog of rule identifiers used in lint output. */
        const WTPDF_RULES = Object.freeze({
            'wtpdf/artifact':       'decorative content must be tagged Artifact',
            'wtpdf/span/empty':     'Span used as pseudo-paragraph wrapper',
            'wtpdf/table/empty':    'Table must contain at least one TR',
            'wtpdf/table/row':      'TR must contain TH or TD children',
            'wtpdf/list/empty':     'L must contain at least one LI',
            'wtpdf/list/item':      'LI should contain Lbl + LBody',
            'wtpdf/heading/jump':   'heading level jump (e.g. H1 -> H3) is discouraged'
        });

        function lintWellTagged(tree) {
            if (!tree || typeof tree !== 'object') {
                throw new ParseError('pdf/extra/wtpdf/bad-tree',
                    'lintWellTagged requires a structure tree object',
                    { context: { type: typeof tree } });
            }
            const errs = [];
            const warnings = [];
            let lastHeading = 0;
            function walk(node) {
                if (!node || typeof node !== 'object' || !node.s) return;
                switch (node.s) {
                    case 'Table':   checkTable(node, errs); break;
                    case 'L':       checkList(node, errs, warnings); break;
                    case 'Span':    if (!node.role) {
                                        warnings.push({ rule: 'wtpdf/span/empty',
                                            message: WTPDF_RULES['wtpdf/span/empty'] });
                                    } break;
                    case 'Artifact': /* allowed */ break;
                    default: break;
                }
                const m = /^H([1-6])$/.exec(node.s);
                if (m) {
                    const lvl = Number(m[1]);
                    if (lastHeading && lvl > lastHeading + 1) {
                        warnings.push({ rule: 'wtpdf/heading/jump',
                            message: WTPDF_RULES['wtpdf/heading/jump'],
                            from: lastHeading, to: lvl });
                    }
                    lastHeading = lvl;
                }
                if (Array.isArray(node.k)) {
                    for (const c of node.k) {
                        if (c && typeof c === 'object') walk(c);
                    }
                }
            }
            walk(tree);
            return { pass: errs.length === 0, errors: errs, warnings };
        }

        function checkTable(node, errs) {
            const rows = (node.k || []).filter(c => c && c.s === 'TR');
            if (rows.length === 0) {
                errs.push({ rule: 'wtpdf/table/empty',
                    message: WTPDF_RULES['wtpdf/table/empty'] });
                return;
            }
            for (const tr of rows) {
                const cells = (tr.k || []).filter(c => c && (c.s === 'TH' || c.s === 'TD'));
                if (cells.length === 0) {
                    errs.push({ rule: 'wtpdf/table/row',
                        message: WTPDF_RULES['wtpdf/table/row'] });
                }
            }
        }

        function checkList(node, errs, warnings) {
            const items = (node.k || []).filter(c => c && c.s === 'LI');
            if (items.length === 0) {
                errs.push({ rule: 'wtpdf/list/empty',
                    message: WTPDF_RULES['wtpdf/list/empty'] });
                return;
            }
            for (const li of items) {
                const has = { Lbl: false, LBody: false };
                for (const c of li.k || []) {
                    if (c && c.s === 'Lbl')   has.Lbl   = true;
                    if (c && c.s === 'LBody') has.LBody = true;
                }
                if (!has.Lbl || !has.LBody) {
                    warnings.push({ rule: 'wtpdf/list/item',
                        message: WTPDF_RULES['wtpdf/list/item'] });
                }
            }
        }

        function checkArtifactPlacement(regions) {
            if (!Array.isArray(regions)) {
                throw new ParseError('pdf/extra/wtpdf/regions/bad-input',
                    'checkArtifactPlacement requires an array',
                    { context: { type: typeof regions } });
            }
            const errs = [];
            for (const r of regions) {
                if (!r || typeof r !== 'object') continue;
                if (r.tagged === false && r.role !== 'Artifact') {
                    errs.push({ rule: 'wtpdf/artifact',
                        message: WTPDF_RULES['wtpdf/artifact'],
                        mcid: r.mcid });
                }
            }
            return { pass: errs.length === 0, errors: errs, warnings: [] };
        }

        return {
            lintWellTagged,
            checkArtifactPlacement,
            WTPDF_RULES
        };
    }
};

