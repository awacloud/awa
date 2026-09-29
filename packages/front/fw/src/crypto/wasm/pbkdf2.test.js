// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for `wasmPbkdf2` — WASM PBKDF2 (RFC 8018 §5.2) wrapper.
 *
 * Covers:
 *   - Module metadata + factory API shape.
 *   - RFC 7914 §11 PBKDF2-HMAC-SHA-256 vectors (exact hex).
 *   - PBKDF2-HMAC-SHA-384 and SHA-512 vectors (cross-checked against Python hashlib).
 *   - Parity with the pure-JS `pbkdf2` module (same password/salt/iters/hash).
 *   - Invalid params → false, no throw.
 *   - Binary unavailable → false (no throw).
 *
 * KAT vectors for the WASM path (hashId 256/384/512) are taken from:
 *   - RFC 7914 §11 for PBKDF2-HMAC-SHA-256 (c=1 and c=4096 cases).
 *   - Python `hashlib.pbkdf2_hmac()` cross-check for SHA-384 and SHA-512.
 *   - The existing pure-JS pbkdf2.test.js has the same SHA-256 reference.
 *
 * NOTE: the pure-JS `pbkdf2` module works with bitArray (number[]) and uses
 * string inputs; the WASM module works with Uint8Array throughout. Parity
 * tests convert between the two representations using bitArray utilities.
 */

import { describe, test, expect } from 'bun:test';
import { wasmPbkdf2 } from './pbkdf2.js';
import { wasmRuntime } from './runtime.js';
import { pbkdf2 } from '../hash/pbkdf2.js';
import { hmac } from '../hash/hmac.js';
import { sha256 } from '../hash/sha256.js';
import { sha384 } from '../hash/sha384.js';
import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `pbkdf2` dist binary by
// name (pbkdf2.scalar.wasm — pbkdf2 is scalar-only).
const _rt = wasmRuntime.factory();
const _wasm = wasmPbkdf2.factory(_rt);

// Pure-JS chain for parity tests.
const _ba   = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha512 = sha512.factory(_ba, _utf8);
const _sha384 = sha384.factory(_sha512);
const _hmac256 = hmac.factory(_ba, _utf8, _sha256);
const _hmac384 = hmac.factory(_ba, _utf8, _sha384);
const _hmac512 = hmac.factory(_ba, _utf8, _sha512);
const _pure = pbkdf2.factory(_ba, _utf8, _hmac256);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Hex-encode a Uint8Array (lowercase). */
function hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

/** Decode a lowercase (or uppercase) hex string to Uint8Array. */
function fromHex(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
}

/** UTF-8 encode a string to Uint8Array. */
const enc = new TextEncoder();

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmPbkdf2 — module metadata', () => {
    test('name', () => {
        expect(wasmPbkdf2.name).toBe('wasmPbkdf2');
    });

    test('type', () => {
        expect(wasmPbkdf2.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmPbkdf2.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmPbkdf2.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmPbkdf2.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmPbkdf2 — API shape', () => {
    test('exposes the prescribed surface', () => {
        for (const m of ['isAvailable', 'deriveBits']) {
            expect(typeof _wasm[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_wasm.isAvailable()).toBe(_rt.isAvailable());
        expect(_wasm.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 7914 §11 PBKDF2-HMAC-SHA-256 KAT vectors ────────────────────────────
//
// These are the PBKDF2-HMAC-SHA-256 vectors from RFC 7914 (scrypt) §11.
// They are also used in the package-local shim KAT (shims/pbkdf2.kat.test.ts)
// and cross-validated by the pure-JS pbkdf2.test.js.
//
// The WASM binary hashId for SHA-256 is 256.
//
// NOTE: we skip the c=80000 and c=16777216 vectors for test speed (they are
// covered by the build-time toolchain KAT in the fw-wasm-crypto package).

describe('wasmPbkdf2 — RFC 7914 §11 PBKDF2-HMAC-SHA-256 KAT', () => {

    test('P="password", S="salt", c=1, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 1, 256);
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(dk.length).toBe(32);
        expect(hex(dk)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    });

    test('P="password", S="salt", c=2, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 2, 256);
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(dk.length).toBe(32);
        expect(hex(dk)).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
    });

    test('P="password", S="salt", c=4096, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 4096, 256);
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(dk.length).toBe(32);
        expect(hex(dk)).toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
    });

    test('P="passwordPASSWORDpassword", S="saltSALT...", c=4096, dkLen=40', async () => {
        const dk = await _wasm.deriveBits(
            enc.encode('passwordPASSWORDpassword'),
            enc.encode('saltSALTsaltSALTsaltSALTsaltSALTsalt'),
            40, 4096, 256,
        );
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(dk.length).toBe(40);
        expect(hex(dk)).toBe('348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9');
    });
});

// ── PBKDF2-HMAC-SHA-384 KAT vectors ─────────────────────────────────────────
//
// Verified against Python: hashlib.pbkdf2_hmac('sha384', b'password', b'salt', c, dklen=32).

describe('wasmPbkdf2 — PBKDF2-HMAC-SHA-384 KAT', () => {

    test('P="password", S="salt", c=1, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 1, 384);
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(hex(dk)).toBe('c0e14f06e49e32d73f9f52ddf1d0c5c7191609233631dadd76a567db42b78676');
    });

    test('P="password", S="salt", c=4096, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 4096, 384);
        expect(dk).not.toBe(false);
        expect(hex(dk)).toBe('559726be38db125bc85ed7895f6e3cf574c7a01c080c3447db1e8a76764deb3c');
    });
});

// ── PBKDF2-HMAC-SHA-512 KAT vectors ─────────────────────────────────────────
//
// Verified against Python: hashlib.pbkdf2_hmac('sha512', b'password', b'salt', c, dklen=32).

describe('wasmPbkdf2 — PBKDF2-HMAC-SHA-512 KAT', () => {

    test('P="password", S="salt", c=1, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 1, 512);
        expect(dk).not.toBe(false);
        expect(dk).toBeInstanceOf(Uint8Array);
        expect(hex(dk)).toBe('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252');
    });

    test('P="password", S="salt", c=4096, dkLen=32', async () => {
        const dk = await _wasm.deriveBits(enc.encode('password'), enc.encode('salt'), 32, 4096, 512);
        expect(dk).not.toBe(false);
        expect(hex(dk)).toBe('d197b1b33db0143e018b12f3d1d1479e6cdebdcc97c5c0f87f6902e072f457b5');
    });
});

// ── default iterations ────────────────────────────────────────────────────────

describe('wasmPbkdf2 — default iterations (600000)', () => {
    test('omitting iterations uses 600000', async () => {
        const a = await _wasm.deriveBits(enc.encode('p'), enc.encode('s'), 16);
        const b = await _wasm.deriveBits(enc.encode('p'), enc.encode('s'), 16, 600000);
        expect(a).not.toBe(false);
        expect(b).not.toBe(false);
        expect(hex(a)).toBe(hex(b));
    }, 30000); // default=600000 iters may take ~5s in WASM

    test('omitting hash uses 256 (HMAC-SHA-256)', async () => {
        const a = await _wasm.deriveBits(enc.encode('p'), enc.encode('s'), 16, 1);
        const b = await _wasm.deriveBits(enc.encode('p'), enc.encode('s'), 16, 1, 256);
        expect(a).not.toBe(false);
        expect(b).not.toBe(false);
        expect(hex(a)).toBe(hex(b));
    });
});

// ── parity with pure-JS `pbkdf2` ─────────────────────────────────────────────
//
// The pure-JS module works with bitArray; convert via ba_to_ui8.
// Use modest iteration counts for speed.

describe('wasmPbkdf2 — parity with pure-JS pbkdf2 (HMAC-SHA-256)', () => {

    const PARITY_CASES = [
        { label: 'basic', pw: 'password', salt: 'salt',   iters: 1,    dkLen: 32 },
        { label: 'multi-block dk', pw: 'password', salt: 'salt', iters: 2, dkLen: 40 },
        { label: 'long password+salt', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', iters: 1, dkLen: 32 },
    ];

    for (const { label, pw, salt, iters, dkLen } of PARITY_CASES) {
        test(`${label} (c=${iters}, dkLen=${dkLen}) matches pure-JS`, async () => {
            const wasmDk = await _wasm.deriveBits(enc.encode(pw), enc.encode(salt), dkLen, iters, 256);
            expect(wasmDk).not.toBe(false);
            const pureDk = _ba.ba_to_ui8(_pure(pw, salt, iters, dkLen * 8));
            expect(hex(wasmDk)).toBe(hex(pureDk));
        });
    }

    test('parity with pure-JS HMAC-SHA-384 (c=1, dkLen=32)', async () => {
        const pw = 'password';
        const salt = 'salt';
        const _pure384 = pbkdf2.factory(_ba, _utf8, _hmac384);
        const wasmDk = await _wasm.deriveBits(enc.encode(pw), enc.encode(salt), 32, 1, 384);
        expect(wasmDk).not.toBe(false);
        const pureDk = _ba.ba_to_ui8(_pure384(pw, salt, 1, 256));
        expect(hex(wasmDk)).toBe(hex(pureDk));
    });

    test('parity with pure-JS HMAC-SHA-512 (c=1, dkLen=32)', async () => {
        const pw = 'password';
        const salt = 'salt';
        const _pure512 = pbkdf2.factory(_ba, _utf8, _hmac512);
        const wasmDk = await _wasm.deriveBits(enc.encode(pw), enc.encode(salt), 32, 1, 512);
        expect(wasmDk).not.toBe(false);
        const pureDk = _ba.ba_to_ui8(_pure512(pw, salt, 1, 256));
        expect(hex(wasmDk)).toBe(hex(pureDk));
    });
});

// ── invalid params → false, no throw ─────────────────────────────────────────

describe('wasmPbkdf2 — invalid params → false, no throw', () => {

    const PW   = enc.encode('password');
    const SALT = enc.encode('salt');

    test('password not Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.deriveBits('password', SALT, 16, 1, 256)).toBe(false);
    });

    test('salt not Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.deriveBits(PW, 'salt', 16, 1, 256)).toBe(false);
    });

    test('iterations = 0 → false', async () => {
        expect(await _wasm.deriveBits(PW, SALT, 16, 0, 256)).toBe(false);
    });

    test('iterations = -1 → false', async () => {
        expect(await _wasm.deriveBits(PW, SALT, 16, -1, 256)).toBe(false);
    });

    test('iterations = 0.5 (non-integer) → false', async () => {
        expect(await _wasm.deriveBits(PW, SALT, 16, 0.5, 256)).toBe(false);
    });

    test('dkLen = 0 → false', async () => {
        expect(await _wasm.deriveBits(PW, SALT, 0, 1, 256)).toBe(false);
    });

    test('dkLen = -1 → false', async () => {
        expect(await _wasm.deriveBits(PW, SALT, -1, 1, 256)).toBe(false);
    });

    test('hash = 224 (unsupported) → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.deriveBits(PW, SALT, 16, 1, 224)).toBe(false);
    });

    test('hash = 0 (invalid) → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.deriveBits(PW, SALT, 16, 1, 0)).toBe(false);
    });

    test('hash = "SHA-256" (string, not number) → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.deriveBits(PW, SALT, 16, 1, 'SHA-256')).toBe(false);
    });

    test('null password → false', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wasm.deriveBits(null, SALT, 16, 1, 256)).resolves.toBe(false);
    });

    test('null salt → false', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wasm.deriveBits(PW, null, 16, 1, 256)).resolves.toBe(false);
    });

    test('invalid inputs never throw (all promise resolve)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wasm.deriveBits(null, null, 0, 0, 0)).resolves.toBe(false);
    });
});

// ── binary absent / runtime stub → false ─────────────────────────────────────
//
// Verify that if the runtime cannot load (simulated by a stub that always
// returns false from load()), deriveBits resolves false without throwing.

describe('wasmPbkdf2 — stubbed runtime (load returns false) → false', () => {
    test('deriveBits resolves false when runtime.load() returns false', async () => {
        // Stub runtime: isAvailable returns true but load always returns false.
        const stubRt = {
            isAvailable: () => true,
            load: async () => false,
            withBytes: () => { throw new Error('should not be called'); },
            readBytes: () => { throw new Error('should not be called'); },
            run: () => { throw new Error('should not be called'); },
        };
        const stubWasm = wasmPbkdf2.factory(stubRt);
        const PW   = enc.encode('password');
        const SALT = enc.encode('salt');
        await expect(stubWasm.deriveBits(PW, SALT, 16, 1, 256)).resolves.toBe(false);
    });

    test('deriveBits resolves false when runtime.load() returns false (no throw)', async () => {
        const stubRt = {
            isAvailable: () => false,
            load: async () => false,
            withBytes: () => { throw new Error('should not be called'); },
            readBytes: () => { throw new Error('should not be called'); },
            run: () => { throw new Error('should not be called'); },
        };
        const stubWasm = wasmPbkdf2.factory(stubRt);
        const PW   = enc.encode('p');
        const SALT = enc.encode('s');
        const result = await stubWasm.deriveBits(PW, SALT, 32, 1, 256);
        expect(result).toBe(false);
    });
});
