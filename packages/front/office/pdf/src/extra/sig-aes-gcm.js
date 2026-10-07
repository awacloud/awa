// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: AES-GCM crypt filter wrapper for `/Encrypt`
 * dictionaries — ISO/TS 32003.
 *
 * @module pdf/extra/sig-aes-gcm
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfSigAesGcm = {
    name: 'pdfSigAesGcm',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError, EncryptionError } = errors;
        const { isType } = parser;

        /** Frozen catalog of known Crypt Filter Methods (CFM names). */
        const CFM_CATALOG = Object.freeze({
            None:   { cipher: 'none', keyBits: 0,   notes: 'identity / stream-as-is' },
            V2:     { cipher: 'rc4',  keyBits: 40,  notes: 'legacy RC4 (deprecated)' },
            AESV2:  { cipher: 'aes',  keyBits: 128, mode: 'cbc',
                      notes: 'AES-128 CBC (R4)' },
            AESV3:  { cipher: 'aes',  keyBits: 256, mode: 'cbc',
                      notes: 'AES-256 CBC (R6, ISO 32000-2)' },
            AESV4:  { cipher: 'aes',  keyBits: 256, mode: 'gcm',
                      notes: 'AES-256 GCM (ISO/TS 32003)' }
        });

        const ENCRYPT_KNOWN = new Set([
            'Filter', 'SubFilter', 'V', 'Length', 'CF', 'StmF', 'StrF', 'EFF',
            'R', 'O', 'U', 'OE', 'UE', 'Perms', 'P', 'EncryptMetadata'
        ]);
        const CF_ENTRY_KNOWN = new Set(['Type', 'CFM', 'AuthEvent', 'Length']);

        function typeEncryptForGcm(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/sig-aes-gcm/not-dict',
                    '/Encrypt must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = {
                v:        isType(e.V, 'int') ? e.V.value : null,
                r:        isType(e.R, 'int') ? e.R.value : null,
                length:   isType(e.Length, 'int') ? e.Length.value : null,
                stmF:     isType(e.StmF, 'name') ? e.StmF.value : null,
                strF:     isType(e.StrF, 'name') ? e.StrF.value : null,
                eff:      isType(e.EFF,  'name') ? e.EFF.value  : null,
                cf:       {},
                hasAesGcm: false,
                raw:      dict,
                _extras:  {}
            };
            if (e.CF !== undefined) {
                if (!isType(e.CF, 'dict')) {
                    throw new ParseError('pdf/extra/sig-aes-gcm/bad-cf',
                        '/CF must be a dictionary',
                        { context: { type: e.CF.type } });
                }
                for (const name of Object.keys(e.CF.entries)) {
                    const entry = e.CF.entries[name];
                    if (!isType(entry, 'dict')) {
                        throw new ParseError('pdf/extra/sig-aes-gcm/bad-cf-entry',
                            '/CF entry must be a dictionary',
                            { context: { name } });
                    }
                    out.cf[name] = typeCfEntry(entry);
                    if (out.cf[name].cfm === 'AESV4') out.hasAesGcm = true;
                }
            }
            for (const k of Object.keys(e)) {
                if (!ENCRYPT_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeCfEntry(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/sig-aes-gcm/cf-entry-not-dict',
                    'CF entry must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const cfm = isType(e.CFM, 'name') ? e.CFM.value : null;
            const out = {
                cfm,
                authEvent: isType(e.AuthEvent, 'name') ? e.AuthEvent.value : null,
                length:    isType(e.Length, 'int') ? e.Length.value : null,
                catalog:   cfm && CFM_CATALOG[cfm] ? CFM_CATALOG[cfm] : null,
                raw:       dict,
                _extras:   {}
            };
            for (const k of Object.keys(e)) {
                if (!CF_ENTRY_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function validateGcmFraming(framed) {
            if (!(framed instanceof Uint8Array)) {
                throw new EncryptionError('pdf/extra/sig-aes-gcm/bad-input',
                    'framed input must be a Uint8Array',
                    { context: { type: typeof framed } });
            }
            if (framed.length < 12 + 16) {
                throw new EncryptionError('pdf/extra/sig-aes-gcm/too-short',
                    'AES-GCM framed blob must be at least 28 bytes (IV+tag)',
                    { context: { length: framed.length } });
            }
            return {
                iv:         framed.subarray(0, 12),
                ciphertext: framed.subarray(12, framed.length - 16),
                tag:        framed.subarray(framed.length - 16)
            };
        }

        return {
            typeEncryptForGcm,
            typeCfEntry,
            validateGcmFraming,
            CFM_CATALOG
        };
    }
};

