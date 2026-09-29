// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview X-Wing hybrid KEM — X25519 + ML-KEM-768.
 *
 * Construction (FROZEN): X-Wing per `draft-connolly-cfrg-xwing-kem` **rev -06**
 * (CFRG) — the revision whose Appendix C KAT the in-repo libsodium reference
 * (`references/CRYPTO-SRC/libsodium/.../crypto_kem/xwing/kem_xwing.c`, tv0..tv2)
 * encodes. This module is a PURE composition over vetted fw primitives
 * (`x25519`, `ml_kem`, `sha3`) — no novel crypto is invented here.
 *
 * Combiner (draft §5.3, X-Wing fixed-label variant — the label pins the scheme
 * and binds `ct_X25519 || pk_X25519`, so a component key cannot be reused in
 * another combiner without changing the label domain):
 *   ss = SHA3-256( ss_ML-KEM || ss_X25519 || ct_X25519 || pk_X25519 || label )
 *   label = 0x5c 0x2e 0x2f 0x2f 0x5e 0x5c   (ASCII  \.//^\ )
 *
 * Key encoding (FROZEN, fixed-length concat — component sizes ARE the scheme id,
 * so no length prefix is needed):
 *   pk = pk_ML-KEM(1184) || pk_X25519(32)                    = 1216 bytes
 *   sk = the 32-byte X-Wing seed (expand-on-use, draft §5.1):
 *          expanded(96) = SHAKE256(seed, 96)
 *          mlkem_seed   = expanded[0..64)   (d || z for ML-KEM keygen)
 *          sk_X25519    = expanded[64..96)
 *   ct = ct_ML-KEM(1088) || ct_X25519(32)                    = 1120 bytes
 *   ss = 32 bytes
 * The stored secret key is the seed alone; component secrets are transient and
 * derived through distinct SHAKE256 output ranges — neither is exposed for reuse.
 *
 * Zeroization is BEST-EFFORT ONLY, never a guarantee: transient expansions and
 * component secrets are `.fill(0)`'d after use, but JS/WASM cannot guarantee a
 * wipe (GC copies, no `mlock`, JIT-resident intermediates). Constant-time
 * discipline is inherited from the primitives (branch-lean), but pure-JS timing
 * is NOT a security boundary — see `docs/api/crypto/pkc/hybridKem.md`.
 *
 * Returns `Uint8Array` everywhere, `false` on invalid input (fw crypto idiom).
 * Worker-safe: the descriptor factory is a self-contained pure composition.
 */

import { x25519 } from './x25519.js';
import { ml_kem } from './ml_kem.js';
import { sha3 } from '../hash/sha3.js';
// Primitives for the self-wired direct-ESM convenience surface ONLY (§2b).
// Referenced solely at module scope in `_defaultXwing()` — NEVER inside the
// descriptor `factory()` — so the factory stays worker-serializable
// (fw/no-factory-capture).
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { sha256 } from '../hash/sha256.js';
import { aes } from '../cipher/aes.js';
import { random } from '../utils/random.js';

/**
 * X-Wing hybrid KEM API.
 * @typedef {object} XwingApi
 * @property {{ pk: number, sk: number, ct: number, ss: number }} lengths Byte sizes.
 * @property {(seed?: Uint8Array) => ({ publicKey: Uint8Array, secretKey: Uint8Array }|false)} keygen Generate a key pair; deterministic for a 32-byte seed.
 * @property {(publicKey: Uint8Array, randomness?: Uint8Array) => ({ cipherText: Uint8Array, sharedSecret: Uint8Array }|false)} encapsulate Encapsulate; deterministic for 64-byte randomness (msg32 || eskX32).
 * @property {(cipherText: Uint8Array, secretKey: Uint8Array) => (Uint8Array|false)} decapsulate Decapsulate to the 32-byte shared secret.
 */

export const hybridKem = {
    name: 'hybridKem',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['x25519', 'ml_kem', 'sha3'],
    deps: [x25519, ml_kem, sha3],

    /**
     * @param {ReturnType<typeof x25519.factory>} x25519 X25519 primitive.
     * @param {ReturnType<typeof ml_kem.factory>} ml_kem ML-KEM primitive.
     * @param {ReturnType<typeof sha3.factory>} sha3 SHA-3 / SHAKE primitive.
     * @returns {{ xwing: XwingApi }}
     */
    factory(x25519, ml_kem, sha3) {
        const KEM = ml_kem.ml_kem768;

        // X-Wing fixed domain-separation label (draft §5.3). ASCII: \.//^\
        const LABEL = new Uint8Array([0x5c, 0x2e, 0x2f, 0x2f, 0x5e, 0x5c]);
        const lengths = Object.freeze({ pk: 1216, sk: 32, ct: 1120, ss: 32 });

        const PK_MLKEM = 1184, PK_X = 32;
        const CT_MLKEM = 1088, CT_X = 32;

        /** `n` bytes from the platform CSPRNG (sanity-approved global). */
        function randomBytes(n) {
            const b = new Uint8Array(n);
            crypto.getRandomValues(b);
            return b;
        }

        /** Concatenate a list of Uint8Array chunks. */
        function concatBytes(chunks) {
            let total = 0;
            for (const c of chunks) total += c.length;
            const out = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) { out.set(c, o); o += c.length; }
            return out;
        }

        // bitArray (word-packed, big-endian) → Uint8Array, first `byteLen` bytes.
        // Mirrors bitArray.ba_to_ui8 for full-word outputs; both digest sizes
        // used here (SHA3-256=32B, SHAKE256=96B) are 4-byte multiples, so every
        // word is full (no partial-word encoding to handle).
        function baToBytes(ba, byteLen) {
            const out = new Uint8Array(byteLen);
            let tmp = 0;
            for (let i = 0; i < byteLen; i++) {
                if ((i & 3) === 0) tmp = ba[i >>> 2];
                out[i] = (tmp >>> 24) & 0xff;
                tmp = (tmp << 8) >>> 0;
            }
            return out;
        }

        // SHAKE256(input, outBytes) → Uint8Array. `sha3.shake256` consumes a
        // Uint8Array and returns a bitArray; convert the output back to bytes.
        function shake256Bytes(input, outBytes) {
            const ba = sha3.shake256(input, outBytes * 8);
            if (ba === false) return false;
            return baToBytes(ba, outBytes);
        }

        // SHA3-256(input) → Uint8Array(32).
        function sha3_256Bytes(input) {
            return baToBytes(sha3.sha3_256(input), 32);
        }

        /** X-Wing combiner (draft §5.3). */
        function combiner(ssMlkem, ssX, ctX, pkX) {
            return sha3_256Bytes(concatBytes([ssMlkem, ssX, ctX, pkX, LABEL]));
        }

        /** Expand a 32-byte X-Wing seed into component keys (draft §5.1). */
        function expandKeys(seed) {
            const expanded = shake256Bytes(seed, 96);
            if (expanded === false) return false;
            const mlkemSeed = expanded.subarray(0, 64);
            const skX = expanded.subarray(64, 96);
            const mk = KEM.keygen(mlkemSeed);
            if (mk === false) return false;
            const pkX = x25519.scalarMultBase(skX);
            if (pkX === false) return false;
            return { pkMlkem: mk.publicKey, skMlkem: mk.secretKey, pkX, skX, expanded };
        }

        /**
         * keygen(seed?) → { publicKey(1216), secretKey(32) }. secretKey is the
         * 32-byte seed itself (expand-on-use). Best-effort zeroization of the
         * transient expansion — NOT a guarantee (see fileoverview).
         */
        function keygen(seed) {
            if (seed !== undefined && (!(seed instanceof Uint8Array) || seed.length !== 32)) return false;
            const s = seed ? new Uint8Array(seed) : randomBytes(32);
            const k = expandKeys(s);
            if (k === false) return false;
            const publicKey = concatBytes([k.pkMlkem, k.pkX]);
            k.expanded.fill(0);   // best-effort; zeroes skX (a view) too
            k.skMlkem.fill(0);
            return { publicKey, secretKey: s };
        }

        /**
         * encapsulate(publicKey(1216), randomness?) → { cipherText(1120),
         * sharedSecret(32) }. randomness = ML-KEM msg(32) || ephemeral X25519
         * scalar(32) = 64 bytes (the draft's deterministic-encaps interface).
         */
        function encapsulate(publicKey, randomness) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== lengths.pk) return false;
            if (randomness !== undefined && (!(randomness instanceof Uint8Array) || randomness.length !== 64)) return false;
            const r = randomness || randomBytes(64);
            const pkMlkem = publicKey.subarray(0, PK_MLKEM);
            const pkX = publicKey.subarray(PK_MLKEM, PK_MLKEM + PK_X);

            const msgMlkem = r.subarray(0, 32);
            const skEX = r.subarray(32, 64);

            const enc = KEM.encapsulate(pkMlkem, msgMlkem);
            if (enc === false) return false;
            const ctX = x25519.scalarMultBase(skEX);
            if (ctX === false) return false;
            const ssX = x25519.scalarMult(skEX, pkX);
            if (ssX === false) return false;   // low-order / all-zero shared secret

            const sharedSecret = combiner(enc.sharedSecret, ssX, ctX, pkX);
            const cipherText = concatBytes([enc.cipherText, ctX]);
            return { cipherText, sharedSecret };
        }

        /**
         * decapsulate(cipherText(1120), secretKey(32)) → sharedSecret(32) | false.
         * A tampered ct yields a different (implicit-reject) shared secret via the
         * ML-KEM FO transform; a malformed length yields `false`.
         */
        function decapsulate(cipherText, secretKey) {
            if (!(cipherText instanceof Uint8Array) || cipherText.length !== lengths.ct) return false;
            if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32) return false;
            const k = expandKeys(secretKey);
            if (k === false) return false;

            const ctMlkem = cipherText.subarray(0, CT_MLKEM);
            const ctX = cipherText.subarray(CT_MLKEM, CT_MLKEM + CT_X);

            const ssMlkem = KEM.decapsulate(ctMlkem, k.skMlkem);   // implicit-reject inside
            if (ssMlkem === false) return false;
            const ssX = x25519.scalarMult(k.skX, ctX);
            if (ssX === false) return false;

            const ss = combiner(ssMlkem, ssX, ctX, k.pkX);
            k.expanded.fill(0);   // best-effort
            k.skMlkem.fill(0);
            return ss;
        }

        const xwing = { lengths, keygen, encapsulate, decapsulate };
        return { xwing };
    }
};

// --- Direct ESM convenience surface (§2b) --------------------------------
// A ready-to-use `xwing` over default fw primitives, lazily wired on first use
// (no work at import time). The wiring lives at module scope and is NEVER
// referenced inside the descriptor factory, so the factory remains a
// self-contained, worker-serializable pure composition.
let _xwingSingleton;
function _defaultXwing() {
    if (!_xwingSingleton) {
        const _bitArray = bitArray.factory();
        // @ts-ignore - utf8.factory() takes no params (dependencies: []); the extra
        // _bitArray argument is unused and harmless at runtime (JS ignores it).
        const _utf8 = utf8.factory(_bitArray);
        const _sha256 = sha256.factory(_bitArray, _utf8);
        const _aes = aes.factory();
        const _random = random.factory(_bitArray, _aes, _sha256);
        const _sha3 = sha3.factory(_bitArray, _utf8);
        const _x25519 = x25519.factory();
        const _ml_kem = ml_kem.factory(_sha3, _bitArray, _random);
        _xwingSingleton = hybridKem.factory(_x25519, _ml_kem, _sha3).xwing;
    }
    return _xwingSingleton;
}

/**
 * Ready-to-use X-Wing hybrid KEM over default fw primitives (lazily wired).
 * @type {XwingApi}
 */
export const xwing = {
    get lengths() { return _defaultXwing().lengths; },
    keygen(seed) { return _defaultXwing().keygen(seed); },
    encapsulate(publicKey, randomness) { return _defaultXwing().encapsulate(publicKey, randomness); },
    decapsulate(cipherText, secretKey) { return _defaultXwing().decapsulate(cipherText, secretKey); }
};
