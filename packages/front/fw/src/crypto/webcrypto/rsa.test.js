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
    pssKeys = await _wc.generateKey('PSS', 2048, 'SHA-256', true);   // exported below (pkcs8)
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

    test('a decryption failure is reported at warn level, not error', async () => {
        const ct = await _wc.encrypt(oaepKeys.publicKey, fromStr('log level'));
        const tampered = new Uint8Array(ct);
        tampered[0] ^= 0x01;
        const _logs = { warn: [], error: [] };
        const _w = console.warn, _e = console.error;
        console.warn = (...a) => { _logs.warn.push(a.join(' ')); };
        console.error = (...a) => { _logs.error.push(a.join(' ')); };
        let r;
        try { r = await _wc.decrypt(oaepKeys.privateKey, tampered); } finally {
        console.warn = _w; console.error = _e;
        }
        expect(r).toBe(false);
        expect(_logs.error.length).toBe(0);
        expect(_logs.warn.some((m) => m.includes('CORRUPT'))).toBe(true);
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

// ── ACVP RSA-SigVer-FIPS186-5, PKCS#1 v1.5 (vendored) ──────────────────────
// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-SigVer-FIPS186-5/
// (copied byte-exact into tests/_vectors/, provenance in its README). The
// groups WebCrypto can run: PKCS#1 v1.5 with SHA2-256 and a public exponent
// of at most 32 bits (2 of the 18 groups). Bun's WebCrypto verifies a valid
// signature to `false` when e exceeds 32 bits (measured on tg2: false under
// Bun 1.3.13, true under Node 24), so the other 16 groups would test the
// platform, not fw. Its PSS groups use SHA-3 / SHAKE, which WebCrypto lacks:
// PSS is covered by the node:crypto oracle below.
describe('webcryptoRsa — ACVP RSA-SigVer-FIPS186-5 (PKCS#1 v1.5)', () => {
    const hexToBytes = (h) => Uint8Array.from((h.length % 2 ? '0' + h : h).match(/../g) || [], (b) => parseInt(b, 16));
    const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
    let groups = [];

    beforeAll(async () => {
        const { readFileSync } = await import('node:fs');
        const url = new URL('../../../tests/_vectors/RSA-SigVer-FIPS186-5/internalProjection.json', import.meta.url);
        const p = JSON.parse(readFileSync(url, 'utf8'));
        groups = p.testGroups.filter((g) => g.sigType === 'pkcs1v1.5' && g.hashAlg === 'SHA2-256' && g.e.length <= 8);
    });

    test('the supported subset is the expected size (non-vacuity)', () => {
        expect(groups.length).toBe(2);
        const all = groups.flatMap((g) => g.tests);
        expect(all.length).toBe(12);
        expect(all.some((t) => t.testPassed)).toBe(true);
        expect(all.some((t) => !t.testPassed)).toBe(true);
    });

    test('every case verifies to its ACVP testPassed value', async () => {
        const mismatches = [];
        const warn = console.warn, error = console.error;
        console.warn = () => {}; console.error = () => {};
        try {
            for (const g of groups) {
                const jwk = { kty: 'RSA', n: b64u(hexToBytes(g.n)), e: b64u(hexToBytes(g.e)), ext: true };
                const pub = await _wc.importKey('jwk', jwk, 'PKCS1', 'SHA-256', ['verify']);
                for (const t of g.tests) {
                    const ok = pub ? await _wc.verify(pub, hexToBytes(t.signature), hexToBytes(t.message)) : false;
                    if (ok !== t.testPassed) mismatches.push(`tg${g.tgId}/tc${t.tcId}`);
                }
            }
        } finally {
            console.warn = warn; console.error = error;
        }
        expect(mismatches).toEqual([]);
    }, 120000);
});

// ── node:crypto oracle: RSA-PSS and RSA-OAEP across implementations ────────
// The ACVP sets have no OAEP and no SHA-2 PSS group WebCrypto runs, so an
// independent implementation is the oracle: node:crypto signs / encrypts,
// webcryptoRsa verifies / decrypts, and the other way round.
describe('webcryptoRsa — node:crypto oracle (PSS, OAEP)', () => {
    let nodeCrypto;
    let kp;

    beforeAll(async () => {
        nodeCrypto = await import('node:crypto');
        kp = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    });

    const spki = () => new Uint8Array(kp.publicKey.export({ type: 'spki', format: 'der' }));
    const pkcs8 = () => new Uint8Array(kp.privateKey.export({ type: 'pkcs8', format: 'der' }));
    const msg = new TextEncoder().encode('oracle message');

    test('a node:crypto PSS-SHA256 signature verifies; a tampered one does not', async () => {
        const sig = new Uint8Array(nodeCrypto.sign('sha256', msg, {
            key: kp.privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
        }));
        const pub = await _wc.importKey('spki', spki(), 'PSS', 'SHA-256', ['verify']);
        expect(await _wc.verify(pub, sig, msg, 32)).toBe(true);
        const bad = new Uint8Array(sig);
        bad[10] ^= 0x01;
        expect(await _wc.verify(pub, bad, msg, 32)).toBe(false);
    });

    test('a webcryptoRsa PSS-SHA256 signature verifies under node:crypto', async () => {
        const priv = await _wc.importKey('pkcs8', pkcs8(), 'PSS', 'SHA-256', ['sign']);
        const sig = await _wc.sign(priv, msg, 32);
        expect(nodeCrypto.verify('sha256', msg, {
            key: kp.publicKey, padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
        }, Buffer.from(sig))).toBe(true);
    });

    test('node:crypto OAEP-SHA256 ciphertext decrypts; webcryptoRsa ciphertext decrypts under node', async () => {
        const ct = new Uint8Array(nodeCrypto.publicEncrypt({
            key: kp.publicKey, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
        }, msg));
        const priv = await _wc.importKey('pkcs8', pkcs8(), 'OAEP', 'SHA-256', ['decrypt']);
        expect(Buffer.from(await _wc.decrypt(priv, ct)).toString()).toBe('oracle message');
        const pub = await _wc.importKey('spki', spki(), 'OAEP', 'SHA-256', ['encrypt']);
        const ct2 = await _wc.encrypt(pub, msg);
        expect(nodeCrypto.privateDecrypt({
            key: kp.privateKey, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
        }, Buffer.from(ct2)).toString()).toBe('oracle message');
    });
});
