// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The explicit async byte path of `@awacloud/oconv-fonts`.
 *
 * A browser cannot read font files synchronously, and embedding the payload
 * as base64 JS is rejected (tarball x1.33, parse cost), so the five faces the
 * default route uses are fetched on demand, relative to this module's own URL
 * (`../vendor/liberation/`). Bun and browsers read them through `fetch` (a
 * `file:` URL under Bun, measured on Bun 1.3.13; an `http(s):` URL in a
 * browser). Node.js's `fetch` refuses `file:` URLs, so a `file:` face whose
 * fetch fails is read through `node:fs/promises` instead — imported
 * dynamically on that path only, so a browser never loads it and nothing is
 * read at import time.
 *
 * Face mapping: Sans for the four text classes, Mono for `code` — the
 * Liberation metric twins of Helvetica x4 + Courier.
 */

import { createOconvDefaultFaces } from './faces.js';

/** Frozen face-map key → vendored file name. */
const FACE_FILES = Object.freeze({
    regular: 'LiberationSans-Regular.ttf',
    bold: 'LiberationSans-Bold.ttf',
    italic: 'LiberationSans-Italic.ttf',
    boldItalic: 'LiberationSans-BoldItalic.ttf',
    mono: 'LiberationMono-Regular.ttf'
});

/**
 * Directory URL holding the five `.ttf` files.
 *
 * @param {{baseUrl?: string|URL}} [opts]
 * @returns {URL} Always ends with `/`.
 */
function baseUrlOf(opts) {
    if (!opts || opts.baseUrl === undefined || opts.baseUrl === null) {
        return new URL('../vendor/liberation/', import.meta.url);
    }
    const url = new URL(String(opts.baseUrl), import.meta.url);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
}

/**
 * Read one whole font program from the file system — the `file:` fallback for
 * a runtime whose `fetch` refuses `file:` URLs (Node.js).
 *
 * @param {URL} url A `file:` URL.
 * @returns {Promise<Uint8Array>}
 * @throws {Error} `oconv-fonts: cannot load <url> (...)` when the file cannot be
 *   read (including a runtime without `node:fs`) or is empty.
 */
async function readFaceFile(url) {
    let bytes;
    try {
        const { readFile } = await import('node:fs/promises');
        bytes = new Uint8Array(await readFile(url));
    } catch (err) {
        throw new Error(`oconv-fonts: cannot load ${url.href} (${err && err.message})`, { cause: err });
    }
    if (bytes.byteLength === 0) {
        throw new Error(`oconv-fonts: cannot load ${url.href} (empty file)`);
    }
    return bytes;
}

/**
 * Fetch one whole font program.
 *
 * Bun resolves `fetch()` of a MISSING `file:` URL with `ok: true, status: 200`
 * and only rejects (`ENOENT`) when the body is read, so the body read is
 * inside the guarded block and an empty body also counts as a failure.
 * Whenever the fetch path fails for a `file:` URL (rejection, non-2xx status,
 * unreadable or empty body), the face is read by {@link readFaceFile} instead.
 *
 * @param {URL} url
 * @returns {Promise<Uint8Array>}
 * @throws {Error} `oconv-fonts: cannot load <url> (...)` on a network error, a
 *   non-2xx status, an unreadable body or an empty body (for a `file:` URL:
 *   when the file-system read fails too).
 */
async function readFace(url) {
    let status;
    let bytes = null;
    let failure = null;
    try {
        const res = await fetch(url);
        status = res.status;
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
        failure = err;
    }
    if (bytes !== null && bytes.byteLength > 0) return bytes;
    if (url.protocol === 'file:') return readFaceFile(url);
    if (failure !== null) {
        throw new Error(`oconv-fonts: cannot load ${url.href} (${failure && failure.message})`, { cause: failure });
    }
    throw new Error(`oconv-fonts: cannot load ${url.href} (status ${status}, ${bytes ? 0 : 'no'} bytes)`);
}

/**
 * Load the five vendored Liberation faces the default route uses.
 *
 * @param {{baseUrl?: string|URL}} [opts] `baseUrl` — the directory serving the
 *   five `.ttf` files, for an application that serves `vendor/liberation/`
 *   elsewhere (resolved against this module's URL, so an absolute or a
 *   root-relative value is the expected form; a missing trailing `/` is added).
 * @returns {Promise<Readonly<import('./faces.js').OconvDefaultFaceMap>>} The
 *   frozen `{ regular, bold, italic, boldItalic, mono }` map of `Uint8Array`.
 * @throws {Error} `oconv-fonts: cannot load <url> (...)` — see {@link readFace}.
 */
export async function loadDefaultFaces(opts) {
    const base = baseUrlOf(opts);
    const keys = Object.keys(FACE_FILES);
    const loaded = await Promise.all(keys.map((key) => readFace(new URL(FACE_FILES[key], base))));
    const map = {};
    keys.forEach((key, i) => { map[key] = loaded[i]; });
    return Object.freeze(map);
}

/**
 * Load the default faces and register the `oconvDefaultFaces` descriptor on an
 * `@awacloud/fw` runtime (`ModuleRuntime#register`).
 *
 * @param {{register: Function}} runtime An `@awacloud/fw` `ModuleRuntime`.
 * @param {{baseUrl?: string|URL}} [opts] Forwarded to {@link loadDefaultFaces}.
 * @returns {Promise<*>} What `runtime.register` returns (the runtime, chainable).
 * @throws {Error} Any {@link loadDefaultFaces} error; the descriptor is not
 *   registered when loading fails.
 */
export async function registerDefaultFaces(runtime, opts) {
    return runtime.register(createOconvDefaultFaces(await loadDefaultFaces(opts)));
}
