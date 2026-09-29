// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/validate-deps.js
/**
 * @fileoverview Source-tree invariants enforced at every build. Ported
 * logic-verbatim from `packages/front/fw/tools/build/bundler/lib/validate-deps.js`
 * (only the shared-scanner import path is repointed to `../../modlib/`).
 *
 * Three checks, in order :
 *
 *   1. **`deps` ↔ `dependencies` per module.** Every module that declares
 *      non-empty `dependencies` MUST also declare `deps` with the same
 *      length, the same order, and matching names. The `deps` field holds
 *      the JS module references that make tree-shaking bundlers see the
 *      graph ; `dependencies` carries the runtime resolution contract
 *      (string specs, multi-version support). They must stay aligned.
 *
 *   2. **Each `dependencies` string references a known module.** Catches
 *      typos (`'parsr'` ↦ `'parser'`) before runtime. Multi-version specs
 *      (`'foo@1.2.3'`) are accepted as long as `'foo'` exists in the
 *      catalog ; version compatibility itself is not asserted here (the
 *      runtime does that at resolve time).
 *
 *   3. **`src/core/modules.js` matches the source-tree catalog.** The
 *      autonomous-mode catalog (default-export array) must contain exactly
 *      every fw module discovered by the scanner — no orphan, no missing
 *      entry. Catches forgotten registrations after adding a new module
 *      file.
 *
 * All three checks throw on the first violation with a precise message
 * including the offending file path.
 */

import { readFileSync } from 'node:fs';

import { scanAll } from '../../modlib/scan-modules.js';

/**
 * Extract the `deps` array entries as a list of binding identifiers in
 * declaration order. Returns `null` when the field is absent.
 *
 * @param {string} src
 * @returns {string[] | null}
 */
function extractDepsBindings(src) {
    const m = src.match(/(^|[\s,{])deps\s*:\s*\[([\s\S]*?)\]/);
    if (!m) return null;
    return m[2].split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Extract the default-export array binding names from `src/core/modules.js`.
 * Tolerant of whitespace and trailing commas.
 *
 * @param {string} src
 * @returns {string[]}
 */
function extractDefaultArrayBindings(src) {
    const m = src.match(/export\s+default\s*\[([\s\S]*?)\]\s*;?\s*$/m);
    if (!m) {
        throw new Error('[validate-deps] could not locate `export default [...]` in modules.js');
    }
    return m[1]
        .split(/[,\n]/)
        .map((s) => s.trim().replace(/\/\/.*$/, '').trim())
        .filter(Boolean);
}

/**
 * Run the deps ↔ dependencies invariant check across the entire `src/` tree,
 * the dependencies-string check, and the modules.js consistency check.
 *
 * @param {string} srcDir       Absolute path of `src/`.
 * @param {string} modulesPath  Absolute path of `src/core/modules.js`.
 * @returns {{ checked: number, withDeps: number, depFree: number }}
 */
export function validateAll(srcDir, modulesPath) {
    const { byName, byFile, unparseable } = scanAll(srcDir);

    if (unparseable.length) {
        throw new Error(
            `[validate-deps] ${unparseable.length} file(s) could not be parsed :\n  ` +
                unparseable.map((u) => u.file).join('\n  ')
        );
    }

    // ─── Pre-compute helpers ───
    const knownNames = new Set(byName.keys());

    let withDeps = 0;
    let depFree = 0;

    // ─── Check 1 & 2 : per-module ───
    for (const info of byFile.values()) {
        if (info.dependencies.length === 0) {
            depFree++;
            // Sanity : a module with empty `dependencies` shouldn't carry `deps`.
            if (info.hasDepsField) {
                throw new Error(
                    `[validate-deps] ${info.moduleName} declares an empty \`dependencies\` ` +
                        `but a non-empty \`deps\` field.\n  File: ${info.file}`
                );
            }
            continue;
        }

        // Check 2 : every dep string must reference a known module.
        for (const spec of info.dependencies) {
            const depName = spec.split('@')[0];
            if (!knownNames.has(depName)) {
                throw new Error(
                    `[validate-deps] ${info.moduleName} declares unknown dependency "${spec}".\n` +
                        `  File: ${info.file}\n` +
                        `  Fix : either correct the typo, or add the corresponding module under src/.`
                );
            }
        }

        // Check 1 : deps array invariant.
        if (!info.hasDepsField) {
            throw new Error(
                `[validate-deps] ${info.moduleName} has non-empty \`dependencies\` but no \`deps\` field.\n` +
                    `  File: ${info.file}\n` +
                    `  Fix : run \`bun cli.ts fw-codegen deps --pkg <package-dir>\` to populate.`
            );
        }

        const src = readFileSync(info.file, 'utf8');
        const bindings = extractDepsBindings(src);
        if (!bindings) {
            throw new Error(
                `[validate-deps] ${info.moduleName} : \`deps\` detected but could not be parsed.\n  File: ${info.file}`
            );
        }

        if (bindings.length !== info.depNames.length) {
            throw new Error(
                `[validate-deps] ${info.moduleName} : length mismatch — ` +
                    `dependencies has ${info.depNames.length} entries (${info.depNames.join(', ')}) ` +
                    `but deps has ${bindings.length} (${bindings.join(', ')}).\n  File: ${info.file}`
            );
        }

        for (let i = 0; i < bindings.length; i++) {
            if (bindings[i] !== info.depNames[i]) {
                throw new Error(
                    `[validate-deps] ${info.moduleName} : order/name mismatch at index ${i} — ` +
                        `dependencies[${i}] = "${info.depNames[i]}", deps[${i}] = "${bindings[i]}".\n` +
                        `  File: ${info.file}`
                );
            }
            if (!knownNames.has(bindings[i])) {
                throw new Error(
                    `[validate-deps] ${info.moduleName} : deps[${i}] = "${bindings[i]}" does not ` +
                        `match any module name in the catalog.\n  File: ${info.file}`
                );
            }
        }

        withDeps++;
    }

    // ─── Check 3 : modules.js consistency ───
    const modulesSrc = readFileSync(modulesPath, 'utf8');
    const declared = new Set(extractDefaultArrayBindings(modulesSrc));
    const expected = new Set(byName.keys());

    const orphans = [...declared].filter((n) => !expected.has(n));
    const missing = [...expected].filter((n) => !declared.has(n));

    if (orphans.length || missing.length) {
        const parts = [`[validate-deps] src/core/modules.js is out of sync with the source tree.`];
        if (missing.length) {
            parts.push(
                `  Missing from modules.js default export (declared in src/ but not listed) :\n    ` +
                    missing.join(', ')
            );
        }
        if (orphans.length) {
            parts.push(
                `  Orphans in modules.js default export (listed but not declared in src/) :\n    ` +
                    orphans.join(', ')
            );
        }
        parts.push('  Fix : update src/core/modules.js to match the source tree.');
        throw new Error(parts.join('\n'));
    }

    return { checked: byFile.size, withDeps, depFree };
}
