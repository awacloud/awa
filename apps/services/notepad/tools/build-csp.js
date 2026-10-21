// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Build step 3/4 (`bun run build`): give the dist page a
 * Content Security Policy, so "nothing leaves the device" holds by
 * construction — the page may only talk to its own origin, load no frame or
 * plugin, and run no script but its bundle and its import map (allowed by
 * hash: the map stays inline as the licensing manifest). Same policy as the
 * viewer's (`apps/services/viewer/tools/build-csp.js`); the hash is fw's
 * (`webcryptoDigest` + `b64`).
 *
 * Styles: the controller sets the text size through the CSSOM
 * (`style.setProperty`), which CSP does not govern, so `style-src 'self'`
 * holds without `'unsafe-inline'`. Images: `blob:` is the download link of
 * a saved file; `data:` covers icons inlined by a host.
 *
 * The hosting sends the same policy as a header, plus what a `<meta>` cannot
 * carry: `dist/_headers.json` (read by `services/site-host`, see its README)
 * holds the policy with `frame-ancestors 'none'`, `nosniff`, `no-referrer`, a
 * `Permissions-Policy` turning off the device features the app never uses,
 * `Cross-Origin-Opener-Policy: same-origin`, and `Cache-Control: no-cache`
 * on `/sw.js` so an update check always reaches the server (apps review P6,
 * PWA survey § updates). The header policy is derived from the meta one,
 * never a second copy of it.
 *
 * Usage: `bun tools/build-csp.js [--dist dist]` from the app directory.
 *
 * @module notepad/tools/build-csp
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ModuleRuntime } from '../../../../packages/front/fw/src/core/runtime.js';
import { webcryptoDigest } from '../../../../packages/front/fw/src/crypto/webcrypto/digest.js';
import { b64 } from '../../../../packages/front/fw/src/io/codec/b64.js';
import { utf8 } from '../../../../packages/front/fw/src/io/codec/utf8.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep([webcryptoDigest, b64, utf8]);

const app = resolve(import.meta.dir, '..');
const args = process.argv.slice(2);
const at = args.indexOf('--dist');
const dist = resolve(at >= 0 && args[at + 1] ? args[at + 1] : join(app, 'dist'));
const page = join(dist, 'index.html');
const html = readFileSync(page, 'utf8');

const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
if (!map) throw new Error('build-csp: dist/index.html has no inline import map');
if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error('build-csp: the page already carries a CSP');
const digest = await runtime.resolve('webcryptoDigest').sha256(runtime.resolve('utf8').toBytes(map[1]));
if (!digest) throw new Error('build-csp: SHA-256 is not available');
const mapHash = runtime.resolve('b64').fromBytes(digest);

const policy = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${mapHash}'`,
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
].join('; ');

// First in <head>, before the import map it allows.
const out = html.replace(/<head>(\s*)/, `<head>$1<meta http-equiv="Content-Security-Policy" content="${policy}">$1`);
if (out === html) throw new Error('build-csp: no <head> to place the policy in');
// The canonical link: an external URL, which app-dist refuses in the source
// page, so it is added here, after it — the public address is og:url's.
const url = /<meta property="og:url" content="(https:\/\/[^"]+)">/.exec(out)?.[1];
if (!url) throw new Error('build-csp: the page has no og:url to make its canonical link from');
writeFileSync(page, out.replace('<meta property="og:type"', `<link rel="canonical" href="${url}">\n    <meta property="og:type"`));

// The header rules: the meta policy plus frame-ancestors (ignored in a meta).
const headerRules = {
    version: 1,
    rules: [
        { path: '/sw.js', headers: { 'cache-control': 'no-cache' } },
        {
            path: '*',
            headers: {
                'content-security-policy': `${policy}; frame-ancestors 'none'`,
                'x-content-type-options': 'nosniff',
                'referrer-policy': 'no-referrer',
                'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=()',
                'cross-origin-opener-policy': 'same-origin'
            }
        }
    ]
};
writeFileSync(join(dist, '_headers.json'), `${JSON.stringify(headerRules, null, 2)}\n`);
process.stdout.write(`build-csp: index.html — ${policy.length} chars, import map sha256-${mapHash}; _headers.json — ${headerRules.rules.length} rules\n`);
