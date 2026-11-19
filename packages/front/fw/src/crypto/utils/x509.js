// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview X.509 v3 certificates (RFC 5280): create, parse, verify, PEM.
 *
 * Keys and signatures: Ed25519 (RFC 8410 — pure Ed25519 over the TBS bytes, no
 * AlgorithmIdentifier parameters) and ECDSA P-256 with SHA-256 (RFC 5758 —
 * `ecdsa-with-SHA256`, DER `SEQUENCE { r, s }`, RFC 6979 deterministic `k`).
 *
 *   - `create(spec, signer)` → DER, or `false` on any malformed input. Issuer
 *     defaults to the subject (self-signed); names from `CN`, `O`, `OU`, `L`,
 *     `ST`, `C`; UTCTime before 2050, GeneralizedTime from 2050 (§ 4.1.2.5);
 *     extensions `basicConstraints`, `keyUsage`, `extKeyUsage`,
 *     `subjectAltName` (DNS names, emails), `subjectKeyIdentifier`,
 *     `authorityKeyIdentifier` (key ids: the leftmost 160 bits of SHA-256 of
 *     the subjectPublicKey bits, RFC 7093 § 2 method 1 — fw has no SHA-1).
 *   - `parse(der)` → the TBS fields, or `false`.
 *   - `verify(der, issuerPublicKey)` → `true` when the issuer key signed it.
 *   - `toPem(der)` / `fromPem(text)` (`CERTIFICATE` label).
 *
 * Not claimed: path validation (chains, revocation, name constraints,
 * validity against a clock) — `verify` checks one signature; RSA keys.
 *
 * Seeded from the PAdES recipe (`apps/examples/recipes/pades-sign/x509.js`,
 * the same project's code).
 */

/**
 * A subject or issuer name: known attributes by short name; an attribute fw
 * does not name appears under its dotted OID, and a repeated one as an array.
 * @typedef {Record<string, string | string[]>} X509Name
 */

/**
 * @typedef {{ alg: 'Ed25519', key: Uint8Array } | { alg: 'ECDSA-P256', key: Uint8Array }} X509PublicKey
 *   Ed25519: the 32-byte key. ECDSA-P256: the 65-byte SEC1 uncompressed point.
 */

/**
 * @typedef {{ alg: 'Ed25519', privateKey: Uint8Array, publicKey?: Uint8Array } | { alg: 'ECDSA-P256', privateKey: Uint8Array, publicKey?: Uint8Array }} X509Signer
 *   Ed25519: the 64-byte private key (seed ‖ public key, as `ed25519.keyPair`
 *   returns it). ECDSA-P256: the 32-byte scalar. `publicKey` is the issuer's
 *   key, needed for `authorityKeyIdentifier`.
 */

/**
 * @typedef {object} X509Extensions
 * @property {{ ca: boolean, pathLen?: number }} [basicConstraints] Critical. `pathLen` only with `ca`.
 * @property {string[]} [keyUsage] Critical. Names: digitalSignature, nonRepudiation, keyEncipherment,
 *   dataEncipherment, keyAgreement, keyCertSign, cRLSign, encipherOnly, decipherOnly.
 * @property {string[]} [extKeyUsage] Dotted OIDs (e.g. `1.3.6.1.5.5.7.3.1` serverAuth).
 * @property {{ dns?: string[], email?: string[] }} [subjectAltName] ASCII values.
 * @property {boolean} [subjectKeyIdentifier]
 * @property {boolean} [authorityKeyIdentifier] Needs the issuer key (`signer.publicKey`, or the subject key when self-signed).
 */

/**
 * @typedef {object} X509Spec
 * @property {Record<string, string>} subject `{ CN, O, OU, L, ST, C }`, at least one; `C` two upper-case letters.
 * @property {Record<string, string>} [issuer] Defaults to `subject`.
 * @property {Uint8Array} serial Unsigned big-endian, positive, at most 20 encoded octets.
 * @property {Date} notBefore
 * @property {Date} notAfter Later than `notBefore`.
 * @property {X509PublicKey} publicKey The certified key.
 * @property {X509Extensions} [extensions]
 */

/**
 * @typedef {object} X509Parsed
 * @property {number} version 1, 2 or 3.
 * @property {Uint8Array} serial Unsigned big-endian.
 * @property {string} signatureAlgorithm `'Ed25519'`, `'ECDSA-SHA256'` or the dotted OID.
 * @property {X509Name} issuer
 * @property {X509Name} subject
 * @property {Date} notBefore
 * @property {Date} notAfter
 * @property {X509PublicKey | { alg: string, key: null, spki: Uint8Array }} publicKey
 * @property {object} extensions The six known ones decoded (each with `critical`), the rest in `other`.
 * @property {Uint8Array} tbs The signed TBSCertificate bytes.
 * @property {Uint8Array} signature
 */

/**
 * Public surface of `x509.factory()`.
 * @typedef {object} X509API
 * @property {(spec: X509Spec, signer: X509Signer) => (Uint8Array|false)} create Build and sign a certificate (DER).
 * @property {(der: Uint8Array) => (X509Parsed|false)} parse Read a certificate.
 * @property {(der: Uint8Array, issuerPublicKey: X509PublicKey) => boolean} verify Check the certificate's signature.
 * @property {(der: Uint8Array) => string} toPem PEM `CERTIFICATE` block.
 * @property {(text: string) => (Uint8Array|false)} fromPem DER of the first `CERTIFICATE` block.
 */

import { asn1 } from './asn1.js';
import { keyformat } from './keyformat.js';
import { pem } from './pem.js';
import { ed25519 } from '../pkc/ed25519.js';
import { ecc } from '../pkc/ecc.js';
import { sha256 } from '../hash/sha256.js';
import { bitArray } from './bitArray.js';

export const x509 = {
    name: 'x509',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['asn1', 'keyformat', 'pem', 'ed25519', 'ecc', 'sha256', 'bitArray'],
    deps: [asn1, keyformat, pem, ed25519, ecc, sha256, bitArray],

    /** @returns {X509API} */
    factory(asn1, keyformat, pem, ed25519, ecc, sha256, bitArray) {

        // ── constants (inside the factory: worker-serialisable) ──────────────
        const OID = {
            ED25519: '1.3.101.112',
            ECDSA_SHA256: '1.2.840.10045.4.3.2',
            EC_PUBKEY: '1.2.840.10045.2.1',
            P256: '1.2.840.10045.3.1.7',
            BASIC_CONSTRAINTS: '2.5.29.19',
            KEY_USAGE: '2.5.29.15',
            EXT_KEY_USAGE: '2.5.29.37',
            SUBJECT_ALT_NAME: '2.5.29.17',
            SUBJECT_KEY_ID: '2.5.29.14',
            AUTHORITY_KEY_ID: '2.5.29.35',
        };
        const NAME_OIDS = { CN: '2.5.4.3', O: '2.5.4.10', OU: '2.5.4.11', L: '2.5.4.7', ST: '2.5.4.8', C: '2.5.4.6' };
        const NAME_BY_OID = Object.fromEntries(Object.entries(NAME_OIDS).map(([k, v]) => [v, k]));
        const KEY_USAGES = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
            'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
        const T = { BOOLEAN: 0x01, INTEGER: 0x02, BIT_STRING: 0x03, OCTET_STRING: 0x04, OID: 0x06,
            UTF8: 0x0c, PRINTABLE: 0x13, TELETEX: 0x14, IA5: 0x16, UTC: 0x17, GENERALIZED: 0x18, BMP: 0x1e,
            SEQUENCE: 0x30, SET: 0x31 };
        const HEX = '0123456789abcdef';

        /** @param {string} why @returns {false} */
        function bad(why) {
            console.warn('[crypto] INVALID: x509: ' + why);
            return false;
        }

        /** A thrown marker for a malformed input inside `create` / `parse`. */
        class Invalid extends Error {}
        /** @param {string} why @returns {never} */
        function invalid(why) { throw new Invalid(why); }
        /** @template T @param {T|false} v @param {string} why @returns {T} */
        function must(v, why) { if (v === false || v === null || v === undefined) invalid(why); return /** @type {T} */ (v); }

        // ── DER pieces asn1 has no encoder for ────────────────────────────────

        /** One definite-length TLV (X.690 § 8.1.3). */
        function tlv(tag, body) {
            const n = body.length;
            const len = n < 0x80 ? [n]
                : n < 0x100 ? [0x81, n]
                : n < 0x10000 ? [0x82, n >> 8, n & 0xff]
                : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff];
            const out = new Uint8Array(1 + len.length + n);
            out[0] = tag;
            out.set(len, 1);
            out.set(body, 1 + len.length);
            return out;
        }
        const enc = (s) => new TextEncoder().encode(s);
        const dec = (b) => new TextDecoder('utf-8', { fatal: true }).decode(b);
        const toHex = (b) => { let s = ''; for (const x of b) s += HEX[x >> 4] + HEX[x & 15]; return s; };
        const seq = (items) => must(asn1.encodeSequence(items), 'SEQUENCE');

        // ── names (RFC 5280 § 4.1.2.4) ────────────────────────────────────────

        function encodeName(name) {
            if (!name || typeof name !== 'object') invalid('name must be an object');
            const keys = Object.keys(name);
            if (keys.length === 0) invalid('a name needs at least one attribute');
            const rdns = keys.map((k) => {
                const oid = NAME_OIDS[k];
                if (!oid) invalid('unknown name attribute ' + k);
                const v = name[k];
                if (typeof v !== 'string' || v.length === 0 || v.length > 64) invalid('name attribute ' + k + ' must be 1..64 characters');
                let value;
                if (k === 'C') {
                    if (!/^[A-Z]{2}$/.test(v)) invalid('C must be two upper-case letters');
                    value = tlv(T.PRINTABLE, enc(v));
                } else {
                    value = tlv(T.UTF8, enc(v));
                }
                return must(asn1.encodeSet([seq([must(asn1.encodeOid(oid), 'OID'), value])]), 'SET');
            });
            return seq(rdns);
        }

        function decodeString(node) {
            const v = node.value;
            if (node.tag === T.UTF8) return dec(v);
            if (node.tag === T.PRINTABLE || node.tag === T.IA5) { for (const x of v) if (x > 0x7e) invalid('non-ASCII string'); return dec(v); }
            if (node.tag === T.TELETEX) return String.fromCharCode(...v);
            if (node.tag === T.BMP) {
                if (v.length % 2) invalid('BMPString length');
                let s = ''; for (let i = 0; i < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]); return s;
            }
            return invalid('unsupported string tag 0x' + node.tag.toString(16));
        }

        function decodeName(node) {
            if (node.tag !== T.SEQUENCE) invalid('Name is not a SEQUENCE');
            /** @type {X509Name} */
            const out = {};
            for (const rdn of must(asn1.parseChildren(node.value), 'RDN')) {
                if (rdn.tag !== T.SET) invalid('RDN is not a SET');
                for (const atv of must(asn1.parseChildren(rdn.value), 'ATV')) {
                    const kv = must(asn1.parseChildren(atv.value), 'ATV');
                    if (atv.tag !== T.SEQUENCE || kv.length !== 2) invalid('AttributeTypeAndValue');
                    const oid = must(asn1.readOid(kv[0]), 'attribute OID');
                    const key = NAME_BY_OID[oid] || oid;
                    const value = decodeString(kv[1]);
                    const prev = out[key];
                    out[key] = prev === undefined ? value : [].concat(prev, value);
                }
            }
            return out;
        }

        // ── time (RFC 5280 § 4.1.2.5) ────────────────────────────────────────

        function encodeTime(d) {
            if (!(d instanceof Date) || Number.isNaN(d.getTime())) invalid('a validity bound is not a Date');
            const two = (n) => String(n).padStart(2, '0');
            const y = d.getUTCFullYear();
            if (y < 1950 || y > 9999) invalid('year out of range');
            const rest = two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()) + two(d.getUTCSeconds()) + 'Z';
            return y < 2050 ? tlv(T.UTC, enc(two(y % 100) + rest)) : tlv(T.GENERALIZED, enc(String(y) + rest));
        }

        function decodeTime(node) {
            const s = dec(node.value);
            let m;
            let year;
            if (node.tag === T.UTC && (m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
                year = Number(m[1]); year += year < 50 ? 2000 : 1900;
            } else if (node.tag === T.GENERALIZED && (m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
                year = Number(m[1]);
            } else {
                invalid('malformed time');
            }
            const t = Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
            return new Date(t);
        }

        // ── keys ──────────────────────────────────────────────────────────────

        /** The public point, validated on the curve and in the subgroup. */
        function ecPublic(point) {
            if (!(point instanceof Uint8Array) || point.length !== 65 || point[0] !== 0x04) invalid('ECDSA-P256 public key must be 65 bytes 04 || X || Y');
            return must(ecc.deserialize({ type: 'ecdsa', secretKey: false, curve: 'c256', point: toHex(point.subarray(1)) }), 'ECDSA-P256 point not on the curve');
        }

        function encodeSpki(pub) {
            if (!pub || typeof pub !== 'object') invalid('publicKey must be { alg, key }');
            if (pub.alg === 'Ed25519') {
                if (!(pub.key instanceof Uint8Array) || pub.key.length !== 32) invalid('Ed25519 public key must be 32 bytes');
                return must(keyformat.encodeSpkiEdwards(OID.ED25519, pub.key), 'SPKI');
            }
            if (pub.alg === 'ECDSA-P256') {
                ecPublic(pub.key);
                return must(keyformat.encodeSpkiEc(OID.P256, pub.key), 'SPKI');
            }
            return invalid('unknown key algorithm ' + pub.alg);
        }

        /** The subjectPublicKey BIT STRING contents of an SPKI (the key id's input). */
        function spkiKeyBits(spki) {
            const kids = must(asn1.parseChildren(must(asn1.parseOne(spki, 0), 'SPKI').value), 'SPKI');
            return must(asn1.readBitString(kids[1]), 'SPKI key').bytes;
        }

        const keyId = (spki) => bitArray.ba_to_ui8(sha256.hash(bitArray.ui8_to_ba(spkiKeyBits(spki)))).subarray(0, 20);

        function sigAlgOf(alg) {
            if (alg === 'Ed25519') return seq([must(asn1.encodeOid(OID.ED25519), 'OID')]);
            if (alg === 'ECDSA-P256') return seq([must(asn1.encodeOid(OID.ECDSA_SHA256), 'OID')]);
            return invalid('unknown signer algorithm ' + alg);
        }

        function sign(signer, tbs) {
            if (!signer || typeof signer !== 'object') invalid('signer must be { alg, privateKey }');
            if (signer.alg === 'Ed25519') {
                if (!(signer.privateKey instanceof Uint8Array) || signer.privateKey.length !== 64) invalid('Ed25519 private key must be 64 bytes (seed || public key)');
                return must(ed25519.sign(signer.privateKey, tbs), 'Ed25519 signing failed');
            }
            if (signer.alg === 'ECDSA-P256') {
                const d = signer.privateKey;
                if (!(d instanceof Uint8Array) || d.length !== 32 || d.every((x) => x === 0)) invalid('ECDSA-P256 private key must be a non-zero 32-byte scalar');
                const sec = must(ecc.deserialize({ type: 'ecdsa', secretKey: true, curve: 'c256', exponent: toHex(d) }), 'ECDSA-P256 private key');
                const rs = bitArray.ba_to_ui8(sec.sign(sha256.hash(bitArray.ui8_to_ba(tbs)), {}));   // RFC 6979
                if (rs.length !== 64) invalid('ECDSA signature length');
                return seq([must(asn1.encodeInteger(rs.subarray(0, 32)), 'r'), must(asn1.encodeInteger(rs.subarray(32)), 's')]);
            }
            return invalid('unknown signer algorithm ' + signer.alg);
        }

        // ── extensions (RFC 5280 § 4.2) ───────────────────────────────────────

        function extension(oid, critical, value) {
            const parts = [must(asn1.encodeOid(oid), 'OID')];
            if (critical) parts.push(tlv(T.BOOLEAN, Uint8Array.of(0xff)));
            parts.push(must(asn1.encodeOctetString(value), 'OCTET STRING'));
            return seq(parts);
        }

        function encodeExtensions(x, spki, issuerSpki) {
            if (x === undefined) return null;
            if (!x || typeof x !== 'object') invalid('extensions must be an object');
            const out = [];
            if (x.basicConstraints !== undefined) {
                const bc = x.basicConstraints;
                if (!bc || typeof bc.ca !== 'boolean') invalid('basicConstraints needs ca');
                const body = [];
                if (bc.ca) body.push(tlv(T.BOOLEAN, Uint8Array.of(0xff)));
                if (bc.pathLen !== undefined) {
                    if (!bc.ca) invalid('pathLen is only allowed with ca');
                    if (!Number.isInteger(bc.pathLen) || bc.pathLen < 0) invalid('pathLen must be a non-negative integer');
                    body.push(must(asn1.encodeInteger(bc.pathLen), 'pathLen'));
                }
                out.push(extension(OID.BASIC_CONSTRAINTS, true, seq(body)));
            }
            if (x.keyUsage !== undefined) {
                if (!Array.isArray(x.keyUsage) || x.keyUsage.length === 0) invalid('keyUsage must be a non-empty array');
                let high = -1;
                const bits = new Array(9).fill(0);
                for (const u of x.keyUsage) {
                    const i = KEY_USAGES.indexOf(u);
                    if (i < 0) invalid('unknown key usage ' + u);
                    bits[i] = 1;
                    high = Math.max(high, i);
                }
                const n = high + 1;
                const bytes = new Uint8Array(Math.ceil(n / 8));
                for (let i = 0; i < n; i++) if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
                out.push(extension(OID.KEY_USAGE, true, must(asn1.encodeBitString(bytes, bytes.length * 8 - n), 'keyUsage')));
            }
            if (x.extKeyUsage !== undefined) {
                if (!Array.isArray(x.extKeyUsage) || x.extKeyUsage.length === 0) invalid('extKeyUsage must be a non-empty array of OIDs');
                out.push(extension(OID.EXT_KEY_USAGE, false, seq(x.extKeyUsage.map((o) => must(asn1.encodeOid(String(o)), 'extKeyUsage OID')))));
            }
            if (x.subjectAltName !== undefined) {
                const san = x.subjectAltName || {};
                /** @type {Array<[number, Uint8Array]>} */
                const names = [];
                /** @type {Array<[string, number]>} */
                const kinds = [['email', 0x81], ['dns', 0x82]];
                for (const [field, tag] of kinds) {
                    for (const v of san[field] || []) {
                        if (typeof v !== 'string' || !/^[\x21-\x7e]+$/.test(v)) invalid('subjectAltName values are ASCII without spaces');
                        names.push([tag, tlv(tag, enc(v))]);
                    }
                }
                if (names.length === 0) invalid('subjectAltName needs a DNS name or an email');
                names.sort((a, b) => b[0] - a[0]);   // dNSName [2] first, as written by most tools
                out.push(extension(OID.SUBJECT_ALT_NAME, false, seq(names.map((n) => n[1]))));
            }
            if (x.subjectKeyIdentifier) {
                out.push(extension(OID.SUBJECT_KEY_ID, false, must(asn1.encodeOctetString(keyId(spki)), 'SKI')));
            }
            if (x.authorityKeyIdentifier) {
                if (!issuerSpki) invalid('authorityKeyIdentifier needs the issuer key (signer.publicKey)');
                out.push(extension(OID.AUTHORITY_KEY_ID, false, seq([tlv(0x80, keyId(issuerSpki))])));
            }
            return out.length ? must(asn1.encodeExplicit(3, seq(out)), 'extensions') : null;
        }

        function decodeExtensions(node) {
            const out = { other: [] };
            const list = must(asn1.parseChildren(node.value), 'extensions');
            if (list.length !== 1 || list[0].tag !== T.SEQUENCE) invalid('extensions');
            for (const ext of must(asn1.parseChildren(list[0].value), 'extensions')) {
                const k = must(asn1.parseChildren(ext.value), 'Extension');
                const oid = must(asn1.readOid(k[0]), 'extnID');
                let i = 1;
                let critical = false;
                if (k[i] && k[i].tag === T.BOOLEAN) { critical = k[i].value[0] !== 0; i++; }
                if (!k[i] || k[i].tag !== T.OCTET_STRING || i + 1 !== k.length) invalid('Extension');
                const inner = k[i].value;
                const kids = () => must(asn1.parseChildren(must(asn1.parseOne(inner, 0), 'extnValue').value), 'extnValue');
                if (oid === OID.BASIC_CONSTRAINTS) {
                    const c = kids();
                    const bc = { ca: false };
                    for (const e of c) {
                        if (e.tag === T.BOOLEAN) bc.ca = e.value[0] !== 0;
                        else if (e.tag === T.INTEGER) bc.pathLen = e.value.reduce((n, b) => n * 256 + b, 0);
                    }
                    out.basicConstraints = { ...bc, critical };
                } else if (oid === OID.KEY_USAGE) {
                    const bs = must(asn1.readBitString(must(asn1.parseOne(inner, 0), 'keyUsage')), 'keyUsage');
                    const usages = KEY_USAGES.filter((_, b) => (bs.bytes[b >> 3] || 0) & (0x80 >> (b & 7)));
                    out.keyUsage = { usages, critical };
                } else if (oid === OID.EXT_KEY_USAGE) {
                    out.extKeyUsage = { oids: kids().map((e) => must(asn1.readOid(e), 'EKU OID')), critical };
                } else if (oid === OID.SUBJECT_ALT_NAME) {
                    const san = { dns: [], email: [], critical };
                    for (const g of kids()) {
                        if (g.tag === 0x82) san.dns.push(dec(g.value));
                        else if (g.tag === 0x81) san.email.push(dec(g.value));
                    }
                    out.subjectAltName = san;
                } else if (oid === OID.SUBJECT_KEY_ID) {
                    out.subjectKeyIdentifier = { keyId: new Uint8Array(must(asn1.parseOne(inner, 0), 'SKI').value), critical };
                } else if (oid === OID.AUTHORITY_KEY_ID) {
                    const id = kids().find((e) => e.tag === 0x80);
                    out.authorityKeyIdentifier = { keyId: id ? new Uint8Array(id.value) : null, critical };
                } else {
                    out.other.push({ oid, critical, value: new Uint8Array(inner) });
                }
            }
            return out;
        }

        // ── create ────────────────────────────────────────────────────────────

        function create(spec, signer) {
            try {
                if (!spec || typeof spec !== 'object') invalid('spec must be an object');
                const serial = spec.serial;
                if (!(serial instanceof Uint8Array) || serial.every((x) => x === 0)) invalid('serial must be a positive big-endian integer');
                const serialDer = must(asn1.encodeInteger(serial), 'serial');
                if (serialDer.length - 2 > 20) invalid('serial longer than 20 octets');
                if (!(spec.notBefore instanceof Date) || !(spec.notAfter instanceof Date) || !(spec.notBefore < spec.notAfter)) {
                    invalid('notBefore must be a Date before notAfter');
                }
                const alg = signer && signer.alg;
                const sigAlg = sigAlgOf(alg);
                const subject = encodeName(spec.subject);
                const selfSigned = spec.issuer === undefined;
                const issuer = selfSigned ? subject : encodeName(spec.issuer);
                const spki = encodeSpki(spec.publicKey);
                const issuerKey = signer.publicKey ? { alg, key: signer.publicKey } : (selfSigned ? spec.publicKey : null);
                const issuerSpki = issuerKey ? encodeSpki(issuerKey) : null;
                const parts = [
                    must(asn1.encodeExplicit(0, must(asn1.encodeInteger(2), 'version')), 'version'),
                    serialDer,
                    sigAlg,
                    issuer,
                    seq([encodeTime(spec.notBefore), encodeTime(spec.notAfter)]),
                    subject,
                    spki,
                ];
                const ext = encodeExtensions(spec.extensions, spki, issuerSpki);
                if (ext) parts.push(ext);
                const tbs = seq(parts);
                const sig = sign(signer, tbs);
                return seq([tbs, sigAlg, must(asn1.encodeBitString(sig, 0), 'signature')]);
            } catch (e) {
                if (e instanceof Invalid) return bad(e.message);
                return bad('create failed: ' + (e && e.message));
            }
        }

        // ── parse ─────────────────────────────────────────────────────────────

        /** Split a certificate into its parts; throws `Invalid`. */
        function split(der) {
            if (!(der instanceof Uint8Array)) invalid('DER must be a Uint8Array');
            const top = must(asn1.parseOne(der, 0), 'certificate');
            if (top.tag !== T.SEQUENCE || top.next !== der.length) invalid('certificate is not one SEQUENCE');
            const c = must(asn1.parseChildren(top.value), 'certificate');
            if (c.length !== 3 || c[0].tag !== T.SEQUENCE || c[1].tag !== T.SEQUENCE) invalid('certificate needs tbs, algorithm, signature');
            const sig = must(asn1.readBitString(c[2]), 'signature');
            if (sig.unusedBits !== 0) invalid('signature has unused bits');
            const tbs = top.value.subarray(0, c[0].next);
            const algBytes = top.value.subarray(c[0].next, c[1].next);
            return { c, tbs, algBytes, signature: new Uint8Array(sig.bytes) };
        }

        function algName(node) {
            const oid = must(asn1.readOid(must(asn1.parseChildren(node.value), 'algorithm')[0]), 'algorithm OID');
            return oid === OID.ED25519 ? 'Ed25519' : oid === OID.ECDSA_SHA256 ? 'ECDSA-SHA256' : oid;
        }

        /** @returns {X509Parsed['publicKey']} */
        function decodeSpki(node, raw) {
            const k = must(asn1.parseChildren(node.value), 'SPKI');
            const algKids = must(asn1.parseChildren(k[0].value), 'SPKI algorithm');
            const oid = asn1.readOid(algKids[0]);
            if (oid === OID.ED25519) {
                const e = must(keyformat.decodeSpkiEdwards(raw), 'Ed25519 SPKI');
                return /** @type {X509PublicKey} */ ({ alg: 'Ed25519', key: e.publicKey });
            }
            if (oid === OID.EC_PUBKEY && algKids[1] && asn1.readOid(algKids[1]) === OID.P256) {
                const e = must(keyformat.decodeSpkiEc(raw), 'EC SPKI');
                return /** @type {X509PublicKey} */ ({ alg: 'ECDSA-P256', key: e.point });
            }
            return { alg: String(oid), key: null, spki: new Uint8Array(raw) };
        }

        function parse(der) {
            try {
                const { c, tbs, signature } = split(der);
                const t = must(asn1.parseChildren(c[0].value), 'tbs');
                let i = 0;
                let version = 1;
                if (t[0] && t[0].tag === 0xa0) {
                    const v = must(asn1.readInteger(must(asn1.parseOne(t[0].value, 0), 'version')), 'version');
                    version = v[v.length - 1] + 1;
                    i = 1;
                }
                const serialRaw = must(asn1.readInteger(t[i]), 'serial');
                let s = 0;
                while (s < serialRaw.length - 1 && serialRaw[s] === 0) s++;
                const algo = algName(t[i + 1]);
                const issuer = decodeName(t[i + 2]);
                const validity = must(asn1.parseChildren(t[i + 3].value), 'validity');
                if (validity.length !== 2) invalid('validity');
                const subject = decodeName(t[i + 4]);
                const spkiNode = t[i + 5];
                if (!spkiNode) invalid('subjectPublicKeyInfo');
                const spkiRaw = c[0].value.subarray(t[i + 4].next, spkiNode.next);
                const publicKey = decodeSpki(spkiNode, spkiRaw);
                let extensions = { other: [] };
                for (const extra of t.slice(i + 6)) if (extra.tag === 0xa3) extensions = decodeExtensions(extra);
                return {
                    version,
                    serial: new Uint8Array(serialRaw.subarray(s)),
                    signatureAlgorithm: algo,
                    issuer,
                    subject,
                    notBefore: decodeTime(validity[0]),
                    notAfter: decodeTime(validity[1]),
                    publicKey,
                    extensions,
                    tbs: new Uint8Array(tbs),
                    signature,
                };
            } catch (e) {
                if (e instanceof Invalid) return bad(e.message);
                return bad('parse failed: ' + (e && e.message));
            }
        }

        // ── verify ────────────────────────────────────────────────────────────

        function verify(der, issuerPublicKey) {
            try {
                const { c, tbs, algBytes, signature } = split(der);
                const t = must(asn1.parseChildren(c[0].value), 'tbs');
                const at = t[0] && t[0].tag === 0xa0 ? 2 : 1;   // [version] serial signature …
                if (!t[at]) return false;
                const innerBytes = c[0].value.subarray(t[at - 1].next, t[at].next);
                if (innerBytes.length !== algBytes.length || innerBytes.some((b, k) => b !== algBytes[k])) return false;   // RFC 5280 § 4.1.1.2
                const alg = algName(c[1]);
                if (!issuerPublicKey || typeof issuerPublicKey !== 'object') return false;
                if (alg === 'Ed25519' && issuerPublicKey.alg === 'Ed25519') {
                    if (!(issuerPublicKey.key instanceof Uint8Array) || issuerPublicKey.key.length !== 32 || signature.length !== 64) return false;
                    return ed25519.verify(issuerPublicKey.key, signature, tbs) === true;
                }
                if (alg === 'ECDSA-SHA256' && issuerPublicKey.alg === 'ECDSA-P256') {
                    const pub = ecPublic(issuerPublicKey.key);
                    const top = must(asn1.parseOne(signature, 0), 'ECDSA signature');
                    if (top.tag !== T.SEQUENCE || top.next !== signature.length) return false;
                    const rs = must(asn1.parseChildren(top.value), 'ECDSA signature');
                    if (rs.length !== 2) return false;
                    const fixed = new Uint8Array(64);
                    for (const [j, node] of rs.entries()) {
                        const raw = must(asn1.readInteger(node), 'r / s');
                        if (raw[0] & 0x80) return false;
                        let z = 0; while (z < raw.length - 1 && raw[z] === 0) z++;
                        const v = raw.subarray(z);
                        if (v.length > 32) return false;
                        fixed.set(v, j * 32 + 32 - v.length);
                    }
                    return pub.verify(sha256.hash(bitArray.ui8_to_ba(tbs)), bitArray.ui8_to_ba(fixed)) === true;
                }
                return false;
            } catch (e) {
                if (!(e instanceof Invalid)) bad('verify failed: ' + (e && e.message));
                return false;
            }
        }

        // ── PEM ───────────────────────────────────────────────────────────────

        function toPem(der) {
            return pem.encode(der, 'CERTIFICATE');
        }

        function fromPem(text) {
            if (typeof text !== 'string') return bad('PEM must be a string');
            const r = pem.decode(text, 'CERTIFICATE');
            return r ? r.bytes : false;
        }

        return { create, parse, verify, toPem, fromPem };
    }
};
