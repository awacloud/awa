// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — dynamic both-surfaces smoke test for
 * every landed `demos/<slug>/` entry, PLUS (graphic/BATCH_15 task 05) a set
 * of extended FUNCTIONAL legs that drive the three off-aggregate extension
 * demos (pageflip, hypertree, svg3d) through the exact corrected paths
 * BATCH_15 tasks 01-04 landed — the owner's D10 assessment was "demos NOT
 * fully functional"; these legs make that claim measurable rather than
 * asserting boot/run/dispose alone.
 *
 * Globs `demos/*\/main.js` AT TEST TIME (no per-demo registration edit ever
 * needed): for each found entry, on EACH surface variant (`standalone`,
 * `fw`), it boots via `_boot.js`, mounts a fresh `<svg>`, imports the demo's
 * `main.js` and asserts (a) it has no side effect on import (the mount is
 * still empty) and (b) it exports a `run` function
 * (`docs/demo-playground.md` §10 properties 1-2, added by
 * graphic/BATCH_17 task 03's reshell — additive `expect()`s inside the
 * EXISTING per-demo test body, not new `test()` cases: the smoke suite's
 * own 22-case count stays unchanged), then runs
 * `run({ mount, anim, variant })`, asserts the mount gained at least one
 * child, then disposes — asserting boot/run/dispose safety only, never
 * animation timing (demos drive the real scheduler; manual-clock discipline
 * stays inside each demo's own tests, if any).
 *
 * Self-check: zero demo entries found MUST fail this suite — a passing run
 * over an empty glob would be a silent, vacuous green, hiding a broken glob
 * or an accidentally-emptied demos/ directory.
 *
 * The extended legs below (BATCH_14: 8 demos x 2 variants + 1 self-check =
 * 17; +5 here = 22) run each leg via the PUBLIC surface only — the demo's
 * own returned handle, plus (hypertree) a real DOM `click` dispatched on the
 * rendered node element, never an internal/underscored field:
 *
 *   - pageflip rapid-turn leg (`ai/archives/packages/graphic/anim/demos-GAPS.md` item 7, closed by task 01):
 *     overlapping `next()`/`previous()` calls while a turn is in flight are
 *     ignored (ignore-while-in-flight policy), and `dispose()` mid-turn
 *     leaves the shared scheduler with ZERO orphaned tickables. Run against
 *     the demo's EXISTING public handle — no `main.js` change was needed,
 *     since `pageflip/index.html`'s own UI already disables both nav
 *     buttons while a turn is in flight, so only a scripted bypass of that
 *     UI guard can exercise the underlying library-level guard at all.
 *   - hypertree stop/focusSync leg (`ai/archives/packages/graphic/anim/demos-GAPS.md` items 8 and 6, both
 *     closed by task 02): (a) calling `.stop()` DIRECTLY on the `Timeline`
 *     `focus()` returns (bypassing `dispose()`) still releases the
 *     `ignoreWhileFocusing` guard — proven by a real click on a DIFFERENT
 *     node being dropped before `stop()` and admitted after; (b)
 *     `focusSync()` during an in-flight `focus()` wins immediately and the
 *     superseded focus never fires `onFocus`, even after its original
 *     duration has elapsed. `demos/hypertree/main.js`'s handle gained
 *     `focus`/`focusSync`/`focusId`/`clickNode` for exactly this leg.
 *   - svg3d composed-class leg (`ai/archives/packages/graphic/anim/demos-GAPS.md` item 4, closed by task 04):
 *     the demo now ALSO constructs a small terrain through task 04's
 *     dedicated `dist/build/graphic-svg3d.{standalone,fw}.*` prebuilt root
 *     (the composed `Svg3d`/`createTerrain` class the owner found
 *     unreachable), loaded the relative-import way, NEXT TO the existing
 *     leaf-kernel leg — run on both variants, matching the harness's own
 *     variant loop.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard against double-registration when this file runs alongside sibling
// integration tests that already registered happy-dom in the same worker.
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { urlToFile, walkPageGraph, importMapOf, moduleEntryPoints } from './_lib/browser-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMOS_DIR = join(HERE, '..', 'demos');

/** Both boot surfaces the harness resolves. */
const VARIANTS = /** @type {const} */ (['standalone', 'fw']);

/** @type {string[]} Relative `<slug>/main.js` paths, glob'd at test time. */
const entries = [...new Bun.Glob('*/main.js').scanSync({ cwd: DEMOS_DIR })].sort();

describe('demos smoke — dynamic glob self-check', () => {
    test('at least one demo entry is found (never a vacuous pass)', () => {
        expect(entries.length).toBeGreaterThan(0);
    });
});

describe('demos smoke — both-surfaces boot/run/dispose', () => {
    for (const rel of entries) {
        const slug = rel.split(/[\\/]/)[0];

        for (const variant of VARIANTS) {
            test(`${slug} — variant=${variant}`, async () => {
                const { boot } = await import('../demos/_boot.js');
                const booted = await boot(variant);
                expect(booted.variant).toBe(variant);
                expect(booted.anim).toBeTruthy();

                const mount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                document.body.appendChild(mount);

                // No-side-effect-at-import proof (`docs/demo-playground.md`
                // §10 property 2): importing `main.js` must not touch the mount —
                // asserted BEFORE `run()` is ever called.
                const { run } = await import(join(DEMOS_DIR, rel));
                expect(mount.children.length).toBe(0);
                // `main.js` exports a `run` function (§10 property 1).
                expect(typeof run).toBe('function');

                // No try/catch: an unexpected throw or rejection here fails
                // this test directly — that IS the "assert no throw" check.
                const handle = await run({ mount, anim: booted.anim, variant: booted.variant });

                expect(mount.children.length).toBeGreaterThanOrEqual(1);

                expect(handle).toBeTruthy();
                expect(typeof handle.dispose).toBe('function');
                // Again, no try/catch: disposal throwing fails this test.
                handle.dispose();

                document.body.removeChild(mount);
            });
        }
    }
});

/**
 * Boot a fresh `standalone` `anim` surface + mount, for a leg that only
 * needs to prove a behavior via the public surface (not variant-specific —
 * the guard/seam logic under test is plain JS, not DOM-rendering-dependent).
 *
 * @returns {Promise<{ anim: object, mount: SVGElement }>}
 */
async function bootStandaloneMount() {
    const { boot } = await import('../demos/_boot.js');
    const booted = await boot('standalone');
    const mount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mount.setAttribute('viewBox', '0 0 800 800');
    document.body.appendChild(mount);
    return { anim: booted.anim, mount };
}

// ── pageflip — rapid-turn leg (`ai/archives/packages/graphic/anim/demos-GAPS.md` item 7, closed by task 01) ──

describe('demos smoke — pageflip rapid-turn leg', () => {
    test('overlapping next()/previous() are ignored in flight; dispose leaves zero orphaned tickables', async () => {
        const { anim, mount } = await bootStandaloneMount();
        const { run } = await import('../demos/pageflip/main.js');
        const handle = await run({ mount, anim, variant: 'standalone' });

        const tl1 = handle.next();
        expect(tl1).toBeTruthy();
        expect(handle.index()).toBe(0);

        // Overlapping calls while tl1 is still in flight — the underlying
        // guard, not a UI affordance: `pageflip/index.html`'s own buttons
        // already disable themselves while a turn is in flight, so only a
        // scripted bypass (calling the handle directly, as here) actually
        // exercises `Pageflip`'s `_active`-guarded `next()`/`previous()`.
        expect(handle.next()).toBeNull();
        expect(handle.previous()).toBeNull();
        // No stuck/partial page — the index hasn't silently advanced.
        expect(handle.index()).toBe(0);

        // One real tickable in flight before teardown.
        expect(anim.scheduler.scheduler.active.size).toBeGreaterThan(0);

        // dispose() while the turn is still in flight (task 01's
        // `Timeline#stop()` + `onSettle` release path).
        handle.dispose();
        expect(anim.scheduler.scheduler.active.size).toBe(0);
        // Post-dispose no-op, mirroring the ordinary disposed-book contract.
        expect(handle.next()).toBeNull();

        document.body.removeChild(mount);
    });
});

// ── hypertree — stop()/focusSync() legs (`ai/archives/packages/graphic/anim/demos-GAPS.md` items 8 and 6,
//    both closed by task 02) ────────────────────────────────────────────

describe('demos smoke — hypertree stop-guard + focusSync legs', () => {
    test('stop() on the Timeline focus() returns still releases the guard — the next click focuses', async () => {
        const { anim, mount } = await bootStandaloneMount();
        const { run } = await import('../demos/hypertree/main.js');
        const handle = await run({ mount, anim, variant: 'standalone' });

        /** @type {string[]} */
        const messages = [];
        handle.onEvent((text) => messages.push(text));

        const tl = handle.focus('branch-a');
        expect(tl).toBeTruthy();

        // Guard armed (ignoreWhileFocusing: true, wired by the demo): a real
        // click on a DIFFERENT node is dropped whole — neither onNodeClick
        // nor onFocus fires.
        expect(handle.clickNode('branch-b')).toBe(true);
        expect(messages.length).toBe(0);

        // Direct Timeline#stop() — bypasses Hypertree#dispose() entirely.
        // Pre-task-02 this left `_focusing` permanently true (GAPS item 8).
        tl.stop();

        // Guard released: the SAME click now goes through.
        expect(handle.clickNode('branch-b')).toBe(true);
        expect(messages.some((m) => m.includes('clicked: branch-b'))).toBe(true);

        handle.dispose();
        expect(anim.scheduler.scheduler.active.size).toBe(0);

        document.body.removeChild(mount);
    });

    test('focusSync() during an in-flight focus() WINS — the superseded focus never fires onFocus', async () => {
        const { anim, mount } = await bootStandaloneMount();
        const { run } = await import('../demos/hypertree/main.js');
        const handle = await run({ mount, anim, variant: 'standalone' });

        /** @type {string[]} */
        const messages = [];
        handle.onEvent((text) => messages.push(text));

        handle.focus('branch-c'); // in flight, ~400ms default duration
        handle.focusSync('branch-d'); // supersedes immediately
        expect(handle.focusId()).toBe('branch-d');

        // Wait past the original focus()'s duration — pre-task-02 (GAPS item
        // 6) it would have overwritten focusSync's result on completion.
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(handle.focusId()).toBe('branch-d');
        expect(messages.some((m) => m.includes('focused: branch-c'))).toBe(false);

        handle.dispose();
        expect(anim.scheduler.scheduler.active.size).toBe(0);

        document.body.removeChild(mount);
    });
});

// ── svg3d — composed-class leg (`ai/archives/packages/graphic/anim/demos-GAPS.md` item 4, closed by task 04) ─

describe('demos smoke — svg3d composed-class leg', () => {
    for (const variant of VARIANTS) {
        test(`the demo also constructs the COMPOSED Svg3d/createTerrain class via task 04's prebuilt root — variant=${variant}`, async () => {
            const { boot } = await import('../demos/_boot.js');
            const booted = await boot(variant);
            const mount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            document.body.appendChild(mount);

            const { run } = await import('../demos/svg3d/main.js');
            const handle = await run({ mount, anim: booted.anim, variant: booted.variant });

            // The composed instance, not the leaf-kernel one — a distinct
            // object with its OWN public surface (mesh/mode/node/seek/setCamera).
            expect(handle.composed).toBeTruthy();
            expect(handle.composed.mode).toBe('path');
            expect(handle.composed.mesh.triangleCount).toBeGreaterThan(0);
            expect(handle.composed.node.parentNode).toBe(mount);
            expect(handle.composed.node.tagName).toBe('svg');

            // The composed surface's own re-render path is live.
            handle.composed.seek(500);
            handle.composed.setCamera({ y: 900 });

            handle.dispose();
            document.body.removeChild(mount);
        });
    }
});

// ── Browser module-graph resolution gate (graphic/BATCH_17 task 03, attempt 3) ─
//
// WHY THIS EXISTS. Every other assertion in this file runs under `bun test`,
// and Bun resolves a bare specifier through workspace `node_modules` — with
// NO import map and no notion of one. A demo page can therefore be fully
// green here and still be DEAD in a browser, because the browser resolves a
// bare specifier through the page's `<script type="importmap">` ALONE and
// throws `Failed to resolve module specifier` on anything undeclared.
//
// That is not hypothetical: measured 2026-08-04, `demos/pageflip/` and
// `demos/hypertree/` were in exactly that state — at git HEAD *before* this
// task (relative `../../src/pageflip/pageflip.js` -> `../svg/apply.js` ->
// undeclared `@awacloud/fw/dom/query/dom.js`, no import map on the page at
// all) and again after this task's attempt 2 (bare `@awacloud/graphic-anim`
// -> `src/main.js` -> three undeclared `@awacloud/fw/*` specifiers). Two
// conformance passes went green over both states. This gate is the missing
// instrument, not a nicety.
//
// WHAT IT DOES. For every demo page (glob-driven, never a hardcoded list) it
// walks the module graph the way a browser would: entry points are the page's
// own `<script type="module">` blocks; a relative/root-absolute specifier
// resolves as a URL against the repo-root document root; a BARE specifier
// resolves through the page's import map and NOWHERE else. It fails on an
// undeclared bare specifier and on a specifier resolving to a missing file.
//
// SOUNDNESS / LIMITS, stated so nobody over-trusts it:
//   - Specifier extraction is `Bun.Transpiler#scanImports`, a real JS parser —
//     not a regex — so specifiers written inside comments and strings do not
//     produce false positives (several demos carry comment blocks quoting bare
//     specifiers verbatim; a regex gate would fire on those).
//   - It sees static `import`/`export … from` and dynamic `import()` with a
//     LITERAL specifier. A computed `import(expr)` is invisible to it. All
//     eight demos and `_boot.js` use literals only (verified 2026-08-04); a
//     future computed import would silently escape this gate.
//   - It proves RESOLVABILITY, not execution: every module the page can reach
//     has a resolvable URL backed by a real file. It does not prove the page
//     renders — that is what the boot/run/dispose legs above do.
//   - Import-map semantics implemented: exact key first, then longest
//     trailing-slash prefix key. `"scopes"` is NOT implemented — no demo page
//     uses it, and a page that starts to would need this extended.

// The walker itself (`urlToFile`, `importMapOf`, `moduleEntryPoints`,
// `lookupBare`, `resolveLikeBrowser`, `walkPageGraph`) now lives in
// `tests/_lib/browser-resolution.js` (graphic/BATCH_22 task 04), shared with
// `tests/playground-smoke.integration.test.js` — previously ~140 lines
// near-duplicated in each file. `urlToFile`/`walkPageGraph` are imported at
// the top of this file; see that module's own header for the walker's full
// modeling contract.

/** Family index + one page per glob'd slug — never a hardcoded list. */
const demoPages = [
    '/packages/front/graphic/anim/demos/index.html',
    ...entries.map((rel) => `/packages/front/graphic/anim/demos/${rel.split(/[\\/]/)[0]}/index.html`),
];

// ITEMIZATION (graphic/BATCH_22 task 04, plan checklist "each of the 18
// baseline problems itemised with its cause"). Re-derived live per the task's
// orchestrator note and `ai/archives/packages/graphic/anim/e2e-BASELINE.md` §4.1: the plan's "18" is Bun's own
// `toEqual` diff LINE count for the array literal, not an element count — the
// `failures` array this gate builds held exactly **4** elements at the
// pre-task commit, all four the SAME defect class:
//   #1 `demos/hypertree/index.html`: undeclared bare specifier
//      `@awacloud/fw/core/runtime`, imported by `src/pageflip/create.js`
//   #2 `demos/hypertree/index.html`: same specifier, imported by
//      `src/hypertree/create.js`
//   #3 `demos/pageflip/index.html`: same specifier, imported by
//      `src/pageflip/create.js`
//   #4 `demos/pageflip/index.html`: same specifier, imported by
//      `src/hypertree/create.js`
// Cause: `src/{hypertree,pageflip}/create.js:40` import the fw core runtime
// WITHOUT the `.js` extension (`'@awacloud/fw/core/runtime'`); the two pages'
// import maps declared only the `.js`-suffixed key. Page content, not a gate
// over-report: the walker needed no correction for these four. They were
// first closed page-side with an extensionless compensation key; the source
// now writes `@awacloud/fw/core/runtime.js` like every other fw specifier
// (`tests/fw-specifiers.integration.test.js`), and both pages declare that
// one key only.
describe('demos smoke — browser module-graph resolution (import map only)', () => {
    test('every demo page resolves its entire module graph with NO node_modules fallback', () => {
        // Self-check: a narrowed or empty page list must not pass vacuously.
        expect(demoPages.length).toBe(entries.length + 1);
        expect(demoPages.length).toBeGreaterThan(1);

        const failures = [];
        let totalModules = 0;
        for (const pageUrl of demoPages) {
            const walked = walkPageGraph(pageUrl);
            totalModules += walked.moduleCount;
            for (const problem of walked.problems) failures.push(`${pageUrl}\n    ${problem}`);
        }

        // Non-vacuity: the walk must actually have reached modules. A parser or
        // glob regression reaching nothing would otherwise pass silently.
        expect(totalModules).toBeGreaterThan(entries.length);
        expect(failures).toEqual([]);
    });
});

// ── Structural gate — import map document-order, extended from
//    `playground-smoke.integration.test.js` (graphic/BATCH_21/05) to
//    `demos/**` (graphic/BATCH_22 task 04) ───────────────────────────────
//
// A module script placed ABOVE a page's import map reds the WHOLE PAGE in
// real Firefox — measured, `ai/memory/types/graphic.md` 2026-08-05 entry
// (BATCH_18/02): Firefox 153.0.1 6/6 page×variant, 5/5 repeat; Chromium
// tolerates the wrong order, which is exactly why `bun test` (which never
// drives a real Firefox) cannot see this on its own. This is a STRUCTURAL
// property of the page's own markup (not the module-graph walk above), so it
// is asserted directly against the raw HTML: the character index of the
// `<script type="importmap">` open tag must be LESS than the index of the
// first `<script type="module">` open tag.
//
// Five demos (`clock`, `engine`, `frames`, `scene`, `towards-anm`) plus the
// family index page carry NO import map at all (fw reached via `_boot.js`
// relative dynamic imports) — that is NOT a failure, so the rule is applied
// only conditionally on a map being present, and the map-bearing COUNT is
// asserted non-zero so the gate cannot go vacuous by that set silently
// emptying (e.g. every remaining import map being removed in a future edit).

describe('demos smoke — import map precedes every module script (order gate)', () => {
    test('every demo page with an import map declares it before any <script type="module">', () => {
        const violations = [];
        let mapBearingCount = 0;

        for (const pageUrl of demoPages) {
            const html = readFileSync(urlToFile(pageUrl), 'utf8');
            const mapIdx = html.indexOf('<script type="importmap">');
            if (mapIdx === -1) continue; // no import map on this page — not a failure

            mapBearingCount += 1;
            const moduleIdx = html.indexOf('<script type="module">');
            if (moduleIdx === -1 || mapIdx > moduleIdx) {
                violations.push(
                    `${pageUrl}: <script type="importmap"> at index ${mapIdx}, `
                        + `first <script type="module"> at index ${moduleIdx}`,
                );
            }
        }

        // Non-vacuity: the map-bearing subset must not be empty, or this gate
        // would pass trivially if the corpus ever lost every import map.
        expect(mapBearingCount).toBeGreaterThan(0);
        expect(violations).toEqual([]);
    });
});

// ── Shared walker robustness — comment-blindness (orchestrator-flagged
//    defect, fixed in `tests/_lib/browser-resolution.js`) ─────────────────
//
// The extracted `importMapOf`/`moduleEntryPoints` scanned raw HTML text with
// no awareness of HTML comments, so authored prose that literally quotes a
// `<script type="importmap">`/`<script type="module">` tag inside a
// `<!-- … -->` block was matched as a real script block and would corrupt
// the walk. Task 03 hit this live drafting a page comment and worked around
// it by rephrasing rather than fixing the walker. Fixed here (both
// functions now strip HTML comments before matching); falsified in-memory
// against synthetic HTML — no tracked page file is touched, since no demo or
// playground page currently carries such a comment (verified live, `git
// grep -n 'script type=' demos/*/index.html playground/*/index.html` shows
// zero occurrences inside a `<!-- -->` block), so the fix is inert on the
// corpus and this is the only way to exercise it.

describe('demos smoke — shared walker is comment-blind-proof', () => {
    test('a script tag quoted inside an HTML comment is not mistaken for a real one; a real tag still is', () => {
        const html = `
            <!-- example: never author a literal <script type="importmap"> in a comment -->
            <script type="importmap">
            { "imports": { "x": "/y.js" } }
            </script>
            <!-- also never write <script type="module">...</script> in a comment -->
            <script type="module">import 'z.js';</script>
        `;

        expect(importMapOf(html)).toEqual({ x: '/y.js' });

        const entries = moduleEntryPoints(html);
        expect(entries.length).toBe(1);
        expect(entries[0].kind).toBe('inline');
        expect(entries[0].value).toContain("import 'z.js'");
    });

    test('FALSIFICATION — the fixture genuinely reproduces the pre-fix bug (the unfixed regex WOULD see the commented tag)', () => {
        const html = '<!-- <script type="importmap">{"imports":{"bad":"/bad.js"}}</script> -->\n'
            + '<script type="importmap">{"imports":{"good":"/good.js"}}</script>';

        // The bare, comment-blind regex this helper used before the fix —
        // reproduced verbatim to prove the fixture actually exercises the
        // defect, not a fixture that happens to dodge it either way.
        const rawMatch = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
        expect(rawMatch).toBeTruthy();
        expect(JSON.parse(rawMatch[1]).imports).toEqual({ bad: '/bad.js' });

        // The shipped helper, same input: the commented tag is stripped
        // first, so only the real one is ever seen.
        expect(importMapOf(html)).toEqual({ good: '/good.js' });
    });
});
