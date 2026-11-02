// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `readDocument(bytes, { recoverXref: true })` — the
 * cross-reference table rebuilt from the file's bytes when the
 * `startxref` / `/Prev` chain cannot be used; without the option every
 * read is today's.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const { readDocument } = rt.resolve('pdfDocument');
const te = new TextEncoder();

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>';
const PAGES = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>';

/**
 * A file from `{ num, body }` objects (`body` without `N 0 obj` / `endobj`)
 * and a tail built from the objects' offsets and the tail's own offset.
 * @param {{ num: number, body: string }[]} objs
 * @param {(offsets: Record<number, number>, at: number) => string} tail
 */
function build(objs, tail) {
    let text = '%PDF-1.7\n';
    const offsets = {};
    for (const o of objs) {
        offsets[o.num] = text.length;
        text += `${o.num} 0 obj\n${o.body}\nendobj\n`;
    }
    return te.encode(text + tail(offsets, text.length));
}

/** A classic table for objects 1..n, its trailer, and `startxref` at `xrefAt` (default: the table). */
function classicTail(n, trailer, shift = 0) {
    return (offsets, at) => {
        let t = `xref\n0 ${n + 1}\n0000000000 65535 f \n`;
        for (let i = 1; i <= n; i++) t += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        return `${t}trailer\n${trailer}\nstartxref\n${at + shift}\n%%EOF\n`;
    };
}

const BASE = [{ num: 1, body: CATALOG }, { num: 2, body: PAGES }, { num: 3, body: PAGE }];
const rebuilt = (doc) => doc.losses.filter((l) => l.code === 'pdf/document/xref-rebuilt');

function codeOf(fn) {
    try { fn(); } catch (e) { return e.code; }
    return null;
}

describe('readDocument — recoverXref', () => {
    const wrongStartxref = build(BASE, classicTail(3, '<< /Size 4 /Root 1 0 R >>', 7));

    test('a wrong startxref throws today; with the option the table is rebuilt', () => {
        expect(codeOf(() => readDocument(wrongStartxref))).toMatch(/^pdf\//);
        const doc = readDocument(wrongStartxref, { recoverXref: true });
        expect(doc.pages.length).toBe(1);
        expect(doc.catalog.pages).toEqual({ num: 2, gen: 0 });
        expect(rebuilt(doc).length).toBe(1);
        expect(rebuilt(doc)[0].context.cause).toMatch(/^pdf\//);
        expect(rebuilt(doc)[0].context.entries).toBe(3);
        expect(doc.xref.sections).toEqual([{ at: null, kind: 'rebuilt', entries: doc.xref.entries }]);
    });

    test('only true enables it: any other value reads as today', () => {
        const today = codeOf(() => readDocument(wrongStartxref));
        for (const v of [false, 1, 'yes', {}, null]) {
            expect(codeOf(() => readDocument(wrongStartxref, { recoverXref: v }))).toBe(today);
        }
    });

    test('a readable chain is not rebuilt: no loss, the sections as read', () => {
        const ok = build(BASE, classicTail(3, '<< /Size 4 /Root 1 0 R >>'));
        const doc = readDocument(ok, { recoverXref: true });
        expect(rebuilt(doc)).toEqual([]);
        expect(doc.xref.sections.map((s) => s.kind)).toEqual(['table']);
    });

    test('an undecodable cross-reference stream: its dictionary gives the trailer', () => {
        const bytes = build([...BASE, {
            num: 4,
            body: '<< /Type /XRef /Size 5 /W [1 2 1] /Root 1 0 R /Filter /XXXDecode /Length 4 >>\nstream\nxxxx\nendstream'
        }], (offsets) => `startxref\n${offsets[4]}\n%%EOF\n`);
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/filter/unsupported');
        const doc = readDocument(bytes, { recoverXref: true });
        expect(doc.pages.length).toBe(1);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(rebuilt(doc)[0].context.cause).toBe('pdf/filter/unsupported');
    });

    test('an object stream gives its members', () => {
        const members = `${PAGES} ${PAGE}`;
        const header = `2 0 3 ${PAGES.length + 1} `;
        const bytes = build([
            { num: 1, body: CATALOG },
            { num: 5, body: `<< /Type /ObjStm /N 2 /First ${header.length} /Length ${header.length + members.length} >>\nstream\n${header}${members}\nendstream` }
        ], () => 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n999999\n%%EOF\n');
        const doc = readDocument(bytes, { recoverXref: true });
        expect(doc.xref.entries[2]).toMatchObject({ type: 2, objStm: 5, index: 0 });
        expect(doc.xref.entries[3]).toMatchObject({ type: 2, objStm: 5, index: 1 });
        expect(doc.pages.length).toBe(1);
    });

    test('an incremental update: the later definition and the newest trailer win', () => {
        const first = build(BASE, classicTail(3, '<< /Size 4 /Root 1 0 R /Info 9 0 R >>'));
        const update = te.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /PageMode /UseOutlines >>\nendobj\n' +
            'trailer\n<< /Size 4 /Root 1 0 R /Prev 1 >>\nstartxref\n5\n%%EOF\n');
        const bytes = new Uint8Array(first.length + update.length);
        bytes.set(first, 0);
        bytes.set(update, first.length);
        const doc = readDocument(bytes, { recoverXref: true });
        expect(doc.catalog.pageMode).toBe('UseOutlines');
        expect(doc.xref.entries[1].offset).toBe(first.length);
        // /Info comes from the older trailer, merged newest first
        expect(doc.trailer.info).toEqual({ num: 9, gen: 0 });
    });

    test('no trailer anywhere: the last catalog found is the root', () => {
        const bytes = build(BASE, () => '%%EOF\n');
        expect(codeOf(() => readDocument(bytes))).toBe('pdf/document/no-startxref');
        const doc = readDocument(bytes, { recoverXref: true });
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.pages.length).toBe(1);
        expect(rebuilt(doc)[0].context.cause).toBe('pdf/document/no-startxref');
    });

    test('no catalog anywhere: still pdf/trailer/missing-root', () => {
        const bytes = build([{ num: 2, body: PAGES }, { num: 3, body: PAGE }], () => 'startxref\n0\n%%EOF\n');
        expect(codeOf(() => readDocument(bytes, { recoverXref: true }))).toBe('pdf/trailer/missing-root');
    });

    test('an object that cannot be parsed during the scan is skipped', () => {
        const bytes = build([...BASE, { num: 4, body: '<< /Broken [ >>' }], () => 'startxref\n0\n%%EOF\n');
        const doc = readDocument(bytes, { recoverXref: true });
        expect(doc.pages.length).toBe(1);
    });

    test('a number inside a word is not an object header', () => {
        const bytes = build(BASE, () => '%x12 0 objection\nstartxref\n0\n%%EOF\n');
        const doc = readDocument(bytes, { recoverXref: true });
        expect(Object.keys(doc.xref.entries).sort()).toEqual(['1', '2', '3']);
    });
});
