# @awacloud/tool-wasm-crypto

> **Maturity: `L2` (real builder + verify gate)**

Build tool that compiles and verifies the WebAssembly crypto modules used by
`@awacloud/fw`. Takes each package's own C sources (Argon2, BLAKE2, …, resolved via
`--pkg <dir>`), compiles them to `.wasm` via the
[WASI SDK](https://github.com/WebAssembly/wasi-sdk) clang, and validates the
output against pinned test vectors. The compiled bytes are checked into the
repo so the framework has **zero runtime npm dependencies** and **no
mandatory bundler**.

The `build --pkg <dir>` / `verify --pkg <dir>` interface enables self-contained
crypto packages to define and gate their own build contract: define a
`targets.json` in the package root, point the tool there, and the builder
resolves all source paths relative to the package and emits to `<pkg>/dist/`.

## Consumption shape

**Autonomous — standalone `bin`.** This package ships its own `wasm-crypto`
executable (`bin/wasm-crypto.ts`, a thin delegate to the `run()` function
exported by `src/index.ts` — no argument parsing duplicated), so it runs
directly once installed:

```bash
bunx wasm-crypto build --pkg packages/front/fw-wasm-crypto
```

## Installation

```bash
npm install --save-dev @awacloud/tool-wasm-crypto
```

Runs under Bun (the `bin` is TypeScript executed by Bun).

## Quick Start

```bash
# 1. Copy and edit the config
cp node_modules/@awacloud/tool-wasm-crypto/wasm-crypto.config.example.json wasm-crypto.config.json
# Set wasiSdkPath to your WASI SDK installation, e.g. /opt/wasi-sdk

# 2. Compile to .wasm (package-relative sources under --pkg <dir>)
bunx wasm-crypto build --pkg <dir>

# 3. Verify against test vectors
bunx wasm-crypto verify --pkg <dir>

# — or run the whole pipeline:
bunx wasm-crypto all --pkg <dir>
```

## Subcommands

| Command  | Status       | Description                                        |
|----------|------------------|----------------------------------------------------|
| `build`  | functional (L2)  | Compile C → `.wasm` via WASI SDK clang; `--pkg` model for package-relative paths and `<pkg>/dist/` emit |
| `verify` | functional (L2), **partial coverage — see below** | Run KAT/ACVP vectors against compiled `.wasm.js` modules; gates on byte-for-byte match. Reports `V verified / S skipped / F failed of T targets` and **exits 1 when 0 targets were verified** — a skip is the absence of evidence, never a pass |
| `copy`   | functional (L2)  | Copy `<pkg>/dist/*.wasm` to a destination + write/check a committed hash manifest |
| `all`    | functional       | Run build → verify (stops on first error)          |

### `verify` coverage — 3 of 17 families, and why this is not the publication gate

`verify` has a real runner for only **3 of the 17** `algo` families declared
in `packages/front/fw-wasm-crypto/targets.json`: **`sha2`**, **`sha3`**
(fixed-digest variants only — see below) and **`aes`** (the standard
96-bit-IV/128-bit-tag AES-GCM shape). The other **14** — `argon2`, `ml_kem`,
`ml_dsa`, `slh_dsa`, `blake2b`, `chacha20poly1305`, `cmac`, `hmac`, `pbkdf2`,
`hkdf`, `rsa`, `ecc`, `ed25519`, `x25519` — have **no runner at all** and are
always reported `SKIP` with reason `unknown algo family`; `verify` also
prints one stderr line naming exactly which families those are on every run.
A skip is never counted toward `verified`: a run where every selected
target is skipped exits **non-zero**, not a silent pass.

**A reader must not come away thinking `verify` attests the whole family
set.** It doesn't, and isn't meant to: the wasm-crypto publication gate's
evidence is the **KAT shim test suite**
(`packages/front/fw-wasm-crypto/shims/*.kat.test.ts`, run natively in
TypeScript against the same vectors, covering all 17 families) consumed by
the package-export gate. `verify` is this tool's own byte-for-byte
cross-check of the *compiled wasm* output for the families it can drive —
useful corroboration, but partial, and not the gate's source of truth.

Two further limits, discovered wiring up the 3 real families:

- **`sha3`'s SHAKE (XOF) vectors are not run.** The bare `sha3` target's
  vector list includes both a fixed-digest folder (`SHA3-256-2.0`, which
  *is* run) and a `SHAKE-128-1.0` folder whose ACVP tests declare a
  **per-test** output length (bits) rather than one fixed digest size —
  `verify` skips that vector path honestly (one stderr note) rather than
  guess a length.
- **Only byte-aligned messages and the standard AES-GCM shape are checked.**
  The wasm ABI's `inLen`/`dataLen` are byte counts with no bit-length
  concept, so an ACVP hash test whose true length (bits) is not a multiple
  of 8 cannot be represented and is skipped (measured: 0/512 for
  `SHA2-256-1.0`'s AFT group, but 892/1024 for `SHA2-384-1.0` and
  1043/1194 for `SHA3-256-2.0`). Likewise AES-GCM's `aes_gcm_seal`/
  `aes_gcm_open` hardcode a 96-bit IV and a 128-bit tag; an ACVP test group
  outside that shape (e.g. a 120-bit IV) is skipped per-test, not failed.
  MCT (Monte Carlo) and LDT (Large Data) hash test groups are skipped
  outright — only AFT (plain single-hash) groups run.

## Configuration

Config file: `wasm-crypto.config.json` (gitignored). Template:
[`wasm-crypto.config.example.json`](./wasm-crypto.config.example.json).

| Key           | Default                                   | Description                            |
|---------------|-------------------------------------------|----------------------------------------|
| `wasiSdkPath` | `""`                                      | Path to WASI SDK (`bin/clang` inside)  |
| `outDir`      | `packages/front/fw/src/crypto/wasm`       | Where `.wasm` output files are written |
| `targetsFile` | `packages/front/fw-wasm-crypto/targets.json` | Target manifest (array of `Target`)    |

**Config precedence**: `--config` CLI flag > `WASM_CRYPTO_CONF` env var >
`wasm-crypto.config.json` in the CWD.

## Target Manifest

`targets.json` is an array of `Target` objects (schema: `src/targets.schema.ts`):

```json
[
  {
    "algo": "argon2",
    "wasmModule": "argon2",
    "exportName": "argon2Wasm",
    "source": "argon2-20190702",
    "sourceKind": "own",
    "shim": "shims/argon2.c",
    "cSources": ["csrc/argon2.c", "csrc/blake2/blake2b.c"],
    "cflags": ["-O3"],
    "simd": true,
    "exports": ["memory", "alloc", "free", "argon2id_hash_raw"],
    "vectors": ["references/argon2-vectors.json"]
  }
]
```

When invoked with `bunx wasm-crypto build --pkg <dir>`, all paths
(`shim` and entries in `cSources`) are package-relative and must start with
one of the frozen source roots: `csrc/`, `shims/`, or `vendor/`. The builder
resolves them against the package directory and applies the per-source C
standard rule (csrc/shims → C23; vendor → target's `cStd` or native).

**Compile variants**: When `simd: true`, the builder emits both a SIMD variant
(`-msimd128`) and a scalar fallback. Each produces a `.wasm.js` module in
`<pkg>/dist/`.

Required wasm ABI exports: `memory`, `alloc`, `free` (plus algorithm-specific exports).

## Copy + hash manifest (`copy`)

`build --pkg <dir>` emits to `<dir>/dist/` — gitignored, a local build
byproduct. `copy` promotes those bytes into a **committed** location and
records what was promoted:

```bash
# Apply: copy <pkg>/dist/*.{scalar,simd}.wasm into --into, then write
# <pkg>/dist/MANIFEST.sha256 (the full current dist/ index).
bunx wasm-crypto copy --pkg <dir> --into <dstDir>

# Drift gate: never writes; compares each committed <dstDir>/<file>
# against the committed MANIFEST.sha256 row.
bunx wasm-crypto copy --pkg <dir> --into <dstDir> --check
```

The concrete gate for the `@awacloud/fw-wasm-crypto` → `@awacloud/fw` pair:

```bash
bunx wasm-crypto copy --pkg packages/front/fw-wasm-crypto \
  --into packages/front/fw/src/crypto/wasm --check
```

`--target <name>` restricts which module's variants are copied/checked; the
manifest itself always reflects the full `dist/` contents. Manifest format:
plain `sha256sum`-style lines (`<64-hex-digest>  <filename>`), sorted by
filename, LF-terminated. Running `copy` twice with no rebuild in between is a
no-op — byte-identical manifest, byte-identical destination files.

**`dist/` is gitignored, so the manifest needs a force-add** to be committed:

```bash
git add -f packages/front/fw-wasm-crypto/dist/MANIFEST.sha256
```

| Exit | Meaning |
|---|---|
| `0` | copy applied, or (`--check`) no drift |
| `1` | `--check` found drift (one line per drifted file on stderr), or `--target` matched no file |
| `2` | config error: missing `--pkg`, missing `--into`, missing `dist/`, missing manifest |

The gate is **manifest-vs-committed-bytes**, not fresh-build-vs-committed —
a full rebuild needs the wasi-sdk, which is not available in CI today (see
"Toolchain acquisition" below). Build-vs-committed reproducibility is a
separate, later concern.

## Dependency graph

The chain is `@awacloud/tool-wasm-crypto` (this tool) → `@awacloud/fw-wasm-crypto`
(the package that owns `targets.json` + `csrc/shims/vendor` and consumes
`build`/`copy`) → `@awacloud/fw` (the package whose `crypto/wasm/*.wasm` are the
committed copy destination). Both edges are declared `workspace:*`
**devDependencies** — build/dev-only, never a runtime dependency: this tool
is invoked from `fw-wasm-crypto`'s own `scripts.build`/`verify`/`copy`, and
`fw/src/crypto/wasm/runtime.js` loads only the colocated local `.wasm`
bytes, never reaching into either sibling package at runtime — gated by a
self-containment test in `@awacloud/fw`.

## Toolchain acquisition

`build-env/` is a **self-contained, crypto-free** toolchain-acquisition module:
it owns its wasi-sdk pin table (`build-env/pins.ts`) and imports nothing from
`src/`. The SDK itself is never committed — the default install directory
`build-env/sdk/` is gitignored.

| File | Role |
|---|---|
| `build-env/pins.ts` | Pin table: repo, release tag, per-OS asset + `sha256`. Single source of truth for the SDK version. |
| `build-env/toolchain.ts` | `resolveAsset` · `discoverWasiSdk` (FS-only) · `downloadWasiSdk` · `verifyAndUnpack` · `enforcePinPolicy`. |

```ts
import { downloadWasiSdk } from "tools/wasm-crypto/build-env/toolchain.ts";
const sdkRoot = await downloadWasiSdk();   // stream → verify → unpack
```

The asset is **streamed to disk**, hashed while streaming, and extracted from
that file — neither the compressed nor the decompressed archive is ever fully
buffered in memory. The built-in tar reader handles GNU long names (`L`), pax
extended headers (`x`/`g`), directories, symlinks and hardlinks; on Windows a
symlink the OS refuses is materialised as a file copy with a warning, never
silently skipped.

### Pin policy (reject-by-default)

Each asset's `sha256` is either a real 64-hex digest or the literal sentinel
`"blocked-pending-rerun"`, meaning **no maintainer of this repository has ever
fetched and verified that asset**. Today 1 of 5 is pinned (`win32-x64`); the
other four carry the sentinel.

| Situation | Behaviour |
|---|---|
| Real pin, digest matches | proceeds |
| Real pin, digest differs | **throws** — always, not opt-outable |
| Unpinned (sentinel/empty/malformed) | **throws** by default |
| Unpinned + maintainer opt-in | proceeds and prints the computed hash in pin-table form |

### Maintainer first fetch

Fetching an unpinned asset is a deliberate, human act:

```bash
# 1. On a trusted network, confirm the release tag in build-env/pins.ts.
# 2. Opt in explicitly (env seam; `acceptUnpinned: true` when called as a library):
AWA_WASI_SDK_ACCEPT_UNPINNED=1 bun -e \
  "import { downloadWasiSdk } from './tools/wasm-crypto/build-env/toolchain.ts'; await downloadWasiSdk();"
# 3. Copy the printed pin-table line into build-env/pins.ts and commit it.
```

## Tests

```bash
bun test tools/wasm-crypto/
```

Unit tests cover: CLI contract (`--help`, `--version`, unknown subcommand),
stub exit codes, `validateTargets` schema validation, no ANSI in non-TTY output.

## Structure

```
tools/wasm-crypto/
├── src/
│   ├── index.ts                    # CLI entry + subcommand dispatcher; --pkg flag parsing
│   ├── index.test.ts               # CLI contract + schema validation tests
│   ├── targets.schema.ts           # Target type + cStdFor rule + validateTargets guard
│   ├── abi-host.ts                 # ABI instantiation for wasm module loading
│   ├── emit.ts                     # Base64-embedded .wasm.js module writer
│   └── cmd/
│       ├── build.ts                # Compile in SIMD+scalar variants; package-relative resolution
│       ├── verify.ts               # KAT/ACVP gate; byte-for-byte vector checking
│       └── copy.ts                 # dist/ → committed dir + MANIFEST.sha256 (--check drift gate)
├── build-env/
│   ├── pins.ts                     # wasi-sdk pin table (self-contained, crypto-free)
│   ├── toolchain.ts                # Stream-to-disk download, pin policy, tar/zip extraction
│   ├── container.ts                # Containerized linux-x64 build (podman-first)
│   └── sdk/                        # Gitignored install dir (never committed)
├── wasm-crypto.config.example.json # Config template
├── package.json
└── README.md
```

## See also

- [WASI SDK](https://github.com/WebAssembly/wasi-sdk) — clang toolchain for WebAssembly.
- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/main/packages/front/fw) — the browser framework whose `src/crypto/wasm/` is this tool's compiled-output destination.
- [`@awacloud/fw-wasm-crypto`](https://github.com/awacloud/awa/tree/main/packages/front/fw-wasm-crypto) — the package that owns `targets.json` and consumes `build`/`copy`.

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`tools/wasm-crypto`](https://github.com/awacloud/awa/tree/main/tools/wasm-crypto)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each published release.

Developed by AwaCloud.
