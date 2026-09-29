// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/preview-static-server.mjs
/**
 * @fileoverview Zero-dependency in-process static host for the preview gate.
 *
 * Mirrors the `services/acvp` browser-runner host: a plain `node:http` server
 * bound to `127.0.0.1`, no `npx serve` (a network dependency whose docroot and
 * rewrite behaviour are version-dependent, FINDINGS §2.1 REJECTED).
 *
 * The `overrides` map is the seam the sentinel falsification leg needs: one URL
 * is answered from memory while every sibling asset still comes from the real
 * tree, so the injected `throw` is the ONLY difference between the red and the
 * green run. `npx serve` offers no such seam.
 *
 * No side effect at import; `startStaticServer()` is the only entry point.
 */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

/** Minimal extension → content-type map (playground assets only). */
const MIME = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.cjs': 'text/javascript; charset=utf-8',
    '.ts': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
});

/**
 * @param {string} filePath
 * @returns {string} content-type header value
 */
export function contentTypeFor(filePath) {
    return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * @typedef {Object} Override
 * @property {string|Buffer} body        Bytes served for this exact pathname.
 * @property {string} [contentType]      Defaults to the pathname's own type.
 */

/**
 * @typedef {Object} StaticServerHandle
 * @property {string} origin             e.g. `http://127.0.0.1:4801`
 * @property {number} port
 * @property {string} root               Absolute docroot.
 * @property {() => Promise<void>} close Resolves once the socket is released.
 */

/**
 * Start the static host.
 *
 * @param {{root: string, port: number, host?: string, overrides?: Record<string, Override>}} opts
 * @returns {Promise<StaticServerHandle>}
 * @throws {Error} when the port cannot be bound (caller maps that to INCONCLUSIVE)
 */
export function startStaticServer({ root, port, host = '127.0.0.1', overrides = {} }) {
    const docroot = resolve(root);

    const server = createServer((req, res) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${host}:${port}`).pathname);
        } catch {
            res.writeHead(400).end('bad request');
            return;
        }

        const override = overrides[pathname];
        if (override) {
            const body = override.body;
            res.writeHead(200, {
                'content-type': override.contentType ?? contentTypeFor(pathname),
                'content-length': Buffer.byteLength(body),
                'cache-control': 'no-store',
            });
            res.end(body);
            return;
        }

        if (pathname.endsWith('/')) pathname += 'index.html';

        // Clamp inside the docroot: a `..` escape must 403, never read outside.
        const target = join(docroot, normalize(pathname).replace(/^([/\\])+/, ''));
        if (target !== docroot && !target.startsWith(docroot + sep)) {
            res.writeHead(403).end('forbidden');
            return;
        }

        let stat;
        try {
            stat = statSync(target);
        } catch {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
            return;
        }
        if (stat.isDirectory()) {
            res.writeHead(301, { location: `${pathname}/` }).end();
            return;
        }

        res.writeHead(200, {
            'content-type': contentTypeFor(target),
            'content-length': stat.size,
            'cache-control': 'no-store',
        });
        createReadStream(target).pipe(res);
    });

    return new Promise((resolvePromise, rejectPromise) => {
        const onError = (err) => {
            server.removeListener('listening', onListening);
            rejectPromise(new Error(`[preview] static server could not bind ${host}:${port} — ${err.message}`, { cause: err }));
        };
        const onListening = () => {
            server.removeListener('error', onError);
            resolvePromise({
                origin: `http://${host}:${port}`,
                port,
                root: docroot,
                close: () =>
                    new Promise((done) => {
                        server.closeAllConnections?.();
                        server.close(() => done());
                    }),
            });
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}
