// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/config.js
/**
 * @fileoverview Loader + validator for `fw.config.json` (package root). Ported
 * logic-verbatim from `packages/front/fw/tools/build/bundler/lib/config.js`;
 * the only adaptations are the shared-scanner import path (`../../modlib/`) and
 * the default config path, which now derives from the working directory
 * (`PKG_ROOT = --pkg ?? cwd`) instead of the tool's own location.
 *
 * Responsibilities :
 *   - Parse the JSON config.
 *   - Resolve `extends` cascading per preset (cycle-detected, deduplicated).
 *   - Apply default `variants` per preset / side-bundle.
 *   - Validate every cited module name against the source-tree catalog.
 *
 * Output : a fully-resolved `BuildConfig` object that downstream consumers
 * (build orchestrator, Vite plugin, …) can use without further interpretation.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { scanAll } from '../../modlib/scan-modules.js';

// Path-resolution seam: the default config path derives from the working
// directory. The orchestrator (`bundle/index.js`) always passes an explicit
// `<PKG_ROOT>/fw.config.json` so `--pkg` is honoured; this default only
// applies to raw-config consumers that call `loadConfigRaw()` with no path.
const DEFAULT_CONFIG_PATH = resolve(process.cwd(), 'fw.config.json');

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
 * Load and resolve the build configuration WITHOUT validating against the
 * source-tree catalog. Resolves `extends` cascading, deduplicates, applies
 * default variants. Use when you only need the declarative data (Vite plugin,
 * tooling, dashboards) and don't want to pay for a source-tree scan.
 *
 * @param {string} [configPath=DEFAULT_CONFIG_PATH]
 * @returns {BuildConfig}
 */
export function loadConfigRaw(configPath = DEFAULT_CONFIG_PATH) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const defaultVariants = readVariants(raw.defaults?.variants, 'defaults', ['pure']);
    const defaultEndpoint = readEndpoint(raw.defaults?.endpoint, 'defaults', 'fw');

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
 * Load and resolve the build configuration, then validate every cited module
 * name against the source-tree catalog. Use from the build orchestrator
 * where any unknown name should abort.
 *
 * @param {string} srcDir       Absolute path of `src/`.
 * @param {string} [configPath=DEFAULT_CONFIG_PATH]
 * @returns {BuildConfig}
 */
export function loadConfig(srcDir, configPath = DEFAULT_CONFIG_PATH) {
    const config = loadConfigRaw(configPath);

    const { byName, unparseable } = scanAll(srcDir);
    if (unparseable.length) {
        const list = unparseable.map((u) => u.file).join('\n  ');
        throw new Error(`[config] ${unparseable.length} module file(s) could not be parsed:\n  ${list}`);
    }
    const known = new Set(byName.keys());

    for (const preset of Object.values(config.presets)) {
        const missing = preset.modules.filter((m) => !known.has(m));
        if (missing.length) {
            throw new Error(`[config] preset "${preset.name}" references unknown modules: ${missing.join(', ')}`);
        }
    }
    for (const sb of Object.values(config.sideBundles)) {
        const missing = sb.modules.filter((m) => !known.has(m));
        if (missing.length) {
            throw new Error(`[config] side-bundle "${sb.name}" references unknown modules: ${missing.join(', ')}`);
        }
    }

    return config;
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
 * given catalog (source-tree scan). Mutates and returns the same config
 * for chaining. Variants come from `config.defaults`.
 *
 * Use from the build orchestrator AFTER loading the catalog. The Vite
 * plugin and other raw-config consumers ignore `full` (or implement
 * their own equivalent).
 *
 * @param {BuildConfig}                                                  config
 * @param {Map<string, import('../../modlib/scan-modules.js').ModuleInfo>} catalog
 * @returns {BuildConfig}
 */
export function injectFullPreset(config, catalog) {
    config.presets.full = {
        name: 'full',
        description: 'Every module discovered in src/ (synthesised at build time).',
        modules: [...catalog.keys()],
        variants: [...config.defaults.variants],
        endpoint: config.defaults.endpoint,
    };
    return config;
}

/**
 * Iterate every preset name in declaration order. Object.keys preserves
 * insertion order in modern engines, mirroring the JSON layout.
 *
 * @param {BuildConfig} config
 * @returns {string[]}
 */
export function listPresetNames(config) {
    return Object.keys(config.presets);
}

export { DEFAULT_CONFIG_PATH };
