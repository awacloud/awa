// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/modlib/scan-modules.js
/**
 * @fileoverview Shared scanner that walks the `src/` tree and extracts module
 * metadata from every `export const <X> = { ... }` block matching the fw
 * module shape.
 *
 * Ported logic-verbatim from `packages/front/fw/tools/_lib/scan-modules.js`
 * (fw-tools mutualization W1a). The shared substrate consumed by the `bundle`
 * and `standalone` subcommands (and, via `@awacloud/tool-fw-bundler/modlib`, by
 * `@awacloud/tool-fw-codegen`).
 *
 * No JS parser dependency : the module shape across the codebase is
 * sufficiently regular for a tolerant block-extractor + targeted regex to
 * cover 100 % of files. The scanner is conservative — anything it can't
 * confidently parse is returned with `_unparseable: true` so the caller can
 * report instead of silently mis-rewriting.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Directories under `src/` that NEVER contain module definitions, so we skip
 * them entirely for both performance and false-positive avoidance.
 */
const SKIP_DIRS = new Set([
    'core',       // runtime/logger/readyState/worker-helper/modules.js
    'sanity',     // IIFE script, not a module
    'polyfill',
    'external',
]);

/**
 * @typedef {Object} ModuleInfo
 * @property {string}   file              Absolute path of the module's source file.
 * @property {string}   bindingName       The JS export binding (e.g. `sanitize`).
 * @property {string}   moduleName        The framework module name (from `name:` field, or fallback).
 * @property {string[]} dependencies      Dependency specs as written (may include `@version`).
 * @property {string[]} depNames          Dependency names stripped of any `@version` suffix.
 * @property {boolean}  hasDepsField      Whether the source already declares a `deps` field.
 * @property {number}   blockStart        Offset of the opening `{` of the module object literal.
 * @property {number}   blockEnd          Offset just past the matching closing `}`.
 * @property {number}   dependenciesEnd   Offset just past `dependencies: [...]` (used for injection).
 * @property {boolean}  [_unparseable]    Set if the block could not be safely analysed.
 */

/**
 * Walk a directory recursively, yielding absolute paths of `.js` files that
 * are not test files and not under skip-listed top-level dirs.
 *
 * @param {string} rootDir  Absolute path of the directory to walk (typically `src/`).
 * @returns {string[]}
 */
export function listSourceFiles(rootDir) {
    /** @type {string[]} */
    const out = [];
    const visit = (dir, depthFromRoot) => {
        for (const ent of readdirSync(dir)) {
            const p = join(dir, ent);
            const s = statSync(p);
            if (s.isDirectory()) {
                if (depthFromRoot === 0 && SKIP_DIRS.has(ent)) continue;
                visit(p, depthFromRoot + 1);
            } else if (
                ent.endsWith('.js') &&
                !ent.endsWith('.test.js') &&
                !ent.endsWith('.kat.js') &&
                ent !== 'main.js' // top-level entry, no module def
            ) {
                out.push(p);
            }
        }
    };
    visit(rootDir, 0);
    return out;
}

/**
 * Locate the matching closing brace for the `{` at `startIdx` inside `src`.
 * Skips string literals (single, double, backtick) to avoid being fooled by
 * `{` inside strings or template literals.
 *
 * @param {string} src
 * @param {number} startIdx  Index of the opening `{`.
 * @returns {number} Index just past the matching `}`.
 */
function findMatchingBrace(src, startIdx) {
    let depth = 1;
    let i = startIdx + 1;
    while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            i++;
            while (i < src.length && src[i] !== quote) {
                if (src[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') {
            // single-line comment
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
    }
    return i;
}

/**
 * Parse a single source file and return zero or one ModuleInfo objects.
 * (A module file is expected to declare exactly one fw module ; if multiple
 * `export const X = { factory: ... }` blocks exist we return the first one
 * that looks valid and log a warning, which surfaces non-canonical files.)
 *
 * @param {string} file  Absolute path.
 * @returns {ModuleInfo | null}
 */
export function parseFile(file) {
    const src = readFileSync(file, 'utf8');
    const exportRe = /export\s+const\s+(\w+)\s*=\s*\{/g;
    let m;
    while ((m = exportRe.exec(src)) !== null) {
        const bindingName = m[1];
        const openBrace = src.indexOf('{', m.index);
        const blockEnd = findMatchingBrace(src, openBrace);
        const block = src.slice(openBrace, blockEnd);

        // Skip blocks that clearly aren't a module definition.
        if (!/\bfactory\s*[(:]/.test(block)) continue;

        // Extract the `name:` string literal if present, else fall back to binding.
        const nameMatch = block.match(/(^|[\s,{])name\s*:\s*['"]([^'"]+)['"]/);
        const moduleName = nameMatch ? nameMatch[2] : bindingName;

        // Extract `dependencies: [...]` — must be a flat array of string literals.
        const depsField = block.match(
            /(^|[\s,{])dependencies\s*:\s*\[([\s\S]*?)\]/
        );
        const dependencies = depsField
            ? depsField[2]
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                    const lit = s.match(/^['"]([^'"]+)['"]$/);
                    return lit ? lit[1] : null;
                })
            : [];
        // If any entry could not be parsed as a string literal, abort cleanly.
        if (dependencies.some((d) => d === null)) {
            return {
                file, bindingName, moduleName,
                dependencies: [], depNames: [],
                hasDepsField: false,
                blockStart: openBrace, blockEnd, dependenciesEnd: -1,
                _unparseable: true,
            };
        }

        const depNames = /** @type {string[]} */ (dependencies).map(
            (s) => s.split('@')[0]
        );

        const hasDepsField = /(^|[\s,{])deps\s*:\s*\[/.test(block);

        // Compute absolute offset of the closing `]` of `dependencies`, used
        // by the codegen for surgical injection of the `deps: [...]` field.
        let dependenciesEnd = -1;
        if (depsField) {
            const localStart = depsField.index + depsField[1].length;
            const closingBracket = block.indexOf(']', localStart);
            dependenciesEnd = openBrace + closingBracket + 1;
        }

        return {
            file,
            bindingName,
            moduleName,
            dependencies: /** @type {string[]} */ (dependencies),
            depNames,
            hasDepsField,
            blockStart: openBrace,
            blockEnd,
            dependenciesEnd,
        };
    }
    return null;
}

/**
 * Build the complete module catalog by walking `srcDir`.
 *
 * @param {string} srcDir  Absolute path of `src/`.
 * @returns {{
 *   byName: Map<string, ModuleInfo>,
 *   byFile: Map<string, ModuleInfo>,
 *   unparseable: ModuleInfo[],
 * }}
 */
export function scanAll(srcDir) {
    const byName = new Map();
    const byFile = new Map();
    const unparseable = [];
    for (const file of listSourceFiles(srcDir)) {
        const info = parseFile(file);
        if (!info) continue;
        if (info._unparseable) {
            unparseable.push(info);
            continue;
        }
        if (byName.has(info.moduleName)) {
            const prev = byName.get(info.moduleName);
            throw new Error(
                `[scan-modules] duplicate module name "${info.moduleName}" :\n` +
                    `  ${prev.file}\n  ${file}`
            );
        }
        byName.set(info.moduleName, info);
        byFile.set(file, info);
    }
    return { byName, byFile, unparseable };
}

/**
 * Compute the POSIX-relative import path from `fromFile` to `toFile`,
 * preserving the `.js` extension. Always starts with `./` or `../`.
 *
 * @param {string} fromFile  Absolute path of the importer.
 * @param {string} toFile    Absolute path of the importee.
 * @returns {string}
 */
export function relativeImport(fromFile, toFile) {
    const fromDir = resolve(fromFile, '..');
    let rel = relative(fromDir, toFile).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}
