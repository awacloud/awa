// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Browser proof of "Copy with formatting" in AWA Viewer
 * (Chromium, the real viewer page with fw sanity on, clipboard permissions
 * granted): open a committed sample, press the toolbar button, read the
 * system clipboard back and check what a word processor would receive.
 *
 * Run: `node apps/services/viewer/tests/copy.e2e.mjs` from the repository
 * root. The `.e2e.mjs` suffix keeps it out of `bun test`; the root
 * Playwright harness (`tests/e2e/`) is used read-only (static origin,
 * browser path). Exit code 0 only when every leg passes.
 *
 * Why two pages: the viewer page runs fw sanity, which blocks `eval`, so
 * `page.evaluate` fails there. The clipboard is read from a second page of
 * the SAME origin that carries no sanity (the 404 document of the static origin; it is same-origin and has no sanity).
 * Structure is asserted with `DOMParser` counts, never bytes (Chromium
 * rewrites the HTML flavour on its way through the clipboard, so its
 * wrapper is not asserted either).
 *
 * @module viewer/tests/copy.e2e
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBrowsersPath } from '../../../../tests/e2e/browsers-path.mjs';
import { startServer } from '../../../../tests/e2e/static-server.mjs';

applyBrowsersPath();
const { chromium } = await import('@playwright/test');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const samples = join(root, 'apps/services/viewer/public/samples/en');
const PORT = 4813;
const origin = `http://127.0.0.1:${PORT}`;

/**
 * Each leg: a committed document and the structure its clipboard HTML must
 * carry. `min` are lower bounds on element counts; `max` upper bounds.
 */
const LEGS = [
    {
        name: 'PDF sample (untagged)', file: join(samples, 'awa-pdf.pdf'),
        // The sample is untagged: oconv infers no heading, so the paragraph
        // assertion is the one the sample supports (see the report).
        min: { p: 1 }, plainStartsWith: null
    },
    {
        name: 'PDF with a tagged structure', file: join(root, 'packages/front/office/oconv/tests/_fixtures/corpus/pdf-tagged/tagged-structured.pdf'),
        min: { heading: 1, p: 1 }, plainStartsWith: '#'
    },
    {
        name: 'DOCX sample', file: join(samples, 'awa-office.docx'),
        min: { heading: 1, p: 1, table: 1 }, plainStartsWith: '# '
    },
    {
        // Headless Chromium delivers the chord to the page; desktop Chrome and
        // Edge keep Ctrl+Shift+C for the DevTools element picker, so the
        // button stays the documented primary path.
        name: 'DOCX sample, Ctrl+Shift+C', file: join(samples, 'awa-office.docx'), key: 'Control+Shift+C',
        min: { heading: 1, p: 1, table: 1 }, plainStartsWith: '# '
    }
];

/** Count helper run in the reader page (no sanity there). */
async function readClipboard(reader) {
    return reader.evaluate(async () => {
        const types = {};
        for (const item of await navigator.clipboard.read()) {
            for (const type of item.types) types[type] = await (await item.getType(type)).text();
        }
        const html = types['text/html'] || '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const count = (s) => doc.querySelectorAll(s).length;
        return {
            types: Object.keys(types),
            plain: types['text/plain'] || '',
            counts: { heading: count('h1,h2,h3,h4,h5,h6'), p: count('p'), table: count('table'), li: count('li') },
            htmlLength: html.length
        };
    });
}

const results = [];
const srv = await startServer({ port: PORT, root });
const browser = await chromium.launch();
try {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const reader = await ctx.newPage();
    await reader.goto(`${origin}/apps/services/viewer/tests/clipboard-reader-page`);
    const page = await ctx.newPage();
    /** @type {string[]} */
    const blocked = [];
    page.on('console', (m) => {
        const text = m.text();
        if (/Blocked/.test(text) && !/window\.eval/.test(text)) blocked.push(text.split('\n')[0]);
    });
    page.on('pageerror', (e) => blocked.push(`pageerror ${e.message}`));

    for (const leg of LEGS) {
        const problems = [];
        blocked.length = 0;
        try {
            await reader.bringToFront();
            await reader.evaluate(() => navigator.clipboard.writeText('SENTINEL'));
            await page.bringToFront();
            await page.goto(`${origin}/apps/services/viewer/public/index.html`);
            await page.waitForSelector('input[type=file]', { state: 'attached' });
            await page.setInputFiles('input[type=file]', leg.file);
            const button = page.locator('button[data-action="copy"]');
            await button.waitFor({ state: 'visible', timeout: 20000 });
            // No page.waitForFunction: it evaluates script, which fw sanity blocks.
            for (let i = 0; i < 40 && !(await button.isEnabled()); i++) await page.waitForTimeout(500);
            if (leg.key) await page.keyboard.press(leg.key);
            else await button.click();
            // The visual echo: a card over the document, at once.
            if (!(await page.locator('.awv-toast').isVisible())) problems.push('no card shown on screen');
            // The clipboard holds the sentinel until the conversion settles.
            let got = null;
            for (let i = 0; i < 40; i++) {
                await reader.bringToFront();
                got = await readClipboard(reader).catch(() => null);
                if (got && got.types.includes('text/html')) break;
                await page.bringToFront();
                await page.waitForTimeout(500);
            }
            if (!got || !got.types.includes('text/html')) {
                problems.push('no text/html on the clipboard');
            } else {
                if (!got.types.includes('text/plain')) problems.push('no text/plain on the clipboard');
                for (const [kind, n] of Object.entries(leg.min)) {
                    if (got.counts[kind] < n) problems.push(`${kind} count ${got.counts[kind]} < ${n}`);
                }
                if (leg.plainStartsWith && !got.plain.startsWith(leg.plainStartsWith)) {
                    problems.push(`text/plain starts ${JSON.stringify(got.plain.slice(0, 20))}, not ${JSON.stringify(leg.plainStartsWith)}`);
                }
                if (got.plain.startsWith('---')) problems.push('front matter leaked into text/plain');
                if (!got.plain.trim()) problems.push('text/plain is empty');
                leg.seen = JSON.stringify(got.counts);
            }
            if (blocked.length) problems.push(`sanity blocked: ${blocked.join(' ; ')}`);
        } catch (err) {
            problems.push(`error: ${err && err.message ? err.message.split('\n')[0] : err}`);
        }
        results.push({ name: leg.name, ok: problems.length === 0, detail: problems.length ? problems.join(' | ') : leg.seen });
        console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${leg.name}: ${results[results.length - 1].detail}`);
    }
} finally {
    await browser.close();
    await srv.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} legs passed`);
process.exit(failed ? 1 : 0);
