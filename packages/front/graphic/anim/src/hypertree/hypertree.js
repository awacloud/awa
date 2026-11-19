// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.hypertree` — a radial / hyperbolic **tree** with
 * animated focus navigation, built on the frozen graphic engine as a
 * capture-free fw module descriptor. Salvages the `@anim-old/towardsHyperTree`
 * math (behavioral parity, NOT a port).
 *
 * A {@link Hypertree} builds a namespace-correct SVG tree subtree via
 * `graphic.svgBuild` + a FRESH `graphic.scopedIds` scope with a DISTINCT
 * per-instance prefix (so two trees never collide — the per-instance id
 * prefix rule). Node positions come from the pure `hypertree.layout` kernel;
 * labels are wrapped by the pure `hypertree.measure` kernel. Focusing a node
 * recomputes the recentred layout (`hypertree.layout.focusMove`) and animates
 * every node from its current position to the target, driven by the FROZEN
 * `graphic.timeline`/`graphic.tween` on the SINGLE shared `graphic.scheduler`.
 * Each animation frame lerps all node positions and writes them — the node
 * groups and link paths are bound BY REFERENCE once (no per-tick
 * `getElementById`), every attribute written ONLY through
 * `graphic.svgApply.svgAttr`. There is NO second rAF loop. A focus re-roots the
 * tree at the focused node (the legacy `computeMove`); each link is a quadratic
 * curve whose control point lies on the angle of its outer end, at the mean
 * distance of its two ends from the centre (the legacy fan curve). The opt-in
 * `labelDepth` hides the labels farther than that from the focus, as the legacy
 * page did, so the compressed rim stays legible. The opt-in `styled` model is the
 * legacy look: a colour per branch (the node's `color`, inherited down the tree,
 * a palette on the root's children), links and dots in that colour, dot radius
 * `bullet` at the focus and its ring then `bulletFactor` times smaller per ring
 * (lerped through a focus), labels on coloured pills under the dot, and a
 * `rootGlyph` slot for the root (a consumer's logo disc, for instance). The
 * look's content stays the consumer's: the palette, the font, the root glyph
 * and the detail-badge glyphs are options, with neutral defaults. A **forest** (an array of
 * roots) is wrapped in an internal origin, `Hypertree.FOREST_ORIGIN`: the legacy
 * page's centre, not content — no dot, no label, the `rootGlyph` when there is
 * one; focusing it returns to the initial view.
 *
 * Capture-free: the eight dependencies arrive ONLY as factory parameters. The
 * `Hypertree` class AND the per-instance prefix counter are defined INSIDE the
 * factory so they reference only those parameters — never a module-scope binding
 * (`fw/no-factory-capture` clean, verified by the package-local ESLint config
 * over `src/**`). The pure kernels `hypertree.layout` and `hypertree.measure` are
 * injected via DI (NOT captured, NOT members of the public `graphicModules`
 * registry — they are hypertree-internal).
 *
 * **NOT Worker-safe** as a whole: it builds and mutates a DOM subtree. The pure
 * geometry / measurement layers it consumes are Worker-safe by construction.
 *
 * Click-to-focus is the only pointer interaction in this build. Three ADDITIVE,
 * back-compatible consumer hooks refine it without changing any default:
 * `onNodeClick(id, event)` (observe / veto a click before the internal focus
 * runs), `ignoreWhileFocusing` (opt-in re-entrancy guard, the legacy
 * `state.move` flag) and the second `info` argument of `onFocus(id, info)`.
 * With none of them set the behaviour is byte-identical to the previous build.
 * Documented follow-ups (OUT): pan / drag / hover, pixel-accurate label
 * measurement, a standalone bundle root.
 *
 * @module graphic.hypertree
 */

import { svgBuildModule } from '../svg/build.js';
import { scopedIdsModule } from '../svg/scoped-ids.js';
import { timelineModule } from '../anim/timeline.js';
import { tweenModule } from '../anim/tween.js';
import { svgApplyModule } from '../svg/apply.js';
import { schedulerModule } from '../anim/scheduler.js';
import { hypertreeLayoutModule } from './layout.js';
import { hypertreeMeasureModule } from './measure.js';

/**
 * @typedef {{ id: string, label?: string, color?: string, action?: *, info?: *, children?: TreeNode[] }} TreeNode
 */

/**
 * @typedef {{ previous: string|null, refocus: boolean }} FocusInfo
 * `previous` is the id of the previously-focused node, or `null` before the
 * first focus of this instance; `refocus` is `previous === id` (a re-focus of
 * the node that already held focus).
 */

/**
 * @typedef {Object} HypertreeOptions
 * @property {number} [radius] Outer layout radius `R` (SVG user units).
 * @property {string} [prefix] Id-scope prefix; defaults to a DISTINCT per-instance
 *   `hypertree-<n>` value (never a shared constant: the per-instance id prefix rule).
 * @property {number} [duration=400] Focus-transition duration in ms.
 * @property {((t: number) => number)|string} [easing='easeInOutCubic'] Curve fn or name.
 * @property {(id: string, info: FocusInfo) => void} [onFocus] Fired when a focus
 *   completes (or immediately for {@link Hypertree#focusSync}). The second
 *   argument is ADDITIVE — single-arity consumers are unaffected.
 * @property {(id: string, event: object) => (boolean|void)} [onNodeClick] Fired on
 *   every node click with the node's AUTHOR id (not the scoped DOM id) and the DOM
 *   event, BEFORE the internal focus logic runs. Return `false` to cancel that
 *   internal focus (per-node navigation without parsing scoped ids). Absent →
 *   today's behaviour.
 * @property {(id: string, kind: 'action'|'info', value: *, event: object) => void} [onNodeDetail]
 *   Styled mode: fired on a click on a node's detail badge — the link badge of a
 *   node with `action`, the info badge of a node with `info` (glyphs from
 *   `badgeGlyphs`). Such a click neither focuses the node nor reaches `onNodeClick`; the
 *   library never navigates.
 * @property {boolean} [ignoreWhileFocusing=false] Opt-in re-entrancy guard (the
 *   legacy `state.move` flag). When `true`, a node click landing while a focus
 *   timeline is in flight is ignored entirely (neither `onNodeClick` nor the
 *   internal focus runs). Default `false` keeps today's stacking behaviour. The
 *   guard is released on EVERY termination of the focus timeline — natural
 *   completion, {@link Hypertree#dispose}, supersession by
 *   {@link Hypertree#focusSync}, and a caller cancelling the returned `Timeline`
 *   itself (`tl.stop()`) — because the release hangs on the timeline's
 *   `onSettle` hook rather than on `onComplete`.
 * @property {number} [maxLabel=16] Character budget per label line (word-wrap).
 *   Unused by `styled` labels, which are single-line pills as in the legacy page.
 * @property {boolean|{bullet?:number, bulletFactor?:number, fontSize?:number, fontFamily?:string, palette?:string[]}} [styled=false]
 *   The legacy styling model (see the module overview). `true` takes the legacy
 *   geometry (`bullet` 7.5, `bulletFactor` 1.5, `fontSize` 14) and neutral
 *   content: the palette `#3b6ea8`, `#d9822b`, `#3a9e6f`, `#a4508b`, `#c9a227`,
 *   `#5a6b7b` and the font `system-ui, sans-serif`. A consumer's brand colours
 *   and font are passed here.
 * @property {(node: TreeNode, info: {depth:number, color:string}) => ({color?:string}|void)} [nodeStyle]
 *   Styled mode: per-node hook, called once at build in tree order; a returned
 *   `color` overrides the node's colour, and its children inherit it.
 * @property {object} [rootGlyph] Styled mode: a `graphic.svgBuild` template drawn
 *   in place of the root's dot (the logo slot); it brings its own disc. It keeps
 *   its size at the centre and shrinks off-centre to twice its ring's dot radius.
 * @property {{action?: object, info?: object}} [badgeGlyphs] Styled mode: the
 *   detail-badge glyphs, each a `graphic.svgBuild` template in a 20 × 20 frame
 *   (origin top-left), drawn white (`fill` inherited) on the branch-coloured
 *   disc. A kind left out keeps the built-in neutral glyph (an arrow for
 *   `action`, an "i" for `info`). One template serves every node.
 * @property {number} [rootGlyphRadius=100] Styled mode: the root glyph's natural
 *   radius (the legacy `logoRadius`), the basis of its off-centre scale.
 * @property {number} [labelDepth=Infinity] Show only the labels whose graph
 *   distance from the focused node is at most this. A focus hides the labels
 *   leaving that window when it starts and shows the ones entering it when it
 *   completes; {@link Hypertree#focusSync} applies it at once. The default shows
 *   every label (no label write at all).
 * @property {object} [scheduler] Override the shared scheduler (tests / isolation).
 */

/**
 * `graphic.hypertree` module descriptor.
 *
 * Factory returns `{ Hypertree, hypertree }`:
 * - `Hypertree` — the radial-tree class (builds the subtree, drives focus).
 * - `hypertree` — convenience that builds a {@link Hypertree}.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svgBuildModule, typeof scopedIdsModule, typeof timelineModule, typeof tweenModule, typeof svgApplyModule, typeof schedulerModule, typeof hypertreeLayoutModule, typeof hypertreeMeasureModule], factory(svgBuild: object, scopedIds: object, timelineMod: object, tweenMod: object, svgApply: object, schedulerMod: object, layoutApi: object, measureApi: object): { Hypertree: Function, hypertree: Function } }}
 */
export const hypertreeModule = {
    name: 'graphic.hypertree',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [
        'graphic.svgBuild',
        'graphic.scopedIds',
        'graphic.timeline',
        'graphic.tween',
        'graphic.svgApply',
        'graphic.scheduler',
        'hypertree.layout',
        'hypertree.measure',
    ],
    deps: [
        svgBuildModule,
        scopedIdsModule,
        timelineModule,
        tweenModule,
        svgApplyModule,
        schedulerModule,
        hypertreeLayoutModule,
        hypertreeMeasureModule,
    ],

    /**
     * Build the hypertree surface from the eight resolved dependencies. All
     * wiring is via parameters — the factory body never references a module-scope
     * binding.
     *
     * @param {{ build: Function, SVG_TAGS: Set<string> }} svgBuild Resolved `graphic.svgBuild`.
     * @param {{ createScope: Function }} scopedIds Resolved `graphic.scopedIds`.
     * @param {{ Timeline: Function }} timelineMod Resolved `graphic.timeline`.
     * @param {{ Tween: Function, tween: Function }} tweenMod Resolved `graphic.tween`.
     * @param {{ SVG_NS: string, svgAttr: Function }} svgApply Resolved `graphic.svgApply`.
     * @param {{ Scheduler: Function, scheduler: object }} schedulerMod Resolved `graphic.scheduler`.
     * @param {{ layout: Function, focusMove: Function }} layoutApi Resolved `hypertree.layout`.
     * @param {{ wrapLabel: Function }} measureApi Resolved `hypertree.measure`.
     * @returns {{ Hypertree: Function, hypertree: Function }}
     */
    factory(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod, layoutApi, measureApi) {
        const { Timeline } = timelineMod;
        const { Tween } = tweenMod;
        const { layout, focusMove } = layoutApi;
        const { wrapLabel } = measureApi;

        /** Node dot radius (SVG user units). Defined in-factory (capture-free). */
        const DOT_R = 6;
        /**
         * The built-in detail-badge glyphs, `graphic.svgBuild` templates in a
         * 20 × 20 frame: an arrow for `action`, an "i" for `info`. Neutral on
         * purpose; a consumer's own icons come through `badgeGlyphs`.
         * In-factory (capture-free).
         */
        const BADGE_GLYPHS = {
            action: { tag: 'path', attrs: { d: 'M7 4h9v9h-2V7.41l-8.29 8.3-1.42-1.42L12.59 6H7z' } },
            info: { tag: 'path', attrs: { d: 'M9 8h2v8H9z M10 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z' } },
        };

        /**
         * Per-factory monotonic counter minting DISTINCT default prefixes so two
         * trees built without an explicit `prefix` never mint colliding ids
         * (the per-instance id prefix rule). Defined in-factory (capture-free).
         * @type {number}
         */
        let _instanceSeq = 0;

        /**
         * A radial / hyperbolic tree: a built SVG subtree + animated focus
         * navigation over the pure `hypertree.layout` kernel.
         */
        class Hypertree {
            /**
             * The id of the internal origin a forest is wrapped in; reserved in a
             * forest. `rootId` holds it for a forest, so `focus(t.rootId)` returns
             * to the initial view.
             * @type {string}
             */
            static FOREST_ORIGIN = 'hypertree-origin';

            /**
             * @param {object} svgRoot An SVG container element to append the tree into.
             * @param {TreeNode|TreeNode[]} tree A single-root tree
             *   (`{ id, label?, color?, children? }`), or a forest: an array of roots,
             *   wrapped in the internal origin {@link Hypertree.FOREST_ORIGIN}.
             * @param {HypertreeOptions} [opts]
             * @throws {Error} When `svgRoot`/`tree` are missing, a forest is empty or
             *   uses the reserved origin id, or `tree` has a cycle.
             */
            constructor(svgRoot, tree, opts) {
                if (!svgRoot) throw new Error('Hypertree: svgRoot is required');
                const origin = Hypertree.FOREST_ORIGIN;
                /** @type {boolean} True when the input was a forest (an array of roots). */
                this.forest = Array.isArray(tree);
                if (this.forest) {
                    if (tree.length === 0) throw new Error('Hypertree: a forest must have at least one root');
                    (function reserved(nodes) {
                        for (const nd of nodes) {
                            if (!nd || nd.id === undefined || nd.id === null) {
                                throw new Error('Hypertree: tree must have an id');
                            }
                            if (nd.id === origin) {
                                throw new Error(`Hypertree: id "${origin}" is reserved for the forest origin`);
                            }
                            if (Array.isArray(nd.children)) reserved(nd.children);
                        }
                    })(tree);
                    tree = { id: origin, children: tree };
                }
                if (!tree || tree.id === undefined || tree.id === null) {
                    throw new Error('Hypertree: tree must have an id');
                }
                const o = opts || {};

                /** @type {number} Outer layout radius. */
                this._radius = o.radius > 0 ? o.radius : undefined;
                this._duration = o.duration > 0 ? o.duration : 400;
                this._easing = o.easing || 'easeInOutCubic';
                this._onFocus = typeof o.onFocus === 'function' ? o.onFocus : null;
                /** @type {Function|null} Pre-focus click hook (additive, default off). */
                this._onNodeClick = typeof o.onNodeClick === 'function' ? o.onNodeClick : null;
                /** @type {boolean} Opt-in re-entrancy guard; default `false` (back-compat). */
                this._ignoreWhileFocusing = o.ignoreWhileFocusing === true;
                const maxLabel = o.maxLabel > 0 ? o.maxLabel : 16;
                const st = o.styled ? (typeof o.styled === 'object' ? o.styled : {}) : null;
                /**
                 * The legacy styling model, or `null` for the default look.
                 * @type {{bullet:number, factor:number, fontSize:number, fontFamily:string, palette:string[]}|null}
                 */
                this._style = st ? {
                    bullet: st.bullet > 0 ? st.bullet : 7.5,
                    factor: st.bulletFactor > 0 ? st.bulletFactor : 1.5,
                    fontSize: st.fontSize > 0 ? st.fontSize : 14,
                    fontFamily: st.fontFamily || 'system-ui, sans-serif',
                    palette: Array.isArray(st.palette) && st.palette.length > 0
                        ? st.palette
                        : ['#3b6ea8', '#d9822b', '#3a9e6f', '#a4508b', '#c9a227', '#5a6b7b'],
                } : null;
                const nodeStyle = typeof o.nodeStyle === 'function' ? o.nodeStyle : null;
                const bg = o.badgeGlyphs && typeof o.badgeGlyphs === 'object' ? o.badgeGlyphs : {};
                /** @type {{action: object, info: object}} The detail-badge glyph templates. */
                const badgeGlyphs = {
                    action: bg.action && typeof bg.action === 'object' ? bg.action : BADGE_GLYPHS.action,
                    info: bg.info && typeof bg.info === 'object' ? bg.info : BADGE_GLYPHS.info,
                };
                /** @type {string|null} A node never labelled: the root when a `rootGlyph` replaces it. */
                this._noLabel = (this.forest || (st && o.rootGlyph)) ? tree.id : null;
                /** @type {number} The root glyph's natural radius (styled mode). */
                this._glyphR = o.rootGlyphRadius > 0 ? o.rootGlyphRadius : 100;
                /** @type {number} Label window around the focus (Infinity = every label). */
                this._labelDepth = o.labelDepth >= 0 ? o.labelDepth : Infinity;
                /** @type {object} Scheduler this instance drives (injected or shared). */
                this._scheduler = o.scheduler || schedulerMod.scheduler;

                /** @type {string} The root node id. */
                this.rootId = tree.id;

                // Pure layout (also validates the tree — throws on a cycle).
                /** @type {object} The pristine base layout (focus targets derive from it). */
                this._baseLayout = layout(tree, this._radius ? { radius: this._radius } : undefined);
                /** @type {number} Centre offset == outer radius (root sits at (R,R)). */
                this._center = this._baseLayout.nodes[0].x;

                // Base node metadata + current positions, keyed by id.
                /** @type {Map<string, object>} */
                this._baseNodeById = new Map();
                /** @type {Map<string, {x:number,y:number}>} */
                this._current = new Map();
                for (const nd of this._baseLayout.nodes) {
                    this._baseNodeById.set(nd.id, nd);
                    this._current.set(nd.id, { x: nd.x, y: nd.y });
                }

                // Walk the tree once for pre-order id list, labels and base edges.
                /** @type {string[]} */
                this._order = [];
                /** @type {Map<string, string[]>} id → wrapped label lines. */
                const labelLines = new Map();
                /** @type {Map<string, string>} id → raw label text. */
                const labelText = new Map();
                /** @type {Map<string, Array<{kind:string, value:*}>>} id → detail badges (action, info). */
                const detailOf = new Map();
                /** @type {Map<string, string>} id → colour (styled mode). */
                const colorOf = new Map();
                /** @type {Array<{from:string,to:string}>} Stable base-tree edges. */
                this._edges = [];
                const style = this._style;
                (function walk(node, parentId, depth, inherited, childIndex) {
                    this._order.push(node.id);
                    const raw = (node.label !== undefined && node.label !== null)
                        ? String(node.label) : String(node.id);
                    labelText.set(node.id, raw);
                    const detail = [];
                    for (const kind of ['action', 'info']) {
                        const v = node[kind];
                        if (v !== undefined && v !== null && v !== '') detail.push({ kind, value: v });
                    }
                    if (detail.length > 0) detailOf.set(node.id, detail);
                    labelLines.set(node.id, wrapLabel(raw, maxLabel));
                    if (parentId !== null) this._edges.push({ from: parentId, to: node.id });
                    let color = inherited;
                    if (style) {
                        if (node.color) color = String(node.color);
                        else if (parentId === null) color = '#5f6368';
                        else if (depth === 1 && !tree.color) color = style.palette[childIndex % style.palette.length];
                        const over = nodeStyle ? nodeStyle(node, { depth, color }) : null;
                        if (over && over.color) color = String(over.color);
                        colorOf.set(node.id, color);
                    }
                    const kids = Array.isArray(node.children) ? node.children : [];
                    for (let i = 0; i < kids.length; i += 1) walk.call(this, kids[i], node.id, depth + 1, color, i);
                }).call(this, tree, null, 0, null, 0);

                /** @type {string} DISTINCT per-instance prefix (never a shared constant). */
                this.prefix = o.prefix || `hypertree-${_instanceSeq++}`;
                /** @type {object} Fresh, isolated id scope. */
                this._scope = scopedIds.createScope(this.prefix);

                // Build the subtree: <g root> [ <g links> [paths…], <g nodes> [groups…] ].
                const linkNodes = this._edges.map((e) => ({
                    tag: 'path',
                    attrs: {
                        id: `link-${e.from}-${e.to}`,
                        fill: 'none',
                        stroke: style ? colorOf.get(e.to) : '#9aa0a6',
                        'stroke-width': style ? 1.5 : 1,
                        d: '',
                    },
                }));
                const baseDepth = new Map();
                for (const nd of this._baseLayout.nodes) baseDepth.set(nd.id, nd.depth);
                const fs = style ? style.fontSize : 0;
                const pillH = (fs * 22) / 14;
                /** Deterministic text length estimate (no DOM measurement). */
                const estimate = (text) => text.length * fs * 0.55;
                const styledNode = (id) => {
                    const r = this._radiusAt(baseDepth.get(id));
                    const color = colorOf.get(id);
                    const width = estimate(labelText.get(id)) + 10;
                    const glyph = (id === this.rootId && o.rootGlyph)
                        ? {
                            tag: 'g',
                            attrs: { id: `glyph-${id}`, transform: `scale(${this._glyphScale(baseDepth.get(id))})` },
                            children: [o.rootGlyph],
                        }
                        : (id === this.rootId && this.forest)
                            ? null // the forest origin draws no dot
                            : { tag: 'circle', attrs: { id: `dot-${id}`, cx: 0, cy: 0, r, fill: color } };
                    return {
                        tag: 'g',
                        attrs: { id: `node-${id}`, transform: 'translate(0 0)' },
                        children: [
                            ...(glyph ? [glyph] : []),
                            {
                                tag: 'g',
                                attrs: {
                                    id: `label-${id}`,
                                    transform: `translate(0 ${2 * r + 15})`,
                                    // The root glyph (the logo slot) carries no label.
                                    ...(id === this._noLabel ? { display: 'none' } : {}),
                                },
                                children: [
                                    {
                                        tag: 'rect',
                                        attrs: {
                                            id: `pill-${id}`, rx: 5, ry: 5, x: -width / 2,
                                            y: -(pillH - fs) / 3 - fs, width, height: pillH, fill: color,
                                        },
                                    },
                                    {
                                        tag: 'text',
                                        attrs: {
                                            id: `text-${id}`, x: 0, y: 0, 'text-anchor': 'middle', fill: '#ffffff',
                                            'font-size': fs, 'font-family': style.fontFamily,
                                        },
                                        text: labelText.get(id),
                                    },
                                    ...(detailOf.has(id) ? [{
                                        tag: 'g',
                                        attrs: { id: `detail-${id}`, transform: `translate(${width / 2 + 15} -7.5)` },
                                        children: detailOf.get(id).map((d, i) => ({
                                            tag: 'g',
                                            attrs: {
                                                id: `detail-${d.kind}-${id}`, 'data-kind': d.kind,
                                                cursor: 'pointer', transform: `translate(${i * 25} 0)`,
                                            },
                                            children: [
                                                { tag: 'circle', attrs: { cx: 0, cy: 0, r: 10, fill: color } },
                                                {
                                                    tag: 'g',
                                                    attrs: { 'data-glyph': d.kind, fill: '#ffffff', transform: 'translate(-10 -10)' },
                                                    children: [badgeGlyphs[d.kind]],
                                                },
                                            ],
                                        })),
                                    }] : []),
                                ],
                            },
                        ],
                    };
                };
                const nodeNodes = this._order.map((id) => (style ? styledNode(id) : {
                    tag: 'g',
                    attrs: { id: `node-${id}`, transform: 'translate(0 0)' },
                    children: [
                        // The forest origin is not content: no dot, no label.
                        ...(id === this._noLabel ? [] : [{
                            tag: 'circle',
                            attrs: { id: `dot-${id}`, cx: 0, cy: 0, r: DOT_R, fill: '#4488cc' },
                        }]),
                        {
                            tag: 'text',
                            attrs: {
                                id: `label-${id}`, x: 0, y: DOT_R + 12,
                                'text-anchor': 'middle', fill: '#202124', 'font-size': 12,
                                ...(id === this._noLabel ? { display: 'none' } : {}),
                            },
                            children: (labelLines.get(id) || []).map((line, i) => ({
                                tag: 'tspan',
                                attrs: { x: 0, dy: i === 0 ? 0 : '1.1em' },
                                text: line,
                            })),
                        },
                    ],
                }));
                const template = {
                    tag: 'g',
                    attrs: { id: 'root' },
                    children: [
                        { tag: 'g', attrs: { id: 'links' }, children: linkNodes },
                        { tag: 'g', attrs: { id: 'nodes' }, children: nodeNodes },
                    ],
                };

                /** @type {SVGElement} The built tree root, appended into svgRoot. */
                this.el = svgBuild.build(template, { idScope: this._scope });
                svgRoot.appendChild(this.el);

                // Index every built element by its (scoped) id, then bind targets by
                // reference — no per-tick DOM lookup, no querySelector id-escaping.
                const byDomId = new Map();
                (function idx(node) {
                    if (node && node.getAttribute) {
                        const a = node.getAttribute('id');
                        if (a) byDomId.set(a, node);
                    }
                    const ch = (node && node.childNodes) || [];
                    for (const c of ch) idx(c);
                })(this.el);
                const find = (rawId) => byDomId.get(this._scope.id(rawId));

                /** @type {Map<string, object>} id → node <g> element, bound once. */
                this._nodeEls = new Map();
                for (const id of this._order) this._nodeEls.set(id, find(`node-${id}`));
                /** @type {Map<string, object>} id → label <text> element, bound once. */
                this._labelEls = new Map();
                for (const id of this._order) this._labelEls.set(id, find(`label-${id}`));
                /** @type {object|null} The root glyph's scaled wrapper (styled mode), bound once. */
                this._glyphEl = find(`glyph-${this.rootId}`) || null;
                /** @type {Map<string, object>} id → dot <circle>, bound once (absent for a root glyph). */
                this._dotEls = new Map();
                for (const id of this._order) {
                    const dot = find(`dot-${id}`);
                    if (dot) this._dotEls.set(id, dot);
                }
                if (style) {
                    // Size each pill from the measured text when the browser gives a
                    // length (once, at build); the estimate stays otherwise.
                    for (const id of this._order) {
                        const text = find(`text-${id}`);
                        const len = text && typeof text.getComputedTextLength === 'function'
                            ? text.getComputedTextLength() : 0;
                        if (len > 0) {
                            const pill = find(`pill-${id}`);
                            svgApply.svgAttr(pill, 'width', len + 10);
                            svgApply.svgAttr(pill, 'x', -(len + 10) / 2);
                            const badges = find(`detail-${id}`);
                            if (badges) svgApply.svgAttr(badges, 'transform', `translate(${(len + 10) / 2 + 15} -7.5)`);
                        }
                    }
                }
                /** @type {Map<string, object>} id → detail badges group (styled mode), bound once. */
                this._detailEls = new Map();
                /** @type {Array<{el: object, handler: Function}>} Badge click listeners (for dispose). */
                this._badgeHandlers = [];
                this._onNodeDetail = typeof o.onNodeDetail === 'function' ? o.onNodeDetail : null;
                if (style) {
                    for (const [id, detail] of detailOf) {
                        this._detailEls.set(id, find(`detail-${id}`));
                        for (const d of detail) {
                            const el = find(`detail-${d.kind}-${id}`);
                            if (!el || typeof el.addEventListener !== 'function') continue;
                            // A badge click is the node's detail, never its focus.
                            const handler = (ev) => {
                                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                                if (this._disposed || !this._onNodeDetail) return;
                                this._onNodeDetail(id, d.kind, d.value, ev);
                            };
                            el.addEventListener('click', handler);
                            this._badgeHandlers.push({ el, handler });
                        }
                    }
                }
                /** @type {Map<string, object>} "from>to" → link <path> element, bound once. */
                this._linkEls = new Map();
                for (const e of this._edges) {
                    this._linkEls.set(`${e.from}>${e.to}`, find(`link-${e.from}-${e.to}`));
                }

                /** @type {string} The currently focused node id. */
                this._focusId = this.rootId;
                /**
                 * The id of the previously-focused node, reported as `info.previous`.
                 * `null` until the first focus of this instance resolves.
                 * @type {string|null}
                 */
                this._previousFocusId = null;
                /**
                 * True while a focus timeline is in flight — the re-entrancy state the
                 * `ignoreWhileFocusing` guard reads (the legacy `state.move` flag).
                 * @type {boolean}
                 */
                this._focusing = false;
                /** @type {Set<object>} In-flight focus timelines (for dispose). */
                this._active = new Set();
                /** @type {Map<string, Function>} id → click handler (for dispose). */
                this._handlers = new Map();
                /** @type {boolean} */
                this._disposed = false;

                // Click-to-focus (the only pointer interaction in this build).
                // Order: disposal guard → re-entrancy guard (opt-in) → onNodeClick
                // (may veto with `false`) → internal focus. With no option set this
                // reduces exactly to the previous `this.focus(id)`.
                for (const id of this._order) {
                    const el = this._nodeEls.get(id);
                    if (el && typeof el.addEventListener === 'function') {
                        const handler = (ev) => {
                            if (this._disposed) return;
                            if (this._ignoreWhileFocusing && this._focusing) return;
                            if (this._onNodeClick && this._onNodeClick(id, ev) === false) return;
                            this.focus(id);
                        };
                        el.addEventListener('click', handler);
                        this._handlers.set(id, handler);
                    }
                }

                // Place everything at its base position (single write path).
                this._writePositions(this._current);
                /** @type {Map<string, number>} Graph distance of each node from the focus. */
                this._depth = new Map();
                for (const nd of this._baseLayout.nodes) this._depth.set(nd.id, nd.depth);
                this._writeLabels(this._depth, false);
            }

            /**
             * Styled mode: the dot radius at graph distance `d` from the focus —
             * `bullet` at 0 and 1, then `bulletFactor` times smaller per ring.
             * @param {number} d
             * @returns {number}
             * @private
             */
            _radiusAt(d) {
                const st = this._style;
                return d <= 1 ? st.bullet : st.bullet / st.factor ** (d - 1);
            }

            /**
             * Styled mode: the root glyph's scale at graph distance `d` from the
             * focus — its natural size at the centre, and off-centre twice its
             * ring's dot radius over its natural radius (the legacy origin shrank
             * to `logoRadius / bulletFactor^(level + 4)`).
             * @param {number} d
             * @returns {number}
             * @private
             */
            _glyphScale(d) {
                return d === 0 ? 1 : (2 * this._radiusAt(d)) / this._glyphR;
            }

            /**
             * Styled mode: write every dot radius and label offset for depths
             * lerped from `from` to `to` at `p` (no write in the default look).
             * @param {Map<string, number>} from
             * @param {Map<string, number>} to
             * @param {number} p
             * @private
             */
            _writeGlyphs(from, to, p) {
                if (!this._style) return;
                for (const id of this._order) {
                    const a = this._radiusAt(from.get(id));
                    const r = a + (this._radiusAt(to.get(id)) - a) * p;
                    const dot = this._dotEls.get(id);
                    if (dot) svgApply.svgAttr(dot, 'r', r);
                    svgApply.svgAttr(this._labelEls.get(id), 'transform', `translate(0 ${2 * r + 15})`);
                }
                if (this._glyphEl) {
                    const a = this._glyphScale(from.get(this.rootId));
                    const b = this._glyphScale(to.get(this.rootId));
                    svgApply.svgAttr(this._glyphEl, 'transform', `scale(${a + (b - a) * p})`);
                }
            }

            /**
             * Apply the `labelDepth` window for a focus whose node depths are
             * `depth`. With `hideOnly`, only labels leaving the window are hidden
             * (the start of a transition); otherwise every label is set. No write
             * at all with the default (unbounded) window.
             * @param {Map<string, number>} depth
             * @param {boolean} hideOnly
             * @private
             */
            _writeLabels(depth, hideOnly) {
                if (this._labelDepth === Infinity) return;
                for (const id of this._order) {
                    if (id === this._noLabel) continue;
                    const inside = depth.get(id) <= this._labelDepth;
                    if (hideOnly && inside) continue;
                    svgApply.svgAttr(this._labelEls.get(id), 'display', inside ? 'inline' : 'none');
                }
            }

            /**
             * Write every node group's transform and every link path's `d` from a
             * position map — the sole DOM write path, all via `svgApply.svgAttr`
             * over reference-bound targets.
             * @param {Map<string, {x:number,y:number}>} posMap
             * @private
             */
            _writePositions(posMap) {
                for (const id of this._order) {
                    const p = posMap.get(id);
                    const g = this._nodeEls.get(id);
                    svgApply.svgAttr(g, 'transform', `translate(${p.x} ${p.y})`);
                }
                const c = this._center;
                for (const e of this._edges) {
                    const a = posMap.get(e.from);
                    const b = posMap.get(e.to);
                    // Legacy fan curve: the control point on the angle of the end
                    // farther from the centre, at the mean of the two ends' distances.
                    const da = Math.hypot(a.x - c, a.y - c);
                    const db = Math.hypot(b.x - c, b.y - c);
                    const far = db >= da ? b : a;
                    const ang = Math.atan2(far.y - c, far.x - c);
                    const r = (da + db) / 2;
                    const qx = c + r * Math.cos(ang);
                    const qy = c + r * Math.sin(ang);
                    svgApply.svgAttr(
                        this._linkEls.get(`${e.from}>${e.to}`),
                        'd',
                        `M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`,
                    );
                }
            }

            /**
             * Settle the focus bookkeeping for `nodeId` and fire `onFocus(id, info)`.
             * `info.previous` is the id that held focus before this call (`null`
             * before the first focus); `info.refocus` is `previous === nodeId`. The
             * second argument is additive — a single-arity consumer simply ignores it.
             * @param {string} nodeId
             * @private
             */
            _notifyFocus(nodeId) {
                const previous = this._previousFocusId;
                this._previousFocusId = nodeId;
                if (this._onFocus) this._onFocus(nodeId, { previous, refocus: previous === nodeId });
            }

            /**
             * The target of focusing `nodeId` (the layout re-rooted there): each
             * node's position and its graph distance from `nodeId`.
             * @param {string} nodeId
             * @returns {{ pos: Map<string, {x:number,y:number}>, depth: Map<string, number> }}
             * @throws {Error} When `nodeId` is unknown.
             * @private
             */
            _target(nodeId) {
                const res = (nodeId === this.rootId)
                    ? this._baseLayout
                    : focusMove(this._baseLayout, nodeId);
                const pos = new Map();
                const depth = new Map();
                for (const nd of res.nodes) {
                    pos.set(nd.id, { x: nd.x, y: nd.y });
                    depth.set(nd.id, nd.depth);
                }
                return { pos, depth };
            }

            /**
             * Stop every in-flight focus timeline, releasing the state they own.
             * Each `Timeline#stop()` fires that timeline's `onSettle` hook, which
             * drops it from `_active` and re-derives `_focusing` — so iterate a
             * SNAPSHOT, the live set mutates underneath. The trailing clear/reset is
             * belt-and-braces: after the loop the hook has already emptied the set.
             * @private
             */
            _cancelActive() {
                if (this._active.size === 0) return;
                for (const tl of Array.from(this._active)) tl.stop();
                this._active.clear();
                this._focusing = false;
            }

            /**
             * Recenter on `nodeId` WITHOUT animation (test seam / immediate).
             *
             * **Precedence**: `focusSync` WINS over any in-flight {@link Hypertree#focus}.
             * The superseded timelines are stopped (through the same `onSettle` seam,
             * so guard state stays consistent) and therefore never run their
             * `onComplete` — a superseded focus never restores its own `_focusId` and
             * never fires `onFocus`. The target is resolved BEFORE anything is
             * cancelled, so an unknown id throws without disturbing the in-flight
             * transition.
             * @param {string} nodeId
             * @returns {this}
             * @throws {Error} When `nodeId` is unknown.
             */
            focusSync(nodeId) {
                const { pos: target, depth } = this._target(nodeId); // throws before any effect
                this._cancelActive();
                this._writePositions(target);
                this._writeGlyphs(depth, depth, 1);
                this._writeLabels(depth, false);
                this._depth = depth;
                this._current = target;
                this._focusId = nodeId;
                this._notifyFocus(nodeId);
                return this;
            }

            /**
             * Recenter on `nodeId` with an animated transition: one fold-param
             * tween `0 → 1` on the frozen timeline/tween + shared scheduler; each
             * tick lerps every node from its current position to the target and
             * writes. On completion the node positions settle and
             * `onFocus(nodeId, { previous, refocus })` fires. While the timeline is in
             * flight the instance is marked as focusing — the state read by the
             * opt-in `ignoreWhileFocusing` click guard.
             * @param {string} nodeId
             * @returns {object} The playing `Timeline`.
             * @throws {Error} When `nodeId` is unknown.
             */
            focus(nodeId) {
                const start = this._current;
                const fromDepth = this._depth;
                const { pos: target, depth } = this._target(nodeId); // throws on unknown
                this._writeLabels(depth, true);
                const order = this._order;
                const center = { x: this._center, y: this._center };

                const moveTween = new Tween({
                    target: this.el,
                    property: 'focus',
                    from: 0,
                    to: 1,
                    duration: this._duration,
                    easing: this._easing,
                    scheduler: this._scheduler,
                    apply: (t) => {
                        const p = /** @type {number} */ (t);
                        const m = new Map();
                        for (const id of order) {
                            const a = start.get(id) || center;
                            const b = target.get(id) || center;
                            m.set(id, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
                        }
                        this._writePositions(m);
                        this._writeGlyphs(fromDepth, depth, p);
                    },
                });
                const tl = new Timeline({
                    scheduler: this._scheduler,
                    // Terminal-transition channel: fires on natural completion AND on
                    // stop() (focusSync supersession, dispose(), or a caller cancelling
                    // the returned Timeline). Guard + in-flight bookkeeping live HERE so
                    // they are released whatever ended the transition. On the completion
                    // path it runs just before `onComplete`, preserving the previous
                    // release-then-notify order.
                    onSettle: () => {
                        this._active.delete(tl);
                        this._focusing = this._active.size > 0;
                    },
                    onComplete: () => {
                        this._writePositions(target);
                        this._writeGlyphs(depth, depth, 1);
                        this._writeLabels(depth, false);
                        this._depth = depth;
                        this._current = target;
                        this._focusId = nodeId;
                        this._notifyFocus(nodeId);
                    },
                });
                tl.add(moveTween, 0);
                tl.play();
                this._active.add(tl);
                this._focusing = true;
                return tl;
            }

            /**
             * Read-only positioned data for `nodeId`: base metadata merged with the
             * current animated position.
             * @param {string} nodeId
             * @returns {{ id:string, x:number, y:number, depth:number, angle:number, sector:{start:number,end:number} }}
             * @throws {Error} When `nodeId` is unknown.
             */
            node(nodeId) {
                const base = this._baseNodeById.get(nodeId);
                if (!base) throw new Error(`hypertree: unknown node "${nodeId}"`);
                const cur = this._current.get(nodeId);
                return {
                    id: base.id,
                    x: cur.x,
                    y: cur.y,
                    depth: base.depth,
                    angle: base.angle,
                    sector: { start: base.sector.start, end: base.sector.end },
                };
            }

            /**
             * The currently focused node id.
             * @returns {string}
             */
            get focusId() {
                return this._focusId;
            }

            /**
             * Remove click listeners and stop any in-flight focus timelines, leaving
             * the scheduler clean (no leaked tickables). Cancellation goes through the
             * SAME `_cancelActive()` seam as `focusSync` supersession, so `_active` and
             * the re-entrancy guard are released structurally rather than by a
             * duplicated reset. Then detach the built subtree from `svgRoot` (the
             * `el` reference stays readable). Idempotent.
             */
            dispose() {
                for (const [id, handler] of this._handlers) {
                    const el = this._nodeEls.get(id);
                    if (el && typeof el.removeEventListener === 'function') {
                        el.removeEventListener('click', handler);
                    }
                }
                this._handlers.clear();
                for (const { el, handler } of this._badgeHandlers) el.removeEventListener('click', handler);
                this._badgeHandlers = [];
                this._cancelActive();
                this._focusing = false;
                this._disposed = true;
                // Detach what the constructor appended; `this.el` stays readable.
                if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            }
        }

        /**
         * Build a {@link Hypertree}.
         * @param {object} svgRoot SVG container element.
         * @param {TreeNode} tree Single-root tree.
         * @param {HypertreeOptions} [opts]
         * @returns {Hypertree}
         */
        function hypertree(svgRoot, tree, opts) {
            return new Hypertree(svgRoot, tree, opts);
        }

        return { Hypertree, hypertree };
    },
};
