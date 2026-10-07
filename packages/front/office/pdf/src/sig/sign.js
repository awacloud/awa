// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PAdES signature generation — API `pdfSign.sign()`.
 *
 * Companion of `pdfSignature` (verify side). Produces a PKCS#7/CMS
 * detached `SignedData` blob and embeds it inside a signature dictionary
 * `(/Contents <…hex…>)` whose `/ByteRange` covers the entire document
 * minus the whole `<…>` token of `/Contents`, delimiters included
 * (ISO 32000-2 §12.8.3.3.1).
 *
 * Scope:
 *   - PAdES baseline levels **B**, **T**, **LT** and **LTA**, selected by
 *     `opts.level` (default `'B'`; any other value throws
 *     `pdf/sign/level-not-implemented`):
 *       - B — a single embedded signature.
 *       - T — the signature plus an RFC 3161 signature timestamp: the
 *         caller's `opts.tsaSign({ digest, hashAlg })` callback returns
 *         the TimeStampToken (the TSA exchange itself lives outside this
 *         module), embedded as the `id-aa-timeStampToken` unsigned
 *         attribute. Required for T, LT and LTA.
 *       - LT — T, then a second incremental update carrying the DSS
 *         dictionary (`pdfDssBuilder`, fed from `opts.dss`) and a
 *         Catalog re-definition with `/DSS`.
 *       - LTA — LT, then a third incremental update carrying a
 *         `/DocTimeStamp` signature (`ETSI.RFC3161`) over the LT bytes.
 *   - Algorithms : RSA-PSS, ECDSA (P-256/P-384/P-521), Ed25519.
 *     PKCS#1 v1.5 is deliberately refused (fw policy — NIST SP
 *     800-131A Rev.2 deprecation).
 *   - Detached PKCS#7 with `eContentInfo` ABSENT (canonical PAdES /
 *     `adbe.pkcs7.detached`).
 *   - `signedAttrs` (content-type, message-digest, signing-time and the
 *     ESS `signing-certificate-v2` attribute, RFC 5035) are always
 *     emitted for T / LT / LTA, whose timestamp token rides in
 *     `unsignedAttrs`; level B omits them unless `opts.useSignedAttrs`
 *     is set. When they are omitted the signature value covers the
 *     message digest directly per RFC 5652 §5.4 "the result is the
 *     message digest of the content".
 *
 * The signature object is appended as an **incremental update** through
 * `pdfIncrementalWriter` (the base bytes are kept verbatim): the update
 * section takes the form of the base's newest cross-reference section
 * (classical table or xref stream), its `/Root` / `/Info` / `/ID` come
 * from the newest-first merged trailer, and the signature takes the first
 * object number at or past the merged `/Size`.
 *
 * The SAME update registers the signature dictionary in a signature field
 * (ISO 32000-2 §12.7.5.5): an invisible field dictionary merged
 * with its widget annotation (`/FT /Sig`, `/T (Signature<n>)`, `/V` → the
 * signature dictionary, `/Subtype /Widget`, `/Rect [0 0 0 0]`, `/F 132`,
 * `/P` → page 1), page 1's `/Annots` extended, and the Catalog's
 * `/AcroForm` created or extended (`/Fields` appended, `/SigFlags 3`).
 * Existing `/AcroForm` (direct or indirect), `/Fields` and `/Annots` are
 * preserved and appended to. The LTA document timestamp gets its own
 * field the same way (§12.8.5.2). The Catalog and the page are resolved
 * through `pdfDocument.readDocument`, so every level needs that dep.
 *
 * An Ed25519 signature is an ISO/TS 32002 enhancement: its signing update
 * also re-emits the Catalog with `/Extensions` declaring the `ISO_`
 * developer extension at `/ExtensionLevel 32002` (merged with any existing
 * extensions dictionary) and, below PDF 2.0, `/Version /2.0` (ISO/TS 32002
 * §4, ISO 32000-2 §7.7.2 and §7.12). The new strings are encrypted on an
 * encrypted base. ECDSA and RSA-PSS updates are unchanged.
 *
 * Encrypted base (trailer `/Encrypt`): the document key is derived from
 * `opts.password` through the standard security handler (`pdfSecurity`,
 * `pdfStandardV4/V5/V6`), once per call; the new field's `/T` is encrypted
 * with it and every update trailer repeats the base's `/Encrypt`
 * (ISO 32000-2 §7.5.6). Levels LT and LTA encrypt the DSS streams and
 * strings and the DocTimeStamp field's `/T` with the same key; the
 * hexadecimal `/Contents` of the `/Sig` and `/DocTimeStamp` dictionaries
 * stays clear (§7.6.2). AES only (V=4 R=4 `AESV2`, V=5 R=5/R=6
 * `AESV3`); RC4, AES-GCM, a non-standard handler, a missing or wrong
 * password and insufficient permissions are refused with typed errors.
 *
 * @module pdf/sig/sign
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { pdfByteRange } from './byteRange.js';
import { pdfDssBuilder } from './dss.js';
import { pdfIncrementalWriter } from '../document/incrementalWriter.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfDocument } from '../document/document.js';
import { pdfSecurity } from '../crypto/security.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';
import { asn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { rsa } from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc } from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 } from '@awacloud/fw/crypto/pkc/ed25519.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

export const pdfSign = {
    name: 'pdfSign',
    dependencies: ['pdfErrors', 'pdfSigOids', 'pdfByteRange',
                   'pdfDssBuilder', 'pdfIncrementalWriter', 'pdfParser',
                   'asn1', 'rsa', 'ecc', 'ed25519',
                   'sha256', 'sha384', 'sha512', 'bitArray',
                   'pdfDocument', 'pdfSecurity', 'pdfStandardV4',
                   'pdfStandardV5', 'pdfStandardV6'],
    deps: [pdfErrors, pdfSigOids, pdfByteRange, pdfDssBuilder, pdfIncrementalWriter, pdfParser, asn1, rsa, ecc, ed25519, sha256, sha384, sha512, bitArray, pdfDocument, pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6],
    // `_parserMod` is no longer read (the Catalog is resolved through
    // `pdfDocument`); it keeps its slot so positional factory
    // callers stay valid. `documentMod` is appended LAST for the same
    // reason — every level needs it (the signature field
    // update resolves the Catalog and page 1 through it). The standard
    // security handler modules follow, also appended last: they are read
    // only when the base is encrypted (`pdf/sign/no-security-handler`
    // otherwise), so a hand-wired caller signing clear bases may pass
    // `null` for them.
    factory(errors, sigOids, byteRange,
            dssBuilderMod, incrementalWriterMod, _parserMod,
            asn1, rsa, ecc, ed25519,
            sha256, sha384, sha512, bitArray,
            documentMod, securityMod, v4Mod, v5Mod, v6Mod) {
        const { EncryptionError, ContractError } = errors;
        const { computeByteRange } = byteRange;

        // ── OID constants ─────────────────────────────────────────────
        const OID_CONTENT_TYPE_DATA   = '1.2.840.113549.1.7.1';
        const OID_SIGNED_DATA         = '1.2.840.113549.1.7.2';
        const OID_SHA256              = '2.16.840.1.101.3.4.2.1';
        const OID_SHA384              = '2.16.840.1.101.3.4.2.2';
        const OID_SHA512              = '2.16.840.1.101.3.4.2.3';
        const OID_RSASSA_PSS          = '1.2.840.113549.1.1.10';
        const OID_ECDSA_WITH_SHA256   = '1.2.840.10045.4.3.2';
        const OID_ECDSA_WITH_SHA384   = '1.2.840.10045.4.3.3';
        const OID_ECDSA_WITH_SHA512   = '1.2.840.10045.4.3.4';
        const OID_ED25519             = '1.3.101.112';
        const OID_MGF1                = '1.2.840.113549.1.1.8';
        // CMS signed attribute OIDs (RFC 5652 + RFC 5035).
        const OID_AA_CONTENT_TYPE     = '1.2.840.113549.1.9.3';
        const OID_AA_MESSAGE_DIGEST   = '1.2.840.113549.1.9.4';
        const OID_AA_SIGNING_TIME     = '1.2.840.113549.1.9.5';
        const OID_AA_SIGNING_CERT_V2  = '1.2.840.113549.1.9.16.2.47';
        // RFC 3161 timestamp token attribute (unsignedAttrs).
        const OID_AA_TIMESTAMP_TOKEN  = '1.2.840.113549.1.9.16.2.14';

        const HASH_TABLE = {
            sha256: { mod: sha256, oid: OID_SHA256, len: 32 },
            sha384: { mod: sha384, oid: OID_SHA384, len: 48 },
            sha512: { mod: sha512, oid: OID_SHA512, len: 64 }
        };

        // ── Hex/byte helpers ─────────────────────────────────────────
        function _hexToBytes(hex) {
            const clean = hex.replace(/[^0-9a-fA-F]/g, '');
            const out = new Uint8Array(clean.length >>> 1);
            for (let i = 0; i < out.length; i++) {
                out[i] = parseInt(clean.substr(i * 2, 2), 16);
            }
            return out;
        }

        function _bytesToHex(bytes) {
            let s = '';
            for (let i = 0; i < bytes.length; i++) {
                s += bytes[i].toString(16).padStart(2, '0').toUpperCase();
            }
            return s;
        }

        function _hashBytes(hashMod, bytes) {
            // fw hash modules expect input as a bitArray (or a UTF-8
            // string). Always go through the streaming API to keep the
            // input type unambiguous, and normalise the output to
            // Uint8Array.
            const ctx = new hashMod.fn();
            ctx.update(bitArray.ui8_to_ba(bytes));
            const out = ctx.finalize();
            if (out instanceof Uint8Array) return out;
            return bitArray.ba_to_ui8(out);
        }

        // ── Cert / key parsing ───────────────────────────────────────
        /**
         * Strip PEM armor and decode the base64 payload. Accepts either a
         * `Uint8Array` (assumed DER) or a PEM string.
         */
        function _toDer(input) {
            if (input instanceof Uint8Array) return input;
            if (typeof input !== 'string') {
                throw new ContractError('pdf/sign/bad-input',
                    'cert/privateKey must be Uint8Array (DER) or PEM string');
            }
            const stripped = input.replace(/-----BEGIN [^-]+-----/g, '')
                                  .replace(/-----END [^-]+-----/g, '')
                                  .replace(/\s+/g, '');
            // Decode base64. `atob` covers the PRIMARY targets (browser,
            // worker, Bun); the `Buffer` branch is the fallback for Node, a
            // supported SECONDARY deployment target. `Buffer` is declared readonly for
            // THIS FILE ONLY by the office ESLint preset (delta 8) — it is
            // deliberately absent from the package-wide browser+worker
            // globals, which must not assert Node's API surface everywhere.
            const bin = (typeof atob === 'function')
                ? atob(stripped)
                : Buffer.from(stripped, 'base64').toString('binary');
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }

        /**
         * Extract issuer DN bytes + serialNumber bytes from a parsed X.509
         * cert DER. Used to populate the SignerInfo `IssuerAndSerialNumber`.
         * Returns `{ issuerDer, serialDer }` where each is the raw TLV.
         */
        function _extractIssuerSerial(certDer) {
            const top = asn1.parseOne(certDer, 0);
            if (!top) {
                throw new ContractError('pdf/sign/cert-parse',
                    'failed to parse cert top-level SEQUENCE');
            }
            // Certificate ::= SEQUENCE { tbsCertificate, sigAlg, sig }
            const tbsChildren = asn1.parseChildren(top.value);
            if (!tbsChildren || tbsChildren.length < 1) {
                throw new ContractError('pdf/sign/cert-parse',
                    'cert lacks tbsCertificate');
            }
            const tbsInner = asn1.parseChildren(tbsChildren[0].value);
            if (!tbsInner) {
                throw new ContractError('pdf/sign/cert-parse',
                    'failed to parse TBSCertificate fields');
            }
            // TBSCertificate ::= SEQUENCE {
            //   version       [0] EXPLICIT Version DEFAULT v1, (optional)
            //   serialNumber  CertificateSerialNumber,
            //   signature     AlgorithmIdentifier,
            //   issuer        Name,
            //   validity      Validity,
            //   subject       Name,
            //   ... }
            let idx = 0;
            // Skip version if present (context-specific [0]).
            if (tbsInner[idx] && tbsInner[idx].tag === 0xA0) idx++;
            const serialNode = tbsInner[idx]; // INTEGER
            const sigAlg = tbsInner[idx + 1]; // SEQUENCE
            const issuerNode = tbsInner[idx + 2]; // SEQUENCE (RDN)
            void sigAlg;
            if (!serialNode || !issuerNode) {
                throw new ContractError('pdf/sign/cert-parse',
                    'failed to locate serialNumber/issuer');
            }
            // Reconstruct the raw TLV for each (we have value bytes only; we
            // need the whole TLV — re-encode via parseOne's offsets).
            // Easier path : re-encode INTEGER and SEQUENCE manually from
            // value bytes.
            const serialDer = _reencode(0x02, serialNode.value);
            const issuerDer = _reencode(0x30, issuerNode.value);
            // Also expose the SubjectPublicKeyInfo for the consumer to
            // double-check it matches the privateKey (best-effort).
            return { serialDer, issuerDer };
        }

        function _reencode(tag, valueBytes) {
            const lenBytes = _encLen(valueBytes.length);
            const out = new Uint8Array(1 + lenBytes.length + valueBytes.length);
            out[0] = tag;
            out.set(lenBytes, 1);
            out.set(valueBytes, 1 + lenBytes.length);
            return out;
        }

        function _encLen(n) {
            if (n < 0x80) return Uint8Array.of(n);
            if (n <= 0xff) return Uint8Array.of(0x81, n);
            if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
            if (n <= 0xffffff) {
                return Uint8Array.of(0x83,
                    (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
            }
            return Uint8Array.of(0x84,
                (n >>> 24) & 0xff, (n >>> 16) & 0xff,
                (n >>> 8) & 0xff, n & 0xff);
        }

        // ── PKCS#7 SignedData construction ───────────────────────────
        /**
         * Build a minimal detached SignedData ContentInfo around a
         * pre-computed `messageDigest` over the document bytes.
         *
         * Layout (RFC 5652 §5) :
         *
         *   ContentInfo ::= SEQUENCE {
         *     contentType OBJECT IDENTIFIER (id-signedData),
         *     content [0] EXPLICIT SignedData
         *   }
         *   SignedData ::= SEQUENCE {
         *     version INTEGER (1),
         *     digestAlgorithms SET OF AlgorithmIdentifier,
         *     encapContentInfo SEQUENCE {
         *       eContentType OBJECT IDENTIFIER (id-data),
         *       eContent [0] EXPLICIT OCTET STRING OPTIONAL  -- ABSENT
         *     },
         *     certificates [0] IMPLICIT SET OF Certificate,
         *     signerInfos SET OF SignerInfo
         *   }
         *   SignerInfo ::= SEQUENCE {
         *     version INTEGER (1),
         *     sid IssuerAndSerialNumber,
         *     digestAlgorithm AlgorithmIdentifier,
         *     -- signedAttrs OMITTED
         *     signatureAlgorithm AlgorithmIdentifier,
         *     signature OCTET STRING
         *   }
         */
        function _buildPkcs7({ certDer, sigBytes, hashAlg, signatureAlg,
                               signedAttrsTlv, unsignedAttrsTlv }) {
            const ih = HASH_TABLE[hashAlg];
            if (!ih) {
                throw new ContractError('pdf/sign/unknown-hash',
                    'unknown hashAlg: ' + hashAlg);
            }
            const { issuerDer, serialDer } = _extractIssuerSerial(certDer);

            // digestAlgorithm = SEQUENCE { OID, NULL }
            const digestAlg = asn1.encodeSequence([
                asn1.encodeOid(ih.oid),
                asn1.encodeNull()
            ]);
            const digestAlgorithms = asn1.encodeSet([digestAlg]);

            // encapContentInfo : eContent ABSENT (detached)
            const encapContentInfo = asn1.encodeSequence([
                asn1.encodeOid(OID_CONTENT_TYPE_DATA)
            ]);

            // certificates [0] IMPLICIT SET OF Certificate
            // Use context-specific [0] IMPLICIT — set the tag class bits
            // directly. We have the cert DER (a full SEQUENCE TLV).
            // [0] IMPLICIT on a SET-of-certs is encoded as 0xA0 (constructed,
            // class=context, tag=0). The body is the concatenation of cert
            // DERs (since [0] IMPLICIT replaces the SET tag).
            const certsImplicit = _wrapImplicit(0xA0, certDer);

            // SignerInfo
            const issuerAndSerial = asn1.encodeSequence([issuerDer, serialDer]);

            // signatureAlgorithm
            let sigAlgEncoded;
            if (signatureAlg === 'rsa-pss') {
                // RSASSA-PSS-params per RFC 8017 §A.2.3.
                // hashAlgorithm  [0] AlgorithmIdentifier DEFAULT sha1
                // maskGenAlgo    [1] AlgorithmIdentifier DEFAULT mgf1Sha1
                // saltLength     [2] INTEGER DEFAULT 20
                // trailerField   [3] INTEGER DEFAULT 1
                const hashAlgId = asn1.encodeSequence([
                    asn1.encodeOid(ih.oid),
                    asn1.encodeNull()
                ]);
                const mgfHashAlgId = asn1.encodeSequence([
                    asn1.encodeOid(ih.oid),
                    asn1.encodeNull()
                ]);
                const mgfAlgId = asn1.encodeSequence([
                    asn1.encodeOid(OID_MGF1),
                    mgfHashAlgId
                ]);
                const saltLenInt = asn1.encodeInteger(ih.len);
                const params = asn1.encodeSequence([
                    asn1.encodeExplicit(0, hashAlgId),
                    asn1.encodeExplicit(1, mgfAlgId),
                    asn1.encodeExplicit(2, saltLenInt)
                ]);
                sigAlgEncoded = asn1.encodeSequence([
                    asn1.encodeOid(OID_RSASSA_PSS),
                    params
                ]);
            } else if (signatureAlg === 'ecdsa') {
                const ecdsaOid = hashAlg === 'sha256' ? OID_ECDSA_WITH_SHA256
                              : hashAlg === 'sha384' ? OID_ECDSA_WITH_SHA384
                              : OID_ECDSA_WITH_SHA512;
                sigAlgEncoded = asn1.encodeSequence([asn1.encodeOid(ecdsaOid)]);
            } else if (signatureAlg === 'ed25519') {
                sigAlgEncoded = asn1.encodeSequence([asn1.encodeOid(OID_ED25519)]);
            } else {
                throw new ContractError('pdf/sign/unknown-sigalg',
                    'unsupported signatureAlg: ' + signatureAlg);
            }

            const siParts = [
                asn1.encodeInteger(1),            // version
                issuerAndSerial,                  // sid
                digestAlg                         // digestAlgorithm
            ];
            if (signedAttrsTlv) {
                // signedAttrs [0] IMPLICIT — re-tag the SET TLV.
                const sa = new Uint8Array(signedAttrsTlv.length);
                sa.set(signedAttrsTlv);
                sa[0] = 0xA0;
                siParts.push(sa);
            }
            siParts.push(sigAlgEncoded);
            siParts.push(asn1.encodeOctetString(sigBytes));
            if (unsignedAttrsTlv) {
                const ua = new Uint8Array(unsignedAttrsTlv.length);
                ua.set(unsignedAttrsTlv);
                ua[0] = 0xA1; // [1] IMPLICIT
                siParts.push(ua);
            }
            const signerInfo = asn1.encodeSequence(siParts);
            const signerInfos = asn1.encodeSet([signerInfo]);

            const signedData = asn1.encodeSequence([
                asn1.encodeInteger(1),    // version
                digestAlgorithms,
                encapContentInfo,
                certsImplicit,
                signerInfos
            ]);

            const contentInfo = asn1.encodeSequence([
                asn1.encodeOid(OID_SIGNED_DATA),
                asn1.encodeExplicit(0, signedData)
            ]);
            return contentInfo;
        }

        function _wrapImplicit(tag, body) {
            const lenBytes = _encLen(body.length);
            const out = new Uint8Array(1 + lenBytes.length + body.length);
            out[0] = tag;
            out.set(lenBytes, 1);
            out.set(body, 1 + lenBytes.length);
            return out;
        }

        // ── Document patching ────────────────────────────────────────
        // A 10-digit integer the serializer writes verbatim (it emits ints
        // as `value | 0`, so the int32 maximum is the widest it can carry).
        // Four of them give the fixed-width `/ByteRange` placeholder
        // `[2147483647 2147483647 2147483647 2147483647]` (45 bytes) the
        // real range is patched into, space-padded, without moving a byte.
        const BR_PLACEHOLDER_INT = 2147483647;
        const BR_PLACEHOLDER = '[' + Array(4).fill(BR_PLACEHOLDER_INT).join(' ') + ']';

        /**
         * The base's trailer as an update over it starts from: the
         * newest-first merge of every cross-reference section's dict,
         * read by `pdfIncrementalWriter.readBaseTrailer` (which also
         * refuses a hybrid-reference base, `pdf/incremental/hybrid-base`).
         *
         * Maps the writer's `startxref` failures onto this module's
         * historical codes (`pdf/sign/no-startxref` / `bad-startxref`);
         * every other refusal propagates unchanged.
         */
        function _readBaseTrailer(baseBytes) {
            let base;
            try {
                base = incrementalWriterMod.readBaseTrailer(baseBytes);
            } catch (e) {
                const code = e && e.code;
                if (code === 'pdf/incremental/no-startxref'
                    || code === 'pdf/xref/no-startxref') {
                    throw new ContractError('pdf/sign/no-startxref',
                        'base PDF has no startxref', { context: { cause: code } });
                }
                if (code === 'pdf/xref/bad-startxref') {
                    throw new ContractError('pdf/sign/bad-startxref',
                        'startxref does not parse', { context: { cause: code } });
                }
                throw e;
            }
            if (!base.trailer || !Number.isInteger(base.trailer.size)) {
                throw new ContractError('pdf/sign/no-trailer',
                    'no cross-reference section of the base supplies a usable '
                    + '/Size and /Root — cannot allocate or chain an update');
            }
            return base.trailer;
        }

        /**
         * First object number free in `bytes`: the merged trailer's
         * `/Size` (ISO 32000-2 §7.5.5 — one greater than the highest
         * object number across the whole document, every section).
         *
         * TRAP, do not "simplify" this back to a byte scan: the highest
         * `N 0 obj` header misses every object compressed in an object
         * stream (the signature once overwrote a live compressed
         * page), and a search for the literal `xref\n` lands inside the
         * trailing `startxref\n` keyword.
         */
        function _firstFreeObjNum(trailer) {
            return Math.max(trailer.size, 1);
        }

        // ── Encrypted base ───────────────────────────────────────────
        /**
         * A typed PDF object as the loose shape `pdfSecurity.typeEncryptDict`
         * reads: numbers and booleans unwrapped, strings as their bytes,
         * names kept as `{ type: 'name' }` (its `nameValue` accepts them),
         * dictionaries (`/CF` and its crypt filters) as plain objects.
         */
        function _plainOf(node) {
            if (!node || typeof node !== 'object') return node;
            switch (node.type) {
                case 'int': case 'real': case 'bool': case 'string':
                    return node.value;
                case 'dict': {
                    const out = {};
                    for (const k of Object.keys(node.entries)) {
                        out[k] = _plainOf(node.entries[k]);
                    }
                    return out;
                }
                case 'array':
                    return node.items.map(_plainOf);
                default:
                    return node;
            }
        }

        function _unsupported(message, context) {
            return new ContractError('pdf/sign/encrypted-unsupported',
                message, { context });
        }

        /**
         * Open an encrypted base for signing: derive the file key from
         * `opts.password` through the standard security handler and check
         * the permissions. Run once per `sign()` call, before anything is
         * emitted; the returned context is threaded through every update
         * the call writes.
         *
         * Accepted: `/Filter /Standard` with V=4 R=4 (`AESV2`) or V=5
         * R=5 / R=6 (`AESV3`), on BOTH the string and the stream crypt
         * filter (`Identity` allowed). Refused, all `ContractError`:
         *   - `pdf/sign/no-security-handler` — a handler module is not wired;
         *   - `pdf/sign/encrypted-password-required` — no `opts.password`;
         *   - `pdf/sign/encrypted-unsupported` — `context.filter` (not
         *     `Standard`), `context.reason` `'rc4'` (V < 4 or a `V2` crypt
         *     filter), `'aes-gcm'` (`AESV4`, ISO/TS 32003) or `'no-id'` (V=4
         *     without `/ID`), `context.cause` (an unreadable `/Encrypt`);
         *   - `pdf/sign/encrypted-bad-password` — neither the owner nor the
         *     user password (no context: the password is never echoed);
         *   - `pdf/sign/encrypted-permission-denied` — user password and
         *     `/P` lacks bit 4 (modify) or bit 6 (annotations / forms).
         * And `pdf/sign/no-random` (`EncryptionError`) when no IV source
         * exists (`opts.randomBytes`, else `crypto.getRandomValues`).
         *
         * @returns {{typedForPw: Object, handler: Object, strMethod: string,
         *   stmMethod: string, fek: Uint8Array,
         *   randomBytes: function(number): Uint8Array}}
         */
        function _openEncrypted(baseBytes, trailer, opts) {
            opts = opts || {};
            if (!securityMod || !v4Mod || !v5Mod || !v6Mod) {
                throw new ContractError('pdf/sign/no-security-handler',
                    'signing an encrypted base requires the pdfSecurity, '
                    + 'pdfStandardV4, pdfStandardV5 and pdfStandardV6 deps');
            }
            if (opts.password === undefined || opts.password === null) {
                throw new ContractError('pdf/sign/encrypted-password-required',
                    "the base is encrypted; pass opts.password (use '' for an "
                    + 'empty user password)');
            }
            const doc = documentMod.readDocument(baseBytes, { allowEncrypted: true });
            const encEntry = doc.trailer.encrypt;
            const encNode = encEntry && encEntry.type === 'dict'
                ? encEntry
                : doc._raw.resolve(_ref(encEntry.num, encEntry.gen));
            let typed;
            try {
                typed = securityMod.typeEncryptDict(
                    encNode && encNode.type === 'dict' ? _plainOf(encNode) : null);
            } catch (e) {
                throw _unsupported('the base /Encrypt dictionary cannot be read',
                    { cause: e && e.code });
            }
            const filter = typed.Filter && typed.Filter.type === 'name'
                ? typed.Filter.value : typed.Filter;
            if (filter !== 'Standard') {
                throw _unsupported('only the standard security handler '
                    + '(/Filter /Standard) is supported', { filter });
            }
            const { V, R } = typed;
            if (V < 4) {
                throw _unsupported('RC4 encryption (V < 4) is not supported; '
                    + 'only AES bases can be signed', { V, R, reason: 'rc4' });
            }
            let sel;
            try {
                sel = securityMod.selectHandler(typed,
                    { v4: v4Mod, v5: v5Mod, v6: v6Mod });
            } catch (e) {
                throw _unsupported('the base encryption is not supported',
                    { V, R, cause: e && e.code });
            }
            // Both crypt filters: the strings this module writes go through
            // /StrF, the streams of later updates through /StmF.
            for (const m of [sel.strMethod, sel.method]) {
                if (m === 'V2') {
                    throw _unsupported('an RC4 crypt filter (CFM /V2) is not '
                        + 'supported; only AES bases can be signed',
                        { V, R, reason: 'rc4' });
                }
                if (m === 'AESV4') {
                    throw _unsupported('AES-GCM encryption (CFM /AESV4, ISO/TS '
                        + '32003) is not supported', { V, R, reason: 'aes-gcm' });
                }
            }
            const idFirst = trailer.id ? trailer.id[0] : undefined;
            if (V === 4 && !(idFirst instanceof Uint8Array)) {
                throw _unsupported('a V=4 base needs the trailer /ID to derive '
                    + 'its key', { V, R, reason: 'no-id' });
            }
            const typedForPw = Object.assign({}, typed,
                { idFirst, method: sel.strMethod });
            let r = sel.handler.tryPassword(typedForPw, opts.password, true);
            const isOwner = !!r.fileEncryptionKey;
            if (!isOwner) r = sel.handler.tryPassword(typedForPw, opts.password, false);
            if (!r.fileEncryptionKey) {
                throw new ContractError('pdf/sign/encrypted-bad-password',
                    'opts.password is neither the owner nor the user password '
                    + 'of the base');
            }
            if (!isOwner) {
                // Creating a signature field needs ISO 32000-2 Table 22
                // bit 4 (modify, 0x08) AND bit 6 (annotations / forms,
                // 0x20) — the bits `crypto/permissions.js:60-63` decodes
                // as `modify` and `annot`. The owner password lifts them.
                const P = typed.P | 0;
                if (!((P & 0x20) && (P & 0x08))) {
                    throw new ContractError('pdf/sign/encrypted-permission-denied',
                        'the user password does not grant the permissions a '
                        + 'signature field needs (modify + annotations/forms); '
                        + 'pass the owner password',
                        { context: { P, required: ['modify', 'annot'] } });
                }
            }
            const randomBytes = opts.randomBytes
                || (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function'
                    ? (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))
                    : null);
            if (!randomBytes) {
                throw new EncryptionError('pdf/sign/no-random',
                    'no random source for the string IV: pass opts.randomBytes '
                    + '(crypto.getRandomValues is unavailable)');
            }
            return {
                typedForPw,
                handler: sel.handler,
                strMethod: sel.strMethod,
                stmMethod: sel.method,
                fek: r.fileEncryptionKey,
                randomBytes
            };
        }

        // ── Signature field ──────────────────────────────────────────
        // Annotation flags Print (bit 3, 4) + Locked (bit 8, 128) —
        // ISO 32000-2 Table 167.
        const WIDGET_FLAGS = 132;
        // SignaturesExist (bit 1) + AppendOnly (bit 2) — Table 225.
        const SIG_FLAGS = 3;
        const FIELD_NAME_PREFIX = 'Signature';
        // Page-tree walk bound (same order as pdfPages' own depth guard).
        const MAX_PAGE_TREE_DEPTH = 64;

        const _ref = (num, gen) => ({ type: 'ref', num, gen: gen | 0 });
        const _name = (value) => ({ type: 'name', value });

        /** Decode a PDF text string (UTF-16BE with BOM, else 8-bit). */
        function _textOf(str) {
            if (!str || str.type !== 'string' || !(str.value instanceof Uint8Array)) return null;
            const b = str.value;
            if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
                let s = '';
                for (let i = 2; i + 1 < b.length; i += 2) {
                    s += String.fromCharCode((b[i] << 8) | b[i + 1]);
                }
                return s;
            }
            return _bytesToString(b);
        }

        /**
         * Page 1's reference: depth-first, first leaf of the page tree
         * rooted at the Catalog's `/Pages` (the order `pdfPages` walks).
         * `null` when the tree holds no page.
         */
        function _firstPageRef(catalog, resolve) {
            const seen = new Set();
            function walk(ref, depth) {
                if (!ref || ref.type !== 'ref' || depth > MAX_PAGE_TREE_DEPTH) return null;
                const key = ref.num + ':' + ref.gen;
                if (seen.has(key)) return null;
                seen.add(key);
                const node = resolve(ref);
                if (!node || node.type !== 'dict') return null;
                const t = node.entries.Type;
                const kids = node.entries.Kids;
                if ((t && t.type === 'name' && t.value === 'Page')
                    || (!kids && !t)) {
                    return _ref(ref.num, ref.gen);
                }
                const items = kids && kids.type === 'array' ? kids.items : [];
                for (const k of items) {
                    const leaf = walk(k, depth + 1);
                    if (leaf) return leaf;
                }
                return null;
            }
            return walk(catalog.entries.Pages, 0);
        }

        /**
         * Append `itemRef` to the array held by `holder.entries[key]`.
         *
         * - direct array → a copy with the item appended is written back
         *   into the holder (the caller re-emits the holder);
         * - indirect array → that array object is re-emitted in the update
         *   with the item appended (`updates`), the holder keeps its ref;
         * - absent, or anything that is not an array → `[itemRef]`.
         *
         * Returns the existing items (resolved array contents).
         */
        function _appendToArrayEntry(holderEntries, key, itemRef, resolve, updates) {
            const cur = holderEntries[key];
            if (cur && cur.type === 'ref') {
                const arr = resolve(cur);
                if (arr && arr.type === 'array') {
                    updates.set(cur.num, { num: cur.num, gen: cur.gen | 0,
                        value: { type: 'array', items: arr.items.concat([itemRef]) } });
                    return arr.items;
                }
            } else if (cur && cur.type === 'array') {
                holderEntries[key] = { type: 'array', items: cur.items.concat([itemRef]) };
                return cur.items;
            }
            holderEntries[key] = { type: 'array', items: [itemRef] };
            return [];
        }

        // ── ISO/TS 32002 declaration (Ed25519) ───────────────────────
        /**
         * The ISO/TS 32002 developer extensions dictionary. ISO/TS
         * 32002:2022 §4: "PDF documents using enhancements described in this
         * document shall include in their document catalogue dictionary
         * (see ISO 32000-2:2020, 7.7.2) an extensions dictionary (see ISO
         * 32000-2:2020, 7.12) with a prefix name of ISO_", holding a
         * developer extensions dictionary (ISO 32000-2 §7.12.3) with the
         * values of its Table 1. EdDSA signatures are one of those
         * enhancements (§5.1). A fresh object on every call.
         */
        function _iso32002Extension() {
            return { type: 'dict', entries: {
                Type:              { type: 'name', value: 'DeveloperExtensions' },
                BaseVersion:       { type: 'name', value: '2.0' },
                ExtensionLevel:    { type: 'int', value: 32002 },
                ExtensionRevision: { type: 'string',
                    value: Uint8Array.from(':2022', (c) => c.charCodeAt(0)) },
                URL:               { type: 'string',
                    value: Uint8Array.from('https://www.iso.org/standard/45875.html',
                        (c) => c.charCodeAt(0)) }
            } };
        }

        /** `node` is a developer extensions dictionary at level 32002. */
        function _isIso32002(node) {
            const level = node.entries.ExtensionLevel;
            return !!level && level.type === 'int' && level.value === 32002;
        }

        /**
         * A copy of `value` — read as a DIRECT value of indirect object
         * `from` — re-keyed for being written directly inside object `to`:
         * with the V=4 handler a string's key depends on the number and
         * generation of the object that holds it (ISO 32000-2 §7.6.3.3), so
         * each string is decrypted under `from` and encrypted again under
         * `to` with a fresh IV (string crypt filter). A clear base, an
         * `Identity` string method or `from === to` returns `value` as is;
         * a string that does not decrypt under `from` is kept unchanged.
         */
        function _rekeyStrings(value, from, to, encCtx) {
            if (!encCtx || encCtx.strMethod === 'Identity' || !from
                || (from.num === to.num && (from.gen | 0) === (to.gen | 0))) {
                return value;
            }
            const { handler, typedForPw, fek, randomBytes } = encCtx;
            function walk(v) {
                if (!v || typeof v !== 'object') return v;
                switch (v.type) {
                    case 'string': {
                        if (!(v.value instanceof Uint8Array)) return v;
                        let plain;
                        try {
                            plain = handler.decryptString(typedForPw, fek,
                                from.num, from.gen | 0, v.value);
                        } catch (_) {
                            return v;
                        }
                        return { type: 'string', syntax: 'hex',
                            value: handler.encryptString(typedForPw, fek,
                                to.num, to.gen | 0, plain, randomBytes(16)) };
                    }
                    case 'array':
                        return { type: 'array', items: v.items.map(walk) };
                    case 'dict': {
                        const entries = {};
                        for (const k of Object.keys(v.entries)) entries[k] = walk(v.entries[k]);
                        return { type: 'dict', entries };
                    }
                    default:
                        return v;
                }
            }
            return walk(value);
        }

        /**
         * Declare ISO/TS 32002 in the Catalog entries `catalogEntries` (a
         * copy the caller re-emits): add `ISO_` → the developer extensions
         * dictionary of `_iso32002Extension` to `/Extensions`, merged with
         * what is there (ISO 32000-2 §7.12.2: the value of a prefix entry
         * is a developer extensions dictionary or an array of them):
         *
         *   - no `/Extensions` (absent or null) → `<< /ISO_ ext >>`;
         *   - `/Extensions` without `ISO_` → `ISO_` added, other prefixes kept;
         *   - `ISO_` a dictionary at `/ExtensionLevel 32002`, or an array
         *     holding one → unchanged (re-signing declares nothing twice);
         *   - `ISO_` a dictionary at another level → `[existing ext]`;
         *   - `ISO_` an array without level 32002 → `ext` appended.
         *
         * An indirect `/Extensions`, `ISO_` or array element is resolved and
         * the merged result is written DIRECT in the Catalog (the referenced
         * objects stay in place, no longer referenced by it). Encrypted base
         * (`encCtx`): the new dictionary's strings are encrypted under the
         * Catalog's number and generation (`catalogRef`, through
         * `_encryptNewObject`), the strings of an inlined indirect value are
         * re-keyed to it (`_rekeyStrings`); entries of the Catalog's own
         * keep their ciphertext. Any other shape throws
         * `pdf/sign/bad-extensions` (`ContractError`, `context.shape` = the
         * offending value's type) before anything is written.
         *
         * @returns {boolean} whether `catalogEntries` changed.
         */
        function _mergeExtensions(catalogEntries, resolve, encCtx, catalogRef) {
            const fresh = () => (encCtx
                ? _encryptNewObject(_iso32002Extension(), catalogRef.num,
                    catalogRef.gen | 0, encCtx)
                : _iso32002Extension());
            // `node` with a reference followed; `holder` is the indirect
            // object its direct content is keyed by (null: the Catalog).
            const deref = (node, holder) => (node && node.type === 'ref'
                ? { value: resolve(node), holder: node }
                : { value: node, holder });
            const isAbsent = (v) => v === null || v === undefined || v.type === 'null';
            const direct = (d) => _rekeyStrings(d.value, d.holder, catalogRef, encCtx);
            const refuse = (v) => new ContractError('pdf/sign/bad-extensions',
                'the Catalog /Extensions is not an extensions dictionary whose '
                + 'ISO_ entry is a developer extensions dictionary or an array '
                + 'of them (ISO 32000-2 section 7.12)',
                { context: { shape: isAbsent(v) ? 'null' : v.type } });

            const top = deref(catalogEntries.Extensions, null);
            if (isAbsent(top.value)) {
                catalogEntries.Extensions = { type: 'dict', entries: { ISO_: fresh() } };
                return true;
            }
            if (top.value.type !== 'dict') throw refuse(top.value);
            const iso = deref(top.value.entries.ISO_, top.holder);
            let isoOut;
            if (isAbsent(iso.value)) {
                isoOut = fresh();
            } else if (iso.value.type === 'dict') {
                if (_isIso32002(iso.value)) return false;
                isoOut = { type: 'array', items: [direct(iso), fresh()] };
            } else if (iso.value.type === 'array') {
                const items = [];
                let declared = false;
                for (const item of iso.value.items) {
                    const el = deref(item, iso.holder);
                    if (isAbsent(el.value) || el.value.type !== 'dict') throw refuse(el.value);
                    if (_isIso32002(el.value)) declared = true;
                    items.push(direct(el));
                }
                if (declared) return false;
                items.push(fresh());
                isoOut = { type: 'array', items };
            } else {
                throw refuse(iso.value);
            }
            const entries = {};
            for (const k of Object.keys(top.value.entries)) {
                if (k !== 'ISO_') {
                    entries[k] = direct({ value: top.value.entries[k], holder: top.holder });
                }
            }
            entries.ISO_ = isoOut;
            catalogEntries.Extensions = { type: 'dict', entries };
            return true;
        }

        /**
         * Set `/Version /2.0` in `catalogEntries` when the document's
         * effective version is below 2.0: the Catalog `/Version` name when
         * present (ISO 32000-2 §7.7.2 — the entry exists so an incremental
         * update can raise the version), else the header version
         * `headerVersion`. A `/Version` that is not a name counts as absent.
         * ISO/TS 32002 Table 2 marks EdDSA as PDF 2.x.
         *
         * @returns {boolean} whether `catalogEntries` changed.
         */
        function _raiseVersionTo20(catalogEntries, resolve, headerVersion) {
            const parse = (s) => {
                const m = typeof s === 'string' ? /^\s*(\d+)\.(\d+)/.exec(s) : null;
                return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
            };
            let entry = catalogEntries.Version;
            if (entry && entry.type === 'ref') entry = resolve(entry);
            const v = (entry && entry.type === 'name' ? parse(entry.value) : null)
                || parse(headerVersion);
            if (v && v[0] >= 2) return false;
            catalogEntries.Version = { type: 'name', value: '2.0' };
            return true;
        }

        /**
         * The objects that register signature object `sigObjNum` in a
         * signature field, all for the SAME incremental update as the
         * signature dictionary (ISO 32000-2 §12.7.5.5, §12.7.3, §12.5.6.19):
         *
         *   - the field dictionary merged with its widget annotation,
         *     object `fieldNum` (`/FT /Sig`, `/T (Signature<n>)` — `n` the
         *     lowest index no root field already uses — `/V`, `/Subtype
         *     /Widget`, `/Rect [0 0 0 0]` (invisible), `/F 132`, `/P`);
         *   - page 1 re-emitted with `/Annots` extended (or, when its
         *     `/Annots` is an indirect array, that array re-emitted);
         *   - the `/AcroForm` extended with `/Fields` + `/SigFlags 3`: an
         *     indirect AcroForm is re-emitted under its own number, a direct
         *     or absent one through a Catalog re-emission (an indirect
         *     `/Fields` array is re-emitted under its own number);
         *   - Ed25519 (`signOpts.algorithm`): the Catalog declares the ISO/TS
         *     32002 developer extension (`_mergeExtensions`) and, on a
         *     document below PDF 2.0, `/Version /2.0` (`_raiseVersionTo20`);
         *     the Catalog is re-emitted whenever that changes it, an
         *     indirect AcroForm included. Other algorithms leave it as is.
         *
         * Every existing entry is copied verbatim. Returns
         * `{ updates, fieldNum, fieldName }`.
         *
         * Encrypted base (`encCtx`, from `_openEncrypted`; derived here from
         * `signOpts` when not supplied): existing root field names are
         * decrypted before the uniqueness scan, and the new `/T` text string
         * is encrypted with the document key (string crypt filter, object
         * `fieldNum` generation 0, a fresh 16-byte IV) — in clear only when
         * the string method is `Identity`. Re-emitted objects keep their
         * number and generation, so their copied (encrypted) strings keep
         * their key. The update adds no other string: the signature
         * dictionary's `/Contents` is excluded from encryption (ISO 32000-2
         * §7.6.2) and stays the hex placeholder, `/ByteRange` holds
         * integers.
         */
        function _buildSignatureField(baseBytes, trailer, sigObjNum, fieldNum,
                                      signOpts, encCtx) {
            if (!(documentMod && typeof documentMod.readDocument === 'function')) {
                throw new ContractError('pdf/sign/no-document-reader',
                    'signing requires the pdfDocument dep (the Catalog and '
                    + 'page 1 are resolved through readDocument)');
            }
            const enc = trailer.encrypt
                ? (encCtx || _openEncrypted(baseBytes, trailer, signOpts))
                : null;
            const doc = documentMod.readDocument(baseBytes,
                enc ? { allowEncrypted: true } : undefined);
            const resolve = doc._raw.resolve;
            const rootRef = doc.trailer.root;
            const catalog = resolve(_ref(rootRef.num, rootRef.gen));
            if (!catalog || catalog.type !== 'dict') {
                throw new ContractError('pdf/sign/catalog-not-found',
                    `the trailer /Root (object ${rootRef.num} ${rootRef.gen}) `
                    + 'does not resolve to a Catalog dictionary',
                    { context: { root: rootRef } });
            }
            /** @type {Map<number, {num:number, gen:number, value:Object}>} */
            const updates = new Map();
            const fieldRef = _ref(fieldNum, 0);

            const catalogEntries = Object.assign({}, catalog.entries);
            // ── Ed25519: the Catalog declares ISO/TS 32002 (and PDF 2.0).
            let catalogChanged = false;
            if (signOpts && signOpts.algorithm === 'ed25519') {
                const catalogRef = { num: rootRef.num, gen: rootRef.gen | 0 };
                catalogChanged = _mergeExtensions(catalogEntries, resolve, enc, catalogRef);
                if (_raiseVersionTo20(catalogEntries, resolve, doc.version)) {
                    catalogChanged = true;
                }
            }

            // ── AcroForm: indirect → re-emit it; direct / absent → re-emit
            // the Catalog carrying the extended dict.
            const acroEntry = catalogEntries.AcroForm;
            let acroIndirect = null;
            let acroSrc = null;
            if (acroEntry && acroEntry.type === 'ref') {
                const r = resolve(acroEntry);
                if (r && r.type === 'dict') { acroIndirect = acroEntry; acroSrc = r; }
            } else if (acroEntry && acroEntry.type === 'dict') {
                acroSrc = acroEntry;
            }
            const acroEntries = Object.assign({}, acroSrc ? acroSrc.entries : {});
            // The indirect object holding the /Fields array — the one whose
            // number keys a DIRECT field dictionary's strings: the indirect
            // /Fields array, else the indirect AcroForm, else the Catalog.
            const fieldsEntry = acroEntries.Fields;
            const fieldsHolder = fieldsEntry && fieldsEntry.type === 'ref'
                && (resolve(fieldsEntry) || {}).type === 'array'
                ? fieldsEntry
                : (acroIndirect || rootRef);
            const rootFields = _appendToArrayEntry(acroEntries, 'Fields', fieldRef,
                resolve, updates);
            acroEntries.SigFlags = { type: 'int', value: SIG_FLAGS };
            const acroDict = { type: 'dict', entries: acroEntries };
            if (acroIndirect) {
                updates.set(acroIndirect.num, { num: acroIndirect.num,
                    gen: acroIndirect.gen | 0, value: acroDict });
                if (catalogChanged) {
                    updates.set(rootRef.num, { num: rootRef.num, gen: rootRef.gen | 0,
                        value: { type: 'dict', entries: catalogEntries } });
                }
            } else {
                catalogEntries.AcroForm = acroDict;
                updates.set(rootRef.num, { num: rootRef.num, gen: rootRef.gen | 0,
                    value: { type: 'dict', entries: catalogEntries } });
            }

            // ── Unique partial name among the root fields.
            const taken = new Set();
            for (const it of rootFields) {
                const f = it && it.type === 'ref' ? resolve(it) : it;
                let tStr = f && f.type === 'dict' ? f.entries.T : null;
                if (enc && enc.strMethod !== 'Identity' && tStr
                    && tStr.type === 'string' && tStr.value instanceof Uint8Array) {
                    const holder = it.type === 'ref' ? it : fieldsHolder;
                    try {
                        tStr = { type: 'string', value: enc.handler.decryptString(
                            enc.typedForPw, enc.fek, holder.num, holder.gen | 0,
                            tStr.value) };
                    } catch (_) {
                        // Not a string under this key: it names no field
                        // the new one could collide with.
                        tStr = null;
                    }
                }
                const t = _textOf(tStr);
                if (t !== null) taken.add(t);
            }
            let n = 1;
            while (taken.has(FIELD_NAME_PREFIX + n)) n++;
            const fieldName = FIELD_NAME_PREFIX + n;

            // ── Page 1: /Annots extended.
            const pageRef = _firstPageRef(catalog, resolve);
            if (pageRef) {
                const page = resolve(pageRef);
                const pageEntries = Object.assign({}, page.entries);
                const annotsWasIndirect = pageEntries.Annots
                    && pageEntries.Annots.type === 'ref'
                    && (resolve(pageEntries.Annots) || {}).type === 'array';
                _appendToArrayEntry(pageEntries, 'Annots', fieldRef, resolve, updates);
                if (!annotsWasIndirect) {
                    updates.set(pageRef.num, { num: pageRef.num, gen: pageRef.gen,
                        value: { type: 'dict', entries: pageEntries } });
                }
            }

            // ── The field dictionary merged with its widget annotation.
            const plainName = new TextEncoder().encode(fieldName);
            let tValue = { type: 'string', value: plainName };
            if (enc && enc.strMethod !== 'Identity') {
                const iv = enc.randomBytes(16);
                tValue = { type: 'string', syntax: 'hex',
                    value: enc.handler.encryptString(enc.typedForPw, enc.fek,
                        fieldNum, 0, plainName, iv) };
            }
            const widget = { type: 'dict', entries: {
                Type:    _name('Annot'),
                Subtype: _name('Widget'),
                FT:      _name('Sig'),
                T:       tValue,
                V:       _ref(sigObjNum, 0),
                Rect:    { type: 'array', items: [0, 0, 0, 0].map(
                    (v) => ({ type: 'int', value: v })) },
                F:       { type: 'int', value: WIDGET_FLAGS }
            } };
            if (pageRef) widget.entries.P = pageRef;
            updates.set(fieldNum, { num: fieldNum, gen: 0, value: widget });

            return { updates: Array.from(updates.values()), fieldNum, fieldName };
        }

        /**
         * Take an existing PDF (`baseBytes`) and append a signature
         * dictionary as a new indirect object through
         * `pdfIncrementalWriter` — so the update section takes the form of
         * the base's newest section (classical table or cross-reference
         * stream) and carries `/Root`, `/Info`, `/ID` from the
         * merged trailer. The SAME update carries the signature field that
         * holds it (`_buildSignatureField`). The signature dict has the
         * fixed-width placeholders `/Contents <00…00>` and `/ByteRange
         * [2147483647 …]`; both are located inside the signature object's
         * own byte span (from its offset to the next object's) and patched
         * in place — the byte length never changes, so every recorded
         * cross-reference offset stays valid, and the field objects are
         * covered by the `/ByteRange` like every other byte.
         *
         * Over an encrypted base the update's cross-reference section
         * repeats the base's `/Encrypt` (ISO 32000-2 §7.5.6) and the field's
         * `/T` is encrypted (`_buildSignatureField`). `encCtx` is the
         * context `sign()` derived once; when it is `undefined` and the base
         * is encrypted, it is derived here from `signOpts`
         * (`_openEncrypted`).
         *
         * Returns `{ bytes, contentsOffset, contentsLength, byteRange,
         * sigObjNum, fieldObjNum, fieldName, encrypted }` — `contentsOffset`
         * / `contentsLength` are the hex-digit span (where the blob is
         * patched in); `byteRange`'s gap is that span plus its `<` and `>`;
         * `encrypted` tells whether the base carries `/Encrypt`.
         */
        function _emitWithPlaceholder(baseBytes, sigPayloadLen,
                                       subFilter, isDocTimeStamp,
                                       signOpts, encCtx) {
            subFilter = subFilter || 'adbe.pkcs7.detached';
            if (!incrementalWriterMod
                || typeof incrementalWriterMod.appendIncrementalWithOffsets !== 'function'
                || typeof incrementalWriterMod.readBaseTrailer !== 'function') {
                throw new ContractError('pdf/sign/no-incremental-writer',
                    'signing requires the pdfIncrementalWriter dep');
            }
            const trailer = _readBaseTrailer(baseBytes);
            const sigObjNum = _firstFreeObjNum(trailer);
            if (trailer.encrypt && encCtx === undefined) {
                encCtx = _openEncrypted(baseBytes, trailer, signOpts);
            }
            const field = _buildSignatureField(baseBytes, trailer,
                sigObjNum, sigObjNum + 1, signOpts, encCtx);

            const typeName = isDocTimeStamp ? 'DocTimeStamp' : 'Sig';
            const name = (value) => ({ type: 'name', value });
            const sigDict = { type: 'dict', entries: {
                Type:      name(typeName),
                Filter:    name('Adobe.PPKLite'),
                SubFilter: name(subFilter),
                ByteRange: { type: 'array', items: [0, 1, 2, 3].map(
                    () => ({ type: 'int', value: BR_PLACEHOLDER_INT })) },
                // sigPayloadLen is in BYTES — the hex literal is 2x.
                Contents:  { type: 'string', syntax: 'hex',
                             value: new Uint8Array(sigPayloadLen) }
            } };

            const updates = [{ num: sigObjNum, gen: 0, value: sigDict }];
            updates.push(...field.updates);
            const emitted = incrementalWriterMod.appendIncrementalWithOffsets(
                baseBytes, {
                    updates,
                    root: trailer.root,
                    info: trailer.info,
                    id: trailer.id,
                    encrypt: trailer.encrypt
                });
            const out = emitted.bytes;
            const sigObjStart = emitted.offsets.get(sigObjNum);
            // The signature object spans from its own offset to the next
            // appended object's (or, when it is the last one, to the
            // start of the update's xref section).
            let sigObjEnd = emitted.xrefOffset;
            for (const off of emitted.offsets.values()) {
                if (off > sigObjStart && off < sigObjEnd) sigObjEnd = off;
            }
            const sigObjStr = _bytesToString(out.subarray(sigObjStart, sigObjEnd));
            const brKey = '/ByteRange ' + BR_PLACEHOLDER;
            const contentsKey = '/Contents <';
            const brLocal = sigObjStr.indexOf(brKey);
            const contentsLocal = sigObjStr.indexOf(contentsKey);
            const contentsLength = sigPayloadLen * 2;
            if (!sigObjStr.startsWith(`${sigObjNum} 0 obj`)
                || brLocal < 0 || contentsLocal < 0
                || sigObjStr[contentsLocal + contentsKey.length + contentsLength] !== '>') {
                throw new ContractError('pdf/sign/br-placeholder-missing',
                    'ByteRange / Contents placeholder not found in the '
                    + 'signature object', { context: { sigObjNum, sigObjStart } });
            }
            const contentsOffset = sigObjStart + contentsLocal + contentsKey.length;

            // ByteRange excludes the whole `<…>` token of /Contents, its
            // delimiters included (ISO 32000-2 §12.8.3.3.1: the string
            // "shall fit precisely in the space between the ranges" —
            // form b). `contentsOffset` stays the first hex digit:
            // it is where the PKCS#7 hex is patched in.
            const br = computeByteRange(out, contentsOffset, contentsLength, {
                token: { offset: contentsOffset - 1, length: contentsLength + 2 }
            });

            // Patch the /ByteRange placeholder with the real values,
            // space-padded inside the brackets to the same width.
            const realBr = `[${br[0]} ${br[1]} ${br[2]} ${br[3]}]`;
            let padded;
            if (realBr.length < BR_PLACEHOLDER.length) {
                padded = realBr.slice(0, realBr.length - 1)
                    + ' '.repeat(BR_PLACEHOLDER.length - realBr.length) + ']';
            } else if (realBr.length === BR_PLACEHOLDER.length) {
                padded = realBr;
            } else {
                throw new ContractError('pdf/sign/br-overflow',
                    'real ByteRange does not fit in 10-digit placeholder');
            }
            out.set(new TextEncoder().encode(padded),
                sigObjStart + brLocal + '/ByteRange '.length);
            return {
                bytes: out,
                contentsOffset, contentsLength,
                byteRange: br,
                sigObjNum,
                fieldObjNum: field.fieldNum,
                fieldName: field.fieldName,
                encrypted: !!trailer.encrypt
            };
        }

        function _bytesToString(bytes) {
            // Latin-1 / 8-bit clean string view of bytes — fine since the
            // PDF body around our markers is ASCII.
            let s = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                s += String.fromCharCode.apply(null,
                    bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
            }
            return s;
        }

        // ── Crypto dispatch ──────────────────────────────────────────
        function _signDigest({ algorithm, privateKey, message, hashMod }) {
            if (algorithm === 'rsa-pss') {
                if (!rsa || typeof rsa.pssSign !== 'function') {
                    throw new EncryptionError('pdf/sign/no-rsa',
                        'fw rsa.pssSign unavailable');
                }
                if (!privateKey || !privateKey.n || !privateKey.e
                    || !privateKey.d) {
                    throw new ContractError('pdf/sign/bad-rsa-key',
                        'RSA privateKey requires { n, e, d }');
                }
                const sig = rsa.pssSign(privateKey, message, hashMod);
                if (!sig) {
                    throw new EncryptionError('pdf/sign/rsa-failed',
                        'rsa.pssSign returned false');
                }
                return sig;
            }
            if (algorithm === 'ecdsa') {
                if (!ecc || !ecc.ecdsa) {
                    throw new EncryptionError('pdf/sign/no-ecc',
                        'fw ecc.ecdsa unavailable');
                }
                if (!privateKey || !privateKey.curve
                    || !privateKey.secretKey) {
                    throw new ContractError('pdf/sign/bad-ecdsa-key',
                        'ECDSA privateKey requires '
                        + '{ curve, secretKey: <ecc.ecdsa.secretKey> }');
                }
                // fw hashMod.hash expects a bitArray and returns a bitArray.
                const digestBits = hashMod.hash(bitArray.ui8_to_ba(message));
                // RFC 3279 §2.2.3 ECDSA-Sig-Value — CMS carries the DER
                // SEQUENCE, not the fixed-width r||s the fw primitive
                // returns.
                const rsBytes = bitArray.ba_to_ui8(privateKey.secretKey.sign(digestBits));
                const half = rsBytes.length >>> 1;
                return asn1.encodeSequence([
                    asn1.encodeInteger(rsBytes.subarray(0, half)),
                    asn1.encodeInteger(rsBytes.subarray(half))
                ]);
            }
            if (algorithm === 'ed25519') {
                if (!ed25519 || typeof ed25519.sign !== 'function') {
                    throw new EncryptionError('pdf/sign/no-ed25519',
                        'fw ed25519.sign unavailable');
                }
                if (!(privateKey instanceof Uint8Array)
                    || privateKey.length !== 64) {
                    throw new ContractError('pdf/sign/bad-ed25519-key',
                        'Ed25519 privateKey must be 64 bytes (seed || pub)');
                }
                const sig = ed25519.sign(privateKey, message);
                if (!sig) {
                    throw new EncryptionError('pdf/sign/ed25519-failed',
                        'ed25519.sign returned false');
                }
                return sig;
            }
            throw new ContractError('pdf/sign/unknown-algorithm',
                'unsupported algorithm: ' + algorithm);
        }

        // ── signedAttrs / ESS / TSA helpers ──────────────────────────
        /**
         * Build a signedAttrs SET (DER TLV) containing the mandatory
         * attributes per PAdES baseline B :
         *   - id-contentType        = id-data
         *   - id-messageDigest      = digest(ByteRange)
         *   - id-signingTime        = current UTCTime
         *   - id-aa-signingCertV2   = ESSCertIDv2 (cert hash, SHA-256)
         *
         * `certDigestSha256` is the SHA-256 of the signer cert DER. The
         * caller passes it explicitly to keep this helper hash-impl-agnostic.
         *
         * The attributes are written in DER `SET OF` order
         * (`_sortDerSetOf`): RFC 5652 §5.4 computes the signature over "the
         * DER encoding of the SignedAttributes value", and X.690 §11.6 orders
         * the components of a DER set-of "in ascending order of their
         * encodings". A verifier that re-encodes the attributes before it
         * checks the signature therefore checks these exact bytes.
         *
         * @returns {Uint8Array} The DER-encoded SET (tag 0x31). Callers
         *   that want the [0] IMPLICIT form for embedding in SignerInfo
         *   should re-tag the first byte to 0xA0 (see `_buildPkcs7`).
         */
        function _buildSignedAttrs({ messageDigest, certDigestSha256,
                                      signingTime }) {
            // Attribute ::= SEQUENCE { OID, SET OF AttributeValue }
            const attrs = [];
            // contentType = id-data
            attrs.push(asn1.encodeSequence([
                asn1.encodeOid(OID_AA_CONTENT_TYPE),
                asn1.encodeSet([asn1.encodeOid(OID_CONTENT_TYPE_DATA)])
            ]));
            // messageDigest
            attrs.push(asn1.encodeSequence([
                asn1.encodeOid(OID_AA_MESSAGE_DIGEST),
                asn1.encodeSet([asn1.encodeOctetString(messageDigest)])
            ]));
            // signingTime (UTCTime)
            const t = signingTime instanceof Date ? signingTime : new Date();
            const utc = _encodeUtcTime(t);
            attrs.push(asn1.encodeSequence([
                asn1.encodeOid(OID_AA_SIGNING_TIME),
                asn1.encodeSet([utc])
            ]));
            // signing-certificate-v2 (RFC 5035)
            //   SigningCertificateV2 ::= SEQUENCE {
            //     certs SEQUENCE OF ESSCertIDv2 }
            //   ESSCertIDv2 ::= SEQUENCE {
            //     hashAlgorithm AlgorithmIdentifier DEFAULT sha256,
            //     certHash      OCTET STRING }
            // We omit hashAlgorithm (SHA-256 is the default).
            const essCertIdV2 = asn1.encodeSequence([
                asn1.encodeOctetString(certDigestSha256)
            ]);
            const signingCertV2 = asn1.encodeSequence([
                asn1.encodeSequence([essCertIdV2])
            ]);
            attrs.push(asn1.encodeSequence([
                asn1.encodeOid(OID_AA_SIGNING_CERT_V2),
                asn1.encodeSet([signingCertV2])
            ]));
            return asn1.encodeSet(_sortDerSetOf(attrs));
        }

        /**
         * Sort encoded `SET OF` components into DER order (X.690 §11.6:
         * "the encodings of the component values of a set-of value shall
         * appear in ascending order, the encodings being compared as octet
         * strings with the shorter components being padded at their trailing
         * end with 0-octets"). Compares unsigned bytes left to right; when one
         * encoding is a prefix of the other, the shorter one sorts first.
         * Returns a new array; the input is left as is.
         *
         * @param {Uint8Array[]} tlvs Complete component encodings (TLVs).
         * @returns {Uint8Array[]}
         */
        function _sortDerSetOf(tlvs) {
            return tlvs.slice().sort((a, b) => {
                const n = Math.min(a.length, b.length);
                for (let i = 0; i < n; i++) {
                    if (a[i] !== b[i]) return a[i] - b[i];
                }
                return a.length - b.length;
            });
        }

        function _encodeUtcTime(date) {
            const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
            const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            const hh = String(date.getUTCHours()).padStart(2, '0');
            const mi = String(date.getUTCMinutes()).padStart(2, '0');
            const se = String(date.getUTCSeconds()).padStart(2, '0');
            const s = yy + mo + dd + hh + mi + se + 'Z';
            const v = new TextEncoder().encode(s);
            const out = new Uint8Array(2 + v.length);
            out[0] = 0x17; // UTCTime
            out[1] = v.length;
            out.set(v, 2);
            return out;
        }

        /**
         * Build the unsignedAttrs SET (for level T) containing the
         * RFC 3161 timestamp-token attribute (id-aa-timeStampToken).
         */
        function _buildUnsignedAttrsTsa(tstToken) {
            const attr = asn1.encodeSequence([
                asn1.encodeOid(OID_AA_TIMESTAMP_TOKEN),
                asn1.encodeSet([tstToken])
            ]);
            return asn1.encodeSet([attr]);
        }

        // ── Public API ───────────────────────────────────────────────
        /**
         * Sign a PDF byte buffer (PAdES baseline B, T, LT or LTA).
         *
         * @param {Uint8Array} pdfBytes Existing PDF bytes (e.g. as
         *   produced by `pdf.write(...)` or any external generator).
         * @param {Object} opts
         * @param {Uint8Array|string} opts.cert X.509 certificate DER bytes
         *   or PEM string.
         * @param {Object|Uint8Array} opts.privateKey Algorithm-specific
         *   private key :
         *   - RSA-PSS : `{ n, e, d }` (Uint8Array each).
         *   - ECDSA   : `{ curve: ecc.curves.c256|c384|c521,
         *                  secretKey: new ecc.ecdsa.secretKey(curve, k) }`.
         *   - Ed25519 : 64-byte `Uint8Array` (seed || pub).
         * @param {string} opts.algorithm 'rsa-pss' | 'ecdsa' | 'ed25519'.
         *   Algorithm notes: the ECDSA CMS signature value is the DER
         *   `ECDSA-Sig-Value` (SEQUENCE { r INTEGER, s INTEGER }, RFC 3279
         *   §2.2.3); the Ed25519 digest is always SHA-512 (RFC 8419
         *   section 3.1). An Ed25519 signing update also re-emits the
         *   Catalog declaring the ISO/TS 32002 developer extension
         *   (`/Extensions` → `/ISO_` with `/ExtensionLevel 32002`, merged
         *   with any existing entry) and sets `/Version /2.0` when the
         *   document is below PDF 2.0 (ISO/TS 32002 §4, ISO 32000-2
         *   §7.7.2); a malformed `/Extensions` throws
         *   `pdf/sign/bad-extensions`. The later LT and LTA updates copy
         *   the Catalog, declaration included. Adobe Acrobat Reader does
         *   not validate EdDSA signatures; use ECDSA P-256 where Acrobat
         *   interoperability matters.
         * @param {string} [opts.hashAlg='sha256'] 'sha256' | 'sha384' |
         *   'sha512' for RSA-PSS and ECDSA (default 'sha256'). Ed25519:
         *   'sha512' only, which is also its default — any other value
         *   throws `pdf/sign/ed25519-requires-sha512`; an unknown value
         *   throws `pdf/sign/bad-hash-alg`. The resolved value is the
         *   `hashAlg` handed to `opts.tsaSign`.
         * @param {string} [opts.level='B'] PAdES baseline level:
         *   'B' | 'T' | 'LT' | 'LTA'. T, LT and LTA require
         *   `opts.tsaSign`, a callback `({ digest, hashAlg })` returning
         *   the RFC 3161 TimeStampToken DER bytes (a `Uint8Array`); LT
         *   also appends the DSS built from `opts.dss`, and LTA then a
         *   DocTimeStamp. Any other value throws
         *   `pdf/sign/level-not-implemented`.
         * @param {function({digest: Uint8Array, hashAlg: string}): Uint8Array}
         *   [opts.tsaSign] RFC 3161 TimeStampToken callback (required for
         *   T, LT and LTA): `digest` is the `hashAlg` digest of the
         *   signature value (T) or of the DocTimeStamp's covered bytes
         *   (LTA).
         * @param {boolean} [opts.useSignedAttrs=false] Emit CMS signed
         *   attributes (content-type, message-digest, signing-time, ESS
         *   signing-certificate-v2) at level B; forced `true` for T, LT
         *   and LTA.
         * @param {number} [opts.placeholderBytes=8192] Size in bytes
         *   reserved for the PKCS#7 blob in the `/Contents` placeholder.
         * @param {string} [opts.subFilter='adbe.pkcs7.detached'] The
         *   signature dictionary `/SubFilter`; a PAdES signature needs
         *   `'ETSI.CAdES.detached'`.
         * @param {Date} [opts.signingTime] The signing-time signed
         *   attribute (default: now); read only when signed attributes
         *   are emitted.
         * @param {boolean} [opts.docTimeStamp] Internal: emit the
         *   placeholder object as a `/DocTimeStamp` instead of a `/Sig`.
         * @param {{certs?: Array<Uint8Array|string>, ocsps?: Uint8Array[],
         *   crls?: Uint8Array[], vri?: Object, autoVri?: boolean}}
         *   [opts.dss] LT / LTA: the DSS content (certificates as DER or
         *   PEM, OCSP responses, CRLs, VRI entries) appended after the
         *   signature.
         * @param {number} [opts.docTimeStampPlaceholder] LTA: size in
         *   bytes reserved for the DocTimeStamp token (default:
         *   `opts.placeholderBytes`, else 8192).
         * @param {string|Uint8Array} [opts.password] Encrypted base: the
         *   owner or user password (`''` is a valid empty user password).
         *   The document key is derived from it through the standard
         *   security handler (V=4 R=4 `AESV2`, V=5 R=5/R=6 `AESV3`); a user
         *   password must grant the modify and annotations/forms
         *   permissions. Without it an encrypted base throws
         *   `pdf/sign/encrypted-password-required`. Ignored on an
         *   unencrypted base.
         * @param {function(number): Uint8Array} [opts.randomBytes]
         *   Encrypted base: IV source (called with 16) for each encrypted
         *   field name and, at LT / LTA, for each DSS string and stream.
         *   Default `crypto.getRandomValues`; when neither exists
         *   `pdf/sign/no-random` is thrown.
         * @returns {Uint8Array} the signed PDF bytes. Each signature
         *   dictionary (and the LTA DocTimeStamp) is the `/V` of an
         *   invisible signature field `Signature<n>` written in the same
         *   incremental update (see `_buildSignatureField`).
         */
        function sign(pdfBytes, opts) {
            if (!(pdfBytes instanceof Uint8Array)) {
                throw new ContractError('pdf/sign/bad-input',
                    'pdfBytes must be a Uint8Array');
            }
            if (!opts || typeof opts !== 'object') {
                throw new ContractError('pdf/sign/bad-opts',
                    'opts object required');
            }
            const level = opts.level || 'B';
            if (level !== 'B' && level !== 'T'
                && level !== 'LT' && level !== 'LTA') {
                throw new ContractError('pdf/sign/level-not-implemented',
                    'unknown PAdES level: ' + level,
                    { context: { level } });
            }
            if ((level === 'LT' || level === 'LTA')
                && !dssBuilderMod) {
                throw new ContractError('pdf/sign/no-dss-builder',
                    'levels LT/LTA require the pdfDssBuilder dep',
                    { context: { level } });
            }
            if (!incrementalWriterMod) {
                // Every level appends its signature through the writer.
                throw new ContractError('pdf/sign/no-incremental-writer',
                    'signing requires the pdfIncrementalWriter dep',
                    { context: { level } });
            }
            if (!(documentMod && typeof documentMod.readDocument === 'function')) {
                // Every level registers its signature in a signature field:
                // the Catalog and page 1 are resolved through
                // readDocument.
                throw new ContractError('pdf/sign/no-document-reader',
                    'signing requires the pdfDocument dep (the Catalog and '
                    + 'page 1 are resolved through readDocument)',
                    { context: { level } });
            }
            const algorithm = opts.algorithm;
            if (!algorithm) {
                throw new ContractError('pdf/sign/no-algorithm',
                    'opts.algorithm required (rsa-pss|ecdsa|ed25519)');
            }
            // Ed25519 with CMS uses SHA-512 as its digestAlgorithm (RFC 8419
            // section 3.1), with or without signed attributes: it is the
            // default for Ed25519 and any other value is refused.
            const hashAlg = opts.hashAlg
                || (algorithm === 'ed25519' ? 'sha512' : 'sha256');
            const ih = HASH_TABLE[hashAlg];
            if (!ih) {
                throw new ContractError('pdf/sign/bad-hash-alg',
                    'unknown hashAlg: ' + hashAlg);
            }
            if (algorithm === 'ed25519' && hashAlg !== 'sha512') {
                throw new ContractError('pdf/sign/ed25519-requires-sha512',
                    'Ed25519 CMS signatures use SHA-512 (RFC 8419 section 3.1); '
                    + 'omit opts.hashAlg or pass "sha512"',
                    { context: { hashAlg } });
            }
            // TSA injection — required for level T (and recursively for
            // LT/LTA). The callback signs a digest and returns the RFC
            // 3161 TimeStampToken bytes.
            if ((level === 'T' || level === 'LT' || level === 'LTA')
                && typeof opts.tsaSign !== 'function') {
                throw new ContractError('pdf/sign/tsa-required-for-level-T',
                    'levels T/LT/LTA require opts.tsaSign({digest,hashAlg})'
                    + ' callback returning the RFC 3161 TimeStampToken bytes',
                    { context: { level } });
            }
            // Whether to include signedAttrs (ESS signing-certificate-v2,
            // etc.). Required for levels T/LT/LTA (the timestamp-token
            // lives in unsignedAttrs which is only emitted when the
            // SignerInfo also carries signedAttrs per the CMS schema).
            // For level B the default is `false` for backward compatibility
            // with the no-signedAttrs PAdES-B emit; callers can opt in via
            // `opts.useSignedAttrs: true` to get an ESS signingCertificateV2
            // attribute (PAdES baseline B).
            const useSignedAttrs = (level !== 'B') || !!opts.useSignedAttrs;

            // Normalise the cert to DER.
            const certDer = _toDer(opts.cert);
            const placeholderBytes = opts.placeholderBytes || 8192;

            // An encrypted base: derive the document key ONCE, before
            // anything is emitted, and thread it through the update.
            let encCtx;
            if (typeof incrementalWriterMod.readBaseTrailer === 'function') {
                const baseTrailer = _readBaseTrailer(pdfBytes);
                encCtx = baseTrailer.encrypt
                    ? _openEncrypted(pdfBytes, baseTrailer, opts) : null;
            }

            // Emit the document with a placeholder.
            const emitted = _emitWithPlaceholder(pdfBytes, placeholderBytes,
                opts.subFilter || 'adbe.pkcs7.detached',
                opts.docTimeStamp, opts, encCtx);
            const { bytes, contentsOffset, contentsLength, byteRange } = emitted;

            // Hash the ByteRange-covered bytes.
            const signedBytes = new Uint8Array(byteRange[1] + byteRange[3]);
            signedBytes.set(
                bytes.subarray(byteRange[0], byteRange[0] + byteRange[1]), 0);
            signedBytes.set(
                bytes.subarray(byteRange[2], byteRange[2] + byteRange[3]),
                byteRange[1]);
            // messageDigest of the ByteRange-covered bytes.
            const messageDigest = _hashBytes(ih.mod, signedBytes);

            // Build signedAttrs if needed.
            let signedAttrsTlv = null;
            let messageToSign = signedBytes;
            if (useSignedAttrs) {
                const certDigestSha256 = _hashBytes(sha256, certDer);
                signedAttrsTlv = _buildSignedAttrs({
                    messageDigest, certDigestSha256,
                    signingTime: opts.signingTime
                });
                // Sign the SET-tagged form (0x31), not the [0] IMPLICIT form.
                messageToSign = signedAttrsTlv;
            }

            // Sign.
            const sigBytes = _signDigest({
                algorithm, privateKey: opts.privateKey,
                message: messageToSign, hashMod: ih.mod
            });

            // Build unsignedAttrs for level T+ (timestamp token).
            let unsignedAttrsTlv = null;
            if (level === 'T' || level === 'LT' || level === 'LTA') {
                // Hash the signature value (RFC 3161 §2.4.1 messageImprint
                // of the signature-time-stamp is over the signature OCTET
                // STRING value).
                const sigDigest = _hashBytes(ih.mod, sigBytes);
                const tstToken = opts.tsaSign({
                    digest: sigDigest, hashAlg
                });
                if (!(tstToken instanceof Uint8Array)) {
                    throw new ContractError('pdf/sign/tsa-bad-result',
                        'opts.tsaSign must return a Uint8Array '
                        + '(RFC 3161 TimeStampToken DER bytes)');
                }
                unsignedAttrsTlv = _buildUnsignedAttrsTsa(tstToken);
            }

            // Build the PKCS#7 SignedData.
            const pkcs7 = _buildPkcs7({
                certDer, sigBytes, hashAlg,
                signatureAlg: algorithm,
                signedAttrsTlv, unsignedAttrsTlv
            });
            if (pkcs7.length > placeholderBytes) {
                throw new ContractError('pdf/sign/pkcs7-too-large',
                    'PKCS#7 blob exceeds placeholder',
                    { context: { pkcs7Length: pkcs7.length,
                                 placeholder: placeholderBytes } });
            }

            // Patch /Contents hex literal with the PKCS#7 hex.
            const hex = _bytesToHex(pkcs7);
            const TE = new TextEncoder();
            const hexBytes = TE.encode(hex);
            const pad = contentsLength - hexBytes.length;
            if (pad < 0) {
                throw new ContractError('pdf/sign/hex-overflow',
                    'PKCS#7 hex exceeds /Contents placeholder');
            }
            bytes.set(hexBytes, contentsOffset);
            for (let i = 0; i < pad; i++) {
                bytes[contentsOffset + hexBytes.length + i] = 0x30; // '0'
            }
            if (level !== 'LT' && level !== 'LTA') {
                return bytes;
            }
            // ── LT : append DSS via incremental writer ──
            // An encrypted base: the same document key (`encCtx`) encrypts
            // the DSS objects and the DocTimeStamp field.
            const ltBytes = _appendDss(bytes, opts, encCtx);
            if (level === 'LT') return ltBytes;
            // ── LTA : append DocTimeStamp on top of the LT bytes ──
            return _appendDocTimeStamp(ltBytes, opts, hashAlg, encCtx);
        }

        // ── LT/LTA helpers ──────────────────────────────────────────────
        /**
         * Encrypt every string and stream payload of a FRESH typed object the
         * LT/LTA update introduces (ISO 32000-2 §7.6.2: encryption applies to
         * "all strings and streams in the document's file", the strings
         * through the string crypt filter, the streams through the stream
         * crypt filter): strings with `encCtx.strMethod`, stream payloads with
         * `encCtx.stmMethod`, each with a fresh 16-byte IV from
         * `encCtx.randomBytes`. A crypt filter whose method is `Identity`
         * leaves its values as they are. Names, numbers, booleans,
         * references and stream dictionary keys pass through (§7.6.2 encrypts
         * none of them); the serializer recomputes a stream's `/Length` from
         * the encrypted payload. `(num, gen)` is the object the value is
         * written under — the per-object key of the V=4 handler. Returns a
         * new object; `value` is not modified.
         *
         * Only objects the update CREATES go through here. Objects it copies
         * (the Catalog, a page, an AcroForm) keep their existing ciphertext
         * under their own number and generation, hence under their own key.
         * The one string §7.6.2 exempts — the hexadecimal `/Contents` of a
         * signature dictionary — is never passed here.
         */
        function _encryptNewObject(value, num, gen, encCtx) {
            const { handler, typedForPw, fek, randomBytes } = encCtx;
            const strTyped = Object.assign({}, typedForPw,
                { method: encCtx.strMethod });
            const stmTyped = Object.assign({}, typedForPw,
                { method: encCtx.stmMethod });
            function walk(v) {
                if (!v || typeof v !== 'object') return v;
                switch (v.type) {
                    case 'string': {
                        if (encCtx.strMethod === 'Identity'
                            || !(v.value instanceof Uint8Array)) return v;
                        return { type: 'string', syntax: 'hex',
                            value: handler.encryptString(strTyped, fek,
                                num, gen, v.value, randomBytes(16)) };
                    }
                    case 'array':
                        return { type: 'array', items: v.items.map(walk) };
                    case 'dict': {
                        const entries = {};
                        for (const k of Object.keys(v.entries)) {
                            entries[k] = walk(v.entries[k]);
                        }
                        return { type: 'dict', entries };
                    }
                    case 'stream': {
                        const dict = walk(v.dict);
                        const raw = encCtx.stmMethod === 'Identity'
                            || !(v.raw instanceof Uint8Array)
                            ? v.raw
                            : handler.encryptStream(stmTyped, fek, num, gen,
                                v.raw, randomBytes(16));
                        return { type: 'stream', dict, raw };
                    }
                    default:
                        return v;
                }
            }
            return walk(value);
        }

        /**
         * Append the DSS dictionary (+ supporting cert/OCSP/CRL streams)
         * and an updated Catalog (carrying `/DSS dssNum 0 R`) as an
         * incremental update over `signedBytes`.
         *
         * Encrypted base (`encCtx`, the context `sign()` derived): the DSS
         * objects `pdfDssBuilder.buildDss` returns in plaintext are encrypted
         * with the document key before they are written
         * (`_encryptNewObject`), and the update trailer repeats the base's
         * `/Encrypt` (ISO 32000-2 §7.5.6). `encCtx === null` (a clear base)
         * writes them as built.
         */
        function _appendDss(signedBytes, opts, encCtx) {
            const dssOpts = opts.dss || {};
            const certs = Array.isArray(dssOpts.certs) ? dssOpts.certs.map(_toDer) : [];
            const ocsps = Array.isArray(dssOpts.ocsps) ? dssOpts.ocsps.slice() : [];
            const crls  = Array.isArray(dssOpts.crls)  ? dssOpts.crls.slice()  : [];
            // Fresh object numbers start at the merged trailer's /Size of
            // the signed bytes (every section, newest first).
            const trailer = _readBaseTrailer(signedBytes);
            const nextNum = _firstFreeObjNum(trailer);
            const built = dssBuilderMod.buildDss({
                certs, ocsps, crls, vri: dssOpts.vri,
                autoVri:     !!dssOpts.autoVri,
                parentBytes: signedBytes,
                startNum: nextNum
            });
            // Re-define the Catalog — whatever its number or container —
            // with its entries copied and /DSS added.
            const catalogUpdate = _buildUpdatedCatalog(signedBytes, built.dssNum);
            const updates = encCtx
                ? built.updates.map((u) => ({ num: u.num, gen: u.gen | 0,
                    value: _encryptNewObject(u.value, u.num, u.gen | 0, encCtx) }))
                : built.updates.slice();
            // The Catalog is NOT re-encrypted: its entries are the base
            // Catalog's own (ciphertext strings, if any), copied under the
            // same object number and generation, so their key is unchanged.
            updates.push(catalogUpdate);
            return incrementalWriterMod.appendIncremental(signedBytes, {
                updates,
                root: { num: catalogUpdate.num, gen: catalogUpdate.gen },
                info: trailer.info,
                id: trailer.id,
                // An update over an encrypted base repeats its /Encrypt
                // (ISO 32000-2 §7.5.6).
                encrypt: trailer.encrypt
            });
        }

        /**
         * Append a DocTimeStamp signature (RFC 3161) as a second
         * incremental update. Reuses `_emitWithPlaceholder` (the same
         * `pdfIncrementalWriter` emitter as the /Sig) with
         * `subFilter='ETSI.RFC3161'` and `isDocTimeStamp=true`.
         *
         * Encrypted base: `encCtx` encrypts the DocTimeStamp field's `/T`
         * (`_buildSignatureField`); the `/DocTimeStamp` dictionary's
         * hexadecimal `/Contents` is written and patched in clear — ISO
         * 32000-2 §7.6.2 excludes the Contents value of a signature
         * dictionary from encryption.
         */
        function _appendDocTimeStamp(ltBytes, opts, hashAlg, encCtx) {
            const ih = HASH_TABLE[hashAlg];
            const placeholderBytes = opts.docTimeStampPlaceholder
                || opts.placeholderBytes || 8192;
            const emitted = _emitWithPlaceholder(ltBytes, placeholderBytes,
                'ETSI.RFC3161', /* isDocTimeStamp */ true, opts, encCtx);
            const { bytes, contentsOffset, contentsLength, byteRange } = emitted;
            const signedRange = new Uint8Array(byteRange[1] + byteRange[3]);
            signedRange.set(
                bytes.subarray(byteRange[0], byteRange[0] + byteRange[1]), 0);
            signedRange.set(
                bytes.subarray(byteRange[2], byteRange[2] + byteRange[3]),
                byteRange[1]);
            const digest = _hashBytes(ih.mod, signedRange);
            const tstToken = opts.tsaSign({ digest, hashAlg });
            if (!(tstToken instanceof Uint8Array)) {
                throw new ContractError('pdf/sign/tsa-bad-result-lta',
                    'opts.tsaSign must return a Uint8Array (RFC 3161 '
                    + 'TimeStampToken DER) for the LTA DocTimeStamp');
            }
            if (tstToken.length > placeholderBytes) {
                throw new ContractError('pdf/sign/tst-too-large',
                    'TimeStampToken exceeds DocTimeStamp /Contents placeholder',
                    { context: { tstLength: tstToken.length,
                                 placeholder: placeholderBytes } });
            }
            const hex = _bytesToHex(tstToken);
            const TE = new TextEncoder();
            const hexBytes = TE.encode(hex);
            const pad = contentsLength - hexBytes.length;
            if (pad < 0) {
                throw new ContractError('pdf/sign/dts-hex-overflow',
                    'TimeStampToken hex exceeds /Contents placeholder');
            }
            bytes.set(hexBytes, contentsOffset);
            for (let i = 0; i < pad; i++) {
                bytes[contentsOffset + hexBytes.length + i] = 0x30;
            }
            return bytes;
        }

        /**
         * The Catalog re-definition carrying `/DSS dssNum 0 R`.
         *
         * The Catalog is the object the document's merged trailer names as
         * `/Root`, resolved through `pdfDocument.readDocument` — whatever its
         * object number, and whether it sits at a byte offset or inside an
         * object stream. Its entries are copied verbatim (any prior `/DSS`
         * is replaced) and the update keeps the Catalog's own number and
         * generation, so the newest cross-reference section redefines it.
         * An encrypted document is read with `allowEncrypted` — the copied
         * strings keep their object number and generation, hence their key.
         */
        function _buildUpdatedCatalog(bytes, dssNum) {
            const doc = documentMod.readDocument(bytes, { allowEncrypted: true });
            const rootRef = doc.trailer.root;
            const catalog = doc._raw.resolve(
                { type: 'ref', num: rootRef.num, gen: rootRef.gen });
            if (!catalog || catalog.type !== 'dict') {
                throw new ContractError('pdf/sign/catalog-not-found',
                    `the trailer /Root (object ${rootRef.num} ${rootRef.gen}) `
                    + 'does not resolve to a Catalog dictionary',
                    { context: { root: rootRef } });
            }
            const entries = Object.assign({}, catalog.entries);
            entries.DSS = { type: 'ref', num: dssNum | 0, gen: 0 };
            return { num: rootRef.num, gen: rootRef.gen | 0,
                     value: { type: 'dict', entries } };
        }

        return {
            sign,
            // Exposed for white-box testing :
            _buildPkcs7,
            _buildSignedAttrs,
            _sortDerSetOf,
            _buildUnsignedAttrsTsa,
            _extractIssuerSerial,
            _emitWithPlaceholder,
            _hashBytes,
            _toDer,
            HASH_TABLE
        };
    }
};
