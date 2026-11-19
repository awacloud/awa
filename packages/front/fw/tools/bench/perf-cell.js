// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview One `perf.js` cell per process: one case, one engine, one fw
 * source tree. `warmup` untimed calls, then `reps` timed calls; prints ONE JSON
 * line (median / min / max ms, the parity check, the runtime). Run by
 * `perf.js`, never in the same process as another cell — two engines sharing a
 * process share call sites, and the engine's JIT then biases the timings
 * (BL-1704 measured 10-15 % between two identical copies).
 *
 *   <bun|node> perf-cell.js --src <fw src dir> --case <name> --engine <name> [--reps 9] [--warmup 3]
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeCases } from './perf-cases.js';

/** `--key value` pairs. */
export function parseCellArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1]; i++; }
    }
    return out;
}

/** Median of a non-empty numeric array. */
export function median(nums) {
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

/**
 * Run one cell in this process.
 * @param {{ src: string, case: string, engine: string, reps?: (string|number), warmup?: (string|number) }} a
 * @returns {Promise<object>} the JSON-able result
 */
export async function runCell(a) {
    const reps = Number(a.reps || 9);
    const warmup = Number(a.warmup || 3);
    const src = path.resolve(a.src);
    const runtime = typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.version;
    const base = { case: a.case, engine: a.engine, src, reps, warmup, runtime };
    const { ModuleRuntime } = await import(pathToFileURL(path.join(src, 'core/runtime.js')).href);
    const { default: modules } = await import(pathToFileURL(path.join(src, 'core/modules.js')).href);
    const rt = new ModuleRuntime();
    rt.registerAll(modules);
    const cases = makeCases((n) => rt.resolve(n), src);
    const c = cases[a.case];
    if (!c || !c.engines[a.engine]) return { ...base, error: 'unknown case or engine' };
    const quiet = { warn: console.warn, error: console.error };
    let consoleLines = 0;
    console.warn = () => { consoleLines++; };
    console.error = () => { consoleLines++; };
    try {
        const cell = c.engines[a.engine]();
        let out;
        for (let i = 0; i < warmup; ++i) out = cell.run();
        const times = [];
        for (let i = 0; i < reps; ++i) {
            const t = performance.now();
            out = cell.run();
            times.push(performance.now() - t);
        }
        const check = cell.check ? cell.check(out) : {};
        return { ...base, size: c.size, medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times), check, consoleLines };
    } catch (e) {
        return { ...base, error: String((e && e.stack) || e).slice(0, 600) };
    } finally {
        console.warn = quiet.warn;
        console.error = quiet.error;
    }
}

const isMain = typeof Bun !== 'undefined' ? import.meta.main : process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
    const res = await runCell(parseCellArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exit(res.error ? 1 : 0);
}
