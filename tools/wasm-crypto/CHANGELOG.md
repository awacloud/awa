# Changelog — `@awacloud/tool-wasm-crypto`

All notable changes to this tool will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Fixed

- **`verify`'s dispatch reaches the 3 runners it actually has**: `runTargetVectors` keyed only on PER-SIZE algo
  spellings (`sha256`, `sha3_512`, `aes_gcm`, …) while
  `packages/front/fw-wasm-crypto/targets.json` declares the BARE family
  names (`sha2`, `sha3`, `aes`), so the three implemented runners were
  unreachable — every real target fell through to `unknown algo family`.
  Fixed by adding bare-family branches that select the size/variant from the
  **vector folder name**, not `algo` (constant across a bare target's
  several vector paths), and by matching the ACTUAL wasm ABI, which turned
  out to differ from what the runners assumed: `sha2`/`sha3` are ONE
  combined export taking a leading `variantId` (`sha2(variantId, inPtr,
  inLen, outPtr)`, `sha3(variantId, inPtr, inLen, outPtr, outLen)`), and
  `aes_gcm_seal`/`aes_gcm_open` (not `aes_gcm_encrypt`/`_decrypt`) take ONE
  combined `ct||tag` output buffer with a fixed 96-bit IV and no `ivLen`
  argument. Also fixed: `Target.vectors[]` entries for every real
  ACVP-backed family already end in `prompt.json` (a file), not a bare
  directory as the runners assumed — `resolveVectorDir` now accepts both
  shapes. And: ACVP hash files interleave AFT/MCT/LDT test groups and
  sometimes declare non-byte-aligned bit lengths, neither of which the
  byte-granular wasm ABI can represent — both are now skipped per-test/group
  instead of mis-verified into a false FAIL. Net effect measured on the real
  built tree: `verify --pkg packages/front/fw-wasm-crypto` goes from
  `0 verified / 17 skipped / 0 failed` (exit 1) to `3 verified / 14 skipped /
  0 failed` (exit 0); the 14 families with no runner at all are still named,
  once, on stderr. `verify` remains a partial cross-check, not the
  publication gate's evidence — see the README's "`verify` coverage" section.

- **`verify` no longer greens vacuously**:
  a target that could not be verified — no vectors declared, `*.wasm.js` not
  built, or no declared vector matching a runner — was pushed with
  `pass: true`, so the summary counted it as a pass. The tool printed
  `17/17 targets passed` and exited **0** while verifying nothing, and
  `pkg-export`'s `freshness:wasm-crypto-verify` consumed that exit code.
  `TargetResult` now carries `skipped`; those three paths set it, the table
  prints `SKIP`, the summary reads
  `V verified / S skipped / F failed of T targets`, and the run **exits 1 when
  0 of the selected targets ran a vector** (`--target <name>` on a single
  skipped target included). The `pass: false` load-error path is unchanged —
  a load error was always a genuine failure. The "no targets defined —
  nothing to verify" branch keeps exit 0: nothing was asked for, so nothing is
  owed.

### Added

- **`copy` subcommand + `dist/MANIFEST.sha256` drift gate (F6/D3)**: `wasm-crypto copy --pkg <srcPkg> --into <dstDir>
  [--check] [--target <name>]` promotes `<srcPkg>/dist/*.{scalar,simd}.wasm`
  (a gitignored build byproduct) into a committed destination and writes
  `<srcPkg>/dist/MANIFEST.sha256` — plain `sha256sum`-style lines, sorted by
  filename, LF-terminated, always the full current `dist/` index. `--check`
  never writes: it compares each manifest row against the committed
  destination bytes (deliberately manifest-vs-committed-bytes, not
  fresh-build-vs-committed-bytes — a build-in-CI gate is un-runnable today,
  see D3 §3.4). Exit 0 applied/no-drift, 1 drift or unmatched `--target`, 2
  config error. The committed
  `packages/front/fw-wasm-crypto/dist/MANIFEST.sha256` was seeded from the
  current `packages/front/fw/src/crypto/wasm/*.wasm` bytes (22 artifacts;
  verified byte-identical to the local `dist/` build, matching the
  decoupling spike's proof) — force-added since `dist/` is gitignored.

### Security

- **Unpinned toolchain assets are now rejected**: the
  downloader used to print the computed hash and proceed whenever an asset
  carried the `"<fetch-to-fill>"` sentinel — a silent supply-chain hole. The
  sentinel is now the explicit `"blocked-pending-rerun"`, and any asset whose
  `sha256` is not a real 64-hex digest **throws** with the maintainer
  first-fetch procedure. A maintainer opts in per run with
  `AWA_WASI_SDK_ACCEPT_UNPINNED=1` (or `acceptUnpinned: true`), which then
  prints the computed hash in pin-table form for committing. A pinned asset
  with a mismatching hash still always throws. Disposition (D4/F8):
  1 of 5 assets pinned honestly (`win32-x64`); the other 4 carry the sentinel.

### Added

- **`build-env/pins.ts`**: the wasi-sdk pin table,
  relocated out of `src/sources.ts` (F4/R5(b)). `build-env/` is now a
  self-contained, crypto-free toolchain-acquisition module — a test asserts
  that nothing under `build-env/` imports from `src/**`. The pin table is the
  single source of truth for the SDK version.

### Fixed

- **B-1 — the SDK asset is streamed to disk** instead of being buffered:
  `downloadWasiSdk` streams the response body to a temp file (hashing on the
  way), and the archive is gunzipped file→file and extracted from the file.
  Neither the compressed (~655 MiB) nor the decompressed tree is ever fully
  held in memory.
- **B-2 — the tar reader handles the real wasi-sdk archive**: GNU long names
  (`L`/`K`), pax extended headers (`x` per-entry, `g` global), the ustar
  `prefix` field, directories (`5`), symlinks (`2`) and hardlinks (`1`);
  entry names that would escape the destination are refused; on Windows a
  symlink the OS refuses becomes a file copy with a warning, never a silent
  skip. This deletes the manual GNU-tar workaround documented in
  `packages/front/site-kit/vendor/SOURCES.md`.

### Removed

- **`vendor` subcommand retired**: the source-fetch
  coupling to `references/CRYPTO-SRC` is gone — `vendor.ts` is deleted, the
  `vendor` case is removed from dispatch/`all`/help/docs, the 9 crypto entries
  in `src/sources.ts` `SOURCES` are removed (the `wasi-sdk` toolchain entry
  moved to `build-env/pins.ts` in task 02, and `src/sources.ts` is deleted),
  and `WasmCryptoConfig.vectorsDir` (dead config — no production code
  ever read it) is removed. `--pkg <dir>` is now the only input-resolution
  model; the legacy `cfg.srcDir`-based branch in `build.ts`'s `resolveInputs`
  is deleted. Upstream crypto provenance lives in each package's committed
  `vendor/PROVENANCE.json`; the NIST/RFC test-vector citation (`targets.json`
  `vectors[]`, `verify.ts`) is unaffected. Basis: the decoupling spike
  (F1/F3/F4/F5), which proved byte-identical rebuilds with the `references/CRYPTO-SRC` default
  removed and 0 `references` occurrences across 20 captured clang invocations.

### Changed

- **Acquirer reconciliation**: `references fetch CRYPTO-SRC`
  is now the canonical acquirer for upstream C sources. The single source of
  truth is `references/CRYPTO-SRC/sources.json` (managed by the `references`
  tool). `wasm-crypto vendor` is retained for KAT validation and NOTICE
  aggregation workflows but no longer owns the source-set definition. The
  `vendor.ts`/`sources.ts` behavior is unchanged here; full migration is
  deferred to a future batch.
