// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for webcryptoRsa — WebCrypto-backed RSA module.
 *
 * Covers:
 * - Module metadata and factory shape
 * - RSA-OAEP encrypt/decrypt round-trip (with/without label, tampered ct)
 * - RSA-PSS sign/verify round-trip (tampered sig/data)
 * - RSASSA-PKCS1-v1_5 sign/verify round-trip + deprecation warning
 * - Import/export round-trip (spki/pkcs8/jwk) then re-verify a fresh signature
 * - Cross-scheme misuse rejection (encrypt with PSS key, sign with OAEP key)
 * - Invalid scheme/hash/modulus/format → false
 *
 * RSA keygen at 2048 bits is slow; one keypair per scheme is generated ONCE in
 * a `beforeAll` and reused across cases (smallest allowed modulus).
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { webcryptoRsa } from './rsa.js';

const _wc = webcryptoRsa.factory();

/** ASCII/UTF-8 string → Uint8Array */
function fromStr(s) {
    return new TextEncoder().encode(s);
}

/** Uint8Array → string */
function toStr(u8) {
    return new TextDecoder().decode(u8);
}

/** Run a fn with console.warn captured; returns { result, warnings }. */
async function withWarnCapture(fn) {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    let result;
    try {
        result = await fn();
    } finally {
        console.warn = originalWarn;
    }
    return { result, warnings };
}

// ---------------------------------------------------------------------------
// Shared keypairs (generated once)
// ---------------------------------------------------------------------------

let oaepKeys;
let pssKeys;
let pkcs1Keys;

beforeAll(async () => {
    oaepKeys = await _wc.generateKey('OAEP', 2048, 'SHA-256');
    pssKeys = await _wc.generateKey('PSS', 2048, 'SHA-256');
    // PKCS1 emits a deprecation warning at generate time; swallow it here.
    const gen = await withWarnCapture(() => _wc.generateKey('PKCS1', 2048, 'SHA-256'));
    pkcs1Keys = gen.result;
}, 60000);

// ---------------------------------------------------------------------------
// 1. Metadata + factory shape
// ---------------------------------------------------------------------------

describe('webcryptoRsa metadata', () => {
    test('name', () => expect(webcryptoRsa.name).toBe('webcryptoRsa'));
    test('type', () => expect(webcryptoRsa.type).toBe('fw.crypto.webcrypto'));
    test('dependencies is empty', () => expect(webcryptoRsa.dependencies).toEqual([]));
    test('factory is a function', () => expect(typeof webcryptoRsa.factory).toBe('function'));
});

describe('webcryptoRsa factory shape', () => {
    test('isAvailable is a function', () => expect(typeof _wc.isAvailable).toBe('function'));
    test('generateKey is a function', () => expect(typeof _wc.generateKey).toBe('function'));
    test('encrypt is a function', () => expect(typeof _wc.encrypt).toBe('function'));
    test('decrypt is a function', () => expect(typeof _wc.decrypt).toBe('function'));
    test('sign is a function', () => expect(typeof _wc.sign).toBe('function'));
    test('verify is a function', () => expect(typeof _wc.verify).toBe('function'));
    test('importKey is a function', () => expect(typeof _wc.importKey).toBe('function'));
    test('exportKey is a function', () => expect(typeof _wc.exportKey).toBe('function'));
    test('isAvailable returns boolean', () => expect(typeof _wc.isAvailable()).toBe('boolean'));
    test('isAvailable true in Bun', () => expect(_wc.isAvailable()).toBe(true));
});

// ---------------------------------------------------------------------------
// 2. generateKey produces a CryptoKeyPair
// ---------------------------------------------------------------------------

describe('webcryptoRsa generateKey', () => {
    test('OAEP keypair has the right algorithm and usages', () => {
        expect(oaepKeys).not.toBe(false);
        expect(oaepKeys.publicKey.algorithm.name).toBe('RSA-OAEP');
        expect(oaepKeys.privateKey.usages).toContain('decrypt');
        expect(oaepKeys.publicKey.usages).toContain('encrypt');
    });

    test('PSS keypair has the right algorithm and usages', () => {
        expect(pssKeys).not.toBe(false);
        expect(pssKeys.publicKey.algorithm.name).toBe('RSA-PSS');
        expect(pssKeys.privateKey.usages).toContain('sign');
        expect(pssKeys.publicKey.usages).toContain('verify');
    });

    test('PKCS1 keypair has the right algorithm', () => {
        expect(pkcs1Keys).not.toBe(false);
        expect(pkcs1Keys.publicKey.algorithm.name).toBe('RSASSA-PKCS1-v1_5');
    });

    test('PKCS1 generateKey emits deprecation warning', async () => {
        const { result, warnings } = await withWarnCapture(
            () => _wc.generateKey('PKCS1', 2048, 'SHA-256')
        );
        expect(result).not.toBe(false);
        expect(warnings.some(w => w.includes('DEPRECATED: RSASSA-PKCS1-v1_5'))).toBe(true);
    }, 30000);
});

// ---------------------------------------------------------------------------
// 3. RSA-OAEP encrypt/decrypt round-trip
// ---------------------------------------------------------------------------

describe('webcryptoRsa OAEP encrypt/decrypt', () => {
    test('round-trip recovers plaintext', async () => {
        const data = fromStr('secret message');
        const ct = await _wc.encrypt(oaepKeys.publicKey, data);
        expect(ct).not.toBe(false);
        expect(ct instanceof Uint8Array).toBe(true);
        const pt = await _wc.decrypt(oaepKeys.privateKey, ct);
        expect(pt).not.toBe(false);
        expect(toStr(pt)).toBe('secret message');
    });

    test('round-trip with label recovers plaintext', async () => {
        const data = fromStr('labelled secret');
        const label = fromStr('ctx-label');
        const ct = await _wc.encrypt(oaepKeys.publicKey, data, label);
        expect(ct).not.toBe(false);
        const pt = await _wc.decrypt(oaepKeys.privateKey, ct, label);
        expect(pt).not.toBe(false);
        expect(toStr(pt)).toBe('labelled secret');
    });

    test('decrypt with mismatched label returns false', async () => {
        const data = fromStr('label mismatch');
        const ct = await _wc.encrypt(oaepKeys.publicKey, data, fromStr('label-A'));
        expect(ct).not.toBe(false);
        const pt = await _wc.decrypt(oaepKeys.privateKey, ct, fromStr('label-B'));
        expect(pt).toBe(false);
    });

    test('tampered ciphertext returns false', async () => {
        const data = fromStr('tamper-ct');
        const ct = await _wc.encrypt(oaepKeys.publicKey, data);
        expect(ct).not.toBe(false);
        const tampered = new Uint8Array(ct);
        tampered[0] ^= 0x01;
        const pt = await _wc.decrypt(oaepKeys.privateKey, tampered);
        expect(pt).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 4. RSA-PSS sign/verify round-trip
// ---------------------------------------------------------------------------

describe('webcryptoRsa PSS sign/verify', () => {
    test('sign then verify returns true', async () => {
        const data = fromStr('pss payload');
        const sig = await _wc.sign(pssKeys.privateKey, data);
        expect(sig).not.toBe(false);
        expect(sig instanceof Uint8Array).toBe(true);
        const ok = await _wc.verify(pssKeys.publicKey, sig, data);
        expect(ok).toBe(true);
    });

    test('tampered signature returns false', async () => {
        const data = fromStr('pss tamper sig');
        const sig = await _wc.sign(pssKeys.privateKey, data);
        expect(sig).not.toBe(false);
        const tampered = new Uint8Array(sig);
        tampered[0] ^= 0x01;
        const ok = await _wc.verify(pssKeys.publicKey, tampered, data);
        expect(ok).toBe(false);
    });

    test('tampered data returns false', async () => {
        const data = fromStr('pss tamper data');
        const sig = await _wc.sign(pssKeys.privateKey, data);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(pssKeys.publicKey, sig, fromStr('pss tamper DATA'));
        expect(ok).toBe(false);
    });

    test('custom salt length round-trips', async () => {
        const data = fromStr('pss custom salt');
        const sig = await _wc.sign(pssKeys.privateKey, data, 16);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(pssKeys.publicKey, sig, data, 16);
        expect(ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 5. RSASSA-PKCS1-v1_5 sign/verify round-trip + deprecation
// ---------------------------------------------------------------------------

describe('webcryptoRsa PKCS1 sign/verify', () => {
    test('sign then verify returns true and warns', async () => {
        const data = fromStr('pkcs1 payload');
        const signed = await withWarnCapture(() => _wc.sign(pkcs1Keys.privateKey, data));
        expect(signed.result).not.toBe(false);
        expect(signed.warnings.some(w => w.includes('DEPRECATED: RSASSA-PKCS1-v1_5'))).toBe(true);

        const verified = await withWarnCapture(
            () => _wc.verify(pkcs1Keys.publicKey, signed.result, data)
        );
        expect(verified.result).toBe(true);
        expect(verified.warnings.some(w => w.includes('DEPRECATED: RSASSA-PKCS1-v1_5'))).toBe(true);
    });

    test('tampered signature returns false', async () => {
        const data = fromStr('pkcs1 tamper');
        const { result: sig } = await withWarnCapture(() => _wc.sign(pkcs1Keys.privateKey, data));
        expect(sig).not.toBe(false);
        const tampered = new Uint8Array(sig);
        tampered[0] ^= 0x01;
        const { result: ok } = await withWarnCapture(
            () => _wc.verify(pkcs1Keys.publicKey, tampered, data)
        );
        expect(ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 6. Import/export round-trip then re-verify a fresh signature
// ---------------------------------------------------------------------------

describe('webcryptoRsa import/export round-trip', () => {
    test('spki public key round-trips and verifies a fresh PSS signature', async () => {
        const spki = await _wc.exportKey('spki', pssKeys.publicKey);
        expect(spki instanceof Uint8Array).toBe(true);
        const reimported = await _wc.importKey('spki', spki, 'PSS', 'SHA-256', ['verify']);
        expect(reimported).not.toBe(false);

        const data = fromStr('spki round-trip');
        const sig = await _wc.sign(pssKeys.privateKey, data);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(reimported, sig, data);
        expect(ok).toBe(true);
    });

    test('pkcs8 private key round-trips and produces a verifiable signature', async () => {
        const pkcs8 = await _wc.exportKey('pkcs8', pssKeys.privateKey);
        expect(pkcs8 instanceof Uint8Array).toBe(true);
        const reimported = await _wc.importKey('pkcs8', pkcs8, 'PSS', 'SHA-256', ['sign'], false);
        expect(reimported).not.toBe(false);

        const data = fromStr('pkcs8 round-trip');
        const sig = await _wc.sign(reimported, data);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(pssKeys.publicKey, sig, data);
        expect(ok).toBe(true);
    });

    test('jwk public key round-trips as an object', async () => {
        const jwk = await _wc.exportKey('jwk', pssKeys.publicKey);
        expect(typeof jwk).toBe('object');
        expect(jwk instanceof Uint8Array).toBe(false);
        expect(jwk.kty).toBe('RSA');
        const reimported = await _wc.importKey('jwk', jwk, 'PSS', 'SHA-256', ['verify']);
        expect(reimported).not.toBe(false);

        const data = fromStr('jwk round-trip');
        const sig = await _wc.sign(pssKeys.privateKey, data);
        const ok = await _wc.verify(reimported, sig, data);
        expect(ok).toBe(true);
    });

    test('OAEP spki round-trip can encrypt, original private decrypts', async () => {
        const spki = await _wc.exportKey('spki', oaepKeys.publicKey);
        const reimported = await _wc.importKey('spki', spki, 'OAEP', 'SHA-256', ['encrypt']);
        expect(reimported).not.toBe(false);
        const data = fromStr('oaep import enc');
        const ct = await _wc.encrypt(reimported, data);
        expect(ct).not.toBe(false);
        const pt = await _wc.decrypt(oaepKeys.privateKey, ct);
        expect(toStr(pt)).toBe('oaep import enc');
    });
});

// ---------------------------------------------------------------------------
// 7. Cross-scheme misuse → false
// ---------------------------------------------------------------------------

describe('webcryptoRsa cross-scheme misuse', () => {
    test('encrypt with a PSS public key returns false', async () => {
        const ct = await _wc.encrypt(pssKeys.publicKey, fromStr('nope'));
        expect(ct).toBe(false);
    });

    test('decrypt with a PSS private key returns false', async () => {
        const pt = await _wc.decrypt(pssKeys.privateKey, fromStr('nope'));
        expect(pt).toBe(false);
    });

    test('sign with an OAEP private key returns false', async () => {
        const sig = await _wc.sign(oaepKeys.privateKey, fromStr('nope'));
        expect(sig).toBe(false);
    });

    test('verify with an OAEP public key returns false', async () => {
        const ok = await _wc.verify(oaepKeys.publicKey, fromStr('sig'), fromStr('nope'));
        expect(ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 8. Invalid scheme/hash/modulus/format → false
// ---------------------------------------------------------------------------

describe('webcryptoRsa invalid arguments', () => {
    test('generateKey with unsupported scheme returns false', async () => {
        expect(await _wc.generateKey('RSA-ELGAMAL', 2048, 'SHA-256')).toBe(false);
    });

    test('generateKey with unsupported modulus returns false', async () => {
        expect(await _wc.generateKey('PSS', 1024, 'SHA-256')).toBe(false);
    });

    test('generateKey with unsupported hash returns false', async () => {
        expect(await _wc.generateKey('PSS', 2048, 'SHA-3-256')).toBe(false);
    });

    test('importKey with unsupported format returns false', async () => {
        expect(await _wc.importKey('raw', new Uint8Array(4), 'PSS', 'SHA-256', ['verify'])).toBe(false);
    });

    test('importKey with unsupported scheme returns false', async () => {
        const spki = await _wc.exportKey('spki', pssKeys.publicKey);
        expect(await _wc.importKey('spki', spki, 'BOGUS', 'SHA-256', ['verify'])).toBe(false);
    });

    test('importKey with unsupported hash returns false', async () => {
        const spki = await _wc.exportKey('spki', pssKeys.publicKey);
        expect(await _wc.importKey('spki', spki, 'PSS', 'MD5', ['verify'])).toBe(false);
    });

    test('exportKey with unsupported format returns false', async () => {
        expect(await _wc.exportKey('raw', pssKeys.publicKey)).toBe(false);
    });
});
