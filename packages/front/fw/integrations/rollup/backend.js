// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/rollup/backend.js
/**
 * @fileoverview Rollup **build backend** for `@awacloud/fw` (Rollup role 2).
 *
 * Alternative Node replacement for the bun-specific builder
 * (`tools/fw-bundler/src/bundle/lib/bundler.js`), parallel to the esbuild backend.
 * Heavier than esbuild (Rollup + `@rollup/plugin-terser` for minification),
 * so esbuild stays the recommended Node backend ; this exists for pipelines
 * that are already Rollup-centric or want Rollup's output.
 *
 * Same contract as the other backends :
 *   buildOne(opts)        → { outputs, outFile, bytes, hashSha256, gzBytes }
 *   buildClassical(opts)  → idem (IIFE, sanity.min.js)
 *
 * Hash via `node:crypto`, gzip size via `node:zlib`. Peers installed on demand
 * (`bun run setup:e2e` → rollup, @rollup/plugin-node-resolve, @rollup/plugin-terser).
 *
 * Selected by the bundler selector when the backend is `rollup`
 * (`--backend rollup` / `FW_BUILD_BACKEND=rollup`). Never auto-selected.
 *
 * @see ./README.md
 * @see ../esbuild/backend.js   the recommended (lighter) Node backend
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, basename } from 'node:path';

/** Best-effort dynamic import — returns the chosen named/default export or null. */
async function tryPlugin(spec, pick) {
    try {
        const m = await import(spec);
        return pick(m);
    } catch {
        return null;
    }
}

/**
 * Build a single entry with Rollup. Same signature/return as the bun backend.
 * @returns {Promise<{ outputs: string[], outFile: string, bytes: number, hashSha256: string, gzBytes: number }>}
 */
export async function buildOne({
    entry,
    outdir,
    outFileName,
    minify = true,
    sourcemap = 'external',
    format = 'esm',
    target = 'browser',
    external,
}) {
    const { rollup } = await import('rollup');

    const plugins = [];
    const nodeResolve = await tryPlugin('@rollup/plugin-node-resolve', (m) => m.nodeResolve ?? m.default);
    if (nodeResolve) {
        plugins.push(nodeResolve({
            browser: target === 'browser',
            exportConditions: target === 'browser' ? ['browser', 'import', 'default'] : ['import', 'default'],
        }));
    }
    if (minify) {
        const terser = await tryPlugin('@rollup/plugin-terser', (m) => m.default ?? m);
        if (!terser) {
            throw new Error('rollup backend: minify requested but @rollup/plugin-terser is not installed (run `bun run setup:e2e`).');
        }
        plugins.push(terser());
    }

    const base = outFileName
        ? outFileName.replace(/\.js$/, '')
        : `${basename(dirname(entry))}${minify ? '.min' : ''}`;
    const outFile = resolve(outdir, `${base}.js`);
    const rollupFormat = format === 'iife' ? 'iife' : 'es';

    let bundle;
    try {
        bundle = await rollup({
            input: entry,
            plugins,
            external: external && external.length ? [...external] : [],
            onwarn: () => { /* browser bundle : import.meta / this-undefined warnings are expected */ },
        });
        await bundle.write({
            file: outFile,
            format: rollupFormat,
            sourcemap: sourcemap !== 'none',
            inlineDynamicImports: true,
            ...(rollupFormat === 'iife' ? { name: 'fwBundle' } : {}),
        });
    } catch (e) {
        throw new Error(`rollup build failed for ${entry}: ${e.message}`, { cause: e });
    } finally {
        if (bundle) await bundle.close();
    }

    const buf = readFileSync(outFile);
    const outputs = [outFile];
    const mapFile = `${outFile}.map`;
    if (existsSync(mapFile)) outputs.push(mapFile);

    return {
        outputs,
        outFile,
        bytes: buf.byteLength,
        hashSha256: createHash('sha256').update(buf).digest('hex'),
        gzBytes: gzipSync(buf).byteLength,
    };
}

/**
 * Build a classical (IIFE) script — used for `sanity.min.js`. sanity/base.js
 * has no exports, so the IIFE needs no `output.name`.
 * @returns {Promise<{ outputs: string[], outFile: string, bytes: number, hashSha256: string, gzBytes: number }>}
 */
export async function buildClassical({ entry, outdir, outFileName, minify = true }) {
    return buildOne({
        entry,
        outdir,
        outFileName,
        minify,
        sourcemap: 'none',
        format: 'iife',
        target: 'browser',
    });
}
