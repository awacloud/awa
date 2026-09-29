// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for `wasmRsa` — the WASM RSA Tier-2 accelerator over the
 * colocated `rsa` binary (vendored from `@awacloud/fw-wasm-crypto`: BearSSL i31 + EMSA-PSS).
 *
 * The binary is the colocated asset (`./rsa.scalar.wasm`, vendored from the package),
 * so these run REAL crypto: a NIST byte-anchored PKCS#1-v1.5 verify KAT, OAEP and
 * PSS/PKCS1 round-trips on a fixed NIST key, parity, tamper-rejection, and the
 * no-throw contract. `rsa` ships scalar only (`simd:false`); the wrapper forces
 * `{ variant: 'scalar' }`.
 *
 * KAT provenance (NIST ACVP RSA, mirroring shims/rsa.kat.test.ts marshalling):
 *  - Fixed CRT key: RSA-DecryptionPrimitive-Sp800-56Br2 (2048-bit) — n,e,p,q,d;
 *    dp,dq,iq derived test-side via BigInt (harness key prep, not crypto under
 *    test). Wire format = BearSSL (the delivered ABI; the plan's pre-ERRATA
 *    "DER spki/pkcs8" wording does not match the shipped shim — there is no DER
 *    parser in the ABI).
 *  - PKCS#1-v1.5 verify anchor: RSA-SigGen-FIPS186-5 tg1 (2048-bit, SHA2-256) —
 *    a genuine NIST-generated signature; `verify` MUST accept it and reject a
 *    one-bit tamper.
 */

import { describe, test, expect } from 'bun:test';
import { wasmRsa } from './rsa.js';
import { wasmRuntime } from './runtime.js';

// ─── Fixed NIST key (RSA-DecryptionPrimitive-Sp800-56Br2, 2048-bit) ──────────

const K_N = 'B73C54E656923F3F184546C1FB00BC7E2C9DF9A95E4EDE9DA559F2BE1773C8B52159BD54A25B8142839FAF6D0E2F70130B9961C875D1EB2D99F36A1DFB72E05F46C9B83456BCEFA33A0A14DCD6CB34F32666B516F148858498CD52BE9804F5E7D5D3714629AB27F4102B7DC419A9A1BAA9B2A0990C15A368C028EC678FFF266D9F19FC61DFEBFE500AC3C5701B1291DDA1BE47F330BB11C1DD14BE6EE2C098EB934DB695A097449AE269D3878554026245325A872DE759F6ECAE043E80479E1A7EE6FF52F77FF5441BB7C09B03E01C62F1AD2530FC5D0AA02B9222080BF6242987D23267B7F7A486CBA254648D5B3DBF5D475BFE83FA2D1397D0BE9720B9E263';
const K_E = '2DE387DD9';
const K_P = 'BA90B7396D2D1E28A2ACB086FD05BEB308469F74D47879512DDB4A68C085FFD933DDCD1340A83FBF2CB321EDE49F8BD0B93E42029B96C488A4F8E2ADEC4ADCC49A942589D577F14B493B0A98001D4A108936B39D499A6E5966A38B32F489FB374C220B2EB015076CDB8C9C0AEF2A2B2F2BD636E78128E6A6C3D69EDDE4CDD7E7';
const K_Q = 'FB6E6185BF10B5981F76D2403190BB653049B86661B58774D2EAD2356FB843A8FBBC9729C2D1172C2B9803297CFF3853C2520B7BF725BA92982357D73CE03023A04E4069E37EB83BC4AF8B1B481F9729C10F16A0DBE3F73B267AA87B0DDCDCB7B44C491429F962D9F2E65FEE61E10D409F64B41898E56FE96269634557AB2225';
const K_D = '153430AAC32B36E85584B0AFE9BDA8108043318A179D720E98042B245E9835B0F799D85D45EA46E9D179DA9F3DFB05D162B0DDF1F1CC75B388C7FAEED5A318B0BDFB583349FDEF88DB3B548DDF56C83AEBAACE65AA55119F0646BE765177BE148434A797C61F87570F9E9242248C5A1460D4F25FB6D83736DB0D695CCFB4AAD360CE844852468CEFC2E2952ABC86F879765B1E55034BF7861D8E75F6623B4DFEFF0ED1BB10BAC318D0FBEB51ED40A519BF49241391556392B7F14626318FB7CD18E9E8F65B9FE7839CD94B2FA933D4AFE115CE226334762A1544510386AACD4EFF9AA22BC53297C3907E9FDD93EA03BAEA8280EFB06DDC42810753DE6D35C7A5';

// ─── NIST PKCS#1-v1.5 SigGen anchor (RSA-SigGen-FIPS186-5 tg1, 2048, SHA2-256) ─

const SG_N = '9CC3B2CB4A60108C2D32AFBA23A6BB2F7A2789235CC4179C459561F4E396E970C2B361EE0CCEDE4B9EFE840C8069AFD4FD0A5C77D0FAD22684952CEAC9D167677E89C7A48E8961C22B73A2EB39FE974F402596DFA863D566CCA2A5E68D7C49C2B652A2499AAFDEE3A5D9441EDC6667A6B0E9E67CAB54FC292E3E681D8967266847658F57F616C43AD5CEFDDF1129972A341405186667DB28F7035F5A99598BDEC59C7DD806C03CCCED04EE614F7F6F3825D94CBCF048338216C9D6C84AED41A3A96CE82A55C399586A46F664523BEAA089B6229FD7B0CFB9B4516AB30D6B74832233AE5F7B29AA1E1CC9A6D9C0DD4AD046EFF45FD1A0D4D5618408FE5DD03407';
const SG_E = '3F7CD8CF';
const SG_MSG = '511001B0B3D445265AF301045CA0BD2274EDEF42111314F6771FAE45F98F680CB068F3F765B63982FDD42A17980AF18B70D5E49442DAEE45086666EC5642FB850B990F4E2B2DF85881311D00581D5DDD0B0587F41473A5C0B61E245E0EBBB41AD48334F5E7FD90F7CAF907E79BA5642CC574A80B5DCF093F8FF64BBC25C35289';
const SG_SIG = '48F017AB94A9E5A4E50620FE996E59BC13273C10866F28CDA4B71F7587A7CC9E3C7B8F553AC7FBCBEF2A488ECB0E7645C57BCF0F0C4D1D669480DCA50A59E3BBD62A1BD6BA61E75C1B4B8963F9987B33A0C02E1EE6DE30D8BE7E62E6AFDAFCE754718826985746688B11CBF969DA0B6320A7AB98171B7DBB8705DD6EB1D06B9EFBD9ADCD52C12EF644E7DD137BFBFBE1886C3F86B60E7BA05F9332A7D76D69C5DD3DEEA4B6506707514C4523F362CFEE6FA69C956E88A4531442FF54786E1157CD391C3B8E0BC1A238EE685C3DAC4954D3A2F6EE704901A93E2F1DBC10A2BF097B3C95786E44476CD2FE439AC06BC18CDFCF75F597543132A85AEBAA0047889A';

// ─── wire-format helpers (mirror shims/rsa.kat.test.ts) ──────────────────────

function hexToBytes(hex) {
    const h = hex.length % 2 ? '0' + hex : hex;
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}
function u16be(n) {
    return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}
function u32be(n) {
    return new Uint8Array([(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}
function concat(...parts) {
    let n = 0;
    for (const p of parts) {
        n += p.length;
    }
    const out = new Uint8Array(n);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}
function trimZeros(b) {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) {
        i++;
    }
    return b.subarray(i);
}
function pubWire(nHex, eHex) {
    const n = trimZeros(hexToBytes(nHex));
    const e = trimZeros(hexToBytes(eHex));
    return concat(u16be(n.length), n, u16be(e.length), e);
}
function privWire(bits, pHex, qHex, dpHex, dqHex, iqHex) {
    const p = trimZeros(hexToBytes(pHex));
    const q = trimZeros(hexToBytes(qHex));
    const dp = trimZeros(hexToBytes(dpHex));
    const dq = trimZeros(hexToBytes(dqHex));
    const iq = trimZeros(hexToBytes(iqHex));
    return concat(
        u32be(bits),
        u16be(p.length), p,
        u16be(q.length), q,
        u16be(dp.length), dp,
        u16be(dq.length), dq,
        u16be(iq.length), iq,
    );
}
function toBig(h) {
    return BigInt('0x' + (h.length % 2 ? '0' + h : h));
}
function modInv(a, m) {
    let [oldR, r] = [((a % m) + m) % m, m];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
    }
    return ((oldS % m) + m) % m;
}
function toHex(b) {
    let h = b.toString(16);
    if (h.length % 2) {
        h = '0' + h;
    }
    return h;
}

/** Build the fixed NIST key in BearSSL wire format (CRT params derived). */
function fixedKey() {
    const n = toBig(K_N);
    const d = toBig(K_D);
    const p = toBig(K_P);
    const q = toBig(K_Q);
    const dp = d % (p - 1n);
    const dq = d % (q - 1n);
    const iq = modInv(q, p);
    const bits = n.toString(2).length;
    return {
        publicKey: pubWire(K_N, K_E),
        privateKey: privWire(bits, toHex(p), toHex(q), toHex(dp), toHex(dq), toHex(iq)),
    };
}

const ENC = new TextEncoder();

describe('wasmRsa — metadata', () => {
    test('module metadata (ERRATA: wasmRuntime dep only)', () => {
        expect(wasmRsa.name).toBe('wasmRsa');
        expect(wasmRsa.type).toBe('fw.crypto.wasm');
        expect(wasmRsa.dependencies).toEqual(['wasmRuntime']);
        expect(wasmRsa.deps).toEqual([wasmRuntime]);
        expect(typeof wasmRsa.factory).toBe('function');
        // ERRATA point 2: no rsaWasm fw-module entry.
        expect(wasmRsa.dependencies).not.toContain('rsaWasm');
    });

    test('factory yields the prescribed API surface', () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        expect(typeof api.isAvailable).toBe('function');
        expect(typeof api.generateKey).toBe('function');
        expect(typeof api.encrypt).toBe('function');
        expect(typeof api.decrypt).toBe('function');
        expect(typeof api.sign).toBe('function');
        expect(typeof api.verify).toBe('function');
        expect(api.isAvailable()).toBe(true);
    });
});

describe('wasmRsa — NIST KAT (colocated binary)', () => {
    test('verifies a genuine NIST PKCS#1-v1.5 signature; rejects a tamper', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const pk = pubWire(SG_N, SG_E);
        const msg = hexToBytes(SG_MSG);
        const sig = hexToBytes(SG_SIG);

        const ok = await api.verify(pk, sig, msg, 'PKCS1', 256);
        expect(ok).toBe(true);

        const tampered = Uint8Array.from(sig);
        tampered[tampered.length - 1] ^= 0x01;
        const bad = await api.verify(pk, tampered, msg, 'PKCS1', 256);
        expect(bad).toBe(false);

        // wrong message must also reject.
        const wrong = await api.verify(pk, sig, ENC.encode('not the signed message'), 'PKCS1', 256);
        expect(wrong).toBe(false);
    }, 30000);
});

describe('wasmRsa — round-trips on a fixed NIST key', () => {
    test('OAEP encrypt → decrypt recovers the message', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('attack at dawn');

        const ct = await api.encrypt(publicKey, msg, undefined, 256);
        expect(ct).not.toBe(false);
        expect(ct.length).toBe(256); // 2048-bit modulus

        const pt = await api.decrypt(privateKey, ct, undefined, 256);
        expect(pt).not.toBe(false);
        expect(Array.from(pt)).toEqual(Array.from(msg));
    }, 30000);

    test('OAEP is randomized: two encryptions of the same message differ', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('same plaintext');

        const ct1 = await api.encrypt(publicKey, msg);
        const ct2 = await api.encrypt(publicKey, msg);
        expect(ct1).not.toBe(false);
        expect(ct2).not.toBe(false);
        expect(Array.from(ct1)).not.toEqual(Array.from(ct2));
        // …yet both decrypt back to the message.
        const pt2 = await api.decrypt(privateKey, ct2);
        expect(Array.from(pt2)).toEqual(Array.from(msg));
    }, 30000);

    test('PSS sign → verify round-trip across SHA-256/384/512', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('sign me with PSS');

        for (const h of [256, 384, 512]) {
            const sig = await api.sign(privateKey, msg, 'PSS', h);
            expect(sig, `PSS sign SHA-${h}`).not.toBe(false);
            const ok = await api.verify(publicKey, sig, msg, 'PSS', h);
            expect(ok, `PSS verify SHA-${h}`).toBe(true);
        }
    }, 30000);

    test('PKCS1 sign → verify round-trip (emits deprecation warning)', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('legacy PKCS1 signature');

        const warned = [];
        const origWarn = console.warn;
        console.warn = (...a) => warned.push(a.join(' '));
        let sig;
        try {
            sig = await api.sign(privateKey, msg, 'PKCS1', 256);
        } finally {
            console.warn = origWarn;
        }
        expect(sig).not.toBe(false);
        expect(warned.some((w) => /DEPRECATED/.test(w))).toBe(true);

        const ok = await api.verify(publicKey, sig, msg, 'PKCS1', 256);
        expect(ok).toBe(true);
    }, 30000);

    test('PSS signature is randomized (salt) but both verify', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('randomized salt');
        const s1 = await api.sign(privateKey, msg, 'PSS', 256);
        const s2 = await api.sign(privateKey, msg, 'PSS', 256);
        expect(Array.from(s1)).not.toEqual(Array.from(s2));
        expect(await api.verify(publicKey, s1, msg, 'PSS', 256)).toBe(true);
        expect(await api.verify(publicKey, s2, msg, 'PSS', 256)).toBe(true);
    }, 30000);
});

describe('wasmRsa — keygen interop (generated key signs & verifies)', () => {
    test('generateKey(2048) → PSS sign → verify (internal validity)', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const kp = await api.generateKey('PSS', 2048, 256);
        expect(kp).not.toBe(false);
        expect(kp.publicKey).toBeInstanceOf(Uint8Array);
        expect(kp.privateKey).toBeInstanceOf(Uint8Array);

        const msg = ENC.encode('generated-key round-trip');
        const sig = await api.sign(kp.privateKey, msg, 'PSS', 256);
        expect(sig).not.toBe(false);
        expect(await api.verify(kp.publicKey, sig, msg, 'PSS', 256)).toBe(true);

        // OAEP round-trip on the generated key too.
        const ct = await api.encrypt(kp.publicKey, msg);
        const pt = await api.decrypt(kp.privateKey, ct);
        expect(Array.from(pt)).toEqual(Array.from(msg));
    }, 120000);
});

describe('wasmRsa — tamper & cross-checks reject', () => {
    test('tampered PSS signature / wrong message / wrong scheme → false', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();
        const msg = ENC.encode('integrity matters');
        const sig = await api.sign(privateKey, msg, 'PSS', 256);
        expect(sig).not.toBe(false);

        const tampered = Uint8Array.from(sig);
        tampered[0] ^= 0xff;
        expect(await api.verify(publicKey, tampered, msg, 'PSS', 256)).toBe(false);

        expect(await api.verify(publicKey, sig, ENC.encode('other message'), 'PSS', 256)).toBe(false);

        // PSS signature verified under PKCS1 must reject.
        expect(await api.verify(publicKey, sig, msg, 'PKCS1', 256)).toBe(false);

        // wrong hash must reject.
        expect(await api.verify(publicKey, sig, msg, 'PSS', 384)).toBe(false);
    }, 30000);
});

describe('wasmRsa — input validation → false (no-throw)', () => {
    test('invalid scheme / hash / modulus on generateKey → false', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        expect(await api.generateKey('BOGUS', 2048, 256)).toBe(false);
        expect(await api.generateKey('PSS', 1024, 256)).toBe(false);
        expect(await api.generateKey('PSS', 2048, 224)).toBe(false);
    });

    test('bad key / data / scheme / hash on each op → false', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { publicKey, privateKey } = fixedKey();

        // encrypt
        expect(await api.encrypt(new Uint8Array(2), ENC.encode('x'))).toBe(false);
        expect(await api.encrypt(publicKey, 'not bytes')).toBe(false);
        expect(await api.encrypt(publicKey, ENC.encode('x'), undefined, 224)).toBe(false);
        // decrypt
        expect(await api.decrypt(new Uint8Array(2), new Uint8Array(8))).toBe(false);
        expect(await api.decrypt(privateKey, new Uint8Array(0))).toBe(false);
        // sign
        expect(await api.sign(new Uint8Array(2), ENC.encode('x'), 'PSS')).toBe(false);
        expect(await api.sign(privateKey, ENC.encode('x'), 'OAEP')).toBe(false);
        expect(await api.sign(privateKey, ENC.encode('x'), 'PSS', 224)).toBe(false);
        // verify
        expect(await api.verify(new Uint8Array(2), new Uint8Array(8), ENC.encode('x'), 'PSS')).toBe(false);
        expect(await api.verify(publicKey, new Uint8Array(0), ENC.encode('x'), 'PSS')).toBe(false);
        expect(await api.verify(publicKey, new Uint8Array(8), ENC.encode('x'), 'BOGUS')).toBe(false);
    });

    test('decrypting random bytes resolves false, never throws', async () => {
        const api = wasmRsa.factory(wasmRuntime.factory());
        const { privateKey } = fixedKey();
        const garbage = crypto.getRandomValues(new Uint8Array(256));
        const out = await api.decrypt(privateKey, garbage, undefined, 256);
        // OAEP unpad of random bytes fails → false (no throw, no plaintext).
        expect(out).toBe(false);
    }, 30000);
});
