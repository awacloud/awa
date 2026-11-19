// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview One spelling for every fw specifier in the package.
 *
 * fw's `exports` declares each subpath twice (`./core/runtime` and the
 * `./core/runtime.js` twin). A package that mixes the two forces every
 * browser import map to declare both keys, since an import map matches a
 * specifier exactly. This package writes the `.js` form everywhere: its
 * source, JSDoc types, demos, playground pages and docs samples. The guard
 * scans those trees for `@awacloud/fw/…` tokens and requires each one to
 * end in `.js` and to name a subpath fw's `exports` declares (`./src/*` is
 * not one). A token ending in `/` is the import-map prefix form, allowed.
 * Dated records (archived outside the package) and the test suite, which
 * holds deliberate negative controls, are outside the scan.
 */

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PKG = join(import.meta.dir, '..');
const FW = JSON.parse(readFileSync(join(PKG, '..', '..', 'fw', 'package.json'), 'utf8'));

/** The scanned trees and files, relative to the package. */
const ROOTS = ['src', 'demos', 'playground', 'docs', 'README.md'];
const EXT = /\.(js|mjs|html|md|json)$/;

function walk(p) {
    if (!existsSync(p)) return [];
    if (!statSync(p).isDirectory()) return EXT.test(p) ? [p] : [];
    return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory() && e.name === 'node_modules') return [];
        return walk(join(p, e.name));
    });
}

/** Does fw's `exports` declare this subpath (exact key or `*` pattern)? */
function declared(subpath) {
    for (const key of Object.keys(FW.exports)) {
        if (key === subpath) return true;
        if (key.includes('*')) {
            const [pre, post] = key.split('*');
            if (subpath.startsWith(pre) && subpath.endsWith(post) && subpath.length >= pre.length + post.length) return true;
        }
    }
    return false;
}

const TOKEN = /@awacloud\/fw\/[A-Za-z0-9_./-]*/g;

function collect() {
    const out = [];
    for (const root of ROOTS) {
        for (const file of walk(join(PKG, root))) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(TOKEN)) {
                const token = m[0].replace(/[.]+$/, (dots) => (m[0].endsWith('.js') ? dots : ''));
                const line = text.slice(0, m.index).split('\n').length;
                out.push({ where: `${relative(PKG, file).replace(/\\/g, '/')}:${line}`, token });
            }
        }
    }
    return out;
}

describe('fw specifiers: one spelling, all declared', () => {
    const tokens = collect();

    test('the scan sees the corpus', () => {
        expect(tokens.length).toBeGreaterThan(20);
    });

    test('every fw specifier ends in .js and is declared by fw exports', () => {
        const bad = tokens
            .filter(({ token }) => !token.endsWith('/'))
            .filter(({ token }) => !token.endsWith('.js') || !declared(`./${token.slice('@awacloud/fw/'.length)}`))
            .map(({ where, token }) => `${where} ${token}`);
        expect(bad).toEqual([]);
    });

    test('the matcher is not vacuous', () => {
        expect(declared('./core/runtime.js')).toBe(true);
        expect(declared('./src/core/runtime.js')).toBe(false);
    });
});
