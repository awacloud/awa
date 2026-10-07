// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfCertChain } from './certChain.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
const _asn1Oid = asn1Oid.factory();
const _errors = _pdfErrors_TD1;
const { ParseError, EncryptionError } = _errors;
// asn1/pem are passed explicitly to each test call — factory wires nulls.
const {
    extractCertsFromCms, extractCertFromPem, parseCertificate,
    findIssuer, validateChainOrder
} = pdfCertChain.factory(_errors, pdfSigOids.factory(_asn1Oid), null, null);
/**
 * Build an asn1 stub returning a synthetic Certificate tree.
 */
function buildCertAsn1() {
    function N(tag, value) {
        return { tag, length: value.length, value,
                 valueOff: 1, next: 1 + value.length };
    }
    // Tag-based markers let parseChildren return the right tree
    // regardless of call order.
    const MARK_TBS      = new Uint8Array([0xF0]);
    const MARK_SIGALG   = new Uint8Array([0xF1]);
    const MARK_ISSUER   = new Uint8Array([0xF2]);
    const MARK_VALIDITY = new Uint8Array([0xF3]);
    const MARK_SUBJECT  = new Uint8Array([0xF4]);
    const MARK_SPKI     = new Uint8Array([0xF5]);
    const MARK_RDN_I    = new Uint8Array([0xE2]);
    const MARK_RDN_S    = new Uint8Array([0xE4]);
    const MARK_TV_I     = new Uint8Array([0xD2]);
    const MARK_TV_S     = new Uint8Array([0xD4]);
    const MARK_SPKI_ALG = new Uint8Array([0xC5]);
    const OID_CN        = new Uint8Array([0x55, 0x04, 0x03]);
    const OID_SIG       = new Uint8Array([0xAA, 0x11]);
    const OID_KEY       = new Uint8Array([0xAA, 0x01]);

    const stub = {};
    stub.parseOne = function (buf, _off) {
        // Outer Certificate SEQUENCE.
        return N(0x30, buf);
    };
    stub.parseChildren = function (value) {
        const head = value && value.length ? value[0] : 0;
        // Top-level Certificate split.
        if (head !== 0xF0 && head !== 0xF1 && head !== 0xF2
            && head !== 0xF3 && head !== 0xF4 && head !== 0xF5
            && head !== 0xE2 && head !== 0xE4 && head !== 0xD2
            && head !== 0xD4 && head !== 0xC5) {
            return [N(0x30, MARK_TBS), N(0x30, MARK_SIGALG),
                    N(0x03, new Uint8Array(4))];
        }
        if (head === 0xF0) {            // tbsCertificate
            return [
                N(0x02, new Uint8Array([0x01])),       // serial
                N(0x30, new Uint8Array(2)),            // inner sigAlg
                N(0x30, MARK_ISSUER),
                N(0x30, MARK_VALIDITY),
                N(0x30, MARK_SUBJECT),
                N(0x30, MARK_SPKI)
            ];
        }
        if (head === 0xF1) return [N(0x06, OID_SIG)];
        if (head === 0xF2) return [N(0x31, MARK_RDN_I)];
        if (head === 0xE2) return [N(0x30, MARK_TV_I)];
        if (head === 0xD2) return [N(0x06, OID_CN),
                                    N(0x0C, new Uint8Array([0x49]))];  // I
        if (head === 0xF3) return [
            { tag: 0x17,
              value: new Uint8Array([0x32, 0x35, 0x30, 0x35, 0x31, 0x34,
                                      0x31, 0x32, 0x30, 0x30, 0x30, 0x30]) },
            { tag: 0x17,
              value: new Uint8Array([0x32, 0x37, 0x30, 0x35, 0x31, 0x34,
                                      0x31, 0x32, 0x30, 0x30, 0x30, 0x30]) }
        ];
        if (head === 0xF4) return [N(0x31, MARK_RDN_S)];
        if (head === 0xE4) return [N(0x30, MARK_TV_S)];
        if (head === 0xD4) return [N(0x06, OID_CN),
                                    N(0x0C, new Uint8Array([0x53]))];  // S
        if (head === 0xF5) return [N(0x30, MARK_SPKI_ALG),
                                    N(0x03, new Uint8Array(4))];
        if (head === 0xC5) return [N(0x06, OID_KEY)];
        return [];
    };
    stub.readOid = function (node) {
        if (!node || !node.value) return null;
        const v = node.value;
        if (v[0] === 0x55 && v[1] === 0x04 && v[2] === 0x03) return '2.5.4.3';
        if (v[0] === 0xAA && v[1] === 0x11) return '1.2.840.113549.1.1.11';
        if (v[0] === 0xAA && v[1] === 0x01) return '1.2.840.113549.1.1.1';
        return null;
    };
    return stub;
}

describe('parseCertificate', () => {
    test('returns typed record', () => {
        const der = new Uint8Array(64);
        const c = parseCertificate(der, buildCertAsn1());
        expect(c.issuer).toBe('CN=I');
        expect(c.subject).toBe('CN=S');
        expect(c.notBefore).toBeInstanceOf(Date);
        expect(c.notAfter).toBeInstanceOf(Date);
        expect(c.sigAlgorithm).toBe('sha256WithRSAEncryption');
        expect(c.keyAlgorithm).toBe('rsa');
        expect(c.raw).toBe(der);
    });

    test('rejects malformed input', () => {
        const asn1 = { parseOne() { return false; },
                       parseChildren() { return false; },
                       readOid() { return null; } };
        expect(() => parseCertificate(new Uint8Array(4), asn1))
            .toThrow(ParseError);
    });
});

describe('extractCertsFromCms', () => {
    test('returns [] for parse failure', () => {
        const asn1 = { parseOne() { return false; },
                       parseChildren() { return false; },
                       readOid() { return null; } };
        const r = extractCertsFromCms(new Uint8Array(4), asn1);
        expect(r).toEqual([]);
    });

    test('returns [] when no certificates field present', () => {
        let pc = 0;
        const asn1 = {
            parseOne(buf, _o) {
                return { tag: 0x30, length: buf.length, value: buf,
                         valueOff: 0, next: buf.length };
            },
            parseChildren() {
                pc++;
                if (pc === 1) return [
                    { tag: 0x06, value: new Uint8Array([0x2A]) },
                    { tag: 0xA0, value: new Uint8Array([0x30, 0x00]) }
                ];
                if (pc === 2) return [
                    { tag: 0x02, value: new Uint8Array([0x01]) },
                    { tag: 0x31, value: new Uint8Array() },
                    { tag: 0x30, value: new Uint8Array() }
                ];
                return [];
            },
            readOid() { return null; }
        };
        expect(extractCertsFromCms(new Uint8Array(20), asn1)).toEqual([]);
    });

    test('rejects bad input', () => {
        expect(() => extractCertsFromCms('x', buildCertAsn1()))
            .toThrow(ParseError);
    });

    test('requires asn1', () => {
        expect(() => extractCertsFromCms(new Uint8Array(4), null))
            .toThrow(EncryptionError);
    });
});

describe('extractCertFromPem', () => {
    test('decodes via fw pem then parseCertificate', () => {
        const pem = { decode() { return { label: 'CERTIFICATE',
                                          bytes: new Uint8Array(64) }; } };
        const c = extractCertFromPem('-----BEGIN CERTIFICATE-----\n',
            pem, buildCertAsn1());
        expect(c.subject).toBe('CN=S');
    });

    test('rejects non-string', () => {
        expect(() => extractCertFromPem(123, { decode() {} }, buildCertAsn1()))
            .toThrow(ParseError);
    });

    test('requires pem', () => {
        expect(() => extractCertFromPem('x', null, buildCertAsn1()))
            .toThrow(EncryptionError);
    });

    test('throws on pem decode failure', () => {
        const pem = { decode() { return null; } };
        expect(() => extractCertFromPem('x', pem, buildCertAsn1()))
            .toThrow(ParseError);
    });
});

describe('findIssuer', () => {
    test('matches by subject == issuer', () => {
        const leaf = { subject: 'CN=Leaf', issuer: 'CN=CA' };
        const ca   = { subject: 'CN=CA',   issuer: 'CN=Root' };
        const root = { subject: 'CN=Root', issuer: 'CN=Root' };
        expect(findIssuer(leaf, [leaf, ca, root])).toBe(ca);
        expect(findIssuer(ca, [leaf, ca, root])).toBe(root);
    });

    test('returns null without match', () => {
        expect(findIssuer({ issuer: 'CN=X' }, [])).toBe(null);
        expect(findIssuer(null, [])).toBe(null);
    });
});

describe('validateChainOrder', () => {
    test('accepts a well-formed chain', () => {
        const r = validateChainOrder([
            { subject: 'CN=Leaf', issuer: 'CN=CA' },
            { subject: 'CN=CA',   issuer: 'CN=Root' },
            { subject: 'CN=Root', issuer: 'CN=Root' }
        ]);
        expect(r.valid).toBe(true);
        expect(r.errors).toEqual([]);
    });

    test('rejects broken link', () => {
        const r = validateChainOrder([
            { subject: 'CN=Leaf', issuer: 'CN=CA' },
            { subject: 'CN=Other', issuer: 'CN=Root' }
        ]);
        expect(r.valid).toBe(false);
        expect(r.errors.length).toBe(1);
    });

    test('rejects empty chain', () => {
        expect(validateChainOrder([]).valid).toBe(false);
        expect(validateChainOrder(null).valid).toBe(false);
    });
});

describe('pdfCertChain factory', () => {
    test('factory.toString() contains "function"', () => {
        expect(pdfCertChain.factory.toString()).toContain('function');
    });

    test('factory returns expected API', () => {
        const api = pdfCertChain.factory(_pdfErrors_TD1,
            pdfSigOids.factory(_asn1Oid), buildCertAsn1(), { decode() {} });
        expect(typeof api.extractCertsFromCms).toBe('function');
        expect(typeof api.extractCertFromPem).toBe('function');
        expect(typeof api.parseCertificate).toBe('function');
        expect(typeof api.findIssuer).toBe('function');
        expect(typeof api.validateChainOrder).toBe('function');
    });

    test('declares fw deps', () => {
        expect(pdfCertChain.dependencies).toEqual([
            'pdfErrors', 'pdfSigOids', 'asn1', 'pem'
        ]);
    });
});
