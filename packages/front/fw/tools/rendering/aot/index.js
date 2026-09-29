#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AOT template compiler — turns fw `.html` templates into
 * imperative JavaScript factory functions that build the DOM directly,
 * without the runtime parser or renderer.
 *
 * Usage:
 *   bun run tools/rendering/aot/ <input> [--out <dir>] [--prefix <name>] [--esm] [--cjs]
 *
 *   <input>     .html file or directory (recursive walk for .html)
 *   --out       output directory (default: dist/aot/)
 *   --prefix    factory function name prefix (default: tpl)
 *   --esm       emit ESM output (default)
 *   --cjs       emit CommonJS output
 *
 * Supported fw features and limitations: see lib/dom-codegen.js header.
 *
 * @module fw/tools/rendering/aot/aot-template
 */

import { readdir, readFile, writeFile, mkdir, stat, lstat } from 'node:fs/promises';
import { join, resolve, basename, extname, relative } from 'node:path';
import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { compileParseResult, deriveName } from './lib/dom-codegen.js';
import { printHelp, wantsHelp, isMainModule } from '../../_lib/cli-help.js';

const HELP_USAGE = 'bun run tools/rendering/aot/ <input> [--out <dir>] [--prefix <name>] [--esm|--cjs]';
const HELP_FLAGS = [
    ['<input>', '.html file or directory (recursively walked for .html)'],
    ['--out <dir>', 'Output directory (default: dist/aot/)'],
    ['--prefix <name>', 'Factory function name prefix (default: tpl)'],
    ['--esm', 'Emit ESM output (default)'],
    ['--cjs', 'Emit CommonJS output'],
    ['--help, -h', 'Show this help'],
];
const HELP_EXAMPLES = [
    'bun run tools/rendering/aot/ tools/rendering/aot/_fixtures/nav.html',
    'bun run tools/rendering/aot/ ./templates --out dist/tpl --prefix view',
];

/**
 * @typedef {{ input: string|null, out: string, prefix: string, esm: boolean, _help?: boolean }} AotArgs
 */

/**
 * Parse argv into a flat options object.
 * @param {string[]} argv
 * @returns {AotArgs}
 */
function parseArgs(argv) {
    const args = { input: null, out: 'dist/aot/', prefix: 'tpl', esm: true };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out')         args.out    = argv[++i];
        else if (a === '--prefix') args.prefix = argv[++i];
        else if (a === '--esm')    args.esm    = true;
        else if (a === '--cjs')    args.esm    = false;
        else if (a === '--help' || a === '-h') { args._help = true; return args; }
        else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}. Run with --help.`);
        else if (!args.input)      args.input  = a;
        else throw new Error(`Unexpected positional argument: ${a}`);
    }
    return args;
}

async function walkHtml(dir, acc) {
    const entries = await readdir(dir, { withFileTypes: true });
    // Sort for deterministic walk order.
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
        const p = join(dir, e.name);
        // Guard against symlinks: lstat reports the link itself.
        try {
            const lst = await lstat(p);
            if (lst.isSymbolicLink()) {
                process.stderr.write(`[aot] skipping symlink: ${p}\n`);
                continue;
            }
        } catch { /* ignore */ }
        if (e.isDirectory()) await walkHtml(p, acc);
        else if (e.isFile() && extname(e.name).toLowerCase() === '.html') acc.push(p);
    }
    return acc;
}

async function gatherInputs(input) {
    const abs = resolve(input);
    const st = await stat(abs);
    if (st.isDirectory()) return walkHtml(abs, []);
    return [abs];
}

export async function compileFile(p, outDir, prefix, esm, parserInst) {
    const html = await readFile(p, 'utf8');
    const parsed = parserInst.fromHTML(html);
    const base = basename(p);
    const fnName = deriveName(prefix, base);
    const source = compileParseResult(parsed, { fnName, esm });
    const ext = esm ? '.js' : '.cjs';
    const outPath = join(outDir, base.replace(/\.html$/i, ext));
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, source, 'utf8');
    return { inputPath: p, outPath, fnName, inputBytes: Buffer.byteLength(html), outputBytes: Buffer.byteLength(source) };
}

async function main() {
    const argv = process.argv.slice(2);
    if (wantsHelp(argv)) {
        printHelp(HELP_USAGE, HELP_FLAGS, HELP_EXAMPLES);
        process.exit(0);
    }
    let args;
    try {
        args = parseArgs(argv);
    } catch (err) {
        console.error('[aot] ' + err.message);
        process.exit(1);
    }
    if (!args.input) {
        console.error('Usage: ' + HELP_USAGE);
        process.exit(1);
    }
    const parserInst = parser.factory(secPolicy.factory());
    const files = await gatherInputs(args.input);
    const outDir = resolve(args.out);

    const results = [];
    for (const f of files) {
        const r = await compileFile(f, outDir, args.prefix, args.esm, parserInst);
        results.push(r);
        const rel = relative(process.cwd(), r.outPath);
        console.log(`  ${rel}  (${r.fnName}, ${r.inputBytes}→${r.outputBytes}B)`);
    }
    console.log(`\nCompiled ${results.length} template(s) → ${outDir}`);
}

// Run only when invoked directly. Use shared helper for Windows correctness.
if (isMainModule(import.meta.url)) {
    main().catch(e => { console.error(e); process.exit(1); });
}

// Exported for tests.
export { parseArgs };
