// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * toolchain.test.ts — offline unit tests for build-env/toolchain.ts.
 *
 * All tests are network-free by default: the streaming test runs against a
 * loopback fixture server, never an upstream URL. The live-download test is
 * gated behind WASM_CRYPTO_TOOLCHAIN_NET=1.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdtemp, readFile, readdir, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
    ACCEPT_UNPINNED_ENV,
    DEFAULT_SDK_DIR,
    UNPINNED_SENTINEL,
    WASI_SDK,
    discoverWasiSdk,
    downloadToFile,
    downloadWasiSdk,
    enforcePinPolicy,
    extractTarGzFile,
    resolveAsset,
    toolchainAssetUrl,
    verifyAndUnpack,
} from "./toolchain.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const FIXTURES = join(import.meta.dir, "__fixtures__");
const TAR_GZ_FIXTURE = join(FIXTURES, "fake-sdk-linux.tar.gz");
const ZIP_FIXTURE = join(FIXTURES, "fake-sdk-win.zip");
const GNU_FIXTURE = join(FIXTURES, "gnu-features.tar.gz");
const FAKE_INSTALL = join(FIXTURES, "fake-install");

// SHA-256 of the committed fixture archives (computed by build-fixtures.ts).
const TAR_GZ_SHA256 = "2da5a281a3bee7ac1e57cff7e7cc322d78a261ae2074e4a558072155eb0b5e9c";
const ZIP_SHA256 = "cf0e32499baa7b2a3a6c8c7eafa70c078083ee89d0a15df1d029f8813887ba37";

const GNU_LONG_NAME =
    "fake-sdk-gnu/lib/a-directory-with-a-deliberately-very-long-name-exceeding-one-hundred-bytes/deep-file.txt";

function sha256Hex(data: Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
}

/** Run `fn` with stderr captured, returning everything written. */
async function captureStderr(fn: () => Promise<void> | void): Promise<string> {
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: typeof process.stderr.write }).write = ((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        await fn();
    } finally {
        (process.stderr as { write: typeof process.stderr.write }).write = orig;
    }
    return chunks.join("");
}

// ─── resolveAsset (re-exported from pins.ts) ─────────────────────────────────

describe("resolveAsset", () => {
    test("returns the linux-x64 asset for 'linux-x64'", () => {
        const asset = resolveAsset("linux-x64");
        expect(asset).not.toBeNull();
        expect(asset?.platform).toBe("linux-x64");
        expect(asset?.kind).toBe("tar.gz");
        expect(asset?.asset).toContain("linux");
    });

    test("returns null for an unknown platform key", () => {
        expect(resolveAsset("freebsd-x64")).toBeNull();
    });

    test("all five platforms are covered", () => {
        for (const key of ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"]) {
            expect(resolveAsset(key)).not.toBeNull();
        }
    });
});

// ─── toolchainAssetUrl ────────────────────────────────────────────────────────

describe("toolchainAssetUrl", () => {
    test("builds a releases/download URL (not archive/refs/tags)", () => {
        const asset = resolveAsset("linux-x64")!;
        const url = toolchainAssetUrl(WASI_SDK, asset);
        expect(url).toContain("/releases/download/");
        expect(url).not.toContain("archive/refs/tags");
    });

    test("URL is the exact releases/download/<pin>/<asset> form", () => {
        const asset = resolveAsset("linux-x64")!;
        expect(toolchainAssetUrl(WASI_SDK, asset)).toBe(
            `https://github.com/${WASI_SDK.repo}/releases/download/${WASI_SDK.pin}/${asset.asset}`,
        );
    });
});

// ─── Module graph guard (F4 / R5(b)) ─────────────────────────────────────────

describe("build-env module graph", () => {
    test("nothing under build-env/ imports from src/", async () => {
        const files: string[] = [];
        const glob = new Bun.Glob("**/*.ts");
        for await (const rel of glob.scan({ cwd: import.meta.dir })) files.push(rel);
        expect(files.length).toBeGreaterThan(0);

        const offenders: string[] = [];
        for (const rel of files) {
            const source = await readFile(join(import.meta.dir, rel), "utf8");
            // Any module specifier reaching back into the tool's src/ tree.
            if (/from\s+["'][^"']*\.\.\/src\//.test(source) || /import\(["'][^"']*\.\.\/src\//.test(source)) {
                offenders.push(rel);
            }
        }
        expect(offenders).toEqual([]);
    });

    test("toolchain.ts imports the pin table from ./pins.ts", async () => {
        const source = await readFile(join(import.meta.dir, "toolchain.ts"), "utf8");
        expect(source).toContain('from "./pins.ts"');
    });
});

// ─── Pin policy (D4 / F8) ────────────────────────────────────────────────────

describe("enforcePinPolicy", () => {
    const unpinned = {
        platform: "linux-x64",
        asset: "wasi-sdk-33.0-x86_64-linux.tar.gz",
        kind: "tar.gz" as const,
        sha256: UNPINNED_SENTINEL,
    };

    test("pinned + matching digest → silent pass", () => {
        const asset = { ...unpinned, sha256: "c".repeat(64) };
        expect(() => enforcePinPolicy(asset, "c".repeat(64))).not.toThrow();
    });

    test("pinned + mismatch → throws (never opt-outable)", () => {
        const asset = { ...unpinned, sha256: "c".repeat(64) };
        expect(() => enforcePinPolicy(asset, "d".repeat(64))).toThrow(/mismatch/i);
        expect(() => enforcePinPolicy(asset, "d".repeat(64), { acceptUnpinned: true })).toThrow(/mismatch/i);
    });

    test("unpinned → throws by default, naming the platform and the procedure", () => {
        let message = "";
        try {
            enforcePinPolicy(unpinned, "e".repeat(64));
        } catch (err) {
            message = (err as Error).message;
        }
        expect(message).toContain("UNPINNED");
        expect(message).toContain("linux-x64");
        expect(message).toContain(ACCEPT_UNPINNED_ENV);
        expect(message).toContain("build-env/pins.ts");
    });

    test("unpinned + acceptUnpinned flag → proceeds, printing the pin-table line", async () => {
        const digest = "f".repeat(64);
        const stderr = await captureStderr(() => {
            enforcePinPolicy(unpinned, digest, { acceptUnpinned: true });
        });
        expect(stderr).toContain(digest);
        expect(stderr).toContain(`platform: "linux-x64"`);
        expect(stderr).toContain(`sha256: "${digest}"`);
    });

    test(`unpinned + ${ACCEPT_UNPINNED_ENV}=1 env → proceeds`, async () => {
        const prev = process.env[ACCEPT_UNPINNED_ENV];
        process.env[ACCEPT_UNPINNED_ENV] = "1";
        try {
            const stderr = await captureStderr(() => {
                enforcePinPolicy(unpinned, "1".repeat(64));
            });
            expect(stderr).toContain("1".repeat(64));
        } finally {
            if (prev === undefined) delete process.env[ACCEPT_UNPINNED_ENV];
            else process.env[ACCEPT_UNPINNED_ENV] = prev;
        }
    });

    test("a malformed pin is treated as unpinned (rejected), never as a match", () => {
        const malformed = { ...unpinned, sha256: "<fetch-to-fill>" };
        expect(() => enforcePinPolicy(malformed, "0".repeat(64))).toThrow(/UNPINNED/);
    });
});

// ─── verifyAndUnpack — tar.gz happy path ─────────────────────────────────────

describe("verifyAndUnpack (tar.gz)", () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "toolchain-test-tgz-"));
    });

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    test("happy path: pinned sha256 matches → extracts bin/clang placeholder", async () => {
        const bytes = new Uint8Array(await Bun.file(TAR_GZ_FIXTURE).arrayBuffer());
        const asset = {
            platform: "linux-x64",
            asset: "fake-sdk-linux.tar.gz",
            kind: "tar.gz" as const,
            sha256: TAR_GZ_SHA256,
        };
        const sdkRoot = await verifyAndUnpack(bytes, asset, tmpDir);
        expect(typeof sdkRoot).toBe("string");
        expect(await Bun.file(join(sdkRoot, "bin", "clang")).exists()).toBe(true);
    });

    test("no staging artefact is left behind", async () => {
        const entries = await readdir(tmpDir);
        expect(entries.filter(e => e.endsWith(".staged"))).toEqual([]);
    });

    test("hash-mismatch with a real (non-sentinel) pin → throws", async () => {
        const bytes = new Uint8Array(await Bun.file(TAR_GZ_FIXTURE).arrayBuffer());
        const asset = {
            platform: "linux-x64",
            asset: "fake-sdk-linux.tar.gz",
            kind: "tar.gz" as const,
            sha256: "a".repeat(64), // valid-length but wrong hex
        };
        await expect(verifyAndUnpack(bytes, asset, tmpDir)).rejects.toThrow(/mismatch/i);
    });

    test("unpinned sentinel → REJECTED by default (no extraction)", async () => {
        const bytes = new Uint8Array(await Bun.file(TAR_GZ_FIXTURE).arrayBuffer());
        const asset = {
            platform: "linux-x64",
            asset: "fake-sdk-linux.tar.gz",
            kind: "tar.gz" as const,
            sha256: UNPINNED_SENTINEL,
        };
        const dir = await mkdtemp(join(tmpdir(), "toolchain-reject-"));
        try {
            await expect(verifyAndUnpack(bytes, asset, dir)).rejects.toThrow(/UNPINNED/);
            expect(await readdir(dir)).toEqual([]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("unpinned sentinel + opt-in → extracts and reports the computed hash", async () => {
        const bytes = new Uint8Array(await Bun.file(TAR_GZ_FIXTURE).arrayBuffer());
        const asset = {
            platform: "linux-x64",
            asset: "fake-sdk-linux.tar.gz",
            kind: "tar.gz" as const,
            sha256: UNPINNED_SENTINEL,
        };
        const dir = await mkdtemp(join(tmpdir(), "toolchain-optin-"));
        let sdkRoot = "";
        try {
            const stderr = await captureStderr(async () => {
                sdkRoot = await verifyAndUnpack(bytes, asset, dir, { acceptUnpinned: true });
            });
            expect(stderr).toContain(TAR_GZ_SHA256);
            expect(await Bun.file(join(sdkRoot, "bin", "clang")).exists()).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

// ─── extractTarGzFile — GNU long name / pax / dir / symlink / hardlink (B-2) ──

describe("tar reader (B-2 entry kinds)", () => {
    let tmpDir: string;
    let sdkRoot: string;
    let stderr: string;

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "toolchain-gnu-"));
        stderr = await captureStderr(async () => {
            sdkRoot = await extractTarGzFile(GNU_FIXTURE, tmpDir);
        });
    });

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    test("returns the archive's top-level directory", () => {
        expect(sdkRoot).toBe(join(tmpDir, "fake-sdk-gnu"));
    });

    test("regular file entry is extracted", async () => {
        expect(await Bun.file(join(sdkRoot, "bin", "clang")).exists()).toBe(true);
    });

    test("GNU long-name entry ('L') resolves to the full path", async () => {
        const rel = GNU_LONG_NAME.split("/").slice(1);
        const path = join(sdkRoot, ...rel);
        expect(await Bun.file(path).exists()).toBe(true);
        expect(await Bun.file(path).text()).toBe("long-name payload\n");
    });

    test("pax extended header ('x') overrides the following entry's path", async () => {
        const path = join(sdkRoot, "share", "pax-named-file.txt");
        expect(await Bun.file(path).exists()).toBe(true);
        expect(await Bun.file(path).text()).toBe("pax payload\n");
        // The placeholder name carried by the header must NOT be used.
        expect(await Bun.file(join(sdkRoot, "share", "placeholder")).exists()).toBe(false);
    });

    test("symlink entry ('2') is materialised (link or documented copy)", async () => {
        const path = join(sdkRoot, "bin", "clang-link");
        const stat = await lstat(path);
        if (stat.isSymbolicLink()) {
            expect(stat.isSymbolicLink()).toBe(true);
        } else {
            // Windows may refuse link creation — then it is a copy, plus a warning.
            expect(await Bun.file(path).text()).toContain("clang-wasm");
            expect(stderr).toContain("symlink not permitted");
        }
    });

    test("hardlink entry ('1') is materialised", async () => {
        const path = join(sdkRoot, "bin", "clang-hard");
        expect(await Bun.file(path).exists()).toBe(true);
        expect(await Bun.file(path).text()).toContain("clang-wasm");
    });

    test("no entry is silently dropped (dir entry created)", async () => {
        const entries = await readdir(join(sdkRoot, "bin"));
        expect(entries.sort()).toEqual(["clang", "clang-hard", "clang-link"]);
    });

    test("the intermediate .tar is cleaned up", async () => {
        const leftovers = await readdir(tmpDir);
        expect(leftovers.filter(e => e.endsWith(".tar"))).toEqual([]);
    });
});

// ─── verifyAndUnpack — zip happy path ────────────────────────────────────────

describe("verifyAndUnpack (zip)", () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "toolchain-test-zip-"));
    });

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    test("stored-method zip: pinned sha256 matches → extracts bin/clang.exe placeholder", async () => {
        const bytes = new Uint8Array(await Bun.file(ZIP_FIXTURE).arrayBuffer());
        expect(sha256Hex(bytes)).toBe(ZIP_SHA256);

        const asset = {
            platform: "win32-x64",
            asset: "fake-sdk-win.zip",
            kind: "zip" as const,
            sha256: ZIP_SHA256,
        };
        const sdkRoot = await verifyAndUnpack(bytes, asset, tmpDir);
        expect(await Bun.file(join(sdkRoot, "bin", "clang.exe")).exists()).toBe(true);
    });

    test("zip hash-mismatch → throws", async () => {
        const bytes = new Uint8Array(await Bun.file(ZIP_FIXTURE).arrayBuffer());
        const asset = {
            platform: "win32-x64",
            asset: "fake-sdk-win.zip",
            kind: "zip" as const,
            sha256: "b".repeat(64),
        };
        await expect(verifyAndUnpack(bytes, asset, tmpDir)).rejects.toThrow(/mismatch/i);
    });
});

// ─── Streaming download (B-1) ────────────────────────────────────────────────

describe("downloadToFile (stream-to-disk)", () => {
    test("streams a loopback fixture to disk and returns its sha256", async () => {
        const fixture = new Uint8Array(await Bun.file(TAR_GZ_FIXTURE).arrayBuffer());
        const server = Bun.serve({
            port: 0,
            hostname: "127.0.0.1",
            fetch: () => new Response(fixture),
        });
        const dir = await mkdtemp(join(tmpdir(), "toolchain-stream-"));
        try {
            const dest = join(dir, "asset.tar.gz");
            const digest = await downloadToFile(`http://127.0.0.1:${server.port}/asset.tar.gz`, dest);
            expect(digest).toBe(TAR_GZ_SHA256);
            const written = new Uint8Array(await Bun.file(dest).arrayBuffer());
            expect(written.length).toBe(fixture.length);
            expect(sha256Hex(written)).toBe(TAR_GZ_SHA256);
        } finally {
            server.stop(true);
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("non-2xx status → throws before writing anything usable", async () => {
        const server = Bun.serve({
            port: 0,
            hostname: "127.0.0.1",
            fetch: () => new Response("nope", { status: 404 }),
        });
        const dir = await mkdtemp(join(tmpdir(), "toolchain-stream-404-"));
        try {
            const dest = join(dir, "asset.tar.gz");
            await expect(
                downloadToFile(`http://127.0.0.1:${server.port}/asset.tar.gz`, dest),
            ).rejects.toThrow(/HTTP 404/);
            expect(await Bun.file(dest).exists()).toBe(false);
        } finally {
            server.stop(true);
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("the download path never buffers the asset (no res.arrayBuffer)", async () => {
        const source = await readFile(join(import.meta.dir, "toolchain.ts"), "utf8");
        expect(source).not.toContain("res.arrayBuffer");
        expect(source).toContain("res.body.getReader()");
        expect(source).toContain("hash.update(value)");
        // …and the decompression path is file→file, never a full gunzip in memory.
        expect(source).toContain("createGunzip()");
        expect(source).not.toContain("gunzipSync");
    });

    test("downloadWasiSdk rejects an unsupported platform before any fetch", async () => {
        await expect(downloadWasiSdk({ platform: "freebsd-x64" })).rejects.toThrow(
            /No wasi-sdk asset defined/,
        );
    });
});

// ─── discoverWasiSdk ─────────────────────────────────────────────────────────

describe("discoverWasiSdk", () => {
    test("explicit root with bin/clang → returns that absolute root", async () => {
        const result = await discoverWasiSdk([FAKE_INSTALL]);
        expect(result).toBe(FAKE_INSTALL);
        expect(result?.startsWith("/") || /^[A-Za-z]:[\\/]/.test(result ?? "")).toBe(true);
    });

    test("explicit root without bin/clang → null", async () => {
        expect(await discoverWasiSdk([join(FIXTURES, "nonexistent-dir")])).toBeNull();
    });

    test("no explicit roots → null or a discovered string, never a throw", async () => {
        const result = await discoverWasiSdk([]);
        expect(result === null || typeof result === "string").toBe(true);
    });

    test("absolute caller-supplied root is used verbatim (no cwd-doubling)", async () => {
        const result = await discoverWasiSdk([FAKE_INSTALL]);
        expect(result).toBe(FAKE_INSTALL);
        const cwd = process.cwd();
        if (result && result.startsWith(cwd)) {
            const first = result.indexOf(cwd);
            expect(result.indexOf(cwd, first + 1)).toBe(-1);
        }
    });
});

// ─── Installed-SDK sanity (gated on a real SDK being present) ────────────────

describe("installed wasi-sdk", () => {
    test("if an SDK is installed under the default dir, it exposes bin/clang", async () => {
        const root = await discoverWasiSdk();
        if (!root) return; // SDK absent — nothing to assert (standing memory rule).
        const isWin = process.platform === "win32";
        const clang = join(root, "bin", isWin ? "clang.exe" : "clang");
        expect(await Bun.file(clang).exists()).toBe(true);
        expect(root.startsWith(DEFAULT_SDK_DIR)).toBe(true);
    });
});

// ─── DEFAULT_SDK_DIR ─────────────────────────────────────────────────────────

describe("DEFAULT_SDK_DIR", () => {
    test("is an absolute path", () => {
        const isAbsWin = /^[A-Za-z]:[\\/]/.test(DEFAULT_SDK_DIR);
        const isAbsPosix = DEFAULT_SDK_DIR.startsWith("/");
        expect(isAbsWin || isAbsPosix).toBe(true);
    });

    test("points to build-env/sdk relative to toolchain.ts", () => {
        expect(DEFAULT_SDK_DIR).toContain("build-env");
        expect(DEFAULT_SDK_DIR).toMatch(/[/\\]sdk$/);
    });
});

// ─── Live download (gated) ────────────────────────────────────────────────────

const NET = process.env["WASM_CRYPTO_TOOLCHAIN_NET"] === "1";

describe("downloadWasiSdk (live)", () => {
    test.skipIf(!NET)("downloads, verifies, and unpacks the current-OS asset", async () => {
        const tmpDir = await mkdtemp(join(tmpdir(), "toolchain-live-"));
        try {
            const sdkRoot = await downloadWasiSdk({ destDir: tmpDir });
            const isWin = process.platform === "win32";
            const clang = join(sdkRoot, "bin", isWin ? "clang.exe" : "clang");
            expect(await Bun.file(clang).exists()).toBe(true);
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });
});
