// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfCertChain` — real-DER certificate parsing paths.
 *
 * `certChain.test.js` drives the module through an asn1 stub; this file
 * feeds it genuine DER built with the fw `asn1` encoders, which is the
 * only way to exercise `_reconstructDer` (the DER length-ladder used to
 * carve a child certificate back out of the CMS `certificates [0]`
 * field) and the GeneralizedTime / version-[0] branches of
 * `parseCertificate`.
 *
 * Certificates here are structurally valid but cryptographically inert
 * (the signature BIT STRING is filler): this layer performs no
 * signature verification, so no cryptographic byte is asserted.
 *
 * @module pdf/sig/certChain.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfCertChain } from './certChain.js';
import { pdfErrors } from '../errors.js';
import { pdfSigOids } from './oids.js';
import { asn1Oid } from '@awacloud/fw/crypto/utils/asn1-oid.js';
import { asn1 as _fwAsn1 } from '@awacloud/fw/crypto/utils/asn1.js';
import { pem as _fwPem } from '@awacloud/fw/crypto/utils/pem.js';
import { b64 as _fwB64 } from '@awacloud/fw/io/codec/b64.js';

const A = _fwAsn1.factory();
const _errors = pdfErrors.factory();
const { ParseError } = _errors;
const _pemMod = _fwPem.factory(_fwB64.factory());

const { extractCertsFromCms, extractCertFromPem, parseCertificate,
        findIssuer, validateChainOrder } =
    pdfCertChain.factory(_errors, pdfSigOids.factory(asn1Oid.factory()),
                         A, _pemMod);

const OID_CN = '2.5.4.3';
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';

function tlv(tag, body) {
    let len;
    if (body.length < 0x80) len = Uint8Array.of(body.length);
    else if (body.length <= 0xff) len = Uint8Array.of(0x81, body.length);
    else len = Uint8Array.of(0x82, (body.length >>> 8) & 0xff, body.length & 0xff);
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
function utcTime(s)   { return tlv(0x17, new TextEncoder().encode(s)); }
function genTime(s)   { return tlv(0x18, new TextEncoder().encode(s)); }

function name(cn) {
    return A.encodeSequence([
        A.encodeSet([A.encodeSequence([A.encodeOid(OID_CN), printable(cn)])])
    ]);
}

/**
 * Build a structurally valid X.509 certificate.
 *
 * @param {Object} o
 * @param {string} o.cn Subject CN.
 * @param {string} [o.issuerCn] Issuer CN (defaults to a self-issued name).
 * @param {number} [o.serial]
 * @param {boolean} [o.v3] Emit the `[0] EXPLICIT version` field (v3).
 * @param {boolean} [o.generalized] Use GeneralizedTime for validity.
 * @param {number} [o.padKeyBytes] Public-key filler size (drives the DER
 *   length ladder used by `_reconstructDer`).
 */
function buildCert(o) {
    const spki = A.encodeSequence([
        A.encodeSequence([A.encodeOid(OID_RSA), A.encodeNull()]),
        A.encodeBitString(new Uint8Array(o.padKeyBytes || 8), 0)
    ]);
    const validity = o.generalized
        ? A.encodeSequence([genTime('20200101000000Z'), genTime('20300101000000Z')])
        : A.encodeSequence([utcTime('200101000000Z'), utcTime('300101000000Z')]);
    const tbsKids = [];
    if (o.v3) tbsKids.push(A.encodeExplicit(0, A.encodeInteger(new Uint8Array([2]))));
    tbsKids.push(
        A.encodeInteger(new Uint8Array([o.serial === undefined ? 1 : o.serial])),
        A.encodeSequence([A.encodeOid(OID_SHA256_RSA), A.encodeNull()]),
        name(o.issuerCn || o.cn),
        validity,
        name(o.cn),
        spki
    );
    return A.encodeSequence([
        A.encodeSequence(tbsKids),
        A.encodeSequence([A.encodeOid(OID_SHA256_RSA), A.encodeNull()]),
        A.encodeBitString(new Uint8Array(4), 0)
    ]);
}

/** Wrap cert DERs into a CMS SignedData ContentInfo. */
function buildCms(certDers, opts) {
    opts = opts || {};
    const sdKids = [
        A.encodeInteger(new Uint8Array([1])),
        A.encodeSet([A.encodeSequence([A.encodeOid(OID_SHA256_RSA)])]),
        A.encodeSequence([A.encodeOid('1.2.840.113549.1.7.1')])
    ];
    if (!opts.noCerts) sdKids.push(tlv(0xA0, concat(certDers)));
    sdKids.push(A.encodeSet([]));
    return A.encodeSequence([
        A.encodeOid(OID_SIGNED_DATA),
        A.encodeExplicit(0, A.encodeSequence(sdKids))
    ]);
}

describe('parseCertificate — real DER', () => {
    test('typed record from a v1 certificate (UTCTime validity)', () => {
        const c = parseCertificate(buildCert({ cn: 'Leaf', issuerCn: 'CA' }), A);
        expect(c.version).toBe(1);
        expect(c.subject).toBe('CN=Leaf');
        expect(c.issuer).toBe('CN=CA');
        expect(c.notBefore.toISOString()).toBe('2020-01-01T00:00:00.000Z');
        expect(c.notAfter.toISOString()).toBe('2030-01-01T00:00:00.000Z');
        expect(c.keyAlgorithm).toBe('rsa');
        expect(c.sigAlgorithm).toBe('sha256WithRSAEncryption');
        expect(Array.from(c.serialNumber)).toEqual([1]);
    });

    test('reads the [0] EXPLICIT version of a v3 certificate', () => {
        const c = parseCertificate(buildCert({ cn: 'V3', v3: true, serial: 9 }), A);
        expect(c.version).toBe(3);
        expect(c.subject).toBe('CN=V3');
        expect(Array.from(c.serialNumber)).toEqual([9]);
    });

    test('parses a GeneralizedTime validity window', () => {
        const c = parseCertificate(
            buildCert({ cn: 'Gen', generalized: true }), A);
        expect(c.notBefore.toISOString()).toBe('2020-01-01T00:00:00.000Z');
        expect(c.notAfter.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    });

    test('rejects a certificate with fewer than 3 children', () => {
        let caught = null;
        try {
            parseCertificate(A.encodeSequence([A.encodeInteger(
                new Uint8Array([1]))]), A);
        } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/cert/short');
    });

    test('rejects a certificate whose tbsCertificate does not parse', () => {
        const badTbs = tlv(0x30, new Uint8Array([0x30, 0x7F]));  // truncated
        let caught = null;
        try {
            parseCertificate(A.encodeSequence([
                badTbs, A.encodeNull(), A.encodeNull()]), A);
        } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/cert/bad-tbs');
    });

    test('rejects a top-level parse failure', () => {
        let caught = null;
        try { parseCertificate(new Uint8Array([0x30, 0x7F, 0x00]), A); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/cert/malformed');
    });
});

describe('extractCertsFromCms — real DER', () => {
    test('carves every certificate back out of the certificates [0] field', () => {
        const leaf = buildCert({ cn: 'Leaf', issuerCn: 'CA', serial: 1 });
        const ca   = buildCert({ cn: 'CA', issuerCn: 'Root', serial: 2 });
        const out = extractCertsFromCms(buildCms([leaf, ca]), A);
        expect(out.length).toBe(2);
        expect(out[0].subject).toBe('CN=Leaf');
        expect(out[1].subject).toBe('CN=CA');
        // `_reconstructDer` must hand back the EXACT original TLV bytes.
        expect(Array.from(out[0].raw)).toEqual(Array.from(leaf));
        expect(Array.from(out[1].raw)).toEqual(Array.from(ca));
    });

    test('reconstructs certificates across the DER length ladder', () => {
        // 1-, 2- and 3-byte length forms in the same certificates field.
        const small = buildCert({ cn: 'S', padKeyBytes: 1 });
        const mid   = buildCert({ cn: 'M', padKeyBytes: 100 });
        const big   = buildCert({ cn: 'B', padKeyBytes: 400 });
        expect(small[1]).toBeLessThan(0x80);
        expect(mid[1]).toBe(0x81);
        expect(big[1]).toBe(0x82);
        const out = extractCertsFromCms(buildCms([small, mid, big]), A);
        expect(out.map((c) => c.subject)).toEqual(['CN=S', 'CN=M', 'CN=B']);
        expect(Array.from(out[1].raw)).toEqual(Array.from(mid));
        expect(Array.from(out[2].raw)).toEqual(Array.from(big));
    });

    test('skips a malformed certificate and reports it via opts.warnings', () => {
        const good = buildCert({ cn: 'Good' });
        const bad  = A.encodeSequence([A.encodeInteger(new Uint8Array([1]))]);
        const warnings = [];
        const out = extractCertsFromCms(buildCms([bad, good]), A, { warnings });
        expect(out.length).toBe(1);
        expect(out[0].subject).toBe('CN=Good');
        expect(warnings.length).toBe(1);
        expect(warnings[0].code).toBe('pdf/cert/short');
        expect(warnings[0].context.index).toBe(0);
        expect(warnings[0].message).toContain('skipped malformed cert');
    });

    test('drops a malformed certificate silently without opts.warnings', () => {
        const bad = A.encodeSequence([A.encodeInteger(new Uint8Array([1]))]);
        expect(extractCertsFromCms(buildCms([bad]), A)).toEqual([]);
        expect(extractCertsFromCms(buildCms([bad]), A, {})).toEqual([]);
    });

    test('ignores non-SEQUENCE children of the certificates field', () => {
        const good = buildCert({ cn: 'Good' });
        const cms = buildCms([concat([A.encodeNull(), good])]);
        const out = extractCertsFromCms(cms, A);
        expect(out.length).toBe(1);
        expect(out[0].subject).toBe('CN=Good');
    });

    test('returns [] when the SignedData carries no certificates field', () => {
        expect(extractCertsFromCms(buildCms([], { noCerts: true }), A))
            .toEqual([]);
    });
});

describe('extractCertFromPem — real fw pem', () => {
    test('decodes a PEM block and parses the certificate', () => {
        const der = buildCert({ cn: 'Pem', issuerCn: 'PemCA' });
        const armored = _pemMod.encode(der, 'CERTIFICATE');
        expect(armored).toContain('BEGIN CERTIFICATE');
        const c = extractCertFromPem(armored, _pemMod, A);
        expect(c.subject).toBe('CN=Pem');
        expect(c.issuer).toBe('CN=PemCA');
    });
});

describe('chain helpers over parsed certificates', () => {
    test('findIssuer + validateChainOrder agree on a real 3-cert chain', () => {
        const leaf = parseCertificate(
            buildCert({ cn: 'Leaf', issuerCn: 'CA', serial: 1 }), A);
        const ca = parseCertificate(
            buildCert({ cn: 'CA', issuerCn: 'Root', serial: 2 }), A);
        const root = parseCertificate(
            buildCert({ cn: 'Root', issuerCn: 'Root', serial: 3 }), A);
        expect(findIssuer(leaf, [leaf, ca, root])).toBe(ca);
        expect(findIssuer(ca, [leaf, ca, root])).toBe(root);
        expect(validateChainOrder([leaf, ca, root]).valid).toBe(true);
        const broken = validateChainOrder([leaf, root]);
        expect(broken.valid).toBe(false);
        expect(broken.errors[0].code).toBe('pdf/cert/chain-break');
        expect(broken.errors[0].context.issuer).toBe('CN=CA');
        expect(broken.errors[0].context.subject).toBe('CN=Root');
    });
});
