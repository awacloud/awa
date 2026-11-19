// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `readDocument`'s resolver and a reference to an object it
 * is already resolving (T30 (c), criterion 7). qpdf's `issue-117.pdf` is a
 * stream whose `/Length` names itself: the read used to overflow the stack.
 * The reference reads as null with one `pdf/document/reference-cycle` loss,
 * and the stream falls to the `endstream` scan; a nesting deeper than the
 * resolver's cap throws `pdf/document/resolve-too-deep`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules) rt.register(m);

const { readDocument } = rt.resolve('pdfDocument');

const enc = new TextEncoder();
const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/**
 * A pdf of `bodies` (object number → the text between `obj` and `endobj`),
 * with a classic cross-reference table and `/Root 1 0 R`.
 * @param {Record<number, string>} bodies
 */
function classic(bodies) {
    const nums = Object.keys(bodies).map(Number).sort((a, b) => a - b);
    const size = nums[nums.length - 1] + 1;
    let out = '%PDF-1.7\n';
    const offsets = new Map();
    for (const n of nums) { offsets.set(n, out.length); out += `${n} 0 obj\n${bodies[n]}\nendobj\n`; }
    const xref = out.length;
    out += `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) {
        out += offsets.has(n) ? `${String(offsets.get(n)).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
    }
    out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return latin1(out);
}

const CONTENT = 'BT /F1 12 Tf 72 720 Td (Hello) Tj ET';
const pageTree = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'
};

const contentOf = (doc) => {
    const ref = doc.pages[0].contents[0];
    return doc._raw.resolve({ type: 'ref', num: ref.num, gen: ref.gen });
};
const cycles = (doc) => doc.losses.filter((l) => l.code === 'pdf/document/reference-cycle');
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code ?? e.name; } return null; };

describe('readDocument — a reference to an object being resolved', () => {
    test('a content stream whose /Length is itself reads, with one reference-cycle loss', () => {
        const doc = readDocument(classic({ ...pageTree, 4: `<< /Length 4 0 R >>\nstream\n${CONTENT}\nendstream` }));
        const s = contentOf(doc);
        expect(s.type).toBe('stream');
        expect(new TextDecoder().decode(s.raw)).toBe(CONTENT);
        expect(cycles(doc)).toHaveLength(1);
        expect(cycles(doc)[0].context).toEqual({ num: 4, gen: 0 });
    });

    test('an object stream whose /Length is one of its own members reads its members', () => {
        // Objects 1–4 in the file, 6 (the container's length) inside container 5.
        const member = '6 0 ';
        const first = member.length;
        const body = (len) => `${member}${len}`;
        // The member's value is the container's own stream length.
        let len = body(0).length;
        while (body(len).length !== len) len = body(len).length;
        const streamText = body(len);
        let out = '%PDF-1.7\n';
        const offsets = new Map();
        const put = (n, text) => { offsets.set(n, out.length); out += `${n} 0 obj\n${text}\nendobj\n`; };
        put(1, pageTree[1]);
        put(2, pageTree[2]);
        put(3, pageTree[3]);
        put(4, `<< /Length ${CONTENT.length} >>\nstream\n${CONTENT}\nendstream`);
        put(5, `<< /Type /ObjStm /N 1 /First ${first} /Length 6 0 R >>\nstream\n${streamText}\nendstream`);
        // Cross-reference stream 7, /W [1 4 2], uncompressed.
        const row = (t, f2, f3) => [t, (f2 >>> 24) & 255, (f2 >>> 16) & 255, (f2 >>> 8) & 255, f2 & 255, (f3 >>> 8) & 255, f3 & 255];
        const xrefOffset = out.length;
        const rows = [
            row(0, 0, 65535),
            row(1, offsets.get(1), 0), row(1, offsets.get(2), 0), row(1, offsets.get(3), 0),
            row(1, offsets.get(4), 0), row(1, offsets.get(5), 0),
            row(2, 5, 0),
            row(1, xrefOffset, 0)
        ].flat();
        const head = latin1(out + `7 0 obj\n<< /Type /XRef /Size 8 /W [1 4 2] /Root 1 0 R /Length ${rows.length} >>\nstream\n`);
        const tail = enc.encode(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`);
        const bytes = new Uint8Array(head.length + rows.length + tail.length);
        bytes.set(head, 0);
        bytes.set(rows, head.length);
        bytes.set(tail, head.length + rows.length);

        const doc = readDocument(bytes);
        const six = doc._raw.resolve({ type: 'ref', num: 6, gen: 0 });
        expect(six).toEqual({ type: 'int', value: len });
        expect(cycles(doc).map((l) => l.context)).toEqual([{ num: 6, gen: 0 }]);
    });

    test('a chain of 40 lengths throws pdf/document/resolve-too-deep, not a RangeError', () => {
        const bodies = { ...pageTree, 4: `<< /Length 10 0 R >>\nstream\n${CONTENT}\nendstream` };
        for (let i = 0; i < 40; i++) {
            const next = i === 39 ? '1' : `${11 + i} 0 R`;
            bodies[10 + i] = `<< /Length ${next} >>\nstream\nx\nendstream`;
        }
        const doc = readDocument(classic(bodies));
        expect(codeOf(() => contentOf(doc))).toBe('pdf/document/resolve-too-deep');
    });

    test('a sound file records no cycle', () => {
        const doc = readDocument(classic({ ...pageTree, 4: `<< /Length 5 0 R >>\nstream\n${CONTENT}\nendstream`, 5: String(CONTENT.length) }));
        expect(new TextDecoder().decode(contentOf(doc).raw)).toBe(CONTENT);
        expect(cycles(doc)).toEqual([]);
    });
});
