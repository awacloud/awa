// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmHkdf } from './hkdf.js';
import { wasmRuntime } from './runtime.js';
import { hkdf as pureHkdf } from '../hash/hkdf.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hmac } from '../hash/hmac.js';
import { sha256 } from '../hash/sha256.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `hkdf` dist binary
// (hkdf.scalar.wasm — scalar-only, simd:false) by name via wasmRuntime.load.
const _rt  = wasmRuntime.factory();
const _hkdf = wasmHkdf.factory(_rt);

// Pure-JS hkdf for parity checks. It takes/returns bitArray; convert via
// bitArray helpers. Pure HKDF is one-shot: derive(salt, ikm, info, lengthBits).
const _ba   = bitArray.factory();
const _utf8 = utf8.factory();
const _sha  = sha256.factory(_ba, _utf8);
const _hmac = hmac.factory(_ba, _utf8, _sha);
const _pure = pureHkdf.factory(_ba, _utf8, _hmac);

// ── helper utilities ─────────────────────────────────────────────────────────

/** Hex-encode a Uint8Array. */
function hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

/** Decode a lowercase hex string to Uint8Array. */
function fromHex(s) {
    if (s.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmHkdf — module metadata', () => {
    test('name', () => {
        expect(wasmHkdf.name).toBe('wasmHkdf');
    });

    test('type', () => {
        expect(wasmHkdf.type).toBe('fw.crypto.wasm');
    });

    test('version', () => {
        expect(typeof wasmHkdf.version).toBe('string');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmHkdf.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmHkdf.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmHkdf.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmHkdf — API shape', () => {
    test('exposes isAvailable and deriveBits', () => {
        expect(typeof _hkdf.isAvailable).toBe('function');
        expect(typeof _hkdf.deriveBits).toBe('function');
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_hkdf.isAvailable()).toBe(_rt.isAvailable());
        expect(_hkdf.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });

    test('deriveBits returns a Promise', () => {
        const result = _hkdf.deriveBits(
            new Uint8Array(22),
            new Uint8Array(13),
            new Uint8Array(10),
            32,
        );
        expect(result).toBeInstanceOf(Promise);
    });
});

// ── RFC 5869 KAT vectors ─────────────────────────────────────────────────────
//
// Vectors from references/SPEC/RFC/rfc5869-hkdf.json (Appendix A).
// All three SHA-256 test cases A.1 (basic), A.2 (longer inputs/outputs),
// A.3 (zero-length salt/info).

describe('wasmHkdf — RFC 5869 HKDF-SHA-256 KAT', () => {
    test('A.1 basic test case (tcId=1)', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = fromHex('000102030405060708090a0b0c');
        const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
        const L    = 42;
        const expectedOkm = '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';

        const okm = await _hkdf.deriveBits(ikm, salt, info, L, 256);
        expect(okm).not.toBe(false);
        expect(okm).toBeInstanceOf(Uint8Array);
        expect(okm.length).toBe(L);
        expect(hex(okm)).toBe(expectedOkm);
    });

    test('A.2 longer inputs/outputs (tcId=2)', async () => {
        const ikm  = fromHex(
            '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
            '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f' +
            '404142434445464748494a4b4c4d4e4f',
        );
        const salt = fromHex(
            '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f' +
            '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f' +
            'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
        );
        const info = fromHex(
            'b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf' +
            'd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef' +
            'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
        );
        const L    = 82;
        const expectedOkm =
            'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
            '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71c' +
            'c30c58179ec3e87c14c01d5c1f3434f1d87';

        const okm = await _hkdf.deriveBits(ikm, salt, info, L, 256);
        expect(okm).not.toBe(false);
        expect(okm).toBeInstanceOf(Uint8Array);
        expect(okm.length).toBe(L);
        expect(hex(okm)).toBe(expectedOkm);
    });

    test('A.3 zero-length salt and info (tcId=3)', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = new Uint8Array(0); // empty salt
        const info = new Uint8Array(0); // empty info
        const L    = 42;
        const expectedOkm = '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8';

        const okm = await _hkdf.deriveBits(ikm, salt, info, L, 256);
        expect(okm).not.toBe(false);
        expect(okm).toBeInstanceOf(Uint8Array);
        expect(okm.length).toBe(L);
        expect(hex(okm)).toBe(expectedOkm);
    });

    test('default hash=256 (omitted) matches explicit hash=256', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = fromHex('000102030405060708090a0b0c');
        const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
        const L    = 32;

        const okmDefault  = await _hkdf.deriveBits(ikm, salt, info, L);
        const okmExplicit = await _hkdf.deriveBits(ikm, salt, info, L, 256);
        expect(okmDefault).not.toBe(false);
        expect(okmExplicit).not.toBe(false);
        expect(hex(okmDefault)).toBe(hex(okmExplicit));
    });
});

// ── parity with pure-JS hkdf ─────────────────────────────────────────────────
//
// The pure-JS hkdf module operates on bitArray; convert Uint8Array inputs via
// bitArray.ui8_to_ba() and outputs via bitArray.ba_to_ui8().

describe('wasmHkdf — parity with pure-JS hkdf (HMAC-SHA-256)', () => {
    const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    const L    = 42;

    test('A.1 deriveBits agrees with pure-JS derive', async () => {
        const wasmOkm = await _hkdf.deriveBits(ikm, salt, info, L, 256);
        expect(wasmOkm).not.toBe(false);

        const pureSaltBa = _ba.ui8_to_ba(salt);
        const pureIkmBa  = _ba.ui8_to_ba(ikm);
        const pureInfoBa = _ba.ui8_to_ba(info);
        const pureOkmBa  = _pure.derive(pureSaltBa, pureIkmBa, pureInfoBa, L * 8);
        expect(pureOkmBa).not.toBe(false);
        const pureOkm = _ba.ba_to_ui8(pureOkmBa);

        expect(hex(wasmOkm)).toBe(hex(pureOkm));
    });

    test('zero-length salt/info parity', async () => {
        const emptyIkm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const emptySalt = new Uint8Array(0);
        const emptyInfo = new Uint8Array(0);

        const wasmOkm = await _hkdf.deriveBits(emptyIkm, emptySalt, emptyInfo, 32, 256);
        expect(wasmOkm).not.toBe(false);

        const pureOkmBa = _pure.derive([], _ba.ui8_to_ba(emptyIkm), [], 32 * 8);
        expect(pureOkmBa).not.toBe(false);
        const pureOkm = _ba.ba_to_ui8(pureOkmBa);

        expect(hex(wasmOkm)).toBe(hex(pureOkm));
    });
});

// ── validation: dkLen cap, invalid hash → false ──────────────────────────────

describe('wasmHkdf — validation → false, no throw', () => {
    test('dkLen > 255*hashLen (SHA-256: 255*32=8160) → false', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = fromHex('000102030405060708090a0b0c');
        const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
        const r = await _hkdf.deriveBits(ikm, salt, info, 8161, 256);
        expect(r).toBe(false);
    });

    test('dkLen exactly at cap (255*32=8160) → Uint8Array (boundary)', async () => {
        const ikm  = new Uint8Array(32);
        const salt = new Uint8Array(16);
        const info = new Uint8Array(0);
        const r = await _hkdf.deriveBits(ikm, salt, info, 8160, 256);
        expect(r).not.toBe(false);
        expect(r).toBeInstanceOf(Uint8Array);
        expect(r.length).toBe(8160);
    });

    test('invalid hash (1) → false', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = fromHex('000102030405060708090a0b0c');
        const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
        // @ts-expect-error intentional misuse
        const r = await _hkdf.deriveBits(ikm, salt, info, 32, 1);
        expect(r).toBe(false);
    });

    test('invalid hash (224) → false', async () => {
        const ikm  = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const salt = fromHex('000102030405060708090a0b0c');
        const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
        // @ts-expect-error intentional misuse
        const r = await _hkdf.deriveBits(ikm, salt, info, 32, 224);
        expect(r).toBe(false);
    });

    test('dkLen = 0 → false', async () => {
        const r = await _hkdf.deriveBits(
            new Uint8Array(22),
            new Uint8Array(13),
            new Uint8Array(10),
            0,
            256,
        );
        expect(r).toBe(false);
    });

    test('dkLen negative → false', async () => {
        const r = await _hkdf.deriveBits(
            new Uint8Array(22),
            new Uint8Array(0),
            new Uint8Array(0),
            -1,
            256,
        );
        expect(r).toBe(false);
    });

    test('non-Uint8Array ikm → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _hkdf.deriveBits([1, 2, 3], new Uint8Array(0), new Uint8Array(0), 32);
        expect(r).toBe(false);
    });

    test('non-Uint8Array salt → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _hkdf.deriveBits(new Uint8Array(22), 'salt', new Uint8Array(0), 32);
        expect(r).toBe(false);
    });

    test('non-Uint8Array info → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _hkdf.deriveBits(new Uint8Array(22), new Uint8Array(0), null, 32);
        expect(r).toBe(false);
    });

    test('invalid inputs never throw', async () => {
        // @ts-expect-error intentional misuse
        await expect(_hkdf.deriveBits(null, null, null, 32)).resolves.toBe(false);
    });
});
