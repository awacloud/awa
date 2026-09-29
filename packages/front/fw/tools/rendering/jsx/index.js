#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview JSX → ParseResult precompilation tool.
 *
 * Transforms `.jsx` template files into the same `ParseResult` the runtime
 * `parser.fromHTML()` produces, then emits it as JSON (and optionally as an
 * ESM `export default`). JSX is purely an input syntax lowered offline —
 * the runtime stays untouched. No vdom, no runtime `fromJSX()`.
 *
 * Choices (documented here; see docs/tools/jsx.md for rationale):
 *   - Named slots  : `<Slot name="content"/>` → `${content}`
 *   - Iterations   : `<Each name="items"><li>…</li></Each>` → `<!-- $items -->…<!-- items$ -->`
 *   - Bindings     : `{name}` is always a **binding name**, never an arbitrary expression.
 *
 * CLI
 * ---
 *   bun run tools/rendering/jsx/ <input> [options]
 *
 *   <input>           A .jsx file OR a directory (walked recursively).
 *   --out <dir>       Output directory. Default: next to each input.
 *   --ext <ext>       Output extension. Default: ".parseresult.json".
 *   --glob <pat>      Glob filter for directory walks. Default: "**\/*.jsx".
 *   --minify          Emit compact JSON (no indentation).
 *   --verify          Re-parse via template.fromParseResult and deep-compare.
 *   --esm             Also emit a sibling .js: `export default {...}`.
 *   --help, -h
 *
 * @module fw/tools/rendering/jsx
 */

import { readFile, writeFile, readdir, stat, mkdir, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, join, relative, sep } from 'node:path';

import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { template } from '../../../src/dom/rendering/template.js';
import { printHelp, wantsHelp, isMainModule } from '../../_lib/cli-help.js';

const HELP_USAGE = 'bun run tools/rendering/jsx/ <input> [options]';
const HELP_FLAGS = [
    ['<input>', '.jsx file OR directory (walked recursively)'],
    ['--out <dir>', 'Output directory (default: next to each input)'],
    ['--ext <ext>', 'Output extension (default: .parseresult.json)'],
    ['--glob <pat>', 'Glob filter for directory walks (default: **/*.jsx)'],
    ['--minify', 'Emit compact JSON (no indentation)'],
    ['--verify', 'Re-parse via template.fromParseResult and deep-compare'],
    ['--esm', 'Also emit a sibling .js with `export default {...}`'],
    ['--help, -h', 'Show this help'],
];
const HELP_EXAMPLES = [
    'bun run tools/rendering/jsx/ tools/rendering/jsx/_fixtures/card.jsx',
    'bun run tools/rendering/jsx/ ./tpls --out dist/tpl --minify --verify',
];

// ── CLI parsing ──────────────────────────────────────────────────────────────

/**
 * Parse argv into a flat options object.
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
        glob   : '**/*.jsx',
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
        else throw new Error(`jsx: unknown argument '${a}'. Run with --help.`);
    }
    return opts;
}

// ── Glob → RegExp ────────────────────────────────────────────────────────────

/**
 * Convert a minimal glob pattern to a RegExp matched against POSIX-style
 * relative paths.
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
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
            const full = join(dir, e.name);
            try {
                const lst = await lstat(full);
                if (lst.isSymbolicLink()) {
                    process.stderr.write(`[jsx] skipping symlink: ${full}\n`);
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

// ── Deep equality ─────────────────────────────────────────────────────────

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

// ── JSX → HTML lowering ──────────────────────────────────────────────────────
//
// Strategy: single-pass scan that transforms JSX source text to the equivalent
// HTML string using the framework's #{}/#{} notation, then hands it to
// `parser.fromHTML()`. Keeping the JSX compiler thin means all ParseResult
// construction logic stays in the parser which is already tested and maintained.
//
// Mapping rules:
//   JSX                          → HTML equivalent
//   ──────────────────────────────────────────────────────────────────────────
//   {name}              (text)   → #{name}
//   attr={name}         (unquoted JSX) → attr="#{name}"
//   attr="{a} b"        (quoted) → attr="#{a} b"
//   attr="a {cls} b"    (quoted) → attr="a #{cls} b"
//   <Slot name="content"/>       → ${content}
//   <Each name="items">…</Each>  → <!-- $items -->…<!-- items$ -->
//
// Security: `<Slot>` and `<Each>` are framework pseudo-elements resolved by
// this tool before parsing. All resulting HTML goes through `parser.fromHTML()`
// which enforces the full secPolicy (blocked tags, on*, unsafe URLs).
//
// Single-pass scanning rules:
//   - HTML comments (<!-- … -->) → copied verbatim (they carry $name / name$
//     iterate markers already placed by the <Each> substitution).
//   - Inside a tag: only transform inside quoted attribute values OR after `={`
//     for unquoted JSX bindings. Attribute names and tag names are copied as-is.
//   - In text content: `{ident}` → `#{ident}`; `${ident}` (slot output of
//     <Slot>) is already correct HTML notation and is left untouched.
//   - `{/* … */}` JSX block comments are stripped before the scan.

/**
 * Lower JSX source text to equivalent HTML using #{}/${} notation.
 * Implements a single-pass character scan over the JSX string.
 *
 * @param {string} jsx - Raw JSX source text.
 * @returns {string} Equivalent HTML string for `parser.fromHTML()`.
 * @throws {Error} When a `{expr}` binding contains more than a plain identifier,
 *   or when `</Each>` appears without a preceding `<Each>`.
 */
export function jsxToHTML(jsx) {
    // 1. Strip JSX block comments: {/* … */}
    let src = jsx.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

    // 2. Replace <Slot name="x"/> → ${x}  and  <Each name="x"> / </Each>
    //    We need to handle nested <Each> blocks correctly. Use a stack.
    //    This pre-pass replaces framework pseudo-elements with HTML notation.
    src = _lowerPseudoElements(src);

    // 3. Single-pass: transform {binding} in the right positions.
    return _lowerBindings(src);
}

/**
 * Replace framework pseudo-elements with HTML notation:
 *   <Slot name="x"/>            → ${x}
 *   <Each name="x">…</Each>    → <!-- $x -->…<!-- x$ -->
 *
 * Handles nested <Each> blocks via a name-stack.
 *
 * @param {string} src
 * @returns {string}
 */
function _lowerPseudoElements(src) {
    // Match <Slot …/> and <Each …> and </Each> via a single regex scan.
    // Order of alternates matters: <Slot…/> before <Each…> before </Each>.
    const re = /<Slot\s+name=(?:"([^"]+)"|'([^']+)')\s*\/>|<Each\s+name=(?:"([^"]+)"|'([^']+)')\s*>|<\/Each>/g;
    /** @type {string[]} Stack of open Each names (innermost last). */
    const stack = [];
    return src.replace(re, (match, slotDq, slotSq, eachDq, eachSq) => {
        if (slotDq !== undefined || slotSq !== undefined) {
            // <Slot name="x"/>
            return `\${${slotDq || slotSq}}`;
        }
        if (eachDq !== undefined || eachSq !== undefined) {
            // <Each name="x">
            const name = eachDq || eachSq;
            stack.push(name);
            return `<!-- $${name} -->`;
        }
        // </Each>
        if (stack.length === 0) throw new Error('jsx: </Each> without matching <Each>');
        const name = stack.pop();
        return `<!-- ${name}$ -->`;
    });
}

/**
 * Single-pass scan: transform `{identifier}` to `#{identifier}` only where
 * valid in an HTML template:
 *   - Unquoted JSX attribute binding: `attr={ident}` → `attr="#{ident}"`
 *   - Quoted attribute value: `"{ident}"` → `"#{ident}"`
 *   - Text content: `{ident}` → `#{ident}`
 *   - `${...}` in text (slot output) is left untouched.
 *   - Tag names and attribute names are copied verbatim.
 *   - HTML comments are copied verbatim.
 *
 * @param {string} src
 * @returns {string}
 */
function _lowerBindings(src) {
    const out = [];
    let i = 0;
    const len = src.length;

    while (i < len) {
        const ch = src[i];

        if (ch === '<') {
            // Could be a tag or an HTML comment.
            if (src.startsWith('<!--', i)) {
                // HTML comment: copy verbatim until -->
                const end = src.indexOf('-->', i + 4);
                if (end === -1) {
                    out.push(src.slice(i));
                    i = len;
                } else {
                    out.push(src.slice(i, end + 3));
                    i = end + 3;
                }
                continue;
            }

            // Tag start: copy tag name + attrs, only transform inside quoted
            // attribute values or unquoted `={binding}` JSX attribute syntax.
            out.push('<');
            i++;

            // Optional leading / for closing tags
            if (i < len && src[i] === '/') { out.push('/'); i++; }

            // Tag name: copy verbatim until whitespace or >
            while (i < len && !/[\s/>]/.test(src[i])) {
                out.push(src[i++]);
            }

            // Attributes
            while (i < len && src[i] !== '>') {
                const c = src[i];
                if (c === '/') {
                    // Self-closing slash
                    out.push('/');
                    i++;
                } else if (/\s/.test(c)) {
                    out.push(c);
                    i++;
                } else {
                    // Attribute name: copy until = or whitespace or > or /
                    while (i < len && !/[\s=/>]/.test(src[i])) {
                        out.push(src[i++]);
                    }
                    // Optional value
                    if (i < len && src[i] === '=') {
                        out.push('=');
                        i++;
                        if (i < len && (src[i] === '"' || src[i] === "'")) {
                            // Quoted attribute value: transform {ident} inside
                            const q = src[i];
                            out.push(q);
                            i++;
                            while (i < len && src[i] !== q) {
                                if (src[i] === '{') {
                                    i = _emitBinding(src, i, out, 'attr');
                                } else {
                                    out.push(src[i++]);
                                }
                            }
                            if (i < len) { out.push(q); i++; }
                        } else if (i < len && src[i] === '{') {
                            // Unquoted JSX binding: attr={ident} → attr="#{ident}"
                            // Find the matching }
                            const end = src.indexOf('}', i + 1);
                            if (end === -1) throw new Error('jsx: unclosed { in attribute binding');
                            const inner = src.slice(i + 1, end);
                            _validateIdent(inner);
                            out.push('"', '#', '{', inner, '}', '"');
                            i = end + 1;
                        } else {
                            // Unquoted literal value: copy verbatim
                            while (i < len && !/[\s>]/.test(src[i])) {
                                out.push(src[i++]);
                            }
                        }
                    }
                }
            }
            if (i < len && src[i] === '>') {
                out.push('>');
                i++;
            }

        } else if (ch === '$' && src[i + 1] === '{') {
            // ${slot} — already correct HTML notation from <Slot> lowering.
            // Copy verbatim until matching }.
            const end = src.indexOf('}', i + 2);
            if (end === -1) {
                out.push('$', '{');
                i += 2;
            } else {
                out.push(src.slice(i, end + 1));
                i = end + 1;
            }

        } else if (ch === '{') {
            // Text content binding: {ident} → #{ident}
            i = _emitBinding(src, i, out, 'text');

        } else {
            out.push(ch);
            i++;
        }
    }

    return out.join('');
}

/**
 * Validate that `inner` is a plain JS identifier. Throws otherwise.
 * @param {string} inner
 */
function _validateIdent(inner) {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(inner)) {
        throw new Error(
            `jsx: '{${inner}}' is not a plain binding name. ` +
            `Only identifier bindings are supported (e.g. {myVar}), not arbitrary expressions.`
        );
    }
}

/**
 * Consume a `{...}` at position `pos` in `src`, emit `#{ident}` to `out`,
 * and return the new position past the `}`.
 * Throws when the content is not a plain identifier.
 *
 * @param {string} src
 * @param {number} pos - Index of `{`.
 * @param {string[]} out
 * @param {'text'|'attr'} _ctx - For error messaging only.
 * @returns {number} Position after `}`.
 */
function _emitBinding(src, pos, out, _ctx) {
    const end = src.indexOf('}', pos + 1);
    if (end === -1) {
        // Unclosed brace — pass through.
        out.push('{');
        return pos + 1;
    }
    const inner = src.slice(pos + 1, end);
    _validateIdent(inner);
    out.push('#', '{', inner, '}');
    return end + 1;
}

// ── compileJsx ───────────────────────────────────────────────────────────────

/**
 * CLI options accepted by {@link compileJsx}. All fields are optional; the
 * function is self-contained and never requires a pre-built parser.
 *
 * @typedef {Object} CompileJsxOpts
 * @property {boolean} [minify]  - Carried through by the CLI (no effect on the
 *   returned object; consulted only at serialization time).
 * @property {boolean} [verify] - Carried through by the CLI.
 * @property {boolean} [esm]    - Carried through by the CLI.
 * @property {import('../../../src/dom/rendering/parser.js').ParserAPI} [parser]
 *   - Optional pre-instantiated parser to reuse (e.g. across a directory walk).
 *   When omitted, a fresh parser is created internally — matching how the CLI
 *   obtains its parser. Callers never have to build one.
 */

/**
 * Compile a JSX source string to a ParseResult.
 *
 * This is the programmatic entry point used by both the CLI and tests. It
 * lowers JSX notation to the equivalent `#{}`/`${}` HTML template, then runs
 * `parser.fromHTML()` so the output is byte-for-equivalent to what
 * `parser.fromHTML()` would return for the corresponding HTML template.
 *
 * **Self-contained:** call `compileJsx(src)` with no second argument and the
 * function instantiates its own `secPolicy` + `parser` internally (a fresh
 * parser yields deterministic synthetic IDs, since the auto-ID counter starts
 * at 0). Pass `opts.parser` only to reuse an existing parser instance.
 *
 * @param {string} source - JSX source text.
 * @param {CompileJsxOpts} [opts] - CLI options bag (all optional).
 * @returns {import('../../../src/dom/rendering/parser.js').ParseResult}
 * @throws {Error} On secPolicy violations (blocked tags, on* attrs, unsafe URLs)
 *   or when a `{...}` binding contains a non-identifier expression.
 */
export function compileJsx(source, opts = {}) {
    const html = jsxToHTML(source);
    const p = opts.parser || parser.factory(secPolicy.factory());
    return p.fromHTML(html);
}

// ── Serializability check ───────────────────────────────────────────────────

/**
 * Walk a value and locate the first non-JSON-serializable site.
 *
 * @param {*} v
 * @param {string} [path]
 * @returns {string}
 */
export function findNonSerializable(v, path = '') {
    if (v === null) return '';
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return '';
    if (t === 'undefined') return '';
    if (t === 'function' || t === 'symbol' || t === 'bigint') return `${path} (${t})`;
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const r = findNonSerializable(v[i], `${path}[${i}]`);
            if (r) return r;
        }
        return '';
    }
    if (t === 'object') {
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
 * Compile a single JSX file into a ParseResult JSON artifact.
 *
 * Self-contained: each call uses a fresh parser instance (deterministic
 * synthetic IDs). `--verify` instantiates its own `template` instance.
 *
 * @param {string} inputPath
 * @param {object} opts
 * @returns {Promise<{ input: string, output: string, bytes: number, nodes: number }>}
 */
export async function compileOne(inputPath, opts) {
    const source = await readFile(inputPath, 'utf8');
    const result = compileJsx(source);

    const bad = findNonSerializable(result);
    if (bad) {
        throw new Error(
            `jsx: ParseResult for '${inputPath}' contains non-JSON-serializable content at ${bad}`
        );
    }

    // Verify pass: re-instantiate and compare.
    if (opts.verify) {
        const tpl = template.factory(secPolicy.factory());
        const json = JSON.parse(JSON.stringify(result));
        const adopted = tpl.fromParseResult(json);
        const fresh = compileJsx(source);
        const diff = deepDiff(adopted, fresh);
        if (diff) {
            throw new Error(
                `jsx: --verify mismatch for '${inputPath}' at ${diff || '/'}`
            );
        }
    }

    // Resolve output path.
    const outDir = opts.out ? resolve(opts.out) : dirname(inputPath);
    if (opts.out && !existsSync(outDir)) await mkdir(outDir, { recursive: true });
    const stem = basename(inputPath);
    const outPath = join(outDir, stem + opts.ext);
    const payload = opts.minify
        ? JSON.stringify(result)
        : JSON.stringify(result, null, 2);
    await writeFile(outPath, payload, 'utf8');

    // ESM emission.
    if (opts.esm) {
        const esmPath = outPath.replace(/\.json$/, '.js');
        const esmBody = `// auto-generated by tools/rendering/jsx/ — do not edit\nexport default ${payload};\n`;
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
 * Run the tool with a parsed options object.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {Promise<Array<{input:string, output:string, bytes:number, nodes:number}>>}
 */
export async function run(opts) {
    if (!opts.input) {
        throw new Error('jsx: missing <input> argument');
    }
    const inputAbs = resolve(opts.input);
    if (!existsSync(inputAbs)) {
        throw new Error(`jsx: input not found: ${inputAbs}`);
    }

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
        const r = await compileOne(f, opts);
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
