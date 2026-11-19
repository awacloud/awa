// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The composite seam of `hybridSign`: `fromComponents(kind,
 * { pq, trad })` and `toComponents(kind, bytes)` for public keys, secret keys
 * and signatures. The official LAMPS vectors (draft -19, plain concatenation
 * on the wire) are built into the module's containers THROUGH the seam and
 * verified; components generated apart compose into a working key pair; every
 * malformed input is `false`, never a throw.
 */

import { describe, test, expect } from 'bun:test';

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

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha512 = sha512.factory(_ba, _utf8);
const _random = random.factory(_ba, aes.factory(), _sha256);
const MLDSA = ml_dsa.factory(sha3.factory(_ba, _utf8), _ba, _random);
const ED = ed25519.factory(_sha512, _ba);
const ECC = ecc.factory(_ba, hex.factory(), bn.factory(_ba, _random), _sha256, sha384.factory(_sha512), _sha512, hmac.factory(_ba, _utf8, _sha256));
const H = hybridSign.factory(MLDSA, ED, ECC, _sha512, _sha256, _random, _utf8);

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const enc = (s) => _utf8.toBytes(s);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const VARIANTS = [
    ['mldsa65_ed25519', VED, 32],
    ['mldsa65_ecdsaP256', VEC, 65],
];

for (const [name, V, tradPkLen] of VARIANTS) {
    describe(`hybridSign.${name} — the official vectors through the seam`, () => {
        const v = H[name];
        const pk = b64(V.PK_B64);
        const officialPk = () => v.fromComponents('publicKey', { pq: pk.subarray(0, 1952), trad: pk.subarray(1952) });
        const officialSig = (raw) => v.fromComponents('signature', { pq: raw.subarray(0, 3309), trad: raw.subarray(3309) });

        test('the official public key has the documented split', () => {
            expect(pk.length).toBe(1952 + tradPkLen);
        });

        test('empty-ctx and with-ctx signatures verify', () => {
            expect(v.verify(officialPk(), officialSig(b64(V.SIG_EMPTYCTX_B64)), enc(V.M))).toBe(true);
            expect(v.verify(officialPk(), officialSig(b64(V.SIG_WITHCTX_B64)), enc(V.M), enc(V.CTX))).toBe(true);
        });

        test('toComponents returns the official bytes', () => {
            const parts = v.toComponents('publicKey', officialPk());
            expect(same(parts.pq, pk.subarray(0, 1952))).toBe(true);
            expect(same(parts.trad, pk.subarray(1952))).toBe(true);
            const raw = b64(V.SIG_WITHCTX_B64);
            const sp = v.toComponents('signature', officialSig(raw));
            expect(same(sp.pq, raw.subarray(0, 3309))).toBe(true);
            expect(same(sp.trad, raw.subarray(3309))).toBe(true);
        });
    });

    describe(`hybridSign.${name} — keys`, () => {
        const v = H[name];

        test('keygen output round-trips through toComponents / fromComponents', () => {
            const kp = v.keygen();
            for (const kind of ['publicKey', 'secretKey']) {
                const parts = v.toComponents(kind, kp[kind]);
                expect(parts.pq.length).toBe(kind === 'publicKey' ? v.lengths.mldsaPk : v.lengths.mldsaSk);
                expect(parts.trad.length).toBe(kind === 'publicKey' ? v.lengths.tradPk : v.lengths.tradSk);
                expect(same(v.fromComponents(kind, parts), kp[kind])).toBe(true);
            }
            const sig = v.sign(kp.secretKey, enc('m'));
            expect(same(v.fromComponents('signature', v.toComponents('signature', sig)), sig)).toBe(true);
        });

        test('components generated apart compose into a working key pair', () => {
            const ml = MLDSA.ml_dsa65.keygen();
            const trad = name === 'mldsa65_ed25519'
                ? (() => { const k = ED.keyPair(_random.bytes(32)); return { pk: k.publicKey, sk: k.privateKey }; })()
                : (() => { const kp = v.keygen(); return { pk: v.toComponents('publicKey', kp.publicKey).trad, sk: v.toComponents('secretKey', kp.secretKey).trad }; })();
            const publicKey = v.fromComponents('publicKey', { pq: ml.publicKey, trad: trad.pk });
            const secretKey = v.fromComponents('secretKey', { pq: ml.secretKey, trad: trad.sk });
            const sig = v.sign(secretKey, enc('composed'), enc('ctx'));
            expect(v.verify(publicKey, sig, enc('composed'), enc('ctx'))).toBe(true);
        });

        test('results are copies, never views of the input', () => {
            const kp = v.keygen();
            const parts = v.toComponents('publicKey', kp.publicKey);
            parts.pq[0] ^= 0xff;
            expect(v.toComponents('publicKey', kp.publicKey).pq[0]).not.toBe(parts.pq[0]);
            const pq = new Uint8Array(v.lengths.mldsaPk), tradPk = v.toComponents('publicKey', kp.publicKey).trad;
            const built = v.fromComponents('publicKey', { pq, trad: tradPk });
            pq[0] = 7;
            expect(v.toComponents('publicKey', built).pq[0]).toBe(0);
        });
    });

    describe(`hybridSign.${name} — malformed input is false`, () => {
        const v = H[name];
        const kp = v.keygen();
        const ok = v.toComponents('publicKey', kp.publicKey);

        test('an unknown kind', () => {
            expect(v.fromComponents('privateKey', ok)).toBe(false);
            expect(v.toComponents('nope', kp.publicKey)).toBe(false);
        });

        test('wrong component lengths and types', () => {
            expect(v.fromComponents('publicKey', { pq: ok.pq.subarray(1), trad: ok.trad })).toBe(false);
            expect(v.fromComponents('publicKey', { pq: ok.pq, trad: ok.trad.subarray(1) })).toBe(false);
            expect(v.fromComponents('publicKey', { pq: ok.pq })).toBe(false);
            expect(v.fromComponents('publicKey', null)).toBe(false);
            expect(v.fromComponents('secretKey', ok)).toBe(false);   // public lengths as a secret key
        });

        test('a container that does not decode', () => {
            expect(v.toComponents('publicKey', kp.publicKey.subarray(1))).toBe(false);
            expect(v.toComponents('secretKey', kp.publicKey)).toBe(false);
            expect(v.toComponents('signature', new Uint8Array(10))).toBe(false);
            expect(v.toComponents('publicKey', 'bytes')).toBe(false);
        });
    });
}

describe('hybridSign.mldsa65_ecdsaP256 — ECDSA forms', () => {
    const v = H.mldsa65_ecdsaP256;
    const kp = v.keygen();
    const ok = v.toComponents('publicKey', kp.publicKey);

    test('a public key without the 0x04 prefix is refused', () => {
        const t = new Uint8Array(ok.trad); t[0] = 0x02;
        expect(v.fromComponents('publicKey', { pq: ok.pq, trad: t })).toBe(false);
    });

    test('a signature whose DER does not parse is refused', () => {
        const sig = v.toComponents('signature', v.sign(kp.secretKey, enc('m')));
        const bad = new Uint8Array(sig.trad); bad[0] = 0x31;
        expect(v.fromComponents('signature', { pq: sig.pq, trad: bad })).toBe(false);
    });
});
