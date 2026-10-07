// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSignature } from './signature.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
const _asn1Oid = asn1Oid.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const _errors = _pdfErrors_TD1;
const { ParseError, EncryptionError } = _errors;
function _buildParser() {
    const _e = _pdfErrors_TD1;
    const _parserObj = pdfParserObj.factory();
    const _tokenizer = pdfTokenizer.factory(_e, pdfShared.factory());
    return pdfParser.factory(_e, _parserObj, _tokenizer);
}
const _parser = _buildParser();
const { obj } = _parser;
const _sig = pdfSignature.factory(
    _errors, _parser, pdfSigOids.factory(_asn1Oid),
    null, null, null, null, null, null, null, null
);
const { typeSignature, verifySignature, locatePkcs7 } = _sig;
function sigDict(extra) {
    const base = {
        Type: obj.name('Sig'),
        Filter: obj.name('Adobe.PPKLite'),
        SubFilter: obj.name('adbe.pkcs7.detached'),
        Contents: obj.string(new Uint8Array([0x30, 0x80, 0x00, 0x00]), 'hex'),
        ByteRange: obj.array([
            obj.int(0), obj.int(10), obj.int(110), obj.int(20)
        ])
    };
    return obj.dict(Object.assign(base, extra || {}));
}

describe('typeSignature', () => {
    test('extracts required fields', () => {
        const s = typeSignature(sigDict());
        expect(s.kind).toBe('Sig');
        expect(s.filter).toBe('Adobe.PPKLite');
        expect(s.subFilter).toBe('adbe.pkcs7.detached');
        expect(s.byteRange).toEqual([0, 10, 110, 20]);
        expect(s.contents).toBeInstanceOf(Uint8Array);
    });

    test('extracts optional metadata', () => {
        const s = typeSignature(sigDict({
            Name: obj.string(new Uint8Array([0x41])),
            Reason: obj.string(new Uint8Array([0x42])),
            Location: obj.string(new Uint8Array([0x43])),
            ContactInfo: obj.string(new Uint8Array([0x44])),
            V: obj.int(2),
            Prop_AuthTime: obj.int(3600),
            Prop_AuthType: obj.name('PIN')
        }));
        expect(s.v).toBe(2);
        expect(s.propAuthTime).toBe(3600);
        expect(s.propAuthType).toBe('PIN');
    });

    test('supports DocTimeStamp type', () => {
        const d = sigDict({
            Type: obj.name('DocTimeStamp'),
            SubFilter: obj.name('ETSI.RFC3161')
        });
        const s = typeSignature(d);
        expect(s.kind).toBe('DocTimeStamp');
        expect(s.subFilter).toBe('ETSI.RFC3161');
    });

    test('dispatches across all known SubFilters', () => {
        const subs = ['adbe.x509.rsa_sha1', 'adbe.pkcs7.detached',
            'adbe.pkcs7.sha1', 'ETSI.CAdES.detached', 'ETSI.RFC3161'];
        for (const sub of subs) {
            const s = typeSignature(sigDict({ SubFilter: obj.name(sub) }));
            expect(s.subFilter).toBe(sub);
        }
    });

    test('rejects non-dict', () => {
        expect(() => typeSignature(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /Type', () => {
        expect(() => typeSignature(sigDict({ Type: obj.name('Catalog') })))
            .toThrow(ParseError);
    });

    test('rejects missing /Filter', () => {
        const d = sigDict();
        delete d.entries.Filter;
        expect(() => typeSignature(d)).toThrow(ParseError);
    });

    test('rejects unknown /SubFilter', () => {
        expect(() => typeSignature(sigDict({
            SubFilter: obj.name('foo.bar.baz')
        }))).toThrow(ParseError);
    });

    test('rejects bad /ByteRange shape', () => {
        expect(() => typeSignature(sigDict({
            ByteRange: obj.array([obj.int(0), obj.int(10)])
        }))).toThrow(ParseError);
    });

    test('attaches objNum/objGen to error context when supplied', () => {
        const bad = sigDict();
        delete bad.entries.Filter;
        try {
            typeSignature(bad, { objNum: 42, objGen: 0 });
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ParseError);
            expect(e.code).toBe('pdf/sig/missing-filter');
            expect(e.context).toEqual({ objNum: 42, objGen: 0 });
        }
    });
});

function stubAsn1() {
    return {
        parseOne(buf, off) {
            return {
                tag: 0x30, length: buf.length, value: buf,
                valueOff: off, next: buf.length
            };
        },
        parseChildren(_v) { return []; },
        readOid(_n)       { return '0.0'; }
    };
}

describe('verifySignature', () => {
    test('returns shape with errors when PKCS#7 parse fails', () => {
        const fw = {
            asn1: { parseOne() { return false; }, parseChildren() { return false; },
                    readOid() { return null; } }
        };
        const sig = typeSignature(sigDict());
        const r = verifySignature(sig, new Uint8Array(200), fw);
        expect(r.valid).toBe(false);
        expect(r.verified).toBe(false);
        expect(r.errors.length).toBeGreaterThan(0);
        expect(r.signerCerts).toEqual([]);
    });

    test('reports verified=false with dissection error when SignerInfo is short',
        () => {
            // Drive parseChildren so we reach SignerInfo dissection but
            // with too few SignerInfo fields → short-record error code.
            const fw = {
                asn1: {
                    parseOne(buf) {
                        return { tag: 0x30, value: buf, length: buf.length,
                                 valueOff: 0, next: buf.length };
                    },
                    parseChildren(_v) {
                        // SignedData layout: [version, daSet, eci, [0]certs,
                        //                    signerInfos]; ensure last element
                        // has tag 0x31 to satisfy siSet probe.
                        return [
                            { tag: 0x02, value: new Uint8Array([1]) },
                            { tag: 0x31, value: new Uint8Array(0) },
                            { tag: 0x30, value: new Uint8Array(0) },
                            { tag: 0x31, value: new Uint8Array(0) }
                        ];
                    },
                    readOid() { return '0.0'; }
                }
            };
            const sig = typeSignature(sigDict());
            const r = verifySignature(sig, new Uint8Array(200), fw);
            expect(r.verified).toBe(false);
            expect(r.valid).toBe(false);
            const codes = r.errors.map((e) => e.code);
            // Either signer-info-short (most likely) or any dissection
            // failure that prevented pk verify.
            expect(codes.some((c) => c.startsWith('pdf/sig/'))).toBe(true);
        });

    test('throws EncryptionError without fw bundle', () => {
        const sig = typeSignature(sigDict());
        expect(() => verifySignature(sig, new Uint8Array(200), null))
            .toThrow(EncryptionError);
    });

    test('reports unknown digest/sig algs when OIDs do not map', () => {
        const fw = { asn1: stubAsn1() };
        const sig = typeSignature(sigDict());
        const r = verifySignature(sig, new Uint8Array(200), fw);
        expect(r.hashAlg).toBe(null);
        expect(r.signatureAlg).toBe(null);
    });

    test('exposes computedDigest field in result shape', () => {
        const fw = { asn1: stubAsn1() };
        const sig = typeSignature(sigDict());
        const r = verifySignature(sig, new Uint8Array(200), fw);
        expect('computedDigest' in r).toBe(true);
        // null when no hash module / no valid hashAlg dispatch
        expect(r.computedDigest).toBe(null);
    });

    test('result always exposes verified/valid/pkVerified booleans', () => {
        const fw = { asn1: stubAsn1() };
        const sig = typeSignature(sigDict());
        const r = verifySignature(sig, new Uint8Array(200), fw);
        expect(typeof r.verified).toBe('boolean');
        expect(typeof r.valid).toBe('boolean');
        expect(typeof r.pkVerified).toBe('boolean');
        // legacy alias must equal verified
        expect(r.valid).toBe(r.verified);
    });
});

// ── verifyPk — Item #1 P0 (real fw primitives) ────────────────────────
//
// These tests cover the public-key dispatch wiring end-to-end with the
// actual fw `rsa.pssVerify`, `ecc.ecdsa.publicKey.verify`, and
// `ed25519.verify` implementations. The PKCS#7 SignerInfo dissection
// (signedAttrs traversal + SPKI key extraction from the signer cert) is
// the remaining gap surfaced by `verifySignature` — but the primitive
// dispatcher under it is now fully wired and reachable via `verifyPk`.

import { rsa as _fwRsa }   from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc as _fwEcc }   from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 as _fwEd } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { sha256 as _fwSha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 as _fwSha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 as _fwSha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { hmac as _fwHmac } from '@awacloud/fw/crypto/hash/hmac.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { bn as _fwBn } from '@awacloud/fw/crypto/utils/bn.js';
import { random as _fwRand } from '@awacloud/fw/crypto/utils/random.js';
import { aes as _fwAes } from '@awacloud/fw/crypto/cipher/aes.js';
import { utf8 as _fwUtf8 } from '@awacloud/fw/io/codec/utf8.js';
import { hex as _fwHex } from '@awacloud/fw/io/codec/hex.js';

const _ba    = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _hexm  = _fwHex.factory();
const _aesm  = _fwAes.factory();
const _sha256m = _fwSha256.factory(_ba, _utf8m);
const _sha512m = _fwSha512.factory(_ba, _utf8m);
const _sha384m = _fwSha384.factory(_sha512m);
const _rng   = _fwRand.factory(_ba, _aesm, _sha256m);
const _bn    = _fwBn.factory(_ba, _rng);
const _rsam  = _fwRsa.factory(_ba, _bn, _rng);
const _hmacm = _fwHmac.factory(_ba);
const _eccm  = _fwEcc.factory(_ba, _hexm, _bn, _sha256m, _sha384m, _sha512m, _hmacm);
const _edm   = _fwEd.factory(_sha512m, _ba);

import { asn1 as _fwAsn1RT } from '@awacloud/fw/crypto/utils/asn1.js';
const _asn1RT = _fwAsn1RT.factory();
const _sigReal = pdfSignature.factory(
    _errors, _parser, pdfSigOids.factory(_asn1Oid),
    _asn1RT, _rsam, _eccm, _edm,
    _sha256m, _sha384m, _sha512m, _ba
);
const { verifyPk } = _sigReal;

describe('verifyPk — RSA-PSS (Item #1)', () => {
    test('verified=true on valid PSS signature', () => {
        // RFC 8017 Example 1 (1024-bit key from rsa.test.js).
        const priv = {
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
        const pub = { n: priv.n, e: priv.e };
        const msg = new TextEncoder().encode('PAdES message-to-sign');
        const sig = _rsam.pssSign(priv, msg, _sha256m);
        const r = verifyPk({ algorithm: 'rsa-pss',
            pubKey: pub, signature: sig, message: msg,
            hashMod: _sha256m });
        expect(r.verified).toBe(true);
    });

    test('verified=false on tampered message', () => {
        const priv = {
            n: _hexm.toBytes('a8b3b284af8eb50b387034a860f146c4919f318763cd6c5598c8ae4811a1e0abc4c7e0b082d693a5e7fced675cf4668512772c0cbc64a742c6c630f533c8cc72f62ae833c40bf25842e984bb78bdbf97c0107d55bdb662f5c4e0fab9845cb5148ef7392dd3aaff93ae1e6b667bb3d4247616d4f5ba10d4cfd226de88d39f16fb'),
            e: _hexm.toBytes('010001'),
            d: _hexm.toBytes('53339cfdb79fc8466a655c7316aca85c55fd8f6dd898fdaf119517ef4f52e8fd8e258df93fee180fa0e4ab29693cd83b152a553d4ac4d1812b8b9fa5af0e7f55fe7304df41570926f3311f15c4d65a732c483116ee3d3d2d0af3549ad9bf7cbfb78ad884f84d5beb04724dc7369b31def37d0cf539e9cfcdd3de653729ead5d1')
        };
        const pub = { n: priv.n, e: priv.e };
        const sig = _rsam.pssSign(priv, new TextEncoder().encode('orig'),
                                  _sha256m);
        const r = verifyPk({ algorithm: 'rsa-pss',
            pubKey: pub, signature: sig,
            message: new TextEncoder().encode('evil'),
            hashMod: _sha256m });
        expect(r.verified).toBe(false);
    });
});

describe('verifyPk — RSA PKCS#1 v1.5 (Item #1)', () => {
    test('returns deprecated code (fw refuses by design)', () => {
        const r = verifyPk({ algorithm: 'rsa-v15',
            pubKey: { n: new Uint8Array(128), e: new Uint8Array([1, 0, 1]) },
            signature: new Uint8Array(128),
            message: new Uint8Array(0),
            hashMod: _sha256m });
        expect(r.verified).toBe(false);
        expect(r.code).toBe('pdf/sig/rsa-pkcs1v15-deprecated');
    });
});

describe('verifyPk — ECDSA P-256 (Item #1)', () => {
    test('verified=true on valid signature', () => {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const msg = new TextEncoder().encode('PAdES ECDSA msg');
        const digestBits = _sha256m.hash(_ba.ui8_to_ba(msg));
        const sigBits = sec.sign(digestBits);
        // Convert sec1 point (x||y) to raw bytes for our verifyPk API.
        const ptBits = pub._point.toBits();
        const pointBytes = _ba.ba_to_ui8(ptBits);
        const sigBytes = _ba.ba_to_ui8(sigBits);
        const digestBytes = _ba.ba_to_ui8(digestBits);
        const r = verifyPk({ algorithm: 'ecdsa',
            pubKey: { curve: 'c256', point: pointBytes },
            signature: sigBytes,
            digest: digestBytes });
        expect(r.verified).toBe(true);
    });

    test('verified=false on tampered digest', () => {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const msg = new TextEncoder().encode('msg1');
        const digestBits = _sha256m.hash(_ba.ui8_to_ba(msg));
        const sigBits = sec.sign(digestBits);
        const pointBytes = _ba.ba_to_ui8(pub._point.toBits());
        const sigBytes = _ba.ba_to_ui8(sigBits);
        const wrong = _sha256m.hash(_ba.ui8_to_ba(
            new TextEncoder().encode('msg2')));
        const r = verifyPk({ algorithm: 'ecdsa',
            pubKey: { curve: 'c256', point: pointBytes },
            signature: sigBytes,
            digest: _ba.ba_to_ui8(wrong) });
        expect(r.verified).toBe(false);
    });
});

// ── ECDSA CMS signature value: DER ECDSA-Sig-Value or legacy raw r||s ──
//
// RFC 3279 §2.2.3 / RFC 5753 §7.2: the CMS `signature` of an ECDSA
// SignerInfo is the DER SEQUENCE { r INTEGER, s INTEGER }. Files written
// before the signer emitted that form carry the fixed-width raw r||s; the
// verifier normalises both to the raw form the fw primitive consumes.
describe('_ecdsaSigToRaw — DER first, legacy raw fallback', () => {
    const W = 32;
    const toRaw = (sig) => _sigReal._ecdsaSigToRaw(sig, W, _asn1RT);
    const der = (r, s) => _asn1RT.encodeSequence([
        _asn1RT.encodeInteger(r), _asn1RT.encodeInteger(s)]);

    test('DER with r MSB set (33-byte INTEGER) and a short s (31 bytes) → fixed-width r||s', () => {
        const r = new Uint8Array(W).map((_, i) => (0x80 + i) & 0xff);
        const s = new Uint8Array(W - 1).map((_, i) => (0x11 + i) & 0x7f);
        const sig = der(r, s);
        // Non-vacuity: the encoder really produced a 33-byte r and a 31-byte s.
        const kids = _asn1RT.parseChildren(_asn1RT.parseOne(sig, 0).value);
        expect(kids.map(k => k.value.length)).toEqual([W + 1, W - 1]);
        const out = toRaw(sig);
        expect(out.ok).toBe(true);
        expect(out.rs.length).toBe(2 * W);
        expect(out.rs.subarray(0, W)).toEqual(r);
        expect(out.rs[W]).toBe(0);
        expect(out.rs.subarray(W + 1)).toEqual(s);
    });

    test('a 0x30-prefixed 64-byte buffer whose length does not span it → raw (unchanged)', () => {
        const sig = new Uint8Array(2 * W).map((_, i) => (i * 13 + 7) & 0xff);
        sig[0] = 0x30; sig[1] = 0x10;
        const out = toRaw(sig);
        expect(out.ok).toBe(true);
        expect(out.rs).toEqual(sig);
    });

    test('DER with a 34-byte INTEGER → pdf/sig/verify-pk/bad-ecdsa-sig', () => {
        const big = new Uint8Array(W + 2).fill(0x22);
        big[0] = 0x01;
        const out = toRaw(der(big, new Uint8Array(W).fill(0x05)));
        expect(out.ok).toBe(false);
        expect(out.code).toBe('pdf/sig/verify-pk/bad-ecdsa-sig');
    });

    test('raw of 63 bytes → pdf/sig/verify-pk/bad-ecdsa-sig', () => {
        const out = toRaw(new Uint8Array(2 * W - 1).fill(0x11));
        expect(out.ok).toBe(false);
        expect(out.code).toBe('pdf/sig/verify-pk/bad-ecdsa-sig');
    });
});

describe('verifyPk — ECDSA accepts the DER and the raw form of one signature', () => {
    const { pub, sec } = _eccm.ecdsa.generateKeys(256);
    const pointBytes = _ba.ba_to_ui8(pub._point.toBits());
    const digestBits = _sha256m.hash(_ba.ui8_to_ba(
        new TextEncoder().encode('ECDSA DER or raw')));
    const digest = _ba.ba_to_ui8(digestBits);
    const raw = _ba.ba_to_ui8(sec.sign(digestBits));
    const derSig = _asn1RT.encodeSequence([
        _asn1RT.encodeInteger(raw.subarray(0, 32)),
        _asn1RT.encodeInteger(raw.subarray(32))]);
    const verify = (signature) => verifyPk({ algorithm: 'ecdsa',
        pubKey: { curve: 'c256', point: pointBytes }, signature, digest });

    test('raw r||s → verified', () => {
        expect(raw.length).toBe(64);
        expect(verify(raw).verified).toBe(true);
    });
    test('DER ECDSA-Sig-Value → verified', () => {
        expect(derSig[0]).toBe(0x30);
        expect(derSig.length).not.toBe(64);
        expect(verify(derSig).verified).toBe(true);
    });
    test('a flipped byte in each form → verified=false', () => {
        const rawBad = raw.slice(); rawBad[rawBad.length - 1] ^= 0x01;
        const derBad = derSig.slice(); derBad[derBad.length - 1] ^= 0x01;
        expect(verify(rawBad).verified).toBe(false);
        expect(verify(derBad).verified).toBe(false);
    });
    test('a malformed value → bad-ecdsa-sig, not a primitive call', () => {
        const r = verify(new Uint8Array(63).fill(0x11));
        expect(r.verified).toBe(false);
        expect(r.code).toBe('pdf/sig/verify-pk/bad-ecdsa-sig');
    });
});

describe('verifyPk — Ed25519 (Item #1)', () => {
    test('verified=true on valid signature', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 13) & 0xff;
        const kp = _edm.keyPair(seed);
        const msg = new TextEncoder().encode('PAdES Ed25519 msg');
        const sig = _edm.sign(kp.privateKey, msg);
        const r = verifyPk({ algorithm: 'ed25519',
            pubKey: kp.publicKey, signature: sig, message: msg });
        expect(r.verified).toBe(true);
    });

    test('verified=false on tampered message', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 13) & 0xff;
        const kp = _edm.keyPair(seed);
        const sig = _edm.sign(kp.privateKey,
            new TextEncoder().encode('orig'));
        const r = verifyPk({ algorithm: 'ed25519',
            pubKey: kp.publicKey, signature: sig,
            message: new TextEncoder().encode('evil') });
        expect(r.verified).toBe(false);
    });
});

describe('verifyPk — error surface', () => {
    test('rejects missing algorithm', () => {
        const r = verifyPk({ signature: new Uint8Array(0) });
        expect(r.verified).toBe(false);
        expect(r.code).toBe('pdf/sig/verify-pk/no-alg');
    });
    test('rejects unknown algorithm', () => {
        const r = verifyPk({ algorithm: 'mlkem',
            signature: new Uint8Array(0) });
        expect(r.code).toBe('pdf/sig/verify-pk/unknown-alg');
    });
    test('rejects bad RSA key shape', () => {
        const r = verifyPk({ algorithm: 'rsa-pss',
            pubKey: { n: new Uint8Array(0) },
            signature: new Uint8Array(0),
            message: new Uint8Array(0),
            hashMod: _sha256m });
        expect(r.code).toBe('pdf/sig/verify-pk/bad-rsa-key');
    });
    test('rejects bad ECDSA key shape', () => {
        const r = verifyPk({ algorithm: 'ecdsa',
            pubKey: { curve: 'c256' },
            signature: new Uint8Array(0),
            digest: new Uint8Array(32) });
        expect(r.code).toBe('pdf/sig/verify-pk/bad-ecc-key');
    });
});

// ── Full sign → verifySignature roundtrip (Item #2 SignerInfo dissection) ──
import { pdfSign as _pdfSign } from './sign.js';
import { pdfByteRange as _pdfByteRange } from './byteRange.js';
import { buildDocument as _buildDocument } from '../../tests/_helpers/build.js';

const _asn1m = _asn1RT;
const _br    = _pdfByteRange.factory(_errors);
// LT/LTA — wire the DSS builder + incremental writer so pdfSign's new
// optional deps are satisfied. These tests stay on level B/T so the
// deps are unused, but the factory shape requires non-null arguments.
import { pdfDssBuilder as _pdfDssB } from './dss.js';
import { pdfSerializer as _pdfSer } from '../syntax/serializer.js';
import { pdfXref as _pdfXref } from '../syntax/xref.js';
import { pdfTrailer as _pdfTr } from '../syntax/trailer.js';
import { pdfIncrementalWriter as _pdfIW } from '../document/incrementalWriter.js';
const _dssBMod = _pdfDssB.factory(_errors);
const _serMod  = _pdfSer.factory(_errors);
const _tokMod  = pdfTokenizer.factory(_errors, pdfShared.factory());
const _pObjMod = pdfParserObj.factory();
const _parserMod = pdfParser.factory(_errors, _pObjMod, _tokMod);
const _xrefMod = _pdfXref.factory(_errors, _tokMod, _parserMod);
const _trMod   = _pdfTr.factory(_errors, _pObjMod);
const _iwMod   = _pdfIW.factory(_errors, _serMod, _tokMod, _parserMod,
                                _xrefMod, _trMod);
// 15th positional dep: since BL-2041 (office/BATCH_51/01) every level
// resolves the Catalog and page 1 through `readDocument` to write the
// signature field — a classical-base reader is enough for these bases.
import { pdfDocument as _pdfDocMod } from '../document/document.js';
import { pdfCatalog as _pdfCat } from '../document/catalog.js';
import { pdfPage as _pdfPg } from '../document/page.js';
import { pdfPages as _pdfPgs } from '../document/pages.js';
const _docMod  = _pdfDocMod.factory(_errors, _tokMod, _parserMod, _xrefMod, _trMod,
    _pdfCat.factory(_errors, _pObjMod), _pdfPg.factory(_errors, _pObjMod),
    _pdfPgs.factory(_errors, _pObjMod));
const _signMod = _pdfSign.factory(
    _errors, pdfSigOids.factory(_asn1Oid), _br, _dssBMod, _iwMod, _parserMod,
    _asn1m, _rsam, _eccm, _edm,
    _sha256m, _sha384m, _sha512m, _ba, _docMod,
    // 16th-19th: pdfSecurity + pdfStandardV4/V5/V6 — read only for an
    // encrypted base, which these round trips never sign.
    null, null, null, null
);

function _encLenRT(n) {
    if (n < 0x80) return Uint8Array.of(n);
    if (n <= 0xff) return Uint8Array.of(0x81, n);
    if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
    return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function _utcTimeRT(s) {
    const v = new TextEncoder().encode(s);
    const len = _encLenRT(v.length);
    const out = new Uint8Array(1 + len.length + v.length);
    out[0] = 0x17;
    out.set(len, 1);
    out.set(v, 1 + len.length);
    return out;
}

// Build a syntactically minimal X.509 cert with a REAL SPKI matching the
// caller-provided algorithm + public key. Subject = Issuer (self-signed
// shape). The "signature" value on the cert itself is a dummy — chain
// validation is out of scope for verifySignature.
function _buildCertWithPubKey({ cn, serial, alg, pubKey }) {
    const A = _asn1m;
    const cnOid = '2.5.4.3';
    const cnValue = new TextEncoder().encode(cn);
    const len = _encLenRT(cnValue.length);
    const cnPS = new Uint8Array(1 + len.length + cnValue.length);
    cnPS[0] = 0x13;
    cnPS.set(len, 1);
    cnPS.set(cnValue, 1 + len.length);
    const atv = A.encodeSequence([A.encodeOid(cnOid), cnPS]);
    const rdn = A.encodeSet([atv]);
    const name = A.encodeSequence([rdn]);
    const validity = A.encodeSequence([
        _utcTimeRT('200101000000Z'), _utcTimeRT('300101000000Z')]);
    let spki;
    let sigAlgOid;
    if (alg === 'rsa-pss') {
        sigAlgOid = '1.2.840.113549.1.1.10';
        // RSAPublicKey ::= SEQUENCE { n INTEGER, e INTEGER }
        const rsaPub = A.encodeSequence([
            A.encodeInteger(pubKey.n),
            A.encodeInteger(pubKey.e)
        ]);
        spki = A.encodeSequence([
            A.encodeSequence([A.encodeOid('1.2.840.113549.1.1.1'),
                              A.encodeNull()]),
            A.encodeBitString(rsaPub, 0)
        ]);
    } else if (alg === 'ecdsa') {
        sigAlgOid = '1.2.840.10045.4.3.2';
        // ECPoint = 0x04 || x || y (uncompressed).
        const ecPoint = new Uint8Array(1 + pubKey.point.length);
        ecPoint[0] = 0x04;
        ecPoint.set(pubKey.point, 1);
        const curveOid = pubKey.curve === 'c256' ? '1.2.840.10045.3.1.7'
                       : pubKey.curve === 'c384' ? '1.3.132.0.34'
                       : '1.3.132.0.35';
        spki = A.encodeSequence([
            A.encodeSequence([A.encodeOid('1.2.840.10045.2.1'),
                              A.encodeOid(curveOid)]),
            A.encodeBitString(ecPoint, 0)
        ]);
    } else if (alg === 'ed25519') {
        sigAlgOid = '1.3.101.112';
        spki = A.encodeSequence([
            A.encodeSequence([A.encodeOid('1.3.101.112')]),
            A.encodeBitString(pubKey, 0)
        ]);
    } else {
        throw new Error('unsupported alg');
    }
    const sigAlg = A.encodeSequence([A.encodeOid(sigAlgOid)]);
    const tbs = A.encodeSequence([
        A.encodeInteger(serial), sigAlg, name, validity, name, spki
    ]);
    return A.encodeSequence([
        tbs, sigAlg, A.encodeBitString(new Uint8Array([0, 0]), 0)
    ]);
}

describe('verifySignature — roundtrip (Item #2 SignerInfo dissection)', () => {
    const _basePdf = _buildDocument({ pages: ['BT /F1 12 Tf (rt) Tj ET'] });

    test('Ed25519 detached PKCS#7 → verified=true', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 17 + 5) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildCertWithPubKey({
            cn: 'RT Ed', serial: 1, alg: 'ed25519',
            pubKey: kp.publicKey
        });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey
        });
        // Parse the signature dict out of the signed PDF.
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
        expect(r.signatureAlg).toBe('ed25519');
    });

    test('RSA-PSS detached PKCS#7 → verified=true', () => {
        const priv = {
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
        const cert = _buildCertWithPubKey({
            cn: 'RT PSS', serial: 2, alg: 'rsa-pss',
            pubKey: { n: priv.n, e: priv.e }
        });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'rsa-pss', cert, privateKey: priv,
            hashAlg: 'sha256'
        });
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
        expect(r.signatureAlg).toBe('rsa-pss');
    });

    test('Ed25519 with signedAttrs (ESS signingCertificateV2) → verified=true', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 23 + 11) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildCertWithPubKey({
            cn: 'RT Ed sA', serial: 10, alg: 'ed25519',
            pubKey: kp.publicKey
        });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            useSignedAttrs: true,
            signingTime: new Date(Date.UTC(2024, 0, 15, 12, 0, 0))
        });
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
    });

    test('RSA-PSS with signedAttrs → verified=true', () => {
        const priv = {
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
        const cert = _buildCertWithPubKey({
            cn: 'RT PSS sA', serial: 11, alg: 'rsa-pss',
            pubKey: { n: priv.n, e: priv.e }
        });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'rsa-pss', cert, privateKey: priv,
            hashAlg: 'sha256', useSignedAttrs: true
        });
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
    });

    test('ECDSA-P256 detached PKCS#7 → verified=true', () => {
        const { pub, sec } = _eccm.ecdsa.generateKeys(256);
        const pointBytes = _ba.ba_to_ui8(pub._point.toBits());
        const cert = _buildCertWithPubKey({
            cn: 'RT ECC', serial: 3, alg: 'ecdsa',
            pubKey: { curve: 'c256', point: pointBytes }
        });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'ecdsa', cert,
            privateKey: { curve: _eccm.curves.c256, secretKey: sec },
            hashAlg: 'sha256'
        });
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
        expect(r.signatureAlg).toBe('ecc');
    });
});

// Mock TSA — returns a minimal RFC 3161 TimeStampToken (a CMS SignedData
// with an empty SignerInfo set). The bytes are not crypto-meaningful;
// they exercise the unsignedAttrs embedding path. The actual TimeStampToken
// validation lives in pdfTimestamp.verifyTimestamp and is exercised by
// timestamp.test.js.
function _mockTsa({ digest, hashAlg }) {
    const A = _asn1RT;
    void hashAlg;
    // TSTInfo ::= SEQUENCE { version, policy, messageImprint, serial,
    //                         genTime, ... }
    const policy = A.encodeOid('1.2.3.4.5');
    const hashAlgId = A.encodeSequence([
        A.encodeOid('2.16.840.1.101.3.4.2.1'), A.encodeNull()]);
    const messageImprint = A.encodeSequence([
        hashAlgId, A.encodeOctetString(digest)]);
    const serial = A.encodeInteger(42);
    const t = new TextEncoder().encode('20240101000000Z');
    const gt = new Uint8Array(2 + t.length);
    gt[0] = 0x18; gt[1] = t.length; gt.set(t, 2);
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1), policy, messageImprint, serial, gt]);
    const tstInfoOctet = A.encodeOctetString(tstInfo);
    // ContentInfo { id-ct-TSTInfo, [0] OCTET STRING }
    const eci = A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.9.16.1.4'),
        A.encodeExplicit(0, tstInfoOctet)
    ]);
    const sd = A.encodeSequence([
        A.encodeInteger(3),
        A.encodeSet([]),
        eci,
        A.encodeSet([])
    ]);
    return A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.7.2'),
        A.encodeExplicit(0, sd)
    ]);
}

describe('pdfSign — level T (timestamp injection)', () => {
    const _basePdf = _buildDocument({ pages: ['BT /F1 12 Tf (T) Tj ET'] });
    test('rejects level T without tsaSign callback', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = i;
        const kp = _edm.keyPair(seed);
        const cert = _buildCertWithPubKey({
            cn: 'T', serial: 1, alg: 'ed25519', pubKey: kp.publicKey });
        expect(() => _signMod.sign(_basePdf, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'T'
        })).toThrow();
    });

    test('Ed25519 level T → verifySignature.verified=true + tsa attr', () => {
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = (i * 5 + 1) & 0xff;
        const kp = _edm.keyPair(seed);
        const cert = _buildCertWithPubKey({
            cn: 'T Ed', serial: 2, alg: 'ed25519', pubKey: kp.publicKey });
        const signed = _signMod.sign(_basePdf, {
            algorithm: 'ed25519', cert, privateKey: kp.privateKey,
            level: 'T', tsaSign: _mockTsa
        });
        const sigDictParsed = _extractSigDict(signed);
        const r = _sigReal.verifySignature(sigDictParsed, signed);
        expect(r.verified).toBe(true);
        expect(r.pkVerified).toBe(true);
        // The unsigned attribute is embedded — sanity-check by scanning
        // the PKCS#7 hex for the id-aa-timeStampToken OID DER bytes
        // (0x2A 86 48 86 F7 0D 01 09 10 02 0E).
        const tsOidDer = new Uint8Array([
            0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x09, 0x10, 0x02, 0x0E]);
        let found = false;
        outer: for (let i = 0; i < sigDictParsed.contents.length - tsOidDer.length; i++) {
            for (let j = 0; j < tsOidDer.length; j++) {
                if (sigDictParsed.contents[i + j] !== tsOidDer[j]) continue outer;
            }
            found = true; break;
        }
        expect(found).toBe(true);
    });
});

// Build a typed signature record by locating /Type /Sig in the signed
// PDF and re-parsing the dictionary into a minimal record consumable by
// verifySignature.
function _extractSigDict(signedPdf) {
    const dec = new TextDecoder('latin1');
    const s = dec.decode(signedPdf);
    // /ByteRange
    const brMatch = s.match(
        /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    const br = [
        parseInt(brMatch[1], 10), parseInt(brMatch[2], 10),
        parseInt(brMatch[3], 10), parseInt(brMatch[4], 10)
    ];
    // /Contents <...>
    const cIdx = s.indexOf('/Contents <');
    const cStart = cIdx + '/Contents <'.length;
    const cEnd = s.indexOf('>', cStart);
    const hex = s.slice(cStart, cEnd).replace(/[^0-9a-fA-F]/g, '');
    // Strip trailing '00' padding (signature placeholder bytes).
    let end = hex.length;
    while (end >= 2 && hex.charCodeAt(end - 1) === 0x30
                    && hex.charCodeAt(end - 2) === 0x30) {
        // detect end of actual PKCS#7 by scanning the DER length of the
        // outer SEQUENCE at offset 0. Better : decode the outer length.
        break;
    }
    const bytes = new Uint8Array(end >>> 1);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    // Determine actual PKCS#7 length by parsing the outer SEQUENCE.
    let actualLen = bytes.length;
    if (bytes.length >= 2 && bytes[0] === 0x30) {
        const lb = bytes[1];
        let lenLen = 1;
        let dataLen = lb;
        if (lb & 0x80) {
            const nn = lb & 0x7f;
            lenLen = 1 + nn;
            dataLen = 0;
            for (let i = 0; i < nn; i++) {
                dataLen = (dataLen << 8) | bytes[2 + i];
            }
        }
        actualLen = 1 + lenLen + dataLen;
    }
    return {
        kind: 'Sig',
        filter: 'Adobe.PPKLite',
        subFilter: 'adbe.pkcs7.detached',
        contents: bytes.subarray(0, actualLen),
        byteRange: br
    };
}

describe('locatePkcs7', () => {
    test('returns false on non-Uint8Array', () => {
        expect(locatePkcs7('hi', stubAsn1())).toBe(false);
    });
});

describe('pdfSignature factory', () => {
    test('factory.toString() contains "function"', () => {
        expect(pdfSignature.factory.toString()).toContain('function');
    });

    test('factory returns expected API', () => {
        const api = pdfSignature.factory(
            _pdfErrors_TD1, _buildParser(), pdfSigOids.factory(_asn1Oid),
            stubAsn1(), {}, {}, {}, {}, {}, {}, {});
        expect(typeof api.typeSignature).toBe('function');
        expect(typeof api.verifySignature).toBe('function');
        expect(typeof api.locatePkcs7).toBe('function');
    });

    test('declares fw deps', () => {
        expect(pdfSignature.dependencies).toEqual([
            'pdfErrors', 'pdfParser', 'pdfSigOids',
            'asn1', 'rsa', 'ecc', 'ed25519',
            'sha256', 'sha384', 'sha512', 'bitArray'
        ]);
    });
});

// ── _hashByteRange — no-`.fn` fallback digest correctness (BL-272) ────
//
// The fallback branch (no `hashMod.fn`) must hash the SAME bit content
// as the streaming branch: `ba.ui8_to_ba(_concatRange(bytes, br))`, not
// a raw `Uint8Array`. And with no live bitArray API reachable (neither
// `bitArrayMod` nor the factory's own `bitArray` capture exposing
// `ui8_to_ba`/`ba_to_ui8`), it must throw rather than emit a possibly
// wrong digest.

describe('_hashByteRange — no-.fn fallback (BL-272)', () => {
    const _bytes = new Uint8Array(40).map((_, i) => (i * 7 + 3) & 0xff);
    const _br = [0, 10, 20, 10];
    // A hash module exposing only `.hash` (no `.fn`) forces the fallback
    // branch; `_sha256m.hash` is a standalone function (no `this` use).
    const _hashOnly = { hash: _sha256m.hash };

    test('fallback digest equals streaming-path digest for the same input', () => {
        const streaming = _sigReal._hashByteRange(_bytes, _br, _sha256m, _ba);
        const fallback = _sigReal._hashByteRange(_bytes, _br, _hashOnly, _ba);
        expect(fallback).toBeInstanceOf(Uint8Array);
        expect(Array.from(fallback)).toEqual(Array.from(streaming));
    });

    test('throws a typed error when no live bitArray API is supplied (bitArrayMod absent, factory bitArray null)', () => {
        // `_sig` (top of file) was built with `null` for the factory's
        // own `bitArray` param, so with no bitArrayMod argument the
        // fallback's `ba` is null — no bitArray API reachable at all.
        expect(() => _sig._hashByteRange(_bytes, _br, _hashOnly))
            .toThrow();
        try {
            _sig._hashByteRange(_bytes, _br, _hashOnly);
            throw new Error('expected _hashByteRange to throw');
        } catch (e) {
            expect(e.code).toBe('pdf/sig/byterange/no-bitarray');
        }
    });

    test('throws when bitArrayMod is the fw descriptor, not the API object', () => {
        // `_fwBA` is the raw `import { bitArray }` descriptor (has no
        // `ui8_to_ba`/`ba_to_ui8` — those only exist on `.factory()`'s
        // return value), mirroring the grounding note in the plan: the
        // fallback binding is the descriptor, not the API, when no
        // resolved bitArray instance is threaded through.
        expect(() => _sigReal._hashByteRange(_bytes, _br, _hashOnly, _fwBA))
            .toThrow();
        try {
            _sigReal._hashByteRange(_bytes, _br, _hashOnly, _fwBA);
            throw new Error('expected _hashByteRange to throw');
        } catch (e) {
            expect(e.code).toBe('pdf/sig/byterange/no-bitarray');
        }
    });
});
