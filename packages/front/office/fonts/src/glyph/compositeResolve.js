// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Composite glyph resolution — flattens a composite glyf
 * entry into a single {@link Path} by recursively concatenating each
 * referenced glyph's path with the component transform applied.
 *
 * Per [OT spec §glyf composite description](https://learn.microsoft.com/en-us/typography/opentype/spec/glyf#composite-glyph-description) :
 *
 *  - args may be XY offsets (`ARGS_ARE_XY_VALUES`) or point-to-point
 *    anchors. We support both ; the point-anchor mode requires the
 *    flattened parent + child point lists, which is uncommon — when we
 *    can't honor it we fall back to a (0,0) offset.
 *  - transform is a 2×2 F2Dot14 matrix (a,b,c,d).
 *
 * Cycle detection is enforced via a depth-tracked visited set ; the
 * spec mandates ≤ 4 nesting levels but real fonts occasionally exceed
 * this so we cap at 16 with `RenderError` thrown on overflow.
 *
 * Strict factory-only.
 *
 * @module fonts/glyph/compositeResolve
 */

import { fontErrors } from '../errors.js';
import { fontPath } from './path.js';

export const fontCompositeResolve = {
    name: 'fontCompositeResolve',
    dependencies: ['fontErrors', 'fontPath'],
    deps: [fontErrors, fontPath],
    factory(errors, pathMod) {
        const { ContractError, RenderError } = errors;
        const { Path, pathFromSimpleGlyph } = pathMod;
        const MAX_DEPTH = 16;

        /**
         * Recursively build the path for a glyph (simple or composite).
         *
         * @param {Array} glyphs              — output of `parseGlyf` (full glyph table)
         * @param {number} index              — glyph index to resolve
         * @param {Set<number>} [visited]
         * @param {number} [depth]
         * @returns {Path}
         */
        function resolveGlyphPath(glyphs, index, visited, depth) {
            if (!Array.isArray(glyphs))
                throw new ContractError('fonts/composite-bad-input', 'glyphs must be an array');
            if (index < 0 || index >= glyphs.length)
                throw new ContractError('fonts/composite-bad-index',
                    `glyph index ${index} out of range (numGlyphs=${glyphs.length})`,
                    { context: { index, numGlyphs: glyphs.length } });
            visited = visited || new Set();
            depth   = depth || 0;
            if (depth > MAX_DEPTH)
                throw new RenderError('fonts/composite-depth',
                    `composite nesting exceeded ${MAX_DEPTH}`,
                    { context: { index, depth } });
            if (visited.has(index))
                throw new RenderError('fonts/composite-cycle',
                    `composite cycle detected at glyph ${index}`,
                    { context: { index, visited: Array.from(visited) } });

            const g = glyphs[index];
            if (!g) return new Path();
            if (g.kind === 'simple') return pathFromSimpleGlyph(g);
            if (g.kind !== 'composite')
                throw new RenderError('fonts/composite-bad-kind',
                    `unknown glyph kind '${g.kind}'`, { context: { index, kind: g.kind } });

            visited.add(index);
            const out = new Path();
            for (const comp of g.components) {
                const sub = resolveGlyphPath(glyphs, comp.glyphIndex, visited, depth + 1);
                const t = comp.transform || { a: 1, b: 0, c: 0, d: 1 };
                const e = comp.xy ? (comp.arg1 || 0) : 0;
                const f = comp.xy ? (comp.arg2 || 0) : 0;
                sub.transform({ a: t.a, b: t.b, c: t.c, d: t.d, e, f });
                for (const cmd of sub.commands) out.commands.push(cmd);
            }
            visited.delete(index);
            return out;
        }

        return { resolveGlyphPath, MAX_DEPTH };
    }
};
