// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Real-browser smoke of every `demos/` and `playground/` page,
 * in Chromium and Firefox.
 *
 *   node e2e/run.mjs [clean|sentinel] [--out <report.json>]
 *
 * A page passes when it reaches readiness (`data-ready="1"` on `<html>` for
 * an entry page, `load` for a static index page) with zero console errors,
 * zero page errors, zero failed requests and no HTTP status >= 400.
 *
 * - `clean` (default): exit 0 when every page passes in both engines, 1
 *   otherwise.
 * - `sentinel`: serves a throwing `main.js` for one demo and one playground
 *   page, and one demo page without its readiness line (the server's
 *   overrides seam, nothing on disk changes), and exits 0 only when exactly
 *   those pages fail, in both engines: a gate not shown able to redden proves
 *   nothing.
 * - Exit 2 is INCONCLUSIVE: the port is taken or a browser is not installed.
 *   It is never a pass and never a page failure.
 *
 * Run it with Node (`node e2e/run.mjs`, or `bun run test:e2e`, which spawns
 * Node through the script), never with Playwright under Bun. Browsers come
 * from the main checkout's `third_party/ms-playwright` through the repo's one
 * resolver (`tests/e2e/browsers-path.mjs`). Nothing here is a `*.test.*`
 * file, so `bun test` never discovers it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBrowsersPath } from '../../../../../tests/e2e/browsers-path.mjs';
import { discoverPages, PKG_URL } from './pages.mjs';
import { startServer } from './server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const REPO = join(PKG, '..', '..', '..', '..');
const PORT = 4821;
const READY_TIMEOUT_MS = 15_000;

const argv = process.argv.slice(2);
const mode = argv.find((a) => a === 'clean' || a === 'sentinel') || 'clean';
const outIdx = argv.indexOf('--out');
const outFile = outIdx >= 0 ? argv[outIdx + 1] : null;

/** The faults the sentinel injects: page URL → the module served in its place. */
const SENTINEL = new Map([
    [`${PKG_URL}/demos/clock/index.html`, `${PKG_URL}/demos/clock/main.js`],
    [`${PKG_URL}/playground/easing-lab/index.html`, `${PKG_URL}/playground/easing-lab/main.js`],
]);
const FAULT = "throw new Error('e2e sentinel: injected fault');\nexport function run() {}\n";

/** @param {number} code @param {string} why */
function inconclusive(code, why) {
    console.error(`INCONCLUSIVE: ${why}`);
    process.exit(code);
}

applyBrowsersPath(process.env);
const { chromium, firefox } = await import('@playwright/test');

/** A page served without its readiness line: it must time out. */
const NEVER_READY = `${PKG_URL}/demos/scene/index.html`;

const overrides = new Map();
if (mode === 'sentinel') {
    for (const moduleUrl of SENTINEL.values()) overrides.set(moduleUrl, FAULT);
    const html = readFileSync(join(REPO, NEVER_READY), 'utf8');
    const stripped = html.replace(/^.*setAttribute\('data-ready', '1'\).*\n/m, '');
    if (stripped === html) throw new Error(`sentinel: no readiness line to strip in ${NEVER_READY}`);
    overrides.set(NEVER_READY, stripped);
}

let server;
try {
    server = await startServer({ root: REPO, port: PORT, overrides });
} catch (e) {
    inconclusive(2, `cannot listen on 127.0.0.1:${PORT} (${e.code || e.message})`);
}

const pages = discoverPages(PKG);
const report = { mode, pages: pages.length, engines: {} };

/**
 * Load one page and collect every problem it shows.
 * @param {import('@playwright/test').Browser} browser
 * @param {{ url: string, ready: boolean }} page
 * @returns {Promise<string[]>}
 */
async function check(browser, { url, ready }) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const problems = [];
    /** @type {(reason: string) => void} */
    let failNow = () => {};
    const failed = new Promise((r) => { failNow = r; });
    const note = (msg) => { problems.push(msg); failNow(msg); };
    p.on('console', (m) => { if (m.type() === 'error') note(`console: ${m.text()}`); });
    p.on('pageerror', (e) => note(`pageerror: ${e.message}`));
    p.on('requestfailed', (r) => note(`requestfailed: ${r.url()}`));
    p.on('response', (r) => { if (r.status() >= 400) note(`http ${r.status()}: ${r.url()}`); });
    try {
        await p.goto(server.url + url, { waitUntil: 'load' });
        if (ready) {
            const reached = p.waitForSelector('html[data-ready="1"]', { state: 'attached', timeout: READY_TIMEOUT_MS })
                .then(() => null, () => `readiness: no data-ready within ${READY_TIMEOUT_MS} ms`);
            const why = await Promise.race([reached, failed.then(() => null)]);
            if (why) problems.push(why);
        }
    } catch (e) {
        problems.push(`navigation: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
    return problems;
}

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
    let browser;
    try {
        browser = await engine.launch();
    } catch (e) {
        await server.close();
        inconclusive(2, `${name} is not installed (${e.message.split('\n')[0]}); run tests/e2e/provision.mjs`);
    }
    const results = {};
    for (const page of pages) results[page.url] = await check(browser, page);
    await browser.close();
    report.engines[name] = results;
}
await server.close();

const failing = Object.fromEntries(Object.entries(report.engines).map(([name, results]) => [
    name, Object.entries(results).filter(([, problems]) => problems.length).map(([url]) => url).sort(),
]));
report.failing = failing;

let ok;
if (mode === 'clean') {
    ok = Object.values(failing).every((list) => list.length === 0);
} else {
    const expected = [...SENTINEL.keys(), NEVER_READY].sort();
    ok = Object.values(failing).every((list) => JSON.stringify(list) === JSON.stringify(expected));
    report.sentinelExpected = expected;
}
report.verdict = ok ? 'pass' : 'fail';
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ mode, pages: pages.length, failing, verdict: report.verdict }, null, 1));
for (const [name, results] of Object.entries(report.engines)) {
    for (const [url, problems] of Object.entries(results)) {
        for (const pr of problems) console.log(`  ${name} ${url}: ${pr}`);
    }
}
process.exit(ok ? 0 : 1);
