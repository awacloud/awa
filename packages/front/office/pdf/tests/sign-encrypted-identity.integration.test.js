// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSign.sign()` over a V=5 R=6 encrypted base whose string
 * crypt filter is `Identity` (ISO 32000-2 §7.6.6, Table 20): strings are
 * not encrypted in such a file, so the signature field's new `/T` must be
 * written in the clear, while streams stay on `/StmF /StdCF` (AESV3).
 *
 * The base is written by `pdfEncryptedWriter` (which always names
 * `/StdCF` for both `/StmF` and `/StrF`), then its `/Encrypt` dictionary
 * is rewritten in place with an OFFSET-PRESERVING substitution: the tail
 * `/StmF /StdCF /StrF /StdCF >>` becomes `/StmF/StdCF /StrF/Identity>>`,
 * the same byte length (the three extra name bytes are paid for by
 * dropping whitespace before name delimiters inside the same dictionary),
 * so the cross-reference table stays valid. The control base receives a
 * whitespace-only rewrite of the same width that keeps `/StrF /StdCF`.
 *
 * @module pdf/tests/sign-encrypted-identity.integration
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../src/main.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const { readDocument }        = rt.resolve('pdfDocument');
const { sign }                = rt.resolve('pdfSign');
const { verifyAllSignatures } = rt.resolve('pdfSignature');
const encWriter = rt.resolve('pdfEncryptedWriter');
const ed25519m  = rt.resolve('ed25519');
const asn1m     = rt.resolve('asn1');

const FB = { asn1: asn1m, rsa: rt.resolve('rsa'), ecc: rt.resolve('ecc'),
             ed25519: ed25519m, sha256: rt.resolve('sha256'),
             sha384: rt.resolve('sha384'), sha512: rt.resolve('sha512'),
             bitArray: rt.resolve('bitArray') };

const latin1 = new TextDecoder('latin1');

/** R=6 key derivation (ISO 32000-2 §7.6.4.3.4) is slow in pure JS. */
const R6_TIMEOUT_MS = 30_000;

// ── Encrypted base — copied from `src/sig/sign.test.js` (`_rand`,
// ── `_encBase`), which exports none of it.
function _rand(seed) {
    let n = seed | 0;
    return (len) => {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            n = (n * 1103515245 + 12345) & 0x7fffffff;
            out[i] = n & 0xff;
        }
        return out;
    };
}

/** Catalog / Pages / Page / content, encrypted with the given handler. */
function _encBase({ version, revision, method, permissions, seed }) {
    const encrypt = { version, revision,
        ownerPassword: 'owner-pwd', userPassword: 'user-pwd',
        permissions: permissions === undefined ? -1 : permissions,
        randomBytes: _rand(seed || 0x5EC) };
    if (method) encrypt.method = method;
    return encWriter.writeEncryptedDocument({
        indirects: [
            { num: 1, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Catalog' },
                Pages: { type: 'ref', num: 2, gen: 0 } } } },
            { num: 2, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Pages' },
                Kids: { type: 'array', items: [{ type: 'ref', num: 3, gen: 0 }] },
                Count: { type: 'int', value: 1 } } } },
            { num: 3, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Page' },
                Parent: { type: 'ref', num: 2, gen: 0 },
                MediaBox: { type: 'array', items: [0, 0, 612, 792].map(
                    (v) => ({ type: 'int', value: v })) },
                Contents: { type: 'ref', num: 4, gen: 0 } } } },
            { num: 4, gen: 0, value: { type: 'stream',
                dict: { type: 'dict', entries: {} },
                raw: new TextEncoder().encode('BT /F1 12 Tf (secret) Tj ET') } }
        ],
        root: { num: 1, gen: 0 },
        encrypt
    });
}

/** The writer's /Encrypt tail, and its two same-width rewrites. */
const ENC_TAIL      = '/StmF /StdCF /StrF /StdCF >>';
const TAIL_IDENTITY = '/StmF/StdCF /StrF/Identity>>';
const TAIL_CONTROL  = '/StmF/StdCF /StrF/StdCF   >>';

/**
 * Replace the single occurrence of `from` with `to` (same byte length), so
 * every xref offset of the base stays exact.
 */
function rewriteSameWidth(bytes, from, to) {
    expect(to.length).toBe(from.length);
    const s = latin1.decode(bytes);
    const at = s.indexOf(from);
    expect(at).toBeGreaterThan(0);
    expect(s.indexOf(from, at + 1)).toBe(-1);
    const out = bytes.slice();
    for (let i = 0; i < to.length; i++) out[at + i] = to.charCodeAt(i);
    return out;
}

// ── Signer — the same apparatus as `src/sig/sign.test.js`
// ── (`_encLen`, `_utcTime`, `_buildTestCert`), deterministic seed.
function _encLen(n) {
    if (n < 0x80) return Uint8Array.of(n);
    if (n <= 0xff) return Uint8Array.of(0x81, n);
    if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
    return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function _utcTime(s) {
    const v = new TextEncoder().encode(s);
    const len = _encLen(v.length);
    const out = new Uint8Array(1 + len.length + v.length);
    out[0] = 0x17;
    out.set(len, 1);
    out.set(v, 1 + len.length);
    return out;
}

/** Minimal self-signed DER cert carrying the ed25519 public key. */
function _buildTestCert({ issuerCn, serial, edPubKey }) {
    const A = asn1m;
    const cnValue = new TextEncoder().encode(issuerCn);
    const cnLen = _encLen(cnValue.length);
    const cnPS = new Uint8Array(1 + cnLen.length + cnValue.length);
    cnPS[0] = 0x13;
    cnPS.set(cnLen, 1);
    cnPS.set(cnValue, 1 + cnLen.length);
    const atv = A.encodeSequence([A.encodeOid('2.5.4.3'), cnPS]);
    const name = A.encodeSequence([A.encodeSet([atv])]);
    const validity = A.encodeSequence([_utcTime('200101000000Z'), _utcTime('300101000000Z')]);
    const spki = A.encodeSequence([
        A.encodeSequence([A.encodeOid('1.3.101.112')]),
        A.encodeBitString(edPubKey, 0)
    ]);
    const sigAlg = A.encodeSequence([A.encodeOid('1.3.101.112'), A.encodeNull()]);
    const tbs = A.encodeSequence([A.encodeInteger(serial), sigAlg, name, validity, name, spki]);
    return A.encodeSequence([tbs, sigAlg, A.encodeBitString(new Uint8Array([0x00, 0x00]), 0)]);
}

function signOpts(salt) {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = (i * 29 + salt) & 0xff;
    const kp = ed25519m.keyPair(seed);
    const cert = _buildTestCert({ issuerCn: 'Identity ' + salt, serial: 900 + salt,
        edPubKey: kp.publicKey });
    return { algorithm: 'ed25519', cert, privateKey: kp.privateKey, level: 'B',
             password: 'user-pwd', randomBytes: _rand(0x1D + salt) };
}

/** `/T (Signature1)` or its unencrypted hex form `/T <5369676e617475726531>`. */
const CLEAR_T = /\/T\s*(\(Signature1\)|<5369676e617475726531>)/i;

function attempt(fn) {
    try { return { value: fn() }; }
    catch (e) { return { error: { code: e.code, message: e.message } }; }
}

describe('sign — V=5 R=6 base whose /StrF is /Identity', () => {
    let base;
    const getBase = () => base || (base = _encBase({ version: 5, revision: 6, seed: 0xC1 }));

    test('the rewritten base parses and resolves /StrF /Identity', () => {
        const b = rewriteSameWidth(getBase().bytes, ENC_TAIL, TAIL_IDENTITY);
        expect(b.length).toBe(getBase().bytes.length);
        const doc = readDocument(b, { allowEncrypted: true });
        const enc = doc._raw.resolve({ type: 'ref', num: getBase().encryptObjNum, gen: 0 });
        expect(enc.entries.StrF).toEqual({ type: 'name', value: 'Identity' });
        expect(enc.entries.StmF).toEqual({ type: 'name', value: 'StdCF' });
    }, R6_TIMEOUT_MS);

    test('level B: the new /T is the clear literal; the result parses and verifies', () => {
        const b = rewriteSameWidth(getBase().bytes, ENC_TAIL, TAIL_IDENTITY);
        const r = attempt(() => sign(b, signOpts(1)));
        expect(r.error).toBeUndefined();
        const signed = r.value;
        const tail = latin1.decode(signed.subarray(b.length));
        expect(tail).toContain('/FT /Sig');
        expect(tail).toMatch(CLEAR_T);
        expect(readDocument(signed, { allowEncrypted: true }).pages.length).toBe(1);
        const all = verifyAllSignatures(signed, FB);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);
    }, R6_TIMEOUT_MS);

    test('non-vacuity control: the same base keeping /StrF /StdCF gets an encrypted /T', () => {
        const b = rewriteSameWidth(getBase().bytes, ENC_TAIL, TAIL_CONTROL);
        const r = attempt(() => sign(b, signOpts(2)));
        expect(r.error).toBeUndefined();
        const signed = r.value;
        const tail = latin1.decode(signed.subarray(b.length));
        expect(tail).toContain('/FT /Sig');
        expect(tail).toMatch(/\/T\s*[<(]/);
        expect(tail).not.toMatch(CLEAR_T);
        expect(latin1.decode(signed)).not.toContain('(Signature1)');
        expect(verifyAllSignatures(signed, FB).signatures[0].verified).toBe(true);
    }, R6_TIMEOUT_MS);
});
