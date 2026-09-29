// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/run.mjs
/**
 * @fileoverview End-to-end harness for the `@awacloud/fw` bundler adapters.
 *
 * For each bundler that is actually installed, it runs a real build of
 * `fixture/app.js` (which imports `virtual:@awacloud/fw/preset/core`) and asserts :
 *   - the build succeeds (every emitted `@awacloud/fw/*` subpath import resolved),
 *   - the output contains the generated runtime markers,
 *   - the sanity layer is injected when requested,
 *   - (esbuild) the bundle actually executes and exposes the 7 core modules.
 *
 * The Vite adapter is covered in BOTH modes : a programmatic `build()` AND a
 * dev `createServer()` + `transformIndexHtml()` — asserting the sanity import
 * is injected and that no bare `@awacloud/fw/sanity/*` specifier ever reaches the
 * HTML (the dev-server regression fixed via `transformIndexHtml` `order: 'pre'`).
 *
 * SELF-SKIPPING : a bundler that is not installed is reported as SKIP, not
 * FAIL. So a dev who only installed esbuild still gets a clean partial run.
 * Run under either runtime :  `bun run.mjs`  or  `node run.mjs`.
 */

import { mkdirSync, existsSync, symlinkSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FW_ROOT = resolve(HERE, '..', '..');
const FIXTURE = resolve(HERE, 'fixture', 'app.js');
const TMP = resolve(HERE, '.tmp');

const CORE_MODULES = ['errors', 'eventBus', 'signal', 'valid', 'ui8', 'abort', 'clock'];
const SANITY_TOKEN = 'BLOCKED_WINDOW_APIS';

/**
 * Ensure `@awacloud/fw` resolves to this package, so bundlers resolve the emitted
 * `@awacloud/fw/*` imports through the real `exports` map — exactly as a consumer
 * install would. The link goes in THIS package's own `node_modules/@awacloud/fw`,
 * an ancestor of the fixture, so it is found whether `fw` lives in a monorepo
 * workspace OR is cloned standalone. Idempotent ; junction (no admin on Win).
 */
function ensureLink() {
    const scope = resolve(FW_ROOT, 'node_modules', '@awacloud');
    const link = resolve(scope, 'fw');
    if (existsSync(link)) return;
    mkdirSync(scope, { recursive: true });
    try {
        symlinkSync(FW_ROOT, link, 'junction');
    } catch (e) {
        throw new Error(`could not link node_modules/@awacloud/fw -> ${FW_ROOT}: ${e.message}`, { cause: e });
    }
}

/** @param {string} code @param {string} label */
function assertMarkers(code, label) {
    if (!code.includes('ModuleRuntime')) throw new Error(`${label}: missing "ModuleRuntime" in output`);
    if (!code.includes('registerAllDeep')) throw new Error(`${label}: missing "registerAllDeep" in output`);
}

const results = [];
/** @param {string} name @param {'PASS'|'SKIP'|'FAIL'} status @param {string} detail */
function record(name, status, detail) {
    results.push({ name, status, detail });
    const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️ ' : '❌';
    console.log(`${icon} ${name.padEnd(20)} ${status.padEnd(4)} ${detail}`);
}

/** Dynamically import a bundler ; return null (→ SKIP) if not installed. */
async function tryImport(spec) {
    try { return await import(spec); }
    catch { return null; }
}

async function runEsbuild() {
    const mod = await tryImport('esbuild');
    if (!mod) return record('esbuild', 'SKIP', 'not installed');
    const esbuild = mod.default ?? mod;
    const { default: fwEsbuild } = await import('../esbuild/index.js');

    // 1. Build + assert markers + sanity injection.
    const built = await esbuild.build({
        entryPoints: [FIXTURE], bundle: true, format: 'esm', write: false,
        plugins: [fwEsbuild({ preset: 'core', sanity: 'base' })],
    });
    const code = built.outputFiles[0].text;
    assertMarkers(code, 'esbuild');
    if (!code.includes(SANITY_TOKEN)) throw new Error('esbuild: sanity layer not injected');

    // 2. Build WITHOUT sanity and actually execute the bundle.
    const exec = await esbuild.build({
        entryPoints: [FIXTURE], bundle: true, format: 'esm', write: false,
        plugins: [fwEsbuild({ preset: 'core' })],
    });
    mkdirSync(TMP, { recursive: true });
    const outFile = resolve(TMP, 'esbuild-out.mjs');
    writeFileSync(outFile, exec.outputFiles[0].text, 'utf8');
    const { result } = await import(pathToFileURL(outFile).href);
    if (result.count !== CORE_MODULES.length) throw new Error(`esbuild: expected ${CORE_MODULES.length} modules, got ${result.count}`);
    if (!result.hasResolve) throw new Error('esbuild: runtime.resolve missing');
    record('esbuild', 'PASS', `built + ran (${result.count} modules, sanity ✓)`);
}

async function runRollup() {
    const mod = await tryImport('rollup');
    if (!mod) return record('rollup', 'SKIP', 'not installed');
    const nr = await tryImport('@rollup/plugin-node-resolve');
    if (!nr) return record('rollup', 'SKIP', '@rollup/plugin-node-resolve not installed');
    const { rollup } = mod;
    const nodeResolve = nr.nodeResolve ?? nr.default;
    const { default: fwRollup } = await import('../rollup/index.js');

    const bundle = await rollup({
        input: FIXTURE,
        plugins: [fwRollup({ preset: 'core', sanity: 'base' }), nodeResolve({ exportConditions: ['browser', 'import', 'default'] })],
        onwarn: () => {},
    });
    const { output } = await bundle.generate({ format: 'es' });
    await bundle.close();
    const code = output.map((o) => o.code || '').join('\n');
    assertMarkers(code, 'rollup');
    if (!code.includes(SANITY_TOKEN)) throw new Error('rollup: sanity layer not injected');
    record('rollup', 'PASS', 'built (markers + sanity ✓)');
}

/**
 * Run `fn` with webpack's internal deprecation warnings suppressed. Under bun,
 * constructing the webpack module namespace touches its back-compat lazy
 * getters (`JavascriptModulesPlugin`, `SingleEntryPlugin`, …), each wrapped in
 * `util.deprecate` — noise from webpack internals, unrelated to our plugin and
 * not emitted under Node. We drop ONLY `DEP_WEBPACK_*` codes ; every other
 * warning passes through untouched. Restored in `finally`.
 *
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function withoutWebpackDeprecations(fn) {
    const orig = process.emitWarning;
    process.emitWarning = function (warning, type, code, ...rest) {
        let t = type, c = code;
        if (type && typeof type === 'object') { t = type.type; c = type.code; }
        if (t === 'DeprecationWarning' && typeof c === 'string' && c.startsWith('DEP_WEBPACK_')) return undefined;
        return orig.call(process, warning, type, code, ...rest);
    };
    try { return await fn(); }
    finally { process.emitWarning = orig; }
}

async function runWebpack() {
    return withoutWebpackDeprecations(async () => {
        const mod = await tryImport('webpack');
        if (!mod) return record('webpack', 'SKIP', 'not installed');
        const webpack = mod.default ?? mod;
        const { FwWebpackPlugin } = await import('../webpack/index.js');

        mkdirSync(TMP, { recursive: true });
        const outDir = resolve(TMP, 'webpack');
        const code = await new Promise((res, rej) => {
            webpack({
                mode: 'development', target: 'web', entry: FIXTURE,
                output: { path: outDir, filename: 'bundle.js' },
                plugins: [new FwWebpackPlugin({ preset: 'core', sanity: 'base' })],
            }, (err, stats) => {
                if (err) return rej(err);
                if (stats.hasErrors()) return rej(new Error(stats.toString({ all: false, errors: true })));
                try { res(readFileSync(resolve(outDir, 'bundle.js'), 'utf8')); }
                catch (e) { rej(e); }
            });
        });
        assertMarkers(code, 'webpack');
        if (!code.includes(SANITY_TOKEN)) throw new Error('webpack: sanity layer not injected');
        record('webpack', 'PASS', 'built (markers + sanity ✓)');
    });
}

async function runVite() {
    const mod = await tryImport('vite');
    if (!mod) return record('vite', 'SKIP', 'not installed');
    const vite = mod;
    const { default: fwVite } = await import('../vite/index.js');

    // Minimal HTML app: index.html → app.js (imports the virtual preset).
    const root = resolve(TMP, 'vite');
    mkdirSync(root, { recursive: true });
    writeFileSync(resolve(root, 'app.js'), readFileSync(FIXTURE, 'utf8'), 'utf8');
    const rawHtml =
        '<!doctype html><html><head><title>e2e</title></head><body>' +
        '<div id="app"></div><script type="module" src="./app.js"></script></body></html>';
    writeFileSync(resolve(root, 'index.html'), rawHtml, 'utf8');

    // ── DEV (the dev-server regression) ──────────────────────────────────────
    // The plugin injects the sanity import as the first <head> module script.
    // Because the hook runs at `order: 'pre'`, Vite extracts that inline script
    // to an html-proxy module and RESOLVES its bare `@awacloud/fw/sanity/*` import.
    // A default-order hook (the bug this guards) would leave the bare specifier
    // verbatim in the served HTML → the browser throws "specifier was not
    // remapped". So: no bare `@awacloud/fw/sanity` may appear in the HTML, and the
    // injected proxy module must import the RESOLVED sanity layer.
    const server = await vite.createServer({
        root, logLevel: 'silent', configFile: false,
        server: { middlewareMode: true, hmr: false },
        plugins: [fwVite({ preset: 'core', sanity: 'base' })],
    });
    try {
        const devHtml = await server.transformIndexHtml('/index.html', rawHtml);
        if (/@awacloud\/fw\/sanity/.test(devHtml)) throw new Error('dev: bare "@awacloud/fw/sanity" specifier leaked into served HTML');
        const proxy = devHtml.match(/src="([^"]*html-proxy[^"]*)"/);
        if (!proxy) throw new Error('dev: sanity script not injected (no processed module)');
        const res = await server.transformRequest(proxy[1]);
        if (!res || !res.code.includes('sanity/base')) throw new Error('dev: injected script does not import the sanity layer');
        if (/@awacloud\/fw\/sanity/.test(res.code)) throw new Error('dev: sanity import left unresolved (still bare) in the proxy module');
    } finally {
        await server.close();
    }

    // ── BUILD ────────────────────────────────────────────────────────────────
    // The inline sanity script must be BUNDLED (no bare specifier in dist HTML),
    // alongside the virtual preset runtime. `minify: false` keeps the runtime
    // markers readable; the sanity layer is matched by the `not allowed` string
    // literal (BLOCKED_MESSAGE), which survives even when identifiers are mangled.
    const outDir = resolve(root, 'dist');
    await vite.build({
        root, logLevel: 'silent', configFile: false,
        build: { outDir, write: true, emptyOutDir: true, minify: false },
        plugins: [fwVite({ preset: 'core', sanity: 'base' })],
    });
    const html = readFileSync(resolve(outDir, 'index.html'), 'utf8');
    if (/@awacloud\/fw\/sanity/.test(html)) throw new Error('build: bare "@awacloud/fw/sanity" specifier survived into dist/index.html');
    const assetsDir = resolve(outDir, 'assets');
    const js = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(resolve(assetsDir, f), 'utf8')).join('\n');
    assertMarkers(js, 'vite');
    if (!js.includes('not allowed')) throw new Error('build: sanity layer not bundled');

    record('vite', 'PASS', 'dev (no bare specifier, sanity resolved) + build (bundled + markers) ✓');
}

async function runAstro() {
    // Structural : Astro builds on Vite, so we assert the integration produces
    // a working `@awacloud/fw` Vite plugin + the client-only sanity script. No astro
    // install needed (a full Astro build adds no guarantee on the fw logic).
    const { default: fwAstro } = await import('../astro/index.js');

    // ── base path ────────────────────────────────────────────────────────────
    const integ = fwAstro({ preset: 'core', sanity: 'base' });
    if (integ.name !== '@awacloud/fw') throw new Error('astro: wrong integration name');
    const setup = integ.hooks && integ.hooks['astro:config:setup'];
    if (typeof setup !== 'function') throw new Error('astro: missing astro:config:setup hook');

    const configs = [];
    const scripts = [];
    setup({ updateConfig: (c) => configs.push(c), injectScript: (stage, code) => scripts.push({ stage, code }) });

    const plugins = configs[0]?.vite?.plugins ?? [];
    const vitePlugin = plugins.find((p) => p && p.name === '@awacloud/fw');
    if (!vitePlugin) throw new Error('astro: Vite plugin not registered via updateConfig');

    // The re-injected Vite plugin must actually resolve + emit.
    const id = vitePlugin.resolveId('virtual:@awacloud/fw/preset/core');
    const code = vitePlugin.load(id);
    if (!code || !code.includes('ModuleRuntime')) throw new Error('astro: re-injected Vite plugin does not emit');

    // Sanity must be a client-only page script (NOT the Vite sanity option).
    const sanityScript = scripts.find((s) => s.stage === 'page' && s.code.includes('sanity/base'));
    if (!sanityScript) throw new Error('astro: client-only sanity script not injected (base)');

    // Under `base`, the dev toolbar must be disabled (frozen prototypes break it).
    const toolbarDisabled = configs.some((c) => c?.devToolbar?.enabled === false);
    if (!toolbarDisabled) throw new Error('astro: dev toolbar not disabled under sanity:base');

    // ── community path ───────────────────────────────────────────────────────
    // Under `community` the toolbar is safe — it must NOT be disabled.
    const integC = fwAstro({ preset: 'core', sanity: 'community' });
    const setupC = integC.hooks['astro:config:setup'];
    const configsC = [];
    const scriptsC = [];
    setupC({ updateConfig: (c) => configsC.push(c), injectScript: (stage, c) => scriptsC.push({ stage, code: c }) });

    const communityScript = scriptsC.find((s) => s.stage === 'page' && s.code.includes('sanity/community'));
    if (!communityScript) throw new Error('astro: client-only sanity/community script not injected');

    const toolbarDisabledC = configsC.some((c) => c?.devToolbar?.enabled === false);
    if (toolbarDisabledC) throw new Error('astro: dev toolbar must stay enabled under sanity:community');

    record('astro', 'PASS', 'structural (Vite plugin emits + base/community sanity + toolbar logic ✓)');
}

async function runNext() {
    // Structural : Next isn't installed (heavy). Assert `withFw` adds the
    // FwWebpackPlugin to Next's webpack config AND composes a pre-existing
    // webpack hook. The plugin itself is exercised by the webpack e2e.
    const { default: withFw } = await import('../nextjs/index.js');
    const { FwWebpackPlugin } = await import('../webpack/index.js');

    let userHookCalled = false;
    const baseConfig = {
        reactStrictMode: true,
        webpack(config) { userHookCalled = true; return config; },
    };
    const merged = withFw(baseConfig, { preset: 'core' });
    if (merged.reactStrictMode !== true) throw new Error('next: base config not preserved');
    if (typeof merged.webpack !== 'function') throw new Error('next: webpack hook not added');

    const cfg = { plugins: [] };
    const out = merged.webpack(cfg, { isServer: false, dev: true });
    const added = out.plugins.find((p) => p instanceof FwWebpackPlugin);
    if (!added) throw new Error('next: FwWebpackPlugin not added to webpack config');
    if (!userHookCalled) throw new Error('next: pre-existing webpack hook not composed');

    record('next', 'PASS', 'structural (plugin added + webpack hook composed)');
}

async function runNest() {
    // Structural : NestJS isn't installed (the integration doesn't import it).
    // Assert FwModule.forFeature exposes resolved pure modules as providers AND
    // the DOM guard rejects browser-only modules.
    const { FwModule } = await import('../nestjs/index.js');
    const { hex } = await import('@awacloud/fw/io/codec/hex.js');

    const mod = FwModule.forFeature([hex]);
    if (!mod || mod.module !== FwModule) throw new Error('nest: bad DynamicModule shape');
    const p = mod.providers.find((x) => x.provide === 'hex');
    if (!p) throw new Error('nest: hex provider missing');
    if (typeof p.useValue?.fromBytes !== 'function') throw new Error('nest: hex not resolved to its API');
    if (!mod.exports.includes('hex')) throw new Error('nest: hex not exported');

    // DOM guard.
    const { dom } = await import('@awacloud/fw/dom/query/dom.js');
    let guarded = false;
    try { FwModule.forFeature([dom]); } catch { guarded = true; }
    if (!guarded) throw new Error('nest: DOM guard did not reject a fw.dom.* module');

    record('nest', 'PASS', 'provider resolved + DOM guard ✓');
}

async function runBun() {
    if (typeof Bun === 'undefined') return record('bun', 'SKIP', 'not running under bun');
    const { default: fwBun } = await import('../bun/index.js');
    const built = await Bun.build({
        entrypoints: [FIXTURE],
        plugins: [fwBun({ preset: 'core' })],
    });
    if (!built.success) throw new Error('bun: build failed\n' + built.logs.join('\n'));
    const code = await built.outputs[0].text();
    assertMarkers(code, 'bun');
    record('bun', 'PASS', 'built (markers ✓)');
}

/**
 * Sanity tier assertion : verify that `sanity: 'lockdown'` emits an INVOKING
 * snippet (contains `lockdown()`) AND that `sanity: 'base'` ALSO emits an
 * invoking snippet (imports `applyBase` and calls `applyBase()`), never a
 * bare side-effect import. Both tiers are explicit-call ES modules after the
 * W0 conversion — a bare import of either is INERT (FINDINGS §a/§c.1,
 * `bare_import_of_esm_shape_is_INERT`); this assertion used to pin the
 * OPPOSITE (broken) behaviour for `base` and is now inverted to match the
 * fixed `core.sanityImportLine`. Uses the esbuild adapter (fastest, no disk
 * output needed) and the shared `core.sanityImportLine`.
 *
 * Falls back to SKIP when esbuild is not installed — the assertion is about
 * `core.sanityImportLine`, which is bundler-agnostic; esbuild is the vehicle.
 */
async function runLockdownSanity() {
    const { sanityImportLine } = await import('../_shared/core.js').then(async (m) => {
        // createFwCore loads the real config; we only need sanityImportLine logic.
        // Instantiate a minimal core to get the function.
        const core = m.createFwCore({ preset: 'core', packageName: '@awacloud/fw' });
        return core;
    });

    // 'lockdown' must emit an invoking snippet.
    const lockdownSnippet = sanityImportLine('lockdown');
    if (!lockdownSnippet.includes('lockdown()')) {
        throw new Error(`lockdown-sanity: invoking snippet missing 'lockdown()' call. Got: ${lockdownSnippet}`);
    }
    if (!lockdownSnippet.includes('@awacloud/fw/sanity/lockdown')) {
        throw new Error(`lockdown-sanity: snippet missing '@awacloud/fw/sanity/lockdown' import. Got: ${lockdownSnippet}`);
    }
    if (lockdownSnippet.includes("import '")) {
        throw new Error(`lockdown-sanity: 'lockdown' must NOT be a bare side-effect import. Got: ${lockdownSnippet}`);
    }

    // 'base' must now ALSO be an invoking snippet (imports + calls
    // `applyBase`), inverted from the pre-fix pin on a bare side-effect
    // import — a bare import of the explicit-call ESM shape is inert.
    const baseSnippet = sanityImportLine('base');
    if (baseSnippet.includes('lockdown()')) {
        throw new Error(`lockdown-sanity: 'base' snippet must not contain 'lockdown()'. Got: ${baseSnippet}`);
    }
    if (!baseSnippet.includes('applyBase')) {
        throw new Error(`lockdown-sanity: 'base' snippet missing 'applyBase' import. Got: ${baseSnippet}`);
    }
    if (!baseSnippet.includes('applyBase()')) {
        throw new Error(`lockdown-sanity: 'base' snippet missing 'applyBase()' call. Got: ${baseSnippet}`);
    }
    if (baseSnippet.startsWith("import '")) {
        throw new Error(`lockdown-sanity: 'base' must NOT be a bare side-effect import. Got: ${baseSnippet}`);
    }

    // 'false' must produce an empty string.
    const falseSnippet = sanityImportLine(false);
    if (falseSnippet !== '') {
        throw new Error(`lockdown-sanity: false must produce ''. Got: ${falseSnippet}`);
    }

    // Also verify an esbuild build with sanity:'lockdown' produces a bundle
    // containing 'lockdown()' text (end-to-end injection).
    const esbuildMod = await tryImport('esbuild');
    if (esbuildMod) {
        const esbuild = esbuildMod.default ?? esbuildMod;
        const { default: fwEsbuild } = await import('../esbuild/index.js');
        const built = await esbuild.build({
            entryPoints: [FIXTURE], bundle: true, format: 'esm', write: false,
            plugins: [fwEsbuild({ preset: 'core', sanity: 'lockdown' })],
        });
        const code = built.outputFiles[0].text;
        if (!code.includes('lockdown()')) throw new Error('lockdown-sanity(esbuild): built bundle missing "lockdown()" invocation');
        if (!code.includes('sanity/lockdown')) throw new Error('lockdown-sanity(esbuild): built bundle missing "sanity/lockdown" import');
        record('lockdown-sanity', 'PASS', 'snippet shape ✓ + esbuild e2e injection ✓');
    } else {
        record('lockdown-sanity', 'PASS', 'snippet shape ✓ (esbuild not installed, e2e injection skipped)');
    }
}

async function main() {
    console.log(`\n@awacloud/fw bundler e2e — runtime: ${typeof Bun !== 'undefined' ? 'bun' : 'node'}\n`);
    ensureLink();
    for (const run of [runEsbuild, runRollup, runWebpack, runVite, runAstro, runNext, runNest, runBun, runLockdownSanity]) {
        try { await run(); }
        catch (e) { record(run.name.replace(/^run/, '').toLowerCase(), 'FAIL', e.message.split('\n')[0]); }
    }
    try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }

    const failed = results.filter((r) => r.status === 'FAIL');
    const passed = results.filter((r) => r.status === 'PASS');
    console.log(`\n${passed.length} passed, ${results.filter((r) => r.status === 'SKIP').length} skipped, ${failed.length} failed\n`);
    if (failed.length) process.exit(1);
}

main();
