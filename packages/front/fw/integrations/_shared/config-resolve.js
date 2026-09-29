// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_shared/config-resolve.js
/**
 * @fileoverview Pure resolver for `fw.config.json` — **no `node:fs`, no
 * source-tree scanning**. It takes an already-parsed config object plus the
 * committed module catalog (`catalog.generated.json`) and produces a
 * fully-resolved `BuildConfig`.
 *
 * Responsibilities (ported verbatim from the former build-side config loader,
 * same semantics and `[config]` error messages):
 *   - Resolve `extends` cascading per preset (cycle-detected, deduplicated).
 *   - Apply default `variants` / `endpoint` per preset and side-bundle.
 *   - Synthesise the `full` preset from the catalog data.
 *
 * Byte-for-byte identical resolution semantics to the original loader — the
 * only difference is the input shape (a parsed object + catalog data, instead
 * of a file path + a live `scanAll`), so a single shipped code path serves
 * both the default `fw.config.json` and an `options.configPath` override.
 */

/**
 * @typedef {('pure' | 'classic')} Variant
 *
 * @typedef {Object} PresetSpec
 * @property {string}     name
 * @property {string}     [description]
 * @property {string[]}   modules        Fully resolved (`extends` cascade applied), deduped.
 * @property {Variant[]}  variants
 * @property {string}     endpoint       Global property name used by the `classic` variant (`globalThis.<endpoint>`).
 *
 * @typedef {Object} SideBundleSpec
 * @property {string}     name
 * @property {string}     [description]
 * @property {string[]}   modules
 * @property {Variant[]}  variants
 * @property {string}     endpoint       Global property name read by the `classic` variant.
 *
 * @typedef {Object} BuildDefaults
 * @property {Variant[]}  variants
 * @property {string}     endpoint
 *
 * @typedef {Object} BuildConfig
 * @property {BuildDefaults}                  defaults      Global defaults (variants, …).
 * @property {Record<string, PresetSpec>}     presets       Resolved presets.
 * @property {Record<string, SideBundleSpec>} sideBundles   Resolved side-bundles.
 */

/**
 * Resolve a parsed `fw.config.json` object into a `BuildConfig`. Pure: never
 * reads the filesystem, never scans the source tree. Resolves `extends`
 * cascading, deduplicates, applies default variants/endpoint.
 *
 * @param {Object}   raw                          Parsed `fw.config.json` object.
 * @param {Object}   [opts]
 * @param {Variant[]} [opts.defaultVariantsFallback=['pure']]  Fallback when `defaults.variants` is absent.
 * @param {string}   [opts.defaultEndpointFallback='fw']       Fallback when `defaults.endpoint` is absent.
 * @returns {BuildConfig}
 */
export function resolveConfig(raw, { defaultVariantsFallback = ['pure'], defaultEndpointFallback = 'fw' } = {}) {
    const defaultVariants = readVariants(raw.defaults?.variants, 'defaults', defaultVariantsFallback);
    const defaultEndpoint = readEndpoint(raw.defaults?.endpoint, 'defaults', defaultEndpointFallback);

    const rawPresets = raw.presets || {};
    /** @type {Record<string, PresetSpec>} */
    const presets = {};
    for (const name of Object.keys(rawPresets)) {
        presets[name] = {
            name,
            description: rawPresets[name].description,
            modules: resolvePresetModules(name, rawPresets, new Set()),
            variants: readVariants(rawPresets[name].variants, `presets.${name}`, defaultVariants),
            endpoint: readEndpoint(rawPresets[name].endpoint, `presets.${name}`, defaultEndpoint),
        };
    }

    const rawSide = raw.sideBundles || {};
    /** @type {Record<string, SideBundleSpec>} */
    const sideBundles = {};
    for (const [name, spec] of Object.entries(rawSide)) {
        sideBundles[name] = {
            name,
            description: spec.description,
            modules: Array.isArray(spec.modules) ? [...new Set(spec.modules)] : [],
            variants: readVariants(spec.variants, `sideBundles.${name}`, defaultVariants),
            endpoint: readEndpoint(spec.endpoint, `sideBundles.${name}`, defaultEndpoint),
        };
    }

    return { defaults: { variants: defaultVariants, endpoint: defaultEndpoint }, presets, sideBundles };
}

/**
 * Recursively resolve a preset's full module list by applying `extends`.
 * Detects cycles and rejects them with a clear `a -> b -> a` message.
 *
 * @param {string} name
 * @param {Record<string, { extends?: string, modules?: string[] }>} all
 * @param {Set<string>} chain  Current `extends` chain for cycle detection.
 * @returns {string[]}
 */
function resolvePresetModules(name, all, chain) {
    const spec = all[name];
    if (!spec) {
        throw new Error(
            `[config] preset "${name}" is referenced via extends but not defined`
        );
    }
    if (chain.has(name)) {
        throw new Error(
            `[config] cycle in preset extends: ${[...chain, name].join(' -> ')}`
        );
    }
    chain.add(name);
    const base = spec.extends ? resolvePresetModules(spec.extends, all, chain) : [];
    chain.delete(name);

    const own = Array.isArray(spec.modules) ? spec.modules : [];
    // Deduplicate while preserving first-seen order (cascade then own).
    const seen = new Set();
    const out = [];
    for (const m of [...base, ...own]) {
        if (seen.has(m)) continue;
        seen.add(m);
        out.push(m);
    }
    return out;
}

/**
 * Normalise + validate a `variants` field. Empty / undefined falls back.
 *
 * @param {unknown}    raw
 * @param {string}     where   Path label used in error messages.
 * @param {Variant[]}  fallback
 * @returns {Variant[]}
 */
function readVariants(raw, where, fallback) {
    if (raw === undefined) return [...fallback];
    if (!Array.isArray(raw)) {
        throw new Error(`[config] ${where}.variants must be an array`);
    }
    const valid = new Set(['pure', 'classic']);
    for (const v of raw) {
        if (!valid.has(v)) {
            throw new Error(
                `[config] ${where}.variants contains invalid variant "${v}" (allowed: pure, classic)`
            );
        }
    }
    if (raw.length === 0) {
        throw new Error(`[config] ${where}.variants must not be empty (omit the field to inherit defaults)`);
    }
    return /** @type {Variant[]} */ ([...new Set(raw)]);
}

/**
 * Validate an `endpoint` field — the global property name attached by the
 * `classic` variant via `globalThis.<endpoint>`. Must be a valid JS identifier
 * because the generated code uses dot access. Empty / undefined falls back.
 *
 * @param {unknown} raw
 * @param {string}  where
 * @param {string}  fallback
 * @returns {string}
 */
function readEndpoint(raw, where, fallback) {
    if (raw === undefined || raw === null) return fallback;
    if (typeof raw !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(raw)) {
        throw new Error(
            `[config] ${where}.endpoint must be a valid JS identifier (got ${JSON.stringify(raw)})`
        );
    }
    return raw;
}

/**
 * Inject a synthetic `full` preset whose `modules` is every name in the
 * given catalog. Mutates and returns the same config for chaining. Variants
 * come from `config.defaults`.
 *
 * Accepts either the artifact's `modules` object (`{ name: {...} }`) or an
 * equivalent `Map` — both yield the module names in their own key order.
 *
 * @param {BuildConfig}                                                config
 * @param {Map<string, unknown> | Record<string, unknown>}            modulesData
 * @returns {BuildConfig}
 */
export function injectFullPreset(config, modulesData) {
    const names = modulesData instanceof Map ? [...modulesData.keys()] : Object.keys(modulesData);
    config.presets.full = {
        name: 'full',
        description: 'Every module discovered in src/ (synthesised at build time).',
        modules: names,
        variants: [...config.defaults.variants],
        endpoint: config.defaults.endpoint,
    };
    return config;
}
