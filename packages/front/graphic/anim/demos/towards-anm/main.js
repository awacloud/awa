// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/towards-anm/main.js
//
// ACCEPTANCE demo — a from-scratch reproduction of the legacy
// `@anim-old/TOWARDS-ANM` home animation on the MODERN engine only.
//
// Nothing here is ported from the legacy `js/aJS` runtime: the legacy page was
// read as a SPECIFICATION (which element enters, when, over how long, with
// which curve) and re-expressed through the `graphic.anim` aggregate surface —
// `svgBuild` + `scopedIds` build the composition, `Timeline`/`Tween` drive the
// choreography, `svgApply.svgAttr` is the single attribute write path and
// `scheduler` owns the one shared rAF loop.
//
// The legacy→modern mapping and the honest gap list live in `towards-notes.md`.
//
// Frozen demo-entry contract (`demos/_boot.js`):
//   export async function run({ mount, anim, variant }) -> { dispose() }

/** Legacy authoring space — the `viewBox` every coordinate below is written in. */
const VIEW_W = 800;
const VIEW_H = 400;

/** Clock centre (the hands' `x1`/`y1`), reused by the hand-rotation writer. */
const CLOCK_CX = 160;
const CLOCK_CY = 100;

/**
 * Per-`run()` scope counter. `graphic.scopedIds` guarantees disjoint ids only
 * across DIFFERENT prefixes (area memory: the collision guarantee is
 * prefix-scoped), so every mount gets its own prefix and two demos on one page
 * never share a `url(#…)` target.
 *
 * @type {number}
 */
let runSeq = 0;

/**
 * The desk group's start transform, in the legacy's own function order —
 * `scale(…) translate(…)`, NOT the reverse (see the note at its use site).
 */
const DESK_TRANSFORM_FROM = `scale(0.75) translate(${0.125 * VIEW_W},${0.125 * VIEW_H})`;

/** The desk group's end transform — the legacy `{scale: 1, translate: [0, 0]}`. */
const DESK_TRANSFORM_TO = 'scale(1) translate(0,0)';

/** English month abbreviations for the calendar sheet (the demo surface is EN). */
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Today's month label + zero-padded day, as the legacy `setCalendar()` computed
 * them (localized to EN — see the gap list in `towards-notes.md`).
 *
 * @returns {{ month: string, day: string }}
 */
function calendarToday() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    return { month: MONTHS_EN[now.getMonth()], day };
}

/**
 * The whole composition as ONE plain JSON descriptor tree, in the shape
 * `graphic.svgBuild` consumes (`{ tag, attrs?, children?, text? }`). Attribute
 * names are real SVG names (`stroke-width`, `stop-color`, `href`) — the legacy
 * camelCase property layer (`strokeWidth`, `stopColor`, `src` →
 * `xlink:href`) has no modern counterpart and is not reintroduced.
 *
 * `data-id` is kept purely as the reference-binding hook (see
 * {@link indexByDataId}); unlike the legacy runtime nothing looks it up again
 * after construction.
 *
 * @returns {object} Root `NodeDesc` for `svgBuild.build`.
 */
function template() {
    const { month, day } = calendarToday();

    return {
        tag: 'svg',
        attrs: {
            x: 0,
            y: 0,
            width: '100%',
            height: '100%',
            viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
        },
        children: [
            {
                tag: 'defs',
                children: [
                    {
                        tag: 'linearGradient',
                        attrs: {
                            id: 'aShadowDesktop',
                            x1: '0%',
                            x2: '0%',
                            y1: '0%',
                            y2: '100%',
                            spreadMethod: 'pad',
                        },
                        children: [
                            { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#000000', 'stop-opacity': 0.25 } },
                            { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#000000', 'stop-opacity': 0 } },
                        ],
                    },
                    {
                        tag: 'mask',
                        attrs: { id: 'aMaskClock' },
                        children: [
                            { tag: 'circle', attrs: { 'data-id': 'aMaskClockDisc', fill: '#ffffff', cx: 125, cy: 55, r: 0 } },
                        ],
                    },
                    {
                        tag: 'mask',
                        attrs: { id: 'aMaskBackground' },
                        children: [
                            { tag: 'rect', attrs: { fill: '#ffffff', x: 0, y: 0, width: VIEW_W, height: VIEW_H } },
                        ],
                    },
                ],
            },
            {
                tag: 'g',
                attrs: { mask: 'url(#aMaskBackground)' },
                children: [
                    { tag: 'rect', attrs: { 'data-id': 'aBackground', fill: '#da8028', x: 400, y: 300, width: 0, height: 0 } },
                    { tag: 'rect', attrs: { 'data-id': 'aTable', fill: '#ffffff', x: 400, y: 350, width: 0, height: 25 } },
                    { tag: 'rect', attrs: { 'data-id': 'aTableFooterLeft', fill: '#ffffff', x: 120, y: 375, width: 20, height: 0 } },
                    { tag: 'rect', attrs: { 'data-id': 'aTableFooterRight', fill: '#ffffff', x: 640, y: 375, width: 40, height: 0 } },
                    { tag: 'rect', attrs: { 'data-id': 'aTableShadow', fill: 'url(#aShadowDesktop)', x: 400, y: 375, width: 0, height: 10 } },

                    { tag: 'circle', attrs: { 'data-id': 'aClockBorder', fill: '#ffffff', opacity: 0.75, cx: CLOCK_CX, cy: CLOCK_CY, r: 0 } },
                    { tag: 'circle', attrs: { 'data-id': 'aClockBackground', fill: '#333333', cx: CLOCK_CX, cy: CLOCK_CY, r: 0 } },
                    { tag: 'line', attrs: { 'data-id': 'aTimeHours', stroke: '#dddddd', 'stroke-width': 0.75, x1: CLOCK_CX, y1: CLOCK_CY, x2: CLOCK_CX, y2: CLOCK_CY } },
                    { tag: 'line', attrs: { 'data-id': 'aTimeMinutes', stroke: '#dddddd', 'stroke-width': 0.75, x1: CLOCK_CX, y1: CLOCK_CY, x2: CLOCK_CX, y2: CLOCK_CY } },
                    { tag: 'line', attrs: { 'data-id': 'aTimeSeconds', stroke: '#ff3333', 'stroke-width': 0.5, x1: CLOCK_CX, y1: CLOCK_CY, x2: CLOCK_CX, y2: CLOCK_CY } },
                    { tag: 'circle', attrs: { 'data-id': 'aClockEffect', fill: '#ffffff', mask: 'url(#aMaskClock)', opacity: 0.25, cx: CLOCK_CX, cy: CLOCK_CY, r: 0 } },

                    { tag: 'rect', attrs: { 'data-id': 'aRack', fill: '#ffffff', x: 640, y: 120, width: 0, height: 10 } },
                    { tag: 'rect', attrs: { 'data-id': 'aRackShadow', fill: '#333333', opacity: 0.5, x: 640, y: 130, width: 0, height: 3 } },
                    { tag: 'rect', attrs: { 'data-id': 'aRackLeft', fill: '#ffffff', x: 560, y: 130, width: 10, height: 0 } },
                    { tag: 'rect', attrs: { 'data-id': 'aRackRight', fill: '#ffffff', x: 720, y: 130, width: 10, height: 0 } },

                    { tag: 'image', attrs: { 'data-id': 'aCoach', href: 'img/coach.svg', x: 570, y: -70, width: 46.5, height: 70 } },
                    { tag: 'image', attrs: { 'data-id': 'aManagement', href: 'img/management.svg', x: 630, y: -50, width: 70, height: 50 } },

                    {
                        tag: 'g',
                        attrs: {
                            'data-id': 'aDesk',
                            opacity: 0,
                            // Transform-list ORDER is load-bearing: the legacy
                            // object `{scale, translate}` serialized in insertion
                            // order (`aJS-v0.1.js:517` `for (var k in value)`), so
                            // the legacy attribute reads `scale(…) translate(…)`.
                            // SVG composes a list right-to-left, so this scales the
                            // translation too (device offset 75/37.5, not 100/50).
                            // Reproduced verbatim — swapping the two is a different
                            // picture.
                            transform: DESK_TRANSFORM_FROM,
                        },
                        children: [
                            { tag: 'image', attrs: { 'data-id': 'aStaff', href: 'img/equipe.svg', x: 75, y: 180, width: 118.24, height: 131.84 } },
                            { tag: 'image', attrs: { 'data-id': 'aLaptop', href: 'img/laptop.svg', x: 245, y: 240, width: 191, height: 110 } },
                            { tag: 'image', attrs: { 'data-id': 'aCup', href: 'img/cup.svg', x: 450, y: 308, width: 42, height: 42 } },

                            { tag: 'rect', attrs: { 'data-id': 'aCalendar', x: 540, y: 165, width: 40, height: 15, fill: '#F15A29', stroke: '#D85124', 'stroke-width': 1 } },
                            { tag: 'text', attrs: { 'data-id': 'aMonth', x: 546, y: 178, fill: '#ffffff', stroke: '#ffffff', 'stroke-width': 0.5 }, text: month },
                            { tag: 'rect', attrs: { 'data-id': 'aDate', x: 540, y: 180, width: 40, height: 35, fill: '#ffffff', stroke: '#999999', 'stroke-width': 0.5 } },
                            { tag: 'text', attrs: { 'data-id': 'aDay', x: 547, y: 207, fill: '#333333', stroke: '#333333', 'stroke-width': 0.5, 'font-size': 26 }, text: day },

                            { tag: 'image', attrs: { 'data-id': 'aStylo', href: 'img/stylo.svg', x: 200, y: 290.6, width: 33.4, height: 59.4 } },
                            { tag: 'image', attrs: { 'data-id': 'aMobile', href: 'img/mobile.svg', x: 183, y: 301, width: 23.04, height: 46.4, transform: 'rotate(10,183,301)' } },
                            { tag: 'image', attrs: { 'data-id': 'aBook', href: 'img/book.svg', x: 110, y: 334, width: 62.85, height: 18.6 } },
                            { tag: 'image', attrs: { 'data-id': 'aLogo', href: 'img/towards.svg', x: 505, y: 318, width: 225.09, height: 103.95 } },

                            {
                                tag: 'g',
                                attrs: { 'data-id': 'aArticle' },
                                children: [
                                    { tag: 'image', attrs: { 'data-id': 'aArticle2', href: 'img/article2.svg', x: 690, y: 200, width: 71.46, height: 104.63, transform: 'rotate(15,690,200)' } },
                                    { tag: 'image', attrs: { 'data-id': 'aArticle1', href: 'img/article.svg', x: 630, y: 180, width: 71.46, height: 104.63, transform: 'rotate(-4,630,180)' } },
                                ],
                            },
                            {
                                tag: 'g',
                                attrs: { 'data-id': 'aConcept' },
                                children: [
                                    { tag: 'image', attrs: { 'data-id': 'aCarto', href: 'img/carto2.svg', x: 330, y: 40, width: 183.03, height: 140.62 } },
                                    { tag: 'image', attrs: { 'data-id': 'aConcept1', href: 'img/concept.svg', x: 250, y: 60, width: 48.6, height: 72.684, transform: 'rotate(-3,250,20)' } },
                                    { tag: 'image', attrs: { 'data-id': 'aConcept2', href: 'img/concept.svg', x: 280, y: 90, width: 48.6, height: 72.684, transform: 'rotate(4,250,20)' } },
                                ],
                            },
                            { tag: 'image', attrs: { 'data-id': 'aPostIt', href: 'img/postit.svg', x: 480, y: 230, width: 98.52, height: 70.26 } },
                        ],
                    },
                ],
            },
        ],
    };
}

/**
 * The legacy `events[]` blocks, flattened into one declarative table:
 * `{ at, duration, easing }` is the legacy `{ delay, duration, ease }` triple
 * and `props` is its `prop[0]` object. This table IS the choreography — the
 * timeline below is built mechanically from it.
 *
 * @type {Array<{ ref: string, at: number, duration: number, easing: string, from: Record<string, string|number>, props: Record<string, string|number> }>}
 */
const CHOREOGRAPHY = [
    // t=0 — the orange backdrop bounces open from the table's centre.
    {
        ref: 'aBackground', at: 0, duration: 1000, easing: 'easeOutBounce',
        from: { x: 400, y: 300, width: 0, height: 0 },
        props: { x: 0, y: 0, width: VIEW_W, height: VIEW_H },
    },

    // t=1000 — desk surface, shadow, wall rack, clock face + hands, all 500 ms linear.
    { ref: 'aTable', at: 1000, duration: 500, easing: 'linear', from: { x: 400, width: 0 }, props: { x: 100, width: 600 } },
    { ref: 'aTableShadow', at: 1000, duration: 500, easing: 'linear', from: { x: 400, width: 0 }, props: { x: 120, width: 560 } },
    { ref: 'aClockBorder', at: 1000, duration: 500, easing: 'linear', from: { r: 0 }, props: { r: 45 } },
    { ref: 'aClockBackground', at: 1000, duration: 500, easing: 'linear', from: { r: 0 }, props: { r: 44 } },
    { ref: 'aTimeHours', at: 1000, duration: 500, easing: 'linear', from: { y2: CLOCK_CY }, props: { y2: 70 } },
    { ref: 'aTimeMinutes', at: 1000, duration: 500, easing: 'linear', from: { y2: CLOCK_CY }, props: { y2: 60 } },
    { ref: 'aTimeSeconds', at: 1000, duration: 500, easing: 'linear', from: { y2: CLOCK_CY }, props: { y2: 60 } },
    { ref: 'aClockEffect', at: 1000, duration: 500, easing: 'linear', from: { r: 0 }, props: { r: 45 } },
    { ref: 'aMaskClockDisc', at: 1000, duration: 500, easing: 'linear', from: { r: 0 }, props: { r: 55 } },
    { ref: 'aRack', at: 1000, duration: 500, easing: 'linear', from: { x: 640, width: 0 }, props: { x: 540, width: 200 } },
    { ref: 'aRackShadow', at: 1000, duration: 500, easing: 'linear', from: { x: 640, width: 0 }, props: { x: 540, width: 200 } },

    // t=1500 — the four legs drop (250 ms) …
    { ref: 'aTableFooterLeft', at: 1500, duration: 250, easing: 'linear', from: { height: 0 }, props: { height: 25 } },
    { ref: 'aTableFooterRight', at: 1500, duration: 250, easing: 'linear', from: { height: 0 }, props: { height: 25 } },
    { ref: 'aRackLeft', at: 1500, duration: 250, easing: 'linear', from: { height: 0 }, props: { height: 15 } },
    { ref: 'aRackRight', at: 1500, duration: 250, easing: 'linear', from: { height: 0 }, props: { height: 15 } },

    // … while the two wall posters slide down into the rack (500 ms).
    { ref: 'aCoach', at: 1500, duration: 500, easing: 'linear', from: { y: -70 }, props: { y: 50 } },
    { ref: 'aManagement', at: 1500, duration: 500, easing: 'linear', from: { y: -50 }, props: { y: 70 } },

    // t=2000 — the whole desk composition fades in while scaling back to 1.
    {
        ref: 'aDesk', at: 2000, duration: 500, easing: 'linear',
        from: { opacity: 0, transform: DESK_TRANSFORM_FROM },
        props: { opacity: 1, transform: DESK_TRANSFORM_TO },
    },
];

/**
 * Walk the freshly built subtree ONCE and index every `data-id` carrier by
 * reference. This is the modern replacement for the legacy per-call
 * `document.querySelectorAll('[data-id="…"]')` / `querySelector('#'+id)`: the
 * animated targets are bound once here and never looked up again — no DOM
 * query happens on any frame.
 *
 * @param {Element} root Built subtree root.
 * @returns {Map<string, Element>} `data-id` → element.
 */
function indexByDataId(root) {
    /** @type {Map<string, Element>} */
    const index = new Map();

    /**
     * @param {Element} node
     * @returns {void}
     */
    const visit = (node) => {
        const key = node.getAttribute && node.getAttribute('data-id');
        if (key) index.set(key, node);
        const kids = node.children || [];
        for (let i = 0; i < kids.length; i += 1) visit(kids[i]);
    };

    visit(root);
    return index;
}

/**
 * Build the scheduler tickable that keeps the three clock hands on real time.
 *
 * The legacy driver ran `setInterval(1000)` and re-queried the document three
 * times per tick. Here the hands are already bound by reference and the ticker
 * rides the ONE shared rAF loop the timeline uses — it only writes when the
 * wall-clock second actually changes.
 *
 * @param {(target: object, name: string, value: string|number) => void} svgAttr
 *   `graphic.svgApply.svgAttr` — the single attribute write path.
 * @param {{ hours: Element, minutes: Element, seconds: Element }} hands
 *   Reference-bound hand elements.
 * @returns {{ _step: (ts: number) => void }} A scheduler `Tickable`.
 */
function createHandsTicker(svgAttr, hands) {
    let lastSecond = -1;

    return {
        /**
         * @param {number} ts Frame timestamp (unused — the hands follow wall time).
         * @returns {void}
         */
        _step(ts) {
            void ts;
            const now = new Date();
            const seconds = now.getSeconds();
            if (seconds === lastSecond) return;
            lastSecond = seconds;

            const minutes = now.getMinutes();
            let hours = now.getHours();
            if (hours >= 12) hours -= 12;

            // Same integer-truncated degrees the legacy driver computed.
            const s = Math.trunc((seconds * 360) / 60);
            const m = Math.trunc(((minutes + seconds / 60) * 360) / 60);
            const h = Math.trunc(((hours + minutes / 60) * 360) / 12);

            svgAttr(hands.seconds, 'transform', `rotate(${s}, ${CLOCK_CX}, ${CLOCK_CY})`);
            svgAttr(hands.minutes, 'transform', `rotate(${m}, ${CLOCK_CX}, ${CLOCK_CY})`);
            svgAttr(hands.hours, 'transform', `rotate(${h}, ${CLOCK_CX}, ${CLOCK_CY})`);
        },
    };
}

/**
 * Run the TOWARDS-ANM acceptance demo into `mount`.
 *
 * @param {object}  ctx
 * @param {Element} ctx.mount   Container (an `<svg>` on the demo page) the
 *   composition is appended to. Bound by reference; no global DOM lookup.
 * @param {object}  ctx.anim    The resolved `graphic.anim` aggregate surface.
 * @param {string}  ctx.variant `'standalone'` | `'fw'` — recorded on the root
 *   so a page inspection shows which surface produced the frame.
 * @returns {Promise<{ dispose: () => void }>} Teardown handle.
 */
export async function run({ mount, anim, variant }) {
    const { svgBuild, scopedIds, svgApply, timeline, scheduler } = anim;

    // A fresh prefix per run — `scopedIds` isolates ids per PREFIX, so two
    // instances on one page keep their own `url(#aMaskClock)` targets.
    runSeq += 1;
    const scope = scopedIds.createScope(`towards-${runSeq}`);

    const root = svgBuild.build(template(), { idScope: scope });
    svgApply.svgAttr(root, 'data-variant', variant);
    mount.appendChild(root);

    const el = indexByDataId(root);

    // One timeline, one scheduler, 27 tweens. Legacy per-element `delay`
    // becomes the timeline's absolute `at` offset; `duration`/`ease` map 1:1.
    const tl = new timeline.Timeline();
    for (const step of CHOREOGRAPHY) {
        const target = el.get(step.ref);
        if (!target) continue;
        for (const property of Object.keys(step.props)) {
            tl.add({
                target,
                property,
                from: step.from[property],
                to: step.props[property],
                duration: step.duration,
                easing: step.easing,
            }, step.at);
        }
    }
    tl.play();

    const ticker = createHandsTicker(svgApply.svgAttr, {
        hours: el.get('aTimeHours'),
        minutes: el.get('aTimeMinutes'),
        seconds: el.get('aTimeSeconds'),
    });
    scheduler.scheduler.add(ticker);

    return {
        /**
         * Unregister both tickables from the shared scheduler (which then
         * self-stops once its active set empties) and detach the subtree.
         * Idempotent.
         *
         * @returns {void}
         */
        dispose() {
            scheduler.scheduler.remove(tl);
            scheduler.scheduler.remove(ticker);
            if (root.parentNode) root.parentNode.removeChild(root);
        },
    };
}
