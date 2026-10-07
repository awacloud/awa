// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typing of the ISO/TS 32005 apply-redaction audit
 * record (read side). The TS text is not vendored; the entries below are what
 * this module recognises. No content removal is performed.
 *
 * An audit record describes:
 *   - the annotations that were applied,
 *   - the overlay rendering hints (`/RD`, `/IC`, `/RO`),
 *   - content-stream redact markers (`/Redact ... BMC ... EMC`) tracking
 *     positions for visualization / forensic review.
 *
 * @module pdf/extra/redaction-iso32005
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfRedactionIso32005 = {
    name: 'pdfRedactionIso32005',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Type', 'AppliedAt', 'Tool', 'Annotations', 'RD', 'RO', 'IC',
            'MarkedRegions'
        ]);

        const REDACT_MARKERS = Object.freeze({
            begin: '/Redact BMC',
            beginPropertyList: '/Redact BDC',
            end:   'EMC',
            notes: 'TS 32005 §6.3 — wraps content removed/overlaid by /RD.'
        });

        function typeRedactionRecord(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/redact32005/not-dict',
                    'redaction record must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = {
                appliedAt:   isType(e.AppliedAt, 'string') ? e.AppliedAt.value : null,
                tool:        isType(e.Tool,      'string') ? e.Tool.value      : null,
                annotations: toRefArray(e.Annotations),
                rd:          toRect(e.RD),
                ro:          isType(e.RO, 'ref') || isType(e.RO, 'stream') ? e.RO : null,
                ic:          toNumArray(e.IC),
                markedRegions: toMarkedRegions(e.MarkedRegions),
                raw:         dict,
                _extras:     {}
            };
            if (e.Annotations && e.Annotations.type !== 'array') {
                throw new ParseError('pdf/extra/redact32005/bad-annotations',
                    '/Annotations must be an array',
                    { context: { type: e.Annotations.type } });
            }
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function findRedactMarkers(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/extra/redact32005/scan/bad-input',
                    'findRedactMarkers requires a Uint8Array',
                    { context: { type: typeof bytes } });
            }
            const text = new TextDecoder('latin1').decode(bytes);
            const regions = [];
            const re = /\/Redact\s+(BMC|BDC)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const begin = m.index;
                const tail = text.indexOf('EMC', re.lastIndex);
                regions.push({
                    beginOffset: begin,
                    endOffset:   tail < 0 ? null : tail + 3,
                    kind:        m[1]
                });
                if (tail >= 0) re.lastIndex = tail + 3;
            }
            return { regions };
        }

        function toRect(v) {
            if (!v || v.type !== 'array') return null;
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            return out;
        }

        function toNumArray(v) {
            if (!v || v.type !== 'array') return null;
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            return out;
        }

        function toRefArray(v) {
            if (!v || v.type !== 'array') return null;
            return v.items.slice();
        }

        function toMarkedRegions(v) {
            if (!v) return null;
            if (v.type !== 'array') return null;
            return v.items.slice();
        }

        return {
            typeRedactionRecord,
            findRedactMarkers,
            REDACT_MARKERS
        };
    }
};

