// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Source-level gates of the package:
 * - no network: the viewer reads files from the device and sends nothing —
 *   no `fetch`, XHR, WebSocket, beacon or absolute URL in the painters, the
 *   UI or the controller. The one exception is `src/element.js`: its `src`
 *   attribute fetches a SAME-ORIGIN document by design (any other origin is
 *   refused), so that file is left out of this gate;
 * - no HTML injection: no `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
 *   `document.write` in shipped sources;
 * - nothing fw sanity `base` blocks on a hardened page (it throws there,
 *   while Happy-DOM tests pass): no `performance.now` / `mark` / `measure` /
 *   `getEntries`, no `eval` / `Function` constructor;
 * - the component sheet paints only tokens (the paper palette aside);
 * - zero internal references in what the package ships (sources, sheets,
 *   README, CHANGELOG, docs).
 *
 * @module oview/guards.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const repo = here('../../../../../');

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

/** Files under a directory whose name ends with `ext`. */
function filesOf(dir, ext) {
    const out = [];
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) out.push(...filesOf(p, ext));
        else if (p.endsWith(ext)) out.push(p);
    }
    return out;
}

/** Source text with comments removed (JSDoc may mention any API). */
function code(file) {
    return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Repository-relative, forward-slash path (test names). */
const rel = (file) => file.slice(repo.length).replace(/\\/g, '/');

describe('no network, no HTML injection, nothing sanity blocks', () => {
    // `src/element.js` is left out: its `src` attribute fetches a same-origin
    // document by design (a cross-origin URL is refused).
    const element = here('./element.js');
    const files = sources(here('.')).filter((f) => f !== element);
    const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(|new\s+(WebSocket|EventSource|XMLHttpRequest)\b|navigator\.sendBeacon/;
    const INJECTION = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/;
    const SANITY_BLOCKED = /\bperformance\s*\.\s*(now|mark|measure|getEntries)\b|\beval\s*\(|\bnew\s+Function\s*\(/;
    // The only absolute URL allowed: the SVG namespace.
    const URLS = /https?:\/\/(?!www\.w3\.org\/2000\/svg)/;
    test('the gate covers the controller, the painters and the UI', () => {
        const names = files.map(rel);
        for (const name of ['src/main.js', 'src/viewer.js', 'src/render/index.js', 'src/ui/stage.js', 'src/core/detect.js']) {
            expect(names).toContain(`packages/front/office/oview/${name}`);
        }
        expect(names).not.toContain('packages/front/office/oview/src/element.js');
    });
    for (const file of files) {
        test(rel(file), () => {
            const src = code(file);
            expect(src).not.toMatch(NETWORK);
            expect(src).not.toMatch(INJECTION);
            expect(src).not.toMatch(URLS);
            expect(src).not.toMatch(SANITY_BLOCKED);
        });
    }
});

describe('the cascade sub-path stays pure', () => {
    /** Static import specifiers of a source file. */
    const imports = (file) => [...code(file).matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2]);
    test('its import closure is the render modules it names: no fw, no format package, no UI', () => {
        const seen = new Set();
        const bare = [];
        const walk = (file) => {
            if (seen.has(file)) return;
            seen.add(file);
            for (const spec of imports(file)) {
                if (!spec.startsWith('.')) { bare.push(`${rel(file)} -> ${spec}`); continue; }
                walk(join(file, '..', spec));
            }
        };
        walk(here('./cascade.js'));
        expect(bare).toEqual([]);
        expect([...seen].map(rel).sort()).toEqual([
            'cascade.js', 'render/docx-style.js', 'render/odf-style.js', 'render/view.js', 'render/flow.js', 'render/dom.js'
        ].map((f) => `packages/front/office/oview/src/${f}`).sort());
    });
});

describe('viewer.css paints only tokens', () => {
    test('the component sheet paints only tokens (the paper palette aside)', () => {
        const sheet = readFileSync(here('./styles/viewer.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const literals = [...sheet.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
        expect([...new Set(literals)].sort()).toEqual(['#003462', '#00263d', '#0078b3', '#212529', '#d5e6ee', '#eef6fa', '#ffffff'].sort());
        expect(sheet).not.toMatch(/url\(|@import/);
    });
});

/** The internal-reference tokens a shipped file never carries. */
const INTERNAL = [/\bBL-\d+\b/, /\b(?:BATCH|LIGHT)_\d+\b/, /\bai\//];

/**
 * Lines of `text` (1-based) matching an internal-reference token, minus the
 * lines `skip` names.
 *
 * @param {string} text
 * @param {ReadonlySet<number>} [skip]
 * @returns {string[]}
 */
function internalHits(text, skip = new Set()) {
    const hits = [];
    text.split('\n').forEach((line, i) => {
        if (skip.has(i + 1)) return;
        for (const re of INTERNAL) if (re.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
    });
    return hits;
}

describe('zero internal references', () => {
    const pkg = here('../');
    // Carve-out: `src/styles/tokens.css` lines 9-13 are the awaforge token
    // layer's own header, carried byte-exact from its source (the standalone
    // application pins the copy); a fix belongs to the source, then a re-copy.
    const tokensCss = here('./styles/tokens.css');
    const CARRIED = new Set([9, 10, 11, 12, 13]);
    const files = [
        ...sources(here('.')),
        ...filesOf(here('./styles'), '.css'),
        join(pkg, 'README.md'),
        join(pkg, 'CHANGELOG.md'),
        ...filesOf(join(pkg, 'docs'), '.md')
    ];
    test('the scan covers sources, sheets, README, CHANGELOG and docs', () => {
        const names = files.map(rel);
        for (const name of ['src/main.js', 'src/styles/viewer.css', 'src/styles/tokens.css', 'README.md', 'CHANGELOG.md', 'docs/README.md', 'docs/design.md']) {
            expect(names).toContain(`packages/front/office/oview/${name}`);
        }
    });
    test('the tokens fire on what they guard', () => {
        expect(internalHits('see BL-1')).toHaveLength(1);
        expect(internalHits('from office/BATCH_66')).toHaveLength(1);
        expect(internalHits('the LIGHT_12 pass')).toHaveLength(1);
        expect(internalHits('see ai/memory')).toHaveLength(1);
        expect(internalHits('a BLT-1 cable, the batch_66 label, detail/x')).toEqual([]);
    });
    for (const file of files) {
        test(rel(file), () => {
            const skip = file === tokensCss ? CARRIED : undefined;
            expect(internalHits(readFileSync(file, 'utf8'), skip)).toEqual([]);
        });
    }
});
