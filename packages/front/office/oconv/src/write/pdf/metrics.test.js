// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { pdfWriterRuntime, corpusBytes, CORPUS_PDF } from './_test-runtime.js';
import { oconvPdfMetrics } from './metrics.js';

// The leg-A reference string: every ASCII class the typesetter meets.
const REFERENCE = 'The quick brown fox jumps over the lazy dog 0123456789';
const REFERENCE_SIZE = 11;

// The runtime is built at module scope (not in `beforeAll`) because the
// Standard 14 per-variant gate below is a `test.skipIf` condition, which
// bun:test evaluates at REGISTRATION time.
const runtime = pdfWriterRuntime([oconvPdfMetrics]);
const metrics = runtime.resolve('oconvPdfMetrics');
const standard14 = runtime.resolve('standard14Lookup');

/**
 * Are the per-variant Standard 14 width tables present upstream (BL-954,
 * batch task 03)? Computed LIVE, never hard-coded: 'A' is 667 in Adobe's
 * Helvetica and 722 in Helvetica-Bold, so a difference proves the bold table
 * is a real AFM table and not the shared regular one.
 *
 * Re-check when BL-954 lands (task 03) — the assertions gated on this flag
 * are the ones that only mean something once bold has its own metrics.
 */
const perVariantTablesPresent =
    standard14.lookupStandard14('Helvetica-Bold').widths[65]
    !== standard14.lookupStandard14('Helvetica').widths[65];

/* ── TEST-ONLY corpus recipe ──────────────────────────────────────────────
 * Mine the four embedded Latin faces out of the vendored golden-corpus PDF.
 * This is the spike's `embeddedFacesFromPdf` recipe (leg A), copied here on
 * purpose: `src/write/pdf/metrics.js` never mines a PDF for a font — the
 * embedded route runs on caller-supplied bytes only (D-A). Everything below
 * goes through published surfaces: `pdf.read`, the documented indirect-ref
 * resolver `readResult._raw.resolve`, `pdfFilterDispatch.decode` and
 * `fonts.read`.
 * ─────────────────────────────────────────────────────────────────────── */

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

/** Style class → corpus font program bytes (filled in `beforeAll`). */
let corpusFonts;
/** Standard 14 measurer (the D-A default route). */
let s14;
/** Mixed measurer: the four corpus faces + Standard 14 Courier for `code`. */
let mixed;

beforeAll(async () => {
    corpusFonts = embeddedFontBytesFromPdf(runtime, await corpusBytes(CORPUS_PDF));
    s14 = metrics.createMeasurer();
    mixed = metrics.createMeasurer({ fonts: { ...corpusFonts } });
});

describe('oconvPdfMetrics — descriptor and its declared dependencies', () => {
    test('declares exactly the two @awacloud/fonts module names it composes', () => {
        expect(oconvPdfMetrics.name).toBe('oconvPdfMetrics');
        expect(oconvPdfMetrics.dependencies).toEqual(['standard14Lookup', 'fonts']);
    });

    test('both dependency names really resolve from the oconv manifest', () => {
        // The fonts modules reach oconv transitively through
        // `@awacloud/pdf`'s `pkg_require`, so no new bare specifier is needed.
        expect(typeof runtime.resolve('standard14Lookup').lookupStandard14).toBe('function');
        expect(typeof runtime.resolve('fonts').read).toBe('function');
    });

    test('publishes the five-member API', () => {
        expect(Object.keys(metrics).sort())
            .toEqual(['S14_FACES', 'STYLE_CLASSES', 'createMeasurer', 'styleOfRun', 'winAnsiByte']);
        expect(metrics.STYLE_CLASSES)
            .toEqual(['regular', 'bold', 'italic', 'boldItalic', 'code']);
        expect(metrics.S14_FACES).toEqual({
            regular:    'Helvetica',
            bold:       'Helvetica-Bold',
            italic:     'Helvetica-Oblique',
            boldItalic: 'Helvetica-BoldOblique',
            code:       'Courier'
        });
    });
});

describe('styleOfRun — IR run flags → style class', () => {
    test('the full flag table', () => {
        expect(metrics.styleOfRun({})).toBe('regular');
        expect(metrics.styleOfRun({ bold: true })).toBe('bold');
        expect(metrics.styleOfRun({ italic: true })).toBe('italic');
        expect(metrics.styleOfRun({ bold: true, italic: true })).toBe('boldItalic');
        expect(metrics.styleOfRun({ code: true })).toBe('code');
    });

    test('code wins over every emphasis flag', () => {
        expect(metrics.styleOfRun({ code: true, bold: true })).toBe('code');
        expect(metrics.styleOfRun({ code: true, italic: true })).toBe('code');
        expect(metrics.styleOfRun({ code: true, bold: true, italic: true })).toBe('code');
    });

    test('false flags and a missing run degrade to regular', () => {
        expect(metrics.styleOfRun({ bold: false, italic: false, code: false })).toBe('regular');
        expect(metrics.styleOfRun(undefined)).toBe('regular');
        expect(metrics.styleOfRun(null)).toBe('regular');
    });
});

describe('winAnsiByte — the ONE CP1252 table of the package', () => {
    test('Latin-1 passes straight through', () => {
        expect(metrics.winAnsiByte(0x41)).toBe(0x41);       // 'A'
        expect(metrics.winAnsiByte(0x20)).toBe(0x20);       // space
        expect(metrics.winAnsiByte(0x7E)).toBe(0x7E);       // '~'
        expect(metrics.winAnsiByte(0xE9)).toBe(0xE9);       // 'é'
        expect(metrics.winAnsiByte(0xFF)).toBe(0xFF);       // 'ÿ'
    });

    test("CP1252's own 0x80-0x9F punctuation band is mapped explicitly", () => {
        expect(metrics.winAnsiByte(0x2022)).toBe(0x95);     // bullet
        expect(metrics.winAnsiByte(0x2019)).toBe(0x92);     // right single quote
        expect(metrics.winAnsiByte(0x2014)).toBe(0x97);     // em dash
        expect(metrics.winAnsiByte(0x20AC)).toBe(0x80);     // euro
    });

    test('unrepresentable code points return null', () => {
        expect(metrics.winAnsiByte(0x4E2D)).toBe(null);     // CJK
        expect(metrics.winAnsiByte(0x0100)).toBe(null);     // 'Ā'
        expect(metrics.winAnsiByte(0x1F600)).toBe(null);    // emoji
        expect(metrics.winAnsiByte(0x00)).toBe(null);       // NUL
        expect(metrics.winAnsiByte(0x81)).toBe(null);       // unassigned in CP1252
    });
});

describe('createMeasurer — Standard 14 route (D-A default)', () => {
    test('every style class resolves to its Standard 14 face', () => {
        expect(s14.route).toBe('standard14');
        for (const style of metrics.STYLE_CLASSES) {
            const face = s14.face(style);
            expect(face.style).toBe(style);
            expect(face.source).toBe('standard14');
            expect(face.baseFont).toBe(metrics.S14_FACES[style]);
            expect(face.unitsPerEm).toBe(1000);
            expect(face.record.widths[65]).toBeGreaterThan(0);
            expect(face.font).toBeUndefined();
            expect(typeof face.ascent).toBe('number');
            expect(typeof face.capHeight).toBe('number');
        }
    });

    test('the default route reports NO fallback (nothing fell back — it is the route)', () => {
        expect(s14.fallbacks).toEqual([]);
    });

    test('MEASUREMENT — leg-A reference widths at 11pt', () => {
        expect(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE)).toBeCloseTo(281.864, 3);
        expect(s14.widthOf(REFERENCE, 'code', REFERENCE_SIZE)).toBeCloseTo(356.400, 3);
    });

    test('the monospace class is monospaced and the proportional one is not', () => {
        const w = (ch, style) => s14.widthOf(ch, style, REFERENCE_SIZE);
        expect(new Set(['i', 'W', 'm', '.'].map((c) => w(c, 'code'))).size).toBe(1);
        expect(w('i', 'regular')).not.toBe(w('W', 'regular'));
    });

    test('width scales linearly with the type size and is zero for empty text', () => {
        const at11 = s14.widthOf(REFERENCE, 'regular', 11);
        expect(s14.widthOf(REFERENCE, 'regular', 22)).toBeCloseTo(at11 * 2, 9);
        expect(s14.widthOf('', 'regular', 11)).toBe(0);
    });

    test('unrepresentable code points measure as the `?` they will be rendered as', () => {
        const q = s14.widthOf('?', 'regular', REFERENCE_SIZE);
        expect(s14.widthOf('中', 'regular', REFERENCE_SIZE)).toBeCloseTo(q, 9);
        expect(s14.widthOf('\u{1F600}', 'regular', REFERENCE_SIZE)).toBeCloseTo(q, 9);
    });

    test('every WinAnsi slot the upstream table actually fills is measured from it', () => {
        const widths = s14.face('regular').record.widths;
        for (const ch of REFERENCE) {
            const byte = metrics.winAnsiByte(ch.codePointAt(0));
            expect(widths[byte]).toBeGreaterThan(0);
            expect(s14.widthOf(ch, 'regular', REFERENCE_SIZE))
                .toBeCloseTo(widths[byte] * REFERENCE_SIZE / 1000, 9);
        }
    });

    test('WinAnsi bytes above 0x7E measure on their real advance — the upstream Standard 14 gap is CLOSED', () => {
        // This was pinned as an UPSTREAM GAP: `@awacloud/fonts`' Standard 14
        // tables filled only the 95 printable-ASCII slots (0x20-0x7E), so
        // every Latin-1 letter and CP1252 punctuation mark degraded to the
        // '?' width while the viewer laid it out on the font's real advance.
        // The generator now covers the full WinAnsi byte map
        // (`fonts/tools/gen-standard14-widths.mjs`, WIN_ANSI_HIGH_ENTRIES),
        // so the measurement is the real one. The old test was written to
        // "turn red on purpose" the day the table filled; this is its
        // replacement — the regression guard for the closed gap.
        const widths = s14.face('regular').record.widths;
        for (const ch of 'é•—àÿ') {
            const byte = metrics.winAnsiByte(ch.codePointAt(0));
            expect(byte).not.toBe(null);
            expect(widths[byte]).toBeGreaterThan(0);
            expect(s14.widthOf(ch, 'regular', REFERENCE_SIZE))
                .toBeCloseTo(widths[byte] * REFERENCE_SIZE / 1000, 9);
        }
        // Non-vacuity: characters whose advance genuinely differs from '?'
        // no longer collapse onto the fallback width (Helvetica: bullet 350,
        // emdash 1000, ydieresis 500 vs '?' 556). 'é'/'à' are 556 in
        // Helvetica by coincidence, so they cannot serve as the control.
        const q = s14.widthOf('?', 'regular', REFERENCE_SIZE);
        for (const ch of '•—ÿ') {
            expect(s14.widthOf(ch, 'regular', REFERENCE_SIZE)).not.toBeCloseTo(q, 9);
        }
    });

    test('an unknown style class degrades to regular rather than measuring 0', () => {
        expect(s14.widthOf(REFERENCE, 'smallCaps', REFERENCE_SIZE))
            .toBeCloseTo(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE), 9);
    });

    test('the measurer is frozen', () => {
        expect(Object.isFrozen(s14)).toBe(true);
    });
});

describe('createMeasurer — Standard 14 per-variant metrics (BL-954 gate)', () => {
    test('the gate flag is computed live, never assumed', () => {
        expect(typeof perVariantTablesPresent).toBe('boolean');
    });

    // Re-check when BL-954 lands (task 03): before the per-variant AFM
    // tables, Helvetica-Bold shared HELVETICA_WIDTHS and bold measured
    // EXACTLY like regular, so these assertions would be false by construction.
    test.skipIf(!perVariantTablesPresent)('bold is genuinely wider than regular', () => {
        const reg = s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE);
        const bold = s14.widthOf(REFERENCE, 'bold', REFERENCE_SIZE);
        const boldItalic = s14.widthOf(REFERENCE, 'boldItalic', REFERENCE_SIZE);
        expect(bold).toBeGreaterThan(reg);
        expect(bold).toBeCloseTo(299.552, 3);
        // Adobe gives an oblique cut the SAME advances as its upright
        // counterpart, so BoldOblique measures like Bold — exactly, not
        // approximately.
        expect(boldItalic).toBeCloseTo(bold, 9);
        expect(s14.face('bold').record.widths[65]).toBe(722);
        expect(s14.face('regular').record.widths[65]).toBe(667);
    });

    test.skipIf(perVariantTablesPresent)('bold shares the regular table (pre-BL-954 shape)', () => {
        expect(s14.widthOf(REFERENCE, 'bold', REFERENCE_SIZE))
            .toBeCloseTo(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE), 9);
    });

    test('s14VariantApprox follows the gate', () => {
        expect(s14.s14VariantApprox).toBe(!perVariantTablesPresent);
    });

    test('the italic class shares the regular table by DESIGN, not by approximation', () => {
        // Helvetica-Oblique's AFM advances are identical to Helvetica's:
        // slant does not move advance widths. That sharing must therefore
        // never raise `s14VariantApprox` — only a WEIGHT class sharing the
        // regular table is an approximation (see S14_APPROX_PROBE).
        expect(s14.face('italic').record.widths)
            .toBe(s14.face('regular').record.widths);
        expect(s14.widthOf(REFERENCE, 'italic', REFERENCE_SIZE))
            .toBeCloseTo(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE), 9);
    });
});

describe('createMeasurer — embedded route on caller-supplied bytes (D-A)', () => {
    test('the corpus recipe yields the four Latin Calibri faces', () => {
        expect(Object.keys(corpusFonts).sort())
            .toEqual(['bold', 'boldItalic', 'italic', 'regular']);
        for (const bytes of Object.values(corpusFonts)) {
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBeGreaterThan(0);
        }
    });

    test('four supplied faces + Standard 14 Courier is the `mixed` route', () => {
        expect(mixed.route).toBe('mixed');
        expect(mixed.fallbacks).toEqual(['code']);
        for (const style of ['regular', 'bold', 'italic', 'boldItalic']) {
            const face = mixed.face(style);
            expect(face.source).toBe('embedded');
            expect(face.unitsPerEm).toBe(2048);
            expect(face.baseFont.startsWith('Calibri')).toBe(true);
            expect(typeof face.font.advanceWidth).toBe('function');
            expect(typeof face.font.glyphIndexForCodePoint).toBe('function');
            expect(face.record).toBeUndefined();
        }
        expect(mixed.face('code').source).toBe('standard14');
        expect(mixed.face('code').baseFont).toBe('Courier');
    });

    test('MEASUREMENT — leg-A reference widths on the real Calibri faces at 11pt', () => {
        expect(mixed.widthOf(REFERENCE, 'regular', REFERENCE_SIZE)).toBeCloseTo(260.036, 3);
        expect(mixed.widthOf(REFERENCE, 'bold', REFERENCE_SIZE)).toBeCloseTo(261.116, 3);
        expect(mixed.widthOf(REFERENCE, 'italic', REFERENCE_SIZE)).toBeCloseTo(257.549, 3);
        expect(mixed.widthOf(REFERENCE, 'boldItalic', REFERENCE_SIZE)).toBeCloseTo(264.784, 3);
        // The `code` class fell back, so it measures on the S14 Courier table.
        expect(mixed.widthOf(REFERENCE, 'code', REFERENCE_SIZE)).toBeCloseTo(356.400, 3);
    });

    test('the embedded faces discriminate weight (a cheap oracle on the tables)', () => {
        expect(mixed.widthOf(REFERENCE, 'bold', REFERENCE_SIZE))
            .toBeGreaterThan(mixed.widthOf(REFERENCE, 'regular', REFERENCE_SIZE));
    });

    test('an unmapped code point takes the .notdef (glyph 0) advance', () => {
        const font = mixed.face('regular').font;
        const notdef = font.advanceWidth(0) * REFERENCE_SIZE / font.unitsPerEm;
        expect(mixed.widthOf('中', 'regular', REFERENCE_SIZE)).toBeCloseTo(notdef, 9);
    });

    test('supplying every class, `mono` included, is the pure `embedded` route', () => {
        // The corpus embeds no monospace face; the Calibri regular program
        // stands in for one — the point under test is the ROUTE, not the face.
        const all = metrics.createMeasurer({
            fonts: { ...corpusFonts, mono: corpusFonts.regular }
        });
        expect(all.route).toBe('embedded');
        expect(all.fallbacks).toEqual([]);
        expect(all.face('code').source).toBe('embedded');
        expect(all.s14VariantApprox).toBe(false);
    });

    test('a single supplied face is still the `mixed` route, with the rest listed', () => {
        const one = metrics.createMeasurer({ fonts: { regular: corpusFonts.regular } });
        expect(one.route).toBe('mixed');
        expect(one.fallbacks).toEqual(['bold', 'italic', 'boldItalic', 'code']);
        expect(one.face('bold').source).toBe('standard14');
    });

    test('an empty fonts block is the Standard 14 route, not a 5-way fallback', () => {
        const empty = metrics.createMeasurer({ fonts: {} });
        expect(empty.route).toBe('standard14');
        expect(empty.fallbacks).toEqual([]);
    });
});

describe('createMeasurer — errors', () => {
    test('unreadable bytes throw `oconv: bad pdf font <style>` wrapping the fonts error', () => {
        const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(() => metrics.createMeasurer({ fonts: { italic: junk } }))
            .toThrow('oconv: bad pdf font italic');
        try {
            metrics.createMeasurer({ fonts: { mono: junk } });
            throw new Error('expected a throw');
        } catch (err) {
            expect(err.message).toBe('oconv: bad pdf font code');
            expect(err.cause).toBeInstanceOf(Error);
        }
    });

    test('an unknown fonts key is rejected by name rather than silently ignored', () => {
        expect(() => metrics.createMeasurer({ fonts: { Regular: corpusFonts.regular } }))
            .toThrow('oconv: bad pdf font Regular');
        expect(() => metrics.createMeasurer({ fonts: { code: corpusFonts.regular } }))
            .toThrow('oconv: bad pdf font code');
    });
});

describe('createMeasurer — default-face tier (opts.defaultFonts, per-class precedence)', () => {
    test('C1 — defaultFonts absent is byte-identical to today (G-OF1)', () => {
        const noDefaults = metrics.createMeasurer();
        expect(noDefaults.route).toBe(s14.route);
        expect(noDefaults.fallbacks).toEqual(s14.fallbacks);
        expect(noDefaults.s14VariantApprox).toBe(s14.s14VariantApprox);
        expect(noDefaults.widthOf(REFERENCE, 'regular', REFERENCE_SIZE))
            .toBe(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE));

        const mixedNoDefaults = metrics.createMeasurer({ fonts: { ...corpusFonts } });
        expect(mixedNoDefaults.route).toBe(mixed.route);
        expect(mixedNoDefaults.fallbacks).toEqual(mixed.fallbacks);
        expect(mixedNoDefaults.widthOf(REFERENCE, 'bold', REFERENCE_SIZE))
            .toBe(mixed.widthOf(REFERENCE, 'bold', REFERENCE_SIZE));
    });

    test('`defaultFonts: null` is identical to absent', () => {
        const withNull = metrics.createMeasurer({ defaultFonts: null });
        expect(withNull.route).toBe('standard14');
        expect(withNull.fallbacks).toEqual([]);
        expect(withNull.widthOf(REFERENCE, 'regular', REFERENCE_SIZE))
            .toBe(s14.widthOf(REFERENCE, 'regular', REFERENCE_SIZE));
    });

    test('C2 — defaultFonts supplying every mined face resolves every class to it', () => {
        const allDefaults = {
            regular:    corpusFonts.bold,
            bold:       corpusFonts.italic,
            italic:     corpusFonts.boldItalic,
            boldItalic: corpusFonts.regular,
            mono:       corpusFonts.regular
        };
        const m = metrics.createMeasurer({ defaultFonts: allDefaults });
        expect(m.fallbacks).toEqual([]);
        expect(m.route).toBe('embedded');
        expect(m.face('regular').source).toBe('embedded');
        expect(m.face('regular').baseFont).toBe('Calibri-Bold');
        expect(m.face('bold').baseFont).toBe('Calibri-Italic');
        expect(m.face('italic').baseFont).toBe('Calibri-BoldItalic');
        expect(m.face('boldItalic').baseFont).toBe('Calibri');
        expect(m.face('code').source).toBe('embedded');
        expect(m.face('code').baseFont).toBe('Calibri');
    });

    test('C3 — frozen per-class precedence (descriptor.md worked example): explicit regular, default the rest', () => {
        const A = corpusFonts.regular;   // 'Calibri'
        const B = corpusFonts.bold;      // 'Calibri-Bold'
        const m = metrics.createMeasurer({
            fonts:        { regular: A },
            defaultFonts: { bold: B, italic: B, boldItalic: B, mono: B }
        });
        expect(m.face('regular').source).toBe('embedded');
        expect(m.face('regular').baseFont).toBe('Calibri');
        for (const style of ['bold', 'italic', 'boldItalic', 'code']) {
            expect(m.face(style).source).toBe('embedded');
            expect(m.face(style).baseFont).toBe('Calibri-Bold');
        }
        expect(m.fallbacks).toEqual([]);
        expect(m.route).toBe('embedded');
    });

    test('explicit wins over default for the SAME class (two distinct mined faces)', () => {
        const explicitBytes = corpusFonts.italic;     // 'Calibri-Italic'
        const defaultBytes = corpusFonts.boldItalic;  // 'Calibri-BoldItalic'
        const m = metrics.createMeasurer({
            fonts:        { regular: explicitBytes },
            defaultFonts: { regular: defaultBytes }
        });
        expect(m.face('regular').source).toBe('embedded');
        expect(m.face('regular').baseFont).toBe('Calibri-Italic');
        expect(m.fallbacks).toEqual(['bold', 'italic', 'boldItalic', 'code']);
    });

    test('a partial default map with no `fonts`: uncovered classes fall back to Standard 14, route mixed', () => {
        const m = metrics.createMeasurer({
            defaultFonts: { regular: corpusFonts.regular, bold: corpusFonts.bold }
        });
        expect(m.face('regular').source).toBe('embedded');
        expect(m.face('bold').source).toBe('embedded');
        expect(m.face('italic').source).toBe('standard14');
        expect(m.face('boldItalic').source).toBe('standard14');
        expect(m.face('code').source).toBe('standard14');
        expect(m.fallbacks).toEqual(['italic', 'boldItalic', 'code']);
        expect(m.route).toBe('mixed');
    });

    test('embeddedCount counts both the explicit AND default tiers for the route rule', () => {
        // Two default-only classes + one explicit-only class = 3 of 5 -> mixed,
        // never 'embedded' (would require all five) nor 'standard14'.
        const m = metrics.createMeasurer({
            fonts:        { regular: corpusFonts.regular },
            defaultFonts: { bold: corpusFonts.bold, italic: corpusFonts.italic }
        });
        expect(m.route).toBe('mixed');
        expect(m.fallbacks).toEqual(['boldItalic', 'code']);
    });
});

describe('createMeasurer — default-face tier errors', () => {
    test('an unknown defaultFonts key throws `oconv: bad default font <key>`', () => {
        expect(() => metrics.createMeasurer({ defaultFonts: { Regular: corpusFonts.regular } }))
            .toThrow('oconv: bad default font Regular');
        expect(() => metrics.createMeasurer({ defaultFonts: { code: corpusFonts.regular } }))
            .toThrow('oconv: bad default font code');
    });

    test('unreadable defaultFonts bytes throw `oconv: bad default font <style>` wrapping the fonts error', () => {
        const junk = new Uint8Array(16);
        try {
            metrics.createMeasurer({ defaultFonts: { italic: junk } });
            throw new Error('expected a throw');
        } catch (err) {
            expect(err.message).toBe('oconv: bad default font italic');
            expect(err.cause).toBeInstanceOf(Error);
        }
    });

    test('an explicit unknown key throws `oconv: bad pdf font <key>` before defaultFonts is even validated', () => {
        expect(() => metrics.createMeasurer({
            fonts:        { Regular: corpusFonts.regular },
            defaultFonts: { BadKey: corpusFonts.regular }
        })).toThrow('oconv: bad pdf font Regular');
    });
});
