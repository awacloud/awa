// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The PDF/A and PDF/UA linters on what `pdf.read` returns:
 * the catalog from `catalog.raw`, references resolved, encryption and `/P`
 * from the trailer; each finding names the veraPDF rule of its check for
 * the profile (`opts.profile`) or part (`opts.part`) asked.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { pdfAOutputIntent } from './pdf-a-output-intent.js';
import { pdfUaTagged } from './pdf-ua-tagged.js';

const rt = new ModuleRuntime();
for (const m of [...fw_require, ...modules, pdfAOutputIntent, pdfUaTagged]) rt.register(m);
const pdf = rt.resolve('pdf');
const { writeDocument } = rt.resolve('pdfWriter');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { ContractError } = rt.resolve('pdfErrors');
const { validatePdfABasics } = rt.resolve('pdfAOutputIntent');
const { validatePdfUa } = rt.resolve('pdfUaTagged');

const te = new TextEncoder();
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const bool = (value) => ({ type: 'bool', value });
const str = (s) => ({ type: 'string', value: te.encode(s), syntax: 'lit' });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const dict = (entries) => ({ type: 'dict', entries });
const CONTENT = 'BT /F1 12 Tf 72 720 Td (Lint) Tj ET';
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>';

/**
 * A one-page document whose catalog holds `catalog` (references allowed to
 * objects 10 and up given in `extra`), Metadata unless `metadata` is false.
 */
function graph(catalog, extra = [], metadata = true) {
    return [
        { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2), ...(metadata ? { Metadata: ref(6) } : {}), ...catalog }) },
        { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: { type: 'array', items: [ref(3)] }, Count: int(1) }) },
        { num: 3, gen: 0, value: dict({ Type: name('Page'), Parent: ref(2), Contents: ref(4), MediaBox: { type: 'array', items: [int(0), int(0), int(612), int(792)] } }) },
        { num: 4, gen: 0, value: { type: 'stream', dict: dict({ Length: int(CONTENT.length) }), raw: te.encode(CONTENT) } },
        { num: 6, gen: 0, value: { type: 'stream', dict: dict({ Type: name('Metadata'), Subtype: name('XML'), Length: int(XMP.length) }), raw: te.encode(XMP) } },
        ...extra.map(([num, value]) => ({ num, gen: 0, value }))
    ];
}

/** `pdf.read` of the written graph. */
function readOf(catalog, extra, metadata) {
    const out = writeDocument({ indirects: graph(catalog, extra, metadata), root: { num: 1, gen: 0 } });
    return pdf.read(out.bytes || out);
}

/** `pdf.read` (empty user password) of the graph encrypted with `permissions`. */
function encryptedReadOf(catalog, extra, permissions) {
    let n = 7;
    const randomBytes = (len) => { const o = new Uint8Array(len); for (let i = 0; i < len; i++) o[i] = (n = (n * 1103515245 + 12345) & 0x7fffffff) & 0xff; return o; };
    const { bytes } = writeEncryptedDocument({ indirects: graph(catalog, extra), root: { num: 1, gen: 0 },
        encrypt: { version: 5, revision: 5, ownerPassword: 'owner', userPassword: '', permissions, randomBytes } });
    return pdf.read(bytes, { password: '' });
}

/** A catalog that meets every PDF/UA check, each value held by reference. */
const UA_OK = [{ StructTreeRoot: ref(10), MarkInfo: ref(11), Lang: ref(13), ViewerPreferences: ref(14) }, [
    [10, dict({ Type: name('StructTreeRoot') })],
    [11, dict({ Marked: ref(12) })],
    [12, bool(true)],
    [13, str('en-GB')],
    [14, dict({ DisplayDocTitle: ref(15) })],
    [15, bool(true)]
]];
const rules = (r) => r.findings.map((f) => `${f.severity} ${f.rule}`);

describe('validatePdfUa on a read document', () => {
    test('a catalog meeting every check, by reference, passes with no finding', () => {
        const r = validatePdfUa(readOf(...UA_OK));
        expect(r).toMatchObject({ pass: true, errors: [], warnings: [] });
        expect(r.findings).toEqual([]);
        expect(validatePdfUa(readOf(...UA_OK), { part: 2 }).pass).toBe(true);
    });

    test('part 1: each check names its rule; DisplayDocTitle is an error, a missing /Lang a warning', () => {
        const r = validatePdfUa(readOf({}));
        expect(r.pass).toBe(false);
        expect(rules(r)).toEqual(['error 7.1-t11', 'warning null', 'error 6.2-t1', 'error 7.1-t10']);
        expect(r.errors).toEqual(['catalog requires /StructTreeRoot', 'catalog requires /MarkInfo dictionary',
            'catalog requires /ViewerPreferences /DisplayDocTitle true']);
        expect(r.warnings).toEqual(['catalog has no /Lang string']);
    });

    test('part 2: a missing /Lang is an error, each rule of part 2', () => {
        const r = validatePdfUa(readOf({}), { part: 2 });
        expect(rules(r)).toEqual(['error 8.2.1-t1', 'error 8.4.4-t1', 'error 6.2-t1', 'error 8.11.2-t1']);
    });

    test('a /Marked false by reference and DisplayDocTitle false are errors', () => {
        const [catalog, extra] = UA_OK;
        const r = validatePdfUa(readOf(catalog, extra.map(([n, v]) => [n, n === 12 || n === 15 ? bool(false) : v])));
        expect(rules(r)).toEqual(['error 6.2-t1', 'error 7.1-t10']);
    });

    test('an encrypted document without the accessibility bit fails 7.16-t1 under part 1 only', () => {
        const doc = encryptedReadOf(...UA_OK, -4 & ~(1 << 9));
        expect(rules(validatePdfUa(doc))).toEqual(['error 7.16-t1']);
        expect(validatePdfUa(doc, { part: 2 }).pass).toBe(true);
        expect(validatePdfUa(encryptedReadOf(...UA_OK, -4)).pass).toBe(true);
    });

    test('a part other than 1 or 2 throws a ContractError', () => {
        let caught;
        try { validatePdfUa(readOf({}), { part: 3 }); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/extra/pdfua/bad-part');
    });
});

describe('validatePdfABasics on a read document', () => {
    test('a document with Metadata passes with no finding', () => {
        const r = validatePdfABasics(readOf({ OutputIntents: { type: 'array', items: [] } }), { profile: '2b' });
        expect(r).toMatchObject({ pass: true, errors: [], warnings: [] });
        expect(r.findings).toEqual([]);
    });

    test('a missing Metadata names the rule of each profile, none without one', () => {
        const doc = readOf({}, [], false);
        const metadataRule = (profile) => validatePdfABasics(doc, profile ? { profile } : undefined)
            .findings.find((f) => f.message === 'catalog requires /Metadata XMP stream').rule;
        expect(['1b', '1a', '2b', '2u', '3b', '4', '4e', '4f', undefined].map(metadataRule))
            .toEqual(['6.7.2-t1', '6.7.2-t1', '6.6.2.1-t1', '6.6.2.1-t1', '6.6.2.1-t1', '6.7.2.1-t1', '6.7.2.1-t1', '6.7.2.1-t1', null]);
    });

    test('an encrypted document fails 6.1.3-t2', () => {
        const r = validatePdfABasics(encryptedReadOf({}, [], -4), { profile: '4' });
        expect(r.pass).toBe(false);
        expect(r.findings).toContainEqual({ rule: '6.1.3-t2', severity: 'error', message: 'PDF/A forbids encryption' });
    });

    test('/MarkInfo by reference is a dictionary; one that is not is a warning', () => {
        expect(validatePdfABasics(readOf({ MarkInfo: ref(10), OutputIntents: { type: 'array', items: [] } }, [[10, dict({ Marked: bool(true) })]])).pass).toBe(true);
        const r = validatePdfABasics(readOf({ MarkInfo: int(3), OutputIntents: { type: 'array', items: [] } }), { profile: '1b' });
        expect(r.pass).toBe(true);
        expect(r.warnings).toEqual(['/MarkInfo must be a dictionary']);
        expect(rules(r)).toEqual(['warning null']);
    });

    test('a profile outside PDFA_PROFILES throws a ContractError', () => {
        let caught;
        try { validatePdfABasics(readOf({}), { profile: '5' }); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/extra/pdfa/bad-profile');
    });
});
