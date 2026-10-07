// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pdfWriterRuntime, corpusBytes, CORPUS_PDF, CORPUS_DIR } from './_test-runtime.js';
import { oconvPdfLinebreak } from './linebreak.js';
import { oconvPdfMetrics } from './metrics.js';
import { oconvPdfBox } from './box.js';

/* global Bun */

// --- descriptor-only runtime (mirrors box.test.js: the linebreaker is
// pure/dependency-free, but is still resolved through a real ModuleRuntime
// since the descriptor shape — name/dependencies/factory arity — is part of
// what this suite pins, task 07 registering it by name). -------------------
let linebreak;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.register(oconvPdfLinebreak);
    linebreak = runtime.resolve('oconvPdfLinebreak');
});

// --- a second, full runtime for the corpus/style-routing tests, which need
// the real metrics + box + md-to-ir modules alongside the linebreaker. -----
const full = pdfWriterRuntime([oconvPdfMetrics, oconvPdfBox, oconvPdfLinebreak]);
const metrics = full.resolve('oconvPdfMetrics');
const box = full.resolve('oconvPdfBox');
const { mdToIr } = full.resolve('oconvMdToIr');
const lb = full.resolve('oconvPdfLinebreak');

/** A run node builder — every field `styleOfRun`/`tokenize` reads. */
function run(text, flags) {
    return { kind: 'run', text, bold: false, italic: false, strike: false, code: false, link: null, ...flags };
}

const s14 = metrics.createMeasurer();
const REFERENCE_SIZE = 11;

describe('oconvPdfLinebreak — descriptor', () => {
    test('is a pure, dependency-free module descriptor', () => {
        expect(oconvPdfLinebreak.name).toBe('oconvPdfLinebreak');
        expect(oconvPdfLinebreak.dependencies).toEqual([]);
        expect(typeof oconvPdfLinebreak.factory).toBe('function');
    });

    test('publishes the four-member API', () => {
        expect(Object.keys(linebreak).sort())
            .toEqual(['breakInlines', 'greedyBreak', 'lineText', 'tokenize']);
    });
});

describe('tokenize — style routing', () => {
    test('style is resolved per run exactly like oconvPdfMetrics.styleOfRun', () => {
        const inlines = [
            run('a ', {}),
            run('b ', { bold: true }),
            run('c ', { italic: true }),
            run('d ', { bold: true, italic: true }),
            run('e', { code: true })
        ];
        const tokens = linebreak.tokenize(inlines, s14, REFERENCE_SIZE);
        const words = tokens.filter((t) => t.kind === 'word');
        expect(words.map((t) => t.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(words.map((t) => t.style))
            .toEqual(['regular', 'bold', 'italic', 'boldItalic', 'code']);
    });

    test('a `styleOverride` forces every token, ignoring the run\'s own flags', () => {
        const inlines = [run('plain'), run('bold', { bold: true })];
        const tokens = linebreak.tokenize(inlines, s14, REFERENCE_SIZE, 'italic');
        expect(tokens.every((t) => t.style === 'italic')).toBe(true);
    });

    test('every token carries its width, measured by the supplied measurer', () => {
        const tokens = linebreak.tokenize([run('Hello')], s14, REFERENCE_SIZE);
        expect(tokens).toHaveLength(1);
        expect(tokens[0].width).toBeCloseTo(s14.widthOf('Hello', 'regular', REFERENCE_SIZE), 9);
    });

    test('link is carried from the run onto its word tokens; null when absent', () => {
        const inlines = [run('see '), run('here', { link: 'https://example.com/x' }), run(' more')];
        const tokens = linebreak.tokenize(inlines, s14, REFERENCE_SIZE);
        const byText = Object.fromEntries(tokens.filter((t) => t.kind === 'word').map((t) => [t.text, t.link]));
        expect(byText.see).toBe(null);
        expect(byText.here).toBe('https://example.com/x');
        expect(byText.more).toBe(null);
    });

    test('run-internal whitespace becomes explicit, collapsed space tokens', () => {
        const tokens = linebreak.tokenize([run('one   two')], s14, REFERENCE_SIZE);
        expect(tokens.map((t) => [t.kind, t.text])).toEqual([
            ['word', 'one'], ['space', ' '], ['word', 'two']
        ]);
    });

    test('a non-run inline (e.g. an image) is skipped, not thrown on', () => {
        const inlines = [run('before '), { kind: 'image', name: 'x.png', alt: 'X' }, run('after')];
        const tokens = linebreak.tokenize(inlines, s14, REFERENCE_SIZE);
        expect(tokens.map((t) => t.text)).toEqual(['before', ' ', 'after']);
    });
});

describe('edge cases (contractual, leg B.2)', () => {
    test('empty inlines → lines: []', () => {
        const tokens = linebreak.tokenize([], s14, REFERENCE_SIZE);
        expect(tokens).toEqual([]);
        expect(linebreak.greedyBreak(tokens, 200).lines).toEqual([]);
    });

    test('an empty run text → lines: []', () => {
        const tokens = linebreak.tokenize([run('')], s14, REFERENCE_SIZE);
        expect(tokens).toEqual([]);
        expect(linebreak.greedyBreak(tokens, 200).lines).toEqual([]);
    });

    test('a single word → one line', () => {
        const tokens = linebreak.tokenize([run('Hello')], s14, REFERENCE_SIZE);
        const { lines, overflowLines } = linebreak.greedyBreak(tokens, 200);
        expect(lines).toHaveLength(1);
        expect(lines[0].tokens).toHaveLength(1);
        expect(lines[0].overflow).toBe(false);
        expect(overflowLines).toBe(0);
    });

    test('all-spaces → []', () => {
        const tokens = linebreak.tokenize([run('   ')], s14, REFERENCE_SIZE);
        expect(linebreak.greedyBreak(tokens, 200).lines).toEqual([]);
    });

    test('one oversized token → one overflowing line', () => {
        const huge = 'X'.repeat(200);
        const tokens = linebreak.tokenize([run(huge)], s14, REFERENCE_SIZE);
        const { lines, overflowLines } = linebreak.greedyBreak(tokens, 100);
        expect(lines).toHaveLength(1);
        expect(lines[0].tokens).toHaveLength(1);
        expect(lines[0].overflow).toBe(true);
        expect(lines[0].width).toBeGreaterThan(100);
        expect(overflowLines).toBe(1);
    });

    test('monotonicity — a 480pt column yields strictly fewer lines than 200pt on the same input', () => {
        const text = Array(60).fill('lorem').join(' ');
        const tokens = linebreak.tokenize([run(text)], s14, REFERENCE_SIZE);
        const wide = linebreak.greedyBreak(tokens, 480);
        const narrow = linebreak.greedyBreak(tokens, 200);
        expect(wide.lines.length).toBeLessThan(narrow.lines.length);
        expect(wide.overflowLines).toBe(0);
        expect(narrow.overflowLines).toBe(0);
    });
});

describe('greedyBreak — line composition', () => {
    test('leading spaces are dropped and trailing spaces never count', () => {
        const tokens = linebreak.tokenize([run('  Hello World  ')], s14, REFERENCE_SIZE);
        const { lines } = linebreak.greedyBreak(tokens, 500);
        expect(lines).toHaveLength(1);
        expect(lines[0].tokens[0].kind).toBe('word');
        expect(lines[0].tokens[0].text).toBe('Hello');
        expect(lines[0].tokens[lines[0].tokens.length - 1].kind).toBe('word');
        const expectedWidth = s14.widthOf('Hello', 'regular', REFERENCE_SIZE)
            + s14.widthOf(' ', 'regular', REFERENCE_SIZE)
            + s14.widthOf('World', 'regular', REFERENCE_SIZE);
        expect(lines[0].width).toBeCloseTo(expectedWidth, 9);
    });

    test('a word that does not fit starts a fresh line, dropping the space between', () => {
        const w = (t) => s14.widthOf(t, 'regular', REFERENCE_SIZE);
        const columnPt = w('one') + w(' ') + w('two') - 0.001; // just short of fitting 'two'
        const tokens = linebreak.tokenize([run('one two')], s14, REFERENCE_SIZE);
        const { lines } = linebreak.greedyBreak(tokens, columnPt);
        expect(lines).toHaveLength(2);
        expect(linebreak.lineText(lines[0])).toBe('one');
        expect(linebreak.lineText(lines[1])).toBe('two');
    });
});

describe('lineText', () => {
    test('renders a line back to plain text, spaces included', () => {
        const tokens = linebreak.tokenize([run('one two three')], s14, REFERENCE_SIZE);
        const { lines } = linebreak.greedyBreak(tokens, 1000);
        expect(linebreak.lineText(lines[0])).toBe('one two three');
    });
});

describe('breakInlines — losses', () => {
    test('no loss when nothing overflows', () => {
        const { lines, losses } = linebreak.breakInlines([run('short line')], s14, REFERENCE_SIZE, 500);
        expect(lines.every((l) => !l.overflow)).toBe(true);
        expect(losses).toEqual([]);
    });

    test('the synthetic planted 171-char token — exactly one overflow line, one token, one loss', () => {
        const planted = 'A'.repeat(171);
        const { lines, losses } = linebreak.breakInlines([run(planted)], s14, REFERENCE_SIZE, 480);
        const overflowing = lines.filter((l) => l.overflow);
        expect(overflowing).toHaveLength(1);
        expect(overflowing[0].tokens).toHaveLength(1);
        expect(losses).toHaveLength(1);
        expect(losses[0]).toEqual({
            code: 'layout/line-overflow',
            detail: {
                tokens: 1,
                width: overflowing[0].width,
                column: 480,
                text: planted.slice(0, 40)
            }
        });
    });

    test('one loss PER overflowing line, in order', () => {
        const inlines = [run('A'.repeat(171)), run(' '), run('short'), run(' '), run('B'.repeat(171))];
        const { lines, losses } = linebreak.breakInlines(inlines, s14, REFERENCE_SIZE, 480);
        const overflowing = lines.filter((l) => l.overflow);
        expect(overflowing).toHaveLength(2);
        expect(losses).toHaveLength(2);
        expect(losses.map((l) => l.detail.text)).toEqual(['A'.repeat(40), 'B'.repeat(40)]);
    });

    test('`styleOverride` is threaded through to every token', () => {
        const { lines } = linebreak.breakInlines([run('mono text', { bold: true })], s14, REFERENCE_SIZE, 500, 'code');
        expect(lines[0].tokens.every((t) => t.style === 'code')).toBe(true);
    });
});

describe('breakInlines — recorded inline drops', () => {
    test('a struck run → ONE `inline/strike-dropped` record carrying `runs` and the run text', () => {
        const { losses } = linebreak.breakInlines(
            [run('before '), run('struck text', { strike: true }), run(' after')], s14, REFERENCE_SIZE, 500);
        expect(losses).toEqual([
            { code: 'inline/strike-dropped', detail: { runs: 1, text: 'struck text' } }
        ]);
    });

    test('two struck runs → one record, `runs: 2`, text of the FIRST', () => {
        const { losses } = linebreak.breakInlines(
            [run('first', { strike: true }), run(' mid '), run('second', { strike: true })], s14, REFERENCE_SIZE, 500);
        expect(losses).toEqual([
            { code: 'inline/strike-dropped', detail: { runs: 2, text: 'first' } }
        ]);
    });

    test('the recorded text is truncated to 40 characters', () => {
        const long = 'S'.repeat(60);
        const { losses } = linebreak.breakInlines([run(long, { strike: true })], s14, REFERENCE_SIZE, 1e6);
        expect(losses).toEqual([
            { code: 'inline/strike-dropped', detail: { runs: 1, text: 'S'.repeat(40) } }
        ]);
    });

    test('code + italic → ONE `inline/code-emphasis-dropped` record', () => {
        const { losses } = linebreak.breakInlines(
            [run('see '), run('mono', { code: true, italic: true })], s14, REFERENCE_SIZE, 500);
        expect(losses).toEqual([
            { code: 'inline/code-emphasis-dropped', detail: { runs: 1, text: 'mono' } }
        ]);
    });

    test('code + bold → `inline/code-emphasis-dropped`; two such runs count `runs: 2`', () => {
        const { losses } = linebreak.breakInlines(
            [run('a', { code: true, bold: true }), run(' '), run('b', { code: true, bold: true, italic: true })],
            s14, REFERENCE_SIZE, 500);
        expect(losses).toEqual([
            { code: 'inline/code-emphasis-dropped', detail: { runs: 2, text: 'a' } }
        ]);
    });

    test('code alone and bold alone record nothing', () => {
        const codeOnly = linebreak.breakInlines([run('mono', { code: true })], s14, REFERENCE_SIZE, 500);
        const boldOnly = linebreak.breakInlines([run('heavy', { bold: true })], s14, REFERENCE_SIZE, 500);
        const italicOnly = linebreak.breakInlines([run('slant', { italic: true })], s14, REFERENCE_SIZE, 500);
        expect(codeOnly.losses).toEqual([]);
        expect(boldOnly.losses).toEqual([]);
        expect(italicOnly.losses).toEqual([]);
    });

    test('a non-run inline is ignored by the scan', () => {
        const { losses } = linebreak.breakInlines(
            [{ kind: 'image', name: 'x.png', alt: 'X', strike: true, code: true, bold: true }, run('text')],
            s14, REFERENCE_SIZE, 500);
        expect(losses).toEqual([]);
    });

    test('with a `styleOverride` the records still fire (they describe the runs, not the drawn class)', () => {
        const { lines, losses } = linebreak.breakInlines(
            [run('gone', { strike: true }), run(' '), run('mono', { code: true, bold: true })],
            s14, REFERENCE_SIZE, 500, 'italic');
        expect(lines[0].tokens.every((t) => t.style === 'italic')).toBe(true);
        expect(losses).toEqual([
            { code: 'inline/strike-dropped', detail: { runs: 1, text: 'gone' } },
            { code: 'inline/code-emphasis-dropped', detail: { runs: 1, text: 'mono' } }
        ]);
    });

    test('order: overflow records first, then strike, then code-emphasis', () => {
        const planted = 'A'.repeat(171);
        const { lines, losses } = linebreak.breakInlines(
            [run('mono', { code: true, italic: true }), run(' '), run(planted, { strike: true })],
            s14, REFERENCE_SIZE, 480);
        const overflowing = lines.filter((l) => l.overflow);
        expect(overflowing).toHaveLength(1);
        expect(losses).toEqual([
            {
                code: 'layout/line-overflow',
                detail: { tokens: 1, width: overflowing[0].width, column: 480, text: planted.slice(0, 40) }
            },
            { code: 'inline/strike-dropped', detail: { runs: 1, text: planted.slice(0, 40) } },
            { code: 'inline/code-emphasis-dropped', detail: { runs: 1, text: 'mono' } }
        ]);
    });

    test('recording changes nothing drawn: tokens and lines are identical to the unflagged runs', () => {
        const flagged = [run('one '), run('two', { strike: true }), run(' '), run('three', { code: true, bold: true })];
        const plain = [run('one '), run('two'), run(' '), run('three', { code: true })];
        const a = linebreak.breakInlines(flagged, s14, REFERENCE_SIZE, 500);
        const b = linebreak.breakInlines(plain, s14, REFERENCE_SIZE, 500);
        expect(a.lines).toEqual(b.lines);
        expect(b.losses).toEqual([]);
        expect(a.losses.map((l) => l.code)).toEqual(['inline/strike-dropped', 'inline/code-emphasis-dropped']);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Style routing on the EMBEDDED provider (corpus Calibri — test-only mining
// recipe, as in task 04's metrics.test.js; src/ never mines a PDF for a font).
// ─────────────────────────────────────────────────────────────────────────

/** PostScript name → style class, for the faces the corpus PDF carries. */
const STYLE_BY_PSNAME = {
    'Calibri':            'regular',
    'Calibri-Bold':       'bold',
    'Calibri-Italic':     'italic',
    'Calibri-BoldItalic': 'boldItalic'
};

/**
 * @param {object} rt
 * @param {Uint8Array} pdfBytes
 * @returns {Object<string, Uint8Array>} Style class → font program bytes.
 */
function embeddedFontBytesFromPdf(rt, pdfBytes) {
    const pdf = rt.resolve('pdf');
    const dispatch = rt.resolve('pdfFilterDispatch');
    const fontsMod = rt.resolve('fonts');

    const doc = pdf.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => (o && o.type === 'ref') ? resolveRef(o) : o;

    const out = {};
    for (const page of doc.pages) {
        const res = deref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = deref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const fontDict = deref(fontRes.entries[key]);
            let descriptor = fontDict.entries.FontDescriptor
                ? deref(fontDict.entries.FontDescriptor) : null;
            if (!descriptor && fontDict.entries.DescendantFonts) {
                const df = deref(deref(fontDict.entries.DescendantFonts).items[0]);
                descriptor = df.entries.FontDescriptor ? deref(df.entries.FontDescriptor) : null;
            }
            if (!descriptor || !descriptor.entries.FontFile2) continue;
            const program = dispatch.decode(deref(descriptor.entries.FontFile2), resolveRef);
            const style = STYLE_BY_PSNAME[fontsMod.read(program).names.postScriptName];
            if (style && !out[style]) out[style] = program;
        }
    }
    return out;
}

let mixed;

beforeAll(async () => {
    const corpusFonts = embeddedFontBytesFromPdf(full, await corpusBytes(CORPUS_PDF));
    mixed = metrics.createMeasurer({ fonts: { ...corpusFonts } });
});

describe('style routing per token — embedded provider (corpus Calibri)', () => {
    test('a bold run measures wider than the same text regular', () => {
        const text = 'The quick brown fox jumps over the lazy dog';
        const regularTokens = lb.tokenize([run(text)], mixed, REFERENCE_SIZE);
        const boldTokens = lb.tokenize([run(text, { bold: true })], mixed, REFERENCE_SIZE);
        const sum = (tokens) => tokens.reduce((n, t) => n + t.width, 0);
        expect(regularTokens.every((t) => t.style === 'regular')).toBe(true);
        expect(boldTokens.every((t) => t.style === 'bold')).toBe(true);
        expect(sum(boldTokens)).toBeGreaterThan(sum(regularTokens));
    });
});

// ─────────────────────────────────────────────────────────────────────────
// The column invariant over the golden corpus (task 05 plan): every
// paragraph/heading `mdToIr` produces, broken at the default box layout's
// column and per-kind type size, yields ZERO overflowing lines.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recursively collect every `heading`/`paragraph` node in an IR tree —
 * their `children` are the only thing this stage tokenizes; a block
 * container's OWN children are walked further, a text block's inline
 * children are not (they hold no nested blocks).
 *
 * @param {object} node
 * @param {object[]} out
 */
function collectTextBlocks(node, out) {
    if (!node) return;
    if (node.kind === 'heading' || node.kind === 'paragraph') {
        out.push(node);
        return;
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) collectTextBlocks(child, out);
    }
}

describe('the column invariant over the golden corpus', () => {
    const layout = box.resolveLayout();
    const fixtures = ['md-structural.md', 'md-nested.md', 'md-degrade.md'];

    test.each(fixtures)('%s — every paragraph/heading has zero overflowing lines', async (name) => {
        const text = await Bun.file(`${CORPUS_DIR}/md/${name}`).text();
        const { ir } = mdToIr(text);
        const blocks = [];
        collectTextBlocks(ir, blocks);
        expect(blocks.length).toBeGreaterThan(0);

        let totalOverflow = 0;
        for (const block of blocks) {
            const sizePt = layout.sizeFor(block.kind, block.level);
            const { losses } = lb.breakInlines(block.children, s14, sizePt, layout.column);
            // Count overflow records only: `md-structural.md`'s struck run
            // records `inline/strike-dropped`, which is not an overflow.
            totalOverflow += losses.filter((l) => l.code === 'layout/line-overflow').length;
        }
        expect(totalOverflow).toBe(0);
    });
});
