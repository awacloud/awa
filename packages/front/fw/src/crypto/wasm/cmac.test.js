// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmCmac } from './cmac.js';
import { wasmRuntime } from './runtime.js';
import { cmac as pureCmac } from '../mode/cmac.js';
import { aes } from '../cipher/aes.js';
import { bitArray } from '../utils/bitArray.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// Instantiate the runtime manually and pass it into wasmCmac.factory(rt). The
// runtime loads the DELIVERED @awacloud/fw-wasm-crypto `cmac` dist binary by name.
const _rt = wasmRuntime.factory();
const _wasm = wasmCmac.factory(_rt);

// Pure-JS cmac for parity checks.
const _ba = bitArray.factory();
const _aes = aes.factory();
const _pure = pureCmac.factory(_ba);

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

// ── SP 800-38B / RFC 4493 AES-128 published example vectors ───────────────────
//
// Key: 2b7e151628aed2a6abf7158809cf4f3c
// These four are the canonical fixed anchor KAT, independent of ACVP.

const RFC4493_KEY = fromHex('2b7e151628aed2a6abf7158809cf4f3c');
const RFC4493 = [
    // Example 1: empty message
    { msg: '', tag: 'bb1d6929e95937287fa37d129b756746' },
    // Example 2: 16-byte message (one complete block)
    { msg: '6bc1bee22e409f96e93d7e117393172a', tag: '070a16b46b4d4144f79bdd9dd04a287c' },
    // Example 3: 40-byte message (two complete + one incomplete block)
    {
        msg:
            '6bc1bee22e409f96e93d7e117393172a' +
            'ae2d8a571e03ac9c9eb76fac45af8e51' +
            '30c81c46a35ce411',
        tag: 'dfa66747de9ae63030ca32611497c827',
    },
    // Example 4: 64-byte message (four complete blocks)
    {
        msg:
            '6bc1bee22e409f96e93d7e117393172a' +
            'ae2d8a571e03ac9c9eb76fac45af8e51' +
            '30c81c46a35ce411e5fbc1191a0a52ef' +
            'f69f2445df4f9b17ad2b417be66c3710',
        tag: '51f0bebf7e3b9d92fc49741779363cfe',
    },
];

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmCmac — module metadata', () => {
    test('name', () => {
        expect(wasmCmac.name).toBe('wasmCmac');
    });

    test('type', () => {
        expect(wasmCmac.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmCmac.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmCmac.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmCmac.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmCmac — API shape', () => {
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

// ── SP 800-38B / RFC 4493 KAT (real binary) ────────────────────────────────

describe('wasmCmac — RFC 4493 / SP 800-38B KAT (AES-128)', () => {
    test('Example 1 — empty message', async () => {
        const v = RFC4493[0];
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(v.msg));
        expect(tag).not.toBe(false);
        expect(tag).toBeInstanceOf(Uint8Array);
        expect(hex(tag)).toBe(v.tag);
    });

    test('Example 2 — 16-byte message (one complete block)', async () => {
        const v = RFC4493[1];
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(v.msg));
        expect(tag).not.toBe(false);
        expect(hex(tag)).toBe(v.tag);
    });

    test('Example 3 — 40-byte message (incomplete final block)', async () => {
        const v = RFC4493[2];
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(v.msg));
        expect(tag).not.toBe(false);
        expect(hex(tag)).toBe(v.tag);
    });

    test('Example 4 — 64-byte message (four complete blocks)', async () => {
        const v = RFC4493[3];
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(v.msg));
        expect(tag).not.toBe(false);
        expect(hex(tag)).toBe(v.tag);
    });

    test('is deterministic (same call yields identical tag)', async () => {
        const a = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[3].msg));
        const b = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[3].msg));
        expect(hex(a)).toBe(RFC4493[3].tag);
        expect(hex(b)).toBe(RFC4493[3].tag);
    });
});

// ── truncated tagLen ──────────────────────────────────────────────────────────

describe('wasmCmac — truncated tagLen', () => {
    test('tagLen=8 returns 8-byte prefix of the full tag', async () => {
        const full = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[1].msg));
        const trunc = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[1].msg), 8);
        expect(full).not.toBe(false);
        expect(trunc).not.toBe(false);
        expect(trunc.length).toBe(8);
        expect(hex(trunc)).toBe(RFC4493[1].tag.slice(0, 16)); // first 8 bytes = 16 hex chars
    });

    test('tagLen=1 returns 1 byte', async () => {
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[0].msg), 1);
        expect(tag).not.toBe(false);
        expect(tag.length).toBe(1);
    });

    test('tagLen=16 (explicit) returns the full tag', async () => {
        const tag = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[0].msg), 16);
        expect(tag).not.toBe(false);
        expect(hex(tag)).toBe(RFC4493[0].tag);
    });
});

// ── parity with pure-JS cmac module ──────────────────────────────────────────
//
// The pure-JS module takes a bitArray PRF; we schedule an AES-128 key and
// convert the output to compare against the WASM result.

describe('wasmCmac — parity with pure-JS cmac', () => {
    test('AES-128 RFC 4493 Example 2: WASM tag matches pure-JS mac output', async () => {
        const keyBytes = RFC4493_KEY;
        const msgBytes = fromHex(RFC4493[1].msg);

        // WASM tag (Uint8Array).
        const wasmTag = await _wasm.mac(keyBytes, msgBytes);
        expect(wasmTag).not.toBe(false);

        // Pure-JS tag via bitArray AES + cmac.mac.
        const keyBa = _ba.ui8_to_ba(keyBytes);
        const cipher = _aes.fn(Array.from(keyBa));
        const msgBa = _ba.ui8_to_ba(msgBytes);
        const pureBa = _pure.mac(cipher, Array.from(msgBa));
        expect(pureBa).not.toBe(false);
        const pureTag = _ba.ba_to_ui8(pureBa);

        expect(hex(wasmTag)).toBe(hex(pureTag));
    });

    test('AES-128 empty message: WASM tag matches pure-JS mac output', async () => {
        const keyBytes = RFC4493_KEY;
        const msgBytes = fromHex('');

        const wasmTag = await _wasm.mac(keyBytes, msgBytes);
        expect(wasmTag).not.toBe(false);

        const keyBa = _ba.ui8_to_ba(keyBytes);
        const cipher = _aes.fn(Array.from(keyBa));
        const pureBa = _pure.mac(cipher, []);
        expect(pureBa).not.toBe(false);
        const pureTag = _ba.ba_to_ui8(pureBa);

        expect(hex(wasmTag)).toBe(hex(pureTag));
    });
});

// ── verify ────────────────────────────────────────────────────────────────────

describe('wasmCmac — verify', () => {
    test('true on the correct RFC 4493 tag (Example 1, empty message)', async () => {
        const ok = await _wasm.verify(RFC4493_KEY, fromHex(''), fromHex(RFC4493[0].tag));
        expect(ok).toBe(true);
    });

    test('true on the correct RFC 4493 tag (Example 4, full 64-byte message)', async () => {
        const ok = await _wasm.verify(
            RFC4493_KEY,
            fromHex(RFC4493[3].msg),
            fromHex(RFC4493[3].tag),
        );
        expect(ok).toBe(true);
    });

    test('false on a tampered tag (one bit flipped)', async () => {
        const bad = fromHex(RFC4493[1].tag);
        bad[0] ^= 0x01;
        const ok = await _wasm.verify(RFC4493_KEY, fromHex(RFC4493[1].msg), bad);
        expect(ok).toBe(false);
    });

    test('false on a tampered message (one byte modified)', async () => {
        const msg = fromHex(RFC4493[1].msg);
        msg[0] ^= 0xff;
        const ok = await _wasm.verify(RFC4493_KEY, msg, fromHex(RFC4493[1].tag));
        expect(ok).toBe(false);
    });

    test('false on wrong truncated tag (content mismatch)', async () => {
        // Compute the correct 8-byte truncated tag, then flip a byte.
        const shortTag = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[1].msg), 8);
        expect(shortTag).not.toBe(false);
        const bad = new Uint8Array(shortTag);
        bad[0] ^= 0x01;
        const ok = await _wasm.verify(RFC4493_KEY, fromHex(RFC4493[1].msg), bad);
        expect(ok).toBe(false);
    });

    test('true with truncated tag when mac uses the same tagLen', async () => {
        const trunc = await _wasm.mac(RFC4493_KEY, fromHex(RFC4493[2].msg), 8);
        expect(trunc).not.toBe(false);
        const ok = await _wasm.verify(RFC4493_KEY, fromHex(RFC4493[2].msg), trunc);
        expect(ok).toBe(true);
    });
});

// ── invalid params → false, no throw ──────────────────────────────────────────

describe('wasmCmac — invalid params', () => {
    const KEY = RFC4493_KEY;
    const MSG = fromHex(RFC4493[1].msg);
    const TAG = fromHex(RFC4493[1].tag);

    test('non-Uint8Array key → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], MSG);
        expect(r).toBe(false);
    });

    test('key.length not in {16,24,32} → false', async () => {
        const r = await _wasm.mac(new Uint8Array(15), MSG);
        expect(r).toBe(false);
    });

    test('key.length=20 → false', async () => {
        const r = await _wasm.mac(new Uint8Array(20), MSG);
        expect(r).toBe(false);
    });

    test('non-Uint8Array message → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.mac(KEY, 'hello');
        expect(r).toBe(false);
    });

    test('tagLen=0 → false', async () => {
        const r = await _wasm.mac(KEY, MSG, 0);
        expect(r).toBe(false);
    });

    test('tagLen=17 → false', async () => {
        const r = await _wasm.mac(KEY, MSG, 17);
        expect(r).toBe(false);
    });

    test('tagLen=1.5 (non-integer) → false', async () => {
        const r = await _wasm.mac(KEY, MSG, 1.5);
        expect(r).toBe(false);
    });

    test('non-Uint8Array tag in verify → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _wasm.verify(KEY, MSG, 'bb1d');
        expect(r).toBe(false);
    });

    test('invalid key in verify → false', async () => {
        const r = await _wasm.verify(new Uint8Array(10), MSG, TAG);
        expect(r).toBe(false);
    });

    test('invalid params never throw (mac)', async () => {
        await expect(_wasm.mac(new Uint8Array(1), MSG)).resolves.toBe(false);
    });

    test('invalid params never throw (verify)', async () => {
        await expect(_wasm.verify(new Uint8Array(1), MSG, TAG)).resolves.toBe(false);
    });
});
