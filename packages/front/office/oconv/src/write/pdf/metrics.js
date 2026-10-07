// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Style-class → face resolution and advance measurement for the
 * `md → pdf` bounded typesetter, through three font tiers resolved PER
 * STYLE CLASS (the font routes):
 *
 * 1. **Explicit (caller-supplied)** — the caller hands raw font bytes per
 *    style class in `opts.fonts`; `fonts.read(bytes)` parses them and the
 *    public `glyphIndexForCodePoint(cp)` / `advanceWidth(gid)` /
 *    `unitsPerEm` trio provides the advances.
 * 2. **Default (registered face pack)** — `opts.defaultFonts`, the same
 *    per-class font-bytes shape, supplied by the `oconvIrToPdf` facade from
 *    a registered default face pack descriptor or a posted face map.
 *    Same parse path as the explicit tier; wins over Standard
 *    14 but never over an explicit entry for the SAME class.
 * 3. **Standard 14 (fallback)** — `standard14Lookup.lookupStandard14(name)`
 *    (the published `@awacloud/fonts/standard14` sub-path), a 256-slot
 *    1000-units-per-em width table indexed by the **WinAnsi** byte. No font
 *    program is vendored, embedded or downloaded by this package.
 *
 * All three tiers are normalised behind ONE measurer shape so the linebreak,
 * stack and renderer stages are tier-agnostic. Mixing is allowed: a style
 * class resolved from tier 3 is listed in `measurer.fallbacks` (the FACADE
 * records `layout/font-fallback` per entry — this module records no loss
 * itself and stays pure).
 *
 * **No corpus mining lives here.** The `embeddedFacesFromPdf` recipe
 * (walk a PDF's `/Font` resources → `FontFile2` → `fonts.read`) is a TEST
 * fixture recipe only and lives in `metrics.test.js`; `src/` never
 * reaches into a PDF to find a font.
 *
 * **WinAnsi coverage on the Standard 14 route (closed).**
 * `@awacloud/fonts`' Standard 14 width tables now cover the full WinAnsi
 * byte map: the 95 printable-ASCII slots (0x20–0x7E) plus the 123 filled
 * high slots (0x80–0xFF — every Latin-1 letter and every CP1252 punctuation
 * slot `winAnsiByte` maps). A character `winAnsiByte` maps therefore
 * measures from its real advance; only a genuinely unrepresentable code
 * point (`winAnsiByte` returns `null`) degrades to the `'?'` width, matching
 * what the renderer actually puts on the page. Pinned by the regression
 * guard in `metrics.test.js` ("WinAnsi bytes above 0x7E measure on their
 * real advance — the upstream Standard 14 gap is CLOSED").
 *
 * v1 measures **plain advance sums**: no kerning and no shaping (the
 * composition path to `tableKern.parseKern` exists but the
 * subsets carry no `kern`/`GPOS` data, and the bounded typesetter refuses
 * shaping).
 *
 * The `winAnsiByte` helper is published on this module's API so the text
 * renderer encodes with the SAME CP1252 table the widths
 * were measured with — one table in the package, measured and emitted from
 * one place.
 *
 * Worker-safe: plain data and closures over the resolved `standard14Lookup` /
 * `fonts` APIs; font bytes travel by structured clone. The factory is
 * capture-free (`fw/no-factory-capture`).
 *
 * @module oconv/write/pdf/metrics
 */

/**
 * Text-metrics module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfMetrics')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `STYLE_CLASSES` | `['regular','bold','italic','boldItalic','code']` |
 * | `S14_FACES` | style class → Standard 14 base font name |
 * | `styleOfRun(run)` | IR run flags → style class (`code` wins) |
 * | `winAnsiByte(cp)` | CP1252 byte, or `null` when unrepresentable |
 * | `createMeasurer(opts?)` | `Measurer` |
 *
 * `Measurer` members:
 *
 * | Member | Meaning |
 * |---|---|
 * | `route` | `'standard14'` \| `'embedded'` \| `'mixed'` |
 * | `face(style)` | frozen face record (see {@link createMeasurer}) |
 * | `widthOf(text, style, sizePt)` | advance sum, points |
 * | `fallbacks` | style classes that fell back to Standard 14 |
 * | `s14VariantApprox` | Standard 14 bold metrics are the regular table |
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (s14: object, fontsApi: object) => object}}
 */
import { standard14Lookup } from '@awacloud/fonts';
import { fonts } from '@awacloud/fonts';

export const oconvPdfMetrics = {
    name: 'oconvPdfMetrics',
    dependencies: ['standard14Lookup', 'fonts'],
    deps: [standard14Lookup, fonts],

    factory(standard14, fontsApi) {
        /**
         * The five style classes the bounded typesetter needs. `code` is the
         * monospace class (fenced code blocks + inline code runs).
         */
        const STYLE_CLASSES = Object.freeze(['regular', 'bold', 'italic', 'boldItalic', 'code']);

        /** Style class → Standard 14 base font (the default route). */
        const S14_FACES = Object.freeze({
            regular:    'Helvetica',
            bold:       'Helvetica-Bold',
            italic:     'Helvetica-Oblique',
            boldItalic: 'Helvetica-BoldOblique',
            code:       'Courier'
        });

        /**
         * Style class → key in `opts.fonts`. The monospace class is spelled
         * `mono` on the option block (it names a FACE, not a run flag) while
         * the style class stays `code` (it names a run flag).
         */
        const FONT_OPT_KEY = Object.freeze({
            regular:    'regular',
            bold:       'bold',
            italic:     'italic',
            boldItalic: 'boldItalic',
            code:       'mono'
        });

        /**
         * Standard 14 style classes whose width table MUST differ from the
         * regular one for the measurement to be exact.
         *
         * Adobe's own Core 14 metrics give an OBLIQUE cut the same advances
         * as its upright counterpart (slant does not change advance widths),
         * so `Helvetica-Oblique` sharing `Helvetica`'s table is EXACT, not an
         * approximation. Only a WEIGHT change must move the widths — hence
         * the bold-bearing classes are the diagnostic ones for
         * `s14VariantApprox` — a DEFENSIVE probe that fires only if the
         * fonts package regresses to a shared width table across Standard
         * 14 variants (the fonts package now ships real per-variant
         * tables); not reachable against the real
         * `@awacloud/fonts`.
         */
        const S14_APPROX_PROBE = Object.freeze(['bold', 'boldItalic']);

        /** WinAnsi's own 0x80–0x9F punctuation band, code point → byte. */
        const WINANSI_HIGH = Object.freeze({
            0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
            0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
            0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
            0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
            0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
            0x017E: 0x9E, 0x0178: 0x9F
        });

        /** The byte an unrepresentable code point degrades to: `'?'`. */
        const QUESTION_MARK = 0x3F;

        /**
         * WinAnsi (CP1252) byte for a code point, or `null` when the
         * encoding cannot represent it. Latin-1 passes straight through; the
         * 0x80–0x9F band holds CP1252's own punctuation, mapped explicitly.
         *
         * Published here so
         * the renderer encodes with the same table the widths came from.
         *
         * @param {number} cp Unicode code point.
         * @returns {number|null} Byte value, or `null`.
         */
        function winAnsiByte(cp) {
            if (cp >= 0x20 && cp <= 0x7E) return cp;
            if (cp >= 0xA0 && cp <= 0xFF) return cp;
            if (WINANSI_HIGH[cp] !== undefined) return WINANSI_HIGH[cp];
            return null;
        }

        /**
         * Map an IR `run` node's style flags onto a style class.
         *
         * `code` wins over every emphasis flag (a monospace face carries no
         * bold/italic cut on either route), then `bold + italic` collapses to
         * `boldItalic`.
         *
         * @param {{bold?: boolean, italic?: boolean, code?: boolean}} run
         * @returns {string} One of {@link STYLE_CLASSES}.
         */
        function styleOfRun(run) {
            if (run && run.code) return 'code';
            if (run && run.bold && run.italic) return 'boldItalic';
            if (run && run.bold) return 'bold';
            if (run && run.italic) return 'italic';
            return 'regular';
        }

        /** Standard 14 face record for one style class. */
        function s14Face(style) {
            const baseFont = S14_FACES[style];
            const record = standard14.lookupStandard14(baseFont);
            return Object.freeze({
                style,
                baseFont,
                source: 'standard14',
                unitsPerEm: 1000,
                ascent: record.ascent,
                descent: record.descent,
                capHeight: record.capHeight,
                record
            });
        }

        /**
         * Parse caller-supplied font bytes into an embedded face record.
         *
         * @param {string} style Style class the bytes were supplied for.
         * @param {Uint8Array} bytes A whole font program (sfnt).
         * @param {string} messagePrefix `'bad pdf font'` for the explicit
         *   tier, `'bad default font'` for the default tier — the two
         *   callers share this parse path but throw distinct messages.
         * @returns {object} Frozen face record.
         * @throws {Error} `oconv: <messagePrefix> <style>`, the
         *   `@awacloud/fonts` failure attached as `cause`.
         */
        function embeddedFace(style, bytes, messagePrefix) {
            let font;
            try {
                font = fontsApi.read(bytes);
            } catch (err) {
                throw new Error(`oconv: ${messagePrefix} ${style}`, { cause: err });
            }
            return Object.freeze({
                style,
                baseFont: (font.names && font.names.postScriptName) || style,
                source: 'embedded',
                unitsPerEm: font.unitsPerEm,
                ascent: font.hhea ? font.hhea.ascender : undefined,
                descent: font.hhea ? font.hhea.descender : undefined,
                capHeight: font.os2 ? font.os2.sCapHeight : undefined,
                font
            });
        }

        /**
         * Build a measurer over the three tiers, resolved PER STYLE CLASS:
         * explicit `opts.fonts[<class>]` > default `opts.defaultFonts[<class>]`
         * > Standard 14.
         *
         * `opts.fonts` and `opts.defaultFonts` are both the caller's
         * per-style font-program map (the embedded tiers run on
         * caller-supplied bytes only — this package ships no font). Keys:
         * `regular`, `bold`, `italic`, `boldItalic`, `mono` (the
         * monospace/`code` class). `opts.defaultFonts` absent, `undefined`
         * or `null` leaves every existing call byte-identical to before this
         * tier existed. Every style class resolved from neither map
         * falls back to its Standard 14 face and is listed in `fallbacks`.
         *
         * Face record: `{ style, baseFont, source, unitsPerEm, ascent,
         * descent, capHeight, font? , record? }` — `font` is the parsed
         * `@awacloud/fonts` `Font` on an embedded (explicit or default)
         * tier, `record` the AFM metrics record on the Standard 14 tier.
         *
         * @param {{fonts?: Object<string, Uint8Array>,
         *           defaultFonts?: Object<string, Uint8Array>}} [opts]
         * @returns {object} Frozen `Measurer`.
         * @throws {Error} `oconv: bad pdf font <key>` on an unknown
         *   `opts.fonts` key, or on explicit bytes `@awacloud/fonts` cannot
         *   read (style name in place of `<key>`); `oconv: bad default font
         *   <key>` for the same two cases on `opts.defaultFonts`. The
         *   `opts.fonts` unknown-key check runs first, then every own key of
         *   `opts.defaultFonts`, both before any font is parsed.
         */
        function createMeasurer(opts) {
            const supplied = (opts && opts.fonts) || {};
            const defaults = (opts && opts.defaultFonts) || {};
            const optKeys = Object.values(FONT_OPT_KEY);
            for (const key of Object.keys(supplied)) {
                if (!optKeys.includes(key)) throw new Error(`oconv: bad pdf font ${key}`);
            }
            for (const key of Object.keys(defaults)) {
                if (!optKeys.includes(key)) throw new Error(`oconv: bad default font ${key}`);
            }

            const faces = {};
            const fallbacks = [];
            let embeddedCount = 0;

            for (const style of STYLE_CLASSES) {
                const key = FONT_OPT_KEY[style];
                const explicitBytes = supplied[key];
                const defaultBytes = defaults[key];
                if (explicitBytes !== undefined && explicitBytes !== null) {
                    faces[style] = embeddedFace(style, explicitBytes, 'bad pdf font');
                    embeddedCount += 1;
                } else if (defaultBytes !== undefined && defaultBytes !== null) {
                    faces[style] = embeddedFace(style, defaultBytes, 'bad default font');
                    embeddedCount += 1;
                } else {
                    faces[style] = s14Face(style);
                    fallbacks.push(style);
                }
            }

            // On the pure Standard 14 route nothing "fell back": it is the
            // chosen route, and the facade must not record a font-fallback
            // loss for a document that never asked for an embedded face.
            const reportedFallbacks = Object.freeze(embeddedCount === 0 ? [] : [...fallbacks]);

            const route = embeddedCount === 0
                ? 'standard14'
                : (embeddedCount === STYLE_CLASSES.length ? 'embedded' : 'mixed');

            const regularWidths = standard14.lookupStandard14(S14_FACES.regular).widths;
            const s14VariantApprox = S14_APPROX_PROBE.some((style) => {
                const face = faces[style];
                return face.source === 'standard14' && face.record.widths === regularWidths;
            });

            /**
             * Face record for a style class; an unknown class degrades to
             * `regular` (the linebreaker never invents a class, but a
             * renderer stub might pass one through).
             *
             * @param {string} style
             * @returns {object}
             */
            function face(style) {
                return faces[style] || faces.regular;
            }

            /**
             * Advance width of `text` in `style` at `sizePt`, in points.
             *
             * Plain sum of per-glyph advances — no kerning, no shaping.
             * Unrepresentable code points do not throw: on the embedded
             * route they take the `.notdef` (glyph 0) advance, on the
             * Standard 14 route the `'?'` width, matching what the renderer
             * will actually put on the page.
             *
             * @param {string} text
             * @param {string} style One of {@link STYLE_CLASSES}.
             * @param {number} sizePt Type size in points.
             * @returns {number} Points.
             */
            function widthOf(text, style, sizePt) {
                const f = face(style);
                let units = 0;
                if (f.source === 'embedded') {
                    const font = f.font;
                    for (const ch of String(text)) {
                        const gid = font.glyphIndexForCodePoint(ch.codePointAt(0));
                        units += (gid === undefined || gid === null)
                            ? font.advanceWidth(0)
                            : font.advanceWidth(gid);
                    }
                } else {
                    const widths = f.record.widths;
                    for (const ch of String(text)) {
                        const byte = winAnsiByte(ch.codePointAt(0));
                        const w = byte === null ? undefined : widths[byte];
                        units += w || widths[QUESTION_MARK];
                    }
                }
                return units * sizePt / f.unitsPerEm;
            }

            return Object.freeze({
                route,
                face,
                widthOf,
                fallbacks: reportedFallbacks,
                s14VariantApprox
            });
        }

        return { STYLE_CLASSES, S14_FACES, styleOfRun, winAnsiByte, createMeasurer };
    }
};
