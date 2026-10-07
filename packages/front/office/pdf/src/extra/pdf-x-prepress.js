// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PDF/X conformance helpers.
 *
 * PDF/X (ISO 15930) defines a family of prepress-targeted profiles
 * (PDF/X-1a, X-3, X-4, X-4p, X-5g, X-5n, X-5pg, X-6) with an
 * `/OutputIntent` whose `/S` is `GTS_PDFX`. Required structural checks:
 *
 *   - `/TrimBox` (and optionally `/BleedBox`, `/ArtBox`) on every page.
 *   - Output intent profile (Dest profile or registry identifier).
 *   - Separation info dict (per page or document level) for X-4+.
 *
 * @module pdf/extra/pdf-x-prepress
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfXPrepress = {
    name: 'pdfXPrepress',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const PDFX_PROFILES = Object.freeze({
            'X-1a:2001': { iso: 'ISO 15930-1:2001', color: 'cmyk+spot', flavor: 'closed' },
            'X-1a:2003': { iso: 'ISO 15930-4:2003', color: 'cmyk+spot', flavor: 'closed' },
            'X-3:2002':  { iso: 'ISO 15930-3:2002', color: 'any',       flavor: 'closed' },
            'X-3:2003':  { iso: 'ISO 15930-6:2003', color: 'any',       flavor: 'closed' },
            'X-4':       { iso: 'ISO 15930-7:2010', color: 'any',       flavor: 'transparency' },
            'X-4p':      { iso: 'ISO 15930-7:2010', color: 'any',       flavor: 'external-profile' },
            'X-5g':      { iso: 'ISO 15930-8:2010', color: 'any',       flavor: 'external-graphics' },
            'X-5n':      { iso: 'ISO 15930-8:2010', color: 'n-channel', flavor: 'external-profile' },
            'X-5pg':     { iso: 'ISO 15930-8:2010', color: 'any',       flavor: 'external-both' },
            'X-6':       { iso: 'ISO 15930-9:2020', color: 'any',       flavor: 'pdf-2.0' }
        });

        const COLOR_POLICY = Object.freeze({
            None:     'no transformation',
            Convert:  'convert to OutputIntent profile',
            Tag:      'tag with profile only',
            Embed:    'embed source profile'
        });

        function typePdfXOutputIntent(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pdfx/not-dict',
                    'OutputIntent must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const s = isType(e.S, 'name') ? e.S.value : null;
            const ident = isType(e.OutputConditionIdentifier, 'string')
                ? new TextDecoder('latin1').decode(e.OutputConditionIdentifier.value)
                : null;
            const profile = profileFromIdentifier(ident);
            return {
                isPdfX: s === 'GTS_PDFX',
                subtype: s,
                identifier: ident,
                profile,
                catalog: profile ? PDFX_PROFILES[profile] : null,
                raw: dict
            };
        }

        function profileFromIdentifier(s) {
            if (!s) return null;
            const m = s.match(/PDF\/(X-(?:1a:200[13]|3:200[23]|4p?|5(?:g|n|pg)|6))/i);
            if (!m) return null;
            const key = m[1].toUpperCase().replace('X-', 'X-');
            for (const k of Object.keys(PDFX_PROFILES)) {
                if (k.toLowerCase() === key.toLowerCase()) return k;
            }
            return null;
        }

        function lintPdfXPage(page) {
            if (!page || !page.entries) {
                throw new ParseError('pdf/extra/pdfx/lint/bad-page',
                    'lintPdfXPage requires a typed page dict',
                    { context: { type: typeof page } });
            }
            const errors = [];
            const warnings = [];
            const e = page.entries;
            if (!e.TrimBox && !e.ArtBox) {
                errors.push('page requires /TrimBox or /ArtBox');
            }
            if (e.TrimBox && e.ArtBox) {
                errors.push('page must not have both /TrimBox and /ArtBox');
            }
            if (!e.BleedBox) warnings.push('page has no /BleedBox');
            return { pass: errors.length === 0, errors, warnings };
        }

        return {
            typePdfXOutputIntent,
            lintPdfXPage,
            PDFX_PROFILES,
            COLOR_POLICY
        };
    }
};

