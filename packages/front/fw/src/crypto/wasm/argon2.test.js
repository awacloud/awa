// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmArgon2 } from './argon2.js';
import { wasmRuntime } from './runtime.js';
import { argon2 as pureArgon2 } from '../hash/argon2.js';
import { blake2b } from '../hash/blake2b.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// Instantiate the runtime manually and pass it into wasmArgon2.factory(rt). The
// runtime loads the DELIVERED @awacloud/fw-wasm-crypto `argon2` dist binary by name.
const _rt = wasmRuntime.factory();
const _arg = wasmArgon2.factory(_rt);

// Pure-JS Argon2id, wired with its blake2b dependency, for the parity check.
const _pure = pureArgon2.factory(blake2b.factory());

// ── RFC 9106 §5.3 Argon2id KAT (mirrors shims/argon2.kat.test.ts) ─────────────
//
// Memory 32 KiB, 3 passes, 4 lanes, 32-byte tag; pwd/salt/secret/ad as below.
const KAT_PWD = new Uint8Array(32).fill(0x01);
const KAT_SALT = new Uint8Array(16).fill(0x02);
const KAT_SECRET = new Uint8Array(8).fill(0x03);
const KAT_AD = new Uint8Array(12).fill(0x04);
const KAT_OPTS = {
    timeCost: 3,
    memoryKiB: 32,
    parallelism: 4,
    hashLen: 32,
    secret: KAT_SECRET,
    ad: KAT_AD,
};
const KAT_TAG =
    '0d640df58d78766c08c037a34a8b53c9' + 'd01ef0452d75b65eb52520e96b01e659';

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

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmArgon2 — module metadata', () => {
    test('name', () => {
        expect(wasmArgon2.name).toBe('wasmArgon2');
    });

    test('type', () => {
        expect(wasmArgon2.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency', () => {
        expect(wasmArgon2.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module', () => {
        expect(wasmArgon2.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmArgon2.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmArgon2 — API shape', () => {
    test('exposes isAvailable / hash / verify, all functions', () => {
        for (const m of ['isAvailable', 'hash', 'verify']) {
            expect(typeof _arg[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_arg.isAvailable()).toBe(_rt.isAvailable());
        expect(_arg.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 9106 §5.3 KAT (real binary) ───────────────────────────────────────────

describe('wasmArgon2 — RFC 9106 §5.3 Argon2id vector', () => {
    test('produces the documented tag byte-for-byte', async () => {
        const tag = await _arg.hash(KAT_PWD, KAT_SALT, KAT_OPTS);
        expect(tag).not.toBe(false);
        expect(tag).toBeInstanceOf(Uint8Array);
        expect(hex(tag)).toBe(KAT_TAG);
    }, 60_000);

    test('is deterministic (a second call yields the identical tag)', async () => {
        const a = await _arg.hash(KAT_PWD, KAT_SALT, KAT_OPTS);
        const b = await _arg.hash(KAT_PWD, KAT_SALT, KAT_OPTS);
        expect(hex(a)).toBe(KAT_TAG);
        expect(hex(b)).toBe(KAT_TAG);
    }, 60_000);
});

// ── parity with the pure-JS argon2 module ─────────────────────────────────────

describe('wasmArgon2 — parity with pure-JS argon2', () => {
    test('same params/input → same digest as crypto/hash/argon2', async () => {
        // No secret / ad: keeps the pure-JS path in its common configuration.
        const opts = { timeCost: 3, memoryKiB: 32, parallelism: 4, hashLen: 32 };
        const wasmTag = await _arg.hash(KAT_PWD, KAT_SALT, opts);
        expect(wasmTag).not.toBe(false);

        const pureTag = _pure.hash({
            password: KAT_PWD,
            salt: KAT_SALT,
            time: opts.timeCost,
            memory: opts.memoryKiB,
            parallelism: opts.parallelism,
            tagLen: opts.hashLen,
        });
        expect(pureTag).not.toBe(false);

        expect(hex(wasmTag)).toBe(hex(pureTag));
    }, 60_000);
});

// ── verify ────────────────────────────────────────────────────────────────────

describe('wasmArgon2 — verify', () => {
    test('true on a matching tag', async () => {
        const ok = await _arg.verify(KAT_PWD, KAT_SALT, fromHex(KAT_TAG), KAT_OPTS);
        expect(ok).toBe(true);
    }, 60_000);

    test('false on a tampered expected digest', async () => {
        const bad = fromHex(KAT_TAG);
        bad[0] ^= 0xff;
        const ok = await _arg.verify(KAT_PWD, KAT_SALT, bad, KAT_OPTS);
        expect(ok).toBe(false);
    }, 60_000);

    test('false on a tampered password', async () => {
        const pwd = new Uint8Array(KAT_PWD);
        pwd[0] ^= 0xff;
        const ok = await _arg.verify(pwd, KAT_SALT, fromHex(KAT_TAG), KAT_OPTS);
        expect(ok).toBe(false);
    }, 60_000);

    test('false when expected length differs (constant-time guard)', async () => {
        const short = fromHex(KAT_TAG).subarray(0, 16);
        const ok = await _arg.verify(KAT_PWD, KAT_SALT, short, KAT_OPTS);
        expect(ok).toBe(false);
    }, 60_000);
});

// ── invalid params → false, no throw ──────────────────────────────────────────

describe('wasmArgon2 — invalid params', () => {
    const base = { timeCost: 3, memoryKiB: 32, parallelism: 4, hashLen: 32 };

    test('timeCost < 1 → false', async () => {
        const r = await _arg.hash(KAT_PWD, KAT_SALT, { ...base, timeCost: 0 });
        expect(r).toBe(false);
    });

    test('parallelism < 1 → false', async () => {
        const r = await _arg.hash(KAT_PWD, KAT_SALT, { ...base, parallelism: 0 });
        expect(r).toBe(false);
    });

    test('memoryKiB below 8·parallelism → false', async () => {
        const r = await _arg.hash(KAT_PWD, KAT_SALT, { ...base, memoryKiB: 8, parallelism: 4 });
        expect(r).toBe(false);
    });

    test('hashLen < 4 → false', async () => {
        const r = await _arg.hash(KAT_PWD, KAT_SALT, { ...base, hashLen: 3 });
        expect(r).toBe(false);
    });

    test('non-Uint8Array password → false', async () => {
        // @ts-expect-error intentional misuse
        const r = await _arg.hash([1, 2, 3], KAT_SALT, base);
        expect(r).toBe(false);
    });

    test('verify on invalid params → false', async () => {
        const r = await _arg.verify(KAT_PWD, KAT_SALT, fromHex(KAT_TAG), { ...base, timeCost: 0 });
        expect(r).toBe(false);
    });

    test('invalid params never throw', async () => {
        await expect(
            _arg.hash(KAT_PWD, KAT_SALT, { ...base, hashLen: 0 }),
        ).resolves.toBe(false);
    });
});
