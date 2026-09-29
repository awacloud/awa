// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/entry-gen.js
/**
 * @fileoverview Generates the entry file for a preset or a side-bundle, from
 * scratch — no regex surgery on `src/main.js`. Ported logic-verbatim from
 * `packages/front/fw/tools/build/bundler/lib/entry-gen.js`.
 *
 * Two products :
 *  - **Preset entry** : a self-contained module that builds a `ModuleRuntime`,
 *    registers the preset's modules via `registerAllDeep` (so transitive deps
 *    are pulled by the JS import graph), wires the worker bootstrap, the
 *    logger and `domReady`, and exposes the framework either as a plain ESM
 *    default export (`pure` variant) or with an additional `globalThis.fw`
 *    auto-attach (`classic` variant).
 *
 *  - **Side-bundle entry** : a module that imports the side-bundle's modules
 *    and either installs them on an existing `globalThis.fw.runtime`
 *    (`classic`) or exports them as an `install(runtime)` helper plus a
 *    `modules` array (`pure`).
 *
 * The generator relies on the `deps` field populated by the codegen tool and
 * enforced by `validate-deps`. As a result, preset declarations may stay
 * editorial (top-level modules only) — Bun's bundler closes the transitive
 * graph on its own by following the static `import { dep } from '...'`
 * statements injected on each module.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';

/**
 * @typedef {Object} ModuleInfo
 * @property {string} file        Absolute path of the module's source file.
 * @property {string} moduleName  Framework module name.
 * @property {string} bindingName JS export binding name.
 */

/**
 * @typedef {Object} GenPresetOptions
 * @property {string[]}                       moduleList     Resolved module names for the preset.
 * @property {Map<string, ModuleInfo>}        catalog        `name → ModuleInfo` from scan-modules.
 * @property {string}                         srcRoot        Absolute path of the source dir to import FROM (e.g. `src/` or sanitised mirror).
 * @property {string}                         outFile        Absolute path of the file to write.
 * @property {{ DEV: boolean, LOG: boolean }} env
 * @property {('pure'|'classic')}             variant
 * @property {string}                         [endpoint='fw']  Global property name attached in the `classic` variant.
 */

/**
 * Write the preset entry file at `outFile`.
 *
 * @param {GenPresetOptions} opts
 */
export function generatePresetEntry({
    moduleList, catalog, srcRoot, outFile, env, variant, endpoint = 'fw',
}) {
    const outDir = dirname(outFile);
    const srcImportBase = posix(relative(outDir, srcRoot));

    const moduleImports = moduleList.map((name) => {
        const info = catalog.get(name);
        if (!info) throw new Error(`[entry-gen] unknown module "${name}" while generating preset entry`);
        const path = posix(relative(outDir, info.file));
        return `import { ${info.bindingName} } from '${path}';`;
    });

    const bindings = moduleList.map((name) => catalog.get(name).bindingName);

    const lines = [
        '// AUTO-GENERATED — do not edit. Source : tools/build/lib/entry-gen.js',
        '',
        `import { ModuleRuntime, runtimeSource } from '${srcImportBase}/core/runtime.js';`,
        `import { logger }                      from '${srcImportBase}/core/logger.js';`,
        `import { createWorkerRuntime }         from '${srcImportBase}/core/worker-helper.js';`,
        `import { readyState }                  from '${srcImportBase}/core/readyState.js';`,
        '',
        ...moduleImports,
        '',
        `const ENV = { DEV: ${env.DEV}, LOG: ${env.LOG} };`,
        '',
        'const log = ENV.LOG ? logger.main(ENV.DEV) : false;',
        'const runtime = new ModuleRuntime();',
        bindings.length
            ? `runtime.registerAllDeep([${bindings.join(', ')}]);`
            : '// no modules in this preset',
        '',
        'const createWorker = createWorkerRuntime(',
        '    ENV, runtime, runtimeSource, log, logger.worker.toString(),',
        ');',
        'const domReady = readyState();',
        '',
        'const fw = { ENV, log, runtime, createWorker, domReady };',
    ];

    if (variant === 'classic') {
        lines.push(
            '',
            `if (typeof globalThis !== 'undefined' && !globalThis.${endpoint}) globalThis.${endpoint} = fw;`,
        );
    }

    lines.push('', 'export default fw;', '');

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, lines.join('\n'), 'utf8');
}

/**
 * @typedef {Object} GenSideBundleOptions
 * @property {string}                  name
 * @property {string[]}                moduleList
 * @property {Map<string, ModuleInfo>} catalog
 * @property {string}                  srcRoot
 * @property {string}                  outFile
 * @property {('pure'|'classic')}      variant
 * @property {string}                  [endpoint='fw']  Global property read in the `classic` variant.
 */

/**
 * Write the side-bundle entry file at `outFile`.
 *
 * @param {GenSideBundleOptions} opts
 */
export function generateSideBundleEntry({
    name, moduleList, catalog, srcRoot, outFile, variant, endpoint = 'fw',
}) {
    const outDir = dirname(outFile);

    const moduleImports = moduleList.map((modName) => {
        const info = catalog.get(modName);
        if (!info) throw new Error(`[entry-gen] unknown module "${modName}" in side-bundle "${name}"`);
        const path = posix(relative(outDir, info.file));
        return `import { ${info.bindingName} } from '${path}';`;
    });

    const bindings = moduleList.map((m) => catalog.get(m).bindingName);

    const lines = [
        `// AUTO-GENERATED — do not edit. Side-bundle : ${name}`,
        '',
        ...moduleImports,
        '',
        `const _mods = [${bindings.join(', ')}];`,
        '',
    ];

    if (variant === 'classic') {
        lines.push(
            `const fw = globalThis.${endpoint};`,
            "if (!fw || !fw.runtime) {",
            `    throw new Error('side-bundle "${name}": globalThis.${endpoint} not loaded — load a preset bundle first');`,
            '}',
            'fw.runtime.registerAllDeep(_mods);',
            '',
            'export default _mods;',
        );
    } else {
        lines.push(
            '/**',
            ` * Register every module of the "${name}" side-bundle on the given runtime.`,
            ' * @param {{ registerAllDeep: (mods: any[]) => any }} runtime',
            ' */',
            'export function install(runtime) {',
            '    runtime.registerAllDeep(_mods);',
            '}',
            '',
            'export const modules = _mods;',
            'export default _mods;',
        );
    }

    lines.push('');

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, lines.join('\n'), 'utf8');
}

/**
 * Normalise a system path to POSIX form for ES-module-friendly imports.
 * Also guarantees the result starts with `./` or `../` (never bare).
 *
 * @param {string} p
 * @returns {string}
 */
function posix(p) {
    let s = p.replace(/\\/g, '/');
    if (!s.startsWith('.')) s = './' + s;
    return s;
}
