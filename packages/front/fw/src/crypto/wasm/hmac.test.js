// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmHmac } from './hmac.js';
import { wasmRuntime } from './runtime.js';
import { hmac as pureHmac } from '../hash/hmac.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { sha256 } from '../hash/sha256.js';
import { sha384 } from '../hash/sha384.js';
import { sha512 } from '../hash/sha512.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED @awacloud/fw-wasm-crypto `hmac` dist binary by
// name (hmac.scalar.wasm — hmac is scalar-only, simd:false in targets.json).
const _rt = wasmRuntime.factory();
const _wasm = wasmHmac.factory(_rt);

// Pure-JS hmac deps — needed for cross-impl parity checks.
// The pure-JS hmac uses bitArray (word-packed numbers); conversion via _ba.
const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha384 = sha384.factory(_sha512inst());
const _sha512 = sha512.factory(_ba, _utf8);

// Lazy singleton to avoid hoisting issue: sha384 depends on sha512.
function _sha512inst() {
    return sha512.factory(_ba, _utf8);
}

const _pure256 = pureHmac.factory(_ba, _utf8, _sha256);
const _pure384 = pureHmac.factory(_ba, _utf8, _sha384);
const _pure512 = pureHmac.factory(_ba, _utf8, _sha512);

// ── hex helpers ───────────────────────────────────────────────────────────────

function hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

function fromHex(s) {
    if (!s || s.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

// ── RFC 4231 KAT vectors ──────────────────────────────────────────────────────
//
// Vectors from RFC 4231 (HMAC-SHA-256/384/512, test cases 1–7).
// Source: shims/hmac.kat.test.ts RFC 4231 anchors.

const enc = new TextEncoder();

// Test case 1: key=20×0x0b, data="Hi There"
const TC1_KEY = new Uint8Array(20).fill(0x0b);
const TC1_DATA = enc.encode('Hi There');
const TC1 = {
    256: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    384: 'afd03944d84895626b0825f4ab46907f' +
         '15f9dadbe4101ec682aa034c7cebc59c' +
         'faea9ea9076ede7f4af152e8b2fa9cb6',
    512: '87aa7cdea5ef619d4ff0b4241a1d6cb0' +
         '2379f4e2ce4ec2787ad0b30545e17cde' +
         'daa833b7d6b8a702038b274eaea3f4e4' +
         'be9d914eeb61f1702e696c203a126854',
};

// Test case 2: key="Jefe", data="what do ya want for nothing?"
const TC2_KEY = enc.encode('Jefe');
const TC2_DATA = enc.encode('what do ya want for nothing?');
const TC2 = {
    256: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    384: 'af45d2e376484031617f78d2b58a6b1b' +
         '9c7ef464f5a01b47e42ec3736322445e' +
         '8e2240ca5e69e2c78b3239ecfab21649',
    512: '164b7a7bfcf819e2e395fbe73b56e0a3' +
         '87bd64222e831fd610270cd7ea250554' +
         '9758bf75c05a994a6d034f65f8f0e6fd' +
         'caeab1a34d4a6b4b636e070a38bce737',
};

// Test case 7: key=131×0xaa (key > block → hashed), long data
const TC7_KEY = new Uint8Array(131).fill(0xaa);
const TC7_DATA = enc.encode(
    'This is a test using a larger than block-size key and a larger than ' +
    'block-size data. The key needs to be hashed before being used by the ' +
    'HMAC algorithm.',
);
const TC7 = {
    256: '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
    384: '6617178e941f020d351e2f254e8fd32c' +
         '602420feb0b8fb9adccebb82461e99c5' +
         'a678cc31e799176d3860e6110c46523e',
    512: 'e37b6a775dc87dbaa4dfa9f96e5e3ffd' +
         'debd71f8867289865df5a32d20cdc944' +
         'b6022cac3c4982b10d5eeb55c3e4de15' +
         '134676fb6de0446065c97440fa8c6a58',
};

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmHmac — module metadata', () => {
    test('name', () => {
        expect(wasmHmac.name).toBe('wasmHmac');
    });

    test('version', () => {
        expect(wasmHmac.version).toBe('1.0.0');
    });

    test('type', () => {
        expect(wasmHmac.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmHmac.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmHmac.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmHmac.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmHmac — API shape', () => {
    test('exposes isAvailable / mac / verify, all functions', () => {
        for (const m of ['isAvailable', 'mac', 'verify']) {
            expect(typeof _wasm[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_wasm.isAvailable()).toBe(_rt.isAvailable());
        expect(_wasm.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 4231 KAT — HMAC-SHA-256 ─────────────────────────────────────────────

describe('wasmHmac — RFC 4231 HMAC-SHA-256 KAT', () => {
    test('Test case 1 (key=20×0x0b, "Hi There")', async () => {
        const tag = await _wasm.mac(TC1_KEY, TC1_DATA, 256);
        expect(tag).not.toBe(false);
        expect(tag).toBeInstanceOf(Uint8Array);
        expect(tag.length).toBe(32);
        expect(hex(tag)).toBe(TC1[256]);
    });

    test('Test case 2 (key="Jefe", "what do ya want for nothing?")', async () => {
        const tag = await _wasm.mac(TC2_KEY, TC2_DATA, 256);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(32);
        expect(hex(tag)).toBe(TC2[256]);
    });

    test('Test case 7 (key=131×0xaa, large data — key > block hashed first)', async () => {
        const tag = await _wasm.mac(TC7_KEY, TC7_DATA, 256);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(32);
        expect(hex(tag)).toBe(TC7[256]);
    });

    test('default hash (no hash arg) is SHA-256', async () => {
        const explicit = await _wasm.mac(TC1_KEY, TC1_DATA, 256);
        const defaulted = await _wasm.mac(TC1_KEY, TC1_DATA);
        expect(explicit).not.toBe(false);
        expect(defaulted).not.toBe(false);
        expect(hex(defaulted)).toBe(hex(explicit));
    });
});

// ── RFC 4231 KAT — HMAC-SHA-384 ─────────────────────────────────────────────

describe('wasmHmac — RFC 4231 HMAC-SHA-384 KAT', () => {
    test('Test case 1 (key=20×0x0b, "Hi There")', async () => {
        const tag = await _wasm.mac(TC1_KEY, TC1_DATA, 384);
        expect(tag).not.toBe(false);
        expect(tag).toBeInstanceOf(Uint8Array);
        expect(tag.length).toBe(48);
        expect(hex(tag)).toBe(TC1[384]);
    });

    test('Test case 2 (key="Jefe")', async () => {
        const tag = await _wasm.mac(TC2_KEY, TC2_DATA, 384);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(48);
        expect(hex(tag)).toBe(TC2[384]);
    });

    test('Test case 7 (key > block)', async () => {
        const tag = await _wasm.mac(TC7_KEY, TC7_DATA, 384);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(48);
        expect(hex(tag)).toBe(TC7[384]);
    });
});

// ── RFC 4231 KAT — HMAC-SHA-512 ─────────────────────────────────────────────

describe('wasmHmac — RFC 4231 HMAC-SHA-512 KAT', () => {
    test('Test case 1 (key=20×0x0b, "Hi There")', async () => {
        const tag = await _wasm.mac(TC1_KEY, TC1_DATA, 512);
        expect(tag).not.toBe(false);
        expect(tag).toBeInstanceOf(Uint8Array);
        expect(tag.length).toBe(64);
        expect(hex(tag)).toBe(TC1[512]);
    });

    test('Test case 2 (key="Jefe")', async () => {
        const tag = await _wasm.mac(TC2_KEY, TC2_DATA, 512);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(64);
        expect(hex(tag)).toBe(TC2[512]);
    });

    test('Test case 7 (key > block)', async () => {
        const tag = await _wasm.mac(TC7_KEY, TC7_DATA, 512);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(64);
        expect(hex(tag)).toBe(TC7[512]);
    });
});

// ── parity with pure-JS hmac ─────────────────────────────────────────────────
//
// The pure-JS hmac module uses bitArray (word-packed numbers).
// Convert via _ba.ui8_to_ba (input) and _ba.ba_to_ui8 (output).

describe('wasmHmac — parity with pure-JS hmac', () => {
    const INPUTS = [
        { key: TC1_KEY, data: TC1_DATA, label: 'tc1 key/data' },
        { key: TC2_KEY, data: TC2_DATA, label: 'tc2 key/data' },
    ];

    test('HMAC-SHA-256: WASM matches pure-JS', async () => {
        for (const { key, data } of INPUTS) {
            const wasmTag = await _wasm.mac(key, data, 256);
            expect(wasmTag).not.toBe(false);

            const keyBa = _ba.ui8_to_ba(key);
            const dataBa = _ba.ui8_to_ba(data);
            const pureBa = new _pure256.fn(keyBa, _sha256).encrypt(dataBa);
            expect(pureBa).not.toBe(false);
            const pureTag = _ba.ba_to_ui8(pureBa);
            expect(hex(wasmTag)).toBe(hex(pureTag));
        }
    });

    test('HMAC-SHA-512: WASM matches pure-JS', async () => {
        for (const { key, data } of INPUTS) {
            const wasmTag = await _wasm.mac(key, data, 512);
            expect(wasmTag).not.toBe(false);

            const keyBa = _ba.ui8_to_ba(key);
            const dataBa = _ba.ui8_to_ba(data);
            const pureBa = new _pure512.fn(keyBa, _sha512).encrypt(dataBa);
            expect(pureBa).not.toBe(false);
            const pureTag = _ba.ba_to_ui8(pureBa);
            expect(hex(wasmTag)).toBe(hex(pureTag));
        }
    });
});

// ── verify ────────────────────────────────────────────────────────────────────

describe('wasmHmac — verify', () => {
    test('true on correct RFC 4231 tc1 SHA-256 tag', async () => {
        const tag = fromHex(TC1[256]);
        const ok = await _wasm.verify(TC1_KEY, tag, TC1_DATA, 256);
        expect(ok).toBe(true);
    });

    test('true on correct RFC 4231 tc1 SHA-512 tag', async () => {
        const tag = fromHex(TC1[512]);
        const ok = await _wasm.verify(TC1_KEY, tag, TC1_DATA, 512);
        expect(ok).toBe(true);
    });

    test('false on tampered tag (one bit flipped)', async () => {
        const bad = fromHex(TC1[256]);
        bad[0] ^= 0x01;
        const ok = await _wasm.verify(TC1_KEY, bad, TC1_DATA, 256);
        expect(ok).toBe(false);
    });

    test('false on tampered data (one byte modified)', async () => {
        const badData = new Uint8Array(TC1_DATA);
        badData[0] ^= 0xff;
        const tag = fromHex(TC1[256]);
        const ok = await _wasm.verify(TC1_KEY, tag, badData, 256);
        expect(ok).toBe(false);
    });

    test('false on wrong key', async () => {
        const wrongKey = new Uint8Array(20).fill(0xcc);
        const tag = fromHex(TC1[256]);
        const ok = await _wasm.verify(wrongKey, tag, TC1_DATA, 256);
        expect(ok).toBe(false);
    });

    test('round-trip mac→verify is true (SHA-384)', async () => {
        const tag = await _wasm.mac(TC2_KEY, TC2_DATA, 384);
        expect(tag).not.toBe(false);
        const ok = await _wasm.verify(TC2_KEY, tag, TC2_DATA, 384);
        expect(ok).toBe(true);
    });
});

// ── invalid params → false, no throw ──────────────────────────────────────────

describe('wasmHmac — invalid params', () => {
    const KEY = TC1_KEY;
    const DATA = TC1_DATA;
    const TAG = fromHex(TC1[256]);

    test('non-Uint8Array key → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac([1, 2, 3], DATA, 256);
        expect(r).toBe(false);
    });

    test('non-Uint8Array data → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac(KEY, 'hello', 256);
        expect(r).toBe(false);
    });

    test('invalid hash 224 → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac(KEY, DATA, 224);
        expect(r).toBe(false);
    });

    test('invalid hash 0 → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac(KEY, DATA, 0);
        expect(r).toBe(false);
    });

    test('invalid hash "sha256" → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac(KEY, DATA, 'sha256');
        expect(r).toBe(false);
    });

    test('non-Uint8Array tag in verify → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.verify(KEY, 'bad', DATA, 256);
        expect(r).toBe(false);
    });

    test('invalid params never throw (mac)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wasm.mac(null, DATA, 256)).resolves.toBe(false);
    });

    test('invalid params never throw (verify)', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wasm.verify(null, TAG, DATA, 256)).resolves.toBe(false);
    });

    test('invalid hash in verify → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.verify(KEY, TAG, DATA, 128);
        expect(r).toBe(false);
    });
});

// ── empty key / empty data edge cases ────────────────────────────────────────

describe('wasmHmac — edge cases', () => {
    test('empty key: mac resolves to Uint8Array (not false)', async () => {
        const r = await _wasm.mac(new Uint8Array(0), TC1_DATA, 256);
        // An empty key is valid for HMAC (zero-padded to block size per RFC 2104).
        // The result must be a Uint8Array, not false.
        expect(r).toBeInstanceOf(Uint8Array);
        expect(r.length).toBe(32);
    });

    test('empty data: mac resolves to Uint8Array (not false)', async () => {
        const r = await _wasm.mac(TC1_KEY, new Uint8Array(0), 256);
        expect(r).toBeInstanceOf(Uint8Array);
        expect(r.length).toBe(32);
    });

    test('is deterministic (same call yields identical tag)', async () => {
        const a = await _wasm.mac(TC1_KEY, TC1_DATA, 256);
        const b = await _wasm.mac(TC1_KEY, TC1_DATA, 256);
        expect(a).not.toBe(false);
        expect(b).not.toBe(false);
        expect(hex(a)).toBe(hex(b));
    });
});
