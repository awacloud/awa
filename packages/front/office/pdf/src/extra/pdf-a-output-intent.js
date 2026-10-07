// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PDF/A validation helpers.
 *
 * Recognises an `/OutputIntent` whose `/S` is `GTS_PDFA1` (or later
 * profile names introduced by ISO 19005-{2..4}), extracts the
 * conformance level letter (a/b/u/e/f) and maps the
 * `/OutputConditionIdentifier` to a known registry profile.
 *
 * @module pdf/extra/pdf-a-output-intent
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAOutputIntent = {
    name: 'pdfAOutputIntent',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const PDFA_PROFILES = Object.freeze({
            '1a': { part: 1, level: 'a', iso: 'ISO 19005-1:2005', notes: 'accessible' },
            '1b': { part: 1, level: 'b', iso: 'ISO 19005-1:2005', notes: 'basic'      },
            '2a': { part: 2, level: 'a', iso: 'ISO 19005-2:2011', notes: 'accessible' },
            '2b': { part: 2, level: 'b', iso: 'ISO 19005-2:2011', notes: 'basic'      },
            '2u': { part: 2, level: 'u', iso: 'ISO 19005-2:2011', notes: 'unicode'    },
            '3a': { part: 3, level: 'a', iso: 'ISO 19005-3:2012', notes: 'accessible + embed' },
            '3b': { part: 3, level: 'b', iso: 'ISO 19005-3:2012', notes: 'basic + embed'      },
            '3u': { part: 3, level: 'u', iso: 'ISO 19005-3:2012', notes: 'unicode + embed'    },
            '4':  { part: 4, level: null, iso: 'ISO 19005-4:2020', notes: 'PDF 2.0 base' },
            '4e': { part: 4, level: 'e', iso: 'ISO 19005-4:2020', notes: 'engineering' },
            '4f': { part: 4, level: 'f', iso: 'ISO 19005-4:2020', notes: 'embedded files allowed' }
        });

        const VALID_LEVELS = new Set(['1a', '1b', '2a', '2b', '2u',
            '3a', '3b', '3u', '4', '4e', '4f']);

        function detectPdfAProfile(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pdfa/not-dict',
                    'OutputIntent must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const s = isType(e.S, 'name') ? e.S.value : null;
            const ident = isType(e.OutputConditionIdentifier, 'string')
                ? new TextDecoder('latin1').decode(e.OutputConditionIdentifier.value)
                : null;
            const isPdfA = s === 'GTS_PDFA1';
            const profile = profileFromIdentifier(ident);
            return {
                isPdfA,
                subtype: s,
                identifier: ident,
                profile,
                part:  profile ? PDFA_PROFILES[profile].part  : null,
                level: profile ? PDFA_PROFILES[profile].level : null,
                catalog: profile ? PDFA_PROFILES[profile] : null,
                raw: dict
            };
        }

        function profileFromIdentifier(s) {
            if (!s) return null;
            const m = s.match(/PDF\/A[-\s]?(1[ab]|2[abu]|3[abu]|4[ef]?)/i);
            if (!m) return null;
            const tag = m[1].toLowerCase();
            return VALID_LEVELS.has(tag) ? tag : null;
        }

        function validatePdfABasics(typedDoc) {
            if (!typedDoc || typeof typedDoc !== 'object') {
                throw new ParseError('pdf/extra/pdfa/lint/bad-doc',
                    'validatePdfABasics requires a typed document object',
                    { context: { type: typeof typedDoc } });
            }
            const errors = [];
            const warnings = [];
            const cat = typedDoc.catalog && typedDoc.catalog.entries;
            if (typedDoc.encrypted) errors.push('PDF/A forbids encryption');
            if (!cat) {
                errors.push('catalog missing');
                return { pass: false, errors, warnings };
            }
            if (!cat.Metadata) errors.push('catalog requires /Metadata XMP stream');
            if (cat.MarkInfo && (!isType(cat.MarkInfo, 'dict'))) {
                errors.push('/MarkInfo must be a dictionary');
            }
            if (!cat.OutputIntents) {
                warnings.push('catalog has no /OutputIntents array');
            }
            return { pass: errors.length === 0, errors, warnings };
        }

        return {
            detectPdfAProfile,
            validatePdfABasics,
            PDFA_PROFILES
        };
    }
};

