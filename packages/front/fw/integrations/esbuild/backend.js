// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/esbuild/backend.js
/**
 * @fileoverview esbuild **build backend** for `@awacloud/fw` (esbuild role 2).
 *
 * Drop-in replacement for the bun-specific builder
 * (`tools/fw-bundler/src/bundle/lib/bundler.js` → `Bun.build` + `Bun.gzipSync`) so the
 * autonomous bundles (`dist/build/*`) can be produced under **pure Node**.
 *
 * Same contract as the bun backend :
 *   buildOne(opts)        → { outputs, outFile, bytes, hashSha256, gzBytes }
 *   buildClassical(opts)  → idem (IIFE, for sanity.min.js)
 *
 * Writes the output to `outdir` ; the orchestrator renames it afterwards
 * (`renameOutput`). Hash via `node:crypto`, gzip size via `node:zlib` — no bun
 * primitive. esbuild is a peer installed on demand (`bun run setup:e2e`).
 *
 * Selected by `tools/fw-bundler/src/bundle/lib/bundler.js` when the backend is
 * `esbuild` (forced via `--backend esbuild` / `FW_BUILD_BACKEND`, or auto when
 * not running under bun).
 *
 * @see ./README.md
 * @see ../nodejs/README.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, basename } from 'node:path';

/**
 * esbuild plugin marking the listed specifiers as external — mirrors the bun
 * backend's `mark-external` plugin (the `onResolve` API is identical). esbuild's
 * native `external` already handles bare specifiers ; this also catches the
 * exact relative/literal ones so they survive verbatim.
 * @param {string[]} external
 */
function markExternal(external) {
    return {
        name: 'mark-external',
        setup(b) {
            for (const spec of external) {
                const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                b.onResolve({ filter: new RegExp(`^${escaped}$`) }, (args) => ({ path: args.path, external: true }));
            }
        },
    };
}

/** @param {unknown} e @returns {string} */
function formatEsbuildErrors(e) {
    const errs = e && typeof e === 'object' && Array.isArray(e.errors) ? e.errors : null;
    if (!errs) return (e && e.message) || String(e);
    return errs.map((er) => {
        const loc = er.location ? ` at ${er.location.file}:${er.location.line}:${er.location.column}` : '';
        return `[error] ${er.text}${loc}`;
    }).join('\n');
}

/** @param {('none'|'browser'|'node'|'neutral'|string)} target */
function platformFor(target) {
    if (target === 'node') return 'node';
    if (target === 'neutral') return 'neutral';
    return 'browser';
}

/**
 * Build a single entry with esbuild. Same signature/return as the bun backend.
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
    const { build } = await import('esbuild');

    // Deterministic, collision-free intermediate name in `outdir` (the
    // orchestrator renames to the final `fw.<…>.js` afterwards). Distinct
    // per target dir + minify flag so concurrent calls never clash.
    const base = outFileName
        ? outFileName.replace(/\.js$/, '')
        : `${basename(dirname(entry))}${minify ? '.min' : ''}`;
    const outFile = resolve(outdir, `${base}.js`);

    /** @type {Record<string, unknown>} */
    const opts = {
        entryPoints: [entry],
        outfile: outFile,
        bundle: true,
        format,
        platform: platformFor(target),
        minify,
        sourcemap: sourcemap === 'none' ? false : true,
        legalComments: 'none',
        logLevel: 'silent',
        write: true,
    };
    if (external && external.length) {
        opts.external = [...external];
        opts.plugins = [markExternal(external)];
    }

    try {
        await build(opts);
    } catch (e) {
        throw new Error(`esbuild.build failed for ${entry}:\n${formatEsbuildErrors(e)}`, { cause: e });
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
 * Build a classical (IIFE) script — used for `sanity.min.js`. esbuild's `iife`
 * format wraps the (already self-invoking) source ; valid as a `<script>` blob.
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
