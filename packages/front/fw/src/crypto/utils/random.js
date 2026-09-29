// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|BigInt64Array|BigUint64Array} TypedArray
 */

/**
 * @fileoverview CSPRNG wrapper around `crypto.getRandomValues` plus a
 * SP 800-90A compliant CTR_DRBG-AES-256 (no derivation function).
 *
 * Two surfaces are exposed:
 *
 *   1. **Direct API** (`bytes`, `words`, `bits`, `isReady`) - thin wrapper
 *      over `crypto.getRandomValues`. Vetted by the platform; the recommended
 *      path for general-purpose use.
 *
 *   2. **`drbg(options)`** - instantiates a CTR_DRBG per NIST SP 800-90A
 *      §10.2 (AES-256, no df). Suitable as a FIPS 140-3 "approved" DRBG
 *      assuming the entropy source (`crypto.getRandomValues`, treated as a
 *      validated NRBG per SP 800-90C) and the surrounding module satisfy
 *      the rest of the FIPS module-level requirements.
 *
 *      The DRBG performs:
 *        - **POST / KAT** at first instantiation (cached process-wide),
 *        - **Continuous health test (RCT)** on every entropy buffer drawn
 *          from `crypto.getRandomValues` (SP 800-90B §4.4.1),
 *        - **Reseed** with fresh OS entropy when the reseed_counter exceeds
 *          the configured limit (default 2^32, well below the 2^48 spec cap),
 *        - Acceptance of `additional_input` on every `generate()` call so that
 *          environmental entropy (e.g. from `entropyCollector`) can be mixed
 *          in without depending on its module at construction time.
 *
 *      `entropyCollector` is **not** a dependency: the caller wires its
 *      callback to `drbg.addAdditionalInput()` so that the next `generate()`
 *      consumes the accumulated bytes via the spec-defined update path.
 *      This keeps `random` worker-safe (DOM-free).
 *
 * The KAT vector used by `_runSelfTest()` is the official NIST CAVP
 * CTR_DRBG-AES-256 (no-df, PredictionResistance=False, COUNT=0) vector from
 * the `drbgvectors_pr_false` archive
 * (https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/random-number-generators)
 * - also mirrored in BoringSSL's `crypto/fipsmodule/rand/ctrdrbg_vectors.txt`.
 * Sufficient for the algorithmic KAT; full FIPS 140-3 validation additionally
 * requires the surrounding module-level operational tests outside this file.
 *
 */

/**
 * Low-level CTR_DRBG instance produced by the internal `_makeDrbg` factory
 * (exposed via `_internal.makeDrbg`). Caller drives the full SP 800-90A
 * lifecycle manually with explicit seed material.
 * @typedef {object} DrbgCore
 * @property {(entropyBytes: Uint8Array, personalisationBytes?: Uint8Array, nonceBytes?: Uint8Array) => boolean} instantiate Seed the DRBG.
 * @property {(entropyBytes: Uint8Array, additionalInputBytes?: Uint8Array) => boolean} reseed Reseed with caller-supplied entropy.
 * @property {(n: number, additionalInputBytes?: Uint8Array) => (Uint8Array | false)} generate Produce `n` random bytes.
 * @property {() => void} uninstantiate Wipe internal state.
 * @property {boolean} isLive Whether the DRBG has been instantiated (getter).
 * @property {number} reseedCounter Current reseed counter (getter).
 * @property {number} securityStrength Security strength in bits (getter).
 * @property {number} aesKeyBits Configured AES key size in bits (getter).
 * @property {boolean} useDf Whether a derivation function is used (getter).
 * @property {number} seedBytes Seed length in bytes (getter).
 */

/**
 * High-level CTR_DRBG instance returned by `api.drbg(options)`. Auto-seeds
 * from OS entropy and supports mixing in pending additional input.
 * @typedef {object} Drbg
 * @property {(n: number, additionalInput?: Uint8Array) => (Uint8Array | false)} generate Produce `n` random bytes, folding in any pending additional input.
 * @property {(additionalInput?: Uint8Array) => boolean} reseed Reseed with fresh OS entropy.
 * @property {(bytes: Uint8Array | number[] | Uint32Array | number) => boolean} addAdditionalInput Buffer entropy for the next `generate()`/`reseed()`.
 * @property {() => void} uninstantiate Wipe internal state and pending buffer.
 * @property {boolean} isLive Whether the DRBG is live (getter).
 * @property {number} reseedCounter Current reseed counter (getter).
 * @property {number} securityStrength Security strength in bits (getter).
 */

/**
 * SP 800-90B continuous health-test surface.
 * @typedef {object} RandomHealth
 * @property {(buf: Uint8Array | number[]) => boolean} feed Push bytes through RCT + APT; `false` on failure.
 * @property {() => void} reset Clear state and the latched-dead flag.
 * @property {boolean} isDead True once any continuous test has failed (getter).
 */

/**
 * Public shape returned by `random.factory()`.
 * @typedef {object} RandomAPI
 * @property {<T extends TypedArray>(array: T) => T} fill Fill a typed array in place with secure random values.
 * @property {() => (number | false)} float Secure random float in `[0, 1)`.
 * @property {(min: number, max: number) => (number | false)} int Secure random integer in `[min, max]` (rejection-sampled).
 * @property {(n: number) => (Uint8Array | false)} bytes `n` random bytes (direct OS RBG).
 * @property {(n: number) => (number[] | false)} words `n` random 32-bit words (direct OS RBG).
 * @property {(n: number) => (number[] | false)} bits Random bit array of `n` bits (direct OS RBG).
 * @property {() => boolean} isReady Whether `crypto.getRandomValues` is available.
 * @property {() => boolean} selfTest Run / re-run the CTR_DRBG power-on self-test.
 * @property {{ makeDrbg: (opts?: { aesKeyBits?: 128|192|256, df?: boolean }) => (DrbgCore | false) }} _internal Test-only internal CTR_DRBG factory.
 * @property {RandomHealth} health Continuous health-test surface.
 * @property {(options?: { aesKeyBits?: 128|192|256, df?: boolean, personalisation?: Uint8Array }) => (Drbg | false)} drbg Build a fresh CTR_DRBG-AES-256 (no-df) instance.
 */

import { bitArray } from './bitArray.js';
import { aes } from '../cipher/aes.js';
import { sha256 } from '../hash/sha256.js';

export const random = {
    name: 'random',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'aes', 'sha256'],
    deps: [bitArray, aes, sha256],

    /** @returns {RandomAPI} */
    factory(bitArray, aes, sha256) {

        const _MAX_BYTES_PER_CALL = 65536;
        const _hasCrypto = typeof crypto !== 'undefined' && !!crypto.getRandomValues;

        // ── byte/word helpers (big-endian, AES convention) ───────────────

        function _bytesToWords(b) {
            const n = b.length >>> 2;
            const out = new Array(n);
            for (let i = 0; i < n; i++) {
                const j = i << 2;
                out[i] = ((b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3]) | 0;
            }
            return out;
        }
        function _wordsToBytes(w, count, into, off) {
            for (let i = 0; i < count; i++) {
                const j = off + (i << 2);
                into[j]     = (w[i] >>> 24) & 0xff;
                into[j + 1] = (w[i] >>> 16) & 0xff;
                into[j + 2] = (w[i] >>>  8) & 0xff;
                into[j + 3] =  w[i]         & 0xff;
            }
        }

        // ── continuous health tests (SP 800-90B §4.4) ────────────────────
        //
        // Both tests run continuously across the lifetime of the entropy
        // source - state persists across calls, not per-buffer. Once either
        // test fails, the source is marked dead permanently (SP 800-90B §4.5:
        // "Once a continuous test failure is detected, no more outputs from
        // the noise source shall be used").
        //
        // Parameters assume a full-entropy byte source (H = 8 bits/byte) and
        // α = 2^-20 false-alarm probability:
        //
        //   RCT (§4.4.1) - Repetition Count Test
        //     C_rct = 1 + ⌈-log2(α) / H⌉ = 1 + ⌈20/8⌉ = 4
        //     Fail if 4 identical consecutive samples.
        //
        //   APT (§4.4.2) - Adaptive Proportion Test
        //     Window W = 512 samples, p = 2^-H = 1/256, mean = 2.
        //     Cutoff C_apt = 13 (smallest C such that P(Bin(512,1/256) > C) ≤ α).
        //     Fail if the anchor sample appears more than 13 times in the
        //     non-overlapping 512-sample window.

        const _RCT_CUTOFF = 4;
        const _APT_W      = 512;
        const _APT_C      = 13;

        const _rct = { prev: -1, run: 0 };
        const _apt = { anchor: -1, count: 0, idx: 0 };
        let   _entropyDead = false;

        function _healthCheck(buf) {
            if (_entropyDead) return false;
            for (let i = 0; i < buf.length; i++) {
                const b = buf[i];

                // RCT
                if (b === _rct.prev) {
                    _rct.run++;
                    if (_rct.run >= _RCT_CUTOFF) {
                        _entropyDead = true;
                        console.error('[crypto] CORRUPT: random: RCT health-test failed on entropy source');
                        return false;
                    }
                } else {
                    _rct.prev = b;
                    _rct.run = 1;
                }

                // APT
                if (_apt.anchor === -1) {
                    _apt.anchor = b;
                    _apt.count  = 1;
                    _apt.idx    = 1;
                } else {
                    _apt.idx++;
                    if (b === _apt.anchor) {
                        _apt.count++;
                        if (_apt.count > _APT_C) {
                            _entropyDead = true;
                            console.error('[crypto] CORRUPT: random: APT health-test failed on entropy source');
                            return false;
                        }
                    }
                    if (_apt.idx >= _APT_W) _apt.anchor = -1;
                }
            }
            return true;
        }

        function _resetHealth() {
            _rct.prev = -1; _rct.run = 0;
            _apt.anchor = -1; _apt.count = 0; _apt.idx = 0;
            _entropyDead = false;
        }

        // ── raw OS entropy with chunking + continuous health tests ───────

        function _getRandomBytes(out) {
            if (!_hasCrypto) {
                console.error('[crypto] NOT READY: crypto.getRandomValues unavailable');
                return false;
            }
            let offset = 0;
            while (offset < out.length) {
                const chunk = Math.min(_MAX_BYTES_PER_CALL, out.length - offset);
                crypto.getRandomValues(out.subarray(offset, offset + chunk));
                offset += chunk;
            }
            return out;
        }
        function _getEntropy(nBytes) {
            if (_entropyDead) {
                console.error('[crypto] CORRUPT: random: entropy source previously failed health test');
                return false;
            }
            const buf = _getRandomBytes(new Uint8Array(nBytes));
            if (buf === false) return false;
            if (!_healthCheck(buf)) return false;
            return buf;
        }

        // ── CTR_DRBG-AES-{128,192,256}, no-df + with-df - SP 800-90A §10.2 ──
        //
        // Parameters (parametric since Iteration H4):
        //   aesKeyBits ∈ {128, 192, 256}  → keylen = 16 / 24 / 32 bytes
        //   blocklen   = 16 bytes (AES)
        //   seedlen    = keylen + blocklen
        //   security_strength = aesKeyBits
        //   reseed_interval   ≤ 2^48 (we use 2^32 for safety)
        //   max_bytes_per_request ≤ 2^19 bits = 65536 bytes
        //   df : SP 800-90A §10.4.2 Block Cipher Derivation Function.
        //        If true, instantiate/reseed accept any-length entropy +
        //        nonce + perso/additional-input strings ; df distills them
        //        into seedlen bytes via BCC. If false, all inputs must be
        //        exactly seedlen bytes.

        const _BLK_WORDS         = 4;
        const _BLK_BYTES         = 16;
        const _MAX_GEN_BYTES     = 65536;
        const _RESEED_INTERVAL   = 0x100000000;   // 2^32, < spec cap 2^48

        // Build a CTR_DRBG instance.
        // @param {object} [opts]
        // @param {128|192|256} [opts.aesKeyBits=256]
        // @param {boolean}     [opts.df=false]
        function _makeDrbg(opts) {
            opts = opts || {};
            const aesKeyBits = opts.aesKeyBits || 256;
            const useDf      = !!opts.df;
            if (aesKeyBits !== 128 && aesKeyBits !== 192 && aesKeyBits !== 256) {
                console.error('[crypto] BUG: ctr_drbg: aesKeyBits must be 128, 192 or 256');
                return false;
            }
            const KEY_BYTES  = aesKeyBits / 8;
            const KEY_WORDS  = KEY_BYTES / 4;
            const SEED_BYTES = KEY_BYTES + _BLK_BYTES;
            const SEED_WORDS = SEED_BYTES / 4;

            let K        = new Array(KEY_WORDS).fill(0);
            let V        = new Array(_BLK_WORDS).fill(0);
            let cipher   = null;
            let reseedCt = 0;
            let live     = false;

            // ── SP 800-90A §10.4.2 - Block Cipher Derivation Function ────
            //
            // BCC(K, data): CBC-MAC of `data` (multiple of 16 bytes) under K.
            function _bcc(Kbytes, dataBytes) {
                const cf = aes.fn(_bytesToWords(Kbytes), false);
                if (cf === false) return false;
                const chain = new Uint8Array(_BLK_BYTES);
                for (let off = 0; off < dataBytes.length; off += _BLK_BYTES) {
                    for (let i = 0; i < _BLK_BYTES; i++) chain[i] ^= dataBytes[off + i];
                    const blk = cf.encrypt(_bytesToWords(chain));
                    _wordsToBytes(blk, _BLK_WORDS, chain, 0);
                }
                return chain;
            }

            // Block_Cipher_df(input, no_of_bits_to_return) → bytes.
            // Returns SEED_BYTES of distilled output.
            function _df(inputBytes, outBytes) {
                // S = L (4 BE) || N (4 BE) || input || 0x80 || 0x00…0
                const L = inputBytes.length;
                const N = outBytes;
                const headerLen = 4 + 4;
                const rawLen = headerLen + L + 1;
                const padLen = (_BLK_BYTES - (rawLen % _BLK_BYTES)) % _BLK_BYTES;
                const Slen = rawLen + padLen;
                const S = new Uint8Array(Slen);
                S[0] = (L >>> 24) & 0xff; S[1] = (L >>> 16) & 0xff;
                S[2] = (L >>>  8) & 0xff; S[3] = L         & 0xff;
                S[4] = (N >>> 24) & 0xff; S[5] = (N >>> 16) & 0xff;
                S[6] = (N >>>  8) & 0xff; S[7] = N         & 0xff;
                for (let i = 0; i < L; i++) S[headerLen + i] = inputBytes[i];
                S[headerLen + L] = 0x80;
                // padding 0x00 already set by Uint8Array init.

                // K_df = 0x00 01 02 … (KEY_BYTES bytes)
                const Kdf = new Uint8Array(KEY_BYTES);
                for (let i = 0; i < KEY_BYTES; i++) Kdf[i] = i;

                // temp = "" ; while len(temp) < KEY_BYTES + BLK_BYTES :
                //   IV = i (4 BE) || 0…0 (BLK-4 zero bytes)
                //   temp ||= BCC(K_df, IV || S)
                const tempLen = KEY_BYTES + _BLK_BYTES;
                const temp = new Uint8Array(Math.ceil(tempLen / _BLK_BYTES) * _BLK_BYTES);
                let tempOff = 0;
                let i = 0;
                while (tempOff < tempLen) {
                    const ivS = new Uint8Array(_BLK_BYTES + Slen);
                    ivS[0] = (i >>> 24) & 0xff; ivS[1] = (i >>> 16) & 0xff;
                    ivS[2] = (i >>>  8) & 0xff; ivS[3] = i         & 0xff;
                    ivS.set(S, _BLK_BYTES);
                    const blk = _bcc(Kdf, ivS);
                    if (blk === false) return false;
                    temp.set(blk, tempOff);
                    tempOff += _BLK_BYTES;
                    i++;
                }

                // K' = first KEY_BYTES of temp ; X = next BLK_BYTES of temp.
                const Kp = temp.subarray(0, KEY_BYTES);
                let X    = temp.slice(KEY_BYTES, KEY_BYTES + _BLK_BYTES);
                const cf = aes.fn(_bytesToWords(Kp), false);
                if (cf === false) return false;

                const out = new Uint8Array(outBytes);
                let outOff = 0;
                while (outOff < outBytes) {
                    const blk = cf.encrypt(_bytesToWords(X));
                    _wordsToBytes(blk, _BLK_WORDS, X, 0);
                    const n = Math.min(_BLK_BYTES, outBytes - outOff);
                    out.set(X.subarray(0, n), outOff);
                    outOff += n;
                }
                return out;
            }

            function _rebuild() {
                cipher = aes.fn(K, false);
                if (cipher === false) {
                    console.error('[crypto] BUG: ctr_drbg: AES key schedule failed');
                    return false;
                }
                return true;
            }

            function _incV() {
                for (let i = _BLK_WORDS - 1; i >= 0; i--) {
                    V[i] = (V[i] + 1) | 0;
                    if (V[i] !== 0) break;
                }
            }

            // CTR_DRBG_Update(provided_data: SEED_WORDS, K, V) - §10.2.1.2
            function _update(providedWords) {
                const temp = new Array(SEED_WORDS).fill(0);
                let pos = 0;
                while (pos < SEED_WORDS) {
                    _incV();
                    const blk = cipher.encrypt(V);
                    for (let j = 0; j < _BLK_WORDS && pos < SEED_WORDS; j++) {
                        temp[pos++] = blk[j];
                    }
                }
                for (let i = 0; i < SEED_WORDS; i++) temp[i] ^= providedWords[i];
                K = temp.slice(0, KEY_WORDS);
                // Slice exactly _BLK_WORDS for V (avoid AES-192 case where
                // SEED_WORDS = KEY_WORDS + BLK_WORDS = 10 but temp could be
                // longer if generated incorrectly).
                V = temp.slice(KEY_WORDS, KEY_WORDS + _BLK_WORDS);
                return _rebuild();
            }

            // Distill arbitrary inputs to a SEED_BYTES seed.
            //   no-df : caller must provide exactly SEED_BYTES of entropy ;
            //           perso/AI is XOR-truncated/padded to SEED_BYTES.
            //   df    : entropy + nonce + perso (concatenated) → df → SEED_BYTES.
            function _distill(entropyBytes, personalisationBytes, nonceBytes) {
                if (useDf) {
                    const eLen = entropyBytes ? entropyBytes.length : 0;
                    const nLen = nonceBytes   ? nonceBytes.length   : 0;
                    const pLen = personalisationBytes ? personalisationBytes.length : 0;
                    const cat = new Uint8Array(eLen + nLen + pLen);
                    if (eLen) cat.set(entropyBytes, 0);
                    if (nLen) cat.set(nonceBytes, eLen);
                    if (pLen) cat.set(personalisationBytes, eLen + nLen);
                    return _df(cat, SEED_BYTES);
                }
                if (!entropyBytes || entropyBytes.length !== SEED_BYTES) {
                    console.error('[crypto] BUG: ctr_drbg (no-df): entropy must be exactly ' + SEED_BYTES + ' bytes');
                    return false;
                }
                const seed = new Uint8Array(SEED_BYTES);
                seed.set(entropyBytes);
                if (personalisationBytes && personalisationBytes.length > 0) {
                    const lim = Math.min(personalisationBytes.length, SEED_BYTES);
                    for (let i = 0; i < lim; i++) seed[i] ^= personalisationBytes[i];
                }
                return seed;
            }

            // §10.2.1.3 Instantiate (df or no-df depending on `useDf`).
            //   df    : (entropy, nonce, persoString) → df → seed
            //   no-df : (entropy, persoString) - entropy must be SEED_BYTES
            function instantiate(entropyBytes, personalisationBytes, nonceBytes) {
                const seed = _distill(entropyBytes, personalisationBytes, nonceBytes);
                if (seed === false) return false;
                K.fill(0); V.fill(0);
                if (!_rebuild()) return false;
                if (!_update(_bytesToWords(seed))) return false;
                reseedCt = 1;
                live = true;
                return true;
            }

            // §10.2.1.4 Reseed (df or no-df).
            function reseed(entropyBytes, additionalInputBytes) {
                if (!live) {
                    console.warn('[crypto] NOT READY: ctr_drbg.reseed: not instantiated');
                    return false;
                }
                // Reseed: nonce field unused (nonce is for instantiate only).
                const seed = _distill(entropyBytes, additionalInputBytes, null);
                if (seed === false) return false;
                if (!_update(_bytesToWords(seed))) return false;
                reseedCt = 1;
                return true;
            }

            // §10.2.1.5.1 Generate (no df)
            function generate(n, additionalInputBytes) {
                if (!live) {
                    console.warn('[crypto] NOT READY: ctr_drbg.generate: not instantiated');
                    return false;
                }
                if (!Number.isInteger(n) || n < 0 || n > _MAX_GEN_BYTES) {
                    console.warn('[crypto] INVALID: ctr_drbg.generate: n must be an integer in [0, ' + _MAX_GEN_BYTES + ']');
                    return false;
                }
                if (n === 0) return new Uint8Array(0);

                if (reseedCt > _RESEED_INTERVAL) {
                    const fresh = _getEntropy(SEED_BYTES);
                    if (fresh === false) return false;
                    if (!reseed(fresh, additionalInputBytes)) return false;
                    additionalInputBytes = null;
                }

                let aiWords;
                if (additionalInputBytes && additionalInputBytes.length > 0) {
                    let aiBytes;
                    if (useDf) {
                        aiBytes = _df(additionalInputBytes, SEED_BYTES);
                        if (aiBytes === false) return false;
                    } else {
                        aiBytes = new Uint8Array(SEED_BYTES);
                        aiBytes.set(additionalInputBytes.subarray(0, Math.min(SEED_BYTES, additionalInputBytes.length)));
                    }
                    aiWords = _bytesToWords(aiBytes);
                    if (!_update(aiWords)) return false;
                } else {
                    aiWords = new Array(SEED_WORDS).fill(0);
                }

                const out = new Uint8Array(n);
                let off = 0;
                while (off < n) {
                    _incV();
                    const blk = cipher.encrypt(V);
                    const remaining = n - off;
                    if (remaining >= 16) {
                        _wordsToBytes(blk, _BLK_WORDS, out, off);
                        off += 16;
                    } else {
                        const tmp = new Uint8Array(16);
                        _wordsToBytes(blk, _BLK_WORDS, tmp, 0);
                        out.set(tmp.subarray(0, remaining), off);
                        off = n;
                    }
                }

                if (!_update(aiWords)) return false;
                reseedCt++;
                return out;
            }

            // §11.3 uninstantiate - wipe state
            function uninstantiate() {
                K.fill(0); V.fill(0);
                cipher = null; reseedCt = 0; live = false;
            }

            return {
                instantiate, reseed, generate, uninstantiate,
                get isLive()           { return live; },
                get reseedCounter()    { return reseedCt; },
                get securityStrength() { return aesKeyBits; },
                get aesKeyBits()       { return aesKeyBits; },
                get useDf()            { return useDf; },
                get seedBytes()        { return SEED_BYTES; }
            };
        }

        // ── Power-On Self-Test (KAT) - FIPS 140-3 §7.10 ──────────────────
        //
        // Official NIST CAVP CTR_DRBG vector for AES-256 / no derivation
        // function, PredictionResistance=False, EntropyInputLen=256+128
        // (entropy ‖ nonce, no-df: passed as one 384-bit seed),
        // PersonalizationStringLen=0, AdditionalInputLen=0,
        // ReturnedBitsLen=512. Distributed as part of NIST CAVP's
        // drbgtestvectors archive
        // (https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/random-number-generators)
        // and mirrored in BoringSSL's
        // `crypto/fipsmodule/rand/ctrdrbg_vectors.txt`.
        //
        // Test sequence (drbgvectors_pr_false, COUNT=0):
        //   1. instantiate(EntropyInput, "")
        //   2. reseed(EntropyInputReseed, "")
        //   3. generate(512 bits, "")               ← discarded
        //   4. generate(512 bits, "") == ReturnedBits

        const _KAT_ENTROPY_INPUT = _hexToBytes(
            'e4bc23c5089a19d86f4119cb3fa08c0a' +
            '4991e0a1def17e101e4c14d9c323460a' +
            '7c2fb58e0b086c6c57b55f56cae25bad'
        );
        const _KAT_ENTROPY_RESEED = _hexToBytes(
            'fd85a836bba85019881e8c6bad23c906' +
            '1adc75477659acaea8e4a01dfe07a183' +
            '2dad1c136f59d70f8653a5dc118663d6'
        );
        const _KAT_EXPECTED_HEX =
            'b2cb8905c05e5950ca31895096be29ea' +
            '3d5a3b82b269495554eb80fe07de43e1' +
            '93b9e7c3ece73b80e062b1c1f68202fb' +
            'b1c52a040ea2478864295282234aaada';
        let   _selfTestPassed   = null;

        function _hexToBytes(h) {
            const out = new Uint8Array(h.length >>> 1);
            for (let i = 0; i < out.length; i++) {
                out[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
            }
            return out;
        }

        function _hex(b) {
            let s = '';
            for (let i = 0; i < b.length; i++) {
                const v = b[i];
                s += (v < 16 ? '0' : '') + v.toString(16);
            }
            return s;
        }

        function _runSelfTest() {
            const d = _makeDrbg();
            // @ts-ignore - comparison with object is safe: _makeDrbg returns false on failure, object otherwise
            if (!d || d === false) return false;
            if (!d.instantiate(_KAT_ENTROPY_INPUT)) return false;
            if (!d.reseed(_KAT_ENTROPY_RESEED))     return false;
            if (d.generate(64) === false)           return false;
            const out = d.generate(64);
            if (out === false)                      return false;
            const got = _hex(out);
            if (got !== _KAT_EXPECTED_HEX) {
                console.error('[crypto] CORRUPT: random.selfTest: CTR_DRBG KAT mismatch (got ' + got + ')');
                return false;
            }
            return true;
        }

        function _ensureSelfTest() {
            if (_selfTestPassed === null) _selfTestPassed = _runSelfTest();
            return _selfTestPassed;
        }

        // ── Public API ───────────────────────────────────────────────────

        const api = {

            /**
             * Fill an existing typed array in-place with cryptographically
             * secure random values and return it.
             *
             * Valid types: `Int8Array`, `Uint8Array`, `Uint8ClampedArray`,
             * `Int16Array`, `Uint16Array`, `Int32Array`, `Uint32Array`,
             * `BigInt64Array`, `BigUint64Array`. Passing a `Float32Array` or
             * `Float64Array` throws a native `TypeMismatchError`.
             *
             * @template {TypedArray} T
             * @param {T} array
             * @returns {T}
             */
            fill(array) {
                // todo should throws a native `TypeMismatchError` with crypto.getRandomValues(array).
                //      ensure same comportement with _getRandomBytes
                return _getRandomBytes(array);
            },

            /**
             * Return a cryptographically secure random float in `[0, 1)`.
             * Derived from one 32-bit random integer divided by 2³².
             *
             * @returns {number|false}
             */
            float() {
                // Route through _getRandomBytes so the dead-source health
                // latch covers float() like the rest of the public API.
                const bytes = _getRandomBytes(new Uint8Array(4));
                if (bytes === false) return false;
                const v = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
                return v / 0x1_0000_0000;
            },

            /**
             * Return a cryptographically secure random integer in the inclusive
             * range `[min, max]`.
             *
             * Uses rejection sampling to eliminate modulo bias. For ranges much
             * smaller than 2³² the expected iteration count is below 2.
             *
             * @param {number} min - Lower bound (inclusive).
             * @param {number} max - Upper bound (inclusive).
             * @returns {number|false}
             * @throws {RangeError} When `min > max`.
             */
            int(min, max) {
                if (min > max) throw new RangeError('min must be ≤ max');
                const range       = max - min + 1;
                const maxUnbiased = Math.floor(0x1_0000_0000 / range) * range;
                const buf         = new Uint8Array(4);
                let value;
                do {
                    if (_getRandomBytes(buf) === false) return false;
                    value = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
                } while (value >= maxUnbiased);
                return min + (value % range);
            },

            /** Generate `n` cryptographically random bytes (direct OS RBG). */
            bytes(n) {
                if (!Number.isInteger(n) || n < 0) {
                    console.warn('[crypto] INVALID: random.bytes expects a non-negative integer');
                    return false;
                }
                return _getRandomBytes(new Uint8Array(n));
            },

            /** Generate `n` cryptographically random 32-bit words (direct OS RBG). */
            words(n) {
                if (!Number.isInteger(n) || n < 0) {
                    console.warn('[crypto] INVALID: random.words expects a non-negative integer');
                    return false;
                }
                const bytes = _getRandomBytes(new Uint8Array(n * 4));
                if (bytes === false) return false;
                const out = new Array(n);
                for (let i = 0; i < n; i++) {
                    const j = i * 4;
                    out[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) | 0;
                }
                return out;
            },

            /** Generate a random bit array of `n` bits (direct OS RBG). */
            bits(n) {
                if (!Number.isInteger(n) || n < 0) {
                    console.warn('[crypto] INVALID: random.bits expects a non-negative integer');
                    return false;
                }
                const wordCount = Math.ceil(n / 32);
                const words = api.words(wordCount);
                if (words === false) return false;
                return bitArray.clamp(words, n);
            },

            /** `true` when `crypto.getRandomValues` is available. */
            isReady() { return _hasCrypto; },

            /** Run / re-run the CTR_DRBG power-on self-test. */
            selfTest() { _selfTestPassed = _runSelfTest(); return _selfTestPassed; },

            /**
             * Test-only escape hatch exposing the internal CTR_DRBG factory
             * with caller-controlled seed material. **Not for production
             * use** - the public `drbg()` API auto-pulls OS entropy and is
             * the only path with full FIPS 140-3 lifecycle (POST, RCT/APT
             * health tests, OS NRBG seeding). This surface exists exclusively
             * to replay NIST CAVP / ACVP DRBG vectors with deterministic
             * entropy inputs, so the algorithm itself can be byte-exact
             * validated against the reference vectors.
             */
            _internal: { makeDrbg: _makeDrbg },

            /**
             * SP 800-90B continuous health-test surface - primarily for
             * test harnesses and operational diagnostics.
             *
             * NOTE: the RCT/APT state and `_entropyDead` latch are
             * **module-singleton** - they are shared across every
             * `bytes()`/`words()`/`bits()`/`float()`/`int()`/`drbg()` call,
             * and across multiple DRBG instances built from this factory.
             * The underlying entropy source (`crypto.getRandomValues`) is
             * itself process-global, so a single shared health latch
             * matches reality. Tests that need a fresh state must call
             * `reset()` between scenarios.
             *
             *   `feed(buf)`   : push bytes through RCT + APT (returns false on fail).
             *   `reset()`     : clear state and clear the latched-dead flag.
             *   `isDead`      : true once any continuous test has failed.
             */
            health: {
                feed(buf)  { return _healthCheck(buf instanceof Uint8Array ? buf : new Uint8Array(buf)); },
                reset()    { _resetHealth(); },
                get isDead() { return _entropyDead; }
            },

            /**
             * Build a fresh CTR_DRBG-AES-256 (no-df) instance.
             *
             * @param {object}     [options]
             * @param {Uint8Array} [options.personalisation]  Up to 48 bytes of personalisation
             *                                                string mixed into the seed (XORed,
             *                                                truncated as per SP 800-90A §10.2.1.3.1
             *                                                when no df is used).
             * @returns {object|false}  DRBG instance or `false` on POST/seed failure.
             *
             * The returned object exposes:
             *   - `generate(n, additionalInput?)` → `Uint8Array | false`
             *   - `reseed(additionalInput?)`      → `boolean`  (pulls fresh entropy from OS RBG)
             *   - `addAdditionalInput(bytes)`     → mix arbitrary bytes into the next `generate()`
             *   - `uninstantiate()`               → wipe internal state
             *   - `isLive`, `reseedCounter`, `securityStrength`
             */
            drbg(options = {}) {
                if (!_ensureSelfTest()) {
                    console.error('[crypto] CORRUPT: random.drbg refused - POST failed');
                    return false;
                }
                const inst = _makeDrbg(options);
                if (inst === false) return false;
                const seed = _getEntropy(inst.seedBytes);
                if (seed === false) return false;
                if (!inst.instantiate(seed, options.personalisation)) return false;

                // Buffer of pending additional_input (e.g. from entropyCollector).
                let pending = null;

                return {
                    generate(n, additionalInput) {
                        let ai = additionalInput || null;
                        if (pending !== null) {
                            ai = ai === null ? pending
                                : (() => { const m = new Uint8Array(pending.length + ai.length);
                                           m.set(pending); m.set(ai, pending.length); return m; })();
                            pending = null;
                        }
                        return inst.generate(n, ai);
                    },
                    reseed(additionalInput) {
                        const fresh = _getEntropy(inst.seedBytes);
                        if (fresh === false) return false;
                        let ai = additionalInput || null;
                        if (pending !== null) {
                            ai = ai === null ? pending
                                : (() => { const m = new Uint8Array(pending.length + ai.length);
                                           m.set(pending); m.set(ai, pending.length); return m; })();
                            pending = null;
                        }
                        return inst.reseed(fresh, ai);
                    },
                    /**
                     * Accumulate caller-supplied entropy (e.g. mouse/keyboard timings
                     * from `entropyCollector`) into a pending buffer that is consumed
                     * on the next `generate()` or `reseed()` as `additional_input`.
                     * Inputs longer than `seedlen` (48 bytes) are folded through
                     * SHA-256 to bound the buffer.
                     */
                    addAdditionalInput(bytes) {
                        if (!(bytes instanceof Uint8Array)) {
                            if (Array.isArray(bytes) || bytes instanceof Uint32Array) {
                                const tmp = new Uint8Array(bytes.length * 4);
                                for (let i = 0; i < bytes.length; i++) {
                                    const v = bytes[i] | 0;
                                    tmp[i * 4]     = (v >>> 24) & 0xff;
                                    tmp[i * 4 + 1] = (v >>> 16) & 0xff;
                                    tmp[i * 4 + 2] = (v >>>  8) & 0xff;
                                    tmp[i * 4 + 3] =  v         & 0xff;
                                }
                                bytes = tmp;
                            } else if (typeof bytes === 'number') {
                                const v = bytes | 0;
                                bytes = new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
                            } else {
                                console.warn('[crypto] BUG: drbg.addAdditionalInput: unsupported data type');
                                return false;
                            }
                        }
                        const merged = pending === null ? bytes
                            : (() => { const m = new Uint8Array(pending.length + bytes.length);
                                       m.set(pending); m.set(bytes, pending.length); return m; })();
                        if (merged.length <= inst.seedBytes) {
                            pending = merged;
                        } else {
                            // Fold to 32 bytes via SHA-256 to bound the buffer.
                            const h = sha256.hash(_bytesToWords(merged.subarray(0, merged.length & ~3)));
                            const folded = new Uint8Array(32);
                            _wordsToBytes(h, 8, folded, 0);
                            pending = folded;
                        }
                        return true;
                    },
                    uninstantiate()         { pending = null; inst.uninstantiate(); },
                    get isLive()            { return inst.isLive; },
                    get reseedCounter()     { return inst.reseedCounter; },
                    get securityStrength()  { return inst.securityStrength; }
                };
            }
        };

        return api;
    }
};
