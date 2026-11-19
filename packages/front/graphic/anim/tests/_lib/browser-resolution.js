// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Shared static browser-resolution walker — models how a real
 * browser resolves an HTML page's whole ES module graph through its OWN
 * `<script type="importmap">` alone, with NO `node_modules` fallback (that
 * is exactly what `bun test`'s own resolver gives every OTHER assertion in
 * the consuming suites, and exactly what a browser does NOT have).
 *
 * A `_lib/` prefix keeps this file outside `bun test`'s `*.test.*`
 * discovery — it is a plain ESM helper module, never its own suite.
 *
 * What it models:
 *   - Entry points are the page's own `<script type="module">` blocks (both
 *     `src=` references and inline bodies).
 *   - A relative (`./`, `../`) or root-absolute (`/`) specifier resolves as
 *     a URL against the repo root as document root.
 *   - A bare specifier resolves through the page's OWN import map — exact
 *     key first, then the longest `"…/"` trailing-slash prefix key — and
 *     nowhere else. An unresolvable bare specifier is recorded as a
 *     `problems` entry, matching a browser's own
 *     `TypeError: Failed to resolve module specifier`.
 *   - An absolute-URL specifier (`https:` etc.) is treated as off-origin and
 *     not walked further.
 *
 * What it deliberately does NOT model:
 *   - Import-map `"scopes"` — no consuming page uses it; a page that starts
 *     to would need this walker extended.
 *   - A computed `import(expr)` — specifier extraction is a real parser
 *     (`Bun.Transpiler#scanImports`), so it sees every static/literal
 *     dynamic import and NONE of a computed one.
 *   - Execution — it proves RESOLVABILITY of the whole reachable graph, not
 *     that the page renders (the boot/run/dispose legs in each consuming
 *     suite prove that half).
 *
 * COMMENT-BLIND FIX (graphic/BATCH_22 task 04, found by the orchestrator
 * during BATCH_22 wave 3, fixed here): the pre-extraction `importMapOf`/
 * `moduleEntryPoints` regexes scanned the raw HTML text with no awareness of
 * HTML comments, so authored prose that literally quotes
 * `<script type="importmap">`/`<script type="module">` inside a `<!-- … -->`
 * block was matched as a real script block (task 03 hit this live while
 * drafting a page comment and worked around it by rephrasing rather than
 * fixing the walker). Both functions now strip HTML comments before matching
 * — falsified below (`browser-resolution.js` "comment-blindness" leg in
 * `demos-smoke.integration.test.js`): a commented-out tag must not be seen, a
 * real one still must be.
 *
 * Consumers: `tests/demos-smoke.integration.test.js` and
 * `tests/playground-smoke.integration.test.js` (graphic/BATCH_22 task 04 —
 * extracted from two ~140-line near-identical copies, one per suite).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// tests/_lib -> tests -> anim -> graphic -> front -> packages -> repo root.
const REPO_ROOT = join(HERE, '..', '..', '..', '..', '..', '..');

const specifierScanner = new Bun.Transpiler({ loader: 'js' });

/**
 * Strip HTML comments before scanning for script tags — a comment
 * literally quoting a script tag must not be mistaken for a real one.
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtmlComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Map a root-absolute page URL onto its file on disk (repo root = doc root).
 *
 * @param {string} url
 * @returns {string}
 */
export function urlToFile(url) {
    return join(REPO_ROOT, ...url.replace(/^\//, '').split('/'));
}

/**
 * The page's declared import map (`imports` only — no `"scopes"` support).
 *
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function importMapOf(html) {
    const found = stripHtmlComments(html).match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    return found ? (JSON.parse(found[1]).imports ?? {}) : {};
}

/**
 * The page's module entry points: inline `<script type="module">` bodies and
 * `<script type="module" src=…>` references.
 *
 * @param {string} html
 * @returns {{ kind: 'src'|'inline', value: string }[]}
 */
export function moduleEntryPoints(html) {
    const out = [];
    const stripped = stripHtmlComments(html);
    const re = /<script([^>]*)type=["']module["']([^>]*)>([\s\S]*?)<\/script>/gi;
    let m = re.exec(stripped);
    while (m !== null) {
        const src = (m[1] + m[2]).match(/\ssrc=["']([^"']+)["']/i);
        if (src) out.push({ kind: 'src', value: src[1] });
        else out.push({ kind: 'inline', value: m[3] });
        m = re.exec(stripped);
    }
    return out;
}

/**
 * Browser import-map lookup: exact key, then longest trailing-slash prefix.
 *
 * @param {string} spec
 * @param {Record<string, string>} imports
 * @returns {string|null} The mapped address, or `null` when undeclared.
 */
export function lookupBare(spec, imports) {
    if (Object.prototype.hasOwnProperty.call(imports, spec)) return imports[spec];
    let best = null;
    for (const key of Object.keys(imports)) {
        if (!key.endsWith('/')) continue;
        if (!spec.startsWith(key)) continue;
        if (best === null || key.length > best.length) best = key;
    }
    return best === null ? null : imports[best] + spec.slice(best.length);
}

/**
 * Resolve ONE specifier the browser way.
 *
 * @param {string} spec
 * @param {string} importerUrl
 * @param {Record<string, string>} imports
 * @returns {{ url?: string|null, undeclared?: boolean }} `url: null` ⇒ an
 *   off-origin absolute URL, resolvable but not walked.
 */
export function resolveLikeBrowser(spec, importerUrl, imports) {
    if (spec.startsWith('/')) return { url: spec.split('?')[0] };
    if (spec.startsWith('./') || spec.startsWith('../')) {
        return { url: new URL(spec, `http://demo-origin${importerUrl}`).pathname };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return { url: null };
    const mapped = lookupBare(spec, imports);
    if (mapped === null) return { undeclared: true };
    if (mapped.startsWith('/')) return { url: mapped.split('?')[0] };
    return { url: new URL(mapped, `http://demo-origin${importerUrl}`).pathname };
}

/**
 * Walk one page's whole module graph.
 *
 * @param {string} pageUrl Root-absolute URL of the page.
 * @param {string} [htmlOverride] When set, used as the page HTML instead of
 *   reading `pageUrl` from disk — the falsification hook (a targeted
 *   mutation applied in memory to a real page's bytes, never to the tracked
 *   file).
 * @returns {{ problems: string[], moduleCount: number }} Empty `problems` ⇒
 *   the page resolves in a browser.
 */
export function walkPageGraph(pageUrl, htmlOverride) {
    const html = htmlOverride ?? readFileSync(urlToFile(pageUrl), 'utf8');
    const imports = importMapOf(html);
    const problems = [];
    const seen = new Set();
    const queue = [];

    const consider = (spec, importerUrl) => {
        const r = resolveLikeBrowser(spec, importerUrl, imports);
        if (r.undeclared) {
            problems.push(
                `undeclared bare specifier "${spec}" (imported by ${importerUrl}) — a browser `
                    + 'throws "Failed to resolve module specifier" here; declare it in the page import map',
            );
            return;
        }
        if (r.url) queue.push({ url: r.url, importer: importerUrl });
    };

    for (const entry of moduleEntryPoints(html)) {
        if (entry.kind === 'src') consider(entry.value, pageUrl);
        else for (const spec of specifierScanner.scanImports(entry.value)) consider(spec.path, pageUrl);
    }

    while (queue.length > 0) {
        const next = queue.shift();
        if (seen.has(next.url)) continue;
        seen.add(next.url);
        const file = urlToFile(next.url);
        if (!existsSync(file)) {
            problems.push(`"${next.url}" (reached from ${next.importer}) resolves to a file that does not exist`);
            continue;
        }
        // json/css/wasm are fetched by the page, never parsed as ESM here.
        if (!/\.(js|mjs)$/.test(next.url)) continue;
        for (const spec of specifierScanner.scanImports(readFileSync(file, 'utf8'))) consider(spec.path, next.url);
    }

    return { problems, moduleCount: seen.size };
}
