// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';

const _asn1Oid = asn1Oid.factory();
const _oids = pdfSigOids.factory(_asn1Oid);
const { SIG_DISPATCH_OIDS, KEY_ALG_OIDS } = _oids;

const EC_PUBLIC_KEY_OID = '1.2.840.10045.2.1'; // id-ecPublicKey

describe('pdfSigOids module', () => {
    test('should have correct module metadata', () => {
        expect(pdfSigOids.name).toBe('pdfSigOids');
        expect(pdfSigOids.dependencies).toEqual(['asn1Oid']);
        expect(typeof pdfSigOids.factory).toBe('function');
    });

    describe('id-ecPublicKey (BL-273)', () => {
        // fw's asn1Oid database now carries an entry for
        // 1.2.840.10045.2.1 (added alongside this test) - the guarded
        // loops building SIG_DISPATCH_OIDS/KEY_ALG_OIDS
        // (oids.js:83-85, :96-98) call `asn1Oid.lookup(oid)` before
        // keeping an entry, so a SignerInfo/SPKI carrying this OID no
        // longer silently drops to unknown-sigalg/raw OID.

        test('SIG_DISPATCH_OIDS carries the ecc mapping for id-ecPublicKey', () => {
            expect(SIG_DISPATCH_OIDS[EC_PUBLIC_KEY_OID]).toBe('ecc');
        });

        test('KEY_ALG_OIDS carries the ecc mapping for id-ecPublicKey', () => {
            expect(KEY_ALG_OIDS[EC_PUBLIC_KEY_OID]).toBe('ecc');
        });

        test('fw asn1Oid resolves id-ecPublicKey (precondition for the guarded loops)', () => {
            const e = _asn1Oid.lookup(EC_PUBLIC_KEY_OID);
            expect(e).not.toBeNull();
            expect(e.name).toBe('ecPublicKey');
        });
    });
});
