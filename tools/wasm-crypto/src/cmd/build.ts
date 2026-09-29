// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * build — compile each C translation unit, then link to freestanding wasm32
 * and emit `*.wasm.js`.
 *
 * For each target in `targets.json` this command:
 *   1. resolves the target's `[shim, ...cSources]` inputs: every input is
 *      package-relative under `csrc/`|`shims/`|`vendor/` and resolves to
 *      `join(pkgDir, input)`. `--pkg <dir>` (`cfg.pkgDir`) is the only
 *      input-resolution model — the legacy `cfg.srcDir`-based branch was
 *      retired (F1, `ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md`);
 *   2. compiles each translation unit separately to an object, selecting the
 *      C standard per file via `cStdFor` (csrc/shims → c23, vendor → the
 *      target's `cStd` or none), in a SIMD variant and a scalar fallback;
 *   3. links the objects into a **freestanding wasm32** reactor (no WASI
 *      imports, no libc syscalls), preserving the contracted ABI exports;
 *   4. loads the produced binary and asserts every required ABI export
 *      (`memory`, `alloc`, `free`, and the target's algorithm exports) is
 *      present;
 *   5. emits a base64-embedded `<outDir>/<wasmModule>.wasm.js` data module
 *      per the BATCH_11 task-01 convention (see `emit.ts`).
 *
 * KAT (known-answer-test) validation is out of scope here — that is the
 * `verify` subcommand. `build` only guarantees the binary links and exports
 * the contracted ABI.
 *
 * Exit codes:
 *   0  every requested target built + emitted
 *   1  a build/link/introspection failure (missing exports, clang error, …)
 *   2  clang absent (wasiSdkPath unset / no `bin/clang`) — config error
 */

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WasmCryptoConfig } from "../index.ts";
import { cStdFor, validateTargets, type Target } from "../targets.schema.ts";
import { emit } from "../emit.ts";

// ─── Args ────────────────────────────────────────────────────────────────────

interface BuildArgs {
    /** Build only this `wasmModule`; otherwise build all targets. */
    target?: string;
    /** Skip the SIMD variant; emit the scalar build. */
    scalarOnly: boolean;
}

function parseArgs(args: string[]): BuildArgs {
    const out: BuildArgs = { scalarOnly: false };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === undefined) continue; // unreachable — loop bound guarantees defined
        if (a === "--target") {
            out.target = args[++i];
        } else if (a.startsWith("--target=")) {
            out.target = a.slice("--target=".length);
        } else if (a === "--scalar-only") {
            out.scalarOnly = true;
        }
    }
    return out;
}

// ─── clang resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the wasi-sdk `clang` path from config, or `null` if it is unset /
 * does not exist on disk. Exported for test reuse (the compile test skips when
 * this returns `null`).
 */
export async function resolveClang(cfg: WasmCryptoConfig): Promise<string | null> {
    if (!cfg.wasiSdkPath) return null;
    const isWin = process.platform === "win32";
    const bin = join(cfg.wasiSdkPath, "bin", isWin ? "clang.exe" : "clang");
    if (await Bun.file(bin).exists()) return bin;
    // Fall back to the non-.exe name on Windows (some installs ship it bare).
    const alt = join(cfg.wasiSdkPath, "bin", "clang");
    if (isWin && (await Bun.file(alt).exists())) return alt;
    return null;
}

// ─── Input resolution ──────────────────────────────────────────────────────────

/**
 * One translation unit to compile: its package-relative POSIX path (used to
 * select the C standard via `cStdFor`) and its resolved absolute/on-disk path
 * (the `clang -c` input).
 */
export interface ResolvedInput {
    /** Package-relative POSIX path (first segment `csrc/`|`shims/`|`vendor/`). */
    rel: string;
    /** The path passed to clang as the compile input. */
    path: string;
}

/**
 * Resolve a target's `[shim, ...cSources]` to the list of translation units.
 *
 * `--pkg <dir>` (`cfg.pkgDir`) is the only input-resolution model: every
 * input is a package-relative path resolved against the package directory
 * (`join(pkgDir, input)`). The legacy `cfg.srcDir`-based branch was retired
 * (F1, `ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md`) — a build
 * without `--pkg` now fails fast with a clear error instead of silently
 * resolving under `references/`.
 *
 * `rel` always carries the original package-relative path so the caller can
 * derive the per-source C standard with `cStdFor`.
 *
 * @param cfg    - Resolved tool configuration.
 * @param target - The target whose inputs to resolve.
 * @returns The ordered list of translation units (shim first).
 * @throws {Error} if `cfg.pkgDir` is unset.
 */
export function resolveInputs(cfg: WasmCryptoConfig, target: Target): ResolvedInput[] {
    const rels = [target.shim, ...target.cSources];
    if (cfg.pkgDir === undefined) {
        throw new Error(
            "wasm-crypto build: --pkg <dir> is required (the legacy srcDir-based " +
                "resolution was retired — see ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md F1).",
        );
    }
    const pkgDir = cfg.pkgDir;
    return rels.map(rel => ({ rel, path: join(pkgDir, rel) }));
}

// ─── Compile + link flags ───────────────────────────────────────────────────────

/**
 * The SIMD-only variant flag. `-mbulk-memory` is now unconditional (applied to
 * both scalar and SIMD variants in `compileFlags`); only the genuinely
 * SIMD-gated flag remains here.
 */
function simdFlags(simd: boolean): string[] {
    return simd ? ["-msimd128"] : [];
}

/**
 * Surface-minimization flags applied to every variant's compile step.
 * `-flto` must be on both the compile and link steps (LTO needs bitcode
 * objects). Function and data sections partition the object so the linker
 * can prune unused definitions.
 * A vendored target that breaks under LTO opts out by passing a counter-flag
 * (e.g. `-fno-lto`) in its `cflags`, which clang applies last.
 */
const SURFACE_COMPILE_FLAGS = ["-flto", "-ffunction-sections", "-fdata-sections"];

/**
 * Surface-minimization flags applied to every variant's link step.
 * `-flto` on the link step activates link-time optimisation (requires bitcode
 * objects from the compile step). `--lto-O3` sets the LTO optimisation level.
 * `--gc-sections` drops unreferenced functions and data sections.
 * `--strip-all` removes name/custom sections from the final binary.
 * A vendored target opts out by passing `-fno-lto` in its `cflags`.
 */
const SURFACE_LINK_FLAGS = [
    "-flto",
    "-Wl,--lto-O3",
    "-ffunction-sections",
    "-fdata-sections",
    "-Wl,--gc-sections",
    "-Wl,--strip-all",
];

/**
 * Compile flags for one translation unit: a freestanding wasm32 object, with
 * the per-source C standard, `-mbulk-memory` (both variants), SIMD flag
 * (SIMD variant only), and surface-minimization flags applied. Exported for
 * test reuse (asserting the composed argv without a toolchain).
 *
 * Flag order: base → `-std` (if any) → `-mbulk-memory` → SIMD (if simd) →
 * SURFACE_COMPILE_FLAGS → per-target `cflags` (opt-out wins last).
 *
 * @param target  - The owning target (its `cflags` are appended last).
 * @param simd    - Whether to compile the SIMD variant.
 * @param stdFlag - The `-std=…` token (e.g. `"c23"`) or `null` for no forced
 *                  `-std` (vendored sources without `cStd`).
 */
export function compileFlags(target: Target, simd: boolean, stdFlag: string | null): string[] {
    const flags = ["-c", "--target=wasm32", "-O3", "-ffreestanding", "-nostdlib"];
    if (stdFlag) flags.push(`-std=${stdFlag}`);
    flags.push("-mbulk-memory", ...simdFlags(simd), ...SURFACE_COMPILE_FLAGS, ...target.cflags);
    return flags;
}

/**
 * Extract the link-directed flags from a target's `cflags` so they can be
 * forwarded to the LINK step. The compile step already receives every cflag,
 * but a `-Wl,…` / `-z …` linker option is a no-op there (and is otherwise
 * dropped at link), so a target cannot otherwise reach the linker through the
 * manifest. This is the lever a scheme uses to request a link-time setting it
 * needs — e.g. `-Wl,-z,stack-size=N` for schemes whose call frames exceed
 * wasm-ld's 64 KiB default stack (ML-DSA keygen/sign, deep SLH-DSA recursion).
 *
 * Opt-in by construction: a target that declares no `-Wl,`/`-z` cflag gets an
 * empty list forwarded, so its link argv — and therefore its emitted bytes —
 * are unchanged.
 */
export function linkerFlagsFromCflags(target: Target): string[] {
    const out: string[] = [];
    const cflags = target.cflags;
    for (let i = 0; i < cflags.length; i++) {
        const f = cflags[i];
        if (f === undefined) continue; // unreachable — loop bound guarantees defined
        if (f === "-z" && i + 1 < cflags.length) {
            // `-z OPTION` two-token form: forward the pair (clang passes -z through).
            const next = cflags[++i];
            if (next === undefined) continue; // unreachable — pair bound checked above
            out.push(f, next);
        } else if (f.startsWith("-Wl,") || f.startsWith("-z")) {
            // single-token `-Wl,…` or `-z…` form.
            out.push(f);
        }
    }
    return out;
}

/**
 * Link flags producing a freestanding wasm32 reactor (no entry, no WASI, no
 * libc syscalls). Surface-minimization flags (`-flto`, `--lto-O3`,
 * `--gc-sections`, `--strip-all`) are applied to every target. Explicit
 * `--export=<name>` per ABI symbol follows `--gc-sections` so contracted
 * exports survive dead-code elimination. Finally, any link-directed flags the
 * target declared in `cflags` (e.g. `-Wl,-z,stack-size=N`) are forwarded —
 * opt-in, so targets without one are byte-identical.
 */
export function linkFlags(target: Target): string[] {
    const flags = [
        "--target=wasm32",
        "-nostdlib",
        "-Wl,--no-entry",
        "-Wl,--export-dynamic",
        "-O3",
        "-ffreestanding",
        ...SURFACE_LINK_FLAGS,
    ];
    for (const name of target.exports) {
        if (name === "memory") continue; // memory is exported by the linker, not a symbol
        flags.push(`-Wl,--export=${name}`);
    }
    flags.push(...linkerFlagsFromCflags(target));
    return flags;
}

// ─── Compile + link ────────────────────────────────────────────────────────────

/**
 * Run one clang invocation, throwing with the captured stderr on failure.
 */
function runClang(argv: string[], label: string): void {
    const proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
        const stderr = new TextDecoder().decode(proc.stderr);
        throw new Error(`clang failed (${label}), exit ${proc.exitCode}:\n${stderr}`);
    }
}

/**
 * Compile each translation unit separately (per-source `-std`), then link the
 * objects into one variant's `.wasm` on disk.
 *
 * Objects are written to a per-build temp dir under the OS temp dir and removed
 * in a `finally`, so the package tree stays clean and only `cfg.outDir`
 * receives the final binary.
 *
 * @returns the path of the produced `.wasm`.
 * @throws if any compile or the link step exits non-zero.
 */
async function compileVariant(
    clang: string,
    cfg: WasmCryptoConfig,
    target: Target,
    simd: boolean,
): Promise<string> {
    const variant = simd ? "simd" : "scalar";
    const outWasm = join(cfg.outDir, `${target.wasmModule}.${variant}.wasm`);

    const inputs = resolveInputs(cfg, target);
    const tmp = join(tmpdir(), `wasm-crypto-build-${target.wasmModule}-${variant}`);

    // Package-relative includes (`#include "csrc/…"`) resolve from the package root
    // under the --pkg model. Legacy mode keeps clang's default include resolution.
    const includeArgs = cfg.pkgDir !== undefined ? [`-I${cfg.pkgDir}`] : [];

    await mkdir(cfg.outDir, { recursive: true });
    await mkdir(tmp, { recursive: true });
    try {
        // Compile each translation unit to its own object, picking the C
        // standard per file via `cStdFor` (csrc/shims → c23, vendor → cStd).
        const objs: string[] = [];
        for (const input of inputs) {
            // Use the full rel path (slashes → underscores) as the obj name so
            // `shims/add.c` and `csrc/add.c` produce distinct object files when
            // two translation units share the same basename.
            const objName = input.rel.replace(/[/\\]/g, "_");
            const obj = join(tmp, `${objName}.${variant}.o`);
            const stdFlag = cStdFor(input.rel, target);
            const argv = [
                clang,
                ...compileFlags(target, simd, stdFlag),
                ...includeArgs,
                input.path,
                "-o",
                obj,
            ];
            runClang(argv, `${target.wasmModule} ${variant} compile ${input.rel}`);
            objs.push(obj);
        }

        // Link the objects into the final freestanding wasm32 binary.
        const linkArgv = [clang, ...linkFlags(target), ...objs, "-o", outWasm];
        runClang(linkArgv, `${target.wasmModule} ${variant} link`);
    } finally {
        await rm(tmp, { recursive: true, force: true });
    }

    return outWasm;
}

// ─── ABI introspection ─────────────────────────────────────────────────────────

/**
 * Compile the produced wasm and return the set of export names it declares.
 * Uses async `WebAssembly.compile` (never the banned sync constructor).
 */
export async function wasmExportNames(bytes: Uint8Array): Promise<Set<string>> {
    const mod = await WebAssembly.compile(bytes);
    return new Set(WebAssembly.Module.exports(mod).map(e => e.name));
}

/**
 * Compile the produced wasm and return the list of its declared imports as
 * `"<module>.<name>"` strings. A freestanding reactor must import nothing;
 * a non-empty result fails the build. Uses async `WebAssembly.compile`
 * (never the banned sync constructor).
 */
export async function wasmImportNames(bytes: Uint8Array): Promise<string[]> {
    const mod = await WebAssembly.compile(bytes);
    return WebAssembly.Module.imports(mod)
        .map(i => `${i.module}.${i.name}`)
        .sort();
}

/**
 * Assert every required export of `target` is present in `names`.
 *
 * @returns the sorted list of missing exports (empty = all present).
 */
export function missingExports(target: Target, names: Set<string>): string[] {
    return target.exports.filter(e => !names.has(e)).sort();
}

// ─── Per-target build ──────────────────────────────────────────────────────────

/**
 * Build + emit one variant of one target. Returns the emitted module path.
 *
 * @throws if compilation fails or a required ABI export is missing.
 */
async function buildVariant(
    clang: string,
    cfg: WasmCryptoConfig,
    target: Target,
    simd: boolean,
): Promise<string> {
    const wasmPath = await compileVariant(clang, cfg, target, simd);
    const bytes = new Uint8Array(await Bun.file(wasmPath).arrayBuffer());

    const names = await wasmExportNames(bytes);
    const missing = missingExports(target, names);
    if (missing.length > 0) {
        throw new Error(
            `${target.wasmModule} (${simd ? "simd" : "scalar"}) missing required ABI exports: ${missing.join(", ")}`,
        );
    }

    const imports = await wasmImportNames(bytes);
    if (imports.length > 0) {
        throw new Error(
            `${target.wasmModule} (${simd ? "simd" : "scalar"}) violates the ` +
                `zero-import invariant: imports ${imports.join(", ")}`,
        );
    }

    return emit(target.wasmModule, target.exportName, bytes, simd, cfg.outDir, {
        sourceId: target.source,
    });
}

// ─── Targets loading ───────────────────────────────────────────────────────────

async function loadTargets(cfg: WasmCryptoConfig): Promise<Target[]> {
    const file = Bun.file(cfg.targetsFile);
    if (!(await file.exists())) {
        throw new Error(`targets file not found: ${cfg.targetsFile}`);
    }
    return validateTargets(JSON.parse(await file.text()));
}

// ─── Entry point ───────────────────────────────────────────────────────────────

/**
 * Run the build subcommand.
 *
 * @param args - Remaining CLI arguments after "build".
 * @param cfg  - Resolved tool configuration.
 * @returns Exit code: 0 success, 1 build error, 2 clang absent / config error.
 */
export async function run(args: string[], cfg: WasmCryptoConfig): Promise<number> {
    const opts = parseArgs(args);

    const clang = await resolveClang(cfg);
    if (!clang) {
        process.stderr.write(
            "wasm-crypto build: wasi-sdk clang not found. " +
                `Set "wasiSdkPath" (config) or WASI_SDK_PATH to a wasi-sdk install ` +
                `containing bin/clang. Looked under: "${cfg.wasiSdkPath || "<unset>"}".\n`,
        );
        return 2;
    }

    let targets: Target[];
    try {
        targets = await loadTargets(cfg);
    } catch (e) {
        process.stderr.write(`wasm-crypto build: ${(e as Error).message}\n`);
        return 1;
    }

    if (opts.target) {
        targets = targets.filter(t => t.wasmModule === opts.target);
        if (targets.length === 0) {
            process.stderr.write(
                `wasm-crypto build: no target named "${opts.target}" in ${cfg.targetsFile}.\n`,
            );
            return 1;
        }
    }

    if (targets.length === 0) {
        process.stderr.write("wasm-crypto build: no targets to build.\n");
        return 0;
    }

    for (const target of targets) {
        const wantSimd = target.simd && !opts.scalarOnly;
        const variants: boolean[] = wantSimd ? [true, false] : [false];
        for (const simd of variants) {
            try {
                const out = await buildVariant(clang, cfg, target, simd);
                process.stderr.write(
                    `wasm-crypto build: ${target.wasmModule} (${simd ? "simd" : "scalar"}) → ${out}\n`,
                );
            } catch (e) {
                process.stderr.write(`wasm-crypto build: ${(e as Error).message}\n`);
                return 1;
            }
        }
    }

    return 0;
}
