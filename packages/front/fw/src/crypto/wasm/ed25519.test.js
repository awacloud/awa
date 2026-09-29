// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { wasmEd25519 } from './ed25519.js';
import { wasmRuntime } from './runtime.js';

// Pure-JS ed25519 for cross-tier parity.
import { ed25519 } from '../pkc/ed25519.js';
import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

// ── manual factory wiring (fw test-format) ────────────────────────────────────
//
// The runtime loads the DELIVERED colocated `ed25519.scalar.wasm` binary by name.
// ed25519 is scalar-only (ref10, simd:false); the { variant: 'scalar' } pin in
// the wrapper is mandatory.
const _rt = wasmRuntime.factory();
const _wed = wasmEd25519.factory(_rt);

// Pure-JS ed25519 (seed || pubkey 64-byte sk) for cross-tier parity.
const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha512 = sha512.factory(_ba, _utf8);
const _pureEd = ed25519.factory(_sha512, _ba);

// ── helpers ───────────────────────────────────────────────────────────────────

function hex2bytes(h) {
    if (h.length === 0) return new Uint8Array(0);
    const o = new Uint8Array(h.length / 2);
    for (let i = 0; i < o.length; i++) {
        o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return o;
}

function bytes2hex(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) {
        s += b[i].toString(16).padStart(2, '0');
    }
    return s;
}

// ── RFC 8032 §7.1 Ed25519 test vectors ───────────────────────────────────────
//
// Transcribed verbatim from packages/front/fw-wasm-crypto/shims/ed25519.kat.test.ts
// (RFC8032_ED25519 TEST 1/2/3 + RFC8032_ED25519_LONG), themselves quoted from
// references/SPEC/RFC/rfc8032.txt §7.1.

const RFC_VECTORS = [
    {
        name: 'TEST 1 (empty message)',
        sk: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
        pk: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
        msg: '',
        sig:
            'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
            '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    },
    {
        name: 'TEST 2 (1-byte message 0x72)',
        sk: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
        pk: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
        msg: '72',
        sig:
            '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da' +
            '085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
    },
    {
        name: 'TEST 3 (2-byte message af82)',
        sk: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
        pk: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
        msg: 'af82',
        sig:
            '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac' +
            '18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a',
    },
    {
        // RFC 8032 §7.1 "TEST 1024" — 1023-byte message exercising the incremental
        // SHA-512 seam (multi-block hashing of the message).
        name: 'TEST 1024 (1023-byte multi-block message)',
        sk: 'f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5',
        pk: '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
        msg:
            '08b8b2b733424243760fe426a4b54908632110a66c2f6591eabd3345e3e4eb98' +
            'fa6e264bf09efe12ee50f8f54e9f77b1e355f6c50544e23fb1433ddf73be84d8' +
            '79de7c0046dc4996d9e773f4bc9efe5738829adb26c81b37c93a1b270b20329d' +
            '658675fc6ea534e0810a4432826bf58c941efb65d57a338bbd2e26640f89ffbc' +
            '1a858efcb8550ee3a5e1998bd177e93a7363c344fe6b199ee5d02e82d522c4fe' +
            'ba15452f80288a821a579116ec6dad2b3b310da903401aa62100ab5d1a36553e' +
            '06203b33890cc9b832f79ef80560ccb9a39ce767967ed628c6ad573cb116dbef' +
            'efd75499da96bd68a8a97b928a8bbc103b6621fcde2beca1231d206be6cd9ec7' +
            'aff6f6c94fcd7204ed3455c68c83f4a41da4af2b74ef5c53f1d8ac70bdcb7ed1' +
            '85ce81bd84359d44254d95629e9855a94a7c1958d1f8ada5d0532ed8a5aa3fb2' +
            'd17ba70eb6248e594e1a2297acbbb39d502f1a8c6eb6f1ce22b3de1a1f40cc24' +
            '554119a831a9aad6079cad88425de6bde1a9187ebb6092cf67bf2b13fd65f270' +
            '88d78b7e883c8759d2c4f5c65adb7553878ad575f9fad878e80a0c9ba63bcbcc' +
            '2732e69485bbc9c90bfbd62481d9089beccf80cfe2df16a2cf65bd92dd597b07' +
            '07e0917af48bbb75fed413d238f5555a7a569d80c3414a8d0859dc65a46128ba' +
            'b27af87a71314f318c782b23ebfe808b82b0ce26401d2e22f04d83d1255dc51a' +
            'ddd3b75a2b1ae0784504df543af8969be3ea7082ff7fc9888c144da2af58429e' +
            'c96031dbcad3dad9af0dcbaaaf268cb8fcffead94f3c7ca495e056a9b47acdb7' +
            '51fb73e666c6c655ade8297297d07ad1ba5e43f1bca32301651339e22904cc8c' +
            '42f58c30c04aafdb038dda0847dd988dcda6f3bfd15c4b4c4525004aa06eeff8' +
            'ca61783aacec57fb3d1f92b0fe2fd1a85f6724517b65e614ad6808d6f6ee34df' +
            'f7310fdc82aebfd904b01e1dc54b2927094b2db68d6f903b68401adebf5a7e08' +
            'd78ff4ef5d63653a65040cf9bfd4aca7984a74d37145986780fc0b16ac451649' +
            'de6188a7dbdf191f64b5fc5e2ab47b57f7f7276cd419c17a3ca8e1b939ae49e4' +
            '88acba6b965610b5480109c8b17b80e1b7b750dfc7598d5d5011fd2dcc5600a3' +
            '2ef5b52a1ecc820e308aa342721aac0943bf6686b64b2579376504ccc493d97e' +
            '6aed3fb0f9cd71a43dd497f01f17c0e2cb3797aa2a2f256656168e6c496afc5f' +
            'b93246f6b1116398a346f1a641f3b041e989f7914f90cc2c7fff357876e506b5' +
            '0d334ba77c225bc307ba537152f3f1610e4eafe595f6d9d90d11faa933a15ef1' +
            '369546868a7f3a45a96768d40fd9d03412c091c6315cf4fde7cb68606937380d' +
            'b2eaaa707b4c4185c32eddcdd306705e4dc1ffc872eeee475a64dfac86aba41c' +
            '0618983f8741c5ef68d3a101e8a3b8cac60c905c15fc910840b94c00a0b9d0',
        sig:
            '0aab4c900501b3e24d7cdf4663326a3a87df5e4843b2cbdb67cbf6e460fec350' +
            'aa5371b1508f9f4528ecea23c436d94b5e8fcd4f681e30a6ac00a9704a188a03',
    },
];

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmEd25519 — module metadata', () => {
    test('name', () => {
        expect(wasmEd25519.name).toBe('wasmEd25519');
    });

    test('type', () => {
        expect(wasmEd25519.type).toBe('fw.crypto.wasm');
    });

    test('declares only wasmRuntime as dependency (ERRATA-2: no ed25519Wasm)', () => {
        expect(wasmEd25519.dependencies).toEqual(['wasmRuntime']);
    });

    test('deps wires the wasmRuntime module only', () => {
        expect(wasmEd25519.deps).toEqual([wasmRuntime]);
    });

    test('factory is a function', () => {
        expect(typeof wasmEd25519.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmEd25519 — API shape', () => {
    test('exposes the prescribed surface, all functions', () => {
        for (const m of ['isAvailable', 'keygen', 'sign', 'verify']) {
            expect(typeof _wed[m]).toBe('function');
        }
    });

    test('isAvailable mirrors the runtime', () => {
        expect(_wed.isAvailable()).toBe(_rt.isAvailable());
        expect(_wed.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    });
});

// ── RFC 8032 §7.1 KAT — keygen + sign + verify + tamper rejection ────────────

describe('wasmEd25519 — RFC 8032 §7.1 known-answer tests', () => {
    for (const v of RFC_VECTORS) {
        test(`${v.name}: keygen(seed) → RFC public key`, async () => {
            const seed = hex2bytes(v.sk);
            const kp = await _wed.keygen(seed);
            expect(kp).not.toBe(false);
            expect(kp.publicKey).toBeInstanceOf(Uint8Array);
            expect(kp.publicKey.length).toBe(32);
            expect(kp.privateKey).toBeInstanceOf(Uint8Array);
            expect(kp.privateKey.length).toBe(64);
            expect(bytes2hex(kp.publicKey)).toBe(v.pk);
        });

        test(`${v.name}: sign(sk, msg) == RFC signature byte-for-byte`, async () => {
            const seed = hex2bytes(v.sk);
            const kp = await _wed.keygen(seed);
            expect(kp).not.toBe(false);
            const msg = hex2bytes(v.msg);
            const sig = await _wed.sign(kp.privateKey, msg);
            expect(sig).not.toBe(false);
            expect(sig).toBeInstanceOf(Uint8Array);
            expect(sig.length).toBe(64);
            expect(bytes2hex(sig)).toBe(v.sig);
        });

        test(`${v.name}: verify(pk, sig, msg) === true`, async () => {
            const seed = hex2bytes(v.sk);
            const pk = hex2bytes(v.pk);
            const msg = hex2bytes(v.msg);
            const sig = hex2bytes(v.sig);
            // Verify using the RFC pk directly (not re-derived).
            expect(await _wed.verify(pk, sig, msg)).toBe(true);
            // Also verify using the keygen-derived pk.
            const kp = await _wed.keygen(seed);
            expect(kp).not.toBe(false);
            const derivedSig = await _wed.sign(kp.privateKey, msg);
            expect(derivedSig).not.toBe(false);
            expect(await _wed.verify(kp.publicKey, derivedSig, msg)).toBe(true);
        });

        test(`${v.name}: one-bit-tampered signature → false`, async () => {
            const pk = hex2bytes(v.pk);
            const msg = hex2bytes(v.msg);
            const tampered = hex2bytes(v.sig);
            tampered[0] ^= 0x01;
            expect(await _wed.verify(pk, tampered, msg)).toBe(false);
        });
    }
});

// ── random keygen → sign → verify round-trip ─────────────────────────────────

describe('wasmEd25519 — random keygen round-trip', () => {
    test('keygen() → sign → verify (no seed)', async () => {
        const kp = await _wed.keygen();
        expect(kp).not.toBe(false);
        expect(kp.publicKey.length).toBe(32);
        expect(kp.privateKey.length).toBe(64);

        const msg = new TextEncoder().encode('hello wasmEd25519 random round-trip');
        const sig = await _wed.sign(kp.privateKey, msg);
        expect(sig).not.toBe(false);
        expect(sig.length).toBe(64);
        expect(await _wed.verify(kp.publicKey, sig, msg)).toBe(true);
    });

    test('tampered message → false', async () => {
        const kp = await _wed.keygen();
        expect(kp).not.toBe(false);
        const msg = new TextEncoder().encode('original');
        const badMsg = new TextEncoder().encode('originaL');
        const sig = await _wed.sign(kp.privateKey, msg);
        expect(sig).not.toBe(false);
        expect(await _wed.verify(kp.publicKey, sig, badMsg)).toBe(false);
    });
});

// ── cross-tier parity with pure-JS `pkc/ed25519` ────────────────────────────
//
// Both the WASM and pure-JS tiers use the identical 64-byte sk format
// (seed || publicKey), so full cross-tier sign/verify parity is possible.

describe('wasmEd25519 — parity with pure-JS pkc/ed25519', () => {
    test('both tiers derive the same public key from RFC TEST 1 seed', () => {
        // Pure-JS is synchronous; keygen is deterministic given the seed.
        const v = RFC_VECTORS[0]; // TEST 1
        const seed = hex2bytes(v.sk);
        const pureKp = _pureEd.keyPair(seed);
        expect(pureKp).not.toBe(false);
        // RFC pk matches both tiers.
        expect(bytes2hex(pureKp.publicKey)).toBe(v.pk);
    });

    test('pure-JS verifies a WASM-produced signature (RFC TEST 2 vector)', async () => {
        const v = RFC_VECTORS[1]; // TEST 2
        const seed = hex2bytes(v.sk);
        const msg = hex2bytes(v.msg);

        const kp = await _wed.keygen(seed);
        expect(kp).not.toBe(false);
        const sig = await _wed.sign(kp.privateKey, msg);
        expect(sig).not.toBe(false);

        // Pure-JS verify: (publicKey, message, signature) — message before sig.
        const ok = _pureEd.verify(kp.publicKey, msg, sig);
        expect(ok).toBe(true);
    });

    test('WASM verifies a pure-JS-produced signature (RFC TEST 3 vector)', async () => {
        const v = RFC_VECTORS[2]; // TEST 3
        const seed = hex2bytes(v.sk);
        const msg = hex2bytes(v.msg);

        const pureKp = _pureEd.keyPair(seed);
        expect(pureKp).not.toBe(false);
        const pureSig = _pureEd.sign(pureKp.privateKey, msg);
        expect(pureSig).not.toBe(false);

        // WASM verify: (publicKey, signature, message) — sig before msg.
        const ok = await _wed.verify(pureKp.publicKey, pureSig, msg);
        expect(ok).toBe(true);
    });

    test('cross-sign round-trip on a fresh random seed', async () => {
        // Draw a random seed and verify both tiers agree on the public key.
        const seed = crypto.getRandomValues(new Uint8Array(32));

        const wasmKp = await _wed.keygen(seed);
        expect(wasmKp).not.toBe(false);
        const pureKp = _pureEd.keyPair(seed);
        expect(pureKp).not.toBe(false);

        // Both tiers must derive the same public key from the same seed.
        expect(bytes2hex(wasmKp.publicKey)).toBe(bytes2hex(pureKp.publicKey));

        // WASM signs, pure-JS verifies.
        const msg = new TextEncoder().encode('cross-tier parity test');
        const wasmSig = await _wed.sign(wasmKp.privateKey, msg);
        expect(wasmSig).not.toBe(false);
        expect(_pureEd.verify(pureKp.publicKey, msg, wasmSig)).toBe(true);

        // Pure-JS signs, WASM verifies.
        const pureSig = _pureEd.sign(pureKp.privateKey, msg);
        expect(pureSig).not.toBe(false);
        expect(await _wed.verify(wasmKp.publicKey, pureSig, msg)).toBe(true);
    });
});

// ── invalid inputs → false, no throw ─────────────────────────────────────────

describe('wasmEd25519 — invalid inputs → false, no throw', () => {
    const V0 = RFC_VECTORS[0];
    const PK = hex2bytes(V0.pk);
    const SIG = hex2bytes(V0.sig);

    test('keygen: seed wrong length → false', async () => {
        expect(await _wed.keygen(new Uint8Array(16))).toBe(false);
    });

    test('keygen: seed not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wed.keygen('deadbeef')).toBe(false);
    });

    test('sign: privateKey wrong length → false', async () => {
        expect(await _wed.sign(new Uint8Array(32), new Uint8Array(0))).toBe(false);
    });

    test('sign: privateKey not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wed.sign('notabuffer', new Uint8Array(0))).toBe(false);
    });

    test('sign: message not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wed.sign(new Uint8Array(64), 'hello')).toBe(false);
    });

    test('verify: publicKey wrong length → false', async () => {
        expect(await _wed.verify(new Uint8Array(16), SIG, new Uint8Array(0))).toBe(false);
    });

    test('verify: signature wrong length → false', async () => {
        expect(await _wed.verify(PK, new Uint8Array(32), new Uint8Array(0))).toBe(false);
    });

    test('verify: message not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wed.verify(PK, SIG, 'hello')).toBe(false);
    });

    test('verify: publicKey not a Uint8Array → false', async () => {
        // @ts-expect-error intentional misuse
        expect(await _wed.verify(null, SIG, new Uint8Array(0))).toBe(false);
    });

    test('keygen never throws on garbage input', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wed.keygen(null)).resolves.toBe(false);
    });

    test('sign never throws on garbage input', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wed.sign(null, null)).resolves.toBe(false);
    });

    test('verify never throws on garbage input', async () => {
        // @ts-expect-error intentional misuse
        await expect(_wed.verify(null, null, null)).resolves.toBe(false);
    });
});
