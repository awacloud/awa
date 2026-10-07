// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `readDocument` over PDF 1.5+ cross-reference constructs —
 * cross-reference streams (§7.5.8), object streams (§7.5.7) and
 * hybrid-reference files (`/XRefStm`, §7.5.8.4).
 *
 * The runtime is wired from `src/main.js`'s own arrays rather than a
 * hand-listed descriptor set, so a future dependency growth cannot leave
 * this file silently resolving `undefined` deps (office/BATCH_27 lesson).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';
import { pdfDocument } from './document.js';
import { pdfErrors } from '../errors.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfCatalog } from './catalog.js';
import { pdfPage } from './page.js';
import { pdfPages } from './pages.js';
import { buildDocument } from '../../tests/_helpers/build.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const { readDocument } = rt.resolve('pdfDocument');
const xrefMod  = rt.resolve('pdfXref');
const flateMod = rt.resolve('pdfFlate');
const xrefStreamWriter = rt.resolve('pdfXrefStreamWriter');

const te = new TextEncoder();

function concat(parts) {
    const arr = parts.map(p => (p instanceof Uint8Array ? p : te.encode(p)));
    let n = 0;
    for (const a of arr) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arr) { out.set(a, o); o += a.length; }
    return out;
}

const BINARY_MARKER = new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);

/**
 * Lay out a header + a list of `{ num, src }` bodies, recording each
 * object's byte offset. `src` is already a complete `N 0 obj … endobj`.
 */
function layout(version, objs) {
    const parts = [`%PDF-${version}\n`, BINARY_MARKER];
    const offsets = {};
    const at = () => parts.reduce(
        (n, p) => n + (p instanceof Uint8Array ? p.length : te.encode(p).length), 0);
    for (const o of objs) {
        offsets[o.num] = at();
        parts.push(o.src);
    }
    return { parts, offsets, at };
}

function contiguousRuns(nums) {
    const sorted = nums.slice().sort((a, b) => a - b);
    const out = [];
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        out.push(sorted[i], j - i + 1);
        i = j + 1;
    }
    return out;
}

/** `/W [1 4 2]` record writer — one 7-byte record per triple. */
function xrefStreamPayload(triples) {
    const out = new Uint8Array(triples.length * 7);
    triples.forEach((t, i) => {
        const o = i * 7;
        out[o] = t.type;
        out[o + 1] = (t.f2 >>> 24) & 0xff;
        out[o + 2] = (t.f2 >>> 16) & 0xff;
        out[o + 3] = (t.f2 >>> 8) & 0xff;
        out[o + 4] = t.f2 & 0xff;
        out[o + 5] = (t.f3 >>> 8) & 0xff;
        out[o + 6] = t.f3 & 0xff;
    });
    return out;
}

/**
 * Serialize a `/Type /XRef` indirect object.
 *
 * @param {number} num          object number of the xref stream itself
 * @param {object[]} triples    `{ num, type, f2, f3 }`, ascending
 * @param {string} extra        extra dict source (`/Root 1 0 R …`)
 * @param {object} [opts]       `{ filter, lengthRef, size }`
 */
function xrefStreamObj(num, triples, extra, opts = {}) {
    const raw = xrefStreamPayload(triples);
    let payload = raw;
    let filterSrc = '';
    if (opts.filter === 'FlateDecode') {
        payload = flateMod.encode(raw);
        filterSrc = ' /Filter /FlateDecode';
    }
    const size = opts.size != null
        ? opts.size
        : Math.max(...triples.map(t => t.num)) + 1;
    const lengthSrc = opts.lengthRef ? `${opts.lengthRef} 0 R` : String(payload.length);
    const index = contiguousRuns(triples.map(t => t.num));
    return concat([
        `${num} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2]`
        + ` /Index [${index.join(' ')}]${extra}${filterSrc}`
        + ` /Length ${lengthSrc} >>\nstream\n`,
        payload,
        '\nendstream\nendobj\n'
    ]);
}

/**
 * Serialize a `/Type /ObjStm` indirect object (uncompressed payload —
 * `pdfFilterDispatch.decode` returns the raw bytes when `/Filter` is
 * absent, which keeps the fixture readable).
 *
 * `opts.headerNums` overrides the object numbers written in the header
 * pair list, to fabricate a member/xref mismatch.
 */
function objStmObj(num, members, opts = {}) {
    const bodies = [];
    const offs = [];
    let cur = 0;
    for (const m of members) {
        offs.push(cur);
        bodies.push(m.src, '\n');
        cur += te.encode(m.src).length + 1;
    }
    const nums = opts.headerNums || members.map(m => m.num);
    const header = members.map((m, i) => `${nums[i]} ${offs[i]}`).join(' ') + '\n';
    const payload = concat([header, ...bodies]);
    return concat([
        `${num} 0 obj\n<< /Type /ObjStm /N ${members.length}`
        + ` /First ${te.encode(header).length} /Length ${payload.length} >>\nstream\n`,
        payload,
        '\nendstream\nendobj\n'
    ]);
}

const PAGE_CONTENT = 'BT /F1 12 Tf 72 700 Td (xref stream) Tj ET\n';

function catalogSrc(n)  { return `${n} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`; }
function pagesSrc(n)    { return `${n} 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`; }
function pageSrc(n)     {
    return `${n} 0 obj\n<< /Type /Page /Parent 2 0 R`
        + ` /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n`;
}
function contentSrc(n, body) {
    return `${n} 0 obj\n<< /Length ${te.encode(body).length} >>\nstream\n${body}endstream\nendobj\n`;
}

/**
 * A PDF 1.5 whose ONLY cross-reference is a `/Type /XRef` stream:
 * 1 Catalog, 2 Pages, 3 Page, 4 Contents, 5 the xref stream.
 */
function buildXrefStreamOnly(opts = {}) {
    const objs = [
        { num: 1, src: catalogSrc(1) },
        { num: 2, src: pagesSrc(2) },
        { num: 3, src: pageSrc(3) },
        { num: 4, src: contentSrc(4, PAGE_CONTENT) }
    ];
    const { parts, offsets, at } = layout('1.5', objs);
    const xrefOffset = at();
    const triples = [{ num: 0, type: 0, f2: 0, f3: 65535 }];
    for (let n = 1; n <= 4; n++) triples.push({ num: n, type: 1, f2: offsets[n], f3: 0 });
    triples.push({ num: 5, type: 1, f2: xrefOffset, f3: 0 });
    parts.push(xrefStreamObj(5, triples, ' /Root 1 0 R', opts));
    parts.push(`startxref\n${xrefOffset}\n%%EOF\n`);
    return { bytes: concat(parts), xrefOffset };
}

describe('readDocument — cross-reference streams (§7.5.8)', () => {
    test('unfiltered xref-stream-only PDF 1.5 with /W [1 4 2] opens', () => {
        const { bytes } = buildXrefStreamOnly();
        const doc = readDocument(bytes);
        expect(doc.version).toBe('1.5');
        expect(doc.pages.length).toBe(1);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.xref.sections.length).toBe(1);
        expect(doc.xref.sections[0].kind).toBe('stream');
        expect(doc.catalog.pages).toEqual({ num: 2, gen: 0 });
    });

    test('non-vacuity: the same bytes still defeat the classical table parser', () => {
        const { bytes, xrefOffset } = buildXrefStreamOnly();
        expect(() => xrefMod.parseXrefTable(bytes, xrefOffset))
            .toThrow(/expected xref keyword/);
        let code = null;
        try { xrefMod.parseXrefTable(bytes, xrefOffset); } catch (e) { code = e.code; }
        expect(code).toBe('pdf/xref/no-xref-keyword');
    });

    test('a /Filter /FlateDecode xref stream opens identically', () => {
        const flat = readDocument(buildXrefStreamOnly({ filter: 'FlateDecode' }).bytes);
        const plain = readDocument(buildXrefStreamOnly().bytes);
        expect(flat.pages.length).toBe(1);
        expect(flat.xref.sections[0].kind).toBe('stream');
        expect(Object.keys(flat.xref.entries)).toEqual(Object.keys(plain.xref.entries));
    });

    test('the xref stream is the section trailer — /Root and /Size come from its dict', () => {
        const doc = readDocument(buildXrefStreamOnly().bytes);
        expect(doc.trailer.size).toBe(6);
        expect(doc.trailer.raw.entries.Type.value).toBe('XRef');
    });
});

describe('readDocument — pdfXrefStreamWriter round-trip', () => {
    function model(contentBody) {
        const raw = te.encode(contentBody);
        return [
            { num: 1, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Catalog' },
                Pages: { type: 'ref', num: 2, gen: 0 } } } },
            { num: 2, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Pages' },
                Kids: { type: 'array', items: [{ type: 'ref', num: 3, gen: 0 }] },
                Count: { type: 'int', value: 1 } } } },
            { num: 3, gen: 0, value: { type: 'dict', entries: {
                Type: { type: 'name', value: 'Page' },
                Parent: { type: 'ref', num: 2, gen: 0 },
                MediaBox: { type: 'array', items: [0, 0, 612, 792].map(v => ({ type: 'int', value: v })) },
                Contents: { type: 'ref', num: 4, gen: 0 } } } },
            { num: 4, gen: 0, value: { type: 'stream',
                dict: { type: 'dict', entries: { Length: { type: 'int', value: raw.length } } },
                raw } }
        ];
    }

    test('writer output WITHOUT ObjStm round-trips through readDocument', () => {
        const bytes = xrefStreamWriter.writeXrefStreamDocument({
            indirects: model(PAGE_CONTENT), root: { num: 1, gen: 0 }
        });
        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);
        expect(doc.xref.sections[0].kind).toBe('stream');
        const content = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(content.type).toBe('stream');
        expect(Array.from(content.raw)).toEqual(Array.from(te.encode(PAGE_CONTENT)));
        for (const rec of doc._raw.indirects.values()) {
            expect(rec.objStm).toBeUndefined();
        }
    });

    test('writer output WITH ObjStm resolves type-2 objects and records the container', () => {
        const bytes = xrefStreamWriter.writeXrefStreamDocument({
            indirects: model(PAGE_CONTENT), root: { num: 1, gen: 0 }, useObjStm: true
        });
        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);
        expect(doc.xref.entries[1].type).toBe(2);
        const rec = doc._raw.indirects.get('1:0');
        expect(rec.offset).toBe(0);
        expect(rec.objStm).toBe(doc.xref.entries[1].objStm);
        expect(typeof rec.objStm).toBe('number');
        // The content stream cannot live in an ObjStm — it stays type 1.
        expect(doc.xref.entries[4].type).toBe(1);
        const content = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(Array.from(content.raw)).toEqual(Array.from(te.encode(PAGE_CONTENT)));
    });

    test('one decode per container — repeated resolution reuses the cached members', () => {
        const bytes = xrefStreamWriter.writeXrefStreamDocument({
            indirects: model(PAGE_CONTENT), root: { num: 1, gen: 0 }, useObjStm: true
        });
        const doc = readDocument(bytes);
        const a = doc._raw.resolve({ type: 'ref', num: 2, gen: 0 });
        const b = doc._raw.resolve({ type: 'ref', num: 2, gen: 0 });
        expect(a).toBe(b);
        expect(doc._raw.resolve({ type: 'ref', num: 3, gen: 0 }).entries.Type.value).toBe('Page');
    });
});

describe('readDocument — mixed /Prev chains', () => {
    /**
     * An xref-stream base plus one CLASSICAL incremental section whose
     * trailer chains back into the stream with /Prev.
     */
    function buildStreamBasePlusClassicUpdate() {
        const base = buildXrefStreamOnly();
        const parts = [base.bytes];
        const at = () => parts.reduce((n, p) => n + p.length, 0);
        const newContent = 'BT /F1 12 Tf 72 640 Td (updated) Tj ET\n';
        const contentOffset = at();
        parts.push(te.encode(contentSrc(4, newContent)));
        const tableOffset = at();
        const entry = (off, gen, free) =>
            `${String(off).padStart(10, '0')} ${String(gen).padStart(5, '0')} ${free ? 'f' : 'n'} \n`;
        parts.push(te.encode(
            `xref\n0 1\n${entry(0, 65535, true)}4 1\n${entry(contentOffset, 0, false)}`
            + `trailer\n<< /Size 6 /Root 1 0 R /Prev ${base.xrefOffset} >>\n`
            + `startxref\n${tableOffset}\n%%EOF\n`));
        return { bytes: concat(parts), newContent, tableOffset, streamOffset: base.xrefOffset };
    }

    test('classic incremental section over an xref-stream base: newest wins, old objects resolve', () => {
        const f = buildStreamBasePlusClassicUpdate();
        const doc = readDocument(f.bytes);
        expect(doc.xref.sections.map(s => s.kind)).toEqual(['table', 'stream']);
        expect(doc.xref.sections[0].at).toBe(f.tableOffset);
        expect(doc.xref.sections[1].at).toBe(f.streamOffset);
        expect(doc.pages.length).toBe(1);
        // Object 4 comes from the newest (classical) section…
        const content = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(Array.from(content.raw)).toEqual(Array.from(te.encode(f.newContent)));
        // …while 1/2/3 still resolve through the older xref STREAM.
        expect(doc.catalog.pages).toEqual({ num: 2, gen: 0 });
        expect(doc._raw.resolve({ type: 'ref', num: 3, gen: 0 }).entries.Type.value).toBe('Page');
    });
});

describe('readDocument — hybrid-reference files (/XRefStm)', () => {
    /**
     * A classical table whose trailer carries /XRefStm. Object 4 (the page
     * content) is listed ONLY in the companion stream; object 1 is listed
     * in BOTH, the stream carrying a deliberately bogus offset so that a
     * table-wins merge is observable.
     */
    function buildHybrid() {
        const objs = [
            { num: 1, src: catalogSrc(1) },
            { num: 2, src: pagesSrc(2) },
            { num: 3, src: pageSrc(3) },
            { num: 4, src: contentSrc(4, PAGE_CONTENT) }
        ];
        const { parts, offsets, at } = layout('1.5', objs);
        const stmOffset = at();
        const triples = [
            { num: 1, type: 1, f2: 999999, f3: 0 },   // bogus — the table must win
            { num: 4, type: 1, f2: offsets[4], f3: 0 }
        ];
        parts.push(xrefStreamObj(5, triples, ' /Root 1 0 R', { size: 6 }));
        const tableOffset = at();
        const entry = (off, gen, free) =>
            `${String(off).padStart(10, '0')} ${String(gen).padStart(5, '0')} ${free ? 'f' : 'n'} \n`;
        let table = `xref\n0 4\n${entry(0, 65535, true)}`;
        for (let n = 1; n <= 3; n++) table += entry(offsets[n], 0, false);
        parts.push(table);
        parts.push(`trailer\n<< /Size 6 /Root 1 0 R /XRefStm ${stmOffset} >>\n`);
        parts.push(`startxref\n${tableOffset}\n%%EOF\n`);
        return { bytes: concat(parts), stmOffset, tableOffset, catalogOffset: offsets[1] };
    }

    test('an object present only in the companion stream resolves', () => {
        const f = buildHybrid();
        const doc = readDocument(f.bytes);
        expect(doc.pages.length).toBe(1);
        const content = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(Array.from(content.raw)).toEqual(Array.from(te.encode(PAGE_CONTENT)));
    });

    test('a key present in both keeps the TABLE entry', () => {
        const f = buildHybrid();
        const doc = readDocument(f.bytes);
        expect(doc.xref.entries[1].offset).toBe(f.catalogOffset);
        expect(doc.xref.sections.map(s => s.kind)).toEqual(['table', 'stream']);
        expect(doc.xref.sections[1].at).toBe(f.stmOffset);
        expect(doc.xref.sections[1].entries[1].offset).toBe(999999);
    });
});

describe('readDocument — new error codes', () => {
    function codeOf(fn) {
        try { fn(); } catch (e) { return e.code; }
        return null;
    }

    test('pdf/document/bad-xref-section — startxref points at a non-XRef object', () => {
        const objs = [
            { num: 1, src: catalogSrc(1) },
            { num: 2, src: pagesSrc(2) },
            { num: 3, src: pageSrc(3) },
            { num: 4, src: contentSrc(4, PAGE_CONTENT) }
        ];
        const { parts, at } = layout('1.5', objs);
        const decoyOffset = at();
        parts.push('5 0 obj\n<< /Type /Nonsense >>\nendobj\n');
        parts.push(`startxref\n${decoyOffset}\n%%EOF\n`);
        const bytes = concat(parts);
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/bad-xref-section');
        expect(() => readDocument(bytes))
            .toThrow(/neither an xref table nor a cross-reference stream/);
    });

    test('pdf/document/xrefstm-indirect-length — an xref stream with an indirect /Length', () => {
        const objs = [
            { num: 1, src: catalogSrc(1) },
            { num: 2, src: pagesSrc(2) },
            { num: 3, src: pageSrc(3) },
            { num: 4, src: contentSrc(4, PAGE_CONTENT) },
            { num: 6, src: '6 0 obj\n35\nendobj\n' }
        ];
        const { parts, offsets, at } = layout('1.5', objs);
        const xrefOffset = at();
        const triples = [{ num: 0, type: 0, f2: 0, f3: 65535 }];
        for (const n of [1, 2, 3, 4]) triples.push({ num: n, type: 1, f2: offsets[n], f3: 0 });
        triples.push({ num: 5, type: 1, f2: xrefOffset, f3: 0 });
        triples.push({ num: 6, type: 1, f2: offsets[6], f3: 0 });
        parts.push(xrefStreamObj(5, triples, ' /Root 1 0 R', { lengthRef: 6, size: 7 }));
        parts.push(`startxref\n${xrefOffset}\n%%EOF\n`);
        expect(codeOf(() => readDocument(concat(parts))))
            .toBe('pdf/document/xrefstm-indirect-length');
    });

    test('pdf/document/xref-stream-unwired — an 8-argument factory call', () => {
        const errors = pdfErrors.factory();
        const shared = rt.resolve('pdfShared');
        const tokenizer = pdfTokenizer.factory(errors, shared);
        const parser = pdfParser.factory(errors, pdfParserObj.factory(), tokenizer);
        const legacy = pdfDocument.factory(
            errors, tokenizer, parser,
            pdfXref.factory(errors, tokenizer, parser),
            pdfTrailer.factory(errors, pdfParserObj.factory()),
            pdfCatalog.factory(errors, pdfParserObj.factory()),
            pdfPage.factory(errors, pdfParserObj.factory()),
            pdfPages.factory(errors, pdfParserObj.factory())
        );
        const { bytes } = buildXrefStreamOnly();
        // A classical document still reads through the 8-argument wiring…
        expect(legacy.readDocument(buildDocument({ pages: ['x'] })).pages.length).toBe(1);
        // …but the stream path fails loud instead of raising a TypeError.
        let err = null;
        try { legacy.readDocument(bytes); } catch (e) { err = e; }
        expect(err).not.toBe(null);
        expect(err instanceof TypeError).toBe(false);
        expect(err.code).toBe('pdf/document/xref-stream-unwired');
    });

    /**
     * Base for the object-stream error fixtures: 1/2/3 live in ObjStm 5,
     * 4 is the passthrough content stream, 6 is the xref stream.
     */
    function buildObjStmDoc(mutate) {
        const members = [
            { num: 1, src: '<< /Type /Catalog /Pages 2 0 R >>' },
            { num: 2, src: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
            { num: 3, src: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>' }
        ];
        const cfg = {
            headerNums: null, containerNum: 5, containerEntry: null,
            extra: ' /Root 1 0 R', containerSrc: null
        };
        if (mutate) mutate(cfg);
        const container = cfg.containerSrc
            || objStmObj(5, members, { headerNums: cfg.headerNums });
        const objs = [
            { num: 4, src: contentSrc(4, PAGE_CONTENT) },
            { num: 5, src: container }
        ];
        const { parts, offsets, at } = layout('1.5', objs);
        const xrefOffset = at();
        const triples = [{ num: 0, type: 0, f2: 0, f3: 65535 }];
        for (let i = 0; i < 3; i++) {
            triples.push({ num: i + 1, type: 2, f2: cfg.containerNum, f3: i });
        }
        triples.push({ num: 4, type: 1, f2: offsets[4], f3: 0 });
        triples.push(cfg.containerEntry
            ? { num: 5, ...cfg.containerEntry }
            : { num: 5, type: 1, f2: offsets[5], f3: 0 });
        triples.push({ num: 6, type: 1, f2: xrefOffset, f3: 0 });
        parts.push(xrefStreamObj(6, triples, cfg.extra, { size: 7 }));
        parts.push(`startxref\n${xrefOffset}\n%%EOF\n`);
        return concat(parts);
    }

    test('the object-stream base fixture itself reads (control)', () => {
        const doc = readDocument(buildObjStmDoc());
        expect(doc.pages.length).toBe(1);
        expect(doc._raw.indirects.get('1:0').objStm).toBe(5);
    });

    test('pdf/document/objstm-nested — the container is itself a compressed object', () => {
        const bytes = buildObjStmDoc((cfg) => {
            cfg.containerEntry = { type: 2, objStm: 7, index: 0 };
        });
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/objstm-nested');
    });

    test('pdf/document/objstm-not-stream — the container is not a stream object', () => {
        const bytes = buildObjStmDoc((cfg) => {
            cfg.containerSrc = '5 0 obj\n<< /Type /ObjStm /N 3 /First 0 >>\nendobj\n';
        });
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/objstm-not-stream');
    });

    test('pdf/document/objstm-mismatch — the member carries another object number', () => {
        const bytes = buildObjStmDoc((cfg) => { cfg.headerNums = [91, 2, 3]; });
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/objstm-mismatch');
    });

    test('pdf/document/objstm-encrypted — no decrypt path is composed', () => {
        const bytes = buildObjStmDoc((cfg) => {
            cfg.extra = ' /Root 1 0 R /Encrypt << /Filter /Standard /V 5 /R 6 >>';
        });
        // The fail-loud arm fires first without the opt-in…
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/encrypted');
        // …and the object-stream refusal is what `allowEncrypted` reaches.
        expect(codeOf(() => readDocument(bytes, { allowEncrypted: true })))
            .toBe('pdf/document/objstm-encrypted');
    });
});

describe('readDocument — classical-table regression', () => {
    test('a classic fixture is unchanged apart from sections[].kind', () => {
        const bytes = buildDocument({ pages: ['abc', 'def'] });
        const doc = readDocument(bytes);

        expect(doc.version).toBe('2.0');
        expect(doc.pages.length).toBe(2);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });

        // Sections gained exactly one key, and its value is 'table'.
        for (const s of doc.xref.sections) {
            expect(Object.keys(s).sort()).toEqual(['at', 'entries', 'kind']);
            expect(s.kind).toBe('table');
        }
        // Everything the pre-change reader produced is byte-for-byte there.
        const legacySections = doc.xref.sections
            .map(s => ({ at: s.at, entries: s.entries }));
        const direct = xrefMod.parseXrefTable(bytes, doc.xref.sections[0].at);
        expect(legacySections).toEqual([{ at: doc.xref.sections[0].at, entries: direct.entries }]);
        expect(doc.xref.entries).toEqual(direct.entries);

        // No classical entry acquires a type, and no indirect an objStm.
        for (const e of Object.values(doc.xref.entries)) {
            expect(e.type).toBeUndefined();
        }
        for (const rec of doc._raw.indirects.values()) {
            expect(Object.keys(rec).sort()).toEqual(['offset', 'value']);
        }
    });
});
