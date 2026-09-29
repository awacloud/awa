// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmMlKem } from './ml_kem.js';
import { wasmRuntime } from './runtime.js';

// ─── instances ────────────────────────────────────────────────────────────────
// Manual DI (no runtime container in unit tests): instantiate wasmRuntime, then
// inject it into wasmMlKem.factory (BATCH_11: dependencies ['wasmRuntime']).

const _rt = wasmRuntime.factory();
const M = wasmMlKem.factory(_rt);

// ─── FIPS 203 ML-KEM-768 KAT (deterministic) ────────────────────────────────────
// Same vector the pure-JS pkc/ml_kem.test.js uses (noble-post-quantum / Wycheproof
// draft). keygen(d||z) and encaps(ek, m) are deterministic, so the WASM output is
// byte-for-byte identical to the published KAT AND to the pure-JS module (parity).

const SEED_HEX =
    '7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d' +
    '8626ed79d451140800e03b59b956f8210e556067407d13dc90fa9e8b872bfb8f';
const M_HEX = '147c03f7a5bebba406c8fae1874d7f13c80efe79a3a9a874cc09fe76f6997615';
const K_HEX = 'e7184a0975ee3470878d2d159ec83129c8aec253d4ee17b4810311d198cd0368';
// First 64 bytes of the ML-KEM-768 encapsulation key for SEED_HEX.
const EK64_HEX =
    'a8e651a1e685f22478a8954f007bc7711b930772c78f092e82878e3e937f3679' +
    '67532913a8d53dfdf4bfb1f8846746596705cf345142b972a3f16325c40c2952';

// Frozen per-param-set sizes (mirror the wrapper / shim).
const SIZES = {
    512: { ps: 0, ek: 800, dk: 1632, ct: 768 },
    768: { ps: 1, ek: 1184, dk: 2400, ct: 1088 },
    1024: { ps: 2, ek: 1568, dk: 3168, ct: 1568 },
};
const SS = 32;

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}
function bytesToHex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}
function bytesEqual(a, b) {
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) { return false; }
    }
    return true;
}

/**
 * Stage deterministic entropy into the seam (KAT only). Mirrors the wrapper's
 * private staging, but with caller-supplied bytes so the derandomized keygen /
 * encaps reproduce a known vector. Drives the runtime directly (the public API
 * draws fresh CSPRNG entropy and is non-deterministic by design).
 */
function stage(h, bytes) {
    _rt.run(h, 'rng_reset', []);
    const buf = _rt.withBytes(h, bytes);
    try {
        const rc = _rt.run(h, 'rng_stage', [buf.ptr, bytes.length]);
        if (rc !== 0) { throw new Error('rng_stage rc ' + rc); }
    } finally {
        buf.free();
    }
}

const EXPORTS = ['mlkem_keygen', 'mlkem_encaps', 'mlkem_decaps', 'rng_stage', 'rng_reset'];

// ─── module metadata ────────────────────────────────────────────────────────────

describe('wasmMlKem — module metadata', () => {
    test('name', () => {
        expect(wasmMlKem.name).toBe('wasmMlKem');
    });
    test('type', () => {
        expect(wasmMlKem.type).toBe('fw.crypto.wasm');
    });
    test('dependencies is ["wasmRuntime"] (ERRATA: no mlKemWasm)', () => {
        expect(wasmMlKem.dependencies).toEqual(['wasmRuntime']);
    });
    test('factory is a function', () => {
        expect(typeof wasmMlKem.factory).toBe('function');
    });
});

// ─── API shape ──────────────────────────────────────────────────────────────────

describe('wasmMlKem — API shape', () => {
    test('exposes the prescribed surface', () => {
        for (const m of ['isAvailable', 'keygen', 'encaps', 'decaps']) {
            expect(typeof M[m]).toBe('function');
        }
    });
    test('isAvailable mirrors the runtime', () => {
        expect(M.isAvailable()).toBe(_rt.isAvailable());
        expect(M.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ─── FIPS 203 KAT + pure-JS parity (deterministic, byte-for-byte) ────────────────

describe('wasmMlKem — FIPS 203 ML-KEM-768 KAT (deterministic vector)', () => {
    test('keygen(d||z) reproduces the published encapsulation key + encaps(ek,m) → K', async () => {
        const P = SIZES[768];
        const h = await _rt.load('ml_kem', EXPORTS);
        expect(h).not.toBe(false);

        // keyGen: stage d||z, run mlkem_keygen, assert ek matches the KAT.
        stage(h, hexToBytes(SEED_HEX));
        const ekBuf = _rt.withBytes(h, new Uint8Array(P.ek));
        const dkBuf = _rt.withBytes(h, new Uint8Array(P.dk));
        let ek;
        let dk;
        try {
            expect(_rt.run(h, 'mlkem_keygen', [P.ps, ekBuf.ptr, dkBuf.ptr])).toBe(0);
            ek = _rt.readBytes(h, ekBuf.ptr, P.ek);
            dk = _rt.readBytes(h, dkBuf.ptr, P.dk);
        } finally {
            dkBuf.free();
            ekBuf.free();
        }
        expect(bytesToHex(ek.subarray(0, 64))).toBe(EK64_HEX);

        // encaps: stage m, run mlkem_encaps against the produced ek, assert K.
        stage(h, hexToBytes(M_HEX));
        const ekIn = _rt.withBytes(h, ek);
        const ctBuf = _rt.withBytes(h, new Uint8Array(P.ct));
        const ssBuf = _rt.withBytes(h, new Uint8Array(SS));
        let ct;
        let ss;
        try {
            expect(_rt.run(h, 'mlkem_encaps', [P.ps, ekIn.ptr, ctBuf.ptr, ssBuf.ptr])).toBe(0);
            ct = _rt.readBytes(h, ctBuf.ptr, P.ct);
            ss = _rt.readBytes(h, ssBuf.ptr, SS);
        } finally {
            ssBuf.free();
            ctBuf.free();
            ekIn.free();
        }
        expect(ct.length).toBe(P.ct);
        expect(bytesToHex(ss)).toBe(K_HEX);

        // decaps with the matching dk recovers the same shared secret.
        const dkIn = _rt.withBytes(h, dk);
        const cIn = _rt.withBytes(h, ct);
        const ss2Buf = _rt.withBytes(h, new Uint8Array(SS));
        let ss2;
        try {
            expect(_rt.run(h, 'mlkem_decaps', [P.ps, dkIn.ptr, cIn.ptr, ss2Buf.ptr])).toBe(0);
            ss2 = _rt.readBytes(h, ss2Buf.ptr, SS);
        } finally {
            ss2Buf.free();
            cIn.free();
            dkIn.free();
        }
        expect(bytesToHex(ss2)).toBe(K_HEX);
    });
});

// ─── public-API round-trip across all three param sets ──────────────────────────

describe('wasmMlKem — encaps/decaps shared-secret agreement', () => {
    for (const paramSet of [512, 768, 1024]) {
        test(`ML-KEM-${paramSet} keygen → encaps → decaps agree`, async () => {
            const kp = await M.keygen(paramSet);
            expect(kp).not.toBe(false);
            expect(kp.publicKey.length).toBe(SIZES[paramSet].ek);
            expect(kp.secretKey.length).toBe(SIZES[paramSet].dk);

            const enc = await M.encaps(kp.publicKey, paramSet);
            expect(enc).not.toBe(false);
            expect(enc.ciphertext.length).toBe(SIZES[paramSet].ct);
            expect(enc.sharedSecret.length).toBe(SS);

            const dec = await M.decaps(kp.secretKey, enc.ciphertext, paramSet);
            expect(dec).not.toBe(false);
            expect(dec.length).toBe(SS);
            expect(bytesEqual(dec, enc.sharedSecret)).toBe(true);
        });
    }

    test('default param set is ML-KEM-768', async () => {
        const kp = await M.keygen();
        expect(kp).not.toBe(false);
        expect(kp.publicKey.length).toBe(SIZES[768].ek);
        expect(kp.secretKey.length).toBe(SIZES[768].dk);
        const enc = await M.encaps(kp.publicKey);
        expect(enc).not.toBe(false);
        const dec = await M.decaps(kp.secretKey, enc.ciphertext);
        expect(bytesEqual(dec, enc.sharedSecret)).toBe(true);
    });
});

// ─── implicit reject (FIPS 203 §6.3) ────────────────────────────────────────────

describe('wasmMlKem — tampered ciphertext implicit reject', () => {
    test('decaps of a tampered ciphertext returns a 32-byte secret that differs', async () => {
        const kp = await M.keygen(768);
        const enc = await M.encaps(kp.publicKey, 768);
        const tampered = new Uint8Array(enc.ciphertext);
        tampered[0] ^= 0xff;

        const rej = await M.decaps(kp.secretKey, tampered, 768);
        // Implicit reject: NOT false, a pseudo-random 32-byte secret.
        expect(rej).not.toBe(false);
        expect(rej.length).toBe(SS);
        expect(bytesEqual(rej, enc.sharedSecret)).toBe(false);
    });
});

// ─── negative cases: bad param set + invalid lengths → false ────────────────────

describe('wasmMlKem — validation → false (no throw)', () => {
    test('keygen with an unknown param set → false', async () => {
        expect(await M.keygen(999)).toBe(false);
    });

    test('encaps with an unknown param set → false', async () => {
        expect(await M.encaps(new Uint8Array(1184), 256)).toBe(false);
    });

    test('encaps with a wrong publicKey length → false', async () => {
        expect(await M.encaps(new Uint8Array(10), 768)).toBe(false);
    });

    test('encaps with a non-Uint8Array publicKey → false', async () => {
        // @ts-expect-error — deliberate wrong type to assert no-throw.
        expect(await M.encaps([1, 2, 3], 768)).toBe(false);
    });

    test('decaps with a wrong secretKey length → false', async () => {
        expect(await M.decaps(new Uint8Array(10), new Uint8Array(1088), 768)).toBe(false);
    });

    test('decaps with a wrong ciphertext length → false', async () => {
        expect(await M.decaps(new Uint8Array(2400), new Uint8Array(10), 768)).toBe(false);
    });

    test('decaps with an unknown param set → false', async () => {
        expect(await M.decaps(new Uint8Array(2400), new Uint8Array(1088), 7)).toBe(false);
    });
});

// ─── binary-absent path: load false → operation false (no throw) ────────────────

describe('wasmMlKem — binary unavailable → false', () => {
    test('keygen returns false when the runtime cannot load the module', async () => {
        // A wasmMlKem wired to a runtime whose load always fails (synthetic).
        const failingRt = {
            isAvailable: () => true,
            load: async () => false,
            withBytes: _rt.withBytes,
            readBytes: _rt.readBytes,
            run: _rt.run,
        };
        const Mf = wasmMlKem.factory(failingRt);
        expect(await Mf.keygen(768)).toBe(false);
        expect(await Mf.encaps(new Uint8Array(1184), 768)).toBe(false);
        expect(await Mf.decaps(new Uint8Array(2400), new Uint8Array(1088), 768)).toBe(false);
    });
});
