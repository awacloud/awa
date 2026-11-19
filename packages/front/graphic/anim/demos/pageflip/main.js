// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/pageflip/main.js
//
// `pageflip` demo — a small six-page book, forward/back controls, driven
// entirely through `graphic.pageflip` (the productized page-curl fold,
// `src/pageflip/pageflip.js`).
//
// Boot surface (same shape as the sibling `svg3d` demo): `graphic.pageflip`
// is OUTSIDE the frozen
// 14-module `graphic.anim` aggregate, so `anim`
// (as handed over by `../_boot.js`) carries no `pageflip` member at all.
// `_boot.js` is the frozen demo-family contract, so this demo reaches
// `pageflipModule.factory(...)` with the FIVE dependencies already resolved
// on the booted `anim` aggregate (`svgBuild`, `scopedIds`, `timeline`,
// `tween`, `svgApply` — all five ARE members of the frozen 14) plus its two
// pure, DOM-free, pageflip-internal siblings (`pageflip.fold` /
// `pageflip.compose`) — never a second `ModuleRuntime`, never re-registering
// anything the aggregate already resolved.
//
// Correction (an earlier draft of this comment got it wrong; the
// ORIGINAL "package-exposure gap" framing below was FALSE):
// `pageflip.fold` and `pageflip.compose` are PUBLIC (`package.json`
// `exports`, `./kernels/pageflip/{fold,compose}.js`), imported below as bare
// specifiers resolved by `index.html`'s import map. The COMPOSED
// `pageflipModule` descriptor is ALSO public — `src/main.js` (the package's
// `exports["."]` entry) imports it (`src/main.js:47`) and re-exports it BY
// NAME from its `export { … }` barrel (`src/main.js:207`), confirmed live:
// `bun -e "import('@awacloud/graphic-anim').then(m=>console.log(typeof
// m.pageflipModule))"` → `object`. So `pageflipModule` below is now ALSO a
// bare specifier (`@awacloud/graphic-anim`) resolved the SAME way — no
// relative `src`-reach-around left in this file. It is the exact same
// descriptor object either way (Bun/the browser dedupe by resolved file
// path), so `pageflipModule.factory(...)` below is called EXACTLY as
// before — the same five already-booted `anim` aggregate deps, the same two
// local pure kernels, never a second `ModuleRuntime`, never a second
// scheduler. Importing the barrel has no side effect (`sideEffects: false`,
// confirmed by reading `src/main.js`'s own fileoverview: "No code runs at
// import — this file contains only re-exports and plain-object literals").
//
// Attempt 3 — what BOTH earlier attempts missed. Public is not the same as
// browser-loadable. `src/main.js` and its graph write three BARE
// `@awacloud/fw/*` specifiers of their own (`src/main.js:27-28`,
// `src/svg/apply.js:14`, `src/svg/build.js:25`, `src/pageflip/create.js:1`),
// and a browser resolves a bare specifier through the page's import map and
// NOWHERE else — so with those three undeclared, this page died on "Failed to
// resolve module specifier" before a single line of the demo ran. `bun test`
// is blind to it (Bun resolves bare specifiers via workspace `node_modules`),
// which is why two green conformance passes went over a dead page. Measured
// the same way, git HEAD *before* this task was ALREADY dead: the old relative
// `../../src/pageflip/pageflip.js` reaches `../svg/apply.js`'s undeclared
// `@awacloud/fw/dom/query/dom.js` just the same, with no import map at all on
// the page. So reverting was never the fix — the fix is `index.html` declaring
// the three fw modules this page's graph actually reaches (it already loads
// all three: `../_boot.js` imports the identical URLs relatively). The hazard
// is now mechanically enforced, over all 8 demos, by
// `tests/demos-smoke.integration.test.js`'s browser module-graph resolution
// gate (import map only, no `node_modules` fallback).
//
// Book content: six inline-generated SVG pages (numbered, distinct fills) —
// no external assets, no `fetch` (happy-dom rejects `file://` — memory rule).
//
// Teardown proof:
// `dispose()` below delegates straight to `Pageflip#dispose()`, which stops
// every in-flight timeline it tracks (the `_active` set of turns, and the
// hover peel) before detaching — so calling `dispose()` while a turn is still
// animating (e.g. closing the demo mid-turn) never leaks a tickable on the
// shared scheduler.

import { pageflipModule } from '@awacloud/graphic-anim';
import { foldModule } from '@awacloud/graphic-anim/kernels/pageflip/fold.js';
import { composeModule } from '@awacloud/graphic-anim/kernels/pageflip/compose.js';
// The fw scoped-listener module, for the pointer corners. Relative, like
// `../_boot.js`'s fw imports: it adds no bare specifier to the page.
import { events as fwEvents } from '../../../../fw/src/dom/query/events.js';

/** Shared page size (SVG user units) — one book at native scale. */
const PAGE_WIDTH = 400;
const PAGE_HEIGHT = 560;

/** Six pages, each a distinct hue — a literal "flip through the book" set. */
const PAGE_COUNT = 6;

/** Page-turn duration, ms (Pageflip's own default is 300 — kept explicit here). */
const TURN_DURATION_MS = 500;

/**
 * Build the six `PageSpec` entries (`{ id, template }`) — no external assets,
 * generated in code. Each page is a filled rect plus a centered page number,
 * built via `graphic.svgBuild`'s `NodeDesc` shape (the same shape
 * `Pageflip`'s own constructor threads straight into `svgBuild.build`).
 *
 * @returns {Array<{ id: string, template: object }>}
 */
function buildPages() {
    const pages = [];
    for (let i = 0; i < PAGE_COUNT; i += 1) {
        const hue = Math.round((360 / PAGE_COUNT) * i);
        pages.push({
            id: `page-${i + 1}`,
            template: {
                tag: 'g',
                children: [
                    {
                        tag: 'rect',
                        attrs: {
                            x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT,
                            fill: `hsl(${hue}, 60%, 55%)`,
                        },
                    },
                    {
                        tag: 'text',
                        attrs: {
                            x: PAGE_WIDTH / 2,
                            y: PAGE_HEIGHT / 2,
                            'text-anchor': 'middle',
                            'dominant-baseline': 'middle',
                            'font-size': 96,
                            'font-family': 'system-ui, sans-serif',
                            fill: '#ffffff',
                        },
                        text: String(i + 1),
                    },
                ],
            },
        });
    }
    return pages;
}

/**
 * @typedef {Object} RunArgs
 * @property {SVGElement} mount Mount point — the demo appends the book's
 *   built `<svg>` subtree into it via `Pageflip#mountInto`. Never queried by
 *   id/selector beyond `mount` itself.
 * @property {object} anim The resolved `graphic.anim` aggregate surface:
 *   `{ svgBuild, scopedIds, timeline, tween, svgApply, ... }` (14-key core;
 *   `pageflip` is NOT a member — see the boot-surface gap note above).
 * @property {'standalone'|'fw'} variant Which surface booted `anim` (unused
 *   by the demo itself — both variants expose the same core API).
 */

/**
 * @typedef {Object} PageflipHandle
 * @property {() => object|null} next Turn forward one page (`Pageflip#next`);
 *   `null` at the last page or once disposed.
 * @property {() => object|null} previous Turn back one page
 *   (`Pageflip#previous`); `null` at the first page or once disposed.
 * @property {() => number} index Currently visible page index (0-based).
 * @property {() => number} pageCount Total pages.
 * @property {() => void} dispose Cancel any in-flight turn and release the mount.
 */

/**
 * Demo entry — frozen contract (`demos/_boot.js`).
 *
 * @param {RunArgs} args
 * @returns {Promise<PageflipHandle>}
 */
export async function run({ mount, anim }) {
    const { svgBuild, scopedIds, timeline: timelineMod, tween: tweenMod, svgApply } = anim;

    // The two pageflip-internal pure kernels: zero deps, resolved directly —
    // NOT members of the aggregate (pageflip-internal, DI-injected only into
    // `graphic.pageflip` itself).
    const foldApi = foldModule.factory();
    const composeApi = composeModule.factory();
    const { Pageflip } = pageflipModule.factory(
        svgBuild, scopedIds, timelineMod, tweenMod, svgApply, foldApi, composeApi,
    );

    const book = new Pageflip({
        pages: buildPages(),
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        duration: TURN_DURATION_MS,
        // The old aJSFlip book: two pages side by side, the leaf crossing the spine.
        spread: true,
        // Pointer corners: hover peels a corner, a press drags it, a click turns.
        events: fwEvents.factory(),
    });

    book.mountInto(mount);

    return {
        next() { return book.next(); },
        previous() { return book.previous(); },
        index() { return book.index; },
        pageCount() { return book.pageCount; },

        /**
         * Delegates straight to `Pageflip#dispose()` — cancels a still-in-
         * flight turn (`Timeline#stop()`) before detaching the book
         * subtree from `mount`. Idempotent, matching `Pageflip#dispose`.
         */
        dispose() {
            book.dispose();
        },
    };
}
