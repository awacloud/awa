// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * container — standalone podman/docker runner for the linux-x64 wasm-crypto build.
 *
 * Probes for an available container engine (podman preferred, docker fallback),
 * builds the image from `build-env/Containerfile`, mounts the repo root at
 * `/workspace` inside the container, and runs the acquire+build step.
 *
 * This module is NOT wired into `src/index.ts` — the `build --container`
 * subcommand is deferred (plan OQ-4). Run directly:
 *   bun tools/wasm-crypto/build-env/container.ts --pkg <repo-relative-path>
 *
 * linux-x64 only. Windows/macOS: use the self-hosted toolchain documented in
 * docs/tools/wasm-crypto.md ("Self-hosted toolchain").
 *
 * Zero new runtime npm dependencies — uses only node:* + Bun built-ins.
 *
 * @module build-env/container
 */

import { isAbsolute, join, relative } from "node:path";
import { existsSync } from "node:fs";

// ─── Public types ─────────────────────────────────────────────────────────────

/** A container engine the runner can drive. */
export type ContainerEngine = "podman" | "docker";

/** Result of a containerized build. */
export interface ContainerBuildResult {
    /** The engine used, or `null` if no engine was available. */
    engine: ContainerEngine | null;
    /** Exit code of the in-container build (`-1` if the build never ran). */
    exitCode: number;
    /** Absolute host path to the produced dist dir (`<pkgDirAbs>/dist`). */
    distDir: string;
    /** True only when an engine was found AND the in-container build exited 0. */
    ok: boolean;
}

// ─── Default constants ────────────────────────────────────────────────────────

const DEFAULT_TAG = "awa-wasm-crypto-build";
const DEFAULT_CONTAINERFILE = join(import.meta.dir, "Containerfile");

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Probe for an available container engine on PATH.
 * Tries `podman` first, then `docker` (podman-preferred — rootless, daemonless).
 * Runs `<engine> --version` via `Bun.spawnSync` and treats exit 0 as available.
 *
 * @param order - Optional explicit probe order (default `["podman","docker"]`).
 * @returns the first available engine, or `null` if none responds.
 */
export function probeEngine(order?: ContainerEngine[]): ContainerEngine | null {
    const engines: ContainerEngine[] = order ?? ["podman", "docker"];
    for (const engine of engines) {
        try {
            const result = Bun.spawnSync([engine, "--version"], {
                stdout: "pipe",
                stderr: "pipe",
            });
            if (result.exitCode === 0) return engine;
        } catch {
            // Engine not on PATH or spawn failed — try next.
        }
    }
    return null;
}

/**
 * Build the argv to build the image.
 * `<engine> build -t <tag> -f <containerfile> <contextDir>`.
 * Pure (no spawn) so it is unit-testable.
 *
 * @param engine       - The container engine to use.
 * @param tag          - The image tag to assign.
 * @param containerfile - Absolute path to the Containerfile.
 * @param contextDir   - Absolute path to the build context directory.
 * @returns The complete argv array for the image build command.
 */
export function buildImageArgv(
    engine: ContainerEngine,
    tag: string,
    containerfile: string,
    contextDir: string,
): string[] {
    return [engine, "build", "-t", tag, "-f", containerfile, contextDir];
}

/**
 * Build the argv to run the build inside the image with the package dir and
 * the repo mounted. Pure (no spawn) so it is unit-testable.
 *
 * Mounts the repo root at `/workspace` (`-v <repoRoot>:/workspace`) and sets
 * `-w /workspace`; `PKG_DIR` is passed as `-e PKG_DIR=<pkgRelToRepo>` (a
 * repo-relative POSIX path, valid inside the container regardless of the host
 * path). The container's CMD runs the acquire+build.
 *
 * @param engine     - The chosen engine.
 * @param tag        - The built image tag.
 * @param repoRoot   - Absolute host path to the repo root (mounted at /workspace).
 * @param pkgDirRel  - Repo-relative POSIX path to the package directory.
 * @returns The complete argv array for the container run command.
 */
export function runBuildArgv(
    engine: ContainerEngine,
    tag: string,
    repoRoot: string,
    pkgDirRel: string,
): string[] {
    return [
        engine, "run", "--rm",
        "-v", `${repoRoot}:/workspace`,
        "-w", "/workspace",
        "-e", `PKG_DIR=${pkgDirRel}`,
        tag,
    ];
}

/**
 * End-to-end: probe an engine, build the image, run the in-container build for
 * `pkgDir`, and return the result.
 *
 * `pkgDir` is absolutised with an `isAbsolute` guard before any `join`
 * (prevents Windows path-doubling). `repoRoot` is likewise guarded.
 * `distDir` is `join(abs, "dist")`. `pkgDirRel` for the mount is derived as
 * the POSIX relative path from `repoRoot` to `abs`.
 *
 * @returns a `ContainerBuildResult`; `{engine:null, exitCode:-1, ok:false}`
 *          when no engine is available (does NOT throw — the caller decides).
 */
export async function runContainerBuild(opts: {
    pkgDir: string;
    repoRoot?: string;
    tag?: string;
    containerfile?: string;
    engineOrder?: ContainerEngine[];
}): Promise<ContainerBuildResult> {
    const tag = opts.tag ?? DEFAULT_TAG;
    const containerfile = opts.containerfile ?? DEFAULT_CONTAINERFILE;

    // Absolutise pkgDir with isAbsolute guard (no path-doubling on Windows).
    const pkgAbs = isAbsolute(opts.pkgDir) ? opts.pkgDir : join(process.cwd(), opts.pkgDir);
    const distDir = join(pkgAbs, "dist");

    // Resolve repoRoot: explicit (abs-guarded) or two-up from build-env/
    // (import.meta.dir is .../tools/wasm-crypto/build-env, so ../../.. = repo root).
    let repoRoot: string;
    if (opts.repoRoot !== undefined) {
        repoRoot = isAbsolute(opts.repoRoot) ? opts.repoRoot : join(process.cwd(), opts.repoRoot);
    } else {
        repoRoot = join(import.meta.dir, "..", "..", "..");
    }

    // Derive repo-relative POSIX path for PKG_DIR (valid inside /workspace).
    const pkgDirRel = relative(repoRoot, pkgAbs).replace(/\\/g, "/");

    // Probe for an available engine.
    const engine = probeEngine(opts.engineOrder);
    if (!engine) {
        process.stderr.write("[container] No container engine found (tried podman, docker).\n");
        return { engine: null, exitCode: -1, distDir, ok: false };
    }

    process.stderr.write(`[container] Using engine: ${engine}\n`);

    // Build the image.
    const buildArgv = buildImageArgv(engine, tag, containerfile, repoRoot);
    process.stderr.write(`[container] Building image: ${buildArgv.join(" ")}\n`);

    const buildResult = Bun.spawnSync(buildArgv, {
        stdout: "inherit",
        stderr: "inherit",
    });
    if (buildResult.exitCode !== 0) {
        process.stderr.write(`[container] Image build failed (exit ${buildResult.exitCode}).\n`);
        return { engine, exitCode: buildResult.exitCode ?? 1, distDir, ok: false };
    }

    // Run the in-container build.
    const runArgv = runBuildArgv(engine, tag, repoRoot, pkgDirRel);
    process.stderr.write(`[container] Running build: ${runArgv.join(" ")}\n`);

    const runResult = Bun.spawnSync(runArgv, {
        stdout: "inherit",
        stderr: "inherit",
    });
    const exitCode = runResult.exitCode ?? 1;
    const ok = exitCode === 0;

    if (ok) {
        process.stderr.write(`[container] Build succeeded. dist: ${distDir}\n`);
    } else {
        process.stderr.write(`[container] Build failed (exit ${exitCode}).\n`);
    }

    return { engine, exitCode, distDir, ok };
}

// ─── Direct invocation ────────────────────────────────────────────────────────

if (import.meta.main) {
    // Thin CLI: bun tools/wasm-crypto/build-env/container.ts --pkg <path>
    // Not a registered subcommand — standalone runner only.
    const args = process.argv.slice(2);
    const pkgFlagIdx = args.indexOf("--pkg");
    if (pkgFlagIdx === -1 || !args[pkgFlagIdx + 1]) {
        process.stderr.write("Usage: bun tools/wasm-crypto/build-env/container.ts --pkg <pkg-dir>\n");
        process.stderr.write("  <pkg-dir>: repo-relative or absolute path to the package directory.\n");
        process.exit(2);
    }
    const pkgDir = args[pkgFlagIdx + 1]!;

    // Check that the Containerfile exists before attempting a build.
    if (!existsSync(DEFAULT_CONTAINERFILE)) {
        process.stderr.write(`[container] Containerfile not found: ${DEFAULT_CONTAINERFILE}\n`);
        process.exit(1);
    }

    const result = await runContainerBuild({ pkgDir });
    if (!result.engine) {
        process.stderr.write("[container] No container engine available. Install podman or docker.\n");
        process.exit(2);
    }
    process.exit(result.ok ? 0 : 1);
}
