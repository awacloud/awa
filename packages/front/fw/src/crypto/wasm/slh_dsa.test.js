// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmRuntime } from './runtime.js';
import { wasmSlhDsa } from './slh_dsa.js';
import { SLH_DSA_SHAKE_128F_KAT_SIG } from '../pkc/slh_dsa.kat.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Manually wire the runtime (task 01) and the wrapper, as in batch dispatch. */
const _rt = wasmRuntime.factory();
const _slh = wasmSlhDsa.factory(_rt);

/** hex → Uint8Array. */
function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Uint8Array → hex. */
function bytesToHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
}

// ── FIPS-205 SLH-DSA-SHAKE-128f KAT (seed 0x00..0x2f, msg "Hello SLH-DSA",
//    deterministic / extraEntropy:false). Cross-checked against
//    @noble/post-quantum 0.6.1 — same vector the pure-JS suite uses. ──
//
// The wrapper's `keygen` stages fresh CSPRNG entropy (no seed argument under the
// prescriptive API), so the known secret key is reconstructed from the vector:
//   sk = skSeed(0x00..0x0f) ‖ skPrf(0x10..0x1f) ‖ pkSeed(0x20..0x2f) ‖ pkRoot
// where pkRoot = the last 16 bytes of the known public key. This exact sk is
// what the WASM core's keygen(seed=0x00..0x2f) yields (verified offline).

const KAT_PARAM = 'slh_dsa_shake_128f';
const KAT_N = 16;
const KAT_MSG = new TextEncoder().encode('Hello SLH-DSA');
// Known public key (pkSeed ‖ pkRoot) for the seed-0x00..0x2f vector.
const KAT_PK_HEX = '202122232425262728292a2b2c2d2e2fa90e4715b9a925c332801767fd786371';
const KAT_PK = hexToBytes(KAT_PK_HEX);
const KAT_SK = (() => {
    const sk = new Uint8Array(4 * KAT_N);
    for (let i = 0; i < 3 * KAT_N; i++) {
        sk[i] = i; // skSeed ‖ skPrf ‖ pkSeed = 0x00..0x2f
    }
    sk.set(KAT_PK.subarray(KAT_N, 2 * KAT_N), 3 * KAT_N); // pkRoot = pk[n..2n)
    return sk;
})();

// SLH-DSA signing is SLOW — generous per-test timeouts.
const SIGN_TIMEOUT = 120_000;

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmSlhDsa — module metadata', () => {
    test('name', () => {
        expect(wasmSlhDsa.name).toBe('wasmSlhDsa');
    });

    test('type', () => {
        expect(wasmSlhDsa.type).toBe('fw.crypto.wasm');
    });

    test('dependencies declares only wasmRuntime (ERRATA: no slhDsaWasm)', () => {
        expect(wasmSlhDsa.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmSlhDsa.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmSlhDsa.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmSlhDsa — API shape', () => {
    test('exposes the prescribed surface', () => {
        for (const m of ['isAvailable', 'keygen', 'sign', 'verify']) {
            expect(typeof _slh[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_slh.isAvailable()).toBe(_rt.isAvailable());
    });
});

// ── FIPS-205 KAT (byte-for-byte) ──────────────────────────────────────────────

describe('wasmSlhDsa — FIPS-205 SLH-DSA-SHAKE-128f KAT', () => {
    test('sign reproduces the noble/FIPS-205 signature byte-for-byte', async () => {
        const sig = await _slh.sign(KAT_SK, KAT_MSG, undefined, KAT_PARAM);
        expect(sig).not.toBe(false);
        expect(bytesToHex(sig)).toBe(SLH_DSA_SHAKE_128F_KAT_SIG);
    }, SIGN_TIMEOUT);

    test('verify accepts the KAT signature against the known public key', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        expect(await _slh.verify(KAT_PK, sig, KAT_MSG, undefined, KAT_PARAM)).toBe(true);
    }, SIGN_TIMEOUT);
});

// ── keygen → sign → verify round-trip ─────────────────────────────────────────

describe('wasmSlhDsa — round-trip', () => {
    test('keygen yields correctly-sized key material', async () => {
        const kp = await _slh.keygen(KAT_PARAM);
        expect(kp).not.toBe(false);
        expect(kp.publicKey).toBeInstanceOf(Uint8Array);
        expect(kp.secretKey).toBeInstanceOf(Uint8Array);
        expect(kp.publicKey.length).toBe(32);
        expect(kp.secretKey.length).toBe(64);
    }, SIGN_TIMEOUT);

    test('a fresh keypair signs and verifies', async () => {
        const kp = await _slh.keygen(KAT_PARAM);
        expect(kp).not.toBe(false);
        const msg = new TextEncoder().encode('round-trip payload');
        const sig = await _slh.sign(kp.secretKey, msg, undefined, KAT_PARAM);
        expect(sig).not.toBe(false);
        expect(sig.length).toBe(17088);
        expect(await _slh.verify(kp.publicKey, sig, msg, undefined, KAT_PARAM)).toBe(true);
    }, SIGN_TIMEOUT);

    test('a context string round-trips when matched', async () => {
        const kp = await _slh.keygen(KAT_PARAM);
        const msg = new TextEncoder().encode('ctx payload');
        const ctx = new Uint8Array([1, 2, 3, 4]);
        const sig = await _slh.sign(kp.secretKey, msg, ctx, KAT_PARAM);
        expect(sig).not.toBe(false);
        expect(await _slh.verify(kp.publicKey, sig, msg, ctx, KAT_PARAM)).toBe(true);
    }, SIGN_TIMEOUT);
});

// ── tampering → verify false ──────────────────────────────────────────────────

describe('wasmSlhDsa — verify rejects tampering', () => {
    test('a flipped signature byte → false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        sig[0] ^= 0xff;
        expect(await _slh.verify(KAT_PK, sig, KAT_MSG, undefined, KAT_PARAM)).toBe(false);
    }, SIGN_TIMEOUT);

    test('a tampered message → false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        const msg = new TextEncoder().encode('Hello SLH-DSB');
        expect(await _slh.verify(KAT_PK, sig, msg, undefined, KAT_PARAM)).toBe(false);
    }, SIGN_TIMEOUT);

    test('a mismatched context → false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG); // signed with empty ctx
        const ctx = new Uint8Array([9, 9, 9]);
        expect(await _slh.verify(KAT_PK, sig, KAT_MSG, ctx, KAT_PARAM)).toBe(false);
    }, SIGN_TIMEOUT);
});

// ── parameter / length validation (no-throw → false) ──────────────────────────

describe('wasmSlhDsa — input validation', () => {
    test('unknown paramSet → keygen false', async () => {
        expect(await _slh.keygen('slh_dsa_nope_999')).toBe(false);
    });

    test('unknown paramSet → sign false', async () => {
        expect(await _slh.sign(KAT_SK, KAT_MSG, undefined, 'bogus')).toBe(false);
    });

    test('unknown paramSet → verify false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        expect(await _slh.verify(KAT_PK, sig, KAT_MSG, undefined, 'bogus')).toBe(false);
    });

    test('wrong secret-key length → sign false', async () => {
        expect(await _slh.sign(new Uint8Array(10), KAT_MSG, undefined, KAT_PARAM)).toBe(false);
    });

    test('non-Uint8Array secret key → sign false', async () => {
        expect(await _slh.sign([1, 2, 3], KAT_MSG, undefined, KAT_PARAM)).toBe(false);
    });

    test('wrong public-key length → verify false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        expect(await _slh.verify(new Uint8Array(10), sig, KAT_MSG, undefined, KAT_PARAM)).toBe(false);
    });

    test('wrong signature length → verify false', async () => {
        expect(await _slh.verify(KAT_PK, new Uint8Array(10), KAT_MSG, undefined, KAT_PARAM)).toBe(false);
    });

    test('ctx > 255 bytes → sign false', async () => {
        expect(await _slh.sign(KAT_SK, KAT_MSG, new Uint8Array(256), KAT_PARAM)).toBe(false);
    });

    test('ctx > 255 bytes → verify false', async () => {
        const sig = hexToBytes(SLH_DSA_SHAKE_128F_KAT_SIG);
        expect(await _slh.verify(KAT_PK, sig, KAT_MSG, new Uint8Array(256), KAT_PARAM)).toBe(false);
    });
});
