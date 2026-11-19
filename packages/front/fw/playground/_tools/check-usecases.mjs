// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Chromium check of the playground use cases.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=<cache> node playground/_tools/check-usecases.mjs [name…] [--out <dir>]
 *
 * Serves the fw package root on 127.0.0.1 (the use cases import fw's sources
 * through an import map), opens each page and drives it through the Chrome
 * DevTools Protocol only: every page applies lockdown(), which blocks
 * Playwright's injected scripts. A page fails on a missing expected text, a
 * pageerror or a console error. Exit 0 when all pass.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FW = path.resolve(HERE, '../..');
const PORT = 4830;
const BASE = `http://127.0.0.1:${PORT}/playground/usecases/`;
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.join(FW, 'playground', 'usecases', '.report');
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const { chromium } = createRequire(path.join(FW, 'package.json'))('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function docText(cdp) {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: root.nodeId });
    return outerHTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}
async function expectText(cdp, needles, label) {
    let text = '';
    for (let i = 0; i < 60; i++) {
        text = await docText(cdp);
        if (needles.every((n) => text.includes(n))) return text;
        await sleep(250);
    }
    throw new Error(`${label}: missing ${JSON.stringify(needles.filter((n) => !text.includes(n)))} in: ${text.slice(0, 500)}`);
}
async function click(cdp, selector) {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error('no element for ' + selector);
    await cdp.send('DOM.scrollIntoViewIfNeeded', { nodeId });
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
    const q = model.content;
    const x = (q[0] + q[4]) / 2, y = (q[1] + q[5]) / 2;
    for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await sleep(200);
}
async function typeInto(cdp, selector, text) {
    await click(cdp, selector);
    await cdp.send('Input.insertText', { text });
    await sleep(100);
}

const CHECKS = {
    // uiSession rewrites the logical ids of rendered blocks: select by structure.
    'web-app': async (cdp) => {
        await expectText(cdp, ['Packages', '5 shown of 5'], 'web-app list');
        await click(cdp, 'section nav button:nth-of-type(2)');           // io
        await expectText(cdp, ['2 shown of 5'], 'web-app filter');
        await click(cdp, 'section ul li a');                             // first row → detail
        await expectText(cdp, ['Back to the list'], 'web-app detail');
        await click(cdp, 'nav.site a:nth-of-type(2)');                   // Contact
        await expectText(cdp, ['Contact', 'Send'], 'web-app contact');
        await click(cdp, 'section form button');
        await expectText(cdp, ['Name is required', 'Email is required'], 'web-app invalid form');
    },
    progressive: async (cdp, page) => {
        await expectText(cdp, ['Progressive enhancement', 'JavaScript is on'], 'progressive home');
        await page.goto(BASE + 'progressive/contact.html', { waitUntil: 'load' });
        const cdp2 = await page.context().newCDPSession(page);
        await expectText(cdp2, ['Contact'], 'progressive contact');
        await click(cdp2, 'button[type=submit]');
        await expectText(cdp2, ['Name is required', 'Email is required'], 'progressive invalid');
        await typeInto(cdp2, '#name', 'Ada');
        await typeInto(cdp2, '#email', 'ada@example.org');
        await click(cdp2, 'button[type=submit]');
        await expectText(cdp2, ['Thanks, Ada'], 'progressive valid');
    },
    pwa: async (cdp) => {
        await expectText(cdp, ['registered for', '/playground/usecases/pwa/'], 'pwa service worker');
        await expectText(cdp, ['Visits'], 'pwa visits');
    },
    'crypto-workers': async (cdp) => {
        await expectText(cdp, [
            'signature, same message : accepted',
            'signature, changed amount : rejected',
            'AEAD decrypt : "meet at noon"',
            'AEAD, one bit flipped : rejected',
        ], 'crypto-workers');
    },
};

const server = spawn(process.execPath, [path.join(HERE, 'serve.mjs'), FW, '--port', String(PORT)]);
await sleep(500);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
    for (const name of names.length ? names : Object.keys(CHECKS)) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
        try {
            await page.goto(BASE + name + '/', { waitUntil: 'load' });
            const cdp = await page.context().newCDPSession(page);
            await CHECKS[name](cdp, page);
            await page.screenshot({ path: path.join(OUT, 'usecase-' + name + '.png'), fullPage: true });
            if (errors.length) throw new Error(errors.join(' | '));
            console.log('PASS ' + name);
        } catch (e) {
            failed++;
            console.log('FAIL ' + name + ': ' + String(e.message).slice(0, 600));
        } finally {
            await page.close();
        }
    }
} finally {
    await browser.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F']);
    else server.kill();
}
process.exit(failed ? 1 : 0);
