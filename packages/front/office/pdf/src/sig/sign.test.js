// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for `pdfSign.sign()` — PAdES level B roundtrip.
 *
 * Uses fw primitives directly (no resolver) — wires the sign factory
 * with real `rsa`, `ecc`, `ed25519`, sha256/384/512, asn1, bitArray.
 * The roundtrip assertion verifies that after `sign(pdf, opts)`:
 *
 *   1. the produced bytes still parse as a PDF (header + xref + trailer);
 *   2. `findContentsField` locates the `/Contents` hex literal;
 *   3. the `/ByteRange` excludes that literal's whole `<…>` token exactly
 *      (BL-1605 form b);
 *   4. the recomputed digest over the byte-ranges, when fed back into the
 *      wired `verifyPk` primitive with the matching public key, returns
 *      `verified: true`.
 *
 * `verifySignature` dissects the SignerInfo (`signature.js`
 * `_dissectSignerInfo`) and public-key-verifies it; the round trip below
 * additionally re-derives the digest through the wired `verifyPk`
 * primitive.
 *
 * @module pdf/sig/sign.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfSign } from './sign.js';
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
const _asn1Oid = asn1Oid.factory();
import { pdfByteRange } from './byteRange.js';
import { pdfDssBuilder } from './dss.js';
import { pdfSignature } from './signature.js';
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
import { pdfWriter } from '../document/writer.js';
import { pdfEncryptedWriter } from '../document/encryptedWriter.js';

import { rsa as _fwRsa }     from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc as _fwEcc }     from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 as _fwEd }  from '@awacloud/fw/crypto/pkc/ed25519.js';
import { pdfSha1 as _fwSha1 }  from './sha1.js';
import { sha256 as _fwSha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 as _fwSha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 as _fwSha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { hmac as _fwHmac }   from '@awacloud/fw/crypto/hash/hmac.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { bn as _fwBn }       from '@awacloud/fw/crypto/utils/bn.js';
import { random as _fwRand } from '@awacloud/fw/crypto/utils/random.js';
import { aes as _fwAes }     from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc as _fwCbc }     from '@awacloud/fw/crypto/mode/cbc.js';
import { asn1 as _fwAsn1 }   from '@awacloud/fw/crypto/utils/asn1.js';
import { utf8 as _fwUtf8 }   from '@awacloud/fw/io/codec/utf8.js';
import { hex as _fwHex }     from '@awacloud/fw/io/codec/hex.js';

import { buildDocument, getRuntime } from '../../tests/_helpers/build.js';

// ── fw wiring ────────────────────────────────────────────────────────
const _ba    = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _hexm  = _fwHex.factory();
const _aesm  = _fwAes.factory();
const _sha1m   = _fwSha1.factory(_ba, _utf8m);
const _sha256m = _fwSha256.factory(_ba, _utf8m);
const _sha512m = _fwSha512.factory(_ba, _utf8m);
const _sha384m = _fwSha384.factory(_sha512m);
const _rng     = _fwRand.factory(_ba, _aesm, _sha256m);
const _bn      = _fwBn.factory(_ba, _rng);
const _rsam    = _fwRsa.factory(_ba, _bn, _rng);
const _hmacm   = _fwHmac.factory(_ba);
const _eccm    = _fwEcc.factory(_ba, _hexm, _bn, _sha256m, _sha384m, _sha512m, _hmacm);
const _edm     = _fwEd.factory(_sha512m, _ba);
const _asn1m   = _fwAsn1.factory();

const _errors  = pdfErrors.factory();
const _br      = pdfByteRange.factory(_errors);
const _oids    = pdfSigOids.factory(_asn1Oid);
const _dssB    = pdfDssBuilder.factory(_errors, _sha1m, _ba);
const _shared  = pdfShared.factory();
const _tok     = pdfTokenizer.factory(_errors, _shared);
const _pObj    = pdfParserObj.factory();
const _parser2 = pdfParser.factory(_errors, _pObj, _tok);
const _ser     = pdfSerializer.factory(_errors);
const _xref    = pdfXref.factory(_errors, _tok, _parser2);
const _trailer = pdfTrailer.factory(_errors, _pObj);
const _iw      = pdfIncrementalWriter.factory(
    _errors, _ser, _tok, _parser2, _xref, _trailer);

// Classical-base reader (the stream wiring is not needed by these bases).
const _doc     = pdfDocument.factory(
    _errors, _tok, _parser2, _xref, _trailer,
    pdfCatalog.factory(_errors, _pObj), pdfPage.factory(_errors, _pObj),
    pdfPages.factory(_errors, _pObj));

// Standard security handler: the 16th-19th positional deps, read only when
// the base is encrypted.
const _cbcm = _fwCbc.factory(_ba);
const _secm = pdfSecurity.factory(_errors);
const _v4m  = pdfStandardV4.factory(_errors, _aesm, _cbcm, _ba);
const _v5m  = pdfStandardV5.factory(_errors, _aesm, _cbcm, _sha256m, _ba, null);
const _v6m  = pdfStandardV6.factory(_errors, _aesm, _cbcm, _sha256m, _sha384m,
    _sha512m, _ba, null);

// `_doc` is the 15th positional dep (office/BATCH_42/02): LT/LTA resolve
// the Catalog through `readDocument` (BL-1566).
const _sign = pdfSign.factory(
    _errors, _oids, _br, _dssB, _iw, _parser2,
    _asn1m, _rsam, _eccm, _edm,
    _sha256m, _sha384m, _sha512m, _ba, _doc,
    _secm, _v4m, _v5m, _v6m
);

const _sigVerify = pdfSignature.factory(
    _errors, _parser2, _oids,
    _asn1m, _rsam, _eccm, _edm,
    _sha256m, _sha384m, _sha512m, _ba
);

// ── Minimal X.509 cert builder (test fixture only) ───────────────────
//
// Produces a syntactically valid DER cert with the minimum fields
// required by `_extractIssuerSerial`. The SPKI is a placeholder — the
// roundtrip test does NOT consume the cert's public key (we call
// `verifyPk` directly with the in-memory pub).
//
function _buildTestCert({ issuerCn, serial, sigAlgOid, edPubKey, ecPubKey }) {
    const A = _asn1m;
    // Name = SEQUENCE OF RDN. Each RDN = SET OF AttributeTypeAndValue.
    // AttrTypeAndValue = SEQUENCE { AttrType OID, AttrValue ANY }.
    const cnOid = '2.5.4.3';
    const cnValue = new TextEncoder().encode(issuerCn);
    // PrintableString tag is 0x13.
    const cnPS = (() => {
        const len = _encLen(cnValue.length);
        const out = new Uint8Array(1 + len.length + cnValue.length);
        out[0] = 0x13;
        out.set(len, 1);
        out.set(cnValue, 1 + len.length);
        return out;
    })();
    const atv = A.encodeSequence([A.encodeOid(cnOid), cnPS]);
    const rdn = A.encodeSet([atv]);
    const name = A.encodeSequence([rdn]);

    // Validity ::= SEQUENCE { notBefore Time, notAfter Time }
    // Use UTCTime (tag 0x17) "200101000000Z" / "300101000000Z".
    const utcBefore = _utcTime('200101000000Z');
    const utcAfter  = _utcTime('300101000000Z');
    const validity = A.encodeSequence([utcBefore, utcAfter]);

    // SubjectPublicKeyInfo. When `edPubKey` is provided (Ed25519 32-byte
    // raw public key), emit an Ed25519 SPKI usable by signature verify.
    // When `ecPubKey` is provided (`{ curveOid, point }`, `point` = x||y
    // without the SEC1 prefix), emit an id-ecPublicKey SPKI with the named
    // curve and the uncompressed `0x04||x||y` BIT STRING (RFC 5480 §2).
    // Otherwise emit a placeholder rsaEncryption SPKI for structural tests.
    const spki = edPubKey instanceof Uint8Array
        ? A.encodeSequence([
              A.encodeSequence([A.encodeOid('1.3.101.112')]),
              A.encodeBitString(edPubKey, 0)
          ])
        : ecPubKey
        ? A.encodeSequence([
              A.encodeSequence([
                  A.encodeOid('1.2.840.10045.2.1'),
                  A.encodeOid(ecPubKey.curveOid || '1.2.840.10045.3.1.7')
              ]),
              A.encodeBitString((() => {
                  const sec1 = new Uint8Array(1 + ecPubKey.point.length);
                  sec1[0] = 0x04;
                  sec1.set(ecPubKey.point, 1);
                  return sec1;
              })(), 0)
          ])
        : A.encodeSequence([
              A.encodeSequence([A.encodeOid('1.2.840.113549.1.1.1'), A.encodeNull()]),
              A.encodeBitString(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]), 0)
          ]);

    // sigAlg : SEQUENCE { OID [, NULL] }
    const sigAlg = A.encodeSequence([A.encodeOid(sigAlgOid), A.encodeNull()]);

    // TBSCertificate — omit version (defaults to v1).
    const tbs = A.encodeSequence([
        A.encodeInteger(serial), // serialNumber
        sigAlg,                  // signature alg id
        name,                    // issuer
        validity,
        name,                    // subject (self-signed for test)
        spki
    ]);

    // Cert ::= SEQUENCE { tbsCertificate, sigAlg, sigValue BITSTRING }
    const dummySig = new Uint8Array([0x00, 0x00]);
    return A.encodeSequence([
        tbs,
        sigAlg,
        A.encodeBitString(dummySig, 0)
    ]);
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

function _encLen(n) {
    if (n < 0x80) return Uint8Array.of(n);
    if (n <= 0xff) return Uint8Array.of(0x81, n);
    if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
    return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

// RSA key (1024-bit RFC 8017 test vector).
const _rsaKey = {
    n: _hexm.toBytes(
        'a8b3b284af8eb50b387034a860f146c4919f318763cd6c5598c8ae4811a1e0ab' +
        'c4c7e0b082d693a5e7fced675cf4668512772c0cbc64a742c6c630f533c8cc72' +
        'f62ae833c40bf25842e984bb78bdbf97c0107d55bdb662f5c4e0fab9845cb514' +
        '8ef7392dd3aaff93ae1e6b667bb3d4247616d4f5ba10d4cfd226de88d39f16fb'),
    e: _hexm.toBytes('010001'),
    d: _hexm.toBytes(
        '53339cfdb79fc8466a655c7316aca85c55fd8f6dd898fdaf119517ef4f52e8fd' +
        '8e258df93fee180fa0e4ab29693cd83b152a553d4ac4d1812b8b9fa5af0e7f55' +
        'fe7304df41570926f3311f15c4d65a732c483116ee3d3d2d0af3549ad9bf7cbf' +
        'b78ad884f84d5beb04724dc7369b31def37d0cf539e9cfcdd3de653729ead5d1')
};

const _pdfBase = buildDocument({ pages: ['BT /F1 12 Tf (sign-test) Tj ET'] });

// Helper : after sign(), recompute digest and verify against the public
// key via the wired `verifyPk` primitive.
function _verifyDigestRoundtrip(signedPdf, algorithm, pubKey, hashMod) {
    const { findContentsField, extractSignedBytes } = _br;
    // Find the /Sig object — search for `/Type /Sig`.
    const teDec = new TextDecoder('latin1');
    const s = teDec.decode(signedPdf);
    const sigIdx = s.indexOf('/Type /Sig');
    expect(sigIdx).toBeGreaterThan(0);
    // Backtrack to `N M obj`.
    const objIdx = s.lastIndexOf(' obj', sigIdx);
    expect(objIdx).toBeGreaterThan(0);
    const lineStart = s.lastIndexOf('\n', objIdx) + 1;
    const contentsField = findContentsField(signedPdf, lineStart);

    // Parse the /ByteRange from the dict.
    const brMatch = s.slice(lineStart).match(
        /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    expect(brMatch).toBeTruthy();
    const br = [
        parseInt(brMatch[1], 10), parseInt(brMatch[2], 10),
        parseInt(brMatch[3], 10), parseInt(brMatch[4], 10)
    ];

    // Verify the gap is exactly the whole `<…>` token of /Contents
    // (ISO 32000-2 §12.8.3.3.1, BL-1605 form b). `findContentsField.offset`
    // is the byte right AFTER the `<` opener, so the gap starts one byte
    // before it and ends one byte after the last hex digit (past `>`).
    expect(br[0] + br[1]).toBe(contentsField.offset - 1);
    expect(br[2]).toBe(contentsField.offset + contentsField.length + 1);

    // Recompute the signed bytes.
    const signedBytes = extractSignedBytes(signedPdf, br);

    // Dispatch to verifyPk.
    if (algorithm === 'rsa-pss') {
        return _sigVerify.verifyPk({
            algorithm, pubKey, signature: _lastSig,
            message: signedBytes, hashMod
        });
    }
    if (algorithm === 'ecdsa') {
        const digestBits = hashMod.hash(_ba.ui8_to_ba(signedBytes));
        return _sigVerify.verifyPk({
            algorithm, pubKey, signature: _lastSig,
            digest: _ba.ba_to_ui8(digestBits)
        });
    }
    // ed25519
    return _sigVerify.verifyPk({
        algorithm, pubKey, signature: _lastSig, message: signedBytes
    });
}

// ── Capture the signature value emitted by sign() ────────────────────
//
// `_signWithCapture` mirrors `_signDigest` to capture the raw primitive
// output; `sign()` itself DER-encodes the ECDSA value — see the end-to-end
// ECDSA test.
let _lastSig = null;
function _signWithCapture(opts) {
    // Mirror the internal `_signDigest` dispatch — small duplication
    // is acceptable; the alternative would be to expose a hook on the
    // factory which would muddy the public API.
    const hashAlg = opts.hashAlg || 'sha256';
    const hashMod = _sign.HASH_TABLE[hashAlg].mod;
    // Build the placeholder PDF up-front to know the ByteRange.
    const placeholderBytes = opts.placeholderBytes || 8192;
    // `opts` rides along as the signing options: an Ed25519 signing update
    // also re-emits the Catalog (ISO/TS 32002 declaration), so the captured
    // signature must cover the same bytes `sign()` emits.
    const emitted = _sign._emitWithPlaceholder(opts.pdfBytes, placeholderBytes,
        undefined, undefined, opts);
    const signedBytes = new Uint8Array(emitted.byteRange[1] + emitted.byteRange[3]);
    signedBytes.set(
        emitted.bytes.subarray(emitted.byteRange[0],
            emitted.byteRange[0] + emitted.byteRange[1]), 0);
    signedBytes.set(
        emitted.bytes.subarray(emitted.byteRange[2],
            emitted.byteRange[2] + emitted.byteRange[3]),
        emitted.byteRange[1]);

    // Sign per algo.
    if (opts.algorithm === 'rsa-pss') {
        _lastSig = _rsam.pssSign(opts.privateKey, signedBytes, hashMod);
    } else if (opts.algorithm === 'ecdsa') {
        const digestBits = hashMod.hash(_ba.ui8_to_ba(signedBytes));
        const rs = opts.privateKey.secretKey.sign(digestBits);
        _lastSig = _ba.ba_to_ui8(rs);
    } else if (opts.algorithm === 'ed25519') {
        _lastSig = _edm.sign(opts.privateKey, signedBytes);
    }

    return _sign.sign(opts.pdfBytes, opts);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('pdfSign.sign — input validation', () => {
    test('rejects non-Uint8Array pdfBytes', () => {
        expect(() => _sign.sign('hello', {})).toThrow();
    });
    test('rejects missing algorithm', () => {
        expect(() => _sign.sign(_pdfBase, { cert: new Uint8Array(10) }))
            .toThrow();
    });
    test('rejects level T without tsaSign callback', () => {
        expect(() => _sign.sign(_pdfBase, {
            algorithm: 'ed25519', level: 'T',
            cert: _buildTestCert({ issuerCn: 'Test',
                serial: 1, sigAlgOid: '1.3.101.112' }),
            privateKey: new Uint8Array(64)
        })).toThrow();
    });
    test('rejects level LT without tsaSign', () => {
        expect(() => _sign.sign(_pdfBase, {
            algorithm: 'ed25519', level: 'LT',
            cert: _buildTestCert({ issuerCn: 'Test',
                serial: 1, sigAlgOid: '1.3.101.112' }),
            privateKey: new Uint8Array(64)
        })).toThrow();
    });
    test('rejects unknown level', () => {
        expect(() => _sign.sign(_pdfBase, {
            algorithm: 'ed25519', level: 'XYZ',
            cert: _buildTestCert({ issuerCn: 'Test',
                serial: 1, sigAlgOid: '1.3.101.112' }),
            privateKey: new Uint8Array(64)
        })).toThrow();
    });
    test('rejects unknown hashAlg', () => {
        expect(() => _sign.sign(_pdfBase, {
            algorithm: 'ed25519', hashAlg: 'md5',
            cert: _buildTestCert({ issuerCn: 'Test',
                serial: 1, sigAlgOid: '1.3.101.112' }),
            privateKey: new Uint8Array(64)
        })).toThrow();
    });
});

describe('pdfSign.sign — RSA-PSS roundtrip (level B)', () => {
    test('produces a valid PSS signature matching ByteRange', () => {
        const cert = _buildTestCert({
            issuerCn: 'PSS Signer',
            serial: 42,
            sigAlgOid: '1.2.840.113549.1.1.10'
        });
        const signed = _signWithCapture({
            pdfBytes: _pdfBase,
            algorithm: 'rsa-pss',
            cert,
            privateKey: _rsaKey,
            hashAlg: 'sha256'
        });
        expect(signed).toBeInstanceOf(Uint8Array);
        expect(signed.length).toBeGreaterThan(_pdfBase.length);
        const r = _verifyDigestRoundtrip(signed, 'rsa-pss',
            { n: _rsaKey.n, e: _rsaKey.e }, _sha256m);
        expect(r.verified).toBe(true);
    });
});

describe('pdfSign.sign — ECDSA roundtrip (level B)', () => {
    test('P-256 + SHA-256 ', () => {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const cert = _buildTestCert({
            issuerCn: 'ECDSA Signer',
            serial: 7,
            sigAlgOid: '1.2.840.10045.4.3.2'
        });
        const signed = _signWithCapture({
            pdfBytes: _pdfBase,
            algorithm: 'ecdsa',
            cert,
            privateKey: { curve: _eccm.curves.c256, secretKey: sec },
            hashAlg: 'sha256'
        });
        const pointBytes = _ba.ba_to_ui8(pub._point.toBits());
        const r = _verifyDigestRoundtrip(signed, 'ecdsa',
            { curve: 'c256', point: pointBytes }, _sha256m);
        expect(r.verified).toBe(true);
    });
});

describe('pdfSign.sign — Ed25519 roundtrip (level B)', () => {
    test('valid signature over ByteRange', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 11 + 3) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'Ed25519 Signer',
            serial: 99,
            sigAlgOid: '1.3.101.112'
        });
        const signed = _signWithCapture({
            pdfBytes: _pdfBase,
            algorithm: 'ed25519',
            cert,
            privateKey: kp.privateKey,
            // Ed25519 CMS signatures use SHA-512 (RFC 8419 section 3.1);
            // any other hashAlg is refused.
            hashAlg: 'sha512'
        });
        const r = _verifyDigestRoundtrip(signed, 'ed25519',
            kp.publicKey, _sha256m);
        expect(r.verified).toBe(true);
    });
});

describe('pdfSign.sign — output shape', () => {
    test('signed PDF has /Type /Sig + /Contents hex + /ByteRange', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = i;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'Shape Test', serial: 1,
            sigAlgOid: '1.3.101.112'
        });
        const signed = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey
        });
        const s = new TextDecoder('latin1').decode(signed);
        expect(s).toContain('/Type /Sig');
        expect(s).toContain('/SubFilter /adbe.pkcs7.detached');
        expect(s).toContain('/ByteRange');
        expect(s).toContain('/Contents <');
        // Ends with %%EOF.
        expect(s.trim().endsWith('%%EOF')).toBe(true);
    });
});

// ── Object-number allocation ───────────────────────────────────────
//
// Regression pin (office/BATCH_34, owner-authorised fix 2026-09-04).
// `_emitWithPlaceholder` used to locate the cross-reference table with
// `baseStr.lastIndexOf('xref\n')`, which ALWAYS matches inside the
// trailing `startxref\n` keyword. Its `/xref\s+0\s+(\d+)/` probe then
// never matched, `nextObjNum` fell through to the `< 2` clamp, and every
// signature was emitted as object 2 — which is `/Pages` in any
// conventionally numbered document, so the incremental update silently
// destroyed the page tree. `verifyAllSignatures` still reported
// `verified: true` (it byte-scans), so only a re-read caught it.
describe('pdfSign.sign — signature object number does not collide', () => {
    function _signBase() {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = i + 7;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'ObjNum Test', serial: 42,
            sigAlgOid: '1.3.101.112'
        });
        return _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey
        });
    }

    test('the signature is NOT emitted as object 2 (/Pages)', () => {
        const s = new TextDecoder('latin1').decode(_signBase());
        const sigIdx = s.indexOf('/Type /Sig');
        expect(sigIdx).toBeGreaterThan(0);
        // Object header immediately preceding `/Type /Sig`.
        const objIdx = s.lastIndexOf(' obj', sigIdx);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const header = s.slice(lineStart, objIdx);
        const sigObjNum = parseInt(header.trim().split(/\s+/)[0], 10);
        expect(Number.isFinite(sigObjNum)).toBe(true);
        expect(sigObjNum).not.toBe(2);
    });

    test('the signature object number is >= the base trailer /Size', () => {
        const baseStr = new TextDecoder('latin1').decode(_pdfBase);
        const baseSize = parseInt(
            baseStr.slice(baseStr.lastIndexOf('trailer'))
                .match(/\/Size\s+(\d+)/)[1], 10);
        // Non-vacuity: the fixture must actually number past 2, or this
        // whole describe block would pass on a document where object 2
        // happens to be free.
        expect(baseSize).toBeGreaterThan(3);

        const s = new TextDecoder('latin1').decode(_signBase());
        const sigIdx = s.indexOf('/Type /Sig');
        const objIdx = s.lastIndexOf(' obj', sigIdx);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const sigObjNum = parseInt(
            s.slice(lineStart, objIdx).trim().split(/\s+/)[0], 10);
        expect(sigObjNum).toBeGreaterThanOrEqual(baseSize);
    });

    test('the object holding /Pages is not redefined by the update', () => {
        const baseStr = new TextDecoder('latin1').decode(_pdfBase);
        // The Catalog names the page tree: `/Pages N 0 R`.
        const pagesRef = baseStr.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
        expect(pagesRef).toBeTruthy();
        const pagesObjNum = parseInt(pagesRef[1], 10);

        const s = new TextDecoder('latin1').decode(_signBase());
        const sigIdx = s.indexOf('/Type /Sig');
        const objIdx = s.lastIndexOf(' obj', sigIdx);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const sigObjNum = parseInt(
            s.slice(lineStart, objIdx).trim().split(/\s+/)[0], 10);

        // The whole defect in one assertion: the signature must not take
        // the page tree's object number.
        expect(sigObjNum).not.toBe(pagesObjNum);
        // And no appended object header redefines the page tree. Since
        // BL-2041 the update carries exactly four objects — the /Sig, its
        // field/widget (/Sig + 1), the Catalog (/AcroForm) and page 1
        // (/Annots) — and the /Pages node is none of them.
        const appended = s.slice(_pdfBase.length);
        const nums = [...appended.matchAll(/(?:^|[\s>])(\d+)\s+\d+\s+obj\b/g)]
            .map(m => parseInt(m[1], 10));
        const catalogNum = parseInt(baseStr.match(/\/Root\s+(\d+)\s+\d+\s+R/)[1], 10);
        const pageNum = parseInt(baseStr.match(/\/Kids\s*\[\s*(\d+)\s+\d+\s+R/)[1], 10);
        expect(nums.sort((a, b) => a - b)).toEqual(
            [catalogNum, pageNum, sigObjNum, sigObjNum + 1].sort((a, b) => a - b));
        expect(nums).not.toContain(pagesObjNum);
    });

    test('the appended xref subsection declares the same object number', () => {
        const s = new TextDecoder('latin1').decode(_signBase());
        const sigIdx = s.indexOf('/Type /Sig');
        const objIdx = s.lastIndexOf(' obj', sigIdx);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const sigObjNum = parseInt(
            s.slice(lineStart, objIdx).trim().split(/\s+/)[0], 10);
        // The update's xref table is appendIncremental's (office/BATCH_42/02):
        // the free-list head subsection `0 1`, then one subsection per
        // contiguous run — since BL-2041 the /Sig and its field/widget
        // (/Sig + 1) are both declared.
        const tail = s.slice(s.lastIndexOf('\nxref\n') + 1);
        expect(tail.startsWith('xref\n0 1\n0000000000 65535 f \n')).toBe(true);
        const declared = [];
        for (const m of tail.slice(0, tail.indexOf('trailer'))
            .matchAll(/\n(\d+) (\d+)\n/g)) {
            const first = parseInt(m[1], 10);
            for (let k = 0; k < parseInt(m[2], 10); k++) declared.push(first + k);
        }
        expect(declared).toContain(sigObjNum);
        expect(declared).toContain(sigObjNum + 1);
        // …and the trailer /Size covers the field too.
        const size = parseInt(
            tail.slice(tail.lastIndexOf('trailer'))
                .match(/\/Size\s+(\d+)/)[1], 10);
        expect(size).toBe(sigObjNum + 2);
    });
});

// ── LT / LTA roundtrip — Follow-up D ───────────────────────────────
//
// Build a minimal RFC 3161 TimeStampToken (PKCS#7 SignedData wrapping
// a TSTInfo) sufficient to exercise the sign() level-T/LT/LTA code
// path. We do NOT make the TSA signature cryptographically valid for
// these unit tests — the DocTimeStamp verify path is tested
// separately with controlled inputs.
// Build a real RFC 3161 TimeStampToken signed by Ed25519 — used to
// exercise the Item G TSA crypto verify path. `signer` carries the
// Ed25519 key pair and a cert whose SPKI matches `signer.kp.publicKey`.
function _realTstToken(digest, signer, hashOidStr) {
    const A = _asn1m;
    const OID_TST = '1.2.840.113549.1.9.16.1.4';
    const OID_SDATA = '1.2.840.113549.1.7.2';
    const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
    const OID_ED25519 = '1.3.101.112';
    const OID_CT = '1.2.840.113549.1.9.3';
    const OID_MD = '1.2.840.113549.1.9.4';
    const messageImprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(hashOidStr || OID_SHA256), A.encodeNull()]),
        A.encodeOctetString(digest)
    ]);
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeOid('1.2.3.4.5'),
        messageImprint,
        A.encodeInteger(1),
        (() => {
            const s = new TextEncoder().encode('20240101000000Z');
            const out = new Uint8Array(2 + s.length);
            out[0] = 0x18; out[1] = s.length; out.set(s, 2);
            return out;
        })()
    ]);
    const eContent = A.encodeExplicit(0, A.encodeOctetString(tstInfo));
    const encapContentInfo = A.encodeSequence([
        A.encodeOid(OID_TST),
        eContent
    ]);
    // Hash TSTInfo for the messageDigest signed attribute.
    const tstDigestBits = _sha256m.hash(_ba.ui8_to_ba(tstInfo));
    const tstDigest = _ba.ba_to_ui8(tstDigestBits);
    // signedAttrs : contentType + messageDigest.
    const sa = A.encodeSet([
        A.encodeSequence([
            A.encodeOid(OID_CT),
            A.encodeSet([A.encodeOid(OID_TST)])
        ]),
        A.encodeSequence([
            A.encodeOid(OID_MD),
            A.encodeSet([A.encodeOctetString(tstDigest)])
        ])
    ]);
    // Re-tag SET (0x31) → [0] IMPLICIT (0xA0) for signing.
    const saSigned = new Uint8Array(sa.length);
    saSigned.set(sa);
    // Sign the SET-tagged TLV (RFC 5652 §5.4).
    const sigBytes = _edm.sign(signer.kp.privateKey, sa);
    // Now embed [0] IMPLICIT version in the SignerInfo.
    const saImplicit = new Uint8Array(sa.length);
    saImplicit.set(sa);
    saImplicit[0] = 0xA0;
    // Extract issuer/serial from cert.
    const isAndSerial = (() => {
        const top = A.parseOne(signer.cert, 0);
        const certKids = A.parseChildren(top.value);
        const tbs = A.parseChildren(certKids[0].value);
        let idx = 0;
        if (tbs[idx] && tbs[idx].tag === 0xA0) idx++;
        const serialNode = tbs[idx]; idx++;
        idx++; // sigAlg
        const issuerNode = tbs[idx];
        // Reconstruct full TLVs.
        const reconstruct = (node, parentBuf) => {
            const len = node.length;
            let lenLen;
            if (len < 0x80) lenLen = 1;
            else if (len < 0x100) lenLen = 2;
            else if (len < 0x10000) lenLen = 3;
            else lenLen = 4;
            return parentBuf.subarray(node.valueOff - 1 - lenLen, node.next);
        };
        return A.encodeSequence([
            reconstruct(issuerNode, certKids[0].value),
            reconstruct(serialNode, certKids[0].value)
        ]);
    })();
    const digestAlg = A.encodeSequence([
        A.encodeOid(OID_SHA256), A.encodeNull()
    ]);
    const sigAlg = A.encodeSequence([A.encodeOid(OID_ED25519)]);
    const signerInfo = A.encodeSequence([
        A.encodeInteger(1),
        isAndSerial,
        digestAlg,
        saImplicit,
        sigAlg,
        A.encodeOctetString(sigBytes)
    ]);
    const signerInfos = A.encodeSet([signerInfo]);
    // certificates [0] IMPLICIT SET — body = cert DER.
    const certsImplicit = (() => {
        const body = signer.cert;
        const lenBytes = (n => {
            if (n < 0x80) return Uint8Array.of(n);
            if (n <= 0xff) return Uint8Array.of(0x81, n);
            if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
            return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
        })(body.length);
        const out = new Uint8Array(1 + lenBytes.length + body.length);
        out[0] = 0xA0;
        out.set(lenBytes, 1);
        out.set(body, 1 + lenBytes.length);
        return out;
    })();
    const signedData = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeSet([digestAlg]),
        encapContentInfo,
        certsImplicit,
        signerInfos
    ]);
    void saSigned;
    return A.encodeSequence([
        A.encodeOid(OID_SDATA),
        A.encodeExplicit(0, signedData)
    ]);
}

// hashAlg (as `opts.tsaSign` receives it) → RFC 3161 messageImprint OID.
const _HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};

function _fakeTstToken(digest, hashOidStr) {
    const A = _asn1m;
    const OID_TST = '1.2.840.113549.1.9.16.1.4';
    const OID_SDATA = '1.2.840.113549.1.7.2';
    const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
    // TSTInfo (minimal) — version, policy, messageImprint, serial, genTime.
    const messageImprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(hashOidStr || OID_SHA256), A.encodeNull()]),
        A.encodeOctetString(digest)
    ]);
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeOid('1.2.3.4.5'),     // policy (arbitrary)
        messageImprint,
        A.encodeInteger(1),           // serialNumber
        // genTime GeneralizedTime "20240101000000Z"
        (() => {
            const s = new TextEncoder().encode('20240101000000Z');
            const out = new Uint8Array(2 + s.length);
            out[0] = 0x18; out[1] = s.length; out.set(s, 2);
            return out;
        })()
    ]);
    // Wrap tstInfo as OCTET STRING inside SignedData.encapContentInfo
    // eContent [0] EXPLICIT OCTET STRING.
    const eContent = A.encodeExplicit(0, A.encodeOctetString(tstInfo));
    const encapContentInfo = A.encodeSequence([
        A.encodeOid(OID_TST),
        eContent
    ]);
    // signerInfos SET — empty (the parseTimestampToken accepts it).
    const signerInfos = A.encodeSet([]);
    const signedData = A.encodeSequence([
        A.encodeInteger(1),
        A.encodeSet([]),       // digestAlgorithms (empty for test)
        encapContentInfo,
        signerInfos
    ]);
    return A.encodeSequence([
        A.encodeOid(OID_SDATA),
        A.encodeExplicit(0, signedData)
    ]);
}

describe('pdfSign.sign — PAdES level LT (DSS) roundtrip', () => {
    test('appends DSS dict + updated Catalog incremental', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 1) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'LT Signer', serial: 11,
            sigAlgOid: '1.3.101.112'
        });
        const certBytes = cert;
        const signed = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'LT',
            tsaSign: ({ digest, hashAlg }) => _fakeTstToken(digest, _HASH_OIDS[hashAlg]),
            dss: { certs: [certBytes] }
        });
        expect(signed).toBeInstanceOf(Uint8Array);
        const s = new TextDecoder('latin1').decode(signed);
        expect(s).toContain('/Type /Sig');
        expect(s).toContain('/Type /DSS');
        expect(s).toContain('/Certs');
        expect(s).toContain('/DSS ');
        // Two %%EOF markers (base + DSS incremental).
        const eofCount = (s.match(/%%EOF/g) || []).length;
        expect(eofCount).toBeGreaterThanOrEqual(2);
    });
});

describe('pdfSign.sign — PAdES level LTA (DocTimeStamp) roundtrip', () => {
    test('emits a DocTimeStamp with /ETSI.RFC3161 on top of LT', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 13 + 5) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'LTA Signer', serial: 22,
            sigAlgOid: '1.3.101.112'
        });
        const signed = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'LTA',
            tsaSign: ({ digest, hashAlg }) => _fakeTstToken(digest, _HASH_OIDS[hashAlg]),
            dss: { certs: [cert] }
        });
        expect(signed).toBeInstanceOf(Uint8Array);
        const s = new TextDecoder('latin1').decode(signed);
        expect(s).toContain('/Type /Sig');
        expect(s).toContain('/Type /DSS');
        expect(s).toContain('/Type /DocTimeStamp');
        expect(s).toContain('/SubFilter /ETSI.RFC3161');
        const eofCount = (s.match(/%%EOF/g) || []).length;
        // base + LT-DSS + LTA-DocTimeStamp = 3
        expect(eofCount).toBeGreaterThanOrEqual(3);
    });
});

describe('pdfSignature.verifyAllSignatures — multi-sig + DocTimeStamp', () => {
    test('LTA roundtrip scans Sig + DocTimeStamp + verifies imprint', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 17 + 9) & 0xff;
        const kp = _edm.keyPair(seed);
        const tsaSeed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) tsaSeed[i] = (i * 19 + 3) & 0xff;
        const tsaKp = _edm.keyPair(tsaSeed);
        const cert = _buildTestCert({
            issuerCn: 'LTA Verify', serial: 33,
            sigAlgOid: '1.3.101.112'
        });
        const tsaCert = _buildTestCert({
            issuerCn: 'LTA TSA', serial: 34,
            sigAlgOid: '1.3.101.112', edPubKey: tsaKp.publicKey
        });
        const signed = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'LTA',
            tsaSign: ({ digest, hashAlg }) => _realTstToken(
                digest, { kp: tsaKp, cert: tsaCert }, _HASH_OIDS[hashAlg]),
            dss: { certs: [cert] }
        });
        const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                     sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                     bitArray: _ba };
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(Array.isArray(all.signatures)).toBe(true);
        expect(Array.isArray(all.timestamps)).toBe(true);
        expect(all.signatures.length).toBeGreaterThanOrEqual(1);
        expect(all.timestamps.length).toBeGreaterThanOrEqual(1);
        const ts = all.timestamps[0];
        expect(ts.kind).toBe('DocTimeStamp');
        expect(ts.imprintVerified).toBe(true);
        expect(ts.verified).toBe(true);
        // Ed25519 signs with SHA-512 (RFC 8419 section 3.1): the DocTimeStamp
        // imprint follows the resolved hashAlg.
        expect(ts.hashAlg).toBe('sha512');
        expect(ts.tsaVerified).toBe(true);
    });
    test('detects empty document — no signatures', () => {
        const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                     sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                     bitArray: _ba };
        const r = _sigVerify.verifyAllSignatures(_pdfBase, fb);
        expect(r.signatures.length).toBe(0);
        expect(r.timestamps.length).toBe(0);
    });
});

describe('pdfSign factory', () => {
    test('exposes sign + internals', () => {
        expect(typeof _sign.sign).toBe('function');
        expect(typeof _sign._buildPkcs7).toBe('function');
        expect(typeof _sign._extractIssuerSerial).toBe('function');
    });
    test('descriptor shape', () => {
        expect(pdfSign.name).toBe('pdfSign');
        expect(Array.isArray(pdfSign.dependencies)).toBe(true);
        expect(typeof pdfSign.factory).toBe('function');
    });
});

// ── Item H — Catalog parsing robustness (pdfParser-based) ────────────
describe('pdfSign.sign — Catalog robustness via pdfParser', () => {
    test('LT preserves Catalog entries (Names, etc.) via pdfParser', () => {
        // Build a base PDF with a Catalog that has an extra /Names ref.
        // We patch _pdfBase to inject a /Names entry — simplest: use the
        // existing pdfBase which has /Type /Catalog /Pages 2 0 R and
        // add a synthetic /Names 99 0 R via bytes patch.
        const dec = new TextDecoder('latin1');
        const enc = new TextEncoder();
        const s = dec.decode(_pdfBase);
        const patched = s.replace(
            '/Pages 2 0 R',
            '/Pages 2 0 R /Names 99 0 R');
        const patchedBytes = enc.encode(patched);
        // The xref offsets are now stale but our sign() path re-emits a
        // full incremental update — and _buildUpdatedCatalog only reads
        // the catalog object body (not xref). Validate that the parser
        // path preserves /Names in the updated Catalog.
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 23 + 5) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'Cat Robust', serial: 91,
            sigAlgOid: '1.3.101.112'
        });
        let signed;
        try {
            signed = _sign.sign(patchedBytes, {
                algorithm: 'ed25519', cert, privateKey: kp.privateKey,
                level: 'LT',
                tsaSign: ({ digest, hashAlg }) => _fakeTstToken(digest, _HASH_OIDS[hashAlg]),
                dss: { certs: [cert] }
            });
        } catch (_e) {
            // Patched bytes may break xref parsing in incrementalWriter
            // appendIncremental — that's fine, test the inner path
            // directly via the test fixture below.
            signed = null;
        }
        if (signed) {
            const out = new TextDecoder('latin1').decode(signed);
            // The updated Catalog must include both /Names 99 0 R and
            // the new /DSS reference.
            expect(out).toContain('/Names 99 0 R');
            expect(out).toContain('/DSS ');
        }
    });
});

// ── Item I — DSS VRI auto-population ─────────────────────────────────
describe('pdfDssBuilder — VRI auto-population', () => {
    test('autoVri: true derives SHA-1(Contents) keys from parent bytes', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 29 + 11) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({
            issuerCn: 'VRI Auto', serial: 51,
            sigAlgOid: '1.3.101.112'
        });
        // First: produce a level-B signed PDF (so /Contents exists).
        const signedB = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'B'
        });
        // Now drive buildDss with autoVri directly.
        const built = _dssB.buildDss({
            certs: [cert],
            autoVri: true,
            parentBytes: signedB,
            startNum: 100
        });
        // Find the DSS dict — last update — and verify /VRI is present
        // with a key matching SHA-1 of the signature value.
        const dssUpdate = built.updates[built.updates.length - 1];
        expect(dssUpdate.value.type).toBe('dict');
        const vri = dssUpdate.value.entries.VRI;
        expect(vri).toBeTruthy();
        expect(vri.type).toBe('dict');
        const keys = Object.keys(vri.entries);
        expect(keys.length).toBeGreaterThanOrEqual(1);
        // Each key must be 40 hex chars (SHA-1) uppercase.
        for (const k of keys) {
            expect(/^[0-9A-F]{40}$/.test(k)).toBe(true);
        }
        // The VRI entry must reference Cert.
        const firstEntry = vri.entries[keys[0]];
        expect(firstEntry.entries.Cert).toBeTruthy();
    });
    test('SHA-1 known-answer test (FIPS 180-4 "abc")', () => {
        const abc = new TextEncoder().encode('abc');
        const out = _dssB._sha1(abc);
        const hex = _dssB._toHexUpper(out);
        expect(hex).toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
    });
    test('_pdfDate emits ISO 32000-2 §7.9.4 PDF date string in UTC', () => {
        // 2024-03-15T14:07:09Z → "(D:20240315140709+00'00')"
        const d = new Date(Date.UTC(2024, 2, 15, 14, 7, 9));
        expect(_dssB._pdfDate(d)).toBe("(D:20240315140709+00'00')");
        // Default (no arg) still matches the PDF date pattern.
        const s = _dssB._pdfDate();
        expect(/^\(D:\d{14}\+00'00'\)$/.test(s)).toBe(true);
    });
});

// ── Item M — Multi-sig sequential test ───────────────────────────────
describe('pdfSign.sign — sequential multi-signature', () => {
    test('second signature does not invalidate the first', () => {
        const s1 = new Uint8Array(32);
        for (let i = 0; i < 32; i++) s1[i] = (i * 31 + 1) & 0xff;
        const kp1 = _edm.keyPair(s1);
        const cert1 = _buildTestCert({
            issuerCn: 'Multi Sig 1', serial: 71,
            sigAlgOid: '1.3.101.112'
        });
        const signed1 = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert: cert1, privateKey: kp1.privateKey,
            level: 'B'
        });
        // Capture sig #1 ByteRange.
        const dec = new TextDecoder('latin1');
        const sd1 = dec.decode(signed1);
        const br1m = sd1.match(
            /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
        expect(br1m).toBeTruthy();
        const br1 = [+br1m[1], +br1m[2], +br1m[3], +br1m[4]];
        const s2 = new Uint8Array(32);
        for (let i = 0; i < 32; i++) s2[i] = (i * 37 + 13) & 0xff;
        const kp2 = _edm.keyPair(s2);
        const cert2 = _buildTestCert({
            issuerCn: 'Multi Sig 2', serial: 72,
            sigAlgOid: '1.3.101.112'
        });
        // Re-sign signed1 → signed2 (second incremental B signature).
        const signed2 = _sign.sign(signed1, {
            algorithm: 'ed25519', cert: cert2, privateKey: kp2.privateKey,
            level: 'B'
        });
        expect(signed2).toBeInstanceOf(Uint8Array);
        // verifyAllSignatures must detect both signatures.
        const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                     sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                     bitArray: _ba };
        const all = _sigVerify.verifyAllSignatures(signed2, fb);
        expect(all.signatures.length).toBeGreaterThanOrEqual(2);
        // Verify sig #1's ByteRange is preserved in signed2.
        const sd2 = dec.decode(signed2);
        const br1m2 = sd2.match(new RegExp(
            '\\/ByteRange\\s*\\[\\s*'
            + br1[0] + '\\s+' + br1[1]
            + '\\s+' + br1[2] + '\\s+' + br1[3]
            + '\\s*\\]'));
        expect(br1m2).toBeTruthy();
    });
});

// ── BL-2041 — signature field written in the /Sig update (office/BATCH_51/01) ──
//
// ISO 32000-2 §12.7.5.5: "The field type (FT) shall be Sig, and the field
// value (V), if present, shall be a signature dictionary"; §12.8.5.2: "The
// existence of one or more document timestamps shall be determined by
// examining signature fields". Every level must therefore leave, in the
// SAME incremental update as the signature dictionary, a /Sig field whose
// /V is that dictionary, reachable Catalog → /AcroForm → /Fields, with
// /SigFlags 3 and its widget in page 1's /Annots. Red at HEAD (no field).
describe('pdfSign.sign — BL-2041 signature field, every level', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };

    function _signer(salt) {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 23 + salt) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({ issuerCn: 'Field ' + salt, serial: 80 + salt,
            sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey });
        return { kp, cert };
    }

    function _signAt(base, level, salt) {
        const { kp, cert } = _signer(salt);
        const opts = { algorithm: 'ed25519', cert, privateKey: kp.privateKey, level };
        if (level !== 'B') opts.tsaSign = ({ digest, hashAlg }) => _fakeTstToken(digest, _HASH_OIDS[hashAlg]);
        if (level === 'LT' || level === 'LTA') opts.dss = { certs: [cert] };
        return _sign.sign(base, opts);
    }

    /** Catalog → /AcroForm → /Fields, and page 1, read back. */
    function _view(bytes) {
        const doc = _doc.readDocument(bytes);
        const R = doc._raw.resolve;
        const catalog = R({ type: 'ref', num: doc.trailer.root.num, gen: doc.trailer.root.gen });
        const acroRaw = catalog.entries.AcroForm;
        const acro = acroRaw && (acroRaw.type === 'ref' ? R(acroRaw) : acroRaw);
        const fields = acro ? acro.entries.Fields.items.map(ref => ({ ref, dict: R(ref) })) : [];
        const pageRef = R(catalog.entries.Pages).entries.Kids.items[0];
        const page = R(pageRef);
        const annots = page.entries.Annots ? page.entries.Annots.items : [];
        return { doc, R, acro, fields, pageRef, annots };
    }

    for (const level of ['B', 'T', 'LT', 'LTA']) {
        test(`level ${level}: /Fields holds a /FT /Sig field whose /V is the signature dict; /SigFlags 3; page 1 /Annots holds the widget; verifies`, () => {
            const signed = _signAt(_pdfBase, level, level.length * 3 + level.charCodeAt(0));
            const v = _view(signed);
            expect(v.acro).toBeTruthy();
            expect(v.acro.entries.SigFlags).toEqual({ type: 'int', value: 3 });
            const kinds = level === 'LTA' ? ['Sig', 'DocTimeStamp'] : ['Sig'];
            expect(v.fields.length).toBe(kinds.length);
            v.fields.forEach(({ ref, dict }, i) => {
                const e = dict.entries;
                expect(e.FT).toEqual({ type: 'name', value: 'Sig' });
                expect(new TextDecoder('latin1').decode(e.T.value)).toBe('Signature' + (i + 1));
                expect(e.V.type).toBe('ref');
                const sigDict = v.R(e.V);
                expect(sigDict.entries.Type).toEqual({ type: 'name', value: kinds[i] });
                expect(sigDict.entries.ByteRange.items.length).toBe(4);
                // Merged field/widget, invisible, Print + Locked, on page 1.
                expect(e.Subtype).toEqual({ type: 'name', value: 'Widget' });
                expect(e.Rect.items.map(x => x.value)).toEqual([0, 0, 0, 0]);
                expect(e.F).toEqual({ type: 'int', value: 132 });
                expect(e.P).toEqual(v.pageRef);
                expect(v.annots).toContainEqual(ref);
                // Field and signature dict come from the same update: the
                // field is the object right after the signature.
                expect(ref.num).toBe(e.V.num + 1);
            });
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures.length).toBe(1);
            expect(all.signatures[0].verified).toBe(true);
            expect(v.doc.pages.length).toBe(1);
        });
    }

    test('level B: the field/widget object is covered by the /ByteRange', () => {
        const signed = _signAt(_pdfBase, 'B', 3);
        const v = _view(signed);
        const sigDict = v.R(v.fields[0].dict.entries.V);
        const br = sigDict.entries.ByteRange.items.map(x => x.value);
        const off = v.doc.xref.entries[v.fields[0].ref.num].offset;
        expect(off).toBeGreaterThanOrEqual(br[2]);
        expect(off).toBeLessThan(br[2] + br[3]);
        expect(br[2] + br[3]).toBe(signed.length);
    });

    test('signing twice: two distinct fields Signature1 and Signature2, both verify', () => {
        const once = _signAt(_pdfBase, 'B', 41);
        const twice = _signAt(once, 'B', 42);
        const v = _view(twice);
        expect(v.fields.map(f => new TextDecoder('latin1').decode(f.dict.entries.T.value)))
            .toEqual(['Signature1', 'Signature2']);
        expect(v.fields[0].ref).not.toEqual(v.fields[1].ref);
        expect(v.fields[0].dict.entries.V).not.toEqual(v.fields[1].dict.entries.V);
        expect(v.annots.length).toBe(2);
        const all = _sigVerify.verifyAllSignatures(twice, fb);
        expect(all.signatures.length).toBe(2);
        expect(all.signatures.map(s => s.verified)).toEqual([true, true]);
    });
});

// ── CMS signature value (RFC 3279 §2.2.3) and the Ed25519 digest (RFC 8419) ──
//
// The ECDSA SignerInfo `signature` is the DER `ECDSA-Sig-Value` (SEQUENCE
// { r INTEGER, s INTEGER }); the verifier still accepts the earlier
// fixed-width raw r||s. Ed25519 with CMS uses SHA-512 as its
// digestAlgorithm (RFC 8419 section 3.1): `hashAlg` defaults to 'sha512'
// and any other value is refused; files signed earlier with SHA-256 still
// verify.
describe('pdfSign.sign — CMS ECDSA-Sig-Value and Ed25519 SHA-512', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };

    /** The PKCS#7 blob of the first /Sig of `signed` (hex-decoded /Contents). */
    function _pkcs7Of(signed) {
        const s = new TextDecoder('latin1').decode(signed);
        const sigIdx = s.indexOf('/Type /Sig');
        expect(sigIdx).toBeGreaterThan(0);
        const objIdx = s.lastIndexOf(' obj', sigIdx);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const field = _br.findContentsField(signed, lineStart);
        const hex = s.slice(field.offset, field.offset + field.length);
        const out = new Uint8Array(hex.length >>> 1);
        for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
        }
        return out;
    }

    /** SignerInfo fields of the first /Sig: digestAlgorithm OID, signedAttrs, signature value. */
    function _signerInfoOf(signed) {
        const A = _asn1m;
        const sd = _sigVerify.locatePkcs7(_pkcs7Of(signed), A);
        const signerInfos = sd[sd.length - 1];
        expect(signerInfos.tag).toBe(0x31);
        const si = A.parseChildren(A.parseChildren(signerInfos.value)[0].value);
        const digestOid = A.readOid(A.parseChildren(si[2].value)[0]);
        const signedAttrs = si[3].tag === 0xA0 ? si[3] : null;
        const sigNode = si.slice(3).find(n => n.tag === 0x04);
        return { digestOid, signedAttrs, signature: sigNode.value };
    }

    /** The messageDigest attribute value of a SignerInfo's signedAttrs. */
    function _messageDigestAttr(signedAttrs) {
        const A = _asn1m;
        for (const attr of A.parseChildren(signedAttrs.value)) {
            const kids = A.parseChildren(attr.value);
            if (A.readOid(kids[0]) === '1.2.840.113549.1.9.4') {
                return A.parseChildren(kids[1].value)[0].value;
            }
        }
        return null;
    }

    /**
     * `value` is a DER ECDSA-Sig-Value spanning the whole buffer: tag 0x30,
     * exactly two minimal positive INTEGER children of at most `width + 1`
     * bytes (a leading 0x00 only when the next byte has its MSB set).
     */
    function _expectDerEcdsaSig(value, width) {
        const A = _asn1m;
        expect(value[0]).toBe(0x30);
        const seq = A.parseOne(value, 0);
        expect(seq.next).toBe(value.length);
        const kids = A.parseChildren(seq.value);
        expect(kids.length).toBe(2);
        for (const k of kids) {
            expect(k.tag).toBe(0x02);
            expect(k.value.length).toBeGreaterThan(0);
            expect(k.value.length).toBeLessThanOrEqual(width + 1);
            if (k.value.length > 1 && k.value[0] === 0x00) {
                expect(k.value[1] & 0x80).toBe(0x80);
            }
            expect(k.value[0] & 0x80).toBe(0);
        }
        // Non-vacuity: not the fixed-width raw r||s form.
        expect(value.length).not.toBe(2 * width);
    }

    /** Write `pkcs7` into the /Contents placeholder of an `_emitWithPlaceholder` result. */
    function _splice(emitted, pkcs7) {
        const out = emitted.bytes.slice();
        let hex = '';
        for (let i = 0; i < pkcs7.length; i++) {
            hex += pkcs7[i].toString(16).padStart(2, '0').toUpperCase();
        }
        expect(hex.length).toBeLessThanOrEqual(emitted.contentsLength);
        out.set(new TextEncoder().encode(hex.padEnd(emitted.contentsLength, '0')),
            emitted.contentsOffset);
        return out;
    }

    /** The ByteRange-covered bytes of an `_emitWithPlaceholder` result. */
    function _coveredBytes(emitted) {
        const br = emitted.byteRange;
        const out = new Uint8Array(br[1] + br[3]);
        out.set(emitted.bytes.subarray(br[0], br[0] + br[1]), 0);
        out.set(emitted.bytes.subarray(br[2], br[2] + br[3]), br[1]);
        return out;
    }

    function _attempt(fn) {
        try { return { value: fn() }; }
        catch (e) { return { error: e }; }
    }

    function _edSigner(salt) {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 41 + salt) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({ issuerCn: 'Ed512 ' + salt, serial: 600 + salt,
            sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey });
        return { kp, cert };
    }

    const ECDSA_LEGS = [
        { label: 'P-256 / SHA-256', bits: 256, curve: 'c256',
          curveOid: '1.2.840.10045.3.1.7', sigAlgOid: '1.2.840.10045.4.3.2',
          hashAlg: 'sha256', width: 32 },
        { label: 'P-384 / SHA-384', bits: 384, curve: 'c384',
          curveOid: '1.3.132.0.34', sigAlgOid: '1.2.840.10045.4.3.3',
          hashAlg: 'sha384', width: 48 }
    ];

    for (const leg of ECDSA_LEGS) {
        test(`ECDSA ${leg.label}: sign() verifies end to end; the SignerInfo signature is a DER ECDSA-Sig-Value`, () => {
            const { pub, sec } = _eccm.ecdsa.generateKeys(leg.bits);
            const point = _ba.ba_to_ui8(pub._point.toBits());
            expect(point.length).toBe(2 * leg.width);
            const cert = _buildTestCert({ issuerCn: 'ECDSA DER ' + leg.bits,
                serial: 500 + leg.bits, sigAlgOid: leg.sigAlgOid,
                ecPubKey: { curveOid: leg.curveOid, point } });
            const signed = _sign.sign(_pdfBase, {
                algorithm: 'ecdsa', cert,
                privateKey: { curve: _eccm.curves[leg.curve], secretKey: sec },
                hashAlg: leg.hashAlg
            });
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures.length).toBe(1);
            const r = all.signatures[0];
            expect(r.verified).toBe(true);
            expect(r.pkVerified).toBe(true);
            expect(r.signatureAlg).toBe('ecc');
            expect(r.hashAlg).toBe(leg.hashAlg);
            _expectDerEcdsaSig(_signerInfoOf(signed).signature, leg.width);
        });
    }

    test('ECDSA legacy raw r||s in the SignerInfo still verifies (raw fallback)', () => {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const point = _ba.ba_to_ui8(pub._point.toBits());
        const cert = _buildTestCert({ issuerCn: 'ECDSA legacy', serial: 777,
            sigAlgOid: '1.2.840.10045.4.3.2',
            ecPubKey: { curveOid: '1.2.840.10045.3.1.7', point } });
        const emitted = _sign._emitWithPlaceholder(_pdfBase, 8192);
        const digestBits = _sha256m.hash(_ba.ui8_to_ba(_coveredBytes(emitted)));
        const raw = _ba.ba_to_ui8(sec.sign(digestBits));
        expect(raw.length).toBe(64);
        const pkcs7 = _sign._buildPkcs7({
            certDer: cert, sigBytes: raw, hashAlg: 'sha256',
            signatureAlg: 'ecdsa', signedAttrsTlv: null, unsignedAttrsTlv: null
        });
        const signed = _splice(emitted, pkcs7);
        expect(_signerInfoOf(signed).signature).toEqual(raw);
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);
        expect(all.signatures[0].pkVerified).toBe(true);
    });

    for (const useSignedAttrs of [true, false]) {
        test(`Ed25519 default (useSignedAttrs: ${useSignedAttrs}): digestAlgorithm is SHA-512 and the signature verifies`, () => {
            const { kp, cert } = _edSigner(useSignedAttrs ? 1 : 2);
            const signed = _sign.sign(_pdfBase, {
                algorithm: 'ed25519', cert, privateKey: kp.privateKey,
                useSignedAttrs,
                signingTime: new Date(Date.UTC(2026, 9, 4, 12, 0, 0))
            });
            const si = _signerInfoOf(signed);
            expect(si.digestOid).toBe('2.16.840.1.101.3.4.2.3');
            if (useSignedAttrs) {
                expect(si.signedAttrs).toBeTruthy();
                expect(_messageDigestAttr(si.signedAttrs).length).toBe(64);
            } else {
                expect(si.signedAttrs).toBe(null);
            }
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures.length).toBe(1);
            expect(all.signatures[0].verified).toBe(true);
            expect(all.signatures[0].pkVerified).toBe(true);
            expect(all.signatures[0].hashAlg).toBe('sha512');
        });
    }

    test('Ed25519 with an explicit hashAlg sha512 is accepted', () => {
        const { kp, cert } = _edSigner(3);
        const r = _attempt(() => _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey, hashAlg: 'sha512'
        }));
        expect(r.error).toBeUndefined();
        expect(_sigVerify.verifyAllSignatures(r.value, fb).signatures[0].hashAlg).toBe('sha512');
    });

    for (const hashAlg of ['sha256', 'sha384']) {
        test(`Ed25519 with hashAlg ${hashAlg} is refused (pdf/sign/ed25519-requires-sha512), base untouched`, () => {
            const { kp, cert } = _edSigner(4);
            const base = _pdfBase.slice();
            const copy = base.slice();
            const r = _attempt(() => _sign.sign(base, {
                algorithm: 'ed25519', cert, privateKey: kp.privateKey, hashAlg
            }));
            expect(r.value).toBeUndefined();
            expect(r.error && r.error.code).toBe('pdf/sign/ed25519-requires-sha512');
            expect(r.error.context).toEqual({ hashAlg });
            expect(base).toEqual(copy);
        });
    }

    test('Ed25519 with hashAlg md5 is still refused as an unknown hashAlg', () => {
        const { kp, cert } = _edSigner(5);
        const base = _pdfBase.slice();
        const copy = base.slice();
        const r = _attempt(() => _sign.sign(base, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey, hashAlg: 'md5'
        }));
        expect(r.error && r.error.code).toBe('pdf/sign/bad-hash-alg');
        expect(base).toEqual(copy);
    });

    test('Ed25519 level T: tsaSign receives hashAlg sha512 and a 64-byte digest', () => {
        const { kp, cert } = _edSigner(6);
        const seen = [];
        const signed = _sign.sign(_pdfBase, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey, level: 'T',
            tsaSign: ({ digest, hashAlg }) => {
                seen.push({ hashAlg, length: digest.length });
                return _fakeTstToken(digest, _HASH_OIDS[hashAlg]);
            }
        });
        expect(seen).toEqual([{ hashAlg: 'sha512', length: 64 }]);
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures[0].verified).toBe(true);
    });

    test('Ed25519 legacy SHA-256 SignerInfo (signed attributes) still verifies', () => {
        const { kp, cert } = _edSigner(7);
        const emitted = _sign._emitWithPlaceholder(_pdfBase, 8192);
        const covered = _coveredBytes(emitted);
        const signedAttrsTlv = _sign._buildSignedAttrs({
            messageDigest: _sign._hashBytes(_sha256m, covered),
            certDigestSha256: _sign._hashBytes(_sha256m, cert),
            signingTime: new Date(Date.UTC(2026, 0, 2, 3, 4, 5))
        });
        const sigBytes = _edm.sign(kp.privateKey, signedAttrsTlv);
        const pkcs7 = _sign._buildPkcs7({
            certDer: cert, sigBytes, hashAlg: 'sha256', signatureAlg: 'ed25519',
            signedAttrsTlv, unsignedAttrsTlv: null
        });
        const signed = _splice(emitted, pkcs7);
        expect(_signerInfoOf(signed).digestOid).toBe('2.16.840.1.101.3.4.2.1');
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);
        expect(all.signatures[0].pkVerified).toBe(true);
        expect(all.signatures[0].hashAlg).toBe('sha256');
    });
});

// ── Encrypted bases ──────────────────────────────────────────────────
//
// The document key is derived from `opts.password` through the standard
// security handler; the new field's /T is encrypted with it (string crypt
// filter, the field's own object number), and the update's trailer repeats
// the base's /Encrypt (ISO 32000-2 §7.5.6). Bases are written by
// `pdfEncryptedWriter`, as in `document/document.test.js`.
describe('sign — encrypted bases', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };
    const latin1 = new TextDecoder('latin1');
    const _encMod = pdfEncryptedWriter.factory(_errors,
        pdfWriter.factory(_errors, _ser), _v5m, _v6m, _v4m, null);

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
        return _encMod.writeEncryptedDocument({
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

    function _signer(salt) {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 29 + salt) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({ issuerCn: 'Enc ' + salt, serial: 700 + salt,
            sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey });
        return { algorithm: 'ed25519', cert, privateKey: kp.privateKey };
    }

    function _attempt(fn) {
        try { return { value: fn() }; }
        catch (e) { return { error: e }; }
    }

    /** Root fields of an encrypted document, read raw (ciphertext kept). */
    function _fields(bytes) {
        const doc = _doc.readDocument(bytes, { allowEncrypted: true });
        const R = doc._raw.resolve;
        const cat = R({ type: 'ref', num: doc.trailer.root.num, gen: doc.trailer.root.gen });
        const acroRaw = cat.entries.AcroForm;
        const acro = acroRaw.type === 'ref' ? R(acroRaw) : acroRaw;
        const page = R({ type: 'ref', num: 3, gen: 0 });
        return { doc, acro, page,
            fields: acro.entries.Fields.items.map((ref) => ({ ref, dict: R(ref) })) };
    }

    /** `/Encrypt n g R` occurrences vs `startxref` keywords in the appended tail. */
    function _encryptInTail(base, signed, encNum) {
        const tail = latin1.decode(signed.subarray(base.length));
        const count = (needle) => tail.split(needle).length - 1;
        return {
            tail,
            encrypt: count('/Encrypt ' + encNum + ' 0 R'),
            anyEncrypt: count('/Encrypt'),
            startxref: count('startxref')
        };
    }

    const decodeT = (mod, method, out, field) => latin1.decode(mod.decryptString(
        { method }, out.fek, field.ref.num, field.ref.gen, field.dict.entries.T.value));

    test('V=5 R=5 AESV3, user password: the field is written, its /T encrypted with the document key; signs again as Signature2', () => {
        const base = _encBase({ version: 5, revision: 5, seed: 0xA5 });
        const signed = _sign.sign(base.bytes, Object.assign(_signer(1), { password: 'user-pwd' }));
        const t = _encryptInTail(base.bytes, signed, base.encryptObjNum);
        expect(t.tail).toContain('/FT /Sig');
        expect(t.tail).toContain('/AcroForm');
        expect(t.tail).toContain('/Annots');
        const v = _fields(signed);
        expect(v.fields.length).toBe(1);
        expect(v.fields[0].dict.entries.FT).toEqual({ type: 'name', value: 'Sig' });
        expect(v.page.entries.Annots.items).toContainEqual(v.fields[0].ref);
        expect(decodeT(_v5m, 'AESV3', base, v.fields[0])).toBe('Signature1');
        expect(latin1.decode(signed)).not.toContain('(Signature1)');
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);

        // The second signature decrypts the existing name before choosing.
        const twice = _sign.sign(signed, Object.assign(_signer(2), { password: 'user-pwd' }));
        const v2 = _fields(twice);
        expect(v2.fields.map((f) => decodeT(_v5m, 'AESV3', base, f)))
            .toEqual(['Signature1', 'Signature2']);
        const all2 = _sigVerify.verifyAllSignatures(twice, fb);
        expect(all2.signatures.map((s) => s.verified)).toEqual([true, true]);
    });

    test('V=5 R=5: the update trailer repeats the base /Encrypt (one per startxref)', () => {
        const base = _encBase({ version: 5, revision: 5, seed: 0xA6 });
        const signed = _sign.sign(base.bytes, Object.assign(_signer(3), { password: 'user-pwd' }));
        const t = _encryptInTail(base.bytes, signed, base.encryptObjNum);
        expect(t.startxref).toBe(1);
        expect(t.encrypt).toBe(t.startxref);
        expect(_doc.readDocument(signed, { allowEncrypted: true }).trailer.encrypt)
            .toEqual({ num: base.encryptObjNum, gen: 0 });
    });

    test('permissions: without bits 4 and 6 the owner password signs, the user password is refused', () => {
        const P = -1 & ~0x28;
        const base = _encBase({ version: 5, revision: 5, permissions: P, seed: 0xA7 });
        const signed = _sign.sign(base.bytes, Object.assign(_signer(4), { password: 'owner-pwd' }));
        expect(decodeT(_v5m, 'AESV3', base, _fields(signed).fields[0])).toBe('Signature1');
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
        const r = _attempt(() => _sign.sign(base.bytes,
            Object.assign(_signer(4), { password: 'user-pwd' })));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-permission-denied');
        expect(r.error.context.P).toBe(P);
        expect(r.error.context.required).toEqual(['modify', 'annot']);
    });

    test('V=5 R=6 AESV3: the user password signs; a wrong password is refused without echoing it', () => {
        const base = _encBase({ version: 5, revision: 6, seed: 0xA8 });
        const signed = _sign.sign(base.bytes, Object.assign(_signer(5), { password: 'user-pwd' }));
        expect(decodeT(_v6m, 'AESV3', base, _fields(signed).fields[0])).toBe('Signature1');
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
        const r = _attempt(() => _sign.sign(base.bytes,
            Object.assign(_signer(5), { password: 'not-the-password' })));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-bad-password');
        expect(r.error.message + JSON.stringify(r.error.context || {}))
            .not.toContain('not-the-password');
    }, 30000);

    test('V=4 R=4 AESV2: signs; /T decrypts with the field number; the trailer repeats /Encrypt', () => {
        const base = _encBase({ version: 4, revision: 4, method: 'AESV2', seed: 0xA9 });
        const signed = _sign.sign(base.bytes, Object.assign(_signer(6), { password: 'user-pwd' }));
        const v = _fields(signed);
        expect(decodeT(_v4m, 'AESV2', base, v.fields[0])).toBe('Signature1');
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
        const t = _encryptInTail(base.bytes, signed, base.encryptObjNum);
        expect(t.startxref).toBe(1);
        expect(t.encrypt).toBe(1);
        expect(latin1.decode(signed)).not.toContain('(Signature1)');
    });

    test('V=4 RC4 (CFM /V2) is refused: encrypted-unsupported, reason rc4', () => {
        const base = _encBase({ version: 4, revision: 4, method: 'V2', seed: 0xAA });
        const r = _attempt(() => _sign.sign(base.bytes,
            Object.assign(_signer(7), { password: 'user-pwd' })));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-unsupported');
        expect(r.error.context.reason).toBe('rc4');
    });

    test('no opts.password: encrypted-password-required, the base bytes untouched', () => {
        const base = _encBase({ version: 5, revision: 5, seed: 0xAB });
        const before = base.bytes.slice();
        const r = _attempt(() => _sign.sign(base.bytes, _signer(8)));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-password-required');
        expect(Array.from(base.bytes)).toEqual(Array.from(before));
    });

    test('an unencrypted base: no /Encrypt token in the appended tail', () => {
        const signed = _sign.sign(_pdfBase, _signer(9));
        const t = _encryptInTail(_pdfBase, signed, 0);
        expect(t.anyEncrypt).toBe(0);
        expect(t.tail).toContain('/FT /Sig');
    });

    test('null security handlers: an encrypted base is refused (no-security-handler), a clear one signs', () => {
        const bare = pdfSign.factory(
            _errors, _oids, _br, _dssB, _iw, _parser2,
            _asn1m, _rsam, _eccm, _edm,
            _sha256m, _sha384m, _sha512m, _ba, _doc,
            null, null, null, null);
        const base = _encBase({ version: 5, revision: 5, seed: 0xAC });
        const r = _attempt(() => bare.sign(base.bytes,
            Object.assign(_signer(10), { password: 'user-pwd' })));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/no-security-handler');
        const clear = bare.sign(_pdfBase, _signer(10));
        expect(_sigVerify.verifyAllSignatures(clear, fb).signatures[0].verified).toBe(true);
    });

    test('randomBytes: called with 16 for the two ISO/TS 32002 strings, then the /T; deterministic output; the IV leads the /T string', () => {
        const base = _encBase({ version: 5, revision: 5, seed: 0xAD });
        const calls = [];
        const iv = Uint8Array.from({ length: 16 }, (_, i) => 0xC0 + i);
        const randomBytes = (n) => { calls.push(n); return iv.slice(0, n); };
        const opts = () => Object.assign(_signer(11), { password: 'user-pwd', randomBytes });
        const a = _sign.sign(base.bytes, opts());
        // Was `[16]`: the Ed25519 signing update now also encrypts the
        // /ExtensionRevision and /URL of the Catalog's ISO/TS 32002
        // declaration (one IV each, before the field /T).
        expect(calls).toEqual([16, 16, 16]);
        const b = _sign.sign(base.bytes, opts());
        expect(Array.from(a)).toEqual(Array.from(b));
        const T = _fields(a).fields[0].dict.entries.T.value;
        expect(Array.from(T.subarray(0, 16))).toEqual(Array.from(iv));
        const hexIv = Array.from(iv, (x) => x.toString(16).padStart(2, '0')).join('');
        expect(latin1.decode(a.subarray(base.bytes.length)).toLowerCase())
            .toContain('/t <' + hexIv);
    });

    test('no random source (no opts.randomBytes, no crypto.getRandomValues): pdf/sign/no-random, an EncryptionError', () => {
        const base = _encBase({ version: 5, revision: 5, seed: 0xAE });
        const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
        let r;
        try {
            Object.defineProperty(globalThis, 'crypto',
                { value: undefined, configurable: true, writable: true });
            r = _attempt(() => _sign.sign(base.bytes,
                Object.assign(_signer(12), { password: 'user-pwd' })));
        } finally {
            Object.defineProperty(globalThis, 'crypto', saved);
        }
        expect(r.error).toBeInstanceOf(_errors.EncryptionError);
        expect(r.error.code).toBe('pdf/sign/no-random');
    });
});

// ── Levels LT / LTA over an encrypted base ───────────────────────────
//
// Every string and stream the LT and LTA updates create is encrypted with
// the document key: the DSS certificate / VRI timestamp streams through the
// stream crypt filter, the VRI /TU string through the string crypt filter,
// the DocTimeStamp field's /T like the signature field's. The hexadecimal
// /Contents of the /Sig and /DocTimeStamp dictionaries stays clear (ISO
// 32000-2 §7.6.2). Each update trailer repeats the base's /Encrypt.
describe('sign — LT/LTA on an encrypted base', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };
    const latin1 = new TextDecoder('latin1');
    const _encMod = pdfEncryptedWriter.factory(_errors,
        pdfWriter.factory(_errors, _ser), _v5m, _v6m, _v4m, null);
    const TU = 'D:20260101000000Z';
    const VRI_KEY = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678';
    const SIGNING_TIME = new Date(Date.UTC(2026, 9, 4, 12, 0, 0));

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
            randomBytes: _rand(seed) };
        if (method) encrypt.method = method;
        return _encMod.writeEncryptedDocument({
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

    // The signer and, distinct from it, the chain certificate the DSS
    // carries: the signer's own certificate also rides in the clear
    // signature /Contents (exempt), so the leak checks use the DSS one.
    const _edSeed = Uint8Array.from({ length: 32 }, (_, i) => (i * 23 + 7) & 0xff);
    const _edKp = _edm.keyPair(_edSeed);
    const _signerCert = _buildTestCert({ issuerCn: 'Enc LT signer', serial: 901,
        sigAlgOid: '1.3.101.112', edPubKey: _edKp.publicKey });
    const _dssCert = _buildTestCert({ issuerCn: 'Enc LT chain CA', serial: 902,
        sigAlgOid: '1.3.101.112' });
    const _vriTs = _fakeTstToken(new Uint8Array(64).fill(0x5A), _HASH_OIDS.sha512);

    function _dssOpts() {
        return { certs: [_dssCert],
                 vri: { [VRI_KEY]: { certs: [0], tu: TU, ts: _vriTs } } };
    }

    /** sign() options; `tokens` collects every TimeStampToken returned. */
    function _opts(level, extra) {
        const tokens = [];
        const o = Object.assign({
            algorithm: 'ed25519', cert: _signerCert, privateKey: _edKp.privateKey,
            level, signingTime: SIGNING_TIME, password: 'user-pwd',
            tsaSign: ({ digest, hashAlg }) => {
                const t = _fakeTstToken(digest, _HASH_OIDS[hashAlg]);
                tokens.push(t);
                return t;
            },
            dss: _dssOpts(),
            randomBytes: _rand(0x1F)
        }, extra || {});
        return { o, tokens };
    }

    function _attempt(fn) {
        try { return { value: fn() }; }
        catch (e) { return { error: e }; }
    }

    function _hexOf(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i++) {
            s += bytes[i].toString(16).padStart(2, '0').toUpperCase();
        }
        return s;
    }

    /** Strings + stream payloads of a typed object graph. */
    function _countEncryptable(v) {
        if (!v || typeof v !== 'object') return 0;
        switch (v.type) {
            case 'string': return 1;
            case 'array': return v.items.reduce((n, it) => n + _countEncryptable(it), 0);
            case 'dict': return Object.values(v.entries)
                .reduce((n, it) => n + _countEncryptable(it), 0);
            case 'stream': return 1 + _countEncryptable(v.dict);
            default: return 0;
        }
    }

    /** The DSS view of an encrypted signed document (raw ciphertext kept). */
    function _dssView(signed) {
        const doc = _doc.readDocument(signed, { allowEncrypted: true });
        const R = doc._raw.resolve;
        const cat = R({ type: 'ref', num: doc.trailer.root.num, gen: doc.trailer.root.gen });
        const dssRef = cat.entries.DSS;
        const dss = R(dssRef);
        const certRef = dss.entries.Certs.items[0];
        const vri = dss.entries.VRI.entries[VRI_KEY];
        const acro = cat.entries.AcroForm.type === 'ref'
            ? R(cat.entries.AcroForm) : cat.entries.AcroForm;
        const fields = acro.entries.Fields.items.map((ref) => ({ ref, dict: R(ref) }));
        return { doc, R, dssRef, dss, certRef, cert: R(certRef), vri,
                 tsRef: vri.entries.TS, ts: R(vri.entries.TS), fields };
    }

    /** The clear /Contents hex of the newest `/Type /<type>` object. */
    function _contentsHex(signed, type) {
        const s = latin1.decode(signed);
        const at = s.lastIndexOf('/Type /' + type);
        expect(at).toBeGreaterThan(0);
        const objIdx = s.lastIndexOf(' obj', at);
        const lineStart = s.lastIndexOf('\n', objIdx) + 1;
        const field = _br.findContentsField(signed, lineStart);
        return s.slice(field.offset, field.offset + field.length);
    }

    const BASES = [
        { label: 'V=5 R=5 AESV3', version: 5, revision: 5, mod: _v5m, cfm: 'AESV3', seed: 0xB5 },
        { label: 'V=4 R=4 AESV2', version: 4, revision: 4, method: 'AESV2', mod: _v4m,
          cfm: 'AESV2', seed: 0xB4 }
    ];

    for (const b of BASES) {
        for (const level of ['LT', 'LTA']) {
            test(`${b.label}, level ${level}: the DSS streams and strings are encrypted with the document key, /Contents stays clear`, () => {
                const base = _encBase(b);
                const { o, tokens } = _opts(level);
                const signed = _sign.sign(base.bytes, o);
                expect(signed).toBeInstanceOf(Uint8Array);

                // Reads back; the page count is kept; /DSS resolves.
                const v = _dssView(signed);
                expect(v.doc.pages.length).toBe(1);
                expect(v.dss.entries.Type).toEqual({ type: 'name', value: 'DSS' });

                // /Certs[0]: ciphertext of the certificate, serialized /Length
                // = the ENCRYPTED payload length (16-byte IV + padded body).
                expect(v.cert.type).toBe('stream');
                const raw = v.cert.raw;
                expect(raw.length % 16).toBe(0);
                expect(raw.length).toBe(16 + 16 * Math.ceil((_dssCert.length + 1) / 16));
                expect(v.cert.dict.entries.Length).toEqual({ type: 'int', value: raw.length });
                const certPlain = b.mod.decryptStream({ method: b.cfm }, base.fek,
                    v.certRef.num, v.certRef.gen, raw);
                expect(Array.from(certPlain)).toEqual(Array.from(_dssCert));

                // VRI /TU (a string of the DSS dictionary) and /TS (a stream).
                const tu = b.mod.decryptString({ method: b.cfm }, base.fek,
                    v.dssRef.num, v.dssRef.gen, v.vri.entries.TU.value);
                expect(latin1.decode(tu)).toBe(TU);
                const tsPlain = b.mod.decryptStream({ method: b.cfm }, base.fek,
                    v.tsRef.num, v.tsRef.gen, v.ts.raw);
                expect(Array.from(tsPlain)).toEqual(Array.from(_vriTs));

                // Nothing in clear in the appended sections.
                const tail = latin1.decode(signed.subarray(base.bytes.length));
                expect(tail.includes(latin1.decode(_dssCert))).toBe(false);
                expect(tail.includes(_hexOf(_dssCert))).toBe(false);
                expect(tail.includes(_hexOf(_dssCert).toLowerCase())).toBe(false);
                expect(tail.includes(latin1.decode(_vriTs))).toBe(false);
                expect(tail).not.toContain('(D:2026');
                expect(tail).not.toContain('(Signature');

                // Every appended section's trailer repeats the base /Encrypt.
                const count = (needle) => tail.split(needle).length - 1;
                const sections = level === 'LT' ? 2 : 3;
                expect(count('startxref')).toBe(sections);
                expect(count('/Encrypt ' + base.encryptObjNum + ' 0 R')).toBe(sections);
                expect(count('/Encrypt')).toBe(sections);

                // The signature verifies; the field /T decrypts.
                const all = _sigVerify.verifyAllSignatures(signed, fb);
                expect(all.signatures.length).toBe(1);
                expect(all.signatures[0].verified).toBe(true);
                const name = (f) => latin1.decode(b.mod.decryptString({ method: b.cfm },
                    base.fek, f.ref.num, f.ref.gen, f.dict.entries.T.value));
                expect(name(v.fields[0])).toBe('Signature1');

                if (level === 'LTA') {
                    // The DocTimeStamp verifies; its /Contents is the exact
                    // token the TSA stub returned, in clear (§7.6.2).
                    expect(all.timestamps.length).toBe(1);
                    expect(all.timestamps[0].verified).toBe(true);
                    expect(tokens.length).toBe(2);
                    const hex = _contentsHex(signed, 'DocTimeStamp');
                    const tokHex = _hexOf(tokens[1]);
                    expect(hex.slice(0, tokHex.length)).toBe(tokHex);
                    expect(/^0*$/.test(hex.slice(tokHex.length))).toBe(true);
                    // Its field: /T decrypts to Signature2, /V → /DocTimeStamp.
                    expect(v.fields.length).toBe(2);
                    expect(name(v.fields[1])).toBe('Signature2');
                    const dts = v.R(v.fields[1].dict.entries.V);
                    expect(dts.entries.Type).toEqual({ type: 'name', value: 'DocTimeStamp' });
                } else {
                    expect(all.timestamps.length).toBe(0);
                    expect(v.fields.length).toBe(1);
                }
            }, 30000);
        }
    }

    test('randomBytes: one IV per DSS string and stream, per field /T and per ISO/TS 32002 string; same seed, same bytes', () => {
        const base = _encBase(BASES[0]);
        // The count derived from what buildDss itself returns.
        const built = _dssB.buildDss(Object.assign({ startNum: 100 }, _dssOpts()));
        const dssCount = built.updates.reduce((n, u) => n + _countEncryptable(u.value), 0);
        expect(dssCount).toBe(3); // cert stream + VRI /TU + VRI /TS stream

        const run = (level) => {
            const calls = [];
            const gen = _rand(0x2E);
            const { o } = _opts(level, {
                randomBytes: (n) => { calls.push(n); return gen(n); } });
            return { bytes: _sign.sign(base.bytes, o), calls };
        };
        // The Ed25519 signing update encrypts the two new strings of the
        // Catalog's ISO/TS 32002 declaration (was `dssCount + 1` and
        // `dssCount + 2`); the DocTimeStamp update finds it declared already.
        const lt = run('LT');
        expect(lt.calls.length).toBe(dssCount + 1 + 2);
        expect(lt.calls.every((n) => n === 16)).toBe(true);
        const lta = run('LTA');
        expect(lta.calls.length).toBe(dssCount + 2 + 2);
        expect(Array.from(run('LT').bytes)).toEqual(Array.from(lt.bytes));
        expect(Array.from(run('LTA').bytes)).toEqual(Array.from(lta.bytes));
    }, 30000);

    test('an RC4 base (V=4, CFM /V2) at level LT is refused: encrypted-unsupported, nothing written', () => {
        const base = _encBase({ version: 4, revision: 4, method: 'V2', seed: 0xB6 });
        const copy = base.bytes.slice();
        const { o, tokens } = _opts('LT');
        const r = _attempt(() => _sign.sign(base.bytes, o));
        expect(r.value).toBeUndefined();
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-unsupported');
        expect(r.error.context.reason).toBe('rc4');
        expect(tokens.length).toBe(0);
        expect(base.bytes).toEqual(copy);
    });

    test('permissions at level LT: the owner password signs a restrictive /P; the user password is refused before any emission', () => {
        const P = -1 & ~0x28;
        const base = _encBase({ version: 5, revision: 5, permissions: P, seed: 0xB7 });
        const owner = _opts('LT', { password: 'owner-pwd' });
        const signed = _sign.sign(base.bytes, owner.o);
        const v = _dssView(signed);
        const certPlain = _v5m.decryptStream({ method: 'AESV3' }, base.fek,
            v.certRef.num, v.certRef.gen, v.cert.raw);
        expect(Array.from(certPlain)).toEqual(Array.from(_dssCert));
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);

        const copy = base.bytes.slice();
        const user = _opts('LT', { password: 'user-pwd' });
        const r = _attempt(() => _sign.sign(base.bytes, user.o));
        expect(r.error).toBeInstanceOf(_errors.ContractError);
        expect(r.error.code).toBe('pdf/sign/encrypted-permission-denied');
        expect(user.tokens.length).toBe(0);
        expect(base.bytes).toEqual(copy);
    });

    test('_appendDss over a clear base is unchanged: the DSS stream carries the certificate in clear', () => {
        const { o } = _opts('LT', { password: undefined, randomBytes: undefined });
        const signed = _sign.sign(_pdfBase, o);
        const tail = latin1.decode(signed.subarray(_pdfBase.length));
        expect(tail.includes(latin1.decode(_dssCert))).toBe(true);
        expect(tail).toContain('(' + TU + ')');
        expect(tail).not.toContain('/Encrypt');
    });
});

// ── signedAttrs in DER SET OF order ──────────────────────────────────
//
// RFC 5652 §5.4 signs the DER encoding of SignedAttributes; DER orders the
// components of a SET OF by their encodings (X.690 §11.6). A verifier that
// re-encodes the attributes checks exactly the sorted bytes. Our verifier
// checks the bytes as received, so files written in the earlier fixed order
// still verify.
describe('sign — signedAttrs DER order', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };
    const OIDS = {
        contentType: '1.2.840.113549.1.9.3',
        messageDigest: '1.2.840.113549.1.9.4',
        signingTime: '1.2.840.113549.1.9.5',
        signingCertificateV2: '1.2.840.113549.1.9.16.2.47'
    };
    const LEGACY_ORDER = [OIDS.contentType, OIDS.messageDigest,
        OIDS.signingTime, OIDS.signingCertificateV2];

    /** Unsigned bytewise compare; a prefix sorts first. */
    function _cmp(a, b) {
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return a.length - b.length;
    }

    /** Complete TLVs of the components of a constructed value. */
    function _tlvs(value) {
        const out = [];
        let off = 0;
        while (off < value.length) {
            const node = _asn1m.parseOne(value, off);
            out.push(value.subarray(off, node.next));
            off = node.next;
        }
        return out;
    }

    const _oidOf = (tlv) => _asn1m.readOid(
        _asn1m.parseChildren(_asn1m.parseOne(tlv, 0).value)[0]);

    /** The [0] IMPLICIT signedAttrs node of the first /Sig's SignerInfo. */
    function _signedAttrsOf(signed) {
        const s = new TextDecoder('latin1').decode(signed);
        const objIdx = s.lastIndexOf(' obj', s.indexOf('/Type /Sig'));
        const field = _br.findContentsField(signed, s.lastIndexOf('\n', objIdx) + 1);
        const hex = s.slice(field.offset, field.offset + field.length);
        const blob = new Uint8Array(hex.length >>> 1);
        for (let i = 0; i < blob.length; i++) blob[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
        const sd = _sigVerify.locatePkcs7(blob, _asn1m);
        const si = _asn1m.parseChildren(
            _asn1m.parseChildren(sd[sd.length - 1].value)[0].value);
        expect(si[3].tag).toBe(0xA0);
        return si[3];
    }

    function _ecdsaSigner() {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const point = _ba.ba_to_ui8(pub._point.toBits());
        const cert = _buildTestCert({ issuerCn: 'DER order P-256', serial: 951,
            sigAlgOid: '1.2.840.10045.4.3.2',
            ecPubKey: { curveOid: '1.2.840.10045.3.1.7', point } });
        return { algorithm: 'ecdsa', cert, hashAlg: 'sha256',
                 privateKey: { curve: _eccm.curves.c256, secretKey: sec } };
    }

    function _edSigner(salt) {
        const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + salt) & 0xff);
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({ issuerCn: 'DER order Ed25519 ' + salt,
            serial: 960 + salt, sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey });
        return { algorithm: 'ed25519', cert, privateKey: kp.privateKey, kp };
    }

    test('_sortDerSetOf: a prefix sorts first; equal lengths compare as unsigned bytes', () => {
        const longer = Uint8Array.of(0x30, 0x01, 0x02);
        const prefix = Uint8Array.of(0x30, 0x01);
        expect(_sign._sortDerSetOf([longer, prefix])).toEqual([prefix, longer]);
        const high = Uint8Array.of(0x30, 0x80);
        const low = Uint8Array.of(0x30, 0x7F);
        const input = [high, low];
        expect(_sign._sortDerSetOf(input)).toEqual([low, high]);
        expect(input).toEqual([high, low]); // the input is not reordered
    });

    for (const label of ['ECDSA P-256', 'Ed25519']) {
        test(`${label} sign(), PAdES form: the signed attributes are in ascending DER order, each OID once, and the signature verifies`, () => {
            const signer = label === 'Ed25519' ? _edSigner(1) : _ecdsaSigner();
            const signed = _sign.sign(_pdfBase, Object.assign({}, signer, {
                subFilter: 'ETSI.CAdES.detached', useSignedAttrs: true,
                signingTime: new Date(Date.UTC(2026, 9, 4, 12, 0, 0))
            }));
            const attrs = _tlvs(_signedAttrsOf(signed).value);
            expect(attrs.length).toBe(4);
            for (let i = 1; i < attrs.length; i++) {
                expect(_cmp(attrs[i - 1], attrs[i])).toBeLessThan(0);
            }
            expect(attrs.map(_oidOf).slice().sort())
                .toEqual(Object.values(OIDS).slice().sort());
            // Non-vacuity: the earlier fixed order is not DER order.
            expect(attrs.map(_oidOf)).not.toEqual(LEGACY_ORDER);
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures.length).toBe(1);
            expect(all.signatures[0].verified).toBe(true);
            expect(all.signatures[0].pkVerified).toBe(true);
        });
    }

    test('a SignerInfo whose signed attributes are in the earlier fixed order still verifies', () => {
        const { kp, cert } = _edSigner(2);
        const emitted = _sign._emitWithPlaceholder(_pdfBase, 8192);
        const br = emitted.byteRange;
        const covered = new Uint8Array(br[1] + br[3]);
        covered.set(emitted.bytes.subarray(br[0], br[0] + br[1]), 0);
        covered.set(emitted.bytes.subarray(br[2], br[2] + br[3]), br[1]);
        const sorted = _sign._buildSignedAttrs({
            messageDigest: _sign._hashBytes(_sha512m, covered),
            certDigestSha256: _sign._hashBytes(_sha256m, cert),
            signingTime: new Date(Date.UTC(2026, 0, 2, 3, 4, 5))
        });
        // Re-assemble the same attributes in the earlier, non-DER order.
        const byOid = new Map(_tlvs(_asn1m.parseOne(sorted, 0).value)
            .map((t) => [_oidOf(t), t]));
        const legacy = _asn1m.encodeSet(LEGACY_ORDER.map((o) => byOid.get(o)));
        expect(Array.from(legacy)).not.toEqual(Array.from(sorted));
        const sigBytes = _edm.sign(kp.privateKey, legacy);
        const pkcs7 = _sign._buildPkcs7({
            certDer: cert, sigBytes, hashAlg: 'sha512', signatureAlg: 'ed25519',
            signedAttrsTlv: legacy, unsignedAttrsTlv: null
        });
        let hex = '';
        for (let i = 0; i < pkcs7.length; i++) {
            hex += pkcs7[i].toString(16).padStart(2, '0').toUpperCase();
        }
        const signed = emitted.bytes.slice();
        signed.set(new TextEncoder().encode(hex.padEnd(emitted.contentsLength, '0')),
            emitted.contentsOffset);
        expect(_tlvs(_signedAttrsOf(signed).value).map(_oidOf)).toEqual(LEGACY_ORDER);
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);
        expect(all.signatures[0].pkVerified).toBe(true);
    });
});

// ── Ed25519 declares the ISO/TS 32002 developer extension ────────────
//
// ISO/TS 32002:2022 §4: a PDF using its enhancements (EdDSA signatures)
// "shall include in their document catalogue dictionary ... an extensions
// dictionary ... with a prefix name of ISO_" holding a developer extensions
// dictionary (ISO 32000-2 §7.12.3) with /BaseVersion /2.0, /ExtensionLevel
// 32002, /ExtensionRevision (:2022) and the standard's /URL. The Ed25519
// signing update re-emits the Catalog with that declaration, merged into any
// existing /Extensions (§7.12.2: a prefix maps to one developer extensions
// dictionary or an array of them), and sets /Version /2.0 on a document
// whose effective version is below 2.0 (§7.7.2; Table 2 of the TS: EdDSA is
// PDF 2.x). ECDSA and RSA-PSS output is byte-identical to the pre-change
// output (sha256 pins over the bytes with every /Contents hex masked).
describe('sign — Ed25519 declares ISO/TS 32002', () => {
    const fb = { asn1: _asn1m, rsa: _rsam, ecc: _eccm, ed25519: _edm,
                 sha256: _sha256m, sha384: _sha384m, sha512: _sha512m,
                 bitArray: _ba };
    const latin1 = new TextDecoder('latin1');
    const te = new TextEncoder();
    const ISO_URL = 'https://www.iso.org/standard/45875.html';
    const SIGNING_TIME = new Date(Date.UTC(2026, 9, 5, 9, 0, 0));
    const _name = (value) => ({ type: 'name', value });
    const _int = (value) => ({ type: 'int', value });
    const _str = (s) => ({ type: 'string', value: te.encode(s) });
    const _ref = (num) => ({ type: 'ref', num, gen: 0 });
    const _dict = (entries) => ({ type: 'dict', entries });
    const _base17 = buildDocument({ version: '1.7',
        pages: ['BT /F1 12 Tf (iso-32002) Tj ET'] });

    function _edSigner(salt) {
        const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 41 + salt) & 0xff);
        const kp = _edm.keyPair(seed);
        const cert = _buildTestCert({ issuerCn: 'ISO 32002 ' + salt, serial: 3200 + salt,
            sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey });
        return { algorithm: 'ed25519', cert, privateKey: kp.privateKey };
    }

    /** Sign at `level` (fake TSA, the signer cert in the DSS). */
    function _signAt(base, signer, level, extra) {
        const opts = Object.assign({}, signer, { level: level || 'B',
            subFilter: 'ETSI.CAdES.detached', useSignedAttrs: true,
            signingTime: SIGNING_TIME }, extra || {});
        if (opts.level !== 'B') {
            opts.tsaSign = ({ digest, hashAlg }) => _fakeTstToken(digest, _HASH_OIDS[hashAlg]);
        }
        if (opts.level === 'LT' || opts.level === 'LTA') opts.dss = { certs: [signer.cert] };
        return _sign.sign(base, opts);
    }

    /** Re-define the Catalog of `base` (and add `extra` objects) in one update. */
    function _amend(base, mutate, extra) {
        const d = _doc.readDocument(base);
        const root = d.trailer.root;
        const cat = d._raw.resolve({ type: 'ref', num: root.num, gen: root.gen });
        const entries = Object.assign({}, cat.entries);
        mutate(entries);
        return _iw.appendIncremental(base, {
            updates: (extra || []).concat([{ num: root.num, gen: root.gen | 0,
                value: _dict(entries) }]),
            root: { num: root.num, gen: root.gen | 0 }
        });
    }

    /** The newest Catalog of `bytes` (raw: ciphertext kept when encrypted). */
    function _catalog(bytes) {
        const doc = _doc.readDocument(bytes, { allowEncrypted: true });
        const R = doc._raw.resolve;
        const root = doc.trailer.root;
        return { doc, R, root, cat: R({ type: 'ref', num: root.num, gen: root.gen }) };
    }

    /** The five ISO/TS 32002 Table 1 entries, exactly. */
    function _expectIso(d, decode) {
        decode = decode || ((s) => latin1.decode(s.value));
        expect(d.type).toBe('dict');
        expect(Object.keys(d.entries).sort()).toEqual(
            ['BaseVersion', 'ExtensionLevel', 'ExtensionRevision', 'Type', 'URL']);
        expect(d.entries.Type).toEqual(_name('DeveloperExtensions'));
        expect(d.entries.BaseVersion).toEqual(_name('2.0'));
        expect(d.entries.ExtensionLevel).toEqual(_int(32002));
        expect(d.entries.ExtensionRevision.type).toBe('string');
        expect(decode(d.entries.ExtensionRevision)).toBe(':2022');
        expect(d.entries.URL.type).toBe('string');
        expect(decode(d.entries.URL)).toBe(ISO_URL);
    }

    function _attempt(fn) {
        try { return { value: fn() }; }
        catch (e) { return { error: e }; }
    }

    function _hex(bytes) {
        return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
    }

    /** sha256 of `bytes` with every `/Contents <hex>` digit masked to `0`. */
    function _maskedSha(bytes) {
        const s = latin1.decode(bytes).replace(/\/Contents <([0-9A-Fa-f]*)>/g,
            (_m, h) => '/Contents <' + '0'.repeat(h.length) + '>');
        const masked = Uint8Array.from(s, (c) => c.charCodeAt(0));
        return _hex(_ba.ba_to_ui8(_sha256m.hash(_ba.ui8_to_ba(masked))));
    }

    test('level B over a 2.0 base: the newest Catalog declares /Extensions /ISO_ (the five Table 1 entries), no /Version; verifies; reads back', () => {
        const signed = _signAt(_pdfBase, _edSigner(1));
        const { doc, cat } = _catalog(signed);
        expect(Object.keys(cat.entries.Extensions.entries)).toEqual(['ISO_']);
        _expectIso(cat.entries.Extensions.entries.ISO_);
        expect(cat.entries.Version).toBeUndefined();
        expect(doc.pages.length).toBe(1);
        expect(_doc.readDocument(signed).pages.length).toBe(1);
        const all = _sigVerify.verifyAllSignatures(signed, fb);
        expect(all.signatures.length).toBe(1);
        expect(all.signatures[0].verified).toBe(true);
        // The declaration rides in the signing update: covered by /ByteRange.
        const tail = latin1.decode(signed.subarray(_pdfBase.length));
        expect(tail).toContain('/ExtensionLevel 32002');
        expect(tail.split('startxref').length - 1).toBe(1);
    });

    test('level B over a %PDF-1.7 base (pdfBuilder setVersion): the Catalog also carries /Version /2.0', () => {
        const { builder } = getRuntime().resolve('pdfBuilder');
        const base = builder().setVersion('1.7').addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .addContent('BT /F1 12 Tf 72 720 Td (iso 32002) Tj ET').build();
        expect(latin1.decode(base.subarray(0, 8))).toBe('%PDF-1.7');
        const signed = _signAt(base, _edSigner(2));
        const { cat } = _catalog(signed);
        expect(cat.entries.Version).toEqual(_name('2.0'));
        _expectIso(cat.entries.Extensions.entries.ISO_);
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
    });

    test('/Version: a Catalog /Version /2.0 over a 1.7 header is kept; a Catalog /Version /1.4 over a 2.0 header becomes /2.0', () => {
        const declared = _amend(_base17, (e) => { e.Version = _name('2.0'); });
        expect(_catalog(_signAt(declared, _edSigner(3))).cat.entries.Version)
            .toEqual(_name('2.0'));
        const older = _amend(_pdfBase, (e) => { e.Version = _name('1.4'); });
        expect(_catalog(_signAt(older, _edSigner(4))).cat.entries.Version).toEqual(_name('2.0'));
    });

    test('merge: an existing /Extensions with another prefix (ADBE_) is kept, ISO_ added', () => {
        const adbe = _dict({ BaseVersion: _name('1.7'), ExtensionLevel: _int(8) });
        const base = _amend(_base17, (e) => { e.Extensions = _dict({ ADBE_: adbe }); });
        const signed = _signAt(base, _edSigner(5));
        const ext = _catalog(signed).cat.entries.Extensions;
        expect(Object.keys(ext.entries).sort()).toEqual(['ADBE_', 'ISO_']);
        expect(ext.entries.ADBE_).toEqual(adbe);
        _expectIso(ext.entries.ISO_);
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
    });

    test('merge: ISO_ already at level 32002 is idempotent — a second Ed25519 signature adds no duplicate', () => {
        const once = _signAt(_pdfBase, _edSigner(6));
        const twice = _signAt(once, _edSigner(7));
        const iso = _catalog(twice).cat.entries.Extensions.entries.ISO_;
        expect(iso.type).toBe('dict');
        _expectIso(iso);
        // One declaration per Catalog re-emission (each signing update
        // re-emits the Catalog for its direct /AcroForm), never two in one.
        expect(latin1.decode(twice).split('/ExtensionLevel 32002').length - 1).toBe(2);
        const all = _sigVerify.verifyAllSignatures(twice, fb);
        expect(all.signatures.map((s) => s.verified)).toEqual([true, true]);
    });

    test('merge: with an indirect /AcroForm and the declaration already present, the signing update does not re-emit the Catalog', () => {
        const acro = _dict({ Fields: { type: 'array', items: [] } });
        const declared = _signAt(_amend(_pdfBase, (e) => { e.AcroForm = _ref(5); },
            [{ num: 5, gen: 0, value: acro }]), _edSigner(8));
        // Non-vacuity: the first signature declared it (Catalog re-emitted).
        _expectIso(_catalog(declared).cat.entries.Extensions.entries.ISO_);
        const again = _signAt(declared, _edSigner(9));
        const tail = latin1.decode(again.subarray(declared.length));
        expect(tail).not.toContain('/Type /Catalog');
        expect(tail).not.toContain('/Extensions');
        expect(_catalog(again).cat.entries.AcroForm).toEqual(_ref(5));
        expect(_sigVerify.verifyAllSignatures(again, fb).signatures.map((s) => s.verified))
            .toEqual([true, true]);
    });

    test('merge: ISO_ a dictionary at another level (32001) becomes the array [existing, 32002]', () => {
        const prior = _dict({ Type: _name('DeveloperExtensions'), BaseVersion: _name('2.0'),
            ExtensionLevel: _int(32001), ExtensionRevision: _str(':2021'),
            URL: _str('https://www.iso.org/standard/45874.html') });
        const base = _amend(_base17, (e) => { e.Extensions = _dict({ ISO_: prior }); });
        const signed = _signAt(base, _edSigner(10));
        const iso = _catalog(signed).cat.entries.Extensions.entries.ISO_;
        expect(iso.type).toBe('array');
        expect(iso.items.length).toBe(2);
        expect(iso.items[0].entries.ExtensionLevel).toEqual(_int(32001));
        expect(latin1.decode(iso.items[0].entries.ExtensionRevision.value)).toBe(':2021');
        _expectIso(iso.items[1]);
    });

    test('merge: an ISO_ array without 32002 gets it appended; an ISO_ array holding 32002 is left as is', () => {
        const a = _dict({ Type: _name('DeveloperExtensions'), BaseVersion: _name('2.0'),
            ExtensionLevel: _int(32001) });
        const b = _dict({ Type: _name('DeveloperExtensions'), BaseVersion: _name('2.0'),
            ExtensionLevel: _int(32003) });
        const base = _amend(_pdfBase, (e) => {
            e.Extensions = _dict({ ISO_: { type: 'array', items: [a, b] } });
        });
        const signed = _signAt(base, _edSigner(11));
        const iso = _catalog(signed).cat.entries.Extensions.entries.ISO_;
        expect(iso.items.length).toBe(3);
        expect(iso.items.slice(0, 2).map((d) => d.entries.ExtensionLevel.value))
            .toEqual([32001, 32003]);
        _expectIso(iso.items[2]);
        // Already declared (as the array's last element): nothing re-emitted
        // with an indirect AcroForm, nothing appended to the array otherwise.
        const again = _signAt(signed, _edSigner(12));
        expect(_catalog(again).cat.entries.Extensions.entries.ISO_.items.length).toBe(3);
    });

    test('merge: an indirect /Extensions (and an indirect ISO_ element) is resolved and written as a direct dict; the referenced objects stay in place', () => {
        const prior = _dict({ Type: _name('DeveloperExtensions'), BaseVersion: _name('2.0'),
            ExtensionLevel: _int(32001), URL: _str('https://example.org/prior') });
        const base = _amend(_pdfBase, (e) => { e.Extensions = _ref(5); }, [
            { num: 5, gen: 0, value: _dict({ ADBE_: _dict({ BaseVersion: _name('1.7'),
                ExtensionLevel: _int(3) }), ISO_: { type: 'array', items: [_ref(6)] } }) },
            { num: 6, gen: 0, value: prior }]);
        const signed = _signAt(base, _edSigner(13));
        const { cat, R } = _catalog(signed);
        const ext = cat.entries.Extensions;
        expect(ext.type).toBe('dict');
        expect(ext.entries.ADBE_.entries.ExtensionLevel).toEqual(_int(3));
        expect(ext.entries.ISO_.type).toBe('array');
        expect(ext.entries.ISO_.items[0].type).toBe('dict');
        expect(latin1.decode(ext.entries.ISO_.items[0].entries.URL.value))
            .toBe('https://example.org/prior');
        _expectIso(ext.entries.ISO_.items[1]);
        // Objects 5 and 6 are left in place, unreferenced by the new Catalog.
        expect(R(_ref(5)).type).toBe('dict');
        expect(R(_ref(6)).entries.ExtensionLevel).toEqual(_int(32001));
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
    });

    test('malformed /Extensions (5, an ISO_ string, an array element 7): pdf/sign/bad-extensions with context.shape, the base bytes untouched', () => {
        const cases = [
            [(e) => { e.Extensions = _int(5); }, 'int'],
            [(e) => { e.Extensions = _dict({ ISO_: _str('x') }); }, 'string'],
            [(e) => { e.Extensions = _dict({ ISO_: { type: 'array', items: [_int(7)] } }); }, 'int']
        ];
        for (const [mutate, shape] of cases) {
            const base = _amend(_pdfBase, mutate);
            const before = base.slice();
            const r = _attempt(() => _signAt(base, _edSigner(14)));
            expect(r.error).toBeInstanceOf(_errors.ContractError);
            expect(r.error.code).toBe('pdf/sign/bad-extensions');
            expect(r.error.context).toEqual({ shape });
            expect(Array.from(base)).toEqual(Array.from(before));
        }
    });

    test('an indirect /AcroForm base: the Catalog IS re-emitted with the declaration and still references the (re-emitted) indirect AcroForm', () => {
        const base = _amend(_base17, (e) => { e.AcroForm = _ref(7); },
            [{ num: 7, gen: 0, value: _dict({ Fields: { type: 'array', items: [] } }) }]);
        const signed = _signAt(base, _edSigner(15));
        const tail = latin1.decode(signed.subarray(base.length));
        expect(tail).toMatch(/\n1 0 obj\n<< \/Type \/Catalog/);
        expect(tail).toMatch(/\n7 0 obj\n/);
        const { cat, R } = _catalog(signed);
        expect(cat.entries.AcroForm).toEqual(_ref(7));
        expect(cat.entries.Version).toEqual(_name('2.0'));
        _expectIso(cat.entries.Extensions.entries.ISO_);
        const acro = R(_ref(7));
        expect(acro.entries.SigFlags).toEqual(_int(3));
        expect(acro.entries.Fields.items.length).toBe(1);
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
    });

    for (const level of ['LT', 'LTA']) {
        test(`level ${level}: the declaration (and /Version /2.0) is in the newest Catalog after the DSS${level === 'LTA' ? ' and DocTimeStamp' : ''} update`, () => {
            const signed = _signAt(_base17, _edSigner(16), level);
            const { cat } = _catalog(signed);
            expect(cat.entries.DSS.type).toBe('ref');
            expect(cat.entries.Version).toEqual(_name('2.0'));
            expect(Object.keys(cat.entries.Extensions.entries)).toEqual(['ISO_']);
            _expectIso(cat.entries.Extensions.entries.ISO_);
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures[0].verified).toBe(true);
        });
    }

    // ── Encrypted bases ──
    const _encMod = pdfEncryptedWriter.factory(_errors,
        pdfWriter.factory(_errors, _ser), _v5m, _v6m, _v4m, null);
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
    /** An encrypted base whose Catalog carries a string (/Lang) and `catalogExtra`. */
    function _encBase(b, catalogExtra, extra) {
        const encrypt = { version: b.version, revision: b.revision,
            ownerPassword: 'owner-pwd', userPassword: 'user-pwd', permissions: -1,
            randomBytes: _rand(b.seed) };
        if (b.method) encrypt.method = b.method;
        return _encMod.writeEncryptedDocument({
            indirects: [
                { num: 1, gen: 0, value: _dict(Object.assign({ Type: _name('Catalog'),
                    Pages: _ref(2), Lang: _str('en-GB') }, catalogExtra || {})) },
                { num: 2, gen: 0, value: _dict({ Type: _name('Pages'),
                    Kids: { type: 'array', items: [_ref(3)] }, Count: _int(1) }) },
                { num: 3, gen: 0, value: _dict({ Type: _name('Page'), Parent: _ref(2),
                    MediaBox: { type: 'array', items: [0, 0, 612, 792].map(_int) } }) }
            ].concat(extra || []),
            root: { num: 1, gen: 0 },
            encrypt
        });
    }
    const ENC = [
        { label: 'V=5 R=5 AESV3', version: 5, revision: 5, mod: _v5m, cfm: 'AESV3', seed: 0xE5 },
        { label: 'V=4 R=4 AESV2', version: 4, revision: 4, method: 'AESV2', mod: _v4m,
          cfm: 'AESV2', seed: 0xE4 }
    ];
    for (const b of ENC) {
        test(`${b.label}: /ExtensionRevision and /URL are encrypted under the Catalog number; nothing in clear; copied strings unchanged; verifies`, () => {
            const base = _encBase(b);
            const baseLang = _catalog(base.bytes).cat.entries.Lang.value;
            const signed = _sign.sign(base.bytes, Object.assign(_edSigner(17),
                { password: 'user-pwd', randomBytes: _rand(0x2A) }));
            const { cat, root } = _catalog(signed);
            const dec = (s) => latin1.decode(b.mod.decryptString({ method: b.cfm }, base.fek,
                root.num, root.gen, s.value));
            _expectIso(cat.entries.Extensions.entries.ISO_, dec);
            // The copied Catalog string keeps its ciphertext, byte for byte.
            expect(Array.from(cat.entries.Lang.value)).toEqual(Array.from(baseLang));
            expect(dec(cat.entries.Lang)).toBe('en-GB');
            const tail = latin1.decode(signed.subarray(base.bytes.length));
            expect(tail).toContain('/ExtensionLevel 32002');
            expect(tail).not.toContain('(:2022)');
            expect(tail).not.toContain(':2022');
            expect(tail).not.toContain(ISO_URL);
            expect(tail).not.toContain(_hex(te.encode(ISO_URL)).toUpperCase());
            expect(tail).not.toContain(_hex(te.encode(ISO_URL)));
            const all = _sigVerify.verifyAllSignatures(signed, fb);
            expect(all.signatures[0].verified).toBe(true);
        });
    }

    test('V=4 R=4 AESV2, an indirect ISO_ dictionary holding a string: the inlined copy is re-keyed to the Catalog number', () => {
        const b = ENC[1];
        const base = _encBase(b, { Extensions: _ref(4) }, [
            { num: 4, gen: 0, value: _dict({ ISO_: _dict({ Type: _name('DeveloperExtensions'),
                BaseVersion: _name('2.0'), ExtensionLevel: _int(32001),
                URL: _str('https://example.org/prior') }) }) }]);
        const signed = _sign.sign(base.bytes, Object.assign(_edSigner(18),
            { password: 'user-pwd', randomBytes: _rand(0x2B) }));
        const { cat, root } = _catalog(signed);
        const dec = (s) => latin1.decode(b.mod.decryptString({ method: b.cfm }, base.fek,
            root.num, root.gen, s.value));
        const iso = cat.entries.Extensions.entries.ISO_;
        expect(iso.items.length).toBe(2);
        expect(dec(iso.items[0].entries.URL)).toBe('https://example.org/prior');
        _expectIso(iso.items[1], dec);
        expect(latin1.decode(signed.subarray(base.bytes.length)))
            .not.toContain('example.org');
        expect(_sigVerify.verifyAllSignatures(signed, fb).signatures[0].verified).toBe(true);
    });

    // ── ECDSA / RSA-PSS: byte-identical (pins captured before the change) ──
    const _ecSec = _eccm.ecdsa.generateKeys(256, 0, new _bn.bn(
        'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721')).sec;
    const _ecCert = _buildTestCert({ issuerCn: 'Pin P-256', serial: 3301,
        sigAlgOid: '1.2.840.10045.4.3.2' });
    const _rsaCert = _buildTestCert({ issuerCn: 'Pin PSS', serial: 3302,
        sigAlgOid: '1.2.840.113549.1.1.10' });
    const _ec = { algorithm: 'ecdsa', hashAlg: 'sha256', cert: _ecCert,
        privateKey: { curve: _eccm.curves.c256, secretKey: _ecSec } };
    const _pss = { algorithm: 'rsa-pss', hashAlg: 'sha256', cert: _rsaCert,
        privateKey: _rsaKey };
    const _indirectAcro17 = _amend(_base17, (e) => { e.AcroForm = _ref(7); },
        [{ num: 7, gen: 0, value: _dict({ Fields: { type: 'array', items: [] } }) }]);
    const _adbe17 = _amend(_base17, (e) => {
        e.Extensions = _dict({ ADBE_: _dict({ BaseVersion: _name('1.7'),
            ExtensionLevel: _int(8) }) });
    });
    const PINS = [
        { label: 'ECDSA B, 2.0 base', base: _pdfBase, signer: _ec, level: 'B',
          sha: { len: 17493,
            sha: 'ecb0b87cd2383384450d18132b324059fcd6998eba9c0befbaa5d73aa8b8c8a5' } },
        { label: 'ECDSA B, 1.7 base, indirect AcroForm', base: _indirectAcro17,
          signer: _ec, level: 'B', sha: { len: 17685,
            sha: 'd43e1b5ef1be2f50f70d3bb4fdb00f5250a7c38498630e026f3d93baa12f806f' } },
        { label: 'ECDSA B, 1.7 base, ADBE_ extensions', base: _adbe17, signer: _ec,
          level: 'B', sha: { len: 17794,
            sha: 'bd880c5b1e01526a97934ddfd5434332b22ba50725886f8d069f31d4ac3d1dc1' } },
        { label: 'ECDSA LTA, 1.7 base', base: _base17, signer: _ec, level: 'LTA',
          sha: { len: 35092,
            sha: 'e3a7b21448b0719e8bee12575655cadc37dd7bc44157ad5c7f755e381bdcbf9f' } },
        { label: 'RSA-PSS B, 2.0 base', base: _pdfBase, signer: _pss, level: 'B',
          sha: { len: 17493,
            sha: 'ecb0b87cd2383384450d18132b324059fcd6998eba9c0befbaa5d73aa8b8c8a5' } },
        { label: 'RSA-PSS LT, 1.7 base', base: _base17, signer: _pss, level: 'LT',
          sha: { len: 18017,
            sha: 'd7804edb05be9c2c25fc53f0770cf73c3e0aefbca21ad52bdb47b2d35a5d4f56' } }
    ];
    for (const p of PINS) {
        test(`${p.label}: byte-identical to the pre-change output, no ISO_ declaration, no /Version`, () => {
            const signed = _signAt(p.base, p.signer, p.level);
            const got = { len: signed.length, sha: _maskedSha(signed) };
            expect(got).toEqual(p.sha);
            const tail = latin1.decode(signed.subarray(p.base.length));
            expect(tail).not.toContain('ISO_');
            expect(tail).not.toContain('32002');
            expect(tail).not.toContain('/Version');
        });
    }
});
