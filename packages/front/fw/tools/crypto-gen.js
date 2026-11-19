// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Generators of the unrolled fast crypto code of `@awacloud/fw`,
 * ported to JS, with a byte-for-byte check against the committed modules.
 *
 * Eight fragments of the fast crypto modules are generated code: straight-line
 * bodies on locals (no loops, no allocation) that are too long and too regular
 * to write by hand. Each is regenerated here and compared with the committed
 * text.
 *
 * Targets (frozen order):
 *
 * | id                 | committed file (under the package)  | fragment |
 * |--------------------|-------------------------------------|----------|
 * | `aes-gf`           | `src/crypto/cipher/aes.js`          | `_bsMul` + `_bsSq` (bit-plane GF(2^8)) |
 * | `field25519-ed`    | `src/crypto/pkc/ed25519.js`         | `_M` + `_S` (GF(2^255-19), 16 x 16-bit limbs) |
 * | `field25519-x`     | `src/crypto/pkc/x25519.js`          | the same text as `field25519-ed` |
 * | `chacha20-block`   | `src/crypto/cipher/chacha20.js`     | `_blockInto` |
 * | `poly1305-blocks`  | `src/crypto/hash/poly1305.js`       | the unrolled block loop, `let h0 ...` to `h[9] = h9;` |
 * | `sha256-compress`  | `src/crypto/hash/sha256.js`         | `_compress` (without its hand-written JSDoc) |
 * | `keccak-f1600`     | `src/crypto/hash/sha3.js`           | `_keccakF1600` |
 * | `blake2b-compress` | `src/crypto/hash/blake2b.js`        | `_compress` |
 *
 * Rule: the committed module is the oracle. When a generated fragment differs
 * from the committed text, the GENERATOR is corrected, never the module.
 * Hand-written fast code (ed25519 chains/group/base table, `x25519._M121665`,
 * sha512) has no generator.
 *
 * Origin: ports of seven Python scripts of the framework lane (tasks T21, T25,
 * T26; commits `240fc703a`, `ecd1c5e7f`, `6ffb948ef`, `c71ad9989`,
 * `abf082855`, `9e89e3d06`). A fragment is the generator's lines joined by
 * `\n`, without a trailing newline, at the indentation the generator emits
 * (8 spaces at factory level).
 *
 * `tools/` is a dev area: not part of the published `files[]`.
 *
 * Usage (bun or node, from `packages/front/fw`):
 *   bun tools/crypto-gen.js --check          # default: OK / DRIFT per target
 *   bun tools/crypto-gen.js --write          # regenerate the regions in place
 *   bun tools/crypto-gen.js --print <id>     # the fragment on stdout
 *   bun tools/crypto-gen.js --help
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------------------
// aes-gf (t21-gen.py)
// ---------------------------------------------------------------------------

function genAesGf() {
    // Square: each output plane is an XOR of input planes, computed symbolically.
    const terms = new Map(range(8).map((i) => [2 * i, new Set([i])]));
    for (let k = 14; k > 7; k--) {
        const t = terms.get(k) || new Set();
        if (t.size === 0) continue;
        for (const d of [4, 5, 7, 8]) {
            const cur = terms.get(k - d) || new Set();
            for (const s of t) { if (cur.has(s)) cur.delete(s); else cur.add(s); }
            terms.set(k - d, cur);
        }
        terms.set(k, new Set());
    }
    const sq = ['        function _bsSq(a, out) {',
        '            const ' + range(8).map((i) => `a${i} = a[${i}]`).join(', ') + ';'];
    for (let k = 0; k < 8; k++) {
        const syms = [...(terms.get(k) || [])].sort((x, y) => x - y);
        sq.push(`            out[${k}] = ` + (syms.length ? syms.map((s) => `a${s}`).join(' ^ ') : '0') + ';');
    }
    sq.push('        }');

    const mul = ['        function _bsMul(a, b, out) {',
        '            const ' + range(8).map((i) => `a${i} = a[${i}]`).join(', ') + ';',
        '            const ' + range(8).map((i) => `b${i} = b[${i}]`).join(', ') + ';'];
    for (let k = 0; k < 15; k++) {
        const pairs = range(8).filter((i) => k - i >= 0 && k - i < 8).map((i) => `(a${i} & b${k - i})`);
        mul.push(`            let p${k} = ` + pairs.join(' ^ ') + ';');
    }
    for (let k = 14; k > 7; k--) {
        mul.push(`            p${k - 4} ^= p${k}; p${k - 5} ^= p${k}; p${k - 7} ^= p${k}; p${k - 8} ^= p${k};`);
    }
    for (let k = 0; k < 8; k++) mul.push(`            out[${k}] = p${k};`);
    mul.push('        }');
    return mul.join('\n') + '\n\n' + sq.join('\n');
}

// ---------------------------------------------------------------------------
// field25519 (t25/gen_field.py)
// ---------------------------------------------------------------------------

const FIELD_IND = '        ';

function fieldCarry(names, ind) {
    const out = [`${ind}let c = 0, v;`];
    for (let pss = 0; pss < 2; pss++) {
        for (const n of names) out.push(`${ind}v = ${n} + c; c = Math.floor(v / 65536); ${n} = v - c * 65536;`);
        out.push(`${ind}${names[0]} += 38 * c;` + (pss === 0 ? ' c = 0;' : ''));
    }
    return out;
}

function fieldTail(ind) {
    const L = [];
    for (let k = 0; k < 15; k++) L.push(`${ind}t${k} += 38 * t${k + 16};`);
    L.push(...fieldCarry(range(16).map((k) => `t${k}`), ind));
    for (let k = 0; k < 16; k++) L.push(`${ind}o[${k}] = t${k};`);
    return L;
}

function genFieldMul() {
    const IND = FIELD_IND;
    const ind = IND + '    ';
    const L = [`${IND}/**`,
        `${IND} * Field multiply, unrolled into locals (no allocation): o = a * b.`,
        `${IND} * \`o\` may alias \`a\` or \`b\`. Exact in doubles for inputs below 2^18.`,
        `${IND} * @param {Float64Array} o`,
        `${IND} * @param {Float64Array} a`,
        `${IND} * @param {Float64Array} b`,
        `${IND} */`,
        `${IND}function _M(o, a, b) {`];
    L.push(ind + 'const ' + range(16).map((i) => `a${i} = a[${i}]`).join(', ') + ';');
    L.push(ind + 'const ' + range(16).map((i) => `b${i} = b[${i}]`).join(', ') + ';');
    for (let k = 0; k < 31; k++) {
        const t = range(16).filter((i) => k - i >= 0 && k - i < 16).map((i) => `a${i} * b${k - i}`);
        L.push(`${ind}let t${k} = ` + t.join(' + ') + ';');
    }
    L.push(...fieldTail(ind));
    L.push(IND + '}');
    return L;
}

function genFieldSq() {
    const IND = FIELD_IND;
    const ind = IND + '    ';
    const L = [`${IND}/**`,
        `${IND} * Field square by the symmetry of the products (136 instead of 256):`,
        `${IND} * o = a * a; \`o\` may alias \`a\`.`,
        `${IND} * @param {Float64Array} o`,
        `${IND} * @param {Float64Array} a`,
        `${IND} */`,
        `${IND}function _S(o, a) {`];
    L.push(ind + 'const ' + range(16).map((i) => `a${i} = a[${i}]`).join(', ') + ';');
    L.push(ind + 'const ' + range(15).map((i) => `d${i} = 2 * a${i}`).join(', ') + ';');
    for (let k = 0; k < 31; k++) {
        const t = [];
        for (let i = 0; i < 16; i++) {
            const j = k - i;
            if (j < i || j >= 16) continue;
            t.push(i === j ? `a${i} * a${i}` : `d${i} * a${j}`);
        }
        L.push(`${ind}let t${k} = ` + t.join(' + ') + ';');
    }
    L.push(...fieldTail(ind));
    L.push(IND + '}');
    return L;
}

function genField25519() {
    return genFieldMul().join('\n') + '\n\n' + genFieldSq().join('\n');
}

// ---------------------------------------------------------------------------
// chacha20-block (t26/gen_chacha.py)
// ---------------------------------------------------------------------------

function genChacha() {
    const IND = '                ';
    const qr = (a, b, c, d) => [[a, b, d, 16], [c, d, b, 12], [a, b, d, 8], [c, d, b, 7]].map(([x, y, z, n]) =>
        `x${x} = (x${x} + x${y}) | 0; x${z} ^= x${x}; x${z} = (x${z} << ${n}) | (x${z} >>> ${32 - n});`);
    const lines = ['        /**',
        '         * One ChaCha20 block (RFC 8439 §2.3) into `ks` (16 words): the state on',
        '         * locals, the 20 rounds as 10 double rounds of inline quarter-rounds.',
        '         * @param {Int32Array} k 8 key words',
        '         * @param {number} counter',
        '         * @param {Int32Array} n 3 nonce words',
        '         * @param {Int32Array} ks output, 16 words',
        '         */',
        '        function _blockInto(k, counter, n, ks) {',
        '            const j0 = 0x61707865, j1 = 0x3320646e, j2 = 0x79622d32, j3 = 0x6b206574;',
        '            const j4 = k[0], j5 = k[1], j6 = k[2], j7 = k[3], j8 = k[4], j9 = k[5], j10 = k[6], j11 = k[7];',
        '            const j12 = counter | 0, j13 = n[0], j14 = n[1], j15 = n[2];',
        '            let ' + range(16).map((i) => `x${i} = j${i}`).join(', ') + ';',
        '            for (let i = 0; i < 10; i++) {'];
    for (const q of [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
        [0, 5, 10, 15], [1, 6, 11, 12], [2, 7, 8, 13], [3, 4, 9, 14]]) {
        for (const l of qr(...q)) lines.push(IND + l);
    }
    lines.push('            }');
    for (let i = 0; i < 16; i++) lines.push(`            ks[${i}] = (x${i} + j${i}) | 0;`);
    lines.push('        }');
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// poly1305-blocks (t26/gen_poly.py)
// ---------------------------------------------------------------------------

function genPoly() {
    const I1 = '            ';
    const I2 = I1 + '    ';
    const limbExpr = (src, base, i, hibit) => {
        const bit = 13 * i;
        const at = bit >> 3;
        const sh = bit & 7;
        const parts = [];
        for (let k = 0; k < 3; k++) {
            const idx = at + k;
            if (idx < 16) parts.push(`(${src}[${base} + ${idx}]` + (k ? ` << ${8 * k})` : ')'));
            else if (idx === 16 && hibit) parts.push(`(1 << ${8 * k})`);
        }
        if (parts.length === 0) return '0';
        const e = parts.join(' | ');
        return sh ? `(((${e}) >>> ${sh}) & 0x1fff)` : `((${e}) & 0x1fff)`;
    };
    const mulCarry = () => {
        const out = [];
        for (let i = 0; i < 10; i++) {
            const terms = [];
            for (let j = 0; j < 10; j++) {
                const k = i - j;
                terms.push(k >= 0 ? `h${j} * r${k}` : `h${j} * s${k + 10}`);
            }
            out.push(`${I2}const d${i} = ` + terms.join(' + ') + ';');
        }
        out.push(`${I2}let c = 0, v;`);
        for (let i = 0; i < 10; i++) out.push(`${I2}v = d${i} + c; c = Math.floor(v / 8192); h${i} = v - c * 8192;`);
        out.push(`${I2}v = h0 + 5 * c; c = Math.floor(v / 8192); h0 = v - c * 8192; h1 += c;`);
        return out;
    };
    const L = [];
    L.push(`${I1}let ` + range(10).map((i) => `h${i} = 0`).join(', ') + ';');
    L.push(`${I1}const ` + range(10).map((i) => `r${i} = _r[${i}]`).join(', ') + ';');
    L.push(`${I1}const ` + range(9).map((i) => `s${i + 1} = 5 * r${i + 1}`).join(', ') + ';');
    L.push(`${I1}const full = len - (len % 16);`);
    L.push(`${I1}for (let off = 0; off < full; off += 16) {`);
    L.push(`${I2}// A whole block: its limbs straight from \`msg\`, + 2^128.`);
    for (let i = 0; i < 10; i++) L.push(`${I2}h${i} += ${limbExpr('msg', 'off', i, true)};`);
    L.push(...mulCarry());
    L.push(`${I1}}`);
    L.push(`${I1}if (full < len) {`);
    L.push(`${I2}// The last, partial block: copied, 0x01 after it, zeros up to 17 bytes.`);
    L.push(`${I2}const n = len - full;`);
    L.push(`${I2}_blk.fill(0);`);
    L.push(`${I2}for (let i = 0; i < n; i++) _blk[i] = msg[full + i];`);
    L.push(`${I2}_blk[n] = 1;`);
    for (let i = 0; i < 10; i++) L.push(`${I2}h${i} += _limb(_blk, 0, ${i});`);
    L.push(...mulCarry());
    L.push(`${I1}}`);
    L.push(`${I1}const h = _h;`);
    for (let i = 0; i < 10; i++) L.push(`${I1}h[${i}] = h${i};`);
    return L.join('\n');
}

// ---------------------------------------------------------------------------
// sha256-compress (t26/gen_sha256.py)
// ---------------------------------------------------------------------------

function genSha256() {
    const I = '            ';
    const L = ['        function _compress(h, w) {',
        '            const k = _K32, W = _W64;',
        '            for (let i = 0; i < 16; i++) W[i] = w[i] | 0;',
        '            for (let i = 16; i < 64; i++) {',
        '                const a = W[i - 15], b = W[i - 2];',
        '                const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);',
        '                const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);',
        '                W[i] = (((s0 + W[i - 16]) | 0) + ((s1 + W[i - 7]) | 0)) | 0;',
        '            }',
        '            let a = h[0] | 0, b = h[1] | 0, c = h[2] | 0, d = h[3] | 0, e = h[4] | 0, f = h[5] | 0, g = h[6] | 0, hh = h[7] | 0;',
        '            let t1, t2, s0, s1, ch, mj;'];
    let regs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'hh'];
    for (let i = 0; i < 64; i++) {
        const [A, B, C, D, E, F, G, H] = regs;
        L.push(`${I}s1 = ((${E} >>> 6) | (${E} << 26)) ^ ((${E} >>> 11) | (${E} << 21)) ^ ((${E} >>> 25) | (${E} << 7));`);
        L.push(`${I}ch = ${G} ^ (${E} & (${F} ^ ${G}));`);
        L.push(`${I}t1 = ((((((${H} + s1) | 0) + ch) | 0) + ((k[${i}] + W[${i}]) | 0)) | 0);`);
        L.push(`${I}s0 = ((${A} >>> 2) | (${A} << 30)) ^ ((${A} >>> 13) | (${A} << 19)) ^ ((${A} >>> 22) | (${A} << 10));`);
        L.push(`${I}mj = (${A} & ${B}) ^ (${C} & (${A} ^ ${B}));`);
        L.push(`${I}t2 = (s0 + mj) | 0;`);
        L.push(`${I}${D} = (${D} + t1) | 0; ${H} = (t1 + t2) | 0;`);
        regs = [H, A, B, C, D, E, F, G];
    }
    const [A, B, C, D, E, F, G, H] = regs;
    L.push(`${I}h[0] = (h[0] + ${A}) | 0; h[1] = (h[1] + ${B}) | 0; h[2] = (h[2] + ${C}) | 0; h[3] = (h[3] + ${D}) | 0;`);
    L.push(`${I}h[4] = (h[4] + ${E}) | 0; h[5] = (h[5] + ${F}) | 0; h[6] = (h[6] + ${G}) | 0; h[7] = (h[7] + ${H}) | 0;`);
    L.push('        }');
    return L.join('\n');
}

// ---------------------------------------------------------------------------
// keccak-f1600 (t26/gen_keccak.py)
// ---------------------------------------------------------------------------

function genKeccak() {
    const R = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
    const I = '                ';
    const rotl = (dl, dh, lo, hi, r) => {
        if (r === 0) return `${dl} = ${lo}; ${dh} = ${hi};`;
        if (r < 32) return `${dl} = (${lo} << ${r}) | (${hi} >>> ${32 - r}); ${dh} = (${hi} << ${r}) | (${lo} >>> ${32 - r});`;
        if (r === 32) return `${dl} = ${hi}; ${dh} = ${lo};`;
        const r2 = r - 32;
        return `${dl} = (${hi} << ${r2}) | (${lo} >>> ${32 - r2}); ${dh} = (${lo} << ${r2}) | (${hi} >>> ${32 - r2});`;
    };
    const L = ['        /**',
        '         * Keccak-f[1600] (FIPS 202 §3.2) on int32 locals: 25 lanes as (lo, hi)',
        '         * halves, every step of the 24 rounds unrolled (generated), the',
        '         * rotation offsets and the π permutation resolved at generation.',
        '         * @param {Uint32Array} s 50 words, lane i at [2i] (lo) and [2i + 1] (hi)',
        '         */',
        '        function _keccakF1600(s) {',
        '            let ' + range(25).map((i) => `a${i}l = s[${2 * i}] | 0, a${i}h = s[${2 * i + 1}] | 0`).join(', ') + ';',
        '            let ' + range(25).map((i) => `b${i}l, b${i}h`).join(', ') + ';',
        '            for (let round = 0; round < 24; round++) {'];
    for (let x = 0; x < 5; x++) {
        L.push(`${I}const c${x}l = a${x}l ^ a${x + 5}l ^ a${x + 10}l ^ a${x + 15}l ^ a${x + 20}l, c${x}h = a${x}h ^ a${x + 5}h ^ a${x + 10}h ^ a${x + 15}h ^ a${x + 20}h;`);
    }
    for (let x = 0; x < 5; x++) {
        const xm = (x + 4) % 5, xp = (x + 1) % 5;
        L.push(`${I}const d${x}l = c${xm}l ^ ((c${xp}l << 1) | (c${xp}h >>> 31)), d${x}h = c${xm}h ^ ((c${xp}h << 1) | (c${xp}l >>> 31));`);
    }
    for (let i = 0; i < 25; i++) L.push(`${I}a${i}l ^= d${i % 5}l; a${i}h ^= d${i % 5}h;`);
    for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
            const i = x + 5 * y;
            const ni = y + 5 * ((2 * x + 3 * y) % 5);
            L.push(I + rotl(`b${ni}l`, `b${ni}h`, `a${i}l`, `a${i}h`, R[i]));
        }
    }
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            const i = x + 5 * y;
            const i1 = (x + 1) % 5 + 5 * y;
            const i2 = (x + 2) % 5 + 5 * y;
            L.push(`${I}a${i}l = b${i}l ^ (~b${i1}l & b${i2}l); a${i}h = b${i}h ^ (~b${i1}h & b${i2}h);`);
        }
    }
    L.push(`${I}a0l ^= _RC_LO32[round]; a0h ^= _RC_HI32[round];`);
    L.push('            }');
    for (let i = 0; i < 25; i++) L.push(`            s[${2 * i}] = a${i}l; s[${2 * i + 1}] = a${i}h;`);
    L.push('        }');
    return L.join('\n');
}

// ---------------------------------------------------------------------------
// blake2b-compress (t26/gen_blake.py)
// ---------------------------------------------------------------------------

function genBlake() {
    const I = '                ';
    const addTerms = (a, bh, bl) =>
        [`l = (v${a}l + ${bl}) | 0; v${a}h = (v${a}h + ${bh} + ((((v${a}l & ${bl}) | ((v${a}l | ${bl}) & ~l)) >>> 31))) | 0; v${a}l = l;`];
    const add3 = (a, b, x) => [...addTerms(a, `v${b}h`, `v${b}l`), ...addTerms(a, `${x}h`, `${x}l`)];
    const add2 = (a, b) => addTerms(a, `v${b}h`, `v${b}l`);
    const rot = (d, a, n) => {
        const out = [`th = v${d}h ^ v${a}h; tl = v${d}l ^ v${a}l;`];
        if (n === 32) out.push(`v${d}h = tl; v${d}l = th;`);
        else if (n < 32) out.push(`v${d}h = (th >>> ${n}) | (tl << ${32 - n}); v${d}l = (tl >>> ${n}) | (th << ${32 - n});`);
        else {
            const m = n - 32;
            out.push(`v${d}h = (tl >>> ${m}) | (th << ${32 - m}); v${d}l = (th >>> ${m}) | (tl << ${32 - m});`);
        }
        return out;
    };
    const G = (a, b, c, d, x, y) => [
        ...add3(a, b, x), ...rot(d, a, 32), ...add2(c, d), ...rot(b, c, 24),
        ...add3(a, b, y), ...rot(d, a, 16), ...add2(c, d), ...rot(b, c, 63)];

    const L = ['        /**',
        '         * BLAKE2b compression F (RFC 7693 §3.2) on locals: the 16 working words',
        '         * as (h, l) int32 pairs, the 12 rounds of generated inline mixing.',
        '         * @param {{h: Uint32Array, buf: Uint8Array, tHi: number, tLo: number}} ctx',
        '         * @param {boolean} last',
        '         */',
        '        function _compress(ctx, last) {',
        '            const buf = ctx.buf, h = ctx.h, m = _m;',
        '            for (let i = 0; i < 16; i++) {',
        '                const o = i * 8;',
        '                m[i * 2 + 1] = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);',
        '                m[i * 2] = buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24);',
        '            }'];
    const decl = [];
    for (let i = 0; i < 8; i++) decl.push(`v${i}h = h[${2 * i}] | 0, v${i}l = h[${2 * i + 1}] | 0`);
    for (let i = 0; i < 8; i++) decl.push(`v${i + 8}h = IV[${2 * i}] | 0, v${i + 8}l = IV[${2 * i + 1}] | 0`);
    L.push('            let ' + decl.join(', ') + ';');
    L.push('            let l, th, tl;');
    L.push('            v12h ^= ctx.tHi; v12l ^= ctx.tLo;');
    L.push('            if (last) { v14h = ~v14h; v14l = ~v14l; }');
    L.push('            for (let r = 0; r < 12; r++) {');
    L.push('                const s = SIGMA[r];');
    for (let k = 0; k < 16; k++) L.push(`                const x${k}h = m[s[${k}] * 2], x${k}l = m[s[${k}] * 2 + 1];`);
    for (const [a, b, c, d, x, y] of [[0, 4, 8, 12, 0, 1], [1, 5, 9, 13, 2, 3], [2, 6, 10, 14, 4, 5], [3, 7, 11, 15, 6, 7],
        [0, 5, 10, 15, 8, 9], [1, 6, 11, 12, 10, 11], [2, 7, 8, 13, 12, 13], [3, 4, 9, 14, 14, 15]]) {
        for (const line of G(a, b, c, d, `x${x}`, `x${y}`)) L.push(I + line);
    }
    L.push('            }');
    for (let i = 0; i < 8; i++) L.push(`            h[${2 * i}] ^= v${i}h ^ v${i + 8}h; h[${2 * i + 1}] ^= v${i}l ^ v${i + 8}l;`);
    L.push('        }');
    return L.join('\n');
}

// ---------------------------------------------------------------------------
// Targets, locate, check, write
// ---------------------------------------------------------------------------

/** @type {Record<string, () => string>} */
const GENERATORS = {
    'aes-gf': genAesGf,
    'field25519-ed': genField25519,
    'field25519-x': genField25519,
    'chacha20-block': genChacha,
    'poly1305-blocks': genPoly,
    'sha256-compress': genSha256,
    'keccak-f1600': genKeccak,
    'blake2b-compress': genBlake
};

/** The eight targets, in the frozen order. */
export const TARGETS = Object.freeze([
    Object.freeze({ id: 'aes-gf', file: 'src/crypto/cipher/aes.js', source: 't21-gen.py' }),
    Object.freeze({ id: 'field25519-ed', file: 'src/crypto/pkc/ed25519.js', source: 't25/gen_field.py' }),
    Object.freeze({ id: 'field25519-x', file: 'src/crypto/pkc/x25519.js', source: 't25/gen_field.py' }),
    Object.freeze({ id: 'chacha20-block', file: 'src/crypto/cipher/chacha20.js', source: 't26/gen_chacha.py' }),
    Object.freeze({ id: 'poly1305-blocks', file: 'src/crypto/hash/poly1305.js', source: 't26/gen_poly.py' }),
    Object.freeze({ id: 'sha256-compress', file: 'src/crypto/hash/sha256.js', source: 't26/gen_sha256.py' }),
    Object.freeze({ id: 'keccak-f1600', file: 'src/crypto/hash/sha3.js', source: 't26/gen_keccak.py' }),
    Object.freeze({ id: 'blake2b-compress', file: 'src/crypto/hash/blake2b.js', source: 't26/gen_blake.py' })
]);

/**
 * The fragment of one target (pure: reads no file).
 * @param {string} id
 * @returns {string}
 */
export function generate(id) {
    const gen = Object.prototype.hasOwnProperty.call(GENERATORS, id) ? GENERATORS[id] : null;
    if (!gen) throw new RangeError(`crypto-gen: unknown target ${id}`);
    return gen();
}

/**
 * Find the region a fragment occupies in a file.
 *
 * Start: the fragment's first line that is not a comment line (a JSDoc block
 * leads some fragments, and its opening line is not unique in a file); it must occur
 * exactly once as a whole line, and the region starts at the head of the
 * leading comment block that precedes it in the fragment.
 * End: the occurrence of the fragment's last line, after the start, that is
 * nearest the position the fragment's length predicts (a closing `}` repeats,
 * so "the first later occurrence" would stop inside a multi-function fragment).
 * @param {string} content
 * @param {string} fragment
 * @returns {{start: number, end: number}}
 */
export function locate(content, fragment) {
    const fl = fragment.split('\n');
    const last = fl[fl.length - 1];
    let lead = 0;
    while (lead < fl.length - 1 && /^\s*(\/\*\*|\*|\*\/)/.test(fl[lead])) lead++;
    const anchor = fl[lead];
    const lines = content.split('\n');
    const offsets = [];
    let pos = 0;
    for (const l of lines) { offsets.push(pos); pos += l.length + 1; }
    const hits = [];
    for (let i = 0; i < lines.length; i++) if (lines[i] === anchor) hits.push(i);
    if (hits.length === 0) throw new Error('crypto-gen: first line not found');
    if (hits.length > 1) throw new Error(`crypto-gen: first line occurs ${hits.length} times`);
    const s = hits[0] - lead;
    if (s < 0) throw new Error('crypto-gen: first line not found');
    const expected = s + fl.length - 1;
    let best = -1;
    for (let i = hits[0] + (fl.length === 1 ? 0 : 1); i < lines.length; i++) {
        if (lines[i] === last && (best < 0 || Math.abs(i - expected) < Math.abs(best - expected))) best = i;
    }
    if (best < 0) throw new Error('crypto-gen: last line not found after the first line');
    return { start: offsets[s], end: offsets[best] + lines[best].length };
}

const defaultRoot = () => join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Compare every committed region with its regenerated fragment.
 * @param {string} [root] the fw package directory
 * @returns {Array<{id: string, file: string, ok: boolean, reason: string}>}
 */
export function check(root = defaultRoot()) {
    return TARGETS.map(({ id, file }) => {
        try {
            const content = readFileSync(join(root, file), 'utf8');
            const fragment = generate(id);
            const { start, end } = locate(content, fragment);
            const region = content.slice(start, end);
            if (region === fragment) return { id, file, ok: true, reason: '' };
            const a = region.split('\n');
            const b = fragment.split('\n');
            let n = 0;
            while (n < a.length && n < b.length && a[n] === b[n]) n++;
            return { id, file, ok: false, reason: `first differing line ${n + 1} of the region` };
        } catch (e) {
            return { id, file, ok: false, reason: /** @type {Error} */ (e).message };
        }
    });
}

/**
 * Replace each region by its fragment.
 * @param {string} [root] the fw package directory
 * @returns {string[]} the ids whose file changed
 */
export function write(root = defaultRoot()) {
    const changed = [];
    for (const { id, file } of TARGETS) {
        const path = join(root, file);
        const content = readFileSync(path, 'utf8');
        const fragment = generate(id);
        const { start, end } = locate(content, fragment);
        if (content.slice(start, end) === fragment) continue;
        writeFileSync(path, content.slice(0, start) + fragment + content.slice(end));
        changed.push(id);
    }
    return changed;
}

const USAGE = `Usage: bun tools/crypto-gen.js [--check | --write | --print <id> | --help]
  --check       (default) OK / DRIFT per target; exit 1 on any drift
  --write       regenerate the regions in place
  --print <id>  the fragment on stdout
Targets: ${TARGETS.map((t) => t.id).join(', ')}
`;

/**
 * CLI entry.
 * @param {string[]} argv
 * @returns {number} exit code
 */
function main(argv) {
    const [flag, arg] = argv;
    if (flag === '--help') { process.stdout.write(USAGE); return 0; }
    if (flag === undefined || flag === '--check') {
        if (argv.length > 1) { process.stderr.write(USAGE); return 2; }
        const rows = check();
        for (const r of rows) process.stdout.write(r.ok ? `OK ${r.id}\n` : `DRIFT ${r.id}: ${r.reason}\n`);
        return rows.every((r) => r.ok) ? 0 : 1;
    }
    if (flag === '--write' && argv.length === 1) {
        for (const id of write()) process.stdout.write(`${id}\n`);
        return 0;
    }
    if (flag === '--print' && argv.length === 2 && TARGETS.some((t) => t.id === arg)) {
        process.stdout.write(generate(arg) + '\n');
        return 0;
    }
    process.stderr.write(USAGE);
    return 2;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
