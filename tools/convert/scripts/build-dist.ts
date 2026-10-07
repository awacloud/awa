// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/scripts/build-dist.ts — transpiles the package's TypeScript
 * sources to plain ESM JavaScript under `dist/`, so an installed copy loads
 * on Node and Deno (Bun keeps resolving `src/` through the `bun` export
 * condition).
 *
 *   bun scripts/build-dist.ts [--out <dir>]      (default: <package>/dist)
 *
 * One `src/**\/*.ts` file (tests excluded) becomes one `dist/**\/*.js` file
 * at the same relative path: nothing is bundled, every `@awacloud/*` and
 * `node:` import stays an external import, nothing is minified. The
 * relative layout is kept on purpose — `../package.json` imports resolve
 * from `dist/` exactly as they do from `src/`.
 *
 * The transpiler is `Bun.Transpiler` per file. `Bun.build` with every import
 * external was measured too: it prepends a `createRequire` prelude to each
 * output, and both drop the JSON import attribute. Two rewrites follow the
 * transpile, each checked so that a miss fails the build instead of shipping
 * a broken file:
 *
 *   1. a relative `.ts` specifier becomes `.js` (no `.ts` specifier may
 *      remain in any output);
 *   2. a relative `.json` import gets `with { type: "json" }` back (Node and
 *      Deno refuse a JSON import without it); the count must match the
 *      source's.
 *
 * The transpiler drops comments, so each output starts again with its
 * source's leading `//` licence header. Bun API only, zero npm dependency.
 * It writes only under the output directory, which it empties first.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const PKG = resolve(import.meta.dir, '..');

// The transpiler prints a side-effect import with no space (`import"./x.ts"`).
const TS_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.{1,2}\/[^"'\n]+?)\.ts\2/g;
const JSON_IMPORT = /(\bfrom\s*)(["'])(\.{1,2}\/[^"'\n]+?\.json)\2(?!\s*with\b)/g;
const LEFTOVER_TS = /["']\.{1,2}\/[^"'\n]+\.ts["']/;
const JSON_ATTRIBUTE = /with\s*\{\s*type\s*:\s*["']json["']\s*\}/g;

/** The leading `//` comment lines of a source file (its licence header). */
function licenceHeader(source: string): string {
    const lines: string[] = [];
    for (const line of source.split(/\r?\n/)) {
        if (!line.startsWith('//')) break;
        lines.push(line);
    }
    return lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
}

/** Transpile one TypeScript module to ESM JavaScript; throws on a rewrite miss. */
export function transpileModule(source: string, file: string): string {
    const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'node' });
    let out = transpiler.transformSync(source);
    out = out.replace(TS_SPECIFIER, (_m, lead: string, q: string, spec: string) => `${lead}${q}${spec}.js${q}`);
    out = out.replace(JSON_IMPORT, (_m, lead: string, q: string, spec: string) => `${lead}${q}${spec}${q} with { type: "json" }`);
    const leftover = LEFTOVER_TS.exec(out);
    if (leftover) throw new Error(`build-dist: ${file}: a relative .ts specifier survived the rewrite: ${leftover[0]}`);
    const want = (source.match(JSON_ATTRIBUTE) ?? []).length;
    const got = (out.match(JSON_ATTRIBUTE) ?? []).length;
    if (want !== got) throw new Error(`build-dist: ${file}: ${String(want)} JSON import attribute(s) in the source, ${String(got)} in the output`);
    return licenceHeader(source) + out;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return sourceFiles(p);
        return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [p] : [];
    });
}

/** Build `<pkgDir>/src` into `outDir`; returns the written paths relative to `outDir`, POSIX-style. */
export function buildDist(pkgDir: string = PKG, outDir: string = join(pkgDir, 'dist')): string[] {
    const srcDir = join(pkgDir, 'src');
    rmSync(outDir, { recursive: true, force: true });
    const written: string[] = [];
    for (const file of sourceFiles(srcDir)) {
        const rel = relative(srcDir, file).replace(/\.ts$/, '.js');
        const target = join(outDir, rel);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, transpileModule(readFileSync(file, 'utf8'), relative(pkgDir, file)));
        written.push(rel.split(sep).join('/'));
    }
    if (written.length === 0) throw new Error(`build-dist: no source file under ${srcDir}`);
    return written.sort();
}

if (import.meta.main) {
    const args = process.argv.slice(2);
    let out: string | undefined;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--out' && args[i + 1] !== undefined) out = resolve(args[++i] as string);
        else if (a === '-h' || a === '--help') {
            console.log('Usage: bun scripts/build-dist.ts [--out <dir>]   (default: <package>/dist)');
            process.exit(0);
        } else {
            console.error(`build-dist: unknown argument: ${String(a)}`);
            process.exit(2);
        }
    }
    try {
        const files = buildDist(PKG, out);
        console.log(`build-dist: ${String(files.length)} file(s) -> ${out ?? join(PKG, 'dist')}`);
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }
}
