// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/hypertree/main.js
//
// `hypertree` demo — click-to-focus radial tree over an inline ~25-node,
// 3-level tree (`tree.json`), exercising the task-02 feedback hooks:
// `onNodeClick(id, ev)`, `ignoreWhileFocusing: true` (the re-entrancy guard)
// and the `onFocus(id, info)` second argument. It is also the living proof
// of `docs/hypertree.md`'s "caller-provided SVG root" recipe — `index.html`
// builds the `<svg viewBox="0 0 800 800">` mount exactly as that recipe
// documents (`radius: 400` matching a `0 0 800 800` box).
//
// Boot-surface gap (the same shape as the svg3d demo's):
// `graphic.hypertree` is OUTSIDE the frozen 14-module `graphic.anim`
// aggregate, so
// `anim` (as handed over by `_boot.js`) carries no `hypertree` member.
// `_boot.js` cannot be edited (frozen contract), so this demo
// resolves `graphic.hypertree` itself, by calling `hypertreeModule.factory`
// directly with:
//   - the six DOM-bound deps it declares (`svgBuild`, `scopedIds`,
//     `timeline`, `tween`, `svgApply`, `scheduler`), taken FROM the
//     already-resolved `anim` surface — never a second scheduler instance
//     (the same discipline the svg3d demo established for its own orbit
//     tween); and
//   - its two pure kernels (`hypertree.layout` / `hypertree.measure`),
//     imported as bare specifiers (`@awacloud/graphic-anim/kernels/hypertree/…`)
//     resolved by `index.html`'s import map — now PUBLIC via `package.json`
//     `exports`, the doctrine's
//     canonical form (`docs/demo-playground.md` §2).
//
// Correction (an earlier draft of this comment got it wrong; the
// ORIGINAL "package-exposure gap" framing below was FALSE): the
// COMPOSED `hypertreeModule` descriptor IS public — `src/main.js` (the
// package's `exports["."]` entry) imports it (`src/main.js:48`) and
// re-exports it BY NAME from its `export { … }` barrel (`src/main.js:208`),
// confirmed live: `bun -e "import('@awacloud/graphic-anim').then(m=>
// console.log(typeof m.hypertreeModule))"` → `object`. So `hypertreeModule`
// below is now ALSO a bare specifier (`@awacloud/graphic-anim`) resolved the
// SAME way as the two kernels above — no relative `src`-reach-around left
// in this file. It is the exact same descriptor object either way (Bun/the
// browser dedupe by resolved file path), so `hypertreeModule.factory(...)`
// below is called EXACTLY as before — the same six already-booted `anim`
// aggregate deps, the same two local pure kernels, never a second
// `ModuleRuntime`, never a second scheduler. Importing the barrel has no
// side effect (`sideEffects: false`, confirmed by reading `src/main.js`'s
// own fileoverview: "No code runs at import — this file contains only
// re-exports and plain-object literals").
//
// Attempt 3 — what BOTH earlier attempts missed. Public is not the same as
// browser-loadable. `src/main.js` and its graph write three BARE
// `@awacloud/fw/*` specifiers of their own (`src/main.js:27-28`,
// `src/svg/apply.js:14`, `src/svg/build.js:25`, `src/hypertree/create.js:1`),
// and a browser resolves a bare specifier through the page's import map and
// NOWHERE else — so with those three undeclared, this page died on "Failed to
// resolve module specifier" before a single line of the demo ran. `bun test`
// is blind to it (Bun resolves bare specifiers via workspace `node_modules`),
// which is why two green conformance passes went over a dead page. Measured
// the same way, git HEAD *before* this task was ALREADY dead: the old relative
// `../../src/hypertree/hypertree.js` reaches `../svg/apply.js`'s undeclared
// `@awacloud/fw/dom/query/dom.js` just the same, with no import map at all on
// the page. So reverting was never the fix — the fix is `index.html` declaring
// the three fw modules this page's graph actually reaches (it already loads
// all three: `../_boot.js` imports the identical URLs relatively). The hazard
// is now mechanically enforced, over all 8 demos, by
// `tests/demos-smoke.integration.test.js`'s browser module-graph resolution
// gate (import map only, no `node_modules` fallback).
//
// Functional legs: the returned handle additionally exposes
// `focus(id)`/`focusSync(id)`/`focusId()` (straight passthroughs to the
// `Hypertree` instance's own public API) and `clickNode(id)` (dispatches a
// real `click` on the rendered node element, found by its scoped-id suffix —
// never a cached internal field). `tests/demos-smoke.integration.test.js`
// drives these to prove, via the public surface only: (a) calling `.stop()`
// directly on the `Timeline` a `focus()` returns still releases the
// `ignoreWhileFocusing` guard (the next click focuses), and (b) `focusSync()`
// during an in-flight `focus()` wins (the superseded focus never fires
// `onFocus`).

import tree from './tree.json' with { type: 'json' };
import { hypertreeModule } from '@awacloud/graphic-anim';
import { hypertreeLayoutModule } from '@awacloud/graphic-anim/kernels/hypertree/layout.js';
import { hypertreeMeasureModule } from '@awacloud/graphic-anim/kernels/hypertree/measure.js';
import { TOWARDS_PALETTE, TOWARDS_FONT, TOWARDS_BADGE_GLYPHS } from './towards-look.js';

/** Outer layout radius (SVG user units) — matches `index.html`'s
 *  `viewBox="0 0 800 800"` mount per the recipe (`radius * 2` == box side). */
const RADIUS = 400;

/**
 * Demo entry — frozen contract (`demos/_boot.js`).
 *
 * `run` is idempotent per fresh `mount`: it builds one fresh `Hypertree`
 * instance into `mount` and never queries `document` beyond it — readout
 * text is reported through the returned handle's additive `onEvent(cb)`
 * (the same "extra methods beyond `dispose()`" discipline the `frames` demo
 * established), so `index.html`'s own script owns the `<p id="readout">`
 * element and writes into it.
 *
 * @param {{ mount: SVGElement, anim: object, variant: 'standalone'|'fw' }} ctx
 * @returns {Promise<{ dispose(): void, onEvent(cb: (text: string) => void): void, focus(id: string): object, focusSync(id: string): void, focusId(): string, clickNode(id: string): boolean }>}
 */
export async function run({ mount, anim }) {
    const {
        svgBuild, scopedIds, timeline, tween, svgApply, scheduler,
    } = anim;

    // The two pure kernels `hypertree.hypertree` needs, resolved standalone
    // (framework-free — see `docs/hypertree.md` "ESM / standalone surface").
    const layoutApi = hypertreeLayoutModule.factory();
    const measureApi = hypertreeMeasureModule.factory();

    const { hypertree } = hypertreeModule.factory(
        svgBuild, scopedIds, timeline, tween, svgApply, scheduler, layoutApi, measureApi,
    );

    /** @type {((text: string) => void)|null} Registered by `index.html`. */
    let listener = null;

    /** @param {string} text */
    function emit(text) {
        if (listener) listener(text);
    }

    const t = hypertree(mount, tree, {
        radius: RADIUS,
        // Demonstrates the opt-in re-entrancy guard: a click landing while a
        // focus transition is in flight is dropped whole (neither
        // `onNodeClick` nor the internal focus runs) rather than stacking a
        // second transition.
        ignoreWhileFocusing: true,
        // Label only the focus and its neighbours: the most legible window
        // (no two pills overlap for any focus, measured in Chromium).
        labelDepth: 1,
        // The old towardsHyperTree look: a colour per branch, pills, dots
        // shrinking with the distance from the focus. The plugin ships neutral
        // defaults; the towards colours, font and badge icons are this page's
        // content (`towards-look.js`).
        styled: { palette: TOWARDS_PALETTE, fontFamily: TOWARDS_FONT },
        badgeGlyphs: TOWARDS_BADGE_GLYPHS,
        /**
         * Fired on every node click, BEFORE the internal focus runs — the
         * node's AUTHOR id (`tree.json`'s plain kebab-case strings), not the
         * scoped DOM id.
         * @param {string} id
         */
        onNodeClick(id) {
            emit(`clicked: ${id}`);
        },
        /**
         * A click on a node's detail badge (its link or its information): the
         * library never navigates, the page decides what the detail does.
         * @param {string} id
         * @param {'action'|'info'} kind
         * @param {*} value
         */
        onNodeDetail(id, kind, value) {
            emit(`detail: ${id} ${kind} — ${value}`);
        },
        /**
         * Fired once a focus transition completes (or immediately for
         * `focusSync`). `info` is the additive second argument.
         * @param {string} id
         * @param {{ previous: string|null, refocus: boolean }} info
         */
        onFocus(id, info) {
            const detail = info.refocus
                ? ' (refocus — already selected)'
                : info.previous
                    ? ` (previous: ${info.previous})`
                    : ' (initial focus)';
            emit(`focused: ${id}${detail}`);
        },
    });

    return {
        /**
         * Register the readout sink. `index.html` calls this once, right
         * after `run()` resolves, to wire its own `<p id="readout">` element.
         * @param {(text: string) => void} cb
         */
        onEvent(cb) {
            listener = cb;
        },

        /**
         * Programmatic focus — `Hypertree#focus`'s own public surface,
         * exposed so a driver (the smoke leg; a future UI control) can start
         * an async focus transition without simulating a click. Returns the
         * playing `Timeline` — calling `.stop()` on it directly (bypassing
         * `dispose()`) exercises the `onSettle` guard-release seam.
         * @param {string} id
         * @returns {object} The playing `Timeline`.
         */
        focus(id) {
            return t.focus(id);
        },

        /**
         * Programmatic synchronous focus — `Hypertree#focusSync`'s own
         * public surface. Supersedes any in-flight `focus()` immediately: the in-flight
         * timeline is stopped and never completes, and this call's target
         * wins.
         * @param {string} id
         * @returns {void}
         */
        focusSync(id) {
            t.focusSync(id);
        },

        /**
         * The currently focused node id (`Hypertree#focusId`).
         * @returns {string}
         */
        focusId() {
            return t.focusId;
        },

        /**
         * Simulate a real click on a rendered node element — the most
         * public surface of all (what an actual user does), used by the
         * stop/focusSync smoke leg to prove the re-entrancy guard
         * (`ignoreWhileFocusing: true`, wired above) actually drops or
         * admits a click, rather than calling `focus()` directly (which
         * bypasses the click-level guard entirely — the guard lives in the
         * click handler, not in `focus()` itself). Looks the node's element
         * up by its AUTHOR id via the scoped-id suffix the built SVG
         * actually carries (`svgBuild`/`scopedIds` mint
         * `${prefix}-node-${id}-${n}` — see `docs/hypertree.md`), never a
         * cached internal field.
         * @param {string} id
         * @returns {boolean} Whether a matching rendered node element was found.
         */
        clickNode(id) {
            const suffix = new RegExp(`-node-${id}-\\d+$`);
            const all = t.el.querySelectorAll('[id]');
            for (const el of all) {
                if (suffix.test(el.getAttribute('id'))) {
                    el.dispatchEvent(new Event('click', { bubbles: true }));
                    return true;
                }
            }
            return false;
        },

        /**
         * Compose the instance's own teardown — `Hypertree#dispose` removes
         * the click listeners and unregisters any in-flight focus timeline
         * from the shared `graphic.scheduler` (its own disposal member,
         * present — no manual `scheduler.remove` composition needed here).
         * The demo additionally detaches the built subtree it appended into
         * `mount`, mirroring every sibling demo's own dispose.
         */
        dispose() {
            listener = null;
            t.dispose();
            if (t.el.parentNode === mount) {
                mount.removeChild(t.el);
            }
        },
    };
}
