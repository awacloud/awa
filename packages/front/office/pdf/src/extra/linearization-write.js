// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: Linearization Parameter Dictionary emitter
 * (builds and validates the dictionary; the hint stream is an empty stub).
 *
 * @module pdf/extra/linearization-write
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfLinearizationWrite = {
    name: 'pdfLinearizationWrite',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { RenderError } = errors;
        const { obj } = parser;

        /** Frozen list of required entries (§F.2 Table F.1). */
        const LINEARIZED_KEYS = Object.freeze([
            'Linearized', 'L', 'H', 'O', 'E', 'N', 'T'
        ]);

        function buildLinearizedDict(p) {
            if (!p || typeof p !== 'object') {
                throw new RenderError('pdf/extra/linwrite/bad-params',
                    'buildLinearizedDict requires a parameters object',
                    { context: { type: typeof p } });
            }
            for (const k of ['fileLength', 'firstPageObj', 'firstPageEnd',
                             'pageCount', 'mainXrefOffset']) {
                if (!Number.isFinite(p[k])) {
                    throw new RenderError('pdf/extra/linwrite/missing-' + k,
                        'parameter ' + k + ' is required and must be a number',
                        { context: { key: k, type: typeof p[k] } });
                }
            }
            if (!Number.isFinite(p.hintOffset) || !Number.isFinite(p.hintLength)) {
                throw new RenderError('pdf/extra/linwrite/missing-hint',
                    'hintOffset and hintLength are required',
                    { context: { hintOffset: p.hintOffset, hintLength: p.hintLength } });
            }
            const entries = {
                Linearized: obj.real(p.version != null ? p.version : 1.0),
                L: obj.int(p.fileLength),
                H: obj.array([obj.int(p.hintOffset), obj.int(p.hintLength)]),
                O: obj.int(p.firstPageObj),
                E: obj.int(p.firstPageEnd),
                N: obj.int(p.pageCount),
                T: obj.int(p.mainXrefOffset)
            };
            if (p.firstPage != null) entries.P = obj.int(p.firstPage);
            return obj.dict(entries);
        }

        function buildHintStreamStub() {
            const dict = obj.dict({
                Length: obj.int(0),
                S: obj.int(0)
            });
            return obj.stream(dict, new Uint8Array(0));
        }

        function validateLinearizedDict(dict) {
            if (!dict || dict.type !== 'dict') {
                throw new RenderError('pdf/extra/linwrite/validate/not-dict',
                    'expected a dict',
                    { context: { type: dict && dict.type } });
            }
            const errs = [];
            for (const k of LINEARIZED_KEYS) {
                if (!dict.entries[k]) errs.push('missing /' + k);
            }
            const h = dict.entries.H;
            if (h && (h.type !== 'array' || h.items.length < 2)) {
                errs.push('/H must be an array of at least 2 integers');
            }
            return { pass: errs.length === 0, errors: errs, warnings: [] };
        }

        return {
            buildLinearizedDict,
            buildHintStreamStub,
            validateLinearizedDict,
            LINEARIZED_KEYS
        };
    }
};

