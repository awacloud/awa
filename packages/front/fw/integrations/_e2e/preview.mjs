// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/preview.mjs
/**
 * @fileoverview Headless preview gate for the `playground/` catalogue.
 *
 * What it gates: every playground that has a BROWSER SURFACE is launched the way
 * a developer launches it, opened in headless Chromium, and every console
 * message and uncaught in-page exception is captured. `run.mjs` and
 * `playgrounds.mjs` assert exit codes, stdout markers and artifacts — they
 * observe nothing that happens INSIDE a page (`grep -rn "pageerror"` over this
 * directory returned no hit before this file existed). That is the gap.
 *
 * HOST RUNTIME: **Node, never Bun** (`services/acvp` hard constraint C5 — a
 * Chromium driver stalls on `--remote-debugging-pipe` under Bun). The two
 * `*.test.js` files next to this one are the only pieces that run under
 * `bun test`, and they never import playwright.
 *
 * Playwright is loaded ONLY through a dynamic `import('playwright')` inside a
 * try/catch: when it is absent, every browser leg SKIPs with a provisioning
 * reason and the run exits 0 — a contributor who never provisioned a browser is
 * not blocked by an unrelated package's gate, and the honest-skip totals make
 * "green" and "green because it skipped everything" distinguishable at a glance.
 *
 *   node integrations/_e2e/preview.mjs [leg …] [--headed] [--list]
 *
 * Exit codes: 2 = config error (drift gate, invalid allowlist, unknown leg —
 * all detected BEFORE any browser work) · 1 = `fail > 0 || inconclusive > 0`, or
 * a dead allowlist entry on a full run · 0 = otherwise.
 *
 * The contract this file implements is frozen at
 * `ai/plans/fw-playground/spikes/w0-preview-harness/FINDINGS.md` §1–§5. No code
 * is imported from that directory: the spike is a throwaway prototype.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyBrowsersPath, repoRoot } from './browsers-path.mjs';
import { startStaticServer } from './preview-static-server.mjs';
import {
    EXAMPLES_JSON_REL,
    RECIPES,
    SENTINEL_NAME,
    TIMING,
    WAIT_UNTIL,
    catalogueNames,
    checkCoverage,
    defaultLegs,
} from './playground-recipes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, 'artifacts');
const HOST = '127.0.0.1';

/**
 * Artifact schema id. Supersedes the spike's `w0-preview-harness/1`; the bump
 * carries two contract changes — `consoleAll` promoted into the per-leg contract
 * (the astro-dev leg's ENTIRE console output is two `debug` messages, which the
 * error/warning partition alone would drop), and per-run timestamped files so
 * evidence survives a re-run.
 */
const SCHEMA = 'fw-preview-gate/1';

const NO_PLAYWRIGHT_REASON = 'playwright not provisioned — bun install + bun run e2e:preview:install';
const FW_DIST_SENTRY = 'packages/front/fw/dist/build/sanity.min.js';
const SENTINEL_MARKER = 'W1-SENTINEL';

const EXIT_OK = 0;
const EXIT_RED = 1;
const EXIT_CONFIG = 2;

// ── CLI ──────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @returns {{legs: string[], headed: boolean, list: boolean, bad: string[]}}
 */
export function parseArgs(argv) {
    const legs = [];
    const bad = [];
    let headed = false;
    let list = false;
    for (const arg of argv) {
        if (arg === '--headed') headed = true;
        else if (arg === '--list') list = true;
        else if (arg.startsWith('-')) bad.push(arg);
        else legs.push(arg);
    }
    return { legs, headed, list, bad };
}

// ── small helpers ────────────────────────────────────────────────────────────

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Bind the port to prove it is free, then release it. Availability is CHECKED,
 * never assumed: a busy port yields INCONCLUSIVE with a reason, never a
 * misattributed FAIL.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
    return new Promise((done) => {
        const probe = createNetServer();
        probe.once('error', () => done(false));
        probe.once('listening', () => probe.close(() => done(true)));
        probe.listen(port, HOST);
    });
}

/**
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true once the socket is released
 */
async function waitPortFree(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await isPortFree(port)) return true;
        if (Date.now() >= deadline) return false;
        await sleep(TIMING.pollIntervalMs);
    }
}

/**
 * One HTTP probe of the entry URL. ANY status counts as "answering" — a startup
 * banner is locale- and version-dependent, so stdout matching is banned here.
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function httpAnswers(url, timeoutMs) {
    return new Promise((done) => {
        const req = httpGet(url, { timeout: timeoutMs }, (res) => {
            res.resume();
            done(true);
        });
        req.once('error', () => done(false));
        req.once('timeout', () => {
            req.destroy();
            done(false);
        });
    });
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @param {() => string|null} [abortReason] short-circuits when the server died
 * @returns {Promise<number>} ready time in ms, or -1 when readiness was never reached
 */
async function waitReady(url, timeoutMs, abortReason = () => null) {
    const t0 = Date.now();
    const deadline = t0 + timeoutMs;
    for (;;) {
        if (await httpAnswers(url, Math.max(1000, TIMING.pollIntervalMs * 4))) return Date.now() - t0;
        if (abortReason()) return -1;
        if (Date.now() >= deadline) return -1;
        await sleep(TIMING.pollIntervalMs);
    }
}

/**
 * Teardown: kill by PID, TREE (vite forks workers), then verify the port. A kill
 * that "succeeded" while the socket stays bound is exactly the failure a later
 * leg would inherit. `taskkill /IM <image>` is BANNED — it kills unrelated
 * processes machine-wide.
 *
 * @param {number} pid
 * @returns {string} what was done, for the report
 */
function killTree(pid) {
    if (process.platform === 'win32') {
        const done = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
        return `taskkill /PID ${pid} /T /F -> ${done.status}`;
    }
    try {
        process.kill(pid, 'SIGTERM');
        return `SIGTERM ${pid}`;
    } catch (err) {
        return `SIGTERM ${pid} -> ${err.code ?? 'ERR'}`;
    }
}

// ── git hygiene (build-bearing legs) ─────────────────────────────────────────

/**
 * @param {string} root
 * @param {string} dirRel
 * @returns {{code: string, path: string}[]}
 */
function gitStatus(root, dirRel) {
    const done = spawnSync('git', ['status', '--porcelain', '--', dirRel], { cwd: root, encoding: 'utf8' });
    if (done.status !== 0) return [];
    return (done.stdout ?? '')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => ({ code: line.slice(0, 2), path: line.slice(3).trim() }));
}

/**
 * `next build` rewrites the TRACKED `next-env.d.ts` on every run. Restore only
 * files that were clean before the leg and are modified now — scoped to those
 * exact paths, never a broad checkout in a shared worktree.
 *
 * @param {string} root
 * @param {string} dirRel
 * @param {Set<string>} dirtyBefore
 * @returns {string[]} paths restored
 */
function restoreTrackedChurn(root, dirRel, dirtyBefore) {
    const after = gitStatus(root, dirRel).filter((e) => !e.code.includes('?') && e.code.includes('M'));
    const churn = after.map((e) => e.path).filter((p) => !dirtyBefore.has(p));
    if (churn.length === 0) return [];
    spawnSync('git', ['checkout', '--', ...churn], { cwd: root, encoding: 'utf8' });
    return churn;
}

// ── leg execution ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LegResult per FINDINGS §5 — contract fields first, in order.
 */

/**
 * @param {import('./playground-recipes.mjs').Recipe} recipe
 * @returns {object} contract-shaped skeleton
 */
function blankResult(recipe) {
    return {
        name: recipe.name,
        type: recipe.type,
        url: null,
        status: 'SKIP',
        consoleErrors: [],
        consoleWarnings: [],
        pageErrors: [],
        consoleAll: [],
        screenshot: null,
        durationMs: 0,
        launch: { cmd: '', port: recipe.port ?? null, readyMs: -1 },
    };
}

/**
 * Build the sentinel's in-memory page: a COPY of the real entry with an injected
 * `throw`, served at the SAME URL via the static server's `overrides` map, and
 * also written to repo-root `tmp/` as inspectable evidence. The original is
 * never edited.
 *
 * @param {string} root
 * @param {import('./playground-recipes.mjs').Recipe} recipe
 * @returns {Record<string, {body: string, contentType: string}>}
 */
function sentinelOverrides(root, recipe) {
    const source = join(root, recipe.docroot, recipe.entryPath.replace(/^\//, ''));
    const original = readFileSync(source, 'utf8');
    const injected = `  <!-- W1 SENTINEL (injected copy, never in the original) -->\n  <script>throw new Error("${SENTINEL_MARKER}")</script>\n`;
    const body = original.includes('</body>')
        ? original.replace('</body>', `${injected}</body>`)
        : `${original}\n${injected}`;
    const outDir = join(root, 'tmp', 'w1-sentinel');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), body, 'utf8');
    return { [recipe.entryPath]: { body, contentType: 'text/html; charset=utf-8' } };
}

/**
 * Run one leg end to end: guards → build → bring-up → capture → teardown.
 *
 * @param {object} ctx
 * @param {import('./playground-recipes.mjs').Recipe} recipe
 * @returns {Promise<object>} the leg result
 */
async function runLeg(ctx, recipe) {
    const { root, browser, headed } = ctx;
    const t0 = Date.now();
    const result = blankResult(recipe);
    /** @param {string} status @param {string} reason */
    const finish = (status, reason) => {
        result.status = status;
        if (reason) result.note = reason;
        result.durationMs = Date.now() - t0;
        return result;
    };

    // 1. Deliberate skip (the runtime bucket) — never silently omitted.
    if (recipe.skip) return finish('SKIP', recipe.skip);

    // 2. Provisioning guards, cheapest first.
    if (!browser) {
        return ctx.launchError
            ? finish('INCONCLUSIVE', `chromium.launch() failed — ${ctx.launchError}`)
            : finish('SKIP', NO_PLAYWRIGHT_REASON);
    }
    const cwdAbs = recipe.cwd ? join(root, recipe.cwd) : root;
    if (recipe.needsInstall && !existsSync(join(cwdAbs, 'node_modules'))) {
        return finish('SKIP', `playground not installed — bun install in ${recipe.cwd}`);
    }
    if (recipe.requiresFwDist && !existsSync(join(root, FW_DIST_SENTRY))) {
        // dist/ is gitignored: a per-checkout fact, not repo state. Absent ⇒ SKIP,
        // never FAIL — a 404 here is not a playground defect (FINDINGS §2.1).
        return finish('SKIP', `${FW_DIST_SENTRY} absent (gitignored build output) — run the fw build to enable`);
    }

    // 3. Port availability — checked by BINDING it, not assumed.
    if (recipe.port && !(await isPortFree(recipe.port))) {
        return finish('INCONCLUSIVE', `port ${recipe.port} is busy`);
    }

    // 4. Build steps, with git-churn snapshot/restore around them.
    const dirtyBefore = new Set(recipe.build && recipe.cwd ? gitStatus(root, recipe.cwd).map((e) => e.path) : []);
    let buildMs = 0;
    for (const step of recipe.build ?? []) {
        const script = step.binRel ? join(cwdAbs, 'node_modules', step.binRel) : join(cwdAbs, step.scriptRel);
        if (!existsSync(script)) {
            return finish('INCONCLUSIVE', `build driver missing: ${step.binRel ?? step.scriptRel}`);
        }
        const b0 = Date.now();
        const done = spawnSync(process.execPath, [script, ...step.args], {
            cwd: cwdAbs,
            env: { ...process.env, FORCE_COLOR: '0', CI: '1', ...(recipe.env ?? {}) },
            timeout: TIMING.buildTimeoutMs,
            encoding: 'utf8',
        });
        buildMs += Date.now() - b0;
        if (done.status !== 0) {
            const tail = `${done.stdout ?? ''}${done.stderr ?? ''}`.trim().split('\n').slice(-4).join(' | ');
            if (recipe.cwd) result.gitRestored = restoreTrackedChurn(root, recipe.cwd, dirtyBefore);
            result.launch.buildMs = buildMs;
            return finish('INCONCLUSIVE', `build failed (exit ${done.status}) — ${tail}`);
        }
    }
    if (buildMs > 0) result.launch.buildMs = buildMs;

    // 5. Bring-up.
    let staticHandle = null;
    let child = null;
    let childExit = null;
    const serverLog = [];
    let origin;

    if (recipe.serve) {
        const bin = join(cwdAbs, 'node_modules', recipe.serve.binRel);
        if (!existsSync(bin)) {
            return finish('INCONCLUSIVE', `server bin missing: ${recipe.serve.binRel}`);
        }
        // Spawn the package's bin JS with process.execPath — NEVER a .bin/.cmd
        // shim and never `bun run`: the PID held here must BE the server, or
        // teardown is not deterministic.
        result.launch.cmd = `node node_modules/${recipe.serve.binRel} ${recipe.serve.args.join(' ')}`;
        child = spawn(process.execPath, [bin, ...recipe.serve.args], {
            cwd: cwdAbs,
            env: { ...process.env, FORCE_COLOR: '0', CI: '1', ...(recipe.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        result.launch.pid = child.pid;
        child.stdout.on('data', (d) => serverLog.push(String(d)));
        child.stderr.on('data', (d) => serverLog.push(String(d)));
        child.once('exit', (code, signal) => {
            childExit = `server exited early (code ${code}, signal ${signal})`;
        });
        origin = `http://localhost:${recipe.port}`;
    } else {
        const overrides = recipe.name === SENTINEL_NAME ? sentinelOverrides(root, recipe) : {};
        result.launch.cmd = `node:http static server (in-process) root=${recipe.docroot}`;
        try {
            staticHandle = await startStaticServer({
                root: join(root, recipe.docroot),
                port: recipe.port,
                host: HOST,
                overrides,
            });
        } catch (err) {
            return finish('INCONCLUSIVE', `static server bring-up failed — ${err.message}`);
        }
        origin = staticHandle.origin;
    }

    const url = `${origin}${recipe.entryPath}`;
    const readyTimeout = recipe.serve ? TIMING.readyTimeoutServerMs : TIMING.readyTimeoutStaticMs;
    const readyMs = await waitReady(url, readyTimeout, () => childExit);
    result.launch.readyMs = readyMs;

    /** @param {string} status @param {string} reason */
    const teardownAndFinish = async (status, reason) => {
        const notes = [];
        if (child?.pid) notes.push(killTree(child.pid));
        if (staticHandle) await staticHandle.close();
        if (recipe.port) notes.push((await waitPortFree(recipe.port, TIMING.portFreeTimeoutMs)) ? 'port free' : `port ${recipe.port} STILL BOUND`);
        result.teardown = notes.join('; ');
        if (serverLog.length > 0) {
            try {
                writeFileSync(join(ARTIFACTS, `${recipe.name}.server.log`), serverLog.join(''), 'utf8');
            } catch {
                /* best effort — diagnostics only */
            }
        }
        if (recipe.build && recipe.cwd) result.gitRestored = restoreTrackedChurn(root, recipe.cwd, dirtyBefore);
        return finish(status, reason);
    };

    if (readyMs < 0) {
        const tail = serverLog.join('').trim().split('\n').slice(-4).join(' | ');
        return teardownAndFinish('INCONCLUSIVE', `${childExit ?? `not ready within ${readyTimeout} ms`}${tail ? ` — ${tail}` : ''}`);
    }

    // 6. Capture — listeners attached BEFORE goto, on a page created fresh for
    //    this leg, so nothing is lost to a race and nothing leaks between legs.
    result.url = url;
    const page = await browser.newPage();
    page.on('console', (msg) => {
        const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
        result.consoleAll.push(entry);
        if (entry.type === 'error') result.consoleErrors.push(entry);
        else if (entry.type === 'warning' || entry.type === 'warn') result.consoleWarnings.push(entry);
        if (headed) console.log(`   · console.${entry.type}: ${entry.text}`);
    });
    page.on('pageerror', (err) => {
        const entry = { message: err.message, stack: err.stack };
        result.pageErrors.push(entry);
        if (headed) console.log(`   · pageerror: ${entry.message}`);
    });

    let navError = null;
    try {
        await page.goto(url, { waitUntil: WAIT_UNTIL, timeout: TIMING.gotoTimeoutMs });
        await sleep(TIMING.settleMs);
    } catch (err) {
        navError = err.message;
    }

    if (headed && !navError) {
        console.log(`\n   ${recipe.name} is open at ${url} — drive it, then press Ctrl-C to write the report.\n`);
        await new Promise((done) => process.once('SIGINT', done));
    }

    try {
        const shot = join(ARTIFACTS, `${recipe.name}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        result.screenshot = `artifacts/${recipe.name}.png`;
    } catch {
        // Taken even on failure, inside a try: an unrenderable page must not mask
        // the real result.
    }
    await page.close().catch(() => {});

    // 7. Status rule (FINDINGS §3, zero-tolerance). The allowlist is applied
    //    afterwards, as a reporting-side transform.
    if (navError) {
        result.navError = navError;
        return teardownAndFinish('INCONCLUSIVE', `navigation threw — ${navError}`);
    }
    const failing = result.consoleErrors.length + result.pageErrors.length;
    return teardownAndFinish(failing > 0 ? 'FAIL' : 'PASS', '');
}

// ── main ─────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} results
 * @returns {{total: number, pass: number, fail: number, skip: number, inconclusive: number}}
 */
function tally(results) {
    const count = (s) => results.filter((r) => r.status === s).length;
    return {
        total: results.length,
        pass: count('PASS'),
        fail: count('FAIL'),
        skip: count('SKIP'),
        inconclusive: count('INCONCLUSIVE'),
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.bad.length > 0) {
        console.error(`[preview] unknown flag(s): ${args.bad.join(', ')}`);
        console.error('[preview] usage: node integrations/_e2e/preview.mjs [leg …] [--headed] [--list]');
        return EXIT_CONFIG;
    }

    const root = repoRoot();

    // Drift gate — BEFORE any browser work, exit 2 on any gap.
    const catalogue = catalogueNames(JSON.parse(readFileSync(resolve(HERE, EXAMPLES_JSON_REL), 'utf8')));
    const drift = checkCoverage(catalogue, RECIPES);
    if (drift.missingRecipes.length > 0 || drift.unknownRecipes.length > 0) {
        console.error('[preview] DRIFT between playground/examples.json and playground-recipes.mjs:');
        if (drift.missingRecipes.length > 0) console.error(`  catalogue entries with no recipe: ${drift.missingRecipes.join(', ')}`);
        if (drift.unknownRecipes.length > 0) console.error(`  recipes naming an unknown entry: ${drift.unknownRecipes.join(', ')}`);
        return EXIT_CONFIG;
    }

    // Allowlist — loaded dynamically so its LOAD-TIME validation maps to exit 2.
    let ALLOWLIST;
    let applyAllowlist;
    try {
        const mod = await import('./preview-allowlist.mjs');
        mod.validateAllowlist(mod.ALLOWLIST);
        ALLOWLIST = mod.ALLOWLIST;
        applyAllowlist = mod.applyAllowlist;
    } catch (err) {
        console.error(`[preview] invalid allowlist — ${err.message}`);
        return EXIT_CONFIG;
    }

    if (args.list) {
        console.log('\nleg                   type        port  note');
        console.log('-'.repeat(78));
        for (const r of RECIPES) {
            const note = r.skip ?? (r.name === SENTINEL_NAME ? 'falsification leg — runs only when named' : '');
            console.log(`${r.name.padEnd(21)} ${r.type.padEnd(11)} ${String(r.port ?? '—').padEnd(5)} ${note}`);
        }
        console.log(`\n${RECIPES.length} recipes · ${defaultLegs().length} in the default run · ${catalogue.length} catalogue entries\n`);
        return EXIT_OK;
    }

    const fullRun = args.legs.length === 0;
    let selected;
    if (fullRun) {
        selected = defaultLegs();
    } else {
        selected = [];
        for (const name of args.legs) {
            const recipe = RECIPES.find((r) => r.name === name);
            if (!recipe) {
                console.error(`[preview] unknown leg: ${name} (see --list)`);
                return EXIT_CONFIG;
            }
            selected.push(recipe);
        }
    }

    mkdirSync(ARTIFACTS, { recursive: true });

    // One in-repo browser location for BOTH `playwright install` and
    // chromium.launch() (FINDINGS §4.3 amendment) — applied BEFORE the import.
    const browsersPath = applyBrowsersPath();

    let chromium = null;
    let importError = null;
    try {
        ({ chromium } = await import('playwright'));
    } catch (err) {
        importError = err.message;
    }

    let browser = null;
    let launchError = null;
    let browserVersion = null;
    if (chromium) {
        try {
            browser = await chromium.launch({ headless: !args.headed });
            browserVersion = browser.version();
        } catch (err) {
            launchError = err.message;
        }
    }

    console.log(`\n@awacloud/fw preview gate — ${selected.length} leg(s)${args.headed ? ' (headed)' : ''}`);
    console.log(`  browsers: ${browsersPath}`);
    console.log(`  chromium: ${browserVersion ?? (importError ? `absent (${NO_PLAYWRIGHT_REASON})` : `launch failed — ${launchError}`)}\n`);

    const ctx = { root, browser, headed: args.headed, launchError };
    const results = [];
    for (const recipe of selected) {
        const result = await runLeg(ctx, recipe);
        results.push(result);
        const counts = `${result.consoleAll.length}/${result.consoleErrors.length}/${result.consoleWarnings.length} console · ${result.pageErrors.length} pageerror`;
        console.log(`${result.status.padEnd(12)} ${result.name.padEnd(21)} ${result.durationMs} ms · ${counts}${result.note ? ` · ${result.note}` : ''}`);
    }
    if (browser) await browser.close().catch(() => {});

    const allow = applyAllowlist(ALLOWLIST, results, { fullRun });
    const totals = tally(results);

    const generatedAt = new Date().toISOString();
    const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const report = {
        schema: SCHEMA,
        generatedAt,
        host: { platform: process.platform, node: process.version, browser: browserVersion, headed: args.headed },
        allowlist: ALLOWLIST,
        totals,
        results,
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(join(ARTIFACTS, `report-${stamp}.json`), json, 'utf8');
    writeFileSync(join(ARTIFACTS, 'report.json'), json, 'utf8');

    console.log(`\n${JSON.stringify(totals)}`);
    if (allow.suppressed > 0) console.log(`allowlisted: ${allow.suppressed} message(s); downgraded legs: ${allow.downgraded.join(', ') || 'none'}`);
    for (const entry of allow.dead) {
        console.log(`DEAD allowlist entry (matched nothing): ${entry.playground} :: ${entry.pattern} — ${entry.reason}`);
    }
    console.log(`report: integrations/_e2e/artifacts/report-${stamp}.json (and report.json)\n`);

    if (allow.deadFailsRun) return EXIT_RED;
    return totals.fail > 0 || totals.inconclusive > 0 ? EXIT_RED : EXIT_OK;
}

process.exitCode = await main();
