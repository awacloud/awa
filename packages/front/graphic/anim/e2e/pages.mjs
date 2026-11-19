// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The pages the browser smoke loads, discovered from disk.
 *
 * Every `demos/<slug>/index.html` and `playground/<slug>/index.html` (an
 * underscore-prefixed directory is family plumbing, not a page) is an ENTRY
 * page: it sets `data-ready="1"` on `<html>` two animation frames after its
 * `run()` resolved. The two family index pages are static and are waited on
 * `load`. Discovery, not a list, so a new page cannot be left out silently.
 *
 * Pure: `node:fs`/`node:path` only, no side effect at import.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The package directory, as a repo-root-relative URL path. */
export const PKG_URL = '/packages/front/graphic/anim';

/**
 * @typedef {Object} SmokePage
 * @property {string} url Path on the static server (repo-root docroot).
 * @property {boolean} ready True when the page publishes `data-ready`.
 */

/**
 * List the smoke's pages.
 *
 * @param {string} pkgDir Absolute path of the package directory.
 * @returns {SmokePage[]}
 */
export function discoverPages(pkgDir) {
    /** @type {SmokePage[]} */
    const pages = [];
    for (const family of ['demos', 'playground']) {
        const root = join(pkgDir, family);
        if (existsSync(join(root, 'index.html'))) pages.push({ url: `${PKG_URL}/${family}/index.html`, ready: false });
        for (const slug of readdirSync(root).sort()) {
            if (slug.startsWith('_') || slug.startsWith('.')) continue;
            const dir = join(root, slug);
            if (statSync(dir).isDirectory() && existsSync(join(dir, 'index.html'))) {
                pages.push({ url: `${PKG_URL}/${family}/${slug}/index.html`, ready: true });
            }
        }
    }
    return pages;
}
