// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmSha2 } from './sha2.js';
import { wasmRuntime } from './runtime.js';
import { sha256 as pureSha256 } from '../hash/sha256.js';
import { sha384 as pureSha384 } from '../hash/sha384.js';
import { sha512 as pureSha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `sha2` dist binary by
// name (sha2.scalar.wasm — sha2 is scalar-only, simd:false).
const _rt = wasmRuntime.factory();
const _sha2 = wasmSha2.factory(_rt);

// Pure-JS SHA-2 for parity checks. They return bitArrays; convert via ba_to_ui8.
const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _pureSha256 = pureSha256.factory(_ba, _utf8);
const _pureSha512 = pureSha512.factory(_ba, _utf8);
// sha384 depends on sha512
const _pureSha384 = pureSha384.factory(_pureSha512);

// ── helper utilities ─────────────────────────────────────────────────────────

/** Hex-encode a Uint8Array. */
function hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmSha2 — module metadata', () => {
    test('name', () => {
        expect(wasmSha2.name).toBe('wasmSha2');
    });

    test('type', () => {
        expect(wasmSha2.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmSha2.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmSha2.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmSha2.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmSha2 — API shape', () => {
    test('exposes the prescribed surface, all functions', () => {
        for (const m of ['isAvailable', 'sha256', 'sha384', 'sha512']) {
            expect(typeof _sha2[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_sha2.isAvailable()).toBe(_rt.isAvailable());
        expect(_sha2.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── FIPS 180-4 KAT vectors ───────────────────────────────────────────────────
//
// Vectors from shims/sha2.kat.test.ts (FIPS 180-4 / NIST).

describe('wasmSha2 — FIPS 180-4 SHA-256 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha2.sha256(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha2.sha256(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(32);
        expect(hex(digest)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});

describe('wasmSha2 — FIPS 180-4 SHA-384 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha2.sha384(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(48);
        expect(hex(digest)).toBe(
            '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da' +
            '274edebfe76f65fbd51ad2f14898b95b',
        );
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha2.sha384(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(48);
        expect(hex(digest)).toBe(
            'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed' +
            '8086072ba1e7cc2358baeca134c825a7',
        );
    });
});

describe('wasmSha2 — FIPS 180-4 SHA-512 KAT vectors', () => {
    test('empty message', async () => {
        const digest = await _sha2.sha512(new Uint8Array(0));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(64);
        expect(hex(digest)).toBe(
            'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce' +
            '47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
        );
    });

    test('"abc" message', async () => {
        const enc = new TextEncoder();
        const digest = await _sha2.sha512(enc.encode('abc'));
        expect(digest).not.toBe(false);
        expect(digest).toBeInstanceOf(Uint8Array);
        expect(digest.length).toBe(64);
        expect(hex(digest)).toBe(
            'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
            '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
        );
    });
});

// ── parity with pure-JS sha256/sha384/sha512 ─────────────────────────────────
//
// The pure-JS modules return a bitArray (number[]); convert to Uint8Array
// via bitArray.ba_to_ui8() before comparing.

describe('wasmSha2 — parity with pure-JS sha256', () => {
    const enc = new TextEncoder();
    const INPUTS = [
        new Uint8Array(0),
        enc.encode('abc'),
        new Uint8Array(64).map((_, i) => (i * 7 + 1) & 0xff),
    ];

    test('sha256 agrees with pure-JS sha256', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha2.sha256(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pureSha256.hash(_ba.ui8_to_ba(input)));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });
});

describe('wasmSha2 — parity with pure-JS sha384', () => {
    const enc = new TextEncoder();
    const INPUTS = [
        new Uint8Array(0),
        enc.encode('abc'),
        new Uint8Array(64).map((_, i) => (i * 7 + 1) & 0xff),
    ];

    test('sha384 agrees with pure-JS sha384', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha2.sha384(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pureSha384.hash(_ba.ui8_to_ba(input)));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });
});

describe('wasmSha2 — parity with pure-JS sha512', () => {
    const enc = new TextEncoder();
    const INPUTS = [
        new Uint8Array(0),
        enc.encode('abc'),
        new Uint8Array(64).map((_, i) => (i * 7 + 1) & 0xff),
    ];

    test('sha512 agrees with pure-JS sha512', async () => {
        for (const input of INPUTS) {
            const wasmDigest = await _sha2.sha512(input);
            expect(wasmDigest).not.toBe(false);
            const pureDigest = _ba.ba_to_ui8(_pureSha512.hash(_ba.ui8_to_ba(input)));
            expect(hex(wasmDigest)).toBe(hex(pureDigest));
        }
    });
});

// ── invalid inputs → false, no throw ─────────────────────────────────────────

describe('wasmSha2 — invalid inputs → false, no throw', () => {
    test('non-Uint8Array data → false (sha256)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _sha2.sha256([1, 2, 3]);
        expect(r).toBe(false);
    });

    test('non-Uint8Array data → false (sha384)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _sha2.sha384('hello');
        expect(r).toBe(false);
    });

    test('non-Uint8Array data → false (sha512)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _sha2.sha512(null);
        expect(r).toBe(false);
    });

    test('invalid inputs never throw (sha256)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_sha2.sha256(null)).resolves.toBe(false);
    });

    test('invalid inputs never throw (sha384)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_sha2.sha384(null)).resolves.toBe(false);
    });

    test('invalid inputs never throw (sha512)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_sha2.sha512(null)).resolves.toBe(false);
    });
});
