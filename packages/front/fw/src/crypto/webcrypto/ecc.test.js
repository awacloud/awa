// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for webcryptoEcc — WebCrypto-backed ECDSA + ECDH module.
 *
 * Covers:
 * - Module metadata and factory shape
 * - ECDSA generate → sign → verify round-trip on P-256/384/521
 * - Tampered signature / data → false
 * - Import a known P-256 public key (JWK + raw) and verify a precomputed
 *   raw r||s ECDSA signature vector
 * - ECDH shared-secret agreement (deriveBits symmetry) + deriveKey usability
 * - Cross-kind misuse (sign with ECDH key, derive with ECDSA key) → false
 * - Invalid curve / kind / hash / format → false
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { webcryptoEcc } from './ecc.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hex string → Uint8Array */
function fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** ASCII/UTF-8 string → Uint8Array */
function fromStr(s) {
    return new TextEncoder().encode(s);
}

const _wc = webcryptoEcc.factory();

// ---------------------------------------------------------------------------
// Static P-256 ECDSA(SHA-256) verification vector.
// Public key (JWK + raw) and a raw IEEE P1363 r||s signature over
// "webcrypto ecc test vector". Generated once with crypto.subtle, frozen here.
// ---------------------------------------------------------------------------

const VECTOR = {
    data: fromStr('webcrypto ecc test vector'),
    sigHex:
        'eef3010e317ea3798d424a496697865982388721af64cf17996f2220f5e4e1e6' +
        'f01a04a085a43c511f0ec34a6dc3fc22545f0b4da7ef1a5333dc3078a628c5a4',
    rawHex:
        '04d4e1b3dd71bcdfdc5c1a67a3ca1b32ecbb4fcad9df3e3f06aa9ae131598a7718' +
        '63ccdec6a6e8205b710c521bdeb933da1f6a432bc9d17c3504770543ef219bda',
    jwk: {
        crv: 'P-256',
        ext: true,
        key_ops: ['verify'],
        kty: 'EC',
        x: '1OGz3XG839xcGmejyhsy7LtPytnfPj8GqprhMVmKdxg',
        y: 'Y8zexqboIFtxDFIb3rkz2h9qQyvJ0Xw1BHcFQ-8hm9o'
    }
};

// ---------------------------------------------------------------------------
// 1. Metadata + factory shape
// ---------------------------------------------------------------------------

describe('webcryptoEcc metadata', () => {
    test('name', () => expect(webcryptoEcc.name).toBe('webcryptoEcc'));
    test('type', () => expect(webcryptoEcc.type).toBe('fw.crypto.webcrypto'));
    test('dependencies is empty', () => expect(webcryptoEcc.dependencies).toEqual([]));
    test('factory is a function', () => expect(typeof webcryptoEcc.factory).toBe('function'));
});

describe('webcryptoEcc factory shape', () => {
    test('isAvailable is a function', () => expect(typeof _wc.isAvailable).toBe('function'));
    test('generateKey is a function', () => expect(typeof _wc.generateKey).toBe('function'));
    test('sign is a function', () => expect(typeof _wc.sign).toBe('function'));
    test('verify is a function', () => expect(typeof _wc.verify).toBe('function'));
    test('deriveBits is a function', () => expect(typeof _wc.deriveBits).toBe('function'));
    test('deriveKey is a function', () => expect(typeof _wc.deriveKey).toBe('function'));
    test('importKey is a function', () => expect(typeof _wc.importKey).toBe('function'));
    test('exportKey is a function', () => expect(typeof _wc.exportKey).toBe('function'));
    test('isAvailable returns boolean', () => expect(typeof _wc.isAvailable()).toBe('boolean'));
    test('isAvailable is true in Bun', () => expect(_wc.isAvailable()).toBe(true));
});

// ---------------------------------------------------------------------------
// 2. ECDSA generate → sign → verify round-trip, per curve
// ---------------------------------------------------------------------------

describe('webcryptoEcc ECDSA sign/verify round-trip', () => {
    for (const [curve, hash] of [['P-256', 'SHA-256'], ['P-384', 'SHA-384'], ['P-521', 'SHA-512']]) {
        test(`${curve} with ${hash}: sign then verify is true`, async () => {
            const pair = await _wc.generateKey('ECDSA', curve);
            expect(pair).not.toBe(false);
            const data = fromStr(`round-trip ${curve}`);
            const sig = await _wc.sign(pair.privateKey, data, hash);
            expect(sig).not.toBe(false);
            expect(sig instanceof Uint8Array).toBe(true);
            const ok = await _wc.verify(pair.publicKey, sig, data, hash);
            expect(ok).toBe(true);
        });
    }

    test('default curve is P-256 and default hash SHA-256', async () => {
        const pair = await _wc.generateKey('ECDSA');
        expect(pair).not.toBe(false);
        expect(pair.privateKey.algorithm.namedCurve).toBe('P-256');
        const data = fromStr('default params');
        const sig = await _wc.sign(pair.privateKey, data);
        expect(sig).not.toBe(false);
        expect(await _wc.verify(pair.publicKey, sig, data)).toBe(true);
    });

    test('tampered signature returns false', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        const data = fromStr('tamper sig');
        const sig = await _wc.sign(pair.privateKey, data);
        const tampered = new Uint8Array(sig);
        tampered[0] ^= 0x01;
        expect(await _wc.verify(pair.publicKey, tampered, data)).toBe(false);
    });

    test('tampered data returns false', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        const data = fromStr('tamper data AAAA');
        const sig = await _wc.sign(pair.privateKey, data);
        const other = fromStr('tamper data BBBB');
        expect(await _wc.verify(pair.publicKey, sig, other)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 3. Import a known P-256 public key and verify a precomputed r||s signature
// ---------------------------------------------------------------------------

describe('webcryptoEcc known-vector verify (raw r||s)', () => {
    test('import JWK public key and verify static signature', async () => {
        const pub = await _wc.importKey('jwk', VECTOR.jwk, 'ECDSA', 'P-256', ['verify']);
        expect(pub).not.toBe(false);
        const ok = await _wc.verify(pub, fromHex(VECTOR.sigHex), VECTOR.data, 'SHA-256');
        expect(ok).toBe(true);
    });

    test('import raw public point and verify static signature', async () => {
        const pub = await _wc.importKey('raw', fromHex(VECTOR.rawHex), 'ECDSA', 'P-256', ['verify']);
        expect(pub).not.toBe(false);
        const ok = await _wc.verify(pub, fromHex(VECTOR.sigHex), VECTOR.data, 'SHA-256');
        expect(ok).toBe(true);
    });

    test('verify fails for tampered static signature', async () => {
        const pub = await _wc.importKey('jwk', VECTOR.jwk, 'ECDSA', 'P-256', ['verify']);
        const bad = fromHex(VECTOR.sigHex);
        bad[0] ^= 0x01;
        expect(await _wc.verify(pub, bad, VECTOR.data, 'SHA-256')).toBe(false);
    });

    test('signature is raw P1363 length (64 bytes for P-256)', () => {
        expect(fromHex(VECTOR.sigHex).length).toBe(64);
    });
});

// ---------------------------------------------------------------------------
// 4. Import / export round-trips
// ---------------------------------------------------------------------------

describe('webcryptoEcc import/export round-trip', () => {
    test('export raw → import raw → re-verify a fresh signature', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        const data = fromStr('export raw round-trip');
        const sig = await _wc.sign(pair.privateKey, data);

        const rawPub = await _wc.exportKey('raw', pair.publicKey);
        expect(rawPub instanceof Uint8Array).toBe(true);

        const reimported = await _wc.importKey('raw', rawPub, 'ECDSA', 'P-256', ['verify']);
        expect(reimported).not.toBe(false);
        expect(await _wc.verify(reimported, sig, data)).toBe(true);
    });

    test('export jwk returns a plain object', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        const jwk = await _wc.exportKey('jwk', pair.publicKey);
        expect(typeof jwk).toBe('object');
        expect(jwk instanceof Uint8Array).toBe(false);
        expect(jwk.kty).toBe('EC');
        expect(jwk.crv).toBe('P-256');
    });

    test('export spki returns a Uint8Array', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        const spki = await _wc.exportKey('spki', pair.publicKey);
        expect(spki instanceof Uint8Array).toBe(true);
        const reimported = await _wc.importKey('spki', spki, 'ECDSA', 'P-256', ['verify']);
        expect(reimported).not.toBe(false);
    });

    test('export pkcs8 of an extractable private key returns a Uint8Array', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256', true);
        const pkcs8 = await _wc.exportKey('pkcs8', pair.privateKey);
        expect(pkcs8 instanceof Uint8Array).toBe(true);
        const reimported = await _wc.importKey('pkcs8', pkcs8, 'ECDSA', 'P-256', ['sign']);
        expect(reimported).not.toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 5. ECDH shared-secret agreement + deriveKey
// ---------------------------------------------------------------------------

describe('webcryptoEcc ECDH deriveBits agreement', () => {
    test('deriveBits(privA, pubB) == deriveBits(privB, pubA)', async () => {
        const a = await _wc.generateKey('ECDH', 'P-256');
        const b = await _wc.generateKey('ECDH', 'P-256');
        expect(a).not.toBe(false);
        expect(b).not.toBe(false);
        const ab = await _wc.deriveBits(a.privateKey, b.publicKey, 256);
        const ba = await _wc.deriveBits(b.privateKey, a.publicKey, 256);
        expect(ab).not.toBe(false);
        expect(ba).not.toBe(false);
        expect(Array.from(ab)).toEqual(Array.from(ba));
    });

    test('agreement holds on P-384', async () => {
        const a = await _wc.generateKey('ECDH', 'P-384');
        const b = await _wc.generateKey('ECDH', 'P-384');
        const ab = await _wc.deriveBits(a.privateKey, b.publicKey, 384);
        const ba = await _wc.deriveBits(b.privateKey, a.publicKey, 384);
        expect(Array.from(ab)).toEqual(Array.from(ba));
    });
});

describe('webcryptoEcc ECDH deriveKey', () => {
    test('yields a usable AES-GCM CryptoKey', async () => {
        const a = await _wc.generateKey('ECDH', 'P-256');
        const b = await _wc.generateKey('ECDH', 'P-256');
        const key = await _wc.deriveKey(
            a.privateKey,
            b.publicKey,
            { name: 'AES-GCM', length: 256 },
            ['encrypt', 'decrypt'],
            true
        );
        expect(key).not.toBe(false);
        expect(key.type).toBe('secret');
        expect(key.algorithm.name).toBe('AES-GCM');
        expect(key.algorithm.length).toBe(256);
    });
});

// ---------------------------------------------------------------------------
// 6. Cross-kind misuse → false
// ---------------------------------------------------------------------------

describe('webcryptoEcc cross-kind misuse', () => {
    let ecdsa;
    let ecdh;
    beforeAll(async () => {
        ecdsa = await _wc.generateKey('ECDSA', 'P-256');
        ecdh = await _wc.generateKey('ECDH', 'P-256');
    });

    test('sign with an ECDH key returns false', async () => {
        const r = await _wc.sign(ecdh.privateKey, fromStr('x'));
        expect(r).toBe(false);
    });

    test('verify with an ECDH key returns false', async () => {
        const r = await _wc.verify(ecdh.publicKey, new Uint8Array(64), fromStr('x'));
        expect(r).toBe(false);
    });

    test('deriveBits with an ECDSA key returns false', async () => {
        const r = await _wc.deriveBits(ecdsa.privateKey, ecdh.publicKey, 256);
        expect(r).toBe(false);
    });

    test('deriveKey with an ECDSA key returns false', async () => {
        const r = await _wc.deriveKey(
            ecdsa.privateKey,
            ecdh.publicKey,
            { name: 'AES-GCM', length: 256 },
            ['encrypt']
        );
        expect(r).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7. Invalid curve / kind / hash / format → false
// ---------------------------------------------------------------------------

describe('webcryptoEcc invalid arguments', () => {
    test('generateKey with unsupported kind returns false', async () => {
        expect(await _wc.generateKey('RSA', 'P-256')).toBe(false);
    });

    test('generateKey with unsupported curve returns false', async () => {
        expect(await _wc.generateKey('ECDSA', 'secp256k1')).toBe(false);
    });

    test('sign with unsupported hash returns false', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        expect(await _wc.sign(pair.privateKey, fromStr('x'), 'SHA-1')).toBe(false);
    });

    test('verify with unsupported hash returns false', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        expect(await _wc.verify(pair.publicKey, new Uint8Array(64), fromStr('x'), 'SHA-3-256')).toBe(false);
    });

    test('importKey with unsupported format returns false', async () => {
        expect(await _wc.importKey('der', new Uint8Array(8), 'ECDSA', 'P-256', ['verify'])).toBe(false);
    });

    test('importKey with unsupported kind returns false', async () => {
        expect(await _wc.importKey('raw', fromHex(VECTOR.rawHex), 'EdDSA', 'P-256', ['verify'])).toBe(false);
    });

    test('importKey with unsupported curve returns false', async () => {
        expect(await _wc.importKey('raw', fromHex(VECTOR.rawHex), 'ECDSA', 'P-192', ['verify'])).toBe(false);
    });

    test('exportKey with unsupported format returns false', async () => {
        const pair = await _wc.generateKey('ECDSA', 'P-256');
        expect(await _wc.exportKey('der', pair.publicKey)).toBe(false);
    });
});

// ── ACVP ECDSA-SigVer-FIPS186-5 (vendored) ─────────────────────────────────
// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ECDSA-SigVer-FIPS186-5/
// (copied byte-exact into tests/_vectors/, provenance in its README). The
// groups WebCrypto can run: P-256 / P-384 / P-521 with SHA2-256 or SHA2-512,
// 6 groups x 7 cases, valid and invalid. Each case must verify to exactly
// its `testPassed` value; a key that does not import counts as `false`.
describe('webcryptoEcc — ACVP ECDSA-SigVer-FIPS186-5', () => {
    const FIELD_BYTES = { 'P-256': 32, 'P-384': 48, 'P-521': 66 };
    const HASH = { 'SHA2-256': 'SHA-256', 'SHA2-512': 'SHA-512' };
    const hexToBytes = (h, len) => {
        const s = h.length % 2 ? '0' + h : h;
        const raw = Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
        if (len === undefined || raw.length >= len) return raw;
        const out = new Uint8Array(len);
        out.set(raw, len - raw.length);
        return out;
    };
    let groups = [];

    beforeAll(async () => {
        const { readFileSync } = await import('node:fs');
        const url = new URL('../../../tests/_vectors/ECDSA-SigVer-FIPS186-5/internalProjection.json', import.meta.url);
        const p = JSON.parse(readFileSync(url, 'utf8'));
        groups = p.testGroups.filter((g) => FIELD_BYTES[g.curve] && HASH[g.hashAlg]);
    });

    test('the supported subset is the expected size (non-vacuity)', () => {
        expect(groups.length).toBe(6);
        expect(groups.reduce((n, g) => n + g.tests.length, 0)).toBe(42);
        // both outcomes are exercised
        const all = groups.flatMap((g) => g.tests);
        expect(all.some((t) => t.testPassed)).toBe(true);
        expect(all.some((t) => !t.testPassed)).toBe(true);
    });

    test('every case verifies to its ACVP testPassed value', async () => {
        const mismatches = [];
        const warn = console.warn, error = console.error;
        console.warn = () => {}; console.error = () => {};
        try {
            for (const g of groups) {
                const n = FIELD_BYTES[g.curve];
                for (const t of g.tests) {
                    const raw = new Uint8Array(1 + 2 * n);
                    raw[0] = 0x04;
                    raw.set(hexToBytes(t.qx, n).slice(-n), 1);
                    raw.set(hexToBytes(t.qy, n).slice(-n), 1 + n);
                    const sig = new Uint8Array(2 * n);
                    const r = hexToBytes(t.r, n), s = hexToBytes(t.s, n);
                    const fits = r.length === n && s.length === n;
                    let ok = false;
                    if (fits) {
                        sig.set(r, 0);
                        sig.set(s, n);
                        const pub = await _wc.importKey('raw', raw, 'ECDSA', g.curve, ['verify']);
                        ok = pub ? await _wc.verify(pub, sig, hexToBytes(t.message), HASH[g.hashAlg]) : false;
                    }
                    if (ok !== t.testPassed) mismatches.push(`tg${g.tgId}/tc${t.tcId}`);
                }
            }
        } finally {
            console.warn = warn; console.error = error;
        }
        expect(mismatches).toEqual([]);
    }, 60000);
});
