// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfSign.sign()` over cross-reference-stream /
 * object-stream bases — BL-1565 and BL-1566, measured 2026-09-23 signing
 * the real ANSSI documents (office/BATCH_41/06).
 *
 * Every test here asserts the CORRECT behaviour (office/BATCH_42 task 01,
 * assertions 1–6 of its plan):
 *
 *   1. `sign()` returns bytes.
 *   2. `verifyAllSignatures(signed)` reports every /Sig `verified: true`.
 *   3. `readDocument(signed)` succeeds with the unsigned base's page count.
 *   4. The new /Sig object number is not the number of any live object of
 *      the base (compressed objects included).
 *   5. A second `sign()` over the signed output passes 1–4 again.
 *   6. On F1, LT/LTA does not throw `pdf/sign/catalog-not-found`.
 *
 * Fixtures:
 *   - **F1** `sign-catalog-in-objstm.pdf` — xref-stream only; the catalog
 *     (object 2, not 1) and the page tree live inside a `/Type /ObjStm`.
 *   - **F2** `sign-nextobjnum-collision.pdf` — xref-stream only; the
 *     highest uncompressed `N 0 obj` header (5) is lower than a live
 *     compressed object (6, the page).
 *   - **F3** — the classical-table base of `_helpers/build.js`
 *     (`buildDocument`), the control for the path that works today.
 *
 * RED-FIRST: F1/F2 fail against the 2026-09-23 `sign.js` (the observed
 * codes are quoted in `ai/batches/types/office/BATCH_42/01-report.md`);
 * task 02 of the same batch fixes `sign.js` and turns them green WITHOUT
 * editing this file. F3 is green throughout. The ANSSI leg runs
 * assertions 1–3 and 5 at level B on each real document present under
 * `references/ANSSI/`, and skips visibly otherwise.
 *
 * BL-2041 (office/BATCH_51/01) adds the signature-field legs: on F1/F2/F3
 * at every level, on F1/F3 carrying a pre-existing AcroForm text field,
 * and on each ANSSI document at level B, the signature dictionary must be
 * the `/V` of a `/FT /Sig` field reachable Catalog → `/AcroForm` →
 * `/Fields`, with `/SigFlags 3` and its widget in page 1's `/Annots`.
 * Red against the pre-BL-2041 `sign.js` (no field at all).
 *
 * @module pdf/tests/sign-real-shapes.integration
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../src/main.js';
import { buildDocument } from './_helpers/build.js';
import { getAnssiCorpus, ANSSI_DOCS } from './_helpers/anssi-corpus.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const { readDocument }        = rt.resolve('pdfDocument');
const { sign }                = rt.resolve('pdfSign');
const { verifyAllSignatures } = rt.resolve('pdfSignature');
const ed25519m  = rt.resolve('ed25519');
const asn1m     = rt.resolve('asn1');
const sha256m   = rt.resolve('sha256');
const sha384m   = rt.resolve('sha384');
const sha512m   = rt.resolve('sha512');
const bitArrayM = rt.resolve('bitArray');
const rsam      = rt.resolve('rsa');
const eccm      = rt.resolve('ecc');

const FB = { asn1: asn1m, rsa: rsam, ecc: eccm, ed25519: ed25519m,
             sha256: sha256m, sha384: sha384m, sha512: sha512m,
             bitArray: bitArrayM };

const LEVELS = ['B', 'T', 'LT', 'LTA'];

/** Default per-test timeout for the small fixtures (bun's own default). */
const FIXTURE_TIMEOUT_MS = 5_000;

/** Real ANSSI documents are large; signing them twice takes seconds. */
const ANSSI_TIMEOUT_MS = 120_000;

function fixtureBytes(name) {
    return new Uint8Array(readFileSync(new URL(`_fixtures/real-shapes/${name}`, import.meta.url)));
}

/**
 * Run `fn`, returning `{ value }` or `{ error: { code, message } }` — so a
 * failing `expect(r.error).toBeUndefined()` prints the thrown code.
 */
function attempt(fn) {
    try {
        return { value: fn() };
    } catch (e) {
        return { error: { code: e.code, message: e.message } };
    }
}

// ── Key / certificate / mock-TSA setup — the same apparatus as
// ── `src/sig/sign.test.js` (ed25519 `keyPair(seed)`, `_buildTestCert`,
// ── `_fakeTstToken`), which exports none of it. Deterministic seeds.
function _encLen(n) {
    if (n < 0x80) return Uint8Array.of(n);
    if (n <= 0xff) return Uint8Array.of(0x81, n);
    if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
    return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function _utcTime(s) {
    const v = new TextEncoder().encode(s);
    const len = _encLen(v.length);
    const out = new Uint8Array(1 + len.length + v.length);
    out[0] = 0x17;
    out.set(len, 1);
    out.set(v, 1 + len.length);
    return out;
}

/**
 * Minimal self-signed DER cert — same shape as `sign.test.js:_buildTestCert`.
 * `edPubKey` MUST be passed for ed25519: without it the SPKI is an RSA
 * placeholder and verification fails for a reason unrelated to the base.
 */
function _buildTestCert({ issuerCn, serial, sigAlgOid, edPubKey }) {
    const A = asn1m;
    const cnValue = new TextEncoder().encode(issuerCn);
    const cnPS = (() => {
        const len = _encLen(cnValue.length);
        const out = new Uint8Array(1 + len.length + cnValue.length);
        out[0] = 0x13;
        out.set(len, 1);
        out.set(cnValue, 1 + len.length);
        return out;
    })();
    const atv = A.encodeSequence([A.encodeOid('2.5.4.3'), cnPS]);
    const name = A.encodeSequence([A.encodeSet([atv])]);
    const validity = A.encodeSequence([_utcTime('200101000000Z'), _utcTime('300101000000Z')]);
    const spki = edPubKey instanceof Uint8Array
        ? A.encodeSequence([
              A.encodeSequence([A.encodeOid('1.3.101.112')]),
              A.encodeBitString(edPubKey, 0)
          ])
        : A.encodeSequence([
              A.encodeSequence([A.encodeOid('1.2.840.113549.1.1.1'), A.encodeNull()]),
              A.encodeBitString(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]), 0)
          ]);
    const sigAlg = A.encodeSequence([A.encodeOid(sigAlgOid), A.encodeNull()]);
    const tbs = A.encodeSequence([A.encodeInteger(serial), sigAlg, name, validity, name, spki]);
    return A.encodeSequence([tbs, sigAlg, A.encodeBitString(new Uint8Array([0x00, 0x00]), 0)]);
}

/** hashAlg (as `opts.tsaSign` receives it) → messageImprint AlgorithmIdentifier OID. */
const TST_HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};

/** Minimal RFC 3161 TimeStampToken — same shape as `sign.test.js:_fakeTstToken`. */
function _fakeTstToken(digest, hashAlg) {
    const A = asn1m;
    const messageImprint = A.encodeSequence([
        A.encodeSequence([A.encodeOid(TST_HASH_OIDS[hashAlg]), A.encodeNull()]),
        A.encodeOctetString(digest)
    ]);
    const genTime = (() => {
        const s = new TextEncoder().encode('20240101000000Z');
        const out = new Uint8Array(2 + s.length);
        out[0] = 0x18; out[1] = s.length; out.set(s, 2);
        return out;
    })();
    const tstInfo = A.encodeSequence([
        A.encodeInteger(1), A.encodeOid('1.2.3.4.5'), messageImprint, A.encodeInteger(1), genTime
    ]);
    const encapContentInfo = A.encodeSequence([
        A.encodeOid('1.2.840.113549.1.9.16.1.4'),
        A.encodeExplicit(0, A.encodeOctetString(tstInfo))
    ]);
    const signedData = A.encodeSequence([
        A.encodeInteger(1), A.encodeSet([]), encapContentInfo, A.encodeSet([])
    ]);
    return A.encodeSequence([A.encodeOid('1.2.840.113549.1.7.2'), A.encodeExplicit(0, signedData)]);
}

/** Deterministic ed25519 signer per label (seed derived from FNV-1a of the label). */
function signerFor(label) {
    let h = 0x811c9dc5;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = ((h >>> ((i % 4) * 8)) ^ (i * 7)) & 0xff;
    const kp = ed25519m.keyPair(seed);
    const cert = _buildTestCert({
        issuerCn: label, serial: (h & 0x7fff) + 1, sigAlgOid: '1.3.101.112', edPubKey: kp.publicKey
    });
    return { cert, privateKey: kp.privateKey };
}

function signOpts(level, label) {
    const { cert, privateKey } = signerFor(label);
    const opts = { algorithm: 'ed25519', cert, privateKey, level };
    if (level !== 'B') opts.tsaSign = ({ digest, hashAlg }) => _fakeTstToken(digest, hashAlg);
    if (level === 'LT' || level === 'LTA') opts.dss = { certs: [cert] };
    return opts;
}

/** Object numbers the document's merged xref marks live (compressed included). */
function liveObjectNumbers(bytes) {
    const entries = readDocument(bytes).xref.entries;
    return Object.keys(entries).filter(k => !entries[k].free).map(Number).sort((a, b) => a - b);
}

/**
 * Object numbers of the `/Type /Sig` dictionaries whose text starts at or
 * after byte `from` — i.e. those an incremental `sign()` appended. Found by
 * the dict's own text, not by the final trailer's /Size (LT/LTA append
 * more sections after the /Sig).
 */
function newSigObjNums(bytes, from) {
    const s = new TextDecoder('latin1').decode(bytes);
    const out = [];
    const re = /\/Type\s*\/Sig(?![A-Za-z0-9])/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        if (m.index < from) continue;
        const head = s.slice(Math.max(from, m.index - 4096), m.index);
        const all = [...head.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)];
        if (all.length) out.push(parseInt(all[all.length - 1][1], 10));
    }
    return out;
}

/** The `/Type /Sig` entries `verifyAllSignatures` reports for `bytes`. */
function signaturesOf(bytes) {
    return verifyAllSignatures(bytes, FB).signatures;
}

/**
 * Register the assertion tests for one base × one level. The first and
 * second `sign()` are memoized, so each runs once per base × level.
 *
 * @param {string} tag                  fixture tag used in test names
 * @param {() => Uint8Array} getBase    the unsigned base
 * @param {string} level                'B' | 'T' | 'LT' | 'LTA'
 * @param {{assertions?: number[], timeout?: number}} [o]
 * @returns {{firstSign: () => {value?: Uint8Array, error?: {code: string, message: string}}}}
 */
function signLegs(tag, getBase, level, o = {}) {
    const only = new Set(o.assertions || [1, 2, 3, 4, 5]);
    const timeout = o.timeout || FIXTURE_TIMEOUT_MS;
    let first, second, baseInfo;

    const info = () => baseInfo || (baseInfo = (() => {
        const base = getBase();
        return { base, pages: readDocument(base).pages.length, sigs: signaturesOf(base).length };
    })());
    const firstSign = () => first
        || (first = attempt(() => sign(info().base, signOpts(level, `${tag} ${level} #1`))));
    const secondSign = () => second || (second = (() => {
        const r = firstSign();
        if (r.error) return r;
        return attempt(() => sign(r.value, signOpts(level, `${tag} ${level} #2`)));
    })());

    /** Assertions 1–4 for one signing step (`prev` = the bytes it signed). */
    function checkStep(r, prev, expectedSigs) {
        // 1 — sign() returns bytes.
        expect(r.error).toBeUndefined();
        expect(r.value).toBeInstanceOf(Uint8Array);
        // 2 — every signature verifies.
        const sigs = signaturesOf(r.value);
        expect(sigs.length).toBe(expectedSigs);
        expect(sigs.map(x => x.verified)).toEqual(sigs.map(() => true));
        // 3 — reads, with the unsigned base's page count.
        const read = attempt(() => readDocument(r.value));
        expect(read.error).toBeUndefined();
        expect(read.value.pages.length).toBe(info().pages);
        // 4 — the new /Sig is not a live object of the bytes it signed.
        const added = newSigObjNums(r.value, prev.length);
        expect(added.length).toBe(1);
        expect(liveObjectNumbers(prev)).not.toContain(added[0]);
    }

    if (only.has(1)) {
        test(`${tag} · ${level} · (1) sign() returns bytes`, () => {
            const r = firstSign();
            expect(r.error).toBeUndefined();
            expect(r.value).toBeInstanceOf(Uint8Array);
        }, timeout);
    }
    if (only.has(2)) {
        test(`${tag} · ${level} · (2) every signature verifies`, () => {
            const r = firstSign();
            expect(r.error).toBeUndefined();
            const sigs = signaturesOf(r.value);
            expect(sigs.length).toBe(info().sigs + 1);
            expect(sigs.map(x => x.verified)).toEqual(sigs.map(() => true));
        }, timeout);
    }
    if (only.has(3)) {
        test(`${tag} · ${level} · (3) readDocument succeeds, same page count`, () => {
            const r = firstSign();
            expect(r.error).toBeUndefined();
            const read = attempt(() => readDocument(r.value));
            expect(read.error).toBeUndefined();
            expect(read.value.pages.length).toBe(info().pages);
        }, timeout);
    }
    if (only.has(4)) {
        test(`${tag} · ${level} · (4) the new /Sig is not a live base object number`, () => {
            const r = firstSign();
            expect(r.error).toBeUndefined();
            const added = newSigObjNums(r.value, info().base.length);
            expect(added.length).toBe(1);
            expect(liveObjectNumbers(info().base)).not.toContain(added[0]);
        }, timeout);
    }
    if (only.has(5)) {
        test(`${tag} · ${level} · (5) a second sign() passes 1–4 again`, () => {
            const r1 = firstSign();
            expect(r1.error).toBeUndefined();
            checkStep(secondSign(), r1.value, info().sigs + 2);
        }, timeout);
    }

    return { firstSign };
}

// ── F1 — catalog (object 2) and page tree compressed in an ObjStm ──────
describe('pdfSign.sign — F1: catalog in an ObjStm, object number != 1 (BL-1565/BL-1566)', () => {
    const base = fixtureBytes('sign-catalog-in-objstm.pdf');

    test('F1 · base shape — xref-stream only, catalog 2 compressed in ObjStm 5, reads 1 page', () => {
        const text = new TextDecoder('latin1').decode(base);
        expect(text.startsWith('%PDF-1.5')).toBe(true);
        expect(/(^|\s)xref\s/.test(text)).toBe(false);
        expect(text.includes('trailer')).toBe(false);
        const doc = readDocument(base);
        expect(doc.trailer.root).toEqual({ num: 2, gen: 0 });
        expect(doc.xref.entries[2]).toMatchObject({ type: 2, objStm: 5, free: false });
        expect(doc.xref.entries[1]).toMatchObject({ type: 2, objStm: 5, free: false });
        expect(doc.pages.length).toBe(1);
        expect(liveObjectNumbers(base)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    for (const level of LEVELS) {
        const { firstSign } = signLegs('F1', () => base, level);
        if (level === 'LT' || level === 'LTA') {
            test(`F1 · ${level} · (6) sign() does not throw pdf/sign/catalog-not-found`, () => {
                expect(firstSign().error?.code).not.toBe('pdf/sign/catalog-not-found');
            });
        }
    }
});

// ── F2 — highest uncompressed header (5) < live compressed object (6) ──
describe('pdfSign.sign — F2: live compressed object above the highest uncompressed header (BL-1565)', () => {
    const base = fixtureBytes('sign-nextobjnum-collision.pdf');

    test('F2 · base shape — highest `N 0 obj` header 5, live compressed object 6, reads 1 page', () => {
        const text = new TextDecoder('latin1').decode(base);
        expect(/(^|\s)xref\s/.test(text)).toBe(false);
        expect(text.includes('trailer')).toBe(false);
        const headers = [...text.matchAll(/(\d+)\s+0\s+obj\b/g)].map(m => Number(m[1]));
        expect(Math.max(...headers)).toBe(5);
        const doc = readDocument(base);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.trailer.size).toBe(7);
        expect(doc.xref.entries[6]).toMatchObject({ type: 2, objStm: 4, free: false });
        expect(doc.pages.length).toBe(1);
        expect(liveObjectNumbers(base)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    for (const level of LEVELS) signLegs('F2', () => base, level);
});

// ── F3 — classical-table control: green throughout ────────────────────
describe('pdfSign.sign — F3: classical-table control (regression guard)', () => {
    const base = buildDocument({ pages: ['classical control'] });

    test('F3 · base shape — classical `xref` table + `trailer`, reads 1 page', () => {
        const text = new TextDecoder('latin1').decode(base);
        expect(/(^|\s)xref\s/.test(text)).toBe(true);
        expect(text.includes('trailer')).toBe(true);
        expect(readDocument(base).pages.length).toBe(1);
    });

    for (const level of LEVELS) signLegs('F3', () => base, level);
});

// ── BL-2041 — the signature is the /V of a signature field ────────────
//
// office/BATCH_51/01: every level writes, in the SAME incremental update
// as the /Sig dictionary, a field dictionary merged with its widget
// (ISO 32000-2 §12.7.5.5), page 1's /Annots extended and the Catalog's
// /AcroForm created or extended (/Fields + /SigFlags 3); an LTA document
// timestamp gets its own field (§12.8.5.2). Read back through the
// package's own form readers (`pdfAcroForm`, `pdfSignatureField`).
const { typeAcroForm }       = rt.resolve('pdfAcroForm');
const { typeSignatureField } = rt.resolve('pdfSignatureField');
const { appendIncremental }  = rt.resolve('pdfIncrementalWriter');
const latin1 = new TextDecoder('latin1');

/** The AcroForm / signature-field view of `bytes`, read back. */
function fieldView(bytes) {
    const doc = readDocument(bytes);
    const R = doc._raw.resolve;
    const catalog = R({ type: 'ref', num: doc.trailer.root.num, gen: doc.trailer.root.gen });
    const acroRaw = catalog.entries.AcroForm;
    if (!acroRaw) return { doc, acro: null, fields: [], sigFields: [], annots: [] };
    const acro = typeAcroForm(acroRaw.type === 'ref' ? R(acroRaw) : acroRaw);
    const fields = acro.fields.map(ref => ({ ref, dict: R({ type: 'ref', ...ref }) }));
    const sigFields = fields
        .filter(f => f.dict.entries.FT && f.dict.entries.FT.value === 'Sig')
        .map(f => {
            const typed = typeSignatureField(f.dict);
            return { ...typed, ref: f.ref, name: latin1.decode(typed.t), value: R(typed.v) };
        });
    const page1 = doc.pages[0].raw;
    const annotsRaw = page1.entries.Annots;
    const annots = !annotsRaw ? []
        : (annotsRaw.type === 'ref' ? R(annotsRaw) : annotsRaw).items
            .map(r => ({ num: r.num, gen: r.gen }));
    return { doc, acro, fields, sigFields, annots, page1 };
}

/** Assert the field/widget shape and its registration for `view`. */
function expectRegisteredSigFields(view, expectedKinds) {
    expect(view.acro).not.toBeNull();
    expect(view.acro.sigFlags).toBe(3);
    expect(view.sigFields.map(f => f.value.entries.Type.value)).toEqual(expectedKinds);
    view.sigFields.forEach((f, i) => {
        expect(f.name).toBe(`Signature${i + 1}`);
        expect(f.signed).toBe(true);
        const e = f.raw.entries;
        expect(e.Subtype).toEqual({ type: 'name', value: 'Widget' });
        expect(e.Rect.items.map(x => x.value)).toEqual([0, 0, 0, 0]);
        expect(e.F.value).toBe(132);
        // /P is page 1 — the reader resolves both to the same dict.
        expect(view.doc._raw.resolve(e.P)).toBe(view.page1);
        expect(view.annots).toContainEqual({ num: f.ref.num, gen: f.ref.gen });
    });
}

const KINDS = { B: ['Sig'], T: ['Sig'], LT: ['Sig'], LTA: ['Sig', 'DocTimeStamp'] };

describe('pdfSign.sign — BL-2041: the signature dictionary is the /V of a signature field', () => {
    const shapes = {
        'F1 xref stream, catalog in ObjStm': () => fixtureBytes('sign-catalog-in-objstm.pdf'),
        'F2 xref stream': () => fixtureBytes('sign-nextobjnum-collision.pdf'),
        'F3 classical table': () => buildDocument({ pages: ['field control'] })
    };
    for (const [tag, getBase] of Object.entries(shapes)) {
        for (const level of LEVELS) {
            test(`${tag} · ${level} · field + widget + AcroForm read back; signatures verify`, () => {
                const base = getBase();
                expect(fieldView(base).acro).toBeNull();
                const r = attempt(() => sign(base, signOpts(level, `field ${tag} ${level}`)));
                expect(r.error).toBeUndefined();
                const view = fieldView(r.value);
                expectRegisteredSigFields(view, KINDS[level]);
                expect(view.doc.pages.length).toBe(1);
                const sigs = signaturesOf(r.value);
                expect(sigs.length).toBe(1);
                expect(sigs.map(x => x.verified)).toEqual([true]);
            });
        }
    }

    test('F1 · B · the field, page and Catalog land in the /Sig update, inside its /ByteRange', () => {
        const base = fixtureBytes('sign-catalog-in-objstm.pdf');
        const signed = sign(base, signOpts('B', 'field F1 same update'));
        const view = fieldView(signed);
        const entries = view.doc.xref.entries;
        const sig = view.sigFields[0];
        const fieldOff = entries[sig.ref.num].offset;
        const br = sig.value.entries.ByteRange.items.map(x => x.value);
        // One update: every new definition sits past the base, before the
        // single %%EOF that closes it.
        const lastEof = latin1.decode(signed).lastIndexOf('%%EOF');
        for (const num of [sig.ref.num, sig.v.num, view.doc.trailer.root.num]) {
            expect(entries[num].type).toBe(1);
            expect(entries[num].offset).toBeGreaterThan(base.length);
            expect(entries[num].offset).toBeLessThan(lastEof);
        }
        // The field object follows the /Sig: covered by the second range.
        expect(fieldOff).toBeGreaterThanOrEqual(br[2]);
        expect(fieldOff).toBeLessThan(br[2] + br[3]);
    });

    test('F3 · B twice · two distinct fields Signature1, Signature2; both verify', () => {
        const once = sign(buildDocument({ pages: ['twice'] }), signOpts('B', 'twice #1'));
        const twice = sign(once, signOpts('B', 'twice #2'));
        const view = fieldView(twice);
        expectRegisteredSigFields(view, ['Sig', 'Sig']);
        expect(view.sigFields[0].ref).not.toEqual(view.sigFields[1].ref);
        expect(view.sigFields[0].v).not.toEqual(view.sigFields[1].v);
        const sigs = signaturesOf(twice);
        expect(sigs.length).toBe(2);
        expect(sigs.map(x => x.verified)).toEqual([true, true]);
    });

    /**
     * `base` with an AcroForm holding one text field (merged with its
     * widget on page 1), added by an incremental update of the base's own
     * form (classical table or xref stream) — the shape a form filler
     * leaves behind.
     */
    function withTextField(base) {
        const doc = readDocument(base);
        const R = doc._raw.resolve;
        const rootRef = doc.trailer.root;
        const catalog = R({ type: 'ref', num: rootRef.num, gen: rootRef.gen });
        const pageRefRaw = R(catalog.entries.Pages).entries.Kids.items[0];
        const page = R(pageRefRaw);
        const num = doc.trailer.size;
        const ref = { type: 'ref', num, gen: 0 };
        const str = (s) => ({ type: 'string', value: new TextEncoder().encode(s) });
        const nm = (v) => ({ type: 'name', value: v });
        return appendIncremental(base, { updates: [
            { num, gen: 0, value: { type: 'dict', entries: {
                FT: nm('Tx'), T: str('Name'), V: str('Ada'),
                Type: nm('Annot'), Subtype: nm('Widget'), F: { type: 'int', value: 4 },
                Rect: { type: 'array', items: [10, 10, 100, 30].map(v => ({ type: 'int', value: v })) },
                P: pageRefRaw
            } } },
            { num: pageRefRaw.num, gen: pageRefRaw.gen, value: { type: 'dict',
                entries: { ...page.entries, Annots: { type: 'array', items: [ref] } } } },
            { num: rootRef.num, gen: rootRef.gen, value: { type: 'dict', entries: {
                ...catalog.entries,
                AcroForm: { type: 'dict', entries: {
                    Fields: { type: 'array', items: [ref] }, DA: str('/Helv 0 Tf 0 g')
                } }
            } } }
        ] });
    }

    for (const [tag, getBase] of [
        ['F3 classical table', () => buildDocument({ pages: ['form'] })],
        ['F1 xref stream', () => fixtureBytes('sign-catalog-in-objstm.pdf')]
    ]) {
        for (const level of ['B', 'LTA']) {
            test(`${tag} + existing AcroForm · ${level} · the text field survives, /Fields grows by the signature field(s)`, () => {
                const base = withTextField(getBase());
                const before = fieldView(base);
                expect(before.fields.length).toBe(1);
                expect(before.acro.sigFlags).toBe(0);
                const r = attempt(() => sign(base, signOpts(level, `form ${tag} ${level}`)));
                expect(r.error).toBeUndefined();
                const view = fieldView(r.value);
                expect(view.fields.length).toBe(1 + KINDS[level].length);
                // The text field is still the first root field, untouched.
                expect(view.fields[0].ref).toEqual(before.fields[0].ref);
                const tx = view.fields[0].dict.entries;
                expect(tx.FT.value).toBe('Tx');
                expect(latin1.decode(tx.T.value)).toBe('Name');
                expect(latin1.decode(tx.V.value)).toBe('Ada');
                // Other AcroForm entries and the existing widget survive.
                expect(latin1.decode(view.acro.da)).toBe('/Helv 0 Tf 0 g');
                expect(view.annots[0]).toEqual(before.annots[0]);
                expect(view.annots.length).toBe(1 + KINDS[level].length);
                expectRegisteredSigFields(view, KINDS[level]);
                expect(signaturesOf(r.value).map(x => x.verified)).toEqual([true]);
            });
        }
    }
});

// ── ANSSI leg — opt-in over the real documents (never committed) ──────
//
// Assertions 1–3 and 5 at level B on each document present under
// `references/ANSSI/`. An absent document yields a skipped test whose
// name says so; the describe name carries `present: n/3`.
const corpus = getAnssiCorpus();
const anssiPresent = Object.values(ANSSI_DOCS).filter(f => existsSync(join(corpus.dir, f))).length;

describe(`pdfSign.sign — ANSSI corpus leg, level B (present: ${anssiPresent}/3)`, () => {
    for (const [id, filename] of Object.entries(ANSSI_DOCS)) {
        const path = join(corpus.dir, filename);
        if (!existsSync(path)) {
            test.skip(`SKIPPED — references/ANSSI/${filename} absent (ANSSI ${id}, assertions 1–3 and 5)`,
                () => {});
            continue;
        }
        let bytes;
        const getBytes = () => bytes || (bytes = new Uint8Array(readFileSync(path)));
        const { firstSign } = signLegs(`ANSSI ${id}`, getBytes, 'B',
            { assertions: [1, 2, 3, 5], timeout: ANSSI_TIMEOUT_MS });
        // BL-2041 — the real document's signature is registered in a field.
        test(`ANSSI ${id} · B · (BL-2041) /Fields grows by one signature field, page 1 /Annots holds its widget`, () => {
            const before = fieldView(getBytes());
            const r = firstSign();
            expect(r.error).toBeUndefined();
            const view = fieldView(r.value);
            expect(view.fields.length).toBe(before.fields.length + 1);
            expect(view.acro.sigFlags).toBe(3);
            const added = view.sigFields.filter(f => f.value.entries.Type.value === 'Sig');
            expect(added.length).toBe(before.sigFields.length + 1);
            const field = added[added.length - 1];
            expect(field.raw.entries.F.value).toBe(132);
            expect(view.doc._raw.resolve(field.raw.entries.P)).toBe(view.page1);
            expect(view.annots).toContainEqual({ num: field.ref.num, gen: field.ref.gen });
        }, ANSSI_TIMEOUT_MS);
    }
});
