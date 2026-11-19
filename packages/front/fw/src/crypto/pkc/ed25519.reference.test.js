// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the loop-form reference (`ed25519.reference.js`) and the
// fast module (`ed25519.js`) give the same bytes and the same verdicts on
// every input drawn here. Every random input is drawn ONCE, before the two
// compared calls, from one xorshift32 stream with a literal seed.

import { describe, test, expect, spyOn } from 'bun:test';
import { ed25519 } from './ed25519.js';
import { createEd25519Reference } from './ed25519.reference.js';
import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';

const ba = bitArray.factory();
const fast = ed25519.factory(sha512.factory(ba), ba);
const ref = createEd25519Reference(sha512.factory(ba), ba);

let x = 0x35A00006;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };
const hex = (u) => Buffer.from(u).toString('hex');
const enc = (v) => (v instanceof Uint8Array ? hex(v) : String(v));
const flipBit = (sig) => { const i = rnd() % (sig.length * 8); const b = sig.slice(); b[i >> 3] ^= 1 << (i & 7); return b; };

const SLOW = 300_000;

describe('ed25519 reference: RFC 8032 §7.1 TEST 1', () => {
    test('the reference derives the RFC public key and signature of the empty message', () => {
        const seed = Uint8Array.from(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'));
        const kp = ref.keyPair(seed);
        expect(hex(kp.publicKey)).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
        expect(hex(ref.sign(kp.privateKey, new Uint8Array(0)))).toBe(
            'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155'
            + '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');
    });
});

describe('ed25519 reference vs fast', () => {
    test('keyPair: public and private keys equal on 200 random seeds', () => {
        const seeds = Array.from({ length: 200 }, () => bytes(32));
        const diffs = [];
        for (let i = 0; i < seeds.length; i++) {
            const a = ref.keyPair(seeds[i]), b = fast.keyPair(seeds[i]);
            if (hex(a.publicKey) !== hex(b.publicKey) || hex(a.privateKey) !== hex(b.privateKey)) diffs.push(i);
        }
        expect(diffs).toEqual([]);
    }, SLOW);

    test('sign: signatures equal on 200 random (seed, message of 0..300 bytes)', () => {
        const cases = Array.from({ length: 200 }, () => ({ seed: bytes(32), msg: bytes(rnd() % 301) }));
        for (const c of cases) c.sk = fast.keyPair(c.seed).privateKey;
        const diffs = [];
        for (let i = 0; i < cases.length; i++) {
            const { sk, msg } = cases[i];
            if (enc(ref.sign(sk, msg)) !== enc(fast.sign(sk, msg))) diffs.push(i);
        }
        expect(diffs).toEqual([]);
    }, SLOW);

    test('verify: verdicts equal on 100 cases x (valid, one bit flipped, 64 random bytes)', () => {
        const cases = Array.from({ length: 100 }, () => {
            const seed = bytes(32), msg = bytes(rnd() % 301);
            const kp = fast.keyPair(seed);
            const good = fast.sign(kp.privateKey, msg);
            return { pk: kp.publicKey, msg, sigs: [good, flipBit(good), bytes(64)] };
        });
        const diffs = [];
        let valid = 0;
        for (let i = 0; i < cases.length; i++) {
            const { pk, msg, sigs } = cases[i];
            for (let s = 0; s < sigs.length; s++) {
                const a = ref.verify(pk, sigs[s], msg), b = fast.verify(pk, sigs[s], msg);
                if (a !== b) diffs.push(`${i}/${s}`);
                if (a === true) valid++;
            }
        }
        expect(diffs).toEqual([]);
        expect(valid).toBe(100);   // the valid ones verify, the tampered and random ones do not
    }, SLOW);

    test('signPh / verifyPh: signatures and verdicts equal on 50 cases (context of 0..32 bytes)', () => {
        const cases = Array.from({ length: 50 }, () => ({ seed: bytes(32), msg: bytes(rnd() % 301), ctx: bytes(rnd() % 33), flip: rnd() }));
        for (const c of cases) c.kp = fast.keyPair(c.seed);
        const diffs = [];
        for (let i = 0; i < cases.length; i++) {
            const { kp, msg, ctx } = cases[i];
            const a = ref.signPh(kp.privateKey, msg, ctx), b = fast.signPh(kp.privateKey, msg, ctx);
            if (enc(a) !== enc(b)) diffs.push(`${i}/sign`);
            const bad = b.slice(); bad[cases[i].flip % 64] ^= 1 << (cases[i].flip % 8);
            for (const sig of [b, bad]) {
                if (ref.verifyPh(kp.publicKey, sig, msg, ctx) !== fast.verifyPh(kp.publicKey, sig, msg, ctx)) diffs.push(`${i}/verify`);
            }
        }
        expect(diffs).toEqual([]);
    }, SLOW);

    test('signCtx / verifyCtx: signatures and verdicts equal on 50 cases (context of 1..32 bytes)', () => {
        const cases = Array.from({ length: 50 }, () => ({ seed: bytes(32), msg: bytes(rnd() % 301), ctx: bytes(1 + (rnd() % 32)), flip: rnd() }));
        for (const c of cases) c.kp = fast.keyPair(c.seed);
        const diffs = [];
        for (let i = 0; i < cases.length; i++) {
            const { kp, msg, ctx } = cases[i];
            const a = ref.signCtx(kp.privateKey, msg, ctx), b = fast.signCtx(kp.privateKey, msg, ctx);
            if (enc(a) !== enc(b)) diffs.push(`${i}/sign`);
            const bad = b.slice(); bad[cases[i].flip % 64] ^= 1 << (cases[i].flip % 8);
            for (const sig of [b, bad]) {
                if (ref.verifyCtx(kp.publicKey, sig, msg, ctx) !== fast.verifyCtx(kp.publicKey, sig, msg, ctx)) diffs.push(`${i}/verify`);
            }
        }
        expect(diffs).toEqual([]);
    }, SLOW);
});

describe('ed25519 reference: error parity', () => {
    test('31-byte seed, 63-byte private key, 31-byte public key, 63-byte signature: false on both, same warnings', () => {
        const seed31 = bytes(31), sk63 = bytes(63), pk31 = bytes(31), sig63 = bytes(63), msg = bytes(16);
        const kp = fast.keyPair(bytes(32));
        const sig = fast.sign(kp.privateKey, msg);
        const calls = [
            (api) => api.keyPair(seed31),
            (api) => api.sign(sk63, msg),
            (api) => api.verify(pk31, sig, msg),
            (api) => api.verify(kp.publicKey, sig63, msg),
        ];
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            for (const call of calls) {
                warn.mockClear();
                const a = call(ref);
                const refWarns = warn.mock.calls.map((c) => c.join(' '));
                warn.mockClear();
                const b = call(fast);
                const fastWarns = warn.mock.calls.map((c) => c.join(' '));
                expect(a).toBe(false);
                expect(b).toBe(false);
                expect(refWarns).toEqual(fastWarns);
            }
        } finally {
            warn.mockRestore();
        }
    });
});
