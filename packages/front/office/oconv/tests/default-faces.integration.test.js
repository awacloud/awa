// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Default-route integration — office/BATCH_38 task 06, gate G-OF1.
 *
 * The measured proof of the default-face switch on the REAL Liberation pack,
 * driven at the PUBLIC facade (`oconv.fromMd`, via `runtime.resolve('oconv')`
 * on a runtime built from `../src/main.js`), never at the internal
 * `oconvIrToPdf`/`ir-to-pdf.test.js` seam a src-level pin never generalises
 * from (office memory 2026-09-02).
 *
 * The companion package is reached the same way task 03's own tests reach
 * `@awacloud/fw` from a package-less spike: by a RELATIVE path into its
 * `src/`, never a bare `@awacloud/oconv-fonts` specifier — `oconv-fonts` is
 * not a declared dependency of `oconv`, so Bun's workspace resolution cannot
 * see it (office memory 2026-09-09/2026-09-10, the package-less-spike /
 * undeclared-sibling class). `oconv/src` itself never imports it (G-OF1's
 * name-only seam, `write/pdf/default-faces.js`) — only this test file does.
 *
 * Seven legs:
 *
 *  1. C1 — pack absent: Standard 14 only, `text/unencodable` fires.
 *  2. C2 — pack registered before the first `resolve('oconv')`: every used
 *     font embeds Liberation, no fallback, no unencodable, and the Greek /
 *     Cyrillic / Latin Extended-A lines round-trip through `toMd` verbatim.
 *  3. C3 — the frozen worked example (`oconv-fonts/docs/descriptor.md`):
 *     `opts.pdf.fonts.regular` overrides only `regular`; the other four
 *     classes come from the registered pack.
 *  4. CJK honesty (BL-1257): a CJK code point the pack's cmap has no glyph
 *     for still degrades to `text/unencodable`, one record, Latin recovered.
 *  5. Determinism, including invariant 1 (an explicit full font map is
 *     byte-identical with and without the pack registered).
 *  6. Registration order — before `registerAll(modules)` (version
 *     precedence beats registration order), and after the first
 *     `resolve('oconv')` (cached facade needs `invalidate(..., {cascade})`).
 *  7. Covered ranges, reproduced from the W0 spike's own
 *     `leg-e2-coverage.mjs` block table (`LiberationSans-Regular`).
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
// Relative path into the companion package's own src — never the bare
// `@awacloud/oconv-fonts` specifier (see the file header).
import { registerDefaultFaces, loadDefaultFaces } from '../../oconv-fonts/src/main.js';

/** Fresh runtime carrying exactly `@awacloud/oconv`'s own manifest. */
function oconvRuntime() {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    return rt;
}

/** Bytes of a vendored Liberation face, read relative to this test file. */
function vendorFaceBytes(file) {
    return new Uint8Array(readFileSync(new URL(`../../oconv-fonts/vendor/liberation/${file}`, import.meta.url)));
}

/**
 * The `/BaseFont` name of every used font resource, keyed by its PDF
 * resource name (`oconvPdfMetrics.RESOURCE_NAMES` — `FR`/`FB`/`FI`/`FZ`/
 * `FM`) — the parse surface `crossformat-to-pdf.integration.test.js` uses
 * (`pdf.read` + the ref-deref idiom), narrowed to the one field this file
 * needs.
 *
 * @param {ReturnType<typeof pdfApi.read>['pages'][number]} doc
 */
function fontsOf(pdfBytes) {
    const doc = pdfApi.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => ((o && o.type === 'ref') ? resolveRef(o) : o);
    /** @type {Object<string, string>} */
    const out = {};
    for (const page of doc.pages) {
        const res = deref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = deref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const fontDict = deref(fontRes.entries[key]);
            const baseFont = fontDict.entries && fontDict.entries.BaseFont;
            out[key] = baseFont ? baseFont.value : undefined;
        }
    }
    return out;
}

/**
 * Strip a leading `---`/…/`---` front-matter fence and return the body —
 * mirrored from `crossformat-to-pdf.integration.test.js`'s own helper.
 */
function bodyOf(markdown) {
    const lines = markdown.split('\n');
    if (lines[0] !== '---') return markdown;
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i] === '---') { end = i; break; }
    }
    return end < 0 ? markdown : lines.slice(end + 1).join('\n');
}

// `pdfApi` is resolved once per-runtime below (every leg builds its own
// runtime, several of them BEFORE and AFTER registering the pack, which
// `ModuleRuntime`'s instance cache must see as distinct calls) — a single
// module-level `pdf` resolve is fine because `@awacloud/pdf` itself carries no
// state the default-face switch touches; only `oconv`/`oconvIrToPdf` do.
const pdfApi = oconvRuntime().resolve('pdf');

const PDF_OPTS = { pageNumbers: false };

// ---------------------------------------------------------------------------
// The shared sample — plain Latin, Greek, Cyrillic and Latin Extended-A
// lines (each a lowercase, diacritic-light run so it stays inside the
// measured-covered part of the Greek/Cyrillic blocks — leg 7 below), plus a
// fenced code block so the `code` style class (LiberationMono) is exercised
// too. No emphasis: legs 1/2/4/5/6 need only the `regular` + `code` classes.
// ---------------------------------------------------------------------------
const SAMPLE_MD = [
    'Plain English sample text for the default font route.',
    '',
    'Greek line: alpha beta gamma delta epsilon zeta eta theta iota kappa.',
    'ελληνικα αλφα βητα γαμμα δελτα in Greek letters.',
    '',
    'Cyrillic line in Russian letters: привет мир образец текста здесь.',
    '',
    'Latin Extended-A line: čeština dziękuję będzie łódź łąka.',
    '',
    '```',
    'code sample line',
    '```',
    ''
].join('\n');

const GREEK_LINE = 'ελληνικα αλφα βητα γαμμα δελτα in Greek letters.';
const CYRILLIC_LINE = 'Cyrillic line in Russian letters: привет мир образец текста здесь.';
const LATIN_EXT_A_LINE = 'Latin Extended-A line: čeština dziękuję będzie łódź łąka.';

/** `SAMPLE_MD` plus one CJK line — leg 4 only. */
const CJK_MD = `${SAMPLE_MD}\nCJK line: 中文文字样本 here.\n`;

/** Standard 14 base-font names the default (no pack) route can ever emit. */
const STANDARD14_NAMES = new Set([
    'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Courier'
]);

// ---------------------------------------------------------------------------
// C1 — pack absent
// ---------------------------------------------------------------------------

describe('default-faces — C1: pack absent', () => {
    test('fromMd(pdf) of the Latin+Greek+Cyrillic sample stays on Standard 14 and records text/unencodable', async () => {
        const rt = oconvRuntime();
        const oconv = rt.resolve('oconv');
        const written = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });

        expect(written.lossy).toBe(true);
        const unencodable = written.losses.find((l) => l.code === 'text/unencodable');
        expect(unencodable).toBeDefined();
        expect(unencodable.detail.count).toBeGreaterThan(0);
        expect(written.losses.some((l) => l.code === 'layout/font-fallback')).toBe(false);

        const names = fontsOf(written.bytes);
        expect(Object.keys(names).length).toBeGreaterThan(0);
        for (const name of Object.values(names)) {
            expect(STANDARD14_NAMES.has(name)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// C2 — pack registered BEFORE the first resolve('oconv')
// ---------------------------------------------------------------------------

describe('default-faces — C2: pack registered', () => {
    test('every used font embeds Liberation, no fallback, no unencodable, and toMd recovers Greek/Cyrillic/Latin-Ext-A verbatim', async () => {
        const rt = oconvRuntime();
        await registerDefaultFaces(rt);
        const oconv = rt.resolve('oconv');

        const written = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });

        expect(written.losses.some((l) => l.code === 'layout/font-fallback')).toBe(false);
        expect(written.losses.some((l) => l.code === 'text/unencodable')).toBe(false);

        const names = fontsOf(written.bytes);
        expect(Object.keys(names).length).toBeGreaterThan(0);
        for (const name of Object.values(names)) {
            expect(/LiberationSans|LiberationMono/.test(name)).toBe(true);
        }

        const back = await oconv.toMd({ name: 'x.pdf', bytes: written.bytes, convertedAt: '2026-09-14T00:00:00Z' });
        const body = bodyOf(back.markdown);
        expect(body).toContain(GREEK_LINE);
        expect(body).toContain(CYRILLIC_LINE);
        expect(body).toContain(LATIN_EXT_A_LINE);
    });
});

// ---------------------------------------------------------------------------
// C3 — frozen worked example (oconv-fonts/docs/descriptor.md)
// ---------------------------------------------------------------------------

describe('default-faces — C3: frozen worked example (partial override of regular only)', () => {
    const STYLE_MD = [
        'Regular text example for the default route.',
        '',
        '**Bold text example for the default route.**',
        '',
        '*Italic text example for the default route.*',
        '',
        '***Bold italic text example for the default route.***',
        '',
        '`Inline code example.`',
        ''
    ].join('\n');

    test('regular is LiberationSerif (explicit); bold/italic/boldItalic/code are the registered LiberationSans/Mono faces', async () => {
        const rt = oconvRuntime();
        await registerDefaultFaces(rt);
        const oconv = rt.resolve('oconv');

        const regularSerif = vendorFaceBytes('LiberationSerif-Regular.ttf');
        const written = await oconv.fromMd({
            markdown: STYLE_MD,
            target: 'pdf',
            opts: { pdf: { ...PDF_OPTS, fonts: { regular: regularSerif } } }
        });

        expect(written.losses.some((l) => l.code === 'layout/font-fallback')).toBe(false);

        const names = fontsOf(written.bytes);
        // RESOURCE_NAMES (write/ir-to-pdf.js): regular FR, bold FB, italic FI,
        // boldItalic FZ, code FM.
        expect(names.FR).toBeDefined();
        expect(names.FR).toContain('LiberationSerif');
        expect(names.FR).not.toContain('LiberationSans');
        for (const key of ['FB', 'FI', 'FZ']) {
            expect(names[key]).toBeDefined();
            expect(names[key]).toContain('LiberationSans');
        }
        expect(names.FM).toBeDefined();
        expect(names.FM).toContain('LiberationMono');
    });
});

// ---------------------------------------------------------------------------
// CJK honesty (BL-1257)
// ---------------------------------------------------------------------------

describe('default-faces — CJK honesty (BL-1257)', () => {
    test('pack registered + a CJK line: lossy, one text/unencodable, Latin text still recovered', async () => {
        const rt = oconvRuntime();
        await registerDefaultFaces(rt);
        const oconv = rt.resolve('oconv');

        const written = await oconv.fromMd({ markdown: CJK_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });

        expect(written.lossy).toBe(true);
        const unencodable = written.losses.filter((l) => l.code === 'text/unencodable');
        expect(unencodable.length).toBe(1);
        expect(unencodable[0].detail.count).toBeGreaterThan(0);

        const back = await oconv.toMd({ name: 'x.pdf', bytes: written.bytes, convertedAt: '2026-09-14T00:00:00Z' });
        const body = bodyOf(back.markdown);
        expect(body).toContain('Plain English sample text for the default font route.');
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('default-faces — determinism', () => {
    test('two identical calls on the registered route are byte-identical', async () => {
        const rt = oconvRuntime();
        await registerDefaultFaces(rt);
        const oconv = rt.resolve('oconv');

        const a = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });
        const b = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });
        expect([...b.bytes]).toEqual([...a.bytes]);
        expect(b.losses).toEqual(a.losses);
    });

    test('invariant 1 — a call supplying all five classes explicitly is byte-identical with and without the pack registered', async () => {
        const fullMap = await loadDefaultFaces();
        const explicitFonts = {
            regular: fullMap.regular, bold: fullMap.bold, italic: fullMap.italic,
            boldItalic: fullMap.boldItalic, mono: fullMap.mono
        };

        const withoutPack = oconvRuntime().resolve('oconv');
        const withoutPackResult = await withoutPack.fromMd({
            markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: { ...PDF_OPTS, fonts: explicitFonts } }
        });

        const rtWithPack = oconvRuntime();
        await registerDefaultFaces(rtWithPack);
        const withPack = rtWithPack.resolve('oconv');
        const withPackResult = await withPack.fromMd({
            markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: { ...PDF_OPTS, fonts: explicitFonts } }
        });

        expect([...withPackResult.bytes]).toEqual([...withoutPackResult.bytes]);
        expect(withPackResult.losses).toEqual(withoutPackResult.losses);
    });
});

// ---------------------------------------------------------------------------
// Registration order
// ---------------------------------------------------------------------------

describe('default-faces — registration order', () => {
    test('pack registered BEFORE registerAll(modules) still wins over the 0.0.0 stand-in (version precedence)', async () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        await registerDefaultFaces(rt);   // registers oconvDefaultFaces@1.0.0 first
        rt.registerAll(modules);          // also (harmlessly) registers the @0.0.0 stand-in

        expect(rt.has('oconvDefaultFaces', '1.0.0')).toBe(true);
        expect(rt.has('oconvDefaultFaces', '0.0.0')).toBe(true);

        const oconv = rt.resolve('oconv');
        const written = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });

        expect(written.losses.some((l) => l.code === 'layout/font-fallback')).toBe(false);
        expect(written.losses.some((l) => l.code === 'text/unencodable')).toBe(false);
        const names = fontsOf(written.bytes);
        for (const name of Object.values(names)) {
            expect(/LiberationSans|LiberationMono/.test(name)).toBe(true);
        }
    });

    test('pack registered AFTER resolve(\'oconv\') has no effect until invalidate(oconvDefaultFaces, {cascade:true})', async () => {
        const rt = oconvRuntime();
        let oconv = rt.resolve('oconv');

        const before = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });
        expect(before.losses.some((l) => l.code === 'text/unencodable')).toBe(true); // Standard 14 (C1 shape)

        // Registered AFTER the facade already resolved and ran once.
        await registerDefaultFaces(rt);
        expect(rt.has('oconvDefaultFaces', '1.0.0')).toBe(true);

        const stillCached = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });
        expect(stillCached.losses).toEqual(before.losses); // the held `oconv` handle is unaffected

        const { invalidated } = rt.invalidate('oconvDefaultFaces', { cascade: true });
        expect(invalidated.length).toBeGreaterThan(0);

        // A held handle is never upgraded in place (fw JSDoc) — re-resolve.
        oconv = rt.resolve('oconv');
        const afterInvalidate = await oconv.fromMd({ markdown: SAMPLE_MD, target: 'pdf', opts: { pdf: PDF_OPTS } });
        expect(afterInvalidate.losses.some((l) => l.code === 'text/unencodable')).toBe(false);
        expect(afterInvalidate.losses.some((l) => l.code === 'layout/font-fallback')).toBe(false);
        const names = fontsOf(afterInvalidate.bytes);
        for (const name of Object.values(names)) {
            expect(/LiberationSans|LiberationMono/.test(name)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Covered ranges, measured from the cmap (LiberationSans-Regular) —
// block bounds and the "printable" trim reproduced VERBATIM from
// `ai/archives/spikes/oconv-fonts/w0-fonts/leg-e2-coverage.mjs` `BLOCKS`
// (read-only), not approximated: Basic Latin/Latin-1 Supplement already exclude the control
// ranges (0x00-0x1F, 0x7F, 0x80-0x9F) by their first/last bounds.
// ---------------------------------------------------------------------------

describe('default-faces — covered Unicode ranges (measured from the cmap)', () => {
    const BLOCKS = [
        ['Basic Latin', 0x0020, 0x007E, 100],
        ['Latin-1 Supplement', 0x00A0, 0x00FF, 100],
        ['Latin Extended-A', 0x0100, 0x017F, 100],
        ['Cyrillic', 0x0400, 0x04FF, 100],
        ['Greek and Coptic', 0x0370, 0x03FF, 88.2],
        ['Hebrew', 0x0590, 0x05FF, 77.7],
        ['Arabic', 0x0600, 0x06FF, 0],
        ['Devanagari', 0x0900, 0x097F, 0],
        ['Hiragana', 0x3040, 0x309F, 0],
        ['Katakana', 0x30A0, 0x30FF, 0],
        ['CJK Unified Ideographs (first 256)', 0x4E00, 0x4EFF, 0],
        ['Hangul Syllables (first 256)', 0xAC00, 0xACFF, 0]
    ];

    test('LiberationSans-Regular block coverage matches FINDINGS § 6 at one decimal', async () => {
        const rt = oconvRuntime();
        const fontsApi = rt.resolve('fonts');
        const font = fontsApi.read(vendorFaceBytes('LiberationSans-Regular.ttf'));

        for (const [name, first, last, expectedPct] of BLOCKS) {
            let covered = 0;
            const total = last - first + 1;
            for (let cp = first; cp <= last; cp += 1) {
                if (font.glyphIndexForCodePoint(cp)) covered += 1;
            }
            const pct = Number((100 * covered / total).toFixed(1));
            expect(pct).toBe(expectedPct);
        }
    });
});
