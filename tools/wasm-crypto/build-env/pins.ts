// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * pins — the wasi-sdk toolchain pin table for `build-env/`.
 *
 * This module is the single source of truth for **which** wasi-sdk release
 * assets the build-env acquires and **what bytes** each of them must have.
 *
 * It was moved out of `src/sources.ts` (F4, `ai/plans/wasm-crypto/spikes/
 * w0-decoupling/FINDINGS.md`) so that `build-env/` is a self-contained,
 * crypto-free toolchain-acquisition module: nothing under `build-env/`
 * imports anything from `src/`.
 *
 * Pin disposition (D4/F8): `win32-x64` carries a real, verified sha256. The
 * other four assets carry the literal sentinel `"blocked-pending-rerun"` —
 * they have never been fetched by a maintainer of this repository, so no
 * honest hash exists for them. Unpinned assets are **rejected** by the
 * downloader unless a maintainer opts in explicitly (see `toolchain.ts`).
 *
 * Zero runtime npm dependencies; no side effects at import.
 *
 * @module build-env/pins
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** One downloadable release asset of a toolchain pin, per OS/arch. */
export interface ToolchainAsset {
    /** Node `${process.platform}-${process.arch}` key, e.g. `"linux-x64"`. */
    platform: string;
    /** Release asset filename at the release tag. */
    asset: string;
    /** Archive kind for unpack dispatch. */
    kind: "tar.gz" | "zip";
    /**
     * SHA-256 of the asset bytes, lowercase hex — or the literal
     * {@link UNPINNED_SENTINEL} when no maintainer has ever fetched and
     * verified the asset. Never a fabricated value.
     */
    sha256: string;
}

/** A pinned toolchain release and its per-OS assets. */
export interface ToolchainPin {
    /** Stable identifier of the toolchain. */
    id: string;
    /** GitHub `owner/repo` slug hosting the release. */
    repo: string;
    /** Release tag to download from. */
    pin: string;
    /** SPDX expression of the toolchain licence (build-time only). */
    license: string;
    /** Human-readable compiler version shipped by this pin. */
    compiler: string;
    /** Per-OS release assets. */
    assets: readonly ToolchainAsset[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Sentinel meaning "this asset has never been fetched and verified by a
 * maintainer of this repository; no honest hash exists yet".
 *
 * Supersedes the former `"<fetch-to-fill>"` sentinel, which the downloader
 * silently accepted (F8 closes that hole).
 */
export const UNPINNED_SENTINEL = "blocked-pending-rerun";

/**
 * The pinned wasi-sdk release.
 *
 * `wasi-sdk-33` ships clang 22.1.0 (full C23, target `wasm32-unknown-wasip1`).
 * This table — not any prose elsewhere in the repo — is the single source of
 * truth for the SDK version.
 */
export const WASI_SDK: ToolchainPin = {
    id: "wasi-sdk",
    repo: "WebAssembly/wasi-sdk",
    pin: "wasi-sdk-33",
    license: "Apache-2.0 WITH LLVM-exception",
    compiler: "clang 22.1.0",
    assets: [
        {
            platform: "linux-x64",
            asset: "wasi-sdk-33.0-x86_64-linux.tar.gz",
            kind: "tar.gz",
            sha256: UNPINNED_SENTINEL,
        },
        {
            platform: "linux-arm64",
            asset: "wasi-sdk-33.0-arm64-linux.tar.gz",
            kind: "tar.gz",
            sha256: UNPINNED_SENTINEL,
        },
        {
            platform: "darwin-x64",
            asset: "wasi-sdk-33.0-x86_64-macos.tar.gz",
            kind: "tar.gz",
            sha256: UNPINNED_SENTINEL,
        },
        {
            platform: "darwin-arm64",
            asset: "wasi-sdk-33.0-arm64-macos.tar.gz",
            kind: "tar.gz",
            sha256: UNPINNED_SENTINEL,
        },
        {
            platform: "win32-x64",
            asset: "wasi-sdk-33.0-x86_64-windows.tar.gz",
            kind: "tar.gz",
            sha256: "df14ca2a2127c2d6b6be07e6f5549b3af9c1b3c0112430c200a4749970c59f06",
        },
    ],
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the wasi-sdk asset for the current (or a given) platform key.
 *
 * @param platform - `${process.platform}-${process.arch}` key (default: current OS).
 * @returns The matching `ToolchainAsset`, or `null` if the platform is unsupported.
 */
export function resolveAsset(platform?: string): ToolchainAsset | null {
    const key = platform ?? `${process.platform}-${process.arch}`;
    return WASI_SDK.assets.find(a => a.platform === key) ?? null;
}

/**
 * Whether an asset's `sha256` is a real pin (64 lowercase hex chars).
 *
 * Anything else — the sentinel, an empty string, a legacy `"<fetch-to-fill>"`
 * value, a truncated hash — counts as **unpinned**.
 *
 * @param asset - The asset descriptor to inspect.
 * @returns `true` when the asset carries a real 64-hex pin.
 */
export function isPinned(asset: ToolchainAsset): boolean {
    return /^[0-9a-f]{64}$/.test(asset.sha256.trim());
}

/**
 * Build the release-download URL for a toolchain asset:
 * `https://github.com/<repo>/releases/download/<pin>/<asset>`.
 *
 * @param entry - The toolchain pin (provides `repo` and `pin`).
 * @param asset - The asset descriptor.
 * @returns The HTTPS URL of the release asset.
 */
export function toolchainAssetUrl(entry: ToolchainPin, asset: ToolchainAsset): string {
    return `https://github.com/${entry.repo}/releases/download/${entry.pin}/${asset.asset}`;
}
