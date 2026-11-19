# Measuring performance — `tools/bench/perf.js`

The bench for a change that claims to be faster (or must not be slower): every
measurement in its own process, each cell gated by the noise an A/A run
measured on it, every fw result checked against a native oracle. It lives in
the source repository (`tools/bench/` is not part of the published package) and
runs under **Bun** (JavaScriptCore) or **Node** (V8) — a browser runs one of the
two engine families.

## Why one cell per process

Timing two engines in one process puts them behind the same call sites, and the
JIT's polymorphic dispatch then biases them: two byte-identical copies of one
primitive measured 4.1 ms and 4.6 ms in one process, 3.25 ms each in their own.
`perf.js` spawns one process per (case, engine, tree), with untimed warmups,
then times `reps` calls and keeps the median.

## Commands

```sh
# fw against its native oracle (node:zlib, node:crypto, Buffer …)
bun tools/bench/perf.js run [--only <regex>] [--rt bun|node]

# the A/A run: a tree compared with itself, per-cell drift written out
bun tools/bench/perf.js calibrate --tag aa

# a change: base (a git revision or an fw src dir) against the working tree
bun tools/bench/perf.js compare --base main --calibration ../../../evidence/fw-perf/aa/calibration-bun.json
```

Options: `--procs N` (processes per cell and side; 3 for `run`, 5 otherwise),
`--reps N` (9), `--warmup N` (3), `--floor <percent>` (3), `--tag <name>`,
`--out <dir>` (default `evidence/fw-perf/<tag>/` at the repository root),
`--head <ref|dir>` (default the working tree). Run on an idle machine, one
bench at a time.

## Reading a compare

`compare` runs the two sides in alternating processes (base then head, then
head then base …) and gives each cell:

- `delta = head / base − 1`;
- `threshold = max(floor, the cell's calibrated A/A drift, the spread of either
  side in this run)`, the spread being (max − min) / median over the processes;
- a verdict: **faster** (`delta < −threshold`), **slower** (`delta >
  threshold`), **within noise**, **parity-fail** (the head result differs
  from the oracle) or **error**.

It exits 1 when a cell is slower, fails parity or errors. A cell whose
threshold is large cannot gate a small change: read the threshold column before
claiming a 5 % gain — that is what the calibration is for.

## Files

| File | Content |
|---|---|
| `raw-<rt>.jsonl` | One line per process: case, engine, side, median / min / max ms, the parity check |
| `summary-<rt>.{json,md}` | `run`: median of the medians, spread, ratio to the oracle, parity |
| `compare-<rt>.{json,md}` | `compare` / `calibrate`: delta, threshold, verdict per cell |
| `calibration-<rt>.json` | `calibrate`: `{ drift: { "<case>\|<engine>": fraction } }` |

The cases (`tools/bench/perf-cases.js`) cover compression (deflate, inflate,
brotli, lz4), checksums, hashes, ciphers, signatures, codecs and the RNG; each
takes its inputs from the deterministic corpora of `tools/bench/_corpora.js`.

## The codec A/B harness

`tools/bench/codec-levels.js` compares deflate / brotli / lz4 / the huffman and
bitstream primitives level by level against a git baseline, with
cross-decoding and oracle legs. Its CLI times each engine in its own process
as well (`--procs N`, default 3, the order alternating) and gives each cell an
encode and a decode verdict against `max(--floor, both spreads)`. Run without
`--baseline`, it is an A/A run: a cell that reads anything but "within noise"
there cannot gate a change at those settings — raise `--procs` / `--reps`
before reading a small difference. `--procs 1` keeps the in-process timing,
labelled as biased. See its header.
