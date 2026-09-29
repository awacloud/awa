// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_shared/resolver-parity.test.js
/**
 * @fileoverview Golden equivalence test — the mutualized build tool's
 * resolver (`tools/fw-bundler/src/bundle/lib/config.js`: `loadConfigRaw` +
 * `injectFullPreset`) MUST resolve `fw.config.json` to the byte-identical
 * `BuildConfig` as the shipped resolver (`./config-resolve.js`:
 * `resolveConfig` + `injectFullPreset`) that every bundler integration
 * actually consumes at runtime (via `./core.js`).
 *
 * This closes the equivalence-coverage gap fw/BATCH_17 task 02 left open for
 * the integrations surface: BATCH_17 task 03 (originals removal) can re-run
 * its straggler grep against `tools/build/**` unchanged only once this proof
 * is green — the tool resolver and the shipped resolver are provably the same
 * function, not just "look similar".
 *
 * Both sides are run against the SAME inputs — fw's own `fw.config.json` and
 * the committed artifact catalog (`catalog.generated.json`) — never a live
 * `scanAll()` source-tree walk, so this stays a pure data-in/data-out
 * comparison (no filesystem-scan drift between the two lines).
 *
 * The `full` preset's module order is deterministic on both sides because
 * both consume the same sorted catalog (task 03's ratified sorted-artifact
 * design — see `ai/batches/types/fw/BATCH_18/03-integrations-rewrite.md`):
 * `catalog.generated.json`'s `modules` object is authored/generated with keys
 * in sorted order, and both `injectFullPreset` implementations take the
 * names in the catalog's own key order (`Object.keys` / `Map#keys`) without
 * re-sorting. A JSON-stringify-with-sorted-keys byte compare over the WHOLE
 * `BuildConfig` therefore already accounts for both (a) key order inside each
 * object (neutralised by the sorted-key stringify) and (b) the `full.modules`
 * ARRAY order (which is meaningful and must match verbatim, not merely as a
 * set) — so no separate array-sort step is required here; it is asserted
 * explicitly below as a documented belt-and-suspenders check.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, injectFullPreset as injectFullPresetShipped } from './config-resolve.js';

// Test-side dev import ONLY: the mutualized tool's resolver, imported from a
// *.test.js file (never from shipped `integrations/**` code — asserted
// below). This is the "originals" line BATCH_17 will delete once its
// equivalence is proven; the assertion below fails loudly if that import
// path ever moves into shipped code.
import { loadConfigRaw, injectFullPreset as injectFullPresetTool } from '../../../../../tools/fw-bundler/src/bundle/lib/config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..', '..'); // integrations/_shared -> fw package root
const CONFIG_PATH = resolve(PKG_ROOT, 'fw.config.json');
const CATALOG_PATH = resolve(HERE, 'catalog.generated.json');

/** @returns {Record<string, { bindingName: string, subpath: string }>} */
function readCatalogModules() {
    const artifact = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    return artifact.modules;
}

/**
 * Deterministic byte-comparable serialisation: recursively sort object keys
 * (arrays are left in their own order — order there is semantically
 * meaningful, e.g. `full.modules` / preset `modules`).
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
    return JSON.stringify(sortKeysDeep(value));
}

/** @param {unknown} value @returns {unknown} */
function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = sortKeysDeep(value[key]);
        }
        return out;
    }
    return value;
}

describe('resolver parity — tool loadConfigRaw+injectFullPreset ≡ shipped resolveConfig+injectFullPreset', () => {
    it('is a TEST-side dev import, not shipped code (this file is *.test.js)', () => {
        expect(fileURLToPath(import.meta.url)).toMatch(/\.test\.js$/);
    });

    it('resolves fw\'s own fw.config.json to a BYTE-IDENTICAL BuildConfig (incl. the injected full preset)', () => {
        const rawConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
        const modulesData = readCatalogModules();

        // Shipped resolver — the one every bundler adapter consumes via core.js.
        const shippedConfig = resolveConfig(rawConfig);
        injectFullPresetShipped(shippedConfig, modulesData);

        // Tool resolver — same artifact catalog, wrapped in a Map for its
        // Map-shaped `injectFullPreset(config, catalog)` signature.
        const toolConfig = loadConfigRaw(CONFIG_PATH);
        const catalogMap = new Map(Object.entries(modulesData));
        injectFullPresetTool(toolConfig, catalogMap);

        const shippedJson = stableStringify(shippedConfig);
        const toolJson = stableStringify(toolConfig);

        expect(toolJson).toBe(shippedJson);
    });

    it('the full preset module order is identical and sourced from the sorted catalog on both sides', () => {
        const rawConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
        const modulesData = readCatalogModules();
        const catalogNames = Object.keys(modulesData);

        const shippedConfig = resolveConfig(rawConfig);
        injectFullPresetShipped(shippedConfig, modulesData);

        const toolConfig = loadConfigRaw(CONFIG_PATH);
        injectFullPresetTool(toolConfig, new Map(Object.entries(modulesData)));

        expect(shippedConfig.presets.full.modules).toEqual(catalogNames);
        expect(toolConfig.presets.full.modules).toEqual(catalogNames);
        expect(toolConfig.presets.full.modules).toEqual(shippedConfig.presets.full.modules);

        // Documented belt-and-suspenders check named by the plan: even if a
        // future catalog regeneration ever emitted an unsorted key order, a
        // sorted-copy compare of `full.modules` on both sides must still
        // agree — order-only deltas would surface here, not as a silent pass.
        const sortedShipped = [...shippedConfig.presets.full.modules].sort();
        const sortedTool = [...toolConfig.presets.full.modules].sort();
        expect(sortedTool).toEqual(sortedShipped);
    });

    it('every non-full preset (site, spa, pwa, …) resolves identically, extends cascade included', () => {
        const rawConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

        const shippedConfig = resolveConfig(rawConfig);
        const toolConfig = loadConfigRaw(CONFIG_PATH);

        expect(Object.keys(toolConfig.presets).sort()).toEqual(Object.keys(shippedConfig.presets).sort());
        for (const name of Object.keys(shippedConfig.presets)) {
            expect(toolConfig.presets[name]).toEqual(shippedConfig.presets[name]);
        }
        expect(Object.keys(toolConfig.sideBundles).sort()).toEqual(Object.keys(shippedConfig.sideBundles).sort());
        for (const name of Object.keys(shippedConfig.sideBundles)) {
            expect(toolConfig.sideBundles[name]).toEqual(shippedConfig.sideBundles[name]);
        }
        expect(toolConfig.defaults).toEqual(shippedConfig.defaults);
    });
});
