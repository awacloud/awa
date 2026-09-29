// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Big-number arithmetic.
 *
 * Origin: adapted from the Stanford JavaScript Crypto Library (SJCL),
 * BSD-2-Clause (SJCL is dual-licensed BSD-2-Clause OR GPL-2.0-or-later; the
 * BSD-2-Clause terms are retained, see third-party/NOTICE-sjcl); the ESM
 * factory, JSDoc, tests and every later change are this project's own work.
 * See docs/dev/provenance.md.
 *
 * Provides arbitrary-precision unsigned integers stored as `limbs[]` of
 * 24-bit values. Used internally by the elliptic-curve module to implement
 * modular arithmetic over NIST and Koblitz pseudo-Mersenne primes.
 *
 * Returns a namespace `{ bn, fromBits, prime, pseudoMersennePrime, random }`
 * where `bn` is the base constructor and `prime` is a map of pre-built
 * subclasses for common primes (p192, p224, p256, p384, p521, p25519, …).
 *
 */

/**
 * An arbitrary-precision unsigned integer instance (limbs of 24-bit values).
 * Most arithmetic methods return a `BnInstance`; mutating-in-place methods
 * (suffixed `M`) return `this`.
 * @typedef {object} BnInstance
 * @property {number[]} limbs 24-bit limbs, little-endian.
 * @property {number} radix Bits per limb (24).
 * @property {() => BnInstance} copy Clone this bignum.
 * @property {(it: *) => BnInstance} initWith (Re)initialise from object/number/string.
 * @property {(that: BnInstance | number) => boolean} equals Constant-time equality.
 * @property {(i: number) => number} getLimb Limb `i` (0 past the end).
 * @property {(that: BnInstance | number) => number} greaterEquals 1 if `this >= that`, else 0.
 * @property {() => string} toHex Hex serialisation (`0x…`).
 * @property {(that: BnInstance | number) => BnInstance} addM Add in place; returns `this`.
 * @property {() => BnInstance} doubleM Double in place; returns `this`.
 * @property {() => BnInstance} halveM Halve in place; returns `this`.
 * @property {(that: BnInstance | number) => BnInstance} subM Subtract in place; returns `this`.
 * @property {(that: BnInstance | number) => BnInstance} mod Reduce modulo `that`.
 * @property {(p: BnInstance) => (BnInstance | false)} inverseMod Modular inverse; `false` if non-invertible.
 * @property {(that: BnInstance | number) => BnInstance} add Sum (new bignum).
 * @property {(that: BnInstance | number) => BnInstance} sub Difference (new bignum).
 * @property {(that: BnInstance | number) => BnInstance} mul Product (new bignum).
 * @property {() => BnInstance} square Square (new bignum).
 * @property {(l: BnInstance | number) => BnInstance} power Exponentiation.
 * @property {(that: BnInstance, N: BnInstance) => BnInstance} mulmod Modular multiplication.
 * @property {(x: BnInstance | number, N: BnInstance | number) => BnInstance} powermod Modular exponentiation.
 * @property {(x: BnInstance | number, N: BnInstance | number) => (BnInstance | false)} montpowermod Montgomery modular exponentiation; `false` on setup failure.
 * @property {() => BnInstance} trim Drop trailing zero limbs; returns `this`.
 * @property {() => BnInstance} reduce Reduce (identity on the base class); returns `this`.
 * @property {() => BnInstance} fullReduce Full reduction; returns `this`.
 * @property {() => BnInstance} normalize Normalise carries in place; returns `this`.
 * @property {() => BnInstance} cnormalize Carry-normalise in place; returns `this`.
 * @property {(len?: number) => number[]} toBits Serialise to a bit array.
 * @property {() => number} bitLength Bit length (rounded up to a byte).
 */

/**
 * The `bn` constructor (also accessible as `BnCtor.bn`). Calling
 * `new BnCtor(value?)` produces a `BnInstance`.
 * @typedef {new (it?: *) => BnInstance} BnCtor
 */

/**
 * Namespace returned by `bn.factory()`.
 * @typedef {object} BnAPI
 * @property {BnCtor} bn Base bignum constructor.
 * @property {(bits: number[]) => BnInstance} fromBits Build a bignum from a bit array.
 * @property {Object.<string, BnCtor>} prime Pre-built pseudo-Mersenne prime field constructors (p192, p256, …).
 * @property {(exponent: number, coeff: Array<Array<number>>) => BnCtor} pseudoMersennePrime Build a prime-field subclass constructor.
 * @property {(modulus: BnInstance | number, paranoia?: number) => BnInstance} random Uniform random bignum below `modulus`.
 */

import { bitArray } from './bitArray.js';
import { random } from './random.js';

export const bn = {
    name: 'bn',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'random'],
    deps: [bitArray, random],

    /** @returns {BnAPI} */
    factory(bitArray, random) {

        // Forward-declared namespace: `random`, `prime`, `pseudoMersennePrime`
        // and `fromBits` are assigned below after `Bn` and its primes are
        // built. These initial empty placeholders exist only so callers can
        // grab a stable namespace object before all members are wired.
        const bn_class = {
            /**
             * @param {*} [modulus]
             * @param {number} [paranoia]
             * @returns {*}
             */
            random: function (modulus, paranoia) {},
            prime: /** @type {Object.<string,*>} */ ({}),
            /**
             * @param {number} exponent
             * @param {Array<Array<number>>} coeff
             * @returns {*}
             */
            pseudoMersennePrime: function (exponent, coeff) {},
            /**
             * @param {*} bits
             * @returns {*}
             */
            fromBits: function (bits) {},
            /**
             * @param {*} [it]
             */
            bn: function (it) {
                this.initWith(it);
            }
        };

        const Bn = bn_class.bn;
        Bn.prototype.radix = 24;
        Bn.prototype.maxMul = 8;
        Bn.prototype._class = Bn;

        Bn.prototype.copy = function () {
            return new this._class(this);
        };

        Bn.prototype.initWith = function (it) {
            let i;
            let k;
            switch (typeof it) {
                case 'object':
                    this.limbs = it.limbs.slice(0);
                    break;
                case 'number':
                    this.limbs = [it];
                    this.normalize();
                    break;
                case 'string':
                    it = it.replace(/^0x/, '');
                    if (!/^[0-9a-fA-F]*$/.test(it)) {
                        console.warn('[crypto] INVALID: bn.initWith: string must contain only hex characters');
                        this.limbs = [0];
                        break;
                    }
                    this.limbs = [];
                    k = this.radix / 4;
                    for (i = 0; i < it.length; i += k) {
                        this.limbs.push(parseInt(it.substring(Math.max(it.length - i - k, 0), it.length - i), 16));
                    }
                    if (this.limbs.length === 0) this.limbs = [0];
                    break;
                default:
                    this.limbs = [0];
            }
            return this;
        };

        Bn.prototype.equals = function (that) {
            if (typeof that === 'number') {
                that = new this._class(that);
            }
            // Clone both operands so equality does not mutate the caller's
            // bignums via fullReduce(). Constant-time over equal limb counts
            // (XOR-accumulated). The clone overhead is the price of purity.
            const a = this.copy().fullReduce();
            const b = that.copy().fullReduce();
            let difference = 0;
            for (let i = 0; i < a.limbs.length || i < b.limbs.length; i++) {
                difference |= a.getLimb(i) ^ b.getLimb(i);
            }
            return (difference === 0);
        };

        Bn.prototype.getLimb = function (i) {
            return (i >= this.limbs.length) ? 0 : this.limbs[i];
        };

        Bn.prototype.greaterEquals = function (that) {
            if (typeof that === 'number') {
                that = new this._class(that);
            }
            let less = 0;
            let greater = 0;
            let a;
            let b;
            let i = Math.max(this.limbs.length, that.limbs.length) - 1;
            for (; i >= 0; i--) {
                a = this.getLimb(i);
                b = that.getLimb(i);
                greater |= (b - a) & ~less;
                less |= (a - b) & ~greater;
            }
            return (greater | ~less) >>> 31;
        };

        // Hex serializer. NOTE: this method is named `toHex` (not `toString`)
        // because `Object.prototype.toString` is frozen by `sanity/base.js`
        // and any assignment to `<class>.prototype.toString` throws in strict
        // mode ("Cannot assign to read only property 'toString'"). All Bn
        // hex conversions go through this method.
        Bn.prototype.toHex = function () {
            this.fullReduce();
            let out = '';
            const l = this.limbs;
            for (let i = 0; i < this.limbs.length; i++) {
                let s = l[i].toString(16);
                while (i < this.limbs.length - 1 && s.length < 6) {
                    s = '0' + s;
                }
                out = s + out;
            }
            return '0x' + out;
        };

        Bn.prototype.addM = function (that) {
            if (typeof that !== 'object') {
                that = new this._class(that);
            }
            const l = this.limbs;
            const ll = that.limbs;
            for (let i = l.length; i < ll.length; i++) {
                l[i] = 0;
            }
            for (let i = 0; i < ll.length; i++) {
                l[i] += ll[i];
            }
            return this;
        };

        Bn.prototype.doubleM = function () {
            let carry = 0;
            let tmp;
            const r = this.radix;
            const m = this.radixMask;
            const l = this.limbs;
            for (let i = 0; i < l.length; i++) {
                tmp = l[i];
                tmp = tmp + tmp + carry;
                l[i] = tmp & m;
                carry = tmp >> r;
            }
            if (carry) {
                l.push(carry);
            }
            return this;
        };

        Bn.prototype.halveM = function () {
            let carry = 0;
            let tmp;
            const r = this.radix;
            const l = this.limbs;
            for (let i = l.length - 1; i >= 0; i--) {
                tmp = l[i];
                l[i] = (tmp + carry) >> 1;
                carry = (tmp & 1) << r;
            }
            if (!l[l.length - 1]) {
                l.pop();
            }
            return this;
        };

        Bn.prototype.subM = function (that) {
            if (typeof that !== 'object') {
                that = new this._class(that);
            }
            const l = this.limbs;
            const ll = that.limbs;
            for (let i = l.length; i < ll.length; i++) {
                l[i] = 0;
            }
            for (let i = 0; i < ll.length; i++) {
                l[i] -= ll[i];
            }
            return this;
        };

        Bn.prototype.mod = function (that) {
            const neg = !this.greaterEquals(new Bn(0));

            that = new Bn(that).normalize();
            let out = new Bn(this).normalize();
            let ci = 0;

            if (neg) {
                out = (new Bn(0)).subM(out).normalize();
            }

            for (; out.greaterEquals(that); ci++) {
                that.doubleM();
            }

            if (neg) {
                out = that.sub(out).normalize();
            }

            for (; ci > 0; ci--) {
                that.halveM();
                if (out.greaterEquals(that)) {
                    out.subM(that).normalize();
                }
            }
            return out.trim();
        };

        Bn.prototype.inverseMod = function (p) {
            let a = new Bn(1);
            let b = new Bn(0);
            let x = new Bn(this);
            let y = new Bn(p);
            let tmp;
            let nz;

            if (!(p.limbs[0] & 1)) {
                console.warn('[crypto] INVALID: inverseMod: p must be odd');
                return false;
            }

            do {
                if (x.limbs[0] & 1) {
                    if (!x.greaterEquals(y)) {
                        tmp = x; x = y; y = tmp;
                        tmp = a; a = b; b = tmp;
                    }
                    x.subM(y);
                    x.normalize();

                    if (!a.greaterEquals(b)) {
                        a.addM(p);
                    }
                    a.subM(b);
                }

                x.halveM();
                if (a.limbs[0] & 1) {
                    a.addM(p);
                }
                a.normalize();
                a.halveM();

                nz = 0;
                for (let i = 0; i < x.limbs.length; i++) {
                    nz |= x.limbs[i];
                }
            } while (nz);

            if (!y.equals(1)) {
                console.warn('[crypto] INVALID: inverseMod: p and x must be relatively prime');
                return false;
            }

            return b;
        };

        Bn.prototype.add = function (that) {
            return this.copy().addM(that);
        };

        Bn.prototype.sub = function (that) {
            return this.copy().subM(that);
        };

        Bn.prototype.mul = function (that) {
            if (typeof that === 'number') {
                that = new this._class(that);
            } else {
                that.normalize();
            }
            this.normalize();
            const a = this.limbs;
            const b = that.limbs;
            const al = a.length;
            const bl = b.length;
            const out = new this._class();
            const c = out.limbs;
            let ai;
            let ii = this.maxMul;

            for (let i = 0; i < this.limbs.length + that.limbs.length + 1; i++) {
                c[i] = 0;
            }
            for (let i = 0; i < al; i++) {
                ai = a[i];
                for (let j = 0; j < bl; j++) {
                    c[i + j] += ai * b[j];
                }
                if (!--ii) {
                    ii = this.maxMul;
                    out.cnormalize();
                }
            }
            return out.cnormalize().reduce();
        };

        Bn.prototype.square = function () {
            return this.mul(this);
        };

        Bn.prototype.power = function (l) {
            l = new Bn(l).normalize().trim().limbs;
            let out = new this._class(1);
            let pow = this;

            for (let i = 0; i < l.length; i++) {
                for (let j = 0; j < this.radix; j++) {
                    if (l[i] & (1 << j)) {
                        out = out.mul(pow);
                    }
                    if (i === (l.length - 1) && l[i] >> (j + 1) === 0) {
                        break;
                    }
                    pow = pow.square();
                }
            }
            return out;
        };

        Bn.prototype.mulmod = function (that, N) {
            return this.mod(N).mul(that.mod(N)).mod(N);
        };

        Bn.prototype.powermod = function (x, N) {
            x = new Bn(x);
            N = new Bn(N);

            if ((N.limbs[0] & 1) === 1) {
                const montOut = this.montpowermod(x, N);
                if (montOut !== false) {
                    return montOut;
                }
            }

            const l = x.normalize().trim().limbs;
            let out = new this._class(1);
            let pow = this;

            for (let i = 0; i < l.length; i++) {
                for (let j = 0; j < this.radix; j++) {
                    if (l[i] & (1 << j)) {
                        out = out.mulmod(pow, N);
                    }
                    if (i === (l.length - 1) && l[i] >> (j + 1) === 0) {
                        break;
                    }
                    pow = pow.mulmod(pow, N);
                }
            }
            return out;
        };

        Bn.prototype.montpowermod = function (x, N) {
            x = new Bn(x).normalize().trim();
            N = new Bn(N);

            const radix = this.radix;
            let out = new this._class(1);
            let pow = this.copy();

            const bitsize = x.bitLength();

            const R = new Bn({
                limbs: N.copy().normalize().trim().limbs.map(function () { return 0; })
            });

            let s;
            for (s = this.radix; s > 0; s--) {
                if (((N.limbs[N.limbs.length - 1] >> s) & 1) === 1) {
                    R.limbs[R.limbs.length - 1] = 1 << s;
                    break;
                }
            }

            let wind;
            if (bitsize === 0) {
                return this;
            } else if (bitsize < 18) {
                wind = 1;
            } else if (bitsize < 48) {
                wind = 3;
            } else if (bitsize < 144) {
                wind = 4;
            } else if (bitsize < 768) {
                wind = 5;
            } else {
                wind = 6;
            }

            const RR = R.copy();
            const NN = N.copy();
            let RP = new Bn(1);
            let NP = new Bn(0);
            const RT = R.copy();

            while (RT.greaterEquals(1)) {
                RT.halveM();
                if ((RP.limbs[0] & 1) === 0) {
                    RP.halveM();
                    NP.halveM();
                } else {
                    RP.addM(NN);
                    RP.halveM();
                    NP.halveM();
                    NP.addM(RR);
                }
            }

            RP = RP.normalize();
            NP = NP.normalize();

            RR.doubleM();
            const R2 = RR.mulmod(RR, N);

            if (!RR.mul(RP).sub(N.mul(NP)).equals(1)) {
                return false;
            }

            const montMul = function (a, b) {
                const mask = (1 << (s + 1)) - 1;
                let ab = a.mul(b);
                let right = ab.mul(NP);
                right.limbs = right.limbs.slice(0, R.limbs.length);
                if (right.limbs.length === R.limbs.length) {
                    right.limbs[R.limbs.length - 1] &= mask;
                }
                right = right.mul(N);
                const abBar = ab.add(right).normalize().trim();
                abBar.limbs = abBar.limbs.slice(R.limbs.length - 1);
                for (let k = 0; k < abBar.limbs.length; k++) {
                    if (k > 0) {
                        abBar.limbs[k - 1] |= (abBar.limbs[k] & mask) << (radix - s - 1);
                    }
                    abBar.limbs[k] = abBar.limbs[k] >> (s + 1);
                }
                if (abBar.greaterEquals(N)) {
                    abBar.subM(N);
                }
                return abBar;
            };

            const montIn = function (c) { return montMul(c, R2); };
            const montOut = function (c) { return montMul(c, 1); };

            pow = montIn(pow);
            out = montIn(out);

            const precomp = {};
            const cap = (1 << (wind - 1)) - 1;
            precomp[1] = pow.copy();
            precomp[2] = montMul(pow, pow);
            for (let h = 1; h <= cap; h++) {
                precomp[(2 * h) + 1] = montMul(precomp[(2 * h) - 1], precomp[2]);
            }

            const getBit = function (exp, i) {
                const off = i % exp.radix;
                return (exp.limbs[Math.floor(i / exp.radix)] & (1 << off)) >> off;
            };

            for (let i = x.bitLength() - 1; i >= 0;) {
                if (getBit(x, i) === 0) {
                    out = montMul(out, out);
                    i = i - 1;
                } else {
                    let l = i - wind + 1;
                    while (getBit(x, l) === 0) {
                        l++;
                    }
                    let indx = 0;
                    for (let j = l; j <= i; j++) {
                        indx += getBit(x, j) << (j - l);
                        out = montMul(out, out);
                    }
                    out = montMul(out, precomp[indx]);
                    i = l - 1;
                }
            }
            return montOut(out);
        };

        Bn.prototype.trim = function () {
            const l = this.limbs;
            let p;
            do {
                p = l.pop();
            } while (l.length && p === 0);
            l.push(p);
            return this;
        };

        Bn.prototype.reduce = function () { return this; };
        Bn.prototype.fullReduce = function () { return this.normalize(); };

        Bn.prototype.normalize = function () {
            let carry = 0;
            const pv = this.placeVal;
            const ipv = this.ipv;
            const limbs = this.limbs;
            const ll = limbs.length;
            const mask = this.radixMask;
            let i;
            let l;
            let m;
            for (i = 0; i < ll || (carry !== 0 && carry !== -1); i++) {
                l = (limbs[i] || 0) + carry;
                m = limbs[i] = l & mask;
                carry = (l - m) * ipv;
            }
            if (carry === -1) {
                limbs[i - 1] -= pv;
            }
            this.trim();
            return this;
        };

        Bn.prototype.cnormalize = function () {
            let carry = 0;
            const ipv = this.ipv;
            const limbs = this.limbs;
            const ll = limbs.length;
            const mask = this.radixMask;
            let i;
            let l;
            let m;
            for (i = 0; i < ll - 1; i++) {
                l = limbs[i] + carry;
                m = limbs[i] = l & mask;
                carry = (l - m) * ipv;
            }
            limbs[i] += carry;
            return this;
        };

        Bn.prototype.toBits = function (len) {
            this.fullReduce();
            len = len || this.exponent || this.bitLength();
            let i = Math.floor((len - 1) / 24);
            const w = bitArray;
            const e = (len + 7 & -8) % this.radix || this.radix;
            let out = [w.partial(e, this.getLimb(i))];
            for (i--; i >= 0; i--) {
                out = w.concat(out, [w.partial(Math.min(this.radix, len), this.getLimb(i))]);
                len -= this.radix;
            }
            return out;
        };

        Bn.prototype.bitLength = function () {
            this.fullReduce();
            let out = this.radix * (this.limbs.length - 1);
            let b = this.limbs[this.limbs.length - 1];
            for (; b; b >>>= 1) {
                out++;
            }
            return out + 7 & -8;
        };

        bn_class.fromBits = function (bits) {
            let Class;
            let t;
            if (this.bn) {
                Class = this.bn;
                t = this.bn.prototype;
            } else {
                Class = this;
                t = this.prototype;
            }
            // @ts-ignore - TS2351: Class is dynamically assigned to bn constructor; variadic factory pattern
            const out = new Class();
            const words = [];
            const w = bitArray;
            const l = Math.min(this.bitLength || 0x100000000, w.bitLength(bits));
            const e = l % t.radix || t.radix;

            words[0] = w.extract(bits, 0, e);
            for (let p = e; p < l; p += t.radix) {
                words.unshift(w.extract(bits, p, t.radix));
            }
            out.limbs = words;
            return out;
        };

        Bn.prototype.ipv = 1 / (Bn.prototype.placeVal = Math.pow(2, Bn.prototype.radix));
        Bn.prototype.radixMask = (1 << Bn.prototype.radix) - 1;

        bn_class.pseudoMersennePrime = function (exponent, coeff) {
            function p(it) {
                this.initWith(it);
            }

            const ppr = p.prototype = new Bn();
            const tmp = exponent / ppr.radix;
            const mo = ppr.modOffset = Math.ceil(tmp);
            ppr.exponent = exponent;
            ppr.offset = [];
            ppr.factor = [];
            ppr.minOffset = mo;
            ppr.fullMask = 0;
            ppr.fullOffset = [];
            ppr.fullFactor = [];
            ppr.modulus = p.modulus = new Bn(Math.pow(2, exponent));
            ppr.fullMask = 0 | -Math.pow(2, exponent % ppr.radix);

            for (let i = 0; i < coeff.length; i++) {
                ppr.offset[i] = Math.floor(coeff[i][0] / ppr.radix - tmp);
                ppr.fullOffset[i] = Math.floor(coeff[i][0] / ppr.radix) - mo + 1;
                ppr.factor[i] = coeff[i][1] * Math.pow(1 / 2, exponent - coeff[i][0] + ppr.offset[i] * ppr.radix);
                ppr.fullFactor[i] = coeff[i][1] * Math.pow(1 / 2, exponent - coeff[i][0] + ppr.fullOffset[i] * ppr.radix);
                ppr.modulus.addM(new Bn(Math.pow(2, coeff[i][0]) * coeff[i][1]));
                ppr.minOffset = Math.min(ppr.minOffset, -ppr.offset[i]);
            }
            ppr._class = p;
            ppr.modulus.cnormalize();

            ppr.reduce = function () {
                const limbs = this.limbs;
                const off = this.offset;
                const ol = this.offset.length;
                const fac = this.factor;
                let i = this.minOffset;
                let l;
                let ll;
                while (limbs.length > mo) {
                    l = limbs.pop();
                    ll = limbs.length;
                    for (let k = 0; k < ol; k++) {
                        limbs[ll + off[k]] -= fac[k] * l;
                    }
                    i--;
                    if (!i) {
                        limbs.push(0);
                        this.cnormalize();
                        i = this.minOffset;
                    }
                }
                this.cnormalize();
                return this;
            };

            ppr._strongReduce = (ppr.fullMask === -1) ? ppr.reduce : function () {
                const limbs = this.limbs;
                const i = limbs.length - 1;
                this.reduce();
                if (i === this.modOffset - 1) {
                    const l = limbs[i] & this.fullMask;
                    limbs[i] -= l;
                    for (let k = 0; k < this.fullOffset.length; k++) {
                        limbs[i + this.fullOffset[k]] -= this.fullFactor[k] * l;
                    }
                    this.normalize();
                }
            };

            ppr.fullReduce = function () {
                this._strongReduce();
                this.addM(this.modulus);
                this.addM(this.modulus);
                this.normalize();
                this._strongReduce();

                for (let i = this.limbs.length; i < this.modOffset; i++) {
                    this.limbs[i] = 0;
                }

                const greater = this.greaterEquals(this.modulus);
                for (let i = 0; i < this.limbs.length; i++) {
                    this.limbs[i] -= this.modulus.limbs[i] * greater;
                }
                this.cnormalize();
                return this;
            };

            ppr.inverse = function () {
                return this.power(this.modulus.sub(2));
            };

            p.fromBits = bn_class.fromBits;
            return p;
        };

        const sbp = bn_class.pseudoMersennePrime;
        bn_class.prime = {
            p127: sbp(127, [[0, -1]]),
            p25519: sbp(255, [[0, -19]]),
            p192k: sbp(192, [[32, -1], [12, -1], [8, -1], [7, -1], [6, -1], [3, -1], [0, -1]]),
            p224k: sbp(224, [[32, -1], [12, -1], [11, -1], [9, -1], [7, -1], [4, -1], [1, -1], [0, -1]]),
            p256k: sbp(256, [[32, -1], [9, -1], [8, -1], [7, -1], [6, -1], [4, -1], [0, -1]]),
            p192: sbp(192, [[0, -1], [64, -1]]),
            p224: sbp(224, [[0, 1], [96, -1]]),
            p256: sbp(256, [[0, -1], [96, 1], [192, 1], [224, -1]]),
            p384: sbp(384, [[0, -1], [32, 1], [96, -1], [128, -1]]),
            p521: sbp(521, [[0, -1]])
        };

        bn_class.random = function (modulus, paranoia) {
            if (typeof modulus !== 'object') {
                modulus = new Bn(modulus);
            }
            const l = modulus.limbs.length;
            const m = modulus.limbs[l - 1] + 1;
            const out = new Bn();
            let words;
            while (true) {
                do {
                    words = random.words(l, paranoia);
                    if (words[l - 1] < 0) {
                        words[l - 1] += 0x100000000;
                    }
                } while (Math.floor(words[l - 1] / m) === Math.floor(0x100000000 / m));
                words[l - 1] %= m;
                for (let i = 0; i < l - 1; i++) {
                    words[i] &= modulus.radixMask;
                }
                out.limbs = words;
                if (!out.greaterEquals(modulus)) {
                    return out;
                }
            }
        };

        return /** @type {BnAPI} */ (/** @type {any} */ (bn_class));
    }
};
