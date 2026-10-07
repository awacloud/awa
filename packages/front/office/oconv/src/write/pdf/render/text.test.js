// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit tests for `oconvPdfRenderText.pageContent` — the content-stream
 * emitter of the `md → pdf` bounded typesetter.
 *
 * Everything here is asserted on the EMITTED BYTES decoded as Latin-1, which
 * is the only honest oracle for a content stream: a WinAnsi literal string is
 * not UTF-8, so `TextDecoder('utf-8')` would mangle exactly the bytes these
 * tests are about.
 */
import { describe, test, expect } from 'bun:test';
import { pdfWriterRuntime } from '../_test-runtime.js';
import { oconvPdfRenderText } from './text.js';

const runtime = pdfWriterRuntime();
const renderText = runtime.resolve('oconvPdfRenderText');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');

const measurer = metrics.createMeasurer();

/** Latin-1 view of the emitted bytes — one char per byte, no re-encoding. */
function latin1(bytes) {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
}

/** The Standard 14 font map the facade builds, minus the facade. */
function s14Fonts() {
    const names = { regular: 'FR', bold: 'FB', italic: 'FI', boldItalic: 'FZ', code: 'FM' };
    const fonts = {};
    for (const style of metrics.STYLE_CLASSES) {
        fonts[style] = {
            res: names[style],
            source: 'standard14',
            baseFont: measurer.face(style).baseFont,
            widthOf: (text, sizePt) => measurer.widthOf(text, style, sizePt)
        };
    }
    return fonts;
}

/** A word token, measured with the Standard 14 measurer. */
function token(text, style = 'regular', sizePt = 11) {
    return {
        kind: /^\s+$/.test(text) ? 'space' : 'word',
        text, style, width: measurer.widthOf(text, style, sizePt), link: null
    };
}

/** One text item, as `stackPages` produces it. */
function textItem(tokens, over = {}) {
    return {
        x: 56.693, y: 700, style: tokens[0] ? tokens[0].style : 'regular',
        sizePt: 11, tokens, index: '0', kind: 'paragraph', ...over
    };
}

describe('oconvPdfRenderText — descriptor', () => {
    test('name and declared dependencies are the frozen shape', () => {
        expect(oconvPdfRenderText.name).toBe('oconvPdfRenderText');
        expect(oconvPdfRenderText.dependencies).toEqual(['oconvPdfMetrics']);
    });

    test('the resolved instance exposes exactly `pageContent`', () => {
        expect(Object.keys(renderText).sort()).toEqual(['pageContent']);
        expect(typeof renderText.pageContent).toBe('function');
    });

    test('the factory is capture-free (fw/no-factory-capture): it runs in a bare scope', () => {
        // Rebuilding the factory from its own source in an empty scope is a
        // far stronger proof than grepping for imports (office memory,
        // 2026-08-25): a captured module-scope binding throws here.
        // `factory(){…}` is a method shorthand, so it needs the `function`
        // keyword prepended before it can be re-parsed as an expression.
        const rebuilt = new Function(
            'return (function ' + oconvPdfRenderText.factory.toString() + ')'
        )();
        expect(typeof rebuilt(metrics).pageContent).toBe('function');
    });
});

describe('pageContent — Standard 14 route', () => {
    const layout = box.resolveLayout({ pageNumbers: false });

    test('every style segment gets its OWN BT/Tm/Tj/ET block with an explicit matrix', () => {
        const losses = [];
        const { bytes, usedFonts } = renderText.pageContent(
            { number: 1, items: [textItem([token('Hello'), token(' '), token('world', 'bold')])] },
            s14Fonts(), layout, losses
        );
        const text = latin1(bytes);
        // Three segments: regular "Hello ", then the bold "world" — the
        // space token shares the regular class and merges into segment one.
        expect(text.match(/BT /g).length).toBe(2);
        expect(text.match(/ Tj ET/g).length).toBe(2);
        expect(text).toContain('/FR 11 Tf 1 0 0 1 56.693 700 Tm (Hello )');
        expect(text).toMatch(/\/FB 11 Tf 1 0 0 1 [\d.]+ 700 Tm \(world\)/);
        expect([...usedFonts].sort()).toEqual(['FB', 'FR']);
        expect(losses).toEqual([]);
    });

    test('a segment starts exactly where the previous one ended (advance sum, not an implicit advance)', () => {
        const first = token('Hello');
        const space = token(' ');
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([first, space, token('world', 'bold')])] },
            s14Fonts(), layout, []
        );
        const m = latin1(bytes).match(/\/FB 11 Tf 1 0 0 1 ([\d.]+) 700 Tm/);
        const expected = Math.round((56.693 + first.width + space.width) * 1000) / 1000;
        expect(Number(m[1])).toBeCloseTo(expected, 3);
    });

    test('the three literal-string escapes are emitted', () => {
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([token('a(b)c\\d')])] },
            s14Fonts(), layout, []
        );
        expect(latin1(bytes)).toContain('(a\\(b\\)c\\\\d)');
    });

    test('Latin-1 and CP1252 punctuation reach the page as their WinAnsi byte', () => {
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([token('café—ok')])] },
            s14Fonts(), layout, []
        );
        const text = latin1(bytes);
        expect(text).toContain('café');                      // 0xE9 straight through
        expect(text.charCodeAt(text.indexOf('café') + 4)).toBe(0x97);  // em dash → 0x97
    });

    test('an unrepresentable code point becomes `?` and is RECORDED, never dropped', () => {
        const losses = [];
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([token('a中文b')])] },
            s14Fonts(), layout, losses
        );
        expect(latin1(bytes)).toContain('(a??b)');
        expect(losses.map((l) => l.char)).toEqual(['中', '文']);
        expect(losses[0]).toEqual({
            char: '中', codePoint: 0x4E2D, index: '0', kind: 'paragraph'
        });
    });

    test('a whitespace-only segment IS emitted — it is the only word separator two foreign styles have', () => {
        // Falsification of the spike's `emit.js` skip: with the space token
        // in a THIRD style, dropping it welds the neighbours together for
        // every downstream text extractor.
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([
                token('one', 'italic'), token(' '), token('two', 'bold')
            ])] },
            s14Fonts(), layout, []
        );
        const text = latin1(bytes);
        expect(text.match(/BT /g).length).toBe(3);
        expect(text).toContain('( )');
    });

    test('an empty segment is skipped', () => {
        const { bytes, usedFonts } = renderText.pageContent(
            { number: 1, items: [textItem([], { style: 'regular' })] },
            s14Fonts(), layout, []
        );
        expect(bytes.length).toBe(0);
        expect(usedFonts.size).toBe(0);
    });

    test('a segment whose style has no entry and no `regular` entry throws (BL-1009)', () => {
        const fonts = s14Fonts();
        delete fonts.bold;
        delete fonts.regular;
        expect(() => renderText.pageContent(
            { number: 1, items: [textItem([token('word', 'bold')])] },
            fonts, layout, []
        )).toThrow('oconv: pdf font missing bold');
    });
});

describe('pageContent — no silent empty draw (BL-1009)', () => {
    test('`pageNumbers: true` with a `fonts` map lacking `regular` throws', () => {
        const layout = box.resolveLayout({ pageNumbers: true });
        const fonts = s14Fonts();
        delete fonts.regular;
        expect(() => renderText.pageContent(
            { number: 7, items: [] }, fonts, layout, []
        )).toThrow('oconv: pdf font missing regular');
    });

    test('`pageNumbers: false` with the same map and no text items does not throw — empty stream', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const fonts = s14Fonts();
        delete fonts.regular;
        const { bytes } = renderText.pageContent(
            { number: 7, items: [] }, fonts, layout, []
        );
        expect(bytes.length).toBe(0);
    });
});

describe('pageContent — rules', () => {
    const layout = box.resolveLayout({ pageNumbers: false });

    test('a rule item emits `re f`, and no text', () => {
        const { bytes, usedFonts } = renderText.pageContent({
            number: 1,
            items: [{
                x: 56.693, y: 400, style: 'regular', sizePt: 11, tokens: [],
                index: '2', kind: 'hr', rule: { x: 56.693, y: 400, w: 481.89, h: 0.5 }
            }]
        }, s14Fonts(), layout, []);
        expect(latin1(bytes)).toBe('56.693 400 481.89 0.5 re f\n');
        expect(usedFonts.size).toBe(0);
    });
});

describe('pageContent — page numbers (D-C)', () => {
    test('the number is stamped centred at margin/2, body size, regular face', () => {
        const layout = box.resolveLayout();
        expect(layout.pageNumbers).toBe(true);
        const fonts = s14Fonts();
        const { bytes, usedFonts } = renderText.pageContent(
            { number: 7, items: [] }, fonts, layout, []
        );
        const text = latin1(bytes);
        const width = measurer.widthOf('7', 'regular', layout.baseSize);
        const r3 = (n) => Math.round(n * 1000) / 1000;
        const x = r3((layout.pageWidth - width) / 2);
        const y = r3(layout.margin / 2);
        expect(text).toBe(`BT /FR 11 Tf 1 0 0 1 ${x} ${y} Tm (7) Tj ET\n`);
        expect([...usedFonts]).toEqual(['FR']);
    });

    test('`pageNumbers: false` emits nothing at all for an empty page', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const { bytes } = renderText.pageContent({ number: 7, items: [] }, s14Fonts(), layout, []);
        expect(bytes.length).toBe(0);
    });
});

describe('pageContent — embedded route', () => {
    /**
     * A minimal stand-in for a `pdfFontEmbed` result: only `encode` (and,
     * for the `hasGlyph` tests, `hasGlyph`) is ever called from here. The
     * REAL adapter is exercised end to end in `../../../ir-to-pdf.test.js`
     * against the corpus Calibri faces.
     *
     * @param {object} [over]
     */
    function embeddedEntry(over = {}) {
        return {
            res: 'FR',
            source: 'embedded',
            embedded: { encode: (t) => Uint8Array.from([...String(t)].map((c) => c.charCodeAt(0) & 0xFF)) },
            widthOf: () => 10,
            ...over
        };
    }

    test('an embedded entry emits a HEX string through the embedding\'s own encode', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const fonts = s14Fonts();
        fonts.regular = embeddedEntry();
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([token('Hi')])] }, fonts, layout, []
        );
        expect(latin1(bytes)).toContain('Tm <4869> Tj ET');
    });

    test('a `hasGlyph` returning false for two of five characters (one repeated) records one entry per occurrence', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const noGlyph = new Set(['x']);
        const fonts = s14Fonts();
        fonts.regular = embeddedEntry({ hasGlyph: (cp) => !noGlyph.has(String.fromCodePoint(cp)) });
        const losses = [];
        const withoutHasGlyph = s14Fonts();
        withoutHasGlyph.regular = embeddedEntry();
        const reference = renderText.pageContent(
            { number: 1, items: [textItem([token('axbxc')])] }, withoutHasGlyph, layout, []
        );
        const { bytes } = renderText.pageContent(
            { number: 1, items: [textItem([token('axbxc')])] }, fonts, layout, losses
        );
        expect(losses.length).toBe(2);
        for (const rec of losses) {
            expect(rec).toEqual({ char: 'x', codePoint: 0x78, index: '0', kind: 'paragraph' });
        }
        // Emitted bytes identical to a run without `hasGlyph`.
        expect(latin1(bytes)).toBe(latin1(reference.bytes));
    });

    test('a `hasGlyph` always returning true records nothing', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const fonts = s14Fonts();
        fonts.regular = embeddedEntry({ hasGlyph: () => true });
        const losses = [];
        renderText.pageContent(
            { number: 1, items: [textItem([token('Hi')])] }, fonts, layout, losses
        );
        expect(losses).toEqual([]);
    });

    test('an embedded entry without `hasGlyph` records nothing (backward compatible)', () => {
        const layout = box.resolveLayout({ pageNumbers: false });
        const fonts = s14Fonts();
        fonts.regular = embeddedEntry();
        expect(fonts.regular.hasGlyph).toBeUndefined();
        const losses = [];
        renderText.pageContent(
            { number: 1, items: [textItem([token('Hi')])] }, fonts, layout, losses
        );
        expect(losses).toEqual([]);
    });
});
