// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * The API pages name only keys the module has: every key a page lists in
 * its `// Returns: { … }` line, and every key of a sub-domain README's API
 * cell, is a public key of the module's resolved API in the frozen snapshot
 * (`docs/api/surface.json`). The `_` keys are outside the contract and not
 * checked (a page may name a variant's `_internal` at the module level).
 */

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SNAPSHOT } from '../tools/api-surface.js';

const surface = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const API = path.join(ROOT, 'docs', 'api');
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []));

/** @param {string} name @returns {Set<string>|null} the public keys, or null for an unknown module */
function keysOf(name) {
    const m = surface.modules[name];
    if (!m) return null;
    const a = m.api;
    return new Set(typeof a === 'object' ? Object.keys(a.keys || {}) : []);
}

/** @param {string} list @returns {string[]} the identifiers of a `{a, b: …, c}` list */
const idents = (list) => list.split(',').map((k) => k.trim().split(':')[0].trim()).filter((k) => IDENT.test(k) && !k.startsWith('_'));

describe('docs/api pages name only keys the modules have', () => {
    test('every `// Returns: { … }` key exists in the snapshot', () => {
        const bad = [];
        for (const f of walk(API)) {
            const text = fs.readFileSync(f, 'utf8');
            for (const m of text.matchAll(/resolve\('(\w+)'\)[^\n]*\n(?:\/\/[^\n]*\n)*?\/\/\s*Returns:\s*\{([^}]*)\}/g)) {
                const keys = keysOf(m[1]);
                if (!keys) { bad.push(`${path.relative(ROOT, f)}: unknown module ${m[1]}`); continue; }
                const extra = idents(m[2].replace(/\n\/\/\s*/g, ' ')).filter((k) => !keys.has(k));
                if (extra.length) bad.push(`${path.relative(ROOT, f)}: ${m[1]} has no ${extra.join(', ')}`);
            }
        }
        expect(bad).toEqual([]);
    });

    test('every key of a sub-domain README API cell exists in the snapshot', () => {
        const bad = [];
        for (const f of walk(API).filter((f) => path.basename(f) === 'README.md')) {
            for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
                const m = /^\|\s*\[(\w+)\]\([^)]*\)\s*\|\s*`\{([^}]*)\}`/.exec(line);
                if (!m) continue;
                const keys = keysOf(m[1]);
                if (!keys) continue; // a wasm / webcrypto row names its own module page
                const extra = idents(m[2]).filter((k) => !keys.has(k));
                if (extra.length) bad.push(`${path.relative(ROOT, f)}: ${m[1]} has no ${extra.join(', ')}`);
            }
        }
        expect(bad).toEqual([]);
    });
});
