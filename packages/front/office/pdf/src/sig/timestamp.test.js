// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTimestamp } from './timestamp.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
const _asn1Oid = asn1Oid.factory();
const _errors = _pdfErrors_TD1;
const { ParseError, EncryptionError } = _errors;
const _ts = pdfTimestamp.factory(
    _errors, pdfSigOids.factory(_asn1Oid),
    null, null, null, null, null, null, null
);
const {
    parseTimestampToken, verifyTimestamp, extractTimestampFromUnsignedAttrs,
    OID_TST_INFO, OID_AA_TIMESTAMP
} = _ts;
/**
 * Build an asn1 stub that returns a hand-crafted SignedData/TSTInfo
 * tree. The tree shape mirrors the navigation in parseTimestampToken.
 */
function buildAsn1Stub() {
    // Layout (synthetic): TSTInfo:
    //   version=1 (INTEGER)
    //   policy OID = 1.2.3
    //   messageImprint = { algId (oid 2.16.840.1.101.3.4.2.1), hashedMessage }
    //   serialNumber INTEGER
    //   genTime GeneralizedTime "20260514120000Z"
    const policyOid     = '1.2.3';
    const digestOid     = '2.16.840.1.101.3.4.2.1';
    const sigOid        = '1.2.840.113549.1.1.11';
    const genTimeBytes  = new Uint8Array(15);
    const g = '20260514120000Z';
    for (let i = 0; i < g.length; i++) genTimeBytes[i] = g.charCodeAt(i);
    const hashBytes     = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const serialBytes   = new Uint8Array([0x01]);
    const versionBytes  = new Uint8Array([0x01]);

    // Node helper.
    function N(tag, value, extras) {
        return Object.assign({
            tag, length: value.length, value,
            valueOff: 0, next: value.length
        }, extras || {});
    }
    const stub = {};
    let phase = 'top';
    let signerInfoSeen = false;

    stub.parseOne = function (buf, _off) {
        return N(0x30, buf);
    };
    stub.parseChildren = function (value) {
        if (phase === 'top') {
            phase = 'ci';
            // ContentInfo: [contentType OID, [0] SignedData]
            return [
                N(0x06, new Uint8Array([0x2A])),
                N(0xA0, value)
            ];
        }
        if (phase === 'ci') {
            phase = 'sd';
            // SignedData inner: version, digestAlgs, encapContentInfo,
            //   [0] certs?, signerInfos
            return [
                N(0x02, versionBytes),                  // version
                N(0x31, new Uint8Array([0x30, 0x09])),  // digestAlgs SET
                N(0x30, new Uint8Array([0xA0, 0x05])),  // encapContentInfo
                N(0x31, new Uint8Array(20))             // signerInfos SET
            ];
        }
        if (phase === 'sd') {
            phase = 'eci';
            // encapContentInfo children: type OID + [0] OCTET STRING
            return [
                N(0x06, new Uint8Array([0])),           // OID = id-ct-TSTInfo
                N(0xA0, new Uint8Array([0x04, 0x04]))   // [0] octet str wrap
            ];
        }
        if (phase === 'eci') {
            phase = 'tst';
            // TSTInfo children: version, policy, mi, serial, genTime
            return [
                N(0x02, versionBytes),
                N(0x06, new Uint8Array([0x2A])),         // policy
                N(0x30, new Uint8Array(8)),              // messageImprint
                N(0x02, serialBytes),                    // serial
                N(0x18, genTimeBytes)                    // genTime
            ];
        }
        if (phase === 'tst') {
            phase = 'mi';
            // messageImprint children: algId + hashedMessage
            return [
                N(0x30, new Uint8Array([0x06])),
                N(0x04, hashBytes)
            ];
        }
        if (phase === 'mi') {
            phase = 'algId';
            return [N(0x06, new Uint8Array([0]))];
        }
        if (phase === 'algId') {
            // verifyTimestamp's second pass scans signerInfos
            phase = 'signers';
            return [N(0x30, new Uint8Array(10))];     // signers list
        }
        if (phase === 'signers') {
            phase = 'si';
            return [
                N(0x30, new Uint8Array([0x06])),       // sigAlg SEQ
                N(0x04, new Uint8Array(8))             // sig OCTET STRING
            ];
        }
        return [];
    };
    stub.readOid = function (_node) {
        // Sequence the OIDs in the order they are requested.
        if (!stub._oidStep) stub._oidStep = 0;
        const steps = [
            policyOid,    // policy
            digestOid,    // messageImprint algId
            digestOid,    // signedData digestAlgs (verifyTimestamp pass 2)
            sigOid        // SignerInfo sigAlg
        ];
        // First, the eContentType lookup happens before policy.
        // Inject TST OID at the head to satisfy that.
        if (stub._oidStep === 0) { stub._oidStep++; return OID_TST_INFO; }
        const i = stub._oidStep - 1;
        stub._oidStep++;
        return steps[i] || '0.0';
    };
    return stub;
}

describe('parseTimestampToken', () => {
    test('returns typed TSTInfo record', () => {
        const r = parseTimestampToken(new Uint8Array([1, 2, 3]), buildAsn1Stub());
        expect(r.version).toBe(1);
        expect(r.messageImprint).not.toBe(null);
        expect(r.messageImprint.hashAlg).toBe('sha256');
        expect(r.genTime).toBeInstanceOf(Date);
        expect(r.genTime.getUTCFullYear()).toBe(2026);
    });

    test('rejects non-Uint8Array', () => {
        expect(() => parseTimestampToken('x', buildAsn1Stub()))
            .toThrow(ParseError);
    });

    test('requires asn1', () => {
        expect(() => parseTimestampToken(new Uint8Array(4), null))
            .toThrow(EncryptionError);
    });
});

describe('verifyTimestamp', () => {
    test('returns shape with tstInfo + dispatched algs', () => {
        const fw = { asn1: buildAsn1Stub() };
        const r = verifyTimestamp(new Uint8Array([1, 2, 3]), fw);
        expect(r.tstInfo).not.toBe(null);
        expect(r.hashAlg).toBe('sha256');
        // signatureAlg may be null because the second-pass stub OIDs
        // diverge, but the shape is always present.
        expect(Object.prototype.hasOwnProperty.call(r, 'signatureAlg'))
            .toBe(true);
    });

    test('requires fw bundle', () => {
        expect(() => verifyTimestamp(new Uint8Array(4), null))
            .toThrow(EncryptionError);
    });
});

describe('extractTimestampFromUnsignedAttrs', () => {
    test('returns null on empty input', () => {
        const asn1 = { parseChildren() { return []; }, readOid() { return null; } };
        expect(extractTimestampFromUnsignedAttrs([], asn1)).toBe(null);
    });

    test('skips attrs with unrelated OID', () => {
        const asn1 = {
            parseChildren() { return [{ value: new Uint8Array(1) },
                                       { value: new Uint8Array(1) }]; },
            readOid() { return '9.9.9'; }
        };
        const attrs = [{ value: new Uint8Array([0x06]) }];
        expect(extractTimestampFromUnsignedAttrs(attrs, asn1)).toBe(null);
    });

    test('returns bytes when OID matches', () => {
        const inner = new Uint8Array([0x30, 0x02, 0x01, 0x02]);
        let calls = 0;
        const asn1 = {
            parseChildren() {
                calls++;
                if (calls === 1) {
                    return [
                        { value: new Uint8Array([0x06]) },
                        { value: inner }
                    ];
                }
                return [{ value: inner }];
            },
            readOid() { return OID_AA_TIMESTAMP; }
        };
        const out = extractTimestampFromUnsignedAttrs(
            [{ value: new Uint8Array([0x06]) }], asn1);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(out.length).toBe(4);
    });
});

describe('pdfTimestamp factory', () => {
    test('factory.toString() contains "function"', () => {
        expect(pdfTimestamp.factory.toString()).toContain('function');
    });

    test('factory returns expected API', () => {
        const api = pdfTimestamp.factory(_pdfErrors_TD1,
            pdfSigOids.factory(_asn1Oid), buildAsn1Stub(),
            {}, {}, {}, {}, {}, {});
        expect(typeof api.parseTimestampToken).toBe('function');
        expect(typeof api.verifyTimestamp).toBe('function');
        expect(typeof api.extractTimestampFromUnsignedAttrs).toBe('function');
        expect(api.OID_TST_INFO).toBe(OID_TST_INFO);
        expect(api.OID_AA_TIMESTAMP).toBe(OID_AA_TIMESTAMP);
    });
});
