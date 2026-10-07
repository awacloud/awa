// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview High-level `Glyph` object — wraps the parsed glyf entry
 * (outline `path`, `bbox`, composite `components`) with the advance / lsb
 * pulled from `hmtx` and an optional PostScript name from `post`.
 *
 * Strict factory body.
 *
 * @module fonts/glyph/glyph
 */

/**
 * @typedef {object} GlyphInit
 * @property {number} id
 * @property {string} [name]
 * @property {number} advanceWidth
 * @property {number} lsb
 * @property {object} [bbox]
 * @property {object} [path]
 * @property {Array}  [components]
 */

export const fontGlyph = {
    name: 'fontGlyph',
    dependencies: [],
    factory() {
        class Glyph {
            /** @param {GlyphInit} init */
            constructor(init) {
                this.id   = init.id | 0;
                this.name = init.name;
                this.advanceWidth = init.advanceWidth | 0;
                this.lsb  = init.lsb | 0;
                this.bbox = init.bbox || null;
                this.path = init.path || null;
                this.components = init.components || null;
            }

            /** True if the glyph has no outline data (e.g. space). */
            isEmpty() {
                return !this.path || this.path.commands.length === 0;
            }

            /** True for composite glyphs (resolved or not). */
            isComposite() { return !!this.components; }
        }
        return { Glyph };
    }
};
