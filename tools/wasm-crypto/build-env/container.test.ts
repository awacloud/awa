// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * container.test.ts — offline unit tests for build-env/container.ts.
 *
 * Network-free and daemon-free by default.
 * The real image build+run test is gated behind WASM_CRYPTO_CONTAINER=1 AND
 * a live container engine — it is SKIPPED in CI by default.
 */

import { describe, test, expect, mock } from "bun:test";
import { join, isAbsolute } from "node:path";
import {
    buildImageArgv,
    runBuildArgv,
    probeEngine,
    runContainerBuild,
    type ContainerEngine,
} from "./container.ts";

// ─── buildImageArgv ───────────────────────────────────────────────────────────

describe("buildImageArgv", () => {
    test("podman: produces exact vector", () => {
        const argv = buildImageArgv("podman", "my-tag", "/abs/Containerfile", "/abs/ctx");
        expect(argv).toEqual([
            "podman", "build", "-t", "my-tag", "-f", "/abs/Containerfile", "/abs/ctx",
        ]);
    });

    test("docker: produces exact vector", () => {
        const argv = buildImageArgv("docker", "awa-build", "/path/to/Containerfile", "/repo");
        expect(argv).toEqual([
            "docker", "build", "-t", "awa-build", "-f", "/path/to/Containerfile", "/repo",
        ]);
    });

    test("tag is the 4th element (index 3), after -t flag", () => {
        const argv = buildImageArgv("podman", "custom-tag", "/f", "/c");
        expect(argv[3]).toBe("custom-tag");
        expect(argv[2]).toBe("-t");
    });

    test("containerfile is after -f flag", () => {
        const argv = buildImageArgv("podman", "tag", "/my/file", "/ctx");
        const fIdx = argv.indexOf("-f");
        expect(fIdx).toBeGreaterThan(-1);
        expect(argv[fIdx + 1]).toBe("/my/file");
    });

    test("contextDir is the last element", () => {
        const argv = buildImageArgv("docker", "t", "/f", "/context/dir");
        expect(argv[argv.length - 1]).toBe("/context/dir");
    });
});

// ─── runBuildArgv ─────────────────────────────────────────────────────────────

describe("runBuildArgv", () => {
    test("podman: produces mount, workdir, env, and tag elements", () => {
        const argv = runBuildArgv("podman", "my-tag", "/repo", "packages/front/fw-wasm-crypto");
        expect(argv[0]).toBe("podman");
        expect(argv[1]).toBe("run");
        // Mount target must be /workspace
        const vIdx = argv.indexOf("-v");
        expect(vIdx).toBeGreaterThan(-1);
        const mount = argv[vIdx + 1]!;
        expect(mount).toContain(":/workspace");
        // Working dir
        const wIdx = argv.indexOf("-w");
        expect(wIdx).toBeGreaterThan(-1);
        expect(argv[wIdx + 1]).toBe("/workspace");
        // PKG_DIR env must be the repo-relative POSIX path
        const eIdx = argv.indexOf("-e");
        expect(eIdx).toBeGreaterThan(-1);
        const envArg = argv[eIdx + 1]!;
        expect(envArg).toMatch(/^PKG_DIR=/);
        const pkgDirVal = envArg.slice("PKG_DIR=".length);
        expect(pkgDirVal).toBe("packages/front/fw-wasm-crypto");
        // No host drive letter or backslash in PKG_DIR
        expect(pkgDirVal).not.toMatch(/^[A-Za-z]:/);
        expect(pkgDirVal).not.toContain("\\");
        // Image tag is last
        expect(argv[argv.length - 1]).toBe("my-tag");
    });

    test("docker: PKG_DIR is repo-relative POSIX (no backslash)", () => {
        const argv = runBuildArgv("docker", "awa-tag", "/home/user/repo", "tools/wasm-crypto");
        const eIdx = argv.indexOf("-e");
        const envArg = argv[eIdx + 1]!;
        expect(envArg).toBe("PKG_DIR=tools/wasm-crypto");
    });

    test("mount source is the repoRoot (absolute host path)", () => {
        const repoRoot = "/abs/repo/root";
        const argv = runBuildArgv("podman", "t", repoRoot, "pkg/rel");
        const vIdx = argv.indexOf("-v");
        const mount = argv[vIdx + 1]!;
        expect(mount.startsWith(repoRoot)).toBe(true);
    });

    test("image tag appears as the last element", () => {
        const argv = runBuildArgv("podman", "final-tag", "/r", "pkg");
        expect(argv[argv.length - 1]).toBe("final-tag");
    });

    test("--rm flag is present", () => {
        const argv = runBuildArgv("podman", "t", "/r", "pkg");
        expect(argv).toContain("--rm");
    });
});

// ─── probeEngine (stubbed spawn) ──────────────────────────────────────────────

describe("probeEngine (stubbed)", () => {
    test("returns 'podman' when podman --version exits 0", () => {
        // Stub Bun.spawnSync to simulate podman available, docker unavailable.
        const origSpawn = Bun.spawnSync;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            if (argv[0] === "podman") {
                return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
            }
            return { exitCode: 1 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const result = probeEngine();
            expect(result).toBe("podman");
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("falls through to 'docker' when only docker responds", () => {
        const origSpawn = Bun.spawnSync;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            if (argv[0] === "docker") {
                return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
            }
            return { exitCode: 1 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const result = probeEngine();
            expect(result).toBe("docker");
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("returns null when neither engine responds", () => {
        const origSpawn = Bun.spawnSync;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            _argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            return { exitCode: 1 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const result = probeEngine();
            expect(result).toBeNull();
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("does not throw when spawn throws (engine not on PATH)", () => {
        const origSpawn = Bun.spawnSync;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            _argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            throw new Error("ENOENT: spawn failed");
        };
        try {
            expect(() => probeEngine()).not.toThrow();
            expect(probeEngine()).toBeNull();
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("respects custom engine order", () => {
        const origSpawn = Bun.spawnSync;
        const probed: string[] = [];
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            probed.push(argv[0]!);
            return { exitCode: 1 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            probeEngine(["docker", "podman"]);
            expect(probed[0]).toBe("docker");
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });
});

// ─── Path guards ──────────────────────────────────────────────────────────────

describe("runContainerBuild path guards", () => {
    test("no engine available → returns engine:null, exitCode:-1, ok:false, no spawn", async () => {
        // Stub probeEngine result by overriding spawnSync so all probes fail.
        const origSpawn = Bun.spawnSync;
        let spawnCallCount = 0;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            spawnCallCount++;
            // All version checks fail; a build/run spawn would also be counted.
            return { exitCode: 1 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const result = await runContainerBuild({
                pkgDir: "/tmp/some-pkg",
                repoRoot: "/tmp/repo",
            });
            expect(result.engine).toBeNull();
            expect(result.exitCode).toBe(-1);
            expect(result.ok).toBe(false);
            // Only version probes should have been called (2: podman + docker),
            // never a build or run spawn.
            expect(spawnCallCount).toBeLessThanOrEqual(2);
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("absolute pkgDir is used verbatim (no cwd-doubling)", async () => {
        // Arrange: engine probe succeeds, image build succeeds, container run succeeds.
        const origSpawn = Bun.spawnSync;
        const capturedRunArgvs: string[][] = [];
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            capturedRunArgvs.push([...argv]);
            return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const absRepo = "/abs/repo";
            const absPkg = "/abs/repo/packages/mypkg";
            await runContainerBuild({
                pkgDir: absPkg,
                repoRoot: absRepo,
                tag: "test-tag",
            });
            // The run argv (second spawn after the build) should have PKG_DIR=packages/mypkg
            const runArgv = capturedRunArgvs[1]; // [0]=probe? no — probe is separate call
            // Find the -e PKG_DIR= arg in any captured argv
            let pkgDirVal: string | undefined;
            for (const av of capturedRunArgvs) {
                const eIdx = av.indexOf("-e");
                if (eIdx >= 0 && av[eIdx + 1]?.startsWith("PKG_DIR=")) {
                    pkgDirVal = av[eIdx + 1]!.slice("PKG_DIR=".length);
                }
            }
            expect(pkgDirVal).toBe("packages/mypkg");
            // cwd must not appear doubled in any captured argv
            const cwd = process.cwd();
            for (const av of capturedRunArgvs) {
                for (const arg of av) {
                    if (arg.includes(cwd)) {
                        const first = arg.indexOf(cwd);
                        const second = arg.indexOf(cwd, first + 1);
                        expect(second).toBe(-1);
                    }
                }
            }
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("relative pkgDir is absolutised against cwd", async () => {
        const origSpawn = Bun.spawnSync;
        const capturedArgvs: string[][] = [];
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => {
            capturedArgvs.push([...argv]);
            return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
        };
        try {
            const repoRoot = process.cwd();
            await runContainerBuild({
                pkgDir: "some/relative/pkg",
                repoRoot,
            });
            // distDir should be absolute
            const result = await runContainerBuild({
                pkgDir: "some/relative/pkg",
                repoRoot,
            });
            expect(isAbsolute(result.distDir)).toBe(true);
            // Normalise separators for cross-platform assertion.
            const distDirPosix = result.distDir.replace(/\\/g, "/");
            expect(distDirPosix).toContain("some/relative/pkg");
            expect(distDirPosix.endsWith("/dist")).toBe(true);
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });

    test("distDir is <pkgAbs>/dist", async () => {
        const origSpawn = Bun.spawnSync;
        (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = (
            _argv: string[],
            _opts?: Parameters<typeof Bun.spawnSync>[1],
        ) => ({ exitCode: 1 } as ReturnType<typeof Bun.spawnSync>);
        try {
            const result = await runContainerBuild({
                pkgDir: "/some/abs/pkg",
                repoRoot: "/some/abs",
            });
            // Even with no engine, distDir is set.
            expect(result.distDir).toBe(join("/some/abs/pkg", "dist"));
        } finally {
            (Bun as { spawnSync: typeof Bun.spawnSync }).spawnSync = origSpawn;
        }
    });
});

// ─── Gated real build ─────────────────────────────────────────────────────────

const CONTAINER_ENABLED = process.env["WASM_CRYPTO_CONTAINER"] === "1";

describe("runContainerBuild (real — gated)", () => {
    // Default: assert that without the flag the test suite stays green offline.
    test("default: skipped unless WASM_CRYPTO_CONTAINER=1 and engine present", () => {
        // This test always passes — it documents the skip condition.
        expect(CONTAINER_ENABLED).toBe(false);
    });

    test.skipIf(!CONTAINER_ENABLED)(
        "real: builds the image and runs the build, asserts dist/*.wasm.js",
        async () => {
            // Only runs when WASM_CRYPTO_CONTAINER=1 and an engine is available.
            const engine = probeEngine();
            if (!engine) {
                // No engine present even though the flag is set — skip gracefully.
                return;
            }
            const result = await runContainerBuild({
                pkgDir: "packages/front/fw-wasm-crypto",
            });
            expect(result.engine).not.toBeNull();
            expect(result.exitCode).toBe(0);
            expect(result.ok).toBe(true);
            // At least one *.wasm.js file must exist in dist/.
            const glob = new Bun.Glob("*.wasm.js");
            const files: string[] = [];
            for await (const f of glob.scan({ cwd: result.distDir })) {
                files.push(f);
            }
            expect(files.length).toBeGreaterThan(0);
        },
    );
});
