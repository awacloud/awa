// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Asymmetric key format encoders/decoders.
 *
 * Wraps raw key material in the standard ASN.1 envelopes:
 *
 *   • PKCS#8  (RFC 5208 / 5958) - `OneAsymmetricKey` for private keys
 *   • SPKI    (RFC 5280 §4.1)   - `SubjectPublicKeyInfo` for public keys
 *   • SEC1    (RFC 5915)        - `ECPrivateKey` (used inside PKCS#8 for EC)
 *   • RFC 8410 - Ed25519 / X25519 wrappers (Ed448 / X448 NOT supported;
 *     add `1.3.101.112`/`113` entries with `RAW_LEN = 57` to extend.)
 *   • PKCS#1  (RFC 8017 A.1)    - `RSAPublicKey` / `RSAPrivateKey`, and RSA
 *     inside SPKI / PKCS#8 (rsaEncryption, NULL parameters)
 *
 * Curve OIDs supported:
 *   • Ed25519  1.3.101.112
 *   • X25519   1.3.101.110
 *   • P-256    1.2.840.10045.3.1.7
 *   • P-384    1.3.132.0.34
 *   • P-521    1.3.132.0.35
 *
 * @typedef {{ oid: string, seed: Uint8Array }} EdwardsPrivateKeyDecoded
 * @typedef {{ oid: string, publicKey: Uint8Array }} EdwardsPublicKeyDecoded
 * @typedef {{ d: Uint8Array, curveOid?: string, publicKey?: Uint8Array }} EcSec1Decoded
 * @typedef {{ curveOid: string, d: Uint8Array, publicKey?: Uint8Array }} EcPkcs8Decoded
 * @typedef {{ curveOid: string, point: Uint8Array }} EcSpkiDecoded
 * @typedef {{ n: Uint8Array, e: Uint8Array }} RsaPublicKeyParts
 *   Unsigned big-endian integers (the shape `pkc/rsa.js` takes).
 * @typedef {{ n: Uint8Array, e: Uint8Array, d: Uint8Array, p: Uint8Array, q: Uint8Array, dp: Uint8Array, dq: Uint8Array, qInv: Uint8Array }} RsaPrivateKeyParts
 *   A two-prime RSA private key, every integer unsigned big-endian.
 *
 */

/**
 * Public shape returned by `keyformat.factory()`.
 * @typedef {object} KeyformatAPI
 * @property {{ED25519:string, X25519:string, EC_PUBKEY:string, P256:string, P384:string, P521:string, RSA:string}} OID Algorithm/curve OID constants.
 * @property {(oid: string, rawSeed: Uint8Array) => (Uint8Array|false)} encodePkcs8Edwards Wrap a raw seed as a PKCS#8 Ed25519/X25519 private key.
 * @property {(der: Uint8Array) => (EdwardsPrivateKeyDecoded|false)} decodePkcs8Edwards Decode a PKCS#8 Edwards private key.
 * @property {(oid: string, rawPub: Uint8Array) => (Uint8Array|false)} encodeSpkiEdwards Wrap a raw public key as an Edwards SPKI.
 * @property {(der: Uint8Array) => (EdwardsPublicKeyDecoded|false)} decodeSpkiEdwards Decode an Edwards SPKI.
 * @property {(d: Uint8Array, pub?: Uint8Array, curveOid?: string) => (Uint8Array|false)} encodeSec1 Encode an EC private key in SEC1 form.
 * @property {(der: Uint8Array) => (EcSec1Decoded|false)} decodeSec1 Decode a SEC1 EC private key.
 * @property {(curveOid: string, d: Uint8Array, pub?: Uint8Array) => (Uint8Array|false)} encodePkcs8Ec Wrap an EC private key as PKCS#8.
 * @property {(der: Uint8Array) => (EcPkcs8Decoded|false)} decodePkcs8Ec Decode a PKCS#8 EC private key.
 * @property {(curveOid: string, uncompressedPoint: Uint8Array) => (Uint8Array|false)} encodeSpkiEc Wrap an uncompressed EC public key as SPKI.
 * @property {(der: Uint8Array) => (EcSpkiDecoded|false)} decodeSpkiEc Decode an EC SPKI.
 * @property {(key: RsaPublicKeyParts) => (Uint8Array|false)} encodeRsaPublicKey Encode a PKCS#1 `RSAPublicKey`.
 * @property {(der: Uint8Array) => (RsaPublicKeyParts|false)} decodeRsaPublicKey Decode a PKCS#1 `RSAPublicKey`.
 * @property {(key: RsaPrivateKeyParts) => (Uint8Array|false)} encodeRsaPrivateKey Encode a PKCS#1 `RSAPrivateKey` (version 0).
 * @property {(der: Uint8Array) => (RsaPrivateKeyParts|false)} decodeRsaPrivateKey Decode a two-prime PKCS#1 `RSAPrivateKey`.
 * @property {(key: RsaPublicKeyParts) => (Uint8Array|false)} encodeSpkiRsa Wrap an RSA public key as SPKI.
 * @property {(der: Uint8Array) => (RsaPublicKeyParts|false)} decodeSpkiRsa Decode an RSA SPKI.
 * @property {(key: RsaPrivateKeyParts) => (Uint8Array|false)} encodePkcs8Rsa Wrap an RSA private key as PKCS#8.
 * @property {(der: Uint8Array) => (RsaPrivateKeyParts|false)} decodePkcs8Rsa Decode an RSA PKCS#8 private key.
 */

import { asn1 } from './asn1.js';

export const keyformat = {
    name: 'keyformat',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['asn1'],
    deps: [asn1],

    /** @returns {KeyformatAPI} */
    factory(asn1) {

        // ── OID registry ──────────────────────────────────────────────

        const OID = {
            ED25519:    '1.3.101.112',
            X25519:     '1.3.101.110',
            EC_PUBKEY:  '1.2.840.10045.2.1',
            P256:       '1.2.840.10045.3.1.7',
            P384:       '1.3.132.0.34',
            P521:       '1.3.132.0.35',
            RSA:        '1.2.840.113549.1.1.1'
        };

        // Inverse: name → expected raw key length
        const RAW_LEN = {
            [OID.ED25519]: 32,
            [OID.X25519]:  32
        };

        // ── helpers ────────────────────────────────────────────────────

        function _algId(oid, params) {
            const parts = [asn1.encodeOid(oid)];
            if (params !== undefined) parts.push(params);
            return asn1.encodeSequence(parts);
        }

        // ── RFC 8410 (Ed25519 / X25519) ───────────────────────────────

        /**
         * Wrap a 32-byte raw seed as a PKCS#8 Ed25519 / X25519 private key.
         * @param {string} oid Algorithm OID (use `OID.ED25519` or `OID.X25519`).
         * @param {Uint8Array} rawSeed 32 raw bytes.
         * @returns {Uint8Array|false}
         */
        function encodePkcs8Edwards(oid, rawSeed) {
            if (!(rawSeed instanceof Uint8Array) || rawSeed.length !== RAW_LEN[oid]) {
                console.warn('[crypto] INVALID: keyformat: rawSeed length mismatch for ' + oid);
                return false;
            }
            // privateKey field = OCTET STRING wrapping an inner OCTET STRING (CurvePrivateKey).
            const inner = asn1.encodeOctetString(rawSeed);
            return asn1.encodeSequence([
                asn1.encodeInteger(0),
                _algId(oid),
                asn1.encodeOctetString(inner)
            ]);
        }

        /**
         * Decode a PKCS#8 Ed25519/X25519 private key, returning raw seed +
         * the algorithm OID.
         * @returns {{oid:string, seed:Uint8Array}|false}
         */
        function decodePkcs8Edwards(der) {
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30) return false;
            const kids = asn1.parseChildren(top.value);
            if (!kids || kids.length < 3) return false;

            const version = asn1.readInteger(kids[0]);
            if (!version || (version.length === 1 && version[0] !== 0)) {
                console.warn('[crypto] INVALID: keyformat: unsupported PKCS#8 version');
                return false;
            }
            const algKids = asn1.parseChildren(kids[1].value);
            if (!algKids || algKids.length < 1) return false;
            const oid = asn1.readOid(algKids[0]);
            if (oid !== OID.ED25519 && oid !== OID.X25519) {
                console.warn('[crypto] INVALID: keyformat: not an Edwards key (' + oid + ')');
                return false;
            }
            // privateKey OCTET STRING contains another OCTET STRING.
            const innerOct = asn1.parseOne(kids[2].value, 0);
            if (!innerOct || innerOct.tag !== 0x04 || innerOct.value.length !== RAW_LEN[oid]) {
                console.warn('[crypto] INVALID: keyformat: malformed CurvePrivateKey');
                return false;
            }
            return { oid, seed: new Uint8Array(innerOct.value) };
        }

        /**
         * Wrap a 32-byte raw public key as a SubjectPublicKeyInfo for
         * Ed25519 or X25519 (RFC 8410 §4).
         */
        function encodeSpkiEdwards(oid, rawPub) {
            if (!(rawPub instanceof Uint8Array) || rawPub.length !== RAW_LEN[oid]) {
                console.warn('[crypto] INVALID: keyformat: rawPub length mismatch for ' + oid);
                return false;
            }
            return asn1.encodeSequence([
                _algId(oid),
                asn1.encodeBitString(rawPub, 0)
            ]);
        }

        /**
         * Decode an Edwards SPKI (RFC 8410 §4).
         * Strict: exactly two top-level children (AlgorithmIdentifier +
         * subjectPublicKey BIT STRING); any trailing junk is rejected.
         * @param {Uint8Array} der
         * @returns {EdwardsPublicKeyDecoded|false}
         */
        function decodeSpkiEdwards(der) {
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30) return false;
            const kids = asn1.parseChildren(top.value);
            if (!kids || kids.length !== 2) return false;
            const algKids = asn1.parseChildren(kids[0].value);
            const oid = asn1.readOid(algKids[0]);
            if (oid !== OID.ED25519 && oid !== OID.X25519) return false;
            const bs = asn1.readBitString(kids[1]);
            if (!bs || bs.unusedBits !== 0 || bs.bytes.length !== RAW_LEN[oid]) return false;
            return { oid, publicKey: new Uint8Array(bs.bytes) };
        }

        // ── SEC1 / PKCS#8 EC keys (RFC 5915 + RFC 5480) ───────────────

        /**
         * Encode an EC private key in SEC1 form (RFC 5915 §3).
         * @param {Uint8Array} d  Raw private scalar (big-endian, fixed width per curve).
         * @param {Uint8Array} [pub]  Uncompressed point `04 || X || Y`.
         * @param {string} [curveOid] If set, included as parameters [0].
         */
        function encodeSec1(d, pub, curveOid) {
            const parts = [
                asn1.encodeInteger(1),
                asn1.encodeOctetString(d)
            ];
            if (curveOid) {
                parts.push(asn1.encodeExplicit(0, asn1.encodeOid(curveOid)));
            }
            if (pub) {
                parts.push(asn1.encodeExplicit(1, asn1.encodeBitString(pub, 0)));
            }
            return asn1.encodeSequence(parts);
        }

        /**
         * Wrap an EC private key as PKCS#8.
         * @param {string} curveOid Named-curve OID (P-256/P-384/P-521).
         * @param {Uint8Array} d Raw scalar.
         * @param {Uint8Array} [pub] Optional uncompressed public point.
         */
        function encodePkcs8Ec(curveOid, d, pub) {
            const sec1 = encodeSec1(d, pub /* no inner curveOid: it's at the outer level */);
            return asn1.encodeSequence([
                asn1.encodeInteger(0),
                _algId(OID.EC_PUBKEY, asn1.encodeOid(curveOid)),
                asn1.encodeOctetString(sec1)
            ]);
        }

        function decodeSec1(der) {
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30) {
                console.warn('[crypto] INVALID: keyformat: SEC1 outer SEQUENCE missing');
                return false;
            }
            const kids = asn1.parseChildren(top.value);
            if (!kids || kids.length < 2) {
                console.warn('[crypto] INVALID: keyformat: SEC1 needs at least version + privateKey');
                return false;
            }
            const versionBytes = asn1.readInteger(kids[0]);
            if (versionBytes === false || versionBytes.length !== 1 || versionBytes[0] !== 1) {
                console.warn('[crypto] INVALID: keyformat: SEC1 version must be 1');
                return false;
            }
            const d = new Uint8Array(kids[1].value);
            let curveOid, publicKey;
            for (let i = 2; i < kids.length; i++) {
                const k = kids[i];
                if (k.tag === 0xA0) {
                    const inner = asn1.parseOne(k.value, 0);
                    if (inner && inner.tag === 0x06) curveOid = asn1.readOid(inner);
                } else if (k.tag === 0xA1) {
                    const inner = asn1.parseOne(k.value, 0);
                    const bs = asn1.readBitString(inner);
                    if (bs) publicKey = new Uint8Array(bs.bytes);
                }
            }
            return { d, curveOid, publicKey };
        }

        function decodePkcs8Ec(der) {
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30) {
                console.warn('[crypto] INVALID: keyformat: PKCS#8 outer SEQUENCE missing');
                return false;
            }
            const kids = asn1.parseChildren(top.value);
            if (!kids || kids.length < 3) {
                console.warn('[crypto] INVALID: keyformat: PKCS#8 needs version + algId + privateKey');
                return false;
            }

            const algKids = asn1.parseChildren(kids[1].value);
            if (!algKids || algKids.length < 2) {
                console.warn('[crypto] INVALID: keyformat: PKCS#8 EC AlgorithmIdentifier needs oid + curveOid');
                return false;
            }
            if (asn1.readOid(algKids[0]) !== OID.EC_PUBKEY) {
                console.warn('[crypto] INVALID: keyformat: not an EC PKCS#8 key');
                return false;
            }
            const curveOid = asn1.readOid(algKids[1]);
            const sec1 = decodeSec1(kids[2].value);
            if (sec1 === false) return false;
            return { curveOid, d: sec1.d, publicKey: sec1.publicKey };
        }

        /**
         * Wrap an uncompressed EC public key (`04 || X || Y`) as SPKI.
         */
        function encodeSpkiEc(curveOid, uncompressedPoint) {
            return asn1.encodeSequence([
                _algId(OID.EC_PUBKEY, asn1.encodeOid(curveOid)),
                asn1.encodeBitString(uncompressedPoint, 0)
            ]);
        }

        function decodeSpkiEc(der) {
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30) return false;
            const kids = asn1.parseChildren(top.value);
            if (kids.length !== 2) return false;
            const algKids = asn1.parseChildren(kids[0].value);
            if (asn1.readOid(algKids[0]) !== OID.EC_PUBKEY) return false;
            const curveOid = asn1.readOid(algKids[1]);
            const bs = asn1.readBitString(kids[1]);
            return { curveOid, point: new Uint8Array(bs.bytes) };
        }

        // ── RSA (RFC 8017 A.1, RFC 3279 §2.3.1) ───────────────────────

        const RSA_PRIV_FIELDS = ['n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qInv'];

        /** @param {string} why @returns {false} */
        function _rsaBad(why) {
            console.warn('[crypto] INVALID: keyformat: RSA ' + why);
            return false;
        }

        /**
         * Parse `der` as exactly one SEQUENCE and return its children.
         * @param {unknown} der
         * @returns {import('./asn1.js').Asn1Node[]|false}
         */
        function _seq(der) {
            if (!(der instanceof Uint8Array)) return false;
            const top = asn1.parseOne(der, 0);
            if (!top || top.tag !== 0x30 || top.next !== der.length) return false;
            return asn1.parseChildren(top.value);
        }

        /**
         * A non-negative INTEGER node as unsigned big-endian bytes (the DER
         * sign byte dropped).
         * @returns {Uint8Array|false}
         */
        function _uint(node) {
            const raw = asn1.readInteger(node);
            if (raw === false || raw.length === 0 || (raw[0] & 0x80)) return false;
            let i = 0;
            while (i < raw.length - 1 && raw[i] === 0) i++;
            return new Uint8Array(raw.subarray(i));
        }

        /** Whether every named field is a non-empty `Uint8Array`. */
        function _hasInts(key, fields) {
            return !!key && fields.every((f) => key[f] instanceof Uint8Array && key[f].length > 0);
        }

        /** The `{rsaEncryption, NULL}` AlgorithmIdentifier. */
        function _rsaAlgId() {
            return _algId(OID.RSA, asn1.encodeNull());
        }

        /** Whether an AlgorithmIdentifier node is `{rsaEncryption, NULL}`. */
        function _isRsaAlgId(node) {
            if (!node || node.tag !== 0x30) return false;
            const k = asn1.parseChildren(node.value);
            return !!k && k.length === 2 && asn1.readOid(k[0]) === OID.RSA
                && k[1].tag === 0x05 && k[1].length === 0;
        }

        /**
         * Encode a PKCS#1 `RSAPublicKey ::= SEQUENCE { modulus, publicExponent }`.
         * @param {RsaPublicKeyParts} key
         * @returns {Uint8Array|false}
         */
        function encodeRsaPublicKey(key) {
            if (!_hasInts(key, ['n', 'e'])) return _rsaBad('public key needs n and e');
            return asn1.encodeSequence([asn1.encodeInteger(key.n), asn1.encodeInteger(key.e)]);
        }

        /**
         * Decode a PKCS#1 `RSAPublicKey`.
         * @param {Uint8Array} der
         * @returns {RsaPublicKeyParts|false}
         */
        function decodeRsaPublicKey(der) {
            const kids = _seq(der);
            if (!kids || kids.length !== 2) return _rsaBad('RSAPublicKey needs exactly modulus + exponent');
            const n = _uint(kids[0]);
            const e = _uint(kids[1]);
            if (!n || !e) return _rsaBad('RSAPublicKey integers malformed');
            return { n, e };
        }

        /**
         * Encode a two-prime PKCS#1 `RSAPrivateKey` (version 0, RFC 8017 A.1.2).
         * @param {RsaPrivateKeyParts} key
         * @returns {Uint8Array|false}
         */
        function encodeRsaPrivateKey(key) {
            if (!_hasInts(key, RSA_PRIV_FIELDS)) {
                return _rsaBad('private key needs n, e, d, p, q, dp, dq and qInv');
            }
            return asn1.encodeSequence([asn1.encodeInteger(0), ...RSA_PRIV_FIELDS.map((f) => asn1.encodeInteger(key[f]))]);
        }

        /**
         * Decode a PKCS#1 `RSAPrivateKey`. A multi-prime key (version 1) is
         * refused.
         * @param {Uint8Array} der
         * @returns {RsaPrivateKeyParts|false}
         */
        function decodeRsaPrivateKey(der) {
            const kids = _seq(der);
            if (!kids || kids.length !== 9) return _rsaBad('RSAPrivateKey needs version + 8 integers (two-prime)');
            const version = asn1.readInteger(kids[0]);
            if (!version || version.length !== 1 || version[0] !== 0) return _rsaBad('RSAPrivateKey version must be 0');
            /** @type {Record<string, Uint8Array>} */
            const out = {};
            for (let i = 0; i < RSA_PRIV_FIELDS.length; i++) {
                const v = _uint(kids[i + 1]);
                if (!v) return _rsaBad('RSAPrivateKey integer ' + RSA_PRIV_FIELDS[i] + ' malformed');
                out[RSA_PRIV_FIELDS[i]] = v;
            }
            return /** @type {RsaPrivateKeyParts} */ (/** @type {unknown} */ (out));
        }

        /**
         * Wrap an RSA public key as a SubjectPublicKeyInfo (rsaEncryption).
         * @param {RsaPublicKeyParts} key
         * @returns {Uint8Array|false}
         */
        function encodeSpkiRsa(key) {
            const pkcs1 = encodeRsaPublicKey(key);
            if (pkcs1 === false) return false;
            return asn1.encodeSequence([_rsaAlgId(), asn1.encodeBitString(pkcs1, 0)]);
        }

        /**
         * Decode an RSA SubjectPublicKeyInfo.
         * @param {Uint8Array} der
         * @returns {RsaPublicKeyParts|false}
         */
        function decodeSpkiRsa(der) {
            const kids = _seq(der);
            if (!kids || kids.length !== 2 || !_isRsaAlgId(kids[0])) return _rsaBad('not an RSA SPKI (rsaEncryption, NULL)');
            const bs = asn1.readBitString(kids[1]);
            if (!bs || bs.unusedBits !== 0) return _rsaBad('SPKI subjectPublicKey malformed');
            return decodeRsaPublicKey(bs.bytes);
        }

        /**
         * Wrap an RSA private key as PKCS#8 (version 0, rsaEncryption).
         * @param {RsaPrivateKeyParts} key
         * @returns {Uint8Array|false}
         */
        function encodePkcs8Rsa(key) {
            const pkcs1 = encodeRsaPrivateKey(key);
            if (pkcs1 === false) return false;
            return asn1.encodeSequence([asn1.encodeInteger(0), _rsaAlgId(), asn1.encodeOctetString(pkcs1)]);
        }

        /**
         * Decode an RSA PKCS#8 private key.
         * @param {Uint8Array} der
         * @returns {RsaPrivateKeyParts|false}
         */
        function decodePkcs8Rsa(der) {
            const kids = _seq(der);
            if (!kids || kids.length !== 3) return _rsaBad('PKCS#8 needs exactly version + algId + privateKey');
            const version = asn1.readInteger(kids[0]);
            if (!version || version.length !== 1 || version[0] !== 0) return _rsaBad('PKCS#8 version must be 0');
            if (!_isRsaAlgId(kids[1])) return _rsaBad('not an RSA PKCS#8 key (rsaEncryption, NULL)');
            if (kids[2].tag !== 0x04) return _rsaBad('PKCS#8 privateKey is not an OCTET STRING');
            return decodeRsaPrivateKey(kids[2].value);
        }

        return {
            OID,
            // Edwards (Ed25519 / X25519)
            encodePkcs8Edwards, decodePkcs8Edwards,
            encodeSpkiEdwards,  decodeSpkiEdwards,
            // EC (P-256/384/521)
            encodeSec1,         decodeSec1,
            encodePkcs8Ec,      decodePkcs8Ec,
            encodeSpkiEc,       decodeSpkiEc,
            // RSA (PKCS#1, SPKI, PKCS#8)
            encodeRsaPublicKey, decodeRsaPublicKey,
            encodeRsaPrivateKey, decodeRsaPrivateKey,
            encodeSpkiRsa,      decodeSpkiRsa,
            encodePkcs8Rsa,     decodePkcs8Rsa
        };
    }
};
