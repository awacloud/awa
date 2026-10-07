// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Resolution-independent Path data — TrueType-style
 * quadratic Bézier curves plus optional cubics (for CFF / Type 1).
 *
 * Each command is a small POJO :
 *
 *  - `{ type: 'M', x, y }`
 *  - `{ type: 'L', x, y }`
 *  - `{ type: 'Q', x1, y1, x, y }`   (quadratic)
 *  - `{ type: 'C', x1, y1, x2, y2, x, y }` (cubic)
 *  - `{ type: 'Z' }`                 (close current subpath)
 *
 * Strict factory body.
 *
 * @module fonts/glyph/path
 */

export const fontPath = {
    name: 'fontPath',
    dependencies: [],
    factory() {
        class Path {
            constructor() {
                this.commands = [];
            }

            moveTo(x, y) { this.commands.push({ type: 'M', x, y }); return this; }
            lineTo(x, y) { this.commands.push({ type: 'L', x, y }); return this; }
            quadTo(x1, y1, x, y) { this.commands.push({ type: 'Q', x1, y1, x, y }); return this; }
            curveTo(x1, y1, x2, y2, x, y) {
                this.commands.push({ type: 'C', x1, y1, x2, y2, x, y });
                return this;
            }
            close() { this.commands.push({ type: 'Z' }); return this; }

            /** Approximate bbox by surveying anchor + on-curve control points. */
            bbox() {
                let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
                for (const c of this.commands) {
                    if (c.type === 'Z') continue;
                    if (typeof c.x === 'number') {
                        if (c.x < xMin) xMin = c.x;
                        if (c.x > xMax) xMax = c.x;
                        if (c.y < yMin) yMin = c.y;
                        if (c.y > yMax) yMax = c.y;
                    }
                    if (typeof c.x1 === 'number') {
                        if (c.x1 < xMin) xMin = c.x1;
                        if (c.x1 > xMax) xMax = c.x1;
                        if (c.y1 < yMin) yMin = c.y1;
                        if (c.y1 > yMax) yMax = c.y1;
                    }
                    if (typeof c.x2 === 'number') {
                        if (c.x2 < xMin) xMin = c.x2;
                        if (c.x2 > xMax) xMax = c.x2;
                        if (c.y2 < yMin) yMin = c.y2;
                        if (c.y2 > yMax) yMax = c.y2;
                    }
                }
                return this.commands.length === 0
                    ? { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
                    : { xMin, yMin, xMax, yMax };
            }

            /** Render to SVG-style "M ... Z" string (units in font design units). */
            toSvgPath() {
                const out = [];
                for (const c of this.commands) {
                    switch (c.type) {
                        case 'M': out.push(`M${c.x} ${c.y}`); break;
                        case 'L': out.push(`L${c.x} ${c.y}`); break;
                        case 'Q': out.push(`Q${c.x1} ${c.y1} ${c.x} ${c.y}`); break;
                        case 'C': out.push(`C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`); break;
                        case 'Z': out.push('Z'); break;
                    }
                }
                return out.join(' ');
            }

            /** Apply an affine transform {a,b,c,d,e,f} in place. */
            transform(t) {
                const a = t.a ?? 1, b = t.b ?? 0, c = t.c ?? 0, d = t.d ?? 1, e = t.e ?? 0, f = t.f ?? 0;
                for (const cmd of this.commands) {
                    if (cmd.type === 'Z') continue;
                    if (typeof cmd.x === 'number') {
                        const nx = a * cmd.x + c * cmd.y + e;
                        const ny = b * cmd.x + d * cmd.y + f;
                        cmd.x = nx; cmd.y = ny;
                    }
                    if (typeof cmd.x1 === 'number') {
                        const nx = a * cmd.x1 + c * cmd.y1 + e;
                        const ny = b * cmd.x1 + d * cmd.y1 + f;
                        cmd.x1 = nx; cmd.y1 = ny;
                    }
                    if (typeof cmd.x2 === 'number') {
                        const nx = a * cmd.x2 + c * cmd.y2 + e;
                        const ny = b * cmd.x2 + d * cmd.y2 + f;
                        cmd.x2 = nx; cmd.y2 = ny;
                    }
                }
                return this;
            }
        }

        /**
         * Build a {@link Path} from a parsed TrueType simple glyph
         * (output of `parseGlyph` with `kind: 'simple'`).
         *
         * Implements the standard TT contour reconstruction :
         *  - on-curve points are anchors,
         *  - consecutive off-curve points imply a midpoint on-curve,
         *  - contours close back to their start.
         */
        function pathFromSimpleGlyph(glyph) {
            const path = new Path();
            if (!glyph || glyph.kind !== 'simple') return path;
            let pIdx = 0;
            for (const endPt of glyph.endPtsOfContours) {
                const contour = glyph.points.slice(pIdx, endPt + 1);
                pIdx = endPt + 1;
                if (contour.length === 0) continue;

                // Find first on-curve as start, else use midpoint of first 2 off-curves
                let firstOn = contour.findIndex(p => p.onCurve);
                if (firstOn < 0) {
                    // All off-curve: start at midpoint of last and first
                    const last = contour[contour.length - 1];
                    const first = contour[0];
                    const startX = (last.x + first.x) / 2;
                    const startY = (last.y + first.y) / 2;
                    path.moveTo(startX, startY);
                    firstOn = -1;  // signal special handling
                } else {
                    const s = contour[firstOn];
                    path.moveTo(s.x, s.y);
                }

                // Rotate so we start at firstOn (or at midpoint when firstOn = -1)
                const startIdx = firstOn < 0 ? 0 : firstOn;
                const ordered = [];
                // When the start is an on-curve anchor we already moveTo'd to it ;
                // iterate the remaining (length-1) points then close via the start.
                // When firstOn = -1 (all off-curve) we start at the midpoint and
                // iterate all `length` points before closing.
                const iterCount = firstOn < 0 ? contour.length : contour.length - 1;
                for (let i = 1; i <= iterCount; i++) {
                    ordered.push(contour[(startIdx + i) % contour.length]);
                }

                let pendingControl = null;
                for (const p of ordered) {
                    if (p.onCurve) {
                        if (pendingControl) {
                            path.quadTo(pendingControl.x, pendingControl.y, p.x, p.y);
                            pendingControl = null;
                        } else {
                            path.lineTo(p.x, p.y);
                        }
                    } else {
                        if (pendingControl) {
                            const mx = (pendingControl.x + p.x) / 2;
                            const my = (pendingControl.y + p.y) / 2;
                            path.quadTo(pendingControl.x, pendingControl.y, mx, my);
                        }
                        pendingControl = p;
                    }
                }
                if (pendingControl) {
                    // Close contour through this control to start point
                    const startCmd = path.commands.find(c => c.type === 'M');
                    path.quadTo(pendingControl.x, pendingControl.y, startCmd.x, startCmd.y);
                }
                path.close();
            }
            return path;
        }

        return { Path, pathFromSimpleGlyph };
    }
};
