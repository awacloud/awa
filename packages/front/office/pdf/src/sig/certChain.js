// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview X.509 certificate chain extraction from a PKCS#7
 * SignedData blob.
 *
 * - `extractCertsFromCms(blob, asn1)` → typed records for each cert in
 *   the SignedData `certificates [0]` field.
 * - `extractCertFromPem(pem, pemMod, asn1)` → typed record from a PEM
 *   block.
 * - `findIssuer(cert, candidates)` / `validateChainOrder(chain)` →
 *   structural chain checks (subject = next.issuer), no signature
 *   verification at this layer.
 *
 * @module pdf/sig/certChain
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { asn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { pem } from '@awacloud/fw/crypto/utils/pem.js';

export const pdfCertChain = {
    name: 'pdfCertChain',
    dependencies: ['pdfErrors', 'pdfSigOids', 'asn1', 'pem'],
    deps: [pdfErrors, pdfSigOids, asn1, pem],
    factory(errors, sigOids, asn1, pem) {
        const { EncryptionError, ParseError } = errors;
        const {
            KEY_ALG_OIDS,
            SIG_ALG_OIDS_VERBOSE: SIG_ALG_OIDS,
            shortOid: _shortOid
        } = sigOids;

        function _parseUtcOrGeneralizedTime(node) {
            if (!node) return null;
            const s = String.fromCharCode.apply(null, Array.from(node.value));
            let yr, mo, da, hr, mi, se;
            if (node.tag === 0x17) {        // UTCTime: YYMMDDhhmmssZ
                const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
                if (!m) return null;
                yr = +m[1]; yr += yr < 50 ? 2000 : 1900;
                mo = +m[2] - 1; da = +m[3]; hr = +m[4]; mi = +m[5]; se = +m[6];
            } else if (node.tag === 0x18) { // GeneralizedTime: YYYYMMDDhhmmssZ
                const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
                if (!m) return null;
                yr = +m[1]; mo = +m[2] - 1; da = +m[3];
                hr = +m[4]; mi = +m[5]; se = +m[6];
            } else { return null; }
            return new Date(Date.UTC(yr, mo, da, hr, mi, se));
        }

        function _renderName(seqValue, asn1Mod) {
            const rdns = asn1Mod.parseChildren(seqValue);
            if (!rdns) return '';
            const parts = [];
            for (let i = 0; i < rdns.length; i++) {
                const set = asn1Mod.parseChildren(rdns[i].value);
                if (!set) continue;
                for (let j = 0; j < set.length; j++) {
                    const tv = asn1Mod.parseChildren(set[j].value);
                    if (!tv || tv.length < 2) continue;
                    const oid = asn1Mod.readOid(tv[0]);
                    const valBytes = tv[1].value;
                    const val = String.fromCharCode.apply(null, Array.from(valBytes));
                    parts.push(_shortOid(oid) + '=' + val);
                }
            }
            return parts.join(',');
        }

        function _reconstructDer(node, parentBuf) {
            const len = node.length;
            let lenLen;
            if (len < 0x80) lenLen = 1;
            else if (len < 0x100) lenLen = 2;
            else if (len < 0x10000) lenLen = 3;
            else if (len < 0x1000000) lenLen = 4;
            else lenLen = 5;
            return parentBuf.subarray(node.valueOff - 1 - lenLen, node.next);
        }

        function parseCertificate(der, asn1Mod) {
            const a1 = asn1Mod || asn1;
            const top = a1.parseOne(der, 0);
            if (!top) {
                throw new ParseError('pdf/cert/malformed',
                    'Certificate top-level SEQUENCE parse failed');
            }
            const cert = a1.parseChildren(top.value);
            if (!cert || cert.length < 3) {
                throw new ParseError('pdf/cert/short',
                    'Certificate has fewer than 3 children');
            }
            const tbs = a1.parseChildren(cert[0].value);
            if (!tbs) {
                throw new ParseError('pdf/cert/bad-tbs',
                    'tbsCertificate parse failed');
            }
            let idx = 0;
            let version = 1;
            if (tbs[idx] && tbs[idx].tag === 0xA0) {  // [0] EXPLICIT version
                const v = a1.parseOne(tbs[idx].value, 0);
                if (v && v.value && v.value.length) version = v.value[0] + 1;
                idx++;
            }
            const serialNode = tbs[idx++];
            idx++;
            const issuerNode = tbs[idx++];
            const validityNode = tbs[idx++];
            const subjectNode = tbs[idx++];
            const spkiNode = tbs[idx];
            const validity = a1.parseChildren(validityNode.value);
            const sigAlgChildren = a1.parseChildren(cert[1].value);
            const sigAlgOid = sigAlgChildren && sigAlgChildren[0]
                ? a1.readOid(sigAlgChildren[0]) : null;
            const spki = a1.parseChildren(spkiNode.value);
            const keyAlgChildren = spki && spki[0]
                ? a1.parseChildren(spki[0].value) : null;
            const keyAlgOid = keyAlgChildren && keyAlgChildren[0]
                ? a1.readOid(keyAlgChildren[0]) : null;
            return {
                version,
                serialNumber: serialNode ? serialNode.value : null,
                issuer:  _renderName(issuerNode.value, a1),
                subject: _renderName(subjectNode.value, a1),
                notBefore: validity ? _parseUtcOrGeneralizedTime(validity[0]) : null,
                notAfter:  validity ? _parseUtcOrGeneralizedTime(validity[1]) : null,
                publicKey: spki && spki[1] ? spki[1].value : null,
                keyAlgorithm: KEY_ALG_OIDS[keyAlgOid] || keyAlgOid,
                sigAlgorithm: SIG_ALG_OIDS[sigAlgOid] || sigAlgOid,
                raw: der
            };
        }

        function extractCertsFromCms(blob, asn1Mod, opts) {
            const a1 = asn1Mod || asn1;
            if (!(blob instanceof Uint8Array)) {
                throw new ParseError('pdf/cert/bad-input',
                    'extractCertsFromCms expects a Uint8Array');
            }
            if (!a1 || typeof a1.parseOne !== 'function') {
                throw new EncryptionError('pdf/cert/missing-fw',
                    'extractCertsFromCms requires the fw asn1 module');
            }
            const warnings = opts && Array.isArray(opts.warnings) ? opts.warnings : null;
            const ci = a1.parseOne(blob, 0);
            if (!ci) return [];
            const ciKids = a1.parseChildren(ci.value);
            if (!ciKids || ciKids.length < 2) return [];
            const sdNode = a1.parseOne(ciKids[1].value, 0);
            if (!sdNode) return [];
            const sd = a1.parseChildren(sdNode.value);
            if (!sd) return [];
            let certsField = null;
            for (let i = 0; i < sd.length; i++) {
                if (sd[i].tag === 0xA0) { certsField = sd[i]; break; }
            }
            if (!certsField) return [];
            const certs = a1.parseChildren(certsField.value);
            if (!certs) return [];
            const out = [];
            for (let i = 0; i < certs.length; i++) {
                if (certs[i].tag !== 0x30) continue;
                const der = _reconstructDer(certs[i], certsField.value);
                try {
                    out.push(parseCertificate(der, a1));
                } catch (e) {
                    if (warnings) {
                        warnings.push({
                            code: e && e.code ? e.code : 'pdf/cert/malformed',
                            message: 'skipped malformed cert at index ' + i
                                + ': ' + (e && e.message),
                            context: { index: i }
                        });
                    }
                }
            }
            return out;
        }

        function extractCertFromPem(pemString, pemMod, asn1Mod) {
            const pm = pemMod || pem;
            const a1 = asn1Mod || asn1;
            if (typeof pemString !== 'string') {
                throw new ParseError('pdf/cert/bad-pem-input',
                    'extractCertFromPem expects a string');
            }
            if (!pm || typeof pm.decode !== 'function') {
                throw new EncryptionError('pdf/cert/missing-pem',
                    'extractCertFromPem requires the fw pem module');
            }
            const dec = pm.decode(pemString);
            if (!dec || !dec.bytes) {
                throw new ParseError('pdf/cert/pem-decode-failed',
                    'PEM decode failed');
            }
            return parseCertificate(dec.bytes, a1);
        }

        function findIssuer(cert, candidates) {
            if (!cert || !Array.isArray(candidates)) return null;
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i] === cert) continue;
                if (candidates[i].subject === cert.issuer) return candidates[i];
            }
            return null;
        }

        function validateChainOrder(chain) {
            const errs = [];
            if (!Array.isArray(chain) || chain.length === 0) {
                errs.push({ code: 'pdf/cert/empty-chain',
                            message: 'chain must be a non-empty array' });
                return { valid: false, errors: errs };
            }
            for (let i = 0; i < chain.length - 1; i++) {
                if (chain[i].issuer !== chain[i + 1].subject) {
                    errs.push({
                        code: 'pdf/cert/chain-break',
                        message: 'cert[' + i + '].issuer != cert['
                            + (i + 1) + '].subject',
                        context: {
                            issuer: chain[i].issuer,
                            subject: chain[i + 1].subject
                        }
                    });
                }
            }
            return { valid: errs.length === 0, errors: errs };
        }

        return {
            extractCertsFromCms,
            extractCertFromPem,
            parseCertificate,
            findIssuer,
            validateChainOrder
        };
    }
};
