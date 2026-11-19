// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The `perf.js` case catalogue: one entry per measured
 * operation, each with fw engines (`fw`, or variants such as `fw-ct`) and, where
 * one exists, a native reference `oracle` (`node:zlib`, `node:crypto`,
 * `Buffer`, `crypto.getRandomValues`, `JSON`).
 *
 * `makeCases(R, srcDir)` builds the catalogue against ONE fw source tree:
 * `R(name)` resolves a module from a runtime built over that tree, so the same
 * case measures the working tree, a materialised baseline or any other copy.
 * Each engine factory returns `{ run(), check?(out) }`: `run` is the timed
 * call, `check` runs once after timing and reports `parity` against the oracle
 * (`true`, `false`, or a string when no oracle exists in this runtime).
 * Inputs are deterministic (`_corpora.js`, seeded xorshift buffers) and are
 * prepared outside `run`.
 *
 * Grown from the framework lane's W0 audit harness.
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { buildCorpus, makeXorshift32 } from './_corpora.js';

/**
 * @typedef {{ run: () => any, check?: (out: any) => Record<string, any> }} PerfCell
 * @typedef {{ size: (string|number), engines: Record<string, () => PerfCell> }} PerfCase
 */

/** Deterministic bytes. */
export function bytes(n, seed = 0x5eed) {
    const rng = makeXorshift32(seed);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; ++i) out[i] = rng() & 0xff;
    return out;
}

const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const u8 = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));

/**
 * @param {(name: string) => any} R module resolver over one fw source tree
 * @param {string} srcDir that tree's `src/` directory (for its binary assets)
 * @returns {Record<string, PerfCase>}
 */
export function makeCases(R, srcDir) {
    const KEY16 = bytes(16, 1), KEY32 = bytes(32, 2), IV16 = bytes(16, 3), NONCE12 = bytes(12, 4);
    /** @type {Record<string, PerfCase>} */
    const CASES = {};

    // ── compression ──────────────────────────────────────────────────────────
    for (const corpus of ['text', 'json', 'random']) {
        CASES['deflate-l6-' + corpus] = {
            size: corpus,
            engines: {
                fw: () => { const z = R('zlib'); const src = buildCorpus(corpus);
                    return { run: () => z.zlibSync(src, { level: 6 }),
                        check: (o) => ({ bytes: o.length, parity: eq(zlib.inflateSync(o), src) }) }; },
                oracle: () => { const src = buildCorpus(corpus);
                    return { run: () => zlib.deflateSync(src, { level: 6 }), check: (o) => ({ bytes: o.length }) }; },
            },
        };
        CASES['inflate-' + corpus] = {
            size: corpus,
            engines: {
                fw: () => { const z = R('zlib'); const src = buildCorpus(corpus); const enc = zlib.deflateSync(src, { level: 6 });
                    return { run: () => z.unzlibSync(enc), check: (o) => ({ parity: eq(o, src) }) }; },
                oracle: () => { const src = buildCorpus(corpus); const enc = zlib.deflateSync(src, { level: 6 });
                    return { run: () => zlib.inflateSync(enc) }; },
            },
        };
        CASES['brotli-q6-' + corpus] = {
            size: corpus,
            engines: {
                fw: () => { const b = R('brotli'); const src = buildCorpus(corpus);
                    return { run: () => b.brotliCompressSync(src, { quality: 6 }),
                        check: (o) => ({ bytes: o.length, parity: eq(zlib.brotliDecompressSync(o), src) }) }; },
                oracle: () => { const src = buildCorpus(corpus);
                    return { run: () => zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } }),
                        check: (o) => ({ bytes: o.length }) }; },
            },
        };
        // The same encode with the static dictionary blob loaded, as a page
        // that ships `brotli_dict.bin` runs it (the scan for dictionary words
        // only runs then).
        CASES['brotli-q6d-' + corpus] = {
            size: corpus,
            engines: {
                fw: () => { const b = R('brotli');
                    R('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(srcDir, 'io/compress/brotli_dict.bin'))));
                    const src = buildCorpus(corpus);
                    return { run: () => b.brotliCompressSync(src, { quality: 6 }),
                        check: (o) => ({ bytes: o.length, parity: eq(zlib.brotliDecompressSync(o), src) }) }; },
                oracle: () => { const src = buildCorpus(corpus);
                    return { run: () => zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } }),
                        check: (o) => ({ bytes: o.length }) }; },
            },
        };
        CASES['unbrotli-' + corpus] = {
            size: corpus,
            engines: {
                fw: () => { const b = R('brotli');
                    R('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(srcDir, 'io/compress/brotli_dict.bin'))));
                    const src = buildCorpus(corpus);
                    const enc = zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } });
                    return { run: () => b.brotliDecompressSync(enc), check: (o) => ({ parity: eq(o, src) }) }; },
                oracle: () => { const src = buildCorpus(corpus);
                    const enc = zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } });
                    return { run: () => zlib.brotliDecompressSync(enc) }; },
            },
        };
    }
    CASES['lz4-roundtrip-json'] = {
        size: 'json',
        engines: {
            fw: () => { const l = R('lz4'); const src = buildCorpus('json');
                return { run: () => { const [n, blk] = l.compress(src, src.length); if (n <= 0) throw new Error('lz4: stored'); return l.decompress(blk)[1]; },
                    check: (o) => ({ parity: eq(u8(o), src) }) }; },
        },
    };

    // ── checksums ────────────────────────────────────────────────────────────
    CASES['crc32-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const Crc32 = R('crc32'); const src = bytes(1 << 20);
                return { run: () => { const c = new Crc32(); c.append(src); return c.get() >>> 0; },
                    check: (o) => ({ parity: typeof zlib.crc32 === 'function' ? o === (zlib.crc32(src) >>> 0) : 'no oracle in this runtime' }) }; },
            oracle: () => { const src = bytes(1 << 20);
                if (typeof zlib.crc32 !== 'function') return { run: () => 0, check: () => ({ unavailable: true }) };
                return { run: () => zlib.crc32(src) }; },
        },
    };

    // ── hashes (inputs pre-converted to the fw shape outside the timed call) ─
    for (const [mod, alg] of [['sha256', 'sha256'], ['sha512', 'sha512']]) {
        CASES[mod + '-1MiB'] = {
            size: 1 << 20,
            engines: {
                fw: () => { const h = R(mod), ba = R('bitArray'); const src = bytes(1 << 20); const inBa = ba.ui8_to_ba(src);
                    return { run: () => h.hash(inBa),
                        check: (o) => ({ parity: eq(ba.ba_to_ui8(o), nodeCrypto.createHash(alg).update(src).digest()) }) }; },
                oracle: () => { const src = bytes(1 << 20); return { run: () => nodeCrypto.createHash(alg).update(src).digest() }; },
            },
        };
    }
    CASES['sha3_256-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const s = R('sha3'), ba = R('bitArray'); const src = bytes(1 << 20); const inBa = ba.ui8_to_ba(src);
                return { run: () => s.sha3_256(inBa),
                    check: (o) => ({ parity: eq(u8(Array.isArray(o) ? ba.ba_to_ui8(o) : o), nodeCrypto.createHash('sha3-256').update(src).digest()) }) }; },
            oracle: () => { const src = bytes(1 << 20); return { run: () => nodeCrypto.createHash('sha3-256').update(src).digest() }; },
        },
    };
    CASES['blake2b512-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const b = R('blake2b'); const src = bytes(1 << 20);
                return { run: () => b.hash(src, 64),
                    check: (o) => ({ parity: eq(u8(o), nodeCrypto.createHash('blake2b512').update(src).digest()) }) }; },
            oracle: () => { const src = bytes(1 << 20); return { run: () => nodeCrypto.createHash('blake2b512').update(src).digest() }; },
        },
    };
    CASES['hmac-sha256-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const h = R('hmac'), ba = R('bitArray'); const src = bytes(1 << 20); const inBa = ba.ui8_to_ba(src); const k = ba.ui8_to_ba(KEY32);
                return { run: () => new h.fn(k).encrypt(inBa),
                    check: (o) => ({ parity: eq(ba.ba_to_ui8(o), nodeCrypto.createHmac('sha256', KEY32).update(src).digest()) }) }; },
            oracle: () => { const src = bytes(1 << 20); return { run: () => nodeCrypto.createHmac('sha256', KEY32).update(src).digest() }; },
        },
    };
    CASES['pbkdf2-sha256-10k'] = {
        size: '10000 it',
        engines: {
            fw: () => { const p = R('pbkdf2'), ba = R('bitArray');
                return { run: () => p('password', 'saltsaltsaltsalt', 10000, 256),
                    check: (o) => ({ parity: eq(ba.ba_to_ui8(o), nodeCrypto.pbkdf2Sync('password', 'saltsaltsaltsalt', 10000, 32, 'sha256')) }) }; },
            oracle: () => ({ run: () => nodeCrypto.pbkdf2Sync('password', 'saltsaltsaltsalt', 10000, 32, 'sha256') }),
        },
    };

    // ── symmetric ciphers ────────────────────────────────────────────────────
    const AES_N = 64 * 1024;
    const aesCtrFw = (variant) => () => {
        const aes = R('aes'), ctr = R('ctr'), ba = R('bitArray'); const src = bytes(AES_N);
        const key = Array.from(ba.ui8_to_ba(KEY16)); const prf = variant === 'tt' ? aes.ttable.fn(key) : aes.fn(key);
        const pt = ba.ui8_to_ba(src), iv = ba.ui8_to_ba(IV16);
        return { run: () => ctr.encrypt(prf, pt, iv),
            check: (o) => { const c = nodeCrypto.createCipheriv('aes-128-ctr', KEY16, IV16); const ref = Buffer.concat([c.update(src), c.final()]);
                return { parity: eq(ba.ba_to_ui8(o && o.ct ? o.ct : o), ref) }; } };
    };
    CASES['aes128-ctr-64KiB'] = {
        size: AES_N,
        engines: {
            'fw-ct': aesCtrFw('ct'),
            'fw-ttable': aesCtrFw('tt'),
            oracle: () => { const src = bytes(AES_N); return { run: () => { const c = nodeCrypto.createCipheriv('aes-128-ctr', KEY16, IV16); return Buffer.concat([c.update(src), c.final()]); } }; },
        },
    };
    CASES['aes256-gcm-64KiB'] = {
        size: AES_N,
        engines: {
            fw: () => { const m = R('aes_modes'); const src = bytes(AES_N);
                return { run: () => m.gcm.encrypt(KEY32, NONCE12, src, new Uint8Array(0), 128),
                    check: (o) => { const c = nodeCrypto.createCipheriv('aes-256-gcm', KEY32, NONCE12); const ct = Buffer.concat([c.update(src), c.final()]);
                        return { parity: eq(u8(o.ct), ct) && eq(u8(o.tag), c.getAuthTag()) }; } }; },
            oracle: () => { const src = bytes(AES_N); return { run: () => { const c = nodeCrypto.createCipheriv('aes-256-gcm', KEY32, NONCE12); return [Buffer.concat([c.update(src), c.final()]), c.getAuthTag()]; } }; },
        },
    };
    CASES['chacha20poly1305-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const c = R('chacha20poly1305'); const src = bytes(1 << 20);
                return { run: () => c.encrypt(KEY32, NONCE12, src),
                    check: (o) => { try { const n = nodeCrypto.createCipheriv('chacha20-poly1305', KEY32, NONCE12, { authTagLength: 16 }); const ct = Buffer.concat([n.update(src), n.final()]);
                        return { parity: eq(u8(o.ct), ct) && eq(u8(o.tag), n.getAuthTag()) }; } catch { return { parity: 'no oracle in this runtime' }; } } }; },
            oracle: () => { const src = bytes(1 << 20); nodeCrypto.createCipheriv('chacha20-poly1305', KEY32, NONCE12, { authTagLength: 16 });
                return { run: () => { const n = nodeCrypto.createCipheriv('chacha20-poly1305', KEY32, NONCE12, { authTagLength: 16 }); return Buffer.concat([n.update(src), n.final()]); } }; },
        },
    };

    // ── public key (per operation) ───────────────────────────────────────────
    CASES['ed25519-sign'] = {
        size: '1 op (64 B msg)',
        engines: {
            fw: () => { const e = R('ed25519'); const kp = e.keyPair(KEY32); const msg = bytes(64, 9);
                return { run: () => e.sign(kp.privateKey, msg),
                    check: (o) => { const pk = nodeCrypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(kp.publicKey)]), format: 'der', type: 'spki' });
                        return { parity: nodeCrypto.verify(null, msg, pk, Buffer.from(o)) }; } }; },
            oracle: () => { const sk = nodeCrypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(KEY32)]), format: 'der', type: 'pkcs8' }); const msg = bytes(64, 9);
                return { run: () => nodeCrypto.sign(null, msg, sk) }; },
        },
    };
    CASES['ed25519-verify'] = {
        size: '1 op (64 B msg)',
        engines: {
            fw: () => { const e = R('ed25519'); const kp = e.keyPair(KEY32); const msg = bytes(64, 9); const sig = e.sign(kp.privateKey, msg);
                return { run: () => e.verify(kp.publicKey, msg, sig), check: (o) => ({ parity: o === true }) }; },
            oracle: () => { const sk = nodeCrypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(KEY32)]), format: 'der', type: 'pkcs8' });
                const pk = nodeCrypto.createPublicKey(sk); const msg = bytes(64, 9); const sig = nodeCrypto.sign(null, msg, sk);
                return { run: () => nodeCrypto.verify(null, msg, pk, sig) }; },
        },
    };
    CASES['x25519-scalarMult'] = {
        size: '1 op',
        engines: {
            fw: () => { const x = R('x25519'); const pub = x.scalarMultBase(KEY32); const k = bytes(32, 11);
                // Parity: node's X25519 over the same private scalar and public u.
                const priv = nodeCrypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(k)]), format: 'der', type: 'pkcs8' });
                const peer = nodeCrypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(pub).toString('base64url') }, format: 'jwk' });
                const want = nodeCrypto.diffieHellman({ privateKey: priv, publicKey: peer });
                return { run: () => x.scalarMult(k, pub), check: (o) => ({ parity: Buffer.from(o).equals(want) }) }; },
            oracle: () => { const a = nodeCrypto.generateKeyPairSync('x25519'); const b = nodeCrypto.generateKeyPairSync('x25519');
                return { run: () => nodeCrypto.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey }) }; },
        },
    };

    // ── codecs and RNG ───────────────────────────────────────────────────────
    CASES['b64-encode-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const b = R('b64'); const src = bytes(1 << 20);
                return { run: () => b.fromBytes(src), check: (o) => ({ parity: o === Buffer.from(src).toString('base64') }) }; },
            oracle: () => { const src = Buffer.from(bytes(1 << 20)); return { run: () => src.toString('base64') }; },
        },
    };
    CASES['b64-decode-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const b = R('b64'); const src = bytes(1 << 20); const s = Buffer.from(src).toString('base64');
                return { run: () => b.toBytes(s), check: (o) => ({ parity: eq(u8(o), src) }) }; },
            oracle: () => { const s = Buffer.from(bytes(1 << 20)).toString('base64'); return { run: () => Buffer.from(s, 'base64') }; },
        },
    };
    CASES['hex-encode-1MiB'] = {
        size: 1 << 20,
        engines: {
            fw: () => { const h = R('hex'); const src = bytes(1 << 20);
                return { run: () => h.fromBytes(src), check: (o) => ({ parity: o === Buffer.from(src).toString('hex') }) }; },
            oracle: () => { const src = Buffer.from(bytes(1 << 20)); return { run: () => src.toString('hex') }; },
        },
    };
    CASES['random-bytes-64KiB'] = {
        size: 64 * 1024,
        engines: {
            fw: () => { const r = R('random'); return { run: () => r.bytes(64 * 1024), check: (o) => ({ bytes: o.length }) }; },
            oracle: () => ({ run: () => { const out = new Uint8Array(64 * 1024); globalThis.crypto.getRandomValues(out); return out; } }),
        },
    };
    CASES['cbor-roundtrip-json'] = {
        size: 'json corpus parsed',
        engines: {
            fw: () => { const c = R('cbor'); const obj = JSON.parse(new TextDecoder().decode(buildCorpus('json')).replace(/\},[^}]*$/, '}]'));
                return { run: () => c.decode(c.encode(obj)), check: (o) => ({ parity: JSON.stringify(o) === JSON.stringify(obj) }) }; },
            oracle: () => { const obj = JSON.parse(new TextDecoder().decode(buildCorpus('json')).replace(/\},[^}]*$/, '}]'));
                return { run: () => JSON.parse(JSON.stringify(obj)) }; },
        },
    };
    return CASES;
}
