// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSignature` — failure-surface and dispatch paths.
 *
 * `signature.test.js` owns the happy paths (real sign → verify
 * roundtrips for Ed25519 / RSA-PSS / ECDSA). This file owns the other
 * half of the contract: every typed error a malformed signature
 * dictionary, a malformed PKCS#7 SignedData, a broken signer
 * certificate SPKI or an unusable DocTimeStamp token must surface.
 *
 * Everything is built from REAL DER via the fw `asn1` encoders and
 * parsed with the real `asn1` parser — no stub tree, no invented
 * cryptographic byte. Digests compared against `messageImprint` are
 * recomputed in-test from the very bytes the module hashes, so the
 * assertions are round-trip/structural rather than golden constants.
 *
 * @module pdf/sig/signature.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfSignature } from './signature.js';
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
import { asn1 as _fwAsn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { sha256 as _fwSha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha512 as _fwSha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { sha384 as _fwSha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 as _fwUtf8 } from '@awacloud/fw/io/codec/utf8.js';
import { ed25519 as _fwEd } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { findSignatures, formRanges, rangeWithGap, rewriteByteRange,
         gapForm as gapFormOracle }
    from '../../tests/_helpers/byterange-rewrite.js';

const A = _fwAsn1.factory();
const _ba = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _sha256m = _fwSha256.factory(_ba, _utf8m);
const _sha512m = _fwSha512.factory(_ba, _utf8m);
const _sha384m = _fwSha384.factory(_sha512m);
const _edm = _fwEd.factory(_sha512m, _ba);

const _errors = pdfErrors.factory();
const { ParseError } = _errors;
const _oids = pdfSigOids.factory(asn1Oid.factory());
const _parser = pdfParser.factory(_errors, pdfParserObj.factory(),
    pdfTokenizer.factory(_errors, pdfShared.factory()));
const { obj } = _parser;

/** Instance wired with the real hash + asn1 modules (no pk modules). */
const _sig = pdfSignature.factory(_errors, _parser, _oids, A,
    null, null, null, _sha256m, _sha384m, _sha512m, _ba);
const { typeSignature, verifyPk, _hashByteRange, _verifyPkcs7Signature,
        _verifyTsaSignature, verifyAllSignatures } = _sig;

/** fw bundle handed to the white-box helpers. */
const FB = { asn1: A, bitArray: _ba,
             sha256: _sha256m, sha384: _sha384m, sha512: _sha512m };

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_SHA1 = '1.3.14.3.2.26';
const OID_ED25519 = '1.3.101.112';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_RSA_PSS = '1.2.840.113549.1.1.10';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';

function tlv(tag, body) {
    let len;
    if (body.length < 0x80) len = Uint8Array.of(body.length);
    else if (body.length <= 0xff) len = Uint8Array.of(0x81, body.length);
    else if (body.length <= 0xffff) {
        len = Uint8Array.of(0x82, (body.length >>> 8) & 0xff, body.length & 0xff);
    } else {
        len = Uint8Array.of(0x83, (body.length >>> 16) & 0xff,
            (body.length >>> 8) & 0xff, body.length & 0xff);
    }
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = tag;
    out.set(len, 1);
    out.set(body, 1 + len.length);
    return out;
}
function concat(list) {
    let n = 0;
    for (const b of list) n += b.length;
    const out = new Uint8Array(n);
    let off = 0;
    for (const b of list) { out.set(b, off); off += b.length; }
    return out;
}
function printable(s) { return tlv(0x13, new TextEncoder().encode(s)); }
function utcTime(s) { return tlv(0x17, new TextEncoder().encode(s)); }
function genTime(s) { return tlv(0x18, new TextEncoder().encode(s)); }
function name(cn) {
    return A.encodeSequence([A.encodeSet([A.encodeSequence(
        [A.encodeOid('2.5.4.3'), printable(cn)])])]);
}
function sha256Of(bytes) {
    const out = _sha256m.hash(_ba.ui8_to_ba(bytes));
    return out instanceof Uint8Array ? out : _ba.ba_to_ui8(out);
}

/** Parse a SignedData built from `kids` into the children array the
 *  white-box `_verifyPkcs7Signature` consumes. */
function sdOf(kids) {
    const der = A.encodeSequence(kids);
    return A.parseChildren(A.parseOne(der, 0).value);
}

/**
 * Build a certificate whose SPKI is caller-controlled — the lever used
 * to drive every `_extractSpki` branch.
 */
function certWithSpki(spki, o) {
    o = o || {};
    const tbs = A.encodeSequence([
        A.encodeInteger(new Uint8Array([o.serial === undefined ? 1 : o.serial])),
        A.encodeSequence([A.encodeOid(OID_RSA), A.encodeNull()]),
        name(o.issuerCn || 'CA'),
        A.encodeSequence([utcTime('200101000000Z'), utcTime('300101000000Z')]),
        name(o.cn || 'Leaf'),
        spki
    ]);
    return A.encodeSequence([
        tbs,
        A.encodeSequence([A.encodeOid(OID_RSA), A.encodeNull()]),
        A.encodeBitString(new Uint8Array(2), 0)
    ]);
}
function ed25519Spki(pub) {
    return A.encodeSequence([
        A.encodeSequence([A.encodeOid(OID_ED25519)]),
        A.encodeBitString(pub, 0)
    ]);
}

/**
 * Assemble the SignedData children for a SignerInfo-driven test.
 *
 * @param {Object} o
 * @param {string} [o.digestOid] SignerInfo digestAlgorithm OID.
 * @param {string} [o.sigOid] SignerInfo signatureAlgorithm OID.
 * @param {Uint8Array} [o.signature] The encryptedDigest OCTET STRING body.
 * @param {Uint8Array} [o.signedAttrs] Raw [0] IMPLICIT signedAttrs TLV.
 * @param {Uint8Array[]} [o.certs] Certificate DERs for `certificates [0]`.
 * @param {Uint8Array} [o.sid] SignerInfo sid (IssuerAndSerialNumber).
 */
function signedData(o) {
    o = o || {};
    const siKids = [
        A.encodeInteger(new Uint8Array([1])),
        o.sid || A.encodeSequence([name('CA'), A.encodeInteger(
            new Uint8Array([1]))]),
        A.encodeSequence([A.encodeOid(o.digestOid || OID_SHA256),
                          A.encodeNull()])
    ];
    if (o.signedAttrs) siKids.push(o.signedAttrs);
    siKids.push(A.encodeSequence([A.encodeOid(o.sigOid || OID_ED25519)]));
    siKids.push(A.encodeOctetString(o.signature || new Uint8Array(8)));
    const kids = [
        A.encodeInteger(new Uint8Array([1])),
        A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256)])]),
        A.encodeSequence([A.encodeOid('1.2.840.113549.1.7.1')])
    ];
    if (o.certs) kids.push(tlv(0xA0, concat(o.certs)));
    kids.push(A.encodeSet([A.encodeSequence(siKids)]));
    return sdOf(kids);
}

/** Build a [0] IMPLICIT signedAttrs TLV carrying `messageDigest`. */
function signedAttrs(md, opts) {
    opts = opts || {};
    const attrs = [
        A.encodeSequence([A.encodeOid(OID_CONTENT_TYPE),
                          A.encodeSet([A.encodeOid('1.2.840.113549.1.7.1')])])
    ];
    if (md) {
        attrs.push(A.encodeSequence([
            A.encodeOid(OID_MESSAGE_DIGEST),
            A.encodeSet([opts.notOctet
                ? A.encodeOid('1.2.3')
                : A.encodeOctetString(md)])
        ]));
    }
    return tlv(0xA0, concat(attrs));
}

const DOC = new TextEncoder().encode(
    '%PDF-2.0\n% signature paths fixture — stable byte prefix\n');

function sigDict(extra) {
    return obj.dict(Object.assign({
        Type: obj.name('Sig'),
        Filter: obj.name('Adobe.PPKLite'),
        SubFilter: obj.name('adbe.pkcs7.detached'),
        Contents: obj.string(new Uint8Array([0x30, 0x00]), 'hex'),
        ByteRange: obj.array([obj.int(0), obj.int(10),
                              obj.int(20), obj.int(10)])
    }, extra || {}));
}

describe('typeSignature — remaining required-entry errors', () => {
    test('rejects a missing /SubFilter', () => {
        const d = sigDict();
        delete d.entries.SubFilter;
        let caught = null;
        try { typeSignature(d); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/sig/missing-subfilter');
    });

    test('rejects a /SubFilter that is not a name', () => {
        let caught = null;
        try {
            typeSignature(sigDict({
                SubFilter: obj.string(new Uint8Array([0x41])) }));
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sig/missing-subfilter');
    });

    test('rejects a missing /Contents', () => {
        const d = sigDict();
        delete d.entries.Contents;
        let caught = null;
        try { typeSignature(d, { objNum: 7, objGen: 0 }); }
        catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sig/missing-contents');
        expect(caught.context).toEqual({ objNum: 7, objGen: 0 });
    });

    test('rejects a missing /ByteRange', () => {
        const d = sigDict();
        delete d.entries.ByteRange;
        let caught = null;
        try { typeSignature(d); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sig/missing-byterange');
    });

    test('coerces non-numeric /ByteRange items to 0', () => {
        const s = typeSignature(sigDict({
            ByteRange: obj.array([obj.int(0), obj.name('x'),
                                  obj.int(20), obj.int(10)])
        }));
        expect(s.byteRange).toEqual([0, 0, 20, 10]);
    });
});

describe('_hashByteRange — inconsistent ranges and the hash fallback', () => {
    const bytes = new Uint8Array(64);

    test('refuses a ByteRange whose second span overlaps the first', () => {
        let caught = null;
        try { _hashByteRange(bytes, [0, 30, 10, 10], _sha256m, _ba); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/sig/byterange/inconsistent');
        expect(caught.context.total).toBe(64);
    });

    test('refuses a ByteRange that runs past the document', () => {
        expect(() => _hashByteRange(bytes, [0, 10, 20, 900], _sha256m, _ba))
            .toThrow(ParseError);
        expect(() => _hashByteRange(bytes, [-1, 10, 20, 10], _sha256m, _ba))
            .toThrow(ParseError);
    });

    test('falls back to hashMod.hash + _concatRange when there is no .fn', () => {
        // A hash module exposing only the one-shot `hash` API (no
        // streaming `fn`) takes the `_concatRange` branch. Since BL-272
        // that branch wraps the materialised bytes with `ba.ui8_to_ba`,
        // so it hands the module the SAME bit content the streaming path
        // feeds its context — the two digests must agree.
        const doc = new Uint8Array(64);
        for (let i = 0; i < doc.length; i++) doc[i] = (i * 7 + 3) & 0xff;
        const br = [0, 10, 20, 10];
        const covered = new Uint8Array(20);        // b + d covered bytes
        covered.set(doc.subarray(0, 10), 0);
        covered.set(doc.subarray(20, 30), 10);

        const seen = [];
        const plain = { hash: (input) => { seen.push(input);
                                           return _sha256m.hash(input); } };
        const out = _hashByteRange(doc, br, plain, _ba);

        // Structural: the `_concatRange` branch runs exactly once, over
        // the covered bytes, handed over as a bitArray (not a Uint8Array).
        expect(seen.length).toBe(1);
        expect(seen[0]).not.toBeInstanceOf(Uint8Array);
        expect(seen[0]).toEqual(_ba.ui8_to_ba(covered));
        expect(Array.from(_ba.ba_to_ui8(seen[0]))).toEqual(Array.from(covered));

        // Contract: a Uint8Array digest, deterministic, and byte-for-byte
        // equal to the streaming path's for the same ranges (BL-272).
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Array.from(out)).toEqual(Array.from(
            _hashByteRange(doc, br, plain, _ba)));
        expect(Array.from(out)).toEqual(Array.from(
            _hashByteRange(doc, br, _sha256m, _ba)));
    });

    test('the fallback path also refuses an inconsistent ByteRange', () => {
        const plain = { hash: (ba) => _sha256m.hash(ba) };
        let caught = null;
        try { _hashByteRange(bytes, [0, 40, 10, 10], plain, _ba); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.message).toContain('_concatRange');
    });
});

describe('_verifyPkcs7Signature — SignedData structure errors', () => {
    function codes(r) { return r.errors.map((e) => e.code); }

    test('no signerInfos SET', () => {
        const sd = sdOf([A.encodeInteger(new Uint8Array([1]))]);
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig');
        expect(r.verified).toBe(false);
        expect(codes(r)).toEqual(['pdf/sig/no-signer']);
        expect(r.signerCerts).toEqual([]);
    });

    test('empty signerInfos SET', () => {
        const sd = sdOf([A.encodeInteger(new Uint8Array([1])), A.encodeSet([])]);
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig')))
            .toEqual(['pdf/sig/empty-signers']);
    });

    test('unparseable signerInfo[0]', () => {
        const sd = sdOf([A.encodeSet([tlv(0x30, new Uint8Array([0x30, 0x7F]))])]);
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig')))
            .toEqual(['pdf/sig/bad-signer']);
    });

    test('unsupported digestAlgorithm OID', () => {
        const sd = signedData({ digestOid: '1.2.3.999' });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig')))
            .toEqual(['pdf/sig/unknown-digest']);
    });

    test('digest module missing from the fw bundle', () => {
        const sd = signedData({ digestOid: OID_SHA1 });
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig');
        expect(codes(r)).toEqual(['pdf/sig/no-hash']);
        expect(r.hashAlg).toBe('sha1');
    });

    test('unsupported signatureAlgorithm OID', () => {
        const sd = signedData({ sigOid: '1.2.3.999' });
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig');
        expect(codes(r)).toEqual(['pdf/sig/unknown-sigalg']);
        expect(r.hashAlg).toBe('sha256');
        expect(r.signatureAlg).toBe(null);
    });

    test('SignerInfo whose positional walk lands on a non-OCTET signature', () => {
        // A SignerInfo that carries signedAttrs but then diverges from the
        // RFC 5652 field order: the dissection's positional walk lands on
        // a NULL where the encryptedDigest OCTET STRING must be, while a
        // later (AlgorithmIdentifier, OCTET STRING) pair still identifies
        // the signature algorithm.
        const si = A.encodeSequence([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeSequence([name('CA'), A.encodeInteger(new Uint8Array([1]))]),
            A.encodeSequence([A.encodeOid(OID_SHA256), A.encodeNull()]),
            signedAttrs(new Uint8Array(32)),
            A.encodeSequence([A.encodeOid(OID_ED25519)]),
            A.encodeNull(),
            A.encodeSequence([A.encodeOid(OID_ED25519)]),
            A.encodeOctetString(new Uint8Array(8))
        ]);
        const sd = sdOf([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256)])]),
            A.encodeSequence([A.encodeOid('1.2.840.113549.1.7.1')]),
            A.encodeSet([si])
        ]);
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig');
        expect(codes(r)).toEqual(['pdf/sig/no-encrypted-digest']);
        expect(r.signatureAlg).toBe('ed25519');
    });

    test('honours the caller code prefix', () => {
        const sd = sdOf([A.encodeInteger(new Uint8Array([1]))]);
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/ts')))
            .toEqual(['pdf/ts/no-signer']);
    });

    test('no payload at all (no signedAttrs, no eContent, no ByteRange)', () => {
        const sd = signedData({});
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig');
        expect(codes(r)).toEqual(['pdf/sig/no-econtent']);
        expect(r.computedDigest).toBe(null);
    });

    test('ByteRange digest recomputation failure', () => {
        const sd = signedData({});
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig', {
            byteRangeDocument: DOC, byteRange: [0, 5, 2, 5]
        });
        expect(codes(r)).toEqual(['pdf/sig/digest-failed']);
    });

    test('signer certificate not found', () => {
        const sd = signedData({});
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig', {
            byteRangeDocument: DOC, byteRange: [0, 10, 20, 10]
        });
        expect(codes(r)).toEqual(['pdf/sig/signer-cert-not-found']);
        expect(r.computedDigest).toBeInstanceOf(Uint8Array);
    });
});

describe('_verifyPkcs7Signature — signedAttrs messageDigest cross-check', () => {
    const RANGE = { byteRangeDocument: DOC, byteRange: [0, 10, 20, 10] };
    const expected = _hashByteRange(DOC, RANGE.byteRange, _sha256m, _ba);
    function codes(r) { return r.errors.map((e) => e.code); }

    test('rejects a messageDigest of the wrong length', () => {
        const sd = signedData({
            signedAttrs: signedAttrs(new Uint8Array([1, 2, 3])) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/digest-length-mismatch']);
    });

    test('rejects a messageDigest that does not match the ByteRange', () => {
        const wrong = new Uint8Array(expected);
        wrong[0] ^= 0xFF;
        const sd = signedData({ signedAttrs: signedAttrs(wrong) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/digest-mismatch']);
    });

    test('rejects signedAttrs without a messageDigest attribute', () => {
        const sd = signedData({ signedAttrs: signedAttrs(null) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/no-message-digest-attr']);
    });

    test('skips a messageDigest attribute whose value is not an OCTET STRING', () => {
        const sd = signedData({
            signedAttrs: signedAttrs(expected, { notOctet: true }) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/no-message-digest-attr']);
    });

    test('rejects unparseable signedAttrs', () => {
        const sd = signedData({
            signedAttrs: tlv(0xA0, new Uint8Array([0x30, 0x7F])) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/signed-attrs-parse-failed']);
    });

    test('reports digest-not-computed when no payload was hashed', () => {
        const sd = signedData({ signedAttrs: signedAttrs(expected) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig')))
            .toEqual(['pdf/sig/digest-not-computed']);
    });

    test('a matching messageDigest advances to signer-cert lookup', () => {
        const sd = signedData({ signedAttrs: signedAttrs(expected) });
        expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
            .toEqual(['pdf/sig/signer-cert-not-found']);
    });

    test('re-encodes long signedAttrs with 2- and 3-byte DER lengths', () => {
        for (const padBytes of [300, 70000]) {
            const pad = A.encodeSequence([
                A.encodeOid('1.2.3.4'),
                A.encodeSet([A.encodeOctetString(new Uint8Array(padBytes))])
            ]);
            const base = signedAttrs(expected);
            // Re-wrap: [0] IMPLICIT over (original attrs ‖ padding attr).
            const big = tlv(0xA0, concat([base.subarray(2), pad]));
            expect(big.length).toBeGreaterThan(padBytes);
            const sd = signedData({ signedAttrs: big });
            // The digest cross-check must still pass — the messageDigest
            // attribute survived the re-encoding — so the walk reaches
            // the signer-cert lookup.
            expect(codes(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)))
                .toEqual(['pdf/sig/signer-cert-not-found']);
        }
    });

    test('eContent mode without signedAttrs signs the eContent itself', () => {
        const eContent = new TextEncoder().encode('raw encapsulated content');
        const sd = signedData({});
        const r = _verifyPkcs7Signature(sd, eContent, FB, 'pdf/ts');
        expect(codes(r)).toEqual(['pdf/ts/signer-cert-not-found']);
        expect(Array.from(r.computedDigest))
            .toEqual(Array.from(sha256Of(eContent)));
    });

    test('eContent mode hashes the encapsulated content instead', () => {
        const eContent = new TextEncoder().encode('timestamped payload');
        const sd = signedData({
            signedAttrs: signedAttrs(sha256Of(eContent)) });
        const r = _verifyPkcs7Signature(sd, eContent, FB, 'pdf/ts');
        expect(codes(r)).toEqual(['pdf/ts/signer-cert-not-found']);
        expect(Array.from(r.computedDigest))
            .toEqual(Array.from(sha256Of(eContent)));
    });
});

describe('_verifyPkcs7Signature — signer certificate SPKI extraction', () => {
    const RANGE = { byteRangeDocument: DOC, byteRange: [0, 10, 20, 10] };
    function code(sd) {
        return _verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
            .errors.map((e) => e.code)[0];
    }

    test('certificate without a tbsCertificate', () => {
        const broken = tlv(0x30, new Uint8Array([0x30, 0x7F]));
        expect(code(signedData({ certs: [broken] })))
            .toBe('pdf/sig/spki-cert-parse');
    });

    test('certificate whose tbsCertificate does not parse', () => {
        const broken = A.encodeSequence([tlv(0x30, new Uint8Array([0x30, 0x7F]))]);
        expect(code(signedData({ certs: [broken] })))
            .toBe('pdf/sig/spki-cert-parse');
    });

    test('tbsCertificate too short to hold an SPKI', () => {
        const short = A.encodeSequence([A.encodeSequence([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeSequence([A.encodeOid(OID_RSA)])
        ])]);
        expect(code(signedData({ certs: [short] })))
            .toBe('pdf/sig/spki-not-found');
    });

    test('malformed SubjectPublicKeyInfo (single child)', () => {
        const cert = certWithSpki(A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_ED25519)])]));
        expect(code(signedData({ certs: [cert] })))
            .toBe('pdf/sig/spki-malformed');
    });

    test('empty SPKI BIT STRING', () => {
        const cert = certWithSpki(A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_ED25519)]),
            tlv(0x03, new Uint8Array(0))
        ]));
        expect(code(signedData({ certs: [cert] })))
            .toBe('pdf/sig/spki-bitstring-empty');
    });

    test('Ed25519 public key of the wrong length', () => {
        const cert = certWithSpki(ed25519Spki(new Uint8Array(31)));
        expect(code(signedData({ certs: [cert] })))
            .toBe('pdf/sig/spki-ed25519-bad-len');
    });

    test('RSA public key that does not parse', () => {
        const cert = certWithSpki(A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_RSA), A.encodeNull()]),
            A.encodeBitString(new Uint8Array([0x30, 0x7F]), 0)
        ]));
        expect(code(signedData({ certs: [cert], sigOid: OID_RSA_PSS })))
            .toBe('pdf/sig/spki-rsa-parse');
    });

    test('RSAPublicKey missing the exponent', () => {
        const cert = certWithSpki(A.encodeSequence([
            A.encodeSequence([A.encodeOid(OID_RSA), A.encodeNull()]),
            A.encodeBitString(A.encodeSequence(
                [A.encodeInteger(new Uint8Array([1, 2]))]), 0)
        ]));
        expect(code(signedData({ certs: [cert], sigOid: OID_RSA_PSS })))
            .toBe('pdf/sig/spki-rsa-fields');
    });

    test('ECC point that is not SEC1-uncompressed', () => {
        const compressed = new Uint8Array(33);
        compressed[0] = 0x02;
        const cert = certWithSpki(A.encodeSequence([
            A.encodeSequence([A.encodeOid('1.2.840.10045.2.1'),
                              A.encodeOid('1.2.840.10045.3.1.7')]),
            A.encodeBitString(compressed, 0)
        ]));
        expect(code(signedData({ certs: [cert], sigOid: OID_ECDSA_SHA256 })))
            .toBe('pdf/sig/spki-ecc-not-uncompressed');
    });

    test('an extractable SPKI reaches the public-key verifier', () => {
        // Ed25519 key of the right length but a signature that cannot
        // verify — the module must report the pk failure, not an SPKI one.
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 3) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = certWithSpki(ed25519Spki(kp.publicKey));
        const sd = signedData({ certs: [cert] });
        const r = _verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE);
        expect(r.verified).toBe(false);
        // No ed25519 module wired on this instance → precise dispatch code.
        expect(r.errors[0].code).toBe('pdf/sig/verify-pk/no-ed25519');
        expect(r.signerCerts.length).toBe(1);
        expect(r.signerCerts[0].der).toBeInstanceOf(Uint8Array);
    });

    test('matches the signer certificate by IssuerAndSerialNumber', () => {
        const other = certWithSpki(ed25519Spki(new Uint8Array(32)),
            { cn: 'Other', issuerCn: 'OtherCA', serial: 5 });
        const wanted = certWithSpki(ed25519Spki(new Uint8Array(31)),
            { cn: 'Wanted', issuerCn: 'CA', serial: 1 });
        // sid points at (CA, 1) → the SECOND cert; its 31-byte key makes
        // the match observable through the resulting error code.
        const sd = signedData({ certs: [other, wanted] });
        expect(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
            .errors[0].code).toBe('pdf/sig/spki-ed25519-bad-len');
    });

    test('falls back to the first certificate when the sid is unusable', () => {
        const first = certWithSpki(ed25519Spki(new Uint8Array(31)),
            { cn: 'First', issuerCn: 'Nope', serial: 9 });
        const sd = signedData({
            certs: [first],
            sid: A.encodeOctetString(new Uint8Array([1]))   // not a SEQUENCE
        });
        expect(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
            .errors[0].code).toBe('pdf/sig/spki-ed25519-bad-len');
    });

    test('reports signer-cert-not-found when the certificates field holds '
        + 'no SEQUENCE', () => {
        const sd = signedData({ certs: [A.encodeNull()] });
        expect(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
            .errors[0].code).toBe('pdf/sig/signer-cert-not-found');
    });

    test('reads the named curve from the EC algorithm parameters', () => {
        for (const curveOid of ['1.3.132.0.34', '1.3.132.0.35',
                                '1.2.840.10045.3.1.7']) {
            const point = new Uint8Array(97);
            point[0] = 0x04;
            const cert = certWithSpki(A.encodeSequence([
                A.encodeSequence([A.encodeOid('1.2.840.10045.2.1'),
                                  A.encodeOid(curveOid)]),
                A.encodeBitString(point, 0)
            ]));
            const sd = signedData({ certs: [cert], sigOid: OID_ECDSA_SHA256 });
            // SPKI extraction succeeds → the failure is the missing fw ecc.
            expect(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
                .errors[0].code).toBe('pdf/sig/verify-pk/no-ecc');
        }
    });

    test('falls back to the first certificate when no sid matches', () => {
        const only = certWithSpki(ed25519Spki(new Uint8Array(31)),
            { cn: 'Only', issuerCn: 'Unrelated', serial: 42 });
        const sd = signedData({ certs: [only] });
        expect(_verifyPkcs7Signature(sd, null, FB, 'pdf/sig', RANGE)
            .errors[0].code).toBe('pdf/sig/spki-ed25519-bad-len');
    });
});

describe('_verifyTsaSignature', () => {
    test('reports a missing SignedData', () => {
        const r = _verifyTsaSignature(A.encodeSequence(
            [A.encodeOid(OID_SIGNED_DATA)]), FB);
        expect(r.verified).toBe(false);
        expect(r.errors[0].code).toBe('pdf/ts/tsa-no-sd');
    });

    test('captures a throwing asn1 module', () => {
        const r = _verifyTsaSignature(new Uint8Array(4), {
            asn1: { parseOne() { throw new Error('boom'); } }
        });
        expect(r.verified).toBe(false);
        expect(r.errors[0].code).toBe('pdf/ts/tsa-throw');
        expect(r.errors[0].message).toContain('boom');
    });

    test('extracts the eContent and delegates to the shared verifier', () => {
        const eContent = A.encodeSequence([A.encodeInteger(
            new Uint8Array([1]))]);
        const encap = A.encodeSequence([
            A.encodeOid(OID_TST_INFO),
            A.encodeExplicit(0, A.encodeOctetString(eContent))
        ]);
        const blob = A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence([
                A.encodeInteger(new Uint8Array([3])),
                A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256)])]),
                encap
            ]))
        ]);
        const r = _verifyTsaSignature(blob, FB);
        // This token carries no signerInfos, so the LAST SET in the
        // SignedData is `digestAlgorithms` — the shared helper walks it
        // as a SignerInfo and stops on its missing digestAlgorithm.
        // What matters here is that the eContent was located and the
        // shared verifier was reached under the 'pdf/ts' prefix.
        expect(r.verified).toBe(false);
        expect(r.errors[0].code).toBe('pdf/ts/unknown-digest');
    });
});

describe('verifyAllSignatures — DocTimeStamp branches', () => {
    const PREFIX = new TextEncoder().encode(
        '%PDF-2.0\n% DocTimeStamp fixture — the bytes around the token get hashed\n');
    const N = PREFIX.length;
    const te = new TextEncoder();
    const HEAD = '1 0 obj << /Type /DocTimeStamp /Filter /Adobe.PPKLite '
        + '/SubFilter /ETSI.RFC3161 /ByteRange [';
    const MID = '] /Contents ';
    const TAIL = ' >> endobj\n';
    // Each /ByteRange integer is zero-padded to a fixed width (PDF integers
    // may carry leading zeros; the scanner reads `\d+`), so the range text
    // never shifts the token it describes.
    const INT_WIDTH = 10;
    const BR_TEXT_LEN = 4 * INT_WIDTH + 3;

    function hexOf(bytes) {
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
        }
        return hex;
    }

    /**
     * Compose `PREFIX + objText`, a single DocTimeStamp whose `/ByteRange`
     * gap is, by default, exactly its `<…>` token (form b):
     * `[0, lt, gt + 1, total - (gt + 1)]`, `lt`/`gt` the offsets of `<`/`>`.
     * An explicit `byteRange` overrides the declared ranges (same width).
     */
    function docWithToken(tokenBytes, byteRange) {
        const hex = hexOf(tokenBytes);
        const lt = N + HEAD.length + BR_TEXT_LEN + MID.length;
        const gt = lt + 1 + hex.length;
        const total = gt + 1 + TAIL.length;
        const br = byteRange || [0, lt, gt + 1, total - (gt + 1)];
        const brText = br.map((v) => String(v).padStart(INT_WIDTH, '0')).join(' ');
        const doc = concat([PREFIX,
            te.encode(`${HEAD}${brText}${MID}<${hex}>${TAIL}`)]);
        expect(doc.length).toBe(total);
        return doc;
    }

    /** The bytes the DocTimeStamp's DECLARED `/ByteRange` covers in `doc`. */
    function covered(doc) {
        const [a, b, c, d] = findSignatures(doc)[0].byteRange;
        return concat([doc.subarray(a, a + b), doc.subarray(c, c + d)]);
    }

    /**
     * `docWithToken` stamped with a token whose imprint is the sha256 of
     * the declared coverage — optionally after rewriting the `/ByteRange`
     * to `rangeOf(probe, sig)`. The token's length is fixed for a 32-byte
     * imprint, so a placeholder token lays the file out and the real one
     * is written into the unchanged `/Contents` digits.
     */
    function stampedDoc(rangeOf) {
        const probe = docWithToken(token(new Uint8Array(32)));
        const [sig] = findSignatures(probe);
        const laid = rangeOf
            ? rewriteByteRange(probe, sig, rangeOf(probe, sig))
            : probe;
        const hex = hexOf(token(sha256Of(covered(laid))));
        expect(hex.length).toBe(sig.contents.length);
        const out = laid.slice();
        out.set(te.encode(hex), sig.contents.offset);
        return out;
    }

    /** Build an RFC 3161 token with a caller-chosen imprint. */
    function token(imprint, o) {
        o = o || {};
        const mi = A.encodeSequence([
            A.encodeSequence([A.encodeOid(o.digestOid || OID_SHA256),
                              A.encodeNull()]),
            A.encodeOctetString(imprint)
        ]);
        const tstInfo = A.encodeSequence([
            A.encodeInteger(new Uint8Array([1])),
            A.encodeOid('1.2.3.4'),
            mi,
            A.encodeInteger(new Uint8Array([7])),
            genTime('20240115120000Z')
        ]);
        return A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence([
                A.encodeInteger(new Uint8Array([3])),
                A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256)])]),
                A.encodeSequence([
                    A.encodeOid(OID_TST_INFO),
                    A.encodeExplicit(0, A.encodeOctetString(tstInfo))
                ])
            ]))
        ]);
    }

    test('empty /Contents', () => {
        const doc = docWithToken(new Uint8Array(0));
        const r = verifyAllSignatures(doc, FB);
        expect(r.signatures).toEqual([]);
        expect(r.timestamps.length).toBe(1);
        expect(r.timestamps[0].verified).toBe(false);
        expect(r.timestamps[0].errors[0].code).toBe('pdf/ts/empty-contents');
        expect(r.timestamps[0].objNum).toBe(1);
    });

    test('unparseable TimeStampToken', () => {
        const r = verifyAllSignatures(
            docWithToken(new Uint8Array([0x30, 0x7F, 0x00])), FB);
        expect(r.timestamps[0].errors[0].code).toBe('pdf/ts/parse-failed');
        expect(r.timestamps[0].errors[0].cause).toBeInstanceOf(ParseError);
    });

    test('reports each TSTInfo navigation failure distinctly', () => {
        const okEncap = (tstFields) => A.encodeSequence([
            A.encodeOid(OID_TST_INFO),
            A.encodeExplicit(0, A.encodeOctetString(
                A.encodeSequence(tstFields)))
        ]);
        const wrap = (sdKids) => A.encodeSequence([
            A.encodeOid(OID_SIGNED_DATA),
            A.encodeExplicit(0, A.encodeSequence(sdKids))
        ]);
        const three = [A.encodeInteger(new Uint8Array([3])), A.encodeSet([])];
        const cases = [
            // ContentInfo with a single child.
            [A.encodeSequence([A.encodeOid(OID_SIGNED_DATA)]),
             'ContentInfo too short'],
            // [0] whose inner TLV is truncated.
            [A.encodeSequence([A.encodeOid(OID_SIGNED_DATA),
                tlv(0xA0, new Uint8Array([0x30, 0x7F]))]),
             'SignedData node missing'],
            // SignedData whose children do not parse.
            [A.encodeSequence([A.encodeOid(OID_SIGNED_DATA),
                tlv(0xA0, tlv(0x30, new Uint8Array([0x30, 0x7F])))]),
             'SignedData parse failed'],
            // No encapContentInfo at all.
            [wrap(three), 'encapContentInfo missing'],
            // eContent [0] holding a truncated TLV.
            [wrap(three.concat([A.encodeSequence([A.encodeOid(OID_TST_INFO),
                tlv(0xA0, new Uint8Array([0x04, 0x7F]))])])),
             'eContent OCTET STRING missing'],
            // OCTET STRING whose payload is not a parseable TSTInfo.
            [wrap(three.concat([A.encodeSequence([A.encodeOid(OID_TST_INFO),
                A.encodeExplicit(0, A.encodeOctetString(
                    new Uint8Array([0x30, 0x7F])))])])),
             'TSTInfo SEQUENCE missing'],
            // TSTInfo with fewer than 4 fields.
            [wrap(three.concat([okEncap([
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4')])])),
             'TSTInfo too short'],
            // messageImprint with a single child.
            [wrap(three.concat([okEncap([
                A.encodeInteger(new Uint8Array([1])),
                A.encodeOid('1.2.3.4'),
                A.encodeSequence([A.encodeOid(OID_SHA256)]),
                A.encodeInteger(new Uint8Array([7]))])])),
             'messageImprint malformed']
        ];
        for (const [blob, fragment] of cases) {
            const t = verifyAllSignatures(docWithToken(blob), FB).timestamps[0];
            expect(t.verified).toBe(false);
            expect(t.errors[0].code).toBe('pdf/ts/parse-failed');
            expect(t.errors[0].message).toContain(fragment);
        }
    });

    test('unsupported messageImprint hash algorithm', () => {
        const r = verifyAllSignatures(
            docWithToken(token(new Uint8Array(20), { digestOid: OID_SHA1 })),
            FB);
        const t = r.timestamps[0];
        expect(t.hashAlg).toBe('sha1');
        expect(t.errors[0].code).toBe('pdf/ts/unknown-hash');
        expect(t.imprintVerified).toBe(false);
    });

    test('inconsistent ByteRange', () => {
        const doc = docWithToken(token(sha256Of(PREFIX)), [0, N, 2, N]);
        const t = verifyAllSignatures(doc, FB).timestamps[0];
        expect(t.errors[0].code).toBe('pdf/ts/byterange-failed');
    });

    test('messageImprint length mismatch', () => {
        const t = verifyAllSignatures(
            docWithToken(token(new Uint8Array(4))), FB).timestamps[0];
        expect(t.errors[0].code).toBe('pdf/ts/imprint-length-mismatch');
        expect(t.errors[0].context.actualLen).toBe(32);
    });

    test('messageImprint mismatch', () => {
        const wrong = new Uint8Array(sha256Of(
            covered(docWithToken(token(new Uint8Array(32))))));
        wrong[0] ^= 0xFF;
        const t = verifyAllSignatures(docWithToken(token(wrong)), FB)
            .timestamps[0];
        expect(t.errors[0].code).toBe('pdf/ts/imprint-mismatch');
        expect(t.imprintVerified).toBe(false);
    });

    test('matching imprint verifies the timestamp (TSA signature informational)',
        () => {
            const t = verifyAllSignatures(stampedDoc(), FB).timestamps[0];
            expect(t.imprintVerified).toBe(true);
            expect(t.verified).toBe(true);
            expect(t.valid).toBe(true);
            expect(t.hashAlg).toBe('sha256');
            expect(t.kind).toBe('DocTimeStamp');
            expect(t.subFilter).toBe('ETSI.RFC3161');
            // The token carries no signerInfos → the TSA leg stays
            // unverified and its error is reported as informational
            // without demoting the imprint verdict.
            expect(t.tsaVerified).toBe(false);
            expect(t.errors.map((e) => e.code))
                .toContain('pdf/ts/unknown-digest');
        });

    // ── BL-1627 — the exact /ByteRange gap rule on the DocTimeStamp path ──
    // The gap must be exactly the `<…>` token (form b, gapForm 'token') or
    // exactly the hex digits (form a, gapForm 'digits'), as on the /Sig
    // path (BL-1605). Before BL-1627 the DocTimeStamp path hashed the
    // declared ranges with no gap check and reported no `gapForm`.
    const GAP_START = 'pdf/sig/byterange/gap-start-mismatch';
    const GAP_END = 'pdf/sig/byterange/gap-end-mismatch';
    const gapCodes = (t) => t.errors.map((e) => e.code)
        .filter((c) => c === GAP_START || c === GAP_END);

    test('form (b): the default fixture gap is the token — gapForm "token", verified', () => {
        const doc = stampedDoc();
        expect(gapFormOracle(doc, findSignatures(doc)[0].byteRange)).toBe('token');
        const t = verifyAllSignatures(doc, FB).timestamps[0];
        expect(t.gapForm).toBe('token');
        expect(gapCodes(t)).toEqual([]);
        expect(t.imprintVerified).toBe(true);
        expect(t.verified).toBe(true);
        expect(t.valid).toBe(true);
    });

    test('form (a): a gap of exactly the hex digits — gapForm "digits", verified', () => {
        const doc = stampedDoc((probe, sig) => formRanges(probe, sig).digits);
        expect(gapFormOracle(doc, findSignatures(doc)[0].byteRange)).toBe('digits');
        const t = verifyAllSignatures(doc, FB).timestamps[0];
        expect(t.gapForm).toBe('digits');
        expect(gapCodes(t)).toEqual([]);
        expect(t.imprintVerified).toBe(true);
        expect(t.verified).toBe(true);
        expect(t.valid).toBe(true);
    });

    // Off-by-one gaps that leave every hex digit out of the digest: the
    // imprint is re-computed over the DECLARED ranges, so it matches —
    // only the gap is wrong.
    const offByOne = [
        ['"<" + digits (token end one byte short)', (o) => o - 1, (o, n) => o + n, [GAP_END]],
        ['digits + ">" (token start one byte late)', (o) => o, (o, n) => o + n + 1, [GAP_START]],
        ['token start one byte early', (o) => o - 2, (o, n) => o + n + 1, [GAP_START]],
        ['token end one byte long', (o) => o - 1, (o, n) => o + n + 2, [GAP_END]]
    ];
    for (const [name, gs, ge, expected] of offByOne) {
        test(`refused although the imprint matches: ${name}`, () => {
            const doc = stampedDoc((probe, sig) => {
                const { offset: o, length: n } = sig.contents;
                return rangeWithGap(probe.length, gs(o, n), ge(o, n));
            });
            expect(gapFormOracle(doc, findSignatures(doc)[0].byteRange)).toBe('other');
            const t = verifyAllSignatures(doc, FB).timestamps[0];
            expect(t.imprintVerified).toBe(true);
            expect(t.verified).toBe(false);
            expect(t.valid).toBe(false);
            expect(gapCodes(t)).toEqual(expected);
            expect(t.gapForm).toBe(null);
        });
    }

    test('gapForm is present on every failure path; the first error code is unchanged', () => {
        const wrong = new Uint8Array(sha256Of(
            covered(docWithToken(token(new Uint8Array(32))))));
        wrong[0] ^= 0xFF;
        const cases = [
            [docWithToken(new Uint8Array(0)), 'pdf/ts/empty-contents', 'token'],
            [docWithToken(new Uint8Array([0x30, 0x7F, 0x00])), 'pdf/ts/parse-failed', 'token'],
            [docWithToken(token(new Uint8Array(20), { digestOid: OID_SHA1 })),
                'pdf/ts/unknown-hash', 'token'],
            [docWithToken(token(new Uint8Array(32)), [0, N, 2, N]),
                'pdf/ts/byterange-failed', null],
            [docWithToken(token(new Uint8Array(4))), 'pdf/ts/imprint-length-mismatch', 'token'],
            [docWithToken(token(wrong)), 'pdf/ts/imprint-mismatch', 'token']
        ];
        for (const [doc, code, form] of cases) {
            const t = verifyAllSignatures(doc, FB).timestamps[0];
            expect(t.verified).toBe(false);
            expect(t.errors[0].code).toBe(code);
            expect(Object.prototype.hasOwnProperty.call(t, 'gapForm')).toBe(true);
            expect(t.gapForm).toBe(form);
        }
    });

    test('skips objects with no /ByteRange or no /Contents', () => {
        const doc = new TextEncoder().encode(
            '1 0 obj << /Type /Sig /Contents <00> >> endobj\n'
            + '2 0 obj << /Type /Sig /ByteRange [0 1 2 3] >> endobj\n');
        const r = verifyAllSignatures(doc, FB);
        expect(r.signatures).toEqual([]);
        expect(r.timestamps).toEqual([]);
    });
});

describe('verifyPk — unavailable primitives and argument contract', () => {
    test('rejects a missing args object', () => {
        expect(verifyPk(null).code).toBe('pdf/sig/verify-pk/bad-args');
        expect(verifyPk('x').code).toBe('pdf/sig/verify-pk/bad-args');
    });

    test('rejects a non-Uint8Array signature', () => {
        expect(verifyPk({ algorithm: 'ed25519', signature: 'nope' }).code)
            .toBe('pdf/sig/verify-pk/bad-sig');
    });

    test('reports unavailable fw modules per algorithm', () => {
        const sig = new Uint8Array(64);
        expect(verifyPk({ algorithm: 'rsa-pss', signature: sig }).code)
            .toBe('pdf/sig/verify-pk/no-rsa');
        expect(verifyPk({ algorithm: 'ecdsa', signature: sig }).code)
            .toBe('pdf/sig/verify-pk/no-ecc');
        expect(verifyPk({ algorithm: 'ed25519', signature: sig }).code)
            .toBe('pdf/sig/verify-pk/no-ed25519');
    });

    test('RSA PKCS#1 v1.5 is refused before any module lookup', () => {
        const r = verifyPk({ algorithm: 'rsa-v15', signature: new Uint8Array(8) });
        expect(r.verified).toBe(false);
        expect(r.code).toBe('pdf/sig/rsa-pkcs1v15-deprecated');
    });

    test('surfaces a throwing primitive as verify-pk/throw', () => {
        const thrower = pdfSignature.factory(_errors, _parser, _oids, A,
            null, null, { verify() { throw new Error('kaboom'); } },
            _sha256m, _sha384m, _sha512m, _ba);
        const r = thrower.verifyPk({
            algorithm: 'ed25519', pubKey: new Uint8Array(32),
            message: new Uint8Array(4), signature: new Uint8Array(64)
        });
        expect(r.code).toBe('pdf/sig/verify-pk/throw');
        expect(r.error).toContain('kaboom');
    });

    test('validates the Ed25519 key and message shapes', () => {
        const stub = pdfSignature.factory(_errors, _parser, _oids, A,
            null, null, { verify() { return true; } },
            _sha256m, _sha384m, _sha512m, _ba);
        expect(stub.verifyPk({ algorithm: 'ed25519',
            pubKey: new Uint8Array(31), signature: new Uint8Array(64) }).code)
            .toBe('pdf/sig/verify-pk/bad-ed25519-key');
        expect(stub.verifyPk({ algorithm: 'ed25519',
            pubKey: new Uint8Array(32), signature: new Uint8Array(64) }).code)
            .toBe('pdf/sig/verify-pk/no-message');
        expect(stub.verifyPk({ algorithm: 'ed25519',
            pubKey: new Uint8Array(32), message: new Uint8Array(2),
            signature: new Uint8Array(64) }).verified).toBe(true);
    });

    test('validates the RSA-PSS key, message and hash arguments', () => {
        const stub = pdfSignature.factory(_errors, _parser, _oids, A,
            { pssVerify() { return true; } }, null, null,
            _sha256m, _sha384m, _sha512m, _ba);
        const sig = new Uint8Array(8);
        expect(stub.verifyPk({ algorithm: 'rsa-pss', signature: sig }).code)
            .toBe('pdf/sig/verify-pk/bad-rsa-key');
        const key = { n: new Uint8Array(4), e: new Uint8Array([1, 0, 1]) };
        expect(stub.verifyPk({ algorithm: 'rsa-pss', pubKey: key,
            signature: sig }).code).toBe('pdf/sig/verify-pk/no-message');
        expect(stub.verifyPk({ algorithm: 'rsa-pss', pubKey: key,
            message: new Uint8Array(2), signature: sig }).code)
            .toBe('pdf/sig/verify-pk/no-hash');
        expect(stub.verifyPk({ algorithm: 'rsa-pss', pubKey: key,
            message: new Uint8Array(2), hashMod: _sha256m, signature: sig })
            .verified).toBe(true);
    });

    test('validates the ECDSA key shape and curve name', () => {
        const stub = pdfSignature.factory(_errors, _parser, _oids, A,
            null, { ecdsa: {}, curves: { c256: {} } }, null,
            _sha256m, _sha384m, _sha512m, _ba);
        const sig = new Uint8Array(64);
        expect(stub.verifyPk({ algorithm: 'ecdsa', signature: sig }).code)
            .toBe('pdf/sig/verify-pk/bad-ecc-key');
        expect(stub.verifyPk({ algorithm: 'ecdsa', signature: sig,
            pubKey: { curve: 'c999', point: new Uint8Array(64) } }).code)
            .toBe('pdf/sig/verify-pk/unknown-curve');
        expect(stub.verifyPk({ algorithm: 'ecdsa', signature: sig,
            pubKey: { curve: 'c256', point: new Uint8Array(64) } }).code)
            .toBe('pdf/sig/verify-pk/bad-ecc-point');
    });

    test('ECDSA without digest or (message, hashMod)', () => {
        const stub = pdfSignature.factory(_errors, _parser, _oids, A,
            null, { ecdsa: { publicKey: function () {} },
                    curves: { c256: { fromBits: (b) => b } } }, null,
            _sha256m, _sha384m, _sha512m, _ba);
        expect(stub.verifyPk({ algorithm: 'ecc', signature: new Uint8Array(64),
            pubKey: { curve: 'c256', point: new Uint8Array(64) } }).code)
            .toBe('pdf/sig/verify-pk/no-digest');
    });

    test('ECDSA hashes the message itself when no digest is supplied', () => {
        let seenHash = null;
        const stub = pdfSignature.factory(_errors, _parser, _oids, A,
            null, {
                ecdsa: { publicKey: function () {
                    this.verify = (h) => { seenHash = h; return true; };
                } },
                curves: { c256: { fromBits: (b) => b } }
            }, null, _sha256m, _sha384m, _sha512m, _ba);
        const r = stub.verifyPk({
            algorithm: 'ecdsa', signature: new Uint8Array(64),
            pubKey: { curve: 'c256', point: new Uint8Array(64) },
            message: new TextEncoder().encode('to be hashed'),
            hashMod: _sha256m
        });
        expect(r.verified).toBe(true);
        expect(seenHash).not.toBe(null);
    });

    test('rejects an unknown algorithm', () => {
        expect(verifyPk({ algorithm: 'dsa', signature: new Uint8Array(4) }).code)
            .toBe('pdf/sig/verify-pk/unknown-alg');
    });
});
