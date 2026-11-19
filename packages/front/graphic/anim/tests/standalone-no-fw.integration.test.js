// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the standalone surface imports with ZERO
 * `@awacloud/fw` and the pure-leaf bundles are Worker-safe.
 *
 * Proves the framework-free guarantee of the GENERATED standalone bundles:
 *
 *   (a) `dist/standalone/graphic-timeline-bundled.js` (the full pipeline) imports
 *       with NO `@awacloud/fw` anywhere on its import path — it has ZERO imports — and
 *       resolves + runs an end-to-end tween writing to a stub element. `secPolicy`
 *       and `dom` are present only as INLINED factory text, not as imports.
 *
 *   (b) The bundle SOURCE contains no `@awacloud/fw` import and no bare `import … from
 *       'fw…'` statement (any `secPolicy`/`dom` reference is inlined, not imported).
 *
 *   (c) The pure-leaf bundles (lerp/easing/units/matrix/color/interpolate) are
 *       Worker-safe: their inlined source references no `window`, `document`, or
 *       fw `dom` module — they can run off the main thread.
 *
 * NOTE: this file does NOT import `@awacloud/fw`. It registers happy-dom
 * itself: the DOM-bound end-to-end run (a) writes to a plain stub element, but
 * the inlined fw `dom` write path references `NodeList` at its first tick, so
 * the file used to pass only when a sibling file had registered a DOM first.
 * The Worker-safety check (c) still nulls `window`/`document` around its run.
 *
 * Root coverage is read from the live `dist/standalone` listing, never from a
 * hand-written list, so a new root cannot silently escape the gate (b).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDALONE = join(HERE, '..', 'dist', 'standalone');

/** @param {string} kebab @returns {string} Absolute path to a standalone bundle. */
function bundlePath(kebab) { return join(STANDALONE, `graphic-${kebab}-bundled.js`); }

/** Pure-leaf roots — Worker-safe: no DOM-bound fw module (only fw's pure io modules) and NO DOM. */
const PURE_LEAVES = ['lerp', 'easing', 'units', 'matrix', 'color', 'scoped-ids', 'interpolate'];

/** Every generated standalone root, read from the live directory listing. */
const LISTED_ROOTS = readdirSync(STANDALONE)
    .map((f) => /^graphic-(.+)-bundled\.js$/.exec(f))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();

/**
 * Strip JS comments so prose/JSDoc mentions of forbidden words don't false-match.
 * @param {string} src @returns {string}
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) full bundle imports with ZERO @awacloud/fw + runs an end-to-end tween
// ─────────────────────────────────────────────────────────────────────────────

describe('standalone full bundle — zero-fw import + end-to-end tween', () => {
    test('graphic-timeline-bundled imports without any @awacloud/fw on the path', async () => {
        // The import resolves a module with NO import statements; if it pulled
        // @awacloud/fw transitively, this dynamic import would touch the fw graph.
        const mod = await import(bundlePath('timeline'));
        const keys = Object.keys(mod);
        expect(keys.length).toBe(1);
        const desc = mod[keys[0]];
        expect(desc).toBeTruthy();
        expect(desc.dependencies).toEqual([]);
        expect(typeof desc.factory).toBe('function');
    });

    test('the resolved bundle runs a full deterministic tween to a stub element', async () => {
        const mod = await import(bundlePath('tween'));
        const tweenMod = mod[Object.keys(mod)[0]].factory();
        const schedMod = (await import(bundlePath('scheduler'))).graphicSchedulerBundled.factory();

        const writes = [];
        const stub = { setAttribute(name, value) { writes.push({ name, value }); } };
        const sched = new schedMod.Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });

        new tweenMod.Tween({
            target: stub, property: 'x', from: '0px', to: '300px',
            duration: 1000, easing: 'linear', scheduler: sched,
        }).play();
        for (const ts of [0, 500, 1000]) sched.tick(ts);

        expect(writes.length).toBeGreaterThan(0);
        expect(writes[0].value).toBe('0px');
        expect(writes[writes.length - 1].value).toBe('300px');
    });

    test('the full timeline bundle resolves the Timeline class (whole pipeline inlined)', async () => {
        const mod = await import(bundlePath('timeline'));
        const core = mod[Object.keys(mod)[0]].factory();
        expect(typeof core.Timeline).toBe('function');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) bundle SOURCE carries no fw import statement
// ─────────────────────────────────────────────────────────────────────────────

describe('standalone bundles carry no fw import statement', () => {
    // graphic/BATCH_16 task 03 appends the three composed EXTENSION roots.
    // They are DOM-bound, NOT pure leaves — classification measured off the
    // emitted bytes, not assumed: each inlines `name: "secPolicy"` + `name:
    // "dom"`, references `document` and writes through `dom.attr`. So they join
    // ALL_ROOTS (the no-bare-fw-specifier gate, which is precisely the
    // guarantee these roots exist to provide) and stay OUT of PURE_LEAVES.
    const ALL_ROOTS = LISTED_ROOTS;

    test('the gate covers every listed root, and the listing is not empty', () => {
        expect(ALL_ROOTS.length).toBeGreaterThanOrEqual(17);
        for (const leaf of PURE_LEAVES) expect(ALL_ROOTS).toContain(leaf);
    });

    for (const root of ALL_ROOTS) {
        test(`graphic-${root}-bundled has no @awacloud/fw / bare-fw import`, () => {
            const code = stripComments(readFileSync(bundlePath(root), 'utf8'));
            // No @awacloud/fw import anywhere.
            expect(code.includes('@awacloud/fw')).toBe(false);
            // No ESM import/export-from statement at all (single self-contained factory).
            expect(/\bimport\s+[^;]*\bfrom\b/.test(code)).toBe(false);
            expect(/\bexport\s+\*\s+from\b/.test(code)).toBe(false);
            // No bare `from 'fw...'` / `from "fw..."` specifier.
            expect(/from\s+['"]fw[^'"]*['"]/.test(code)).toBe(false);
        });
    }

    test('DOM-bound bundles inline secPolicy+dom as TEXT, not as imports', () => {
        const code = readFileSync(bundlePath('timeline'), 'utf8');
        // The names appear as inlined descriptor registrations…
        expect(code.includes('name: "secPolicy"')).toBe(true);
        expect(code.includes('name: "dom"')).toBe(true);
        // …but never as an import specifier.
        expect(/from\s+['"][^'"]*secPolicy[^'"]*['"]/.test(code)).toBe(false);
        expect(/from\s+['"][^'"]*\/dom\/[^'"]*['"]/.test(code)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) pure-leaf bundles are Worker-safe (no window/document/dom)
// ─────────────────────────────────────────────────────────────────────────────

describe('pure-leaf bundles are Worker-safe', () => {
    for (const root of PURE_LEAVES) {
        test(`graphic-${root}-bundled references no window/document/dom`, () => {
            const code = stripComments(readFileSync(bundlePath(root), 'utf8'));
            expect(/\bwindow\b/.test(code)).toBe(false);
            expect(/\bdocument\b/.test(code)).toBe(false);
            // No inlined fw dom module and no dom.attr write path.
            expect(code.includes('name: "dom"')).toBe(false);
            expect(/\bdom\.attr\b/.test(code)).toBe(false);
        });
    }

    test('each pure-leaf bundle resolves to a usable value with no DOM present', async () => {
        // Run with window/document nulled to simulate a Worker context.
        const g = /** @type {any} */ (globalThis);
        const savedWin = g.window;
        const savedDoc = g.document;
        try {
            g.window = undefined;
            g.document = undefined;
            for (const root of PURE_LEAVES) {
                const mod = await import(bundlePath(root));
                const value = mod[Object.keys(mod)[0]].factory();
                expect(value == null).toBe(false);
            }
        } finally {
            g.window = savedWin;
            g.document = savedDoc;
        }
    });
});
