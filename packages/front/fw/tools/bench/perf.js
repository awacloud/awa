// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The fw performance bench: every cell in its own process,
 * calibrated against an A/A run, checked against a native oracle.
 *
 * ## Commands
 *
 *   bun packages/front/fw/tools/bench/perf.js run       [--src <ref|dir>] [opts]
 *   bun packages/front/fw/tools/bench/perf.js compare   --base <ref|dir> [--head <ref|dir>] [--calibration <file>] [opts]
 *   bun packages/front/fw/tools/bench/perf.js calibrate [--src <ref|dir>] [opts]
 *
 *   opts: --rt bun|node (default bun) · --procs N (default 3 for run, 5 for
 *         compare / calibrate) · --reps 9 · --warmup 3 · --only <regex> ·
 *         --floor <percent> (default 3) · --tag <name> (default the command) ·
 *         --out <dir> (default evidence/fw-perf/<tag>/)
 *
 * - `run` times fw and its oracle: per cell the median of the per-process
 *   medians, the spread across processes ((max − min) / median), the ratio to
 *   the oracle, and the parity check of every fw engine.
 * - `compare` times two fw trees — `base` and `head` (default: the working
 *   tree) — on the same cells, the two sides in ALTERNATING processes
 *   (base, head, then head, base …), so neither side always runs second.
 *   Per cell: `delta = head / base − 1` and a gate `threshold = max(floor,
 *   the cell's calibrated A/A drift, the spread of either side in this run)`;
 *   the verdict is `faster` (delta < −threshold), `slower` (delta >
 *   threshold) or `within noise`. A head cell whose oracle parity is `false`
 *   or that errors fails the gate too.
 * - `calibrate` compares a tree with itself — the A/A run. Each cell's drift
 *   (|delta| or either side's spread, the larger) is written as
 *   `calibration-<rt>.json`, which `compare --calibration` reads.
 *
 * A `<ref>` is a git revision, materialised with `git archive` into
 * `<repo>/tmp/bench/src-<sha12>/` (git-ignored, reused); a `<dir>` is an fw
 * `src/` directory, or an fw package directory holding one.
 *
 * Exit code: 0, or 1 when a `compare` gate fails (a slower cell, a parity
 * failure, an error) or a `run` cell errors or fails parity. Output: raw
 * JSONL (one line per process), a JSON summary and a Markdown table.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { median } from './perf-cell.js';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const FW_DIR = path.resolve(TOOL_DIR, '../..');
const REPO_ROOT = path.resolve(FW_DIR, '../../..');
const FW_REL = 'packages/front/fw';

// ── pure maths (exported for the tests) ──────────────────────────────────────

/** (max − min) / median of the per-process medians; `null` below two values. */
export function spread(meds) {
    if (meds.length < 2) return null;
    const m = median(meds);
    return m > 0 ? (Math.max(...meds) - Math.min(...meds)) / m : null;
}

/** `false` when a check reports `parity: false`; `true` otherwise. */
const parityOk = (check) => !(check && check.parity === false);

/** Group raw rows by `case|engine` (and `side` when present). */
function groupRows(rows) {
    const cells = new Map();
    for (const r of rows) {
        const key = r.case + '|' + r.engine + (r.side ? '|' + r.side : '');
        if (!cells.has(key)) cells.set(key, { case: r.case, engine: r.engine, side: r.side, meds: [], checks: [], errors: [] });
        const c = cells.get(key);
        if (r.error) c.errors.push(String(r.error).split('\n')[0]);
        else { c.meds.push(r.medianMs); c.checks.push(r.check || {}); }
    }
    return cells;
}

/**
 * Summarise a `run`: per case and engine the median of medians, the spread,
 * the ratio to the oracle, parity and errors.
 * @param {object[]} rows raw cell results
 */
export function summarizeRun(rows) {
    const byCase = {};
    for (const c of groupRows(rows).values()) {
        (byCase[c.case] ||= {})[c.engine] = {
            medianMs: c.meds.length ? median(c.meds) : null,
            spread: spread(c.meds),
            procs: c.meds.length,
            parity: c.checks.every(parityOk),
            check: c.checks[0] || null,
            errors: c.errors,
        };
    }
    for (const engines of Object.values(byCase)) {
        const o = engines.oracle;
        for (const [name, e] of Object.entries(engines)) {
            e.vsOracle = name !== 'oracle' && o && o.medianMs && e.medianMs ? e.medianMs / o.medianMs : null;
        }
    }
    return byCase;
}

/**
 * Compare `base` and `head` rows cell by cell and give each a verdict.
 * @param {object[]} rows raw cell results carrying `side: 'base'|'head'`
 * @param {{ calibration?: Record<string, number>, floor?: number }} [opts] floor and drifts as fractions
 */
export function compareRows(rows, opts = {}) {
    const floor = opts.floor === undefined ? 0.03 : opts.floor;
    const cal = opts.calibration || {};
    const cells = groupRows(rows);
    const out = {};
    for (const c of cells.values()) {
        if (c.side !== 'head') continue;
        const key = c.case + '|' + c.engine;
        const b = cells.get(key + '|base');
        const cell = { case: c.case, engine: c.engine };
        if (c.errors.length || !b || b.errors.length || !c.meds.length || !b.meds.length) {
            out[key] = { ...cell, verdict: 'error', errors: [...c.errors, ...(b ? b.errors : ['no base'])] };
            continue;
        }
        const baseMs = median(b.meds), headMs = median(c.meds);
        const delta = headMs / baseMs - 1;
        const spreads = [spread(b.meds), spread(c.meds)].filter((x) => x !== null);
        const threshold = Math.max(floor, cal[key] || 0, ...spreads);
        let verdict = Math.abs(delta) <= threshold ? 'within noise' : delta < 0 ? 'faster' : 'slower';
        if (!c.checks.every(parityOk)) verdict = 'parity-fail';
        out[key] = { ...cell, baseMs, headMs, delta, threshold, baseSpread: spread(b.meds), headSpread: spread(c.meds), calibrated: cal[key] ?? null, verdict };
    }
    return out;
}

/** The A/A drift of each cell of a self-comparison: max(|delta|, both spreads). */
export function calibrationFrom(compared) {
    const out = {};
    for (const [key, c] of Object.entries(compared)) {
        if (c.verdict === 'error') continue;
        out[key] = Math.max(Math.abs(c.delta), c.baseSpread || 0, c.headSpread || 0);
    }
    return out;
}

/** Whether a compare result passes its gate. */
export const comparePasses = (compared) => Object.values(compared).every((c) => c.verdict === 'within noise' || c.verdict === 'faster');

// ── trees ────────────────────────────────────────────────────────────────────

/**
 * The fw `src/` directory a `--src` / `--base` / `--head` names: the working
 * tree when absent, a directory, or a git ref materialised under `tmp/bench/`.
 * @param {string|undefined} spec
 * @returns {{ src: string, label: string }}
 */
export function resolveSrc(spec) {
    if (!spec) return { src: path.join(FW_DIR, 'src'), label: 'working tree' };
    const asDir = path.resolve(spec);
    if (fs.existsSync(path.join(asDir, 'core/runtime.js'))) return { src: asDir, label: asDir };
    if (fs.existsSync(path.join(asDir, 'src/core/runtime.js'))) return { src: path.join(asDir, 'src'), label: asDir };
    const rev = spawnSync('git', ['rev-parse', '--verify', spec + '^{commit}'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (rev.status !== 0) throw new Error('perf: "' + spec + '" is neither an fw src directory nor a git revision');
    const sha = rev.stdout.trim();
    const target = path.join(REPO_ROOT, 'tmp', 'bench', 'src-' + sha.slice(0, 12));
    const src = path.join(target, FW_REL, 'src');
    if (!fs.existsSync(path.join(src, 'core/runtime.js'))) {
        fs.mkdirSync(target, { recursive: true });
        const tarFile = path.join(target, 'src.tar');
        const ar = spawnSync('git', ['archive', '--format=tar', '-o', tarFile, sha, FW_REL + '/src'], { cwd: REPO_ROOT, encoding: 'utf8' });
        if (ar.status !== 0) throw new Error('perf: git archive failed: ' + ar.stderr);
        const x = spawnSync('tar', ['-xf', 'src.tar'], { cwd: target, encoding: 'utf8' });
        fs.rmSync(tarFile, { force: true });
        if (x.status !== 0 || !fs.existsSync(path.join(src, 'core/runtime.js'))) throw new Error('perf: extracting ' + sha + ' failed: ' + x.stderr);
    }
    return { src, label: spec + ' (' + sha.slice(0, 12) + ')' };
}

// ── processes ────────────────────────────────────────────────────────────────

/** The case and engine names, read in a throwaway process of the runtime. */
function listCells(rt, only, fwOnly) {
    const code = 'import { makeCases } from ' + JSON.stringify(pathToFileURL(path.join(TOOL_DIR, 'perf-cases.js')).href) + ';'
        + 'const c = makeCases(() => null, ""); process.stdout.write(JSON.stringify(Object.entries(c).map(([k, v]) => [k, Object.keys(v.engines)])));';
    const r = rt === 'bun'
        ? spawnSync('bun', ['-e', code], { encoding: 'utf8' })
        : spawnSync(process.platform === 'win32' ? 'node.exe' : 'node', ['--input-type=module', '-e', code], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('perf: cannot list the cases: ' + r.stderr);
    const re = only ? new RegExp(only) : null;
    const cells = [];
    for (const [name, engines] of JSON.parse(r.stdout)) {
        if (re && !re.test(name)) continue;
        for (const e of engines) if (!fwOnly || e !== 'oracle') cells.push([name, e]);
    }
    return cells;
}

/** One cell in a fresh process. */
function spawnCell(rt, src, name, engine, reps, warmup) {
    const args = [path.join(TOOL_DIR, 'perf-cell.js'), '--src', src, '--case', name, '--engine', engine, '--reps', String(reps), '--warmup', String(warmup)];
    const exe = rt === 'bun' ? 'bun' : (process.platform === 'win32' ? 'node.exe' : 'node');
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 600000, cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 });
    const line = (r.stdout || '').trim().split('\n').pop();
    try { return JSON.parse(line); } catch { return { case: name, engine, error: 'no output: ' + String(r.stderr || '').slice(0, 300) }; }
}

// ── formatting ───────────────────────────────────────────────────────────────

const pct = (x) => (x === null || x === undefined ? '' : (x * 100).toFixed(1) + ' %');
const ms = (x) => (x === null || x === undefined ? 'error' : x.toFixed(3));

function runMarkdown(rt, summary) {
    let md = '| Case | Engine | median ms | spread | × oracle | parity |\n|---|---|---|---|---|---|\n';
    for (const [c, engines] of Object.entries(summary)) {
        for (const [e, v] of Object.entries(engines)) {
            md += '| ' + c + ' | ' + e + ' | ' + ms(v.medianMs) + ' | ' + pct(v.spread) + ' | '
                + (v.vsOracle ? v.vsOracle.toFixed(1) + '×' : '') + ' | '
                + (v.errors.length ? 'ERROR ' + v.errors[0].slice(0, 60) : e === 'oracle' ? '' : String(v.check && 'parity' in v.check ? v.check.parity : '—')) + ' |\n';
        }
    }
    return '## perf run — ' + rt + '\n\n' + md;
}

function compareMarkdown(rt, base, head, compared) {
    let md = '| Cell | base ms | head ms | delta | threshold | verdict |\n|---|---|---|---|---|---|\n';
    for (const c of Object.values(compared)) {
        md += '| ' + c.case + ' · ' + c.engine + ' | ' + ms(c.baseMs) + ' | ' + ms(c.headMs) + ' | ' + pct(c.delta) + ' | ' + pct(c.threshold) + ' | ' + c.verdict + ' |\n';
    }
    return '## perf compare — ' + rt + '\n\nbase: ' + base + '  \nhead: ' + head + '\n\n' + md;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    const o = { cmd };
    for (let i = 0; i < rest.length; i++) {
        if (rest[i].startsWith('--')) { o[rest[i].slice(2)] = rest[i + 1]; i++; }
    }
    return o;
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (!['run', 'compare', 'calibrate'].includes(o.cmd)) {
        process.stderr.write('usage: perf.js run|compare|calibrate [--src|--base|--head <ref|dir>] [--rt bun|node] [--procs N] [--reps N] [--warmup N] [--only re] [--floor pct] [--calibration file] [--tag name] [--out dir]\n');
        return 2;
    }
    const rt = o.rt || 'bun';
    const reps = Number(o.reps || 9), warmup = Number(o.warmup || 3);
    const procs = Number(o.procs || (o.cmd === 'run' ? 3 : 5));
    const floor = (o.floor === undefined ? 3 : Number(o.floor)) / 100;
    const outDir = path.resolve(o.out || path.join(REPO_ROOT, 'evidence', 'fw-perf', o.tag || o.cmd));
    fs.mkdirSync(outDir, { recursive: true });
    const raw = path.join(outDir, 'raw-' + rt + '.jsonl');
    fs.writeFileSync(raw, '');
    const log = (row) => { fs.appendFileSync(raw, JSON.stringify(row) + '\n'); process.stderr.write([row.side, row.case, row.engine, row.proc, row.error ? 'ERROR' : ms(row.medianMs)].filter((x) => x !== undefined).join(' ') + '\n'); };

    if (o.cmd === 'run') {
        const { src, label } = resolveSrc(o.src);
        const rows = [];
        for (const [name, engine] of listCells(rt, o.only, false)) {
            for (let p = 0; p < procs; p++) { const r = { proc: p, ...spawnCell(rt, src, name, engine, reps, warmup) }; rows.push(r); log(r); }
        }
        const summary = summarizeRun(rows);
        fs.writeFileSync(path.join(outDir, 'summary-' + rt + '.json'), JSON.stringify({ rt, src: label, procs, reps, warmup, summary }, null, 1));
        const md = runMarkdown(rt, summary);
        fs.writeFileSync(path.join(outDir, 'summary-' + rt + '.md'), md);
        process.stdout.write(md);
        const bad = Object.values(summary).some((engines) => Object.entries(engines).some(([e, v]) => v.errors.length || (e !== 'oracle' && !v.parity)));
        return bad ? 1 : 0;
    }

    const base = resolveSrc(o.cmd === 'calibrate' ? o.src : o.base);
    if (o.cmd === 'compare' && !o.base) throw new Error('perf compare: --base is required');
    const head = o.cmd === 'calibrate' ? base : resolveSrc(o.head);
    const calibration = o.calibration ? JSON.parse(fs.readFileSync(o.calibration, 'utf8')).drift : undefined;
    const rows = [];
    for (const [name, engine] of listCells(rt, o.only, true)) {
        for (let p = 0; p < procs; p++) {
            const order = p % 2 === 0 ? [['base', base], ['head', head]] : [['head', head], ['base', base]];
            for (const [side, tree] of order) { const r = { proc: p, side, ...spawnCell(rt, tree.src, name, engine, reps, warmup) }; rows.push(r); log(r); }
        }
    }
    const compared = compareRows(rows, { calibration, floor });
    const meta = { rt, base: base.label, head: head.label, procs, reps, warmup, floor };
    fs.writeFileSync(path.join(outDir, 'compare-' + rt + '.json'), JSON.stringify({ ...meta, compared }, null, 1));
    let md = compareMarkdown(rt, base.label, head.label, compared);
    if (o.cmd === 'calibrate') {
        const drift = calibrationFrom(compared);
        fs.writeFileSync(path.join(outDir, 'calibration-' + rt + '.json'), JSON.stringify({ ...meta, drift }, null, 1));
        md += '\nCalibration written: ' + path.join(outDir, 'calibration-' + rt + '.json') + '\n';
    }
    fs.writeFileSync(path.join(outDir, 'compare-' + rt + '.md'), md);
    process.stdout.write(md);
    return o.cmd === 'calibrate' ? 0 : (comparePasses(compared) ? 0 : 1);
}

const isMain = typeof Bun !== 'undefined' ? import.meta.main : process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
    main().then((code) => process.exit(code), (e) => { process.stderr.write(String((e && e.stack) || e) + '\n'); process.exit(2); });
}
