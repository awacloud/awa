// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: the public-key security handler's dictionaries and
 * the crypt filter maps, typed (ISO 32000-2 §7.6.5, §7.6.6, §7.6.7) — a
 * public-key crypt filter (`/Recipients` …), a map of public-key crypt
 * filters (`/DefaultCryptFilter`, `/DefEmbeddedFile` …), a map of Standard
 * crypt filters (`/Identity`, `/StdCF` …), and an unencrypted wrapper
 * document's `/EncryptedPayload`. Typing only: the package decrypts the
 * Standard handler alone.
 *
 * Each typer takes a parser dictionary node and returns a record with
 * every key it names copied, `raw`, and `_extras` for the others.
 *
 * @module pdf/extra/crypt-public-key
 */

import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfSigAesGcm } from './sig-aes-gcm.js';

export const pdfCryptPublicKey = {
    name: 'pdfCryptPublicKey',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfSigAesGcm'],
    deps: [pdfErrors, pdfParser, pdfSigAesGcm],
    factory(errors, parser, aesGcm) {
        const { ParseError } = errors;
        const { isType } = parser;

        function dictOf(dict, what) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/crypt-public-key/not-dict',
                    `${what} must be a dictionary`,
                    { context: { type: dict && dict.type } });
            }
            return dict.entries;
        }
        const nameOf = (v) => (isType(v, 'name') ? v.value : null);
        const extrasOf = (e, known) => {
            const out = {};
            for (const k of Object.keys(e)) if (!known.has(k)) out[k] = e[k];
            return out;
        };
        // A byte string, or an array of them, as an array of bytes.
        function byteStrings(v) {
            if (isType(v, 'string')) return [v.value];
            if (isType(v, 'array')) return v.items.filter(i => isType(i, 'string')).map(i => i.value);
            return null;
        }

        const PK_FILTER_KNOWN = new Set(['Recipients', 'EncryptMetadata', 'Type', 'CFM', 'AuthEvent', 'Length']);
        /**
         * A public-key crypt filter (Table 27): `recipients` (the PKCS#7
         * objects, bytes), `encryptMetadata` (default true), `cfm`,
         * `authEvent`, `length`, `type`.
         */
        function typeCryptFilterPublicKey(dict) {
            const e = dictOf(dict, 'a public-key crypt filter');
            const out = {
                recipients: byteStrings(e.Recipients),
                encryptMetadata: isType(e.EncryptMetadata, 'bool') ? e.EncryptMetadata.value : true,
                cfm: nameOf(e.CFM),
                authEvent: nameOf(e.AuthEvent),
                length: isType(e.Length, 'int') ? e.Length.value : null,
                raw: dict,
                _extras: extrasOf(e, PK_FILTER_KNOWN)
            };
            if (isType(e.Type, 'name')) out.type = e.Type.value;
            return out;
        }

        // A map of crypt filters: each dictionary entry typed by `typeOne`;
        // an entry that is not a dictionary stays in `_extras`.
        function typeMap(dict, what, typeOne) {
            const e = dictOf(dict, what);
            const filters = {};
            const extras = {};
            for (const name of Object.keys(e)) {
                if (isType(e[name], 'dict')) filters[name] = typeOne(e[name]);
                else extras[name] = e[name];
            }
            return { filters, raw: dict, _extras: extras };
        }
        /** A `/CF` map of public-key crypt filters (`DefaultCryptFilter`, `DefEmbeddedFile` …). */
        function typeCryptFilterPublicKeyMap(dict) {
            return typeMap(dict, 'a public-key crypt filter map', typeCryptFilterPublicKey);
        }
        /** A `/CF` map of Standard crypt filters (`Identity`, `StdCF` …), each through `pdfSigAesGcm.typeCfEntry`. */
        function typeCryptFilterMap(dict) {
            return typeMap(dict, 'a crypt filter map', aesGcm.typeCfEntry);
        }

        const PAYLOAD_KNOWN = new Set(['Type', 'Subtype', 'Version']);
        /**
         * An unencrypted wrapper document's `/EncryptedPayload` (§7.6.7):
         * `subtype` (the cryptographic filter's name), `version`, `type`.
         */
        function typeEncryptedPayload(dict) {
            const e = dictOf(dict, '/EncryptedPayload');
            const out = {
                subtype: nameOf(e.Subtype),
                version: nameOf(e.Version),
                raw: dict,
                _extras: extrasOf(e, PAYLOAD_KNOWN)
            };
            if (isType(e.Type, 'name')) out.type = e.Type.value;
            return out;
        }

        return { typeCryptFilterPublicKey, typeCryptFilterPublicKeyMap, typeCryptFilterMap, typeEncryptedPayload };
    }
};
