// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Source-level gates of the standalone shell (the component's
 * own gates live in `@awacloud/oview`):
 * - no network, no HTML injection, nothing sanity blocks in the shell's
 *   sources (panels, PWA adapter, translator, catalogs). `app.js` is not
 *   scanned: it fetches the showcase samples by design;
 * - the import map's targets exist (the page dies on one 404) and every
 *   stylesheet the page links resolves;
 * - the two stylesheets the page links are byte-pinned DERIVED COPIES of the
 *   package's, and the package's token layer is a copy of the awaforge one.
 *
 * @module viewer/guards.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIconSet, drawIco, ICON_FILES, ICO_SIZES } from '../../tools/icons.js';
import { ICON } from '../tools/build-icons.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const repo = here('../../../../');

/** Source text with comments removed (JSDoc may mention any API). */
function code(file) {
    return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('shell sources: no network, no HTML injection, nothing sanity blocks', () => {
    // `core/help.js` is not in the list: it fetches the help page of the
    // reader's language from this site (same origin, by design). It is
    // scanned apart below, without the network leg.
    const files = ['about', 'more', 'handoff', 'pwa', 'i18n'].map((n) => here(`./core/${n}.js`))
        .concat(readdirSync(here('./i18n')).filter((f) => f.endsWith('.js')).map((f) => here(`./i18n/${f}`)));
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
    test('the list covers the panels, the adapter, the translator and both catalogs', () => {
        const names = files.map((f) => f.slice(repo.length).replace(/\\/g, '/'));
        for (const n of ['core/about.js', 'core/more.js', 'core/handoff.js', 'core/pwa.js', 'core/i18n.js', 'i18n/en.js', 'i18n/fr.js']) {
            expect(names.some((x) => x.endsWith(`/src/${n}`)), n).toBe(true);
        }
        expect(names.some((x) => x.endsWith('/core/help.js'))).toBe(false);
    });
    test('core/help.js: no injection, no absolute URL, nothing sanity blocks (its fetch is same-origin)', () => {
        const src = code(here('./core/help.js'));
        expect(src).not.toMatch(INJECTION);
        expect(src).not.toMatch(URLS);
        expect(src).not.toMatch(SANITY_BLOCKED);
    });
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
    test('every stylesheet the page links resolves from public/', () => {
        const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs).toEqual(['../src/styles/tokens.css', '../src/styles/viewer.css', '../src/styles/app.css']);
        for (const href of hrefs) expect(existsSync(here(`../public/${href}`)), href).toBe(true);
    });
    test('the import map maps @awacloud/oview, its entry and its source folder', () => {
        const map = JSON.parse(/** @type {string} */ (/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1]));
        expect(map.imports['@awacloud/oview']).toBe('/packages/front/office/oview/src/main.js');
        expect(map.imports['@awacloud/oview/']).toBe('/packages/front/office/oview/src/');
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
    test('the Windows sizes: the manifest names the 16, 32, 48 and 256 px tiles, the pages link favicon.ico (the drawIco bytes) before the SVG', () => {
        const manifest = JSON.parse(readFileSync(here('../public/manifest.webmanifest'), 'utf8'));
        for (const size of ICO_SIZES) {
            expect(manifest.icons.some((i) => i.src === `icons/icon-${size}.png` && i.sizes === `${size}x${size}`
                && i.type === 'image/png' && i.purpose === 'any'), `${size} px`).toBe(true);
        }
        // Chrome builds its own .ico from the PNGs: the manifest never lists one.
        expect(manifest.icons.some((i) => i.src.endsWith('.ico'))).toBe(false);
        for (const [page, prefix] of [['index.html', ''], ['help/en.html', '../'], ['help/fr.html', '../']]) {
            const text = readFileSync(here(`../public/${page}`), 'utf8');
            const ico = text.indexOf(`<link rel="icon" href="${prefix}favicon.ico" sizes="16x16 32x32 48x48 256x256">`);
            expect(ico, page).toBeGreaterThan(0);
            expect(text.indexOf(`<link rel="icon" type="image/svg+xml" href="${prefix}icons/icon.svg">`), page).toBeGreaterThan(ico);
        }
        const committed = readFileSync(here('../public/favicon.ico'));
        expect(committed.equals(drawIco(ICON)), 'favicon.ico: run bun run icons').toBe(true);
    });
    test('every text file under public/ is UTF-8', () => {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const files = readdirSync(here('../public'), { recursive: true }).map(String)
            .filter((f) => /\.(js|html|css|webmanifest|json|md)$/.test(f));
        expect(files).toContain('sw.js');
        for (const file of files) {
            expect(() => decoder.decode(readFileSync(join(here('../public'), file))), file).not.toThrow();
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

// The package's sheets are read by their repository path (the workspace layout
// the import map also uses), not through `import.meta.resolve`.
const OVIEW_STYLES = 'packages/front/office/oview/src/styles';

describe('derived stylesheets', () => {
    test('src/styles/viewer.css is a byte-exact copy of the package sheet', () => {
        const copy = readFileSync(here('./styles/viewer.css'));
        const source = readFileSync(join(repo, OVIEW_STYLES, 'viewer.css'));
        expect(copy.equals(source), 'run: cp the package viewer.css here').toBe(true);
    });
    test('src/styles/tokens.css is a byte-exact copy of the package token layer', () => {
        const copy = readFileSync(here('./styles/tokens.css'));
        const source = readFileSync(join(repo, OVIEW_STYLES, 'tokens.css'));
        expect(copy.equals(source), 'run: cp the package tokens.css here').toBe(true);
    });
    test('the package token layer is the awaforge one below its header', () => {
        const pkg = readFileSync(join(repo, OVIEW_STYLES, 'tokens.css'), 'utf8');
        const source = readFileSync(join(repo, 'apps/awaforge/assets/tokens.css'), 'utf8');
        expect(pkg.endsWith(source)).toBe(true);
    });
});
