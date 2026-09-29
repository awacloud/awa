---
category: note
status: delivered
scope: io/compress
date: 2026-09-05
---

# LZ77 scanner factorisation in `deflate`

> Engineering note — identified technical debt, non-urgent. Prerequisites to fulfil before execution.

## Finding

`deflate.js` re-implements its own LZ77 logic inline in `_dflt()` (3-byte hash-chain, `head`/`prev` arrays, lazy match — ~50 dense lines). In parallel, the standalone `lz77` module exists, tested, and is already consumed by `brotli`. The primitive is therefore duplicated.

`huffman` does not suffer from this problem: it is already shared between `deflate` and `brotli`.

## Proposal

Rewrite the matching pass of `deflate._dflt()` to use `lz77.encode(data, opts, { literal, match })` instead of the inline block.

## Motivation

Clean technical debt:

- **DRY** — a single hash-chain scanner across the whole framework.
- **Future encoders** — a Zopfli-like encoder or a "max compression" mode plugs in by changing `chainDepth`/`lazy`/`maxMatch` without touching the rest of `deflate`.
- **Bug isolation** — fixes on `lz77` (boundary checks, edge cases on small buffers) automatically benefit `deflate` instead of having to be replicated.
- **Readability** — `deflate.js` loses ~50 dense lines, gains in intent clarity.

## Status

**Not urgent.** The inline code of `deflate` is not broken and produces good ratios. This is architectural hygiene, not a bug fix nor an optimisation.

## Prerequisites before cutover

1. **Make `lz77.hashFn` injectable.** The `deflate` hash is very specific to RFC 1951:
   ```js
   const hsh = i => (dat[i] ^ (dat[i+1] << bs1) ^ (dat[i+2] << bs2)) & msk;
   ```
   Whereas `lz77` uses a multiplicative FNV-1a. Without an injectable `hashFn` option, the factorisation would change the produced bytes (still conformant to the DEFLATE format, but different). An injectable hash function allows a **bit-exact** cutover if golden tests or reference vectors require it.

2. **Benchmark the cost of callbacks vs inline before merging.** The `literal(pos)/match(pos, len, dist)` interface adds one function call per token, whereas the inline block is tight and JIT-warmed. The expected cost is **10–30 %** depending on the workload. To measure with:
   - representative corpora (text, JSON, binary, source code),
   - all levels `level=1..9`,
   - comparison vs the current implementation on the same hardware.

   If the regression is unacceptable, consider a "fast path" variant of the `lz77` module that returns a packed buffer directly instead of going through callbacks.

## Additional considerations

- The `syms[]` of `deflate` is not pure LZ77 — it already contains the DEFLATE pre-encoding (RFC 1951 length/distance codes, extra bits). The conversion to this format remains **inline after each `match` callback**. The line-count gain is therefore more modest than expected.
- Verify that the `lz77` module properly supports `minMatch = 3` (used by DEFLATE, whereas the documented default is 4 for Brotli).
- Ensure that the existing `deflate` tests cover the round-trip (compress → decompress → identity). If they are bit-exact (binary comparison with a reference encoder), prerequisite 1 above is blocking; otherwise, optional.

## Decision

Revisit when one of the following occurs:
- need for an alternative DEFLATE encoder (Zopfli, max compression, custom streaming mode),
- bug fixed on `lz77` that would need to be replicated manually in `deflate`,
- broader refactor of the `io/compress` directory.

Until then, keep the duplication as an accepted trade-off.

## Outcome

- **Prerequisite 1 fulfilled.** `lz77.encode`/`encodeTokens` gained
  additive `hashFn`, `start` and `niceLength` options (task 01,
  `01-lz77-scanner-extensions`), making an injectable hash function — and
  therefore a bit-exact cutover path — available without touching the
  module's existing default behaviour or its 6 pre-existing `DEFAULT`
  values.
- **The factorisation landed, but as a full in-house rewrite rather than a
  cutover onto the pre-existing `lz77.encode` callback interface.**
  `deflate.js`'s DEFLATE encoder was rewritten from RFC 1951 (task 03,
  `03-deflate-encoder-rfc1951`) to scan through the shared `lz77` module —
  first via `lz77.encode`'s `literal`/`match` callbacks, then via
  `lz77.encodeTokens`'s packed `(len, dist)` buffer — replacing the
  duplicated inline hash-chain scanner this note flagged.
- **Prerequisite 2's callback-vs-packed-token measurement (task 03) settled
  as a wash, not a win**, and a separate perf landing then closed the
  larger regression the note did not anticipate. Quoted from
  `03-report.md`: "Δbytes is IDENTICAL to the callback run at every level,
  which independently confirms `encodeTokens` emits the same token
  sequence as `encode`. Δtime is within run-to-run noise of the callback
  path (no consistent direction: −6 pp at level 3, +10 pp at level 8). The
  packed path ships — exactly one path, no dead alternative — per the
  plan's branch, but it is a wash, not a win." Both paths initially missed
  the batch's `< +5 %` Δtime gate by a wide margin (+21 % … +272 %); an
  owner-commissioned perf analysis then found 85–100 % of the regression
  inside the `lz77` scan itself (not the callback/packed-token boundary)
  and directed a scanner rewrite with lazy matching off by default — see
  [`deflate.md` § Design › Encoder](../api/io/compress/deflate.md#encoder)
  for the shipped `lz77.encodeTokens` wiring and level table, and
  [`deflate.md` § Benchmark](../api/io/compress/deflate.md#benchmark) for
  the final measured record (all nine levels PASS the gate).
