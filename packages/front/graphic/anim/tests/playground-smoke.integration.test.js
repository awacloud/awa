// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — family smoke suite for
 * `packages/front/graphic/anim/playground/` (`docs/demo-playground.md`
 * §10), PLUS the mandatory browser-resolution walk this task was regenerated
 * to add (see `ai/archives/batches/graphic/BATCH_21/05-playground-family.md`
 * "Premise corrections" and `ai/memory/types/graphic.md`, 2026-08-10 entry).
 *
 * Globs `playground/*\/index.html` AT TEST TIME (no per-surface registration
 * edit ever needed): for each found slug it (a) imports `main.js` and asserts
 * no side effect on import, (b) asserts a `run` export, (c) calls
 * `run({ mount })` under happy-dom and asserts it does not throw and the
 * mount gained at least one child, (d) calls the returned handle's
 * `dispose()` and asserts it does not throw either.
 *
 * Unlike `tests/demos-smoke.integration.test.js`, this family's `main.js`
 * resolves its OWN private `@awacloud/fw` `ModuleRuntime` inside `run()` (no
 * shared `_boot.js`, no externally-supplied `anim`/`scheduler` — the plan's
 * prescriptive contract is `run({ mount })` only). There is therefore no
 * externally-observable scheduler singleton to assert an empty `active` set
 * against; "dispose() runs clean" is proven the same way the reference
 * suite proves a *completion* callback's cleanup: no try/catch around either
 * call, so an unexpected throw or rejection fails the test directly. The
 * easing-lab leg goes further: it drives one real tick past `dispose()` and
 * confirms the animated attribute stopped moving, which is the closest
 * external proof available that the scheduler tick actually halted.
 *
 * Self-check: zero playground entries found MUST fail this suite — a
 * passing run over an empty glob would be a silent, vacuous green.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard against double-registration when this file runs alongside sibling
// integration tests that already registered happy-dom in the same worker
// (same pattern as tests/demos-smoke.integration.test.js).
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { urlToFile, walkPageGraph } from './_lib/browser-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_DIR = join(HERE, '..', 'playground');

/** @type {string[]} Relative `<slug>/main.js` paths, glob'd at test time. */
const entries = [...new Bun.Glob('*/main.js').scanSync({ cwd: PLAYGROUND_DIR })].sort();

describe('playground smoke — dynamic glob self-check', () => {
    test('at least one playground entry is found (never a vacuous pass)', () => {
        expect(entries.length).toBeGreaterThan(0);
    });
});

describe('playground smoke — boot/run/dispose', () => {
    for (const rel of entries) {
        const slug = rel.split(/[\\/]/)[0];

        test(`${slug} — no import side effect, run()/dispose() contract`, async () => {
            const mount = document.createElement('div');
            mount.id = 'mount';
            document.body.appendChild(mount);

            // No-side-effect-at-import proof (§10 property 2): importing
            // `main.js` must not touch the mount — asserted BEFORE `run()`
            // is ever called.
            const { run } = await import(join(PLAYGROUND_DIR, rel));
            expect(mount.children.length).toBe(0);
            // `main.js` exports a `run` function (§10 property 1).
            expect(typeof run).toBe('function');

            // No try/catch: an unexpected throw or rejection here fails
            // this test directly — that IS the "assert no throw" check
            // (§10 property 3).
            const handle = await run({ mount });

            expect(mount.children.length).toBeGreaterThanOrEqual(1);
            expect(handle).toBeTruthy();
            expect(typeof handle.dispose).toBe('function');

            // Again, no try/catch: disposal throwing fails this test
            // (§10 property 4).
            handle.dispose();

            document.body.removeChild(mount);
        });
    }
});

// ── easing-lab — dispose() actually halts the scheduler tick ───────────────
//
// `run({ mount })` immediately starts a self-looping tween (see the
// `disposed`-guarded `play()`/`onComplete` in `playground/easing-lab/main.js`).
// This leg drives one real animation frame BEFORE `dispose()`, captures the
// animated dot's `cx`, disposes, drives another frame, and asserts `cx` did
// NOT move further — the external proof that the private scheduler this
// page's own runtime resolved actually stopped ticking, not just that the
// handle exists.

describe('playground smoke — easing-lab dispose() halts the tick', () => {
    test('the animated dot stops moving once dispose() has been called', async () => {
        const mount = document.createElement('div');
        mount.id = 'mount';
        document.body.appendChild(mount);

        const { run } = await import(join(PLAYGROUND_DIR, 'easing-lab', 'main.js'));
        const handle = await run({ mount });

        const dot = mount.querySelector('circle');
        expect(dot).toBeTruthy();

        // Let a couple of real rAF frames (happy-dom's timer-backed stub)
        // elapse so the tween has actually started moving the dot.
        await new Promise((resolve) => setTimeout(resolve, 80));
        const midFlight = dot.getAttribute('cx');

        handle.dispose();

        const afterDispose = dot.getAttribute('cx');
        await new Promise((resolve) => setTimeout(resolve, 80));
        const afterWait = dot.getAttribute('cx');

        // No further movement once disposed — the value right after
        // dispose() and the value after another wait must be identical.
        expect(afterWait).toBe(afterDispose);
        // Sanity: the animation was actually live before dispose() (a
        // vacuous "both values equal because nothing ever moved" pass is
        // ruled out by requiring at least ONE of the two disposal readings
        // to differ from the very first attribute value, `20`).
        expect(midFlight === '20' && afterDispose === '20').toBe(false);

        mount.remove();
    });
});

// ── timeline-lab — Play, then dispose() mid-flight cleanly ─────────────────

describe('playground smoke — timeline-lab Play then dispose() mid-flight', () => {
    test('clicking Play starts the timeline; dispose() mid-flight does not throw', async () => {
        const mount = document.createElement('div');
        mount.id = 'mount';
        document.body.appendChild(mount);

        const { run } = await import(join(PLAYGROUND_DIR, 'timeline-lab', 'main.js'));
        const handle = await run({ mount });

        const buttons = mount.querySelectorAll('button');
        expect(buttons.length).toBe(2);
        const [playBtn, stopBtn] = buttons;
        expect(playBtn.textContent).toBe('Play');
        expect(stopBtn.textContent).toBe('Stop');
        expect(stopBtn.disabled).toBe(true);

        playBtn.click();
        expect(stopBtn.disabled).toBe(false);

        // dispose() while the timeline is still mid-flight — no try/catch,
        // an unexpected throw fails this test directly.
        handle.dispose();

        mount.remove();
    });
});

// ── Browser module-graph resolution gate — the point of this regeneration ──
//
// Every assertion above runs under `bun test`, where Bun resolves a bare
// specifier through workspace `node_modules` with NO notion of an import
// map — so a page could be green above and still be DEAD in a browser (both
// playground pages were, as first written: the package then imported the fw
// core runtime under two spellings and the map declared only one; an import
// map matches a specifier exactly).
//
// This walks each playground page's module graph the way a browser would:
// entry points are the page's own `<script type="module">` blocks; a
// relative/root-absolute specifier resolves as a URL against the repo-root
// document root; a BARE specifier resolves through the page's import map and
// NOWHERE else. It fails on an undeclared bare specifier and on a specifier
// resolving to a missing file.
//
// `tests/demos-smoke.integration.test.js` implements exactly this walk
// (`specifierScanner`, `resolveLikeBrowser`, ~lines 271-410) and is the
// reference — it is OUT of this task's scope to edit or import from (see the
// plan's "Out" section and the report's `out_of_perimeter_findings`
// proposing the shared extraction), so the walk is re-implemented here,
// deliberately.

// The walker itself (`urlToFile`, `importMapOf`, `moduleEntryPoints`,
// `lookupBare`, `resolveLikeBrowser`, `walkPageGraph`) now lives in
// `tests/_lib/browser-resolution.js` (graphic/BATCH_22 task 04), shared with
// `tests/demos-smoke.integration.test.js` — previously ~140 lines
// near-duplicated in each file, this file's own copy kept the `htmlOverride`
// parameter on `walkPageGraph` for the falsification leg below; the shared
// signature keeps that optional parameter for both callers rather than
// forcing the demos side to grow a second entry point. `urlToFile`/
// `walkPageGraph` are imported at the top of this file; see that module's
// own header for the walker's full modeling contract.

/** One page per glob'd slug — never a hardcoded list. */
const playgroundPages = entries.map(
    (rel) => `/packages/front/graphic/anim/playground/${rel.split(/[\\/]/)[0]}/index.html`,
);

describe('playground smoke — browser module-graph resolution (import map only)', () => {
    test('every playground page resolves its entire module graph with NO node_modules fallback', () => {
        // Self-check: a narrowed or empty page list must not pass vacuously.
        expect(playgroundPages.length).toBe(entries.length);
        expect(playgroundPages.length).toBeGreaterThan(0);

        const failures = [];
        let totalModules = 0;
        for (const pageUrl of playgroundPages) {
            const walked = walkPageGraph(pageUrl);
            totalModules += walked.moduleCount;
            for (const problem of walked.problems) failures.push(`${pageUrl}\n    ${problem}`);
        }

        // Non-vacuity: the walk must actually have reached modules.
        expect(totalModules).toBeGreaterThan(entries.length);
        expect(failures).toEqual([]);
    });

    // FALSIFICATION (mandatory): remove the fw core-runtime key from a REAL
    // page's HTML (read from disk, then the key stripped in memory — the
    // committed file is never touched) and confirm the walk goes RED naming
    // the exact specifier it protects. A gate not shown able to redden
    // proves nothing. The package writes `@awacloud/fw/core/runtime.js`
    // (the page's `main.js` and `src/{pageflip,hypertree}/create.js`), so
    // that key is load-bearing.
    test('FALSIFICATION — removing the fw core-runtime key reddens on the exact specifier', () => {
        expect(playgroundPages.length).toBeGreaterThan(0);
        const pageUrl = playgroundPages[0];
        const html = readFileSync(urlToFile(pageUrl), 'utf8');

        // Strip exactly that entry from the in-memory HTML — a targeted
        // mutation, not a parse break (ai/conventions/testing.md, "falsified
        // under targeted mutation"). It is the FIRST entry of the object, so
        // eat its FOLLOWING comma: the remaining JSON stays valid.
        const mutated = html.replace(
            /"@awacloud\/fw\/core\/runtime\.js":\s*"\/packages\/front\/fw\/src\/core\/runtime\.js",\s*/,
            '',
        );
        expect(mutated).not.toBe(html); // the replace actually matched something

        const walked = walkPageGraph(pageUrl, mutated);
        expect(walked.problems.length).toBeGreaterThan(0);
        expect(walked.problems.some((p) => p.includes('undeclared bare specifier "@awacloud/fw/core/runtime.js"'))).toBe(true);
    });
});

// ── Structural gate — import map document-order (orchestrator corrective) ──
//
// The plan's own prescriptive skeleton (§ Prescriptive API / content) is
// explicit that document order is (1) the import map FIRST, before ANY
// module script, THEN (2) the sanity module — and names the reason inline:
// a module script placed above the import map reds the WHOLE PAGE in real
// Firefox (measured, `ai/memory/types/graphic.md` 2026-08-05 entry,
// BATCH_18/02: Firefox 153.0.1 6/6 page×variant, 5/5 repeat; Chromium
// tolerates the wrong order, which is exactly why `bun test` — which never
// drives a real Firefox — cannot see this on its own). This is a STRUCTURAL
// property of the page's own markup (not the module-graph walk above), so
// it is asserted directly against the raw HTML: the character index of the
// `<script type="importmap">` open tag must be LESS than the index of the
// first `<script type="module">` open tag.

describe('playground smoke — import map precedes every module script', () => {
    for (const rel of entries) {
        const slug = rel.split(/[\\/]/)[0];

        test(`${slug} — <script type="importmap"> appears before the first <script type="module">`, () => {
            const pageFile = join(PLAYGROUND_DIR, slug, 'index.html');
            const html = readFileSync(pageFile, 'utf8');

            const mapIdx = html.indexOf('<script type="importmap">');
            const moduleIdx = html.indexOf('<script type="module">');

            // Non-vacuity: both markers must actually be present, or an
            // index of -1 on either side would make the comparison below
            // pass for the wrong reason.
            expect(mapIdx).toBeGreaterThan(-1);
            expect(moduleIdx).toBeGreaterThan(-1);

            expect(mapIdx).toBeLessThan(moduleIdx);
        });
    }
});
