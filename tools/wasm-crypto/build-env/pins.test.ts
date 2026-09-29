// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * pins.test.ts — offline unit tests for the build-env wasi-sdk pin table.
 *
 * Network-free by construction: this module is pure data + pure helpers.
 */

import { describe, test, expect } from "bun:test";
import {
    UNPINNED_SENTINEL,
    WASI_SDK,
    isPinned,
    resolveAsset,
    toolchainAssetUrl,
} from "./pins.ts";

// ─── Pin table shape ─────────────────────────────────────────────────────────

describe("WASI_SDK pin table", () => {
    test("carries a non-empty id / repo / release pin", () => {
        expect(WASI_SDK.id).toBe("wasi-sdk");
        expect(WASI_SDK.repo).toBe("WebAssembly/wasi-sdk");
        expect(WASI_SDK.pin.length).toBeGreaterThan(0);
    });

    test("declares the five supported platforms exactly once each", () => {
        const keys = WASI_SDK.assets.map(a => a.platform);
        expect(keys.sort()).toEqual(
            ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"],
        );
        expect(new Set(keys).size).toBe(keys.length);
    });

    test("every sha256 is either 64-hex or the honest sentinel (never fabricated)", () => {
        for (const asset of WASI_SDK.assets) {
            const valid = /^[0-9a-f]{64}$/.test(asset.sha256) || asset.sha256 === UNPINNED_SENTINEL;
            if (!valid) throw new Error(`${asset.platform}: malformed sha256 "${asset.sha256}"`);
            expect(valid).toBe(true);
        }
    });

    test("the retired '<fetch-to-fill>' sentinel appears nowhere (F8)", () => {
        for (const asset of WASI_SDK.assets) {
            expect(asset.sha256).not.toBe("<fetch-to-fill>");
        }
    });

    test("exactly 1 of 5 assets is pinned — win32-x64 (D4)", () => {
        const pinned = WASI_SDK.assets.filter(isPinned);
        expect(pinned.length).toBe(1);
        expect(pinned[0]?.platform).toBe("win32-x64");
    });

    test("the four unpinned assets carry the literal 'blocked-pending-rerun'", () => {
        expect(UNPINNED_SENTINEL).toBe("blocked-pending-rerun");
        const unpinned = WASI_SDK.assets.filter(a => !isPinned(a));
        expect(unpinned.length).toBe(4);
        for (const asset of unpinned) expect(asset.sha256).toBe(UNPINNED_SENTINEL);
    });
});

// ─── resolveAsset ────────────────────────────────────────────────────────────

describe("resolveAsset", () => {
    test("returns the matching asset for each supported platform key", () => {
        for (const key of ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"]) {
            const asset = resolveAsset(key);
            expect(asset).not.toBeNull();
            expect(asset?.platform).toBe(key);
            expect(asset?.kind).toBe("tar.gz");
        }
    });

    test("returns null for an unknown platform key", () => {
        expect(resolveAsset("freebsd-x64")).toBeNull();
    });

    test("defaults to the current platform key", () => {
        const current = `${process.platform}-${process.arch}`;
        expect(resolveAsset()).toEqual(resolveAsset(current));
    });
});

// ─── isPinned ────────────────────────────────────────────────────────────────

describe("isPinned", () => {
    const base = { platform: "linux-x64", asset: "a.tar.gz", kind: "tar.gz" as const };

    test("true only for a 64-lowercase-hex digest", () => {
        expect(isPinned({ ...base, sha256: "a".repeat(64) })).toBe(true);
        expect(isPinned({ ...base, sha256: `  ${"b".repeat(64)}  ` })).toBe(true);
    });

    test("false for the sentinel, the legacy sentinel, empty and truncated values", () => {
        expect(isPinned({ ...base, sha256: UNPINNED_SENTINEL })).toBe(false);
        expect(isPinned({ ...base, sha256: "<fetch-to-fill>" })).toBe(false);
        expect(isPinned({ ...base, sha256: "" })).toBe(false);
        expect(isPinned({ ...base, sha256: "a".repeat(63) })).toBe(false);
        expect(isPinned({ ...base, sha256: "A".repeat(64) })).toBe(false);
    });
});

// ─── toolchainAssetUrl ───────────────────────────────────────────────────────

describe("toolchainAssetUrl", () => {
    test("builds the exact releases/download/<pin>/<asset> form", () => {
        const asset = resolveAsset("linux-x64")!;
        const url = toolchainAssetUrl(WASI_SDK, asset);
        expect(url).toBe(
            `https://github.com/${WASI_SDK.repo}/releases/download/${WASI_SDK.pin}/${asset.asset}`,
        );
        expect(url).toContain("/releases/download/");
        expect(url).not.toContain("archive/refs/tags");
    });

    test("every asset URL ends in its archive extension", () => {
        for (const asset of WASI_SDK.assets) {
            expect(toolchainAssetUrl(WASI_SDK, asset)).toMatch(/\.tar\.gz$/);
        }
    });
});
