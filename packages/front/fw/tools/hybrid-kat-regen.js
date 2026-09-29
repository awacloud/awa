// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Reproducible combiner-KAT regeneration for the fw hybrid PQC
 * combiners (`crypto/pkc/hybridKem` X-Wing + `crypto/pkc/hybridSign` composite).
 *
 * The "continuous crypto-proof" story: this deterministic, **network-free** dev
 * script recomputes every committed combiner-KAT output from the FROZEN
 * implementations + fixed seeds and asserts BYTE-IDENTITY with the committed
 * fixtures. Any drift in the X-Wing combiner/label/KDF, the composite `M'`
 * preimage, the TLV encoding or the DER framing changes the recomputed bytes and
 * makes the run fail (prints the failing case id, exits 1).
 *
 * Two legs:
 *   1. X-Wing — reproduces the OFFICIAL IETF KAT (tv0..tv2): keygen(seed) +
 *      encapsulate(pk, randomness) + decapsulate over the published deterministic
 *      inputs, matching the official `ekPrefix` / `ctPrefix` / full `ss` bytes.
 *   2. Composite — reproduces a deterministic self-KAT: a fixed per-variant seed
 *      drives a SHAKE-256 DRBG that seeds ML-DSA-65 keygen, the traditional
 *      component keygen and the deterministic sign path (ML-DSA zero-entropy
 *      hedge + Ed25519 / RFC-6979 ECDSA), matching the committed pk/sig bytes,
 *      and re-verifies each signature through the frozen `verify()`.
 *
 * Usage:
 *   bun packages/front/fw/tools/hybrid-kat-regen.js          # verify (exit 0/1)
 *   bun packages/front/fw/tools/hybrid-kat-regen.js --json    # machine-readable
 *
 * Wired as a test (`src/crypto/pkc/hybrid-kat-regen.test.js`) so CI exercises the
 * regeneration every run. This module has NO side effects on import: the CLI
 * (print + process.exit) runs only under `import.meta.main`.
 */

import { bitArray } from '../src/crypto/utils/bitArray.js';
import { utf8 } from '../src/io/codec/utf8.js';
import { hex } from '../src/io/codec/hex.js';
import { sha256 } from '../src/crypto/hash/sha256.js';
import { sha512 } from '../src/crypto/hash/sha512.js';
import { sha384 } from '../src/crypto/hash/sha384.js';
import { hmac } from '../src/crypto/hash/hmac.js';
import { sha3 } from '../src/crypto/hash/sha3.js';
import { bn } from '../src/crypto/utils/bn.js';
import { ml_dsa } from '../src/crypto/pkc/ml_dsa.js';
import { ed25519 } from '../src/crypto/pkc/ed25519.js';
import { ecc } from '../src/crypto/pkc/ecc.js';
import { hybridSign } from '../src/crypto/pkc/hybridSign.js';
import { xwing } from '../src/crypto/pkc/hybridKem.js';

import { XWING_KAT } from '../src/crypto/pkc/__fixtures__/xwing-ietf-kat.js';
import { COMPOSITE_KAT, COMPOSITE_KAT_MESSAGE } from '../src/crypto/pkc/__fixtures__/composite-kat-regen.js';

// ── shared primitive instances (deterministic, no entropy source) ──────────
const _ba = bitArray.factory();
const _utf8 = utf8.factory(_ba);
const _sha3 = sha3.factory(_ba, _utf8);

// ── hex helpers ────────────────────────────────────────────────────────────
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const toHex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');

// ── deterministic SHAKE-256 DRBG (bytes / words surface) ───────────────────
// Drives the composite keygen entropy (ML-DSA ξ, Ed25519 seed, ECDSA scalar).
// Pure function of the seed → fully reproducible; NOT for production use.
function baToBytes(ba, n) {
    const out = new Uint8Array(n);
    let tmp = 0;
    for (let i = 0; i < n; i++) {
        if ((i & 3) === 0) tmp = ba[i >>> 2];
        out[i] = (tmp >>> 24) & 0xff;
        tmp = (tmp << 8) >>> 0;
    }
    return out;
}
function makeDetRng(seedBytes) {
    let counter = 0;
    let pool = new Uint8Array(0);
    let off = 0;
    function refill() {
        const inp = new Uint8Array(seedBytes.length + 4);
        inp.set(seedBytes, 0);
        inp[seedBytes.length] = (counter >>> 24) & 0xff;
        inp[seedBytes.length + 1] = (counter >>> 16) & 0xff;
        inp[seedBytes.length + 2] = (counter >>> 8) & 0xff;
        inp[seedBytes.length + 3] = counter & 0xff;
        counter++;
        pool = baToBytes(_sha3.shake256(inp, 1024 * 8), 1024);
        off = 0;
    }
    function bytes(n) {
        const out = new Uint8Array(n);
        let got = 0;
        while (got < n) {
            if (off >= pool.length) refill();
            const take = Math.min(n - got, pool.length - off);
            out.set(pool.subarray(off, off + take), got);
            off += take;
            got += take;
        }
        return out;
    }
    function words(l) {
        const b = bytes(l * 4);
        const w = new Array(l);
        for (let i = 0; i < l; i++) {
            w[i] = ((b[i * 4] << 24) | (b[i * 4 + 1] << 16) | (b[i * 4 + 2] << 8) | b[i * 4 + 3]) | 0;
        }
        return w;
    }
    return { bytes, words, isReady: () => true };
}

// ── composite wiring over a deterministic RNG ──────────────────────────────
function wireComposite(rng) {
    const _sha256 = sha256.factory(_ba, _utf8);
    const _sha512 = sha512.factory(_ba, _utf8);
    const _sha384 = sha384.factory(_sha512);
    const _hmac = hmac.factory(_ba, _utf8, _sha256);
    const _hex = hex.factory();
    const _bn = bn.factory(_ba, rng);
    const _mldsa = ml_dsa.factory(_sha3, _ba, rng);
    const _ed = ed25519.factory(_sha512, _ba);
    const _ecc = ecc.factory(_ba, _hex, _bn, _sha256, _sha384, _sha512, _hmac);
    return hybridSign.factory(_mldsa, _ed, _ecc, _sha512, _sha256, rng, _utf8);
}

/**
 * Recompute the X-Wing KAT outputs from a case's deterministic inputs.
 * @param {{seed:string, randomness:string}} c
 * @returns {{ekPrefix:string, ctPrefix:string, ss:string}|{error:string}}
 */
function computeXwingCase(c) {
    const kp = xwing.keygen(fromHex(c.seed));
    if (kp === false) return { error: 'keygen returned false' };
    const enc = xwing.encapsulate(kp.publicKey, fromHex(c.randomness));
    if (enc === false) return { error: 'encapsulate returned false' };
    const ss2 = xwing.decapsulate(enc.cipherText, kp.secretKey);
    if (ss2 === false) return { error: 'decapsulate returned false' };
    if (toHex(ss2) !== toHex(enc.sharedSecret)) return { error: 'decaps ss != encaps ss' };
    return {
        ekPrefix: toHex(kp.publicKey.subarray(0, 32)),
        ctPrefix: toHex(enc.cipherText.subarray(0, 26)),
        ss: toHex(enc.sharedSecret)
    };
}

/**
 * Recompute a composite reproducibility case from its fixed seed + message.
 * @param {{variant:string, seed:string}} c
 * @param {Uint8Array} message
 * @returns {{pk:string, sig:string, verified:boolean}|{error:string}}
 */
function computeCompositeCase(c, message) {
    const inst = wireComposite(makeDetRng(fromHex(c.seed)));
    const variant = inst[c.variant];
    if (!variant) return { error: 'unknown variant ' + c.variant };
    const kp = variant.keygen();
    if (kp === false) return { error: 'keygen returned false' };
    const sig = variant.sign(kp.secretKey, message);
    if (sig === false) return { error: 'sign returned false' };
    const verified = variant.verify(kp.publicKey, message, sig);
    return { pk: toHex(kp.publicKey), sig: toHex(sig), verified: verified === true };
}

/**
 * Regenerate and byte-compare every case against the supplied fixtures.
 * @param {{xwingKat?:Array, compositeKat?:Array, compositeMessage?:string}} [fixtures]
 * @returns {{ok:boolean, cases:Array<{id:string, pass:boolean, detail:string}>, mismatches:string[]}}
 */
export function verify(fixtures = {}) {
    const xwingKat = fixtures.xwingKat || XWING_KAT;
    const compositeKat = fixtures.compositeKat || COMPOSITE_KAT;
    const compositeMessage = fixtures.compositeMessage !== undefined
        ? fixtures.compositeMessage : COMPOSITE_KAT_MESSAGE;
    const message = _utf8.toBytes(compositeMessage);

    const cases = [];
    const mismatches = [];
    const record = (id, pass, detail) => {
        cases.push({ id, pass, detail });
        if (!pass) mismatches.push(id + ': ' + detail);
    };

    for (const c of xwingKat) {
        const id = 'xwing:' + c.name;
        const got = computeXwingCase(c);
        if (got.error) { record(id, false, got.error); continue; }
        const diffs = [];
        if (got.ekPrefix !== c.ekPrefix) diffs.push('ekPrefix');
        if (got.ctPrefix !== c.ctPrefix) diffs.push('ctPrefix');
        if (got.ss !== c.ss) diffs.push('ss');
        record(id, diffs.length === 0, diffs.length ? 'byte mismatch: ' + diffs.join(',') : 'ss+ek+ct byte-exact');
    }

    for (const c of compositeKat) {
        const id = 'composite:' + c.name;
        const got = computeCompositeCase(c, message);
        if (got.error) { record(id, false, got.error); continue; }
        const diffs = [];
        if (got.pk !== c.pk) diffs.push('pk');
        if (got.sig !== c.sig) diffs.push('sig');
        if (!got.verified) diffs.push('verify=false');
        record(id, diffs.length === 0, diffs.length ? 'mismatch: ' + diffs.join(',') : 'pk+sig byte-exact, verify=true');
    }

    return { ok: mismatches.length === 0, cases, mismatches };
}

// ── CLI entry (side-effect-free on import) ─────────────────────────────────
if (import.meta.main) {
    const asJson = process.argv.includes('--json');
    const res = verify();
    if (asJson) {
        console.log(JSON.stringify(res, null, 2));
    } else {
        console.log('hybrid combiner-KAT regeneration (deterministic, network-free)\n');
        for (const c of res.cases) {
            console.log((c.pass ? '  PASS ' : '  FAIL ') + c.id.padEnd(28) + ' ' + c.detail);
        }
        console.log('\n' + (res.ok
            ? 'OK — ' + res.cases.length + ' cases byte-identical to committed fixtures'
            : 'FAIL — ' + res.mismatches.length + ' mismatch(es): ' + res.mismatches.join(' | ')));
    }
    process.exit(res.ok ? 0 : 1);
}
