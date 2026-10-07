// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended /AF (Associated Files) typing.
 *
 * PDF 2.0 lets /AF live on the Catalog, Page, XObject (Form), Mark,
 * StructElem, Annot, or DParams. Each item references a File
 * Specification dictionary that MUST carry /AFRelationship.
 *
 * Relationship vocabulary: Source, Data, Alternative, Supplement,
 * EncryptedPayload, FormData, Schema, Unspecified.
 *
 * @module pdf/extra/associated-files
 */

import { pdfErrors } from '../errors.js';

export const pdfAssociatedFiles2 = {
    name: 'pdfAssociatedFiles2',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const STANDARD_REL = new Set([
            'Source', 'Data', 'Alternative', 'Supplement',
            'EncryptedPayload', 'FormData', 'Schema', 'Unspecified'
        ]);

        const CARRIER_HINTS = new Set([
            'Catalog', 'Page', 'XObject', 'StructElem', 'Annot', 'Mark', 'DParams'
        ]);

        function isDict(v) { return v && v.type === 'dict'; }
        function isName(v) { return v && v.type === 'name'; }
        function isArr(v) { return v && v.type === 'array'; }
        function isRef(v) { return v && v.type === 'ref'; }

        function resolveFileSpec(entry, resolveRef) {
            if (isRef(entry)) {
                if (typeof resolveRef === 'function') {
                    const r = resolveRef(entry);
                    return { resolved: true, dict: r, ref: { num: entry.num, gen: entry.gen } };
                }
                return { resolved: false, ref: { num: entry.num, gen: entry.gen } };
            }
            if (isDict(entry)) return { resolved: true, dict: entry };
            throw new ParseError('pdf/af2/bad-entry',
                '/AF entry must be a dict or indirect reference',
                { context: { type: entry && entry.type } });
        }

        function typeAfEntry(entry, resolveRef, index) {
            const res = resolveFileSpec(entry, resolveRef);
            if (!res.resolved) {
                return { ref: res.ref, resolved: false };
            }
            const dict = res.dict;
            if (!isDict(dict)) {
                throw new ParseError('pdf/af2/not-filespec',
                    'resolved /AF entry must be a dict',
                    { context: { index } });
            }
            const e = dict.entries;
            if (e.Type && (!isName(e.Type) || e.Type.value !== 'Filespec')) {
                throw new ParseError('pdf/af2/bad-filespec-type',
                    'expected /Type /Filespec',
                    { context: { index, actual: e.Type && e.Type.value } });
            }
            let rel = null, standard = false;
            if (e.AFRelationship) {
                if (!isName(e.AFRelationship)) {
                    throw new ParseError('pdf/af2/bad-relationship',
                        '/AFRelationship must be a name',
                        { context: { index, type: e.AFRelationship.type } });
                }
                rel = e.AFRelationship.value;
                standard = STANDARD_REL.has(rel);
            }
            const out = {
                filespec: dict,
                relationship: rel,
                standard,
                resolved: true
            };
            if (res.ref) out.ref = res.ref;
            return out;
        }

        function typeAf(afArray, opts) {
            const resolveRef = opts && opts.resolveRef;
            const carrier = opts && opts.carrier;
            if (carrier && !CARRIER_HINTS.has(carrier)) {
                throw new ParseError('pdf/af2/bad-carrier',
                    'unknown /AF carrier hint',
                    { context: { carrier } });
            }
            if (!isArr(afArray)) {
                throw new ParseError('pdf/af2/not-array',
                    '/AF must be an array',
                    { context: { type: afArray && afArray.type } });
            }
            const out = [];
            for (let i = 0; i < afArray.items.length; i++) {
                out.push(typeAfEntry(afArray.items[i], resolveRef, i));
            }
            return { entries: out, carrier: carrier || null };
        }

        function isStandardRelationship(name) {
            return STANDARD_REL.has(String(name));
        }

        function listStandardRelationships() {
            return Array.from(STANDARD_REL);
        }

        return {
            typeAf,
            typeAfEntry,
            resolveFileSpec,
            isStandardRelationship,
            listStandardRelationships,
            STANDARD_REL,
            CARRIER_HINTS
        };
    }
};
