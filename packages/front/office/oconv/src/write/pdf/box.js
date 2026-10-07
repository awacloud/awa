// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page geometry and typographic options of the `md → pdf`
 * bounded typesetter — the SINGLE validator of `opts.pdf`.
 *
 * `resolveLayout(pdfOpts)` turns the caller's `opts.pdf` block into a frozen
 * {@link Layout}: page box, margins, the derived text column, and the size /
 * leading functions every later stage (linebreak, stack, renderers) reads.
 *
 * **Single validator** — the writer facade (`../ir-to-pdf.js`)
 * forwards the WHOLE `opts.pdf` object here, so option validation lives in
 * exactly ONE place: an unknown key is rejected here and nowhere else. The
 * `fonts` key is accepted-and-ignored by this module: it carries the
 * caller-supplied embedded font bytes and is consumed by
 * `./metrics.js` `createMeasurer({ fonts })` (the font routes), not by the geometry.
 *
 * Pure module: no I/O, no `@awacloud/*` coupling, `dependencies: []`. The
 * factory is capture-free (`fw/no-factory-capture`): every constant it uses
 * is declared in its own body, so the descriptor survives Worker
 * serialisation and the standalone builder's `factory.toString()` inlining.
 *
 * @module oconv/write/pdf/box
 */

/**
 * Page geometry + type-size resolution module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfBox')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `PAGE_SIZES` | `{ A4: [595.276, 841.89], Letter: [612, 792] }` (pt) |
 * | `DEFAULTS` | the frozen default option block |
 * | `resolveLayout(pdfOpts?)` | `Layout` — throws `oconv: bad pdf option <key>` |
 *
 * `Layout` members:
 *
 * | Member | Meaning |
 * |---|---|
 * | `pageWidth` / `pageHeight` | media box, pt |
 * | `margin` | uniform margin, pt |
 * | `column` | `pageWidth − 2·margin` — the text column width |
 * | `contentHeight` | `pageHeight − 2·margin` |
 * | `baseSize` | body type size, pt |
 * | `leading(sizePt)` | baseline-to-baseline distance = `leadingRatio · sizePt` |
 * | `sizeFor(kind, level)` | `'heading'` → `headingScale[level−1]`, `'code'` → `codeSize`, else `baseSize` |
 * | `codeSize` | monospace type size, pt |
 * | `pageNumbers` | whether the renderer stamps a page number |
 *
 * @type {{name: string, dependencies: string[], factory: () => object}}
 */
export const oconvPdfBox = {
    name: 'oconvPdfBox',
    dependencies: [],

    factory() {
        /** Named page sizes, in PostScript points. */
        const PAGE_SIZES = Object.freeze({
            A4:     Object.freeze([595.276, 841.89]),
            Letter: Object.freeze([612, 792])
        });

        /**
         * Default option block. `margin` is 20 mm, `leadingRatio` 1.32 and
         * `headingScale` holds ABSOLUTE point sizes for heading levels 1–6.
         */
        const DEFAULTS = Object.freeze({
            pageSize:     'A4',
            margin:       56.693,
            baseSize:     11,
            leadingRatio: 1.32,
            headingScale: Object.freeze([22, 18, 15, 13, 12, 11]),
            codeSize:     9.5,
            pageNumbers:  true
        });

        /**
         * Keys accepted on `opts.pdf` that this module does NOT consume:
         * `fonts` carries the caller's embedded font bytes and belongs to
         * `oconvPdfMetrics.createMeasurer`. Listing it here is what
         * lets the facade forward one object to one validator.
         */
        const FORWARDED_KEYS = Object.freeze(['fonts']);

        /** `oconv: bad pdf option <key>` — the ONE option-error shape. */
        function badOption(key) {
            return new Error(`oconv: bad pdf option ${key}`);
        }

        /** A finite number strictly greater than zero. */
        function isPositive(v) {
            return typeof v === 'number' && Number.isFinite(v) && v > 0;
        }

        /**
         * Resolve `pageSize` to `[width, height]` in points.
         *
         * @param {string|number[]} value
         * @returns {number[]}
         */
        function resolvePageSize(value) {
            if (typeof value === 'string') {
                if (!Object.prototype.hasOwnProperty.call(PAGE_SIZES, value)) throw badOption('pageSize');
                return PAGE_SIZES[value];
            }
            if (Array.isArray(value) && value.length === 2 && value.every(isPositive)) {
                return [value[0], value[1]];
            }
            throw badOption('pageSize');
        }

        /**
         * Validate and normalise one `opts.pdf` block.
         *
         * Validated: `pageSize` ∈ {@link PAGE_SIZES} names or a positive
         * `[w, h]` pair; `margin` ≥ 0 with `2·margin < min(w, h)`;
         * `baseSize` > 0; `leadingRatio` > 0; `codeSize` > 0; `headingScale`
         * = six positive numbers; `pageNumbers` boolean. Any key outside
         * {@link DEFAULTS} + {@link FORWARDED_KEYS} throws
         * `oconv: bad pdf option <key>`.
         *
         * @param {object} [pdfOpts] The caller's `opts.pdf` block.
         * @returns {object} A frozen `Layout`.
         * @throws {Error} `oconv: bad pdf option <key>` on any invalid entry.
         */
        function resolveLayout(pdfOpts) {
            if (pdfOpts !== undefined && pdfOpts !== null
                && (typeof pdfOpts !== 'object' || Array.isArray(pdfOpts))) {
                throw badOption('pdf');
            }
            const opts = pdfOpts || {};

            for (const key of Object.keys(opts)) {
                if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)
                    && !FORWARDED_KEYS.includes(key)) throw badOption(key);
            }

            const pick = (key) => (opts[key] === undefined ? DEFAULTS[key] : opts[key]);

            const [pageWidth, pageHeight] = resolvePageSize(pick('pageSize'));

            const margin = pick('margin');
            if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0
                || 2 * margin >= Math.min(pageWidth, pageHeight)) throw badOption('margin');

            const baseSize = pick('baseSize');
            if (!isPositive(baseSize)) throw badOption('baseSize');

            const leadingRatio = pick('leadingRatio');
            if (!isPositive(leadingRatio)) throw badOption('leadingRatio');

            const codeSize = pick('codeSize');
            if (!isPositive(codeSize)) throw badOption('codeSize');

            const headingScale = pick('headingScale');
            if (!Array.isArray(headingScale) || headingScale.length !== 6
                || !headingScale.every(isPositive)) throw badOption('headingScale');
            const scale = Object.freeze([...headingScale]);

            const pageNumbers = pick('pageNumbers');
            if (typeof pageNumbers !== 'boolean') throw badOption('pageNumbers');

            return Object.freeze({
                pageWidth,
                pageHeight,
                margin,
                column: pageWidth - 2 * margin,
                contentHeight: pageHeight - 2 * margin,
                baseSize,
                codeSize,
                pageNumbers,

                /**
                 * Baseline-to-baseline distance for a type size.
                 *
                 * @param {number} sizePt
                 * @returns {number} Points.
                 */
                leading(sizePt) {
                    return leadingRatio * sizePt;
                },

                /**
                 * Type size for a block kind.
                 *
                 * @param {string} kind `'heading'`, `'code'`, anything else → body.
                 * @param {number} [level] Heading level; clamped to 1–6.
                 * @returns {number} Points.
                 */
                sizeFor(kind, level) {
                    if (kind === 'heading') {
                        const n = Number.isFinite(level)
                            ? Math.min(6, Math.max(1, Math.trunc(level)))
                            : 1;
                        return scale[n - 1];
                    }
                    if (kind === 'code') return codeSize;
                    return baseSize;
                }
            });
        }

        return { PAGE_SIZES, DEFAULTS, resolveLayout };
    }
};
