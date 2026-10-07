// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Regression fixtures for two real-document `readDocument`
 * failures measured 2026-09-22 against `references/ANSSI/`.
 *
 * office/BATCH_41 task 01 committed them RED (each assertion pinned the
 * measured error); task 03 fixed the read path and flipped them GREEN. The
 * pre-fix error of every shape stays quoted in its comment block.
 *
 * Two layers per shape:
 *   1. A committed minimal fixture under `_fixtures/real-shapes/` (or an
 *      inline classical-table chain built by `classicalChain` below) — the
 *      permanent regression test, always run.
 *   2. An opt-in leg over the real `references/ANSSI/` file, driven by
 *      `_helpers/anssi-corpus.js` — skips cleanly when the (git-ignored)
 *      corpus is absent, so a fresh clone stays green on these legs.
 *
 * @module pdf/tests/real-shapes.integration
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../src/main.js';
import { getAnssiCorpus, ANSSI_DOCS } from './_helpers/anssi-corpus.js';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
const { readDocument } = rt.resolve('pdfDocument');

function fixtureBytes(name) {
    return new Uint8Array(readFileSync(new URL(`_fixtures/real-shapes/${name}`, import.meta.url)));
}

function codeAndMessageOf(fn) {
    try {
        fn();
        return null;
    } catch (e) {
        return { code: e.code, message: e.message };
    }
}

/**
 * Build a classical-table PDF from an update chain, oldest section first.
 * Each section writes its `objects` ([num, body] pairs), then an xref
 * table listing them in use plus its `free` numbers (gen 1), then a
 * trailer carrying `/Size`, the section's own `trailer` text and — for
 * every section after the first — `/Prev` to the section before it.
 *
 * @param {Array<{objects?: Array<[number, string]>, free?: number[], trailer?: string}>} sections
 * @param {number} size  The `/Size` written in every trailer.
 * @returns {Uint8Array}
 */
function classicalChain(sections, size) {
    let out = '%PDF-1.4\n';
    let prevXref = -1;
    sections.forEach((section, idx) => {
        const lines = [];
        if (idx === 0) lines.push('0 1', '0000000000 65535 f ');
        for (const [num, body] of section.objects || []) {
            const at = out.length;
            out += `${num} 0 obj\n${body}\nendobj\n`;
            lines.push(`${num} 1`, `${String(at).padStart(10, '0')} 00000 n `);
        }
        for (const num of section.free || []) {
            lines.push(`${num} 1`, '0000000000 00001 f ');
        }
        const xrefAt = out.length;
        const prev = prevXref >= 0 ? ` /Prev ${prevXref}` : '';
        out += `xref\n${lines.join('\n')}\ntrailer\n<< /Size ${size} ${section.trailer || ''}${prev} >>\n`
            + `startxref\n${xrefAt}\n%%EOF\n`;
        prevXref = xrefAt;
    });
    return new TextEncoder().encode(out);
}

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>';
const PAGE    = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';

describe('readDocument — BL-1544: /Root supplied by only one of several xref sections', () => {
    // Pre-fix (measured 2026-09-22 on anssi-fondamentaux-zero-trust-v1.0.pdf
    // and pinned red by task 01 on this fixture): readDocument threw
    //     code:    'pdf/trailer/missing-root'
    //     message: 'trailer is missing required /Root indirect reference'
    // because the section walk typed EVERY section's trailer dict on its
    // own. Post-fix: the reader types the MERGE of every section's dict,
    // newest first, so /Root is found in whichever section supplies it.
    test('committed fixture — the incremental xref stream omits /Root: the document reads', () => {
        const bytes = fixtureBytes('xref-stream-update-missing-root.pdf');
        const doc = readDocument(bytes);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.xref.sections.map(s => s.kind)).toEqual(['stream', 'stream']);
        expect(doc.pages.length).toBe(1);
        expect(doc.losses).toEqual([]);
    });

    // The real zero-trust document is the REVERSE shape: it is linearized,
    // its first-page /Type /XRef stream (the one startxref points at)
    // carries /Root, and the main stream it chains to through /Prev does
    // not. Same merge, other direction.
    test('inline chain — the newest section carries /Root, the older one does not', () => {
        const bytes = classicalChain([
            { objects: [[1, CATALOG], [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'], [3, PAGE]] },
            { objects: [[3, PAGE]], trailer: '/Root 1 0 R' }
        ], 4);
        const doc = readDocument(bytes);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.trailer.size).toBe(4);
        expect(doc.pages.length).toBe(1);
        expect(doc.losses).toEqual([]);
    });

    test('the merged trailer inherits document keys only, never another section\'s /Prev', () => {
        const bytes = classicalChain([
            { objects: [[1, CATALOG], [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'], [3, PAGE]],
              trailer: '/Root 1 0 R /Info 1 0 R' },
            { objects: [[3, PAGE]] },
            { objects: [[3, PAGE]] }
        ], 4);
        const doc = readDocument(bytes);
        const newest = doc.xref.sections[0].at;
        const middle = doc.xref.sections[1].at;
        expect(doc.xref.sections.length).toBe(3);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.trailer.info).toEqual({ num: 1, gen: 0 });
        // /Prev is the newest section's own, pointing at the middle one.
        expect(doc.trailer.prev).toBe(middle);
        expect(doc.trailer.prev).not.toBe(newest);
    });

    // Preserved refusal: the repair is a merge, not a silent accept.
    test('refusal preserved — no section supplies /Root: same code and message as before', () => {
        const bytes = classicalChain([
            { objects: [[1, CATALOG], [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'], [3, PAGE]] },
            { objects: [[3, PAGE]] }
        ], 4);
        const result = codeAndMessageOf(() => readDocument(bytes));
        expect(result).not.toBeNull();
        expect(result.code).toBe('pdf/trailer/missing-root');
        expect(result.message).toBe('trailer is missing required /Root indirect reference');
    });

    test('refusal preserved — the committed fixture with its base /Root blanked out', () => {
        // Same-length rename of the base stream's `/Root` key: offsets and
        // the xref streams stay byte-valid, and no section supplies /Root.
        const bytes = fixtureBytes('xref-stream-update-missing-root.pdf');
        const text = new TextDecoder('latin1').decode(bytes);
        expect(text.split('/Root ').length - 1).toBe(1);
        const blanked = new Uint8Array(bytes);
        const at = text.indexOf('/Root ');
        blanked.set(new TextEncoder().encode('/Roox '), at);
        const result = codeAndMessageOf(() => readDocument(blanked));
        expect(result).not.toBeNull();
        expect(result.code).toBe('pdf/trailer/missing-root');
        expect(result.message).toBe('trailer is missing required /Root indirect reference');
    });

    const corpus = getAnssiCorpus();
    // Measured 2026-09-23 with this task's fix AND task 04's /DecodeParms
    // fix (BL-1531) in the tree: 34 pages, no loss. The file's xref streams
    // use /Predictor 12, so without BL-1531 the entries mis-decode and the
    // read fails on the catalog instead (see the task 03 report).
    test.skipIf(!corpus.present)(
        'opt-in — anssi-fondamentaux-zero-trust-v1.0.pdf now reads',
        () => {
            const bytes = new Uint8Array(readFileSync(corpus.docs.zeroTrust));
            const doc = readDocument(bytes);
            expect(doc.xref.sections.map(s => s.kind)).toEqual(['stream', 'stream']);
            expect(doc.pages.length).toBe(34);
            expect(doc.losses).toEqual([]);
        }
    );
});

describe('readDocument — BL-1545: a referenced object the newest xref section marks free', () => {
    // Pre-fix (pinned red by task 01 on this fixture): readDocument threw
    //     code:    'pdf/document/free-object'
    //     message: 'object 4 is free'
    // from resolveByKey, reached by the page-tree walk. Post-fix:
    // resolveByKey resolves through the NEWEST section that still defines
    // the object in use (here the base table) and records the fallback in
    // the document's loss ledger.
    test('committed fixture — resolved through the older section, fallback recorded', () => {
        const bytes = fixtureBytes('free-object-referenced-by-kids.pdf');
        const doc = readDocument(bytes);
        expect(doc.pages.length).toBe(2);
        expect(doc.losses.length).toBe(1);
        expect(doc.losses[0].code).toBe('pdf/document/free-entry-fallback');
        expect(doc.losses[0].context.num).toBe(4);
        expect(doc.losses[0].context.gen).toBe(0);
        // The section it resolved through is the base (older) table.
        expect(doc.losses[0].context.section).toEqual({
            at: doc.xref.sections[1].at, kind: 'table'
        });
        // The public xref view is unchanged: the newest entry still wins.
        expect(doc.xref.entries[4].free).toBe(true);
    });

    test('an object free in EVERY section: read completes, loss recorded, no throw', () => {
        const bytes = classicalChain([
            { objects: [[1, CATALOG], [2, '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'], [3, PAGE]],
              free: [4], trailer: '/Root 1 0 R' },
            { objects: [[3, PAGE]], free: [4] }
        ], 5);
        let doc;
        expect(() => { doc = readDocument(bytes); }).not.toThrow();
        // The dangling kid contributes no page; the live one does.
        expect(doc.pages.length).toBe(1);
        expect(doc.losses).toEqual([{
            code: 'pdf/document/free-object',
            message: 'object 4 is free in every xref section; read as null',
            context: { num: 4, gen: 0 }
        }]);
        // §7.3.10: a reference to a free object reads as the null object,
        // and the loss is recorded once however often it is resolved.
        expect(doc._raw.resolve({ type: 'ref', num: 4, gen: 0 })).toEqual({ type: 'null' });
        expect(doc.losses.length).toBe(1);
    });

    test('refusal preserved — a /Root free in every section still throws', () => {
        const bytes = classicalChain([
            { objects: [[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'], [3, PAGE]],
              free: [1], trailer: '/Root 1 0 R' }
        ], 4);
        const result = codeAndMessageOf(() => readDocument(bytes));
        expect(result).not.toBeNull();
        expect(result.code).toBe('pdf/document/free-object');
        expect(result.message).toBe('object 1 is free');
    });

    const corpus = getAnssiCorpus();
    // Measured 2026-09-23: object 1505 is this document's CATALOG, and it
    // read as "free" only because the /Predictor 12 xref streams were
    // mis-decoded (BL-1531, task 04). With task 04's fix in the tree the
    // document reads with no loss; without it, the catalog refusal above
    // still reports `object 1505 is free` (see the task 03 report).
    test.skipIf(!corpus.present)(
        'opt-in — anssi-guide-mecanismes-crypto-3.00.pdf now reads',
        () => {
            const bytes = new Uint8Array(readFileSync(corpus.docs.mecanismes));
            const doc = readDocument(bytes);
            expect(doc.pages.length).toBe(81);
            expect(doc.losses).toEqual([]);
        }
    );
});

// ── appendIncremental over the real shapes (office/BATCH_41 task 06) ──────
//
// BL-1533: appendIncremental wrote classical tables only, so over a base
// whose newest section is a /Type /XRef stream it chained a table to a
// stream and could not harvest /Root (it threw pdf/incremental/no-root
// unless the caller supplied it). The update now takes the base's form.

const { appendIncremental } = rt.resolve('pdfIncrementalWriter');
const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

/** The deterministic classical base the byte-identity pin was recorded on. */
function classicalGoldenBase() {
    let out = '%PDF-1.4\n';
    const off = [];
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
        '<< /Producer (golden) >>'
    ];
    objs.forEach((body, i) => {
        off[i + 1] = out.length;
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefAt = out.length;
    out += 'xref\n0 5\n0000000000 65535 f \n'
        + [1, 2, 3, 4].map(n => `${String(off[n]).padStart(10, '0')} 00000 n \n`).join('');
    out += 'trailer\n<< /Size 5 /Root 1 0 R /Info 4 0 R /ID [<00112233445566778899AABBCCDDEEFF>'
        + '<00112233445566778899AABBCCDDEEFF>] >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
    return new TextEncoder().encode(out);
}

const GOLDEN_UPDATES = [
    { num: 5, gen: 0, value: { type: 'dict', entries: { Type: { type: 'name', value: 'Metadata' } } } },
    { num: 3, gen: 0, value: { type: 'dict', entries: {
        Type: { type: 'name', value: 'Page' },
        Parent: { type: 'ref', num: 2, gen: 0 },
        MediaBox: { type: 'array', items: [0, 0, 595, 842].map(v => ({ type: 'int', value: v })) }
    } } }
];

/**
 * A PDF 1.5 hybrid-reference file (§7.5.8.4): a classical table for
 * objects 0-4 whose trailer's /XRefStm points at an uncompressed companion
 * xref stream (object 4) listing object 5.
 */
function hybridBase() {
    const te = new TextEncoder();
    let head = '%PDF-1.5\n';
    const off = [];
    const add = (num, body) => { off[num] = head.length; head += `${num} 0 obj\n${body}\nendobj\n`; };
    add(1, CATALOG);
    add(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    add(3, PAGE);
    add(5, '<< /Hybrid true >>');
    off[4] = head.length;
    const data = new Uint8Array([1, (off[5] >> 8) & 0xFF, off[5] & 0xFF, 0]);
    const streamHead = te.encode('4 0 obj\n<< /Type /XRef /Size 6 /W [1 2 1] /Index [5 1] /Length 4 >>\nstream\n');
    const streamTail = '\nendstream\nendobj\n';
    const xrefAt = off[4] + streamHead.length + data.length + streamTail.length;
    const tail = streamTail
        + 'xref\n0 5\n0000000000 65535 f \n'
        + [1, 2, 3, 4].map(n => `${String(off[n]).padStart(10, '0')} 00000 n \n`).join('')
        + `trailer\n<< /Size 6 /Root 1 0 R /XRefStm ${off[4]} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    const parts = [te.encode(head), streamHead, data, te.encode(tail)];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

describe('appendIncremental — BL-1533: the update takes the form of the base\'s newest section', () => {
    test('classical base → classical update, byte-identical to the writer before BL-1533', () => {
        const base = classicalGoldenBase();
        const out = appendIncremental(base, { updates: GOLDEN_UPDATES });
        // Recorded 2026-09-23 by running HEAD's incrementalWriter.js (pre
        // task 06) on this exact base and these updates.
        expect(base.length).toBe(476);
        expect(latin1(out.subarray(base.length))).toBe(
            '\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n'
            + '5 0 obj\n<< /Type /Metadata >>\nendobj\n'
            + 'xref\n0 1\n0000000000 65535 f \n3 1\n0000000477 00000 n \n5 1\n0000000548 00000 n \n'
            + 'trailer\n<< /Size 6 /Root 1 0 R /Info 4 0 R /ID [<00112233445566778899AABBCCDDEEFF>'
            + '<00112233445566778899AABBCCDDEEFF>] /Prev 226 >>\nstartxref\n585\n%%EOF\n');
        expect(out.subarray(0, base.length)).toEqual(base);
        expect(readDocument(out).xref.sections.map(s => s.kind)).toEqual(['table', 'table']);
    });

    test('xref-stream base → xref-stream update with /Prev; re-read finds base + appended objects', () => {
        // Committed task-01 fixture: two xref streams, /Root only in the
        // OLDER one — the writer must merge the chain to find it.
        const base = fixtureBytes('xref-stream-update-missing-root.pdf');
        const before = readDocument(base);
        const newNum = before.trailer.size;
        const out = appendIncremental(base, { updates: [
            { num: newNum, gen: 0, value: { type: 'dict', entries: { Probe: { type: 'int', value: 42 } } } }
        ] });
        expect(out.subarray(0, base.length)).toEqual(base);

        const tail = latin1(out.subarray(base.length));
        expect(/(^|\n)xref\n/.test(tail)).toBe(false);   // no classical table…
        expect(tail).not.toContain('trailer');            // …and no trailer keyword
        const xrefNum = newNum + 1;
        expect(tail).toContain(`${xrefNum} 0 obj\n<< /Type /XRef /Size ${xrefNum + 1} /W [`);
        expect(tail).toContain(`/Index [0 1 ${newNum} 2]`);
        expect(tail).toContain('/Root 1 0 R');
        expect(tail).toContain(`/Prev ${before.xref.sections[0].at} `);

        const doc = readDocument(out);
        expect(doc.xref.sections.map(s => s.kind)).toEqual(['stream', 'stream', 'stream']);
        expect(doc.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(doc.trailer.size).toBe(xrefNum + 1);
        expect(doc.trailer.prev).toBe(before.xref.sections[0].at);
        expect(doc.pages.length).toBe(before.pages.length);
        expect(doc.losses).toEqual([]);
        // appended object reachable…
        expect(doc._raw.resolve({ type: 'ref', num: newNum, gen: 0 }))
            .toEqual({ type: 'dict', entries: { Probe: { type: 'int', value: 42 } } });
        // …and every base object still resolves to what it was.
        for (const k of Object.keys(before.xref.entries)) {
            const e = before.xref.entries[k];
            if (e.free) continue;
            const ref = { type: 'ref', num: Number(k), gen: e.gen | 0 };
            expect(doc._raw.resolve(ref)).toEqual(before._raw.resolve(ref));
        }
    });

    test('xref-stream base: replacing an existing object wins over the base entry', () => {
        const base = fixtureBytes('xref-stream-update-missing-root.pdf');
        const before = readDocument(base);
        const catalog = before._raw.resolve({ type: 'ref', num: 1, gen: 0 });
        const updated = { type: 'dict', entries: { ...catalog.entries,
            Lang: { type: 'string', value: new TextEncoder().encode('en'), syntax: 'literal' } } };
        const out = appendIncremental(base, { updates: [{ num: 1, gen: 0, value: updated }] });
        const doc = readDocument(out);
        expect(doc._raw.resolve({ type: 'ref', num: 1, gen: 0 }).entries.Lang).toBeDefined();
        expect(doc.pages.length).toBe(1);
    });

    // Owner ruling R1 (office/BATCH_41 _RULINGS_20260922, BL-1552):
    // hybrid-reference bases are REFUSED — no hybrid support.
    test('refusal — a hybrid-reference base (/XRefStm) is refused with a named message, nothing written', () => {
        const base = hybridBase();
        // The fixture really is a hybrid file the reader accepts.
        const doc = readDocument(base);
        expect(doc.xref.sections.map(s => s.kind)).toEqual(['table', 'stream']);
        expect(doc._raw.resolve({ type: 'ref', num: 5, gen: 0 }).entries.Hybrid)
            .toEqual({ type: 'bool', value: true });

        const copy = new Uint8Array(base);
        let out;
        const result = codeAndMessageOf(() => {
            out = appendIncremental(base, { updates: GOLDEN_UPDATES });
        });
        expect(out).toBeUndefined();
        expect(base).toEqual(copy);
        expect(result.code).toBe('pdf/incremental/hybrid-base');
        expect(result.message).toContain('refuses a hybrid-reference base');
        expect(result.message).toContain('/XRefStm');
    });

    test('refusal — startxref designating neither form is refused with a DIFFERENT named message', () => {
        const base = classicalGoldenBase();
        const text = latin1(base);
        // Re-point startxref at the catalog object: neither a table nor an
        // xref stream. (Before BL-1533 this silently chained a table to it.)
        const broken = new TextEncoder().encode(
            text.replace(/startxref\n\d+\n/, 'startxref\n9\n'));
        const result = codeAndMessageOf(() => appendIncremental(broken, {
            updates: GOLDEN_UPDATES, root: { num: 1, gen: 0 }
        }));
        expect(result.code).toBe('pdf/incremental/unsupported-base');
        expect(result.message).toContain('neither a classical xref table nor a /Type /XRef');
    });

    const corpus = getAnssiCorpus();
    // Measured 2026-09-23: zero-trust is LINEARIZED — two /Type /XRef
    // streams, /Root only in the first-page one startxref designates.
    // Before task 06 this threw pdf/incremental/no-root.
    test.skipIf(!corpus.present)(
        'opt-in — an incremental update over anssi-fondamentaux-zero-trust-v1.0.pdf',
        () => {
            const base = new Uint8Array(readFileSync(corpus.docs.zeroTrust));
            const before = readDocument(base);
            const newNum = before.trailer.size;
            const out = appendIncremental(base, { updates: [
                { num: newNum, gen: 0, value: { type: 'dict', entries: { Probe: { type: 'int', value: 7 } } } }
            ] });
            const doc = readDocument(out);
            expect(doc.xref.sections.map(s => s.kind)).toEqual(['stream', 'stream', 'stream']);
            expect(doc.trailer.root).toEqual(before.trailer.root);
            expect(doc.trailer.root.num).toBe(114);
            expect(doc.trailer.size).toBe(newNum + 2);
            expect(doc.pages.length).toBe(34);
            expect(doc.losses).toEqual([]);
            expect(doc._raw.resolve({ type: 'ref', num: newNum, gen: 0 }).entries.Probe.value).toBe(7);
        }
    );
});

describe('anssi-corpus helper — skip contract', () => {
    test('a nonexistent directory reports present:false and an empty docs map', () => {
        const corpus = getAnssiCorpus({ dir: '../../../../../../this-directory-does-not-exist' });
        expect(corpus.present).toBe(false);
        expect(corpus.docs).toEqual({});
    });

    // No assertion here pins `present: true` for the real (default)
    // directory — a fresh clone has no `references/ANSSI/` and must stay
    // green on this file. When the corpus IS present, the opt-in legs
    // above prove it by not appearing in the `skip` count. `ANSSI_DOCS`
    // stays imported for the id list the opt-in legs key off of.
    test('the id set is stable regardless of presence', () => {
        expect(Object.keys(ANSSI_DOCS).sort()).toEqual(['mecanismes', 'selectionCrypto', 'zeroTrust']);
    });
});
