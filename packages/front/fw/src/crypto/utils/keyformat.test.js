// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { keyformat } from './keyformat.js';
import { asn1 } from './asn1.js';
import { hex } from '../../io/codec/hex.js';

const _asn1 = asn1.factory();
const _hex  = hex.factory();
const K = keyformat.factory(_asn1);

describe('keyformat module', () => {

    test('module metadata', () => {
        expect(keyformat.name).toBe('keyformat');
        expect(K.OID.ED25519).toBe('1.3.101.112');
    });

    describe('Ed25519 PKCS#8 (RFC 8410 §10.3)', () => {
        // RFC 8410 §10.3 - Example Ed25519 PrivateKey
        const seedHex = 'D4EE72DBF913584AD5B6D8F1F769F8AD3AFE7C28CBF1D4FBE097A88F44755842';
        const expected = '302E020100300506032B657004220420' + seedHex;

        test('encode matches RFC vector', () => {
            const seed = _hex.toBytes(seedHex.toLowerCase());
            const der  = K.encodePkcs8Edwards(K.OID.ED25519, seed);
            expect(_hex.fromBytes(der).toUpperCase()).toBe(expected);
        });

        test('decode round-trip', () => {
            const der = _hex.toBytes(expected.toLowerCase());
            const r   = K.decodePkcs8Edwards(der);
            expect(r).not.toBe(false);
            expect(r.oid).toBe(K.OID.ED25519);
            expect(_hex.fromBytes(r.seed).toUpperCase()).toBe(seedHex);
        });

        test('rejects wrong OID', () => {
            const der = K.encodePkcs8Edwards(K.OID.X25519, new Uint8Array(32));
            const r = K.decodePkcs8Edwards(der);
            expect(r).not.toBe(false);
            expect(r.oid).toBe(K.OID.X25519);
        });

        test('rejects bad seed length', () => {
            expect(K.encodePkcs8Edwards(K.OID.ED25519, new Uint8Array(31))).toBe(false);
        });
    });

    describe('Ed25519 SPKI (RFC 8410 §10.1)', () => {
        // RFC 8410 §10.1 - Example Ed25519 PublicKey
        const pubHex = '19BF44096984CDFE8541BAC167DC3B96C85086AA30B6B6CB0C5C38AD703166E1';
        const expected = '302A300506032B6570032100' + pubHex;

        test('encode matches RFC vector', () => {
            const pub = _hex.toBytes(pubHex.toLowerCase());
            const der = K.encodeSpkiEdwards(K.OID.ED25519, pub);
            expect(_hex.fromBytes(der).toUpperCase()).toBe(expected);
        });

        test('decode round-trip', () => {
            const der = _hex.toBytes(expected.toLowerCase());
            const r   = K.decodeSpkiEdwards(der);
            expect(r).not.toBe(false);
            expect(r.oid).toBe(K.OID.ED25519);
            expect(_hex.fromBytes(r.publicKey).toUpperCase()).toBe(pubHex);
        });
    });

    describe('EC SEC1 / PKCS#8 / SPKI round-trip (P-256)', () => {
        const d   = new Uint8Array(32); for (let i = 0; i < 32; i++) d[i]   = i + 1;
        const pub = new Uint8Array(65); pub[0] = 0x04;
        for (let i = 1; i < 65; i++) pub[i] = (i * 7) & 0xff;

        test('SEC1 round-trip with curve + pub', () => {
            const der = K.encodeSec1(d, pub, K.OID.P256);
            const r = K.decodeSec1(der);
            expect(r).not.toBe(false);
            expect(r.curveOid).toBe(K.OID.P256);
            expect(_hex.fromBytes(r.d)).toBe(_hex.fromBytes(d));
            expect(_hex.fromBytes(r.publicKey)).toBe(_hex.fromBytes(pub));
        });

        test('PKCS#8 EC round-trip', () => {
            const der = K.encodePkcs8Ec(K.OID.P256, d, pub);
            const r   = K.decodePkcs8Ec(der);
            expect(r).not.toBe(false);
            expect(r.curveOid).toBe(K.OID.P256);
            expect(_hex.fromBytes(r.d)).toBe(_hex.fromBytes(d));
            expect(_hex.fromBytes(r.publicKey)).toBe(_hex.fromBytes(pub));
        });

        test('SPKI EC round-trip', () => {
            const der = K.encodeSpkiEc(K.OID.P384, pub);
            const r = K.decodeSpkiEc(der);
            expect(r).not.toBe(false);
            expect(r.curveOid).toBe(K.OID.P384);
            expect(_hex.fromBytes(r.point)).toBe(_hex.fromBytes(pub));
        });
    });
});
