#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ParseResult precompilation tool.
 *
 * Walks one or more `.html` template files, runs them through
 * `parser.fromHTML()` at build time, and emits the resulting `ParseResult`
 * as JSON (or as an ESM module that `export default`s the same object).
 *
 * The runtime can then load the precompiled artifact directly and feed it
 * to `template.fromParseResult(json)`, bypassing the per-template
 * parse-on-first-paint cost.
 *
 * CLI
 * ---
 *   bun run tools/rendering/precompilation/ <input> [options]
 *
 *   <input>           A .html file OR a directory (walked recursively).
 *   --out <dir>       Output directory. Default: next to each input.
 *   --ext <ext>       Output extension. Default: ".parseresult.json".
 *   --glob <pattern>  Glob filter for directory walks. Default: "** /*.html".
 *   --minify          Emit compact JSON (no indentation).
 *   --verify          Re-parse the JSON via template.fromParseResult and
 *                     deep-compare against a fresh parser.fromHTML() call.
 *   --esm             Also emit a sibling .js file: `export default {...}`.
 *
 * @module fw/tools/rendering/precompilation/parseresult
 */

import { readFile, writeFile, readdir, stat, mkdir, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, join, relative, sep } from 'node:path';

import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { template } from '../../../src/dom/rendering/template.js';
import { printHelp, wantsHelp, isMainModule } from '../../_lib/cli-help.js';

const HELP_USAGE = 'bun run tools/rendering/precompilation/ <input> [options]';
const HELP_FLAGS = [
    ['<input>', '.html file OR directory (walked recursively)'],
    ['--out <dir>', 'Output directory (default: next to each input)'],
    ['--ext <ext>', 'Output extension (default: .parseresult.json)'],
    ['--glob <pat>', 'Glob filter for directory walks (default: **/*.html)'],
    ['--minify', 'Emit compact JSON (no indentation)'],
    ['--verify', 'Re-parse via template.fromParseResult and deep-compare'],
    ['--esm', 'Also emit a sibling .js with `export default {...}`'],
    ['--help, -h', 'Show this help'],
];
const HELP_EXAMPLES = [
    'bun run tools/rendering/precompilation/ tools/rendering/precompilation/_fixtures/sample.tpl.html',
    'bun run tools/rendering/precompilation/ ./tpls --out dist/tpl --minify --verify',
];

// ── CLI parsing ──────────────────────────────────────────────────────────────

/**
 * Parse argv into a flat options object. Accepts `--key value` and `--flag`.
 *
 * @param {string[]} argv - Tail of `process.argv` (positional + options).
 * @returns {{ input: string|null, out: string|null, ext: string,
 *             glob: string, minify: boolean, verify: boolean, esm: boolean }}
 */
export function parseArgs(argv) {
    const opts = {
        input  : null,
        out    : null,
        ext    : '.parseresult.json',
        glob   : '**/*.html',
        minify : false,
        verify : false,
        esm    : false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out')          opts.out    = argv[++i];
        else if (a === '--ext')     opts.ext    = argv[++i];
        else if (a === '--glob')    opts.glob   = argv[++i];
        else if (a === '--minify')  opts.minify = true;
        else if (a === '--verify')  opts.verify = true;
        else if (a === '--esm')     opts.esm    = true;
        else if (a === '--help' || a === '-h') { opts._help = true; return opts; }
        else if (!a.startsWith('--') && !opts.input) opts.input = a;
        else throw new Error(`parseresult: unknown argument '${a}'. Run with --help.`);
    }
    return opts;
}

// ── Glob → RegExp ────────────────────────────────────────────────────────────

/**
 * Convert a minimal glob pattern to a RegExp matched against POSIX-style
 * relative paths. Supports `**`, `*`, `?`, and `{a,b}` alternation.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
            else re += '[^/]*';
        } else if (c === '?')  re += '[^/]';
        else if (c === '{') {
            const end = glob.indexOf('}', i);
            if (end === -1) { re += '\\{'; }
            else { re += '(' + glob.slice(i + 1, end).split(',').join('|') + ')'; i = end; }
        }
        else if ('.+^$()|[]\\'.includes(c)) re += '\\' + c;
        else re += c;
    }
    return new RegExp('^' + re + '$');
}

// ── Directory walk ──────────────────────────────────────────────────────────

/**
 * Recursively collect files under `root` whose path-relative form matches
 * the glob pattern.
 *
 * @param {string} root
 * @param {RegExp} re
 * @returns {Promise<string[]>} Absolute paths.
 */
async function walk(root, re) {
    const out = [];
    async function rec(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        // Deterministic order across platforms.
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
            const full = join(dir, e.name);
            // Skip symlinks (avoid cycles / surprise dereferencing).
            try {
                const lst = await lstat(full);
                if (lst.isSymbolicLink()) {
                    process.stderr.write(`[parseresult] skipping symlink: ${full}\n`);
                    continue;
                }
            } catch { /* ignore */ }
            if (e.isDirectory()) await rec(full);
            else if (e.isFile()) {
                const rel = relative(root, full).split(sep).join('/');
                if (re.test(rel)) out.push(full);
            }
        }
    }
    await rec(root);
    return out;
}

// ── Deep equality ───────────────────────────────────────────────────────────

/**
 * Order-sensitive deep equality between two JSON-serializable values.
 * Returns the path of the first divergence (`''` when equal).
 *
 * @param {*} a
 * @param {*} b
 * @param {string} [path]
 * @returns {string} Empty string when equal, otherwise the divergence path.
 */
export function deepDiff(a, b, path = '') {
    if (a === b) return '';
    if (typeof a !== typeof b) return path || '/';
    if (a === null || b === null) return path || '/';
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return path || '/';
        if (a.length !== b.length) return `${path}.length`;
        for (let i = 0; i < a.length; i++) {
            const d = deepDiff(a[i], b[i], `${path}[${i}]`);
            if (d) return d;
        }
        return '';
    }
    if (typeof a === 'object') {
        const ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return `${path}{keys}`;
        for (const k of ka) {
            if (!Object.prototype.hasOwnProperty.call(b, k)) return `${path}.${k}`;
            const d = deepDiff(a[k], b[k], `${path}.${k}`);
            if (d) return d;
        }
        return '';
    }
    return path || '/';
}

// ── Serializability check ───────────────────────────────────────────────────

/**
 * Walk a value and locate the first non-JSON-serializable site. Returns the
 * path string when offending content is found, otherwise empty string.
 *
 * @param {*} v
 * @param {string} [path]
 * @returns {string}
 */
export function findNonSerializable(v, path = '') {
    if (v === null) return '';
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return '';
    if (t === 'undefined') return '';   // tolerated: stripped by JSON.stringify
    if (t === 'function' || t === 'symbol' || t === 'bigint') return `${path} (${t})`;
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const r = findNonSerializable(v[i], `${path}[${i}]`);
            if (r) return r;
        }
        return '';
    }
    if (t === 'object') {
        // Plain objects only — reject class instances, DOM nodes, Maps, Sets.
        const proto = Object.getPrototypeOf(v);
        if (proto !== null && proto !== Object.prototype) {
            return `${path} (non-plain object: ${proto?.constructor?.name ?? 'unknown'})`;
        }
        for (const k of Object.keys(v)) {
            const r = findNonSerializable(v[k], `${path}.${k}`);
            if (r) return r;
        }
        return '';
    }
    return `${path} (unknown type)`;
}

// ── Core processing ─────────────────────────────────────────────────────────

/**
 * Count total elm nodes across `result.template` and any iterate sub-templates.
 *
 * @param {{ template: any[], iterates?: Record<string, any[]> }} result
 * @returns {number}
 */
function countNodes(result) {
    let n = (result.template || []).length;
    if (result.iterates) for (const k of Object.keys(result.iterates)) n += result.iterates[k].length;
    return n;
}

/**
 * Compile a single HTML file into a ParseResult JSON artifact.
 *
 * @param {string} inputPath
 * @param {object} opts
 * @param {object} ctx - { p, tpl } shared parser & template instances.
 * @returns {Promise<{ input: string, output: string, bytes: number, nodes: number }>}
 */
export async function compileOne(inputPath, opts, ctx) {
    const html = await readFile(inputPath, 'utf8');
    const result = ctx.p.fromHTML(html);

    const bad = findNonSerializable(result);
    if (bad) {
        throw new Error(
            `parseresult: ParseResult for '${inputPath}' contains non-JSON-serializable content at ${bad}`
        );
    }

    // Verify pass: re-instantiate and compare.
    if (opts.verify) {
        const json = JSON.parse(JSON.stringify(result));
        const adopted = ctx.tpl.fromParseResult(json);
        const fresh = ctx.p.fromHTML(html);
        const diff = deepDiff(adopted, fresh);
        if (diff) {
            throw new Error(
                `parseresult: --verify mismatch for '${inputPath}' at ${diff || '/'}`
            );
        }
    }

    // Resolve output path.
    const outDir = opts.out ? resolve(opts.out) : dirname(inputPath);
    if (opts.out && !existsSync(outDir)) await mkdir(outDir, { recursive: true });
    const stem = basename(inputPath);     // foo.html  → foo.html.parseresult.json
    const outPath = join(outDir, stem + opts.ext);
    const payload = opts.minify
        ? JSON.stringify(result)
        : JSON.stringify(result, null, 2);
    await writeFile(outPath, payload, 'utf8');

    // ESM emission.
    if (opts.esm) {
        const esmPath = outPath.replace(/\.json$/, '.js');
        const esmBody = `// auto-generated by tools/rendering/precompilation/parseresult.js — do not edit\nexport default ${payload};\n`;
        await writeFile(esmPath, esmBody, 'utf8');
    }

    return {
        input  : inputPath,
        output : outPath,
        bytes  : Buffer.byteLength(payload, 'utf8'),
        nodes  : countNodes(result),
    };
}

/**
 * Run the tool with a parsed options object. Returns a summary array.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {Promise<Array<{input:string, output:string, bytes:number, nodes:number}>>}
 */
export async function run(opts) {
    if (!opts.input) {
        throw new Error('parseresult: missing <input> argument');
    }
    const inputAbs = resolve(opts.input);
    if (!existsSync(inputAbs)) {
        throw new Error(`parseresult: input not found: ${inputAbs}`);
    }

    // Instantiate parser & template once.
    const sp  = secPolicy.factory();
    const p   = parser.factory(sp);
    const tpl = template.factory(sp);
    const ctx = { p, tpl };

    const st = await stat(inputAbs);
    /** @type {string[]} */
    let files;
    if (st.isDirectory()) {
        const re = globToRegExp(opts.glob);
        files = await walk(inputAbs, re);
    } else {
        files = [inputAbs];
    }

    const results = [];
    for (const f of files) {
        const r = await compileOne(f, opts, ctx);
        results.push(r);
    }
    return results;
}

// ── CLI entry ───────────────────────────────────────────────────────────────

if (isMainModule(import.meta.url)) {
    const argv = process.argv.slice(2);
    if (wantsHelp(argv)) {
        printHelp(HELP_USAGE, HELP_FLAGS, HELP_EXAMPLES);
        process.exit(0);
    }
    let opts;
    try {
        opts = parseArgs(argv);
    } catch (err) {
         
        console.error(err.message);
        process.exit(1);
    }
    run(opts).then(results => {
        for (const r of results) {
             
            console.log(`${r.input} → ${r.output} (${r.bytes} bytes, ${r.nodes} nodes)`);
        }
    }).catch(err => {
         
        console.error(err.message);
        process.exit(1);
    });
}
