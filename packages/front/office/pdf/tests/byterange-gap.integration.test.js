// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `/ByteRange` gap form — sign → verify → re-read
 * (BL-1605, office/BATCH_44 task 03; verdict MOVE in
 * `ai/batches/types/office/BATCH_44/_MEASURE_BL1605.md`).
 *
 * ISO 32000-2 §12.8.3.3.1 requires `/Contents` to "fit precisely in the
 * space between the ranges specified by ByteRange": the gap is the whole
 * `<…>` token (form b). PDFBox and pyHanko emit and check that form.
 * `pdfSign` emitted the hex digits only (form a) until BL-1605.
 *
 * Legs:
 *
 *   1. `pdfSign` emits form (b) for the `/Sig` (classical-table and
 *      xref-stream bases) and for the LTA `/DocTimeStamp`; the file
 *      verifies and re-reads.
 *   2. The verifier accepts both exact forms: a legacy form-(a) file and a
 *      form-(b) file, each BUILT BY REWRITING the `/ByteRange` and
 *      re-signing over it (`_helpers/byterange-rewrite.js`), verify —
 *      through `verifyAllSignatures` and through
 *      `verifySignature(typeSignature(dict))`.
 *   3. Every other gap is refused with `pdf/sig/byterange/gap-start-mismatch`
 *      / `gap-end-mismatch`, even when re-signed over its own declared
 *      ranges so the public-key check passes (task 01 measured those as
 *      `verified: true` before BL-1605 — the verify path had no gap check).
 *   4. One ANSSI base at level B when the asset is present (skips visibly
 *      otherwise).
 *
 * The gap form is classified from the bytes by `gapForm` (the helper's
 * oracle: `<` at `ByteRange[1]`, pyHanko's `start2 == len1 + hex + 2`),
 * never by our own `pdfByteRange`.
 *
 * @module pdf/tests/byterange-gap.integration
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../src/main.js';
import { buildDocument } from './_helpers/build.js';
import { getAnssiCorpus, ANSSI_DOCS } from './_helpers/anssi-corpus.js';
import {
    findSignatures, gapForm, formRanges, rangeWithGap, rewriteByteRange,
    resignDeclaredRanges, makeTestSigner, fakeTstToken
} from './_helpers/byterange-rewrite.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const { readDocument } = rt.resolve('pdfDocument');
const signMod = rt.resolve('pdfSign');
const { verifyAllSignatures, verifySignature, typeSignature } = rt.resolve('pdfSignature');
const { auditByteRange, findContentsField } = rt.resolve('pdfByteRange');
const ed25519m = rt.resolve('ed25519');
const asn1m = rt.resolve('asn1');
const sha256m = rt.resolve('sha256');

const GAP_START = 'pdf/sig/byterange/gap-start-mismatch';
const GAP_END = 'pdf/sig/byterange/gap-end-mismatch';

const FIXTURE_TIMEOUT_MS = 10_000;
const ANSSI_TIMEOUT_MS = 120_000;

function fixtureBytes(name) {
    return new Uint8Array(readFileSync(new URL(`_fixtures/real-shapes/${name}`, import.meta.url)));
}

function signOpts(level, label) {
    const signer = makeTestSigner(asn1m, ed25519m, label);
    const opts = { algorithm: 'ed25519', cert: signer.cert, privateKey: signer.privateKey, level };
    if (level !== 'B') opts.tsaSign = ({ digest, hashAlg }) => fakeTstToken(asn1m, digest, hashAlg);
    if (level === 'LT' || level === 'LTA') opts.dss = { certs: [signer.cert] };
    return { opts, signer };
}

/** The dict of `sig`, typed by `typeSignature`, read back from `bytes`. */
function typedSig(bytes, sig) {
    const doc = readDocument(bytes);
    return typeSignature(doc._raw.resolve({ type: 'ref', num: sig.objNum, gen: sig.objGen }));
}

/** Both verify paths for the (single) /Sig of `bytes`. */
function verifyBoth(bytes) {
    const sig = findSignatures(bytes).find((x) => x.kind === 'Sig');
    const all = verifyAllSignatures(bytes).signatures;
    expect(all.length).toBe(1);
    return { all: all[0], direct: verifySignature(typedSig(bytes, sig), bytes) };
}

const codesOf = (r) => r.errors.map((e) => e.code);

// ── Leg 1 — the signer emits form (b) ─────────────────────────────────
const BASES = [
    ['classical table', () => buildDocument({ pages: ['BL-1605 classical'] })],
    ['xref stream', () => fixtureBytes('sign-catalog-in-objstm.pdf')]
];

describe('BL-1605 · pdfSign emits the whole <…> token as the /ByteRange gap (form b)', () => {
    for (const [tag, getBase] of BASES) {
        test(`${tag} · B · /Sig gap is the token; verifies; re-reads`, () => {
            const base = getBase();
            const pages = readDocument(base).pages.length;
            const signed = signMod.sign(base, signOpts('B', `${tag} B`).opts);
            const [sig] = findSignatures(signed);
            const br = sig.byteRange;
            expect(gapForm(signed, br)).toBe('token');
            // PDFBox ShowSignature: '<' expected at ByteRange[1].
            expect(signed[br[0] + br[1]]).toBe(0x3C);
            // pyHanko: start2 == len1 + hex digits + 2, and full coverage.
            expect(br[2]).toBe(br[0] + br[1] + sig.contents.length + 2);
            expect(br[2] + br[3]).toBe(signed.length);
            // Our own audit agrees and names the form.
            const audit = auditByteRange(signed, br, {
                contents: findContentsField(signed, sig.objHead), requireFullCoverage: true
            });
            expect(audit.issues).toEqual([]);
            expect(audit.gapForm).toBe('token');
            const { all, direct } = verifyBoth(signed);
            expect(all.verified).toBe(true);
            expect(direct.verified).toBe(true);
            expect(readDocument(signed).pages.length).toBe(pages);
        }, FIXTURE_TIMEOUT_MS);

        test(`${tag} · LTA · /Sig AND /DocTimeStamp gaps are the token; both verify`, () => {
            const base = getBase();
            const pages = readDocument(base).pages.length;
            const signed = signMod.sign(base, signOpts('LTA', `${tag} LTA`).opts);
            const sigs = findSignatures(signed);
            expect(sigs.map((x) => x.kind)).toEqual(['Sig', 'DocTimeStamp']);
            for (const s of sigs) expect(gapForm(signed, s.byteRange)).toBe('token');
            const r = verifyAllSignatures(signed);
            expect(r.signatures.map((x) => x.verified)).toEqual([true]);
            expect(r.timestamps.map((x) => x.imprintVerified)).toEqual([true]);
            expect(r.timestamps.map((x) => x.verified)).toEqual([true]);
            expect(readDocument(signed).pages.length).toBe(pages);
        }, FIXTURE_TIMEOUT_MS);
    }
});

// ── Legs 2 + 3 — the verifier: two exact forms, nothing else ──────────
describe('BL-1605 · the verifier accepts both exact gap forms and refuses every other gap', () => {
    const label = 'BL-1605 tolerance';
    const { opts, signer } = signOpts('B', label);
    const signed = signMod.sign(buildDocument({ pages: ['BL-1605 tolerance'] }), opts);
    const [sig0] = findSignatures(signed);
    const ctx = { signMod, ed25519: ed25519m, sha256: sha256m, signer };
    /** `signed` with the /Sig gap rewritten to `br` and re-signed over it. */
    const resigned = (br, extra) =>
        resignDeclaredRanges(rewriteByteRange(signed, sig0, br), sig0, Object.assign({}, ctx, extra));
    const { token, digits } = formRanges(signed, sig0);

    test('legacy form (a), built by rewriting + re-signing, verifies on both paths', () => {
        const legacy = resigned(digits);
        expect(gapForm(legacy, findSignatures(legacy)[0].byteRange)).toBe('digits');
        const { all, direct } = verifyBoth(legacy);
        expect(codesOf(all)).toEqual([]);
        expect(all.verified).toBe(true);
        expect(direct.verified).toBe(true);
        expect(readDocument(legacy).pages.length).toBe(1);
    });

    test('legacy form (a) with signedAttrs (messageDigest path) verifies', () => {
        const legacy = resigned(digits, { signedAttrs: true });
        expect(verifyBoth(legacy).all.verified).toBe(true);
    });

    test('form (b), built by rewriting a form-(a) file + re-signing, verifies on both paths', () => {
        const legacy = resigned(digits);
        const [sigA] = findSignatures(legacy);
        const rebuilt = resignDeclaredRanges(rewriteByteRange(legacy, sigA, token), sigA, ctx);
        expect(gapForm(rebuilt, findSignatures(rebuilt)[0].byteRange)).toBe('token');
        const { all, direct } = verifyBoth(rebuilt);
        expect(all.verified).toBe(true);
        expect(direct.verified).toBe(true);
        expect(readDocument(rebuilt).pages.length).toBe(1);
    });

    test('negative control: rewriting the gap WITHOUT re-signing breaks the signature', () => {
        const other = gapForm(signed, sig0.byteRange) === 'token' ? digits : token;
        const unsigned = rewriteByteRange(signed, sig0, other);
        const { all } = verifyBoth(unsigned);
        expect(all.verified).toBe(false);
        expect(all.pkVerified).toBe(false);
        expect(codesOf(all)).not.toContain(GAP_START);
        expect(codesOf(all)).not.toContain(GAP_END);
    });

    // Gaps that still leave every hex digit out of the digest: re-signed
    // over their own ranges, the public-key check PASSES — only the gap
    // check can refuse them (task 01 legs O1/O2 measured verified:true).
    const { offset: o, length: n } = sig0.contents;
    const total = signed.length;
    const cryptoPassing = [
        ['"<" + digits (token end one byte short, task 01 O1)', o - 1, o + n, [GAP_END]],
        ['digits + ">" (token start one byte late, task 01 O2)', o, o + n + 1, [GAP_START]],
        ['token start one byte early', o - 2, o + n + 1, [GAP_START]],
        ['token end one byte long', o - 1, o + n + 2, [GAP_END]],
        ['token one byte long at both ends', o - 2, o + n + 2, [GAP_START, GAP_END]]
    ];
    for (const [name, gs, ge, expected] of cryptoPassing) {
        test(`refused, although the signature is good: ${name}`, () => {
            const bytes = resigned(rangeWithGap(total, gs, ge));
            const { all, direct } = verifyBoth(bytes);
            for (const r of [all, direct]) {
                expect(r.pkVerified).toBe(true);
                expect(r.verified).toBe(false);
                expect(r.valid).toBe(false);
                expect(codesOf(r).filter((c) => c === GAP_START || c === GAP_END)).toEqual(expected);
            }
        });
    }

    // Gaps that put part of the /Contents value (or a delimiter only) in
    // the digest: refused on the gap whatever the public-key outcome.
    const partial = [
        ['only "<"', o - 1, o, [GAP_END]],
        ['only ">"', o + n, o + n + 1, [GAP_START]],
        ['digits one byte short at the start', o + 1, o + n, [GAP_START, GAP_END]],
        ['digits one byte short at the end', o, o + n - 1, [GAP_START, GAP_END]]
    ];
    for (const [name, gs, ge, expected] of partial) {
        test(`refused: a gap covering ${name}`, () => {
            const bytes = resigned(rangeWithGap(total, gs, ge));
            const { all, direct } = verifyBoth(bytes);
            for (const r of [all, direct]) {
                expect(r.verified).toBe(false);
                expect(codesOf(r).filter((c) => c === GAP_START || c === GAP_END)).toEqual(expected);
            }
        });
    }
});

// ── Leg 5 — the /DocTimeStamp path applies the same rule (BL-1627) ────
// Before BL-1627 the DocTimeStamp verify path hashed the declared ranges
// with no gap check, so an off-by-one gap re-stamped over its own ranges
// verified. Built on the LTA leg's document (classical-table base).
describe('BL-1627 · the /DocTimeStamp verify path refuses every non-exact gap', () => {
    const signed = signMod.sign(buildDocument({ pages: ['BL-1605 classical'] }),
        signOpts('LTA', 'classical table LTA').opts);
    const ts0 = findSignatures(signed).find((x) => x.kind === 'DocTimeStamp');

    /**
     * Copy of `bytes` whose DocTimeStamp token is re-stamped (`fakeTstToken`)
     * over the ranges its `/ByteRange` now declares, written into the
     * unchanged `/Contents` digits (`0`-padded, as `sign.js` pads).
     */
    function restamp(bytes) {
        const out = bytes.slice();
        const ts = findSignatures(out).find((x) => x.objHead === ts0.objHead);
        const [a, b, c, d] = ts.byteRange;
        const cov = new Uint8Array(b + d);
        cov.set(out.subarray(a, a + b), 0);
        cov.set(out.subarray(c, c + d), b);
        const tok = fakeTstToken(asn1m, signMod._hashBytes(sha256m, cov), 'sha256');
        let hex = '';
        for (let i = 0; i < tok.length; i++) hex += tok[i].toString(16).padStart(2, '0');
        hex = hex.toUpperCase();
        if (hex.length > ts.contents.length) throw new Error('restamp: token does not fit');
        out.set(new TextEncoder().encode(hex.padEnd(ts.contents.length, '0')), ts.contents.offset);
        return out;
    }
    const tsOf = (bytes) => {
        const r = verifyAllSignatures(bytes);
        expect(r.timestamps.length).toBe(1);
        return { ts: r.timestamps[0], sigs: r.signatures };
    };
    const gapCodes = (r) => codesOf(r).filter((c) => c === GAP_START || c === GAP_END);

    test('the untouched LTA file verifies with gapForm "token"', () => {
        expect(gapForm(signed, ts0.byteRange)).toBe('token');
        const { ts, sigs } = tsOf(signed);
        expect(ts.verified).toBe(true);
        expect(ts.gapForm).toBe('token');
        expect(gapCodes(ts)).toEqual([]);
        expect(sigs.map((x) => x.verified)).toEqual([true]);
    });

    test('legacy form (a), rewritten + re-stamped, verifies with gapForm "digits"', () => {
        const bytes = restamp(rewriteByteRange(signed, ts0, formRanges(signed, ts0).digits));
        expect(gapForm(bytes, findSignatures(bytes)[1].byteRange)).toBe('digits');
        const { ts, sigs } = tsOf(bytes);
        expect(ts.verified).toBe(true);
        expect(ts.gapForm).toBe('digits');
        expect(sigs.map((x) => x.verified)).toEqual([true]);
    });

    test('negative control: rewriting the gap WITHOUT re-stamping fails on the imprint', () => {
        const { offset: o, length: n } = ts0.contents;
        const bytes = rewriteByteRange(signed, ts0, rangeWithGap(signed.length, o - 1, o + n));
        const { ts } = tsOf(bytes);
        expect(ts.imprintVerified).toBe(false);
        expect(ts.verified).toBe(false);
        expect(ts.errors[0].code).toBe('pdf/ts/imprint-mismatch');
    });

    const { offset: o, length: n } = ts0.contents;
    const offByOne = [
        ['"<" + digits (token end one byte short)', o - 1, o + n, [GAP_END]],
        ['digits + ">" (token start one byte late)', o, o + n + 1, [GAP_START]],
        ['token start one byte early', o - 2, o + n + 1, [GAP_START]],
        ['token end one byte long', o - 1, o + n + 2, [GAP_END]]
    ];
    for (const [name, gs, ge, expected] of offByOne) {
        test(`refused, although re-stamped over its own ranges: ${name}`, () => {
            const bytes = restamp(rewriteByteRange(signed, ts0, rangeWithGap(signed.length, gs, ge)));
            const { ts, sigs } = tsOf(bytes);
            expect(ts.imprintVerified).toBe(true);
            expect(ts.verified).toBe(false);
            expect(ts.valid).toBe(false);
            expect(gapCodes(ts)).toEqual(expected);
            expect(ts.gapForm).toBe(null);
            // The /Sig revision ends before the DocTimeStamp: untouched.
            expect(sigs.map((x) => x.verified)).toEqual([true]);
        });
    }
});

// ── Leg 4 — one ANSSI base (opt-in, never committed) ──────────────────
const corpus = getAnssiCorpus();
const ANSSI_ID = 'selectionCrypto';
const anssiPath = join(corpus.dir, ANSSI_DOCS[ANSSI_ID]);

describe(`BL-1605 · ANSSI ${ANSSI_ID} at level B (present: ${existsSync(anssiPath)})`, () => {
    if (!existsSync(anssiPath)) {
        test.skip(`SKIPPED — references/ANSSI/${ANSSI_DOCS[ANSSI_ID]} absent`, () => {});
        return;
    }
    test('the /Sig gap is the token; verifies; re-reads with the same page count', () => {
        const base = new Uint8Array(readFileSync(anssiPath));
        const pages = readDocument(base).pages.length;
        const signed = signMod.sign(base, signOpts('B', `ANSSI ${ANSSI_ID}`).opts);
        const added = findSignatures(signed).filter((x) => x.objHead >= base.length);
        expect(added.length).toBe(1);
        expect(gapForm(signed, added[0].byteRange)).toBe('token');
        const r = verifyAllSignatures(signed).signatures;
        expect(r.map((x) => x.verified)).toEqual(r.map(() => true));
        expect(readDocument(signed).pages.length).toBe(pages);
    }, ANSSI_TIMEOUT_MS);
});
