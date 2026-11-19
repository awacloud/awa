// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The public API surface of `@awacloud/fw`, measured, and the
 * snapshot that freezes it (`docs/api/surface.json`).
 *
 * The surface has three parts, all read from the package itself:
 *   1. `entries` — every key of the `exports` map and, for each JavaScript
 *      target, the names it exports (a wildcard key is expanded over the files
 *      it matches, which are the registry modules);
 *   2. `modules` — for each registry module, its name, dependencies and the
 *      shape of the API it resolves to: the key tree (depth 4) with each key's
 *      kind (`function`, `class`, `getter`, `object`, `number`…), values left
 *      out. Keys whose name starts with `_` (the `_internal` hatches) are
 *      listed apart, in `internal`: they are outside the semver contract
 *      (`docs/guide/stability.md`);
 *   3. `types` — the SHA-256 of every published declaration file with its
 *      comments and blank space removed, so a documentation edit does not
 *      move it and a changed signature does. The generated tree is emitted by
 *      `tsc -p tsconfig.types.json` into a temporary directory.
 *
 * Usage (from packages/front/fw):
 *   bun tools/api-surface.js            # write docs/api/surface.json
 *   bun tools/api-surface.js --check    # compare, print the classified diff, exit 1 on drift
 *   bun tools/api-surface.js --no-types # runtime parts only (no tsc)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT = path.join(ROOT, 'docs', 'api', 'surface.json');
const MAX_DEPTH = 4;

const posix = (p) => p.split(path.sep).join('/');

/** @param {string} dir @returns {string[]} absolute file paths, recursive */
function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
    });
}

/**
 * Expand one `exports` key over the package files, honouring the `null`
 * (blocked) patterns of the map.
 * @param {Record<string, any>} map
 * @returns {Array<{key: string, subpath: string, file: string|null, types: string|null}>}
 */
export function expandExports(map) {
    const blocked = Object.entries(map).filter(([, v]) => v === null).map(([k]) => k);
    const toRe = (pat) => new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('(.+)') + '$');
    const isBlocked = (sub) => blocked.some((b) => toRe(b).test(sub));
    const out = [];
    for (const [key, v] of Object.entries(map)) {
        if (v === null) continue;
        const target = typeof v === 'string' ? v : (v.default || v.import || null);
        const types = typeof v === 'object' && v.types ? v.types : null;
        if (!key.includes('*')) {
            out.push({ key, subpath: key, file: target, types });
            continue;
        }
        if (!target || !target.endsWith('*.js')) { out.push({ key, subpath: key, file: null, types: null }); continue; }
        // Expand a JS wildcard over the files it matches.
        const [pre, post] = target.split('*');
        const base = path.join(ROOT, pre);
        for (const f of walk(base)) {
            const rel = './' + posix(path.relative(ROOT, f));
            if (!rel.startsWith(pre) || !rel.endsWith(post)) continue;
            const star = rel.slice(pre.length, rel.length - post.length);
            const sub = key.replace('*', star);
            if (isBlocked(sub) || /\.(test|kat|reference)$/.test(star) || star.includes('__fixtures__')) continue;
            out.push({ key, subpath: sub, file: rel, types: types ? types.replace('*', star) : null });
        }
    }
    return out;
}

/**
 * The kind of a value, without reading a getter.
 * @param {any} v
 * @returns {string}
 */
function kindOf(v) {
    if (v === null) return 'null';
    if (typeof v === 'function') {
        const proto = v.prototype;
        const methods = proto ? Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor') : [];
        return methods.length || /^class\b/.test(Function.prototype.toString.call(v)) ? 'class' : 'function';
    }
    if (Array.isArray(v)) return 'array';
    if (ArrayBuffer.isView(v)) return v.constructor.name;
    if (v instanceof Map) return 'Map';
    if (v instanceof Set) return 'Set';
    return typeof v;
}

/**
 * The key tree of a resolved API: `{ key: kind }` or `{ key: { kind, keys } }`.
 * Public and `_`-prefixed keys are split; the walk stops at MAX_DEPTH and at
 * an object already seen.
 * @param {any} v
 * @param {number} depth
 * @param {Set<any>} seen
 * @returns {any}
 */
function shape(v, depth, seen) {
    const kind = kindOf(v);
    const walkable = (kind === 'object' || kind === 'function' || kind === 'class') && v !== null;
    if (!walkable || depth >= MAX_DEPTH || seen.has(v)) return kind;
    seen.add(v);
    const keys = {};
    const internal = [];
    const names = Object.getOwnPropertyNames(v).filter((n) => !(typeof v === 'function' && ['length', 'name', 'prototype', 'arguments', 'caller'].includes(n)));
    if (kind === 'class') {
        for (const n of Object.getOwnPropertyNames(v.prototype)) if (n !== 'constructor') names.push('prototype.' + n);
    }
    for (const n of names.sort()) {
        if (n.startsWith('_') || n.startsWith('prototype._')) { internal.push(n); continue; }
        let d;
        if (n.startsWith('prototype.')) d = Object.getOwnPropertyDescriptor(v.prototype, n.slice(10));
        else d = Object.getOwnPropertyDescriptor(v, n);
        if (!d) continue;
        if (d.get || d.set) { keys[n] = d.get && d.set ? 'accessor' : d.get ? 'getter' : 'setter'; continue; }
        keys[n] = shape(d.value, depth + 1, seen);
    }
    seen.delete(v);
    if (!Object.keys(keys).length && !internal.length) return kind;
    const node = { kind, keys };
    if (internal.length) node.internal = internal;
    return node;
}

/**
 * The names an ES module exports, read from its source: the fallback for an
 * entry that cannot be imported here (a peer package absent, or an entry whose
 * import is its effect, such as `sanity/lockdown.apply`).
 * @param {string} src
 * @returns {string[]}
 */
export function staticExports(src) {
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(',')) {
            const t = part.trim();
            if (t) names.add(t.split(/\s+as\s+/).pop().trim());
        }
    }
    if (/^export\s+default\b/m.test(src)) names.add('default');
    return [...names].sort();
}

/** Entries whose import has an intended effect on the process (never imported here). */
const EFFECT_ENTRIES = new Set(['./src/sanity/lockdown-apply.js']);

/** @returns {Promise<{entries: any, modules: any}>} */
export async function collectRuntime() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const { ModuleRuntime } = await import(pathToFileURL(path.join(ROOT, 'src/core/runtime.js')).href);
    const modules = (await import(pathToFileURL(path.join(ROOT, 'src/core/modules.js')).href)).default;
    const rt = new ModuleRuntime();
    rt.registerAll(modules);
    const out = {};
    for (const m of [...modules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        let api;
        try { api = shape(rt.resolve(m.name), 0, new Set()); } catch (err) { api = 'resolve failed: ' + (err && err.message); }
        out[m.name] = { type: m.type || null, dependencies: [...(m.dependencies || [])], api };
    }
    // The entries after the modules: an entry's import must not change what
    // the modules resolve to.
    const entries = {};
    for (const e of expandExports(pkg.exports)) {
        const row = { file: e.file };
        // Built artifacts (`dist/`, classic scripts) are recorded by path only:
        // they are not in a fresh checkout and export nothing.
        if (e.file && /\.(m?js)$/.test(e.file) && !e.file.startsWith('./dist/')) {
            const abs = path.join(ROOT, e.file);
            if (EFFECT_ENTRIES.has(e.file)) row.exports = staticExports(fs.readFileSync(abs, 'utf8'));
            else {
                try {
                    row.exports = Object.keys(await import(pathToFileURL(abs).href)).sort();
                } catch {
                    row.exports = staticExports(fs.readFileSync(abs, 'utf8'));
                }
            }
        }
        entries[e.subpath] = row;
    }
    return { entries, modules: out };
}

/**
 * Normalise a declaration file: no comments, no source-map line, single spaces.
 * @param {string} s
 * @returns {string}
 */
export function normaliseDts(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @returns {string|null} the installed tsc entry, or null */
export function resolveTsc() {
    try {
        const req = createRequire(path.join(ROOT, 'package.json'));
        return path.join(path.dirname(req.resolve('typescript/package.json')), 'bin', 'tsc');
    } catch { return null; }
}

/**
 * Emit the declaration tree into a temporary directory and hash each
 * published `.d.ts` (the generated tree plus the committed hand-written ones).
 * @returns {Record<string, string>|null} null when TypeScript is not installed
 */
export function collectTypes() {
    const tsc = resolveTsc();
    if (!tsc) return null;
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-api-surface-'));
    try {
        const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.types.json', '--outDir', out, '--declarationMap', 'false', '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' });
        if (res.status !== 0 && !walk(out).length) throw new Error('tsc failed: ' + (res.stdout || res.stderr));
        const hashes = {};
        const add = (key, file) => { hashes[key] = crypto.createHash('sha256').update(normaliseDts(fs.readFileSync(file, 'utf8'))).digest('hex'); };
        for (const f of walk(out).filter((f) => f.endsWith('.d.ts'))) {
            const rel = posix(path.relative(out, f));
            if (/\.(test|kat|reference)\.d\.ts$/.test(rel) || rel.includes('__fixtures__')) continue;
            add('dist/types/' + rel, f);
        }
        for (const dir of ['types', 'integrations']) {
            for (const f of walk(path.join(ROOT, dir)).filter((f) => f.endsWith('.d.ts'))) add(posix(path.relative(ROOT, f)), f);
        }
        return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : 1)));
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
}

/**
 * @param {{types?: boolean}} [opts]
 * @returns {Promise<any>}
 */
export async function collect(opts = {}) {
    const { entries, modules } = await collectRuntime();
    const surface = { schema: 'fw-api-surface/1', entries, modules };
    if (opts.types !== false) surface.types = collectTypes();
    return surface;
}

/**
 * Classify the difference between two surfaces: a removed or re-kinded public
 * key or entry is `breaking`, an added one `additive`, a change under an
 * `internal` list `internal`, a changed declaration hash `types`.
 * @param {any} before
 * @param {any} after
 * @returns {Array<{class: string, where: string, detail: string}>}
 */
export function diff(before, after) {
    const out = [];
    const push = (cls, where, detail) => out.push({ class: cls, where, detail });
    const cmpKeys = (a, b, where) => {
        const ka = Object.keys(a || {}), kb = Object.keys(b || {});
        for (const k of ka) if (!(k in (b || {}))) push('breaking', where, `removed ${k}`);
        for (const k of kb) if (!(k in (a || {}))) push('additive', where, `added ${k}`);
        return ka.filter((k) => k in (b || {}));
    };
    for (const k of cmpKeys(before.entries, after.entries, 'entries')) {
        const a = before.entries[k], b = after.entries[k];
        if (a.file !== b.file) push('breaking', `entries.${k}`, `target ${a.file} → ${b.file}`);
        if (Array.isArray(a.exports) && Array.isArray(b.exports)) {
            for (const n of a.exports) if (!b.exports.includes(n)) push('breaking', `entries.${k}`, `export ${n} removed`);
            for (const n of b.exports) if (!a.exports.includes(n)) push('additive', `entries.${k}`, `export ${n} added`);
        } else if (JSON.stringify(a.exports) !== JSON.stringify(b.exports)) push('breaking', `entries.${k}`, `exports ${JSON.stringify(a.exports)} → ${JSON.stringify(b.exports)}`);
    }
    const node = (where, a, b) => {
        const kindA = typeof a === 'string' ? a : a.kind, kindB = typeof b === 'string' ? b : b.kind;
        if (kindA !== kindB) { push('breaking', where, `kind ${kindA} → ${kindB}`); return; }
        const ia = (typeof a === 'object' && a.internal) || [], ib = (typeof b === 'object' && b.internal) || [];
        if (JSON.stringify(ia) !== JSON.stringify(ib)) push('internal', where, `internal ${JSON.stringify(ia)} → ${JSON.stringify(ib)}`);
        const keysA = (typeof a === 'object' && a.keys) || {}, keysB = (typeof b === 'object' && b.keys) || {};
        for (const k of cmpKeys(keysA, keysB, where)) node(`${where}.${k}`, keysA[k], keysB[k]);
    };
    for (const m of cmpKeys(before.modules, after.modules, 'modules')) {
        const a = before.modules[m], b = after.modules[m];
        if (JSON.stringify(a.dependencies) !== JSON.stringify(b.dependencies)) push('dependencies', `modules.${m}`, `${JSON.stringify(a.dependencies)} → ${JSON.stringify(b.dependencies)}`);
        node(`modules.${m}`, a.api, b.api);
    }
    if (before.types && after.types) {
        for (const k of Object.keys(before.types)) {
            if (!(k in after.types)) push('breaking', 'types', `removed ${k}`);
            else if (before.types[k] !== after.types[k]) push('types', 'types', `changed ${k}`);
        }
        for (const k of Object.keys(after.types)) if (!(k in before.types)) push('additive', 'types', `added ${k}`);
    }
    return out;
}

/** @param {any} s @returns {string} */
export const serialise = (s) => JSON.stringify(s, null, 1) + '\n';

async function main(argv) {
    const check = argv.includes('--check');
    const types = !argv.includes('--no-types');
    const surface = await collect({ types });
    if (!check) {
        fs.writeFileSync(SNAPSHOT, serialise(surface));
        const n = Object.keys(surface.modules).length, e = Object.keys(surface.entries).length;
        console.log(`[api-surface] wrote docs/api/surface.json (${e} entries, ${n} modules${surface.types ? `, ${Object.keys(surface.types).length} declaration files` : ''})`);
        return 0;
    }
    const before = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    if (!types) delete before.types;
    const d = diff(before, surface);
    if (!d.length) { console.log('[api-surface] OK: the public surface matches docs/api/surface.json'); return 0; }
    for (const x of d) console.log(`  ${x.class.padEnd(12)} ${x.where}: ${x.detail}`);
    console.log(`[api-surface] DRIFT: ${d.length} difference(s). A breaking one needs a major (or a deprecation, docs/guide/stability.md); record each in CHANGELOG.md, then run \`bun run api:surface\`.`);
    return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
