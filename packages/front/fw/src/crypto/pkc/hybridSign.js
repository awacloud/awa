// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Composite (hybrid PQ/T) signatures — `draft-ietf-lamps-pq-composite-sigs`.
 *
 * Productises the W0 spike (`ai/plans/pqc-hybrid/spikes/w0-combiners/FINDINGS.md`,
 * verdict GO) into an `@awacloud/fw` DI-factory module composing ONLY vetted fw
 * primitives — no novel cryptography. Two registered variants:
 *
 *   - `mldsa65_ed25519`   — ML-DSA-65 ∧ Ed25519      (OID 1.3.6.1.5.5.7.6.48)
 *   - `mldsa65_ecdsaP256` — ML-DSA-65 ∧ ECDSA-P-256  (OID 1.3.6.1.5.5.7.6.45)
 *
 * ## Construction (FROZEN, vector-verified)
 *
 * Both components sign the SAME representative message
 *
 *   M' = Prefix || Label || len(ctx) || ctx || PH(M)                 [draft §5.3]
 *     Prefix = ASCII "CompositeAlgorithmSignatures2025"  (32 bytes)   [draft §5.2]
 *     Label  = the per-variant ASCII label               (see LABELS) [draft §11]
 *     len(ctx) = one byte (ctx is 0..255 bytes); ctx = caller context (default ∅)
 *     PH(M)  = SHA-512(M)
 *
 *   sig_ML-DSA  = ML-DSA-65.Sign(M', mldsa_ctx = Label)   (pure, FIPS 204 Alg 2)
 *   sig_trad    = Ed25519.Sign(M')            (its own ctx unused), OR
 *                 ECDSA-P256.Sign(SHA-256(M'))            (DER-encoded r,s)
 *
 * Composite verify = AND of both component verifies over the reconstructed M'
 * (draft §5.4). Any stripped / swapped / tampered component ⇒ reject (no
 * downgrade). The current draft (main commit 1bb9f5c6, retained by the numbered
 * revision -19) has NO per-signature randomizer `r` and uses an ASCII `Label`
 * (not a DER-OID Domain). This exact wiring reproduces the official LAMPS
 * interop vectors — do not deviate.
 *
 * ## Digest domain (W1 carry-forward c)
 *
 * fw's pure-JS `sha512.hash()` consumes a **bitArray** (word-packed `number[]`),
 * NOT a raw `Uint8Array`. This module hashes message bytes through the bitArray
 * domain (`_ui8ToBa` / `_baToUi8`, the SJCL big-endian packing) before hashing.
 * Feeding raw bytes yields a wrong-but-deterministic digest that passes a
 * self-consistent round-trip yet fails official vectors — a green round-trip is
 * NOT evidence of a correct digest, only the official vectors are.
 *
 * ## Encoding (§3)
 *
 * Wire/at-rest public and secret keys use a **length-prefixed TLV**
 * (`schemeId(1) || u16(len) || component …`) so a parser cannot be tricked into
 * re-slicing composite bytes (guards component-splicing). The Ed25519 composite
 * signature is fixed slices `mldsaSig(3309) || edSig(64)` (identical to the
 * official wire form). The ECDSA-P256 signature length-prefixes its
 * variable-length DER component: `mldsaSig(3309) || u16(derLen) || DER`.
 *
 * ## Limits & non-claims (§6/§9)
 *
 *   - NOT FIPS-validated as a composite; the underlying ML-DSA / Ed25519 / ECDSA
 *     primitives carry their own validation status.
 *   - Zeroization is BEST-EFFORT only: JS cannot guarantee a wipe (GC copies, no
 *     `mlock`, JIT-resident intermediates). Never a security guarantee.
 *   - Constant-time is NOT a security boundary in browser JS/WASM (JIT, GC). The
 *     ECDSA-P256 scalar path in fw `ecc` is windowed (cache-timing sensitive).
 *   - Vectors are pinned to `main` commit 1bb9f5c6 (see the vendored vector files).
 *
 * @see ai/plans/pqc-hybrid/spikes/w0-combiners/FINDINGS.md
 */

import { ml_dsa } from './ml_dsa.js';
import { ed25519 } from './ed25519.js';
import { ecc } from './ecc.js';
import { sha512 } from '../hash/sha512.js';
import { sha256 } from '../hash/sha256.js';
import { random } from '../utils/random.js';
import { utf8 } from '../../io/codec/utf8.js';

/**
 * One composite-signature variant.
 * @typedef {object} HybridSignVariant
 * @property {object} lengths Component and container byte lengths.
 * @property {() => ({ publicKey: Uint8Array, secretKey: Uint8Array }|false)} keygen
 *   Generate a composite key pair (independent per-component seeds). TLV-encoded.
 * @property {(secretKey: Uint8Array, message: Uint8Array, ctx?: Uint8Array) => (Uint8Array|false)} sign
 *   Composite sign; `false` on invalid input.
 * @property {(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, ctx?: Uint8Array) => boolean} verify
 *   Composite verify (AND of both components); `false` on any invalid input.
 */

/**
 * Public surface of `hybridSign.factory(...)`.
 * @typedef {object} HybridSignApi
 * @property {HybridSignVariant} mldsa65_ed25519 ML-DSA-65 ∧ Ed25519.
 * @property {HybridSignVariant} mldsa65_ecdsaP256 ML-DSA-65 ∧ ECDSA-P-256.
 * @property {object} _internal Test-only escape hatch.
 */

export const hybridSign = {
    name: 'hybridSign',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    // NOTE — `sha256` and `random` extend the W0 FINDINGS §2 dependency sketch
    // (`ml_dsa,ed25519,ecc,sha512,utf8`). Both are load-bearing and vector-/
    // implementation-justified: the ECDSA-P256 component hashes M' with SHA-256
    // (proven against the official vectors — SHA-512/384 fail), and Ed25519
    // keygen needs a 32-byte seed (fw `ed25519` has no entropy source of its own,
    // unlike `ml_dsa`/`ecc` which self-seed). Flagged for human ratification.
    dependencies: ['ml_dsa', 'ed25519', 'ecc', 'sha512', 'sha256', 'random', 'utf8'],
    deps: [ml_dsa, ed25519, ecc, sha512, sha256, random, utf8],

    /**
     * @param {*} ml_dsa
     * @param {*} ed25519
     * @param {*} ecc
     * @param {*} sha512
     * @param {*} sha256
     * @param {*} random
     * @param {*} utf8
     * @returns {HybridSignApi}
     */
    factory(ml_dsa, ed25519, ecc, sha512, sha256, random, utf8) {

        const MLDSA = ml_dsa.ml_dsa65;

        // ── Sizes (bytes) ────────────────────────────────────────────
        const MLDSA_PK = 1952;
        const MLDSA_SK = 4032;
        const MLDSA_SIG = 3309;
        const ED_PK = 32;
        const ED_SK = 64;         // seed || pub
        const ED_SIG = 64;
        const EC_PK = 65;         // SEC1 uncompressed 0x04 || X(32) || Y(32)
        const EC_SK = 32;         // raw P-256 scalar

        const SCHEME_ED = 0x01;
        const SCHEME_EC = 0x02;

        // draft §5.2 fixed prefix (scheme-wide domain separation).
        const PREFIX = utf8.toBytes('CompositeAlgorithmSignatures2025');
        // draft §11 per-variant labels (ASCII → bytes). Also the inner ML-DSA ctx.
        // NOTE: the ECDSA label follows algParams.md / the committed vectors, NOT
        // the inconsistent labelsTable.md ("COMPSIG-MLDSA65-P256-SHA512").
        const LABEL_ED = utf8.toBytes('COMPSIG-MLDSA65-Ed25519-SHA512');
        const LABEL_EC = utf8.toBytes('COMPSIG-MLDSA65-ECDSA-P256-SHA512');

        const HEX = '0123456789abcdef';

        // ── byte-domain helpers (pure; replicate bitArray big-endian packing) ──
        // Local wrappers avoid a `bitArray` dependency while still hashing through
        // the correct (word-packed) domain — the fix for the W0 digest-domain bug.
        function _partial(len, x, end) {
            if (len === 32) return x;
            return (end ? x | 0 : x << (32 - len)) + len * 0x10000000000;
        }
        function _ui8ToBa(u8) {
            const out = [];
            let tmp = 0, i;
            for (i = 0; i < u8.length; i++) {
                tmp = tmp << 8 | u8[i];
                if ((i & 3) === 3) { out.push(tmp); tmp = 0; }
            }
            if (i & 3) out.push(_partial(8 * (i & 3), tmp));
            return out;
        }
        function _baToUi8(arr) {
            const out = [];
            let bl = 0, tmp;
            // bitLength: last element may be a partial word.
            if (arr.length) {
                const last = arr[arr.length - 1];
                const lastBits = Math.round(last / 0x10000000000) || 32;
                bl = (arr.length - 1) * 32 + lastBits;
            }
            for (let i = 0; i < bl / 8; i++) {
                if ((i & 3) === 0) tmp = arr[i / 4];
                out.push(tmp >>> 8 >>> 8 >>> 8);
                tmp <<= 8;
            }
            return new Uint8Array(out);
        }
        /** SHA-512 over raw bytes (through the bitArray domain). Returns 64 bytes. */
        function _sha512Bytes(u8) {
            return _baToUi8(sha512.hash(_ui8ToBa(u8)));
        }
        function _concat(chunks) {
            let n = 0;
            for (const c of chunks) n += c.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const c of chunks) { out.set(c, o); o += c.length; }
            return out;
        }
        function _toHex(u8) {
            let s = '';
            for (const b of u8) s += HEX[b >> 4] + HEX[b & 15];
            return s;
        }
        function _u16(n) { return Uint8Array.from([(n >>> 8) & 0xff, n & 0xff]); }

        /** Build the composite representative M' (draft §5.3). PH = SHA-512. */
        function _buildMprime(label, message, ctx) {
            return _concat([PREFIX, label, Uint8Array.from([ctx.length & 0xff]), ctx, _sha512Bytes(message)]);
        }

        // ── TLV container (schemeId || u16 len || component …) ────────
        function _encodeTlv(schemeId, parts) {
            const out = [Uint8Array.from([schemeId])];
            for (const p of parts) { out.push(_u16(p.length)); out.push(p); }
            return _concat(out);
        }
        /**
         * Parse `nParts` length-prefixed components after a 1-byte schemeId.
         * Returns the component subarrays, or `false` on any structural error
         * (wrong scheme, truncation, trailing bytes) — the anti-splice guard.
         */
        function _decodeTlv(bytes, schemeId, nParts) {
            if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes[0] !== schemeId) return false;
            const parts = [];
            let i = 1;
            for (let k = 0; k < nParts; k++) {
                if (i + 2 > bytes.length) return false;
                const len = (bytes[i] << 8) | bytes[i + 1];
                i += 2;
                if (i + len > bytes.length) return false;
                parts.push(bytes.subarray(i, i + len));
                i += len;
            }
            if (i !== bytes.length) return false;   // no trailing / spliced bytes
            return parts;
        }

        // ── DER (ECDSA r,s) ──────────────────────────────────────────
        function _derInt(v) {
            let s = 0;
            while (s < v.length - 1 && v[s] === 0) s++;
            let body = v.subarray(s);
            if (body[0] & 0x80) body = _concat([Uint8Array.from([0]), body]);
            return _concat([Uint8Array.from([0x02, body.length]), body]);
        }
        function _rsToDer(rs) {
            const seq = _concat([_derInt(rs.subarray(0, 32)), _derInt(rs.subarray(32, 64))]);
            if (seq.length > 127) return false;      // P-256 DER SEQUENCE is short-form
            return _concat([Uint8Array.from([0x30, seq.length]), seq]);
        }
        /** DER SEQUENCE{INTEGER r, INTEGER s} → 64-byte r||s, or false. */
        function _derToRs(der) {
            try {
                let i = 0;
                if (der[i++] !== 0x30) return false;
                const seqLen = der[i++];
                if (seqLen & 0x80) return false;      // long form unexpected for P-256
                if (i + seqLen !== der.length) return false;
                const readInt = () => {
                    if (der[i++] !== 0x02) return false;
                    const l = der[i++];
                    if (i + l > der.length) return false;
                    const v = der.subarray(i, i + l);
                    i += l;
                    return v;
                };
                const rB = readInt(); if (rB === false) return false;
                const sB = readInt(); if (sB === false) return false;
                const to32 = (v) => {
                    let s = 0;
                    while (s < v.length - 1 && v[s] === 0) s++;
                    v = v.subarray(s);
                    if (v.length > 32) return false;
                    const o = new Uint8Array(32);
                    o.set(v, 32 - v.length);
                    return o;
                };
                const r32 = to32(rB); if (r32 === false) return false;
                const s32 = to32(sB); if (s32 === false) return false;
                return _concat([r32, s32]);
            } catch (_e) {
                return false;
            }
        }

        // ── ML-DSA component (shared) ────────────────────────────────
        function _mldsaKeygen() {
            const k = MLDSA.keygen();               // self-seeds via `random`
            if (k === false) return false;
            return k;
        }

        // ══════════════════ Ed25519 variant ══════════════════════════
        const P256 = ecc.curves.c256;

        function _edKeygen() {
            const mk = _mldsaKeygen();
            if (mk === false) return false;
            const seed = random.bytes(ED_SK / 2);   // 32-byte independent seed
            const ek = ed25519.keyPair(seed);
            if (ek === false) return false;
            const publicKey = _encodeTlv(SCHEME_ED, [mk.publicKey, ek.publicKey]);
            const secretKey = _encodeTlv(SCHEME_ED, [mk.secretKey, ek.privateKey]);
            // best-effort zeroization of the transient seed (see §6 — not a guarantee)
            seed.fill(0);
            return { publicKey, secretKey };
        }

        function _edSign(secretKey, message, ctx) {
            const parts = _decodeTlv(secretKey, SCHEME_ED, 2);
            if (parts === false) return false;
            const [mldsaSk, edSk] = parts;
            if (mldsaSk.length !== MLDSA_SK || edSk.length !== ED_SK) return false;
            const context = ctx || new Uint8Array(0);
            if (context.length > 255) return false;
            const mPrime = _buildMprime(LABEL_ED, message, context);
            const sigMl = MLDSA.sign(mPrime, mldsaSk, LABEL_ED);
            if (sigMl === false) return false;
            const sigEd = ed25519.sign(edSk, mPrime);
            if (sigEd === false) return false;
            return _concat([sigMl, sigEd]);         // fixed slices, no randomizer
        }

        function _edVerify(publicKey, message, signature, ctx) {
            const parts = _decodeTlv(publicKey, SCHEME_ED, 2);
            if (parts === false) return false;
            const [mldsaPk, edPk] = parts;
            if (mldsaPk.length !== MLDSA_PK || edPk.length !== ED_PK) return false;
            if (!(signature instanceof Uint8Array) || signature.length !== MLDSA_SIG + ED_SIG) return false;
            const context = ctx || new Uint8Array(0);
            if (context.length > 255) return false;
            const mPrime = _buildMprime(LABEL_ED, message, context);
            const sigMl = signature.subarray(0, MLDSA_SIG);
            const sigEd = signature.subarray(MLDSA_SIG);
            const okMl = MLDSA.verify(sigMl, mPrime, mldsaPk, LABEL_ED);
            const okEd = ed25519.verify(edPk, mPrime, sigEd);
            return okMl === true && okEd === true;   // AND — both MUST hold
        }

        // ══════════════════ ECDSA-P256 variant ═══════════════════════
        function _ecKeygen() {
            const mk = _mldsaKeygen();
            if (mk === false) return false;
            const kp = ecc.ecdsa.generateKeys(256);  // self-seeds via ecc's bn.random
            if (kp === false) return false;
            const g = kp.pub.get();
            const X = _baToUi8(g.x);
            const Y = _baToUi8(g.y);
            const ecPk = new Uint8Array(EC_PK);
            ecPk[0] = 0x04;
            ecPk.set(X.subarray(Math.max(0, X.length - 32)), 1 + Math.max(0, 32 - X.length));
            ecPk.set(Y.subarray(Math.max(0, Y.length - 32)), 33 + Math.max(0, 32 - Y.length));
            const scRaw = _baToUi8(kp.sec.get());
            const ecSk = new Uint8Array(EC_SK);
            ecSk.set(scRaw.subarray(Math.max(0, scRaw.length - 32)), Math.max(0, 32 - scRaw.length));
            const publicKey = _encodeTlv(SCHEME_EC, [mk.publicKey, ecPk]);
            const secretKey = _encodeTlv(SCHEME_EC, [mk.secretKey, ecSk]);
            scRaw.fill(0);
            return { publicKey, secretKey };
        }

        function _ecSign(secretKey, message, ctx) {
            const parts = _decodeTlv(secretKey, SCHEME_EC, 2);
            if (parts === false) return false;
            const [mldsaSk, ecSk] = parts;
            if (mldsaSk.length !== MLDSA_SK || ecSk.length !== EC_SK) return false;
            const context = ctx || new Uint8Array(0);
            if (context.length > 255) return false;
            const mPrime = _buildMprime(LABEL_EC, message, context);
            const sigMl = MLDSA.sign(mPrime, mldsaSk, LABEL_EC);
            if (sigMl === false) return false;
            const secObj = ecc.deserialize({ type: 'ecdsa', secretKey: true, curve: 'c256', exponent: _toHex(ecSk) });
            if (secObj === false) return false;
            const eHash = sha256.hash(_ui8ToBa(mPrime));           // ECDSA inner hash
            const rsBits = secObj.sign(eHash, {});                  // RFC 6979 deterministic
            const der = _rsToDer(_baToUi8(rsBits));
            if (der === false) return false;
            return _concat([sigMl, _u16(der.length), der]);        // length-prefixed DER
        }

        function _ecVerify(publicKey, message, signature, ctx) {
            const parts = _decodeTlv(publicKey, SCHEME_EC, 2);
            if (parts === false) return false;
            const [mldsaPk, ecPk] = parts;
            if (mldsaPk.length !== MLDSA_PK || ecPk.length !== EC_PK || ecPk[0] !== 0x04) return false;
            if (!(signature instanceof Uint8Array) || signature.length < MLDSA_SIG + 2) return false;
            const derLen = (signature[MLDSA_SIG] << 8) | signature[MLDSA_SIG + 1];
            if (MLDSA_SIG + 2 + derLen !== signature.length) return false;
            const context = ctx || new Uint8Array(0);
            if (context.length > 255) return false;
            const mPrime = _buildMprime(LABEL_EC, message, context);
            const sigMl = signature.subarray(0, MLDSA_SIG);
            const der = signature.subarray(MLDSA_SIG + 2);
            const okMl = MLDSA.verify(sigMl, mPrime, mldsaPk, LABEL_EC);
            if (okMl !== true) return false;
            const rs = _derToRs(der);
            if (rs === false) return false;
            const point = P256.fromBits(_ui8ToBa(ecPk.subarray(1)));
            if (point === false) return false;
            const pub = new ecc.ecdsa.publicKey(P256, point);
            const eHash = sha256.hash(_ui8ToBa(mPrime));
            const okEc = pub.verify(eHash, _ui8ToBa(rs));
            return okEc === true;
        }

        return {
            mldsa65_ed25519: {
                lengths: Object.freeze({
                    mldsaPk: MLDSA_PK, tradPk: ED_PK, mldsaSk: MLDSA_SK, tradSk: ED_SK,
                    mldsaSig: MLDSA_SIG, tradSig: ED_SIG,
                    publicKey: 1 + 2 + MLDSA_PK + 2 + ED_PK,   // TLV container
                    secretKey: 1 + 2 + MLDSA_SK + 2 + ED_SK,
                    signature: MLDSA_SIG + ED_SIG              // fixed 3373
                }),
                keygen: _edKeygen,
                sign: _edSign,
                verify: _edVerify
            },
            mldsa65_ecdsaP256: {
                lengths: Object.freeze({
                    mldsaPk: MLDSA_PK, tradPk: EC_PK, mldsaSk: MLDSA_SK, tradSk: EC_SK,
                    mldsaSig: MLDSA_SIG,
                    publicKey: 1 + 2 + MLDSA_PK + 2 + EC_PK,   // TLV container
                    secretKey: 1 + 2 + MLDSA_SK + 2 + EC_SK,
                    signature: 'variable'                       // DER component
                }),
                keygen: _ecKeygen,
                sign: _ecSign,
                verify: _ecVerify
            },

            // Test-only escape hatch (mirrors ecc._internal). Not a public API.
            _internal: {
                buildMprime: _buildMprime,
                sha512Bytes: _sha512Bytes,
                ui8ToBa: _ui8ToBa,
                baToUi8: _baToUi8,
                encodeTlv: _encodeTlv,
                decodeTlv: _decodeTlv,
                derToRs: _derToRs,
                labels: { ed: LABEL_ED, ecdsaP256: LABEL_EC },
                schemes: { ed: SCHEME_ED, ecdsaP256: SCHEME_EC }
            }
        };
    }
};
