// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test helper — rewrite a signed PDF's `/ByteRange` to a
 * chosen gap and re-sign over the newly declared ranges (BL-1605,
 * office/BATCH_44). This is the technique task 01 measured with
 * (`ai/batches/types/office/BATCH_44/_MEASURE_BL1605.md` § 3), committed
 * so the gap-form legs can build either form, and every off-by-one
 * variant, from any `pdfSign` output.
 *
 * - {@link findSignatures} locates each `/Type /Sig` and
 *   `/Type /DocTimeStamp` object: its `/ByteRange` (value and text span)
 *   and its `/Contents` hex-digit span.
 * - {@link gapForm} classifies a gap from the bytes alone — the oracle is
 *   ISO 32000-2 §12.8.3.3.1 and the checks PDFBox (`ShowSignature`: `<`
 *   expected at `ByteRange[1]`) and pyHanko (`evaluate_signature_coverage`:
 *   `start2 == len1 + hex + 2`) run, not our own `pdfByteRange`.
 * - {@link rewriteByteRange} patches the `/ByteRange` in place at the same
 *   width, space-padded inside the brackets as `sign.js` pads it — no byte
 *   moves, so every xref offset stays valid.
 * - {@link resignDeclaredRanges} re-signs over the ranges the file now
 *   declares (ed25519) and writes the fresh PKCS#7 into the unchanged
 *   `/Contents` digits.
 *
 * @module pdf/tests/_helpers/byterange-rewrite
 */

const LT = 0x3C;   // '<'
const GT = 0x3E;   // '>'

function latin1(bytes) {
    return new TextDecoder('latin1').decode(bytes);
}

function isHexDigit(b) {
    return (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
}

/**
 * Every signature-like object in `bytes`, in file order.
 *
 * @param {Uint8Array} bytes
 * @returns {Array<{kind: 'Sig'|'DocTimeStamp', objNum: number, objGen: number,
 *   objHead: number, brOpen: number, brClose: number,
 *   byteRange: number[], contents: {offset: number, length: number}}>}
 *   `brOpen`/`brClose` are the offsets of the `[` and `]` of the
 *   `/ByteRange` array; `contents` is the hex-digit span (between `<` and `>`).
 */
export function findSignatures(bytes) {
    const s = latin1(bytes);
    const out = [];
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        const objHead = m.index;
        const end = s.indexOf('endobj', objHead);
        if (end < 0) break;
        const body = s.slice(objHead, end);
        const type = body.match(/\/Type\s*\/(Sig|DocTimeStamp)(?![A-Za-z0-9])/);
        const br = body.match(/\/ByteRange\s*(\[[^\]]*\])/);
        const con = body.match(/\/Contents\s*</);
        if (!type || !br || !con) continue;
        const brOpen = objHead + br.index + br[0].indexOf('[');
        const brClose = brOpen + br[1].length - 1;
        const lt = objHead + con.index + con[0].length - 1;
        const gt = s.indexOf('>', lt);
        out.push({
            kind: type[1],
            objNum: parseInt(m[1], 10),
            objGen: parseInt(m[2], 10),
            objHead,
            brOpen,
            brClose,
            byteRange: br[1].slice(1, -1).trim().split(/\s+/).map(Number),
            contents: { offset: lt + 1, length: gt - lt - 1 }
        });
    }
    return out;
}

/**
 * Classify the gap `[a+b, c)` of `byteRange` from the bytes alone.
 *
 * @param {Uint8Array} bytes
 * @param {number[]} byteRange
 * @returns {'token'|'digits'|'other'}
 */
export function gapForm(bytes, byteRange) {
    const [a, b, c] = byteRange;
    const gs = a + b;
    const ge = c;
    const allHex = (from, to) => {
        for (let i = from; i < to; i++) if (!isHexDigit(bytes[i])) return false;
        return to > from;
    };
    if (bytes[gs] === LT && bytes[ge - 1] === GT && allHex(gs + 1, ge - 1)) return 'token';
    if (bytes[gs - 1] === LT && bytes[ge] === GT && allHex(gs, ge)) return 'digits';
    return 'other';
}

/** The token-form (b) and digits-form (a) ranges for one signature of `bytes`. */
export function formRanges(bytes, sig) {
    const { offset, length } = sig.contents;
    const total = bytes.length;
    const tokenEnd = offset + length + 1;
    const digitsEnd = offset + length;
    return {
        token: [0, offset - 1, tokenEnd, total - tokenEnd],
        digits: [0, offset, digitsEnd, total - digitsEnd]
    };
}

/** `[0, gapStart, gapEnd, total - gapEnd]`. */
export function rangeWithGap(total, gapStart, gapEnd) {
    return [0, gapStart, gapEnd, total - gapEnd];
}

/**
 * Copy of `bytes` whose `/ByteRange` (of `sig`) reads `newRange`, at the
 * same width, space-padded inside the brackets.
 *
 * @throws {Error} when the new array does not fit the existing width.
 */
export function rewriteByteRange(bytes, sig, newRange) {
    const out = bytes.slice();
    const width = sig.brClose - sig.brOpen + 1;
    const txt = `[${newRange.join(' ')}`;
    if (txt.length + 1 > width) throw new Error('rewriteByteRange: new /ByteRange does not fit');
    const padded = txt + ' '.repeat(width - txt.length - 1) + ']';
    out.set(new TextEncoder().encode(padded), sig.brOpen);
    return out;
}

/**
 * Minimal ed25519 test signer: a deterministic key pair and a self-signed
 * certificate whose SPKI carries the real public key.
 *
 * @param {object} asn1 fw asn1 instance
 * @param {object} ed25519 fw ed25519 instance
 * @param {string} label  CN and seed source
 * @returns {{cert: Uint8Array, privateKey: Uint8Array, publicKey: Uint8Array}}
 */
export function makeTestSigner(asn1, ed25519, label) {
    const te = new TextEncoder();
    const encLen = (n) => (n < 0x80 ? Uint8Array.of(n)
        : n <= 0xff ? Uint8Array.of(0x81, n) : Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff));
    const tlv = (tag, v) => {
        const len = encLen(v.length);
        const o = new Uint8Array(1 + len.length + v.length);
        o[0] = tag; o.set(len, 1); o.set(v, 1 + len.length);
        return o;
    };
    let h = 0x811c9dc5;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = ((h >>> ((i % 4) * 8)) ^ (i * 11)) & 0xff;
    const kp = ed25519.keyPair(seed);
    const name = asn1.encodeSequence([asn1.encodeSet([
        asn1.encodeSequence([asn1.encodeOid('2.5.4.3'), tlv(0x13, te.encode(label))])])]);
    const validity = asn1.encodeSequence([tlv(0x17, te.encode('200101000000Z')),
                                          tlv(0x17, te.encode('300101000000Z'))]);
    const spki = asn1.encodeSequence([asn1.encodeSequence([asn1.encodeOid('1.3.101.112')]),
                                      asn1.encodeBitString(kp.publicKey, 0)]);
    const sigAlg = asn1.encodeSequence([asn1.encodeOid('1.3.101.112'), asn1.encodeNull()]);
    const tbs = asn1.encodeSequence([asn1.encodeInteger((h & 0x7fff) + 1), sigAlg, name,
                                     validity, name, spki]);
    const cert = asn1.encodeSequence([tbs, sigAlg, asn1.encodeBitString(new Uint8Array([0, 0]), 0)]);
    return { cert, privateKey: kp.privateKey, publicKey: kp.publicKey };
}

/** hashAlg (as `opts.tsaSign` receives it) → messageImprint AlgorithmIdentifier OID. */
const TST_HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};

/**
 * Minimal RFC 3161 TimeStampToken over `digest` (`hashAlg` imprint, no
 * signerInfos) — the shape `sign.test.js` and the real-shapes leg use.
 */
export function fakeTstToken(asn1, digest, hashAlg = 'sha256') {
    const A = asn1;
    const oid = TST_HASH_OIDS[hashAlg];
    if (!oid) throw new Error('fakeTstToken: unknown hashAlg ' + hashAlg);
    const messageImprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(oid), A.encodeNull()]),
        A.encodeOctetString(digest)
    ]);
    const t = new TextEncoder().encode('20240101000000Z');
    const genTime = new Uint8Array(2 + t.length);
    genTime[0] = 0x18; genTime[1] = t.length; genTime.set(t, 2);
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1), A.encodeOid('1.2.3.4.5'), messageImprint, A.encodeInteger(1), genTime
    ]);
    const encap = A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.9.16.1.4'),
        A.encodeExplicit(0, A.encodeOctetString(tstInfo))
    ]);
    const signedData = A.encodeSequence([A.encodeInteger(1), A.encodeSet([]), encap, A.encodeSet([])]);
    return A.encodeSequence([A.encodeOid('1.2.840.113549.1.7.2'), A.encodeExplicit(0, signedData)]);
}

/**
 * Re-sign `sig` over the ranges `bytes` now declares for it, and write the
 * fresh PKCS#7 (hex, `0`-padded) into its unchanged `/Contents` digits.
 *
 * @param {Uint8Array} bytes
 * @param {object} sig      an entry of {@link findSignatures}(bytes)
 * @param {{signMod: object, ed25519: object, sha256: object,
 *          signer: {cert: Uint8Array, privateKey: Uint8Array},
 *          signedAttrs?: boolean}} ctx
 *   `signMod` is a resolved `pdfSign` (its white-box `_buildPkcs7`,
 *   `_buildSignedAttrs`, `_hashBytes`).
 * @returns {Uint8Array}
 */
export function resignDeclaredRanges(bytes, sig, ctx) {
    const out = bytes.slice();
    const [a, b, c, d] = findSignatures(out).find((x) => x.objHead === sig.objHead).byteRange;
    const signed = new Uint8Array(b + d);
    signed.set(out.subarray(a, a + b), 0);
    signed.set(out.subarray(c, c + d), b);
    const { signMod, ed25519, sha256, signer } = ctx;
    let message = signed;
    let signedAttrsTlv = null;
    if (ctx.signedAttrs) {
        signedAttrsTlv = signMod._buildSignedAttrs({
            messageDigest: signMod._hashBytes(sha256, signed),
            certDigestSha256: signMod._hashBytes(sha256, signer.cert),
            signingTime: new Date(Date.UTC(2026, 8, 23))
        });
        message = signedAttrsTlv;
    }
    const sigBytes = ed25519.sign(signer.privateKey, message);
    const pkcs7 = signMod._buildPkcs7({
        certDer: signer.cert, sigBytes, hashAlg: 'sha256', signatureAlg: 'ed25519',
        signedAttrsTlv, unsignedAttrsTlv: null
    });
    let hex = '';
    for (let i = 0; i < pkcs7.length; i++) hex += pkcs7[i].toString(16).padStart(2, '0');
    hex = hex.toUpperCase();
    if (hex.length > sig.contents.length) throw new Error('resignDeclaredRanges: PKCS#7 does not fit');
    out.set(new TextEncoder().encode(hex.padEnd(sig.contents.length, '0')), sig.contents.offset);
    return out;
}
