// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmSha3 } from './sha3.js';
import { wasmRuntime } from './runtime.js';
import { sha3 as pureSha3 } from '../hash/sha3.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `sha3` dist binary by
// name (sha3.simd.wasm or sha3.scalar.wasm based on host SIMD support).
const _rt = wasmRuntime.factory();
const _sha3 = wasmSha3.factory(_rt);

// Pure-JS sha3 for parity checks. It returns bitArray; convert via ba_to_ui8.
const _ba = bitArray.factory();
const _pure = pureSha3.factory(_ba, utf8.factory());

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
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmSha3 — module metadata', () => {
    test('name', () => {
        expect(wasmSha3.name).toBe('wasmSha3');
    });

    test('type', () => {
        expect(wasmSha3.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmSha3.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmSha3.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmSha3.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmSha3 — API shape', () => {
    test('exposes the prescribed surface, all functions', () => {
        for (const m of ['isAvailable', 'sha3_224', 'sha3_256', 'sha3_384', 'sha3_512', 'shake128', 'shake256']) {
            expect(typeof _sha3[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_sha3.isAvailable()).toBe(_rt.isAvailable());
        expect(_sha3.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── FIPS 202 NIST KAT vectors ────────────────────────────────────────────────
//
// Vectors from shims/sha3.kat.test.ts (FIPS 202 / NIST examples).

describe('wasmSha3 — FIPS 202 SHA3-256 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha3.sha3_256(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha3.sha3_256(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    });
});

describe('wasmSha3 — FIPS 202 SHA3-512 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha3.sha3_512(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(64);
        expect(hex(digest)).toBe(
            'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a6' +
            '15b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26',
        );
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha3.sha3_512(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(64);
        expect(hex(digest)).toBe(
            'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e' +
            '10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
        );
    });
});

describe('wasmSha3 — FIPS 202 SHA3-224 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha3.sha3_224(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest.length).toBe(28);
        expect(hex(digest)).toBe('6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7');
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha3.sha3_224(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(hex(digest)).toBe('e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf');
    });
});

describe('wasmSha3 — FIPS 202 SHA3-384 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha3.sha3_384(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest.length).toBe(48);
        expect(hex(digest)).toBe(
            '0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2a' +
            'c3713831264adb47fb6bd1e058d5f004',
        );
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha3.sha3_384(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(hex(digest)).toBe(
            'ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b2' +
            '98d88cea927ac7f539f1edf228376d25',
        );
    });
});

describe('wasmSha3 — FIPS 202 SHAKE128 KAT vectors', () => {
    test('empty message, 32-byte output', async () => {
        const digest = await _sha3.shake128(new Uint8Array(0), 32);
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');
    });

    test('empty message, 16-byte output (shorter XOF)', async () => {
        // Prefix of the 32-byte vector above.
        const digest = await _sha3.shake128(new Uint8Array(0), 16);
        expect(digest).not.toBe(false);
        expect(digest.length).toBe(16);
        expect(hex(digest)).toBe('7f9c2ba4e88f827d616045507605853e');
    });
});

describe('wasmSha3 — FIPS 202 SHAKE256 KAT vectors', () => {
    test('empty message, 32-byte output', async () => {
        const digest = await _sha3.shake256(new Uint8Array(0), 32);
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f');
    });
});

// ── parity with pure-JS sha3 ─────────────────────────────────────────────────
//
// The pure-JS sha3 module returns a bitArray (number[]); convert to Uint8Array
// via bitArray.ba_to_ui8() before comparing.

describe('wasmSha3 — parity with pure-JS sha3', () => {
    const enc = new TextEncoder();
    const INPUTS = [
        new Uint8Array(0),
        enc.encode('abc'),
        new Uint8Array(64).map((_, i) => (i * 7 + 1) & 0xff),
    ];

    test('sha3_256 agrees with pure-JS sha3_256', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.sha3_256(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.sha3_256(input));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });

    test('sha3_512 agrees with pure-JS sha3_512', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.sha3_512(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.sha3_512(input));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });

    test('sha3_224 agrees with pure-JS sha3_224', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.sha3_224(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.sha3_224(input));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });

    test('sha3_384 agrees with pure-JS sha3_384', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.sha3_384(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.sha3_384(input));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });

    test('shake128 agrees with pure-JS shake128 (32-byte output)', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.shake128(input, 32);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.shake128(input, 256)); // outBits=256 = 32 bytes
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });

    test('shake256 agrees with pure-JS shake256 (32-byte output)', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha3.shake256(input, 32);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pure.shake256(input, 256)); // outBits=256 = 32 bytes
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });
});

// ── invalid inputs → false, no throw ─────────────────────────────────────────

describe('wasmSha3 — invalid inputs → false, no throw', () => {
    test('non-Uint8Array data → false (sha3_256)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _sha3.sha3_256([1, 2, 3]);
        expect(r).toBe(false);
    });

    test('non-Uint8Array data → false (shake128)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _sha3.shake128('hello', 32);
        expect(r).toBe(false);
    });

    test('outLen 0 → false (shake128)', async () => {
        const r = await _sha3.shake128(new Uint8Array(0), 0);
        expect(r).toBe(false);
    });

    test('outLen 0 → false (shake256)', async () => {
        const r = await _sha3.shake256(new Uint8Array(4), 0);
        expect(r).toBe(false);
    });

    test('negative outLen → false (shake128)', async () => {
        const r = await _sha3.shake128(new Uint8Array(4), -1);
        expect(r).toBe(false);
    });

    test('invalid inputs never throw (sha3_256)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_sha3.sha3_256(null)).resolves.toBe(false);
    });

    test('invalid inputs never throw (shake128)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_sha3.shake128(null, 32)).resolves.toBe(false);
    });
});
