// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Build step 4/4 (`bun run build`): bundle the service worker
 * into the dist. `public/sw.js` imports fw's `cache` module by a repository
 * path — fine in development, unreachable in a dist — so the dist gets a
 * self-contained bundle (the demos' `bundleWorker`, no import left), stamped
 * with a content version so a new release replaces the old cache, and the
 * app-shell list it pre-caches at install.
 *
 * Usage: `bun tools/build-sw.js [--dist dist]` from the app directory.
 *
 * @module viewer/tools/build-sw
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundleWorker, walk } from '../../../demo/_build/bundle-js.js';

const app = resolve(import.meta.dir, '..');
const args = process.argv.slice(2);
const at = args.indexOf('--dist');
const dist = resolve(at >= 0 && args[at + 1] ? args[at + 1] : join(app, 'dist'));

// What to pre-cache, relative to the worker: every file the page needs to
// run AND the licence texts (LICENSE, NOTICE, legal/, the vendored
// packages' own licence files), so the About panel opens them offline. The
// vendored package sources stay out: the bundle already holds the code.
// `_headers.json` is the hosting's header rules: the site host never serves
// it (404), so pre-caching it would fail the worker's install.
const files = walk(dist).filter((f) => f !== 'sw.js' && f !== '_headers.json');
const licenceFile = (f) => /^(LICEN[CS]E|NOTICE|COPYING)/i.test(f.split('/').pop() || '');
// The install-dialog screenshots are fetched by the browser at install, online, and
// the samples when asked (then kept by the worker): neither is pre-cached.
const shell = files.filter((f) => (!f.startsWith('vendor/') || licenceFile(f)) && !/^(screenshots|samples)\//.test(f));
const precache = ['./', ...shell.filter((f) => f !== 'index.html')];

// The About panel lists the licence files of this release: the page's own
// LICENSE and NOTICE (their dist paths), then every third-party one. Written
// before the version is hashed, so the version covers the page as served.
const page = join(dist, 'index.html');
const html = readFileSync(page, 'utf8');
const LIST_END = /(<ul id="app-about-files"[^>]*>[\s\S]*?)(\n\s*<\/ul>)/;
if (!LIST_END.test(html)) throw new Error('build-sw: index.html has no ul#app-about-files');
const thirdParty = shell.filter((f) => licenceFile(f) && f.includes('/')).sort();
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
writeFileSync(page, html
    .replace(/href="\.\.\/(LICENSE|NOTICE)"/g, 'href="$1"')
    .replace(LIST_END, (_, list, end) => list + thirdParty
        .map((f) => `\n            <li><a href="${escape(f)}">${escape(f)}</a></li>`).join('') + end));

// The version: 12 hex of the hash of every dist file but the worker itself.
const hash = createHash('sha256');
for (const file of [...files].sort()) hash.update(file).update('\u0000').update(readFileSync(join(dist, file)));
const version = hash.digest('hex').slice(0, 12);

const source = readFileSync(join(app, 'public', 'sw.js'), 'utf8');
for (const name of ['__AWA_VIEWER_VERSION__', '__AWA_VIEWER_PRECACHE__']) {
    if (!source.includes(name)) throw new Error(`build-sw: public/sw.js no longer reads ${name}`);
}
const { bytes } = await bundleWorker({
    entryFile: join(app, 'public', 'sw.js'),
    outFile: join(dist, 'sw.js'),
    define: { __AWA_VIEWER_VERSION__: JSON.stringify(version), __AWA_VIEWER_PRECACHE__: JSON.stringify(precache) },
    banner: '/*! AWA Viewer service worker. Includes @awacloud/fw (Apache-2.0; vendor/fw/LICENSE, vendor/fw/NOTICE). */'
});
process.stdout.write(`build-sw: sw.js ${bytes} bytes, version ${version}, ${precache.length} pre-cached URL(s)\n`);
