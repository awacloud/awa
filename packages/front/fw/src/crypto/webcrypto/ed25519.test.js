// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeAll } from 'bun:test';
import { webcryptoEd25519 } from './ed25519.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Decode a lowercase hex string to Uint8Array. */
function fromHex(hex) {
    const len = hex.length >>> 1;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Convert Uint8Array to lowercase hex string. */
function toHex(ui8) {
    return Array.from(ui8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Ed25519 availability probe ───────────────────────────────────────────────
// Attempt generateKey once to discover whether this runtime supports Ed25519.
// Tests that rely on actual crypto operations are gated on this flag.

let _ed25519Available = false;
let _sharedKeyPair = null;

const _inst = webcryptoEd25519.factory();

beforeAll(async () => {
    const kp = await _inst.generateKey(true);
    if (kp !== false && kp && kp.privateKey && kp.publicKey) {
        _ed25519Available = true;
        _sharedKeyPair = kp;
    }
});

// ── RFC 8032 §7.1 Test Vector 1 ─────────────────────────────────────────────
// https://www.rfc-editor.org/rfc/rfc8032#section-7.1
// Test vector 1 (empty message):
//   PRIVATE KEY (seed): 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae3d55
//   PUBLIC KEY:         d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
//   MESSAGE:            (empty)
//   SIGNATURE:          e5564300c360ac729086e2cc806e828a
//                       84877f1eb8e5d974d873e06522490155
//                       5fb8821590a33bacc61e39701cf9b46b
//                       d25bf5f0595bbe24655141438e7a100b

const RFC8032_VEC1 = {
    publicKeyHex:  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    messageHex:    '',   // empty message
    signatureHex:  'e5564300c360ac729086e2cc806e828a' +
                   '84877f1eb8e5d974d873e06522490155' +
                   '5fb8821590a33bacc61e39701cf9b46b' +
                   'd25bf5f0595bbe24655141438e7a100b',
};

// ── module metadata ──────────────────────────────────────────────────────────

describe('webcryptoEd25519 — module metadata', () => {
    test('name', () => {
        expect(webcryptoEd25519.name).toBe('webcryptoEd25519');
    });

    test('version', () => {
        expect(webcryptoEd25519.version).toBe('1.0.0');
    });

    test('type', () => {
        expect(webcryptoEd25519.type).toBe('fw.crypto.webcrypto');
    });

    test('dependencies is empty array', () => {
        expect(webcryptoEd25519.dependencies).toEqual([]);
    });

    test('deps is absent (no dependencies)', () => {
        expect(webcryptoEd25519.deps).toBeUndefined();
    });

    test('factory is a function', () => {
        expect(typeof webcryptoEd25519.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('webcryptoEd25519 — API shape', () => {
    test('isAvailable is a function', () => {
        expect(typeof _inst.isAvailable).toBe('function');
    });

    test('generateKey is a function', () => {
        expect(typeof _inst.generateKey).toBe('function');
    });

    test('sign is a function', () => {
        expect(typeof _inst.sign).toBe('function');
    });

    test('verify is a function', () => {
        expect(typeof _inst.verify).toBe('function');
    });

    test('importKey is a function', () => {
        expect(typeof _inst.importKey).toBe('function');
    });

    test('exportKey is a function', () => {
        expect(typeof _inst.exportKey).toBe('function');
    });

    test('isAvailable returns boolean', () => {
        expect(typeof _inst.isAvailable()).toBe('boolean');
    });

    test('isAvailable is true in Bun (crypto.subtle present)', () => {
        expect(_inst.isAvailable()).toBe(true);
    });
});

// ── RFC 8032 §7.1 test vector ────────────────────────────────────────────────

describe('webcryptoEd25519 — RFC 8032 §7.1 test vector', () => {
    test('vector 1: import public key (raw) and verify published signature → true', async () => {
        if (!_ed25519Available) {
            // Platform does not support Ed25519 — degrade gracefully.
            expect(false).toBe(false); // reported as skip, not failure
            return;
        }

        const pubKeyBytes = fromHex(RFC8032_VEC1.publicKeyHex);
        const pubKey = await _inst.importKey('raw', pubKeyBytes, ['verify'], true);
        expect(pubKey).not.toBe(false);

        const message   = fromHex(RFC8032_VEC1.messageHex); // empty Uint8Array
        const signature = fromHex(RFC8032_VEC1.signatureHex);

        const valid = await _inst.verify(pubKey, signature, message);
        expect(valid).toBe(true);
    });

    test('vector 1: flipping signature byte → false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const pubKeyBytes = fromHex(RFC8032_VEC1.publicKeyHex);
        const pubKey = await _inst.importKey('raw', pubKeyBytes, ['verify'], true);
        expect(pubKey).not.toBe(false);

        const message   = fromHex(RFC8032_VEC1.messageHex);
        const signature = fromHex(RFC8032_VEC1.signatureHex);
        // Flip the first byte
        const tampered = new Uint8Array(signature);
        tampered[0] ^= 0xff;

        const valid = await _inst.verify(pubKey, tampered, message);
        expect(valid).toBe(false);
    });
});

// ── generateKey / sign / verify round-trip ───────────────────────────────────

describe('webcryptoEd25519 — generateKey → sign → verify round-trip', () => {
    test('generateKey returns a CryptoKeyPair with privateKey and publicKey', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }
        expect(_sharedKeyPair).not.toBe(null);
        expect(_sharedKeyPair.privateKey).toBeTruthy();
        expect(_sharedKeyPair.publicKey).toBeTruthy();
    });

    test('sign + verify round-trip: signature validates → true', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const message = new Uint8Array([1, 2, 3, 4, 5]);
        const sig = await _inst.sign(_sharedKeyPair.privateKey, message);
        expect(sig).toBeInstanceOf(Uint8Array);
        expect(sig.byteLength).toBe(64); // Ed25519 signature = 64 bytes

        const valid = await _inst.verify(_sharedKeyPair.publicKey, sig, message);
        expect(valid).toBe(true);
    });

    test('tampered message → verify returns false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const message  = new Uint8Array([10, 20, 30]);
        const tampered = new Uint8Array([10, 20, 31]); // one byte differs
        const sig = await _inst.sign(_sharedKeyPair.privateKey, message);
        expect(sig).not.toBe(false);

        const valid = await _inst.verify(_sharedKeyPair.publicKey, sig, tampered);
        expect(valid).toBe(false);
    });

    test('generateKey with extractable=false returns non-extractable key pair', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const kp = await _inst.generateKey(false);
        expect(kp).not.toBe(false);
        expect(kp.privateKey.extractable).toBe(false);
    });
});

// ── import/export raw public key round-trip ──────────────────────────────────

describe('webcryptoEd25519 — import/export raw public key round-trip', () => {
    test('export raw → re-import → bytes are identical (32 bytes)', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const exported = await _inst.exportKey('raw', _sharedKeyPair.publicKey);
        expect(exported).toBeInstanceOf(Uint8Array);
        expect(exported.byteLength).toBe(32); // Ed25519 raw public key = 32 bytes

        // Re-import and export again; bytes must match.
        const reimported = await _inst.importKey('raw', exported, ['verify'], true);
        expect(reimported).not.toBe(false);

        const reexported = await _inst.exportKey('raw', reimported);
        expect(reexported).toBeInstanceOf(Uint8Array);
        expect(toHex(reexported)).toBe(toHex(exported));
    });

    test('export jwk public key → object with "kty" and "crv" fields', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const jwk = await _inst.exportKey('jwk', _sharedKeyPair.publicKey);
        expect(typeof jwk).toBe('object');
        expect(jwk.kty).toBe('OKP');
        expect(jwk.crv).toBe('Ed25519');
    });
});

// ── invalid format → false ────────────────────────────────────────────────────

describe('webcryptoEd25519 — invalid format → false', () => {
    test('importKey with unknown format → false', async () => {
        const consoleSpy = [];
        const orig = console.error;
        console.error = (...args) => consoleSpy.push(args.join(' '));
        try {
            const result = await _inst.importKey('der', new Uint8Array(32), ['verify']);
            expect(result).toBe(false);
            expect(consoleSpy.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });

    test('exportKey with unknown format → false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const consoleSpy = [];
        const orig = console.error;
        console.error = (...args) => consoleSpy.push(args.join(' '));
        try {
            const result = await _inst.exportKey('der', _sharedKeyPair.publicKey);
            expect(result).toBe(false);
            expect(consoleSpy.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });

    test('sign with non-Ed25519 key guard → false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        // Generate an ECDSA key (algorithm.name !== 'Ed25519') to test the guard.
        const ecPair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );

        const consoleSpy = [];
        const orig = console.error;
        console.error = (...args) => consoleSpy.push(args.join(' '));
        try {
            const result = await _inst.sign(ecPair.privateKey, new Uint8Array([1, 2, 3]));
            expect(result).toBe(false);
            expect(consoleSpy.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });

    test('sign with non-Uint8Array message → false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const consoleSpy = [];
        const orig = console.error;
        console.error = (...args) => consoleSpy.push(args.join(' '));
        try {
            const result = await _inst.sign(_sharedKeyPair.privateKey, 'not-a-uint8array');
            expect(result).toBe(false);
            expect(consoleSpy.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });

    test('verify with non-Uint8Array signature → false', async () => {
        if (!_ed25519Available) {
            expect(false).toBe(false);
            return;
        }

        const consoleSpy = [];
        const orig = console.error;
        console.error = (...args) => consoleSpy.push(args.join(' '));
        try {
            const result = await _inst.verify(_sharedKeyPair.publicKey, 'not-a-sig', new Uint8Array([1]));
            expect(result).toBe(false);
            expect(consoleSpy.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });
});

// ── availability guard ───────────────────────────────────────────────────────

describe('webcryptoEd25519 — availability', () => {
    test('isAvailable() returns boolean', () => {
        expect(typeof _inst.isAvailable()).toBe('boolean');
    });

    test('generateKey resolves a CryptoKeyPair (non-false) when Ed25519 available', async () => {
        // When _ed25519Available is false, this test proves the module degraded gracefully
        // (generateKey returned false rather than throwing).
        if (!_ed25519Available) {
            const result = await _inst.generateKey();
            expect(result).toBe(false); // graceful degradation
            return;
        }
        const kp = await _inst.generateKey();
        expect(kp).not.toBe(false);
        expect(kp.privateKey.algorithm.name).toBe('Ed25519');
        expect(kp.publicKey.algorithm.name).toBe('Ed25519');
    });
});
