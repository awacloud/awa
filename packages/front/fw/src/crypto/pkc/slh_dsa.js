// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SLH-DSA (FIPS 205) - Stateless Hash-Based Digital Signature.
 *
 * Implements the full Table 2: SHAKE simple (§11.1) and SHA2 simple (§11.2),
 * each with 6 parameter sets (128f/s, 192f/s, 256f/s) → 12 signers total.
 *
 * Per FIPS 205:
 *   - §11.1 SHAKE: every tweakable hash is `SHAKE256(PK.seed || ADRS || input, n)`,
 *     uncompressed 32-byte addresses.
 *   - §11.2 SHA2: SHA-256 carries `PRFaddr` and `thash1` for every variant;
 *     `PRFmsg` / `Hmsg` / `thashN` use SHA-256 at category 1 (N=16) and SHA-512
 *     at category 3/5 (N=24/32). Tweakable hashes prepend `PK.seed || zeros`
 *     to fill one block of the underlying SHA. Compressed 22-byte addresses.
 *
 * Building blocks per FIPS 205:
 *   - WOTS+ chains (Algorithm 5/6/7)
 *   - XMSS sub-trees of height h' = H/D (Algorithm 9)
 *   - HT (HyperTree) of D layers of XMSS (Algorithm 11)
 *   - FORS (Forest of Random Subsets) - K trees of height A (Algorithm 14/15)
 *
 * The 6 parameter sets exposed: ml_dsa-style API
 *   slh_dsa_shake_128f / 128s / 192f / 192s / 256f / 256s
 *
 * Reference: FIPS 205, https://csrc.nist.gov/pubs/fips/205/final
 *
 */

import { sha3 } from '../hash/sha3.js';
import { sha256 } from '../hash/sha256.js';
import { sha512 } from '../hash/sha512.js';
import { hmac } from '../hash/hmac.js';
import { bitArray } from '../utils/bitArray.js';
import { random } from '../utils/random.js';

/**
 * Byte sizes of every artefact of an SLH-DSA parameter set.
 * @typedef {object} SlhDsaLengths
 * @property {number} publicKey Public-key length in bytes (2*N).
 * @property {number} secretKey Secret-key length in bytes.
 * @property {number} signature Signature length in bytes.
 * @property {number} seed Keygen seed length in bytes (3*N).
 */

/**
 * Optional signing options.
 * @typedef {object} SlhDsaSignOpts
 * @property {Uint8Array} [context] Context bytes (≤ 255).
 * @property {Uint8Array|false} [extraEntropy] N-byte randomiser; `false` = deterministic.
 */

/**
 * One SLH-DSA parameter-set / hash-family instance (one of the 12 variants).
 * @typedef {object} SlhDsaInstance
 * @property {SlhDsaLengths} lengths Byte sizes of every artefact.
 * @property {(seed?: Uint8Array) => ({ publicKey: Uint8Array, secretKey: Uint8Array }|false)} keygen Generate a key pair.
 * @property {(msg: Uint8Array, sk: Uint8Array, opts?: SlhDsaSignOpts) => (Uint8Array|false)} sign Pure SLH-DSA sign.
 * @property {(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array, opts?: SlhDsaSignOpts) => boolean} verify Pure SLH-DSA verify.
 * @property {(msg: Uint8Array, sk: Uint8Array, hashAlg: string, hashMod: ({hash: Function}|Function|null), opts?: SlhDsaSignOpts) => (Uint8Array|false)} signPh HashSLH-DSA sign.
 * @property {(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array, hashAlg: string, hashMod: ({hash: Function}|Function|null), opts?: SlhDsaSignOpts) => boolean} verifyPh HashSLH-DSA verify.
 * @property {{ signInternal: Function, verifyInternal: Function, wrapMessage: Function, wrapMessageHash: Function, computePh: Function }} _internal Test-only escape hatches.
 */

/**
 * Public API returned by `slh_dsa.factory()` - the 12 SLH-DSA signers.
 * @typedef {object} SlhDsaAPI
 * @property {SlhDsaInstance} slh_dsa_shake_128f
 * @property {SlhDsaInstance} slh_dsa_shake_128s
 * @property {SlhDsaInstance} slh_dsa_shake_192f
 * @property {SlhDsaInstance} slh_dsa_shake_192s
 * @property {SlhDsaInstance} slh_dsa_shake_256f
 * @property {SlhDsaInstance} slh_dsa_shake_256s
 * @property {SlhDsaInstance} slh_dsa_sha2_128f
 * @property {SlhDsaInstance} slh_dsa_sha2_128s
 * @property {SlhDsaInstance} slh_dsa_sha2_192f
 * @property {SlhDsaInstance} slh_dsa_sha2_192s
 * @property {SlhDsaInstance} slh_dsa_sha2_256f
 * @property {SlhDsaInstance} slh_dsa_sha2_256s
 */

export const slh_dsa = {
    name: 'slh_dsa',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['sha3', 'sha256', 'sha512', 'hmac', 'bitArray', 'random'],
    deps: [sha3, sha256, sha512, hmac, bitArray, random],

    /** @returns {SlhDsaAPI} */
    factory(sha3, sha256, sha512, hmac, bitArray, random) {

        // FIPS 205 Table 2 (SHAKE family).
        // N = security parameter (bytes), W = Winternitz (always 16),
        // H = total hypertree height, D = layers, K = FORS trees, A = FORS tree height.
        const PARAMS = {
            '128f': { N: 16, W: 16, H: 66, D: 22, K: 33, A: 6 },
            '128s': { N: 16, W: 16, H: 63, D: 7,  K: 14, A: 12 },
            '192f': { N: 24, W: 16, H: 66, D: 22, K: 33, A: 8 },
            '192s': { N: 24, W: 16, H: 63, D: 7,  K: 17, A: 14 },
            '256f': { N: 32, W: 16, H: 68, D: 17, K: 35, A: 9 },
            '256s': { N: 32, W: 16, H: 64, D: 8,  K: 22, A: 14 }
        };

        // ADRS type selectors (FIPS 205 §4.2 Table 1).
        const ADDR_WOTS = 0;
        const ADDR_WOTSPK = 1;
        const ADDR_HASHTREE = 2;
        const ADDR_FORSTREE = 3;
        const ADDR_FORSPK = 4;
        const ADDR_WOTSPRF = 5;
        const ADDR_FORSPRF = 6;

        // Big-endian helpers.
        function _writeU32BE(out, off, v) {
            out[off]     = (v >>> 24) & 0xff;
            out[off + 1] = (v >>> 16) & 0xff;
            out[off + 2] = (v >>> 8) & 0xff;
            out[off + 3] = v & 0xff;
        }
        function _writeU64BE(out, off, big) {
            const hi = Number((big >> 32n) & 0xffffffffn);
            const lo = Number(big & 0xffffffffn);
            _writeU32BE(out, off, hi);
            _writeU32BE(out, off + 4, lo);
        }
        function _readBigBE(bytes) {
            let v = 0n;
            for (let i = 0; i < bytes.length; i++) v = (v << 8n) | BigInt(bytes[i]);
            return v;
        }

        function _maskBig(bits) {
            return (1n << BigInt(bits)) - 1n;
        }
        function _mask(bits) {
            // bits ≤ 31 expected here.
            return bits >= 32 ? 0xffffffff : (1 << bits) - 1;
        }

        function _concat(...arrs) {
            let len = 0;
            for (const a of arrs) len += a.length;
            const out = new Uint8Array(len);
            let off = 0;
            for (const a of arrs) { out.set(a, off); off += a.length; }
            return out;
        }
        function _equal(a, b) {
            if (a.length !== b.length) return false;
            let diff = 0;
            for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
            return diff === 0;
        }

        // Algorithm 4 base_2^b: extract `outLen` integers of `b` bits each from `bytes`,
        // big-endian order within each byte. Caller must provide ceil(outLen*b/8) bytes.
        function _base2b(bytes, b, outLen) {
            const out = new Uint32Array(outLen);
            const m = _mask(b);
            let pos = 0, bits = 0, total = 0;
            for (let i = 0; i < outLen; i++) {
                while (bits < b) {
                    total = ((total << 8) | bytes[pos++]) >>> 0;
                    bits += 8;
                }
                bits -= b;
                out[i] = (total >>> bits) & m;
            }
            return out;
        }

        // SHAKE256 helper: sha3.shake256 takes (data, outBits) → bitArray.
        // We wrap it to operate on Uint8Arrays.
        function _shake256(data, outBytes) {
            const ba = sha3.shake256(data, outBytes * 8);
            return bitArray.ba_to_ui8(ba);
        }
        function _sha256_b(data) {
            return bitArray.ba_to_ui8(sha256.hash(bitArray.ui8_to_ba(data)));
        }
        function _sha512_b(data) {
            return bitArray.ba_to_ui8(sha512.hash(bitArray.ui8_to_ba(data)));
        }
        function _hmacSha(hashKind, key, data) {
            // hmac.fn here is the legacy SHA-256 HMAC. For SHA-512 we build it
            // manually since the project's hmac module is hardcoded to SHA-256.
            if (hashKind === 'sha256') {
                const h = bitArray.ba_to_ui8(
                    new hmac.fn(bitArray.ui8_to_ba(key)).update(bitArray.ui8_to_ba(data)).digest()
                );
                return h;
            }
            // SHA-512 HMAC, RFC 2104.
            const blockLen = 128;
            let k = key;
            if (k.length > blockLen) k = _sha512_b(k);
            if (k.length < blockLen) {
                const padded = new Uint8Array(blockLen);
                padded.set(k);
                k = padded;
            }
            const ipad = new Uint8Array(blockLen);
            const opad = new Uint8Array(blockLen);
            for (let i = 0; i < blockLen; i++) {
                ipad[i] = k[i] ^ 0x36;
                opad[i] = k[i] ^ 0x5c;
            }
            const inner = _sha512_b(_concat(ipad, data));
            return _sha512_b(_concat(opad, inner));
        }
        // RFC 8017 MGF1 with the given hash. `seed` is concatenated with a 4-byte
        // big-endian counter; SLH-DSA only ever requests small `outLen` values.
        function _mgf1(seed, outLen, hashFn, hashOutLen) {
            const blocks = Math.ceil(outLen / hashOutLen);
            const out = new Uint8Array(blocks * hashOutLen);
            const ctr = new Uint8Array(4);
            const buf = new Uint8Array(seed.length + 4);
            buf.set(seed);
            for (let i = 0; i < blocks; i++) {
                ctr[0] = (i >>> 24) & 0xff;
                ctr[1] = (i >>> 16) & 0xff;
                ctr[2] = (i >>> 8) & 0xff;
                ctr[3] = i & 0xff;
                buf.set(ctr, seed.length);
                out.set(hashFn(buf), i * hashOutLen);
            }
            return out.subarray(0, outLen);
        }

        // Context factories: bind a parameter set + (pkSeed[, skSeed]) to the
        // 5 callbacks the sign/verify core consumes.

        // §11.1 SHAKE simple - every primitive is one SHAKE256(...) call.
        const _shakeContextOpts = { isCompressed: false };
        function _makeShakeContext(_p, pkSeed, skSeed) {
            const N = pkSeed.length;
            return {
                PRFaddr(addr) {
                    return _shake256(_concat(pkSeed, addr, skSeed), N);
                },
                PRFmsg(skPRF, rand, msg) {
                    return _shake256(_concat(skPRF, rand, msg), N);
                },
                Hmsg(R, pk, m, outLen) {
                    return _shake256(_concat(R, pk, m), outLen);
                },
                thash1(input, addr) {
                    return _shake256(_concat(pkSeed, addr, input.subarray(0, N)), N);
                },
                thashN(blocks, input, addr) {
                    return _shake256(_concat(pkSeed, addr, input.subarray(0, blocks * N)), N);
                }
            };
        }

        // §11.2 SHA2 simple - h0 is always SHA-256 (PRFaddr / thash1);
        // h1 is SHA-256 at category 1, SHA-512 otherwise (PRFmsg / Hmsg / thashN).
        const _sha2ContextOpts = { isCompressed: true };
        function _makeSha2Context(p, pkSeed, skSeed) {
            const N = p.N;
            const h1Kind = N === 16 ? 'sha256' : 'sha512';
            const h1Fn = h1Kind === 'sha256' ? _sha256_b : _sha512_b;
            const h1OutLen = h1Kind === 'sha256' ? 32 : 64;
            const h0BlockLen = 64;                   // SHA-256
            const h1BlockLen = h1Kind === 'sha256' ? 64 : 128;
            // Cache `pkSeed || zeros(blockLen - N)` for both lanes so each thash
            // call reduces to one extra hash-block of (addr || input).
            const seed0 = new Uint8Array(h0BlockLen); seed0.set(pkSeed);
            const seed1 = new Uint8Array(h1BlockLen); seed1.set(pkSeed);
            return {
                PRFaddr(addr) {
                    return _sha256_b(_concat(seed0, addr, skSeed)).subarray(0, N);
                },
                PRFmsg(skPRF, rand, msg) {
                    return _hmacSha(h1Kind, skPRF, _concat(rand, msg)).subarray(0, N);
                },
                Hmsg(R, pk, m, outLen) {
                    // §11.2: inner digest absorbs the full public key, but the MGF1
                    // seed uses only the N-byte PK.seed prefix.
                    const inner = h1Fn(_concat(R, pk, m));
                    const seed = _concat(R, pk.subarray(0, N), inner);
                    return _mgf1(seed, outLen, h1Fn, h1OutLen);
                },
                thash1(input, addr) {
                    return _sha256_b(_concat(seed0, addr, input.subarray(0, N))).subarray(0, N);
                },
                thashN(blocks, input, addr) {
                    return h1Fn(_concat(seed1, addr, input.subarray(0, blocks * N))).subarray(0, N);
                }
            };
        }

        // Build a parameter-set instance. `hashOpts` selects address layout
        // (compressed 22 vs uncompressed 32 bytes) + which context factory to use.
        function _makeVariant(p, hashOpts, makeContext) {
            const N = p.N, W = p.W, H = p.H, D = p.D, K = p.K, A = p.A;
            const WOTS_LOGW = 4;
            const WOTS_LEN1 = (8 * N) / WOTS_LOGW;        // bytes-of-N expressed as 4-bit nibbles
            const WOTS_LEN2 = N <= 8 ? 2 : (N <= 136 ? 3 : 4);
            const WOTS_LEN  = WOTS_LEN1 + WOTS_LEN2;
            const TREE_HEIGHT = H / D;                    // = h'

            // FIPS 205 §4.3: ADRS = 32 bytes (SHAKE) or ADRS_c = 22 bytes (SHA2 compressed).
            const COMPRESSED = !!hashOpts.isCompressed;
            const ADDR_BYTES = COMPRESSED ? 22 : 32;
            const SHIFT = COMPRESSED ? 0 : 10;
            const OFFSET_LAYER     = 0  + (COMPRESSED ? 0 : 3);
            const OFFSET_TREE      = 1  + (COMPRESSED ? 0 : 7);
            const OFFSET_TYPE      = 9  + SHIFT;
            const OFFSET_KP_ADDR2  = 12 + SHIFT;
            const OFFSET_KP_ADDR1  = 13 + SHIFT;
            const OFFSET_CHAIN_ADDR= 17 + SHIFT;
            const OFFSET_TREE_INDEX= 18 + SHIFT;
            const OFFSET_HASH_ADDR = 21 + SHIFT;

            // Mutate `addr` in place. Maps logical fields to their FIPS 205 byte
            // offsets (FIPS 205 §4.2 - ADRS structure). height/chain and index/hash
            // share the same word, callers must not mix meanings.
            function _setAddr(opts, addr) {
                if (addr === undefined) addr = new Uint8Array(ADDR_BYTES);
                if (opts.subtreeAddr) addr.set(opts.subtreeAddr.subarray(0, OFFSET_TREE + 8));
                if (opts.height !== undefined) addr[OFFSET_CHAIN_ADDR] = opts.height;
                if (opts.layer  !== undefined) addr[OFFSET_LAYER] = opts.layer;
                if (opts.type   !== undefined) addr[OFFSET_TYPE] = opts.type;
                if (opts.chain  !== undefined) addr[OFFSET_CHAIN_ADDR] = opts.chain;
                if (opts.hash   !== undefined) addr[OFFSET_HASH_ADDR] = opts.hash;
                if (opts.index  !== undefined) _writeU32BE(addr, OFFSET_TREE_INDEX, opts.index >>> 0);
                if (opts.tree   !== undefined) _writeU64BE(addr, OFFSET_TREE, opts.tree);
                if (opts.keypair !== undefined) {
                    addr[OFFSET_KP_ADDR1] = opts.keypair & 0xff;
                    if (TREE_HEIGHT > 8) addr[OFFSET_KP_ADDR2] = (opts.keypair >>> 8) & 0xff;
                }
                if (opts.keypairAddr) {
                    addr.set(opts.keypairAddr.subarray(0, OFFSET_TREE + 8));
                    addr[OFFSET_KP_ADDR1] = opts.keypairAddr[OFFSET_KP_ADDR1];
                    if (TREE_HEIGHT > 8) addr[OFFSET_KP_ADDR2] = opts.keypairAddr[OFFSET_KP_ADDR2];
                }
                return addr;
            }

            // WOTS chain length checksum (Algorithm 7 chainLengths).
            function _chainLengths(msg) {
                const W1 = _base2b(msg, WOTS_LOGW, WOTS_LEN1);
                let csum = 0;
                for (let i = 0; i < W1.length; i++) csum += W - 1 - W1[i];
                csum <<= (8 - ((WOTS_LEN2 * WOTS_LOGW) % 8)) % 8;
                const csumBytes = new Uint8Array(Math.ceil((WOTS_LEN2 * WOTS_LOGW) / 8));
                let v = csum >>> 0;
                for (let i = csumBytes.length - 1; i >= 0; i--) {
                    csumBytes[i] = v & 0xff;
                    v >>>= 8;
                }
                const W2 = _base2b(csumBytes, WOTS_LOGW, WOTS_LEN2);
                const lengths = new Uint32Array(WOTS_LEN);
                lengths.set(W1);
                lengths.set(W2, W1.length);
                return lengths;
            }

            // Hmsg coder lengths (FIPS 205 Algorithm 22): m bytes split into
            // md (ceil(K*A/8)), tmpIdxTree (ceil((H-h')/8)), tmpIdxLeaf (ceil(h'/8)).
            const TREE_BITS = TREE_HEIGHT * (D - 1);
            const LEAF_BITS = TREE_HEIGHT;
            const MD_BYTES = Math.ceil((A * K) / 8);
            const IDX_TREE_BYTES = Math.ceil(TREE_BITS / 8);
            const IDX_LEAF_BYTES = Math.ceil(LEAF_BITS / 8);
            const M_BYTES = MD_BYTES + IDX_TREE_BYTES + IDX_LEAF_BYTES;

            function _hashMessage(ctx, R, pk, msg) {
                const digest = ctx.Hmsg(R, pk, msg, M_BYTES);
                const md = digest.subarray(0, MD_BYTES);
                const tIdxTree = digest.subarray(MD_BYTES, MD_BYTES + IDX_TREE_BYTES);
                const tIdxLeaf = digest.subarray(MD_BYTES + IDX_TREE_BYTES);
                const tree = _readBigBE(tIdxTree) & _maskBig(TREE_BITS);
                const leafIdx = Number(_readBigBE(tIdxLeaf) & _maskBig(LEAF_BITS));
                return { tree, leafIdx, md };
            }

            // Bind (pkSeed[, skSeed]) to one of the §11.x context factories.
            function _ctx(pkSeed, skSeed) {
                return makeContext(p, pkSeed, skSeed);
            }

            // Iterative XMSS treehash (FIPS 205 Algorithm 9 / 10) with optional
            // auth-path capture. `leafFn(leafIdx, addrOffset, ctx, info)` returns
            // the leaf hash for the given idx; auth path is captured for `leafIdx`.
            function _treehash(height, leafFn, ctx, leafIdx, idxOffset, treeAddr, info) {
                const maxIdx = (1 << height) - 1;
                const stack = new Uint8Array(height * N);
                const authPath = new Uint8Array(height * N);
                for (let idx = 0; ; idx++) {
                    const current = new Uint8Array(2 * N);
                    const cur0 = current.subarray(0, N);
                    const cur1 = current.subarray(N);
                    const addrOffset = idx + idxOffset;
                    cur1.set(leafFn(leafIdx, addrOffset, ctx, info));
                    let h = 0;
                    let i = idx, o = idxOffset, l = leafIdx;
                    for (;; h++, i >>>= 1, l >>>= 1, o >>>= 1) {
                        if (h === height) return { root: new Uint8Array(cur1), authPath };
                        if ((i ^ l) === 1) authPath.subarray(h * N, (h + 1) * N).set(cur1);
                        if ((i & 1) === 0 && idx < maxIdx) break;
                        _setAddr({ height: h + 1, index: (i >> 1) + (o >> 1) }, treeAddr);
                        cur0.set(stack.subarray(h * N, (h + 1) * N));
                        cur1.set(ctx.thashN(2, current, treeAddr));
                    }
                    stack.subarray(h * N, (h + 1) * N).set(cur1);
                }
            }

            // WOTS leaf used by XMSS: hash one keypair to its WOTS public key,
            // capturing the partial chain at `wotsSteps[i]` when this is the
            // signed leaf. `wotsKmask = ~0` suppresses capture (pure pk path).
            //
            // ## Constant-time WOTS+ chain (FIPS 205 §5)
            //
            // The inner `for (k = 0; ; k++)` chain always iterates the full
            // `W - 1` steps regardless of the leaf's secret content; the
            // only data-dependent branch (`if (k === wotsK) ...`) compares
            // against `wotsSteps[i]` which is derived from the *message
            // digest* (public data), not from the secret key. The PRF
            // expansion and hash steps consume the secret key in
            // fixed-length operations. As a result there is no
            // secret-dependent control flow or memory-access pattern in
            // the chain, and the per-leaf timing is constant in the
            // secret (varies only with the public message digest).
            function _wotsLeaf(leafIdx, addrOffset, ctx, info) {
                const wotsPk = new Uint8Array(WOTS_LEN * N);
                const wotsKmask = (addrOffset === leafIdx) ? 0 : (~0 >>> 0);
                _setAddr({ keypair: addrOffset }, info.leafAddr);
                _setAddr({ keypair: addrOffset }, info.pkAddr);
                for (let i = 0; i < WOTS_LEN; i++) {
                    const wotsK = (info.wotsSteps[i] | wotsKmask) >>> 0;
                    const pk = wotsPk.subarray(i * N, (i + 1) * N);
                    _setAddr({ chain: i, hash: 0, type: ADDR_WOTSPRF }, info.leafAddr);
                    pk.set(ctx.PRFaddr(info.leafAddr));
                    _setAddr({ type: ADDR_WOTS }, info.leafAddr);
                    for (let k = 0; ; k++) {
                        if (k === wotsK) info.wotsSig.subarray(i * N, (i + 1) * N).set(pk);
                        if (k === W - 1) break;
                        _setAddr({ hash: k }, info.leafAddr);
                        pk.set(ctx.thash1(pk, info.leafAddr));
                    }
                }
                return ctx.thashN(WOTS_LEN, wotsPk, info.pkAddr);
            }

            // FORS leaf: PRFaddr at FORSPRF then hash with FORSTREE addr.
            function _forsLeaf(_unused, addrOffset, ctx, forsLeafAddr) {
                _setAddr({ type: ADDR_FORSPRF, index: addrOffset }, forsLeafAddr);
                const prf = ctx.PRFaddr(forsLeafAddr);
                _setAddr({ type: ADDR_FORSTREE }, forsLeafAddr);
                return ctx.thash1(prf, forsLeafAddr);
            }

            // Single hypertree-layer sign: produces (root, sigWots, sigAuth) for
            // the WOTS keypair at `leafIdx` covering message `prevRoot`.
            function _merkleSign(ctx, wotsAddr, treeAddr, leafIdx, prevRoot) {
                if (prevRoot === undefined) prevRoot = new Uint8Array(N);
                _setAddr({ type: ADDR_HASHTREE }, treeAddr);
                const info = {
                    wotsSig: new Uint8Array(WOTS_LEN * N),
                    wotsSteps: _chainLengths(prevRoot),
                    leafAddr: _setAddr({ subtreeAddr: wotsAddr }),
                    pkAddr: _setAddr({ type: ADDR_WOTSPK, subtreeAddr: wotsAddr })
                };
                const { root, authPath } = _treehash(TREE_HEIGHT, _wotsLeaf, ctx, leafIdx, 0, treeAddr, info);
                return { root, sigWots: info.wotsSig, sigAuth: authPath };
            }

            // Recompute root from leaf + auth path (Algorithm 11 / 17 inverse).
            function _computeRoot(leaf, leafIdx, idxOffset, authPath, treeHeight, ctx, addr) {
                const buffer = new Uint8Array(2 * N);
                const b0 = buffer.subarray(0, N);
                const b1 = buffer.subarray(N);
                if ((leafIdx & 1) !== 0) {
                    b1.set(leaf.subarray(0, N));
                    b0.set(authPath.subarray(0, N));
                } else {
                    b0.set(leaf.subarray(0, N));
                    b1.set(authPath.subarray(0, N));
                }
                leafIdx >>>= 1;
                idxOffset >>>= 1;
                for (let i = 0; i < treeHeight - 1; i++, leafIdx >>>= 1, idxOffset >>>= 1) {
                    _setAddr({ height: i + 1, index: leafIdx + idxOffset }, addr);
                    const a = authPath.subarray((i + 1) * N, (i + 2) * N);
                    if ((leafIdx & 1) !== 0) {
                        const h = ctx.thashN(2, buffer, addr);
                        b1.set(h);
                        b0.set(a);
                    } else {
                        const h = ctx.thashN(2, buffer, addr);
                        b0.set(h);
                        b1.set(a);
                    }
                }
                _setAddr({ height: treeHeight, index: leafIdx + idxOffset }, addr);
                return ctx.thashN(2, buffer, addr);
            }

            // FORS treehash with auth-path capture for one chosen leaf.
            function _forsTreehash(ctx, leafIdx, idxOffset, treeAddr, forsLeaf) {
                return _treehash(A, _forsLeaf, ctx, leafIdx, idxOffset, treeAddr, forsLeaf);
            }

            const SEED_BYTES = 3 * N;
            const PK_BYTES = 2 * N;
            const SK_BYTES = 2 * N + PK_BYTES;
            // signature = R(N) || FORS(K * (N + N*A)) || HT(D * (WOTS_LEN*N + TREE_HEIGHT*N))
            const FORS_BYTES = K * (N + N * A);
            const HT_BYTES = D * (WOTS_LEN * N + TREE_HEIGHT * N);
            const SIG_BYTES = N + FORS_BYTES + HT_BYTES;

            function keygen(seed) {
                if (seed === undefined) {
                    seed = random.bytes(SEED_BYTES);
                    if (seed === false) return false;
                } else if (!(seed instanceof Uint8Array) || seed.length !== SEED_BYTES) {
                    console.warn('[crypto] INVALID: slh_dsa.keygen seed must be Uint8Array of length ' + SEED_BYTES);
                    return false;
                }
                const skSeed  = seed.subarray(0, N);
                const skPRF   = seed.subarray(N, 2 * N);
                const pubSeed = seed.subarray(2 * N, 3 * N);
                const ctx = _ctx(pubSeed, skSeed);
                const topTreeAddr = _setAddr({ layer: D - 1 });
                const wotsAddr    = _setAddr({ layer: D - 1 });
                const { root } = _merkleSign(ctx, wotsAddr, topTreeAddr, ~0 >>> 0);
                const publicKey = _concat(pubSeed, root);
                const secretKey = _concat(skSeed, skPRF, publicKey);
                return { publicKey, secretKey };
            }

            // FIPS 205 §10.2 wraps the user message as M' = 0x00 || |ctx| || ctx || msg
            // before feeding it to the internal sign/verify. ctx defaults to empty.
            function _wrapMessage(msg, ctx) {
                const c = ctx || new Uint8Array(0);
                if (c.length > 255) {
                    console.warn('[crypto] INVALID: slh_dsa context must be ≤ 255 bytes');
                    return false;
                }
                const out = new Uint8Array(2 + c.length + msg.length);
                out[0] = 0; out[1] = c.length;
                out.set(c, 2);
                out.set(msg, 2 + c.length);
                return out;
            }

            // ── HashSLH-DSA wrapper (FIPS 205 §10.2.2 Algorithm 24/25) ──
            // Iteration E4 of the FIPS 140-3 upgrade plan.
            //
            //   M' = 0x01 || OctetEncode(|ctx|, 1) || ctx || OID(hashAlg) || PH(message)
            //
            // OID is the DER-encoded ASN.1 OBJECT IDENTIFIER of the hash
            // function (11 bytes : 06 09 60 86 48 01 65 03 04 02 XX). Hash
            // alg names match ACVP convention (`SHA2-`, `SHA3-`, `SHAKE-`).

            const _HASH_OIDS = {
                'SHA2-224':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x04]),
                'SHA2-256':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x01]),
                'SHA2-384':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x02]),
                'SHA2-512':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x03]),
                'SHA2-512/224': new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x05]),
                'SHA2-512/256': new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x06]),
                'SHA3-224':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x07]),
                'SHA3-256':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x08]),
                'SHA3-384':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x09]),
                'SHA3-512':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0A]),
                'SHAKE-128':    new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0B]),
                'SHAKE-256':    new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0C]),
            };

            function _wrapMessageHash(prehash, ctx, hashAlg) {
                const c = ctx || new Uint8Array(0);
                if (c.length > 255) {
                    console.warn('[crypto] INVALID: slh_dsa context must be ≤ 255 bytes');
                    return false;
                }
                const oid = _HASH_OIDS[hashAlg];
                if (!oid) {
                    console.warn('[crypto] INVALID: slh_dsa: unknown hashAlg "' + hashAlg + '"');
                    return false;
                }
                const out = new Uint8Array(2 + c.length + oid.length + prehash.length);
                out[0] = 1; out[1] = c.length;
                out.set(c, 2);
                out.set(oid, 2 + c.length);
                out.set(prehash, 2 + c.length + oid.length);
                return out;
            }

            // PH(msg) per FIPS 205 §10.2.2.1 - caller supplies the hash module.
            // Hash modules from this codebase consume bitArray (NOT Uint8Array)
            // and return bitArrays. SHAKE callables take (data, outBits).
            function _computePh(msg, hashAlg, hashMod) {
                if (!hashMod) {
                    console.warn('[crypto] INVALID: slh_dsa: signPh requires a hashMod');
                    return false;
                }
                const msgBa = (msg instanceof Uint8Array) ? bitArray.ui8_to_ba(msg) : msg;
                if (hashAlg === 'SHAKE-128' || hashAlg === 'SHAKE-256') {
                    if (typeof hashMod !== 'function') {
                        console.warn('[crypto] INVALID: slh_dsa: SHAKE hashMod must be a callable (data, outBits)');
                        return false;
                    }
                    const outBits = hashAlg === 'SHAKE-128' ? 256 : 512;
                    const ba = hashMod(msgBa, outBits);
                    if (ba === false) return false;
                    return (ba instanceof Uint8Array) ? ba : bitArray.ba_to_ui8(ba);
                }
                if (typeof hashMod.hash !== 'function') {
                    console.warn('[crypto] INVALID: slh_dsa: hashMod must expose .hash(data)');
                    return false;
                }
                const out = hashMod.hash(msgBa);
                return (out instanceof Uint8Array) ? out : bitArray.ba_to_ui8(out);
            }

            // Internal sign - operates on already-wrapped M (per FIPS 205 §6
            // raw, no §10.2 wrapping). Iteration E4 - extracted for reuse by
            // sign / signPh / signInternal.
            function _signCore(M, sk, opts) {
                if (!(sk instanceof Uint8Array) || sk.length !== SK_BYTES) {
                    console.warn('[crypto] INVALID: slh_dsa.sign secretKey length');
                    return false;
                }
                const skSeed = sk.subarray(0, N);
                const skPRF  = sk.subarray(N, 2 * N);
                const pk     = sk.subarray(2 * N, 2 * N + PK_BYTES);
                const pkSeed = pk.subarray(0, N);

                let rnd;
                const extra = opts && opts.extraEntropy;
                if (extra === false) rnd = new Uint8Array(pkSeed); // deterministic
                else if (extra === undefined) {
                    rnd = random.bytes(N);
                    if (rnd === false) return false;
                } else {
                    if (!(extra instanceof Uint8Array) || extra.length !== N) {
                        console.warn('[crypto] INVALID: slh_dsa.sign extraEntropy length');
                        return false;
                    }
                    rnd = new Uint8Array(extra);
                }

                const ctx = _ctx(pkSeed, skSeed);
                const R = ctx.PRFmsg(skPRF, rnd, M);
                let { tree, leafIdx, md } = _hashMessage(ctx, R, pk, M);

                const wotsAddr = _setAddr({ type: ADDR_WOTS, tree, keypair: leafIdx });
                const indices = _base2b(md, A, K);

                // FORS signatures: per-tree (PRF leaf || auth path).
                const forsBlock = new Uint8Array(FORS_BYTES);
                const roots = new Uint8Array(K * N);
                const forsLeaf = _setAddr({ keypairAddr: wotsAddr });
                const forsTreeAddr = _setAddr({ keypairAddr: wotsAddr });
                for (let i = 0; i < K; i++) {
                    const idxOffset = i << A;
                    _setAddr({ type: ADDR_FORSPRF, height: 0, index: indices[i] + idxOffset }, forsTreeAddr);
                    const prf = ctx.PRFaddr(forsTreeAddr);
                    _setAddr({ type: ADDR_FORSTREE }, forsTreeAddr);
                    const { root, authPath } = _forsTreehash(ctx, indices[i], idxOffset, forsTreeAddr, forsLeaf);
                    const off = i * (N + N * A);
                    forsBlock.subarray(off, off + N).set(prf);
                    forsBlock.subarray(off + N, off + N + N * A).set(authPath);
                    roots.subarray(i * N, (i + 1) * N).set(root);
                }
                const forsPkAddr = _setAddr({ type: ADDR_FORSPK, keypairAddr: wotsAddr });
                let curRoot = ctx.thashN(K, roots, forsPkAddr);

                // HT (hypertree) WOTS signatures across D layers.
                const htBlock = new Uint8Array(HT_BYTES);
                const treeAddr = _setAddr({ type: ADDR_HASHTREE });
                for (let i = 0; i < D; i++) {
                    _setAddr({ tree, layer: i }, treeAddr);
                    _setAddr({ subtreeAddr: treeAddr, keypair: leafIdx }, wotsAddr);
                    const { sigWots, sigAuth, root } = _merkleSign(ctx, wotsAddr, treeAddr, leafIdx, curRoot);
                    const off = i * (WOTS_LEN * N + TREE_HEIGHT * N);
                    htBlock.subarray(off, off + WOTS_LEN * N).set(sigWots);
                    htBlock.subarray(off + WOTS_LEN * N, off + WOTS_LEN * N + TREE_HEIGHT * N).set(sigAuth);
                    curRoot = root;
                    leafIdx = Number(tree & _maskBig(TREE_HEIGHT));
                    tree >>= BigInt(TREE_HEIGHT);
                }

                return _concat(R, forsBlock, htBlock);
            }

            /** Pure SLH-DSA sign (FIPS 205 §10.2.1 with §6 internal). */
            function sign(msg, sk, opts) {
                const M = _wrapMessage(msg, opts && opts.context);
                if (M === false) return false;
                return _signCore(M, sk, opts);
            }

            /** HashSLH-DSA sign (FIPS 205 §10.2.2 algorithm 24). */
            function signPh(msg, sk, hashAlg, hashMod, opts) {
                const ph = _computePh(msg, hashAlg, hashMod);
                if (ph === false) return false;
                const M = _wrapMessageHash(ph, opts && opts.context, hashAlg);
                if (M === false) return false;
                return _signCore(M, sk, opts);
            }

            // Internal verify core - operates on already-wrapped M.
            function _verifyCore(sig, M, publicKey) {
                if (!(sig instanceof Uint8Array) || sig.length !== SIG_BYTES) return false;
                if (!(publicKey instanceof Uint8Array) || publicKey.length !== PK_BYTES) return false;
                const pkSeed = publicKey.subarray(0, N);
                const pubRoot = publicKey.subarray(N, 2 * N);
                const R = sig.subarray(0, N);
                const forsBlock = sig.subarray(N, N + FORS_BYTES);
                const htBlock = sig.subarray(N + FORS_BYTES);
                const ctx = _ctx(pkSeed);
                let { tree, leafIdx, md } = _hashMessage(ctx, R, publicKey, M);

                const wotsAddr = _setAddr({ type: ADDR_WOTS, tree, keypair: leafIdx });
                const indices = _base2b(md, A, K);
                const roots = new Uint8Array(K * N);
                const forsTreeAddr = _setAddr({ type: ADDR_FORSTREE, keypairAddr: wotsAddr });
                for (let i = 0; i < K; i++) {
                    const off = i * (N + N * A);
                    const prf = forsBlock.subarray(off, off + N);
                    const authPath = forsBlock.subarray(off + N, off + N + N * A);
                    const idxOffset = i << A;
                    _setAddr({ height: 0, index: indices[i] + idxOffset }, forsTreeAddr);
                    const leaf = ctx.thash1(prf, forsTreeAddr);
                    roots.subarray(i * N, (i + 1) * N).set(
                        _computeRoot(leaf, indices[i], idxOffset, authPath, A, ctx, forsTreeAddr)
                    );
                }
                const forsPkAddr = _setAddr({ type: ADDR_FORSPK, keypairAddr: wotsAddr });
                let curRoot = ctx.thashN(K, roots, forsPkAddr);

                const treeAddr = _setAddr({ type: ADDR_HASHTREE });
                const wotsPkAddr = _setAddr({ type: ADDR_WOTSPK });
                const wotsPk = new Uint8Array(WOTS_LEN * N);
                for (let i = 0; i < D; i++) {
                    const off = i * (WOTS_LEN * N + TREE_HEIGHT * N);
                    const wotsSig = htBlock.subarray(off, off + WOTS_LEN * N);
                    const sigAuth = htBlock.subarray(off + WOTS_LEN * N, off + WOTS_LEN * N + TREE_HEIGHT * N);
                    _setAddr({ tree, layer: i }, treeAddr);
                    _setAddr({ subtreeAddr: treeAddr, keypair: leafIdx }, wotsAddr);
                    _setAddr({ keypairAddr: wotsAddr }, wotsPkAddr);
                    const lengths = _chainLengths(curRoot);
                    for (let j = 0; j < WOTS_LEN; j++) {
                        _setAddr({ chain: j }, wotsAddr);
                        const start = lengths[j];
                        const steps = W - 1 - start;
                        const out = wotsPk.subarray(j * N, (j + 1) * N);
                        out.set(wotsSig.subarray(j * N, (j + 1) * N));
                        for (let k = start; k < start + steps && k < W; k++) {
                            _setAddr({ hash: k }, wotsAddr);
                            out.set(ctx.thash1(out, wotsAddr));
                        }
                    }
                    const leaf = ctx.thashN(WOTS_LEN, wotsPk, wotsPkAddr);
                    curRoot = _computeRoot(leaf, leafIdx, 0, sigAuth, TREE_HEIGHT, ctx, treeAddr);
                    leafIdx = Number(tree & _maskBig(TREE_HEIGHT));
                    tree >>= BigInt(TREE_HEIGHT);
                }
                return _equal(curRoot, pubRoot);
            }

            /** Pure SLH-DSA verify (FIPS 205 §10.2.1). */
            function verify(sig, msg, publicKey, opts) {
                const M = _wrapMessage(msg, opts && opts.context);
                if (M === false) return false;
                return _verifyCore(sig, M, publicKey);
            }

            /** HashSLH-DSA verify (FIPS 205 §10.2.2 algorithm 25). */
            function verifyPh(sig, msg, publicKey, hashAlg, hashMod, opts) {
                const ph = _computePh(msg, hashAlg, hashMod);
                if (ph === false) return false;
                const M = _wrapMessageHash(ph, opts && opts.context, hashAlg);
                if (M === false) return false;
                return _verifyCore(sig, M, publicKey);
            }

            return {
                lengths: { publicKey: PK_BYTES, secretKey: SK_BYTES, signature: SIG_BYTES, seed: SEED_BYTES },
                keygen,
                sign, verify,
                // Iteration E4 of the FIPS 140-3 upgrade plan - HashSLH-DSA
                // (FIPS 205 §10.2.2 algorithms 24 + 25).
                signPh, verifyPh,
                // Internal escape hatches (test-only). Bypass §10.2 wrapping ;
                // M is passed as-is to _signCore / _verifyCore. Used by ACVP
                // signatureInterface=internal vectors.
                _internal: {
                    signInternal:    (M, sk, opts) => _signCore(M, sk, opts),
                    verifyInternal:  (sig, M, pk) => _verifyCore(sig, M, pk),
                    wrapMessage:     _wrapMessage,
                    wrapMessageHash: _wrapMessageHash,
                    computePh:       _computePh
                }
            };
        }

        return {
            slh_dsa_shake_128f: _makeVariant(PARAMS['128f'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_shake_128s: _makeVariant(PARAMS['128s'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_shake_192f: _makeVariant(PARAMS['192f'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_shake_192s: _makeVariant(PARAMS['192s'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_shake_256f: _makeVariant(PARAMS['256f'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_shake_256s: _makeVariant(PARAMS['256s'], _shakeContextOpts, _makeShakeContext),
            slh_dsa_sha2_128f:  _makeVariant(PARAMS['128f'], _sha2ContextOpts,  _makeSha2Context),
            slh_dsa_sha2_128s:  _makeVariant(PARAMS['128s'], _sha2ContextOpts,  _makeSha2Context),
            slh_dsa_sha2_192f:  _makeVariant(PARAMS['192f'], _sha2ContextOpts,  _makeSha2Context),
            slh_dsa_sha2_192s:  _makeVariant(PARAMS['192s'], _sha2ContextOpts,  _makeSha2Context),
            slh_dsa_sha2_256f:  _makeVariant(PARAMS['256f'], _sha2ContextOpts,  _makeSha2Context),
            slh_dsa_sha2_256s:  _makeVariant(PARAMS['256s'], _sha2ContextOpts,  _makeSha2Context)
        };
    }
};
