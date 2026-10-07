// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfStandardV6 } from './standardV6.js';
import { pdfErrors } from '../errors.js';
const errors = pdfErrors.factory();
const { EncryptionError } = errors;
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { gcm } from '@awacloud/fw/crypto/mode/gcm.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { pdfAesGcm } from './aesGcm.js';

const rt = new ModuleRuntime();
rt.register(bitArray); rt.register(utf8);
rt.register(aes); rt.register(cbc); rt.register(gcm);
rt.register(sha256); rt.register(sha512); rt.register(sha384);
const deps = {
    aes: rt.resolve('aes'),
    cbc: rt.resolve('cbc'),
    sha256: rt.resolve('sha256'),
    sha384: rt.resolve('sha384'),
    sha512: rt.resolve('sha512'),
    bitArray: rt.resolve('bitArray'),
    pdfAesGcm: pdfAesGcm.factory(errors, rt.resolve('aes'), rt.resolve('gcm'), rt.resolve('bitArray'))
};

function build(d) {
    d = d || deps;
    return pdfStandardV6.factory(errors, d.aes, d.cbc, d.sha256, d.sha384, d.sha512, d.bitArray, d.pdfAesGcm);
}

describe('pdfStandardV6', () => {
    test('rejects missing deps', () => {
        expect(() => pdfStandardV6.factory(errors)).toThrow(EncryptionError);
        expect(() => pdfStandardV6.factory(errors, {})).toThrow(EncryptionError);
    });

    test('module shape', () => {
        expect(pdfStandardV6.name).toBe('pdfStandardV6');
        expect(pdfStandardV6.dependencies).toEqual(['pdfErrors', 'aes', 'cbc', 'sha256', 'sha384', 'sha512', 'bitArray', 'pdfAesGcm']);
        expect(pdfStandardV6.factory.toString()).toContain('function');
        const m = pdfStandardV6.factory(errors, deps.aes, deps.cbc, deps.sha256, deps.sha384, deps.sha512, deps.bitArray);
        expect(typeof m.tryPassword).toBe('function');
        expect(typeof m.decryptString).toBe('function');
        expect(typeof m.decryptStream).toBe('function');
    });

    test('tryPassword: wrong password returns null FEK', () => {
        const v6 = build();
        const O = new Uint8Array(48);
        const U = new Uint8Array(48);
        for (let i = 0; i < 48; i++) { O[i] = (i * 7) & 0xff; U[i] = (i * 13) & 0xff; }
        const r = v6.tryPassword(
            { O, U, OE: new Uint8Array(32), UE: new Uint8Array(32) },
            'x', false
        );
        expect(r.fileEncryptionKey).toBe(null);
    }, 30000);

    test('tryPassword: rejects bad O/U length', () => {
        const v6 = build();
        expect(() => v6.tryPassword({ O: new Uint8Array(10), U: new Uint8Array(48) }, '', false))
            .toThrow(EncryptionError);
    });

    test('decryptString rejects too-short ciphertext', () => {
        const v6 = build();
        expect(() => v6.decryptString({}, new Uint8Array(32), 0, 0, new Uint8Array(5)))
            .toThrow(EncryptionError);
    });

    test('decryptString roundtrip via CBC', () => {
        const v6 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i + 1;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = i * 3;
        const msg = new TextEncoder().encode('PDF 2.0 GCM-free');
        const pad = 16 - (msg.length % 16);
        const padded = new Uint8Array(msg.length + pad);
        padded.set(msg); for (let i = msg.length; i < padded.length; i++) padded[i] = pad;
        const cipher = deps.aes.fn(toW(fek), true);
        const ctW = deps.cbc.encrypt(cipher, toW(padded), toW(iv));
        const ct = fromW(ctW);
        const framed = new Uint8Array(16 + ct.length);
        framed.set(iv); framed.set(ct, 16);
        const out = v6.decryptString({}, fek, 0, 0, framed);
        expect(Array.from(out)).toEqual(Array.from(msg));
    });
});

describe('pdfStandardV6 — AESV4 (AES-GCM) roundtrip', () => {
    test('encryptStream → decryptStream byte-identical with method=AESV4', () => {
        const v6 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = (i * 7 + 1) & 0xff;
        const iv = new Uint8Array(12);
        for (let i = 0; i < 12; i++) iv[i] = 0x50 + i;
        const plain = new TextEncoder().encode('V=5 R=6 AESV4 GCM payload');
        const typed = { method: 'AESV4' };
        const ct = v6.encryptStream(typed, fek, 2, 0, plain, iv);
        expect(ct.length).toBe(12 + plain.length + 16);
        const pt = v6.decryptStream(typed, fek, 2, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
    test('AESV3 still works (default)', () => {
        const v6 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i + 2;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x60 + i;
        const plain = new TextEncoder().encode('V=5 R=6 AESV3 CBC');
        const ct = v6.encryptStream({ method: 'AESV3' }, fek, 2, 0, plain, iv);
        const pt = v6.decryptStream({ method: 'AESV3' }, fek, 2, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
    test('AESV4 without pdfAesGcm dep throws', () => {
        const v6 = pdfStandardV6.factory(errors, deps.aes, deps.cbc,
            deps.sha256, deps.sha384, deps.sha512, deps.bitArray);
        const fek = new Uint8Array(32);
        const iv = new Uint8Array(12);
        expect(() => v6.encryptStream({ method: 'AESV4' }, fek, 1, 0, new Uint8Array(4), iv))
            .toThrow(EncryptionError);
    });
});

function toW(b) {
    const o = new Array(b.length >>> 2);
    for (let i = 0; i < o.length; i++) {
        o[i] = ((b[i*4]<<24)|(b[i*4+1]<<16)|(b[i*4+2]<<8)|b[i*4+3])|0;
    }
    return o;
}
function fromW(w) {
    const out = new Uint8Array(w.length * 4);
    for (let i = 0; i < w.length; i++) {
        out[i*4]   = (w[i] >>> 24) & 0xff;
        out[i*4+1] = (w[i] >>> 16) & 0xff;
        out[i*4+2] = (w[i] >>>  8) & 0xff;
        out[i*4+3] =  w[i]         & 0xff;
    }
    return out;
}

// Algorithm 2.B is deliberately expensive (~0.4s per hardening pass here),
// so the round-trip fixture is built ONCE, with an empty password — the
// cheapest input that still exercises the full 64-round loop.
const codeOfV6 = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};
const withDeps = (over) => build({ ...deps, ...over });
const failingAesV6 = { fn: () => false };
const failingCbcV6 = { encrypt: () => false, decrypt: () => false };

const V6_FEK = new Uint8Array(32);
for (let i = 0; i < 32; i++) V6_FEK[i] = (i * 11 + 5) & 0xff;
const V6_VAL_SALT = new Uint8Array([2, 3, 5, 7, 11, 13, 17, 19]);
const V6_KEY_SALT = new Uint8Array([23, 29, 31, 37, 41, 43, 47, 53]);
const V6_UUE = build().buildUUE('', V6_FEK, V6_VAL_SALT, V6_KEY_SALT);
const V6_ENC = { V: 5, R: 6, O: V6_UUE.U, U: V6_UUE.U, OE: V6_UUE.UE, UE: V6_UUE.UE };

describe('pdfStandardV6 — Algorithm 2.B round-trip', () => {
    test('buildUUE frames /U as hash‖validation-salt‖key-salt', () => {
        expect(V6_UUE.U.length).toBe(48);
        expect(V6_UUE.UE.length).toBe(32);
        expect(Array.from(V6_UUE.U.subarray(32, 40))).toEqual(Array.from(V6_VAL_SALT));
        expect(Array.from(V6_UUE.U.subarray(40, 48))).toEqual(Array.from(V6_KEY_SALT));
    });

    test('the hardened user password recovers the FEK exactly', () => {
        const r = build().tryPassword(V6_ENC, '', false);
        expect(Array.from(r.fileEncryptionKey)).toEqual(Array.from(V6_FEK));
    }, 30000);

    test('a Uint8Array password is accepted and hardened like a string', () => {
        // Wrong password → null FEK, but it must reach Algorithm 2.B rather
        // than being rejected as a bad type.
        const r = build().tryPassword(V6_ENC, new Uint8Array([0x78]), false);
        expect(r.fileEncryptionKey).toBe(null);
    }, 30000);

    test('rejects a password that is neither string nor Uint8Array', () => {
        const v6 = build();
        for (const bad of [7, {}, [], false]) {
            expect(codeOfV6(() => v6.tryPassword(V6_ENC, bad, false)))
                .toBe('pdf/crypto/v6/bad-password');
        }
    });

    test('/UE must be exactly 32 bytes once the password validates', () => {
        expect(codeOfV6(() => build().tryPassword(
            { ...V6_ENC, UE: new Uint8Array(31) }, '', false)))
            .toBe('pdf/crypto/v6/bad-OE-UE');
    }, 30000);
});

describe('pdfStandardV6 — malformed ciphertext', () => {
    test('a body that is not a whole number of AES blocks is rejected', () => {
        // 16-byte IV + 17-byte body.
        expect(codeOfV6(() => build().decryptString({}, new Uint8Array(32), 1, 0, new Uint8Array(33))))
            .toBe('pdf/crypto/v6/bad-ct-len');
    });
});

describe('pdfStandardV6 — encrypt-side guards', () => {
    const fek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) fek[i] = i + 1;

    test('plaintext must be a Uint8Array', () => {
        expect(codeOfV6(() => build().encryptString({}, fek, 1, 0, 'nope', new Uint8Array(16))))
            .toBe('pdf/crypto/v6/encrypt-bad-input');
    });

    test('AESV3 requires a 16-byte IV, AESV4 a 12-byte one', () => {
        const v6 = build();
        for (const iv of [undefined, new Uint8Array(12), 'sixteen-bytes!!!']) {
            expect(codeOfV6(() => v6.encryptString({}, fek, 1, 0, new Uint8Array(4), iv)))
                .toBe('pdf/crypto/v6/encrypt-bad-iv');
        }
        for (const iv of [undefined, new Uint8Array(16)]) {
            expect(codeOfV6(() => v6.encryptString({ method: 'AESV4' }, fek, 1, 0, new Uint8Array(4), iv)))
                .toBe('pdf/crypto/v6/encrypt-bad-iv');
        }
    });
});

describe('pdfStandardV6 — hostile fw crypto stack', () => {
    const fek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) fek[i] = i + 1;

    test('a failed AES key schedule surfaces from 2.B, decrypt and /Perms', () => {
        const v6 = withDeps({ aes: failingAesV6 });
        // Algorithm 2.B runs before any password comparison, so this fails
        // on the very first round rather than returning a null FEK.
        expect(codeOfV6(() => v6.tryPassword(
            { O: new Uint8Array(48), U: new Uint8Array(48), OE: new Uint8Array(32), UE: new Uint8Array(32) },
            'pw', false))).toBe('pdf/crypto/v6/aes-schedule-failed');
        expect(codeOfV6(() => v6.decryptString({}, fek, 1, 0, new Uint8Array(32))))
            .toBe('pdf/crypto/v6/aes-decrypt-schedule');
        expect(codeOfV6(() => v6.buildPerms(-1, fek, true, () => new Uint8Array(4))))
            .toBe('pdf/crypto/v6/perms-schedule');
    });

    test('a failed CBC decrypt is reported as cbc-decrypt-failed', () => {
        expect(codeOfV6(() => withDeps({ cbc: failingCbcV6 })
            .decryptString({}, fek, 1, 0, new Uint8Array(32))))
            .toBe('pdf/crypto/v6/cbc-decrypt-failed');
    });

    test('buildPerms is deterministic given the same random tail', () => {
        const v6 = build();
        const rand = () => new Uint8Array([9, 8, 7, 6]);
        const a = v6.buildPerms(-3904, fek, true, rand);
        expect(a.length).toBe(16);
        expect(Array.from(v6.buildPerms(-3904, fek, true, rand))).toEqual(Array.from(a));
        expect(Array.from(v6.buildPerms(-3904, fek, false, rand))).not.toEqual(Array.from(a));
    });
});
