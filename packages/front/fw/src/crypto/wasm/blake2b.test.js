// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmBlake2b } from './blake2b.js';
import { wasmRuntime } from './runtime.js';
import { blake2b as pureBlake2b } from '../hash/blake2b.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// Instantiate the runtime manually and pass it into wasmBlake2b.factory(rt).
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `blake2b` dist binary by
// name (auto-selects simd or scalar at run time).
const _rt = wasmRuntime.factory();
const _b2b = wasmBlake2b.factory(_rt);

// Pure-JS BLAKE2b for parity checks.
const _pure = pureBlake2b.factory();

// ── helpers ───────────────────────────────────────────────────────────────────

function hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

function fromHex(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
}

// ── RFC 7693 KAT anchors (transcribed from the spec; .txt never read here) ───
//
// Appendix A: BLAKE2b-512("abc"), unkeyed, 64-byte digest.
const RFC7693_ABC =
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1' +
    '7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923';

// Appendix E: grand hash-of-hashes over the unkeyed+keyed self-test matrix.
// Computed with BLAKE2b-256 over all digests from outLen={20,32,48,64} ×
// inLen={0,3,128,129,255,1024} (unkeyed + keyed).
const RFC7693_SELFTEST_HEX = 'c23a7800d98123bd10f506c61e29da5603d763b8bbad2e737f5e765a7bccd475';

const SELFTEST_MD_LENS = [20, 32, 48, 64];
const SELFTEST_IN_LENS = [0, 3, 128, 129, 255, 1024];

/**
 * RFC 7693 Appendix E `selftest_seq`: generates a deterministic Fibonacci
 * byte sequence of `len` bytes seeded by `seed`.
 */
function selftestSeq(len, seed) {
    const out = new Uint8Array(len);
    let a = (0xdead4bad * seed) >>> 0;
    let b = 1;
    for (let i = 0; i < len; i++) {
        const t = (a + b) >>> 0;
        a = b;
        b = t;
        out[i] = (t >>> 24) & 0xff;
    }
    return out;
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmBlake2b — module metadata', () => {
    test('name', () => {
        expect(wasmBlake2b.name).toBe('wasmBlake2b');
    });

    test('type', () => {
        expect(wasmBlake2b.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmBlake2b.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmBlake2b.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmBlake2b.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmBlake2b — API shape', () => {
    test('exposes isAvailable and hash as functions', () => {
        expect(typeof _b2b.isAvailable).toBe('function');
        expect(typeof _b2b.hash).toBe('function');
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_b2b.isAvailable()).toBe(_rt.isAvailable());
        expect(_b2b.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 7693 Appendix A: BLAKE2b-512("abc") ──────────────────────────────────

describe('wasmBlake2b — RFC 7693 Appendix A KAT', () => {
    const abc = new TextEncoder().encode('abc');

    test('BLAKE2b-512("abc") unkeyed matches spec', async () => {
        const digest = await _b2b.hash(abc);
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(64);
        expect(hex(digest)).toBe(RFC7693_ABC);
    }, 30_000);

    test('deterministic — two calls produce the same bytes', async () => {
        const a = await _b2b.hash(abc);
        const b = await _b2b.hash(abc);
        expect(hex(a)).toBe(RFC7693_ABC);
        expect(hex(b)).toBe(RFC7693_ABC);
    }, 30_000);
});

// ── RFC 7693 Appendix E: self-test grand hash ─────────────────────────────────
//
// Reproduces the RFC self-test host-side via selftestSeq, feeds each case
// through the WASM shim, collects all digests and hashes them with a 256-bit
// (32-byte outLen) BLAKE2b-256 call. The grand digest must equal the RFC
// constant byte-for-byte.

describe('wasmBlake2b — RFC 7693 Appendix E self-test', () => {
    test('grand hash-of-hashes equals the RFC constant', async () => {
        const noKey = new Uint8Array(0);
        const collected = [];

        for (const outlen of SELFTEST_MD_LENS) {
            for (const inlen of SELFTEST_IN_LENS) {
                const msg = selftestSeq(inlen, inlen);

                // unkeyed
                const mdU = await _b2b.hash(msg, { outLen: outlen });
                expect(mdU).not.toBe(false);
                for (const v of mdU) collected.push(v);

                // keyed (key = selftest_seq(outlen, outlen))
                const key = selftestSeq(outlen, outlen);
                const mdK = await _b2b.hash(msg, { outLen: outlen, key });
                expect(mdK).not.toBe(false);
                for (const v of mdK) collected.push(v);
            }
        }

        // Hash the collected buffer with BLAKE2b-256 (outLen=32, no key).
        const grand = await _b2b.hash(new Uint8Array(collected), { outLen: 32 });
        expect(grand).not.toBe(false);
        expect(hex(grand)).toBe(RFC7693_SELFTEST_HEX);
    }, 60_000);
});

// ── keyed-hash vector ────────────────────────────────────────────────────────
//
// From the RFC 7693 Appendix E self-test keyed pass (first keyed vector:
// outLen=20, inLen=0, key=selftest_seq(20,20)). Verified against the pure-JS
// module and the official test suite.

describe('wasmBlake2b — keyed hash (MAC)', () => {
    test('keyed BLAKE2b-160 (outLen=20) matches pure-JS', async () => {
        const msg = new Uint8Array(0); // inLen=0
        const key = selftestSeq(20, 20);

        const wasmDigest = await _b2b.hash(msg, { outLen: 20, key });
        expect(wasmDigest).not.toBe(false);
        expect(wasmDigest.length).toBe(20);

        const pureDigest = _pure.hash(msg, 20, key);
        expect(pureDigest).not.toBe(false);

        expect(hex(wasmDigest)).toBe(hex(pureDigest));
    }, 30_000);

    test('keyed BLAKE2b-512 with 64-byte key', async () => {
        const key = new Uint8Array(64).fill(0x5a);
        const msg = new TextEncoder().encode('hello world');

        const wasmDigest = await _b2b.hash(msg, { key });
        expect(wasmDigest).not.toBe(false);
        expect(wasmDigest.length).toBe(64);

        const pureDigest = _pure.hash(msg, 64, key);
        expect(pureDigest).not.toBe(false);

        expect(hex(wasmDigest)).toBe(hex(pureDigest));
    }, 30_000);
});

// ── parity with pure-JS blake2b ───────────────────────────────────────────────

describe('wasmBlake2b — parity with pure-JS blake2b', () => {
    const enc = new TextEncoder();

    test('unkeyed: default outLen=64 on several inputs', async () => {
        const inputs = [
            new Uint8Array(0),
            enc.encode('abc'),
            new Uint8Array(127).map((_, i) => (i * 7 + 1) & 0xff),
            new Uint8Array(128).map((_, i) => (i * 11 + 3) & 0xff),
            new Uint8Array(129).map((_, i) => (i * 13 + 5) & 0xff),
            new Uint8Array(256).map((_, i) => (i * 29 + 9) & 0xff),
        ];
        for (const msg of inputs) {
            const wasmD = await _b2b.hash(msg);
            const pureD = _pure.hash(msg, 64);
            expect(wasmD).not.toBe(false);
            expect(pureD).not.toBe(false);
            expect(hex(wasmD)).toBe(hex(pureD));
        }
    }, 30_000);

    test('keyed: parity across key lengths', async () => {
        const msg = enc.encode('test message');
        const keys = [
            enc.encode('key'),
            new Uint8Array(32).fill(0xab),
            new Uint8Array(64).fill(0xff),
        ];
        for (const key of keys) {
            const wasmD = await _b2b.hash(msg, { key });
            const pureD = _pure.hash(msg, 64, key);
            expect(wasmD).not.toBe(false);
            expect(pureD).not.toBe(false);
            expect(hex(wasmD)).toBe(hex(pureD));
        }
    }, 30_000);

    test('variable outLen: [1, 16, 32, 48, 64]', async () => {
        const msg = enc.encode('abc');
        for (const outLen of [1, 16, 32, 48, 64]) {
            const wasmD = await _b2b.hash(msg, { outLen });
            const pureD = _pure.hash(msg, outLen);
            expect(wasmD).not.toBe(false);
            expect(pureD).not.toBe(false);
            expect(wasmD.length).toBe(outLen);
            expect(hex(wasmD)).toBe(hex(pureD));
        }
    }, 30_000);
});

// ── salt + personalisation ────────────────────────────────────────────────────

describe('wasmBlake2b — salt and personalisation', () => {
    test('salt/personal perturb the digest vs unsalted', async () => {
        const msg = new TextEncoder().encode('abc');
        const salt = new Uint8Array(16).map((_, i) => (i + 1) & 0xff);
        const personal = new Uint8Array(16).map((_, i) => (0xa0 + i) & 0xff);

        const plain  = await _b2b.hash(msg);
        const salted = await _b2b.hash(msg, { salt, personal });

        expect(plain).not.toBe(false);
        expect(salted).not.toBe(false);
        expect(hex(plain)).not.toBe(hex(salted));
    }, 30_000);

    test('deterministic with same salt/personal', async () => {
        const msg = new TextEncoder().encode('abc');
        const salt = new Uint8Array(16).fill(0x55);
        const personal = new Uint8Array(16).fill(0xaa);

        const a = await _b2b.hash(msg, { salt, personal });
        const b = await _b2b.hash(msg, { salt, personal });
        expect(hex(a)).toBe(hex(b));
    }, 30_000);
});

// ── invalid params → false, no throw ──────────────────────────────────────────

describe('wasmBlake2b — invalid params', () => {
    const msg = new Uint8Array([1, 2, 3]);

    test('outLen=0 → false', async () => {
        const r = await _b2b.hash(msg, { outLen: 0 });
        expect(r).toBe(false);
    });

    test('outLen=65 → false', async () => {
        const r = await _b2b.hash(msg, { outLen: 65 });
        expect(r).toBe(false);
    });

    test('key.length=65 → false', async () => {
        const r = await _b2b.hash(msg, { key: new Uint8Array(65) });
        expect(r).toBe(false);
    });

    test('salt.length=17 → false', async () => {
        const r = await _b2b.hash(msg, { salt: new Uint8Array(17) });
        expect(r).toBe(false);
    });

    test('personal.length=17 → false', async () => {
        const r = await _b2b.hash(msg, { personal: new Uint8Array(17) });
        expect(r).toBe(false);
    });

    test('non-Uint8Array data → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _b2b.hash('hello');
        expect(r).toBe(false);
    });

    test('invalid params never throw', async () => {
        await expect(_b2b.hash(msg, { outLen: 0 })).resolves.toBe(false);
        await expect(_b2b.hash(msg, { outLen: 65 })).resolves.toBe(false);
        await expect(_b2b.hash(msg, { key: new Uint8Array(65) })).resolves.toBe(false);
    });
});
