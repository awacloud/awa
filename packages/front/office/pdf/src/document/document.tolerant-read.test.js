// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `readDocument` on shapes real producers write that the
 * standard allows or that readers commonly accept: a trailer `/Encrypt
 * null` (an absent entry), a page-tree `/Kids` given by reference, a
 * classic cross-reference table with a subsection header ending in a
 * space or with 19-byte entries.
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
const BASE = [{ num: 1, body: CATALOG }, { num: 2, body: PAGES }, { num: 3, body: PAGE }];

/**
 * A file from `{ num, body }` objects (numbered 1..n in order) and a
 * classic table for them; `header` and `eol` shape the table.
 * @param {{ num: number, body: string }[]} objs
 * @param {string} trailer
 * @param {{ header?: string, eol?: string }} [shape] the subsection header
 *   line (default `0 <n+1>\n`) and each entry's end (default ` \n`).
 */
function build(objs, trailer, shape = {}) {
    let text = '%PDF-1.7\n';
    const offsets = {};
    for (const o of objs) {
        offsets[o.num] = text.length;
        text += `${o.num} 0 obj\n${o.body}\nendobj\n`;
    }
    const at = text.length;
    const eol = shape.eol ?? ' \n';
    let t = `xref\n${shape.header ?? `0 ${objs.length + 1}\n`}0000000000 65535 f${eol}`;
    for (const o of objs) t += `${String(offsets[o.num]).padStart(10, '0')} 00000 n${eol}`;
    return te.encode(`${text}${t}trailer\n${trailer}\nstartxref\n${at}\n%%EOF\n`);
}

function codeOf(fn) {
    try { fn(); } catch (e) { return e.code; }
    return null;
}

describe('readDocument — a trailer /Encrypt null (T41)', () => {
    const bytes = build(BASE, '<< /Size 4 /Root 1 0 R /Encrypt null >>');

    test('reads with no option: a null entry is an absent one, the document is not encrypted', () => {
        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(1);
        expect(doc.trailer.encrypt).toBeUndefined();
    });

    test('a read given a password reads it too', () => {
        expect(readDocument(bytes, { password: '' }).pages.length).toBe(1);
    });

    test('an /Encrypt reference still refuses a read with no password', () => {
        const enc = build([...BASE, { num: 4, body: '<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>' }],
            '<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>');
        expect(codeOf(() => readDocument(enc))).toBe('pdf/document/encrypted');
    });
});

describe('readDocument — a page tree whose /Kids is a reference (T42)', () => {
    test('the referenced array gives the pages', () => {
        const bytes = build([
            { num: 1, body: CATALOG },
            { num: 2, body: '<< /Type /Pages /Kids 4 0 R /Count 1 >>' },
            { num: 3, body: PAGE },
            { num: 4, body: '[3 0 R]' }
        ], '<< /Size 5 /Root 1 0 R >>');
        expect(readDocument(bytes).pages.length).toBe(1);
    });
});

describe('readDocument — a classic table in the shapes real producers write (T44)', () => {
    const tolerated = (doc) => doc.losses.filter((l) => l.code === 'pdf/document/xref-tolerated');

    test('a subsection header ending with a space: read, one loss naming the shape', () => {
        const doc = readDocument(build(BASE, '<< /Size 4 /Root 1 0 R >>', { header: '0 4 \r\n' }));
        expect(doc.pages.length).toBe(1);
        expect(tolerated(doc).map((l) => l.context.shape)).toEqual(['subsection-header-space']);
    });

    test('19-byte entries and the header space together: read, one loss per shape', () => {
        const doc = readDocument(build(BASE, '<< /Size 4 /Root 1 0 R >>', { header: '0 4 \n', eol: '\n' }));
        expect(doc.pages.length).toBe(1);
        expect(tolerated(doc).map((l) => l.context.shape).sort()).toEqual(['entry-eol-one-byte', 'subsection-header-space']);
    });

    test('a well-formed table records none', () => {
        expect(tolerated(readDocument(build(BASE, '<< /Size 4 /Root 1 0 R >>')))).toEqual([]);
    });
});
