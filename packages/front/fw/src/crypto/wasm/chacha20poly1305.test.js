// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for `wasmChacha20poly1305` — RFC 8439 KAT, seal/open
 * round-trip, tamper rejection, pure-JS parity, invalid-param handling.
 *
 * The WASM binary is the colocated asset (vendored from `@awacloud/fw-wasm-crypto`);
 * no stub — real KAT vectors are asserted byte-for-byte.
 */
import { describe, test, expect } from 'bun:test';
import { wasmChacha20poly1305 } from './chacha20poly1305.js';
import { wasmRuntime } from './runtime.js';
import { chacha20poly1305 as pureChacha20poly1305 } from '../mode/chacha20poly1305.js';
import { chacha20 } from '../cipher/chacha20.js';
import { poly1305 } from '../hash/poly1305.js';

// ── manual factory wiring (fw test-format) ─────────────────────────────────

const _rt = wasmRuntime.factory();
const _wasm = wasmChacha20poly1305.factory(_rt);

// Pure-JS wired with its deps for parity test.
const _pure = pureChacha20poly1305.factory(chacha20.factory(), poly1305.factory());

// ── helpers ─────────────────────────────────────────────────────────────────

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
        out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

// ── RFC 8439 §2.8.2 AEAD_CHACHA20_POLY1305 test vector ──────────────────────
//
// From shims/chacha20poly1305.kat.test.ts — byte-for-byte anchor.
// The 12-byte IETF nonce is: 07 00 00 00 | 40 41 42 43 | 44 45 46 47.
const RFC_KEY      = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
const RFC_NONCE    = fromHex('070000004041424344454647');
const RFC_PT       = fromHex(
    '4c616469657320616e642047656e746c656d656e206f662074686520636c6173' +
    '73206f66202739393a204966204920636f756c64206f6666657220796f75206f' +
    '6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73' +
    '637265656e20776f756c642062652069742e',
);
const RFC_AAD      = fromHex('50515253c0c1c2c3c4c5c6c7');
const RFC_CT_HEX   =
    'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6' +
    '3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36' +
    '92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc' +
    '3ff4def08e4b7a9de576d26586cec64b6116';
const RFC_TAG_HEX  = '1ae10b594f09e26a7e902ecbd0600691';
const RFC_CT       = fromHex(RFC_CT_HEX);
const RFC_TAG      = fromHex(RFC_TAG_HEX);
// ctWithTag = ciphertext ‖ tag
const RFC_CT_TAG   = (() => { const b = new Uint8Array(RFC_CT.length + 16); b.set(RFC_CT); b.set(RFC_TAG, RFC_CT.length); return b; })();

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmChacha20poly1305 — module metadata', () => {
    test('name', () => {
        expect(wasmChacha20poly1305.name).toBe('wasmChacha20poly1305');
    });

    test('type', () => {
        expect(wasmChacha20poly1305.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmChacha20poly1305.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmChacha20poly1305.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmChacha20poly1305.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmChacha20poly1305 — API shape', () => {
    test('exposes isAvailable / seal / open, all functions', () => {
        for (const m of ['isAvailable', 'seal', 'open']) {
            expect(typeof _wasm[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_wasm.isAvailable()).toBe(_rt.isAvailable());
        expect(_wasm.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 8439 §2.8.2 KAT (real binary) ────────────────────────────────────────

describe('wasmChacha20poly1305 — RFC 8439 §2.8.2 KAT', () => {
    test('seal produces the RFC ciphertext||tag byte-for-byte', async () => {
        const out = await _wasm.seal(RFC_KEY, RFC_NONCE, RFC_PT, RFC_AAD);
        expect(out).not.toBe(false);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(out.length).toBe(RFC_PT.length + 16);
        // ciphertext (first PT bytes)
        expect(hex(out.subarray(0, RFC_PT.length))).toBe(RFC_CT_HEX);
        // tag (last 16 bytes)
        expect(hex(out.subarray(RFC_PT.length))).toBe(RFC_TAG_HEX);
    }, 30_000);

    test('open recovers the RFC plaintext byte-for-byte', async () => {
        const pt = await _wasm.open(RFC_KEY, RFC_NONCE, RFC_CT_TAG, RFC_AAD);
        expect(pt).not.toBe(false);
        expect(pt).toBeInstanceOf(Uint8Array);
        expect(hex(pt)).toBe(hex(RFC_PT));
    }, 30_000);

    test('is deterministic (two seal calls yield identical output)', async () => {
        const a = await _wasm.seal(RFC_KEY, RFC_NONCE, RFC_PT, RFC_AAD);
        const b = await _wasm.seal(RFC_KEY, RFC_NONCE, RFC_PT, RFC_AAD);
        expect(a).not.toBe(false);
        expect(b).not.toBe(false);
        expect(hex(a)).toBe(hex(b));
    }, 30_000);
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('wasmChacha20poly1305 — seal / open round-trip', () => {
    const KEY   = new Uint8Array(32).map((_, i) => i);
    const NONCE = new Uint8Array(12).map((_, i) => i + 1);
    const PT    = new Uint8Array(64).map((_, i) => (i * 7 + 3) & 0xff);
    const AAD   = new Uint8Array(12).map((_, i) => (i * 5 + 1) & 0xff);

    test('round-trip with AAD recovers plaintext', async () => {
        const sealed = await _wasm.seal(KEY, NONCE, PT, AAD);
        expect(sealed).not.toBe(false);
        const plain = await _wasm.open(KEY, NONCE, sealed, AAD);
        expect(plain).not.toBe(false);
        expect(hex(plain)).toBe(hex(PT));
    }, 30_000);

    test('round-trip without AAD (default empty) recovers plaintext', async () => {
        const sealed = await _wasm.seal(KEY, NONCE, PT);
        expect(sealed).not.toBe(false);
        const plain = await _wasm.open(KEY, NONCE, sealed);
        expect(plain).not.toBe(false);
        expect(hex(plain)).toBe(hex(PT));
    }, 30_000);

    test('round-trip with empty plaintext (tag-only seal)', async () => {
        const emptyPt = new Uint8Array(0);
        const sealed = await _wasm.seal(KEY, NONCE, emptyPt, AAD);
        expect(sealed).not.toBe(false);
        expect(sealed.length).toBe(16);
        const plain = await _wasm.open(KEY, NONCE, sealed, AAD);
        expect(plain).not.toBe(false);
        expect(plain.length).toBe(0);
    }, 30_000);
});

// ── tamper rejection (auth fail → false, not throw) ───────────────────────────

describe('wasmChacha20poly1305 — tamper rejection', () => {
    const KEY   = RFC_KEY;
    const NONCE = RFC_NONCE;

    test('tampered ciphertext byte → open returns false', async () => {
        const tampered = new Uint8Array(RFC_CT_TAG);
        tampered[0] ^= 0x01;
        const r = await _wasm.open(KEY, NONCE, tampered, RFC_AAD);
        expect(r).toBe(false);
    }, 30_000);

    test('tampered tag byte → open returns false', async () => {
        const tampered = new Uint8Array(RFC_CT_TAG);
        tampered[tampered.length - 1] ^= 0xff;
        const r = await _wasm.open(KEY, NONCE, tampered, RFC_AAD);
        expect(r).toBe(false);
    }, 30_000);

    test('wrong AAD → open returns false', async () => {
        const wrongAad = new Uint8Array(RFC_AAD);
        wrongAad[0] ^= 0x01;
        const r = await _wasm.open(KEY, NONCE, RFC_CT_TAG, wrongAad);
        expect(r).toBe(false);
    }, 30_000);

    test('wrong key → open returns false', async () => {
        const wrongKey = new Uint8Array(RFC_KEY);
        wrongKey[0] ^= 0x01;
        const r = await _wasm.open(wrongKey, NONCE, RFC_CT_TAG, RFC_AAD);
        expect(r).toBe(false);
    }, 30_000);

    test('tamper rejection never throws', async () => {
        const tampered = new Uint8Array(RFC_CT_TAG);
        tampered[0] ^= 0xff;
        await expect(_wasm.open(KEY, NONCE, tampered, RFC_AAD)).resolves.toBe(false);
    }, 30_000);
});

// ── parity with pure-JS chacha20poly1305 ──────────────────────────────────────

describe('wasmChacha20poly1305 — parity with pure-JS', () => {
    const KEY   = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);
    const NONCE = new Uint8Array(12).map((_, i) => (i * 3 + 7) & 0xff);
    const PT    = new Uint8Array(48).map((_, i) => (i * 17 + 2) & 0xff);
    const AAD   = new Uint8Array(8).map((_, i) => (i * 13 + 1) & 0xff);

    test('seal matches pure-JS encrypt (ct and tag)', async () => {
        const wasmOut = await _wasm.seal(KEY, NONCE, PT, AAD);
        expect(wasmOut).not.toBe(false);

        const pureOut = _pure.encrypt(KEY, NONCE, PT, AAD);
        expect(pureOut).not.toBe(false);

        const wasmCt  = wasmOut.subarray(0, PT.length);
        const wasmTag = wasmOut.subarray(PT.length);

        expect(hex(wasmCt)).toBe(hex(pureOut.ct));
        expect(hex(wasmTag)).toBe(hex(pureOut.tag));
    }, 30_000);

    test('open matches pure-JS decrypt output', async () => {
        const pureOut = _pure.encrypt(KEY, NONCE, PT, AAD);
        expect(pureOut).not.toBe(false);

        // Build ctWithTag from the pure-JS result.
        const ctTag = new Uint8Array(pureOut.ct.length + pureOut.tag.length);
        ctTag.set(pureOut.ct);
        ctTag.set(pureOut.tag, pureOut.ct.length);

        const wasmPt = await _wasm.open(KEY, NONCE, ctTag, AAD);
        expect(wasmPt).not.toBe(false);
        expect(hex(wasmPt)).toBe(hex(PT));
    }, 30_000);
});

// ── invalid params → false, no throw ─────────────────────────────────────────

describe('wasmChacha20poly1305 — invalid params', () => {
    const KEY   = RFC_KEY;
    const NONCE = RFC_NONCE;
    const PT    = new Uint8Array(4);
    const FAKE_CT_TAG = new Uint8Array(20);

    test('key wrong length → false (seal)', async () => {
        const r = await _wasm.seal(new Uint8Array(16), NONCE, PT);
        expect(r).toBe(false);
    });

    test('key wrong length → false (open)', async () => {
        const r = await _wasm.open(new Uint8Array(16), NONCE, FAKE_CT_TAG);
        expect(r).toBe(false);
    });

    test('nonce wrong length → false (seal)', async () => {
        const r = await _wasm.seal(KEY, new Uint8Array(8), PT);
        expect(r).toBe(false);
    });

    test('nonce wrong length → false (open)', async () => {
        const r = await _wasm.open(KEY, new Uint8Array(8), FAKE_CT_TAG);
        expect(r).toBe(false);
    });

    test('ctWithTag shorter than 16 bytes → false (open)', async () => {
        const r = await _wasm.open(KEY, NONCE, new Uint8Array(15));
        expect(r).toBe(false);
    });

    test('non-Uint8Array key → false (seal)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.seal('not-a-key', NONCE, PT);
        expect(r).toBe(false);
    });

    test('non-Uint8Array ctWithTag → false (open)', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.open(KEY, NONCE, 'not-bytes');
        expect(r).toBe(false);
    });

    test('invalid params never throw (seal)', async () => {
        await expect(_wasm.seal(new Uint8Array(8), NONCE, PT)).resolves.toBe(false);
    });

    test('invalid params never throw (open)', async () => {
        await expect(_wasm.open(KEY, new Uint8Array(4), FAKE_CT_TAG)).resolves.toBe(false);
    });
});
