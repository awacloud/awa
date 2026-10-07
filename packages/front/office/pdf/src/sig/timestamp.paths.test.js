// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfTimestamp` — malformed-token and dispatch paths.
 *
 * Complements `timestamp.test.js` (which drives the parser through an
 * asn1 stub) by exercising the module against the REAL fw `asn1`
 * encoder/parser: every token below is genuine DER built with
 * `asn1.encode*`, so the navigation, the typed-error contract and the
 * `_sliceTLV` long-form length handling are all asserted against real
 * bytes rather than a hand-shaped stub tree.
 *
 * No network, no wall clock: `genTime` is a pinned literal.
 *
 * @module pdf/sig/timestamp.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfTimestamp } from './timestamp.js';
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
import { asn1 as _fwAsn1 } from '@awacloud/fw/crypto/utils/asn1.js';

const A = _fwAsn1.factory();
const _errors = pdfErrors.factory();
const { ParseError } = _errors;
const _oids = pdfSigOids.factory(asn1Oid.factory());

const _ts = pdfTimestamp.factory(_errors, _oids, A,
    null, null, null, null, null, null);
const {
    parseTimestampToken, verifyTimestamp, extractTimestampFromUnsignedAttrs,
    OID_TST_INFO, OID_AA_TIMESTAMP
} = _ts;

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_ED25519 = '1.3.101.112';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';

/** Raw TLV with an explicit tag byte (for tags the encoder has no helper for). */
function tlv(tag, value) {
    const body = value instanceof Uint8Array ? value : new Uint8Array(value);
    let len;
    if (body.length < 0x80) len = Uint8Array.of(body.length);
    else if (body.length <= 0xff) len = Uint8Array.of(0x81, body.length);
    else len = Uint8Array.of(0x82, (body.length >>> 8) & 0xff, body.length & 0xff);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = tag;
    out.set(len, 1);
    out.set(body, 1 + len.length);
    return out;
}

function genTime(s) { return tlv(0x18, new TextEncoder().encode(s)); }

/**
 * Build a real RFC 3161 TimeStampToken.
 *
 * @param {Object} [o]
 * @param {Uint8Array[]} [o.tstFields] Override the TSTInfo children.
 * @param {string} [o.eContentOid] Override the eContentType OID.
 * @param {Uint8Array[]} [o.sdExtra] Extra SignedData children (signerInfos…).
 */
function buildToken(o) {
    o = o || {};
    const imprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(OID_SHA256), A.encodeNull()]),
        A.encodeOctetString(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]))
    ]);
    const tstFields = o.tstFields || [
        A.encodeInteger(new Uint8Array([1])),      // version
        A.encodeOid('1.2.3.4'),                    // policy
        imprint,                                   // messageImprint
        A.encodeInteger(new Uint8Array([0x2A])),   // serialNumber
        genTime('20240115120000Z')
    ];
    const tstInfo = A.encodeSequence(tstFields);
    const encap = A.encodeSequence([
        A.encodeOid(o.eContentOid || OID_TST_INFO),
        A.encodeExplicit(0, A.encodeOctetString(tstInfo))
    ]);
    const sdKids = [
        A.encodeInteger(new Uint8Array([3])),
        A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256)])]),
        encap
    ].concat(o.sdExtra || []);
    return A.encodeSequence([
        A.encodeOid(OID_SIGNED_DATA),
        A.encodeExplicit(0, A.encodeSequence(sdKids))
    ]);
}

describe('parseTimestampToken — real DER happy path', () => {
    test('recovers version, policy, imprint, serial and genTime', () => {
        const r = parseTimestampToken(buildToken(), A);
        expect(r.version).toBe(1);
        expect(r.policy).toBe('1.2.3.4');
        expect(r.messageImprint.hashAlg).toBe('sha256');
        expect(Array.from(r.messageImprint.hashedMessage))
            .toEqual([0xDE, 0xAD, 0xBE, 0xEF]);
        expect(Array.from(r.serialNumber)).toEqual([0x2A]);
        expect(r.genTime.toISOString()).toBe('2024-01-15T12:00:00.000Z');
        expect(r.nonce).toBeUndefined();
        expect(r.tsa).toBeUndefined();
    });

    test('surfaces the optional nonce (INTEGER) and tsa ([0]) fields', () => {
        const imprint = A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_SHA256)]),
            A.encodeOctetString(new Uint8Array([1, 2]))
        ]);
        const r = parseTimestampToken(buildToken({
            tstFields: [
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4'),
                imprint,
                A.encodeInteger(new Uint8Array([9])),
                genTime('20240115120000Z'),
                A.encodeInteger(new Uint8Array([0x7B])),        // nonce
                A.encodeExplicit(0, A.encodeOid('1.2.3'))       // tsa [0]
            ]
        }), A);
        expect(Array.from(r.nonce)).toEqual([0x7B]);
        expect(r.tsa).toBeInstanceOf(Uint8Array);
        expect(r.tsa.length).toBeGreaterThan(0);
    });

    test('keeps genTime null when the GeneralizedTime is unusable', () => {
        const imprint = A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_SHA256)]),
            A.encodeOctetString(new Uint8Array([1, 2]))
        ]);
        const short = parseTimestampToken(buildToken({
            tstFields: [
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4'), imprint,
                A.encodeInteger(new Uint8Array([9])),
                genTime('2024')                       // < 14 chars
            ]
        }), A);
        expect(short.genTime).toBe(null);
        const garbage = parseTimestampToken(buildToken({
            tstFields: [
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4'), imprint,
                A.encodeInteger(new Uint8Array([9])),
                genTime('NOT-A-TIMESTAMP')            // >= 14, unmatched
            ]
        }), A);
        expect(garbage.genTime).toBe(null);
    });

    test('leaves messageImprint null when it has fewer than 2 fields', () => {
        const r = parseTimestampToken(buildToken({
            tstFields: [
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4'),
                A.encodeSequence([A.encodeOid(OID_SHA256)]),   // 1 child only
                A.encodeInteger(new Uint8Array([9])),
                genTime('20240115120000Z')
            ]
        }), A);
        expect(r.messageImprint).toBe(null);
    });
});

describe('parseTimestampToken — malformed tokens', () => {
    function expectCode(blob, code) {
        let caught = null;
        try { parseTimestampToken(blob, A); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe(code);
    }

    test('ContentInfo parse failure', () => {
        // Declared length exceeds the buffer → parseOne returns false.
        expectCode(new Uint8Array([0x30, 0x7F, 0x00]), 'pdf/ts/malformed');
    });

    test('ContentInfo with a single child', () => {
        expectCode(A.encodeSequence([A.encodeOid(OID_SIGNED_DATA)]),
            'pdf/ts/malformed');
    });

    test('SignedData node parse failure', () => {
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            tlv(0xA0, new Uint8Array([0x30, 0x7F]))   // truncated inner TLV
        ]);
        expectCode(blob, 'pdf/ts/malformed');
    });

    test('SignedData children parse failure', () => {
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            tlv(0xA0, tlv(0x30, new Uint8Array([0x30, 0x7F])))
        ]);
        expectCode(blob, 'pdf/ts/malformed');
    });

    test('missing encapContentInfo', () => {
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence([
                A.encodeInteger(new Uint8Array([3])),
                A.encodeSet([])
            ]))
        ]);
        expectCode(blob, 'pdf/ts/no-econtent');
    });

    test('eContentType is not id-ct-TSTInfo', () => {
        let caught = null;
        try { parseTimestampToken(buildToken({ eContentOid: OID_DATA }), A); }
        catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/ts/wrong-econtent');
        expect(caught.context.oid).toBe(OID_DATA);
    });

    test('TSTInfo OCTET STRING missing', () => {
        const encap = A.encodeSequence([
            A.encodeOid(OID_TST_INFO),
            tlv(0xA0, new Uint8Array([0x04, 0x7F]))
        ]);
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence([
                A.encodeInteger(new Uint8Array([3])),
                A.encodeSet([]), encap
            ]))
        ]);
        expectCode(blob, 'pdf/ts/no-tstinfo');
    });

    test('TSTInfo SEQUENCE parse failure', () => {
        const encap = A.encodeSequence([
            A.encodeOid(OID_TST_INFO),
            A.encodeExplicit(0,
                A.encodeOctetString(new Uint8Array([0x30, 0x7F])))
        ]);
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence([
                A.encodeInteger(new Uint8Array([3])),
                A.encodeSet([]), encap
            ]))
        ]);
        expectCode(blob, 'pdf/ts/bad-tstinfo');
    });

    test('TSTInfo with fewer than 4 fields', () => {
        let caught = null;
        try {
            parseTimestampToken(buildToken({
                tstFields: [A.encodeInteger(new Uint8Array([1])),
                            A.encodeOid('1.2.3.4')]
            }), A);
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/ts/bad-tstinfo');
        expect(caught.message).toContain('too short');
    });
});

describe('verifyTimestamp — real DER', () => {
    test('reports the parse error instead of throwing', () => {
        const r = verifyTimestamp(new Uint8Array([0x30, 0x7F, 0x00]),
            { asn1: A });
        expect(r.valid).toBe(false);
        expect(r.tstInfo).toBe(null);
        expect(r.hashAlg).toBe(null);
        expect(r.signatureAlg).toBe(null);
        expect(r.errors.length).toBe(1);
        expect(r.errors[0].code).toBe('pdf/ts/malformed');
        expect(r.errors[0].cause).toBeInstanceOf(ParseError);
    });

    test('dispatches signatureAlg from the SignerInfo algorithm OID', () => {
        const signerInfo = A.encodeSequence([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeSequence([A.encodeOid(OID_ED25519)]),   // sigAlg
            A.encodeOctetString(new Uint8Array(8))          // signature
        ]);
        const r = verifyTimestamp(
            buildToken({ sdExtra: [A.encodeSet([signerInfo])] }),
            { asn1: A });
        expect(r.valid).toBe(true);
        expect(r.hashAlg).toBe('sha256');
        expect(r.signatureAlg).toBe('ed25519');
        expect(r.tstInfo.policy).toBe('1.2.3.4');
    });

    test('leaves signatureAlg null when the OID is unknown', () => {
        const signerInfo = A.encodeSequence([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeSequence([A.encodeOid('1.2.3.999')]),
            A.encodeOctetString(new Uint8Array(8))
        ]);
        const r = verifyTimestamp(
            buildToken({ sdExtra: [A.encodeSet([signerInfo])] }),
            { asn1: A });
        expect(r.valid).toBe(true);
        expect(r.signatureAlg).toBe(null);
    });

    test('leaves signatureAlg null when no signerInfos SET is present', () => {
        // The digestAlgorithms SET is the only 0x31 — its children are
        // AlgorithmIdentifiers, not SignerInfos, so no (0x30, 0x04) pair
        // is found.
        const r = verifyTimestamp(buildToken(), { asn1: A });
        expect(r.valid).toBe(true);
        expect(r.signatureAlg).toBe(null);
    });
});

describe('extractTimestampFromUnsignedAttrs — real DER', () => {
    function attrNode(oid, inner) {
        const attr = A.encodeSequence([A.encodeOid(oid), A.encodeSet([inner])]);
        return A.parseOne(attr, 0);
    }

    test('returns the token TLV for the signature-timestamp attribute', () => {
        const token = A.encodeSequence([A.encodeOid('1.2.3'),
                                        A.encodeOctetString(new Uint8Array(4))]);
        const out = extractTimestampFromUnsignedAttrs(
            [attrNode(OID_AA_TIMESTAMP, token)], A);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Array.from(out)).toEqual(Array.from(token));
    });

    test('slices a long-form length correctly (> 127 content bytes)', () => {
        const big = A.encodeOctetString(new Uint8Array(300));
        const token = A.encodeSequence([big]);
        expect(token[1] & 0x80).toBe(0x80);            // long-form length
        const out = extractTimestampFromUnsignedAttrs(
            [attrNode(OID_AA_TIMESTAMP, token)], A);
        expect(out.length).toBe(token.length);
        expect(Array.from(out.subarray(0, 4)))
            .toEqual(Array.from(token.subarray(0, 4)));
    });

    test('skips attributes whose SET is empty', () => {
        const empty = A.parseOne(
            A.encodeSequence([A.encodeOid(OID_AA_TIMESTAMP), A.encodeSet([])]),
            0);
        expect(extractTimestampFromUnsignedAttrs([empty], A)).toBe(null);
    });

    test('skips a one-child attribute and returns null for a non-array', () => {
        const short = A.parseOne(
            A.encodeSequence([A.encodeOid(OID_AA_TIMESTAMP)]), 0);
        expect(extractTimestampFromUnsignedAttrs([short], A)).toBe(null);
        expect(extractTimestampFromUnsignedAttrs(null, A)).toBe(null);
    });
});
