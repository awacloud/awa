// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `hybridSign` — composite MLDSA65-Ed25519 and
 * MLDSA65-ECDSA-P256 signatures.
 *
 * Correctness bar = the OFFICIAL `draft-ietf-lamps-pq-composite-sigs` interop
 * vectors (both variants, empty-ctx + with-ctx), byte-exact — a self-consistent
 * round-trip is NOT sufficient (W0 digest-domain lesson). Vendored vectors
 * (co-located production fixtures, re-pinned to the numbered revision -19):
 *   ./__fixtures__/composite-mldsa65-ed25519.js
 *   ./__fixtures__/composite-mldsa65-ecdsaP256.js
 * (lamps-wg/draft-composite-sigs @6df63fdc — byte-identical to main @1bb9f5c6).
 *
 * The official signature/pk wire form is plain component concat; this module's
 * canonical form is a length-prefixed TLV public key + (for ECDSA) a
 * length-prefixed DER component. Each vector is re-framed into the canonical
 * container from the EXACT official component bytes, then verified through the
 * real `verify()` path — so the ML-DSA sig, the trad sig, and the public-key
 * components are all byte-exact official material.
 */

import { describe, test, expect, beforeAll } from 'bun:test';

import { hybridSign } from './hybridSign.js';
import { ml_dsa } from './ml_dsa.js';
import { ed25519 } from './ed25519.js';
import { ecc } from './ecc.js';
import { sha512 } from '../hash/sha512.js';
import { sha256 } from '../hash/sha256.js';
import { sha384 } from '../hash/sha384.js';
import { hmac } from '../hash/hmac.js';
import { sha3 } from '../hash/sha3.js';
import { aes } from '../cipher/aes.js';
import { random } from '../utils/random.js';
import { bitArray } from '../utils/bitArray.js';
import { bn } from '../utils/bn.js';
import { hex } from '../../io/codec/hex.js';
import { utf8 } from '../../io/codec/utf8.js';

import * as VED from './__fixtures__/composite-mldsa65-ed25519.js';
import * as VEC from './__fixtures__/composite-mldsa65-ecdsaP256.js';

// ── manual DI wiring (mirrors src/crypto/pkc/ml_kem.test.js) ──────────
function wire() {
    const _ba = bitArray.factory();
    const _utf8 = utf8.factory();
    const _sha256 = sha256.factory(_ba, _utf8);
    const _sha512 = sha512.factory(_ba, _utf8);
    const _sha384 = sha384.factory(_sha512);
    const _hmac = hmac.factory(_ba, _utf8, _sha256);
    const _sha3 = sha3.factory(_ba, _utf8);
    const _aes = aes.factory();
    const _random = random.factory(_ba, _aes, _sha256);
    const _hex = hex.factory();
    const _bn = bn.factory(_ba, _random);
    const _mldsa = ml_dsa.factory(_sha3, _ba, _random);
    const _ed = ed25519.factory(_sha512, _ba);
    const _ecc = ecc.factory(_ba, _hex, _bn, _sha256, _sha384, _sha512, _hmac);
    return hybridSign.factory(_mldsa, _ed, _ecc, _sha512, _sha256, _random, _utf8);
}

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const enc = (s) => utf8.factory().toBytes(s);
function cat(...cs) {
    let n = 0; for (const c of cs) n += c.length;
    const out = new Uint8Array(n); let o = 0;
    for (const c of cs) { out.set(c, o); o += c.length; }
    return out;
}
const u16 = (n) => Uint8Array.from([(n >>> 8) & 0xff, n & 0xff]);

describe('hybridSign module', () => {
    test('module metadata', () => {
        expect(hybridSign.name).toBe('hybridSign');
        expect(hybridSign.type).toBe('fw.crypto.pkc');
        expect(hybridSign.dependencies).toEqual(['ml_dsa', 'ed25519', 'ecc', 'sha512', 'sha256', 'random', 'utf8']);
        expect(typeof hybridSign.factory).toBe('function');
    });

    test('factory exposes both registered variants', () => {
        const inst = wire();
        for (const v of ['mldsa65_ed25519', 'mldsa65_ecdsaP256']) {
            expect(typeof inst[v].keygen).toBe('function');
            expect(typeof inst[v].sign).toBe('function');
            expect(typeof inst[v].verify).toBe('function');
            expect(typeof inst[v].lengths).toBe('object');
        }
    });
});

describe('digest domain (W1 carry-forward c)', () => {
    // Locks the byte-domain SHA-512 wrapper. Feeding raw bytes into fw's
    // bitArray-domain sha512.hash() yields a wrong-but-deterministic digest;
    // this KAT (FIPS 180-4 SHA-512("abc")) would FAIL under that bug.
    const SHA512_ABC =
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
        '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f';
    test('_sha512Bytes("abc") matches the FIPS 180-4 KAT', () => {
        const inst = wire();
        const _hex = hex.factory();
        const digest = inst._internal.sha512Bytes(enc('abc'));
        expect(_hex.fromBytes(digest)).toBe(SHA512_ABC);
    });
});

// Per-variant test battery driven by the official vectors + a live key pair.
function variantSuite(name, V, schemeId, tradPkLen, opts) {
    describe(`hybridSign.${name}`, () => {
        let inst, variant, kp;
        const M = enc(V.M);
        const CTX = enc(V.CTX);

        beforeAll(() => {
            inst = wire();
            variant = inst[name];
            kp = variant.keygen();
        });

        // Build the canonical TLV public key from the official plain-concat pk.
        const officialTlvPk = () => {
            const pk = b64(V.PK_B64);
            const mldsaPk = pk.subarray(0, 1952);
            const tradPk = pk.subarray(1952);
            expect(tradPk.length).toBe(tradPkLen);
            return inst._internal.encodeTlv(schemeId, [mldsaPk, tradPk]);
        };
        // Re-frame the official signature into the module's canonical container.
        const officialSig = (rawB64) => opts.reframeSig(b64(rawB64));

        test('keygen → sign → verify round-trip (empty ctx)', () => {
            expect(kp).not.toBe(false);
            const sig = variant.sign(kp.secretKey, M);
            expect(sig).not.toBe(false);
            expect(variant.verify(kp.publicKey, M, sig)).toBe(true);
        });

        test('keygen → sign → verify round-trip (with ctx)', () => {
            const sig = variant.sign(kp.secretKey, M, CTX);
            expect(variant.verify(kp.publicKey, M, sig, CTX)).toBe(true);
        });

        test('wrong message ⇒ reject', () => {
            const sig = variant.sign(kp.secretKey, M);
            expect(variant.verify(kp.publicKey, enc('other'), sig)).toBe(false);
        });

        test('OFFICIAL vector: empty-ctx signature verifies (byte-exact)', () => {
            expect(variant.verify(officialTlvPk(), M, officialSig(V.SIG_EMPTYCTX_B64))).toBe(true);
        });

        test('OFFICIAL vector: with-ctx signature verifies (byte-exact)', () => {
            expect(variant.verify(officialTlvPk(), M, officialSig(V.SIG_WITHCTX_B64), CTX)).toBe(true);
        });

        test('negative: empty-ctx signature must NOT verify under a ctx binding', () => {
            expect(variant.verify(officialTlvPk(), M, officialSig(V.SIG_EMPTYCTX_B64), CTX)).toBe(false);
        });

        test('negative: with-ctx signature must NOT verify without ctx', () => {
            expect(variant.verify(officialTlvPk(), M, officialSig(V.SIG_WITHCTX_B64))).toBe(false);
        });

        test('negative: tampered ML-DSA byte ⇒ reject', () => {
            const bad = new Uint8Array(officialSig(V.SIG_EMPTYCTX_B64));
            bad[8] ^= 0xff;                              // inside the ML-DSA slice
            expect(variant.verify(officialTlvPk(), M, bad)).toBe(false);
        });

        test('negative: tampered trad byte ⇒ reject (no downgrade)', () => {
            const bad = new Uint8Array(officialSig(V.SIG_EMPTYCTX_B64));
            bad[bad.length - 1] ^= 0xff;                 // inside the trad slice
            expect(variant.verify(officialTlvPk(), M, bad)).toBe(false);
        });

        test('negative: stripped trad component (zeroed) ⇒ reject', () => {
            const bad = new Uint8Array(officialSig(V.SIG_EMPTYCTX_B64));
            bad.fill(0, 3309);                           // zero everything after ML-DSA sig
            expect(variant.verify(officialTlvPk(), M, bad)).toBe(false);
        });

        test('negative: swapped trad public key ⇒ reject', () => {
            const sig = variant.sign(kp.secretKey, M);
            // splice variant B's trad pk into A's composite pk.
            const kp2 = variant.keygen();
            const aParts = inst._internal.decodeTlv(kp.publicKey, schemeId, 2);
            const bParts = inst._internal.decodeTlv(kp2.publicKey, schemeId, 2);
            const mixed = inst._internal.encodeTlv(schemeId, [aParts[0], bParts[1]]);
            expect(variant.verify(mixed, M, sig)).toBe(false);
        });

        test('TLV splice-reject: wrong schemeId ⇒ verify false', () => {
            const tlv = new Uint8Array(kp.publicKey);
            tlv[0] = 0x7f;                               // corrupt scheme id
            const sig = variant.sign(kp.secretKey, M);
            expect(variant.verify(tlv, M, sig)).toBe(false);
        });

        test('TLV splice-reject: trailing byte ⇒ decodeTlv false', () => {
            const spliced = cat(kp.publicKey, Uint8Array.from([0x00]));
            expect(inst._internal.decodeTlv(spliced, schemeId, 2)).toBe(false);
        });

        test('TLV splice-reject: truncated container ⇒ decodeTlv false', () => {
            const truncated = kp.publicKey.subarray(0, kp.publicKey.length - 1);
            expect(inst._internal.decodeTlv(truncated, schemeId, 2)).toBe(false);
        });
    });
}

variantSuite('mldsa65_ed25519', VED, 0x01, 32, {
    // official Ed25519 sig is already the canonical fixed-slice form.
    reframeSig: (raw) => raw
});

variantSuite('mldsa65_ecdsaP256', VEC, 0x02, 65, {
    // official ECDSA sig = mldsaSig(3309) || DER; canonical = mldsaSig || u16(len) || DER.
    reframeSig: (raw) => {
        const mldsaSig = raw.subarray(0, 3309);
        const der = raw.subarray(3309);
        return cat(mldsaSig, u16(der.length), der);
    }
});

describe('hybridSign.mldsa65_ecdsaP256 DER handling', () => {
    test('malformed DER component ⇒ verify false', () => {
        const inst = wire();
        const v = inst.mldsa65_ecdsaP256;
        const kp = v.keygen();
        const sig = new Uint8Array(v.sign(kp.secretKey, enc(VEC.M)));
        // corrupt the DER SEQUENCE tag (byte right after the ML-DSA sig + u16 len)
        sig[3309 + 2] = 0x00;
        expect(v.verify(kp.publicKey, enc(VEC.M), sig)).toBe(false);
    });
});
