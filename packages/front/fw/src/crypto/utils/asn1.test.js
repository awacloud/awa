// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { asn1 } from './asn1.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _asn1 = asn1.factory();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('asn1 module', () => {

    test('module metadata', () => {
        expect(asn1.name).toBe('asn1');
        expect(asn1.dependencies).toEqual([]);
    });

    describe('INTEGER encoding', () => {
        test('zero', () => {
            expect(toHex(_asn1.encodeInteger(0))).toBe('020100');
        });
        test('small positive', () => {
            expect(toHex(_asn1.encodeInteger(127))).toBe('02017f');
        });
        test('128 (high bit → leading 0x00)', () => {
            expect(toHex(_asn1.encodeInteger(128))).toBe('02020080');
        });
        test('multi-byte', () => {
            expect(toHex(_asn1.encodeInteger(65537))).toBe('0203010001');
        });
        test('from byte array', () => {
            expect(toHex(_asn1.encodeInteger(fromHex('ff')))).toBe('020200ff');
        });
    });

    describe('OBJECT IDENTIFIER', () => {
        test('rsaEncryption (1.2.840.113549.1.1.1)', () => {
            // Standard encoding from RFC 8017.
            expect(toHex(_asn1.encodeOid('1.2.840.113549.1.1.1'))).toBe(
                '06092a864886f70d010101'
            );
        });
        test('id-ed25519 (1.3.101.112)', () => {
            expect(toHex(_asn1.encodeOid('1.3.101.112'))).toBe('0603 2b6570'.replace(' ', ''));
        });
        test('round-trip', () => {
            const enc = _asn1.encodeOid('1.2.840.10045.2.1');
            const node = _asn1.parseOne(enc, 0);
            expect(_asn1.readOid(node)).toBe('1.2.840.10045.2.1');
        });
    });

    describe('SEQUENCE / nested', () => {
        test('SEQUENCE { INTEGER 1, NULL }', () => {
            const seq = _asn1.encodeSequence([
                _asn1.encodeInteger(1),
                _asn1.encodeNull()
            ]);
            expect(toHex(seq)).toBe('30050201010500');
            const node = _asn1.parseOne(seq, 0);
            expect(node.tag).toBe(0x30);
            const kids = _asn1.parseChildren(node.value);
            expect(kids.length).toBe(2);
            expect(kids[0].tag).toBe(0x02);
            expect(kids[1].tag).toBe(0x05);
        });
    });

    describe('BIT STRING', () => {
        test('encode/decode round-trip', () => {
            const enc = _asn1.encodeBitString(fromHex('deadbeef'), 0);
            const node = _asn1.parseOne(enc, 0);
            const bs = _asn1.readBitString(node);
            expect(bs.unusedBits).toBe(0);
            expect(toHex(bs.bytes)).toBe('deadbeef');
        });
    });

    describe('parser strictness', () => {
        test('rejects truncated TLV', () => {
            expect(_asn1.parseOne(fromHex('0204aabb'), 0)).toBe(false);
        });
        test('rejects non-minimal length encoding', () => {
            // 0x81 0x05 means long-form length = 5 ; should have used short form.
            expect(_asn1.parseOne(fromHex('048105 0102030405'.replace(' ', '')), 0)).toBe(false);
        });
        test('rejects high-tag-number form', () => {
            expect(_asn1.parseOne(fromHex('1f8201'), 0)).toBe(false);
        });
    });
});
