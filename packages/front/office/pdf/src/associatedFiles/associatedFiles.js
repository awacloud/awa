// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Associated Files typing per ISO 32000-2:2020 annex
 * "PDF20_AN002 — Associated Files".
 *
 * PDF 2.0 introduces `/AF`, an array of indirect references to File
 * Specification dicts, attachable to the Catalog, a Page, an XObject,
 * a Form Field, an Annotation, a Mark, or a Structure Element. Each
 * referenced filespec must carry an `/AFRelationship` name.
 *
 * Standard relationships: Source, Data, Alternative, Supplement,
 * EncryptedPayload, FormData, Schema, Unspecified.
 *
 * @module pdf/associatedFiles/associatedFiles
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAssociatedFiles = {
    name: 'pdfAssociatedFiles',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const STANDARD = new Set([
            'Source', 'Data', 'Alternative', 'Supplement',
            'EncryptedPayload', 'FormData', 'Schema', 'Unspecified'
        ]);

        function typeAssociatedFiles(arr, resolveRef) {
            if (!isType(arr, 'array')) {
                throw new ParseError('pdf/af/not-array',
                    '/AF must be an array',
                    { context: { type: arr && arr.type } });
            }
            const out = [];
            for (let i = 0; i < arr.items.length; i++) {
                const it = arr.items[i];
                let dict = it;
                if (it.type === 'ref') {
                    if (typeof resolveRef !== 'function') {
                        out.push({ ref: it, resolved: false });
                        continue;
                    }
                    dict = resolveRef(it);
                }
                if (!isType(dict, 'dict')) {
                    throw new ParseError('pdf/af/bad-entry',
                        '/AF entries must resolve to a dict',
                        { context: { index: i, type: dict && dict.type } });
                }
                const rel = dict.entries.AFRelationship;
                let relValue = null, standard = false;
                if (rel) {
                    if (rel.type !== 'name') {
                        throw new ParseError('pdf/af/bad-relationship',
                            '/AFRelationship must be a name',
                            { context: { index: i, type: rel.type } });
                    }
                    relValue = rel.value;
                    standard = STANDARD.has(relValue);
                }
                const rec = {
                    filespec: dict,
                    relationship: relValue,
                    standard
                };
                if (it.type === 'ref') rec.ref = { num: it.num, gen: it.gen };
                out.push(rec);
            }
            return out;
        }

        return { typeAssociatedFiles };
    }
};
