#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/standalone/index.js
/**
 * @fileoverview Standalone factory generator — produces a single ESM file
 * exposing a fully-resolved fw module without the framework runtime. Ported
 * logic-verbatim from `packages/front/fw/tools/build/standalone/index.js`; the
 * only adaptation is the path-resolution seam — `src/` and `dist/` now derive
 * from `PKG_ROOT = --pkg ?? cwd` instead of the tool's own location.
 *
 * Pipeline :
 *   1. Discover modules by scanning `src/` (shared scanner).
 *   2. Topo-sort the requested module's transitive `dependencies` graph.
 *   3. Detect closure captures — fail with a clear message if any factory
 *      references module-scope identifiers that wouldn't survive inlining.
 *   4. Emit one IIFE per descriptor in topo order, finalised by
 *      `export default <root>`.
 *   5. Optionally minify via `Bun.build`, then dynamically import the output
 *      file as a smoke test.
 *
 * Usage : `bun cli.ts fw-bundler standalone <moduleName> [--out <path>] [--min] [--no-source-comments] [--pkg <dir>]`
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { scanAll } from '../modlib/scan-modules.js';
import { printHelp, wantsHelp, isMainModule } from '../modlib/cli-help.js';

// ─── Path-resolution seam ───
// `SRC_DIR` / `DIST_DIR` derive from `PKG_ROOT = --pkg ?? cwd`, assigned by
// `resolvePkgPaths` at the start of `generateStandalone`. Declared as
// module-level bindings so the (logic-verbatim) helpers reference them by the
// same names as the fw original.
let PKG_ROOT, SRC_DIR, DIST_DIR;

function resolvePkgPaths(pkgRoot) {
    PKG_ROOT = pkgRoot;
    SRC_DIR = resolve(PKG_ROOT, 'src');
    DIST_DIR = resolve(PKG_ROOT, 'dist');
}

// ─── CLI ───
const HELP_USAGE = 'bun cli.ts fw-bundler standalone <moduleName> [--out <path>] [--min] [--classic] [--endpoint <name>] [--no-source-comments] [--pkg <dir>]';
const HELP_FLAGS = [
    ['--out <path>', 'Output file path (default: dist/standalone/<moduleName>.js).'],
    ['--min', 'Minify the generated bundle (Bun.build under bun, esbuild under Node).'],
    ['--classic', 'Also attach the resolved module to a global endpoint (default: the module name).'],
    ['--endpoint <name>', 'Global property name for --classic (default: <moduleName>). Implies --classic.'],
    ['--no-source-comments', 'Omit the generated banner / per-module headers.'],
    ['--pkg <dir>', 'Package root to read from (default: cwd). Resolves src/ and dist/ under it.'],
    ['--help, -h', 'Show this help.'],
];
const HELP_EXAMPLES = [
    'bun cli.ts fw-bundler standalone hex',
    'bun cli.ts fw-bundler standalone aes_modes --min --out dist/aes.js',
    'bun cli.ts fw-bundler standalone hex --classic --endpoint myHex --pkg packages/front/fw',
];

function parseArgs(argv) {
    const opts = { moduleName: null, out: null, min: false, sourceComments: true, classic: false, endpoint: null, pkg: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out') opts.out = argv[++i];
        else if (a === '--min') opts.min = true;
        else if (a === '--classic') opts.classic = true;
        else if (a === '--endpoint') { opts.endpoint = argv[++i]; opts.classic = true; }
        else if (a === '--no-source-comments') opts.sourceComments = false;
        else if (a === '--pkg') opts.pkg = argv[++i];
        else if (a === '--help' || a === '-h') { opts._help = true; return opts; }
        else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}. Run with --help.`);
        else if (!opts.moduleName) opts.moduleName = a;
        else throw new Error(`Unexpected positional argument: ${a}`);
    }
    if (!opts.moduleName && !opts._help) {
        throw new Error(`Missing <moduleName>. Usage: ${HELP_USAGE}`);
    }
    if (opts.endpoint !== null && !/^[A-Za-z_$][\w$]*$/.test(opts.endpoint)) {
        throw new Error(`--endpoint must be a valid JS identifier (got ${JSON.stringify(opts.endpoint)})`);
    }
    return opts;
}

// ─── Descriptor loading ───
async function loadDescriptor(info) {
    const url = pathToFileURL(info.file).href;
    const ns = await import(url);
    const desc = ns[info.bindingName];
    if (!desc || typeof desc.factory !== 'function') {
        throw new Error(`standalone: import of "${info.moduleName}" from ${info.file} did not produce a valid descriptor`);
    }
    return desc;
}

/**
 * Topo-sort over `dependencies` strings, returning the transitive list of
 * `(info, desc)` pairs in registration order (deps first).
 */
async function buildTopo(rootName, catalog) {
    /** @type {Map<string, { info: import('../modlib/scan-modules.js').ModuleInfo, desc: any }>} */
    const loaded = new Map();
    const order = [];
    const visited = new Set();
    const path = [];

    async function visit(name) {
        if (visited.has(name)) return;
        const idx = path.indexOf(name);
        if (idx !== -1) {
            const cycle = [...path.slice(idx), name].join(' -> ');
            throw new Error(`standalone: dependency cycle detected: ${cycle}`);
        }
        path.push(name);

        const info = catalog.get(name);
        if (!info) throw new Error(`standalone: unknown module "${name}"`);

        let entry = loaded.get(name);
        if (!entry) {
            entry = { info, desc: await loadDescriptor(info) };
            loaded.set(name, entry);
        }

        for (const spec of entry.desc.dependencies || []) {
            await visit(spec.split('@')[0]);
        }

        path.pop();
        visited.add(name);
        order.push(entry);
    }

    await visit(rootName);
    return order;
}

// ─── Closure-capture detection ───
const SAFE_GLOBALS = new Set([
    'undefined', 'null', 'true', 'false', 'Infinity', 'NaN',
    'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON',
    'Symbol', 'BigInt', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
    'SyntaxError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array',
    'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array',
    'BigUint64Array', 'Uint8ClampedArray', 'ArrayBuffer', 'SharedArrayBuffer',
    'DataView', 'Atomics', 'Proxy', 'Reflect', 'globalThis', 'console',
    'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'TextEncoder', 'TextDecoder', 'crypto', 'URL', 'URLSearchParams',
    'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response',
    'fetch', 'AbortController', 'AbortSignal', 'Worker', 'MessageChannel',
    'MessagePort', 'BroadcastChannel', 'Function', 'parseInt', 'parseFloat',
    'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'performance', 'self', 'window', 'document', 'navigator',
    'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
    'PerformanceObserver', 'CustomEvent', 'Event', 'DOMException',
    'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback',
    'HTMLElement', 'SVGElement', 'Element', 'Node', 'Text', 'DocumentFragment',
    'NodeFilter', 'Range', 'DOMParser', 'XMLSerializer',
    'localStorage', 'sessionStorage', 'indexedDB',
    'EventTarget', 'EventSource', 'WebSocket', 'XMLHttpRequest',
    'CompressionStream', 'DecompressionStream',
    'ReadableStream', 'WritableStream', 'TransformStream',
]);

/**
 * Extract the factory parameter names from `factory(p1, p2, ...) { … }` or
 * `function (p1, p2, …) { … }`. These names shadow any module-scope binding
 * inside the body and therefore MUST NOT be flagged as closure captures —
 * the `deps` field introduces sibling imports whose names match the factory
 * params exactly, which would otherwise produce systematic false positives.
 *
 * @param {string} factorySrc
 * @returns {Set<string>}
 */
function extractFactoryParams(factorySrc) {
    const out = new Set();
    const m = factorySrc.match(/^(?:factory|function\s*)\s*\(([^)]*)\)/);
    if (!m) return out;
    for (const piece of m[1].split(',')) {
        // Drop default-value / destructuring noise — keep only the leading identifier.
        const name = piece.trim().split(/[\s=:{}[\],]/)[0];
        if (name && /^[\w$]+$/.test(name)) out.add(name);
    }
    return out;
}

/**
 * Best-effort scan : collect module-scope identifiers, then test whether any
 * appear inside the factory body. False positives are mitigated by stripping
 * strings / comments / template literals before scanning, AND by excluding
 * factory parameter names (which shadow same-named imports).
 */
function detectClosureCaptures(srcFile, descriptorName, factorySrc) {
    const src = readFileSync(srcFile, 'utf8');
    const candidates = new Set();

    // imports + top-level decls.
    const importRe = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]+)\}|\*\s+as\s+([\w$]+)|([\w$]+))?\s*(?:,\s*\{([^}]+)\})?\s*from\s*['"][^'"]+['"]/g;
    let m;
    while ((m = importRe.exec(src)) !== null) {
        for (const grp of [m[1], m[3], m[4]]) if (grp) candidates.add(grp.trim());
        for (const grp of [m[2], m[5]]) {
            if (!grp) continue;
            for (const piece of grp.split(',')) {
                const id = piece.trim().split(/\s+as\s+/).pop().trim();
                if (id) candidates.add(id);
            }
        }
    }
    const topRe = /^(?:export\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm;
    while ((m = topRe.exec(src)) !== null) candidates.add(m[1]);

    // Factory parameter names — shadow same-named module-scope bindings.
    const params = extractFactoryParams(factorySrc);

    // Strip the factory body of strings / comments to lower false positives.
    const bodyStart = factorySrc.indexOf('{');
    const body = bodyStart >= 0 ? factorySrc.slice(bodyStart) : factorySrc;
    const stripped = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.|\$\{[^}]*\})*`/g, '``');

    const captured = new Set();
    for (const cand of candidates) {
        if (cand === descriptorName) continue;
        if (SAFE_GLOBALS.has(cand)) continue;
        if (params.has(cand)) continue; // shadowed by a factory parameter
        const re = new RegExp(`(?:^|[^\\w$.])${cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\w$]|$)`);
        if (re.test(stripped)) captured.add(cand);
    }
    return [...captured];
}

// ─── Output ───
function serializeFactory(fn, descriptorName) {
    const orig = fn.toString();
    const out = orig.replace(/^factory\s*\(/, 'function(');
    if (out === orig) {
        throw new Error(
            `standalone: descriptor for "${descriptorName}" — factory must be declared as 'factory(...) { … }' shorthand`,
        );
    }
    return out;
}

function bindingFor(name) {
    return `__${name.replace(/[^A-Za-z0-9_$]/g, '_')}`;
}

function renderStandalone(order, rootName, { sourceComments, classic = false, endpoint = null }) {
    const lines = [];

    if (sourceComments) {
        const rootDesc = order[order.length - 1].desc;
        const deps = order.slice(0, -1).map((o) => o.desc.name);
        lines.push('// Generated by @awacloud/fw standalone-factory generator');
        lines.push(`// Module: ${rootDesc.name} v${rootDesc.version || '0.0.0'}`);
        if (rootDesc.type) lines.push(`// Type: ${rootDesc.type}`);
        lines.push(`// Dependencies (transitive, ${deps.length}): ${deps.length ? deps.join(', ') : '<none>'}`);
        // No `// Built: <ISO>` banner (BL-697): a wall-clock stamp made every
        // emitted module differ from the previous run for no reader's benefit.
        // The header stays purely source-derived, so the output is
        // byte-idempotent.
        lines.push('');
    }

    for (const { desc } of order) {
        const factorySrc = serializeFactory(desc.factory, desc.name);
        const args = (desc.dependencies || []).map((d) => bindingFor(d.split('@')[0])).join(', ');
        const binding = bindingFor(desc.name);
        if (sourceComments) lines.push(`// ── ${desc.name} v${desc.version || '0.0.0'} ──`);
        lines.push(`const ${binding} = (${factorySrc})(${args});`);
        lines.push('');
    }

    if (classic) {
        const ep = endpoint || rootName;
        if (sourceComments) lines.push(`// classic: attach to globalThis.${ep}`);
        lines.push(`if (typeof globalThis !== 'undefined') globalThis.${ep} = ${bindingFor(rootName)};`);
        lines.push('');
    }

    lines.push(`export default ${bindingFor(rootName)};`);
    lines.push('');
    return lines.join('\n');
}

// ─── Smoke test ───
async function validateOutput(outPath) {
    const url = pathToFileURL(outPath).href + `?t=${Date.now()}`;
    const ns = await import(url);
    const def = ns.default;
    return {
        type: typeof def,
        keys: def && typeof def === 'object' ? Object.keys(def).slice(0, 10) : [],
    };
}

async function minify(srcText) {
    // The generated standalone is a single self-contained ESM file (factories
    // inlined, no imports), so minification is a pure text transform.
    //   - bun  : Bun.build on a temp file (native, no extra dep) ;
    //   - Node : esbuild.transform on the string directly (esbuild = on-demand
    //            peer, `bun run setup:e2e`). Forceable under bun via
    //            FW_BUILD_BACKEND=esbuild.
    const useEsbuild = typeof Bun === 'undefined' || process.env.FW_BUILD_BACKEND === 'esbuild';

    if (!useEsbuild) {
        const unique = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const tmpPath = resolve(DIST_DIR, `_standalone_tmp_${unique}.js`);
        mkdirSync(dirname(tmpPath), { recursive: true });
        writeFileSync(tmpPath, srcText, 'utf8');
        try {
            const res = await Bun.build({
                entrypoints: [tmpPath],
                target: 'browser',
                format: 'esm',
                minify: true,
                // BL-698 (debugId half): pinned explicitly, never left to the
                // default. Bun appends a path-derived `//# debugId=` trailer to
                // the emitted bytes as soon as a sourcemap is requested; with
                // `'none'` it does not. Measured: this site was already
                // trailer-free (Bun 1.3.13 defaults to 'none'), so the option
                // is a REGRESSION PIN here — the same mechanism the `bundle`
                // site now applies explicitly.
                sourcemap: 'none',
            });
            if (!res.success) {
                const msgs = res.logs.map((l) => l.message).join('\n');
                throw new Error(`standalone: minify failed:\n${msgs}`);
            }
            return await res.outputs[0].text();
        } finally {
            try { rmSync(tmpPath, { force: true }); } catch {}
        }
    }

    let transform;
    try {
        ({ transform } = await import('esbuild'));
    } catch (e) {
        throw new Error(`standalone: --min under Node requires esbuild (run \`bun run setup:e2e\`): ${e.message}`, { cause: e });
    }
    const res = await transform(srcText, { minify: true, format: 'esm', loader: 'js' });
    return res.code;
}

// ─── Public API ───
export async function generateStandalone(moduleName, { out, min = false, sourceComments = true, classic = false, endpoint = null, pkg = null } = {}) {
    resolvePkgPaths(pkg ? resolve(pkg) : process.cwd());

    const { byName, unparseable } = scanAll(SRC_DIR);
    if (unparseable.length) {
        throw new Error(`standalone: ${unparseable.length} module file(s) could not be parsed`);
    }
    if (!byName.has(moduleName)) {
        throw new Error(`standalone: unknown module "${moduleName}"`);
    }

    const order = await buildTopo(moduleName, byName);

    // Closure-capture safety check.
    const findings = [];
    for (const { info, desc } of order) {
        const captured = detectClosureCaptures(info.file, desc.name, desc.factory.toString());
        if (captured.length) findings.push({ name: desc.name, file: info.file, captured });
    }
    if (findings.length) {
        const lines = ['standalone: closure-capture(s) detected — cannot inline factories safely:'];
        for (const f of findings) {
            lines.push(`  • ${f.name} (${f.file})`);
            lines.push(`    captures: ${f.captured.join(', ')}`);
        }
        lines.push('');
        lines.push('Fix : inline the captured data inside the factory body.');
        throw new Error(lines.join('\n'));
    }

    const resolvedEndpoint = classic ? (endpoint || moduleName) : null;
    if (resolvedEndpoint !== null && !/^[A-Za-z_$][\w$]*$/.test(resolvedEndpoint)) {
        throw new Error(
            `standalone: endpoint "${resolvedEndpoint}" is not a valid JS identifier — pass --endpoint <name>`,
        );
    }

    const outPath = resolve(out || join(DIST_DIR, 'standalone', `${moduleName}.js`));
    mkdirSync(dirname(outPath), { recursive: true });

    let src = renderStandalone(order, moduleName, { sourceComments, classic, endpoint: resolvedEndpoint });
    if (min) src = await minify(src);
    writeFileSync(outPath, src, 'utf8');

    const stat = await validateOutput(outPath);

    return {
        outPath,
        bytes: Buffer.byteLength(src, 'utf8'),
        moduleCount: order.length,
        modules: order.map((o) => o.desc.name),
        validate: stat,
        minified: !!min,
        endpoint: resolvedEndpoint,
    };
}

// ─── CLI entry ───
/**
 * Run the `standalone` subcommand CLI. Returns the process exit code.
 * @param {string[]} argv  Args after the `standalone` token.
 * @returns {Promise<number>}
 */
export async function runCli(argv) {
    if (wantsHelp(argv)) { printHelp(HELP_USAGE, HELP_FLAGS, HELP_EXAMPLES); return 0; }

    let opts;
    try { opts = parseArgs(argv); }
    catch (err) { console.error('[standalone] ' + err.message); return 1; }

    try {
        const result = await generateStandalone(opts.moduleName, {
            out: opts.out, min: opts.min, sourceComments: opts.sourceComments,
            classic: opts.classic, endpoint: opts.endpoint, pkg: opts.pkg,
        });
        console.log(`✓ standalone: ${opts.moduleName}`);
        console.log(`  out:      ${result.outPath}`);
        if (result.endpoint) console.log(`  endpoint: globalThis.${result.endpoint} (classic)`);
        console.log(`  modules:  ${result.moduleCount} (${result.modules.join(', ')})`);
        console.log(`  size:     ${result.bytes} B${result.minified ? ' (minified)' : ''}`);
        console.log(`  default:  ${result.validate.type}${result.validate.keys.length ? ` { ${result.validate.keys.join(', ')}${result.validate.keys.length === 10 ? ', …' : ''} }` : ''}`);
        return 0;
    } catch (err) {
        console.error('[standalone] FAILED:', err.message);
        if (process.env.DEBUG && err.stack) console.error(err.stack);
        return 1;
    }
}

if (isMainModule(import.meta.url)) {
    runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
