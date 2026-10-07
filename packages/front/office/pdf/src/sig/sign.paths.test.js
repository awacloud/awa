// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSign` — emit-side failure surface and the LT/LTA
 * Catalog fallbacks.
 *
 * `sign.test.js` owns the level-B/T/LT/LTA happy roundtrips. This file
 * owns what happens when an input is wrong: unusable cert/key DER, a
 * missing optional dependency, a TSA callback that misbehaves, a
 * placeholder too small for the produced PKCS#7 — plus the LT/LTA
 * Catalog update (resolved through `pdfDocument`, BL-1566) and the
 * signature section appended through `pdfIncrementalWriter` (BL-1565).
 *
 * Signed output is asserted by re-reading it (write-then-read-back):
 * the LT documents produced here are fed back through the package's own
 * parser-independent scanners to prove the appended objects are real.
 * No cryptographic constant is invented — signatures are produced by
 * the real fw primitives from pinned seeds, or by explicit stubs whose
 * failure mode is the thing under test.
 *
 * @module pdf/sig/sign.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfSign } from './sign.js';
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { pdfByteRange } from './byteRange.js';
import { pdfDssBuilder } from './dss.js';
import { pdfSha1 } from './sha1.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfIncrementalWriter } from '../document/incrementalWriter.js';
import { pdfDocument } from '../document/document.js';
import { pdfCatalog } from '../document/catalog.js';
import { pdfPage } from '../document/page.js';
import { pdfPages } from '../document/pages.js';
import { pdfShared } from '../_shared/index.js';
import { pdfSecurity } from '../crypto/security.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';
import { aes as _fwAes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc as _fwCbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
import { asn1 as _fwAsn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { ed25519 as _fwEd } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { sha256 as _fwSha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha512 as _fwSha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { sha384 as _fwSha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 as _fwUtf8 } from '@awacloud/fw/io/codec/utf8.js';
import { b64 as _fwB64 } from '@awacloud/fw/io/codec/b64.js';
import { pem as _fwPem } from '@awacloud/fw/crypto/utils/pem.js';

const A = _fwAsn1.factory();
const _ba = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _b64m = _fwB64.factory();
const _pemMod = _fwPem.factory(_b64m);
const _sha256m = _fwSha256.factory(_ba, _utf8m);
const _sha512m = _fwSha512.factory(_ba, _utf8m);
const _sha384m = _fwSha384.factory(_sha512m);
const _sha1m = pdfSha1.factory(_ba, _utf8m);
const _edm = _fwEd.factory(_sha512m, _ba);

const _errors = pdfErrors.factory();
const { ContractError, EncryptionError } = _errors;
const _oids = pdfSigOids.factory(asn1Oid.factory());
const _br = pdfByteRange.factory(_errors);
const _dssB = pdfDssBuilder.factory(_errors, _sha1m, _ba);
const _tok = pdfTokenizer.factory(_errors, pdfShared.factory());
const _pObj = pdfParserObj.factory();
const _parser = pdfParser.factory(_errors, _pObj, _tok);
const _ser = pdfSerializer.factory(_errors);
const _xref = pdfXref.factory(_errors, _tok, _parser);
const _trailer = pdfTrailer.factory(_errors, _pObj);
const _iw = pdfIncrementalWriter.factory(_errors, _ser, _tok, _parser,
    _xref, _trailer);
/** Classical-base reader (no xref-stream wiring needed by these bases). */
const _doc = pdfDocument.factory(_errors, _tok, _parser, _xref, _trailer,
    pdfCatalog.factory(_errors, _pObj), pdfPage.factory(_errors, _pObj),
    pdfPages.factory(_errors, _pObj));

// Standard security handlers (read only for an encrypted base).
const _aesm = _fwAes.factory();
const _cbcm = _fwCbc.factory(_ba);
const _sec = pdfSecurity.factory(_errors);
const _v4 = pdfStandardV4.factory(_errors, _aesm, _cbcm, _ba);
const _v5 = pdfStandardV5.factory(_errors, _aesm, _cbcm, _sha256m, _ba, null);
const _v6 = pdfStandardV6.factory(_errors, _aesm, _cbcm, _sha256m, _sha384m,
    _sha512m, _ba, null);

/** Full wiring — the reference instance. */
function makeSign(o) {
    o = o || {};
    return pdfSign.factory(
        _errors, _oids, _br,
        'dss' in o ? o.dss : _dssB,
        'iw' in o ? o.iw : _iw,
        'parser' in o ? o.parser : _parser,
        A,
        'rsa' in o ? o.rsa : null,
        'ecc' in o ? o.ecc : null,
        'ed' in o ? o.ed : _edm,
        _sha256m, _sha384m, _sha512m, _ba,
        // 15th positional dep (office/BATCH_42/02, BL-1566).
        'doc' in o ? o.doc : _doc,
        // 16th-19th: the standard security handler (encrypted bases).
        'sec' in o ? o.sec : _sec,
        'v4' in o ? o.v4 : _v4,
        'v5' in o ? o.v5 : _v5,
        'v6' in o ? o.v6 : _v6);
}
const _sign = makeSign();

const OID_ED25519 = '1.3.101.112';
const OID_RSA = '1.2.840.113549.1.1.1';

function printable(s) {
    const v = new TextEncoder().encode(s);
    const out = new Uint8Array(2 + v.length);
    out[0] = 0x13; out[1] = v.length;
    out.set(v, 2);
    return out;
}
function utcTime(s) {
    const v = new TextEncoder().encode(s);
    const out = new Uint8Array(2 + v.length);
    out[0] = 0x17; out[1] = v.length;
    out.set(v, 2);
    return out;
}
function nameDer(cn) {
    return A.encodeSequence([A.encodeSet([A.encodeSequence(
        [A.encodeOid('2.5.4.3'), printable(cn)])])]);
}

/** Minimal structurally-valid certificate with an Ed25519 SPKI. */
function buildCert(o) {
    o = o || {};
    const pub = o.pub || new Uint8Array(32);
    const tbs = A.encodeSequence([
        A.encodeInteger(new Uint8Array([o.serial === undefined ? 1 : o.serial])),
        A.encodeSequence([A.encodeOid(OID_ED25519)]),
        nameDer(o.issuerCn || 'CA'),
        A.encodeSequence([utcTime('200101000000Z'), utcTime('300101000000Z')]),
        nameDer(o.cn || 'Leaf'),
        A.encodeSequence([A.encodeSequence([A.encodeOid(OID_ED25519)]),
                          A.encodeBitString(pub, 0)])
    ]);
    return A.encodeSequence([
        tbs, A.encodeSequence([A.encodeOid(OID_ED25519)]),
        A.encodeBitString(new Uint8Array(4), 0)
    ]);
}

/** Deterministic Ed25519 key pair from a pinned seed. */
function keyPair(salt) {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = (i * 13 + salt) & 0xff;
    return _edm.keyPair(seed);
}

/** An RFC 3161-shaped token stub (structure only — never verified here). */
function fakeTst(digest, padTo) {
    const body = A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.9.16.1.4'),
        A.encodeOctetString(digest)
    ]);
    if (!padTo || body.length >= padTo) return body;
    const out = new Uint8Array(padTo);
    out.set(body, 0);
    return out;
}

const te = new TextEncoder();
function bytesOf(parts) {
    let n = 0;
    for (const p of parts) n += p instanceof Uint8Array ? p.length : te.encode(p).length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
        const b = p instanceof Uint8Array ? p : te.encode(p);
        out.set(b, o); o += b.length;
    }
    return out;
}
function xrefEntry(off, gen, free) {
    return String(off).padStart(10, '0') + ' '
        + String(gen).padStart(5, '0') + (free ? ' f \n' : ' n \n');
}

/**
 * Hand-assembled PDF with byte-exact xref offsets — lets each test pick
 * the Catalog body (and even omit object 1 entirely).
 */
function miniPdf(o) {
    o = o || {};
    const catalogNum = o.catalogNum === undefined ? 1 : o.catalogNum;
    const parts = ['%PDF-2.0\n', new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])];
    const offsets = {};
    function at() { return bytesOf(parts).length; }
    offsets[catalogNum] = at();
    parts.push(`${catalogNum} 0 obj\n<< ${o.catalogBody
        || '/Type /Catalog /Pages 2 0 R'} >>\nendobj\n`);
    offsets[2] = at();
    parts.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offsets[3] = at();
    parts.push('3 0 obj\n<< /Type /Page /Parent 2 0 R '
        + '/MediaBox [0 0 10 10] >>\nendobj\n');
    const size = Math.max(catalogNum, 3) + 1;
    const xrefOff = at();
    let xref = `xref\n0 ${size}\n` + xrefEntry(0, 65535, true);
    for (let i = 1; i < size; i++) {
        xref += xrefEntry(offsets[i] === undefined ? 0 : offsets[i], 0, false);
    }
    parts.push(xref);
    parts.push(`trailer\n<< /Size ${size} /Root ${catalogNum} 0 R >>\n`);
    parts.push(`startxref\n${xrefOff}\n%%EOF\n`);
    return bytesOf(parts);
}

const BASE = miniPdf();
const latin1 = new TextDecoder('latin1');

describe('_toDer', () => {
    test('passes a Uint8Array through untouched', () => {
        const der = buildCert({});
        expect(_sign._toDer(der)).toBe(der);
    });

    test('strips PEM armor and decodes the payload', () => {
        const der = buildCert({ cn: 'Pem' });
        const armored = _pemMod.encode(der, 'CERTIFICATE');
        expect(Array.from(_sign._toDer(armored))).toEqual(Array.from(der));
    });

    test('rejects anything that is neither DER nor a PEM string', () => {
        let caught = null;
        try { _sign._toDer(42); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/bad-input');
        expect(() => _sign._toDer(null)).toThrow(ContractError);
    });
});

describe('_extractIssuerSerial', () => {
    test('returns the issuer + serial TLVs of a well-formed cert', () => {
        const { issuerDer, serialDer } = _sign._extractIssuerSerial(
            buildCert({ issuerCn: 'Issuer CN', serial: 42 }));
        expect(serialDer[0]).toBe(0x02);
        expect(Array.from(serialDer.subarray(2))).toEqual([42]);
        expect(issuerDer[0]).toBe(0x30);
        expect(latin1.decode(issuerDer)).toContain('Issuer CN');
    });

    test('rejects a certificate that does not parse', () => {
        let caught = null;
        try { _sign._extractIssuerSerial(new Uint8Array([0x30, 0x7F, 0x00])); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/cert-parse');
    });

    test('rejects a certificate with no tbsCertificate', () => {
        let caught = null;
        try { _sign._extractIssuerSerial(A.encodeSequence([])); }
        catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/cert-parse');
        expect(caught.message).toContain('tbsCertificate');
    });

    test('rejects a certificate whose TBSCertificate does not parse', () => {
        const bad = new Uint8Array([0x30, 0x04, 0x30, 0x02, 0x30, 0x7F]);
        let caught = null;
        try { _sign._extractIssuerSerial(bad); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/cert-parse');
        expect(caught.message).toContain('TBSCertificate fields');
    });

    test('rejects a TBSCertificate without serialNumber + issuer', () => {
        const stunted = A.encodeSequence([
            A.encodeSequence([A.encodeInteger(new Uint8Array([1]))]),
            A.encodeNull(), A.encodeNull()
        ]);
        let caught = null;
        try { _sign._extractIssuerSerial(stunted); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/cert-parse');
        expect(caught.message).toContain('serialNumber/issuer');
    });

    test('skips the [0] EXPLICIT version of a v3 certificate', () => {
        const tbs = A.encodeSequence([
            A.encodeExplicit(0, A.encodeInteger(new Uint8Array([2]))),
            A.encodeInteger(new Uint8Array([7])),
            A.encodeSequence([A.encodeOid(OID_RSA)]),
            nameDer('V3 Issuer'),
            A.encodeSequence([utcTime('200101000000Z'),
                              utcTime('300101000000Z')]),
            nameDer('V3 Subject'),
            A.encodeSequence([A.encodeSequence([A.encodeOid(OID_RSA)]),
                              A.encodeBitString(new Uint8Array(4), 0)])
        ]);
        const cert = A.encodeSequence([tbs,
            A.encodeSequence([A.encodeOid(OID_RSA)]),
            A.encodeBitString(new Uint8Array(2), 0)]);
        const { serialDer, issuerDer } = _sign._extractIssuerSerial(cert);
        expect(Array.from(serialDer.subarray(2))).toEqual([7]);
        expect(latin1.decode(issuerDer)).toContain('V3 Issuer');
    });

    test('re-encodes a long issuer with a 3-byte DER length', () => {
        const huge = nameDer('X'.repeat(70000));
        const tbs = A.encodeSequence([
            A.encodeInteger(new Uint8Array([3])),
            A.encodeSequence([A.encodeOid(OID_RSA)]),
            huge,
            A.encodeSequence([utcTime('200101000000Z'),
                              utcTime('300101000000Z')]),
            nameDer('S'),
            A.encodeSequence([A.encodeSequence([A.encodeOid(OID_RSA)]),
                              A.encodeBitString(new Uint8Array(4), 0)])
        ]);
        const cert = A.encodeSequence([tbs,
            A.encodeSequence([A.encodeOid(OID_RSA)]),
            A.encodeBitString(new Uint8Array(2), 0)]);
        const { issuerDer } = _sign._extractIssuerSerial(cert);
        expect(issuerDer[0]).toBe(0x30);
        expect(issuerDer[1]).toBe(0x83);            // 3-byte length form
        expect(issuerDer.length).toBe(huge.length);
    });
});

describe('_buildPkcs7 — algorithm dispatch errors', () => {
    test('rejects an unknown hashAlg', () => {
        let caught = null;
        try {
            _sign._buildPkcs7({ certDer: buildCert({}),
                sigBytes: new Uint8Array(8), hashAlg: 'md5',
                signatureAlg: 'ed25519' });
        } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/unknown-hash');
    });

    test('rejects an unknown signatureAlg', () => {
        let caught = null;
        try {
            _sign._buildPkcs7({ certDer: buildCert({}),
                sigBytes: new Uint8Array(8), hashAlg: 'sha256',
                signatureAlg: 'dsa' });
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/unknown-sigalg');
    });

    test('emits the ECDSA algorithm OID matching the hash', () => {
        for (const [hashAlg, oidTail] of [['sha256', '\x04\x03\x02'],
                                          ['sha384', '\x04\x03\x03'],
                                          ['sha512', '\x04\x03\x04']]) {
            const p7 = _sign._buildPkcs7({ certDer: buildCert({}),
                sigBytes: new Uint8Array(8), hashAlg,
                signatureAlg: 'ecdsa' });
            expect(latin1.decode(p7)).toContain(oidTail);
        }
    });
});

describe('_emitWithPlaceholder — malformed base documents', () => {
    test('rejects a base PDF with no startxref', () => {
        let caught = null;
        try { _sign._emitWithPlaceholder(te.encode('%PDF-2.0\n%%EOF\n'), 16); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/no-startxref');
    });

    test('rejects a startxref with no offset', () => {
        let caught = null;
        try {
            _sign._emitWithPlaceholder(te.encode('%PDF-2.0\nstartxref'), 16);
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/bad-startxref');
    });

    test('emits a DocTimeStamp dictionary when asked', () => {
        const r = _sign._emitWithPlaceholder(BASE, 32, 'ETSI.RFC3161', true);
        const s = latin1.decode(r.bytes);
        expect(s).toContain('/Type /DocTimeStamp');
        expect(s).toContain('/SubFilter /ETSI.RFC3161');
        expect(r.contentsLength).toBe(64);
        // The ByteRange must exclude exactly the whole `<…>` token
        // (BL-1605 form b): `contentsOffset` is the first hex digit.
        expect(r.byteRange[0] + r.byteRange[1]).toBe(r.contentsOffset - 1);
        expect(r.byteRange[2]).toBe(r.contentsOffset + r.contentsLength + 1);
    });
});

describe('sign — argument and dependency contract', () => {
    const cert = buildCert({});

    test('rejects non-Uint8Array pdfBytes and a missing opts object', () => {
        expect(() => _sign.sign('nope', {})).toThrow(ContractError);
        let caught = null;
        try { _sign.sign(BASE); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/bad-opts');
        expect(() => _sign.sign(BASE, 'x')).toThrow(ContractError);
    });

    test('rejects an unknown PAdES level', () => {
        let caught = null;
        try { _sign.sign(BASE, { level: 'Z' }); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/level-not-implemented');
        expect(caught.context.level).toBe('Z');
    });

    test('requires the DSS builder dependency for LT/LTA', () => {
        const noDss = makeSign({ dss: null });
        let caught = null;
        try { noDss.sign(BASE, { level: 'LT' }); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/no-dss-builder');
        expect(caught.context.level).toBe('LT');
    });

    test('requires the incremental writer dependency for LT/LTA', () => {
        const noIw = makeSign({ iw: null });
        let caught = null;
        try { noIw.sign(BASE, { level: 'LTA' }); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/no-incremental-writer');
    });

    test('requires an algorithm and a known hashAlg', () => {
        expect(() => _sign.sign(BASE, {})).toThrow(ContractError);
        let caught = null;
        try { _sign.sign(BASE, { algorithm: 'ed25519', hashAlg: 'md5' }); }
        catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/bad-hash-alg');
    });

    test('requires a tsaSign callback for level T', () => {
        let caught = null;
        try { _sign.sign(BASE, { algorithm: 'ed25519', level: 'T', cert }); }
        catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/tsa-required-for-level-T');
    });

    test('rejects a tsaSign callback that does not return bytes', () => {
        const kp = keyPair(3);
        let caught = null;
        try {
            _sign.sign(BASE, {
                algorithm: 'ed25519', cert: buildCert({ pub: kp.publicKey }),
                privateKey: kp.privateKey, level: 'T',
                tsaSign: () => 'not-bytes'
            });
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/tsa-bad-result');
    });

    test('rejects a PKCS#7 blob larger than the placeholder', () => {
        const kp = keyPair(5);
        let caught = null;
        try {
            _sign.sign(BASE, {
                algorithm: 'ed25519', cert: buildCert({ pub: kp.publicKey }),
                privateKey: kp.privateKey, placeholderBytes: 16
            });
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/pkcs7-too-large');
        expect(caught.context.placeholder).toBe(16);
        expect(caught.context.pkcs7Length).toBeGreaterThan(16);
    });
});

describe('sign — private-key dispatch errors', () => {
    const cert = buildCert({});

    test('reports an unavailable fw primitive per algorithm', () => {
        const bare = makeSign({ rsa: null, ecc: null, ed: null });
        for (const [algorithm, code] of [
            ['rsa-pss', 'pdf/sign/no-rsa'],
            ['ecdsa', 'pdf/sign/no-ecc'],
            ['ed25519', 'pdf/sign/no-ed25519']
        ]) {
            let caught = null;
            try { bare.sign(BASE, { algorithm, cert, privateKey: {} }); }
            catch (e) { caught = e; }
            expect(caught).toBeInstanceOf(EncryptionError);
            expect(caught.code).toBe(code);
        }
    });

    test('rejects malformed private keys', () => {
        const wired = makeSign({
            rsa: { pssSign() { return new Uint8Array(8); } },
            ecc: { ecdsa: {} }
        });
        for (const [opts, code] of [
            [{ algorithm: 'rsa-pss', privateKey: { n: new Uint8Array(1) } },
             'pdf/sign/bad-rsa-key'],
            [{ algorithm: 'ecdsa', privateKey: {} }, 'pdf/sign/bad-ecdsa-key'],
            [{ algorithm: 'ed25519', privateKey: new Uint8Array(32) },
             'pdf/sign/bad-ed25519-key']
        ]) {
            let caught = null;
            try { wired.sign(BASE, Object.assign({ cert }, opts)); }
            catch (e) { caught = e; }
            expect(caught).toBeInstanceOf(ContractError);
            expect(caught.code).toBe(code);
        }
    });

    test('rejects an unknown algorithm at the dispatch point', () => {
        let caught = null;
        try {
            _sign.sign(BASE, { algorithm: 'dsa', cert, privateKey: {} });
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/unknown-algorithm');
    });

    test('surfaces a primitive that returns false', () => {
        const rsaFails = makeSign({ rsa: { pssSign() { return false; } } });
        let caught = null;
        try {
            rsaFails.sign(BASE, { algorithm: 'rsa-pss', cert,
                privateKey: { n: new Uint8Array(4), e: new Uint8Array(3),
                              d: new Uint8Array(4) } });
        } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(EncryptionError);
        expect(caught.code).toBe('pdf/sign/rsa-failed');

        const edFails = makeSign({ ed: { sign() { return false; } } });
        let caught2 = null;
        try {
            edFails.sign(BASE, { algorithm: 'ed25519', cert,
                privateKey: new Uint8Array(64) });
        } catch (e) { caught2 = e; }
        expect(caught2.code).toBe('pdf/sign/ed25519-failed');
    });
});

describe('sign — level LTA DocTimeStamp errors', () => {
    function ltaOpts(extra) {
        const kp = keyPair(9);
        return Object.assign({
            algorithm: 'ed25519',
            cert: buildCert({ pub: kp.publicKey }),
            privateKey: kp.privateKey,
            level: 'LTA'
        }, extra || {});
    }

    test('rejects a DocTimeStamp token that is not bytes', () => {
        let calls = 0;
        let caught = null;
        try {
            _sign.sign(BASE, ltaOpts({
                tsaSign: ({ digest }) => (++calls === 1
                    ? fakeTst(digest) : 'not-bytes')
            }));
        } catch (e) { caught = e; }
        expect(calls).toBe(2);
        expect(caught.code).toBe('pdf/sign/tsa-bad-result-lta');
    });

    test('rejects a DocTimeStamp token larger than its placeholder', () => {
        let calls = 0;
        let caught = null;
        try {
            _sign.sign(BASE, ltaOpts({
                docTimeStampPlaceholder: 8,
                tsaSign: ({ digest }) => (++calls === 1
                    ? fakeTst(digest) : fakeTst(digest, 64))
            }));
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/tst-too-large');
        expect(caught.context.placeholder).toBe(8);
    });
});

// office/BATCH_42/02 (BL-1566): the Catalog is resolved through
// `pdfDocument.readDocument` from the trailer /Root — the regex lexer
// ("path B") and its `1 0 obj` byte scan are gone. Each test below kept
// its base document; the assertions that pinned the lexer's losses (a
// dropped nested dict, a refused non-1 Catalog) now pin the fix.
describe('_buildUpdatedCatalog — Catalog resolved through the document reader', () => {
    /** Sign at level LT with the given sign instance + base document. */
    function signLt(instance, base, catalogCerts) {
        const kp = keyPair(11);
        return instance.sign(base, {
            algorithm: 'ed25519',
            cert: buildCert({ pub: kp.publicKey }),
            privateKey: kp.privateKey,
            level: 'LT',
            tsaSign: ({ digest }) => fakeTst(digest),
            dss: { certs: catalogCerts || [] }
        });
    }

    test('keeps names, refs, ints and arrays when pdfParser is absent', () => {
        const noParser = makeSign({ parser: null });
        const base = miniPdf({
            catalogBody: '/Type /Catalog /Pages 2 0 R /Version 7 '
                + '/OpenAction [3 0 R /Fit 12] /Empty []'
        });
        const out = latin1.decode(signLt(noParser, base));
        // The updated Catalog is re-serialised from the resolved entries:
        // every token shape must survive the roundtrip.
        const catalog = out.slice(out.lastIndexOf('1 0 obj'));
        expect(catalog).toContain('/Type /Catalog');
        expect(catalog).toContain('/Pages 2 0 R');
        expect(catalog).toContain('/Version 7');
        expect(catalog).toContain('/OpenAction [3 0 R /Fit 12]');
        expect(catalog).toContain('/Empty []');
        expect(catalog).toMatch(/\/DSS \d+ 0 R/);
    });

    test('keeps a nested-dict entry the removed regex lexer dropped', () => {
        const noParser = makeSign({ parser: null });
        const base = miniPdf({
            catalogBody: '/Type /Catalog /Pages 2 0 R /Names << /X 1 >>'
        });
        const out = latin1.decode(signLt(noParser, base));
        const catalog = out.slice(out.lastIndexOf('1 0 obj'));
        expect(catalog).toContain('/Type /Catalog');
        expect(catalog).toContain('/Pages 2 0 R');
        expect(catalog).toMatch(/\/DSS \d+ 0 R/);
        // Was `.not.toContain('/Names')`: the lexer's minimal-Catalog
        // fallback lost it; the reader keeps it.
        expect(catalog).toContain('/Names << /X 1 >>');
    });

    test('never consults pdfParser: a throwing parser changes nothing', () => {
        const throwing = makeSign({
            parser: { parseIndirectFromBytes() { throw new Error('nope'); } }
        });
        const out = latin1.decode(signLt(throwing, miniPdf({
            catalogBody: '/Type /Catalog /Pages 2 0 R /Version 3' })));
        const catalog = out.slice(out.lastIndexOf('1 0 obj'));
        expect(catalog).toContain('/Version 3');
        expect(catalog).toMatch(/\/DSS \d+ 0 R/);
    });

    test('updates the Catalog wherever /Root points (object 4, not 1)', () => {
        // Was `rejects … catalog-not-found`: the lookup keyed on `1 0 obj`.
        const base = miniPdf({ catalogNum: 4 });
        const signed = signLt(_sign, base);
        const doc = _doc.readDocument(signed);
        expect(doc.trailer.root).toEqual({ num: 4, gen: 0 });
        const catalog = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(catalog.entries.Type).toEqual({ type: 'name', value: 'Catalog' });
        expect(catalog.entries.DSS.type).toBe('ref');
        const dss = doc._raw.resolve(catalog.entries.DSS);
        expect(dss.entries.Type).toEqual({ type: 'name', value: 'DSS' });
        expect(doc.pages.length).toBe(1);
        // No update section ever names object 1 as the root.
        expect(latin1.decode(signed.subarray(base.length))).not.toContain('/Root 1 0 R');
    });

    test('requires the document reader dependency for LT/LTA', () => {
        let caught = null;
        try { signLt(makeSign({ doc: null }), BASE); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/no-document-reader');
        expect(caught.context.level).toBe('LT');
    });

    test('the reader path preserves entries a lexer cannot read', () => {
        const base = miniPdf({
            catalogBody: '/Type /Catalog /Pages 2 0 R /Names << /X 1 >>'
        });
        const out = latin1.decode(signLt(_sign, base));
        const catalog = out.slice(out.lastIndexOf('1 0 obj'));
        expect(catalog).toContain('/Names');
        expect(catalog).toMatch(/\/DSS \d+ 0 R/);
    });
});

/**
 * A PDF 1.5 hybrid-reference file (§7.5.8.4) — same shape as the one in
 * `tests/real-shapes.integration.test.js`: a classical table for objects
 * 0-4 whose trailer's /XRefStm points at an uncompressed companion xref
 * stream (object 4) listing object 5.
 */
function hybridBase() {
    let head = '%PDF-1.5\n';
    const off = [];
    const add = (num, body) => { off[num] = head.length; head += `${num} 0 obj\n${body}\nendobj\n`; };
    add(1, '<< /Type /Catalog /Pages 2 0 R >>');
    add(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    add(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>');
    add(5, '<< /Hybrid true >>');
    off[4] = head.length;
    const data = new Uint8Array([1, (off[5] >> 8) & 0xFF, off[5] & 0xFF, 0]);
    const streamHead = te.encode('4 0 obj\n<< /Type /XRef /Size 6 /W [1 2 1] '
        + '/Index [5 1] /Length 4 >>\nstream\n');
    const streamTail = '\nendstream\nendobj\n';
    const xrefAt = off[4] + streamHead.length + data.length + streamTail.length;
    const tail = streamTail
        + 'xref\n0 5\n' + xrefEntry(0, 65535, true)
        + [1, 2, 3, 4].map(n => xrefEntry(off[n], 0, false)).join('')
        + `trailer\n<< /Size 6 /Root 1 0 R /XRefStm ${off[4]} >>\n`
        + `startxref\n${xrefAt}\n%%EOF\n`;
    return bytesOf([head, streamHead, data, tail]);
}

describe('sign — the signature section goes through pdfIncrementalWriter (BL-1565)', () => {
    test('placeholders sit in the signature object at its xref offset; the patched file re-reads', () => {
        const r = _sign._emitWithPlaceholder(BASE, 32);
        // BASE has /Size 4 → the signature takes object 4.
        expect(r.sigObjNum).toBe(4);
        const doc = _doc.readDocument(r.bytes);
        const entry = doc.xref.entries[r.sigObjNum];
        expect(entry.free).toBeFalsy();
        const at = entry.offset;
        expect(latin1.decode(r.bytes.subarray(at, at + 8))).toBe('4 0 obj\n');
        // /Contents lies inside that object, and the ByteRange skips
        // exactly its whole `<…>` token (BL-1605 form b).
        expect(r.contentsOffset).toBeGreaterThan(at);
        expect(latin1.decode(r.bytes.subarray(r.contentsOffset - 11, r.contentsOffset)))
            .toBe('/Contents <');
        expect(r.byteRange[0] + r.byteRange[1]).toBe(r.contentsOffset - 1);
        expect(r.byteRange[2]).toBe(r.contentsOffset + r.contentsLength + 1);
        expect(r.bytes[r.byteRange[2] - 1]).toBe(0x3E);   // '>'
        expect(r.byteRange[2] + r.byteRange[3]).toBe(r.bytes.length);
        // The patched /ByteRange is what a reader sees, at constant width.
        const sig = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(sig.entries.ByteRange.items.map(i => i.value)).toEqual(r.byteRange);
        expect(sig.entries.Contents.value.length).toBe(32);
        expect(doc.pages.length).toBe(1);
    });

    test('classical base → classical update; the patch keeps the placeholder width', () => {
        const r = _sign._emitWithPlaceholder(BASE, 32);
        const tail = latin1.decode(r.bytes.subarray(BASE.length));
        // Free-list head, then (BL-2041) the Catalog (1, /AcroForm) and the
        // run page 1 (3, /Annots) · /Sig (4) · field/widget (5), and a
        // trailer whose /Root is the base's.
        expect(tail).toContain('xref\n0 1\n0000000000 65535 f \n1 1\n');
        expect(tail).toMatch(/\n3 3\n(\d{10} 00000 n \n){3}trailer/);
        expect(r.fieldObjNum).toBe(5);
        expect(r.fieldName).toBe('Signature1');
        expect(tail).toContain('/Root 1 0 R');
        expect(tail).toMatch(/\/ByteRange \[0 \d+ \d+ \d+ *\]/);
        expect(tail.match(/\/ByteRange \[[^\]]*\]/)[0].length)
            .toBe('/ByteRange [2147483647 2147483647 2147483647 2147483647]'.length);
    });

    test('a hybrid-reference base is refused with pdf/incremental/hybrid-base, nothing written', () => {
        const base = hybridBase();
        // The fixture is a classical trailer carrying /XRefStm (the reader
        // accepting this shape is proven in tests/real-shapes).
        expect(latin1.decode(base)).toMatch(/trailer\n<< [^>]*\/XRefStm \d+/);
        const copy = new Uint8Array(base);
        const kp = keyPair(13);
        let out;
        let caught = null;
        try {
            out = _sign.sign(base, {
                algorithm: 'ed25519', cert: buildCert({ pub: kp.publicKey }),
                privateKey: kp.privateKey
            });
        } catch (e) { caught = e; }
        expect(out).toBeUndefined();
        expect(base).toEqual(copy);
        expect(caught.code).toBe('pdf/incremental/hybrid-base');
    });

    test('a base whose chain yields no /Root is refused with pdf/sign/no-trailer', () => {
        // The trailer follows the xref table, so dropping /Root moves no
        // offset (spliced as bytes — BASE carries a binary comment line).
        const at = latin1.decode(BASE).indexOf('/Root 1 0 R');
        expect(at).toBeGreaterThan(0);
        const noRoot = bytesOf([BASE.subarray(0, at), BASE.subarray(at + 11)]);
        let caught = null;
        try { _sign._emitWithPlaceholder(noRoot, 16); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/no-trailer');
    });

    test('every level requires the incremental writer', () => {
        let caught = null;
        try { makeSign({ iw: null }).sign(BASE, { level: 'B' }); } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/sign/no-incremental-writer');
    });
});

/**
 * Classical single-section PDF from `{ num: body }` (object bodies in
 * PDF syntax); `trailerExtra` is spliced into the trailer dict. Object 1
 * is the Catalog.
 */
function objPdf(objs, trailerExtra) {
    let s = '%PDF-1.7\n';
    const off = {};
    const nums = Object.keys(objs).map(Number).sort((a, b) => a - b);
    for (const n of nums) { off[n] = s.length; s += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
    const size = nums[nums.length - 1] + 1;
    const xrefAt = s.length;
    s += `xref\n0 ${size}\n` + xrefEntry(0, 65535, true);
    for (let i = 1; i < size; i++) s += xrefEntry(off[i] || 0, 0, off[i] === undefined);
    s += 'trailer\n<< /Size ' + size + ' /Root 1 0 R ' + (trailerExtra || '') + '>>\n'
        + 'startxref\n' + xrefAt + '\n%%EOF\n';
    return te.encode(s);
}

/** Level-B signature with a pinned Ed25519 key (the cert SPKI matches). */
function signB(instance, base, salt) {
    const kp = keyPair(salt);
    return instance.sign(base, { algorithm: 'ed25519',
        cert: buildCert({ pub: kp.publicKey }), privateKey: kp.privateKey });
}

// office/BATCH_51/01 (BL-2041): the update that carries the /Sig also
// registers it in a signature field — ISO 32000-2 §12.7.5.5 — appending
// to whatever AcroForm / Fields / Annots the base already has.
describe('sign — BL-2041 signature field: existing AcroForm / Fields / Annots shapes', () => {
    const R = (doc, ref) => doc._raw.resolve(ref);
    const ref = (num) => ({ type: 'ref', num, gen: 0 });

    test('an indirect AcroForm, an indirect /Fields array and an indirect /Annots array are re-emitted under their own numbers and appended to', () => {
        const base = objPdf({
            1: '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /Lang (fr) >>',
            2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Annots 7 0 R >>',
            4: '<< /FT /Sig /T (Signature1) /Type /Annot /Subtype /Widget /Rect [0 0 0 0] /P 3 0 R >>',
            5: '<< /Fields 6 0 R /DA (/Helv 0 Tf 0 g) /SigFlags 1 >>',
            6: '[4 0 R]',
            7: '[4 0 R]'
        });
        const signed = signB(_sign, base, 21);
        const tail = latin1.decode(signed.subarray(base.length));
        // The page is not redefined: its indirect /Annots carries the
        // change. The Catalog IS re-emitted, for the Ed25519 signature
        // only: it declares the ISO/TS 32002 developer extension (was
        // `not.toMatch(/(^|\s)1 0 obj/)` before Ed25519 signing updates
        // carried that declaration); its AcroForm stays indirect.
        expect(tail).toMatch(/(^|\s)1 0 obj/);
        expect(tail).not.toMatch(/(^|\s)3 0 obj/);
        for (const n of [5, 6, 7]) expect(tail).toMatch(new RegExp(`(^|\\s)${n} 0 obj`));
        const doc = _doc.readDocument(signed);
        const catalog = R(doc, ref(1));
        expect(catalog.entries.AcroForm).toEqual(ref(5));
        expect(latin1.decode(catalog.entries.Lang.value)).toBe('fr');
        expect(catalog.entries.Extensions.entries.ISO_.entries.ExtensionLevel)
            .toEqual({ type: 'int', value: 32002 });
        const acro = R(doc, ref(5));
        expect(acro.entries.Fields).toEqual(ref(6));
        expect(acro.entries.SigFlags.value).toBe(3);
        expect(latin1.decode(acro.entries.DA.value)).toBe('/Helv 0 Tf 0 g');
        const fields = R(doc, ref(6)).items;
        expect(fields.length).toBe(2);
        expect(fields[0]).toEqual(ref(4));
        const annots = R(doc, ref(7)).items;
        expect(annots).toEqual([ref(4), fields[1]]);
        // The existing (unsigned) Signature1 field keeps its name: the
        // new one takes the lowest free index.
        const added = R(doc, fields[1]);
        expect(latin1.decode(added.entries.T.value)).toBe('Signature2');
        expect(added.entries.P).toEqual(ref(3));
        expect(R(doc, added.entries.V).entries.Type.value).toBe('Sig');
        expect(latin1.decode(R(doc, ref(4)).entries.T.value)).toBe('Signature1');
    });

    test('a direct /AcroForm in the Catalog is extended in a Catalog re-emission, other entries kept', () => {
        const base = objPdf({
            1: '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /NeedAppearances true >> >>',
            2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Annots [4 0 R] >>',
            4: '<< /FT /Tx /T (Name) /V (Ada) /Type /Annot /Subtype /Widget /Rect [1 1 9 9] /P 3 0 R >>'
        });
        const doc = _doc.readDocument(signB(_sign, base, 22));
        const acro = R(doc, ref(1)).entries.AcroForm;
        expect(acro.type).toBe('dict');
        expect(acro.entries.NeedAppearances).toEqual({ type: 'bool', value: true });
        expect(acro.entries.SigFlags.value).toBe(3);
        expect(acro.entries.Fields.items.length).toBe(2);
        expect(acro.entries.Fields.items[0]).toEqual(ref(4));
        expect(latin1.decode(R(doc, ref(4)).entries.V.value)).toBe('Ada');
        const page = R(doc, ref(3));
        expect(page.entries.Annots.items).toEqual([ref(4), acro.entries.Fields.items[1]]);
        expect(latin1.decode(R(doc, acro.entries.Fields.items[1]).entries.T.value))
            .toBe('Signature1');
    });

    test('/P and /Annots go to the first LEAF of the page tree (an empty first Kids node is skipped)', () => {
        const base = objPdf({
            1: '<< /Type /Catalog /Pages 2 0 R >>',
            2: '<< /Type /Pages /Kids [4 0 R 5 0 R] /Count 1 >>',
            3: '<< /Type /Page /Parent 5 0 R /MediaBox [0 0 10 10] >>',
            4: '<< /Type /Pages /Parent 2 0 R /Kids [] /Count 0 >>',
            5: '<< /Type /Pages /Parent 2 0 R /Kids [3 0 R] /Count 1 >>'
        });
        const doc = _doc.readDocument(signB(_sign, base, 23));
        const fieldRef = R(doc, ref(1)).entries.AcroForm.entries.Fields.items[0];
        expect(R(doc, fieldRef).entries.P).toEqual(ref(3));
        expect(R(doc, ref(3)).entries.Annots.items).toEqual([fieldRef]);
        expect(doc.pages.length).toBe(1);
    });

    test('an RC4 encrypted base (V 1, R 2) is refused with a typed error, never signed without its field', () => {
        // The field name of an encrypted base is encrypted with the
        // document key; only AES bases are supported, so an RC4 one is
        // refused before anything is emitted.
        const base = objPdf({
            1: '<< /Type /Catalog /Pages 2 0 R >>',
            2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>',
            4: '<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>'
        }, '/Encrypt 4 0 R /ID [<0102> <0102>] ');
        let caught = null;
        try { _sign._emitWithPlaceholder(base, 32, undefined, undefined, { password: '' }); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/encrypted-unsupported');
        expect(caught.context.reason).toBe('rc4');
    });

    test('every level requires the document reader (level B included)', () => {
        let caught = null;
        try { signB(makeSign({ doc: null }), BASE, 24); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/sign/no-document-reader');
        expect(caught.context.level).toBe('B');
    });

    test('_emitWithPlaceholder reports the field it wrote; the /Sig is the field /V', () => {
        const r = _sign._emitWithPlaceholder(BASE, 32);
        expect(r.sigObjNum).toBe(4);
        expect(r.fieldObjNum).toBe(5);
        expect(r.fieldName).toBe('Signature1');
        const doc = _doc.readDocument(r.bytes);
        const field = R(doc, ref(5));
        expect(field.entries.V).toEqual(ref(4));
        expect(field.entries.FT.value).toBe('Sig');
        expect(R(doc, ref(1)).entries.AcroForm.entries.Fields.items).toEqual([ref(5)]);
    });
});

// An encrypted base is opened through the standard security handler before
// anything is emitted; every unsupported shape is a typed refusal.
describe('sign — encrypted base refusals (hand-built /Encrypt dictionaries)', () => {
    const PAGES = {
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>'
    };
    const ID = '/ID [<0102> <0102>] ';
    function encBase(encryptDict, trailerExtra) {
        return objPdf(Object.assign({}, PAGES, { 4: encryptDict }),
            '/Encrypt 4 0 R ' + (trailerExtra === undefined ? ID : trailerExtra));
    }
    function refusal(instance, base, opts) {
        const kp = keyPair(31);
        try {
            instance.sign(base, Object.assign({ algorithm: 'ed25519',
                cert: buildCert({ pub: kp.publicKey }), privateKey: kp.privateKey,
                password: 'pw' }, opts || {}));
        } catch (e) { return e; }
        return null;
    }
    const AES_V4 = '<< /Filter /Standard /V 4 /R 4 /CF << /StdCF << /CFM /AESV2 >> >> '
        + '/StmF /StdCF /StrF /StdCF /O <00> /U <00> /P -4 >>';

    test('a non-standard security handler is refused (context.filter)', () => {
        const e = refusal(_sign, encBase('<< /Filter /Acme /V 4 /R 4 /P -4 >>'));
        expect(e).toBeInstanceOf(ContractError);
        expect(e.code).toBe('pdf/sign/encrypted-unsupported');
        expect(e.context.filter).toBe('Acme');
    });

    test('an /Encrypt dictionary without /V is refused (context.cause)', () => {
        const e = refusal(_sign, encBase('<< /Filter /Standard /R 4 /P -4 >>'));
        expect(e.code).toBe('pdf/sign/encrypted-unsupported');
        expect(e.context.cause).toBe('pdf/crypto/encrypt-dict/missing-V-R');
    });

    test('AES-GCM (CFM /AESV4) is refused (reason aes-gcm)', () => {
        const e = refusal(_sign, encBase('<< /Filter /Standard /V 5 /R 6 '
            + '/CF << /StdCF << /CFM /AESV4 >> >> /StmF /StdCF /StrF /StdCF '
            + '/O <00> /U <00> /P -4 >>'));
        expect(e.code).toBe('pdf/sign/encrypted-unsupported');
        expect(e.context.reason).toBe('aes-gcm');
    });

    test('an RC4 STREAM filter is refused even when strings are AES (reason rc4)', () => {
        const e = refusal(_sign, encBase('<< /Filter /Standard /V 4 /R 4 '
            + '/CF << /S << /CFM /AESV2 >> /K << /CFM /V2 >> >> /StmF /K /StrF /S '
            + '/O <00> /U <00> /P -4 >>'));
        expect(e.code).toBe('pdf/sign/encrypted-unsupported');
        expect(e.context.reason).toBe('rc4');
    });

    test('a V=4 base without /ID is refused (reason no-id)', () => {
        const e = refusal(_sign, encBase(AES_V4, ''));
        expect(e.code).toBe('pdf/sign/encrypted-unsupported');
        expect(e.context.reason).toBe('no-id');
    });

    test('a missing password is refused before the handler is read', () => {
        const e = refusal(_sign, encBase(AES_V4), { password: undefined });
        expect(e).toBeInstanceOf(ContractError);
        expect(e.code).toBe('pdf/sign/encrypted-password-required');
    });

    test('an unwired security handler is a typed refusal on an encrypted base only', () => {
        for (const key of ['sec', 'v4', 'v5', 'v6']) {
            const e = refusal(makeSign({ [key]: null }), encBase(AES_V4));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pdf/sign/no-security-handler');
        }
        const clear = signB(makeSign({ sec: null, v4: null, v5: null, v6: null }), BASE, 32);
        expect(latin1.decode(clear.subarray(BASE.length))).toContain('/FT /Sig');
    });
});
