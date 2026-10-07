// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview External-oracle CMS tests. The package's own verifier used
 * to accept both of its own defective CMS forms, so a suite that only
 * round-trips `sign()` through `verifyAllSignatures` is circular. These
 * tests read two COMMITTED PDFs whose `/Contents` CMS was produced by
 * OpenSSL (`openssl cms -sign`, detached, DER) over the package's own
 * `/ByteRange` content:
 *
 *   - `ecdsa-p256-sha256-openssl.pdf` — ECDSA P-256 / SHA-256;
 *   - `ed25519-sha512-openssl.pdf`    — Ed25519 / SHA-512 (RFC 8419).
 *
 * They assert that (1) our verifier accepts both, (2) a one-byte tamper of
 * the covered content is rejected with `pdf/sig/digest-mismatch`, and
 * (3) our `sign()` output is STRUCTURALLY what OpenSSL produces: the ECDSA
 * `signature` is a DER `SEQUENCE { INTEGER, INTEGER }` and the Ed25519
 * SignerInfo `digestAlgorithm` (and the SignedData `digestAlgorithms`) is
 * id-sha512. The structural legs pair the oracle certificate with an
 * unrelated key on purpose — they compare shape, not cryptography.
 *
 * No test runs `openssl`. The fixtures are produced by the manual generator
 * `tests/_fixtures/cms-oracle/generate.mjs` (provenance, commands and
 * sha256s in that directory's README). A missing fixture FAILS the suite
 * with the regeneration command — it never skips.
 *
 * @module pdf/tests/cms-oracle.integration
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getRuntime } from './_helpers/build.js';

const FIXTURE_DIR = new URL('_fixtures/cms-oracle/', import.meta.url);
const ECDSA_FIXTURE = 'ecdsa-p256-sha256-openssl.pdf';
const ED_FIXTURE = 'ed25519-sha512-openssl.pdf';
const REGEN_CMD = 'bun packages/front/office/pdf/tests/_fixtures/cms-oracle/generate.mjs '
    + 'packages/front/office/pdf/tests/_fixtures/cms-oracle';

/** The text line the generator draws on the base page (a content-stream literal). */
const BASE_TEXT = 'awa pdf CMS oracle';

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_SHA512 = '2.16.840.1.101.3.4.2.3';

/** Signing in pure JS (ECDSA keygen included) is slower than bun's 5 s default. */
const SIGN_TIMEOUT_MS = 60_000;

const rt = getRuntime();
const sig = rt.resolve('pdfSignature');
const doc = rt.resolve('pdfDocument');
const asn1 = rt.resolve('asn1');
const pdfSign = rt.resolve('pdfSign');
const ecc = rt.resolve('ecc');
const ed25519 = rt.resolve('ed25519');
const { builder } = rt.resolve('pdfBuilder');

const FB = {
    asn1, ecc, ed25519,
    rsa: rt.resolve('rsa'),
    sha256: rt.resolve('sha256'),
    sha384: rt.resolve('sha384'),
    sha512: rt.resolve('sha512'),
    bitArray: rt.resolve('bitArray')
};

// ── CMS helpers ──────────────────────────────────────────────────────────

function latin1(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return s;
}

/** The LAST `/ByteRange` of a signed PDF. */
function byteRangeOf(pdfBytes) {
    const all = [...latin1(pdfBytes).matchAll(
        /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    if (!all.length) throw new Error('no /ByteRange');
    return all[all.length - 1].slice(1, 5).map(Number);
}

/**
 * The DER CMS of the LAST `/Contents <…>` hex literal, cut to its own TLV
 * length (the zero padding after it is dropped).
 */
function cmsOf(pdfBytes) {
    const all = [...latin1(pdfBytes).matchAll(/\/Contents\s*<([0-9A-Fa-f]+)>/g)];
    if (!all.length) throw new Error('no /Contents hex literal');
    const hex = all[all.length - 1][1];
    const raw = new Uint8Array(hex.length >>> 1);
    for (let i = 0; i < raw.length; i++) raw[i] = parseInt(hex.substr(i * 2, 2), 16);
    const top = asn1.parseOne(raw, 0);
    if (!top) throw new Error('/Contents is not a DER TLV');
    return raw.subarray(0, top.next);
}

/** SignedData children (version, digestAlgorithms, encapContentInfo, …). */
function signedDataOf(cms) {
    const sd = sig.locatePkcs7(cms, asn1);
    if (!sd) throw new Error('not a CMS SignedData');
    return sd;
}

/** The first SignerInfo's children. */
function signerInfoOf(cms) {
    const sd = signedDataOf(cms);
    const siSet = [...sd].reverse().find(n => n.tag === 0x31);
    const signers = asn1.parseChildren(siSet.value);
    return asn1.parseChildren(signers[0].value);
}

/** The SignerInfo `signature` value — its last OCTET STRING. */
function signatureValueOf(si) {
    const last = si[si.length - 1];
    if (last.tag !== 0x04) throw new Error('SignerInfo does not end with an OCTET STRING');
    return last.value;
}

/** The SignerInfo `digestAlgorithm` OID (`si[2]`, child 0). */
function digestAlgOidOf(si) {
    return asn1.readOid(asn1.parseChildren(si[2].value)[0]);
}

/** Every OID in the SignedData `digestAlgorithms` SET. */
function digestAlgorithmsOf(cms) {
    const set = signedDataOf(cms)[1];
    return asn1.parseChildren(set.value)
        .map(alg => asn1.readOid(asn1.parseChildren(alg.value)[0]));
}

/** The first certificate inside the SignedData `[0] IMPLICIT certificates`. */
function certOf(cms) {
    const node = signedDataOf(cms).find(n => n.tag === 0xA0);
    if (!node) throw new Error('no certificates field');
    const first = asn1.parseOne(node.value, 0);
    return node.value.slice(0, first.next);
}

/**
 * Shape of an ECDSA signature value as OpenSSL emits it: the top tag, the
 * child count and the child tags. `null` when the bytes are not one
 * well-formed constructed TLV spanning the whole value.
 */
function ecdsaShapeOf(value) {
    const top = asn1.parseOne(value, 0);
    if (!top || top.next !== value.length || top.tag !== 0x30) return null;
    const kids = asn1.parseChildren(top.value);
    if (!kids) return null;
    return { tag: top.tag, count: kids.length, childTags: kids.map(k => k.tag),
             childLengths: kids.map(k => k.value.length) };
}

/** Assert a DER `ECDSA-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER }`. */
function assertDerEcdsaSig(value) {
    const shape = ecdsaShapeOf(value);
    if (!shape) throw new Error('not a single DER SEQUENCE spanning the value');
    if (shape.count !== 2 || shape.childTags.some(t => t !== 0x02)) {
        throw new Error('SEQUENCE does not hold exactly two INTEGERs');
    }
    return shape;
}

// ── Fixtures and the base document ───────────────────────────────────────

/** The generator's base: one page, Helvetica, one text line. */
function makeBase() {
    return builder()
        .addPage()
        .addFont({ name: 'F1', baseFont: 'Helvetica' })
        .addContent(`BT /F1 12 Tf 72 720 Td (${BASE_TEXT}) Tj ET`)
        .build();
}

/** Flip one byte of the page content stream, inside the first /ByteRange span. */
function tamper(pdfBytes) {
    const br = byteRangeOf(pdfBytes);
    const at = latin1(pdfBytes).indexOf(`(${BASE_TEXT})`);
    if (at < 0) throw new Error('base text not found');
    if (!(at >= br[0] && at + 1 < br[0] + br[1])) throw new Error('base text outside the first span');
    const out = new Uint8Array(pdfBytes);
    out[at + 1] ^= 0x01;
    return out;
}

const fixtures = {};

beforeAll(() => {
    const missing = [ECDSA_FIXTURE, ED_FIXTURE]
        .filter(name => !existsSync(fileURLToPath(new URL(name, FIXTURE_DIR))));
    if (missing.length) {
        throw new Error(`CMS oracle fixture(s) missing: ${missing.join(', ')}. `
            + `Regenerate them on a station with an OpenSSL that signs EdDSA CMS: ${REGEN_CMD}`);
    }
    fixtures.ecdsa = new Uint8Array(readFileSync(new URL(ECDSA_FIXTURE, FIXTURE_DIR)));
    fixtures.ed = new Uint8Array(readFileSync(new URL(ED_FIXTURE, FIXTURE_DIR)));
});

// ── Oracle fixtures verify ───────────────────────────────────────────────

describe('OpenSSL ECDSA P-256 / SHA-256 fixture', () => {
    test('verifyAllSignatures: one signature, verified, ecc / sha256, no error', () => {
        const r = sig.verifyAllSignatures(fixtures.ecdsa, FB);
        expect(r.signatures.length).toBe(1);
        const s = r.signatures[0];
        expect(s.errors).toEqual([]);
        expect(s.verified).toBe(true);
        expect(s.pkVerified).toBe(true);
        expect(s.signatureAlg).toBe('ecc');
        expect(s.hashAlg).toBe('sha256');
    });

    test('the document reads with one page', () => {
        expect(doc.readDocument(fixtures.ecdsa).pages.length).toBe(1);
    });

    test('the signature value is DER SEQUENCE { INTEGER, INTEGER } (the OpenSSL shape)', () => {
        const si = signerInfoOf(cmsOf(fixtures.ecdsa));
        expect(digestAlgOidOf(si)).toBe(OID_SHA256);
        const shape = assertDerEcdsaSig(signatureValueOf(si));
        expect(shape.tag).toBe(0x30);
        expect(shape.childTags).toEqual([0x02, 0x02]);
        for (const len of shape.childLengths) {
            expect(len).toBeGreaterThanOrEqual(32);
            expect(len).toBeLessThanOrEqual(33);
        }
    });

    test('tamper control: one flipped content byte → digest mismatch', () => {
        const r = sig.verifyAllSignatures(tamper(fixtures.ecdsa), FB);
        expect(r.signatures.length).toBe(1);
        expect(r.signatures[0].verified).toBe(false);
        expect(r.signatures[0].errors.map(e => e.code)).toContain('pdf/sig/digest-mismatch');
    });
});

describe('OpenSSL Ed25519 / SHA-512 fixture', () => {
    test('verifyAllSignatures: verified, ed25519 / sha512', () => {
        const r = sig.verifyAllSignatures(fixtures.ed, FB);
        expect(r.signatures.length).toBe(1);
        const s = r.signatures[0];
        expect(s.errors).toEqual([]);
        expect(s.verified).toBe(true);
        expect(s.pkVerified).toBe(true);
        expect(s.signatureAlg).toBe('ed25519');
        expect(s.hashAlg).toBe('sha512');
    });

    test('the document reads with one page', () => {
        expect(doc.readDocument(fixtures.ed).pages.length).toBe(1);
    });

    test('SignerInfo digestAlgorithm is id-sha512 and the signature is 64 bytes', () => {
        const si = signerInfoOf(cmsOf(fixtures.ed));
        expect(digestAlgOidOf(si)).toBe(OID_SHA512);
        expect(signatureValueOf(si).length).toBe(64);
    });

    test('tamper control: one flipped content byte → digest mismatch', () => {
        const r = sig.verifyAllSignatures(tamper(fixtures.ed), FB);
        expect(r.signatures.length).toBe(1);
        expect(r.signatures[0].verified).toBe(false);
        expect(r.signatures[0].errors.map(e => e.code)).toContain('pdf/sig/digest-mismatch');
    });
});

// ── Our sign() output has the oracle's structure ─────────────────────────

describe('sign() output vs the OpenSSL shape', () => {
    test('ECDSA: the signature value has the oracle tag / child-count / child-tag tuple', () => {
        const oracle = assertDerEcdsaSig(signatureValueOf(signerInfoOf(cmsOf(fixtures.ecdsa))));
        const signed = pdfSign.sign(makeBase(), {
            algorithm: 'ecdsa',
            hashAlg: 'sha256',
            cert: certOf(cmsOf(fixtures.ecdsa)),
            privateKey: { curve: ecc.curves.c256, secretKey: ecc.ecdsa.generateKeys(256).sec },
            useSignedAttrs: true,
            subFilter: 'ETSI.CAdES.detached'
        });
        const ours = assertDerEcdsaSig(signatureValueOf(signerInfoOf(cmsOf(signed))));
        const tuple = (s) => [s.tag, s.count, s.childTags];
        expect(tuple(ours)).toEqual(tuple(oracle));
        expect(tuple(ours)).toEqual([0x30, 2, [0x02, 0x02]]);
    }, SIGN_TIMEOUT_MS);

    test('Ed25519: digestAlgorithm and digestAlgorithms carry the oracle OID (id-sha512)', () => {
        const oracleCms = cmsOf(fixtures.ed);
        const oracleOid = digestAlgOidOf(signerInfoOf(oracleCms));
        expect(oracleOid).toBe(OID_SHA512);
        expect(digestAlgorithmsOf(oracleCms)).toEqual([oracleOid]);

        const seed = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
        const signed = pdfSign.sign(makeBase(), {
            algorithm: 'ed25519',
            cert: certOf(oracleCms),
            privateKey: ed25519.keyPair(seed).privateKey,
            useSignedAttrs: true,
            subFilter: 'ETSI.CAdES.detached'
        });
        const ourCms = cmsOf(signed);
        expect(digestAlgOidOf(signerInfoOf(ourCms))).toBe(oracleOid);
        expect(digestAlgorithmsOf(ourCms)).toEqual([oracleOid]);
        expect(signatureValueOf(signerInfoOf(ourCms)).length).toBe(64);
    }, SIGN_TIMEOUT_MS);
});

// ── Non-vacuity of the shape helper ──────────────────────────────────────

describe('DER-shape helper non-vacuity', () => {
    test('a raw 64-byte r||s value fails the DER ECDSA-Sig-Value assertion', () => {
        const raw = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 0xff);
        expect(() => assertDerEcdsaSig(raw)).toThrow();
        // A raw value that merely STARTS like a SEQUENCE header is still refused.
        const lookalike = new Uint8Array(64).fill(0xAB);
        lookalike[0] = 0x30;
        lookalike[1] = 0x3E;
        expect(() => assertDerEcdsaSig(lookalike)).toThrow();
    });

    test('the helper accepts a hand-built DER SEQUENCE { INTEGER, INTEGER }', () => {
        const r = new Uint8Array(32).fill(0x11);
        const s = new Uint8Array(32).fill(0x22);
        const der = asn1.encodeSequence([asn1.encodeInteger(r), asn1.encodeInteger(s)]);
        expect(assertDerEcdsaSig(der).childTags).toEqual([0x02, 0x02]);
    });
});
