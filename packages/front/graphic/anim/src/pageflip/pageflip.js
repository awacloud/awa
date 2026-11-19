// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.pageflip` — page-turn **book** built on the frozen
 * graphic engine, as a capture-free fw module descriptor. Productized from a
 * measured de-risking spike.
 *
 * A {@link Pageflip} builds a namespace-correct SVG book subtree via
 * `graphic.svgBuild` + a FRESH `graphic.scopedIds` scope with a DISTINCT
 * per-instance prefix (so two books never collide — the per-instance id
 * prefix rule). Turning a page runs the aJSFlip **page-curl** fold: the
 * dragged corner sweeps `0 → 1`, driven by the FROZEN `graphic.timeline`/
 * `graphic.tween` on the SINGLE shared `graphic.scheduler`. Each tick recomputes
 * the fold geometry (pure `pageflip.fold`), serializes the turn polygon (pure
 * `pageflip.compose`), and writes the one turning `<path>`'s `d` — the target
 * bound BY REFERENCE once (no per-tick `getElementById`), every attribute written
 * ONLY through `graphic.svgApply.svgAttr`. There is NO second rAF loop.
 *
 * Capture-free: the seven dependencies arrive ONLY as factory parameters
 * (`svgBuild`, `scopedIds`, `timelineMod`, `tweenMod`, `svgApply`, `foldApi`,
 * `composeApi`). The `Pageflip` class AND the per-instance prefix counter are
 * defined INSIDE the factory so they reference only those parameters — never a
 * module-scope binding (`fw/no-factory-capture` clean, verified by the
 * package-local ESLint config over `src/**`). The pure kernels `pageflip.fold`
 * and `pageflip.compose` are injected via DI (NOT captured, NOT members of the
 * public `graphicModules` registry — they are pageflip-internal).
 *
 * **NOT Worker-safe** as a whole: it builds and mutates a DOM subtree (like the
 * other visual modules). The pure geometry layers it consumes (`pageflip.fold`,
 * `pageflip.compose`) are Worker-safe by construction.
 *
 * **Rendering model** (the aJSFlip turn): during a turn the page being lifted
 * shows only where the fold's `under` polygon lies, the page the turn reveals
 * shows everywhere else, and the leaf back (the fold's `turn` polygon, plain paper
 * in this single-page book) lies on top. The dragged corner follows the old two
 * legs, `(w,0) → (0,0.1·h) → (−w,0)`, so the leaf ends lying past the spine,
 * outside the page. Page groups stay in reading order, so the revealed page (the
 * later one, in either direction) is painted above the lifted one: it is the page
 * clipped, to the complement of `under` (the page rect plus `under`, even-odd, one
 * scoped `<clipPath>`). No DOM node moves. A backward turn runs the same fold
 * reversed.
 *
 * **Two-page spread** (opt-in `spread: true`, the aJSFlip book): the book is two
 * pages wide, the spine in the middle. Spread 0 shows the first page on the
 * right; spread `s` shows pages `2s − 1 | 2s` (0-based). Page contents are built
 * once in `<defs>` and shown through four `<use>` slots (left, right, the page
 * beneath, the leaf back) whose `href` changes only at the start and end of a
 * turn. A forward turn clips the right page to the fold's `under` polygon over
 * the next spread's right page, and the leaf carries the next spread's left page
 * (the verso) under the fold's `pattern` transform, clipped to the `turn`
 * polygon: at the end of the turn it lies exactly on the left page. A backward
 * turn is the forward turn of the previous spread played in reverse. The spread
 * carries the old shading: gutter shadows at the spine whose widths follow the
 * reading progress, gradient-stroked outer edges where pages are stacked, and a
 * gradient-stroked leaf outline during a turn.
 *
 * **Pointer** (spread, opt-in through the `events` option — the resolved fw
 * `dom/query/events` module): the old aJSFlip corners. Four zones, 40 % of a page
 * wide and high, sit at the spread's outer corners; hovering one peels its corner
 * inward, pressing drags it with the pointer, and releasing past a quarter page
 * beyond the spine completes the turn (otherwise it goes back); a click runs the
 * two-leg turn. A left corner is the canonical fold with its corner on the left
 * page; a bottom corner mirrors y in and out. The single-page book stays
 * programmatic.
 *
 * **Image pages** (a page with `src`): the old aJSFlip `cache`. A white
 * placeholder lies under an `<image>` that gets its `href` only once its bytes
 * are decoded; a window of `cache` pages around the current one is preloaded,
 * at most `preloadConcurrency` at a time, nearest first, a turn's target pages
 * first; the window moves when a turn settles.
 *
 * Documented follow-ups (OUT): pointer on the single-page book. The single-page book stays unshaded. SVG only — no Canvas
 * offscreen aid.
 *
 * @module graphic.pageflip
 */

import { svgBuildModule } from '../svg/build.js';
import { scopedIdsModule } from '../svg/scoped-ids.js';
import { timelineModule } from '../anim/timeline.js';
import { tweenModule } from '../anim/tween.js';
import { svgApplyModule } from '../svg/apply.js';
import { foldModule } from './fold.js';
import { composeModule } from './compose.js';

/**
 * @typedef {{ tag: string, attrs?: Record<string, string|number>, children?: (NodeDesc|string)[], text?: string|number }} NodeDesc
 */

/**
 * @typedef {Object} PageSpec
 * @property {string} id Stable page id (used by `goTo`; scoped for the DOM id).
 * @property {NodeDesc} [template] Optional page content built via `graphic.svgBuild`.
 *   When omitted, a plain page-sized `<rect>` placeholder is built.
 * @property {string} [src] An image page (used when there is no `template`): a
 *   white placeholder under an `<image>` whose `href` is set to `src` once the
 *   image is decoded, inside the preload window.
 */

/**
 * @typedef {Object} PageflipOptions
 * @property {PageSpec[]} pages The book's pages, in reading order (>= 1).
 * @property {number} width Page width (SVG user units).
 * @property {number} height Page height (SVG user units).
 * @property {string} [prefix] Id-scope prefix; defaults to a DISTINCT per-instance
 *   `pageflip-<n>` value (never a shared constant: the per-instance id prefix rule).
 * @property {number} [duration=300] Turn duration in ms.
 * @property {((t: number) => number)|string} [easing='linear'] Curve fn or name.
 * @property {number} [marginPercent=1] Fold margin scale (forwarded to `fold`).
 * @property {number} [ratio=1] Pattern render ratio (forwarded to `fold`).
 * @property {string} [backFill='#e9e6df'] Fill of the leaf back (plain paper; in a
 *   spread, the backing under the verso page).
 * @property {number} [shadow=0.05] Spread gutter shadow width, as a fraction of
 *   `width` (the old `compute.shadow`); `0` hides the gutters.
 * @property {{ scope: Function }} [events] The resolved fw `dom/query/events`
 *   module. With a spread, it enables the pointer corners (hover peel, drag,
 *   click); without it the book is programmatic only.
 * @property {number} [cache=8] Image pages: the preload window, in pages (the
 *   old `cache`), from `index − cache/2`.
 * @property {number} [preloadConcurrency=1] Image pages: loads in flight at most
 *   (the old book loaded one at a time).
 * @property {(src: string) => Promise<void>} [loadImage] Image pages: the loader;
 *   resolves once the image is decoded. Default: `Image` + `decode()` when the
 *   environment has them, otherwise an immediate resolution.
 * @property {boolean} [pointer=true] Set `false` to keep a spread programmatic
 *   even when `events` is given.
 * @property {boolean} [spread=false] Two-page spread: the book is `2·width` wide,
 *   `index` is the lowest page index visible in the current spread, and
 *   `next`/`previous`/`goTo` move by spread.
 * @property {object} [scheduler] Override the shared scheduler (tests / isolation).
 */

/**
 * `graphic.pageflip` module descriptor.
 *
 * Factory returns `{ Pageflip, pageflip }`:
 * - `Pageflip` — the page-turn book class (builds the subtree, drives the curl).
 * - `pageflip` — convenience that builds a {@link Pageflip}.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svgBuildModule, typeof scopedIdsModule, typeof timelineModule, typeof tweenModule, typeof svgApplyModule, typeof foldModule, typeof composeModule], factory(svgBuild: object, scopedIds: object, timelineMod: object, tweenMod: object, svgApply: object, foldApi: object, composeApi: object): { Pageflip: Function, pageflip: Function } }}
 */
export const pageflipModule = {
    name: 'graphic.pageflip',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [
        'graphic.svgBuild',
        'graphic.scopedIds',
        'graphic.timeline',
        'graphic.tween',
        'graphic.svgApply',
        'pageflip.fold',
        'pageflip.compose',
    ],
    deps: [
        svgBuildModule,
        scopedIdsModule,
        timelineModule,
        tweenModule,
        svgApplyModule,
        foldModule,
        composeModule,
    ],

    /**
     * Build the pageflip surface from the seven resolved dependencies. All wiring
     * is via parameters — the factory body never references a module-scope binding.
     *
     * @param {{ build: Function, SVG_TAGS: Set<string> }} svgBuild Resolved `graphic.svgBuild`.
     * @param {{ createScope: Function }} scopedIds Resolved `graphic.scopedIds`.
     * @param {{ Timeline: Function }} timelineMod Resolved `graphic.timeline`.
     * @param {{ Tween: Function, tween: Function }} tweenMod Resolved `graphic.tween`.
     * @param {{ SVG_NS: string, svgAttr: Function }} svgApply Resolved `graphic.svgApply`.
     * @param {{ fold: Function }} foldApi Resolved `pageflip.fold` — `{ fold, … }`.
     * @param {{ compose: Function }} composeApi Resolved `pageflip.compose` — `{ compose }`.
     * @returns {{ Pageflip: Function, pageflip: Function }}
     */
    factory(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, foldApi, composeApi) {
        const { Timeline } = timelineMod;
        const { Tween } = tweenMod;
        const { fold } = foldApi;
        const { compose } = composeApi;

        /**
         * Per-factory monotonic counter minting DISTINCT default prefixes so two
         * books built without an explicit `prefix` never mint colliding ids
         * (the per-instance id prefix rule). Defined in-factory (capture-free).
         * @type {number}
         */
        let _instanceSeq = 0;

        /**
         * A page's content: its `template`; for an image page (`src`), a white
         * placeholder under an `<image>` with no `href` yet; otherwise a white rect.
         * @param {PageSpec} pg
         * @param {number} w
         * @param {number} h
         * @returns {NodeDesc}
         */
        function pageContent(pg, w, h) {
            if (pg.template) return pg.template;
            const paper = { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#ffffff' } };
            if (!pg.src) return paper;
            return {
                tag: 'g',
                children: [paper, {
                    tag: 'image',
                    attrs: { id: `img-${pg.id}`, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'xMidYMid slice' },
                }],
            };
        }

        /**
         * The default image loader: resolves once `src` is decoded (`Image` +
         * `decode()`, else `load`), rejects on an error; resolves at once where
         * the environment has no `Image` (a Worker, a bare test realm).
         * @param {string} src
         * @returns {Promise<void>}
         */
        function defaultLoadImage(src) {
            const Img = globalThis.Image;
            if (typeof Img !== 'function') return Promise.resolve();
            const img = new Img();
            if (typeof img.decode === 'function') {
                img.src = src;
                return img.decode();
            }
            return new Promise((resolve, reject) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => reject(new Error(`pageflip: image failed: ${src}`)), { once: true });
                img.src = src;
            });
        }

        /**
         * A page-turn book: a built SVG subtree + programmatic curl navigation.
         */
        class Pageflip {
            /**
             * @param {PageflipOptions} opts
             * @throws {Error} When `pages` is missing/empty or `width`/`height`
             *   are not positive.
             */
            constructor(opts) {
                const o = opts || {};
                if (!Array.isArray(o.pages) || o.pages.length === 0) {
                    throw new Error('Pageflip: pages must be a non-empty array');
                }
                if (!(o.width > 0) || !(o.height > 0)) {
                    throw new Error('Pageflip: width and height must be positive');
                }

                /** @type {PageSpec[]} Pages bound BY REFERENCE, in reading order. */
                this._pages = o.pages;
                /** @type {{ width:number, height:number, marginPercent?:number, ratio?:number }} */
                this._page = {
                    width: o.width,
                    height: o.height,
                    marginPercent: o.marginPercent || 1,
                    ratio: o.ratio || 1,
                };
                this._duration = o.duration > 0 ? o.duration : 300;
                this._easing = o.easing || 'linear';
                /** @type {string} Leaf back fill (plain paper in the single-page book). */
                this._backFill = o.backFill || '#e9e6df';
                /** @type {number} Image pages: preload window, in pages. */
                this._cache = o.cache > 0 ? Math.floor(o.cache) : 8;
                /** @type {number} Image pages: loads in flight at most. */
                this._concurrency = o.preloadConcurrency > 0 ? Math.floor(o.preloadConcurrency) : 1;
                /** @type {(src: string) => Promise<void>} Image pages: the loader. */
                this._loadImage = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
                /** @type {object|undefined} Scheduler override (undefined ⇒ shared). */
                this._scheduler = o.scheduler;

                /** @type {string} DISTINCT per-instance prefix (never a shared constant). */
                this.prefix = o.prefix || `pageflip-${_instanceSeq++}`;
                /** @type {object} Fresh, isolated id scope. */
                this._scope = scopedIds.createScope(this.prefix);

                /** @type {number} Currently visible page index. */
                this.index = 0;
                /** @type {number} Total pages. */
                this.pageCount = this._pages.length;
                /**
                 * In-flight turn `Timeline`s (an overlapping `next()`/`previous()`/`goTo()` used to overwrite
                 * a single `_turn` field, leaking the earlier Timeline on the scheduler).
                 * The ignore-while-in-flight policy (see `next`/`previous`/`goTo`) keeps
                 * this at 0 or 1 member, but tracking it as a `Set` — the same shape as
                 * hypertree's `_active` — makes a leak structurally impossible rather than
                 * just unlikely: `dispose()` iterates and stops EVERY member, whatever
                 * their count.
                 * @type {Set<object>}
                 */
                this._active = new Set();
                /** @type {boolean} Set once by {@link Pageflip#dispose}. */
                this._disposed = false;

                // Build the book subtree: the leaf clip in <defs>, one <g> per page
                // (display-toggled, in reading order), and the leaf <path> on top.
                // Ids are minted through the fresh scope.
                /** @type {string} The page rect, the outer ring of the even-odd clip. */
                this._pageRing = `M 0 0 L ${o.width} 0 L ${o.width} ${o.height} L 0 ${o.height} Z`;
                const template = {
                    tag: 'svg',
                    attrs: {
                        id: 'book',
                        width: o.width,
                        height: o.height,
                        viewBox: `0 0 ${o.width} ${o.height}`,
                    },
                    children: [
                        {
                            tag: 'defs',
                            children: [{
                                tag: 'clipPath',
                                attrs: { id: 'leaf-clip' },
                                children: [{
                                    tag: 'path',
                                    attrs: { id: 'leaf-clip-path', 'clip-rule': 'evenodd', d: this._pageRing },
                                }],
                            }],
                        },
                        ...this._pages.map((pg) => ({
                            tag: 'g',
                            attrs: { id: `page-${pg.id}`, display: 'none', 'clip-path': 'none' },
                            children: [pageContent(pg, o.width, o.height)],
                        })),
                        { tag: 'path', attrs: { id: 'turn', fill: this._backFill, d: '' } },
                    ],
                };

                /** @type {boolean} Two-page spread mode (opt-in). */
                this._spreadMode = o.spread === true;
                /** @type {number} Spread gutter shadow width, as a fraction of `width`. */
                this._shadow = o.shadow >= 0 ? o.shadow : 0.05;

                /** @type {SVGElement} The built book root. */
                this.el = svgBuild.build(this._spreadMode ? this._spreadTemplate(o) : template,
                    { idScope: this._scope });

                // Bind targets BY REFERENCE once (no per-tick DOM lookup).
                /** @type {SVGElement[]} Page group elements, index-aligned to `_pages`. */
                this._pageEls = this._pages.map((pg) => this._find(`page-${pg.id}`));
                /** @type {SVGElement} The single turning <path>, bound once. */
                this._turnPath = this._find('turn');
                /** @type {SVGElement} The leaf clip's <path>, bound once. */
                this._clipPath = this._find('leaf-clip-path');
                /** @type {string} `clip-path` value referencing the scoped leaf clip. */
                this._clipRef = `url(#${this._scope.id('leaf-clip')})`;

                if (this._spreadMode) {
                    /** @type {{left:SVGElement,right:SVGElement,beneath:SVGElement,back:SVGElement}} */
                    this._slots = {
                        left: this._find('slot-left'),
                        right: this._find('slot-right'),
                        beneath: this._find('slot-beneath'),
                        back: this._find('slot-back'),
                    };
                    /** @type {SVGElement} The leaf group (clipped to the turn polygon). */
                    this._leaf = this._find('leaf');
                    /** @type {SVGElement} The verso group under the fold's pattern transform. */
                    this._verso = this._find('verso');
                    /** @type {{gutterLeft:SVGElement,gutterRight:SVGElement,edgeLeft:SVGElement,edgeRight:SVGElement,leafEdge:SVGElement}} */
                    this._shade = {
                        gutterLeft: this._find('gutter-left'),
                        gutterRight: this._find('gutter-right'),
                        edgeLeft: this._find('edge-left'),
                        edgeRight: this._find('edge-right'),
                        leafEdge: this._find('leaf-edge'),
                    };
                    /** @type {number} The current spread. */
                    this._spread = 0;
                    /**
                     * Pointer state: `idle`, `peel` / `unpeel` (hover), `drag`, or
                     * `release` (the animation after a drag or a click), with the
                     * corner side and mirror, the spreads of the leaf (`a` < `b`),
                     * the corner's rest point and its current canonical position.
                     * @type {{mode:string, side:string|null, bottom:boolean, a:number, b:number, rest:{x:number,y:number}|null, corner:{x:number,y:number}|null, down:{x:number,y:number}|null}}
                     */
                    this._ix = { mode: 'idle', side: null, bottom: false, a: -1, b: -1, rest: null, corner: null, down: null };
                    /** @type {object|null} The hover-peel timeline (outside `_active`). */
                    this._peelTl = null;
                    /** @type {object|null} The fw `events` scope of the pointer listeners. */
                    this._pointerScope = null;
                    this._restSpread(0);
                    if (o.events && typeof o.events.scope === 'function' && o.pointer !== false) {
                        this._bindPointer(o.events);
                    }
                    this._bindImages();
                    return;
                }

                // Show the first page immediately.
                this._show(0);
                this._bindImages();
            }

            /**
             * Bind the image pages (by reference, once) and start the preload
             * window.
             * @private
             */
            _bindImages() {
                /** @type {Map<number, {el: SVGElement, src: string, state: string}>} page index → image record. */
                this._images = new Map();
                for (let i = 0; i < this._pages.length; i += 1) {
                    const pg = this._pages[i];
                    if (pg.template || !pg.src) continue;
                    this._images.set(i, { el: this._find(`img-${pg.id}`), src: String(pg.src), state: 'idle' });
                }
                /** @type {number[]} Page indices waiting for a load, in order. */
                this._queue = [];
                /** @type {number} Loads in flight. */
                this._inflight = 0;
                this._refreshWindow([]);
            }

            /**
             * Queue the image pages of the window around `index` (nearest first)
             * after the `first` page indices, then pump the loads.
             * @param {number[]} first Page indices to put at the front (a turn's targets).
             * @private
             */
            _refreshWindow(first) {
                if (!this._images || this._images.size === 0 || this._disposed) return;
                const n = this._pages.length;
                const c = this.index;
                const start = Math.max(0, c - Math.floor(this._cache / 2));
                const end = Math.min(n, start + this._cache);
                const win = [];
                for (let i = start; i < end; i += 1) win.push(i);
                win.sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b);
                const wanted = [];
                for (const i of [...first, ...win]) {
                    const rec = this._images.get(i);
                    if (rec && rec.state === 'idle' && !wanted.includes(i)) wanted.push(i);
                }
                // Pages that left the window are not loaded any more.
                this._queue = wanted;
                this._pump();
            }

            /**
             * Start loads while fewer than `preloadConcurrency` are in flight. An
             * image's `href` is written only after its loader resolved.
             * @private
             */
            _pump() {
                while (this._inflight < this._concurrency && this._queue.length > 0) {
                    const i = this._queue.shift();
                    const rec = this._images.get(i);
                    if (!rec || rec.state !== 'idle') continue;
                    rec.state = 'loading';
                    this._inflight += 1;
                    let p;
                    try {
                        p = Promise.resolve(this._loadImage(rec.src));
                    } catch (err) {
                        p = Promise.reject(err);
                    }
                    p.then(() => {
                        this._inflight -= 1;
                        if (this._disposed) return;
                        rec.state = 'ready';
                        svgApply.svgAttr(rec.el, 'href', rec.src);
                        this._pump();
                    }, () => {
                        this._inflight -= 1;
                        if (this._disposed) return;
                        rec.state = 'error';
                        this._pump();
                    });
                }
            }

            /**
             * The image state of page `id`: `none` (not an image page), `idle`,
             * `loading`, `ready` or `error`.
             * @param {string} id
             * @returns {string}
             */
            imageState(id) {
                const rec = this._images && this._images.get(this._indexOf(id));
                return rec ? rec.state : 'none';
            }

            /**
             * The spread-mode subtree: page contents once in `<defs>` (reading
             * order) beside the two clips and the two shading gradients; a left
             * slot; then, translated to the spine, the page beneath, the right slot
             * (clipped to `under` during a turn), the gutter shadows and the stack
             * edges, the leaf (the verso over a paper backing, clipped to the `turn`
             * polygon) and the leaf edge.
             *
             * The shading is the old aJSFlip one: `#767676`, `stop-opacity` 1 → 0;
             * `shade-r` is opaque at its left end, `shade-l` at its right end. The
             * stack-edge stroke is the old `0.2 %` of its viewport,
             * `viewBox 2w × (h + 2·margin)` with `margin = √(w² + h²) − h`; the leaf
             * edge is half of it.
             * @param {{width:number,height:number}} o
             * @returns {NodeDesc}
             * @private
             */
            _spreadTemplate(o) {
                const w = o.width;
                const h = o.height;
                const hidden = { display: 'none' };
                const m = Math.sqrt(w * w + h * h) - h;
                const edge = 0.002 * Math.sqrt(((2 * w) ** 2 + (h + 2 * m) ** 2) / 2);
                const gradient = (id, x1, x2) => ({
                    tag: 'linearGradient',
                    attrs: { id, x1, x2, y1: '0%', y2: '0%' },
                    children: [
                        { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#767676', 'stop-opacity': 1 } },
                        { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#767676', 'stop-opacity': 0 } },
                    ],
                });
                const gutter = (id, fill) => ({
                    tag: 'rect',
                    attrs: { id, x: 0, y: 0, width: 0, height: h, fill: `url(#${fill})`, 'fill-opacity': 0.5 },
                });
                const stack = (id, x, stroke) => ({
                    tag: 'rect',
                    attrs: {
                        id, x, y: 0, width: w, height: h, fill: 'none',
                        stroke: `url(#${stroke})`, 'stroke-width': edge, ...hidden,
                    },
                });
                return {
                    tag: 'svg',
                    // `overflow: visible`: a tilted leaf overhangs the book edge, as
                    // in the old book.
                    attrs: { id: 'book', width: 2 * w, height: h, viewBox: `0 0 ${2 * w} ${h}`, overflow: 'visible' },
                    children: [
                        {
                            tag: 'defs',
                            children: [
                                {
                                    tag: 'clipPath',
                                    attrs: { id: 'turn-clip' },
                                    children: [{ tag: 'path', attrs: { id: 'turn', d: '' } }],
                                },
                                {
                                    tag: 'clipPath',
                                    attrs: { id: 'leaf-clip' },
                                    children: [{ tag: 'path', attrs: { id: 'leaf-clip-path', d: '' } }],
                                },
                                gradient('shade-r', '0%', '100%'),
                                gradient('shade-l', '100%', '0%'),
                                ...this._pages.map((pg) => ({
                                    tag: 'g',
                                    attrs: { id: `page-${pg.id}` },
                                    children: [pageContent(pg, w, h)],
                                })),
                            ],
                        },
                        { tag: 'use', attrs: { id: 'slot-left', ...hidden } },
                        {
                            tag: 'g',
                            attrs: { transform: `translate(${w} 0)` },
                            children: [
                                { tag: 'use', attrs: { id: 'slot-beneath', ...hidden } },
                                { tag: 'use', attrs: { id: 'slot-right', 'clip-path': 'none', ...hidden } },
                                gutter('gutter-left', 'shade-l'),
                                gutter('gutter-right', 'shade-r'),
                                stack('edge-left', -w, 'shade-r'),
                                stack('edge-right', 0, 'shade-l'),
                                {
                                    tag: 'g',
                                    attrs: { id: 'leaf', 'clip-path': 'url(#turn-clip)', ...hidden },
                                    children: [{
                                        tag: 'g',
                                        attrs: { id: 'verso', transform: 'translate(0 0) rotate(0)' },
                                        children: [
                                            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: this._backFill } },
                                            { tag: 'use', attrs: { id: 'slot-back', ...hidden } },
                                        ],
                                    }],
                                },
                                {
                                    tag: 'path',
                                    attrs: {
                                        id: 'leaf-edge', d: '', fill: 'none',
                                        stroke: 'url(#shade-r)', 'stroke-width': edge / 2, ...hidden,
                                    },
                                },
                            ],
                        },
                    ],
                };
            }

            /**
             * Point a `<use>` slot at page `i`, or hide it when `i` is not a page.
             * @param {SVGElement} slot
             * @param {number} i
             * @private
             */
            _slotTo(slot, i) {
                if (i < 0 || i >= this._pageEls.length) {
                    svgApply.svgAttr(slot, 'display', 'none');
                    return;
                }
                svgApply.svgAttr(slot, 'href', `#${this._pageEls[i].getAttribute('id')}`);
                svgApply.svgAttr(slot, 'display', 'inline');
            }

            /**
             * The spread showing page `i`: spread 0 holds page 0 alone; spread `s`
             * holds pages `2s − 1` and `2s`.
             * @param {number} i
             * @returns {number}
             * @private
             */
            _spreadOf(i) {
                return Math.floor((i + 1) / 2);
            }

            /**
             * The lowest page index of spread `s` (the value of `index` there).
             * @param {number} s
             * @returns {number}
             * @private
             */
            _firstOf(s) {
                return s === 0 ? 0 : 2 * s - 1;
            }

            /**
             * Put the spread book at rest on spread `s`.
             * @param {number} s
             * @private
             */
            _restSpread(s) {
                this._slotTo(this._slots.left, s === 0 ? -1 : 2 * s - 1);
                this._slotTo(this._slots.right, 2 * s);
                svgApply.svgAttr(this._slots.right, 'clip-path', 'none');
                svgApply.svgAttr(this._slots.beneath, 'display', 'none');
                svgApply.svgAttr(this._slots.back, 'display', 'none');
                svgApply.svgAttr(this._leaf, 'display', 'none');
                // Shading at rest: gutters by reading progress, stack edges where
                // pages are stacked, no leaf edge.
                const n = this._pageEls.length;
                const g = this._shadow * this._page.width;
                const p = Math.min(1, (2 * s) / n);
                svgApply.svgAttr(this._shade.gutterLeft, 'x', -p * g);
                svgApply.svgAttr(this._shade.gutterLeft, 'width', p * g);
                svgApply.svgAttr(this._shade.gutterRight, 'width', (1 - p) * g);
                svgApply.svgAttr(this._shade.edgeLeft, 'display', s > 0 && 2 * s - 1 < n ? 'inline' : 'none');
                svgApply.svgAttr(this._shade.edgeRight, 'display', 2 * s + 1 < n ? 'inline' : 'none');
                svgApply.svgAttr(this._shade.leafEdge, 'display', 'none');
            }

            /**
             * Spread-mode frame for a canonical corner `c` (spine-relative, the top
             * frame): the leaf clip (`turn`), the clip of the right page being lifted
             * (`under`), the verso's transform and the leaf edge — the four per-tick
             * writes, all through `svgApply.svgAttr`. A bottom corner mirrors y in
             * and out; its verso is pinned by its bottom-left corner:
             * `translate(px, h − py) rotate(−θ) translate(0, −h)`.
             * @param {{x:number,y:number}} c
             * @param {boolean} bottom
             * @private
             */
            _applyCorner(c, bottom) {
                const h = this._page.height;
                const solved = fold(c, this._page);
                const pt = solved.pattern;
                const flip = (poly) => (bottom ? poly.map((q) => ({ x: q.x, y: h - q.y })) : poly);
                const turn = compose(flip(solved.turn));
                svgApply.svgAttr(this._turnPath, 'd', turn);
                svgApply.svgAttr(this._clipPath, 'd', compose(flip(solved.under)));
                svgApply.svgAttr(this._verso, 'transform', bottom
                    ? `translate(${pt.x} ${h - pt.y}) rotate(${-pt.rotate}) translate(0 ${-h})`
                    : `translate(${pt.x} ${pt.y}) rotate(${pt.rotate})`);
                svgApply.svgAttr(this._shade.leafEdge, 'd', turn);
                this._ix.corner = { x: c.x, y: c.y };
                this._ix.bottom = bottom;
            }

            /**
             * Spread-mode frame at fold parameter `p` of the programmatic turn.
             * @param {number} p
             * @private
             */
            _applySpread(p) {
                this._applyCorner(this._cornerAt(p), false);
            }

            /**
             * The old two-leg corner path from `start` through `(0, 0.1·h)` at the
             * spine to `end`, linear on each leg (canonical coordinates).
             * @param {{x:number,y:number}} start
             * @param {{x:number,y:number}} end
             * @returns {(t: number) => {x:number,y:number}}
             * @private
             */
            _legs(start, end) {
                const mid = { x: 0, y: this._page.height * 0.1 };
                const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                return (t) => (t <= 0.5 ? lerp(start, mid, 2 * t) : lerp(mid, end, 2 * t - 1));
            }

            /**
             * Point the slots at the leaf of the turn from spread `a` to `a + 1`
             * (`b`): `a`'s left page on the left, `b`'s right page beneath, `a`'s
             * right page clipped to `under`, `b`'s left page on the leaf.
             * @param {number} a
             * @param {number} b
             * @private
             */
            _setupLeaf(a, b) {
                this._slotTo(this._slots.left, a === 0 ? -1 : 2 * a - 1);
                this._slotTo(this._slots.beneath, 2 * b);
                this._slotTo(this._slots.right, 2 * a);
                svgApply.svgAttr(this._slots.right, 'clip-path', this._clipRef);
                this._slotTo(this._slots.back, 2 * b - 1);
                svgApply.svgAttr(this._leaf, 'display', 'inline');
                svgApply.svgAttr(this._shade.leafEdge, 'display', 'inline');
            }

            /**
             * Rest the spread book on spread `s` and reset the pointer state.
             * @param {number} s
             * @private
             */
            _settle(s) {
                this._spread = s;
                this.index = this._firstOf(s);
                this._restSpread(s);
                this._ix.mode = 'idle';
                this._ix.side = null;
                this._refreshWindow([]);
            }

            /**
             * Animate the corner along `path(t)`, `t` from 0 to 1, on the frozen
             * tween/timeline. A turn or release animation (`peel` false) joins
             * `_active` (the in-flight guard) and, if cancelled, rests the book on
             * its spread; a peel stays outside `_active` and its canceller owns the
             * next state. `onDone` runs on completion.
             * @param {(t: number) => {x:number,y:number}} path
             * @param {boolean} bottom
             * @param {number} duration
             * @param {((t: number) => number)|string} easing
             * @param {boolean} peel
             * @param {() => void} onDone
             * @returns {object} The playing `Timeline`.
             * @private
             */
            _animateCorner(path, bottom, duration, easing, peel, onDone) {
                this._applyCorner(path(0), bottom);
                const tween = new Tween({
                    target: this._turnPath,
                    property: 'd',
                    from: 0,
                    to: 1,
                    duration,
                    easing,
                    scheduler: this._scheduler,
                    apply: (value) => this._applyCorner(path(/** @type {number} */ (value)), bottom),
                });
                const tl = new Timeline({
                    scheduler: this._scheduler,
                    onSettle: () => {
                        if (peel) {
                            if (this._peelTl === tl) this._peelTl = null;
                            return;
                        }
                        this._active.delete(tl);
                        if (!tl.done) this._settle(this._spread);
                    },
                    onComplete: onDone,
                });
                if (peel) this._peelTl = tl;
                else this._active.add(tl);
                tl.add(tween, 0);
                tl.play();
                return tl;
            }

            /**
             * Stop a hover peel in flight (its canceller sets the next state).
             * @private
             */
            _cancelPeel() {
                if (this._peelTl) this._peelTl.stop();
                this._peelTl = null;
            }

            /**
             * Drive a spread turn to spread `to`: the forward turn from the lower
             * spread `a` to the higher spread `b` along the old two-leg path, or the
             * same leaf backward from the left page. Cancels a hover peel. Same
             * `Timeline` bookkeeping as {@link Pageflip#_turnTo}.
             * @param {number} to
             * @returns {object} The playing `Timeline`.
             * @private
             */
            _turnSpread(to) {
                this._cancelPeel();
                this._refreshWindow([2 * to - 1, 2 * to]);
                const forward = to > this._spread;
                const a = forward ? this._spread : to;
                const b = forward ? to : this._spread;
                const w = this._page.width;
                this._setupLeaf(a, b);
                this._ix.mode = 'release';
                const path = forward
                    ? this._legs({ x: w, y: 0 }, { x: -w, y: 0 })
                    : this._legs({ x: -w, y: 0 }, { x: w, y: 0 });
                return this._animateCorner(path, false, this._duration, this._easing, false,
                    () => this._settle(to));
            }

            /**
             * Bind the pointer listeners through a fresh fw `events` scope.
             * @param {{ scope: Function }} events
             * @private
             */
            _bindPointer(events) {
                const scope = events.scope(`${this.prefix}-pointer`);
                scope.on('move', this.el, 'pointermove', (e) => this._onMove(e));
                scope.on('down', this.el, 'pointerdown', (e) => this._onDown(e));
                scope.on('up', this.el, 'pointerup', (e) => this._onUp(e, false));
                scope.on('cancel', this.el, 'pointercancel', (e) => this._onUp(e, true));
                scope.on('leave', this.el, 'pointerleave', () => this._onLeave());
                this._pointerScope = scope;
            }

            /**
             * Client coordinates to book coordinates (`viewBox 0 0 2w h`), through
             * the inverse screen CTM, or the bounding box when there is none.
             * @param {{clientX:number, clientY:number}} e
             * @returns {{x:number,y:number}}
             * @private
             */
            _toBook(e) {
                const m = typeof this.el.getScreenCTM === 'function' ? this.el.getScreenCTM() : null;
                if (m) {
                    const det = m.a * m.d - m.b * m.c;
                    const x = e.clientX - m.e;
                    const y = e.clientY - m.f;
                    return { x: (m.d * x - m.c * y) / det, y: (m.a * y - m.b * x) / det };
                }
                const r = this.el.getBoundingClientRect();
                const sx = r.width > 0 ? (2 * this._page.width) / r.width : 1;
                const sy = r.height > 0 ? this._page.height / r.height : 1;
                return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
            }

            /**
             * The corner zone under a book point: 40 % of a page wide and high at
             * the spread's outer corners, or `null`.
             * @param {number} x
             * @param {number} y
             * @returns {{side:string, bottom:boolean}|null}
             * @private
             */
            _zoneAt(x, y) {
                const w = this._page.width;
                const h = this._page.height;
                const side = x >= 2 * w - 0.4 * w && x <= 2 * w ? 'R' : (x >= 0 && x <= 0.4 * w ? 'L' : null);
                if (!side) return null;
                if (y >= 0 && y <= 0.4 * h) return { side, bottom: false };
                if (y >= h - 0.4 * h && y <= h) return { side, bottom: true };
                return null;
            }

            /**
             * Whether a zone can turn: a right corner needs a next spread, a left
             * corner a previous one.
             * @param {{side:string}} z
             * @returns {boolean}
             * @private
             */
            _zoneActive(z) {
                if (z.side === 'R') return this._spread < this._spreadOf(this._pages.length - 1);
                return this._spread > 0;
            }

            /**
             * Set the leaf up for a corner zone of the current spread and put its
             * corner at rest.
             * @param {{side:string, bottom:boolean}} z
             * @private
             */
            _zoneSetup(z) {
                const w = this._page.width;
                const right = z.side === 'R';
                const a = right ? this._spread : this._spread - 1;
                const ix = this._ix;
                ix.side = z.side;
                ix.a = a;
                ix.b = a + 1;
                ix.rest = { x: right ? w : -w, y: 0 };
                this._setupLeaf(a, a + 1);
                this._applyCorner(ix.rest, z.bottom);
            }

            /**
             * Pointer move: drag the corner, or start / end a hover peel.
             * @param {PointerEvent} e
             * @private
             */
            _onMove(e) {
                if (this._disposed) return;
                const ix = this._ix;
                const pt = this._toBook(e);
                if (ix.mode === 'drag') {
                    this._applyCorner({
                        x: pt.x - this._page.width,
                        y: ix.bottom ? this._page.height - pt.y : pt.y,
                    }, ix.bottom);
                    return;
                }
                if (this._active.size > 0 || e.buttons) return;
                const z = this._zoneAt(pt.x, pt.y);
                const valid = z && this._zoneActive(z);
                if (ix.mode === 'idle' && valid) {
                    this._startPeel(z);
                } else if (ix.mode === 'peel' && (!valid || z.side !== ix.side || z.bottom !== ix.bottom)) {
                    this._endPeel();
                }
            }

            /**
             * Hover peel: the corner moves inward by `0.2 · min(w, h)` on both axes
             * in 250 ms, linear (the old `cornerMove` and `cornerDelay`).
             * @param {{side:string, bottom:boolean}} z
             * @private
             */
            _startPeel(z) {
                this._zoneSetup(z);
                const ix = this._ix;
                const m = 0.2 * Math.min(this._page.width, this._page.height);
                const from = ix.rest;
                const to = { x: from.x + (z.side === 'R' ? -m : m), y: m };
                ix.mode = 'peel';
                this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
                    z.bottom, 250, 'linear', true, () => {});
            }

            /**
             * Peel the corner back to rest in 250 ms, then rest the book.
             * @private
             */
            _endPeel() {
                this._cancelPeel();
                const ix = this._ix;
                const from = ix.corner;
                const to = ix.rest;
                ix.mode = 'unpeel';
                this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
                    ix.bottom, 250, 'linear', true, () => this._settle(this._spread));
            }

            /**
             * Pointer leaving the book ends a hover peel.
             * @private
             */
            _onLeave() {
                if (!this._disposed && this._ix.mode === 'peel') this._endPeel();
            }

            /**
             * Pointer down in an active zone starts a drag from the corner's
             * current position (a peel in progress is taken over).
             * @param {PointerEvent} e
             * @private
             */
            _onDown(e) {
                if (this._disposed || this._active.size > 0) return;
                const ix = this._ix;
                const pt = this._toBook(e);
                const z = this._zoneAt(pt.x, pt.y);
                if (!z || !this._zoneActive(z)) return;
                const same = (ix.mode === 'peel' || ix.mode === 'unpeel') && ix.side === z.side && ix.bottom === z.bottom;
                this._cancelPeel();
                if (!same) this._zoneSetup(z);
                ix.mode = 'drag';
                ix.down = { x: e.clientX, y: e.clientY };
                // A drag must not select the page text under it (the old book had
                // a `no-select` container).
                e.preventDefault();
                try { this.el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
            }

            /**
             * Pointer up ends a drag: within 5 px it is a click (the two-leg turn
             * from the corner); otherwise the turn completes past a quarter page
             * beyond the spine and goes back before it. A cancel always goes back.
             * @param {PointerEvent} e
             * @param {boolean} cancelled
             * @private
             */
            _onUp(e, cancelled) {
                const ix = this._ix;
                if (this._disposed || ix.mode !== 'drag') return;
                const w = this._page.width;
                const right = ix.side === 'R';
                const far = { x: right ? -w : w, y: 0 };
                const done = right ? ix.b : ix.a;
                const back = right ? ix.a : ix.b;
                const from = ix.corner;
                ix.mode = 'release';
                const moved = Math.hypot(e.clientX - ix.down.x, e.clientY - ix.down.y);
                if (!cancelled && moved <= 5) {
                    this._animateCorner(this._legs(from, far), ix.bottom, this._duration, this._easing, false,
                        () => this._settle(done));
                    return;
                }
                const pt = this._toBook(e);
                const complete = !cancelled && (right ? pt.x < 1.25 * w : pt.x > 0.75 * w);
                const to = complete ? far : ix.rest;
                this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
                    ix.bottom, this._duration, 'linear', false, () => this._settle(complete ? done : back));
            }

            /**
             * Resolve a raw template id to its bound element via the scope.
             * @param {string} rawId
             * @returns {SVGElement}
             * @private
             */
            _find(rawId) {
                const scopedId = this._scope.id(rawId);
                if (this.el.getAttribute && this.el.getAttribute('id') === scopedId) {
                    return /** @type {SVGElement} */ (this.el);
                }
                return /** @type {SVGElement} */ (this.el.querySelector(`#${scopedId}`));
            }

            /**
             * Resolve a page id to its index, or `-1` when unknown.
             * @param {string} id
             * @returns {number}
             * @private
             */
            _indexOf(id) {
                for (let i = 0; i < this._pages.length; i += 1) {
                    if (this._pages[i].id === id) return i;
                }
                return -1;
            }

            /**
             * Show page `index`, hide the rest — one `display` write per page group,
             * all through the frozen `svgApply.svgAttr`.
             * @param {number} index
             * @private
             */
            _show(index) {
                for (let i = 0; i < this._pageEls.length; i += 1) {
                    svgApply.svgAttr(this._pageEls[i], 'display', i === index ? 'inline' : 'none');
                }
            }

            /**
             * Map a fold parameter `p ∈ [0,1]` to the dragged corner along the old
             * aJSFlip programmatic turn: two linear legs, from the outer top-right
             * `(w, 0)` (`p = 0`, flat) through `(0, 0.1·h)` at the spine (`p = 0.5`)
             * to `(−w, 0)` (`p = 1`, the leaf lying past the spine). This is the
             * canonical TR corner path; directional mirrors are a follow-up.
             * @param {number} p
             * @returns {{x:number,y:number}}
             * @private
             */
            _cornerAt(p) {
                const w = this._page.width;
                const lift = this._page.height * 0.1;
                if (p <= 0.5) return { x: w * (1 - 2 * p), y: lift * 2 * p };
                return { x: -w * (2 * p - 1), y: lift * (2 - 2 * p) };
            }

            /**
             * Recompute the fold at `p` and write the two per-tick `d` values: the
             * leaf (the fold's `turn` polygon) and the clip of the revealed page
             * (the page rect plus the fold's `under` polygon, even-odd: the lifted
             * region). Both go through the frozen `svgApply.svgAttr` over
             * reference-bound targets.
             * @param {number} p Fold parameter in `[0,1]`.
             * @private
             */
            _applyFold(p) {
                const solved = fold(this._cornerAt(p), this._page);
                svgApply.svgAttr(this._turnPath, 'd', compose(solved.turn));
                svgApply.svgAttr(this._clipPath, 'd', `${this._pageRing} ${compose(solved.under)}`);
            }

            /**
             * Put the book at rest on page `index`: that page alone displayed, the
             * leaf emptied, and the clip released from the page the turn clipped.
             * @param {number} index
             * @param {SVGElement} clippedEl The page group the turn clipped.
             * @private
             */
            _rest(index, clippedEl) {
                this._show(index);
                svgApply.svgAttr(this._turnPath, 'd', '');
                svgApply.svgAttr(clippedEl, 'clip-path', 'none');
            }

            /**
             * Drive a curl turn to `toIndex`: a fold-param tween `0 → 1` on the frozen
             * timeline/tween + shared scheduler. A forward turn lifts the current
             * page off the destination page; a backward turn runs the same fold
             * reversed, the destination page being the lifted one. Both pages are
             * displayed for the turn; the revealed (later) page is clipped to the
             * lifted region; the first fold is applied at once, so no frame shows an
             * unclipped page. On completion the book rests
             * on `toIndex`; a cancelled turn rests back on the current page. Returns
             * the playing `Timeline`. Internal — bounds AND the in-flight guard are
             * checked by the public methods.
             *
             * The `_active` release lives on `onSettle` (the terminal-transition hook
             * fired on BOTH natural completion and {@link Timeline#stop}), not on
             * `onComplete` — a caller that takes the returned `Timeline` and calls
             * `.stop()` on it directly, bypassing {@link Pageflip#dispose}, must still
             * release the guard, since `onComplete` is by contract skipped by `stop()`.
             * `onComplete` keeps only the completion-specific effects (page swap,
             * turning-path reset), mirroring hypertree's `onSettle`/`onComplete` split.
             * @param {number} toIndex
             * @returns {object} The playing `Timeline`.
             * @private
             */
            _turnTo(toIndex) {
                this._refreshWindow([toIndex]);
                const forward = toIndex > this.index;
                const liftedEl = this._pageEls[forward ? this.index : toIndex];
                const beneathEl = this._pageEls[forward ? toIndex : this.index];
                for (let i = 0; i < this._pageEls.length; i += 1) {
                    const el = this._pageEls[i];
                    svgApply.svgAttr(el, 'display', el === liftedEl || el === beneathEl ? 'inline' : 'none');
                }
                svgApply.svgAttr(liftedEl, 'clip-path', 'none');
                svgApply.svgAttr(beneathEl, 'clip-path', this._clipRef);
                const foldAt = forward ? (v) => v : (v) => 1 - v;
                this._applyFold(foldAt(0));

                const turnTween = new Tween({
                    target: this._turnPath,
                    property: 'd',
                    from: 0,
                    to: 1,
                    duration: this._duration,
                    easing: this._easing,
                    scheduler: this._scheduler,
                    apply: (value) => this._applyFold(foldAt(/** @type {number} */ (value))),
                });
                const tl = new Timeline({
                    scheduler: this._scheduler,
                    onSettle: () => {
                        this._active.delete(tl);
                        // A cancelled turn (`done` is set before `onSettle` only on
                        // completion) rests back on the page it started from.
                        if (!tl.done) this._rest(this.index, beneathEl);
                    },
                    onComplete: () => {
                        this.index = toIndex;
                        this._rest(toIndex, beneathEl);
                        this._refreshWindow([]);
                    },
                });
                this._active.add(tl);
                tl.add(turnTween, 0);
                tl.play();
                return tl;
            }

            /**
             * Turn to the next page. Bounds-safe: a no-op returning `null` at the last
             * page, after {@link Pageflip#dispose}, or while an earlier turn is still
             * in flight (ignore-while-in-flight guard — see {@link Pageflip#_active}).
             * @returns {object|null} The playing `Timeline`, or `null`.
             */
            next() {
                if (this._disposed) return null;
                if (this._active.size > 0) return null;
                if (this._spreadMode) {
                    if (this._ix.mode === 'drag') return null;
                    if (this._spread >= this._spreadOf(this._pages.length - 1)) return null;
                    return this._turnSpread(this._spread + 1);
                }
                if (this.index >= this._pages.length - 1) return null;
                return this._turnTo(this.index + 1);
            }

            /**
             * Turn to the previous page. Bounds-safe: a no-op returning `null` at the
             * first page, after {@link Pageflip#dispose}, or while an earlier turn is
             * still in flight (ignore-while-in-flight guard — see {@link Pageflip#_active}).
             * @returns {object|null} The playing `Timeline`, or `null`.
             */
            previous() {
                if (this._disposed) return null;
                if (this._active.size > 0) return null;
                if (this._spreadMode) {
                    if (this._ix.mode === 'drag') return null;
                    if (this._spread <= 0) return null;
                    return this._turnSpread(this._spread - 1);
                }
                if (this.index <= 0) return null;
                return this._turnTo(this.index - 1);
            }

            /**
             * Turn to the page with id `id`.
             * @param {string} id
             * @returns {object|null} The playing `Timeline`, or `null` when `id` is
             *   already the current page, after {@link Pageflip#dispose}, or while an
             *   earlier turn is still in flight (ignore-while-in-flight guard — see
             *   {@link Pageflip#_active}).
             * @throws {Error} `pageflip: unknown page "<id>"` when `id` is not a page
             *   (never thrown after `dispose()` or while a turn is in flight — both
             *   cases short-circuit to `null` first).
             */
            goTo(id) {
                if (this._disposed) return null;
                if (this._active.size > 0) return null;
                const target = this._indexOf(id);
                if (target < 0) throw new Error(`pageflip: unknown page "${id}"`);
                if (this._spreadMode) {
                    if (this._ix.mode === 'drag') return null;
                    const to = this._spreadOf(target);
                    return to === this._spread ? null : this._turnSpread(to);
                }
                if (target === this.index) return null;
                return this._turnTo(target);
            }

            /**
             * The id of the currently visible page.
             * @returns {string}
             */
            get currentId() {
                return this._pages[this.index].id;
            }

            /**
             * Mount `this.el` into `el`, replacing its children. Sugar for the
             * `el.replaceChildren(book.el)` every heavy island otherwise repeats.
             * @param {Element} el
             * @returns {this}
             */
            mountInto(el) {
                el.replaceChildren(this.el);
                return this;
            }

            /**
             * Tear the book down: cancel EVERY turn still in flight — `Timeline#stop()`
             * unregisters each from its own captured scheduler; a completed timeline has
             * already self-deregistered, so an interrupted turn is the only leak path.
             * Under the ignore-while-in-flight
             * policy `_active` holds at most one member, but iterating the full `Set`
             * (rather than a single tracked field) means dispose() cannot leave an
             * orphaned Timeline behind even if that invariant is ever relaxed. Each
             * `Timeline#stop()` fires that timeline's `onSettle` hook, which itself
             * drops it from `_active` — so this iterates a SNAPSHOT while the live set
             * mutates underneath (safe: `Set`/`Map` iteration tolerates the CURRENT
             * entry being deleted mid-iteration). The trailing `.clear()` is
             * belt-and-braces (mirrors hypertree's `_cancelActive`): by the time the
             * loop ends the `onSettle` hook has already emptied the set. Then detach
             * `this.el` from its parent if attached, and drop the reference. Idempotent;
             * after `dispose()`, `next()`/`previous()`/`goTo()` return `null` (no-op),
             * mirroring the proven `apps/towards` flipbook island semantics
             * (`src/islands/flipbook.js`).
             */
            dispose() {
                if (this._disposed) return;
                this._disposed = true;
                if (this._spreadMode) {
                    if (this._pointerScope) this._pointerScope.clear();
                    this._pointerScope = null;
                    this._cancelPeel();
                }
                for (const tl of this._active) tl.stop();
                this._active.clear();
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.removeChild(this.el);
                }
                this.el = null;
            }
        }

        /**
         * Build a {@link Pageflip} book.
         * @param {PageflipOptions} opts
         * @returns {Pageflip}
         */
        function pageflip(opts) {
            return new Pageflip(opts);
        }

        return { Pageflip, pageflip };
    },
};
