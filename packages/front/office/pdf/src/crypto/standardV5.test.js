// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfStandardV5 } from './standardV5.js';
import { pdfErrors } from '../errors.js';
const errors = pdfErrors.factory();
const { EncryptionError } = errors;
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { gcm } from '@awacloud/fw/crypto/mode/gcm.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { pdfAesGcm } from './aesGcm.js';

const rt = new ModuleRuntime();
rt.register(bitArray); rt.register(utf8); rt.register(aes); rt.register(sha256); rt.register(cbc); rt.register(gcm);
const aesFw = rt.resolve('aes');
const cbcFw = rt.resolve('cbc');
const shaFw = rt.resolve('sha256');
const baFw  = rt.resolve('bitArray');
const gcmFw = rt.resolve('gcm');
const gcmMod = pdfAesGcm.factory(errors, aesFw, gcmFw, baFw);

function build(d) {
    d = d || { aes: aesFw, cbc: cbcFw, sha256: shaFw, bitArray: baFw, pdfAesGcm: gcmMod };
    return pdfStandardV5.factory(errors, d.aes, d.cbc, d.sha256, d.bitArray, d.pdfAesGcm);
}

function bytesToWords(b) {
    const o = new Array(b.length >>> 2);
    for (let i = 0; i < o.length; i++) {
        o[i] = ((b[i*4]<<24)|(b[i*4+1]<<16)|(b[i*4+2]<<8)|b[i*4+3])|0;
    }
    return o;
}
function wordsToBytes(w) {
    const out = new Uint8Array(w.length * 4);
    for (let i = 0; i < w.length; i++) {
        out[i*4]   = (w[i] >>> 24) & 0xff;
        out[i*4+1] = (w[i] >>> 16) & 0xff;
        out[i*4+2] = (w[i] >>>  8) & 0xff;
        out[i*4+3] =  w[i]         & 0xff;
    }
    return out;
}

function sha256Bytes(bytes) {
    const ba = baFw.ui8_to_ba(bytes);
    const d = shaFw.hash(ba);
    return baFw.ba_to_ui8(d);
}

function aesCbcEncrypt(key, iv, pt) {
    const cipher = aesFw.fn(bytesToWords(key), true);
    const w = cbcFw.encrypt(cipher, bytesToWords(pt), bytesToWords(iv));
    return wordsToBytes(w);
}

describe('pdfStandardV5', () => {
    test('rejects missing deps', () => {
        expect(() => pdfStandardV5.factory(errors)).toThrow(EncryptionError);
        expect(() => pdfStandardV5.factory(errors, aesFw)).toThrow(EncryptionError);
    });

    test('module shape', () => {
        expect(pdfStandardV5.name).toBe('pdfStandardV5');
        expect(pdfStandardV5.dependencies).toEqual(['pdfErrors', 'aes', 'cbc', 'sha256', 'bitArray', 'pdfAesGcm']);
        expect(pdfStandardV5.factory.toString()).toContain('function');
        const m = pdfStandardV5.factory(errors, aesFw, cbcFw, shaFw, baFw);
        expect(typeof m.tryPassword).toBe('function');
        expect(typeof m.decryptString).toBe('function');
        expect(typeof m.decryptStream).toBe('function');
    });

    test('tryPassword: accepts correct user password and derives FEK', () => {
        const pw = 'hunter2';
        const pwBytes = new TextEncoder().encode(pw);
        const valSalt = new Uint8Array([1,2,3,4,5,6,7,8]);
        const keySalt = new Uint8Array([9,10,11,12,13,14,15,16]);
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i + 1;

        const hVal = sha256Bytes(concat(pwBytes, valSalt));
        const U = new Uint8Array(48);
        U.set(hVal, 0); U.set(valSalt, 32); U.set(keySalt, 40);
        const intermediate = sha256Bytes(concat(pwBytes, keySalt));
        const UE = aesCbcEncrypt(intermediate, new Uint8Array(16), fek);

        const O = new Uint8Array(48);
        const OE = new Uint8Array(32);
        const typedEncrypt = { V:5, R:5, O, U, OE, UE };

        const v5 = build();
        const r = v5.tryPassword(typedEncrypt, pw, false);
        expect(r.fileEncryptionKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(r.fileEncryptionKey)).toEqual(Array.from(fek));
    });

    test('tryPassword: rejects wrong password', () => {
        const v5 = build();
        const r = v5.tryPassword(
            { O: new Uint8Array(48), U: new Uint8Array(48), OE: new Uint8Array(32), UE: new Uint8Array(32) },
            'wrong', false
        );
        expect(r.fileEncryptionKey).toBe(null);
    });

    test('decryptString roundtrip with PKCS#7 padding', () => {
        const v5 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i + 1;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x40 + i;
        const msg = new TextEncoder().encode('hello PDF');
        const pad = 16 - (msg.length % 16);
        const padded = new Uint8Array(msg.length + pad);
        padded.set(msg); for (let i = msg.length; i < padded.length; i++) padded[i] = pad;
        const ct = aesCbcEncrypt(fek, iv, padded);
        const framed = new Uint8Array(16 + ct.length);
        framed.set(iv); framed.set(ct, 16);
        const out = v5.decryptString({}, fek, 1, 0, framed);
        expect(Array.from(out)).toEqual(Array.from(msg));
    });

    test('decryptString rejects too-short input', () => {
        const v5 = build();
        expect(() => v5.decryptString({}, new Uint8Array(32), 0, 0, new Uint8Array(10)))
            .toThrow(EncryptionError);
    });

    test('tryPassword: rejects malformed O/U length', () => {
        const v5 = build();
        expect(() => v5.tryPassword({ O: new Uint8Array(10), U: new Uint8Array(48) }, '', false))
            .toThrow(EncryptionError);
    });
});

function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
}

describe('pdfStandardV5 — AESV4 (AES-GCM) roundtrip', () => {
    test('encryptStream → decryptStream byte-identical with method=AESV4', () => {
        const v5 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = (i * 13 + 5) & 0xff;
        const iv = new Uint8Array(12);
        for (let i = 0; i < 12; i++) iv[i] = 0x30 + i;
        const plain = new TextEncoder().encode('V=5 AESV4 GCM stream payload!');
        const typed = { method: 'AESV4' };
        const ct = v5.encryptStream(typed, fek, 1, 0, plain, iv);
        // Frame: 12 IV + ciphertext + 16 tag
        expect(ct.length).toBe(12 + plain.length + 16);
        const pt = v5.decryptStream(typed, fek, 1, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
    test('AESV3 still works (default method)', () => {
        const v5 = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i + 1;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x40 + i;
        const plain = new TextEncoder().encode('V=5 AESV3 CBC');
        const ct = v5.encryptStream({ method: 'AESV3' }, fek, 1, 0, plain, iv);
        const pt = v5.decryptStream({ method: 'AESV3' }, fek, 1, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
    test('AESV4 without pdfAesGcm dep throws', () => {
        const v5 = pdfStandardV5.factory(errors, aesFw, cbcFw, shaFw, baFw);
        const fek = new Uint8Array(32);
        const iv = new Uint8Array(12);
        expect(() => v5.encryptStream({ method: 'AESV4' }, fek, 1, 0, new Uint8Array(4), iv))
            .toThrow(EncryptionError);
    });
    test('AESV4 encryptStream rejects bad IV length (must be 12)', () => {
        const v5 = build();
        const fek = new Uint8Array(32);
        const badIv = new Uint8Array(16);
        expect(() => v5.encryptStream({ method: 'AESV4' }, fek, 1, 0, new Uint8Array(4), badIv))
            .toThrow(EncryptionError);
    });
});

// A key schedule / CBC pass that always fails, to exercise the typed
// error surface the module promises for a hostile fw crypto stack.
const failingAes = { fn: () => false };
const failingCbc = { encrypt: () => false, decrypt: () => false };
const withAes = (a) => build({ aes: a, cbc: cbcFw, sha256: shaFw, bitArray: baFw, pdfAesGcm: gcmMod });
const withCbc = (c) => build({ aes: aesFw, cbc: c, sha256: shaFw, bitArray: baFw, pdfAesGcm: gcmMod });
const codeOfV5 = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

/** Build a self-consistent v5 /Encrypt fixture for `pw` via the write side. */
function v5Fixture(pw) {
    const v5 = build();
    const fek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) fek[i] = (i * 7 + 3) & 0xff;
    const valSalt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const keySalt = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]);
    const { U, UE } = v5.buildUUE(pw, fek, valSalt, keySalt);
    const { O, OE } = v5.buildOOE(pw, fek, U, valSalt, keySalt);
    return { v5, fek, typedEncrypt: { V: 5, R: 5, O, U, OE, UE } };
}

describe('pdfStandardV5 — password normalisation', () => {
    test('empty, null and undefined passwords all normalise to zero bytes', () => {
        // All three must derive the SAME FEK as the empty-password fixture.
        const { v5, fek, typedEncrypt } = v5Fixture('');
        for (const pw of ['', null, undefined]) {
            const r = v5.tryPassword(typedEncrypt, pw, false);
            expect(Array.from(r.fileEncryptionKey)).toEqual(Array.from(fek));
        }
    });

    test('a Uint8Array password is accepted as-is', () => {
        const raw = new TextEncoder().encode('bytes-pw');
        const { v5, fek, typedEncrypt } = v5Fixture(raw);
        expect(Array.from(v5.tryPassword(typedEncrypt, raw, false).fileEncryptionKey))
            .toEqual(Array.from(fek));
        // The string spelling of the same bytes must agree.
        expect(Array.from(v5.tryPassword(typedEncrypt, 'bytes-pw', false).fileEncryptionKey))
            .toEqual(Array.from(fek));
    });

    test('passwords are truncated to 127 bytes (Algorithm 2.A)', () => {
        const long = new Uint8Array(200).fill(0x41);
        const { v5, typedEncrypt } = v5Fixture(long);
        // A 300-byte password with the same first 127 bytes must still open.
        const longer = new Uint8Array(300).fill(0x41);
        expect(v5.tryPassword(typedEncrypt, longer, false).fileEncryptionKey)
            .toBeInstanceOf(Uint8Array);
        expect(v5.tryPassword(typedEncrypt, 'A'.repeat(300), false).fileEncryptionKey)
            .toBeInstanceOf(Uint8Array);
    });

    test('rejects a password that is neither string nor Uint8Array', () => {
        const { v5, typedEncrypt } = v5Fixture('');
        for (const bad of [42, {}, [], true]) {
            expect(codeOfV5(() => v5.tryPassword(typedEncrypt, bad, false)))
                .toBe('pdf/crypto/v5/bad-password');
        }
    });

    test('the owner path derives the same FEK as the user path', () => {
        const { v5, fek, typedEncrypt } = v5Fixture('hunter2');
        expect(Array.from(v5.tryPassword(typedEncrypt, 'hunter2', true).fileEncryptionKey))
            .toEqual(Array.from(fek));
        expect(v5.tryPassword(typedEncrypt, 'nope', true).fileEncryptionKey).toBe(null);
    });
});

describe('pdfStandardV5 — malformed /Encrypt entries', () => {
    test('/OE and /UE must be exactly 32 bytes', () => {
        const { v5, typedEncrypt } = v5Fixture('pw');
        const e = (() => {
            try {
                v5.tryPassword({ ...typedEncrypt, UE: new Uint8Array(16) }, 'pw', false);
            } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(EncryptionError);
        expect(e.code).toBe('pdf/crypto/v5/bad-OE-UE');
        expect(e.context.length).toBe(16);
        // Owner path reads /OE, not /UE.
        expect(codeOfV5(() => v5.tryPassword({ ...typedEncrypt, OE: null }, 'pw', true)))
            .toBe('pdf/crypto/v5/bad-OE-UE');
    });

    test('a ciphertext body that is not a whole number of AES blocks is rejected', () => {
        const v5 = build();
        // 16-byte IV + 17-byte body → body % 16 !== 0.
        expect(codeOfV5(() => v5.decryptString({}, new Uint8Array(32), 1, 0, new Uint8Array(33))))
            .toBe('pdf/crypto/v5/bad-ciphertext-len');
    });
});

describe('pdfStandardV5 — encrypt-side guards', () => {
    const fek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) fek[i] = i + 1;

    test('plaintext must be a Uint8Array', () => {
        const v5 = build();
        expect(codeOfV5(() => v5.encryptString({}, fek, 1, 0, 'nope', new Uint8Array(16))))
            .toBe('pdf/crypto/v5/encrypt-bad-input');
    });

    test('AESV3 requires a 16-byte IV', () => {
        const v5 = build();
        for (const iv of [undefined, new Uint8Array(12), 'sixteen-bytes!!!']) {
            expect(codeOfV5(() => v5.encryptString({}, fek, 1, 0, new Uint8Array(4), iv)))
                .toBe('pdf/crypto/v5/encrypt-bad-iv');
        }
    });
});

describe('pdfStandardV5 — hostile fw crypto stack', () => {
    const fek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) fek[i] = i + 1;
    const iv = new Uint8Array(16);

    test('a failed AES key schedule is reported per call site', () => {
        const v5 = withAes(failingAes);
        expect(codeOfV5(() => v5.decryptString({}, fek, 1, 0, new Uint8Array(32))))
            .toBe('pdf/crypto/v5/aes-schedule-failed');
        expect(codeOfV5(() => v5.encryptString({}, fek, 1, 0, new Uint8Array(4), iv)))
            .toBe('pdf/crypto/v5/aes-encrypt-schedule');
        expect(codeOfV5(() => v5.buildPerms(-1, fek, true, () => new Uint8Array(4))))
            .toBe('pdf/crypto/v5/perms-schedule');
    });

    test('a failed CBC pass is reported in both directions', () => {
        const v5 = withCbc(failingCbc);
        expect(codeOfV5(() => v5.decryptString({}, fek, 1, 0, new Uint8Array(32))))
            .toBe('pdf/crypto/v5/cbc-decrypt-failed');
        expect(codeOfV5(() => v5.encryptString({}, fek, 1, 0, new Uint8Array(4), iv)))
            .toBe('pdf/crypto/v5/cbc-encrypt-failed');
    });

    test('buildPerms is well-formed with a healthy stack', () => {
        const v5 = build();
        const perms = v5.buildPerms(-3904, fek, true, () => new Uint8Array([1, 2, 3, 4]));
        expect(perms).toBeInstanceOf(Uint8Array);
        expect(perms.length).toBe(16);
        // /Perms is deterministic given the same random tail.
        const again = v5.buildPerms(-3904, fek, true, () => new Uint8Array([1, 2, 3, 4]));
        expect(Array.from(again)).toEqual(Array.from(perms));
        const other = v5.buildPerms(-3904, fek, false, () => new Uint8Array([1, 2, 3, 4]));
        expect(Array.from(other)).not.toEqual(Array.from(perms));
    });
});
