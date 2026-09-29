// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/playground-recipes.mjs
/**
 * @fileoverview The LAUNCH SPEC of the preview gate — one recipe per leg.
 *
 * Two-source model (FINDINGS §1, frozen): `playground/examples.json` is the
 * CATALOGUE of what exists (generated from each playground's README — never
 * hand-edited), and this table is the RECIPE of how to launch it. The catalogue
 * carries no port, no docroot, no ready-wait strategy, no build step and no
 * teardown method, and its `browser: false` flag means "no static entry FILE",
 * NOT "no browser surface" (astro and next are `browser: false` and each serves
 * a full app).
 *
 * The two files are kept in step by `checkCoverage()` — the DRIFT GATE — which
 * `preview.mjs` runs at startup against the live `examples.json` and which is
 * falsified by its own test (an "everything is covered" assertion passes
 * identically on an EMPTY table, so the falsification is what makes it
 * trustworthy).
 *
 * Pure data + pure functions: no I/O, no side effect at import. Paths are
 * REPO-RELATIVE POSIX strings, resolved against the repo root by `preview.mjs`,
 * so this module stays testable under `bun test` with no filesystem at all.
 */

/** fw package root — the docroot of every un-bundled playground page. */
const FW = 'packages/front/fw';
/** Playground tree. */
const PG = `${FW}/playground`;

/**
 * Frozen timing contract (FINDINGS §2.0 — measured, copied verbatim).
 *
 * Ready-wait is an HTTP POLL of the entry URL (any status counts as
 * "answering"), never a stdout-string match: startup banners are locale- and
 * version-dependent and both astro and next print theirs before the socket
 * actually accepts on Windows in some runs.
 */
export const TIMING = Object.freeze({
    pollIntervalMs: 250,
    readyTimeoutStaticMs: 10_000,
    readyTimeoutServerMs: 90_000,
    buildTimeoutMs: 300_000,
    gotoTimeoutMs: 30_000,
    settleMs: 1500,
    portFreeTimeoutMs: 15_000,
});

/**
 * Navigation wait condition (FINDINGS §2.0, frozen).
 *
 * `networkidle` is deprecated and flaky against an HMR websocket (astro dev
 * holds one open indefinitely); `domcontentloaded` returns before module
 * scripts execute and would miss the very errors this gate exists to catch.
 */
export const WAIT_UNTIL = 'load';

/** Leg name of the falsification recipe — excluded from the default run. */
export const SENTINEL_NAME = 'sentinel';

/** Path of the live catalogue, relative to THIS directory. */
export const EXAMPLES_JSON_REL = '../../playground/examples.json';

/** Skip reason shared by the runtime-bucket entries covered by `e2e:playgrounds`. */
const RUNTIME_COVERED = 'browser-surface-less; build/run covered by e2e:playgrounds';
/** Skip reason for the two runtime entries no e2e surface covers today. */
const RUNTIME_UNCOVERED = 'browser-surface-less; NO e2e coverage today (absent from playgrounds.mjs)';

/**
 * @typedef {Object} BuildStep
 * @property {string} [binRel]   Package bin JS, relative to `<cwd>/node_modules` (e.g. `astro/bin/astro.mjs`).
 * @property {string} [scriptRel] Script in the playground itself, relative to `<cwd>` (e.g. `build.mjs`).
 *                                Exactly one of `binRel` / `scriptRel` is set.
 * @property {string[]} args
 */

/**
 * @typedef {Object} Recipe
 * @property {string} name                 Leg name — equals `result.name` in the artifact (e.g. `astro-dev`).
 * @property {string} entryName            The `examples.json` entry this leg covers (e.g. `astro`).
 * @property {'static'|'dev-server'|'ssr'|'runtime'} type  Launch shape.
 * @property {string} [skip]               Deliberate-skip reason (the `runtime` bucket).
 * @property {number} [port]               Explicit, non-default, availability-checked before use.
 * @property {string} [docroot]            Repo-relative docroot for `type: 'static'`.
 * @property {string} [entryPath]          URL path opened on the leg's origin.
 * @property {boolean} [requiresFwDist]    Page references `dist/build/*` → SKIP when the gitignored artifact is absent.
 * @property {boolean} [needsInstall]      SKIP when the playground's `node_modules` is absent.
 * @property {BuildStep[]} [build]         Build steps, run before bring-up.
 * @property {{binRel: string, args: string[]}} [serve]  Long-lived server, spawned with `process.execPath`.
 * @property {Record<string,string>} [env] Extra environment for build + serve.
 * @property {string} [cwd]                Repo-relative working directory for build/serve.
 */

/**
 * 15 legs covering the 14 catalogue entries (astro has two launch modes), plus
 * the sentinel — which is excluded from the default run and executes only when
 * named on the command line.
 *
 * @type {Recipe[]}
 */
export const RECIPES = Object.freeze([
    // ── build + static: the bundler playgrounds ───────────────────────────────
    {
        name: 'esbuild',
        entryName: 'esbuild',
        type: 'static',
        port: 4801,
        cwd: `${PG}/integrations/esbuild`,
        docroot: `${PG}/integrations/esbuild`,
        entryPath: '/index.html',
        needsInstall: true,
        // The playground's own build driver (esbuild's JS API), not a package bin.
        build: [{ scriptRel: 'build.mjs', args: [] }],
    },
    {
        name: 'rollup',
        entryName: 'rollup',
        type: 'static',
        port: 4801,
        cwd: `${PG}/integrations/rollup`,
        docroot: `${PG}/integrations/rollup`,
        entryPath: '/index.html',
        needsInstall: true,
        build: [{ binRel: 'rollup/dist/bin/rollup', args: ['-c'] }],
    },
    {
        name: 'webpack',
        entryName: 'webpack',
        type: 'static',
        port: 4801,
        cwd: `${PG}/integrations/webpack`,
        // BL-376: the catalogue's `browser` field names the SOURCE html while the
        // served docroot is `dist/` (CopyHtmlPlugin copies index.html next to the
        // bundle). The recipe supplies the real docroot; the field cannot.
        docroot: `${PG}/integrations/webpack/dist`,
        entryPath: '/index.html',
        needsInstall: true,
        build: [{ binRel: 'webpack/bin/webpack.js', args: [] }],
    },

    // ── dev-server ────────────────────────────────────────────────────────────
    {
        name: 'astro-dev',
        entryName: 'astro',
        type: 'dev-server',
        port: 4802,
        cwd: `${PG}/integrations/astro`,
        entryPath: '/',
        needsInstall: true,
        serve: { binRel: 'astro/bin/astro.mjs', args: ['dev', '--port', '4802'] },
        env: { ASTRO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', FORCE_COLOR: '0' },
    },
    {
        // Both modes run: they are different products — dev ships the vite client
        // and the dev toolbar, preview ships neither (FINDINGS §2.3).
        name: 'astro-preview',
        entryName: 'astro',
        type: 'dev-server',
        port: 4803,
        cwd: `${PG}/integrations/astro`,
        entryPath: '/',
        needsInstall: true,
        build: [{ binRel: 'astro/bin/astro.mjs', args: ['build'] }],
        serve: { binRel: 'astro/bin/astro.mjs', args: ['preview', '--port', '4803'] },
        env: { ASTRO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', FORCE_COLOR: '0' },
    },
    {
        name: 'vite',
        entryName: 'vite',
        type: 'dev-server',
        port: 4805,
        cwd: `${PG}/integrations/vite`,
        entryPath: '/',
        needsInstall: true,
        // --strictPort: without it vite silently moves to the next free port and
        // the ready-poll would time out against an origin nothing listens on.
        serve: { binRel: 'vite/bin/vite.js', args: ['--port', '4805', '--strictPort'] },
        env: { FORCE_COLOR: '0', DO_NOT_TRACK: '1' },
    },
    // ── ssr ───────────────────────────────────────────────────────────────────
    {
        // "ssr" names the LAUNCH SHAPE (framework production server, build then
        // start). Next 16 prerenders all 4 routes as static, so a green leg here
        // is NOT evidence about request-time rendering (FINDINGS §2.4).
        name: 'next',
        entryName: 'next',
        type: 'ssr',
        port: 4804,
        cwd: `${PG}/integrations/next`,
        entryPath: '/',
        needsInstall: true,
        build: [{ binRel: 'next/dist/bin/next', args: ['build'] }],
        serve: { binRel: 'next/dist/bin/next', args: ['start', '-p', '4804'] },
        env: { NEXT_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    },

    // ── runtime: browser-surface-less, EXPLICIT skips (never silently omitted) ─
    { name: 'bun', entryName: 'bun', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'deno', entryName: 'deno', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'jest', entryName: 'jest', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'nest', entryName: 'nest', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'nodejs', entryName: 'nodejs', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'vitest', entryName: 'vitest', type: 'runtime', skip: RUNTIME_COVERED },
    { name: 'eslint', entryName: 'eslint', type: 'runtime', skip: RUNTIME_UNCOVERED },
    { name: 'typedoc', entryName: 'typedoc', type: 'runtime', skip: RUNTIME_UNCOVERED },

    // ── sentinel: falsification leg, runs ONLY when named ─────────────────────
    {
        // Serves a COPY of the esbuild playground page (written to repo-root
        // tmp/) carrying an injected `throw`, at the SAME URL via the static
        // server's `overrides` map — every sibling asset still comes from the
        // real tree, so the injected line is the only difference. The original
        // is never edited.
        name: SENTINEL_NAME,
        entryName: 'esbuild',
        type: 'static',
        port: 4801,
        cwd: `${PG}/integrations/esbuild`,
        docroot: `${PG}/integrations/esbuild`,
        entryPath: '/index.html',
        needsInstall: true,
        build: [{ scriptRel: 'build.mjs', args: [] }],
    },
]);

/**
 * Extract the catalogue's entry names from a parsed `examples.json`.
 *
 * @param {{axes?: {items?: {name: string}[]}[]}} examples
 * @returns {string[]} entry names, in file order
 */
export function catalogueNames(examples) {
    return (examples?.axes ?? []).flatMap((axis) => (axis?.items ?? []).map((item) => item.name));
}

/**
 * DRIFT GATE (pure). Without it the catalogue and the recipe table diverge
 * silently and the gate quietly stops covering new playgrounds.
 *
 * @param {string[]} names           Catalogue entry names.
 * @param {Recipe[]} recipes         Recipe table.
 * @returns {{missingRecipes: string[], unknownRecipes: string[]}}
 *   `missingRecipes`: catalogue entries with no recipe and no explicit skip row.
 *   `unknownRecipes`: `entryName`s named by a recipe but absent from the catalogue.
 */
export function checkCoverage(names, recipes) {
    const catalogue = new Set(names);
    const covered = new Set((recipes ?? []).map((r) => r.entryName));
    const missingRecipes = [...new Set(names)].filter((n) => !covered.has(n));
    const unknownRecipes = [...covered].filter((n) => !catalogue.has(n));
    return { missingRecipes, unknownRecipes };
}

/**
 * The default run: every leg except the sentinel.
 *
 * @param {Recipe[]} [recipes]
 * @returns {Recipe[]}
 */
export function defaultLegs(recipes = RECIPES) {
    return recipes.filter((r) => r.name !== SENTINEL_NAME);
}
