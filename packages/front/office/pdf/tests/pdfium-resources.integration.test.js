// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The vendored pdfium test files (`_fixtures/pdfium/`): the
 * PDFs of pdfium's `testing/resources` generated from a `.in` template,
 * many of them deliberately damaged (bug reproducers), read through the
 * base reader as a consumer would.
 *
 * Two layers:
 *   1. Integrity — every `MANIFEST.json` entry is on disk with its byte
 *      count, SHA-256 and git blob id, and nothing unlisted.
 *   2. Robustness — per file, `read` then every content stream of every
 *      page resolved, decoded and parsed to operators either returns or
 *      throws a typed `pdf/…` error, never anything else; the files the
 *      reader refuses are pinned with their code (`REFUSED`), so a change
 *      of behaviour shows here.
 *
 * Time and memory are not asserted here (they belong to the robustness
 * lane of `tools/office-scorecard`, one process per file).
 *
 * @module pdf/tests/pdfium-resources.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const DIR = fileURLToPath(new URL('_fixtures/pdfium/', import.meta.url));
const FILES = join(DIR, 'files');
const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules) rt.register(m);
const api = rt.resolve('pdf');
const filters = rt.resolve('pdfFilterDispatch');
const content = rt.resolve('pdfContentStream');

const bytesOf = (rel) => new Uint8Array(readFileSync(join(FILES, ...rel.split('/'))));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blobId = (bytes) => createHash('sha1').update(`blob ${bytes.length}`).update(new Uint8Array([0])).update(bytes).digest('hex');

/** The files the reader refuses, with the typed code it throws. */
const REFUSED = {
    'bad_page_type.pdf': 'pdf/pages/missing-kids',
    'bookmarks_circular.pdf': 'pdf/parser/stream/expected-endstream',
    'bug_113.pdf': 'pdf/xref/bad-digit',
    'bug_1139.pdf': 'pdf/content/unknown-op',
    'bug_1229106.pdf': 'pdf/pages/cycle',
    'bug_1265.pdf': 'pdf/xref/no-trailer',
    'bug_1301.pdf': 'pdf/document/no-startxref',
    'bug_1324189.pdf': 'pdf/tokenizer/bad-hex',
    'bug_1324503.pdf': 'pdf/tokenizer/bad-hex',
    'bug_1506.pdf': 'pdf/pages/cycle',
    'bug_216.pdf': 'pdf/document/no-startxref',
    'bug_298.pdf': 'pdf/parser/unexpected-keyword',
    'bug_42270471.pdf': 'pdf/parser/indirect-bad-num',
    'bug_452455.pdf': 'pdf/trailer/missing-size',
    'bug_454695.pdf': 'pdf/catalog/not-dict',
    'bug_459580.pdf': 'pdf/trailer/missing-size',
    'bug_481363.pdf': 'pdf/parser/dict-key-not-name',
    'bug_487928.pdf': 'pdf/trailer/missing-size',
    'bug_544880.pdf': 'pdf/pages/cycle',
    'bug_551248.pdf': 'pdf/trailer/missing-size',
    'bug_552046.pdf': 'pdf/content/unknown-op',
    'bug_57.pdf': 'pdf/parser/indirect-missing-endobj',
    'bug_620428.pdf': 'pdf/trailer/missing-size',
    'bug_634394.pdf': 'pdf/trailer/missing-size',
    'bug_634716.pdf': 'pdf/trailer/missing-size',
    'bug_644.pdf': 'pdf/parser/indirect-bad-num',
    'bug_664284.pdf': 'pdf/parser/indirect-bad-num',
    'bug_679649.pdf': 'pdf/parser/indirect-bad-num',
    'bug_680376.pdf': 'pdf/pages/cycle',
    'bug_709793.pdf': 'pdf/trailer/missing-size',
    'bug_900552.pdf': 'pdf/parser/indirect-missing-endobj',
    'bug_901654.pdf': 'pdf/parser/indirect-missing-endobj',
    'bug_901654_2.pdf': 'pdf/parser/indirect-missing-endobj',
    'bug_905142.pdf': 'pdf/flate/inflate-failed',
    'circular_viewer_ref.pdf': 'pdf/catalog/missing-pages',
    'form_object.pdf': 'pdf/parser/stream/expected-endstream',
    'hello_world_2_pages_split_streams.pdf': 'pdf/parser/indirect-missing-endobj',
    'hello_world_brotli.pdf': 'pdf/filter/unsupported',
    'hello_world_brotli_with_length1.pdf': 'pdf/filter/unsupported',
    'js.pdf': 'pdf/parser/indirect-missing-obj',
    'many_rectangles_brotli.pdf': 'pdf/filter/unsupported',
    'named_dests.pdf': 'pdf/parser/stream/expected-endstream',
    'no_page_count.pdf': 'pdf/pages/cycle',
    'rectangles_brotli.pdf': 'pdf/filter/unsupported',
    'repeat_viewer_ref.pdf': 'pdf/parser/dict-key-not-name',
    'tagged_actual_text.pdf': 'pdf/content/unknown-op',
    'tagged_alt_text.pdf': 'pdf/content/unknown-op',
    'tagged_table.pdf': 'pdf/content/unknown-op',
    'tagged_table_bad_elem.pdf': 'pdf/content/unknown-op',
    'tagged_table_bad_parent.pdf': 'pdf/content/unknown-op',
    'trailer_as_hexstring.pdf': 'pdf/xref/trailer-not-dict',
    'trailer_unterminated.pdf': 'pdf/parser/dict-key-not-name',
    'viewer_ref.pdf': 'pdf/pages/cycle',
    'xfa/xfa_break_before_after.pdf': 'pdf/document/no-startxref',
    'zero_length_stream.pdf': 'pdf/parser/indirect-missing-endobj',
};

/** `read`, then every page's content streams decoded and parsed (the consumer path). */
function readContent(bytes) {
    const doc = api.read(bytes);
    let ops = 0;
    for (const page of doc.pages) {
        for (const ref of page.contents) {
            const stream = doc._raw.resolve({ type: 'ref', num: ref.num, gen: ref.gen });
            if (stream?.type !== 'stream') continue;
            ops += content.parseContentStream(filters.decodeStream(stream, filters.decoders)).length;
        }
    }
    return ops;
}

/** What `readContent` gives a file: `'returned'`, or the code of a typed refusal; anything else is rethrown. */
function outcome(bytes) {
    try {
        readContent(bytes);
        return 'returned';
    } catch (e) {
        if (typeof e?.code === 'string' && e.code.startsWith('pdf/')) return e.code;
        throw e;
    }
}

function listFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            const p = join(d, name);
            if (statSync(p).isDirectory()) walk(p);
            else out.push(relative(FILES, p).split('\\').join('/'));
        }
    };
    walk(dir);
    return out.sort();
}

describe('pdfium testing/resources — integrity', () => {
    test('the manifest pins a commit, its tree listing and the selection rule', () => {
        expect(manifest.ref).toMatch(/^[0-9a-f]{40}$/);
        expect(manifest.listing).toContain(manifest.ref);
        expect(manifest.listingSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(manifest.rule).toContain('.in template');
        expect(manifest.files.length).toBe(239);
        expect(manifest.excluded.length).toBe(104);
    });

    test('every listed file is on disk with its byte count, SHA-256 and blob id; nothing unlisted', () => {
        for (const f of manifest.files) {
            const b = bytesOf(f.path);
            expect(b.length).toBe(f.bytes);
            expect(sha256(b)).toBe(f.sha256);
            expect(blobId(b)).toBe(f.blob);
        }
        expect(listFiles(FILES)).toEqual(manifest.files.map((f) => f.path));
    });

    test('the upstream licence travels with the files, as pinned', () => {
        const lic = new Uint8Array(readFileSync(join(DIR, manifest.upstreamLicense.path)));
        expect(lic.length).toBe(manifest.upstreamLicense.bytes);
        expect(sha256(lic)).toBe(manifest.upstreamLicense.sha256);
        expect(manifest.licence).toBe('BSD-3-Clause');
    });

    test('every pinned refusal names a vendored file', () => {
        const paths = new Set(manifest.files.map((f) => f.path));
        for (const p of Object.keys(REFUSED)) expect(paths.has(p)).toBe(true);
    });
});

describe('pdfium testing/resources — read and content parse return or refuse typed', () => {
    for (const f of manifest.files) {
        test(f.path, () => {
            expect(outcome(bytesOf(f.path))).toBe(REFUSED[f.path] ?? 'returned');
        });
    }
});
