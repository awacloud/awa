// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Output Intent typing per ISO 32000-2:2020 §14.11.5.
 *
 * Each entry in the Catalog's `/OutputIntents` array is a dictionary
 * `/Type /OutputIntent` describing the colour environment the document
 * was prepared for. Entries:
 *   /S                       — subtype: GTS_PDFA1, GTS_PDFX, ISO_PDFE1, …
 *   /OutputCondition         — human-readable description.
 *   /OutputConditionIdentifier — registry identifier.
 *   /RegistryName            — URL of registry.
 *   /Info                    — additional textual info.
 *   /DestOutputProfile       — ICC profile stream (ref).
 *   /DestOutputProfileRef    — PDF 2.0 indirect URI to ICC.
 *   /MixingHints             — dict (mixing hints).
 *   /SpectralData            — dict (spectral data).
 *
 * @module pdf/prepress/outputIntent
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfOutputIntent = {
    name: 'pdfOutputIntent',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Type', 'S', 'OutputCondition', 'OutputConditionIdentifier',
            'RegistryName', 'Info', 'DestOutputProfile', 'DestOutputProfileRef',
            'MixingHints', 'SpectralData'
        ]);

        function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

        function typeOutputIntent(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/output-intent/not-dict',
                    'OutputIntent must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'OutputIntent')) {
                throw new ParseError('pdf/output-intent/bad-type',
                    '/Type must be /OutputIntent',
                    { context: { actual: e.Type.value } });
            }
            if (!e.S || e.S.type !== 'name') {
                throw new ParseError('pdf/output-intent/missing-s',
                    'OutputIntent missing /S subtype name',
                    { context: { type: e.S && e.S.type } });
            }
            const out = { subtype: e.S.value, raw: dict, _extras: {} };

            for (const k of ['OutputCondition', 'OutputConditionIdentifier',
                             'RegistryName', 'Info']) {
                if (e[k] !== undefined) {
                    if (e[k].type !== 'string') {
                        throw new ParseError('pdf/output-intent/bad-str',
                            '/' + k + ' must be a string',
                            { context: { key: k, type: e[k].type } });
                    }
                    out[lower(k)] = e[k].value;
                }
            }
            if (e.DestOutputProfile) {
                if (e.DestOutputProfile.type !== 'ref' && e.DestOutputProfile.type !== 'stream') {
                    throw new ParseError('pdf/output-intent/bad-profile',
                        '/DestOutputProfile must be a ref or stream',
                        { context: { type: e.DestOutputProfile.type } });
                }
                out.destOutputProfile = e.DestOutputProfile;
            }
            if (e.DestOutputProfileRef) {
                if (e.DestOutputProfileRef.type !== 'dict' && e.DestOutputProfileRef.type !== 'ref') {
                    throw new ParseError('pdf/output-intent/bad-profile-ref',
                        '/DestOutputProfileRef must be a dict or ref',
                        { context: { type: e.DestOutputProfileRef.type } });
                }
                out.destOutputProfileRef = e.DestOutputProfileRef;
            }
            if (e.MixingHints) {
                if (e.MixingHints.type !== 'dict') {
                    throw new ParseError('pdf/output-intent/bad-mixing',
                        '/MixingHints must be a dictionary',
                        { context: { type: e.MixingHints.type } });
                }
                out.mixingHints = e.MixingHints;
            }
            if (e.SpectralData) {
                if (e.SpectralData.type !== 'dict') {
                    throw new ParseError('pdf/output-intent/bad-spectral',
                        '/SpectralData must be a dictionary',
                        { context: { type: e.SpectralData.type } });
                }
                out.spectralData = e.SpectralData;
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeOutputIntent };
    }
};
