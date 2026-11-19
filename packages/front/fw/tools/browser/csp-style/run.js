// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview CSP style leg (headless Chromium). Serves the fw package under
 * the policy of tools/local-ui-kit (style-src 'self', no unsafe-inline, no
 * nonce) and proves that, with styleSheet.mode('adopted'), a component's scoped
 * CSS and the themeTokens variables apply with no violation, while the default
 * 'element' mode is refused (negative control).
 *
 *   node tools/browser/csp-style/run.js     (from packages/front/fw)
 *
 * One JSON line on stdout. Exit 0 expectations hold, 1 they do not, 3 Chromium
 * cannot be launched. Env FW_CSP_STYLE_POLICY overrides the policy (used by
 * hand for the sensitivity check; the default is the reproduced policy).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FW_ROOT = path.resolve(HERE, '../../..');
const POLICY = process.env.FW_CSP_STYLE_POLICY
    || "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'";
const PAGE = '/tools/browser/csp-style/_fixtures/index.html';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream',
};

function startServer() {
    const server = http.createServer((req, res) => {
        const base = { 'content-security-policy': POLICY };
        let urlPath;
        try {
            urlPath = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
        } catch {
            res.writeHead(400, base).end();
            return;
        }
        const file = path.join(FW_ROOT, urlPath);
        if (file !== FW_ROOT && !file.startsWith(FW_ROOT + path.sep)) {
            res.writeHead(403, base).end();
            return;
        }
        fs.stat(file, (err, st) => {
            if (err || !st.isFile()) {
                res.writeHead(404, { ...base, 'content-type': 'text/plain; charset=utf-8' }).end('not found');
                return;
            }
            res.writeHead(200, { ...base, 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * The expectations table of the plan.
 * @param {any} a - the `adopted` result.
 * @param {any} e - the `element` result (negative control).
 * @returns {boolean}
 */
function check(a, e) {
    if (!a || a.error || !e || e.error) return false;
    return a.color === 'rgb(1, 2, 3)'
        && a.token === 'rgb(4, 5, 6)'
        && a.styleElements === 0
        && a.adopted >= 2
        && Array.isArray(a.violations) && a.violations.length === 0
        && e.color !== 'rgb(1, 2, 3)'
        && e.token !== 'rgb(4, 5, 6)'
        && e.styleElements >= 1
        && e.adopted === 0
        && Array.isArray(e.violations) && e.violations.some((v) => String(v).startsWith('style-src'));
}

async function main() {
    const server = await startServer();
    let browser;
    try {
        const { applyBrowsersPath } = await import(pathToFileURL(path.join(FW_ROOT, 'integrations/_e2e/browsers-path.mjs')).href);
        applyBrowsersPath();
        try {
            const { chromium } = await import('playwright');
            browser = await chromium.launch({ headless: true });
        } catch (err) {
            const msg = err && err.message ? String(err.message).split('\n')[0] : String(err);
            process.stderr.write('csp-style: cannot launch Chromium (' + msg + '); provision with: bun run e2e:preview:install\n');
            return 3;
        }
        const origin = 'http://127.0.0.1:' + server.address().port;
        const out = { adopted: null, element: null, pageErrors: { adopted: [], element: [] } };
        for (const mode of ['adopted', 'element']) {
            const page = await browser.newPage();
            try {
                page.on('pageerror', (err) => out.pageErrors[mode].push(String(err)));
                page.on('console', (m) => {
                    // 'element' mode: the refused inline style logs a console error, expected and ignored.
                    if (m.type() === 'error' && mode === 'adopted') out.pageErrors[mode].push('console: ' + m.text());
                });
                await page.goto(origin + PAGE + '?mode=' + mode);
                // Selector-based: a page-side string/function evaluation would itself be refused by the CSP.
                await page.waitForSelector('html[data-done="1"]', { state: 'attached', timeout: 30000 });
                out[mode] = JSON.parse(await page.getAttribute('html', 'data-result'));
            } finally {
                await page.close();
            }
        }
        process.stdout.write(JSON.stringify(out) + '\n');
        const noPageErrors = out.pageErrors.adopted.length === 0
            && out.pageErrors.element.every((m) => m.startsWith('console: '));
        return check(out.adopted, out.element) && noPageErrors ? 0 : 1;
    } finally {
        if (browser) await browser.close();
        server.close();
    }
}

main().then(
    (code) => { process.exitCode = code; },
    (err) => { process.stderr.write('csp-style: ' + (err && err.stack || err) + '\n'); process.exitCode = 1; },
);
