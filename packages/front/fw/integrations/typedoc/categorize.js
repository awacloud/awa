// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/typedoc/categorize.js
/**
 * @fileoverview TypeDoc pre-processing — inject `@category` into the generated
 * `dist/types/**.d.ts` so TypeDoc's index groups modules by the framework
 * taxonomy instead of dumping everything under "Other".
 *
 * Why : TypeDoc groups top-level modules by their `@category`/`@group` JSDoc
 * tag. The fw sources carry the taxonomy in each module's `type` field
 * (`type: 'fw.io.codec'`) but NOT as a file-level `@category` tag, so without
 * this step only the single hand-tagged module (`notifications`) gets a group.
 *
 * What : for every emitted `.d.ts`, derive the category from the matching
 * source module's `type` (`fw.io.codec` → `io/codec`), falling back to the
 * file's directory, and prepend a file-level `/** @category … *​/` block.
 * Runs in `docs:api` AFTER `bun run types` (fresh, untagged `.d.ts`) and BEFORE
 * `typedoc`. Idempotent : files that already declare `@category`/`@module`
 * (e.g. `notifications`) are left untouched.
 *
 * Operates ONLY on the generated `dist/types/` tree — never edits `src/`.
 * Pure `node:*` APIs → runs under bun or Node.
 *
 * @see ./typedoc.json
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..', '..');
const TYPES_DIR = resolve(PKG_ROOT, 'dist', 'types');
const SRC_DIR = resolve(PKG_ROOT, 'src');

/** Recursively list `*.d.ts` under `dir` (skipping `.test.d.ts`). */
function listDts(dir) {
    /** @type {string[]} */
    const out = [];
    for (const ent of readdirSync(dir)) {
        const p = join(dir, ent);
        if (statSync(p).isDirectory()) out.push(...listDts(p));
        else if (ent.endsWith('.d.ts') && !ent.endsWith('.test.d.ts') && !ent.endsWith('.kat.d.ts')) out.push(p);
    }
    return out;
}

/**
 * Derive a TypeDoc category from the module's `type` field, else from the
 * file's directory under `dist/types/`.
 * @param {string} relPath  POSIX path of the `.d.ts` relative to `dist/types`.
 * @param {(string|null)} srcType  Value of the source module's `type` field.
 * @returns {string}
 */
function categoryFor(relPath, srcType) {
    if (srcType) {
        const c = srcType.replace(/^fw\./, '').replace(/\./g, '/').trim();
        if (c) return c;
    }
    const dir = dirname(relPath).replace(/\\/g, '/');
    return dir === '.' ? 'core' : dir;
}

/**
 * Extract the module's taxonomy `type` (`fw.<...>`) from a source file — NOT
 * nested `type:` props (`{ type: 'audio' }`, MIME strings, `type: 'Map'`).
 * @param {string} srcJsPath
 * @returns {(string|null)}
 */
function readSrcType(srcJsPath) {
    let src;
    try { src = readFileSync(srcJsPath, 'utf8'); }
    catch { return null; }
    const m = src.match(/(^|[\s,{])type\s*:\s*['"](fw\.[^'"]+)['"]/);
    return m ? m[2] : null;
}

/**
 * Make a `.d.ts` carry authoritative module tags : strip ANY existing
 * `@module`/`@category` from its leading comment and (re)insert
 * `@module <path>` + `@category <derived>`. Authoritative on purpose — it
 * overrides whatever the source happens to declare (flat names, wrong
 * categories), so the index grouping is uniform regardless of source JSDoc.
 *
 * `@module` is named by PATH (`io/codec/cbor`) so it stays distinct from the
 * inner namespace (`cbor`). Tags are inserted INTO the existing leading block
 * (preserving its description) when there is one, else a fresh block is
 * prepended.
 *
 * @param {string} content @param {string} modPath @param {string} category
 * @returns {string}
 */
function applyModuleTags(content, modPath, category) {
    const bom = content.startsWith('﻿') ? '﻿' : '';
    let body = bom ? content.slice(1) : content;
    // Drop any pre-existing @module/@category JSDoc lines (avoid dupes on rerun).
    body = body.replace(/^[ \t]*\*[ \t]*@(?:module|category)\b[^\n]*\r?\n/gm, '');
    // Prepend a STANDALONE module comment. Kept separate from any existing
    // declaration comment (e.g. a `@typedef`/function doc) so we never hijack
    // that declaration's description as the module summary — TypeDoc still
    // treats an `@module` comment as the module's own doc.
    return `${bom}/**\n * @module ${modPath}\n * @category ${category}\n */\n\n${body}`;
}

function main() {
    let tagged = 0;
    for (const dts of listDts(TYPES_DIR)) {
        const content = readFileSync(dts, 'utf8');
        const relPath = relative(TYPES_DIR, dts).replace(/\\/g, '/');
        const srcJs = resolve(SRC_DIR, relPath.replace(/\.d\.ts$/, '.js'));
        const category = categoryFor(relPath, readSrcType(srcJs));
        const modPath = relPath.replace(/\.d\.ts$/, '');
        const next = applyModuleTags(content, modPath, category);
        if (next !== content) { writeFileSync(dts, next, 'utf8'); tagged++; }
    }
    console.log(`[typedoc/categorize] applied authoritative @module/@category to ${tagged} module(s).`);
}

main();
