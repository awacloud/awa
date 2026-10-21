// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The vendored pdf-differences files (`_fixtures/pdf-differences/`):
 * the PDF Association's test files for features that widely used
 * implementations interpret differently, read through the base reader.
 *
 * Three layers:
 *   1. Integrity — every `MANIFEST.json` entry is on disk with its byte count
 *      and SHA-256, nothing unlisted, and every file is either run (with an
 *      expected return) or skipped (with a reason) — never both, never neither.
 *   2. Expected returns — what the reader must return for each run file
 *      (`EXPECTED`); the two files the reader does not read are pinned as
 *      such, with the reason (no cross-reference reconstruction).
 *   3. Reading — every other file reads and its content streams parse to
 *      operators: a skipped case is skipped because its difference is in
 *      painting, not because the reader fails on it.
 *
 * Only committed bytes are read; the fetched archive is never needed here.
 *
 * @module pdf/tests/pdf-differences.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const DIR = fileURLToPath(new URL('_fixtures/pdf-differences/', import.meta.url));
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

const PAINTING = 'a difference in painting: content streams are parsed to operators, not rendered';
/** Directories whose difference the reader does not model, with the reason. */
const SKIPPED = {
    'Atomic-Fill+Stroke': PAINTING,
    'ColorBurn-ColorDodge': PAINTING,
    'Dashing-Degenerate': PAINTING,
    'Dashing-EndBeforeBend': PAINTING,
    'DefaultColorSpaces': PAINTING,
    'IndexedColor': PAINTING,
    'LargeMitreLimit': PAINTING,
    'LineCap-Degenerate': PAINTING,
    'Negative-DashPhase': PAINTING,
    'NegativeFontSize': PAINTING,
    'OverlappingGlyphClipping': PAINTING,
    'TextClipModeChanges': PAINTING,
    'Type3WordSpacing': PAINTING,
    'VerticalText': PAINTING,
    'PageLabels-UX': 'page labels are carried raw (catalog.pageLabels), never computed',
};

/** The expected return of every run file, by kind (see `check`). */
const EXPECTED = {
    'PDF-version/PDF-versions1.pdf': 'version-pair',
    'PDF-version/PDF-versions2.pdf': 'version-pair',
    'PDF-version/PDF-versions3.pdf': 'version-pair',
    'UnknownFilter/UnknownFilter-xrefstm.pdf': 'refused',
    'UnknownFilter/UnknownFilter-objstm.pdf': 'localised',
    'UnknownFilter/UnknownFilter-PageContentStream.pdf': 'localised',
    'UnknownFilter/UnknownFilter-Font.pdf': 'localised',
    'UnknownFilter/UnknownFilter-ImageXObject.pdf': 'localised',
    'UnknownFilter/UnknownFilter-FormXObject.pdf': 'localised',
    'UnknownFilter/UnknownFilter-ICC.pdf': 'localised',
    'UnknownFilter/UnknownFilter-Linearized.pdf': 'readable',
    'UnknownFilter/UnknownFilter-OutlineObjStm.pdf': 'readable',
    'Inline-Image-Abbreviations/InlineAbbreviations.pdf': 'inline-images',
};

/** The run files the reader does not read, and why it fails on them. */
const KNOWN_MISSES = [
    // The unknown filter sits on the first-page cross-reference stream, the
    // only section that locates the catalog and the page: reaching them
    // needs cross-reference reconstruction, which the reader does not do.
    { path: 'UnknownFilter/UnknownFilter-Linearized.pdf', detail: 'pdf/filter/unsupported' },
    // Upstream, the incremental update's startxref, /XRefStm and xref entry
    // point 20 bytes before their targets; the reader does not search around
    // a wrong offset.
    { path: 'UnknownFilter/UnknownFilter-OutlineObjStm.pdf', detail: 'pdf/parser/indirect-bad-num' },
];

const ref = (num, gen) => ({ type: 'ref', num: Number(num), gen });

/** The page's content stream bytes, decoded. */
function pageContent(doc, page) {
    const out = [];
    for (const r of page.contents) out.push(filters.decodeStream(doc._raw.resolve(ref(r.num, r.gen)), filters.decoders));
    return out;
}

/** Every in-use object resolved, and decoded when it is a stream: the typed failures. */
function objectFailures(doc) {
    const failures = [];
    for (const [num, e] of Object.entries(doc.xref.entries)) {
        if (e.free) continue;
        try {
            const v = doc._raw.resolve(ref(num, e.gen));
            if (v && v.type === 'stream') filters.decodeStream(v, filters.decoders);
        } catch (err) {
            failures.push({ num: Number(num), code: err.code });
        }
    }
    return failures;
}

/** An inline image's data decoded with the abbreviated keys first (ISO 32000-2 8.9.7, as corrected). */
function decodeInline(op) {
    const e = op.args[0].entries;
    const pick = (abbr, full) => (e[abbr] !== undefined ? e[abbr] : e[full]);
    const list = filters.normalizeFilterList(pick('F', 'Filter'));
    const dp = pick('DP', 'DecodeParms');
    const params = list.map((_, i) => {
        const d = dp && dp.type === 'array' ? dp.items[i] : dp;
        if (!d || d.type !== 'dict') return null;
        return Object.fromEntries(Object.entries(d.entries).map(([k, v]) => [k, v.value]));
    });
    return filters.applyDecodeChain(op.data, list, params, filters.decoders);
}

/** Throws unless the reader returns what `kind` expects for `bytes`. */
function check(kind, bytes) {
    if (kind === 'refused') {
        try {
            api.read(bytes);
        } catch (err) {
            if (err.code === 'pdf/filter/unsupported') return;
            throw err;
        }
        throw new Error('read accepted a file it cannot decode');
    }
    const doc = api.read(bytes);
    if (doc.pages.length !== 1) throw new Error(`${doc.pages.length} pages`);
    if (kind === 'version-pair') {
        // The catalog's /Version is a name, typed as its string value.
        if (doc.version !== '1.4' || doc.catalog.version !== '1.6') {
            throw new Error(`version ${doc.version} / catalog ${doc.catalog.version}`);
        }
    } else if (kind === 'localised') {
        const failures = objectFailures(doc);
        if (failures.length === 0) throw new Error('no object failed');
        const untyped = failures.filter((f) => typeof f.code !== 'string' || !f.code.startsWith('pdf/'));
        if (untyped.length > 0) throw new Error(`untyped failure of object ${untyped[0].num}`);
    } else if (kind === 'inline-images') {
        const ops = content.parseContentStream(pageContent(doc, doc.pages[0])[0]);
        const images = ops.filter((o) => o.op === 'BI').map(decodeInline);
        if (images.length !== 8) throw new Error(`${images.length} inline images`);
        const first = sha256(images[0]);
        if (images.some((b) => b.length !== 600 || sha256(b) !== first)) throw new Error('inline images differ');
    }
}

function outcome(rel) {
    try {
        check(EXPECTED[rel], bytesOf(rel));
        return { path: rel, ok: true };
    } catch (err) {
        return { path: rel, ok: false, detail: err.code ?? String(err.message) };
    }
}

/** Every file under `dir`, as sorted POSIX paths relative to `FILES`. */
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(relative(FILES, p).replace(/\\/g, '/'));
    }
    return out;
}

describe('pdf-differences — manifest and integrity', () => {
    test('the manifest names the pinned commit, the CC BY 4.0 licence and the two excluded files', () => {
        expect(manifest.ref).toBe('907fe96e52b73e491489eee545c47b119bf9989b');
        expect(manifest.licence).toBe('CC-BY-4.0');
        expect(manifest.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(manifest.files.length).toBe(35);
        expect(manifest.excluded.map((x) => x.path)).toEqual([
            'UnknownFilter/382252277877c00a92f3bb54daef1413bafe5557e2f5f7c32c23e800cd9bdcd4.pdf',
            'UnknownFilter/4387ba480c6f935b8e97749d40b3c001ad584b7bda66ca2c040be67337669497.pdf',
        ]);
        expect(manifest.files.map((f) => f.path)).toEqual([...manifest.files.map((f) => f.path)].sort());
    });

    test('every file is on disk with its byte count and SHA-256; nothing unlisted', () => {
        expect(existsSync(FILES)).toBe(true);
        const onDisk = walk(FILES).sort();
        const misses = [];
        for (const f of manifest.files) {
            if (!onDisk.includes(f.path)) misses.push(`missing: ${f.path}`);
            else if (sha256(bytesOf(f.path)) !== f.sha256 || bytesOf(f.path).length !== f.bytes) misses.push(`bytes: ${f.path}`);
        }
        const listed = new Set(manifest.files.map((f) => f.path));
        for (const p of onDisk) if (!listed.has(p)) misses.push(`unlisted: ${p}`);
        expect(misses).toEqual([]);
    });

    test('every file is run or skipped, exactly once', () => {
        const unclassified = [];
        const both = [];
        for (const f of manifest.files) {
            const run = Object.hasOwn(EXPECTED, f.path);
            const skipped = Object.hasOwn(SKIPPED, f.path.split('/')[0]);
            if (run && skipped) both.push(f.path);
            if (!run && !skipped) unclassified.push(f.path);
        }
        expect({ unclassified, both }).toEqual({ unclassified: [], both: [] });
        const paths = new Set(manifest.files.map((f) => f.path));
        expect(Object.keys(EXPECTED).filter((p) => !paths.has(p))).toEqual([]);
        // The counts the fixture README states: 13 run, 21 painting files skipped, 1 page-label file.
        const skippedFiles = manifest.files.filter((f) => Object.hasOwn(SKIPPED, f.path.split('/')[0]));
        expect(Object.keys(EXPECTED).length).toBe(13);
        expect(skippedFiles.filter((f) => SKIPPED[f.path.split('/')[0]] === PAINTING).length).toBe(21);
        expect(skippedFiles.length).toBe(22);
    });
});

describe('pdf-differences — expected returns of the run files', () => {
    const outcomes = Object.keys(EXPECTED).map(outcome);

    test('every run file gets its expected return, except the two known misses', () => {
        expect(outcomes.filter((o) => !o.ok).map(({ path, detail }) => ({ path, detail }))).toEqual(KNOWN_MISSES);
    });

    test('negative controls: a wrong expectation is reported', () => {
        expect(() => check('version-pair', bytesOf('UnknownFilter/UnknownFilter-Font.pdf'))).toThrow('version 3.1');
        expect(() => check('localised', bytesOf('PDF-version/PDF-versions1.pdf'))).toThrow('no object failed');
        expect(() => check('refused', bytesOf('PDF-version/PDF-versions1.pdf'))).toThrow('read accepted');
        expect(() => check('inline-images', bytesOf('PDF-version/PDF-versions1.pdf'))).toThrow('0 inline images');
    });

    test('the first inline images keep every key as written, full and abbreviated', () => {
        const doc = api.read(bytesOf('Inline-Image-Abbreviations/InlineAbbreviations.pdf'));
        const ops = content.parseContentStream(pageContent(doc, doc.pages[0])[0]).filter((o) => o.op === 'BI');
        expect(Object.keys(ops[0].args[0].entries)).toContain('Width');
        expect(Object.keys(ops[1].args[0].entries)).toContain('W');
        // Case 3: both forms, with different values — the reader keeps both.
        const third = ops[2].args[0].entries;
        expect(third.W.value).not.toBe(third.Width.value);
    });

    test('upstream page content dictionary is malformed: the object fails before its filter', () => {
        // `<< /Length 108 /Filter /XXXDecode >` then `stream`: one `>` only.
        const doc = api.read(bytesOf('UnknownFilter/UnknownFilter-PageContentStream.pdf'));
        expect(objectFailures(doc).map((f) => f.code)).toEqual(['pdf/tokenizer/unexpected-rangle']);
    });
});

describe('pdf-differences — every other file reads', () => {
    const refusedOnPurpose = new Set(['UnknownFilter/UnknownFilter-xrefstm.pdf', ...KNOWN_MISSES.map((m) => m.path)]);

    test('the skipped and run files read, and every page content parses to operators', () => {
        const failures = [];
        for (const f of manifest.files) {
            if (refusedOnPurpose.has(f.path) || f.path.startsWith('UnknownFilter/')) continue;
            try {
                const doc = api.read(bytesOf(f.path));
                if (doc.pages.length < 1) throw new Error('0 pages');
                for (const page of doc.pages) for (const b of pageContent(doc, page)) content.parseContentStream(b);
            } catch (err) {
                failures.push(`${f.path}: ${err.code ?? err.message}`);
            }
        }
        expect(failures).toEqual([]);
    });
});
