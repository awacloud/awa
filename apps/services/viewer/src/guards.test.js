// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Source-level gates:
 * - no network: the viewer reads files from the device and sends nothing —
 *   no `fetch`, XHR, WebSocket, beacon or absolute URL in the painters, the
 *   UI or the controller. The only network code is same-origin and opt-in:
 *   the PWA adapter and service worker, and `element.js`'s `src` attribute
 *   (which refuses any other origin);
 * - no HTML injection: no `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
 *   `document.write` in shipped sources;
 * - nothing fw sanity `base` blocks on the standalone page (it throws there,
 *   while Happy-DOM tests pass): no `performance.now` / `mark` / `measure` /
 *   `getEntries`, no `eval` / `Function` constructor;
 * - the import map's targets exist (the page dies on one 404);
 * - `tokens.css` is a byte-exact copy of the awaforge token layer.
 *
 * @module viewer/guards.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIconSet, ICON_FILES } from '../../tools/icons.js';
import { ICON } from '../tools/build-icons.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const repo = here('../../../../');

/** Shipped JS sources under a directory (tests excluded). */
function sources(dir) {
    const out = [];
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) out.push(...sources(p));
        else if (p.endsWith('.js') && !p.endsWith('.test.js')) out.push(p);
    }
    return out;
}

/** Source text with comments removed (JSDoc may mention any API). */
function code(file) {
    return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('no network, no HTML injection, nothing sanity blocks', () => {
    const files = [...sources(here('./render')), ...sources(here('./ui')), here('./viewer.js'), here('./core/detect.js'), here('./core/i18n.js'), here('./core/runtime.js')];
    const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(|new\s+(WebSocket|EventSource|XMLHttpRequest)\b|navigator\.sendBeacon/;
    const INJECTION = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/;
    const SANITY_BLOCKED = /\bperformance\s*\.\s*(now|mark|measure|getEntries)\b|\beval\s*\(|\bnew\s+Function\s*\(/;
    // The only absolute URL allowed: the SVG namespace.
    const URLS = /https?:\/\/(?!www\.w3\.org\/2000\/svg)/;
    for (const file of files) {
        const rel = file.slice(repo.length).replace(/\\/g, '/');
        test(rel, () => {
            const src = code(file);
            expect(src).not.toMatch(NETWORK);
            expect(src).not.toMatch(INJECTION);
            expect(src).not.toMatch(URLS);
            expect(src).not.toMatch(SANITY_BLOCKED);
        });
    }
});

describe('the standalone page', () => {
    const html = readFileSync(here('../public/index.html'), 'utf8');
    test('the import map comes before any module script, and every target exists', () => {
        const mapAt = html.indexOf('<script type="importmap">');
        const moduleAt = html.indexOf('<script type="module"');
        expect(mapAt).toBeGreaterThan(0);
        expect(moduleAt).toBeGreaterThan(mapAt);
        const map = JSON.parse(/** @type {string} */ (/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1]));
        for (const [key, value] of Object.entries(map.imports)) {
            const target = join(repo, String(value));
            expect(existsSync(target), `${key} → ${value}`).toBe(true);
        }
    });
    test('the manifest names icons that exist', () => {
        const manifest = JSON.parse(readFileSync(here('../public/manifest.webmanifest'), 'utf8'));
        for (const icon of manifest.icons) expect(existsSync(here(`../public/${icon.src}`))).toBe(true);
        expect(manifest.file_handlers[0].accept['application/pdf']).toEqual(['.pdf']);
    });
    test('the committed icons are the drawing of tools/build-icons.js, every size and purpose', () => {
        for (const [name, bytes] of drawIconSet(ICON)) {
            const committed = readFileSync(here(`../public/icons/${name}`));
            expect(committed.equals(bytes), `${name}: run bun run icons`).toBe(true);
            const [size] = ICON_FILES[name];
            expect(committed.readUInt32BE(16)).toBe(size);
            expect(committed.readUInt32BE(20)).toBe(size);
        }
    });
    test('the manifest: a stable id, one window per file, install screenshots Chrome accepts', () => {
        const manifest = JSON.parse(readFileSync(here('../public/manifest.webmanifest'), 'utf8'));
        expect(manifest.id).toBe('/awa-viewer');
        expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-new' });
        for (const handler of manifest.file_handlers) expect(handler.launch_type).toBe('multiple-clients');
        const factors = new Map();
        for (const shot of manifest.screenshots) {
            const png = readFileSync(here(`../public/${shot.src}`));
            const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
            expect(`${w}x${h}`, shot.src).toBe(shot.sizes);
            expect(shot.type).toBe('image/png');
            expect(Math.min(w, h)).toBeGreaterThanOrEqual(320);
            expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
            expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3);
            expect(shot.label.length).toBeGreaterThan(0);
            factors.set(shot.form_factor, w / h);
        }
        expect([...factors.keys()].sort()).toEqual(['narrow', 'wide']);
        expect(factors.get('wide')).toBeGreaterThan(1);
        expect(factors.get('narrow')).toBeLessThan(1);
        expect(manifest.description.length).toBeLessThanOrEqual(300);
    });
    test('link previews and search: canonical, Open Graph with a real 1200 x 630 image, a free SoftwareApplication, noscript', () => {
        const html = readFileSync(here('../public/index.html'), 'utf8');
        const host = 'https://viewer.awacloud.com/';
        // The canonical link comes from og:url at build (tools/build-csp.js): app-dist refuses it here.
        expect(html).not.toContain('rel="canonical"');
        const og = (p) => new RegExp(`<meta property="og:${p}" content="([^"]+)">`).exec(html)?.[1];
        expect(og('url')).toBe(host);
        expect(og('title')?.length).toBeGreaterThan(10);
        expect(og('image')).toBe(`${host}screenshots/share.png`);
        const png = readFileSync(here('../public/screenshots/share.png'));
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
        const ld = JSON.parse(/** @type {string} */ (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]));
        expect(ld['@type']).toBe('SoftwareApplication');
        expect(ld.isAccessibleForFree).toBe(true);
        expect(ld.offers.price).toBe('0');
        expect(ld.url).toBe(host);
        expect(html).toMatch(/<noscript>.*needs JavaScript.*lang="fr".*a besoin de JavaScript/s);
    });
    test('the manifest gives PNG icons for both purposes, the page an apple touch icon', () => {
        const manifest = JSON.parse(readFileSync(here('../public/manifest.webmanifest'), 'utf8'));
        const has = (purpose, size) => manifest.icons.some((i) =>
            i.purpose === purpose && i.sizes === `${size}x${size}` && i.type === 'image/png');
        for (const size of [192, 512]) {
            expect(has('any', size)).toBe(true);
            expect(has('maskable', size)).toBe(true);
        }
        expect(readFileSync(here('../public/index.html'), 'utf8')).toContain('href="icons/apple-touch-icon.png"');
    });
    test('the header shows the app icon; About carries no install paragraph (Help does)', () => {
        const html = readFileSync(here('../public/index.html'), 'utf8');
        expect(html).toMatch(/<img class="app-logo" src="icons\/icon\.svg" alt=""/);
        expect(html).not.toContain('installHint');
    });
    test('the help pages: one per locale, each linking the other, its sheet and the app icon; pre-cached', () => {
        for (const [lang, otherLang] of [['en', 'fr'], ['fr', 'en']]) {
            const page = readFileSync(here(`../public/help/${lang}.html`), 'utf8');
            expect(page).toContain(`<html lang="${lang}">`);
            expect(page).toContain(`href="${otherLang}.html"`);
            expect(page).toContain('href="help.css"');
            expect(page).toContain('src="../icons/icon.svg"');
            // Use, keyboard, install, updates, offline: at least five sections, each one anchored.
            expect(page.match(/<h2 id="[^"]+">/g)?.length).toBeGreaterThanOrEqual(5);
            expect(page).toContain('<kbd>Ctrl</kbd>');
            expect(page).not.toMatch(/https?:\/\//);
        }
        // One panel module, the same in both apps but for its module tag.
        const panel = (app) => readFileSync(here(`../../${app}/src/core/help.js`), 'utf8').replace(/@module \w+\/core\/help/, '');
        expect(panel('viewer')).toBe(panel('notepad'));
        // One sheet, the same file in both apps.
        expect(readFileSync(here('../public/help/help.css'), 'utf8')).toBe(readFileSync(here('../../notepad/public/help/help.css'), 'utf8'));
        // The worker build pre-caches everything outside screenshots/ and samples/: help/ is offline.
        expect(readFileSync(here('../tools/build-sw.js'), 'utf8')).not.toMatch(/help/);
    });
});

describe('tokens.css', () => {
    test('is a byte-exact copy of apps/awaforge/assets/tokens.css below its header', () => {
        const copy = readFileSync(here('./styles/tokens.css'), 'utf8');
        const source = readFileSync(join(repo, 'apps/awaforge/assets/tokens.css'), 'utf8');
        expect(copy.endsWith(source)).toBe(true);
    });
    test('the component sheet paints only tokens (the paper palette aside)', () => {
        const sheet = readFileSync(here('./styles/viewer.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const literals = [...sheet.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
        expect([...new Set(literals)].sort()).toEqual(['#003462', '#00263d', '#0078b3', '#212529', '#d5e6ee', '#eef6fa', '#ffffff'].sort());
        expect(sheet).not.toMatch(/url\(|@import/);
    });
});
