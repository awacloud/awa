// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Zero-dependency static server for the browser smoke.
 *
 * Docroot is the REPO root: the pages need `packages/front/fw/src/**` and
 * this package under one origin. `overrides` is the sentinel seam: a
 * `Map<urlPath, body>` served instead of the file at the same URL, so a fault
 * reaches the browser without touching a file on disk.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
};

/**
 * Start the server.
 *
 * @param {{ root: string, port: number, overrides?: Map<string, string> }} opts
 * @returns {Promise<{ url: string, close(): Promise<void> }>} Rejects with the
 *   listen error (e.g. `EADDRINUSE`) when the port is taken.
 */
export function startServer({ root, port, overrides = new Map() }) {
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (overrides.has(path)) {
            res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
            res.end(overrides.get(path));
            return;
        }
        const file = normalize(join(root, path));
        if (!file.startsWith(normalize(root + sep))) {
            res.writeHead(403).end();
            return;
        }
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${port}`,
            close: () => new Promise((r) => server.close(() => r())),
        }));
    });
}
