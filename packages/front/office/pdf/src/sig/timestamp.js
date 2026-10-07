// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview RFC 3161 / PAdES B-T timestamp token parser.
 *
 * A document-level timestamp token (PAdES B-T, ISO/TS 32001 §5.4) is a
 * RFC 3161 `TimeStampToken`, i.e. a CMS `SignedData` whose
 * `encapContentInfo` carries `id-ct-TSTInfo`
 * (`1.2.840.113549.1.9.16.1.4`). Inside `TSTInfo` (RFC 3161 §2.4.2)
 * we recover the policy, `messageImprint`, serial number, generation
 * time and optional nonce / TSA identity.
 *
 * @module pdf/sig/timestamp
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { asn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { rsa } from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc } from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 } from '@awacloud/fw/crypto/hash/sha512.js';

export const pdfTimestamp = {
    name: 'pdfTimestamp',
    dependencies: ['pdfErrors', 'pdfSigOids',
                   'asn1', 'rsa', 'ecc', 'ed25519',
                   'sha256', 'sha384', 'sha512'],
    deps: [pdfErrors, pdfSigOids, asn1, rsa, ecc, ed25519, sha256, sha384, sha512],
    factory(errors, sigOids, asn1, rsa, ecc, ed25519,
            sha256, sha384, sha512) {
        const { EncryptionError, ParseError } = errors;
        const {
            DIGEST_OIDS,
            SIG_DISPATCH_OIDS: SIG_OIDS,
            OID_TST_INFO,
            OID_AA_TIMESTAMP
        } = sigOids;
        const bundle = { asn1, rsa, ecc, ed25519, sha256, sha384, sha512 };

        function _parseGeneralizedTime(bytes) {
            if (!bytes || bytes.length < 14) return null;
            const s = String.fromCharCode.apply(null, Array.from(bytes));
            const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
            if (!m) return null;
            const d = new Date(Date.UTC(
                +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
            return isNaN(d.getTime()) ? null : d;
        }

        function _sliceTLV(buf) {
            if (!buf || buf.length < 2) return null;
            let lenLen = 1;
            let len = buf[1];
            if (len & 0x80) {
                const n = len & 0x7F;
                len = 0;
                for (let i = 0; i < n; i++) len = (len << 8) | buf[2 + i];
                lenLen = 1 + n;
            }
            return buf.subarray(0, 1 + lenLen + len);
        }

        function parseTimestampToken(blob, asn1Mod) {
            const a1 = asn1Mod || asn1;
            if (!(blob instanceof Uint8Array)) {
                throw new ParseError('pdf/ts/bad-input',
                    'parseTimestampToken expects a Uint8Array');
            }
            if (!a1 || typeof a1.parseOne !== 'function') {
                throw new EncryptionError('pdf/ts/missing-fw',
                    'parseTimestampToken requires the fw asn1 module');
            }
            const ci = a1.parseOne(blob, 0);
            if (!ci) {
                throw new ParseError('pdf/ts/malformed',
                    'ContentInfo parse failed');
            }
            const ciChildren = a1.parseChildren(ci.value);
            if (!ciChildren || ciChildren.length < 2) {
                throw new ParseError('pdf/ts/malformed',
                    'ContentInfo missing signedData');
            }
            const sdNode = a1.parseOne(ciChildren[1].value, 0);
            if (!sdNode) {
                throw new ParseError('pdf/ts/malformed',
                    'SignedData parse failed');
            }
            const sd = a1.parseChildren(sdNode.value);
            if (!sd) {
                throw new ParseError('pdf/ts/malformed',
                    'SignedData children parse failed');
            }
            const eci = sd[2] && a1.parseChildren(sd[2].value);
            if (!eci || eci.length < 2) {
                throw new ParseError('pdf/ts/no-econtent',
                    'TSTInfo encapContentInfo missing');
            }
            const eciTypeOid = a1.readOid(eci[0]);
            if (eciTypeOid !== OID_TST_INFO) {
                throw new ParseError('pdf/ts/wrong-econtent',
                    'eContentType is not id-ct-TSTInfo',
                    { context: { oid: eciTypeOid } });
            }
            const inner = a1.parseOne(eci[1].value, 0);
            if (!inner) {
                throw new ParseError('pdf/ts/no-tstinfo',
                    'TSTInfo OCTET STRING missing');
            }
            const tst = a1.parseOne(inner.value, 0);
            if (!tst) {
                throw new ParseError('pdf/ts/bad-tstinfo',
                    'TSTInfo parse failed');
            }
            const tstChildren = a1.parseChildren(tst.value);
            if (!tstChildren || tstChildren.length < 4) {
                throw new ParseError('pdf/ts/bad-tstinfo',
                    'TSTInfo too short');
            }
            const out = {
                version:      tstChildren[0].value[0] || 1,
                policy:       a1.readOid(tstChildren[1]),
                serialNumber: tstChildren[3].value,
                genTime:      null,
                messageImprint: null
            };
            const mi = a1.parseChildren(tstChildren[2].value);
            if (mi && mi.length >= 2) {
                const algChildren = a1.parseChildren(mi[0].value);
                const algOid = algChildren && algChildren[0]
                    ? a1.readOid(algChildren[0]) : null;
                out.messageImprint = {
                    hashAlg:      DIGEST_OIDS[algOid] || algOid,
                    hashedMessage: mi[1].value
                };
            }
            if (tstChildren[4]) {
                out.genTime = _parseGeneralizedTime(tstChildren[4].value);
            }
            for (let i = 5; i < tstChildren.length; i++) {
                const n = tstChildren[i];
                if (n.tag === 0x02) {
                    out.nonce = n.value;
                } else if (n.tag === 0xA0) {
                    out.tsa = n.value;
                }
            }
            return out;
        }

        function verifyTimestamp(tokenBlob, fwBundle) {
            const fb = fwBundle || bundle;
            if (!fb || !fb.asn1) {
                throw new EncryptionError('pdf/ts/missing-fw',
                    'verifyTimestamp requires fwBundle.asn1');
            }
            const errs = [];
            let parsed;
            try {
                parsed = parseTimestampToken(tokenBlob, fb.asn1);
            } catch (e) {
                errs.push({ code: e.code || 'pdf/ts/parse',
                            message: e.message,
                            cause: e });
                return { valid: false, errors: errs, tstInfo: null,
                         hashAlg: null, signatureAlg: null };
            }
            const ci = fb.asn1.parseOne(tokenBlob, 0);
            const ciKids = ci ? fb.asn1.parseChildren(ci.value) : null;
            const sdNode = ciKids && ciKids[1]
                ? fb.asn1.parseOne(ciKids[1].value, 0) : null;
            const sd = sdNode ? fb.asn1.parseChildren(sdNode.value) : null;
            let signatureAlg = null;
            if (sd) {
                let siSet = null;
                for (let i = sd.length - 1; i >= 0; i--) {
                    if (sd[i].tag === 0x31) { siSet = sd[i]; break; }
                }
                if (siSet) {
                    const signers = fb.asn1.parseChildren(siSet.value);
                    const si = signers && signers[0]
                        ? fb.asn1.parseChildren(signers[0].value) : null;
                    if (si) {
                        for (let i = 0; i < si.length - 1; i++) {
                            if (si[i].tag === 0x30 && si[i + 1].tag === 0x04) {
                                const algChildren =
                                    fb.asn1.parseChildren(si[i].value);
                                if (algChildren && algChildren[0]) {
                                    const oid = fb.asn1.readOid(algChildren[0]);
                                    signatureAlg = SIG_OIDS[oid] || null;
                                }
                                break;
                            }
                        }
                    }
                }
            }
            return {
                valid: errs.length === 0,
                errors: errs, tstInfo: parsed,
                hashAlg: parsed.messageImprint && parsed.messageImprint.hashAlg,
                signatureAlg
            };
        }

        function extractTimestampFromUnsignedAttrs(signedAttrs, asn1Mod) {
            const a1 = asn1Mod || asn1;
            if (!Array.isArray(signedAttrs)) return null;
            for (let i = 0; i < signedAttrs.length; i++) {
                const attr = a1.parseChildren(signedAttrs[i].value);
                if (!attr || attr.length < 2) continue;
                const oid = a1.readOid(attr[0]);
                if (oid !== OID_AA_TIMESTAMP) continue;
                const set = a1.parseChildren(attr[1].value);
                if (!set || !set.length) continue;
                return _sliceTLV(attr[1].value);
            }
            return null;
        }

        return {
            parseTimestampToken,
            verifyTimestamp,
            extractTimestampFromUnsignedAttrs,
            OID_TST_INFO, OID_AA_TIMESTAMP
        };
    }
};
