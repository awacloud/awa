// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Widget annotation per ISO 32000-2:2020 §12.5.6.19.
 *
 * Widgets are the annotation side of form fields. This typer addresses
 * only the annotation entries — field typing lives in `pdf/form/*`.
 *
 * Subtype-specific entries:
 *   /H       name — highlight mode (N, I, O, P, T)
 *   /MK      dict — appearance characteristics
 *   /A       dict — action triggered when activated
 *   /AA      dict — additional actions
 *   /BS      dict — border style (on base)
 *   /Parent  ref  — parent field (hierarchical)
 *
 * @module pdf/annot/widget
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfWidgetAnnot = {
    name: 'pdfWidgetAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['H', 'MK', 'A', 'AA', 'Parent']);

        function typeWidgetAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Widget') {
                throw new ParseError('pdf/annot/widget/bad-subtype',
                    '/Subtype must be /Widget',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.h      = isType(e.H, 'name') ? e.H.value : null;
            base.mk     = isType(e.MK, 'dict') ? e.MK : null;
            base.action = isType(e.A,  'dict') ? e.A  : null;
            base.aa     = isType(e.AA, 'dict') ? e.AA : null;
            base.parent = e.Parent && e.Parent.type === 'ref'
                ? { num: e.Parent.num, gen: e.Parent.gen } : null;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typeWidgetAnnot };
    }
};
