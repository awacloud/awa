// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `x509`: X.509 v3 certificates (RFC 5280) for Ed25519 (RFC 8410)
 * and ECDSA P-256 / SHA-256 (RFC 5758) keys — create, parse, verify, PEM.
 *
 * Oracles, both directions: every certificate fw creates is read by
 * `node:crypto`'s `X509Certificate` (fields, `ca`, `verify(issuerKey)`,
 * `checkIssued`) and by `openssl x509 -text`, and `openssl verify` accepts a
 * CA-issued chain; certificates `openssl` creates are parsed and verified by
 * fw. The openssl legs skip when no `openssl` is on PATH.
 */

import { describe, test, expect } from 'bun:test';
import nodeCrypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { x509 } from './x509.js';
import { asn1 } from './asn1.js';
import { keyformat } from './keyformat.js';
import { pem } from './pem.js';
import { bitArray } from './bitArray.js';
import { bn } from './bn.js';
import { random } from './random.js';
import { ed25519 } from '../pkc/ed25519.js';
import { ecc } from '../pkc/ecc.js';
import { sha256 } from '../hash/sha256.js';
import { sha384 } from '../hash/sha384.js';
import { sha512 } from '../hash/sha512.js';
import { hmac } from '../hash/hmac.js';
import { aes } from '../cipher/aes.js';
import { hex } from '../../io/codec/hex.js';
import { utf8 } from '../../io/codec/utf8.js';
import { b64 } from '../../io/codec/b64.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha512 = sha512.factory(_ba, _utf8);
const _rng = random.factory(_ba, aes.factory(), _sha256);
const _asn1 = asn1.factory();
const _ed = ed25519.factory(_sha512, _ba);
const _ecc = ecc.factory(_ba, hex.factory(), bn.factory(_ba, _rng), _sha256, sha384.factory(_sha512), _sha512, hmac.factory(_ba, _utf8, _sha256));
const X = x509.factory(_asn1, keyformat.factory(_asn1), pem.factory(b64.factory()), _ed, _ecc, _sha256, _ba);

const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const b64u = (s) => u8(Buffer.from(s, 'base64url'));
const day = 86400e3;
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);

/** An Ed25519 identity: fw key forms + the node KeyObject. */
function edKey(fill) {
    const kp = _ed.keyPair(new Uint8Array(32).fill(fill));
    const node = nodeCrypto.createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(kp.publicKey).toString('base64url') } });
    return { pub: { alg: 'Ed25519', key: kp.publicKey }, signer: { alg: 'Ed25519', privateKey: kp.privateKey, publicKey: kp.publicKey }, node };
}

/** An ECDSA P-256 identity from node: fw key forms + the node KeyObject. */
function ecKey() {
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const j = privateKey.export({ format: 'jwk' });
    const point = new Uint8Array(65);
    point[0] = 0x04; point.set(b64u(j.x), 1); point.set(b64u(j.y), 33);
    return { pub: { alg: 'ECDSA-P256', key: point }, signer: { alg: 'ECDSA-P256', privateKey: b64u(j.d), publicKey: point }, node: publicKey };
}

const quiet = (fn) => { const w = console.warn; const e = console.error; console.warn = () => {}; console.error = () => {}; try { return fn(); } finally { console.warn = w; console.error = e; } };
const OPENSSL = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;

function openssl(args, input) {
    return spawnSync('openssl', args, { encoding: 'utf8', input });
}

describe('x509 — fw creates, node reads', () => {
    for (const [name, mk] of [['Ed25519', () => edKey(7)], ['ECDSA P-256', ecKey]]) {
        test(`${name}: a self-signed end-entity certificate`, () => {
            const k = mk();
            const der = X.create({
                subject: { CN: 'leaf.example', O: 'AwaCloud', C: 'FR' },
                serial: Uint8Array.of(0x01, 0x23, 0x45),
                notBefore: new Date(NOW - day), notAfter: new Date(+NOW + 30 * day),
                publicKey: k.pub,
                extensions: { basicConstraints: { ca: false }, keyUsage: ['digitalSignature', 'nonRepudiation'], subjectAltName: { dns: ['leaf.example', 'www.leaf.example'], email: ['ops@leaf.example'] } },
            }, k.signer);
            expect(der).toBeInstanceOf(Uint8Array);
            const c = new nodeCrypto.X509Certificate(Buffer.from(der));
            expect(c.subject).toBe('CN=leaf.example\nO=AwaCloud\nC=FR');
            expect(c.issuer).toBe(c.subject);
            expect(c.serialNumber).toBe('012345');
            expect(c.ca).toBe(false);
            expect(c.subjectAltName).toBe('DNS:leaf.example, DNS:www.leaf.example, email:ops@leaf.example');
            expect(c.validFromDate.getTime()).toBe(NOW - day);
            expect(c.validToDate.getTime()).toBe(+NOW + 30 * day);
            expect(c.verify(k.node)).toBe(true);
            expect(X.verify(der, k.pub)).toBe(true);
        });
    }

    test('a CA (ECDSA) issues an Ed25519 leaf: node checks the issuance and the signature', () => {
        const ca = ecKey();
        const leaf = edKey(9);
        const caDer = X.create({
            subject: { CN: 'Test Root', O: 'AwaCloud' }, serial: Uint8Array.of(1),
            notBefore: new Date(NOW - day), notAfter: new Date(+NOW + 365 * day), publicKey: ca.pub,
            extensions: { basicConstraints: { ca: true, pathLen: 0 }, keyUsage: ['keyCertSign', 'cRLSign'], subjectKeyIdentifier: true },
        }, ca.signer);
        const leafDer = X.create({
            subject: { CN: 'signer' }, issuer: { CN: 'Test Root', O: 'AwaCloud' }, serial: Uint8Array.of(2),
            notBefore: new Date(NOW - day), notAfter: new Date(+NOW + 30 * day), publicKey: leaf.pub,
            extensions: { keyUsage: ['digitalSignature'], extKeyUsage: ['1.3.6.1.5.5.7.3.4'], subjectKeyIdentifier: true, authorityKeyIdentifier: true },
        }, ca.signer);
        const caC = new nodeCrypto.X509Certificate(Buffer.from(caDer));
        const leafC = new nodeCrypto.X509Certificate(Buffer.from(leafDer));
        expect(caC.ca).toBe(true);
        // Bun returns the issuer on success (node: true); either way truthy, and falsy the other way round
        expect(Boolean(leafC.checkIssued(caC))).toBe(true);
        expect(Boolean(caC.checkIssued(leafC))).toBe(false);
        expect(leafC.verify(ca.node)).toBe(true);
        expect(leafC.keyUsage).toEqual(['1.3.6.1.5.5.7.3.4']);
        expect(X.verify(leafDer, ca.pub)).toBe(true);
        expect(X.verify(leafDer, leaf.pub)).toBe(false);
    });

    test('2050 and later is GeneralizedTime, before is UTCTime', () => {
        const k = edKey(3);
        const der = X.create({ subject: { CN: 'far' }, serial: Uint8Array.of(5), notBefore: new Date('2049-12-31T23:59:59Z'), notAfter: new Date('2051-06-01T00:00:00Z'), publicKey: k.pub }, k.signer);
        const c = new nodeCrypto.X509Certificate(Buffer.from(der));
        expect(c.validToDate.toISOString()).toBe('2051-06-01T00:00:00.000Z');
        expect(c.validFromDate.toISOString()).toBe('2049-12-31T23:59:59.000Z');
        const p = X.parse(der);
        expect(p.notAfter.toISOString()).toBe('2051-06-01T00:00:00.000Z');
    });
});

describe('x509 — parse', () => {
    test('reads back every field fw writes', () => {
        const k = ecKey();
        const der = X.create({
            subject: { CN: 'p', O: 'o', OU: 'u', L: 'l', ST: 's', C: 'FR' }, serial: Uint8Array.of(0x7f, 0, 1),
            notBefore: new Date(NOW - day), notAfter: new Date(+NOW + day), publicKey: k.pub,
            extensions: { basicConstraints: { ca: true, pathLen: 2 }, keyUsage: ['keyCertSign'], extKeyUsage: ['1.3.6.1.5.5.7.3.1'], subjectAltName: { dns: ['a.example'] }, subjectKeyIdentifier: true },
        }, k.signer);
        const p = X.parse(der);
        expect(p.version).toBe(3);
        expect(Array.from(p.serial)).toEqual([0x7f, 0, 1]);
        expect(p.signatureAlgorithm).toBe('ECDSA-SHA256');
        expect(p.subject).toEqual({ CN: 'p', O: 'o', OU: 'u', L: 'l', ST: 's', C: 'FR' });
        expect(p.issuer).toEqual(p.subject);
        expect(p.publicKey.alg).toBe('ECDSA-P256');
        expect(Array.from(p.publicKey.key)).toEqual(Array.from(k.pub.key));
        expect(p.extensions.basicConstraints).toEqual({ ca: true, pathLen: 2, critical: true });
        expect(p.extensions.keyUsage).toEqual({ usages: ['keyCertSign'], critical: true });
        expect(p.extensions.extKeyUsage).toEqual({ oids: ['1.3.6.1.5.5.7.3.1'], critical: false });
        expect(p.extensions.subjectAltName).toEqual({ dns: ['a.example'], email: [], critical: false });
        expect(p.extensions.subjectKeyIdentifier.keyId.length).toBe(20);
        expect(p.tbs).toBeInstanceOf(Uint8Array);
    });

    test('PEM round trip', () => {
        const k = edKey(4);
        const der = X.create({ subject: { CN: 'pem' }, serial: Uint8Array.of(1), notBefore: new Date(NOW - day), notAfter: new Date(+NOW + day), publicKey: k.pub }, k.signer);
        const pem = X.toPem(der);
        expect(pem.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true);
        expect(Array.from(X.fromPem(pem))).toEqual(Array.from(der));
        expect(new nodeCrypto.X509Certificate(pem).subject).toBe('CN=pem');
    });
});

describe('x509 — openssl', () => {
    test.skipIf(!OPENSSL)('openssl prints fw certificates and verifies a CA-issued chain', () => {
        const dir = mkdtempSync(join(tmpdir(), 'fw-x509-'));
        try {
            const ca = edKey(11);
            const leaf = ecKey();
            const caDer = X.create({ subject: { CN: 'Root' }, serial: Uint8Array.of(1), notBefore: new Date(NOW - day), notAfter: new Date(+NOW + day * 10), publicKey: ca.pub,
                extensions: { basicConstraints: { ca: true }, keyUsage: ['keyCertSign', 'cRLSign'], subjectKeyIdentifier: true } }, ca.signer);
            const leafDer = X.create({ subject: { CN: 'leaf' }, issuer: { CN: 'Root' }, serial: Uint8Array.of(2), notBefore: new Date(NOW - day), notAfter: new Date(+NOW + day), publicKey: leaf.pub,
                extensions: { keyUsage: ['digitalSignature'], authorityKeyIdentifier: true, subjectKeyIdentifier: true } }, ca.signer);
            writeFileSync(join(dir, 'ca.pem'), X.toPem(caDer));
            writeFileSync(join(dir, 'leaf.pem'), X.toPem(leafDer));
            for (const f of ['ca.pem', 'leaf.pem']) {
                const r = openssl(['x509', '-in', join(dir, f), '-noout', '-text']);
                expect([f, r.status]).toEqual([f, 0]);
            }
            const v = openssl(['verify', '-CAfile', join(dir, 'ca.pem'), join(dir, 'leaf.pem')]);
            expect(v.stdout.trim().endsWith('OK')).toBe(true);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });

    for (const [name, keyArgs] of [['Ed25519', ['-newkey', 'ed25519']], ['ECDSA P-256', ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256']]]) {
        test.skipIf(!OPENSSL)(`fw parses and verifies an openssl ${name} certificate`, () => {
            const dir = mkdtempSync(join(tmpdir(), 'fw-x509-'));
            try {
                const r = openssl(['req', '-x509', ...keyArgs, '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=osl/O=OpenSSL', '-outform', 'DER']);
                expect(r.status).toBe(0);
                const der = new Uint8Array(readFileSync(join(dir, 'c.pem')));
                const p = X.parse(der);
                expect(p.subject).toEqual({ CN: 'osl', O: 'OpenSSL' });
                expect(p.publicKey.alg).toBe(name === 'Ed25519' ? 'Ed25519' : 'ECDSA-P256');
                expect(X.verify(der, p.publicKey)).toBe(true);
                const bad = new Uint8Array(der); bad[bad.length - 5] ^= 1;
                expect(quiet(() => X.verify(bad, p.publicKey))).toBe(false);
            } finally { rmSync(dir, { recursive: true, force: true }); }
        });
    }
});

describe('x509 — malformed input is false', () => {
    const k = edKey(5);
    const base = { subject: { CN: 'x' }, serial: Uint8Array.of(1), notBefore: new Date(NOW - day), notAfter: new Date(+NOW + day), publicKey: k.pub };
    const cases = {
        'notBefore not before notAfter': { ...base, notAfter: new Date(NOW - 2 * day) },
        'serial zero': { ...base, serial: Uint8Array.of(0) },
        'serial of 20 bytes with the top bit (21 encoded octets)': { ...base, serial: new Uint8Array(20).fill(0xff) },
        'serial over 20 bytes': { ...base, serial: new Uint8Array(21).fill(1) },
        'country not two letters': { ...base, subject: { CN: 'x', C: 'FRA' } },
        'unknown name attribute': { ...base, subject: { CN: 'x', XX: 'y' } },
        'empty subject': { ...base, subject: {} },
        'unknown key usage': { ...base, extensions: { keyUsage: ['fly'] } },
        'pathLen without ca': { ...base, extensions: { basicConstraints: { ca: false, pathLen: 1 } } },
        'bad public key length': { ...base, publicKey: { alg: 'Ed25519', key: new Uint8Array(31) } },
        'unknown key alg': { ...base, publicKey: { alg: 'RSA', key: new Uint8Array(32) } },
    };
    for (const [why, spec] of Object.entries(cases)) {
        test(why, () => { expect(quiet(() => X.create(spec, k.signer))).toBe(false); });
    }
    test('an unsigned serial with the top bit set is a valid positive serial', () => {
        const der = X.create({ ...base, serial: Uint8Array.of(0x80) }, k.signer);
        expect(new nodeCrypto.X509Certificate(Buffer.from(der)).serialNumber).toBe('80');
        expect(X.create({ ...base, serial: new Uint8Array(20).fill(0x7f) }, k.signer)).toBeInstanceOf(Uint8Array);
    });
    test('a bad signer and garbage DER', () => {
        expect(quiet(() => X.create(base, { alg: 'Ed25519', privateKey: new Uint8Array(10) }))).toBe(false);
        expect(quiet(() => X.parse(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01])))).toBe(false);
        expect(quiet(() => X.parse('nope'))).toBe(false);
        expect(quiet(() => X.verify(new Uint8Array(4), k.pub))).toBe(false);
        expect(quiet(() => X.fromPem('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'))).toBe(false);
    });
});
