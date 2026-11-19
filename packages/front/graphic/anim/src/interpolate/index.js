// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.interpolate` — value-type detection → typed
 * interpolator seam, plus the SVG/CSS transform parser and the SVG path engine,
 * collapsed into ONE capture-free fw module descriptor (FROZEN CONTRACT, `docs/CONTRACT.md`).
 *
 * **Worker-safe**: pure parsing + math; the factory MUST NOT reference
 * `window`, `document`, or any DOM global. Proven DOM-free by the source-scan
 * leg of `index.test.js`.
 *
 * The factory injects the four resolved math dependencies and returns the
 * public surface `{ detect, interpolator, parseTransform, parsePath }`:
 *
 * - {@link detect} maps a raw animatable value to one of five frozen kinds.
 * - {@link interpolator} builds a `(t) => value` function bound to a
 *   `from`→`to` pair by dispatching on the detected kind:
 *     - `number`    : plain numeric (e.g. `opacity`) → scalar `lerp`.
 *     - `unit`      : `"50px"`, `"2rem"` → split, lerp, reformat (units match).
 *     - `color`     : `#hex` / `rgb()` / `rgba()` / `hsl()` / `hsla()` / named →
 *                     `color.lerp` in RGBA space.
 *     - `transform` : affine string → decompose → channel lerp → recompose.
 *     - `path`      : SVG path `d` → canonical-normalize → point-wise lerp.
 * - `parseTransform` and `parsePath` are exposed for direct use.
 *
 * Capture-free: every module-scope binding an earlier form relied on (the
 * `PATH_RE`/`TRANSFORM_RE`/`COLOR_RE` regexes, the path `ARITY` table, the
 * transform `FN_RE` regex, and all parser/arc/normalize helpers) is **defined
 * inside the factory body**. The math layer arrives only as `lerp`, `units`,
 * `matrix`, `color` parameters — never re-imported.
 *
 * @module graphic.interpolate
 */

import { lerpModule } from '../math/scalar.js';
import { unitsModule } from '../math/units.js';
import { matrixModule } from '../math/matrix.js';
import { colorModule } from '../math/color.js';

/**
 * `graphic.interpolate` module descriptor.
 *
 * Resolved value: `{ detect, interpolator, parseTransform, parsePath }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof lerpModule, typeof unitsModule, typeof matrixModule, typeof colorModule], factory(lerp: Function, units: object, matrix: object, color: object): { detect: Function, interpolator: Function, parseTransform: Function, parsePath: Function } }}
 */
export const interpolateModule = {
    name: 'graphic.interpolate',
    type: 'lib.graphic.interpolate',
    version: '0.1.0',
    dependencies: ['graphic.lerp', 'graphic.units', 'graphic.matrix', 'graphic.color'],
    deps: [lerpModule, unitsModule, matrixModule, colorModule],

    /**
     * Build the interpolation surface from the resolved math dependencies.
     *
     * @param {(a: number, b: number, t: number) => number} lerp Scalar lerp.
     * @param {{ split: Function, format: Function }} units Unit split/format helpers.
     * @param {{ Matrix: Function, lerpDecomposition: Function }} matrix Affine engine.
     * @param {{ parse: Function, lerp: Function, format: Function, CSS_NAMED_COLORS: Readonly<Record<string,string>> }} color Colour engine.
     * @returns {{ detect: Function, interpolator: Function, parseTransform: Function, parsePath: Function }}
     */
    factory(lerp, units, matrix, color) {
        const { Matrix, lerpDecomposition } = matrix;
        const { CSS_NAMED_COLORS } = color;

        const RAD_PER_DEG = Math.PI / 180;

        /* ═══════════════════════ detection regexes ════════════════════════ */

        /** A path `d` begins with a move command (case-insensitive M) then coords. */
        const PATH_RE = /^[Mm]\s*[-+\d.]/;
        /** Any transform function call. `skew[xy]?` admits the `skewX`/`skewY` forms. */
        const TRANSFORM_RE = /(matrix|translate|scale|rotate|skew[xy]?)\s*\(/i;
        /** Functional colour syntaxes (hex / rgb / rgba / hsl / hsla). */
        const COLOR_RE = /^(#|rgba?\(|hsla?\()/i;

        /* ═══════════════════════ transform parser ═════════════════════════ */

        /**
         * Match a single transform function call `name(args)` — captures the
         * function name (group 1) and the raw argument string (group 2). Global
         * + case-insensitive so the parser walks every function in order.
         * @type {RegExp}
         */
        const FN_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;

        /**
         * Parse the comma/whitespace-separated numeric argument list of one
         * function.
         * @param {string} raw Raw inside-parens text.
         * @returns {number[]}
         */
        function parseArgs(raw) {
            return raw.split(/[\s,]+/).filter(Boolean).map(parseFloat);
        }

        /**
         * Parse an SVG/CSS transform string into a single affine {@link Matrix}.
         *
         * Functions compose left-to-right:
         * `parseTransform('translate(10) scale(2)')` returns `translate · scale`,
         * i.e. the scale is applied first. Unrecognised text between functions is
         * ignored. An empty / functionless string yields the identity matrix.
         *
         * Supported functions and their matrices:
         * - `matrix(a,b,c,d,e,f)` — verbatim 6-tuple.
         * - `translate(tx[, ty])` — `ty` defaults to `0`.
         * - `scale(sx[, sy])` — `sy` defaults to `sx` (uniform).
         * - `rotate(deg)` — rotation about the origin (extra `cx,cy` ignored).
         * - `skewX(deg)` — real X-shear: `c = tan(deg)`.
         * - `skewY(deg)` — real Y-shear: `b = tan(deg)`.
         *
         * @param {string} str Transform function-list string.
         * @returns {Matrix} The composed affine matrix.
         */
        function parseTransform(str) {
            let m = Matrix.identity();
            FN_RE.lastIndex = 0;
            let match;
            while ((match = FN_RE.exec(str)) !== null) {
                const fn = match[1].toLowerCase();
                const args = parseArgs(match[2]);
                let next;
                if (fn === 'translate') {
                    next = new Matrix(1, 0, 0, 1, args[0] || 0, args[1] || 0);
                } else if (fn === 'scale') {
                    const sx = args[0] == null ? 1 : args[0];
                    const sy = args[1] == null ? sx : args[1];
                    next = new Matrix(sx, 0, 0, sy, 0, 0);
                } else if (fn === 'rotate') {
                    const r = (args[0] || 0) * RAD_PER_DEG;
                    const cos = Math.cos(r);
                    const sin = Math.sin(r);
                    next = new Matrix(cos, sin, -sin, cos, 0, 0);
                } else if (fn === 'skewx') {
                    next = new Matrix(1, 0, Math.tan((args[0] || 0) * RAD_PER_DEG), 1, 0, 0);
                } else if (fn === 'skewy') {
                    next = new Matrix(1, Math.tan((args[0] || 0) * RAD_PER_DEG), 0, 1, 0, 0);
                } else {
                    // matrix(a,b,c,d,e,f)
                    next = new Matrix(
                        args[0] == null ? 1 : args[0],
                        args[1] || 0,
                        args[2] || 0,
                        args[3] == null ? 1 : args[3],
                        args[4] || 0,
                        args[5] || 0,
                    );
                }
                m = m.multiply(next);
            }
            return m;
        }

        /**
         * One parsed transform function, its name canonical and its arguments
         * normalized to a fixed arity: `translate` [tx, ty], `scale` [sx, sy],
         * `rotate` [deg, cx, cy], `skewX`/`skewY` [deg], `matrix` [a..f].
         * `centred` records an explicit rotation centre.
         * @typedef {{ fn: string, args: number[], centred: boolean }} TransformFn
         */

        /** Canonical function names, keyed by their lower-case form. */
        const FN_NAME = { translate: 'translate', scale: 'scale', rotate: 'rotate', skewx: 'skewX', skewy: 'skewY', matrix: 'matrix' };

        /**
         * Parse a transform string into its function list (see {@link TransformFn}).
         * @param {string} str
         * @returns {TransformFn[]}
         */
        function parseTransformList(str) {
            const out = [];
            FN_RE.lastIndex = 0;
            let match;
            while ((match = FN_RE.exec(str)) !== null) {
                const fn = FN_NAME[match[1].toLowerCase()];
                const a = parseArgs(match[2]);
                let args;
                if (fn === 'translate') args = [a[0] || 0, a[1] || 0];
                else if (fn === 'scale') args = [a[0] == null ? 1 : a[0], a[1] == null ? (a[0] == null ? 1 : a[0]) : a[1]];
                else if (fn === 'rotate') args = [a[0] || 0, a[1] || 0, a[2] || 0];
                else if (fn === 'matrix') args = [a[0] == null ? 1 : a[0], a[1] || 0, a[2] || 0, a[3] == null ? 1 : a[3], a[4] || 0, a[5] || 0];
                else args = [a[0] || 0];
                out.push({ fn, args, centred: fn === 'rotate' && a.length >= 3 });
            }
            return out;
        }

        /**
         * Round a number as `Matrix.toString` does (6 decimals, ~0 → 0).
         * @param {number} n
         * @returns {number}
         */
        function round6(n) {
            return Math.abs(n) < 1e-10 ? 0 : Math.round(n * 1e6) / 1e6;
        }

        /**
         * Per-function transform interpolation (CSS Transforms 1, interpolation
         * of transforms): when both lists have the same length and the same
         * function at each position, each function's arguments are lerped on
         * their own, and the output is the function list; a `matrix()` pair goes
         * through the decomposition, in place. Returns `null` when the lists do
         * not match (the caller then decomposes the whole list).
         * @param {string} from
         * @param {string} to
         * @returns {((t: number) => string)|null}
         */
        function perFunctionInterpolator(from, to) {
            const la = parseTransformList(from);
            const lb = parseTransformList(to);
            if (la.length === 0 || la.length !== lb.length) return null;
            for (let i = 0; i < la.length; i += 1) if (la[i].fn !== lb[i].fn) return null;
            const parts = la.map((fa, i) => {
                const fb = lb[i];
                if (fa.fn === 'matrix') {
                    const da = new Matrix(...fa.args).decompose();
                    const db = new Matrix(...fb.args).decompose();
                    return (t) => Matrix.fromDecomposition(lerpDecomposition(da, db, t)).toString();
                }
                const n = fa.fn === 'rotate' && !fa.centred && !fb.centred ? 1 : fa.args.length;
                return (t) => {
                    const v = [];
                    for (let k = 0; k < n; k += 1) v.push(round6(lerp(fa.args[k], fb.args[k], t)));
                    return `${fa.fn}(${v.join(',')})`;
                };
            });
            return (t) => parts.map((p) => p(t)).join(' ');
        }

        /* ═══════════════════════════ path engine ══════════════════════════ */

        /**
         * A canonical path segment: an upper-case command and its flat
         * coordinate list. After {@link parsePath} the only commands present are
         * `M` (2 coords), `C` (6 coords) and `Z` (0 coords).
         * @typedef {{ cmd: string, coords: number[] }} PathSeg
         */

        /** Coordinate arity per absolute command (relative forms share the count). */
        const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

        /**
         * Tokenize a `d` string into commands and numbers. Numbers may be
         * signed, decimal, or in exponent form; a leading `-` always starts a
         * new number even when not whitespace-separated (e.g. `10-5` → `10`,
         * `-5`).
         * @param {string} d
         * @returns {string[]}
         */
        function tokenize(d) {
            return d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
        }

        /**
         * Convert one SVG elliptical-arc segment to a list of cubic-Bézier
         * control point sets (each `[x1,y1,x2,y2,x,y]`). Uses the standard
         * endpoint→centre parameterization (SVG implementation notes F.6) and
         * splits the sweep into ≤ 90° pieces, each approximated by a single
         * cubic.
         *
         * @param {number} x0 Current point X.
         * @param {number} y0 Current point Y.
         * @param {number} rx
         * @param {number} ry
         * @param {number} xAngleDeg X-axis rotation, degrees.
         * @param {number} largeArc Large-arc flag (0/1).
         * @param {number} sweep Sweep flag (0/1).
         * @param {number} x End point X.
         * @param {number} y End point Y.
         * @returns {number[][]} List of cubic coordinate sextuples.
         */
        function arcToCubics(x0, y0, rx, ry, xAngleDeg, largeArc, sweep, x, y) {
            // Degenerate: zero radius or zero-length → straight line as a cubic.
            if (rx === 0 || ry === 0) {
                return [[x0, y0, x, y, x, y]];
            }
            rx = Math.abs(rx);
            ry = Math.abs(ry);
            const phi = (xAngleDeg % 360) * Math.PI / 180;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            // Step 1: compute (x1', y1') in the rotated frame.
            const dx = (x0 - x) / 2;
            const dy = (y0 - y) / 2;
            const x1p = cosPhi * dx + sinPhi * dy;
            const y1p = -sinPhi * dx + cosPhi * dy;

            // Correct out-of-range radii (F.6.6).
            const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
            if (lambda > 1) {
                const s = Math.sqrt(lambda);
                rx *= s;
                ry *= s;
            }

            // Step 2: compute centre (cx', cy').
            const rx2 = rx * rx;
            const ry2 = ry * ry;
            const x1p2 = x1p * x1p;
            const y1p2 = y1p * y1p;
            let num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
            if (num < 0) num = 0;
            const den = rx2 * y1p2 + ry2 * x1p2;
            let coef = den === 0 ? 0 : Math.sqrt(num / den);
            if (largeArc === sweep) coef = -coef;
            const cxp = coef * (rx * y1p) / ry;
            const cyp = coef * -(ry * x1p) / rx;

            // Step 3: centre in the original frame.
            const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
            const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

            // Step 4: start angle θ1 and sweep Δθ.
            const ang = (ux, uy, vx, vy) => {
                const dot = ux * vx + uy * vy;
                const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
                let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
                if (ux * vy - uy * vx < 0) a = -a;
                return a;
            };
            const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
            let dTheta = ang(
                (x1p - cxp) / rx, (y1p - cyp) / ry,
                (-x1p - cxp) / rx, (-y1p - cyp) / ry,
            );
            if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
            else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

            // Split into ≤ 90° pieces.
            const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
            const delta = dTheta / segCount;
            // Per-segment cubic control-arm length (k = 4/3·tan(Δ/4)).
            const k = (4 / 3) * Math.tan(delta / 4);

            const cubics = [];
            let theta = theta1;
            let px = x0;
            let py = y0;
            for (let i = 0; i < segCount; i++) {
                const t2 = theta + delta;
                const cosT1 = Math.cos(theta);
                const sinT1 = Math.sin(theta);
                const cosT2 = Math.cos(t2);
                const sinT2 = Math.sin(t2);

                // End point of this sub-arc in the original frame.
                const ex = cosPhi * rx * cosT2 - sinPhi * ry * sinT2 + cx;
                const ey = sinPhi * rx * cosT2 + cosPhi * ry * sinT2 + cy;

                // Tangents → control points.
                const d1x = -rx * sinT1;
                const d1y = ry * cosT1;
                const d2x = -rx * sinT2;
                const d2y = ry * cosT2;
                const c1x = px + k * (cosPhi * d1x - sinPhi * d1y);
                const c1y = py + k * (sinPhi * d1x + cosPhi * d1y);
                const c2x = ex - k * (cosPhi * d2x - sinPhi * d2y);
                const c2y = ey - k * (sinPhi * d2x + cosPhi * d2y);

                cubics.push([c1x, c1y, c2x, c2y, ex, ey]);
                theta = t2;
                px = ex;
                py = ey;
            }
            return cubics;
        }

        /**
         * Elevate a quadratic Bézier (one control point) to a cubic (two control
         * points): `c1 = p0 + 2/3·(q − p0)`, `c2 = p1 + 2/3·(q − p1)`.
         * @param {number} x0 @param {number} y0 Start point.
         * @param {number} qx @param {number} qy Quadratic control point.
         * @param {number} x1 @param {number} y1 End point.
         * @returns {number[]} `[c1x, c1y, c2x, c2y, x1, y1]`.
         */
        function quadToCubic(x0, y0, qx, qy, x1, y1) {
            return [
                x0 + (2 / 3) * (qx - x0),
                y0 + (2 / 3) * (qy - y0),
                x1 + (2 / 3) * (qx - x1),
                y1 + (2 / 3) * (qy - y1),
                x1,
                y1,
            ];
        }

        /**
         * Parse an SVG path `d` string into a **canonical absolute** segment
         * list using only `M`, `C`, `Z`. Covers every SVG command and both
         * absolute and relative (lower-case) forms; shorthands resolve their
         * implicit control points and arcs are converted to cubic Béziers.
         *
         * @param {string} d Path data string.
         * @returns {PathSeg[]} Canonical segments (`M`/`C`/`Z` only).
         * @throws {Error} On empty/blank input, a malformed command, or a missing
         *   coordinate (genuinely invalid `d`).
         */
        function parsePath(d) {
            if (typeof d !== 'string' || d.trim() === '') {
                throw new Error('parsePath: empty path data');
            }
            const tokens = tokenize(d);
            if (tokens.length === 0 || !/[a-zA-Z]/.test(tokens[0])) {
                throw new Error('parsePath: path must start with a command');
            }

            const out = [];
            let i = 0;
            // Running point, sub-path start, and reflected-control state.
            let cx = 0;
            let cy = 0;
            let startX = 0;
            let startY = 0;
            let prevCubicCtrlX = null;   // last C/S control point 2 (for S reflection)
            let prevQuadCtrlX = null;    // last Q/T control point (for T reflection)
            let prevQuadCtrlY = null;
            let prevCubicCtrlY = null;
            let prevCmd = '';

            const num = () => {
                if (i >= tokens.length || /[a-zA-Z]/.test(tokens[i])) {
                    throw new Error('parsePath: missing coordinate');
                }
                return parseFloat(tokens[i++]);
            };

            while (i < tokens.length) {
                let cmd = tokens[i++];
                if (!/[a-zA-Z]/.test(cmd)) {
                    // Implicit repeat of the previous command (SVG allows omitting it).
                    i--;
                    cmd = prevCmd;
                    if (!cmd) throw new Error('parsePath: expected a command');
                }
                const rel = cmd === cmd.toLowerCase();
                const up = cmd.toUpperCase();
                if (!(up in ARITY)) {
                    throw new Error(`parsePath: unsupported command "${cmd}"`);
                }

                if (up === 'Z') {
                    out.push({ cmd: 'Z', coords: [] });
                    cx = startX;
                    cy = startY;
                    prevCubicCtrlX = prevCubicCtrlY = null;
                    prevQuadCtrlX = prevQuadCtrlY = null;
                    prevCmd = up;
                    continue;
                }

                // A move command consumes one pair, then any extra pairs are
                // implicit line-to's (SVG spec). Handled outside the
                // coordinate-group loop.
                if (up === 'M') {
                    let nx = num();
                    let ny = num();
                    if (rel) { nx += cx; ny += cy; }
                    cx = nx; cy = ny;
                    startX = cx; startY = cy;
                    out.push({ cmd: 'M', coords: [cx, cy] });
                    prevCubicCtrlX = prevCubicCtrlY = null;
                    prevQuadCtrlX = prevQuadCtrlY = null;
                    // Extra pairs after the move are implicit line segments.
                    while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
                        let lx = num();
                        let ly = num();
                        if (rel) { lx += cx; ly += cy; }
                        out.push({ cmd: 'C', coords: [cx, cy, lx, ly, lx, ly] });
                        cx = lx; cy = ly;
                    }
                    prevCmd = up;
                    continue;
                }

                // Each command may carry repeated coordinate groups; loop until
                // the next token is a letter (or input ends).
                do {
                    if (up === 'L') {
                        let nx = num();
                        let ny = num();
                        if (rel) { nx += cx; ny += cy; }
                        out.push({ cmd: 'C', coords: [cx, cy, nx, ny, nx, ny] });
                        cx = nx; cy = ny;
                    } else if (up === 'H') {
                        let nx = num();
                        if (rel) nx += cx;
                        out.push({ cmd: 'C', coords: [cx, cy, nx, cy, nx, cy] });
                        cx = nx;
                    } else if (up === 'V') {
                        let ny = num();
                        if (rel) ny += cy;
                        out.push({ cmd: 'C', coords: [cx, cy, cx, ny, cx, ny] });
                        cy = ny;
                    } else if (up === 'C') {
                        let x1 = num(); let y1 = num();
                        let x2 = num(); let y2 = num();
                        let ex = num(); let ey = num();
                        if (rel) {
                            x1 += cx; y1 += cy; x2 += cx; y2 += cy; ex += cx; ey += cy;
                        }
                        out.push({ cmd: 'C', coords: [x1, y1, x2, y2, ex, ey] });
                        prevCubicCtrlX = x2; prevCubicCtrlY = y2;
                        prevQuadCtrlX = prevQuadCtrlY = null;
                        cx = ex; cy = ey;
                    } else if (up === 'S') {
                        let x2 = num(); let y2 = num();
                        let ex = num(); let ey = num();
                        if (rel) { x2 += cx; y2 += cy; ex += cx; ey += cy; }
                        // Reflect previous cubic control point if the prior command was C/S.
                        let x1 = cx;
                        let y1 = cy;
                        if (prevCubicCtrlX != null) {
                            x1 = 2 * cx - prevCubicCtrlX;
                            y1 = 2 * cy - prevCubicCtrlY;
                        }
                        out.push({ cmd: 'C', coords: [x1, y1, x2, y2, ex, ey] });
                        prevCubicCtrlX = x2; prevCubicCtrlY = y2;
                        prevQuadCtrlX = prevQuadCtrlY = null;
                        cx = ex; cy = ey;
                    } else if (up === 'Q') {
                        let qx = num(); let qy = num();
                        let ex = num(); let ey = num();
                        if (rel) { qx += cx; qy += cy; ex += cx; ey += cy; }
                        out.push({ cmd: 'C', coords: quadToCubic(cx, cy, qx, qy, ex, ey) });
                        prevQuadCtrlX = qx; prevQuadCtrlY = qy;
                        prevCubicCtrlX = prevCubicCtrlY = null;
                        cx = ex; cy = ey;
                    } else if (up === 'T') {
                        let ex = num(); let ey = num();
                        if (rel) { ex += cx; ey += cy; }
                        let qx = cx;
                        let qy = cy;
                        if (prevQuadCtrlX != null) {
                            qx = 2 * cx - prevQuadCtrlX;
                            qy = 2 * cy - prevQuadCtrlY;
                        }
                        out.push({ cmd: 'C', coords: quadToCubic(cx, cy, qx, qy, ex, ey) });
                        prevQuadCtrlX = qx; prevQuadCtrlY = qy;
                        prevCubicCtrlX = prevCubicCtrlY = null;
                        cx = ex; cy = ey;
                    } else if (up === 'A') {
                        const rx = num(); const ry = num();
                        const rot = num();
                        const large = num(); const swp = num();
                        let ex = num(); let ey = num();
                        if (rel) { ex += cx; ey += cy; }
                        const cubics = arcToCubics(cx, cy, rx, ry, rot, large, swp, ex, ey);
                        for (const c of cubics) out.push({ cmd: 'C', coords: c });
                        prevCubicCtrlX = prevCubicCtrlY = null;
                        prevQuadCtrlX = prevQuadCtrlY = null;
                        cx = ex; cy = ey;
                    }
                    prevCmd = up;
                } while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]));
            }
            return out;
        }

        /**
         * Whether two canonical segment lists are already structurally
         * compatible — equal length and identical command sequence (the fast
         * path).
         * @param {PathSeg[]} a
         * @param {PathSeg[]} b
         * @returns {boolean}
         */
        function isCompatible(a, b) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i].cmd !== b[i].cmd) return false;
            }
            return true;
        }

        /**
         * Split a canonical segment list into its leading move, its run of `C`
         * curves, and whether it closes with `Z`.
         * @param {PathSeg[]} segs
         * @returns {{ move: PathSeg, curves: PathSeg[], close: boolean }}
         */
        function expand(segs) {
            const move = segs[0] && segs[0].cmd === 'M'
                ? segs[0]
                : { cmd: 'M', coords: [0, 0] };
            const curves = segs.filter((s) => s.cmd === 'C');
            const close = segs.some((s) => s.cmd === 'Z');
            return { move, curves, close };
        }

        /**
         * Rebuild a segment list whose curve run is padded to `n` segments by
         * repeating the last curve's endpoint as a degenerate (zero-length)
         * cubic.
         * @param {{ move: PathSeg, curves: PathSeg[], close: boolean }} e
         * @param {number} n Target curve count.
         * @returns {PathSeg[]}
         */
        function padCurves(e, n) {
            const curves = e.curves.slice();
            if (curves.length === 0) {
                // No drawing commands: emit degenerate curves anchored at the move point.
                const [mx, my] = e.move.coords;
                while (curves.length < n) {
                    curves.push({ cmd: 'C', coords: [mx, my, mx, my, mx, my] });
                }
            } else {
                while (curves.length < n) {
                    const last = curves[curves.length - 1];
                    const ex = last.coords[4];
                    const ey = last.coords[5];
                    curves.push({ cmd: 'C', coords: [ex, ey, ex, ey, ex, ey] });
                }
            }
            const segs = [e.move, ...curves];
            if (e.close) segs.push({ cmd: 'Z', coords: [] });
            return segs;
        }

        /**
         * Bring two canonical segment lists to structural compatibility so they
         * can be blended point-wise. Both inputs are already reduced to
         * `M`/`C`/`Z` by {@link parsePath}; this pads the shorter drawing-command
         * run by repeating its final `C` segment (a zero-length curve that keeps
         * the endpoint fixed) until the two have the same number of `C` segments.
         * The leading `M` and any trailing `Z` are matched structurally.
         *
         * Preserves the fast path: when the inputs are already
         * {@link isCompatible}, they are returned unchanged.
         *
         * @param {PathSeg[]} a
         * @param {PathSeg[]} b
         * @returns {[PathSeg[], PathSeg[]]} The aligned pair, equal length + commands.
         */
        function normalize(a, b) {
            if (isCompatible(a, b)) return [a, b];

            const ea = expand(a);
            const eb = expand(b);
            const n = Math.max(ea.curves.length, eb.curves.length);
            const ca = padCurves(ea, n);
            const cb = padCurves(eb, n);
            return [ca, cb];
        }

        /**
         * Serialize canonical segments back to a `d` string, rounding each
         * coordinate to 1e-3.
         * @param {PathSeg[]} segs
         * @returns {string}
         */
        function formatPath(segs) {
            return segs.map((s) => {
                const c = s.coords.map((n) => Math.round(n * 1e3) / 1e3);
                return s.cmd + (c.length ? ' ' + c.join(' ') : '');
            }).join(' ');
        }

        /* ═══════════════════════ detect / dispatch ════════════════════════ */

        /** @typedef {'number'|'unit'|'color'|'transform'|'path'} ValueKind */

        /**
         * Detect the interpolation kind of a raw value. Order is significant and
         * matches the frozen detection contract:
         * `number → path → transform → color → unit` (unit is the string
         * fallthrough).
         *
         * A string is a `color` when it matches {@link COLOR_RE} **or** is a
         * known CSS named colour (consistent with the injected `color.parse`).
         *
         * @param {string|number} value
         * @returns {ValueKind}
         * @throws {Error} When `value` is neither a number nor a string.
         */
        function detect(value) {
            if (typeof value === 'number') return 'number';
            if (typeof value !== 'string') {
                throw new Error(`detect: unsupported value type ${typeof value}`);
            }
            const s = value.trim();
            if (PATH_RE.test(s)) return 'path';
            if (TRANSFORM_RE.test(s)) return 'transform';
            if (COLOR_RE.test(s) || CSS_NAMED_COLORS[s.toLowerCase()] !== undefined) {
                return 'color';
            }
            // Anything else string-shaped is treated as a number+unit ("50px", "0").
            return 'unit';
        }

        /**
         * Build a typed interpolator `(t) => value` for a `from`→`to` pair,
         * dispatching on the detected kind. Both ends are detected; a kind
         * mismatch throws.
         *
         * Dispatch (frozen):
         * - `number` → scalar `lerp`.
         * - `unit` → `units.split` both ends, lerp the value, reformat. Throws on
         *   a unit mismatch.
         * - `color` → `color.lerp` (RGBA space) → `rgb()/rgba()`.
         * - `transform` → when both lists match function by function, a lerp per
         *   function written back as the list (CSS Transforms 1; a `matrix()`
         *   pair through the decomposition, in place); otherwise
         *   {@link parseTransform}.decompose → `lerpDecomposition` →
         *   `Matrix.fromDecomposition`.toString.
         * - `path` → {@link parsePath} + {@link normalize} both ends → point-wise
         *   coordinate lerp → {@link formatPath}. No longer throws on arc inputs
         *   or differing-but-normalizable structures.
         *
         * @param {string|number} from Value at `t = 0`.
         * @param {string|number} to   Value at `t = 1`.
         * @returns {(t: number) => (string|number)} The interpolating function.
         * @throws {Error} On a kind mismatch, a unit mismatch, or invalid path data.
         */
        function interpolator(from, to) {
            const kind = detect(from);
            const toKind = detect(to);
            if (kind !== toKind) {
                throw new Error(`interpolator: kind mismatch ${kind} → ${toKind}`);
            }

            switch (kind) {
                case 'number':
                    return (t) => lerp(/** @type {number} */(from), /** @type {number} */(to), t);

                case 'unit': {
                    const a = units.split(/** @type {string} */(from));
                    const b = units.split(/** @type {string} */(to));
                    if (a.unit && b.unit && a.unit !== b.unit) {
                        throw new Error(`interpolator: unit mismatch "${a.unit}" vs "${b.unit}"`);
                    }
                    const unit = a.unit || b.unit;
                    return (t) => units.format(lerp(a.value, b.value, t), unit);
                }

                case 'color':
                    return (t) => color.lerp(/** @type {string} */(from), /** @type {string} */(to), t);

                case 'transform': {
                    const perFn = perFunctionInterpolator(/** @type {string} */(from), /** @type {string} */(to));
                    if (perFn) return perFn;
                    const da = parseTransform(/** @type {string} */(from)).decompose();
                    const db = parseTransform(/** @type {string} */(to)).decompose();
                    return (t) => Matrix.fromDecomposition(lerpDecomposition(da, db, t)).toString();
                }

                case 'path': {
                    const [sa, sb] = normalize(
                        parsePath(/** @type {string} */(from)),
                        parsePath(/** @type {string} */(to)),
                    );
                    return (t) => formatPath(sa.map((seg, i) => ({
                        cmd: seg.cmd,
                        coords: seg.coords.map((v, k) => lerp(v, sb[i].coords[k], t)),
                    })));
                }

                default:
                    throw new Error(`interpolator: unhandled kind ${kind}`);
            }
        }

        return { detect, interpolator, parseTransform, parsePath };
    },
};
