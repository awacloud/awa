// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * wasm-crypto — compile and verify WebAssembly crypto modules.
 *
 * Subcommands:
 *   build   — compile C → .wasm via WASI SDK clang
 *   verify  — run test vectors against compiled wasm modules
 *   all     — build → verify (aborts on first non-zero exit)
 *
 * The source-fetch coupling (a `vendor` subcommand pulling upstream C into a
 * `references/CRYPTO-SRC` tree) was retired — see
 * `ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md` F1/F5. `--pkg <dir>`
 * is the only input-resolution model; upstream provenance now lives in each
 * package's committed `vendor/PROVENANCE.json`.
 *
 * Usage:
 *   bun cli.ts wasm-crypto <cmd> [...args]
 *   bun tools/wasm-crypto/src/index.ts <cmd> [...args]
 *
 * Config precedence: CLI flags > env (cnf/wasm-crypto.cfg) > config file.
 */

import { isAbsolute, join } from "node:path";
import { run as runBuild } from "./cmd/build.ts";
import { run as runVerify } from "./cmd/verify.ts";
import { run as runCopy } from "./cmd/copy.ts";
import { discoverWasiSdk } from "../build-env/toolchain.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Resolved configuration for the wasm-crypto tool.
 *
 * Config precedence (highest to lowest):
 *   1. CLI flags
 *   2. Env vars injected via `cnf/wasm-crypto.cfg` (launcher)
 *   3. JSON config file (path from `--config` or `WASM_CRYPTO_CONF`)
 */
export interface WasmCryptoConfig {
    /** Path to the WASI SDK installation (contains `bin/clang`). */
    wasiSdkPath: string;
    /**
     * Legacy vendored-C-sources directory. No production code reads this
     * field anymore — `--pkg <dir>` (`cfg.pkgDir`) is the only operative
     * input-resolution model (F1, W0 decoupling FINDINGS). Retained on the
     * config shape so an old config file carrying the key is silently
     * ignored rather than rejected; do not set it in new configs.
     */
    srcDir: string;
    /** Output directory for compiled `.wasm` files. */
    outDir: string;
    /** Path to the `targets.json` manifest. */
    targetsFile: string;
    /**
     * Package directory (from `--pkg <dir>`); when set, `targetsFile`/`outDir`
     * and the `csrc`|`shims`|`vendor` source roots are derived from it.
     */
    pkgDir?: string;
}

// ─── Help / version ───────────────────────────────────────────────────────────

const HELP_TEXT = `wasm-crypto — compile and verify WebAssembly crypto modules

Usage:
  bun cli.ts wasm-crypto <cmd> [...args]
  bun tools/wasm-crypto/src/index.ts <cmd> [...args]
  wasm-crypto <cmd> [...args]                        (standalone, via this package's bin)

Subcommands:
  build     Compile C sources to .wasm via WASI SDK clang
  verify    Run test vectors against compiled wasm modules
  copy      Copy <pkg>/dist/*.wasm to a destination + write/check a hash manifest
  all       Run build → verify (stops on first failure)

Options:
  --config <path>   Path to wasm-crypto config JSON.
                    Priority: --config > WASM_CRYPTO_CONF env > wasm-crypto.config.json
  --pkg <dir>       Build/verify/copy a package: reads <dir>/targets.json, emits
                    to <dir>/dist, and resolves csrc|shims|vendor source roots
                    under <dir>. Overrides targetsFile/outDir from config.
  -h, --help        Show this help and exit 0.
  -v, --version     Show version and exit 0.

copy options (after "copy"):
  --into <dir>      Destination directory for the copied .wasm files (required).
  --check           Verify committed bytes against dist/MANIFEST.sha256; never
                    writes. Exit 1 on drift (one line per drifted file on stderr).
  --target <name>   Restrict to one module's scalar/simd variants.

Environment variables (via cnf/wasm-crypto.cfg):
  WASM_CRYPTO_CONF      Path to the JSON config file.
  WASI_SDK_PATH         Path to the WASI SDK (overrides config wasiSdkPath).

Config keys (wasm-crypto.config.json):
  wasiSdkPath     Path to WASI SDK installation
  outDir          .wasm output directory (default: packages/front/fw/src/crypto/wasm)
  targetsFile     Targets manifest (default: packages/front/fw-wasm-crypto/targets.json)

targets.json keys (per target, beyond the build basics):
  sourceKind      Provenance: "own" | "vendored-fork" | "vendored".
  cStd            Optional native C standard for vendor/ files (e.g. "c11");
                  csrc/ and shims/ sources always compile as c23.
  shim, cSources  Package-relative POSIX paths under csrc/ shims/ or vendor/,
                  resolved against --pkg <dir>.

Exit codes:
  0   success
  1   generic error (unknown subcommand, runtime failure)
  2   not implemented (stubs) / config error
  130 SIGINT (Ctrl+C)
  143 SIGTERM

See docs/tools/wasm-crypto.md for the full documentation.
`;

async function readVersion(): Promise<string> {
    try {
        const pkgPath = join(import.meta.dir, "..", "package.json");
        const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { version?: unknown };
        return typeof pkg.version === "string" ? pkg.version : "0.0.0";
    } catch {
        return "0.0.0";
    }
}

// ─── Config loading ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WasmCryptoConfig = {
    wasiSdkPath: "",
    srcDir: "",
    outDir: "packages/front/fw/src/crypto/wasm",
    targetsFile: "packages/front/fw-wasm-crypto/targets.json",
};

/**
 * Resolve the config file path from (priority order):
 *   1. `--config <path>` CLI flag
 *   2. `WASM_CRYPTO_CONF` env var
 *   3. `wasm-crypto.config.json` in the CWD (fallback)
 */
function resolveConfigPath(cliConfig?: string): string {
    const raw = cliConfig ?? process.env["WASM_CRYPTO_CONF"];
    if (raw) {
        if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) return raw;
        return join(process.cwd(), raw);
    }
    return join(process.cwd(), "wasm-crypto.config.json");
}

async function loadConfig(configPath?: string): Promise<WasmCryptoConfig> {
    const path = resolveConfigPath(configPath);
    let cfg: WasmCryptoConfig;
    try {
        const file = Bun.file(path);
        if (!(await file.exists())) {
            cfg = { ...DEFAULT_CONFIG };
        } else {
            const json = JSON.parse(await file.text()) as Partial<WasmCryptoConfig>;
            cfg = { ...DEFAULT_CONFIG, ...json };
        }
    } catch {
        cfg = { ...DEFAULT_CONFIG };
    }

    // ── WASI SDK path resolution (FS-only; no network) ──────────────────────
    // If wasiSdkPath is still empty, try:
    //   1. WASI_SDK_PATH env var (already documented in HELP_TEXT but never read)
    //   2. FS discovery under the default SDK install dir
    if (!cfg.wasiSdkPath) {
        const envPath = process.env["WASI_SDK_PATH"];
        if (envPath) {
            cfg = { ...cfg, wasiSdkPath: envPath };
        } else {
            try {
                const discovered = await discoverWasiSdk();
                if (discovered) cfg = { ...cfg, wasiSdkPath: discovered };
            } catch {
                // Discovery miss — leave wasiSdkPath empty; resolveClang in
                // build.ts returns null and exits 2 exactly as before.
            }
        }
    }

    return cfg;
}

// ─── Programmatic API ─────────────────────────────────────────────────────────

export interface RunOptions {
    /** Subcommand arguments (first element is the subcommand name). */
    args?: string[];
    /** Override config path (for tests). */
    configPath?: string;
    /** Pre-resolved config (skips file loading if provided). */
    config?: WasmCryptoConfig;
}

/**
 * Extract `--pkg <dir>` / `--pkg=<dir>` from an argument vector.
 *
 * The flag is a CLI-level option (sibling to `--config`) parsed before
 * subcommand dispatch; the returned `rest` has it removed so the subcommand
 * never sees it. The last occurrence wins.
 *
 * @returns the package dir (or `undefined`) and the remaining args.
 */
export function extractPkgFlag(argv: string[]): { pkgDir?: string; rest: string[] } {
    const rest: string[] = [];
    let pkgDir: string | undefined;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === undefined) continue; // unreachable — loop bound guarantees defined
        if (a === "--pkg") {
            pkgDir = argv[++i];
        } else if (a.startsWith("--pkg=")) {
            pkgDir = a.slice("--pkg=".length);
        } else {
            rest.push(a);
        }
    }
    return { pkgDir, rest };
}

/**
 * Apply the `--pkg <dir>` package-directory model to a loaded config.
 *
 * Derives (overriding the loaded config): `pkgDir` (absolutised against the
 * cwd — `isAbsolute` is guarded first to avoid Windows path-doubling),
 * `targetsFile = <pkg>/targets.json`, and `outDir = <pkg>/dist`. The
 * `csrc`/`shims`/`vendor` source roots are resolved against `pkgDir` by the
 * build/verify commands.
 */
export function applyPkgDir(cfg: WasmCryptoConfig, dir: string): WasmCryptoConfig {
    const pkgDir = isAbsolute(dir) ? dir : join(process.cwd(), dir);
    return {
        ...cfg,
        pkgDir,
        targetsFile: join(pkgDir, "targets.json"),
        outDir: join(pkgDir, "dist"),
    };
}

/**
 * Programmatic entry point. Returns the intended exit code.
 *
 * This avoids `process.exit()` so tests can assert the code without
 * spawning a child process. The CLI `main()` calls this, then exits.
 */
export async function run(opts: RunOptions = {}): Promise<number> {
    const argv = opts.args ?? [];

    // ── Help / version ──────────────────────────────────────────────────────
    if (argv.includes("--help") || argv.includes("-h")) {
        process.stdout.write(HELP_TEXT);
        return 0;
    }
    if (argv.includes("--version") || argv.includes("-v")) {
        process.stdout.write(`${await readVersion()}\n`);
        return 0;
    }

    // ── CLI-level flags (before subcommand dispatch) ────────────────────────
    // `--pkg <dir>` is a sibling to `--config`: strip it from the args so the
    // subcommand never sees it, then derive paths from the package directory.
    const { pkgDir: pkgFlag, rest: dispatchArgv } = extractPkgFlag(argv);

    // ── Subcommand dispatch ─────────────────────────────────────────────────
    const [cmd, ...rest] = dispatchArgv;

    if (!cmd || cmd.startsWith("-")) {
        process.stderr.write(
            `wasm-crypto: missing subcommand. Use --help for usage.\n`,
        );
        return 1;
    }

    let cfg = opts.config ?? (await loadConfig(opts.configPath));
    if (pkgFlag !== undefined) cfg = applyPkgDir(cfg, pkgFlag);

    switch (cmd) {
        case "build":
            return runBuild(rest, cfg);

        case "verify":
            return runVerify(rest, cfg);

        case "copy":
            return runCopy(rest, cfg);

        case "all": {
            const steps: Array<(args: string[], cfg: WasmCryptoConfig) => Promise<number>> = [
                runBuild,
                runVerify,
            ];
            for (const step of steps) {
                const code = await step(rest, cfg);
                if (code !== 0) return code;
            }
            return 0;
        }

        default:
            process.stderr.write(
                `wasm-crypto: unknown subcommand "${cmd}". Expected: build, verify, copy, all.\n`,
            );
            return 1;
    }
}

// ─── SIGINT / SIGTERM ─────────────────────────────────────────────────────────

if (import.meta.main) {
    process.on("SIGINT", () => process.exit(130));
    process.on("SIGTERM", () => process.exit(143));

    const argv = Bun.argv.slice(2);
    run({ args: argv }).then(code => process.exit(code));
}
