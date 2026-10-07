// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Digital signature dict typing + PKCS#7 detached blob
 * verification (ISO 32000-2:2020 §12.8 + ISO/TS 32001 / 32002).
 *
 * - `typeSignature(dict)` → typed record from a `/Type /Sig` or
 *   `/Type /DocTimeStamp` dictionary.
 * - `verifySignature(typedSig, documentBytes, fwBundle)` → digests the
 *   ByteRange-covered bytes and dispatches to the fw verifier matching
 *   the PKCS#7 SignerInfo's digest + signature OIDs. A `/Sig` also passes
 *   only when its ByteRange gap is exactly the `/Contents` value: the
 *   whole `<…>` token or its hex digits. `verifyAllSignatures`
 *   applies the same rule to each `/DocTimeStamp` and reports the
 *   accepted form as `gapForm` on its `timestamps[]` entries.
 *
 * Chain validation, revocation and network I/O are out of scope.
 *
 * @module pdf/sig/signature
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfSigOids } from './oids.js';
import { asn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { rsa } from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc } from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

export const pdfSignature = {
    name: 'pdfSignature',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfSigOids',
                   'asn1', 'rsa', 'ecc', 'ed25519',
                   'sha256', 'sha384', 'sha512', 'bitArray'],
    deps: [pdfErrors, pdfParser, pdfSigOids, asn1, rsa, ecc, ed25519, sha256, sha384, sha512, bitArray],
    factory(errors, parser, sigOids, asn1, rsa, ecc, ed25519,
            sha256, sha384, sha512, bitArray) {
        const { EncryptionError, ParseError } = errors;
        const { isType } = parser;
        const {
            DIGEST_OIDS,
            SIG_DISPATCH_OIDS: SIG_OIDS
        } = sigOids;
        const bundle = { asn1, rsa, ecc, ed25519,
                         sha256, sha384, sha512, bitArray };

        const KNOWN_SUBFILTERS = new Set([
            'adbe.x509.rsa_sha1', 'adbe.pkcs7.detached', 'adbe.pkcs7.sha1',
            'ETSI.CAdES.detached', 'ETSI.RFC3161'
        ]);

        function typeSignature(dict, refInfo) {
            const ctxBase = refInfo
                ? { objNum: refInfo.objNum, objGen: refInfo.objGen }
                : null;
            function ctx(extra) {
                if (!ctxBase && !extra) return undefined;
                return Object.assign({}, ctxBase, extra);
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/sig/not-dict',
                    'signature must be a dictionary',
                    { context: ctx({ type: dict && dict.type }) });
            }
            const e = dict.entries;
            const typeName = e.Type && e.Type.type === 'name' ? e.Type.value : null;
            if (typeName && typeName !== 'Sig' && typeName !== 'DocTimeStamp') {
                throw new ParseError('pdf/sig/bad-type',
                    '/Type must be /Sig or /DocTimeStamp',
                    { context: ctx({ actual: typeName }) });
            }
            if (!e.Filter || e.Filter.type !== 'name') {
                throw new ParseError('pdf/sig/missing-filter',
                    'signature missing /Filter',
                    ctxBase ? { context: ctxBase } : undefined);
            }
            if (!e.SubFilter || e.SubFilter.type !== 'name') {
                throw new ParseError('pdf/sig/missing-subfilter',
                    'signature missing /SubFilter',
                    ctxBase ? { context: ctxBase } : undefined);
            }
            if (!KNOWN_SUBFILTERS.has(e.SubFilter.value)) {
                throw new ParseError('pdf/sig/unknown-subfilter',
                    'unknown /SubFilter',
                    { context: ctx({ subFilter: e.SubFilter.value }) });
            }
            if (!e.Contents || e.Contents.type !== 'string') {
                throw new ParseError('pdf/sig/missing-contents',
                    '/Contents (hex PKCS#7 blob) missing',
                    ctxBase ? { context: ctxBase } : undefined);
            }
            if (!e.ByteRange || e.ByteRange.type !== 'array') {
                throw new ParseError('pdf/sig/missing-byterange',
                    '/ByteRange missing',
                    ctxBase ? { context: ctxBase } : undefined);
            }
            const br = e.ByteRange.items.map((n) => (n && typeof n.value === 'number')
                ? n.value : 0);
            if (br.length !== 4) {
                throw new ParseError('pdf/sig/bad-byterange',
                    '/ByteRange must have exactly 4 integers',
                    { context: ctx({ length: br.length }) });
            }
            function str(k) {
                const v = e[k];
                if (!v) return undefined;
                if (v.type === 'string') return v.value;
                if (v.type === 'name')   return v.value;
                return undefined;
            }
            return {
                kind: typeName || 'Sig',
                filter:      e.Filter.value,
                subFilter:   e.SubFilter.value,
                contents:    e.Contents.value,
                byteRange:   br,
                reference:   e.Reference && e.Reference.type === 'array'
                             ? e.Reference.items : undefined,
                cert:        e.Cert,
                name:        str('Name'),
                m:           str('M'),
                location:    str('Location'),
                reason:      str('Reason'),
                contactInfo: str('ContactInfo'),
                v:           e.V && e.V.type === 'int' ? e.V.value : undefined,
                propBuild:   e.Prop_Build,
                propAuthTime: e.Prop_AuthTime && e.Prop_AuthTime.type === 'int'
                              ? e.Prop_AuthTime.value : undefined,
                propAuthType: str('Prop_AuthType'),
                raw: dict
            };
        }

        function locatePkcs7(blob, asn1Mod) {
            const a1 = asn1Mod || asn1;
            if (!(blob instanceof Uint8Array)) return false;
            const top = a1.parseOne(blob, 0);
            if (!top) return false;
            const outer = a1.parseChildren(top.value);
            if (!outer || outer.length < 2) return false;
            const explicit = outer[1];
            const inner = a1.parseOne(explicit.value, 0);
            if (!inner) return false;
            return a1.parseChildren(inner.value);
        }

        function _concatRange(bytes, br) {
            const [a, b, c, d] = br;
            const total = bytes.length;
            if (a < 0 || b < 0 || c < 0 || d < 0
                || a + b > total
                || c + d > total
                || c < a + b) {
                throw new ParseError('pdf/sig/byterange/inconsistent',
                    '_concatRange refusing inconsistent ByteRange',
                    { context: { a, b, c, d, total } });
            }
            const out = new Uint8Array(b + d);
            out.set(bytes.subarray(a, a + b), 0);
            out.set(bytes.subarray(c, c + d), b);
            return out;
        }

        function _hashByteRange(bytes, br, hashMod, bitArrayMod) {
            const ba = bitArrayMod || bitArray;
            if (hashMod && typeof hashMod.fn === 'function'
                && ba && typeof ba.ui8_to_ba === 'function') {
                const a = br[0] | 0, b = br[1] | 0;
                const c = br[2] | 0, d = br[3] | 0;
                const total = bytes.length;
                if (a < 0 || b < 0 || c < 0 || d < 0
                    || a + b > total || c + d > total || c < a + b) {
                    throw new ParseError('pdf/sig/byterange/inconsistent',
                        '_hashByteRange refusing inconsistent ByteRange',
                        { context: { a, b, c, d, total } });
                }
                const ctx = new hashMod.fn();
                ctx.update(ba.ui8_to_ba(bytes.subarray(a, a + b)));
                ctx.update(ba.ui8_to_ba(bytes.subarray(c, c + d)));
                const out = ctx.finalize();
                return out instanceof Uint8Array ? out : ba.ba_to_ui8(out);
            }
            if (!ba || typeof ba.ui8_to_ba !== 'function'
                || typeof ba.ba_to_ui8 !== 'function') {
                throw new ParseError('pdf/sig/byterange/no-bitarray',
                    '_hashByteRange fallback requires a live bitArray API '
                        + '(ui8_to_ba/ba_to_ui8) to hash identical bit '
                        + 'content to the streaming path',
                    { context: { hasBitArrayApi: !!ba } });
            }
            const raw = hashMod.hash(ba.ui8_to_ba(_concatRange(bytes, br)));
            return raw instanceof Uint8Array ? raw : ba.ba_to_ui8(raw);
        }

        // ── /ByteRange gap check ─────────────────────────────────────
        //
        // The gap `[a+b, c)` must be exactly the `/Contents` value: the
        // whole `<…>` token (form b — ISO 32000-2 §12.8.3.3.1, what
        // pdfSign emits) or its hex digits only (form a — what earlier
        // pdfSign releases emitted). Any other gap is refused with the codes
        // pdfByteRange.auditByteRange uses, measured against the token
        // bounds; the rule is restated here because pdfSignature does not
        // depend on pdfByteRange. The digest is always taken over the
        // ranges the file declares.
        const GAP_START = 'pdf/sig/byterange/gap-start-mismatch';
        const GAP_END   = 'pdf/sig/byterange/gap-end-mismatch';

        function _isPdfWs(b) {
            return b === 0x00 || b === 0x09 || b === 0x0A || b === 0x0C
                || b === 0x0D || b === 0x20;
        }

        function _isHexOrWs(b) {
            return (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46)
                || (b >= 0x61 && b <= 0x66) || _isPdfWs(b);
        }

        // Hex-digit span of the `/Contents <…>` token the gap sits on,
        // found from the bytes alone (a typed dict carries no file
        // offsets), or null when the gap sits on no `/Contents` value.
        function _contentsSpanFromGap(bytes, gapStart, gapEnd) {
            const n = bytes.length;
            if (!(gapStart >= 0 && gapEnd > gapStart && gapEnd <= n)) return null;
            let i = gapStart + ((gapEnd - gapStart) >> 1);
            if (bytes[i] === 0x3E) i--;                         // on '>'
            while (i >= 0 && _isHexOrWs(bytes[i])) i--;
            if (i < 0 || bytes[i] !== 0x3C) return null;        // '<'
            const lt = i;
            let j = lt + 1;
            while (j < n && _isHexOrWs(bytes[j])) j++;
            if (j >= n || bytes[j] !== 0x3E) return null;       // '>'
            let k = lt - 1;
            while (k >= 0 && _isPdfWs(bytes[k])) k--;
            const KEY = '/Contents';
            const keyAt = k - KEY.length + 1;
            if (keyAt < 0) return null;
            for (let q = 0; q < KEY.length; q++) {
                if (bytes[keyAt + q] !== KEY.charCodeAt(q)) return null;
            }
            return { offset: lt + 1, length: j - lt - 1 };
        }

        // Gap check for `byteRange` against the `/Contents` digit span
        // `span`: `issues` is `[]` and `gapForm` names the form when the
        // gap is exactly form (b) (`'token'`) or form (a) (`'digits'`);
        // otherwise `gapForm` is null and `issues` carries the gap codes.
        // One comparison serves both verify paths (/Sig and
        // /DocTimeStamp); `gapForm` uses pdfByteRange's
        // vocabulary.
        function _gapCheck(byteRange, span) {
            const gapStart = (byteRange[0] | 0) + (byteRange[1] | 0);
            const gapEnd = byteRange[2] | 0;
            const tokenStart = span ? span.offset - 1 : null;
            const tokenEnd = span ? span.offset + span.length + 1 : null;
            if (span && gapStart === tokenStart && gapEnd === tokenEnd) {
                return { issues: [], gapForm: 'token' };
            }
            if (span && gapStart === span.offset
                && gapEnd === span.offset + span.length) {
                return { issues: [], gapForm: 'digits' };
            }
            const issues = [];
            if (gapStart !== tokenStart) {
                issues.push({ code: GAP_START,
                    message: 'first range end does not align with /Contents '
                        + 'literal start',
                    context: { firstEnd: gapStart, expected: tokenStart } });
            }
            if (gapEnd !== tokenEnd) {
                issues.push({ code: GAP_END,
                    message: 'second range start does not align with /Contents '
                        + 'literal end',
                    context: { secondStart: gapEnd, expected: tokenEnd } });
            }
            return { issues, gapForm: null };
        }

        function _result(verified, errs, signerCerts, hashAlg, signatureAlg,
                         pkVerified, computedDigest) {
            return {
                verified: !!verified,
                valid:    !!verified,   // deprecated alias of `verified`, removed in a future major version
                pkVerified: !!pkVerified,
                errors: errs, signerCerts, hashAlg, signatureAlg,
                computedDigest: computedDigest || null
            };
        }

        /**
         * Verify one typed `/Sig` dictionary against the document bytes.
         *
         * @param {object} typedSig A record from `typeSignature`.
         * @param {Uint8Array} documentBytes The whole document.
         * @param {object} [fwBundle] Optional fw crypto bundle (the module
         *   carries its own default).
         * @returns {{
         *   verified: boolean,
         *   valid: boolean,
         *   pkVerified: boolean,
         *   errors: Array<{code: string, message: string}>,
         *   signerCerts: Array<{der: Uint8Array}>,
         *   hashAlg: (string|null),
         *   signatureAlg: (string|null),
         *   computedDigest: (Uint8Array|null)
         * }} The verification result. `valid` is deprecated: same value as
         *   `verified`; kept for compatibility, will be removed in a future
         *   major version; read `verified`.
         */
        function verifySignature(typedSig, documentBytes, fwBundle) {
            return _verifySig(typedSig, documentBytes, fwBundle, null);
        }

        // `contentsSpan`: the `/Contents` hex-digit span when the caller
        // located it in the file (verifyAllSignatures); null → found from
        // the gap itself.
        function _verifySig(typedSig, documentBytes, fwBundle, contentsSpan) {
            const fb = fwBundle || bundle;
            if (!fb || !fb.asn1) {
                throw new EncryptionError('pdf/sig/missing-fw',
                    'verifySignature requires fwBundle.asn1');
            }
            const errs = [];
            const sd = locatePkcs7(typedSig.contents, fb.asn1);
            if (!sd) {
                errs.push({ code: 'pdf/sig/pkcs7-malformed',
                            message: 'PKCS#7 SignedData parse failed' });
                return _result(false, errs, [], null, null, false);
            }
            // Detached PKCS#7 (PDF /Sig) : there is no eContent inside the
            // PKCS#7 — the "content" that was hashed for signedAttrs.
            // messageDigest is the ByteRange-covered bytes of the PDF. So
            // we pass eContentBytes=null and supply the precomputed digest
            // + the raw ByteRange bytes (used when signedAttrs is absent).
            const r = _verifyPkcs7Signature(sd, null, fb, 'pdf/sig', {
                byteRangeDocument: documentBytes,
                byteRange: typedSig.byteRange
            });
            for (const er of r.errors) errs.push(er);
            const br = typedSig.byteRange;
            const span = contentsSpan
                || (documentBytes instanceof Uint8Array && Array.isArray(br)
                    ? _contentsSpanFromGap(documentBytes,
                        (br[0] | 0) + (br[1] | 0), br[2] | 0)
                    : null);
            const gap = _gapCheck(br || [], span).issues;
            for (const g of gap) errs.push(g);
            return _result(r.verified && gap.length === 0, errs, r.signerCerts,
                r.hashAlg, r.signatureAlg, r.pkVerified, r.computedDigest);
        }

        // ── SignerInfo dissection helpers ────────────────────────────
        function _dissectSignerInfo(si) {
            // si is the parsed children of the first SignerInfo SEQUENCE.
            // Walk positionally with safeguards.
            if (!si || si.length < 5) {
                return { ok: false,
                         code: 'pdf/sig/signer-info-short',
                         message: 'SignerInfo has fewer than 5 fields' };
            }
            // [0] version, [1] sid, [2] digestAlg, [3]? signedAttrs,
            // [n-2] sigAlg, [n-1] signature, [n]? unsignedAttrs.
            const version = si[0];
            const sid     = si[1];
            const digAlg  = si[2];
            void version; void digAlg;
            let idx = 3;
            let signedAttrsNode = null;
            if (si[idx] && si[idx].tag === 0xA0) {
                signedAttrsNode = si[idx];
                idx++;
            }
            const sigAlg = si[idx]; idx++;
            const sigVal = si[idx]; idx++;
            void sigAlg;
            if (!sigVal || sigVal.tag !== 0x04) {
                return { ok: false,
                         code: 'pdf/sig/no-encrypted-digest',
                         message: 'SignerInfo signature OCTET STRING missing' };
            }
            let unsignedAttrsNode = null;
            if (si[idx] && si[idx].tag === 0xA1) {
                unsignedAttrsNode = si[idx];
            }
            void unsignedAttrsNode;
            // Reconstruct the raw signedAttrs TLV (needed for hashing).
            let signedAttrsRaw = null;
            let signedAttrsValueBytes = null;
            if (signedAttrsNode) {
                signedAttrsValueBytes = signedAttrsNode.value;
                // Re-emit the TLV.
                signedAttrsRaw = _reencodeTlv(
                    signedAttrsNode.tag, signedAttrsNode.value);
            }
            return {
                ok: true,
                sid,
                encryptedDigest: new Uint8Array(sigVal.value),
                signedAttrsRaw,
                signedAttrsValueBytes
            };
        }

        function _reencodeTlv(tag, value) {
            const lenBytes = _encLen(value.length);
            const out = new Uint8Array(1 + lenBytes.length + value.length);
            out[0] = tag;
            out.set(lenBytes, 1);
            out.set(value, 1 + lenBytes.length);
            return out;
        }

        function _encLen(n) {
            if (n < 0x80) return Uint8Array.of(n);
            if (n <= 0xff) return Uint8Array.of(0x81, n);
            if (n <= 0xffff) return Uint8Array.of(0x82,
                (n >>> 8) & 0xff, n & 0xff);
            if (n <= 0xffffff) return Uint8Array.of(0x83,
                (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
            return Uint8Array.of(0x84,
                (n >>> 24) & 0xff, (n >>> 16) & 0xff,
                (n >>> 8) & 0xff, n & 0xff);
        }

        function _checkSignedAttrsDigest(saValueBytes, expectedDigest, a1) {
            // saValueBytes is the inner value of the signedAttrs SET (no
            // outer tag). Walk attributes; find OID 1.2.840.113549.1.9.4
            // (id-messageDigest) → SET OF { OCTET STRING }.
            const attrs = a1.parseChildren(saValueBytes);
            if (!attrs) {
                return { ok: false,
                         code: 'pdf/sig/signed-attrs-parse-failed',
                         message: 'failed to parse signedAttrs SET' };
            }
            const OID_MD = '1.2.840.113549.1.9.4';
            for (let i = 0; i < attrs.length; i++) {
                const a = a1.parseChildren(attrs[i].value);
                if (!a || a.length < 2) continue;
                const oid = a1.readOid(a[0]);
                if (oid !== OID_MD) continue;
                const vals = a1.parseChildren(a[1].value);
                if (!vals || !vals.length || vals[0].tag !== 0x04) continue;
                const md = vals[0].value;
                if (!expectedDigest) {
                    return { ok: false,
                             code: 'pdf/sig/digest-not-computed',
                             message: 'recomputed digest unavailable for '
                                + 'signedAttrs comparison' };
                }
                if (md.length !== expectedDigest.length) {
                    return { ok: false,
                             code: 'pdf/sig/digest-length-mismatch',
                             message: 'messageDigest length mismatch' };
                }
                for (let j = 0; j < md.length; j++) {
                    if (md[j] !== expectedDigest[j]) {
                        return { ok: false,
                                 code: 'pdf/sig/digest-mismatch',
                                 message: 'signedAttrs.messageDigest does '
                                    + 'not match ByteRange digest' };
                    }
                }
                return { ok: true };
            }
            return { ok: false,
                     code: 'pdf/sig/no-message-digest-attr',
                     message: 'signedAttrs lacks messageDigest attribute' };
        }

        function _findSignerCert(sd, sidNode, a1) {
            // Find certificates [0] IMPLICIT field in the SignedData
            // children. Each child cert is a SEQUENCE — reconstruct its
            // DER and parse its IssuerAndSerial to match sid.
            let certsField = null;
            for (let i = 0; i < sd.length; i++) {
                if (sd[i].tag === 0xA0) { certsField = sd[i]; break; }
            }
            if (!certsField) return null;
            const certs = a1.parseChildren(certsField.value);
            if (!certs) return null;
            // Parse sid (IssuerAndSerialNumber ::= SEQUENCE { Name, INTEGER }).
            const sidKids = sidNode && sidNode.tag === 0x30
                ? a1.parseChildren(sidNode.value) : null;
            const wantIssuerVal = sidKids && sidKids[0]
                ? sidKids[0].value : null;
            const wantSerialVal = sidKids && sidKids[1]
                ? sidKids[1].value : null;
            for (let i = 0; i < certs.length; i++) {
                if (certs[i].tag !== 0x30) continue;
                const certDer = _reconstructDer(certs[i], certsField.value);
                if (!wantIssuerVal || !wantSerialVal) {
                    // No sid match info — return the first cert.
                    return { der: certDer };
                }
                const match = _certMatchesIssuerSerial(
                    certDer, wantIssuerVal, wantSerialVal, a1);
                if (match) return { der: certDer };
            }
            // Fallback : if any cert exists, return the first.
            for (let i = 0; i < certs.length; i++) {
                if (certs[i].tag === 0x30) {
                    return { der: _reconstructDer(certs[i], certsField.value) };
                }
            }
            return null;
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

        function _certMatchesIssuerSerial(certDer, wantIssuerVal,
                                          wantSerialVal, a1) {
            const top = a1.parseOne(certDer, 0);
            if (!top) return false;
            const certKids = a1.parseChildren(top.value);
            if (!certKids || !certKids[0]) return false;
            const tbs = a1.parseChildren(certKids[0].value);
            if (!tbs) return false;
            let idx = 0;
            if (tbs[idx] && tbs[idx].tag === 0xA0) idx++; // version
            const serialNode = tbs[idx]; idx++;
            idx++; // sigAlg
            const issuerNode = tbs[idx];
            if (!serialNode || !issuerNode) return false;
            // Compare serial values byte-by-byte.
            if (serialNode.value.length !== wantSerialVal.length) return false;
            for (let i = 0; i < serialNode.value.length; i++) {
                if (serialNode.value[i] !== wantSerialVal[i]) return false;
            }
            // Compare issuer value bytes.
            if (issuerNode.value.length !== wantIssuerVal.length) return false;
            for (let i = 0; i < issuerNode.value.length; i++) {
                if (issuerNode.value[i] !== wantIssuerVal[i]) return false;
            }
            return true;
        }

        function _extractSpki(certDer, signatureAlg, a1) {
            // Walk into TBSCertificate to extract the SPKI bytes, then
            // shape into the verifyPk pubKey for the algorithm.
            const top = a1.parseOne(certDer, 0);
            if (!top) {
                return { ok: false, code: 'pdf/sig/spki-cert-parse',
                         message: 'cert parse failed' };
            }
            const certKids = a1.parseChildren(top.value);
            if (!certKids || !certKids[0]) {
                return { ok: false, code: 'pdf/sig/spki-cert-parse',
                         message: 'cert lacks tbsCertificate' };
            }
            const tbs = a1.parseChildren(certKids[0].value);
            if (!tbs) {
                return { ok: false, code: 'pdf/sig/spki-cert-parse',
                         message: 'tbsCertificate parse failed' };
            }
            let idx = 0;
            if (tbs[idx] && tbs[idx].tag === 0xA0) idx++; // version
            // serial, sigAlg, issuer, validity, subject, spki
            idx += 5;
            const spkiNode = tbs[idx];
            if (!spkiNode || spkiNode.tag !== 0x30) {
                return { ok: false, code: 'pdf/sig/spki-not-found',
                         message: 'SubjectPublicKeyInfo missing' };
            }
            const spkiKids = a1.parseChildren(spkiNode.value);
            if (!spkiKids || spkiKids.length < 2) {
                return { ok: false, code: 'pdf/sig/spki-malformed',
                         message: 'SPKI structure malformed' };
            }
            const algKids = a1.parseChildren(spkiKids[0].value);
            const keyAlgOid = algKids && algKids[0]
                ? a1.readOid(algKids[0]) : null;
            // bit string : first byte = unused-bits count.
            const bsVal = spkiKids[1].value;
            if (bsVal.length < 1) {
                return { ok: false, code: 'pdf/sig/spki-bitstring-empty',
                         message: 'SPKI BIT STRING empty' };
            }
            const keyBytes = bsVal.subarray(1);
            // Shape the public key per `signatureAlg`.
            if (signatureAlg === 'rsa-pss' || signatureAlg === 'rsa') {
                // RSAPublicKey ::= SEQUENCE { n INTEGER, e INTEGER }
                const inner = a1.parseOne(keyBytes, 0);
                if (!inner) {
                    return { ok: false, code: 'pdf/sig/spki-rsa-parse',
                             message: 'RSAPublicKey parse failed' };
                }
                const rsaKids = a1.parseChildren(inner.value);
                if (!rsaKids || rsaKids.length < 2) {
                    return { ok: false, code: 'pdf/sig/spki-rsa-fields',
                             message: 'RSAPublicKey lacks n/e' };
                }
                return { ok: true,
                         pubKey: { n: _trimIntLeadZero(rsaKids[0].value),
                                   e: _trimIntLeadZero(rsaKids[1].value) } };
            }
            if (signatureAlg === 'ecc') {
                // SEC1 uncompressed point : 0x04 || x || y. Strip the 0x04
                // prefix to match the SEC1 raw form expected by verifyPk
                // (curve.fromBits decodes x||y).
                if (keyBytes.length < 1 || keyBytes[0] !== 0x04) {
                    return { ok: false, code: 'pdf/sig/spki-ecc-not-uncompressed',
                             message: 'ECC point not uncompressed SEC1' };
                }
                // Determine curve from EC parameters (algorithm parameters).
                let curve = 'c256';
                if (algKids && algKids[1] && algKids[1].tag === 0x06) {
                    const curveOid = a1.readOid(algKids[1]);
                    if (curveOid === '1.2.840.10045.3.1.7') curve = 'c256';
                    else if (curveOid === '1.3.132.0.34')   curve = 'c384';
                    else if (curveOid === '1.3.132.0.35')   curve = 'c521';
                }
                return { ok: true,
                         pubKey: { curve,
                                   point: keyBytes.subarray(1) } };
            }
            if (signatureAlg === 'ed25519') {
                if (keyBytes.length !== 32) {
                    return { ok: false, code: 'pdf/sig/spki-ed25519-bad-len',
                             message: 'Ed25519 pubkey must be 32 bytes',
                             actual: keyBytes.length };
                }
                return { ok: true, pubKey: keyBytes };
            }
            return { ok: false, code: 'pdf/sig/spki-unsupported-alg',
                     message: 'unsupported keyAlgorithm: ' + keyAlgOid };
        }

        function _trimIntLeadZero(bytes) {
            // Strip a single leading 0x00 added by DER when the MSB is set
            // (preserves the positive-integer semantics in raw form).
            if (bytes.length > 1 && bytes[0] === 0x00) {
                return bytes.subarray(1);
            }
            return bytes;
        }

        /**
         * ECDSA CMS signature value → fixed-width raw r||s (`width` bytes each).
         * DER `ECDSA-Sig-Value` (SEQUENCE { INTEGER r, INTEGER s }) is tried first;
         * a buffer that is not a well-formed SEQUENCE spanning the whole value is
         * taken as the legacy raw r||s form (2*width bytes). Returns
         * `{ ok: true, rs }` or `{ ok: false, code, error }`.
         */
        function _ecdsaSigToRaw(signature, width, asn1Mod) {
            const BAD = 'pdf/sig/verify-pk/bad-ecdsa-sig';
            let kids = null;
            if (signature.length > 0 && signature[0] === 0x30 && asn1Mod) {
                const seq = asn1Mod.parseOne(signature, 0);
                if (seq && seq.next === signature.length) {
                    const c = asn1Mod.parseChildren(seq.value);
                    if (c && c.length === 2
                        && c[0].tag === 0x02 && c[1].tag === 0x02) {
                        kids = c;
                    }
                }
            }
            if (kids) {
                const rs = new Uint8Array(2 * width);
                for (let i = 0; i < 2; i++) {
                    let v = kids[i].value;
                    if (v.length === width + 1 && v[0] === 0x00) {
                        v = v.subarray(1);
                    }
                    if (v.length > width) {
                        return { ok: false, code: BAD,
                                 error: 'ECDSA-Sig-Value INTEGER longer than '
                                      + width + ' bytes' };
                    }
                    rs.set(v, i * width + (width - v.length));
                }
                return { ok: true, rs };
            }
            if (signature.length !== 2 * width) {
                return { ok: false, code: BAD,
                         error: 'ECDSA signature is neither a DER '
                              + 'ECDSA-Sig-Value nor a ' + (2 * width)
                              + '-byte raw r||s' };
            }
            return { ok: true, rs: signature };
        }

        /**
         * Public-key verification primitive dispatcher.
         *
         * Item #1 wiring (P0). Given pre-parsed inputs from a PKCS#7
         * SignerInfo + signer certificate SPKI, dispatch to the matching
         * fw primitive:
         *   - RSA-PSS  → `rsa.pssVerify(pub, msg, sig, hashMod, sLen?)`
         *   - RSA v1.5 → fw refuses (NIST SP 800-131A Rev.2 deprecation);
         *                returns `{ verified: false,
         *                            code: 'pdf/sig/rsa-pkcs1v15-deprecated' }`.
         *   - ECDSA    → `ecc.ecdsa.publicKey(curve, point).verify(hash, rs)`
         *   - Ed25519  → `ed25519.verify(pub, msg, sig)`
         *
         * @param {Object} args
         * @param {string} args.algorithm One of 'rsa-pss', 'rsa-v15',
         *   'ecdsa', 'ed25519'.
         * @param {Object} args.pubKey Algorithm-specific public key:
         *   - RSA   : `{ n: Uint8Array, e: Uint8Array }`
         *   - ECDSA : `{ curve: 'c256'|'c384'|'c521', point: Uint8Array }`
         *     (`point` is the uncompressed SEC1 encoding without the 0x04
         *     prefix — concatenation of x||y).
         *   - Ed25519: 32-byte `Uint8Array`.
         * @param {Uint8Array} args.signature Signature bytes (PSS:
         *   k-byte; ECDSA: DER ECDSA-Sig-Value, or the legacy fixed-width
         *   r||s — DER is tried first, anything else returns
         *   `pdf/sig/verify-pk/bad-ecdsa-sig`; Ed25519: 64 bytes).
         * @param {Uint8Array} args.message Bytes whose digest was signed
         *   (for PSS/Ed25519). For ECDSA, may either be the message bytes
         *   (will be hashed via `hashMod`) or — when `args.digest` is
         *   provided — the digest is used directly.
         * @param {Uint8Array} [args.digest] Pre-computed digest of
         *   `message` (used by ECDSA which expects a hash on input).
         * @param {Object} [args.hashMod] Hash module (e.g. sha256) for
         *   PSS / ECDSA-when-message-is-passed.
         * @param {number} [args.sLen] Optional PSS salt length override
         *   (defaults to hashMod's digest length).
         * @returns {{ verified: boolean, code?: string, error?: string }}
         */
        function verifyPk(args) {
            const fb = bundle;
            if (!args || typeof args !== 'object') {
                return { verified: false, code: 'pdf/sig/verify-pk/bad-args',
                         error: 'verifyPk requires an args object' };
            }
            const { algorithm, pubKey, signature, message, digest,
                    hashMod, sLen } = args;
            if (!algorithm) {
                return { verified: false, code: 'pdf/sig/verify-pk/no-alg',
                         error: 'algorithm required' };
            }
            if (!(signature instanceof Uint8Array)) {
                return { verified: false, code: 'pdf/sig/verify-pk/bad-sig',
                         error: 'signature must be a Uint8Array' };
            }
            try {
                if (algorithm === 'rsa-pss') {
                    if (!fb.rsa || typeof fb.rsa.pssVerify !== 'function') {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-rsa',
                                 error: 'fw rsa.pssVerify unavailable' };
                    }
                    if (!pubKey || !pubKey.n || !pubKey.e) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/bad-rsa-key',
                                 error: 'RSA pubKey requires { n, e }' };
                    }
                    if (!(message instanceof Uint8Array)) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-message',
                                 error: 'PSS verify requires message bytes' };
                    }
                    if (!hashMod || typeof hashMod.hash !== 'function') {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-hash',
                                 error: 'PSS verify requires hashMod' };
                    }
                    const ok = fb.rsa.pssVerify(pubKey, message, signature,
                                                hashMod, sLen);
                    return { verified: !!ok };
                }
                if (algorithm === 'rsa-v15' || algorithm === 'rsa') {
                    // PKCS#1 v1.5 — fw deliberately refuses (Bleichenbacher
                    // 2006, NIST SP 800-131A Rev.2 deprecation). Surface a
                    // precise code instead of a silent false.
                    return { verified: false,
                             code: 'pdf/sig/rsa-pkcs1v15-deprecated',
                             error: 'RSA PKCS#1 v1.5 signature scheme is '
                                  + 'deprecated by NIST SP 800-131A Rev.2 '
                                  + '(Table 5) and refused by fw rsa; use '
                                  + 'RSA-PSS instead' };
                }
                if (algorithm === 'ecdsa' || algorithm === 'ecc') {
                    if (!fb.ecc || !fb.ecc.ecdsa || !fb.ecc.curves
                        || !fb.bitArray) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-ecc',
                                 error: 'fw ecc unavailable' };
                    }
                    if (!pubKey || !pubKey.curve || !pubKey.point) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/bad-ecc-key',
                                 error: 'ECDSA pubKey requires { curve, point }' };
                    }
                    const curve = fb.ecc.curves[pubKey.curve];
                    if (!curve) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/unknown-curve',
                                 error: 'unknown ECC curve: ' + pubKey.curve };
                    }
                    // Deserialize the SEC1 raw (x||y) point into a curve
                    // point. `curve.fromBits` mirrors what `ecc.deserialize`
                    // does internally for ecdsa publicKey reconstitution.
                    const ba = fb.bitArray;
                    const pointBits = ba.ui8_to_ba(pubKey.point);
                    const Q = curve.fromBits
                        ? curve.fromBits(pointBits)
                        : null;
                    if (!Q) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/bad-ecc-point',
                                 error: 'ECC point reconstruction failed' };
                    }
                    const pub = new fb.ecc.ecdsa.publicKey(curve, Q);
                    // Hash → bits for ECDSA.verify
                    let h;
                    if (digest instanceof Uint8Array) {
                        h = ba.ui8_to_ba(digest);
                    } else {
                        if (!(message instanceof Uint8Array)
                            || !hashMod
                            || typeof hashMod.hash !== 'function') {
                            return { verified: false,
                                     code: 'pdf/sig/verify-pk/no-digest',
                                     error: 'ECDSA verify needs digest '
                                          + 'or (message, hashMod)' };
                        }
                        h = hashMod.hash(ba.ui8_to_ba(message));
                    }
                    const norm = _ecdsaSigToRaw(signature,
                        pubKey.point.length / 2, fb.asn1);
                    if (!norm.ok) {
                        return { verified: false, code: norm.code,
                                 error: norm.error };
                    }
                    const rs = ba.ui8_to_ba(norm.rs);
                    const ok = pub.verify(h, rs);
                    return { verified: !!ok };
                }
                if (algorithm === 'ed25519') {
                    if (!fb.ed25519
                        || typeof fb.ed25519.verify !== 'function') {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-ed25519',
                                 error: 'fw ed25519 unavailable' };
                    }
                    if (!(pubKey instanceof Uint8Array)
                        || pubKey.length !== 32) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/bad-ed25519-key',
                                 error: 'Ed25519 pubKey must be 32 bytes' };
                    }
                    if (!(message instanceof Uint8Array)) {
                        return { verified: false,
                                 code: 'pdf/sig/verify-pk/no-message',
                                 error: 'Ed25519 verify requires message' };
                    }
                    const ok = fb.ed25519.verify(pubKey, message, signature);
                    return { verified: !!ok };
                }
                return { verified: false,
                         code: 'pdf/sig/verify-pk/unknown-alg',
                         error: 'unsupported algorithm: ' + algorithm };
            } catch (e) {
                return { verified: false,
                         code: 'pdf/sig/verify-pk/throw',
                         error: 'primitive threw: ' + (e && e.message) };
            }
        }

        // ── Multi-signature + DocTimeStamp verify ──────────────
        //
        // Walks ALL `/Type /Sig` and `/Type /DocTimeStamp` objects in
        // the raw bytes (regardless of how many incremental updates
        // were appended) and runs the appropriate verifier on each.
        // For `/Sig` objects we delegate to `verifySignature`. For
        // `/DocTimeStamp` we parse the embedded RFC 3161
        // TimeStampToken, verify its messageImprint matches the
        // hash of the DocTimeStamp's ByteRange-covered bytes, and
        // (if a TSA cert + SPKI are extractable) verify the TSA
        // signature on TSTInfo.
        //
        // Returns { signatures: [...], timestamps: [...] }.
        /**
         * Verify every `/Sig` and `/DocTimeStamp` object in a document.
         *
         * @param {Uint8Array} documentBytes The whole document.
         * @param {object} [fwBundle] Optional fw crypto bundle (the module
         *   carries its own default).
         * @returns {{
         *   signatures: Array<object>,
         *   timestamps: Array<object>
         * }} Each `signatures` entry is a `verifySignature` result plus
         *   `objNum` / `objGen`; each `timestamps` entry carries `verified`,
         *   `valid`, `kind`, `subFilter`, `hashAlg`, `tstInfo`,
         *   `imprintVerified`, `tsaVerified`, `gapForm`, `errors`, `signerCerts`,
         *   `objNum`, `objGen`.
         *   `valid` on both kinds of entry is deprecated: same value as
         *   `verified`; kept for compatibility, will be removed in a future
         *   major version; read `verified`.
         */
        function verifyAllSignatures(documentBytes, fwBundle) {
            const fb = fwBundle || bundle;
            const sigObjs = _scanSignatureObjects(documentBytes);
            const out = { signatures: [], timestamps: [] };
            for (const obj of sigObjs) {
                if (obj.kind === 'Sig') {
                    const typed = {
                        kind: 'Sig',
                        filter: obj.filter,
                        subFilter: obj.subFilter,
                        contents: obj.contents,
                        byteRange: obj.byteRange
                    };
                    const r = _verifySig(typed, documentBytes, fb,
                        obj.contentsSpan);
                    out.signatures.push(Object.assign({
                        objNum: obj.num, objGen: obj.gen
                    }, r));
                } else {
                    const r = _verifyDocTimeStamp(obj, documentBytes, fb);
                    out.timestamps.push(Object.assign({
                        objNum: obj.num, objGen: obj.gen
                    }, r));
                }
            }
            return out;
        }

        // Scan bytes for `N M obj << … /Type /(Sig|DocTimeStamp) … >>`
        // and extract /ByteRange, /Contents, /SubFilter, /Filter for
        // each. Tolerant : signs that the dict body straddles newlines
        // are normal; the regex anchors are non-greedy.
        function _scanSignatureObjects(bytes) {
            const s = _bytesToLatin1(bytes);
            const out = [];
            const re =
                /(\d+)\s+(\d+)\s+obj\s*<<([\s\S]*?)>>\s*endobj/g;
            let m;
            while ((m = re.exec(s)) !== null) {
                const body = m[3];
                const tm = body.match(/\/Type\s*\/(Sig|DocTimeStamp)\b/);
                if (!tm) continue;
                const kind = tm[1];
                const filterM = body.match(/\/Filter\s*\/([A-Za-z0-9._]+)/);
                const subM    = body.match(/\/SubFilter\s*\/([A-Za-z0-9._]+)/);
                const brM     = body.match(
                    /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
                if (!brM) continue;
                const br = [
                    parseInt(brM[1], 10), parseInt(brM[2], 10),
                    parseInt(brM[3], 10), parseInt(brM[4], 10)
                ];
                // Locate the /Contents hex literal in the absolute byte
                // stream. The literal start `<` is unique inside the
                // object's slice — find it via absolute-offset search.
                const objStart = m.index;
                const objSliceStr = s.slice(objStart, objStart + m[0].length);
                const conM = objSliceStr.match(/\/Contents\s*<([0-9A-Fa-f]*)>/);
                if (!conM) continue;
                const hex = conM[1];
                const contents = _hexToBytesLocal(hex);
                // Hex-digit span of this object's own /Contents, in file
                // offsets — the anchor of the /ByteRange gap check.
                const ltAt = objStart + conM.index + conM[0].indexOf('<');
                out.push({
                    num: parseInt(m[1], 10),
                    gen: parseInt(m[2], 10),
                    kind,
                    filter:    filterM ? filterM[1] : null,
                    subFilter: subM    ? subM[1]    : null,
                    byteRange: br,
                    contents,
                    contentsSpan: { offset: ltAt + 1, length: hex.length }
                });
            }
            // Dedup by (num, byteRange[0]+byteRange[1]) — incremental
            // re-writes can produce multiple definitions but we treat
            // each distinct ByteRange as its own signature.
            const seen = new Set();
            const dedup = [];
            for (const it of out) {
                const k = `${it.num}:${it.byteRange.join(',')}`;
                if (seen.has(k)) continue;
                seen.add(k);
                dedup.push(it);
            }
            return dedup;
        }

        function _bytesToLatin1(bytes) {
            let s = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                s += String.fromCharCode.apply(null,
                    bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
            }
            return s;
        }

        function _hexToBytesLocal(hex) {
            const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
            const out = new Uint8Array(clean.length >>> 1);
            for (let i = 0; i < out.length; i++) {
                out[i] = parseInt(clean.substr(i * 2, 2), 16);
            }
            return out;
        }

        function _verifyDocTimeStamp(obj, documentBytes, fb) {
            const errs = [];
            function fail(code, msg, c, cause) {
                const rec = { code, message: msg };
                if (c) rec.context = c;
                if (cause) rec.cause = cause;
                errs.push(rec);
            }
            // The /ByteRange gap rule, anchored on this object's own
            // /Contents span: computed once, `gapForm` reported
            // on every return path, the issues weighed at the verdict.
            const gap = _gapCheck(obj.byteRange || [], obj.contentsSpan || null);
            const result = {
                verified: false,
                valid: false,   // deprecated alias of `verified`, removed in a future major version
                kind: 'DocTimeStamp',
                subFilter: obj.subFilter,
                hashAlg: null,
                tstInfo: null,
                imprintVerified: false,
                tsaVerified: false,
                gapForm: gap.gapForm,
                errors: errs,
                signerCerts: []
            };
            // Parse the TimeStampToken (the /Contents is the bare DER
            // of the RFC 3161 token — a CMS SignedData wrapping
            // TSTInfo).
            const blob = obj.contents;
            if (!(blob instanceof Uint8Array) || blob.length === 0) {
                fail('pdf/ts/empty-contents',
                    'DocTimeStamp /Contents is empty');
                return result;
            }
            // Locate the TSTInfo OCTET STRING + messageImprint.
            let tstInfo;
            try {
                tstInfo = _parseTstInfoMinimal(blob, fb.asn1);
            } catch (e) {
                fail('pdf/ts/parse-failed',
                    'TimeStampToken parse failed: ' + (e && e.message),
                    null, e);
                return result;
            }
            result.tstInfo = tstInfo;
            const hashAlg = tstInfo.hashAlg;
            result.hashAlg = hashAlg;
            const hashMod = hashAlg && fb[hashAlg];
            if (!hashMod || typeof hashMod.hash !== 'function') {
                fail('pdf/ts/unknown-hash',
                    'unsupported messageImprint hashAlg',
                    { hashAlg });
                return result;
            }
            // Compute the ByteRange digest and compare with
            // messageImprint.hashedMessage.
            let actual;
            try {
                actual = _hashByteRange(documentBytes, obj.byteRange,
                    hashMod, fb.bitArray);
            } catch (e) {
                fail('pdf/ts/byterange-failed',
                    'failed to digest ByteRange: ' + (e && e.message),
                    null, e);
                return result;
            }
            const expected = tstInfo.imprint;
            if (!expected || expected.length !== actual.length) {
                fail('pdf/ts/imprint-length-mismatch',
                    'TSTInfo messageImprint length differs from digest',
                    { expectedLen: expected && expected.length,
                      actualLen: actual.length });
                return result;
            }
            let imprintOk = true;
            for (let i = 0; i < actual.length; i++) {
                if (actual[i] !== expected[i]) { imprintOk = false; break; }
            }
            if (!imprintOk) {
                fail('pdf/ts/imprint-mismatch',
                    'TSTInfo messageImprint does not match '
                    + 'DocTimeStamp ByteRange digest');
                return result;
            }
            result.imprintVerified = true;
            // Try to verify the TSA signature too. Optional — if the
            // token has no signerInfos (test fixtures) we still treat
            // the imprint match as the validity criterion (mirroring
            // the existing pdfTimestamp.verifyTimestamp policy).
            // Parse SignedData for signerInfo[0] + certs.
            const sigResult = _verifyTsaSignature(blob, fb);
            result.tsaVerified = !!sigResult.verified;
            if (sigResult.signerCerts) {
                result.signerCerts = sigResult.signerCerts;
            }
            if (sigResult.errors && sigResult.errors.length) {
                for (const er of sigResult.errors) errs.push(er);
            }
            // Overall verified = imprint matches AND the gap is exactly
            // form (b) or form (a). TSA-sig is informational —
            // many real TSA tokens use ESSCertID v1/v2 + signerInfos we
            // partially parse. We keep `verified` lenient on the TSA leg;
            // `imprintVerified` reports the imprint outcome alone.
            for (const g of gap.issues) errs.push(g);
            result.verified = gap.issues.length === 0;
            result.valid    = result.verified;   // deprecated alias of `verified`, removed in a future major version
            return result;
        }

        function _parseTstInfoMinimal(blob, a1) {
            const ci = a1.parseOne(blob, 0);
            if (!ci) throw new ParseError('pdf/ts/no-ci', 'ContentInfo missing');
            const ciKids = a1.parseChildren(ci.value);
            if (!ciKids || ciKids.length < 2) {
                throw new ParseError('pdf/ts/short-ci',
                    'ContentInfo too short');
            }
            const sdNode = a1.parseOne(ciKids[1].value, 0);
            if (!sdNode) {
                throw new ParseError('pdf/ts/no-sd',
                    'SignedData node missing');
            }
            const sd = a1.parseChildren(sdNode.value);
            if (!sd) {
                throw new ParseError('pdf/ts/short-sd',
                    'SignedData parse failed');
            }
            const eci = sd[2] && a1.parseChildren(sd[2].value);
            if (!eci || eci.length < 2) {
                throw new ParseError('pdf/ts/no-eci',
                    'encapContentInfo missing');
            }
            const eContentExp = a1.parseOne(eci[1].value, 0);
            if (!eContentExp) {
                throw new ParseError('pdf/ts/no-econtent',
                    'eContent OCTET STRING missing');
            }
            // eContent is [0] EXPLICIT OCTET STRING; inside is the TSTInfo
            // SEQUENCE (DER-encoded).
            const tst = a1.parseOne(eContentExp.value, 0);
            if (!tst) {
                throw new ParseError('pdf/ts/no-tst',
                    'TSTInfo SEQUENCE missing');
            }
            const tstKids = a1.parseChildren(tst.value);
            if (!tstKids || tstKids.length < 4) {
                throw new ParseError('pdf/ts/short-tstinfo',
                    'TSTInfo too short');
            }
            // version, policy, messageImprint, serial, …
            const miKids = a1.parseChildren(tstKids[2].value);
            if (!miKids || miKids.length < 2) {
                throw new ParseError('pdf/ts/no-imprint',
                    'messageImprint malformed');
            }
            const algKids = a1.parseChildren(miKids[0].value);
            const algOid  = algKids && algKids[0]
                ? a1.readOid(algKids[0]) : null;
            const hashAlg = DIGEST_OIDS[algOid] || null;
            return {
                hashAlg,
                imprint: miKids[1].value,
                rawSd: sd
            };
        }

        function _verifyTsaSignature(blob, fb) {
            // Parse ContentInfo → SignedData and locate the eContent
            // (TSTInfo OCTET STRING value bytes). Then dispatch to the
            // shared `_verifyPkcs7Signature` helper.
            try {
                const ci = fb.asn1.parseOne(blob, 0);
                const ciKids = ci && fb.asn1.parseChildren(ci.value);
                const sdNode = ciKids && ciKids[1]
                    && fb.asn1.parseOne(ciKids[1].value, 0);
                const sd = sdNode && fb.asn1.parseChildren(sdNode.value);
                if (!sd) {
                    return { verified: false, signerCerts: [],
                             errors: [{ code: 'pdf/ts/tsa-no-sd',
                                        message: 'SignedData missing' }] };
                }
                // Locate eContent inside encapContentInfo (sd[2]).
                // encapContentInfo = SEQUENCE { eContentType OID,
                //   eContent [0] EXPLICIT OCTET STRING OPTIONAL }
                let eContentBytes = null;
                if (sd[2] && sd[2].tag === 0x30) {
                    const eci = fb.asn1.parseChildren(sd[2].value);
                    if (eci && eci.length >= 2 && eci[1].tag === 0xA0) {
                        const inner = fb.asn1.parseOne(eci[1].value, 0);
                        if (inner && inner.tag === 0x04) {
                            // The eContent OCTET STRING value bytes are
                            // what gets hashed when no signedAttrs OR they
                            // are referenced via messageDigest in signedAttrs.
                            eContentBytes = inner.value;
                        }
                    }
                }
                return _verifyPkcs7Signature(sd, eContentBytes, fb,
                    /* codePrefix */ 'pdf/ts');
            } catch (e) {
                return { verified: false, signerCerts: [],
                         errors: [{ code: 'pdf/ts/tsa-throw',
                                    message: 'TSA verify threw: '
                                       + (e && e.message),
                                    cause: e }] };
            }
        }

        // Shared PKCS#7 SignerInfo verify : given parsed SignedData
        // children and the eContent bytes (what was hashed for the
        // messageDigest signed attribute), recompute messageDigest,
        // optionally re-tag signedAttrs SET and pk-verify the encrypted
        // digest against the matching signer cert SPKI.
        //
        // `opts.byteRangeDocument` + `opts.byteRange` : detached-PKCS#7
        // mode (PDF /Sig). The helper hashes the ByteRange-covered bytes
        // itself (used as the messageDigest for signedAttrs; or as the
        // raw signed payload when signedAttrs is absent).
        //
        // Returns an extended result : { verified, signerCerts, errors,
        //   hashAlg, signatureAlg, computedDigest, pkVerified }.
        function _verifyPkcs7Signature(sd, eContentBytes, fb,
                                       codePrefix, opts) {
            const cp = codePrefix || 'pdf/sig';
            const o = opts || {};
            const errors = [];
            function fail(code, msg) {
                errors.push({ code, message: msg });
            }
            function bail(hashAlg, signatureAlg, computedDigest,
                          signerCerts) {
                return { verified: false,
                         signerCerts: signerCerts || [],
                         errors,
                         hashAlg: hashAlg || null,
                         signatureAlg: signatureAlg || null,
                         computedDigest: computedDigest || null,
                         pkVerified: false };
            }
            // Locate signerInfos SET (last 0x31 child of sd).
            let siSet = null;
            for (let i = sd.length - 1; i >= 0; i--) {
                if (sd[i].tag === 0x31) { siSet = sd[i]; break; }
            }
            if (!siSet) {
                fail(cp + '/no-signer',
                    'no signerInfos SET in SignedData');
                return bail();
            }
            const signers = fb.asn1.parseChildren(siSet.value);
            if (!signers || !signers.length) {
                fail(cp + '/empty-signers',
                    'signerInfos SET is empty');
                return bail();
            }
            const si = fb.asn1.parseChildren(signers[0].value);
            if (!si) {
                fail(cp + '/bad-signer',
                    'signerInfo[0] parse failed');
                return bail();
            }
            // Read digestAlgorithm from SignerInfo (si[2]).
            let hashAlg = null;
            if (si[2] && si[2].tag === 0x30) {
                const algKids = fb.asn1.parseChildren(si[2].value);
                if (algKids && algKids[0]) {
                    const oid = fb.asn1.readOid(algKids[0]);
                    hashAlg = DIGEST_OIDS[oid] || null;
                }
            }
            if (!hashAlg) {
                fail(cp + '/unknown-digest',
                    'unsupported SignerInfo digestAlgorithm');
                return bail();
            }
            const hashMod = fb[hashAlg];
            if (!hashMod || typeof hashMod.hash !== 'function') {
                fail(cp + '/no-hash',
                    'hash module unavailable: ' + hashAlg);
                return bail(hashAlg);
            }
            // Identify signatureAlgorithm OID (live at si[idx] after the
            // optional signedAttrs 0xA0 node, before the signature OCTET
            // STRING).
            let signatureAlg = null;
            for (let i = 3; i < si.length - 1; i++) {
                if (si[i].tag === 0x30 && si[i + 1].tag === 0x04) {
                    const a = fb.asn1.parseChildren(si[i].value);
                    if (a && a[0]) {
                        const oid = fb.asn1.readOid(a[0]);
                        signatureAlg = SIG_OIDS[oid] || null;
                    }
                    break;
                }
            }
            if (!signatureAlg) {
                fail(cp + '/unknown-sigalg',
                    'unsupported SignerInfo signatureAlgorithm');
                return bail(hashAlg);
            }
            const dissection = _dissectSignerInfo(si, fb.asn1);
            if (!dissection.ok) {
                fail(cp + '/' + dissection.code.replace('pdf/sig/', ''),
                    dissection.message);
                return bail(hashAlg, signatureAlg);
            }
            // Recompute the digest that messageDigest is expected to match.
            //   - eContent mode (TSA) : hash the eContent bytes.
            //   - ByteRange mode (PDF /Sig) : hash the ByteRange-covered
            //     bytes via `_hashByteRange` (avoids materialising a
            //     ByteRange concat just to feed the hash).
            let computedDigest = null;
            if (o.byteRangeDocument instanceof Uint8Array
                && Array.isArray(o.byteRange)) {
                try {
                    computedDigest = _hashByteRange(
                        o.byteRangeDocument, o.byteRange,
                        hashMod, fb.bitArray);
                } catch (e) {
                    fail(cp + '/digest-failed',
                        'failed to recompute ByteRange digest: '
                            + (e && e.message));
                    return bail(hashAlg, signatureAlg);
                }
            } else if (eContentBytes && fb.bitArray) {
                const ba = fb.bitArray;
                const bits = hashMod.hash(ba.ui8_to_ba(eContentBytes));
                computedDigest = bits instanceof Uint8Array
                    ? bits : ba.ba_to_ui8(bits);
            }
            // Determine the bytes the signer actually signed.
            //   - signedAttrs present : re-tag [0] IMPLICIT (0xA0) → SET
            //     (0x31) per RFC 5652 §5.4 and use that as the signed
            //     payload (with messageDigest cross-check).
            //   - signedAttrs absent : the eContent bytes (TSA mode) or
            //     the ByteRange-covered bytes (PDF /Sig mode).
            let messageToVerify;
            if (dissection.signedAttrsRaw) {
                const mdOk = _checkSignedAttrsDigest(
                    dissection.signedAttrsValueBytes,
                    computedDigest, fb.asn1);
                if (!mdOk.ok) {
                    fail(cp + '/' + mdOk.code.replace('pdf/sig/', ''),
                        mdOk.message);
                    return bail(hashAlg, signatureAlg, computedDigest);
                }
                messageToVerify = new Uint8Array(
                    dissection.signedAttrsRaw.length);
                messageToVerify.set(dissection.signedAttrsRaw);
                messageToVerify[0] = 0x31;
            } else if (eContentBytes) {
                messageToVerify = eContentBytes;
            } else if (o.byteRangeDocument instanceof Uint8Array
                       && Array.isArray(o.byteRange)) {
                try {
                    messageToVerify = _concatRange(
                        o.byteRangeDocument, o.byteRange);
                } catch (e) {
                    fail(cp + '/byterange-concat-failed',
                        'failed to extract ByteRange-covered bytes: '
                            + (e && e.message));
                    return bail(hashAlg, signatureAlg, computedDigest);
                }
            } else {
                fail(cp + '/no-econtent',
                    'no signedAttrs and no signed payload available');
                return bail(hashAlg, signatureAlg, computedDigest);
            }
            const signerCert = _findSignerCert(sd, dissection.sid, fb.asn1);
            if (!signerCert) {
                fail(cp + '/signer-cert-not-found',
                    'unable to match signer cert by IssuerAndSerialNumber');
                return bail(hashAlg, signatureAlg, computedDigest);
            }
            const spki = _extractSpki(signerCert.der, signatureAlg, fb.asn1);
            if (!spki.ok) {
                fail(cp + '/' + spki.code.replace('pdf/sig/', ''),
                    spki.message);
                return bail(hashAlg, signatureAlg, computedDigest,
                            [signerCert]);
            }
            let digestForEcdsa = null;
            if (signatureAlg === 'ecc' && fb.bitArray) {
                const dBits = hashMod.hash(
                    fb.bitArray.ui8_to_ba(messageToVerify));
                digestForEcdsa = dBits instanceof Uint8Array
                    ? dBits : fb.bitArray.ba_to_ui8(dBits);
            }
            const pkResult = verifyPk({
                algorithm: signatureAlg === 'rsa' ? 'rsa-v15'
                         : signatureAlg === 'ecc' ? 'ecdsa'
                         : signatureAlg,
                pubKey:    spki.pubKey,
                signature: dissection.encryptedDigest,
                message:   messageToVerify,
                digest:    digestForEcdsa,
                hashMod
            });
            if (!pkResult.verified) {
                fail(pkResult.code || (cp + '/pk-verify-failed'),
                    pkResult.error || 'public-key verification failed');
                return bail(hashAlg, signatureAlg, computedDigest,
                            [signerCert]);
            }
            return { verified: true, signerCerts: [signerCert], errors,
                     hashAlg, signatureAlg, computedDigest,
                     pkVerified: true };
        }

        return {
            typeSignature,
            verifySignature,
            verifyAllSignatures,
            verifyPk,
            locatePkcs7,
            _hashByteRange,
            _scanSignatureObjects,
            _verifyPkcs7Signature,
            _verifyTsaSignature,
            _ecdsaSigToRaw,
            DIGEST_OIDS, SIG_OIDS
        };
    }
};
