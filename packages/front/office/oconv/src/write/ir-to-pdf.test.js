// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for `oconvIrToPdf` — the `md → pdf` writer facade (F9 tier 2).
 *
 * The centrepiece is the **leg-D round-trip oracle** (design decision D-G):
 * a laid-out document is emitted as a real PDF through `@awacloud/pdf`'s
 * published write surface, read back through `@awacloud/oconv`'s OWN
 * delivered `toMd` pdf path, and the extracted word stream is compared,
 * whitespace-normalised, against the text the stacker actually placed.
 * First-party tools on both ends, and no hand-written expectation of what
 * the typesetter "should" produce.
 *
 * All page counts here are MEASURED on this tree, never inherited from the
 * plan or the spike: the plan's own numbers are marked "re-measure", and the
 * production stack's proportional heading spacing moves them by design (see
 * the 200-paragraph case).
 */
/* global Bun */
import { describe, test, expect, beforeAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { pdfWriterRuntime, corpusBytes, CORPUS_PDF } from './pdf/_test-runtime.js';
import { oconvIrToPdf } from './ir-to-pdf.js';
import { oconvPdfMetrics } from './pdf/metrics.js';
import { oconvPdfRenderCode } from './pdf/render/code.js';

const runtime = pdfWriterRuntime();
const irToPdf = runtime.resolve('oconvIrToPdf');
const stack = runtime.resolve('oconvPdfStack');
const box = runtime.resolve('oconvPdfBox');
const metrics = runtime.resolve('oconvPdfMetrics');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const pdfApi = runtime.resolve('pdf');
const oconvApi = runtime.resolve('oconv');

const AT = '2026-09-02T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures — the spike's corpus shapes, re-declared here (the spike tree is
// throwaway and stays byte-untouched; `src/` never imports from it).
// ---------------------------------------------------------------------------

const LOREM = [
    'The bounded typesetter promises a single column and one page size for the whole document.',
    'Greedy line breaking on spaces keeps the algorithm predictable and the output deterministic.',
    'A hard page break happens whenever the next block does not fit in the remaining vertical space.',
    'Nothing here hyphenates, justifies, controls widows and orphans, or wraps text around a float.',
    'Every dropped or clipped fragment is recorded as an explicit loss rather than vanishing quietly.'
];

/** An `oconv-ir/v1` inline run with the frozen full property set. */
function run(text, flags = {}) {
    return {
        kind: 'run', text, bold: false, italic: false, strike: false,
        code: false, link: null, ...flags
    };
}

/**
 * The ASCII-only prose document the leg-D oracle uses — no markdown-
 * significant character at a line start, so the return leg through
 * `ir-to-md` adds no escapes and the comparison stays exact.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allStyles] Also carry bold and bold-italic runs,
 *   so the embedded route has all four Latin faces to subset.
 */
function emissionDocument(opts = {}) {
    const children = [];
    for (let i = 0; i < 30; i += 1) {
        const line = LOREM[i % LOREM.length];
        const inlines = [run(`Block ${i + 1} opens here. ${line} `), run('emphasis', { italic: true })];
        if (opts.allStyles) {
            inlines.push(run(' '), run('strong', { bold: true }));
            inlines.push(run(' '), run('both', { bold: true, italic: true }));
        }
        inlines.push(run(` and then ${line}`));
        children.push({ kind: 'paragraph', children: inlines });
    }
    return { kind: 'document', children };
}

/**
 * The spike's synthetic document: every style class, headings every fourth
 * paragraph, plus the four leg-B edge cases (empty / single-word /
 * all-spaces paragraph, and one unbreakable token wider than the column).
 *
 * @param {number} paragraphs
 */
function syntheticDocument(paragraphs) {
    const children = [
        { kind: 'heading', level: 1, children: [run('Bounded Typesetter Spike')] },
        {
            kind: 'paragraph',
            children: [
                run('This paragraph mixes '), run('bold text', { bold: true }),
                run(', '), run('italic text', { italic: true }),
                run(', '), run('bold italic', { bold: true, italic: true }),
                run(' and '), run('monospaced code', { code: true }),
                run(' inside one flow so every face is measured with its own metrics.')
            ]
        }
    ];
    for (let i = 0; i < paragraphs; i += 1) {
        const line = LOREM[i % LOREM.length];
        children.push({ kind: 'paragraph', children: [run(`Paragraph ${i + 1}. ${line} ${line}`)] });
        if (i % 4 === 3) {
            children.push({ kind: 'heading', level: 2, children: [run(`Section ${1 + (i >> 2)}`)] });
        }
    }
    children.push({ kind: 'paragraph', children: [] });
    children.push({ kind: 'paragraph', children: [run('Solo')] });
    children.push({ kind: 'paragraph', children: [run('     ')] });
    children.push({ kind: 'paragraph', children: [run('Unbreakable' + 'x'.repeat(160))] });
    return { kind: 'document', children };
}

// ---------------------------------------------------------------------------
// Oracle helpers
// ---------------------------------------------------------------------------

/** `ir-to-md` escape sequences removed, then whitespace-normalised words. */
const ESCAPE = new RegExp(String.fromCharCode(92, 92) + '(.)', 'g');
function words(text) {
    return text.replace(ESCAPE, '$1').split(/\s+/).filter((w) => w !== '');
}

function stripFrontmatter(md) {
    if (!md.startsWith('---')) return md;
    const end = md.indexOf('\n---\n', 3);
    return end === -1 ? md : md.slice(end + 5);
}

/**
 * Lay a document out with the SAME stages the facade composes, so the oracle
 * compares against what was really placed rather than against a guess. The
 * renderer dispatcher is a no-op here: none of these fixtures carries a
 * delegated kind.
 */
function layOut(ir, pdfOpts) {
    const layout = box.resolveLayout(pdfOpts);
    const losses = [];
    const ctx = {
        measurer: metrics.createMeasurer({ fonts: pdfOpts && pdfOpts.fonts }),
        layout,
        column: layout.column,
        sizeFor: layout.sizeFor,
        leading: layout.leading,
        linebreak,
        losses,
        index: null,
        render: () => ({ items: [], losses: [] })
    };
    return stack.layoutDocument(ir, ctx);
}

/** Emit, decode through `oconv.toMd`, return the oracle's raw materials. */
async function roundTrip(bytes, name) {
    const decoded = await oconvApi.toMd({
        bytes, format: 'pdf', name, convertedAt: AT
    });
    const raw = words(stripFrontmatter(decoded.markdown));
    return {
        decoded,
        separators: raw.filter((w) => w === '---').length,
        stream: raw.filter((w) => w !== '---')
    };
}

// ---------------------------------------------------------------------------

describe('oconvIrToPdf — descriptor', () => {
    test('name and declared dependencies are the frozen list', () => {
        // RE-PINNED by office/BATCH_38 task 04 (gate G-OF1): `oconvDefaultFaces`
        // appended LAST. Re-measured, not relaxed — still an exhaustive
        // `toEqual` over the whole list.
        expect(oconvIrToPdf.name).toBe('oconvIrToPdf');
        expect(oconvIrToPdf.dependencies).toEqual([
            'oconvIr',
            'oconvPdfMetrics', 'oconvPdfBox', 'oconvPdfLinebreak', 'oconvPdfStack',
            'oconvPdfRenderText',
            'oconvPdfRenderList', 'oconvPdfRenderCode',
            'oconvPdfRenderTable', 'oconvPdfRenderImage',
            'pdfBuilder', 'pdfFontEmbed', 'fonts',
            'oconvDefaultFaces'
        ]);
    });

    test('the resolved instance exposes exactly `RESOURCE_NAMES` and `irToPdf`', () => {
        expect(Object.keys(irToPdf).sort()).toEqual(['RESOURCE_NAMES', 'irToPdf']);
        expect(Object.keys(irToPdf.RESOURCE_NAMES).sort())
            .toEqual([...metrics.STYLE_CLASSES].sort());
    });
});

// ---------------------------------------------------------------------------
// Leg D — the round-trip oracle (D-G)
// ---------------------------------------------------------------------------

describe('leg D oracle — emit through @awacloud/pdf, decode back through oconv.toMd', () => {
    test('MEASURED — the 30-paragraph document is 3 pages (plan said "3 (re-measure)")', () => {
        expect(irToPdf.irToPdf(emissionDocument()).pages).toBe(3);
    });

    test('ORACLE — the emitted text survives the round trip in order, 1098 words, 0 decode losses', async () => {
        const ir = emissionDocument();
        // Page numbers off so the comparison is EXACT: the number is drawn
        // by the renderer, not placed by the stacker, so it is invisible to
        // `laidOutText` (its effect is asserted in its own test below).
        const opts = { pageNumbers: false };
        const laid = layOut(ir, opts);
        const written = irToPdf.irToPdf(ir, opts);

        expect(written.pages).toBe(laid.pages.length);
        expect(written.pages).toBeGreaterThan(1);
        expect(written.losses).toEqual([]);
        expect(written.bytes.length).toBeGreaterThan(1000);

        const { decoded, separators, stream } = await roundTrip(written.bytes, 'oracle.pdf');
        expect(decoded.losses).toEqual([]);
        // `pdf-to-ir` turns every PAGE BOUNDARY into an IR `hr`, which
        // `ir-to-md` renders as `---`. Added structure, not a decode loss:
        // assert the exact count, then remove the markers.
        expect(separators).toBe(written.pages - 1);

        const expected = words(stack.laidOutText(laid.pages));
        expect(expected.length).toBe(1098);
        expect(stream).toEqual(expected);
    });

    test('FALSIFICATION — dropping one laid-out line before emission reddens the oracle', async () => {
        // The standing control for the test above: without it, an oracle
        // comparing a stream against itself would pass on an emitter that
        // draws nothing.
        //
        // The one-off SOURCE falsification was run too, on 2026-09-02:
        // `render/text.js`'s item loop was temporarily narrowed to
        // `(page.items || []).slice(page.number === 1 ? 1 : 0)` — one laid-out
        // line dropped before emission. Result: BOTH oracles went RED (the
        // Standard 14 one and the embedded-route one), plus the page-number
        // stream test and the unencodable-count test. The mutation was then
        // reverted and the file is byte-identical to its pre-mutation state
        // (`grep` on the loop line + a green re-run). The oracle is therefore
        // sensitive to a single lost line, in both font routes.
        const ir = emissionDocument();
        const opts = { pageNumbers: false };
        const laid = layOut(ir, opts);
        const full = words(stack.laidOutText(laid.pages));

        const mutated = laid.pages.map((p, i) => (
            i === 0 ? { ...p, items: p.items.slice(1) } : p
        ));
        const short = words(stack.laidOutText(mutated));

        expect(short.length).toBeLessThan(full.length);
        expect(short).not.toEqual(full);

        // And the same mutation really does change the emitted bytes: the
        // dropped line's text is gone from the content stream.
        const renderText = runtime.resolve('oconvPdfRenderText');
        const fonts = {};
        for (const style of metrics.STYLE_CLASSES) {
            const m = metrics.createMeasurer();
            fonts[style] = {
                res: irToPdf.RESOURCE_NAMES[style],
                source: 'standard14',
                baseFont: m.face(style).baseFont,
                widthOf: (t, s) => m.widthOf(t, style, s)
            };
        }
        const layout = box.resolveLayout(opts);
        const whole = renderText.pageContent(laid.pages[0], fonts, layout, []);
        const cut = renderText.pageContent(mutated[0], fonts, layout, []);
        expect(cut.bytes.length).toBeLessThan(whole.bytes.length);
    });

    test('MEASURED — the 200-paragraph synthetic is 19 pages, not the spike\'s 17', () => {
        // The plan's "17 pages" is the SPIKE's number and is explicitly
        // marked "(re-measure)". The production stack gives 19: task 06's
        // audit isolated the whole delta to the plan-prescribed proportional
        // heading spacing (1.0 · size before, 0.5 · size after, over 51
        // headings and 205 paragraph gaps) — reverting that one rule alone
        // returns exactly 17. By design, no pathology.
        const written = irToPdf.irToPdf(syntheticDocument(200));
        expect(written.pages).toBe(19);
        // The synthetic's unbreakable token is the ONE expected loss.
        expect(written.losses.map((l) => l.code)).toEqual(['layout/line-overflow']);
    });

    test('the same 200-paragraph document without the edge cases is 18 pages', () => {
        // Pins that the 19 above is not an off-by-one: the four edge-case
        // paragraphs the spike appends are worth exactly one page.
        const doc = syntheticDocument(200);
        doc.children = doc.children.slice(0, doc.children.length - 4);
        expect(irToPdf.irToPdf(doc).pages).toBe(18);
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('oconvIrToPdf — determinism', () => {
    test('two runs produce BYTE-IDENTICAL output', () => {
        const a = irToPdf.irToPdf(emissionDocument()).bytes;
        const b = irToPdf.irToPdf(emissionDocument()).bytes;
        expect(a.length).toBe(b.length);
        expect(a.every((v, i) => v === b[i])).toBe(true);
    });

    test('no date and no /ID reach the file — and the clock-free premise is re-derived, not assumed', async () => {
        const bytes = irToPdf.irToPdf(emissionDocument()).bytes;
        let latin1 = '';
        for (const b of bytes) latin1 += String.fromCharCode(b);
        expect(latin1).not.toContain('/CreationDate');
        expect(latin1).not.toContain('/ModDate');
        expect(latin1).not.toContain('/ID');
        expect(latin1).toContain('/Producer');

        // The upstream half of the property, measured on THIS tree rather
        // than quoted: the plain write path reads no clock and no randomness.
        // Resolved from this file's own location (cwd-independent, BL-1564):
        // `oconv/src/write/` -> `../../../` = `office/`, then the sibling
        // `pdf/src`.
        const root = fileURLToPath(new URL('../../../pdf/src', import.meta.url));
        for (const rel of ['document/builder.js', 'document/writer.js', 'syntax/serializer.js']) {
            const src = await Bun.file(`${root}/${rel}`).text();
            expect(src).not.toContain('Date.now()');
            expect(src).not.toContain('new Date(');
            expect(src).not.toContain('Math.random');
        }
        // The documented EXCEPTION — determinism does NOT extend through the
        // encrypted writer, which `md → pdf` never enters; its randomness is
        // cryptographic only (`crypto.getRandomValues`, never `Math.random`).
        const enc = await Bun.file(`${root}/document/encryptedWriter.js`).text();
        expect(enc).toContain('getRandomValues');
        expect(enc).not.toContain('Math.random');
    });
});

// ---------------------------------------------------------------------------
// Fonts — both routes (D-A)
// ---------------------------------------------------------------------------

/** PostScript name → style class, for the faces the corpus PDF carries. */
const STYLE_BY_PSNAME = {
    'Calibri':            'regular',
    'Calibri-Bold':       'bold',
    'Calibri-Italic':     'italic',
    'Calibri-BoldItalic': 'boldItalic'
};

/**
 * TEST-ONLY corpus recipe (the leg-A recipe, mirrored from
 * `pdf/metrics.test.js`): mine the four embedded Latin faces out of the
 * vendored golden-corpus PDF. `src/` never reaches into a PDF for a font —
 * the embedded route runs on caller-supplied bytes only (D-A).
 */
function embeddedFontBytesFromPdf(rt, pdfBytes) {
    const api = rt.resolve('pdf');
    const dispatch = rt.resolve('pdfFilterDispatch');
    const fontsMod = rt.resolve('fonts');
    const doc = api.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => ((o && o.type === 'ref') ? resolveRef(o) : o);

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

/** How many DISTINCT font objects in `bytes` carry an embedded FontFile2. */
function embeddedFontFileCount(bytes) {
    const doc = pdfApi.read(bytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => ((o && o.type === 'ref') ? resolveRef(o) : o);
    const seen = new Set();
    let count = 0;
    for (const page of doc.pages) {
        const res = deref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = deref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const ref = fontRes.entries[key];
            const id = ref && ref.type === 'ref' ? `${ref.num}.${ref.gen}` : key;
            if (seen.has(id)) continue;
            seen.add(id);
            const dict = deref(ref);
            let descriptor = dict.entries.FontDescriptor
                ? deref(dict.entries.FontDescriptor) : null;
            if (!descriptor && dict.entries.DescendantFonts) {
                const df = deref(deref(dict.entries.DescendantFonts).items[0]);
                descriptor = df.entries.FontDescriptor ? deref(df.entries.FontDescriptor) : null;
            }
            if (descriptor && descriptor.entries.FontFile2) count += 1;
        }
    }
    return { distinct: seen.size, embedded: count };
}

describe('oconvIrToPdf — Standard 14 route (D-A default)', () => {
    test('registers a bare /Font per style class used, and embeds nothing', () => {
        const bytes = irToPdf.irToPdf(emissionDocument()).bytes;
        let latin1 = '';
        for (const b of bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/BaseFont /Helvetica');
        expect(latin1).toContain('/BaseFont /Helvetica-Oblique');
        expect(latin1).not.toContain('/FontFile2');
        expect(embeddedFontFileCount(bytes).embedded).toBe(0);
    });

    test('the pure Standard 14 route records NO font-fallback loss (it is a choice, not a fallback)', () => {
        expect(irToPdf.irToPdf(emissionDocument()).losses).toEqual([]);
    });

    test('an unencodable code point degrades to `?` and is recorded ONCE per document', () => {
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('café 中文 中')] }
        ] };
        const written = irToPdf.irToPdf(ir);
        expect(written.losses).toEqual([{
            code: 'text/unencodable',
            detail: { count: 3, sample: '中文' }
        }]);
        let latin1 = '';
        for (const b of written.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('??');
    });

    test('every Standard 14 font dict names `/Encoding /WinAnsiEncoding` (the CP1252 bytes decode)', () => {
        const written = irToPdf.irToPdf(emissionDocument({ allStyles: true }));
        let latin1 = '';
        for (const b of written.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/Encoding /WinAnsiEncoding');
        // Every font dictionary object (a `/Type /Font` dict; the page
        // objects only REFERENCE fonts) — all of them Standard 14 here.
        const fontDicts = (latin1.match(/\d+ 0 obj\s*<<[^]*?endobj/g) || [])
            .filter((o) => /\/Type \/Font\b/.test(o));
        // MEASURED: one dict per class, shared by the 3 pages — regular,
        // italic, bold, boldItalic (a Standard 14 dict is allocated once per
        // distinct baseFont/subtype/encoding; each page keeps its own
        // resource entry referencing it).
        expect(written.pages).toBe(3);
        expect(fontDicts).toHaveLength(4);
        expect(new Set(fontDicts.map((d) => (d.match(/\/BaseFont \/(\S+)/) || [])[1]))).toEqual(
            new Set(['Helvetica', 'Helvetica-Oblique', 'Helvetica-Bold', 'Helvetica-BoldOblique']));
        for (const dict of fontDicts) {
            expect(dict).toContain('/Subtype /Type1');
            expect(dict).toContain('/Encoding /WinAnsiEncoding');
        }
    });
});
// `metrics.js`'s `styleOfRun` never reads `run.strike`, and it resolves a
// `code` run to the monospace class whatever its `bold`/`italic` flags, so
// neither a strikethrough nor emphasis on monospace text can be drawn on this
// route. The linebreaker RECORDS both (`inline/strike-dropped`,
// `inline/code-emphasis-dropped`) while the drawn bytes stay exactly those of
// the unflagged run: pinned by comparing the SAME text with and without the
// flag — byte-identical output, the ledger the only difference.
// `render/text.js` never reads an item's `link` field (F9 refusal, by design),
// pinned the same way below.
describe('oconvIrToPdf — strikethrough is RECORDED, no rule drawn', () => {
    test('strikethrough is RECORDED, no rule drawn — byte-identical to the plain run, one `inline/strike-dropped` record', () => {
        const struck = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('struck text', { strike: true })] }
        ] };
        const plain = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('struck text')] }
        ] };
        const withStrike = irToPdf.irToPdf(struck);
        const withoutStrike = irToPdf.irToPdf(plain);

        // MEASURED: the stack prefixes the block's `{index, kind}`; the
        // single top-level paragraph is index '0'.
        expect(withStrike.losses).toEqual([
            { index: '0', kind: 'paragraph', code: 'inline/strike-dropped', detail: { runs: 1, text: 'struck text' } }
        ]);
        expect(withoutStrike.losses).toEqual([]);
        expect(withStrike.bytes.length).toBe(withoutStrike.bytes.length);
        expect(withStrike.bytes.every((v, i) => v === withoutStrike.bytes[i])).toBe(true);

        // No line/rule operator is drawn for it: this one-paragraph document
        // has no hr/blockquote/table, so `re f` (the rule-fill operator)
        // never appears at all — struck or not.
        let latin1 = '';
        for (const b of withStrike.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).not.toContain('re f');
        expect(latin1).toContain('(struck text)');
    });

    test('code + bold is RECORDED, drawn monospace — byte-identical to the code-only run, one `inline/code-emphasis-dropped` record', () => {
        const emphasized = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('x', { code: true, bold: true })] }
        ] };
        const codeOnly = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('x', { code: true })] }
        ] };
        const withEmphasis = irToPdf.irToPdf(emphasized);
        const withoutEmphasis = irToPdf.irToPdf(codeOnly);

        expect(withEmphasis.losses).toEqual([
            { index: '0', kind: 'paragraph', code: 'inline/code-emphasis-dropped', detail: { runs: 1, text: 'x' } }
        ]);
        expect(withEmphasis.bytes.length).toBe(withoutEmphasis.bytes.length);
        expect(withEmphasis.bytes.every((v, i) => v === withoutEmphasis.bytes[i])).toBe(true);
    });

    test('negative: `code: true` alone records nothing', () => {
        const codeOnly = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('x', { code: true })] }
        ] };
        expect(irToPdf.irToPdf(codeOnly).losses).toEqual([]);
    });
});

describe('oconvIrToPdf — a link renders as plain text, no annotation, no loss (C27, F9 refusal by design)', () => {
    test('a link run draws exactly like the same unlinked run — byte-identical output, no /Annot, no /Link, no loss', () => {
        const linked = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('linked text', { link: 'https://example.test/' })] }
        ] };
        const plain = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('linked text')] }
        ] };
        const withLink = irToPdf.irToPdf(linked);
        const withoutLink = irToPdf.irToPdf(plain);

        expect(withLink.losses).toEqual([]);
        expect(withLink.bytes.length).toBe(withoutLink.bytes.length);
        expect(withLink.bytes.every((v, i) => v === withoutLink.bytes[i])).toBe(true);

        let latin1 = '';
        for (const b of withLink.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).not.toContain('/Annot');
        expect(latin1).not.toContain('/Link');
        expect(latin1).toContain('(linked text)');
    });
});

describe('oconvIrToPdf — `layout/s14-variant-metrics-approx`, the defensive fallback (BL-1018)', () => {
    /**
     * A drop-in replacement for the published `oconvPdfMetrics` descriptor
     * that keeps the REAL module in every respect — same faces, same width
     * tables, same route — and forces ONLY the `s14VariantApprox` flag on.
     * That flag is what a fonts-package regression to a shared Standard 14
     * width table across variants would set (BL-954 delivered the real
     * per-variant tables, office/BATCH_33 task 03), so this is the smallest
     * possible expression of "the fonts package regressed".
     *
     * `ModuleRuntime.register` replaces a same-name, same-version entry, so
     * passing this as `pdfWriterRuntime`'s `underTest` argument overrides the
     * published descriptor for THIS runtime only.
     */
    const s14RegressedMetrics = {
        name: oconvPdfMetrics.name,
        dependencies: oconvPdfMetrics.dependencies,
        factory: (...args) => {
            const real = oconvPdfMetrics.factory(...args);
            return {
                ...real,
                createMeasurer: (opts) => ({ ...real.createMeasurer(opts), s14VariantApprox: true })
            };
        }
    };

    /** A one-paragraph document carrying a bold run on the default route. */
    const BOLD_DOC = {
        kind: 'document',
        children: [{ kind: 'paragraph', children: [run('Heavy', { bold: true }), run(' and plain')] }]
    };

    test('the branch still fires when the measurer reports shared variant tables', () => {
        const regressed = pdfWriterRuntime([s14RegressedMetrics]).resolve('oconvIrToPdf');
        const written = regressed.irToPdf(BOLD_DOC);
        const approx = written.losses.filter((l) => l.code === 'layout/s14-variant-metrics-approx');
        expect(approx).toHaveLength(1);
        expect(approx[0].detail.styles).toContain('bold');
        expect(written.bytes.length).toBeGreaterThan(0);
    });

    test('against the REAL @awacloud/fonts the code is ABSENT — the "unreachable" claim, pinned', () => {
        const measurer = metrics.createMeasurer();
        expect(measurer.s14VariantApprox).toBe(false);
        const written = irToPdf.irToPdf(BOLD_DOC);
        expect(written.losses.map((l) => l.code))
            .not.toContain('layout/s14-variant-metrics-approx');
    });
});

describe('oconvIrToPdf — embedded route on caller-supplied bytes (D-A)', () => {
    /** @type {Object<string, Uint8Array>} */
    let corpusFonts;

    beforeAll(async () => {
        corpusFonts = embeddedFontBytesFromPdf(runtime, await corpusBytes(CORPUS_PDF));
    });

    test('the corpus really carries the four Latin faces this route needs', () => {
        expect(Object.keys(corpusFonts).sort())
            .toEqual(['bold', 'boldItalic', 'italic', 'regular']);
    });

    test('ORACLE — the same round trip is green over four embedded faces, and pdf.read finds 4 FontFile2', async () => {
        const ir = emissionDocument({ allStyles: true });
        const opts = { pageNumbers: false, fonts: { ...corpusFonts } };
        const laid = layOut(ir, opts);
        const written = irToPdf.irToPdf(ir, opts);

        expect(written.pages).toBe(laid.pages.length);
        // `mono` was not supplied, so the `code` class falls back — and the
        // facade records exactly that. RE-PINNED by office/BATCH_38 task 04
        // (BL-1257 re-measurement, not a weakening): the corpus-mined Calibri
        // faces are SUBSETS that lack glyphs for many Latin letters, so those
        // occurrences used to draw `.notdef` silently; `hasGlyph` now records
        // them as the document's single `text/unencodable`.
        expect(written.losses).toEqual([
            { code: 'layout/font-fallback', detail: { style: 'code', baseFont: 'Courier' } },
            { code: 'text/unencodable', detail: { count: 576, sample: 'khbzGvxq' } }
        ]);

        const counts = embeddedFontFileCount(written.bytes);
        expect(counts.distinct).toBe(4);
        expect(counts.embedded).toBe(4);

        const { decoded, separators, stream } = await roundTrip(written.bytes, 'embedded.pdf');
        expect(decoded.losses).toEqual([]);
        expect(separators).toBe(written.pages - 1);
        expect(stream).toEqual(words(stack.laidOutText(laid.pages)));
    });

    test('a WinAnsi-only document takes the SIMPLE route (/WinAnsiEncoding), not Identity-H', () => {
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('Plain ASCII only')] }
        ] };
        const bytes = irToPdf.irToPdf(ir, { fonts: { regular: corpusFonts.regular } }).bytes;
        let latin1 = '';
        for (const b of bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/WinAnsiEncoding');
        expect(latin1).not.toContain('/Identity-H');
    });

    test('a document with a non-WinAnsi code point takes the COMPOSITE route (Identity-H)', () => {
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('Greek alpha')] },
            { kind: 'paragraph', children: [run('αβγ')] }
        ] };
        const bytes = irToPdf.irToPdf(ir, { fonts: { regular: corpusFonts.regular } }).bytes;
        let latin1 = '';
        for (const b of bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/Identity-H');
        // The embedded route encodes by glyph id, so nothing is WinAnsi-
        // unencodable — but RE-PINNED by office/BATCH_38 task 04 (BL-1257
        // re-measurement, not a weakening): the corpus-mined Calibri regular
        // is a SUBSET lacking glyphs for `G`, `k`, `h` and `αβγ`, which used
        // to draw `.notdef` silently and are now recorded as ONE
        // `text/unencodable`.
        expect(irToPdf.irToPdf(ir, { fonts: { regular: corpusFonts.regular } }).losses)
            .toEqual([
                { code: 'layout/font-fallback', detail: { style: 'bold', baseFont: 'Helvetica-Bold' } },
                { code: 'layout/font-fallback', detail: { style: 'italic', baseFont: 'Helvetica-Oblique' } },
                { code: 'layout/font-fallback', detail: { style: 'boldItalic', baseFont: 'Helvetica-BoldOblique' } },
                { code: 'layout/font-fallback', detail: { style: 'code', baseFont: 'Courier' } },
                { code: 'text/unencodable', detail: { count: 6, sample: 'Gkhαβγ' } }
            ]);
    });
});

// ---------------------------------------------------------------------------
// Options (D-C)
// ---------------------------------------------------------------------------

describe('oconvIrToPdf — options', () => {
    test('`pageNumbers: false` removes the page-number text and shortens the file', () => {
        const on = irToPdf.irToPdf(emissionDocument());
        const off = irToPdf.irToPdf(emissionDocument(), { pageNumbers: false });
        expect(on.pages).toBe(off.pages);
        expect(off.bytes.length).toBeLessThan(on.bytes.length);
        const y = String(Math.round((box.resolveLayout().margin / 2) * 1000) / 1000);
        let onText = '';
        for (const b of on.bytes) onText += String.fromCharCode(b);
        let offText = '';
        for (const b of off.bytes) offText += String.fromCharCode(b);
        expect(onText).toContain(` ${y} Tm (1) Tj ET`);
        expect(offText).not.toContain(` ${y} Tm (`);
    });

    test('page numbers reach the decoded stream — one extra word per page, at the page end', async () => {
        const ir = emissionDocument();
        const withNumbers = irToPdf.irToPdf(ir);
        const laid = layOut(ir, undefined);
        const { decoded, stream } = await roundTrip(withNumbers.bytes, 'numbered.pdf');
        expect(decoded.losses).toEqual([]);
        // Positional, not a filter: `Block 1 opens here.` already contains
        // the digit `1`, so filtering by value would silently delete body
        // text and still "pass".
        const expected = [];
        for (const page of laid.pages) {
            expected.push(...words(stack.laidOutText([page])));
            expected.push(String(page.number));
        }
        expect(stream.length).toBe(
            words(stack.laidOutText(laid.pages)).length + withNumbers.pages
        );
        expect(stream).toEqual(expected);
    });

    test('`Letter` + a custom margin change the geometry, honoured end to end', () => {
        const bytes = irToPdf.irToPdf(emissionDocument(), {
            pageSize: 'Letter', margin: 90
        }).bytes;
        let latin1 = '';
        for (const b of bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/MediaBox [0 0 612 792]');
        // Every text origin sits inside the requested margins.
        const xs = [...latin1.matchAll(/Tm \(/g)].length;
        expect(xs).toBeGreaterThan(0);
        for (const m of latin1.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
            expect(Number(m[1])).toBeGreaterThanOrEqual(45);   // page number sits at margin/2
            expect(Number(m[2])).toBeLessThanOrEqual(792 - 90);
        }
    });

    test('an unknown option throws — validation lives in exactly ONE place (D-C)', () => {
        expect(() => irToPdf.irToPdf(emissionDocument(), { nope: 1 }))
            .toThrow('oconv: bad pdf option nope');
        expect(() => irToPdf.irToPdf(emissionDocument(), { margin: -1 }))
            .toThrow('oconv: bad pdf option margin');
        expect(() => irToPdf.irToPdf(emissionDocument(), { pageSize: 'A9' }))
            .toThrow('oconv: bad pdf option pageSize');
    });

    test('unreadable font bytes throw the metrics error, not a PDF one', () => {
        expect(() => irToPdf.irToPdf(emissionDocument(), {
            fonts: { regular: new Uint8Array([1, 2, 3]) }
        })).toThrow('oconv: bad pdf font regular');
    });

    test('an invalid IR throws before anything is emitted', () => {
        expect(() => irToPdf.irToPdf({ kind: 'document', children: [{ kind: 'nope' }] }))
            .toThrow(/^oconv: invalid ir \(/);
    });
});

// ---------------------------------------------------------------------------
// The D-E renderer seam
// ---------------------------------------------------------------------------

describe('oconvIrToPdf — the D-E renderer seam', () => {
    test('only `image` still records a loss, and every loss names its block', () => {
        const ir = { kind: 'document', children: [
            { kind: 'list', ordered: false, children: [
                { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('item')] }] }
            ] },
            { kind: 'codeBlock', info: '', text: 'x = 1' },
            { kind: 'table', children: [
                { kind: 'row', header: true, children: [
                    { kind: 'cell', children: [{ kind: 'paragraph', children: [run('h')] }] }
                ] }
            ] },
            { kind: 'image', name: 'a.png', alt: 'A' }
        ] };
        const written = irToPdf.irToPdf(ir);
        // Tasks 08/09/10 replaced the task-07 stubs, so the `*-unrendered`
        // codes this test used to pin are gone by design: list, codeBlock and
        // table now render for real. `image` is the ONE delegated kind that
        // still cannot render — the frozen `oconv-ir/v1` carries name/alt
        // only. The asset-manifest input landed with BL-980
        // (office/BATCH_35 task 02) and IS threaded here — but this call
        // supplies none, so the image is refused with the honest
        // `reason: 'no-bytes'`. MEASURED on this tree, not inherited.
        expect(written.losses.map((l) => l.code)).toEqual(['layout/image-dropped']);
        for (const loss of written.losses) {
            expect(loss.index).toBeDefined();
            expect(loss.detail.index).toBe(loss.index);
        }
    });

    test('every delegated kind reached its renderer and actually drew — round-tripped', async () => {
        // What the `*-unrendered` stub codes used to prove, re-established
        // against real renderers and WITHOUT a hand-written expectation of
        // the typesetter's output: emit through `@awacloud/pdf`, decode back
        // through oconv's OWN `toMd` pdf path, and require each delegated
        // block's text on the page. A renderer that silently drew nothing
        // reddens here even though it recorded no loss.
        const ir = { kind: 'document', children: [
            { kind: 'list', ordered: false, children: [
                { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('item')] }] }
            ] },
            { kind: 'codeBlock', info: '', text: 'x = 1' },
            { kind: 'table', children: [
                { kind: 'row', header: true, children: [
                    { kind: 'cell', children: [{ kind: 'paragraph', children: [run('h')] }] }
                ] }
            ] },
            { kind: 'image', name: 'a.png', alt: 'A' }
        ] };
        const written = irToPdf.irToPdf(ir);
        const back = await oconvApi.toMd({
            name: 'seam.pdf', bytes: written.bytes, convertedAt: AT
        });
        // Body = everything past the frontmatter block; the page number is
        // the trailing line. `toMd` escapes the placeholder's brackets, so
        // match its inner text rather than the raw `[image: A]`.
        const body = back.markdown.slice(back.markdown.lastIndexOf('---') + 3);
        const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        // RE-MEASURED once the Standard 14 font dicts name
        // `/Encoding /WinAnsiEncoding`: the bullet marker (CP1252 0x95) now
        // decodes, so the item line reads back with its marker.
        expect(lines).toContain('• item');          // list  -> marker + item text drew
        expect(lines).toContain('x = 1');           // code  -> one line per source line
        expect(lines).toContain('h');               // table -> header cell drew
        expect(body).toContain('image: A');         // image -> honest v1 placeholder
    });

    test('the stack\'s accounting invariant holds over the real renderers — every drawable block is named', () => {
        // A renderer returning zero items AND zero losses would redden this.
        // Task 07's `*-unrendered` stub codes bought this property until
        // 08/09/10 landed; the real renderers must keep it. Falsified below.
        const layout = box.resolveLayout();
        const losses = [];
        // `render` must hand the renderer its own `flowChildren` binding,
        // exactly as the facade's dispatcher does (`ir-to-pdf.js:234-238`);
        // the real list renderer re-flows its item children through it and
        // throws without it. Same test-fixture pattern the three renderer
        // suites use (`render/list.test.js` makeFlowChildren/makeRender).
        const flowChildrenFor = (parent) => (blocks, opts) => {
            const o = opts || {};
            const delta = Number.isFinite(o.indentDelta) ? o.indentDelta : stack.INDENT_STEP;
            const child = { ...parent, indent: (parent.indent || 0) + delta };
            const flowed = stack.flowBlocks({ kind: 'document', children: blocks || [] }, child);
            let height = 0;
            for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
            return { blocks: flowed, height };
        };
        const dispatch = (node, c) => runtime.resolve('oconvPdfRenderList')
            .render(node, { ...c, flowChildren: flowChildrenFor(c) });
        const ctx = {
            measurer: metrics.createMeasurer(), layout, column: layout.column,
            sizeFor: layout.sizeFor, leading: layout.leading, linebreak, losses,
            index: null, render: dispatch
        };
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('before')] },
            { kind: 'list', ordered: false, children: [
                { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('item')] }] }
            ] }
        ] };
        const laid = stack.layoutDocument(ir, ctx);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);

        // Non-vacuity: a renderer that drops the block silently IS caught.
        const silentLosses = [];
        const silent = stack.layoutDocument(ir, {
            ...ctx, losses: silentLosses, render: () => ({ items: [], losses: [] })
        });
        expect(stack.unaccounted(silent.blocks, silent.pages, silent.losses))
            .toEqual(['1:list']);
    });

    test('`ctx.flowChildren` re-enters the flow with an indent delta and an optional style override', () => {
        // The seam is probed through the FACADE, by substituting the list
        // renderer in a runtime built from the same manifest — exactly the
        // position task 08 will occupy. Registering a descriptor whose name
        // already exists overwrites it, so `oconvIrToPdf` resolves the probe.
        /** @type {object} */
        let seen = null;
        const probeRenderer = {
            name: 'oconvPdfRenderList',
            dependencies: [],
            factory() {
                return {
                    render(node, ctx) {
                        const plain = ctx.flowChildren(node.children[0].children, {});
                        const overridden = ctx.flowChildren(node.children[0].children, {
                            styleOverride: 'code', indentDelta: 0
                        });
                        seen = {
                            parentIndex: ctx.index,
                            parentIndent: ctx.indent,
                            childIndex: plain.blocks[0].index,
                            childIndent: plain.blocks[0].indent,
                            height: plain.height,
                            overriddenIndent: overridden.blocks[0].indent,
                            overriddenStyle: overridden.blocks[0].lines[0].tokens[0].style,
                            hasRender: typeof ctx.render === 'function',
                            hasMeasurer: !!ctx.measurer,
                            kind: ctx.kind
                        };
                        return {
                            items: [{
                                x: 0, y: 12, style: 'regular', sizePt: 11,
                                tokens: [{ kind: 'word', text: 'probe', style: 'regular', width: 20, link: null }]
                            }],
                            losses: []
                        };
                    }
                };
            }
        };
        const rt = pdfWriterRuntime([probeRenderer]);
        const facade = rt.resolve('oconvIrToPdf');
        const ir = { kind: 'document', children: [
            { kind: 'list', ordered: false, children: [
                { kind: 'listItem', children: [{ kind: 'paragraph', children: [run('nested text')] }] }
            ] }
        ] };
        const written = facade.irToPdf(ir);

        expect(written.losses).toEqual([]);
        expect(seen.kind).toBe('list');
        expect(seen.parentIndex).toBe('0');
        expect(seen.parentIndent).toBe(0);
        expect(seen.hasRender).toBe(true);
        expect(seen.hasMeasurer).toBe(true);
        expect(seen.childIndent).toBe(stack.INDENT_STEP);   // default delta
        expect(seen.overriddenIndent).toBe(0);              // explicit delta wins
        expect(seen.overriddenStyle).toBe('code');          // linebreaker wrapped
        expect(seen.height).toBeGreaterThan(0);
        // The nested blocks are indexed UNDER the delegating block.
        expect(seen.childIndex.startsWith(`${seen.parentIndex}.`)).toBe(true);
    });

    test('an IR kind with no renderer is recorded, never silently dropped', () => {
        // The facade's own dispatcher default branch is unreachable through
        // `flowBlocks` (it delegates the four known kinds only), so the
        // observable behaviour is the stack's `unhandled-block` — asserted
        // here so the pipeline as a whole is proven to drop nothing quietly.
        const layout = box.resolveLayout();
        const losses = [];
        const ctx = {
            measurer: metrics.createMeasurer(), layout, column: layout.column,
            sizeFor: layout.sizeFor, leading: layout.leading, linebreak, losses,
            index: null, render: () => ({ items: [], losses: [] })
        };
        stack.layoutDocument({ kind: 'document', children: [{ kind: 'weird' }] }, ctx);
        expect(losses.map((l) => l.code)).toEqual(['layout/unhandled-block']);
    });
});

// =========================================================================
// Images through the facade (BL-980) — `irToPdf(ir, pdfOpts, writeOpts)`
// =========================================================================

describe('oconvIrToPdf — writeOpts.assets', () => {
    const pdfApi = runtime.resolve('pdf');
    let JPEG;
    let PNG;

    beforeAll(async () => {
        JPEG = await corpusBytes('assets/px.jpg');
        PNG = await corpusBytes('assets/px.png');
    });

    /**
     * `/Resources /XObject` of one page, or `null` when the page declares
     * none.
     *
     * @param {Uint8Array} bytes
     * @param {number} [pageIndex]
     * @returns {object|null}
     */
    function xobjectsOf(bytes, pageIndex = 0) {
        const doc = pdfApi.read(bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const res = deref(doc.pages[pageIndex].resources);
        const x = res.entries.XObject;
        return x ? deref(x) : null;
    }

    /** The whole file as latin-1 text. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    const imageDoc = (name) => ({
        kind: 'document', children: [{ kind: 'image', name, alt: 'A' }]
    });

    test('a JPEG in `assets`: the page /XObject names the resource, the stream draws it, NO image loss', () => {
        const written = irToPdf.irToPdf(imageDoc('p.jpg'), undefined, {
            assets: { 'p.jpg': JPEG }
        });
        expect(written.losses).toEqual([]);
        const xo = xobjectsOf(written.bytes);
        expect(xo).not.toBeNull();
        expect(Object.keys(xo.entries)).toEqual(['Im0']);
        expect(xo.entries.Im0.type).toBe('ref');
        expect(latin1(written.bytes)).toContain('/Im0 Do Q');
    });

    test('the XObject stream carries the JPEG bytes VERBATIM behind /DCTDecode', () => {
        const written = irToPdf.irToPdf(imageDoc('p.jpg'), undefined, {
            assets: { 'p.jpg': JPEG }
        });
        const doc = pdfApi.read(written.bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const res = deref(doc.pages[0].resources);
        const img = deref(deref(res.entries.XObject).entries.Im0);

        expect(img.type).toBe('stream');
        expect(img.dict.entries.Subtype.value).toBe('Image');
        expect(img.dict.entries.Filter.value).toBe('DCTDecode');
        expect(img.dict.entries.Width.value).toBe(1);
        expect(img.dict.entries.Height.value).toBe(1);
        expect(img.dict.entries.ColorSpace.value).toBe('DeviceGray');
        expect(img.dict.entries.BitsPerComponent.value).toBe(8);
        expect([...img.raw]).toEqual([...JPEG]);
    });

    test('a PNG in `assets`: the honest refusal, no /XObject, placeholder drawn', () => {
        const written = irToPdf.irToPdf(imageDoc('d.png'), undefined, {
            assets: { 'd.png': PNG }
        });
        expect(written.losses).toEqual([{
            code: 'layout/image-dropped',
            index: '0', kind: 'image',
            detail: {
                index: '0', name: 'd.png', alt: 'A',
                reason: 'unsupported-encoding', bytes: PNG.length, format: 'png'
            }
        }]);
        expect(xobjectsOf(written.bytes)).toBeNull();
        expect(latin1(written.bytes)).toContain('([image: A])');
    });

    test('no `writeOpts` at all: `reason: no-bytes`, byte-identical to passing an empty manifest', () => {
        const bare = irToPdf.irToPdf(imageDoc('d.png'));
        expect(bare.losses[0].detail.reason).toBe('no-bytes');

        const empty = irToPdf.irToPdf(imageDoc('d.png'), undefined, {});
        const undef = irToPdf.irToPdf(imageDoc('d.png'), undefined, { assets: undefined });
        expect([...empty.bytes]).toEqual([...bare.bytes]);
        expect([...undef.bytes]).toEqual([...bare.bytes]);
    });

    test('two placed images share one page and get distinct resource names', () => {
        const ir = { kind: 'document', children: [
            { kind: 'image', name: 'a.jpg', alt: '' },
            { kind: 'image', name: 'b.jpg', alt: '' }
        ] };
        const written = irToPdf.irToPdf(ir, undefined, {
            assets: { 'a.jpg': JPEG, 'b.jpg': JPEG }
        });
        expect(written.losses).toEqual([]);
        expect(written.pages).toBe(1);
        expect(Object.keys(xobjectsOf(written.bytes).entries).sort()).toEqual(['Im0', 'Im1']);
    });

    test('placement keeps the md → pdf determinism property: two calls are BYTE-identical', () => {
        const a = irToPdf.irToPdf(imageDoc('p.jpg'), undefined, { assets: { 'p.jpg': JPEG } });
        const b = irToPdf.irToPdf(imageDoc('p.jpg'), undefined, { assets: { 'p.jpg': JPEG } });
        expect(a.bytes.length).toBe(b.bytes.length);
        expect(a.bytes.every((v, i) => v === b.bytes[i])).toBe(true);
    });

    test('`writeOpts` is NOT `pdfOpts`: an assets key never reaches the layout validator', () => {
        // `resolveLayout` throws on any unknown key, so this is the proof
        // that content and typesetting options stay in separate arguments.
        expect(() => irToPdf.irToPdf(imageDoc('p.jpg'), { assets: {} })).toThrow('oconv: bad pdf option assets');
        expect(() => irToPdf.irToPdf(imageDoc('p.jpg'), { pageNumbers: false }, { assets: { 'p.jpg': JPEG } }))
            .not.toThrow();
    });
});

// =========================================================================
// The default-face tier (G-OF1) — office/BATCH_38 task 04
//
// explicit opts.pdf.fonts[class] > registered oconvDefaultFaces[class] > Standard 14
//
// The "registered pack" here is a TEST stand-in carrying the corpus-mined
// Calibri faces (same recipe as above), registered at a version above the
// published `0.0.0` stand-in through `pdfWriterRuntime([...])`. The real
// companion face pack is covered by the package's integration tests.
// =========================================================================

describe('oconvIrToPdf — the default-face tier (G-OF1)', () => {
    /** @type {Object<string, Uint8Array>} */
    let corpusFaces;

    beforeAll(async () => {
        corpusFaces = embeddedFontBytesFromPdf(runtime, await corpusBytes(CORPUS_PDF));
    });

    /**
     * A same-name `oconvDefaultFaces` pack at `0.1.0` around `map`.
     *
     * @param {Object<string, Uint8Array>} map
     */
    function testPack(map) {
        return {
            name: 'oconvDefaultFaces',
            version: '0.1.0',
            dependencies: [],
            factory() {
                return { defaultFaces: () => map, family: 'test', release: 'test' };
            }
        };
    }

    /** The facade resolved on a runtime carrying `map` as the registered pack. */
    function withPack(map, extra) {
        return pdfWriterRuntime([testPack(map), ...(extra || [])]).resolve('oconvIrToPdf');
    }

    /** Whole-file latin-1 view. */
    function latin1(bytes) {
        let s = '';
        for (const b of bytes) s += String.fromCharCode(b);
        return s;
    }

    /** Byte equality with a readable failure. */
    function sameBytes(a, b) {
        expect(a.length).toBe(b.length);
        expect(a.every((v, i) => v === b[i])).toBe(true);
    }

    /**
     * The mined corpus faces are SUBSETS (the Calibri in the fixture PDF only
     * carries the glyphs that PDF used), so these fixtures stick to code
     * points ALL FOUR faces have a glyph for — measured on this tree — which
     * keeps `text/unencodable` out of every assertion that is not about it.
     */
    const SAFE = 'Rust notes: data, 2019.';

    /** Every Latin style class on one page, glyph-safe text only. */
    const SAFE_DOC = {
        kind: 'document',
        children: [{
            kind: 'paragraph',
            children: [
                run(`${SAFE} `), run(SAFE, { bold: true }), run(' '),
                run(SAFE, { italic: true }), run(' '), run(SAFE, { bold: true, italic: true })
            ]
        }]
    };

    test('C1 — stand-in only: output byte-identical to the pre-tier call (no route change)', () => {
        // The golden is the PRE-CHANGE measurer call, reproduced in this test:
        // a metrics wrapper that drops `defaultFonts` entirely, i.e.
        // `createMeasurer({ fonts })` exactly as the facade called it before
        // the tier existed.
        const preTierMetrics = {
            name: oconvPdfMetrics.name,
            dependencies: oconvPdfMetrics.dependencies,
            factory: (...args) => {
                const real = oconvPdfMetrics.factory(...args);
                return {
                    ...real,
                    createMeasurer: (opts) => real.createMeasurer({ fonts: opts && opts.fonts })
                };
            }
        };
        const golden = pdfWriterRuntime([preTierMetrics]).resolve('oconvIrToPdf');

        expect(runtime.resolve('oconvDefaultFaces').defaultFaces()).toBeNull();
        for (const ir of [emissionDocument({ allStyles: true }), syntheticDocument(12)]) {
            const now = irToPdf.irToPdf(ir);
            const before = golden.irToPdf(ir);
            sameBytes(now.bytes, before.bytes);
            expect(now.losses).toEqual(before.losses);
            expect(embeddedFontFileCount(now.bytes).embedded).toBe(0);
        }
    });

    test('C2 — registered pack: embedded route, `layout/font-fallback` only for the class it does not cover', () => {
        const facade = withPack({ ...corpusFaces });           // no `mono` key
        const written = facade.irToPdf(SAFE_DOC, { pageNumbers: false });
        expect(written.losses).toEqual([
            { code: 'layout/font-fallback', detail: { style: 'code', baseFont: 'Courier' } }
        ]);
        const counts = embeddedFontFileCount(written.bytes);
        expect(counts.embedded).toBe(4);
        expect(latin1(written.bytes)).not.toContain('/BaseFont /Helvetica');
    });

    test('C3 — explicit `regular` + registered pack: regular is the explicit face, the others the registered ones (per class)', () => {
        // The explicit `regular` is a DIFFERENT program (the corpus italic
        // bytes), so the per-class result is observable. The oracle is a
        // pack-less call supplying the frozen per-class resolution
        // explicitly: byte identity proves each class came from the right tier.
        const explicitRegular = corpusFaces.italic;
        const opts = { pageNumbers: false, fonts: { regular: explicitRegular } };
        const viaTier = withPack({ ...corpusFaces }).irToPdf(SAFE_DOC, opts);
        const oracle = irToPdf.irToPdf(SAFE_DOC, {
            pageNumbers: false,
            fonts: {
                regular: explicitRegular,
                bold: corpusFaces.bold,
                italic: corpusFaces.italic,
                boldItalic: corpusFaces.boldItalic
            }
        });
        sameBytes(viaTier.bytes, oracle.bytes);
        expect(viaTier.losses).toEqual(oracle.losses);

        // Non-vacuity: the pack's own `regular` gives different bytes.
        const packOnly = withPack({ ...corpusFaces }).irToPdf(SAFE_DOC, { pageNumbers: false });
        expect(latin1(packOnly.bytes)).not.toBe(latin1(viaTier.bytes));
    });

    test('a posted `writeOpts.defaultFaces` beats the registered pack WHOLE; `null` falls back to the registered one', () => {
        const registered = { ...corpusFaces };
        const posted = { regular: corpusFaces.italic, bold: corpusFaces.boldItalic };
        const facade = withPack(registered);

        const viaPosted = facade.irToPdf(SAFE_DOC, { pageNumbers: false }, { defaultFaces: posted });
        // WHOLE: `italic`/`boldItalic` are NOT taken from the registered map.
        const oracle = irToPdf.irToPdf(SAFE_DOC, { pageNumbers: false }, { defaultFaces: posted });
        sameBytes(viaPosted.bytes, oracle.bytes);
        expect(viaPosted.losses.map((l) => l.detail && l.detail.style))
            .toEqual(['italic', 'boldItalic', 'code']);

        const viaNull = facade.irToPdf(SAFE_DOC, { pageNumbers: false }, { defaultFaces: null });
        const viaRegistered = facade.irToPdf(SAFE_DOC, { pageNumbers: false });
        sameBytes(viaNull.bytes, viaRegistered.bytes);
    });

    test('invariant 1 — a call supplying EVERY class explicitly is byte-identical with and without a registered pack', () => {
        const all = {
            regular: corpusFaces.regular,
            bold: corpusFaces.bold,
            italic: corpusFaces.italic,
            boldItalic: corpusFaces.boldItalic,
            mono: corpusFaces.regular
        };
        // The registered pack deliberately carries OTHER programs per class.
        const otherPack = {
            regular: corpusFaces.boldItalic, bold: corpusFaces.italic,
            italic: corpusFaces.bold, boldItalic: corpusFaces.regular, mono: corpusFaces.bold
        };
        const withoutPack = irToPdf.irToPdf(SAFE_DOC, { pageNumbers: false, fonts: all });
        const withAPack = withPack(otherPack).irToPdf(SAFE_DOC, { pageNumbers: false, fonts: all });
        sameBytes(withAPack.bytes, withoutPack.bytes);
        expect(withAPack.losses).toEqual(withoutPack.losses);
    });

    test('two runs on the registered route are BYTE-identical', () => {
        const facade = withPack({ ...corpusFaces });
        const a = facade.irToPdf(emissionDocument({ allStyles: true }));
        const b = facade.irToPdf(emissionDocument({ allStyles: true }));
        sameBytes(a.bytes, b.bytes);
        expect(a.losses).toEqual(b.losses);
    });

    test('BL-1257 — a code point the embedded face lacks yields exactly ONE `text/unencodable`, count = occurrences', () => {
        const facade = withPack({ ...corpusFaces });
        const cjk = String.fromCodePoint(0x4E2D);
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run(`${SAFE} ${cjk} data ${cjk}${cjk}`)] }
        ] };
        const written = facade.irToPdf(ir, { pageNumbers: false });
        const unencodable = written.losses.filter((l) => l.code === 'text/unencodable');
        expect(unencodable).toEqual([
            { code: 'text/unencodable', detail: { count: 3, sample: cjk } }
        ]);

        // Non-vacuity: the same document without the missing code point
        // records none — the loss is about the glyph, not the route.
        const clean = facade.irToPdf({ kind: 'document', children: [
            { kind: 'paragraph', children: [run(`${SAFE} data`)] }
        ] }, { pageNumbers: false });
        expect(clean.losses.map((l) => l.code)).not.toContain('text/unencodable');
    });

    test('BL-1009 — all-bold, embedded, `pageNumbers: false`: every segment drawn (one Tj per segment), no throw', () => {
        const facade = withPack({ ...corpusFaces });
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run(`${SAFE} ${SAFE}`, { bold: true })] },
            { kind: 'paragraph', children: [run(SAFE, { bold: true }), run(` ${SAFE}`, { bold: true })] }
        ] };
        const opts = { pageNumbers: false };
        let written;
        expect(() => { written = facade.irToPdf(ir, opts); }).not.toThrow();

        // Expected segments, counted on the laid-out pages the way
        // `pageContent` groups them: one per run of consecutive same-style
        // tokens. All-bold means one per line item.
        const laid = layOut(ir, { ...opts, fonts: { bold: corpusFaces.bold } });
        let segments = 0;
        for (const page of laid.pages) {
            for (const item of page.items) {
                let last = null;
                for (const t of item.tokens || []) {
                    if (t.style !== last) { segments += 1; last = t.style; }
                }
            }
        }
        expect(segments).toBeGreaterThan(0);
        const text = latin1(written.bytes);
        expect((text.match(/ Tj ET/g) || []).length).toBe(segments);
        expect(text).toContain('/FB ');
    });

    test('BL-1009 — an item carrying an unknown style class is drawn with the `regular` entry', () => {
        // Injected through a WRAPPED code renderer (office memory
        // 2026-09-03): the real renderer runs, then its items' style is
        // rewritten to a class outside `STYLE_CLASSES`. `regular` draws no
        // code point of its own here (all-bold body, no page numbers), so
        // before the guarantee it had no entry and no subset for this text.
        const weirdCode = {
            name: oconvPdfRenderCode.name,
            dependencies: oconvPdfRenderCode.dependencies,
            factory: (...args) => {
                const real = oconvPdfRenderCode.factory(...args);
                return {
                    ...real,
                    render(node, ctx) {
                        const out = real.render(node, ctx);
                        for (const item of out.items) {
                            item.style = 'weird';
                            for (const t of item.tokens || []) t.style = 'weird';
                        }
                        return out;
                    }
                };
            }
        };
        const facade = withPack({ ...corpusFaces }, [weirdCode]);
        const ir = { kind: 'document', children: [
            { kind: 'paragraph', children: [run(SAFE, { bold: true })] },
            { kind: 'codeBlock', info: '', text: 'data' }
        ] };
        let written;
        expect(() => { written = facade.irToPdf(ir, { pageNumbers: false }); }).not.toThrow();
        const text = latin1(written.bytes);
        expect((text.match(/ Tj ET/g) || []).length).toBe(2);
        expect(text).toContain('/FR ');
        expect(written.losses.map((l) => l.code)).not.toContain('text/unencodable');
    });
});
