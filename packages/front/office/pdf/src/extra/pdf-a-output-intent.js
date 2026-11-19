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
        const { ParseError, ContractError } = errors;
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

        // veraPDF's rule id (`<clause>-t<test>`) of the Metadata check, by
        // part of ISO 19005; encryption is 6.1.3-t2 in every part.
        const METADATA_RULE = Object.freeze({ 1: '6.7.2-t1', 2: '6.6.2.1-t1', 3: '6.6.2.1-t1', 4: '6.7.2.1-t1' });
        const ENCRYPT_RULE = '6.1.3-t2';

        /**
         * Lint `doc`'s catalog and trailer against PDF/A basics. `doc` is a
         * `pdf.read` result (`catalog.raw`, `_raw.resolve`, the trailer's
         * `/Encrypt`) or the hand-built shape (`catalog.entries`,
         * `encrypted`). Each error and warning is also a finding naming
         * veraPDF's rule of its check for `opts.profile` (a key of
         * `PDFA_PROFILES`; null without a profile, or when no rule states it).
         */
        function validatePdfABasics(typedDoc, opts) {
            if (!typedDoc || typeof typedDoc !== 'object') {
                throw new ParseError('pdf/extra/pdfa/lint/bad-doc',
                    'validatePdfABasics requires a typed document object',
                    { context: { type: typeof typedDoc } });
            }
            const profile = opts && opts.profile !== undefined ? opts.profile : null;
            if (profile !== null && !VALID_LEVELS.has(profile)) {
                throw new ContractError('pdf/extra/pdfa/bad-profile',
                    'validatePdfABasics: opts.profile must be a PDFA_PROFILES key',
                    { context: { received: typeof profile === 'string' ? profile : typeof profile } });
            }
            const part = profile ? PDFA_PROFILES[profile].part : null;
            const errors = [];
            const warnings = [];
            const findings = [];
            const error = (rule, message) => { errors.push(message); findings.push({ rule, severity: 'error', message }); };
            const warning = (rule, message) => { warnings.push(message); findings.push({ rule, severity: 'warning', message }); };
            const resolver = typedDoc._raw && typeof typedDoc._raw.resolve === 'function' ? typedDoc._raw.resolve : null;
            const deref = (v) => (resolver && v && v.type === 'ref' ? resolver(v) : v);
            const cat = typedDoc.catalog && (typedDoc.catalog.entries || (typedDoc.catalog.raw && typedDoc.catalog.raw.entries));
            if (typedDoc.encrypted || (typedDoc.trailer && typedDoc.trailer.encrypt)) {
                error(part ? ENCRYPT_RULE : null, 'PDF/A forbids encryption');
            }
            if (!cat) {
                error(null, 'catalog missing');
                return { pass: false, errors, warnings, findings };
            }
            if (!cat.Metadata) error(part ? METADATA_RULE[part] : null, 'catalog requires /Metadata XMP stream');
            if (cat.MarkInfo && !isType(deref(cat.MarkInfo), 'dict')) {
                // No PDF/A rule names it: a malformed entry, not a conformance failure.
                warning(null, '/MarkInfo must be a dictionary');
            }
            if (!cat.OutputIntents) {
                warning(null, 'catalog has no /OutputIntents array');
            }
            return { pass: errors.length === 0, errors, warnings, findings };
        }

        return {
            detectPdfAProfile,
            validatePdfABasics,
            PDFA_PROFILES
        };
    }
};

