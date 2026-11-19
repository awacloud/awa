// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `pageflip.fold` — the aJSFlip page-**curl** fold-path solver,
 * authored **pure**, **DOM-free** and **capture-free** as an fw module
 * descriptor. It is the geometry kernel of `graphic.pageflip`.
 *
 * Salvage reference (gitignored, authorized): `packages/front/@anim-old/aJSFlip/
 * aJS-Flip-v0.4-svg.js` — the legacy ~700-line `execMove` fold maths. This file
 * reproduces the ALGORITHM (behavioral parity with a measured de-risking
 * spike's reference), **not** the code. The legacy code is `window`-scoped,
 * capture-heavy and DOM-coupled; none of that survives here.
 *
 * The kernel has four moving parts:
 *
 *   - **corner-clamp onto the spine circle** — the dragged corner is clamped to
 *     a circle of radius `width` centred on the spine so the fold stays
 *     physically realizable (`margin = sqrt(w² + h²) − h`).
 *   - **reflect-about-fold quad** — the page rectangle corners are rotated about
 *     the dragged corner by `rotate = −2·angle` to obtain the folded geometry.
 *   - **5-case edge-clip** — the fold line crosses the page edges in one of five
 *     regimes (`angle > 0`, `= 0`, `−45 < angle < 0`, `= −45`, `< −45`); each
 *     emits the 4-vertex turn-page polygon and a 5-vertex under-page polygon.
 *   - **pattern counter-transform** — `translate(px,py) rotate(turnDeg)` with
 *     `turnDeg = −2·(angle + 45)` so the page image does not shear.
 *
 * **Worker-safe**: this file references no `window`/`document`/DOM global — it is
 * pure 2D geometry. All constants/tables live INSIDE {@link foldModule.factory}
 * so the descriptor is capture-free (`fw/no-factory-capture`, verified by the
 * package-local ESLint config over `src/**`).
 *
 * The canonical top-right (`TR`) corner is solved here (the dragged corner starts
 * at the outer top-right `(width, 0)` of the right page, spine at `x = 0`). The
 * `TL/BL/BR` mirrors are pure output sign-flips and are a documented follow-up —
 * the geometry KERNEL they share (clamp · reflect · 5-case clip · pattern
 * transform) is identical, and it is this file.
 *
 * @module pageflip.fold
 */

/**
 * `pageflip.fold` — pure fold-path solver descriptor. No dependencies, no DOM.
 * It is injected into `graphic.pageflip` via DI (so the pageflip factory stays
 * capture-free); it is NOT a member of the public `graphicModules` registry.
 *
 * Resolved value: `{ fold, clampCorner, rotatePoint, lineIntersection,
 * rectCorners, margin, EDGE_CASES, MARGIN_EPS }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => object }}
 */
export const foldModule = {
    name: 'pageflip.fold',
    type: 'lib.graphic.pageflip',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /* ─────────────────────── pure math primitives ─────────────────────── */

        const DEG = 180 / Math.PI;

        /** The five edge-clip regimes, keyed by the fold `angle` sign band. */
        const EDGE_CASES = Object.freeze({
            OBTUSE: 'angle>0',       // dragged corner high — fold clips top+right edges
            FLAT: 'angle==0',        // fold line horizontal at the corner
            SHALLOW: '-45<angle<0',  // fold clips top edge + (right | bottom)
            DIAGONAL: 'angle==-45',  // symmetric 45° fold (triangle midline)
            STEEP: 'angle<-45',      // fold clips top + bottom edges
        });

        /** Below this, the corner sits at rest and the fold degenerates to nothing. */
        const MARGIN_EPS = 0.01;

        /**
         * Rotate `(px,py)` about `(ox,oy)` by `deg` degrees (CCW in SVG's
         * y-down frame — matches the legacy `rotate_point`).
         * @param {number} px @param {number} py
         * @param {number} ox @param {number} oy
         * @param {number} deg
         * @returns {{x:number,y:number}}
         */
        function rotatePoint(px, py, ox, oy, deg) {
            const a = deg / DEG;
            const c = Math.cos(a);
            const s = Math.sin(a);
            return {
                x: c * (px - ox) - s * (py - oy) + ox,
                y: s * (px - ox) + c * (py - oy) + oy,
            };
        }

        /**
         * Intersection point of line 1 (`a→b`) and line 2 (`c→d`). Returns `null`
         * for parallel lines (the legacy returned `{x:null,y:null}`).
         * @param {number} ax @param {number} ay @param {number} bx @param {number} by
         * @param {number} cx @param {number} cy @param {number} dx @param {number} dy
         * @returns {{x:number,y:number}|null}
         */
        function lineIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
            const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
            if (denom === 0) return null;
            const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom;
            return { x: ax + ua * (bx - ax), y: ay + ua * (by - ay) };
        }

        /**
         * The spine-circle margin term: `sqrt(w² + h²) − h` — the clamp radius for
         * the dragged corner so the fold is realizable (legacy `utils.margin`).
         * @param {number} w @param {number} h
         * @returns {number}
         */
        function margin(w, h) {
            return Math.sqrt(w * w + h * h) - h;
        }

        /* ────────────────────────── corner clamp ──────────────────────────── */

        /**
         * Clamp the dragged corner `(rx, ry)` (spine-relative, page-local coords)
         * so it stays on / inside the spine circle — the legacy `execMove` clamp.
         * Two regimes by the sign of `ry`:
         *
         *  - `ry > 0` (dragged below the top edge): clamp to the arc of radius
         *    `width` centred at the spine `(0,0)`, bounding both `x` and `y`.
         *  - `ry <= 0` (above the top edge): clamp to the top margin arc of radius
         *    `margin/marginPercent` centred at `(0, height)`; `x` bounded by
         *    `[-width, width]`, `y` by `[max.y, 0]`.
         *
         * @param {number} rx Corner X relative to spine corner (right page: 0..width).
         * @param {number} ry Corner Y relative to spine corner.
         * @param {number} width  Page width.
         * @param {number} height Page height.
         * @param {number} marg   `margin(width,height)` (already scaled).
         * @param {number} [marginPercent=1]
         * @returns {{x:number,y:number}}
         */
        function clampCorner(rx, ry, width, height, marg, marginPercent = 1) {
            let x = rx;
            let y = ry;

            if (y > 0) {
                const adx = Math.abs(x);
                const ady = y;
                let alpha = Math.atan(adx / ady) * DEG;
                if (x > 0) alpha = -alpha;
                const max = rotatePoint(0, width, 0, 0, alpha);
                if (x > 0) { if (x > max.x) x = max.x; }
                else if (x < max.x) x = max.x;
                if (y > max.y) y = max.y;
            } else {
                const bdx = Math.abs(x);
                const bdy = height - y;
                let alpha = Math.atan(bdx / bdy) * DEG;
                if (x < 0) alpha = -alpha;
                const max = rotatePoint(0, -marg / marginPercent, 0, height, alpha);
                if (x > 0) {
                    if (x > max.x) x = max.x;
                    if (x > width) x = width;
                } else {
                    if (x < max.x) x = max.x;
                    if (x < -width) x = -width;
                }
                if (y < max.y) y = max.y;
                if (y > 0) y = 0;
            }
            return { x, y };
        }

        /* ─────────────────────── rect corners (local) ─────────────────────── */

        /**
         * The four page-rectangle corners in the fold-local frame the legacy
         * `utils.rect` uses (`dx = width − cornerX`, `dy = cornerY`). These are the
         * points reflected about the dragged corner to form the folded quad.
         * @param {number} width @param {number} height
         * @param {number} dx @param {number} dy
         * @returns {Array<{x:number,y:number}>}
         */
        function rectCorners(width, height, dx, dy) {
            return [
                { x: width - dx, y: dy },
                { x: width - dx, y: -width + dy },
                { x: width + height - dx, y: -width + dy },
                { x: width + height - dx, y: dy },
            ];
        }

        /* ───────────────────────── the fold solver ────────────────────────── */

        /**
         * A solved fold.
         * @typedef {Object} FoldResult
         * @property {{x:number,y:number}} corner  The clamped dragged corner.
         * @property {Array<{x:number,y:number}>} turn  Turn-page polygon (4 pts, +implicit Z).
         * @property {Array<{x:number,y:number}>} under Under-page polygon (5 pts, +implicit Z).
         * @property {{x:number,y:number,rotate:number}} pattern Pattern counter-transform.
         * @property {number} angle The fold half-angle (degrees, `atan(dy/dx) − 45`).
         * @property {string} edgeCase One of {@link EDGE_CASES}.
         * @property {boolean} degenerate True when the corner is at rest (flat page).
         */

        /**
         * Solve the fold for a dragged corner. `corner` is in page-local coords
         * relative to the spine (right page: `x ∈ [0,width]`, `y ∈ [-…,height]`).
         *
         * Behavioural parity contract with the legacy TR case:
         *  - `corner = (width, 0)`: degenerate — `turn` collapses to the origin
         *    (flat page, pattern at rest).
         *  - `corner = (0, 0)` (clamped at the spine): fully-turned page.
         *
         * @param {{x:number,y:number}} corner Dragged corner (spine-relative).
         * @param {{width:number, height:number, marginPercent?:number, ratio?:number}} page
         * @returns {FoldResult}
         */
        function fold(corner, page) {
            const width = page.width;
            const height = page.height;
            const marginPercent = page.marginPercent || 1;
            const ratio = page.ratio || 1;
            const marg = margin(width, height);

            const clamped = clampCorner(corner.x, corner.y, width, height, marg, marginPercent);

            // Degenerate: corner still essentially at the outer top-right → flat page.
            const degenerate =
                (width - clamped.x) < width * MARGIN_EPS
                && Math.abs(clamped.y) < height * MARGIN_EPS;

            if (degenerate) {
                const zero = { x: 0, y: 0 };
                return {
                    corner: clamped,
                    turn: [zero, { ...zero }, { ...zero }, { ...zero }],
                    under: [
                        { x: 0, y: 0 }, { x: 0, y: 0 },
                        { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
                    ],
                    pattern: { x: 0, y: 0, rotate: 0 },
                    angle: -45,
                    edgeCase: EDGE_CASES.DIAGONAL,
                    degenerate: true,
                };
            }

            const cx = clamped.x;
            const cy = clamped.y;
            const dx = width - cx;
            const dy = cy;
            const angle = Math.atan(dy / dx) * DEG - 45;
            const rotate = -2 * angle;

            const rect = rectCorners(width, height, dx, dy);
            const turn = rect.map((p) => rotatePoint(p.x, p.y, cx, cy, rotate));

            // turnPath[0] is the corner; [1..3] filled by the edge-clip case.
            const tp = [
                { x: cx, y: cy },
                { x: 0, y: 0 },
                { x: 0, y: 0 },
                { x: 0, y: 0 },
            ];
            let edgeCase;

            if (angle > 0) {
                edgeCase = EDGE_CASES.OBTUSE;
                const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
                tp[1] = { x: i0.x, y: i0.y };
                let i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
                tp[2] = { x: i1.x, y: i1.y };
                tp[3] = { x: i1.x, y: i1.y };
                if (i1.y > height) {
                    i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
                    tp[2] = { x: i1.x, y: i1.y };
                    tp[3] = { x: turn[3].x, y: turn[3].y };
                }
            } else if (angle === 0) {
                edgeCase = EDGE_CASES.FLAT;
                // The crease meets the top edge (the corner on the diagonal: the
                // leaf is the triangle corner, (w − d, 0), (w, d)). The legacy
                // took the reflected point `turn[1]` itself, far above the page.
                const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
                tp[1] = { x: i0.x, y: i0.y };
                const i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
                tp[2] = { x: i1.x, y: i1.y };
                tp[3] = { x: i1.x, y: i1.y };
            } else if (angle < 0 && angle > -45) {
                edgeCase = EDGE_CASES.SHALLOW;
                const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
                tp[1] = { x: i0.x, y: i0.y };
                if (turn[3].x > width) {
                    const i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
                    tp[2] = { x: i1.x, y: i1.y };
                    tp[3] = { x: i1.x, y: i1.y };
                } else {
                    const i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
                    tp[2] = { x: i1.x, y: i1.y };
                    tp[3] = { x: turn[3].x, y: turn[3].y };
                }
            } else if (angle === -45) {
                edgeCase = EDGE_CASES.DIAGONAL;
                const midX = turn[0].x + (width - turn[0].x) / 2;
                tp[1] = { x: midX, y: turn[1].y };
                tp[2] = { x: midX, y: turn[2].y };
                tp[3] = { x: turn[3].x, y: turn[3].y };
            } else { // angle < -45
                edgeCase = EDGE_CASES.STEEP;
                const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
                tp[1] = { x: i0.x, y: i0.y };
                const i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
                tp[2] = { x: i1.x, y: i1.y };
                tp[3] = { x: turn[3].x, y: turn[3].y };
            }

            // Pattern counter-transform (image must not shear): translate by the
            // corner (in image space, i.e. divided by the render ratio) and rotate
            // by `turnDeg = -2·(angle + 45)`.
            const pattern = {
                x: cx / ratio,
                y: cy / ratio,
                rotate: -2 * (angle + 45),
            };

            // Under-page polygon (5 pts): the legacy `page_*_top` derivation for the
            // TR corner (top-branch), tying the under page to the turn quad.
            const under = [
                { x: 0, y: 0 },
                { x: tp[1].x, y: 0 },
                { x: tp[2].x, y: tp[2].y },
                (tp[2].y === height)
                    ? { x: tp[2].x, y: tp[2].y }
                    : { x: width, y: height },
                { x: 0, y: height },
            ];

            return {
                corner: clamped,
                turn: [{ x: cx, y: cy }, tp[1], tp[2], tp[3]],
                under,
                pattern,
                angle,
                edgeCase,
                degenerate: false,
            };
        }

        return { fold, clampCorner, rotatePoint, lineIntersection, rectCorners, margin, EDGE_CASES, MARGIN_EPS };
    },
};
