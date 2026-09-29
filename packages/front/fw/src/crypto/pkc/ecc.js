// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Elliptic-curve cryptography (NIST P-* and Koblitz K-* curves).
 *
 * Provides:
 *   - affine and Jacobian point arithmetic,
 *   - the curve registry (`curves.c192…c521`, `k192…k256`),
 *   - El-Gamal-style KEM/DH (`elGamal`),
 *   - ECDSA sign/verify (`ecdsa`),
 *   - serialize / deserialize for both key types.
 *
 * Origin: the affine / Jacobian point arithmetic, the curve registry and the
 * basic key / ECDSA scaffolding are adapted from the Stanford JavaScript
 * Crypto Library (SJCL), BSD-2-Clause (SJCL is dual-licensed BSD-2-Clause OR
 * GPL-2.0-or-later; the BSD-2-Clause terms are retained, see
 * third-party/NOTICE-sjcl); RFC 6979, the input validation, the ESM factory,
 * JSDoc, tests and every later change are this project's own work. See
 * docs/dev/provenance.md.
 *
 * Hash family for KEM/DH is selectable via the `bits` argument
 * (256 → SHA-256, 384 → SHA-384, 512 → SHA-512).
 *
 * ## Recommended curve subset
 *
 * For new applications, prefer **P-256, P-384, P-521** (FIPS 186-5 §3.2.1).
 * The legacy curves P-192/P-224 and the Koblitz K-* family are exposed for
 * interop with older systems only; they are NOT recommended for new use and
 * P-192 in particular is below the modern 112-bit security floor.
 *
 * ## ECDSA nonce
 *
 * ECDSA signing uses **RFC 6979 deterministic k** by default (see
 * `_rfc6979K`). This eliminates the catastrophic nonce-reuse class of
 * failures even when the host CSPRNG is broken. `opts.deterministic === false`
 * falls back to CSPRNG-derived k.
 *
 * ## Side-channel posture
 *
 * The scalar-multiplication path uses a 4-bit windowed method with a
 * precomputed multiples table (`point.mult` / `point.mult2`). The table
 * index is the scalar nibble, so this is **NOT constant-time against a
 * cache-timing adversary** - secret scalars (ECDSA `k`, ECDH private key)
 * could leak via cache-line access patterns on a co-resident attacker.
 * In a browser/Node JS environment with no shared-cache adversary this is
 * acceptable; for server-side deployments with adversarial co-tenancy,
 * prefer a constant-time implementation (e.g. WebCrypto subtle.* over
 * curves the platform supports, or a Montgomery-ladder X25519 / Ed25519
 * for ECDH / signatures).
 *
 */

/**
 * Affine point instance on a curve.
 * @typedef {object} EccPointInstance
 * @property {boolean} isIdentity
 * @property {*} [x]
 * @property {*} [y]
 * @property {EccCurveInstance} curve
 * @property {() => EccPointJacInstance} toJac
 * @property {(k: *) => EccPointInstance} mult
 * @property {(k: *, k2: *, affine2: EccPointInstance) => EccPointInstance} mult2
 * @property {() => EccPointInstance[]} multiples
 * @property {() => EccPointInstance} negate
 * @property {() => boolean} isValid
 * @property {() => number[]} toBits
 */

/**
 * Constructor for `ecc.point`.
 * @typedef {{ new (curve: EccCurveInstance, x?: *, y?: *): EccPointInstance }} EccPointCtor
 */

/**
 * Jacobian-coordinate point instance.
 * @typedef {object} EccPointJacInstance
 * @property {boolean} isIdentity
 * @property {*} [x]
 * @property {*} [y]
 * @property {*} [z]
 * @property {EccCurveInstance} curve
 * @property {(T: EccPointJacInstance) => (EccPointJacInstance|false)} add
 * @property {() => EccPointJacInstance} doubl
 * @property {() => EccPointInstance} toAffine
 * @property {(k: *, affine: EccPointInstance) => EccPointJacInstance} mult
 * @property {(k1: *, affine: EccPointInstance, k2: *, affine2: EccPointInstance) => EccPointJacInstance} mult2
 * @property {() => EccPointJacInstance} negate
 * @property {() => boolean} isValid
 */

/**
 * Constructor for `ecc.pointJac`. Static method `toAffineMultiple` is also exposed.
 * @typedef {{ new (curve: EccCurveInstance, x?: *, y?: *, z?: *): EccPointJacInstance, toAffineMultiple: (points: EccPointJacInstance[]) => EccPointInstance[] }} EccPointJacCtor
 */

/**
 * Curve instance built via `new ecc.curve(...)`.
 * @typedef {object} EccCurveInstance
 * @property {*} field
 * @property {*} r
 * @property {*} a
 * @property {*} b
 * @property {EccPointInstance} G
 * @property {(bits: number[]) => (EccPointInstance|false)} fromBits
 */

/**
 * Constructor for `ecc.curve`.
 * @typedef {{ new (Field: *, r: *, a: *, b: *, x: *, y: *): EccCurveInstance }} EccCurveCtor
 */

/**
 * Public-key instance shared by `elGamal` and `ecdsa`.
 * @typedef {object} EccPublicKeyInstance
 * @property {() => object} serialize
 * @property {() => { x: number[], y: number[] }} get
 * @property {() => string} getType
 */

/**
 * Constructor for a publicKey (elGamal / ecdsa).
 * @typedef {{ new (curve: EccCurveInstance, point: EccPointInstance|number[]): EccPublicKeyInstance }} EccPublicKeyCtor
 */

/**
 * Secret-key instance shared by `elGamal` and `ecdsa`.
 * @typedef {object} EccSecretKeyInstance
 * @property {() => object} serialize
 * @property {() => number[]} get
 * @property {() => string} getType
 */

/**
 * Constructor for a secretKey (elGamal / ecdsa).
 * @typedef {{ new (curve: EccCurveInstance, exponent: *): EccSecretKeyInstance }} EccSecretKeyCtor
 */

/**
 * Public surface of `ecc.factory(...)`.
 * @typedef {object} EccApi
 * @property {EccPointCtor} point
 * @property {EccPointJacCtor} pointJac
 * @property {EccCurveCtor} curve
 * @property {Object<string, EccCurveInstance>} curves
 * @property {(curve: EccCurveInstance) => (string|false)} curveName
 * @property {(key: object) => (EccPublicKeyInstance|EccSecretKeyInstance|false)} deserialize
 * @property {{ publicKey: EccPublicKeyCtor, secretKey: EccSecretKeyCtor, generateKeys: (cn: string) => Function }} basicKey
 * @property {{ generateKeys: Function, publicKey: EccPublicKeyCtor, secretKey: EccSecretKeyCtor }} elGamal
 * @property {{ generateKeys: Function, publicKey: EccPublicKeyCtor, secretKey: EccSecretKeyCtor }} ecdsa
 * @property {object} _internal
 */

import { bitArray } from '../utils/bitArray.js';
import { hex } from '../../io/codec/hex.js';
import { bn } from '../utils/bn.js';
import { sha256 } from '../hash/sha256.js';
import { sha384 } from '../hash/sha384.js';
import { sha512 } from '../hash/sha512.js';
import { hmac } from '../hash/hmac.js';

export const ecc = {
    name: 'ecc',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['bitArray', 'hex', 'bn', 'sha256', 'sha384', 'sha512', 'hmac'],
    deps: [bitArray, hex, bn, sha256, sha384, sha512, hmac],

    /** @returns {EccApi} */
    factory(bitArray, hex, bn, sha256, sha384, sha512, hmac) {

        const hashes = { 256: sha256, 384: sha384, 512: sha512 };

        function _hashForBits(bits) {
            if (bits <= 256) return sha256;
            if (bits <= 384) return sha384;
            return sha512;
        }

        function _concatBytes(parts) {
            let len = 0;
            for (let i = 0; i < parts.length; i++) len += parts[i].length;
            const out = new Uint8Array(len);
            let off = 0;
            for (let i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
            return out;
        }

        function _hmacBytes(Hash, keyBytes, msgBytes) {
            const m = new hmac.fn(bitArray.ui8_to_ba(keyBytes), Hash);
            return bitArray.ba_to_ui8(m.encrypt(bitArray.ui8_to_ba(msgBytes)));
        }

        function _intToOctets(x, rolen) {
            const bits = x.toBits(rolen * 8);
            const out = bitArray.ba_to_ui8(bits);
            if (out.length === rolen) return out;
            const padded = new Uint8Array(rolen);
            padded.set(out, rolen - out.length);
            return padded;
        }

        function _bitsToInt(bs, qlen) {
            const blen = bitArray.bitLength(bs);
            let truncated = bs;
            if (blen > qlen) truncated = bitArray.clamp(bs, qlen);
            return bn.fromBits(truncated);
        }

        function _bitsToOctets(bs, R, rolen, qlen) {
            const z1 = _bitsToInt(bs, qlen);
            const z2 = z1.greaterEquals(R) ? z1.sub(R).normalize() : z1;
            return _intToOctets(z2, rolen);
        }

        // True (unrounded) bit-length of a positive integer encoded as a
        // big-endian byte array. SJCL `bn.bitLength()` rounds up to the next
        // multiple of 16 (storage radix), which breaks RFC 6979 for P-521
        // where the curve order n has bit-length 521 (not 528). Iteration C2
        // of the FIPS 140-3 upgrade plan - fixes the byte-exact divergence
        // against RFC 6979 §A.2.7 P-521 sample.
        function _trueBitLength(R) {
            const bytes = bitArray.ba_to_ui8(R.toBits());
            let i = 0;
            while (i < bytes.length && bytes[i] === 0) i++;
            if (i === bytes.length) return 0;
            let bits = (bytes.length - i) * 8;
            let b = bytes[i];
            while ((b & 0x80) === 0) { bits--; b = (b << 1) & 0xff; }
            return bits;
        }

        // RFC 6979 §3.2 deterministic k generation.
        function _rfc6979K(hashBits, x, R, Hash) {
            const qlen = _trueBitLength(R);
            const rolen = (qlen + 7) >>> 3;
            const xOct = _intToOctets(x, rolen);
            const hOct = _bitsToOctets(hashBits, R, rolen, qlen);
            const holen = bitArray.bitLength(Hash.hash([])) / 8;

            let V = new Uint8Array(holen).fill(0x01);
            let K = new Uint8Array(holen);
            const z = new Uint8Array([0x00]);
            const o = new Uint8Array([0x01]);

            K = _hmacBytes(Hash, K, _concatBytes([V, z, xOct, hOct]));
            V = _hmacBytes(Hash, K, V);
            K = _hmacBytes(Hash, K, _concatBytes([V, o, xOct, hOct]));
            V = _hmacBytes(Hash, K, V);

            for (;;) {
                let T = new Uint8Array(0);
                while (T.length * 8 < qlen) {
                    V = _hmacBytes(Hash, K, V);
                    T = _concatBytes([T, V]);
                }
                const k = _bitsToInt(bitArray.ui8_to_ba(T), qlen);
                if (!k.equals(0) && !k.greaterEquals(R)) return k;
                K = _hmacBytes(Hash, K, _concatBytes([V, z]));
                V = _hmacBytes(Hash, K, V);
            }
        }

        const ecc = {};

        /**
         * Affine point on a curve.
         * @constructor
         */
        ecc.point = function (curve, x, y) {
            if (x === undefined) {
                this.isIdentity = true;
            } else {
                if (x instanceof bn.bn) x = new curve.field(x);
                if (y instanceof bn.bn) y = new curve.field(y);
                this.x = x;
                this.y = y;
                this.isIdentity = false;
            }
            this.curve = curve;
        };

        ecc.point.prototype = {
            toJac() {
                return new ecc.pointJac(this.curve, this.x, this.y, new this.curve.field(1));
            },

            mult(k) {
                return this.toJac().mult(k, this).toAffine();
            },

            mult2(k, k2, affine2) {
                return this.toJac().mult2(k, this, k2, affine2).toAffine();
            },

            multiples() {
                if (this._multiples === undefined) {
                    let j = this.toJac().doubl();
                    const m = [j];
                    for (let i = 3; i < 16; i++) {
                        j = j.add(this);
                        m.push(j);
                    }
                    this._multiples = [new ecc.point(this.curve), this].concat(ecc.pointJac.toAffineMultiple(m));
                }
                return this._multiples;
            },

            negate() {
                const newY = new this.curve.field(0).sub(this.y).normalize().reduce();
                return new ecc.point(this.curve, this.x, newY);
            },

            isValid() {
                return this.y.square().equals(this.curve.b.add(this.x.mul(this.curve.a.add(this.x.square()))));
            },

            toBits() {
                return bitArray.concat(this.x.toBits(), this.y.toBits());
            }
        };

        /**
         * Jacobian-coordinate point.
         * @constructor
         */
        ecc.pointJac = function (curve, x, y, z) {
            if (x === undefined) {
                this.isIdentity = true;
            } else {
                this.x = x;
                this.y = y;
                this.z = z;
                this.isIdentity = false;
            }
            this.curve = curve;
        };

        ecc.pointJac.toAffineMultiple = function (points) {
            let i = 0, j, p, tmp, z, zi, zi2, curve;
            const ret = new Array(points.length);
            for (; i < points.length; i++) {
                p = points[i];
                if (curve !== p.curve) {
                    if (curve) {
                        for (i = 0; i < points.length; i++) {
                            ret[i] = points[i].toAffine();
                        }
                        return ret;
                    }
                    curve = p.curve;
                }
                if (!p.isIdentity && !p.z.equals(0)) {
                    if (tmp) {
                        // @ts-ignore -- z is always set before tmp becomes truthy
                        tmp.push(z);
                        // @ts-ignore -- z is always defined here (set in else branch before tmp is truthy)
                        z = z.mul(p.z);
                    } else {
                        z = p.z;
                        tmp = [];
                    }
                }
            }
            if (tmp) {
                z = z.inverse();
                j = tmp.length - 1;
            }
            for (i--; i >= 0; i--) {
                p = points[i];
                if (p.isIdentity || p.z.equals(0)) {
                    ret[i] = new ecc.point(p.curve);
                } else {
                    if (j >= 0) {
                        zi = z.mul(tmp[j]);
                        z = z.mul(p.z);
                        j--;
                    } else {
                        zi = z;
                    }
                    zi2 = zi.square();
                    ret[i] = new ecc.point(p.curve, p.x.mul(zi2).fullReduce(), p.y.mul(zi2.mul(zi)).fullReduce());
                }
            }
            return ret;
        };

        ecc.pointJac.prototype = {
            add(T) {
                const S = this;
                if (S.curve !== T.curve) {
                    console.warn('[crypto] INVALID: ecc.add: points must be on the same curve');
                    return false;
                }
                if (S.isIdentity) return T.toJac();
                if (T.isIdentity) return S;

                const sz2 = S.z.square();
                const c = T.x.mul(sz2).subM(S.x);

                if (c.equals(0)) {
                    if (S.y.equals(T.y.mul(sz2.mul(S.z)))) {
                        return S.doubl();
                    }
                    return new ecc.pointJac(S.curve);
                }

                const d = T.y.mul(sz2.mul(S.z)).subM(S.y);
                const c2 = c.square();

                const x1 = d.square();
                const x2 = c.square().mul(c).addM(S.x.add(S.x).mul(c2));
                const x = x1.subM(x2);

                const y1 = S.x.mul(c2).subM(x).mul(d);
                const y2 = S.y.mul(c.square().mul(c));
                const y = y1.subM(y2);

                const z = S.z.mul(c);

                return new ecc.pointJac(this.curve, x, y, z);
            },

            doubl() {
                if (this.isIdentity) return this;

                const y2 = this.y.square();
                const a = y2.mul(this.x.mul(4));
                const b = y2.square().mul(8);
                const z2 = this.z.square();
                const c = this.curve.a.toHex() === (new bn.bn(-3)).toHex()
                    ? this.x.sub(z2).mul(3).mul(this.x.add(z2))
                    : this.x.square().mul(3).add(z2.square().mul(this.curve.a));
                const x = c.square().subM(a).subM(a);
                const y = a.sub(x).mul(c).subM(b);
                const z = this.y.add(this.y).mul(this.z);
                return new ecc.pointJac(this.curve, x, y, z);
            },

            toAffine() {
                if (this.isIdentity || this.z.equals(0)) {
                    return new ecc.point(this.curve);
                }
                const zi = this.z.inverse();
                const zi2 = zi.square();
                return new ecc.point(this.curve, this.x.mul(zi2).fullReduce(), this.y.mul(zi2.mul(zi)).fullReduce());
            },

            mult(k, affine) {
                if (typeof k === 'number') {
                    k = [k];
                } else if (k.limbs !== undefined) {
                    k = k.normalize().limbs;
                }
                let out = new ecc.point(this.curve).toJac();
                const multiples = affine.multiples();

                for (let i = k.length - 1; i >= 0; i--) {
                    for (let j = bn.bn.prototype.radix - 4; j >= 0; j -= 4) {
                        out = out.doubl().doubl().doubl().doubl().add(multiples[k[i] >> j & 0xF]);
                    }
                }
                return out;
            },

            mult2(k1, affine, k2, affine2) {
                if (typeof k1 === 'number') {
                    k1 = [k1];
                } else if (k1.limbs !== undefined) {
                    k1 = k1.normalize().limbs;
                }
                if (typeof k2 === 'number') {
                    k2 = [k2];
                } else if (k2.limbs !== undefined) {
                    k2 = k2.normalize().limbs;
                }

                let out = new ecc.point(this.curve).toJac();
                const m1 = affine.multiples();
                const m2 = affine2.multiples();

                for (let i = Math.max(k1.length, k2.length) - 1; i >= 0; i--) {
                    const l1 = k1[i] | 0;
                    const l2 = k2[i] | 0;
                    for (let j = bn.bn.prototype.radix - 4; j >= 0; j -= 4) {
                        out = out.doubl().doubl().doubl().doubl().add(m1[l1 >> j & 0xF]).add(m2[l2 >> j & 0xF]);
                    }
                }
                return out;
            },

            negate() {
                return this.toAffine().negate().toJac();
            },

            isValid() {
                const z2 = this.z.square();
                const z4 = z2.square();
                const z6 = z4.mul(z2);
                return this.y.square().equals(
                    this.curve.b.mul(z6).add(this.x.mul(
                        this.curve.a.mul(z4).add(this.x.square())))
                );
            }
        };

        /**
         * Build an elliptic curve.
         * @constructor
         */
        ecc.curve = function (Field, r, a, b, x, y) {
            this.field = Field;
            this.r = new bn.bn(r);
            this.a = new Field(a);
            this.b = new Field(b);
            this.G = new ecc.point(this, new Field(x), new Field(y));
        };

        ecc.curve.prototype.fromBits = function (bits) {
            const l = this.field.prototype.exponent + 7 & -8;
            const p = new ecc.point(this,
                this.field.fromBits(bitArray.bitSlice(bits, 0, l)),
                this.field.fromBits(bitArray.bitSlice(bits, l, 2 * l)));
            if (!p.isValid()) {
                console.error('[crypto] CORRUPT: ecc: point not on the curve');
                return false;
            }
            return p;
        };

        ecc.curves = {
            c192: new ecc.curve(
                bn.prime.p192,
                '0xffffffffffffffffffffffff99def836146bc9b1b4d22831',
                -3,
                '0x64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1',
                '0x188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012',
                '0x07192b95ffc8da78631011ed6b24cdd573f977a11e794811'),

            c224: new ecc.curve(
                bn.prime.p224,
                '0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3d',
                -3,
                '0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4',
                '0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21',
                '0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34'),

            c256: new ecc.curve(
                bn.prime.p256,
                '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
                -3,
                '0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b',
                '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
                '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),

            c384: new ecc.curve(
                bn.prime.p384,
                '0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973',
                -3,
                '0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef',
                '0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7',
                '0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f'),

            c521: new ecc.curve(
                bn.prime.p521,
                '0x1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA51868783BF2F966B7FCC0148F709A5D03BB5C9B8899C47AEBB6FB71E91386409',
                -3,
                '0x051953EB9618E1C9A1F929A21A0B68540EEA2DA725B99B315F3B8B489918EF109E156193951EC7E937B1652C0BD3BB1BF073573DF883D2C34F1EF451FD46B503F00',
                '0xC6858E06B70404E9CD9E3ECB662395B4429C648139053FB521F828AF606B4D3DBAA14B5E77EFE75928FE1DC127A2FFA8DE3348B3C1856A429BF97E7E31C2E5BD66',
                '0x11839296A789A3BC0045C8A5FB42C7D1BD998F54449579B446817AFBD17273E662C97EE72995EF42640C550B9013FAD0761353C7086A272C24088BE94769FD16650'),

            k192: new ecc.curve(
                bn.prime.p192k,
                '0xfffffffffffffffffffffffe26f2fc170f69466a74defd8d',
                0,
                3,
                '0xdb4ff10ec057e9ae26b07d0280b7f4341da5d1b1eae06c7d',
                '0x9b2f2f6d9c5628a7844163d015be86344082aa88d95e2f9d'),

            k224: new ecc.curve(
                bn.prime.p224k,
                '0x010000000000000000000000000001dce8d2ec6184caf0a971769fb1f7',
                0,
                5,
                '0xa1455b334df099df30fc28a169a467e9e47075a90f7e650eb6b7a45c',
                '0x7e089fed7fba344282cafbd6f7e319f7c0b0bd59e2ca4bdb556d61a5'),

            k256: new ecc.curve(
                bn.prime.p256k,
                '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
                0,
                7,
                '0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
                '0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8')
        };

        ecc.curveName = function (curve) {
            for (const name in ecc.curves) {
                if (Object.prototype.hasOwnProperty.call(ecc.curves, name) && ecc.curves[name] === curve) {
                    return name;
                }
            }
            console.warn('[crypto] INVALID: ecc: no such curve');
            return false;
        };

        // FIPS 186-5 §A.4.2 / SP 800-56A Rev.3 §5.6.2.3.3 - full public-key
        // validation:
        //   (1) x, y ∈ [0, p) (coordinates within the field range - must be
        //       checked against the *raw* encoded value, not the SJCL field
        //       representation which may carry a denormalized integer >= p
        //       satisfying the curve equation modulo p).
        //   (2) point is on the curve (`y² = b + x(a + x²)` mod p).
        //   (3) point is not the identity.
        //   (4) point lies in the prime-order subgroup `<G>` (i.e. `n·Q == O`).
        // For NIST P-curves the cofactor is 1, so (4) is implied by (2)+(3),
        // but we still check explicitly to defend against twist attacks and
        // cofactor>1 curves (Koblitz K-*).
        function _coordsInRange(bits, curve) {
            const halfBits = curve.field.prototype.exponent + 7 & -8;
            const xBn = bn.fromBits(bitArray.bitSlice(bits, 0, halfBits));
            const yBn = bn.fromBits(bitArray.bitSlice(bits, halfBits, 2 * halfBits));
            const p = curve.field.modulus;
            return !xBn.greaterEquals(p) && !yBn.greaterEquals(p);
        }

        function _isInSubgroup(point, curve) {
            if (!point || point === false) return false;
            if (point.isIdentity) return false;        // O is not a valid pk
            if (!point.isValid()) return false;        // not on the curve
            const result = point.mult(curve.r);
            return !!result && result.isIdentity;       // n·Q must be the identity
        }

        ecc.deserialize = function (key) {
            const types = ['elGamal', 'ecdsa'];

            if (!key || !key.curve || !ecc.curves[key.curve]) {
                console.warn('[crypto] INVALID: ecc: invalid serialization');
                return false;
            }
            if (types.indexOf(key.type) === -1) {
                console.warn('[crypto] INVALID: ecc: invalid type');
                return false;
            }

            const curve = ecc.curves[key.curve];

            if (key.secretKey) {
                if (!key.exponent) {
                    console.warn('[crypto] INVALID: ecc: invalid exponent');
                    return false;
                }
                const exponent = new bn.bn(key.exponent);
                return new ecc[key.type].secretKey(curve, exponent);
            }

            if (!key.point) {
                console.warn('[crypto] INVALID: ecc: invalid point');
                return false;
            }
            const ptBits = bitArray.ui8_to_ba(hex.toBytes(key.point));
            if (!_coordsInRange(ptBits, curve)) {
                console.warn('[crypto] INVALID: ecc: x or y coordinate out of field range');
                return false;
            }
            const point = curve.fromBits(ptBits);
            if (point === false) {
                // fromBits already logged a CORRUPT message
                return false;
            }
            if (!_isInSubgroup(point, curve)) {
                console.warn('[crypto] INVALID: ecc: public key not in the main subgroup (n·Q != O)');
                return false;
            }
            return new ecc[key.type].publicKey(curve, point);
        };

        ecc.basicKey = {
            publicKey: function (curve, point) {
                this._curve = curve;
                this._curveBitLength = curve.r.bitLength();
                if (point instanceof Array) {
                    this._point = curve.fromBits(point);
                } else {
                    this._point = point;
                }

                this.serialize = function () {
                    const curveName = ecc.curveName(curve);
                    return {
                        type: this.getType(),
                        secretKey: false,
                        point: hex.fromBytes(bitArray.ba_to_ui8(this._point.toBits())),
                        curve: curveName
                    };
                };

                this.get = function () {
                    const pointbits = this._point.toBits();
                    const len = bitArray.bitLength(pointbits);
                    const x = bitArray.bitSlice(pointbits, 0, len / 2);
                    const y = bitArray.bitSlice(pointbits, len / 2);
                    return { x, y };
                };
            },

            secretKey: function (curve, exponent) {
                this._curve = curve;
                this._curveBitLength = curve.r.bitLength();
                this._exponent = exponent;

                this.serialize = function () {
                    const exp = this.get();
                    const curveName = ecc.curveName(curve);
                    return {
                        type: this.getType(),
                        secretKey: true,
                        exponent: hex.fromBytes(bitArray.ba_to_ui8(exp)),
                        curve: curveName
                    };
                };

                this.get = function () {
                    return this._exponent.toBits();
                };
            }
        };

        ecc.basicKey.generateKeys = function (cn) {
            return function generateKeys(curve, paranoia, sec) {
                curve = curve || 256;

                if (typeof curve === 'number') {
                    curve = ecc.curves['c' + curve];
                    if (curve === undefined) {
                        console.warn('[crypto] INVALID: ecc: no such curve');
                        return false;
                    }
                }
                sec = sec || bn.random(curve.r, paranoia);

                const pub = curve.G.mult(sec);
                return {
                    pub: new ecc[cn].publicKey(curve, pub),
                    sec: new ecc[cn].secretKey(curve, sec)
                };
            };
        };

        ecc.elGamal = {
            generateKeys: ecc.basicKey.generateKeys('elGamal'),
            publicKey: function (curve, point) {
                ecc.basicKey.publicKey.apply(this, arguments);
            },
            secretKey: function (curve, exponent) {
                ecc.basicKey.secretKey.apply(this, arguments);
            }
        };

        ecc.elGamal.publicKey.prototype = {
            kem(paranoia, bits = 256) {
                const sec = bn.random(this._curve.r, paranoia);
                const tag = this._curve.G.mult(sec).toBits();
                const h = hashes[bits] || sha256;
                const key = h.hash(this._point.mult(sec).toBits());
                return { key, tag };
            },

            getType() { return 'elGamal'; }
        };

        ecc.elGamal.secretKey.prototype = {
            unkem(tag, bits = 256) {
                const h = hashes[bits] || sha256;
                return h.hash(this._curve.fromBits(tag).mult(this._exponent).toBits());
            },

            dh(pk, bits = 256) {
                const h = hashes[bits] || sha256;
                return h.hash(pk._point.mult(this._exponent).toBits());
            },

            dhJavaEc(pk) {
                return pk._point.mult(this._exponent).x.toBits();
            },

            getType() { return 'elGamal'; }
        };

        ecc.ecdsa = {
            generateKeys: ecc.basicKey.generateKeys('ecdsa')
        };

        ecc.ecdsa.publicKey = function (curve, point) {
            ecc.basicKey.publicKey.apply(this, arguments);
        };

        ecc.ecdsa.publicKey.prototype = {
            // Verify ECDSA signature `rs` (r||s) over `hash`.
            //
            // Third argument can be either:
            //   - boolean `fakeLegacyVersion` (back-compat), OR
            //   - object `opts = { fakeLegacyVersion?, strict? }`.
            //
            // Iteration C3 of the FIPS 140-3 upgrade plan - `opts.strict = true`
            // enables ECDSA "low-s" rejection (BIP62 / NIST strict mode):
            // a canonical signature has `s ∈ [1, ⌊n/2⌋]`. Any value of s
            // in (n/2, n) - including the malleable signature `s' = n - s` -
            // is rejected. Allows matching 4 ACVP `SigVer-FIPS186-5`
            // negative vectors marked `s out of range` or `s near n` that were
            // incorrectly passing in legacy mode.
            verify(hash, rs, optsOrLegacy) {
                let opts = null;
                let fakeLegacyVersion;
                if (optsOrLegacy && typeof optsOrLegacy === 'object') {
                    opts = optsOrLegacy;
                    fakeLegacyVersion = !!opts.fakeLegacyVersion;
                } else {
                    fakeLegacyVersion = !!optsOrLegacy;
                }
                const strict = !!(opts && opts.strict);

                if (bitArray.bitLength(hash) > this._curveBitLength) {
                    hash = bitArray.clamp(hash, this._curveBitLength);
                }
                const R = this._curve.r;
                const l = this._curveBitLength;
                const r = bn.fromBits(bitArray.bitSlice(rs, 0, l));
                const ss = bn.fromBits(bitArray.bitSlice(rs, l, 2 * l));
                const s = fakeLegacyVersion ? ss : ss.inverseMod(R);
                const hG = bn.fromBits(hash).mul(s).mod(R);
                const hA = r.mul(s).mod(R);
                const r2 = this._curve.G.mult2(hG, hA, this._point).x;
                if (r.equals(0) || ss.equals(0) || r.greaterEquals(R) || ss.greaterEquals(R) || !r2.equals(r)) {
                    console.error('[crypto] CORRUPT: ecdsa: signature did not verify');
                    return false;
                }
                if (strict) {
                    // halfR = floor(n / 2). For an odd curve order n, halfR = (n-1)/2,
                    // so canonical s satisfies s <= halfR ⟺ reject when s > halfR
                    // ⟺ reject when s.greaterEquals(halfR + 1).
                    const halfR = R.copy().halveM();
                    const upperBoundExcl = halfR.add(new bn.bn(1));
                    if (ss.greaterEquals(upperBoundExcl)) {
                        console.error('[crypto] CORRUPT: ecdsa: signature is malleable (s > n/2) under strict mode');
                        return false;
                    }
                }
                return true;
            },

            getType() { return 'ecdsa'; }
        };

        ecc.ecdsa.secretKey = function (curve, exponent) {
            ecc.basicKey.secretKey.apply(this, arguments);
        };

        ecc.ecdsa.secretKey.prototype = {
            // Sign `hash` (already-digested message bits) with this private key.
            //
            // Iteration C3 of the FIPS 140-3 upgrade plan:
            //   - `opts.hashForK` : explicit hash module for RFC 6979 §3.2 K
            //     derivation (default: `_hashForBits(curveBitLength)`,
            //     which ties H_K to the curve size instead of H_msg -
            //     sufficient for ACVP DetECDSA conformance but limits
            //     byte-exact replay to (curve, hash) pairs where H_K = H_msg).
            //     Strict RFC 6979 requires H_K = H_msg. This option lets
            //     the caller fix H_K explicitly (e.g. SHA-256 on P-384,
            //     or a cheaper hash for batch operations).
            //   - `opts.strict` : makes `s` canonical low-s (`s <= n/2`) instead
            //     of the natural inverseMod - useful when a protocol rejects
            //     malleable signatures on the verify side.
            sign(hash, paranoia, fakeLegacyVersion, fixedKForTesting) {
                let opts = null;
                if (paranoia && typeof paranoia === 'object') {
                    opts = paranoia;
                    paranoia = opts.paranoia;
                    fakeLegacyVersion = opts.fakeLegacyVersion;
                    fixedKForTesting = opts.fixedKForTesting;
                }
                const deterministic = opts ? opts.deterministic !== false : true;
                const hashForK = opts ? opts.hashForK : null;
                const strict = !!(opts && opts.strict);
                if (bitArray.bitLength(hash) > this._curveBitLength) {
                    hash = bitArray.clamp(hash, this._curveBitLength);
                }
                const R = this._curve.r;
                const l = R.bitLength();
                let k;
                if (fixedKForTesting) {
                    k = fixedKForTesting;
                } else if (deterministic) {
                    const Hash = hashForK || _hashForBits(this._curveBitLength);
                    k = _rfc6979K(hash, this._exponent, R, Hash);
                } else {
                    k = bn.random(R.sub(1), paranoia).add(1);
                }
                const r = this._curve.G.mult(k).x.mod(R);
                const ss = bn.fromBits(hash).add(r.mul(this._exponent));
                let s = fakeLegacyVersion
                    ? ss.inverseMod(R).mul(k).mod(R)
                    : ss.mul(k.inverseMod(R)).mod(R);
                if (strict) {
                    // Canonicalise s to low-s : if s > n/2, replace with n - s.
                    const halfR = R.copy().halveM();
                    const upperBoundExcl = halfR.add(new bn.bn(1));
                    if (s.greaterEquals(upperBoundExcl)) {
                        s = R.sub(s).normalize();
                    }
                }
                return bitArray.concat(r.toBits(l), s.toBits(l));
            },

            getType() { return 'ecdsa'; }
        };

        // ── Internal escape hatch (test-only) ────────────────────────
        // Iteration C1 of the FIPS 140-3 upgrade plan - exposes the subgroup
        // membership test for direct testing against ACVP KeyVer-FIPS186-5
        // negative vectors (where Q is on the curve but outside <G>).
        ecc._internal = {
            coordsInRange: _coordsInRange,
            isInSubgroup: _isInSubgroup,
            isValidPublicKey(curveName, pointHex) {
                const curve = ecc.curves[curveName];
                if (!curve) return false;
                const bits = bitArray.ui8_to_ba(hex.toBytes(pointHex));
                if (!_coordsInRange(bits, curve)) return false;
                const point = curve.fromBits(bits);
                if (point === false) return false;
                return _isInSubgroup(point, curve);
            }
        };

        // @ts-ignore -- basicKey.generateKeys is assigned dynamically after construction
        return ecc;
    }
};
