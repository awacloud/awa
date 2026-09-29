// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmAes } from './aes.js';
import { wasmRuntime } from './runtime.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// Instantiate the runtime manually and pass it into wasmAes.factory(rt). The
// runtime loads the DELIVERED @awacloud/fw-wasm-crypto `aes` dist binary by name
// (scalar variant — the `aes` target is simd:false).
const _rt = wasmRuntime.factory();
const _wasm = wasmAes.factory(_rt);

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

function eq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmAes — module metadata', () => {
    test('name', () => {
        expect(wasmAes.name).toBe('wasmAes');
    });
    test('type', () => {
        expect(wasmAes.type).toBe('fw.crypto.wasm');
    });
    test('declares only wasmRuntime as dependency', () => {
        expect(wasmAes.dependencies).toEqual(['wasmRuntime']);
    });
    test('deps wires the wasmRuntime module', () => {
        expect(wasmAes.deps).toEqual([wasmRuntime]);
    });
    test('factory is a function', () => {
        expect(typeof wasmAes.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmAes — API shape', () => {
    test('exposes the full surface, all functions', () => {
        for (const m of [
            'isAvailable', 'encryptGcm', 'decryptGcm',
            'encryptCbc', 'decryptCbc', 'encryptCtr', 'decryptCtr',
        ]) {
            expect(typeof _wasm[m]).toBe('function');
        }
    });
    test('isAvailable mirrors the runtime', () => {
        expect(_wasm.isAvailable()).toBe(_rt.isAvailable());
        expect(_wasm.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── AES-GCM known-answer vectors (NIST GCM spec, 96-bit IV, 128-bit tag) ──────
//
// Canonical published "gcmEncryptExtIV" cases (McGrew/Viega GCM spec, Appendix
// B / NIST CAVP GCMVS). Output = ciphertext ‖ tag(16).

const GCM_KAT = [
    {
        name: 'Test Case 1 (AES-128, empty pt, empty aad)',
        key: '00000000000000000000000000000000',
        iv: '000000000000000000000000',
        pt: '',
        aad: '',
        ct: '',
        tag: '58e2fccefa7e3061367f1d57a4e7455a',
    },
    {
        name: 'Test Case 2 (AES-128, one block, empty aad)',
        key: '00000000000000000000000000000000',
        iv: '000000000000000000000000',
        pt: '00000000000000000000000000000000',
        aad: '',
        ct: '0388dace60b6a392f328c2b971b2fe78',
        tag: 'ab6e47d42cec13bdf53a67b21257bddf',
    },
    {
        name: 'Test Case 3 (AES-128, 4 blocks, empty aad)',
        key: 'feffe9928665731c6d6a8f9467308308',
        iv: 'cafebabefacedbaddecaf888',
        pt:
            'd9313225f88406e5a55909c5aff5269a' +
            '86a7a9531534f7da2e4c303d8a318a72' +
            '1c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b391aafd255',
        aad: '',
        ct:
            '42831ec2217774244b7221b784d0d49c' +
            'e3aa212f2c02a4e035c17e2329aca12e' +
            '21d514b25466931c7d8f6a5aac84aa05' +
            '1ba30b396a0aac973d58e091473f5985',
        tag: '4d5c2af327cd64a62cf35abd2ba6fab4',
    },
    {
        name: 'Test Case 4 (AES-128, with aad, 60-byte pt)',
        key: 'feffe9928665731c6d6a8f9467308308',
        iv: 'cafebabefacedbaddecaf888',
        pt:
            'd9313225f88406e5a55909c5aff5269a' +
            '86a7a9531534f7da2e4c303d8a318a72' +
            '1c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39',
        aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
        ct:
            '42831ec2217774244b7221b784d0d49c' +
            'e3aa212f2c02a4e035c17e2329aca12e' +
            '21d514b25466931c7d8f6a5aac84aa05' +
            '1ba30b396a0aac973d58e091',
        tag: '5bc94fbc3221a5db94fae95ae7121a47',
    },
    {
        name: 'Test Case 7 (AES-192, empty pt, empty aad)',
        key: '000000000000000000000000000000000000000000000000',
        iv: '000000000000000000000000',
        pt: '',
        aad: '',
        ct: '',
        tag: 'cd33b28ac773f74ba00ed1f312572435',
    },
    {
        name: 'Test Case 13 (AES-256, empty pt, empty aad)',
        key: '0000000000000000000000000000000000000000000000000000000000000000',
        iv: '000000000000000000000000',
        pt: '',
        aad: '',
        ct: '',
        tag: '530f8afbc74536b9a963b4f1c4cb738b',
    },
    {
        name: 'Test Case 15 (AES-256, 4 blocks, empty aad)',
        key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
        iv: 'cafebabefacedbaddecaf888',
        pt:
            'd9313225f88406e5a55909c5aff5269a' +
            '86a7a9531534f7da2e4c303d8a318a72' +
            '1c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b391aafd255',
        aad: '',
        ct:
            '522dc1f099567d07f47f37a32a84427d' +
            '643a8cdcbfe5c0c97598a2bd2555d1aa' +
            '8cb08e48590dbb3da7b08b1056828838' +
            'c5f61e6393ba7a0abcc9f662898015ad',
        tag: 'b094dac5d93471bdec1a502270e3cc6c',
    },
];

describe('wasmAes — AES-GCM KAT (SP 800-38D, 96-bit IV)', () => {
    for (const v of GCM_KAT) {
        test(`encrypt: ${v.name}`, async () => {
            const sealed = await _wasm.encryptGcm(
                fromHex(v.key), fromHex(v.iv), fromHex(v.pt), fromHex(v.aad),
            );
            expect(sealed).not.toBe(false);
            expect(sealed).toBeInstanceOf(Uint8Array);
            expect(hex(sealed)).toBe(v.ct + v.tag);
        });

        test(`decrypt accepts: ${v.name}`, async () => {
            const pt = await _wasm.decryptGcm(
                fromHex(v.key), fromHex(v.iv), fromHex(v.ct + v.tag), fromHex(v.aad),
            );
            expect(pt).not.toBe(false);
            expect(hex(pt)).toBe(v.pt);
        });
    }

    test('round-trip with payload + AAD (AES-256)', async () => {
        const key = new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff);
        const iv = new Uint8Array(12).map((_, i) => (i * 3 + 5) & 0xff);
        const pt = new Uint8Array(40).map((_, i) => (i * 11 + 2) & 0xff);
        const aad = new Uint8Array(13).map((_, i) => (i * 5 + 9) & 0xff);
        const sealed = await _wasm.encryptGcm(key, iv, pt, aad);
        expect(sealed).not.toBe(false);
        expect(sealed.length).toBe(pt.length + 16);
        const back = await _wasm.decryptGcm(key, iv, sealed, aad);
        expect(back).not.toBe(false);
        expect(eq(back, pt)).toBe(true);
    });

    test('auth failure on tampered tag → false', async () => {
        const v = GCM_KAT[2];
        const ctTag = fromHex(v.ct + v.tag);
        ctTag[ctTag.length - 1] ^= 0xff;
        const pt = await _wasm.decryptGcm(fromHex(v.key), fromHex(v.iv), ctTag, fromHex(v.aad));
        expect(pt).toBe(false);
    });

    test('auth failure on tampered ciphertext → false', async () => {
        const v = GCM_KAT[2];
        const ctTag = fromHex(v.ct + v.tag);
        ctTag[0] ^= 0x01;
        const pt = await _wasm.decryptGcm(fromHex(v.key), fromHex(v.iv), ctTag, fromHex(v.aad));
        expect(pt).toBe(false);
    });

    test('auth failure on wrong AAD → false', async () => {
        const v = GCM_KAT[3];
        const pt = await _wasm.decryptGcm(
            fromHex(v.key), fromHex(v.iv), fromHex(v.ct + v.tag),
            fromHex('00000000000000000000000000000000000000ff'),
        );
        expect(pt).toBe(false);
    });
});

// ── AES-CBC known-answer (NIST SP 800-38A §F.2) ───────────────────────────────
//
// §F.2.1 CBC-AES128.Encrypt — the canonical fixed anchor. Note: SP 800-38A
// uses unpadded block-aligned data; our wrapper adds PKCS#7, so the raw KAT is
// verified by re-deriving via the pure block boundary: we check that the first
// 4 ciphertext blocks of encrypting the 4-block plaintext (with a trailing
// full PKCS#7 pad block) match the published vector.

const CBC_F21 = {
    key: '2b7e151628aed2a6abf7158809cf4f3c',
    iv: '000102030405060708090a0b0c0d0e0f',
    pt:
        '6bc1bee22e409f96e93d7e117393172a' +
        'ae2d8a571e03ac9c9eb76fac45af8e51' +
        '30c81c46a35ce411e5fbc1191a0a52ef' +
        'f69f2445df4f9b17ad2b417be66c3710',
    ct:
        '7649abac8119b246cee98e9b12e9197d' +
        '5086cb9b507219ee95db113a917678b2' +
        '73bed6b8e3c1743b7116e69e22229516' +
        '3ff1caa1681fac09120eca307586e1a7',
};

describe('wasmAes — AES-CBC KAT (SP 800-38A §F.2.1) + PKCS#7', () => {
    test('encrypt: published ciphertext is the prefix (block-aligned input + pad block)', async () => {
        const out = await _wasm.encryptCbc(fromHex(CBC_F21.key), fromHex(CBC_F21.iv), fromHex(CBC_F21.pt));
        expect(out).not.toBe(false);
        // 64-byte input is block-aligned → PKCS#7 appends a full 16-byte pad
        // block, so output is 80 bytes; the first 64 are the published KAT.
        expect(out.length).toBe(80);
        expect(hex(out.subarray(0, 64))).toBe(CBC_F21.ct);
    });

    test('decrypt strips PKCS#7 and recovers the plaintext', async () => {
        const out = await _wasm.encryptCbc(fromHex(CBC_F21.key), fromHex(CBC_F21.iv), fromHex(CBC_F21.pt));
        const back = await _wasm.decryptCbc(fromHex(CBC_F21.key), fromHex(CBC_F21.iv), out);
        expect(back).not.toBe(false);
        expect(hex(back)).toBe(CBC_F21.pt);
    });

    test('round-trips non-block-aligned plaintext for 128/192/256', async () => {
        for (const keyLen of [16, 24, 32]) {
            const key = new Uint8Array(keyLen).map((_, i) => (i * 7 + 1) & 0xff);
            const iv = new Uint8Array(16).map((_, i) => (i * 3 + 5) & 0xff);
            const pt = new Uint8Array(37).map((_, i) => (i * 11 + 2) & 0xff); // not a block multiple
            const ct = await _wasm.encryptCbc(key, iv, pt);
            expect(ct).not.toBe(false);
            expect(ct.length % 16).toBe(0);
            const back = await _wasm.decryptCbc(key, iv, ct);
            expect(back).not.toBe(false);
            expect(eq(back, pt)).toBe(true);
        }
    });

    test('round-trips empty plaintext (one full pad block)', async () => {
        const key = fromHex(CBC_F21.key);
        const iv = fromHex(CBC_F21.iv);
        const ct = await _wasm.encryptCbc(key, iv, new Uint8Array(0));
        expect(ct).not.toBe(false);
        expect(ct.length).toBe(16);
        const back = await _wasm.decryptCbc(key, iv, ct);
        expect(back).not.toBe(false);
        expect(back.length).toBe(0);
    });

    test('invalid PKCS#7 padding → false (tampered last block)', async () => {
        const key = fromHex(CBC_F21.key);
        const iv = fromHex(CBC_F21.iv);
        const ct = await _wasm.encryptCbc(key, iv, fromHex('00112233'));
        const bad = new Uint8Array(ct);
        bad[bad.length - 1] ^= 0xff; // corrupt the encrypted pad → strip fails
        const back = await _wasm.decryptCbc(key, iv, bad);
        expect(back).toBe(false);
    });
});

// ── AES-CTR known-answer (WebCrypto reference, J0-style 12-byte nonce) ─────────
//
// The frozen ABI's aes_ctr reads a 12-byte nonce; the 16-byte counter block is
// nonce(12)||be32(0) with length:32 — exactly the WebCrypto AES-CTR config the
// package KAT uses. We cross-check against crypto.subtle for 128/192/256.

async function ctrRef(key, nonce12, data) {
    const counter = new Uint8Array(16);
    counter.set(nonce12, 0); // low 4 bytes = 0 → block counter starts at 0
    const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CTR' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter, length: 32 }, k, data,
    );
    return new Uint8Array(ct);
}

describe('wasmAes — AES-CTR KAT (WebCrypto reference, J0-style counter)', () => {
    test('matches WebCrypto AES-CTR for 128/192/256', async () => {
        for (const keyLen of [16, 24, 32]) {
            const key = new Uint8Array(keyLen).map((_, i) => (i * 13 + 3) & 0xff);
            const nonce = new Uint8Array(12).map((_, i) => (i * 17 + 4) & 0xff);
            const data = new Uint8Array(48).map((_, i) => (i * 19 + 6) & 0xff);
            const expectCt = await ctrRef(key, nonce, data);
            const ct = await _wasm.encryptCtr(key, nonce, data);
            expect(ct).not.toBe(false);
            expect(hex(ct)).toBe(hex(expectCt));
        }
    });

    test('decryptCtr is the inverse of encryptCtr (128/192/256)', async () => {
        for (const keyLen of [16, 24, 32]) {
            const key = new Uint8Array(keyLen).map((_, i) => (i * 5 + 7) & 0xff);
            const nonce = new Uint8Array(12).map((_, i) => (i * 9 + 1) & 0xff);
            const data = new Uint8Array(40).map((_, i) => (i * 3 + 2) & 0xff);
            const ct = await _wasm.encryptCtr(key, nonce, data);
            expect(ct).not.toBe(false);
            const back = await _wasm.decryptCtr(key, nonce, ct);
            expect(back).not.toBe(false);
            expect(eq(back, data)).toBe(true);
        }
    });

    test('round-trips empty data', async () => {
        const key = new Uint8Array(16).fill(1);
        const nonce = new Uint8Array(12).fill(2);
        const ct = await _wasm.encryptCtr(key, nonce, new Uint8Array(0));
        expect(ct).not.toBe(false);
        expect(ct.length).toBe(0);
    });
});

// ── parity with pure-JS modes (WebCrypto cross-check for GCM/CBC) ──────────────
//
// The pure-JS mode/* modules operate on bitArrays + a PRF; WebCrypto provides
// an independent, byte-level oracle for GCM and CBC parity here (the AES-CTR
// parity is already against WebCrypto above).

describe('wasmAes — parity with an independent AES oracle (WebCrypto)', () => {
    test('GCM ciphertext+tag matches WebCrypto AES-GCM', async () => {
        const key = new Uint8Array(32).map((_, i) => (i + 1) & 0xff);
        const iv = new Uint8Array(12).map((_, i) => (i * 2 + 1) & 0xff);
        const pt = new Uint8Array(35).map((_, i) => (i * 3 + 4) & 0xff);
        const aad = new Uint8Array(7).map((_, i) => (i + 9) & 0xff);

        const sealed = await _wasm.encryptGcm(key, iv, pt, aad);
        expect(sealed).not.toBe(false);

        const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
        const ref = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, k, pt,
        ));
        expect(hex(sealed)).toBe(hex(ref)); // WebCrypto also appends the 16-byte tag
    });

    test('CBC ciphertext matches WebCrypto AES-CBC (PKCS#7)', async () => {
        const key = new Uint8Array(16).map((_, i) => (i * 5 + 1) & 0xff);
        const iv = new Uint8Array(16).map((_, i) => (i * 7 + 2) & 0xff);
        const pt = new Uint8Array(20).map((_, i) => (i * 11 + 3) & 0xff);

        const ct = await _wasm.encryptCbc(key, iv, pt);
        expect(ct).not.toBe(false);

        const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
        const ref = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, pt));
        // WebCrypto AES-CBC also uses PKCS#7 → identical ciphertext.
        expect(hex(ct)).toBe(hex(ref));
    });
});

// ── invalid params → false, no throw ──────────────────────────────────────────

describe('wasmAes — invalid params (no throw, resolve false)', () => {
    const KEY = new Uint8Array(16).fill(7);
    const IV12 = new Uint8Array(12).fill(3);
    const IV16 = new Uint8Array(16).fill(3);
    const DATA = new Uint8Array(16).fill(9);

    test('GCM: bad key length → false', async () => {
        expect(await _wasm.encryptGcm(new Uint8Array(15), IV12, DATA)).toBe(false);
    });
    test('GCM: non-Uint8Array key → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.encryptGcm([1, 2, 3], IV12, DATA)).toBe(false);
    });
    test('GCM: bad iv length → false', async () => {
        expect(await _wasm.encryptGcm(KEY, IV16, DATA)).toBe(false);
    });
    test('GCM: non-Uint8Array plaintext → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.encryptGcm(KEY, IV12, 'hello')).toBe(false);
    });
    test('GCM: decrypt with too-short ctWithTag → false', async () => {
        expect(await _wasm.decryptGcm(KEY, IV12, new Uint8Array(8))).toBe(false);
    });

    test('CBC: bad iv length → false', async () => {
        expect(await _wasm.encryptCbc(KEY, IV12, DATA)).toBe(false);
    });
    test('CBC: decrypt non-block-aligned → false', async () => {
        expect(await _wasm.decryptCbc(KEY, IV16, new Uint8Array(17))).toBe(false);
    });
    test('CBC: decrypt empty → false', async () => {
        expect(await _wasm.decryptCbc(KEY, IV16, new Uint8Array(0))).toBe(false);
    });

    test('CTR: bad nonce length → false', async () => {
        expect(await _wasm.encryptCtr(KEY, IV16, DATA)).toBe(false);
    });
    test('CTR: bad key length → false', async () => {
        expect(await _wasm.encryptCtr(new Uint8Array(20), IV12, DATA)).toBe(false);
    });
    test('CTR: non-Uint8Array data → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wasm.encryptCtr(KEY, IV12, 'nope')).toBe(false);
    });

    test('invalid params never throw (encryptGcm)', async () => {
        await expect(_wasm.encryptGcm(new Uint8Array(1), IV12, DATA)).resolves.toBe(false);
    });
    test('invalid params never throw (encryptCbc)', async () => {
        await expect(_wasm.encryptCbc(new Uint8Array(1), IV16, DATA)).resolves.toBe(false);
    });
    test('invalid params never throw (encryptCtr)', async () => {
        await expect(_wasm.encryptCtr(new Uint8Array(1), IV12, DATA)).resolves.toBe(false);
    });
});
