// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview File Specification typing per ISO 32000-2:2020 §7.11.
 *
 * A File Specification (`/Type /Filespec` or legacy `/Type /F`) refers
 * to an external or embedded file. Entries:
 *   /FS              — file system (URL or absent for local).
 *   /F /UF /DOS /Mac /Unix — file path forms (UF preferred since 1.7).
 *   /ID              — array of two byte-strings (uniqueness).
 *   /V               — boolean, volatile.
 *   /EF              — dict of embedded file streams (F, UF, DOS, …).
 *   /RF              — related files (dict of arrays).
 *   /Desc            — description string.
 *   /CI              — collection item dict.
 *   /AFRelationship  — name; PDF 2.0 Associated Files relationship.
 *
 * @module pdf/embedded/fileSpec
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfFileSpec = {
    name: 'pdfFileSpec',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Type', 'FS', 'F', 'UF', 'DOS', 'Mac', 'Unix', 'ID', 'V',
            'EF', 'RF', 'Desc', 'CI', 'AFRelationship', 'Thumb'
        ]);
        const REL = new Set([
            'Source', 'Data', 'Alternative', 'Supplement',
            'EncryptedPayload', 'FormData', 'Schema', 'Unspecified'
        ]);

        function typeFileSpec(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/filespec/not-dict',
                    'File spec must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && e.Type.type === 'name'
                && e.Type.value !== 'Filespec' && e.Type.value !== 'F') {
                throw new ParseError('pdf/filespec/bad-type',
                    '/Type must be /Filespec or /F when present',
                    { context: { actual: e.Type.value } });
            }

            const out = { raw: dict, _extras: {} };

            if (e.FS) {
                if (e.FS.type !== 'name') {
                    throw new ParseError('pdf/filespec/bad-fs',
                        '/FS must be a name', { context: { type: e.FS.type } });
                }
                out.fs = e.FS.value;
            }
            for (const k of ['F', 'UF', 'DOS', 'Mac', 'Unix']) {
                if (e[k]) {
                    if (e[k].type !== 'string') {
                        throw new ParseError('pdf/filespec/bad-path',
                            '/' + k + ' must be a string',
                            { context: { type: e[k].type } });
                    }
                    out[k.toLowerCase() === 'f' ? 'f' : k.toLowerCase()] = e[k].value;
                }
            }
            if (e.ID) {
                if (e.ID.type !== 'array') {
                    throw new ParseError('pdf/filespec/bad-id',
                        '/ID must be an array', { context: { type: e.ID.type } });
                }
                out.id = e.ID.items.filter((x) => x.type === 'string').map((x) => x.value);
            }
            if (e.V && e.V.type === 'bool') out.volatile = e.V.value;
            if (e.EF) {
                if (e.EF.type !== 'dict') {
                    throw new ParseError('pdf/filespec/bad-ef',
                        '/EF must be a dictionary',
                        { context: { type: e.EF.type } });
                }
                out.embedded = e.EF.entries;
            }
            if (e.RF) {
                if (e.RF.type !== 'dict') {
                    throw new ParseError('pdf/filespec/bad-rf',
                        '/RF must be a dictionary',
                        { context: { type: e.RF.type } });
                }
                out.related = e.RF.entries;
            }
            if (e.Desc) {
                if (e.Desc.type !== 'string') {
                    throw new ParseError('pdf/filespec/bad-desc',
                        '/Desc must be a string',
                        { context: { type: e.Desc.type } });
                }
                out.desc = e.Desc.value;
            }
            if (e.CI) out.ci = e.CI;
            if (e.AFRelationship) {
                if (e.AFRelationship.type !== 'name') {
                    throw new ParseError('pdf/filespec/bad-afrel',
                        '/AFRelationship must be a name',
                        { context: { type: e.AFRelationship.type } });
                }
                const v = e.AFRelationship.value;
                out.afRelationship = v;
                out.afRelationshipStandard = REL.has(v);
            }

            if (!out.f && !out.uf && !out.dos && !out.mac && !out.unix && !out.embedded) {
                throw new ParseError('pdf/filespec/empty',
                    'File spec has no path or embedded file');
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeFileSpec };
    }
};
