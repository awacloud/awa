// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `hypertree.layout` — the radial / hyperbolic tree layout +
 * focus-navigation solver, authored **pure**, **DOM-free** and **capture-free**
 * as an fw module descriptor. It is the geometry kernel of `graphic.hypertree`.
 *
 * Salvage reference (gitignored, authorized): `packages/front/@anim-old/
 * towardsHyperTree/public/ready.js` — the legacy `treeExplore` / `coords` /
 * `computeMove` layout maths. This file reproduces the ALGORITHM (behavioral
 * parity), **not** the code. The legacy code is `window`-scoped, callback-nested
 * and DOM-coupled; none of that survives here.
 *
 * The kernel has two moving parts:
 *
 *   - **{@link layout}** — even-sector subdivision of a tree onto concentric
 *     rings. The root sits at the centre; each node's angular sector is split
 *     evenly among its children (`beta = base + i·w/n + w/2n` in the legacy
 *     `treeExplore`), so a node's children partition its parent sector and the
 *     root's children partition the full circle. Ring radius per depth follows
 *     the `R/2^n` series (`ringRadius(d) = R·(1 − 2^−d)` — increments halve each
 *     depth, converging to the boundary `R`, the legacy cumulative
 *     `radius += R / 2^(i+1)`). Each parent→child link carries a
 *     quadratic-bezier control point at the mean of the two ring radii along the
 *     child angle (the legacy `bezierRadius` average).
 *   - **{@link focusMove}** — the legacy `computeMove` focus move, a
 *     **re-rooting** of the tree at the focus (`towardsHyperTree/public/
 *     ready3.2.js`): the focused node goes to the centre; its own children fan
 *     over `zoom` (the legacy `alphaZoom`, 270°) around its base angle; the rest
 *     of the tree, reached through the parent, takes the remaining sector on the
 *     opposite side, its children kept in the legacy cyclic order (base children
 *     after the path child, then the re-rooted ancestor, then those before).
 *     Rings follow the graph distance from the focus.
 *
 * **Worker-safe**: this file references no `window`/`document`/DOM global — it is
 * pure 2D geometry over plain data. All constants/helpers live INSIDE
 * {@link hypertreeLayoutModule.factory} so the descriptor is capture-free
 * (`fw/no-factory-capture`, verified by the package-local ESLint config over
 * `src/**`).
 *
 * @module hypertree.layout
 */

/**
 * `hypertree.layout` — pure radial-tree layout + focus solver descriptor. No
 * dependencies, no DOM. It is injected into `graphic.hypertree` via DI (so the
 * hypertree factory stays capture-free); it is NOT a member of the public
 * `graphicModules` registry.
 *
 * Resolved value: `{ layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS,
 * DEFAULT_ZOOM }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => object }}
 */
export const hypertreeLayoutModule = {
    name: 'hypertree.layout',
    type: 'lib.graphic.hypertree',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /** Full circle in radians. Defined in-factory (capture-free). */
        const TWO_PI = Math.PI * 2;

        /** Default outer radius when no `radius` option is supplied. */
        const DEFAULT_RADIUS = 500;

        /** Default focus fan in `focusMove`: the legacy `alphaZoom` of 270°. */
        const DEFAULT_ZOOM = 1.5 * Math.PI;

        /**
         * Ring radius at a given depth: the `R/2^n` series
         * `R·(1 − 2^−depth)` — depth 0 is the centre (0); each successive ring
         * adds `R/2^depth`, so increments halve and the series converges to the
         * boundary `R`. Behavioural parity with the legacy cumulative
         * `radius += R / 2^(i+1)`.
         *
         * @param {number} depth Node depth (0 = root/centre).
         * @param {number} radius Outer radius `R`.
         * @returns {number}
         */
        function ringRadius(depth, radius) {
            if (depth <= 0) return 0;
            return radius * (1 - Math.pow(2, -depth));
        }

        /**
         * A positioned node.
         * @typedef {Object} LayoutNode
         * @property {string} id
         * @property {number} x @property {number} y
         * @property {number} depth
         * @property {number} angle Node angle in radians (sector midpoint).
         * @property {{start:number,end:number}} sector Angular sector allotted (radians).
         */

        /**
         * A parent→child link with a quadratic-bezier control point.
         * @typedef {Object} LayoutLink
         * @property {string} from @property {string} to
         * @property {number} cx @property {number} cy Control point.
         */

        /**
         * @typedef {Object} LayoutResult
         * @property {LayoutNode[]} nodes
         * @property {LayoutLink[]} links
         */

        /**
         * Emit one node + its subtree into `ctx`, subdividing `sector` evenly
         * among the node's children. Shared by {@link layout} (rooted at the
         * whole tree) and {@link focusMove} (rooted at the focus subtree and at
         * each injected ancestor subtree).
         *
         * @param {{id:string, children?:Array}} node Nested tree node.
         * @param {number} depth Ring depth for this node.
         * @param {{start:number,end:number}} sector Angular sector for this node.
         * @param {{id:string, depth:number}|null} parent Parent (for the link), or null.
         * @param {{cx:number, cy:number, radius:number, nodes:LayoutNode[], links:LayoutLink[], seen:Set<string>}} ctx
         * @throws {Error} On a duplicate id (a cycle / non-tree input).
         */
        function emit(node, depth, sector, parent, ctx) {
            const id = node.id;
            if (ctx.seen.has(id)) {
                throw new Error(`hypertree.layout: cycle or duplicate id "${id}"`);
            }
            ctx.seen.add(id);

            const start = sector.start;
            const end = sector.end;
            const angle = (start + end) / 2;
            const r = ringRadius(depth, ctx.radius);
            const x = ctx.cx + r * Math.cos(angle);
            const y = ctx.cy + r * Math.sin(angle);

            ctx.nodes.push({ id, x, y, depth, angle, sector: { start, end } });

            if (parent) {
                const rp = ringRadius(parent.depth, ctx.radius);
                const midR = (rp + r) / 2;
                ctx.links.push({
                    from: parent.id,
                    to: id,
                    cx: ctx.cx + midR * Math.cos(angle),
                    cy: ctx.cy + midR * Math.sin(angle),
                });
            }

            const kids = Array.isArray(node.children) ? node.children : [];
            const n = kids.length;
            if (n === 0) return;
            const w = (end - start) / n;
            for (let i = 0; i < n; i += 1) {
                emit(
                    kids[i],
                    depth + 1,
                    { start: start + i * w, end: start + (i + 1) * w },
                    { id, depth },
                    ctx,
                );
            }
        }

        /**
         * Lay out a tree radially. The root sits at the centre `(R, R)`; each
         * node's angular sector is subdivided evenly among its children, and
         * depth `d` sits on the ring `ringRadius(d, R)`.
         *
         * @param {{id:string, label?:string, children?:Array}} tree Single-root
         *   tree (no cycles — a repeated id throws).
         * @param {{radius?:number}} [opts] `radius` = outer radius `R`
         *   (default {@link DEFAULT_RADIUS}).
         * @returns {LayoutResult}
         * @throws {Error} When `tree` has no id, or a cycle/duplicate id is found.
         */
        function layout(tree, opts) {
            if (!tree || typeof tree !== 'object'
                || tree.id === undefined || tree.id === null) {
                throw new Error('hypertree.layout: tree must be an object with an id');
            }
            const radius = (opts && opts.radius > 0) ? opts.radius : DEFAULT_RADIUS;
            const ctx = {
                cx: radius, cy: radius, radius,
                nodes: [], links: [], seen: new Set(),
            };
            emit(tree, 0, { start: 0, end: TWO_PI }, null, ctx);
            return { nodes: ctx.nodes, links: ctx.links };
        }

        /**
         * Re-root a layout at `focusId` (the legacy `computeMove`). The focused
         * node moves to the centre. Its own children share a sector of width
         * `zoom`, centred on the focus's base angle. The rest of the tree,
         * reached through the parent, becomes one more branch of the focus over
         * the complementary sector, centred opposite; a focus with no children
         * gives that branch the whole circle. A re-rooted node orders its
         * children as the legacy code did: its base children after the path
         * child, then its re-rooted parent, then its base children before the
         * path child, so the cyclic order of the tree is kept. Every node sits on
         * the ring of its graph distance from the focus, and every node of the
         * original tree appears exactly once.
         *
         * Focusing the root (already centred, the base layout) is a **no-op**:
         * the input `layoutResult` is returned unchanged.
         *
         * @param {LayoutResult} layoutResult A result from {@link layout}.
         * @param {string} focusId The node to re-root on.
         * @param {{zoom?:number}} [opts] `zoom` = the focus fan in radians,
         *   `(0, 2π)` (default {@link DEFAULT_ZOOM}).
         * @returns {LayoutResult} A new re-rooted result (or the input on no-op).
         * @throws {Error} When `focusId` is not present in the layout.
         */
        function focusMove(layoutResult, focusId, opts) {
            const { nodes, links } = layoutResult;

            const byId = new Map();
            for (const nd of nodes) byId.set(nd.id, nd);
            if (!byId.has(focusId)) {
                throw new Error(`hypertree.layout: unknown node "${focusId}"`);
            }

            let root = null;
            for (const nd of nodes) {
                if (nd.depth === 0) { root = nd; break; }
            }
            if (!root) throw new Error('hypertree.layout: layout has no root (depth 0)');
            if (focusId === root.id) return layoutResult; // no-op

            const zoomIn = opts && opts.zoom;
            const zoom = (zoomIn > 0 && zoomIn < TWO_PI) ? zoomIn : DEFAULT_ZOOM;

            // Ordered adjacency reconstructed from the links.
            const parentOf = new Map();
            const childrenOf = new Map();
            for (const nd of nodes) childrenOf.set(nd.id, []);
            for (const l of links) {
                parentOf.set(l.to, l.from);
                childrenOf.get(l.from).push(l.to);
            }

            /**
             * Rebuild a node of the tree re-rooted at the focus, reached from its
             * base child `fromChild` (or `null` for a plain subtree): base children
             * after `fromChild`, then the re-rooted base parent, then the base
             * children before it.
             * @param {string} id
             * @param {string|null} fromChild
             * @returns {{id:string, children:Array}}
             */
            function reroot(id, fromChild) {
                const kids = childrenOf.get(id) || [];
                if (fromChild === null) {
                    return { id, children: kids.map((c) => reroot(c, null)) };
                }
                const j = kids.indexOf(fromChild);
                const out = kids.slice(j + 1).map((c) => reroot(c, null));
                if (parentOf.has(id)) out.push(reroot(parentOf.get(id), id));
                for (const c of kids.slice(0, j)) out.push(reroot(c, null));
                return { id, children: out };
            }

            const ctx = {
                cx: root.x, cy: root.y, radius: root.x, // root sits at (R, R)
                nodes: [], links: [], seen: new Set(),
            };
            const theta = byId.get(focusId).angle;
            const own = childrenOf.get(focusId);
            const fan = own.length > 0 ? zoom : 0;

            // The focus itself, at the centre over the full circle.
            ctx.seen.add(focusId);
            ctx.nodes.push({
                id: focusId, x: ctx.cx, y: ctx.cy, depth: 0, angle: theta,
                sector: { start: theta - fan / 2, end: theta - fan / 2 + TWO_PI },
            });
            const focusRef = { id: focusId, depth: 0 };

            // (1) Its own children, evenly over the fan around its base angle.
            const fanStart = theta - fan / 2;
            const w = own.length > 0 ? fan / own.length : 0;
            for (let i = 0; i < own.length; i += 1) {
                emit(reroot(own[i], null), 1,
                    { start: fanStart + i * w, end: fanStart + (i + 1) * w }, focusRef, ctx);
            }

            // (2) The rest of the tree, through the parent, over the remaining sector.
            emit(reroot(parentOf.get(focusId), focusId), 1,
                { start: fanStart + fan, end: fanStart + TWO_PI }, focusRef, ctx);

            return { nodes: ctx.nodes, links: ctx.links };
        }

        return { layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS, DEFAULT_ZOOM };
    },
};
