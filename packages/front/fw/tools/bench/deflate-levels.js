// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview DEFLATE level bench harness — old vs new engine, per level
 * per corpus, deterministic corpora, median-of-N timing.
 *
 * Compares two `deflate.js` engines (an "old" baseline and a "new"
 * candidate) across compression levels 1-9 and a fixed set of deterministic
 * corpora, reporting time and output-size deltas. Ships as a tool: it does
 * NOT assert a pass/fail verdict itself — the harness measures, the gate is
 * read by the consuming task.
 *
 * Usage:
 *   bun packages/front/fw/tools/bench/deflate-levels.js
 *       [--baseline <git-ref>] | [--old <abs path to a deflate.js>]
 *       [--new <abs path>]            default: ../../src/io/compress/deflate.js
 *       [--levels 1-9] [--reps 7] [--warmup 3]
 *       [--corpora text,source,json,random,repeat,small]
 *       [--opts <json>]              extra options merged into the NEW engine's
 *                                    calls, e.g. '{"lazy":true}' (the old engine
 *                                    always runs `{ level }` alone)
 *       [--json <out file>]
 *
 * `--baseline <ref>` materialises `git show <ref>:.../deflate.js` into
 * `<repo>/tmp/bench/deflate-<ref>.js` (gitignored at any depth), rewriting
 * its `./bitstream.js` / `./huffman.js` specifiers to the absolute
 * `file://` URLs of the LIVE modules — those are unchanged by this batch,
 * so the old engine runs against its real dependencies.
 *
 * Wiring is identical for both engines: `mod.deflate.factory(bs,
 * huffman.factory(bs), lz77.factory())` — an old 2-arg `deflate.factory`
 * simply ignores the third argument.
 *
 * This module has no side effects on import: the CLI (print + optional
 * JSON write) runs only under `import.meta.main`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bitstream } from '../../src/io/compress/bitstream.js';
import { huffman } from '../../src/io/compress/huffman.js';
import { lz77 } from '../../src/io/compress/lz77.js';
import { buildCorpus, bytesEqual, median } from './_corpora.js';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
// packages/front/fw/tools/bench -> repo root (5 levels up).
const REPO_ROOT = path.resolve(TOOL_DIR, '../../../../..');
const DEFLATE_REL = 'packages/front/fw/src/io/compress/deflate.js';
const DEFAULT_DEFLATE_PATH = path.resolve(TOOL_DIR, '../../src/io/compress/deflate.js');

const DEFAULT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DEFAULT_CORPORA = ['text', 'source', 'json', 'random', 'repeat', 'small'];

// ── baseline materialisation (git show + dependency-specifier rewrite) ─────

function materializeBaseline(ref) {
    const res = Bun.spawnSync(['git', 'show', ref + ':' + DEFLATE_REL], { cwd: REPO_ROOT });
    if (res.exitCode !== 0) {
        const stderr = res.stderr ? res.stderr.toString('utf8') : '';
        throw new Error('deflate-levels: git show ' + ref + ':' + DEFLATE_REL + ' failed: ' + stderr);
    }
    let src = res.stdout.toString('utf8');
    const bsUrl = pathToFileURL(path.join(REPO_ROOT, 'packages/front/fw/src/io/compress/bitstream.js')).href;
    const hfUrl = pathToFileURL(path.join(REPO_ROOT, 'packages/front/fw/src/io/compress/huffman.js')).href;
    src = src.replace("from './bitstream.js'", "from '" + bsUrl + "'");
    src = src.replace("from './huffman.js'", "from '" + hfUrl + "'");

    const safeRef = ref.replace(/[^A-Za-z0-9._-]/g, '_');
    const outDir = path.join(REPO_ROOT, 'tmp', 'bench');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'deflate-' + safeRef + '.js');
    fs.writeFileSync(outFile, src);
    return outFile;
}

// ── engine wiring ────────────────────────────────────────────────────────────

async function wireEngine(absPath) {
    const mod = await import(pathToFileURL(absPath).href);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const lz = lz77.factory();
    return mod.deflate.factory(bs, hf, lz);
}

// ── measurement ──────────────────────────────────────────────────────────────

function runOnceSingle(engine, data, opts) {
    const t0 = Bun.nanoseconds();
    const out = engine.deflateSync(data, opts);
    const ns = Bun.nanoseconds() - t0;
    return { ns, bytes: out.length, outs: [out] };
}

function runOnceSmall(engine, slices, opts) {
    let ns = 0, bytes = 0;
    const outs = [];
    for (const slice of slices) {
        const t0 = Bun.nanoseconds();
        const out = engine.deflateSync(slice, opts);
        ns += Bun.nanoseconds() - t0;
        bytes += out.length;
        outs.push(out);
    }
    return { ns, bytes, outs };
}

/**
 * Run `warmup` untimed + `reps` timed compressions of `corpusData` at
 * `level` (plus `extraOpts`) through `engine`, returning the MEDIAN ms and
 * output byte count. Asserts a round-trip once (throws on mismatch).
 */
function measureCell(engine, corpusName, corpusData, level, reps, warmup, extraOpts) {
    const isSmall = corpusName === 'small';
    const opts = { ...(extraOpts || {}), level };
    const runOnce = () => isSmall ? runOnceSmall(engine, corpusData, opts) : runOnceSingle(engine, corpusData, opts);

    for (let w = 0; w < warmup; ++w) runOnce();

    const timesMs = [];
    let bytes = 0, lastOuts = null;
    for (let r = 0; r < reps; ++r) {
        const res = runOnce();
        timesMs.push(res.ns / 1e6);
        bytes = res.bytes;
        lastOuts = res.outs;
    }

    if (isSmall) {
        for (let i = 0; i < corpusData.length; ++i) {
            const back = engine.inflateSync(lastOuts[i]);
            if (!bytesEqual(back, corpusData[i])) {
                throw new Error('deflate-levels: round-trip mismatch (level ' + level + ", corpus 'small', slice " + i + ')');
            }
        }
    } else {
        const back = engine.inflateSync(lastOuts[0]);
        if (!bytesEqual(back, corpusData)) {
            throw new Error('deflate-levels: round-trip mismatch (level ' + level + ", corpus '" + corpusName + "')");
        }
    }

    return { ms: median(timesMs), bytes };
}

function pct(oldV, newV) {
    return oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
}

/**
 * Run the level bench. Resolves the old engine from `options.oldPath`, or
 * `options.baseline` (a git ref, materialised via `git show`), or — if
 * neither is given — the same default live `deflate.js` as the new engine.
 *
 * @param {object} [options]
 * @param {string} [options.baseline] - git ref for the old engine
 * @param {string} [options.oldPath] - absolute path to an old `deflate.js`
 * @param {string} [options.newPath] - absolute path to the new `deflate.js` (default: live)
 * @param {number[]} [options.levels] - default 1-9
 * @param {number} [options.reps] - default 7
 * @param {number} [options.warmup] - default 3
 * @param {string[]} [options.corpora] - default all six corpora
 * @param {object} [options.newOpts] - extra `deflateSync` options for the NEW engine only
 * @returns {Promise<object>} `{ host, baseline, newOpts, generatedAt, levels }`
 */
export async function runBench(options = {}) {
    const levels = options.levels && options.levels.length ? options.levels : DEFAULT_LEVELS;
    const reps = options.reps ?? 7;
    const warmup = options.warmup ?? 3;
    const corporaNames = options.corpora && options.corpora.length ? options.corpora : DEFAULT_CORPORA;

    const newPath = options.newPath || DEFAULT_DEFLATE_PATH;
    let oldPath;
    if (options.oldPath) oldPath = options.oldPath;
    else if (options.baseline) oldPath = materializeBaseline(options.baseline);
    else oldPath = DEFAULT_DEFLATE_PATH;

    const oldEngine = await wireEngine(oldPath);
    const newEngine = await wireEngine(newPath);

    const corpusCache = new Map();
    const getCorpus = (name) => {
        if (!corpusCache.has(name)) corpusCache.set(name, buildCorpus(name));
        return corpusCache.get(name);
    };

    const levelsOut = {};
    for (const level of levels) {
        const corporaOut = {};
        let aggOldMs = 0, aggNewMs = 0, aggOldBytes = 0, aggNewBytes = 0;
        for (const name of corporaNames) {
            const data = getCorpus(name);
            const oldRes = measureCell(oldEngine, name, data, level, reps, warmup, null);
            const newRes = measureCell(newEngine, name, data, level, reps, warmup, options.newOpts);
            corporaOut[name] = {
                oldMs: oldRes.ms, newMs: newRes.ms, deltaTimePct: pct(oldRes.ms, newRes.ms),
                oldBytes: oldRes.bytes, newBytes: newRes.bytes, deltaBytesPct: pct(oldRes.bytes, newRes.bytes),
            };
            aggOldMs += oldRes.ms; aggNewMs += newRes.ms;
            aggOldBytes += oldRes.bytes; aggNewBytes += newRes.bytes;
        }
        levelsOut[String(level)] = {
            corpora: corporaOut,
            oldMs: aggOldMs, newMs: aggNewMs, deltaTimePct: pct(aggOldMs, aggNewMs),
            oldBytes: aggOldBytes, newBytes: aggNewBytes, deltaBytesPct: pct(aggOldBytes, aggNewBytes),
        };
    }

    return {
        host: {
            platform: process.platform,
            arch: process.arch,
            cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'unknown',
            bunVersion: Bun.version,
        },
        baseline: options.baseline || null,
        newOpts: options.newOpts || null,
        generatedAt: new Date().toISOString(),
        levels: levelsOut,
    };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseLevels(spec) {
    if (spec.includes(',')) return spec.split(',').map(s => parseInt(s.trim(), 10));
    if (spec.includes('-')) {
        const [a, b] = spec.split('-').map(s => parseInt(s.trim(), 10));
        const out = [];
        for (let l = a; l <= b; ++l) out.push(l);
        return out;
    }
    return [parseInt(spec, 10)];
}

function parseArgv(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; ++i) {
        const a = argv[i];
        switch (a) {
            case '--baseline': opts.baseline = argv[++i]; break;
            case '--old':      opts.oldPath  = argv[++i]; break;
            case '--new':      opts.newPath  = argv[++i]; break;
            case '--levels':   opts.levels   = parseLevels(argv[++i]); break;
            case '--reps':     opts.reps     = parseInt(argv[++i], 10); break;
            case '--warmup':   opts.warmup   = parseInt(argv[++i], 10); break;
            case '--corpora':  opts.corpora  = argv[++i].split(',').map(s => s.trim()).filter(Boolean); break;
            case '--opts':     opts.newOpts  = JSON.parse(argv[++i]); break;
            case '--json':     opts.jsonOut  = argv[++i]; break;
            default: break; // unrecognized flags are ignored by this dev harness
        }
    }
    return opts;
}

function fmtNum(n) {
    return Number(n).toFixed(2);
}

function formatMarkdown(result) {
    const lines = [];
    lines.push('| Level | Corpus | Old ms | New ms | Δtime % | Old B | New B | Δbytes % |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const levelKey of Object.keys(result.levels)) {
        const lvl = result.levels[levelKey];
        for (const corpusName of Object.keys(lvl.corpora)) {
            const c = lvl.corpora[corpusName];
            lines.push('| ' + levelKey + ' | ' + corpusName + ' | ' + fmtNum(c.oldMs) + ' | ' + fmtNum(c.newMs) +
                ' | ' + fmtNum(c.deltaTimePct) + ' | ' + c.oldBytes + ' | ' + c.newBytes + ' | ' + fmtNum(c.deltaBytesPct) + ' |');
        }
        lines.push('| ' + levelKey + ' | **TOTAL** | ' + fmtNum(lvl.oldMs) + ' | ' + fmtNum(lvl.newMs) +
            ' | ' + fmtNum(lvl.deltaTimePct) + ' | ' + lvl.oldBytes + ' | ' + lvl.newBytes + ' | ' + fmtNum(lvl.deltaBytesPct) + ' |');
    }
    return lines.join('\n');
}

async function main() {
    const opts = parseArgv(process.argv.slice(2));
    try {
        const result = await runBench(opts);
        if (opts.jsonOut) fs.writeFileSync(opts.jsonOut, JSON.stringify(result, null, 2));
        console.log(formatMarkdown(result));
    } catch (err) {
        console.error(err && err.stack ? err.stack : String(err));
    }
}

// The harness measures; the gate is read by the consuming task — exit 0 always.
if (import.meta.main) {
    main().then(() => process.exit(0));
}
