// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * ml_dsa.test.js — `wasmMlDsa` (WASM-SIMD ML-DSA, FIPS 204).
 *
 * Covers (plan "Tests to cover"):
 *   - module metadata + factory API shape;
 *   - FIPS 204 ML-DSA-65 KAT (byte-for-byte) driven deterministically through
 *     the staged-entropy seam (seed=0x2a*32, msg="Hello world", ctx="", rnd=0);
 *     the expected signature is the shared Wycheproof/FIPS-204 KAT vector also
 *     used by the pure-JS `crypto/pkc/ml_dsa` suite;
 *   - public-API sign/verify round-trip across ML-DSA-44/65/87;
 *   - tampered signature / tampered message / wrong ctx → verify `false`;
 *   - invalid lengths / param set / ctx>255 → `false`;
 *   - no-throw contract.
 *
 * The KAT is driven at the runtime+binary level (the public API is hedged /
 * random by design — it exposes no seed/rnd, matching the pure-JS public
 * surface), while the public wrapper API is exercised via the round-trip and
 * negative cases.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { wasmMlDsa } from './ml_dsa.js';
import { wasmRuntime } from './runtime.js';
import { ML_DSA_65_KAT_SIG_HELLO_WORLD } from '../pkc/ml_dsa.kat.js';

// ── shared instances ──────────────────────────────────────────────────────────

const _rt = wasmRuntime.factory();
const M = wasmMlDsa.factory(_rt);

// ── ABI constants (mirror shims/mldsa.kat.test.ts) ────────────────────────────

const PARAMS = {
    44: { ps: 0, pk: 1312, sk: 2560, sig: 2420 },
    65: { ps: 1, pk: 1952, sk: 4032, sig: 3309 },
    87: { ps: 2, pk: 2592, sk: 4896, sig: 4627 },
};
const ML_DSA_EXPORTS = ['mldsa_keygen', 'mldsa_sign', 'mldsa_verify', 'rng_stage', 'rng_reset'];

// ── helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(u) {
    let s = '';
    for (let i = 0; i < u.length; i++) {
        s += u[i].toString(16).padStart(2, '0');
    }
    return s;
}

/** Stage entropy into the binary seam (rng_reset → rng_stage). */
function stageEntropy(loaded, bytes) {
    _rt.run(loaded, 'rng_reset', []);
    const buf = _rt.withBytes(loaded, bytes);
    try {
        const rc = _rt.run(loaded, 'rng_stage', [buf.ptr, bytes.length]);
        expect(rc).toBe(0);
    } finally {
        buf.free();
    }
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmMlDsa — module metadata', () => {
    test('name', () => {
        expect(wasmMlDsa.name).toBe('wasmMlDsa');
    });
    test('type', () => {
        expect(wasmMlDsa.type).toBe('fw.crypto.wasm');
    });
    test('dependencies = ["wasmRuntime"] (ERRATA: no mlDsaWasm)', () => {
        expect(wasmMlDsa.dependencies).toEqual(['wasmRuntime']);
    });
    test('factory is a function', () => {
        expect(typeof wasmMlDsa.factory).toBe('function');
    });
});

// ── factory API shape ─────────────────────────────────────────────────────────

describe('wasmMlDsa — factory API', () => {
    test('exposes isAvailable / keygen / sign / verify', () => {
        expect(typeof M.isAvailable).toBe('function');
        expect(typeof M.keygen).toBe('function');
        expect(typeof M.sign).toBe('function');
        expect(typeof M.verify).toBe('function');
    });
    test('isAvailable mirrors wasmRuntime.isAvailable()', () => {
        expect(M.isAvailable()).toBe(_rt.isAvailable());
    });
});

// ── FIPS 204 ML-DSA-65 KAT (byte-for-byte) ────────────────────────────────────

describe('wasmMlDsa — FIPS 204 ML-DSA-65 KAT', () => {
    test('deterministic keygen+sign reproduces the FIPS-204 KAT signature byte-for-byte', async () => {
        const P = PARAMS[65];
        const loaded = await _rt.load('ml_dsa', ML_DSA_EXPORTS, { variant: 'scalar' });
        expect(loaded).not.toBe(false);

        const seed = new Uint8Array(32).fill(0x2a);
        const msg = new TextEncoder().encode('Hello world');

        // keyGen: stage seed → mldsa_keygen(ps, pk, sk)
        stageEntropy(loaded, seed);
        const pkBuf = _rt.withBytes(loaded, new Uint8Array(P.pk));
        const skBuf = _rt.withBytes(loaded, new Uint8Array(P.sk));
        let pk;
        let sk;
        try {
            const rc = _rt.run(loaded, 'mldsa_keygen', [P.ps, pkBuf.ptr, skBuf.ptr]);
            expect(rc).toBe(0);
            pk = _rt.readBytes(loaded, pkBuf.ptr, P.pk);
            sk = _rt.readBytes(loaded, skBuf.ptr, P.sk);
        } finally {
            skBuf.free();
            pkBuf.free();
        }

        // sigGen deterministic: stage rnd=0^32 → mldsa_sign(ctx="")
        stageEntropy(loaded, new Uint8Array(32));
        const skIn = _rt.withBytes(loaded, sk);
        const msgIn = _rt.withBytes(loaded, msg);
        const ctxIn = _rt.withBytes(loaded, new Uint8Array(1));
        const sigOut = _rt.withBytes(loaded, new Uint8Array(P.sig));
        const sigLenOut = _rt.withBytes(loaded, new Uint8Array(4));
        try {
            const rc = _rt.run(loaded, 'mldsa_sign', [
                P.ps, skIn.ptr, msgIn.ptr, msg.length, ctxIn.ptr, 0, sigOut.ptr, sigLenOut.ptr,
            ]);
            expect(rc).toBe(0);
            const sigLen = new DataView(_rt.readBytes(loaded, sigLenOut.ptr, 4).buffer).getInt32(0, true);
            expect(sigLen).toBe(P.sig);
            const sig = _rt.readBytes(loaded, sigOut.ptr, P.sig);
            expect(bytesToHex(sig)).toBe(ML_DSA_65_KAT_SIG_HELLO_WORLD);

            // verdict-for-verdict: the KAT signature verifies under the KAT key
            const pkIn = _rt.withBytes(loaded, pk);
            const sigIn = _rt.withBytes(loaded, hexToBytes(ML_DSA_65_KAT_SIG_HELLO_WORLD));
            const msgV = _rt.withBytes(loaded, msg);
            const ctxV = _rt.withBytes(loaded, new Uint8Array(1));
            try {
                const rcv = _rt.run(loaded, 'mldsa_verify', [
                    P.ps, pkIn.ptr, sigIn.ptr, P.sig, msgV.ptr, msg.length, ctxV.ptr, 0,
                ]);
                expect(rcv).toBe(0);
            } finally {
                ctxV.free();
                msgV.free();
                sigIn.free();
                pkIn.free();
            }
        } finally {
            sigLenOut.free();
            sigOut.free();
            ctxIn.free();
            msgIn.free();
            skIn.free();
        }
    }, 60_000);
});

// ── public-API sign/verify round-trip across 44/65/87 ─────────────────────────

describe('wasmMlDsa — sign/verify round-trip', () => {
    for (const ps of [44, 65, 87]) {
        test(`ML-DSA-${ps}: keygen → sign → verify`, async () => {
            const kp = await M.keygen(ps);
            expect(kp).not.toBe(false);
            expect(kp.publicKey.length).toBe(PARAMS[ps].pk);
            expect(kp.secretKey.length).toBe(PARAMS[ps].sk);

            const msg = new TextEncoder().encode(`message for ML-DSA-${ps}`);
            const sig = await M.sign(kp.secretKey, msg, undefined, ps);
            expect(sig).not.toBe(false);
            expect(sig.length).toBe(PARAMS[ps].sig);

            expect(await M.verify(kp.publicKey, sig, msg, undefined, ps)).toBe(true);
        }, 60_000);
    }

    test('default param set is 65', async () => {
        const kp = await M.keygen();
        expect(kp).not.toBe(false);
        expect(kp.publicKey.length).toBe(PARAMS[65].pk);
        const msg = new TextEncoder().encode('default');
        const sig = await M.sign(kp.secretKey, msg);
        expect(sig).not.toBe(false);
        expect(sig.length).toBe(PARAMS[65].sig);
        expect(await M.verify(kp.publicKey, sig, msg)).toBe(true);
    }, 60_000);

    test('round-trip with a non-empty context binds the ctx', async () => {
        const kp = await M.keygen(65);
        const msg = new TextEncoder().encode('ctx round-trip');
        const ctx = new TextEncoder().encode('app-domain');
        const sig = await M.sign(kp.secretKey, msg, ctx, 65);
        expect(sig).not.toBe(false);
        expect(await M.verify(kp.publicKey, sig, msg, ctx, 65)).toBe(true);
    }, 60_000);
});

// ── negative cases: verify false on tampered / wrong inputs ────────────────────

describe('wasmMlDsa — verify rejects tampered / wrong material', () => {
    let kp;
    let msg;
    let sig;
    beforeAll(async () => {
        kp = await M.keygen(65);
        msg = new TextEncoder().encode('integrity');
        sig = await M.sign(kp.secretKey, msg, undefined, 65);
    });

    test('tampered signature → false', async () => {
        const bad = Uint8Array.from(sig);
        bad[0] ^= 0xff;
        expect(await M.verify(kp.publicKey, bad, msg, undefined, 65)).toBe(false);
    }, 60_000);

    test('tampered message → false', async () => {
        const bad = Uint8Array.from(msg);
        bad[0] ^= 0xff;
        expect(await M.verify(kp.publicKey, sig, bad, undefined, 65)).toBe(false);
    }, 60_000);

    test('wrong (non-empty) ctx → false', async () => {
        const ctx = new TextEncoder().encode('other-domain');
        expect(await M.verify(kp.publicKey, sig, msg, ctx, 65)).toBe(false);
    }, 60_000);

    test('signature from another key → false', async () => {
        const other = await M.keygen(65);
        expect(await M.verify(other.publicKey, sig, msg, undefined, 65)).toBe(false);
    }, 60_000);
});

// ── negative cases: invalid lengths / param set / ctx>255 → false ─────────────

describe('wasmMlDsa — input validation (no-throw, returns false)', () => {
    test('keygen: invalid param set → false', async () => {
        expect(await M.keygen(99)).toBe(false);
    });

    test('sign: wrong secretKey length → false', async () => {
        const r = await M.sign(new Uint8Array(10), new Uint8Array([1, 2, 3]), undefined, 65);
        expect(r).toBe(false);
    });

    test('sign: invalid param set → false', async () => {
        const r = await M.sign(new Uint8Array(PARAMS[65].sk), new Uint8Array([1]), undefined, 7);
        expect(r).toBe(false);
    });

    test('sign: message not a Uint8Array → false', async () => {
        const r = await M.sign(new Uint8Array(PARAMS[65].sk), /** @type {any} */ ('nope'), undefined, 65);
        expect(r).toBe(false);
    });

    test('sign: ctx > 255 bytes → false', async () => {
        const r = await M.sign(new Uint8Array(PARAMS[65].sk), new Uint8Array([1]), new Uint8Array(256), 65);
        expect(r).toBe(false);
    });

    test('verify: wrong publicKey length → false', async () => {
        expect(await M.verify(new Uint8Array(10), new Uint8Array(PARAMS[65].sig), new Uint8Array([1]), undefined, 65)).toBe(false);
    });

    test('verify: wrong signature length → false', async () => {
        expect(await M.verify(new Uint8Array(PARAMS[65].pk), new Uint8Array(10), new Uint8Array([1]), undefined, 65)).toBe(false);
    });

    test('verify: invalid param set → false', async () => {
        expect(await M.verify(new Uint8Array(PARAMS[65].pk), new Uint8Array(PARAMS[65].sig), new Uint8Array([1]), undefined, 0.5)).toBe(false);
    });

    test('verify: ctx > 255 bytes → false', async () => {
        expect(await M.verify(new Uint8Array(PARAMS[65].pk), new Uint8Array(PARAMS[65].sig), new Uint8Array([1]), new Uint8Array(256), 65)).toBe(false);
    });
});

// ── no-throw contract ─────────────────────────────────────────────────────────

describe('wasmMlDsa — no-throw contract', () => {
    test('keygen never rejects', async () => {
        await expect(M.keygen(65)).resolves.toBeDefined();
        await expect(M.keygen(99)).resolves.toBe(false);
    }, 60_000);

    test('sign never rejects', async () => {
        await expect(M.sign(new Uint8Array(1), new Uint8Array(1), undefined, 65)).resolves.toBe(false);
    });

    test('verify never rejects', async () => {
        await expect(
            M.verify(new Uint8Array(1), new Uint8Array(1), new Uint8Array(1), undefined, 65),
        ).resolves.toBe(false);
    });
});
