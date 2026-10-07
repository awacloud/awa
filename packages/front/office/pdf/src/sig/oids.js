// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared OID dispatch tables for the `pdf/sig/*` family.
 *
 * Thin adapter over `@awacloud/fw/crypto/utils/asn1-oid.js` — the canonical
 * OID database (~150 entries covering PKCS, X.509, CMS, JOSE, PAdES,
 * ECC, AES). This module **does not** duplicate the data ; it filters
 * and normalises a subset for the dispatch semantics expected by the
 * PDF signature code path :
 *
 *   - `DIGEST_OIDS`           — OID → fw hash module name
 *                               (`'sha256'`, `'sha384'`, `'sha512'`, `'sha1'`).
 *   - `SIG_DISPATCH_OIDS`     — OID → fw verifier name
 *                               (`'rsa'`, `'rsa-pss'`, `'ecc'`, `'ed25519'`).
 *   - `KEY_ALG_OIDS`          — SPKI algorithm OID → short algorithm name
 *                               (`'rsa'`, `'ecc'`, `'ed25519'`, `'ed448'`).
 *   - `SIG_ALG_OIDS_VERBOSE`  — cert `sigAlgorithm` verbose name
 *                               (e.g. `'sha256WithRSAEncryption'`,
 *                               `'ecdsa-with-SHA256'`, `'rsassa-pss'`).
 *   - `OID_TST_INFO`/`OID_AA_TIMESTAMP` — RFC 3161 constants.
 *   - `shortOid()`            — DN attribute OID → `'CN'`/`'O'`/… short form,
 *                               delegated to `asn1Oid.lookup(oid).shortName`.
 *
 * Adding/renaming an OID happens in fw's `asn1Oid` database ; this
 * module just decides how to surface the entry to PDF callers.
 *
 * Factory-only strict — no top-level binding besides this descriptor.
 *
 * @module pdf/sig/oids
 */

import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';

export const pdfSigOids = {
    name: 'pdfSigOids',
    dependencies: ['asn1Oid'],
    deps: [asn1Oid],
    factory(asn1Oid) {
        // ── Dispatch tables built from fw's database ─────────────────
        //
        // We rebuild static `Object.freeze`-d tables for two reasons :
        //   1. Existing consumers (signature.js, timestamp.js,
        //      certChain.js, sign.js) destructure the tables and look
        //      up by OID directly — keeping the table shape avoids
        //      cascading refactors.
        //   2. The dispatch semantics (e.g. mapping multiple
        //      `*WithRSAEncryption` OIDs to a single `'rsa'` verifier
        //      name) are PDF-domain decisions that don't belong in fw.

        // DIGEST_OIDS — fw hash module names. fw stores `hashAlg` as
        // `'sha-256'` (RFC 5280 form) and digest-category entries as
        // `name: 'sha256'`. We surface the fw module name (no dash).
        const DIGEST_OID_LIST = [
            '2.16.840.1.101.3.4.2.1', // sha256
            '2.16.840.1.101.3.4.2.2', // sha384
            '2.16.840.1.101.3.4.2.3', // sha512
            '1.3.14.3.2.26'           // sha1
        ];
        const _digest = {};
        for (const oid of DIGEST_OID_LIST) {
            const e = asn1Oid.lookup(oid);
            if (e) _digest[oid] = e.name; // 'sha256', 'sha384', 'sha512', 'sha1'
        }
        const DIGEST_OIDS = Object.freeze(_digest);

        // SIG_DISPATCH_OIDS — verifier name. PDF maps:
        //   PKCS#1 v1.5 family       → 'rsa'
        //   RSASSA-PSS                → 'rsa-pss'
        //   id-ecPublicKey + ECDSA-W  → 'ecc'
        //   id-Ed25519                → 'ed25519'
        const SIG_DISPATCH_OID_LIST = [
            ['1.2.840.113549.1.1.1',  'rsa'],     // rsaEncryption (PKCS#1 v1.5)
            ['1.2.840.113549.1.1.11', 'rsa'],     // sha256WithRSAEncryption
            ['1.2.840.113549.1.1.12', 'rsa'],     // sha384WithRSAEncryption
            ['1.2.840.113549.1.1.13', 'rsa'],     // sha512WithRSAEncryption
            ['1.2.840.113549.1.1.10', 'rsa-pss'], // id-RSASSA-PSS
            ['1.2.840.10045.2.1',     'ecc'],     // id-ecPublicKey
            ['1.2.840.10045.4.3.2',   'ecc'],     // ecdsa-with-SHA256
            ['1.2.840.10045.4.3.3',   'ecc'],     // ecdsa-with-SHA384
            ['1.2.840.10045.4.3.4',   'ecc'],     // ecdsa-with-SHA512
            ['1.3.101.112',           'ed25519']  // id-Ed25519
        ];
        const _sig = {};
        for (const [oid, dispatch] of SIG_DISPATCH_OID_LIST) {
            if (asn1Oid.lookup(oid)) _sig[oid] = dispatch;
        }
        const SIG_DISPATCH_OIDS = Object.freeze(_sig);

        // KEY_ALG_OIDS — SPKI base algo (no hash suffix).
        const KEY_ALG_OID_LIST = [
            ['1.2.840.113549.1.1.1', 'rsa'],
            ['1.2.840.10045.2.1',    'ecc'],
            ['1.3.101.112',          'ed25519'],
            ['1.3.101.113',          'ed448']
        ];
        const _key = {};
        for (const [oid, alg] of KEY_ALG_OID_LIST) {
            if (asn1Oid.lookup(oid)) _key[oid] = alg;
        }
        const KEY_ALG_OIDS = Object.freeze(_key);

        // SIG_ALG_OIDS_VERBOSE — cert sigAlgorithm verbose name. PDF
        // uses RFC-canonical wire-format names that differ slightly
        // from fw's `name` field.
        const _verbose = {
            '1.2.840.113549.1.1.5':  'sha1WithRSAEncryption',
            '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
            '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
            '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
            '1.2.840.113549.1.1.10': 'rsassa-pss',
            '1.2.840.10045.4.3.2':   'ecdsa-with-SHA256',
            '1.2.840.10045.4.3.3':   'ecdsa-with-SHA384',
            '1.2.840.10045.4.3.4':   'ecdsa-with-SHA512',
            '1.3.101.112':           'ed25519',
            '1.3.101.113':           'ed448'
        };
        // Strip OIDs that fw doesn't know (paranoia : keeps fw as
        // single source of truth for what's a valid OID).
        for (const oid of Object.keys(_verbose)) {
            if (!asn1Oid.lookup(oid)) delete _verbose[oid];
        }
        const SIG_ALG_OIDS_VERBOSE = Object.freeze(_verbose);

        // RFC 3161 constants — also in fw's pkcs9 / pkcs7 categories,
        // re-exposed here for caller ergonomics.
        const OID_TST_INFO     = '1.2.840.113549.1.9.16.1.4';
        const OID_AA_TIMESTAMP = '1.2.840.113549.1.9.16.2.14';

        // ── Helpers ──────────────────────────────────────────────────

        /** DN attribute OID → short form (CN, O, OU, C, …). */
        function shortOid(oid) {
            const e = asn1Oid.lookup(oid);
            if (e && e.category === 'x509-dn') return e.shortName;
            // PKCS#9 emailAddress is also rendered as 'E' in DNs.
            if (oid === '1.2.840.113549.1.9.1') return 'E';
            return oid;
        }

        function lookupDigest(oid)     { return DIGEST_OIDS[oid]          || null; }
        function lookupSigAlg(oid)     { return SIG_DISPATCH_OIDS[oid]    || null; }
        function lookupKeyAlg(oid)     { return KEY_ALG_OIDS[oid]         || null; }
        function lookupSigVerbose(oid) { return SIG_ALG_OIDS_VERBOSE[oid] || null; }

        return {
            DIGEST_OIDS, SIG_DISPATCH_OIDS,
            KEY_ALG_OIDS, SIG_ALG_OIDS_VERBOSE,
            OID_TST_INFO, OID_AA_TIMESTAMP,
            lookupDigest, lookupSigAlg, lookupKeyAlg, lookupSigVerbose,
            shortOid
        };
    }
};
