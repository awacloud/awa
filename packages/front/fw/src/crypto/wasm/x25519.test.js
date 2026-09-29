// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmX25519 } from './x25519.js';
import { wasmRuntime } from './runtime.js';

// Pure-JS x25519 for cross-tier parity.
import { x25519 } from '../pkc/x25519.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `x25519` dist binary by
// name (x25519.scalar.wasm — x25519 is scalar-only, simd:false, ref10 impl).
const _rt = wasmRuntime.factory();
const _x25519 = wasmX25519.factory(_rt);

// Pure-JS x25519 for cross-tier parity.
const _pureX25519 = x25519.factory();

// ── helpers ───────────────────────────────────────────────────────────────────

function hex2bytes(h) {
    const o = new Uint8Array(h.length / 2);
    for (let i = 0; i < o.length; i++) {
        o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return o;
}

function bytes2hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

// ── RFC 7748 §5.2 X25519 test vectors ────────────────────────────────────────
//
// Transcribed verbatim from packages/front/fw-wasm-crypto/shims/x25519.kat.test.ts
// (RFC7748_X25519_SINGLE + RFC7748_X25519_ITER), themselves quoted from
// references/SPEC/RFC/rfc7748.txt §5.2.

const RFC7748_X25519_SINGLE = [
    {
        name: 'vector 1',
        scalar: 'a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4',
        u: 'e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c',
        out: 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552',
    },
    {
        name: 'vector 2',
        scalar: '4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d',
        u: 'e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493',
        out: '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957',
    },
];

// RFC 7748 §5.2 iterated test: k = u = 9 (basepoint), repeat k,u = X25519(k,u),
// u = old k. Assert after 1 and after 1000 iterations.
const RFC7748_X25519_ITER = {
    start: '0900000000000000000000000000000000000000000000000000000000000000',
    after1: '422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079',
    after1000: '684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51',
};

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmX25519 — module metadata', () => {
    test('name', () => {
        expect(wasmX25519.name).toBe('wasmX25519');
    });

    test('type', () => {
        expect(wasmX25519.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency (ERRATA-2: no x25519Wasm dep)', () => {
        expect(wasmX25519.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module only', () => {
        expect(wasmX25519.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmX25519.factory).toBe('function');
    });
});

// ── API shape ─────────────────────────────────────────────────────────────────

describe('wasmX25519 — API shape', () => {
    test('exposes the prescribed surface, all functions', () => {
        for (const m of ['isAvailable', 'keygen', 'deriveBits']) {
            expect(typeof _x25519[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_x25519.isAvailable()).toBe(_rt.isAvailable());
        expect(_x25519.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 7748 §5.2 KAT: single vectors (deriveBits) ───────────────────────────

describe('wasmX25519 — RFC 7748 §5.2 single vectors', () => {
    for (const v of RFC7748_X25519_SINGLE) {
        test(`${v.name}: deriveBits(scalar, u) == RFC output`, async () => {
            const scalar = hex2bytes(v.scalar);
            const u = hex2bytes(v.u);
            const expected = hex2bytes(v.out);
            const result = await _x25519.deriveBits(scalar, u);
            expect(result).not.toBe(false);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(32);
            expect(bytes2hex(result)).toBe(bytes2hex(expected));
        });
    }
});

// ── RFC 7748 §5.2 iterated test ───────────────────────────────────────────────
//
// k = u = basepoint 9 (little-endian), iterate k,u = X25519(k,u), u = old k.
// Fixed-buffer pattern from the kat test (allocation-free loop).

describe('wasmX25519 — RFC 7748 §5.2 iterated test', () => {
    test('after 1 and after 1000 iterations from basepoint 9', async () => {
        let k = hex2bytes(RFC7748_X25519_ITER.start);
        let u = hex2bytes(RFC7748_X25519_ITER.start);
        let resultAfter1;

        for (let i = 1; i <= 1000; i++) {
            // deriveBits uses separate bufs each call; the allocation-free
            // pattern cannot directly apply here (no direct WASM buffer reuse),
            // but the correctness (not allocation) is what we test at the JS layer.
            const out = await _x25519.deriveBits(k, u);
            expect(out, `iteration ${i} must not be false`).not.toBe(false);
            const oldK = k;
            k = /** @type {Uint8Array} */ (out);
            u = oldK;
            if (i === 1) {
                resultAfter1 = bytes2hex(k);
                expect(resultAfter1, 'after 1 iteration').toBe(RFC7748_X25519_ITER.after1);
            }
        }
        expect(bytes2hex(k), 'after 1000 iterations').toBe(RFC7748_X25519_ITER.after1000);
    }, 30_000);
});

// ── Alice/Bob agreement ───────────────────────────────────────────────────────

describe('wasmX25519 — Alice/Bob shared-secret agreement', () => {
    test('deriveBits(a.sk, b.pk) === deriveBits(b.sk, a.pk)', async () => {
        const A = await _x25519.keygen();
        const B = await _x25519.keygen();
        expect(A).not.toBe(false);
        expect(B).not.toBe(false);

        const sharedAB = await _x25519.deriveBits(
            /** @type {WasmX25519KeyPair} */ (A).secretKey,
            /** @type {WasmX25519KeyPair} */ (B).publicKey,
        );
        const sharedBA = await _x25519.deriveBits(
            /** @type {WasmX25519KeyPair} */ (B).secretKey,
            /** @type {WasmX25519KeyPair} */ (A).publicKey,
        );

        expect(sharedAB).not.toBe(false);
        expect(sharedBA).not.toBe(false);
        expect(sharedAB).toBeInstanceOf(Uint8Array);
        expect(sharedAB.length).toBe(32);
        expect(bytes2hex(/** @type {Uint8Array} */ (sharedAB))).toBe(
            bytes2hex(/** @type {Uint8Array} */ (sharedBA)),
        );
    });
});

// ── cross-tier parity with pure-JS `pkc/x25519` ───────────────────────────────
//
// Note from memory (2026-06-15): WebCrypto X25519 CLAMPS the scalar on import,
// so deriveBits won't match RFC 7748 §6.1 raw-scalar vectors — verify with the
// commutativity / agreement round-trip, NOT raw-scalar byte equality for the
// single vectors. The same applies here: the pure-JS and WASM impls both apply
// the RFC 7748 clamping, but the raw-scalar RFC §5.2 single vectors are
// constructed with specific (already-clamped) scalars; we use the agreement
// pattern to validate cross-tier parity.

describe('wasmX25519 — parity with pure-JS pkc/x25519 (agreement round-trip)', () => {
    test('shared secrets match: WASM deriveBits === pure-JS scalarMult', async () => {
        // Generate a pair via WASM keygen, then derive the shared secret both ways.
        const A = await _x25519.keygen();
        const B = await _x25519.keygen();
        expect(A).not.toBe(false);
        expect(B).not.toBe(false);

        const aPair = /** @type {{publicKey: Uint8Array, secretKey: Uint8Array}} */ (A);
        const bPair = /** @type {{publicKey: Uint8Array, secretKey: Uint8Array}} */ (B);

        // WASM: Alice's side.
        const wasmShared = await _x25519.deriveBits(aPair.secretKey, bPair.publicKey);
        expect(wasmShared).not.toBe(false);

        // Pure-JS: same scalar/u, same clamping (RFC 7748 §5).
        const pureShared = _pureX25519.scalarMult(aPair.secretKey, bPair.publicKey);
        expect(pureShared).not.toBe(false);

        expect(bytes2hex(/** @type {Uint8Array} */ (wasmShared))).toBe(
            bytes2hex(/** @type {Uint8Array} */ (pureShared)),
        );
    });

    test('WASM keygen publicKey matches pure-JS scalarMultBase', async () => {
        const pair = await _x25519.keygen();
        expect(pair).not.toBe(false);
        const { publicKey, secretKey } = /** @type {{publicKey: Uint8Array, secretKey: Uint8Array}} */ (pair);

        // The public key is x25519_base(sk) = sk·G = scalarMultBase(sk) in pure-JS.
        const purePk = _pureX25519.scalarMultBase(secretKey);
        expect(purePk).not.toBe(false);

        expect(bytes2hex(publicKey)).toBe(bytes2hex(/** @type {Uint8Array} */ (purePk)));
    });
});

// ── all-zero shared secret rejection ─────────────────────────────────────────
//
// Feed a low-order public key (u = 0x00...00, order-4 point) to deriveBits.
// The WASM binary returns non-zero when the shared secret is all-zero
// (the libsodium ref10 implementation checks this); the wrapper maps it to false.

describe('wasmX25519 — all-zero shared secret → false', () => {
    test('low-order u (0x00...00) → false', async () => {
        const sk = crypto.getRandomValues(new Uint8Array(32));
        // u = 0x00...00 is a documented low-order point (order-4).
        const lowOrderU = new Uint8Array(32);
        const result = await _x25519.deriveBits(sk, lowOrderU);
        // The libsodium ref10 impl returns non-zero for all-zero output.
        // If it somehow returns a non-zero shared secret, the test accepts it
        // (the binary's behaviour is authoritative). But if it returns all-zero,
        // the wrapper must return false.
        // In practice the ref10 impl always catches this; assert false.
        expect(result).toBe(false);
    });
});

// ── invalid lengths → false, no throw ────────────────────────────────────────

describe('wasmX25519 — invalid inputs → false, no throw', () => {
    test('keygen: secretKey wrong length → false', async () => {
        expect(await _x25519.keygen(new Uint8Array(16))).toBe(false);
    });

    test('keygen: secretKey not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _x25519.keygen('not-a-buffer')).toBe(false);
    });

    test('deriveBits: secretKey wrong length → false', async () => {
        expect(await _x25519.deriveBits(new Uint8Array(16), new Uint8Array(32))).toBe(false);
    });

    test('deriveBits: publicKey wrong length → false', async () => {
        expect(await _x25519.deriveBits(new Uint8Array(32), new Uint8Array(16))).toBe(false);
    });

    test('deriveBits: secretKey not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _x25519.deriveBits('bad', new Uint8Array(32))).toBe(false);
    });

    test('deriveBits: publicKey not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _x25519.deriveBits(new Uint8Array(32), null)).toBe(false);
    });

    test('keygen never throws on garbage input', async () => {
        // @ts-expect-error intentional misuse
        await expect(_x25519.keygen(null)).resolves.toBe(false);
    });

    test('deriveBits never throws on garbage input', async () => {
        // @ts-expect-error intentional misuse
        await expect(_x25519.deriveBits(null, null)).resolves.toBe(false);
    });
});
