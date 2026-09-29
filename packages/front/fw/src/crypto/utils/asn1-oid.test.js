// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { asn1Oid } from './asn1-oid.js';

describe('asn1Oid module', () => {

    // ── 1. Module metadata ────────────────────────────────────────────────────
    test('should have correct module metadata', () => {
        expect(asn1Oid.name).toBe('asn1Oid');
        expect(asn1Oid.dependencies).toEqual([]);
        expect(typeof asn1Oid.factory).toBe('function');
    });

    // ── 2. Factory shape ──────────────────────────────────────────────────────
    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = asn1Oid.factory();
            expect(typeof inst.lookup).toBe('function');
            expect(typeof inst.byName).toBe('function');
            expect(typeof inst.findByCategory).toBe('function');
            expect(typeof inst.OID_DATABASE).toBe('object');
            expect(inst.OID_DATABASE).not.toBeNull();
        });
    });

    // ── 3-10. Functional tests ────────────────────────────────────────────────
    describe('lookup', () => {
        let oid;
        beforeEach(() => { oid = asn1Oid.factory(); });

        // 3. PKCS#7 lookup
        test('pkcs7-signedData lookup returns correct entry', () => {
            const e = oid.lookup('1.2.840.113549.1.7.2');
            expect(e).not.toBeNull();
            expect(e.name).toBe('pkcs7-signedData');
            expect(e.shortName).toBe('signedData');
            expect(e.category).toBe('pkcs7');
        });

        test('pkcs7-envelopedData lookup', () => {
            const e = oid.lookup('1.2.840.113549.1.7.3');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('envelopedData');
            expect(e.category).toBe('pkcs7');
        });

        test('pkcs7-digestedData lookup', () => {
            const e = oid.lookup('1.2.840.113549.1.7.5');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('digestedData');
            expect(e.category).toBe('pkcs7');
        });

        // 4. RSA signature
        test('sha256WithRSAEncryption lookup by OID', () => {
            const e = oid.lookup('1.2.840.113549.1.1.11');
            expect(e).not.toBeNull();
            expect(e.name).toBe('sha256WithRSAEncryption');
            expect(e.shortName).toBe('sha256WithRSA');
            expect(e.category).toBe('pkcs1');
            expect(e.hashAlg).toBe('sha-256');
            expect(e.sigAlg).toBe('rsa');
        });

        // 5. X.509 DN
        test('CN lookup by OID', () => {
            const e = oid.lookup('2.5.4.3');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('CN');
            expect(e.category).toBe('x509-dn');
        });

        test('O lookup by OID', () => {
            const e = oid.lookup('2.5.4.10');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('O');
            expect(e.category).toBe('x509-dn');
        });

        // 6. ECC
        test('P-256 lookup by OID', () => {
            const e = oid.lookup('1.2.840.10045.3.1.7');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('P-256');
            expect(e.category).toBe('ecc-curve');
            expect(e.curve).toBe('P-256');
        });

        test('ecPublicKey lookup by OID (id-ecPublicKey, SPKI algorithm identifier)', () => {
            const e = oid.lookup('1.2.840.10045.2.1');
            expect(e).not.toBeNull();
            expect(e.name).toBe('ecPublicKey');
            expect(e.shortName).toBe('ecc');
            expect(e.category).toBe('pkcs1');
        });

        // 7. Unknown OID returns null
        test('unknown OID returns null', () => {
            expect(oid.lookup('9.9.9.9.9')).toBeNull();
        });

        // 9. OID format validation - invalid strings return null, no throw
        test('non-OID string returns null without throw', () => {
            expect(oid.lookup('not.a.oid')).toBeNull();
        });

        test('empty string returns null', () => {
            expect(oid.lookup('')).toBeNull();
        });

        test('null input returns null', () => {
            expect(oid.lookup(null)).toBeNull();
        });

        test('undefined input returns null', () => {
            expect(oid.lookup(undefined)).toBeNull();
        });

        test('OID with trailing dot returns null', () => {
            expect(oid.lookup('1.2.840.')).toBeNull();
        });
    });

    // ── byName ────────────────────────────────────────────────────────────────
    describe('byName', () => {
        let oid;
        beforeEach(() => { oid = asn1Oid.factory(); });

        // 8. byName insensitive: both long name and shortName resolve
        test('byName with canonical name resolves signedData OID', () => {
            expect(oid.byName('pkcs7-signedData')).toBe('1.2.840.113549.1.7.2');
        });

        test('byName with shortName resolves signedData OID', () => {
            expect(oid.byName('signedData')).toBe('1.2.840.113549.1.7.2');
        });

        test('byName is case-insensitive', () => {
            expect(oid.byName('SIGNEDDATA')).toBe('1.2.840.113549.1.7.2');
            expect(oid.byName('SignedData')).toBe('1.2.840.113549.1.7.2');
        });

        test('sha256WithRSAEncryption resolves by canonical name', () => {
            expect(oid.byName('sha256WithRSAEncryption')).toBe('1.2.840.113549.1.1.11');
        });

        test('sha256WithRSA resolves by shortName', () => {
            expect(oid.byName('sha256WithRSA')).toBe('1.2.840.113549.1.1.11');
        });

        test('CN resolves to x509 DN OID', () => {
            expect(oid.byName('CN')).toBe('2.5.4.3');
        });

        test('commonName resolves to x509 DN OID', () => {
            expect(oid.byName('commonName')).toBe('2.5.4.3');
        });

        test('O resolves to x509 organization OID', () => {
            expect(oid.byName('O')).toBe('2.5.4.10');
        });

        test('P-256 shortName resolves to ECC curve OID', () => {
            expect(oid.byName('P-256')).toBe('1.2.840.10045.3.1.7');
        });

        test('P-384 resolves correctly', () => {
            expect(oid.byName('P-384')).toBe('1.3.132.0.34');
        });

        test('P-521 resolves correctly', () => {
            expect(oid.byName('P-521')).toBe('1.3.132.0.35');
        });

        test('unknown name returns null', () => {
            expect(oid.byName('notAnOidName')).toBeNull();
        });

        test('null input returns null', () => {
            expect(oid.byName(null)).toBeNull();
        });
    });

    // ── findByCategory ────────────────────────────────────────────────────────
    describe('findByCategory', () => {
        let oid;
        beforeEach(() => { oid = asn1Oid.factory(); });

        test('pkcs7 returns non-empty array', () => {
            const results = oid.findByCategory('pkcs7');
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });

        test('pkcs7 entries contain oid field', () => {
            const results = oid.findByCategory('pkcs7');
            for (const entry of results) {
                expect(typeof entry.oid).toBe('string');
                expect(entry.category).toBe('pkcs7');
            }
        });

        test('pkcs1 returns non-empty array with RSA entries', () => {
            const results = oid.findByCategory('pkcs1');
            expect(results.length).toBeGreaterThan(0);
            const sha256 = results.find(e => e.shortName === 'sha256WithRSA');
            expect(sha256).toBeDefined();
        });

        test('pkcs9 returns non-empty array', () => {
            const results = oid.findByCategory('pkcs9');
            expect(results.length).toBeGreaterThan(0);
        });

        test('digest returns non-empty array with sha256 entry', () => {
            const results = oid.findByCategory('digest');
            expect(results.length).toBeGreaterThan(0);
            const sha256 = results.find(e => e.shortName === 'sha256');
            expect(sha256).toBeDefined();
        });

        test('x509-dn returns non-empty array', () => {
            const results = oid.findByCategory('x509-dn');
            expect(results.length).toBeGreaterThan(0);
            const cn = results.find(e => e.shortName === 'CN');
            expect(cn).toBeDefined();
        });

        test('x509-extension returns non-empty array with key extensions', () => {
            const results = oid.findByCategory('x509-extension');
            expect(results.length).toBeGreaterThan(0);
            const bc = results.find(e => e.shortName === 'basicConstraints');
            expect(bc).toBeDefined();
            const ski = results.find(e => e.shortName === 'subjectKeyIdentifier');
            expect(ski).toBeDefined();
        });

        test('pades returns non-empty array', () => {
            const results = oid.findByCategory('pades');
            expect(results.length).toBeGreaterThan(0);
        });

        test('ecc-curve returns non-empty array with P-256', () => {
            const results = oid.findByCategory('ecc-curve');
            expect(results.length).toBeGreaterThan(0);
            const p256 = results.find(e => e.shortName === 'P-256');
            expect(p256).toBeDefined();
            expect(p256.oid).toBe('1.2.840.10045.3.1.7');
        });

        test('pkcs5 returns non-empty array with pbkdf2', () => {
            const results = oid.findByCategory('pkcs5');
            expect(results.length).toBeGreaterThan(0);
            const pbkdf2 = results.find(e => e.shortName === 'pbkdf2');
            expect(pbkdf2).toBeDefined();
        });

        test('aes returns non-empty array with AES-256-CBC', () => {
            const results = oid.findByCategory('aes');
            expect(results.length).toBeGreaterThan(0);
            const aes256cbc = results.find(e => e.shortName === 'aes256-cbc');
            expect(aes256cbc).toBeDefined();
        });

        test('unknown category returns empty array', () => {
            const results = oid.findByCategory('nonexistent-category');
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });
    });

    // ── OID_DATABASE size ─────────────────────────────────────────────────────
    describe('OID_DATABASE', () => {
        test('contains at least 150 OIDs', () => {
            const inst = asn1Oid.factory();
            expect(Object.keys(inst.OID_DATABASE).length).toBeGreaterThanOrEqual(150);
        });

        test('each entry has required fields', () => {
            const inst = asn1Oid.factory();
            for (const [oidStr, entry] of Object.entries(inst.OID_DATABASE)) {
                expect(typeof oidStr).toBe('string');
                expect(typeof entry.name).toBe('string');
                expect(typeof entry.shortName).toBe('string');
                expect(typeof entry.category).toBe('string');
            }
        });
    });

    // ── Regression tests for known data errors ───────────────────────────────
    describe('OID correctness (regression)', () => {
        let oid;
        beforeEach(() => { oid = asn1Oid.factory(); });

        test('brainpoolP256r1 is at the correct OID (1.3.36.3.3.2.8.1.1.7, RFC 5639)', () => {
            const e = oid.lookup('1.3.36.3.3.2.8.1.1.7');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('brainpoolP256r1');
            // Wrong OID from the old data - must NOT resolve to brainpool
            expect(oid.lookup('1.2.840.10045.3.1.34')).toBeNull();
        });

        test('brainpoolP384r1 / brainpoolP512r1 use RFC 5639 arc 1.3.36.3.3.2.8.1.1.x', () => {
            expect(oid.lookup('1.3.36.3.3.2.8.1.1.11').shortName).toBe('brainpoolP384r1');
            expect(oid.lookup('1.3.36.3.3.2.8.1.1.13').shortName).toBe('brainpoolP512r1');
        });

        test('hmacWithSHA224 is registered at 1.2.840.113549.2.8', () => {
            const e = oid.lookup('1.2.840.113549.2.8');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('hmac-sha224');
        });

        test('AES NIST CSOR arc - modes are placed on correct sub-arcs', () => {
            // OFB sub-arc is .3/.23/.43, NOT .5/.45 (which are key-wrap)
            expect(oid.lookup('2.16.840.1.101.3.4.1.3').shortName).toBe('aes128-ofb');
            expect(oid.lookup('2.16.840.1.101.3.4.1.23').shortName).toBe('aes192-ofb');
            expect(oid.lookup('2.16.840.1.101.3.4.1.43').shortName).toBe('aes256-ofb');
            // key-wrap sub-arc is .5/.25/.45
            expect(oid.lookup('2.16.840.1.101.3.4.1.5').shortName).toBe('aes128-kw');
            expect(oid.lookup('2.16.840.1.101.3.4.1.25').shortName).toBe('aes192-kw');
            expect(oid.lookup('2.16.840.1.101.3.4.1.45').shortName).toBe('aes256-kw');
        });

        test('AES-192 suite is complete (OFB, CFB, CCM)', () => {
            expect(oid.lookup('2.16.840.1.101.3.4.1.24').shortName).toBe('aes192-cfb');
            expect(oid.lookup('2.16.840.1.101.3.4.1.27').shortName).toBe('aes192-ccm');
        });

        test('emailAddress OID 1.2.840.113549.1.9.1 maps to a single canonical entry (pkcs9)', () => {
            const e = oid.lookup('1.2.840.113549.1.9.1');
            expect(e).not.toBeNull();
            expect(e.category).toBe('pkcs9');
            expect(e.name).toBe('pkcs9-emailAddress');
        });

        test("byName('E') resolves to the emailAddress OID via DN alias", () => {
            expect(oid.byName('E')).toBe('1.2.840.113549.1.9.1');
            expect(oid.byName('e')).toBe('1.2.840.113549.1.9.1');
        });

        test('Ed25519 OID 1.3.101.112 maps to the curve entry (no duplicate override)', () => {
            const e = oid.lookup('1.3.101.112');
            expect(e).not.toBeNull();
            expect(e.shortName).toBe('Ed25519');
            expect(e.category).toBe('ecc-curve');
        });

        test('rsaOAEP is not mislabelled as a signature algorithm', () => {
            const e = oid.lookup('1.2.840.113549.1.1.7');
            expect(e).not.toBeNull();
            expect(e.sigAlg).toBeUndefined();
            expect(e.encAlg).toBe('rsa-oaep');
        });

        test('OID_DATABASE contains no key whose value is a placeholder/alias-only entry', () => {
            const inst = asn1Oid.factory();
            for (const [oidStr, entry] of Object.entries(inst.OID_DATABASE)) {
                // Every key must be a valid OID string (post-fix, no synthetic keys)
                expect(/^\d+(\.\d+)*$/.test(oidStr)).toBe(true);
                expect(entry.name.startsWith('__')).toBe(false);
            }
        });
    });

    // ── Worker serializability ────────────────────────────────────────────────
    describe('worker serializability', () => {
        test('JSON.stringify(asn1Oid) does not throw and contains name and dependencies', () => {
            let serialized;
            expect(() => { serialized = JSON.stringify(asn1Oid); }).not.toThrow();
            const parsed = JSON.parse(serialized);
            expect(parsed.name).toBe('asn1Oid');
            expect(parsed.dependencies).toEqual([]);
        });

        test('two successive factory() calls produce independent instances', () => {
            const inst1 = asn1Oid.factory();
            const inst2 = asn1Oid.factory();

            // Both instances should resolve the same OID initially
            expect(inst1.lookup('1.2.840.113549.1.7.2').name).toBe('pkcs7-signedData');
            expect(inst2.lookup('1.2.840.113549.1.7.2').name).toBe('pkcs7-signedData');

            // Mutating OID_DATABASE on inst1 must not affect inst2
            inst1.OID_DATABASE['1.2.840.113549.1.7.2'].name = '__mutated__';
            expect(inst1.OID_DATABASE['1.2.840.113549.1.7.2'].name).toBe('__mutated__');
            expect(inst2.OID_DATABASE['1.2.840.113549.1.7.2'].name).toBe('pkcs7-signedData');

            // A fresh factory call must also be unaffected
            const inst3 = asn1Oid.factory();
            expect(inst3.OID_DATABASE['1.2.840.113549.1.7.2'].name).toBe('pkcs7-signedData');
        });
    });

    // ── Round-trip tests ──────────────────────────────────────────────────────
    describe('round-trip (lookup ↔ byName)', () => {
        let oid;
        beforeEach(() => { oid = asn1Oid.factory(); });

        test('sha256WithRSAEncryption OID round-trips', () => {
            const oidStr = '1.2.840.113549.1.1.11';
            const entry = oid.lookup(oidStr);
            expect(entry).not.toBeNull();
            const resolved = oid.byName(entry.name);
            expect(resolved).toBe(oidStr);
        });

        test('signedData OID round-trips via shortName', () => {
            const oidStr = '1.2.840.113549.1.7.2';
            const entry = oid.lookup(oidStr);
            expect(entry).not.toBeNull();
            const resolved = oid.byName(entry.shortName);
            expect(resolved).toBe(oidStr);
        });

        test('P-256 curve OID round-trips', () => {
            const oidStr = '1.2.840.10045.3.1.7';
            const entry = oid.lookup(oidStr);
            expect(entry).not.toBeNull();
            const resolved = oid.byName(entry.shortName);
            expect(resolved).toBe(oidStr);
        });

        test('pbkdf2 OID round-trips', () => {
            const oidStr = '1.2.840.113549.1.5.12';
            const entry = oid.lookup(oidStr);
            expect(entry).not.toBeNull();
            const resolved = oid.byName(entry.shortName);
            expect(resolved).toBe(oidStr);
        });

        test('aes256-CBC OID round-trips', () => {
            const oidStr = '2.16.840.1.101.3.4.1.42';
            const entry = oid.lookup(oidStr);
            expect(entry).not.toBeNull();
            const resolved = oid.byName(entry.shortName);
            expect(resolved).toBe(oidStr);
        });
    });
});
