// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Minimal static server for the playground projects.
 *
 *   node ../../_tools/serve.mjs <docroot> [--port <n>]
 *
 * Serves `<docroot>` (resolved from the current directory) on 127.0.0.1 only,
 * with the MIME types an ES-module page needs, no directory listing and no
 * extension rewriting: a request maps to exactly one file, `/` to
 * `index.html`. Port: `--port`, else `PORT`, else 4800. Replaces `npx serve`
 * so every project launches with no registry fetch at run time.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream',
};

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = Number(portFlag >= 0 ? args[portFlag + 1] : process.env.PORT || 4800);
const rootArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') || '.';
const root = path.resolve(rootArg);

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = path.join(root, urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath);
    if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
    }
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + urlPath);
            return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log('serving ' + root + ' at http://127.0.0.1:' + port + '/');
});
