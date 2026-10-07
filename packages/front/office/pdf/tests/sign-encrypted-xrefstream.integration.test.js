// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSign.sign()` at levels B, LT and LTA over an ENCRYPTED
 * base whose newest cross-reference section is a cross-reference STREAM.
 *
 * The update writer extends such a base with a cross-reference stream too
 * (ISO 32000-2 §7.5.8), so every update `sign()` appends goes through the
 * stream arm of `pdfIncrementalWriter`, which must repeat the base's
 * `/Encrypt` in the stream dictionary (§7.5.6). The cross-reference stream
 * object itself is never encrypted (§7.6.2).
 *
 * Fixture composition (no committed binary, deterministic random source):
 *   1. a classical-xref encrypted base from `pdfEncryptedWriter` — V=5 R=6
 *      AESV3 and V=4 R=4 AESV2, one page with one content stream;
 *   2. ONE incremental update appended by hand: a new Info dictionary whose
 *      `/Producer` string is encrypted with the document key (the handler's
 *      `encryptString`, keyed by the Info's own object number), indexed by
 *      a cross-reference stream built with `pdfXref.buildXrefStream`
 *      carrying `/Encrypt`, then `startxref` / `%%EOF`.
 * A clear base composed the same way (no encryption) is the non-vacuity
 * control of the leak checks.
 *
 * Every leg checks both `readDocument` and `verifyAllSignatures`: the
 * verifier scans bytes and can pass on a document that no longer parses.
 *
 * @module pdf/tests/sign-encrypted-xrefstream.integration
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
const writerM   = rt.resolve('pdfWriter');
const xrefM     = rt.resolve('pdfXref');
const iwM       = rt.resolve('pdfIncrementalWriter');
const serM      = rt.resolve('pdfSerializer');
const v4m       = rt.resolve('pdfStandardV4');
const v6m       = rt.resolve('pdfStandardV6');
const ed25519m  = rt.resolve('ed25519');
const asn1m     = rt.resolve('asn1');

const FB = { asn1: asn1m, rsa: rt.resolve('rsa'), ecc: rt.resolve('ecc'),
             ed25519: ed25519m, sha256: rt.resolve('sha256'),
             sha384: rt.resolve('sha384'), sha512: rt.resolve('sha512'),
             bitArray: rt.resolve('bitArray') };

const latin1 = new TextDecoder('latin1');
const te = new TextEncoder();

/** R=6 key derivation (ISO 32000-2 §7.6.4.3.4) is slow in pure JS. */
const TIMEOUT_MS = 60_000;

const PRODUCER = 'xref-stream composed fixture';
const TU = 'D:20260101000000Z';
const VRI_KEY = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678';
const SIGNING_TIME = new Date(Date.UTC(2026, 9, 5, 12, 0, 0));

// ── Deterministic random source — copied from `src/sig/sign.test.js`.
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

function _concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

function _hexOf(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, '0').toUpperCase();
    }
    return s;
}

/** Catalog / Pages / Page / content — the shape of `sign.test.js`'s bases. */
function _indirects() {
    return [
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
            raw: te.encode('BT /F1 12 Tf (secret) Tj ET') } }
    ];
}

/** Classical-xref encrypted base (`pdfEncryptedWriter`). */
function _encBase({ version, revision, method, seed }) {
    const encrypt = { version, revision,
        ownerPassword: 'owner-pwd', userPassword: 'user-pwd',
        permissions: -1, randomBytes: _rand(seed) };
    if (method) encrypt.method = method;
    return encWriter.writeEncryptedDocument({
        indirects: _indirects(), root: { num: 1, gen: 0 }, encrypt });
}

/**
 * Append ONE incremental update indexed by a cross-reference stream: a new
 * Info dictionary (its `/Producer` encrypted with the document key when
 * `enc` is given), then the `/Type /XRef` stream built by
 * `pdfXref.buildXrefStream` — repeating `/Root`, `/ID` and `/Encrypt` of
 * the base — then `startxref` / `%%EOF`.
 *
 * @returns {{bytes: Uint8Array, infoNum: number, xrefNum: number,
 *            xrefOffset: number}}
 */
function _toXrefStreamNewest(baseBytes, enc) {
    const bt = iwM.readBaseTrailer(baseBytes);
    expect(bt.form).toBe('table');
    const infoNum = bt.trailer.size;
    const xrefNum = infoNum + 1;
    let producer = te.encode(PRODUCER);
    if (enc) {
        producer = enc.mod.encryptString({ method: enc.cfm }, enc.fek,
            infoNum, 0, producer, _rand(0x1F0)(16));
    }
    const info = serM.serializeIndirect(infoNum, 0, { type: 'dict', entries: {
        Producer: { type: 'string', value: producer, syntax: enc ? 'hex' : undefined } } });
    const sep = te.encode('\n');
    const infoOffset = baseBytes.length + sep.length;
    const xrefOffset = infoOffset + info.length;
    const xrefObj = xrefM.buildXrefStream({
        num: xrefNum,
        offset: xrefOffset,
        entries: [{ num: infoNum, offset: infoOffset, gen: 0 }],
        size: xrefNum + 1,
        prev: bt.xrefOffset,
        root: bt.trailer.root,
        info: { num: infoNum, gen: 0 },
        id: bt.trailer.id || null,
        encrypt: bt.trailer.encrypt || null
    });
    const bytes = _concat([baseBytes, sep, info, xrefObj,
        te.encode(`startxref\n${xrefOffset}\n%%EOF\n`)]);
    return { bytes, infoNum, xrefNum, xrefOffset };
}

// ── Signer and DSS chain — the apparatus of `src/sig/sign.test.js`
// ── (`_encLen`, `_utcTime`, `_buildTestCert`, `_fakeTstToken`).
function _encLen(n) {
    if (n < 0x80) return Uint8Array.of(n);
    if (n <= 0xff) return Uint8Array.of(0x81, n);
    if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
    return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function _utcTime(s) {
    const v = te.encode(s);
    const len = _encLen(v.length);
    const out = new Uint8Array(1 + len.length + v.length);
    out[0] = 0x17;
    out.set(len, 1);
    out.set(v, 1 + len.length);
    return out;
}

/** Minimal DER certificate carrying an ed25519 public key. */
function _buildTestCert({ issuerCn, serial, edPubKey }) {
    const A = asn1m;
    const cnValue = te.encode(issuerCn);
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

const HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};

/** Unsigned RFC 3161 token stub (TSTInfo with the given messageImprint). */
function _fakeTstToken(digest, hashOidStr) {
    const A = asn1m;
    const messageImprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(hashOidStr), A.encodeNull()]),
        A.encodeOctetString(digest)
    ]);
    const genTime = (() => {
        const s = te.encode('20240101000000Z');
        const out = new Uint8Array(2 + s.length);
        out[0] = 0x18; out[1] = s.length; out.set(s, 2);
        return out;
    })();
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeOid('1.2.3.4.5'),
        messageImprint,
        A.encodeInteger(1),
        genTime
    ]);
    const encapContentInfo = A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.9.16.1.4'),
        A.encodeExplicit(0, A.encodeOctetString(tstInfo))
    ]);
    const signedData = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeSet([]),
        encapContentInfo,
        A.encodeSet([])
    ]);
    return A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.7.2'),
        A.encodeExplicit(0, signedData)
    ]);
}

// A two-certificate chain: the signer (its certificate also rides in the
// clear signature /Contents, which §7.6.2 exempts) and a distinct CA
// certificate that only the DSS carries — the leak checks grep the CA one.
const _edKp = ed25519m.keyPair(Uint8Array.from({ length: 32 }, (_, i) => (i * 31 + 5) & 0xff));
const SIGNER_CERT = _buildTestCert({ issuerCn: 'XRefStm signer', serial: 1001,
    edPubKey: _edKp.publicKey });
const CHAIN_CERT = _buildTestCert({ issuerCn: 'XRefStm chain CA', serial: 1002,
    edPubKey: ed25519m.keyPair(new Uint8Array(32).fill(0x42)).publicKey });

/** sign() options; `tokens` collects every TimeStampToken returned. */
function _opts(level, password) {
    const tokens = [];
    const o = {
        algorithm: 'ed25519', cert: SIGNER_CERT, privateKey: _edKp.privateKey,
        level, signingTime: SIGNING_TIME,
        tsaSign: ({ digest, hashAlg }) => {
            const t = _fakeTstToken(digest, HASH_OIDS[hashAlg]);
            tokens.push(t);
            return t;
        },
        dss: { certs: [SIGNER_CERT, CHAIN_CERT],
               vri: { [VRI_KEY]: { certs: [0, 1], tu: TU } } },
        randomBytes: _rand(0x2A)
    };
    if (password !== undefined) o.password = password;
    return { o, tokens };
}

/** Catalog, signature fields and (when present) the DSS, read raw. */
function _view(signed) {
    const doc = readDocument(signed, { allowEncrypted: true });
    const R = doc._raw.resolve;
    const cat = R({ type: 'ref', num: doc.trailer.root.num, gen: doc.trailer.root.gen });
    const acro = cat.entries.AcroForm.type === 'ref'
        ? R(cat.entries.AcroForm) : cat.entries.AcroForm;
    const fields = acro.entries.Fields.items.map((ref) => ({ ref, dict: R(ref) }));
    let certRef = null, cert = null;
    if (cat.entries.DSS) {
        const dss = R(cat.entries.DSS);
        certRef = dss.entries.Certs.items[0];
        cert = R(certRef);
    }
    return { doc, R, fields, certRef, cert };
}

/** Counts over the appended tail (every byte past `baseLen`). */
function _tailFacts(signed, baseLen, encryptObjNum) {
    const tail = latin1.decode(signed.subarray(baseLen));
    const count = (needle) => tail.split(needle).length - 1;
    return {
        tail,
        startxref: count('startxref'),
        xrefStreams: count('/Type /XRef'),
        encryptRef: encryptObjNum ? count('/Encrypt ' + encryptObjNum + ' 0 R') : 0,
        anyEncrypt: count('/Encrypt'),
        classicalXref: /(^|\n)xref\n/.test(tail)
    };
}

const BASES = [
    { label: 'V=5 R=6 AESV3', version: 5, revision: 6, mod: v6m, cfm: 'AESV3', seed: 0xD6 },
    { label: 'V=4 R=4 AESV2', version: 4, revision: 4, method: 'AESV2', mod: v4m,
      cfm: 'AESV2', seed: 0xD4 }
];

const LEVELS = [
    { level: 'B',   sections: 1 },
    { level: 'LT',  sections: 2 },
    { level: 'LTA', sections: 3 }
];

for (const b of BASES) {
    describe(`sign — ${b.label} base whose newest section is a cross-reference stream`, () => {
        let cache = null;
        /** The classical encrypted base and its xref-stream-newest composition. */
        const fixture = () => {
            if (cache) return cache;
            const enc = _encBase(b);
            const composed = _toXrefStreamNewest(enc.bytes,
                { mod: b.mod, cfm: b.cfm, fek: enc.fek });
            cache = { enc, composed };
            return cache;
        };

        test('the composed base: newest section is an unencrypted /XRef stream carrying /Encrypt, and it reads', () => {
            const { enc, composed } = fixture();
            const bytes = composed.bytes;

            // The writer's own view of the base: stream form, same /Encrypt.
            const bt = iwM.readBaseTrailer(bytes);
            expect(bt.form).toBe('stream');
            expect(bt.xrefOffset).toBe(composed.xrefOffset);
            expect(bt.trailer.encrypt).toEqual({ num: enc.encryptObjNum, gen: 0 });
            expect(bt.trailer.info).toEqual({ num: composed.infoNum, gen: 0 });
            expect(bt.trailer.size).toBe(composed.xrefNum + 1);

            // The update: no classical table, one clear /XRef stream (no
            // /Filter, its dictionary readable as is) carrying /Encrypt.
            const t = _tailFacts(bytes, enc.bytes.length, enc.encryptObjNum);
            expect(t.classicalXref).toBe(false);
            expect(t.xrefStreams).toBe(1);
            expect(t.startxref).toBe(1);
            expect(t.encryptRef).toBe(1);
            expect(t.tail).not.toContain('/Filter');
            expect(t.tail).not.toContain(PRODUCER);
            const xs = xrefM.readXrefStreamDict(bytes, composed.xrefOffset).dict;
            expect(xs.entries.Type).toEqual({ type: 'name', value: 'XRef' });
            expect(xs.entries.Encrypt).toEqual({ type: 'ref', num: enc.encryptObjNum, gen: 0 });

            // Parses with the classical base's page count; the merged
            // trailer keeps /Encrypt; the new /Producer decrypts under the
            // Info's own object number.
            const before = readDocument(enc.bytes, { allowEncrypted: true });
            const doc = readDocument(bytes, { allowEncrypted: true });
            expect(doc.pages.length).toBe(before.pages.length);
            expect(doc.pages.length).toBe(1);
            expect(doc.trailer.encrypt).toEqual({ num: enc.encryptObjNum, gen: 0 });
            const info = doc._raw.resolve({ type: 'ref', num: composed.infoNum, gen: 0 });
            const producer = b.mod.decryptString({ method: b.cfm }, enc.fek,
                composed.infoNum, 0, info.entries.Producer.value);
            expect(latin1.decode(producer)).toBe(PRODUCER);
        }, TIMEOUT_MS);

        for (const { level, sections } of LEVELS) {
            test(`level ${level}: every update is an /XRef stream repeating /Encrypt; names and DSS encrypted; reads and verifies`, () => {
                const { enc, composed } = fixture();
                const base = composed.bytes;
                const { o, tokens } = _opts(level, 'user-pwd');
                const signed = sign(base, o);
                expect(signed).toBeInstanceOf(Uint8Array);

                // Cross-reference form of every appended section.
                const t = _tailFacts(signed, base.length, enc.encryptObjNum);
                expect(t.classicalXref).toBe(false);
                expect(t.startxref).toBe(sections);
                expect(t.xrefStreams).toBe(sections);
                expect(t.encryptRef).toBe(sections);
                expect(t.anyEncrypt).toBe(t.startxref);
                expect(iwM.readBaseTrailer(signed).form).toBe('stream');

                // Field names and the DSS certificate, decrypted.
                const v = _view(signed);
                const name = (f) => latin1.decode(b.mod.decryptString({ method: b.cfm },
                    enc.fek, f.ref.num, f.ref.gen, f.dict.entries.T.value));
                expect(name(v.fields[0])).toBe('Signature1');
                if (level === 'LTA') {
                    expect(v.fields.length).toBe(2);
                    expect(name(v.fields[1])).toBe('Signature2');
                } else {
                    expect(v.fields.length).toBe(1);
                }
                if (level === 'B') {
                    expect(v.cert).toBe(null);
                } else {
                    expect(v.cert.type).toBe('stream');
                    const certPlain = b.mod.decryptStream({ method: b.cfm }, enc.fek,
                        v.certRef.num, v.certRef.gen, v.cert.raw);
                    expect(Array.from(certPlain)).toEqual(Array.from(SIGNER_CERT));
                }

                // Nothing in clear in the appended sections.
                expect(t.tail).not.toContain('(Signature');
                expect(t.tail).not.toContain('(D:');
                expect(t.tail.includes(latin1.decode(CHAIN_CERT))).toBe(false);
                expect(t.tail.includes(_hexOf(CHAIN_CERT))).toBe(false);
                expect(t.tail.includes(_hexOf(CHAIN_CERT).toLowerCase())).toBe(false);

                // Parses (same page count) AND verifies.
                expect(v.doc.pages.length).toBe(1);
                expect(v.doc.trailer.encrypt).toEqual({ num: enc.encryptObjNum, gen: 0 });
                const all = verifyAllSignatures(signed, FB);
                expect(all.signatures.length).toBe(1);
                expect(all.signatures[0].verified).toBe(true);
                if (level === 'LTA') {
                    expect(tokens.length).toBe(2);
                    expect(all.timestamps.length).toBe(1);
                    expect(all.timestamps[0].verified).toBe(true);
                } else {
                    expect(all.timestamps.length).toBe(0);
                }
            }, TIMEOUT_MS);
        }
    });
}

describe('sign — clear base whose newest section is a cross-reference stream (non-vacuity control)', () => {
    let cache = null;
    const fixture = () => {
        if (cache) return cache;
        const classical = writerM.writeDocument({ indirects: _indirects(),
            root: { num: 1, gen: 0 },
            id: [_rand(0xC0)(16), _rand(0xC1)(16)] });
        cache = { classical, composed: _toXrefStreamNewest(classical, null) };
        return cache;
    };

    test('the composed clear base reads, stream form, no /Encrypt', () => {
        const { classical, composed } = fixture();
        expect(iwM.readBaseTrailer(composed.bytes).form).toBe('stream');
        const t = _tailFacts(composed.bytes, classical.length, 0);
        expect(t.classicalXref).toBe(false);
        expect(t.xrefStreams).toBe(1);
        expect(t.anyEncrypt).toBe(0);
        expect(t.tail).toContain('(' + PRODUCER + ')');
        expect(readDocument(composed.bytes).pages.length).toBe(1);
    }, TIMEOUT_MS);

    for (const { level, sections } of LEVELS) {
        test(`level ${level}: signs and verifies; the tail carries the clear names the encrypted legs must hide`, () => {
            const { composed } = fixture();
            const base = composed.bytes;
            const { o, tokens } = _opts(level);
            const signed = sign(base, o);
            const t = _tailFacts(signed, base.length, 0);
            expect(t.classicalXref).toBe(false);
            expect(t.startxref).toBe(sections);
            expect(t.xrefStreams).toBe(sections);
            expect(t.anyEncrypt).toBe(0);

            // The leak checks of the encrypted legs CAN fire.
            expect(t.tail).toContain('(Signature1)');
            if (level === 'LTA') expect(t.tail).toContain('(Signature2)');
            if (level !== 'B') {
                expect(t.tail).toContain('(' + TU + ')');
                expect(t.tail.includes(latin1.decode(CHAIN_CERT))).toBe(true);
            }

            expect(readDocument(signed).pages.length).toBe(1);
            const all = verifyAllSignatures(signed, FB);
            expect(all.signatures.length).toBe(1);
            expect(all.signatures[0].verified).toBe(true);
            if (level === 'LTA') {
                expect(tokens.length).toBe(2);
                expect(all.timestamps[0].verified).toBe(true);
            }
        }, TIMEOUT_MS);
    }
});
