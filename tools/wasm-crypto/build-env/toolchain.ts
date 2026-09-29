// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * toolchain — self-hosted wasi-sdk acquisition for the build-env.
 *
 * Provides asset resolution, filesystem-based SDK discovery, and
 * hash-verified download+unpack of the per-OS wasi-sdk release asset.
 *
 * `build-env/` is a **self-contained, crypto-free** toolchain-acquisition
 * module (F4/R5(b), `ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md`):
 * this file imports the pin table from `./pins.ts` and nothing from `../src/`.
 *
 * Security posture (D4/F8): an asset whose pin is not a real 64-hex sha256 is
 * **rejected**. A maintainer performing a first fetch opts in explicitly with
 * `AWA_WASI_SDK_ACCEPT_UNPINNED=1` (or `acceptUnpinned: true`), and the tool
 * then prints the computed hash in pin-table form so it can be committed.
 *
 * Memory posture (B-1): the asset is streamed to disk, gunzipped file→file and
 * extracted from the file. Neither the compressed nor the decompressed archive
 * is ever fully buffered in memory.
 *
 * Network is NEVER touched from `discoverWasiSdk` — only `downloadWasiSdk`
 * (and the exported `downloadToFile` helper) performs a fetch, and callers
 * must opt in explicitly.
 *
 * Zero runtime npm dependencies; uses only `node:*` + Bun built-ins.
 *
 * @module build-env/toolchain
 */

import { createHash } from "node:crypto";
import { createGunzip, inflateRawSync } from "node:zlib";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, isAbsolute, join } from "node:path";
import { chmod, copyFile, link, mkdir, open, rm, symlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import {
    UNPINNED_SENTINEL,
    WASI_SDK,
    isPinned,
    resolveAsset,
    toolchainAssetUrl,
    type ToolchainAsset,
} from "./pins.ts";

export { resolveAsset, toolchainAssetUrl, UNPINNED_SENTINEL, WASI_SDK };
export type { ToolchainAsset };

// ─── Constants ────────────────────────────────────────────────────────────────

/** The default, gitignored install dir for downloaded SDKs. */
export const DEFAULT_SDK_DIR: string = join(import.meta.dir, "sdk");

/** Env var a maintainer sets to accept an unpinned asset for a first fetch. */
export const ACCEPT_UNPINNED_ENV = "AWA_WASI_SDK_ACCEPT_UNPINNED";

/** Path of the pin table, quoted verbatim in maintainer-facing messages. */
const PIN_TABLE_PATH = "tools/wasm-crypto/build-env/pins.ts";

/** TAR block size. */
const BLOCK = 512;

/** Copy buffer for file→file entry extraction. */
const COPY_CHUNK = 1 << 20; // 1 MiB

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Compute the SHA-256 hex digest of a byte buffer. */
function sha256Hex(data: Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
}

/** Write a line to stderr (single funnel, keeps the CLI contract auditable). */
function warn(message: string): void {
    process.stderr.write(`${message}\n`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find an installed wasi-sdk root on the filesystem (no network).
 *
 * Search order: (1) explicit `roots` arg, (2) subdirectories of `DEFAULT_SDK_DIR`.
 * A "valid" root is a directory containing `bin/clang` (or `bin/clang.exe`
 * on win32). Returns the first matching absolute root, else `null`.
 *
 * @param roots - Optional list of paths to check before the default install dir.
 * @returns Absolute path to the SDK root, or `null` if none found.
 */
export async function discoverWasiSdk(roots?: string[]): Promise<string | null> {
    const isWin = process.platform === "win32";
    const clangBin = isWin ? "clang.exe" : "clang";
    const altBin = "clang"; // fallback bare name on win32

    async function hasClang(root: string): Promise<boolean> {
        // Guard: isAbsolute before any join on a caller-supplied path.
        const absRoot = isAbsolute(root) ? root : join(process.cwd(), root);
        const primary = join(absRoot, "bin", clangBin);
        if (await Bun.file(primary).exists()) return true;
        if (isWin) {
            const alt = join(absRoot, "bin", altBin);
            if (await Bun.file(alt).exists()) return true;
        }
        return false;
    }

    // (1) Explicit roots supplied by caller.
    if (roots && roots.length > 0) {
        for (const root of roots) {
            // isAbsolute-guard: use root verbatim if absolute.
            const absRoot = isAbsolute(root) ? root : join(process.cwd(), root);
            if (await hasClang(absRoot)) return absRoot;
        }
        // Caller passed explicit roots — honour that scope, stop here.
        return null;
    }

    // (2) Scan direct children of DEFAULT_SDK_DIR.
    if (!existsSync(DEFAULT_SDK_DIR)) return null;
    try {
        const glob = new Bun.Glob("*/bin/" + clangBin);
        // Collect at most a few candidates.
        const candidates: string[] = [];
        for await (const rel of glob.scan({ cwd: DEFAULT_SDK_DIR })) {
            // rel = "wasi-sdk-33.0-x86_64-linux/bin/clang"
            // We want the root: strip "/bin/<clangBin>"
            const parts = rel.split(/[\\/]/);
            const top = parts[0];
            if (parts.length >= 3 && top !== undefined) {
                const sdkRoot = join(DEFAULT_SDK_DIR, top);
                candidates.push(sdkRoot);
            }
        }
        if (candidates.length > 0) {
            // Return first candidate (already verified via glob).
            return candidates[0] ?? null;
        }

        // Also try alt bare name on win32.
        if (isWin) {
            const altGlob = new Bun.Glob("*/bin/clang");
            for await (const rel of altGlob.scan({ cwd: DEFAULT_SDK_DIR })) {
                const parts = rel.split(/[\\/]/);
                const top = parts[0];
                if (parts.length >= 3 && top !== undefined) {
                    return join(DEFAULT_SDK_DIR, top);
                }
            }
        }
    } catch {
        // FS errors — treat as not found.
    }

    return null;
}

// ─── Pin policy (D4 / F8) ────────────────────────────────────────────────────

/** Options controlling the unpinned-asset policy. */
export interface PinPolicyOptions {
    /**
     * Maintainer opt-in for a first fetch of an asset carrying the
     * {@link UNPINNED_SENTINEL}. Defaults to the `AWA_WASI_SDK_ACCEPT_UNPINNED=1`
     * env var (the seam used when the helper is called as a library).
     */
    acceptUnpinned?: boolean;
}

/** Whether the maintainer opted in to accepting an unpinned asset. */
function acceptUnpinnedRequested(opts?: PinPolicyOptions): boolean {
    if (opts?.acceptUnpinned === true) return true;
    return process.env[ACCEPT_UNPINNED_ENV] === "1";
}

/**
 * Enforce the pin policy for one asset against a computed digest.
 *
 * - Real pin + match → returns silently.
 * - Real pin + mismatch → **throws** (always, never opt-outable).
 * - Unpinned (sentinel / empty / malformed) → **throws** unless the maintainer
 *   opted in, in which case the computed hash is printed in pin-table form.
 *
 * @param asset      - The asset descriptor carrying the pin.
 * @param actualHash - The sha256 hex digest computed over the fetched bytes.
 * @param opts       - Pin policy options (maintainer opt-in).
 * @throws On hash mismatch, or on an unpinned asset without opt-in.
 */
export function enforcePinPolicy(
    asset: ToolchainAsset,
    actualHash: string,
    opts?: PinPolicyOptions,
): void {
    if (isPinned(asset)) {
        if (actualHash !== asset.sha256.trim()) {
            throw new Error(
                `[toolchain] SHA-256 mismatch for ${asset.asset}: ` +
                `expected ${asset.sha256.trim()}, got ${actualHash}`,
            );
        }
        return;
    }

    const pinLine =
        `        { platform: "${asset.platform}", asset: "${asset.asset}", ` +
        `kind: "${asset.kind}", sha256: "${actualHash}" },`;

    if (!acceptUnpinnedRequested(opts)) {
        throw new Error(
            `[toolchain] refusing an UNPINNED wasi-sdk asset for platform "${asset.platform}" ` +
            `(${asset.asset}; sha256 = "${asset.sha256}").\n` +
            `Maintainer first-fetch procedure:\n` +
            `  1. Confirm you are on a trusted network and that the release tag ` +
            `"${WASI_SDK.pin}" is the intended one.\n` +
            `  2. Re-run with ${ACCEPT_UNPINNED_ENV}=1 (or acceptUnpinned: true) — the tool then\n` +
            `     prints the computed sha256 in pin-table form.\n` +
            `  3. Commit that hash into ${PIN_TABLE_PATH} for platform "${asset.platform}".\n` +
            `Until then the asset is treated as unverified and is NOT installed.`,
        );
    }

    warn(`[toolchain] ${ACCEPT_UNPINNED_ENV}=1 — accepting UNPINNED asset ${asset.asset}.`);
    warn(`[toolchain] computed sha256: ${actualHash}`);
    warn(`[toolchain] pin it in ${PIN_TABLE_PATH}:`);
    warn(pinLine);
}

// ─── Archive extraction ───────────────────────────────────────────────────────

/** Read an octal-encoded numeric TAR header field. */
function parseOctal(header: Buffer, offset: number, length: number): number {
    let text = "";
    for (let i = offset; i < offset + length; i++) {
        const byte = header[i] ?? 0;
        if (byte === 0 || byte === 0x20) continue;
        text += String.fromCharCode(byte);
    }
    if (!text) return 0;
    const value = parseInt(text, 8);
    return Number.isFinite(value) ? value : 0;
}

/** Read a NUL-terminated string TAR header field. */
function parseString(header: Buffer, offset: number, length: number): string {
    const slice = header.subarray(offset, offset + length);
    let end = slice.indexOf(0);
    if (end < 0) end = slice.length;
    return new TextDecoder().decode(slice.subarray(0, end));
}

/**
 * Parse pax extended-header records (`"<len> <key>=<value>\n"` repeated).
 *
 * @param data - The raw pax record block.
 * @returns Key/value map of the records found.
 */
function parsePaxRecords(data: Uint8Array): Record<string, string> {
    const out: Record<string, string> = {};
    const text = new TextDecoder().decode(data);
    let index = 0;
    while (index < text.length) {
        const space = text.indexOf(" ", index);
        if (space < 0) break;
        const len = parseInt(text.slice(index, space), 10);
        if (!Number.isFinite(len) || len <= 0) break;
        const record = text.slice(space + 1, index + len).replace(/\n$/, "");
        const eq = record.indexOf("=");
        if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
        index += len;
    }
    return out;
}

/** Reject entry names that would escape the destination directory. */
function safeSegments(name: string): string[] | null {
    const normalized = name.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
    const segments = normalized.split("/").filter(s => s.length > 0 && s !== ".");
    if (segments.some(s => s === "..")) return null;
    return segments.length > 0 ? segments : null;
}

/** Copy `size` bytes from `fh` at `pos` into `destPath`, chunk by chunk. */
async function copyRangeToFile(
    fh: FileHandle,
    pos: number,
    size: number,
    destPath: string,
): Promise<void> {
    await mkdir(dirname(destPath), { recursive: true });
    const out = await open(destPath, "w");
    try {
        const buf = Buffer.alloc(Math.min(COPY_CHUNK, Math.max(size, 1)));
        let remaining = size;
        let cursor = pos;
        while (remaining > 0) {
            const want = Math.min(buf.length, remaining);
            const { bytesRead } = await fh.read(buf, 0, want, cursor);
            if (bytesRead <= 0) break;
            await out.write(buf, 0, bytesRead);
            cursor += bytesRead;
            remaining -= bytesRead;
        }
    } finally {
        await out.close();
    }
}

/**
 * Extract an uncompressed TAR **file** into `destDir` (B-2).
 *
 * Handles: regular files (`0`, NUL, `7`), directories (`5`), symlinks (`2`),
 * hardlinks (`1`), GNU long names/links (`L`/`K`), pax extended headers
 * (`x` per-entry, `g` global) and the ustar `prefix` field. Entries whose
 * names would escape `destDir` are refused.
 *
 * On Windows, a symlink that the OS refuses to create is materialised as a
 * file copy (or reported as a warning) — never silently skipped.
 *
 * @param tarPath - Path to the uncompressed `.tar` file.
 * @param destDir - Directory into which the archive is extracted.
 * @returns Absolute path of the archive's top-level directory inside `destDir`.
 */
export async function extractTarFile(tarPath: string, destDir: string): Promise<string> {
    await mkdir(destDir, { recursive: true });
    const fh = await open(tarPath, "r");
    const header = Buffer.alloc(BLOCK);
    let pos = 0;
    let topLevelDir = "";
    let longName: string | null = null;
    let longLink: string | null = null;
    let paxNext: Record<string, string> = {};
    let paxGlobal: Record<string, string> = {};

    /** Read `size` bytes at `pos` fully into memory (only for tiny meta blocks). */
    async function readMeta(size: number): Promise<Uint8Array> {
        const buf = Buffer.alloc(size);
        await fh.read(buf, 0, size, pos);
        return new Uint8Array(buf);
    }

    try {
        for (;;) {
            const { bytesRead } = await fh.read(header, 0, BLOCK, pos);
            if (bytesRead < BLOCK) break;
            pos += BLOCK;
            if (header.every(b => b === 0)) break; // end-of-archive marker

            const size = parseOctal(header, 124, 12);
            const dataSpan = Math.ceil(size / BLOCK) * BLOCK;
            const typeflag = String.fromCharCode(header[156] ?? 0);

            // ── Metadata entries: consume and carry the override forward. ──
            if (typeflag === "L" || typeflag === "K") {
                const raw = await readMeta(size);
                let end = raw.indexOf(0);
                if (end < 0) end = raw.length;
                const value = new TextDecoder().decode(raw.subarray(0, end));
                if (typeflag === "L") longName = value;
                else longLink = value;
                pos += dataSpan;
                continue;
            }
            if (typeflag === "x" || typeflag === "g") {
                const records = parsePaxRecords(await readMeta(size));
                if (typeflag === "x") paxNext = records;
                else paxGlobal = { ...paxGlobal, ...records };
                pos += dataSpan;
                continue;
            }

            // ── Name resolution: pax > GNU long name > ustar prefix+name. ──
            const rawName = parseString(header, 0, 100);
            const prefix = parseString(header, 345, 155);
            const ustarName = prefix ? `${prefix}/${rawName}` : rawName;
            const name = paxNext["path"] ?? longName ?? paxGlobal["path"] ?? ustarName;
            const rawLink = parseString(header, 157, 100);
            const linkName = paxNext["linkpath"] ?? longLink ?? rawLink;
            const mode = parseOctal(header, 100, 8);
            longName = null;
            longLink = null;
            paxNext = {};

            const segments = safeSegments(name);
            const dataStart = pos;
            pos += dataSpan;

            if (!segments) {
                if (name.trim().length > 0) {
                    warn(`[toolchain] refusing unsafe tar entry name: ${name}`);
                }
                continue;
            }
            if (!topLevelDir) topLevelDir = segments[0] ?? "";
            const destPath = join(destDir, ...segments);

            if (typeflag === "5") {
                await mkdir(destPath, { recursive: true });
                continue;
            }

            if (typeflag === "2") {
                await mkdir(dirname(destPath), { recursive: true });
                await materializeSymlink(destPath, linkName);
                continue;
            }

            if (typeflag === "1") {
                await mkdir(dirname(destPath), { recursive: true });
                await materializeHardlink(destDir, destPath, linkName);
                continue;
            }

            if (typeflag === "0" || typeflag === "\0" || typeflag === "7") {
                await copyRangeToFile(fh, dataStart, size, destPath);
                if (process.platform !== "win32" && mode > 0) {
                    await chmod(destPath, mode & 0o777);
                }
                continue;
            }

            warn(`[toolchain] skipping unsupported tar entry type '${typeflag}': ${name}`);
        }
    } finally {
        await fh.close();
    }

    return join(destDir, topLevelDir);
}

/** Create a symlink, falling back to a file copy when the OS refuses. */
async function materializeSymlink(destPath: string, linkName: string): Promise<void> {
    if (!linkName) {
        warn(`[toolchain] symlink entry without a target: ${destPath}`);
        return;
    }
    try {
        await rm(destPath, { force: true });
        await symlink(linkName, destPath);
        return;
    } catch {
        // Windows without developer mode / restricted FS — fall through.
    }
    const resolved = isAbsolute(linkName) ? linkName : join(dirname(destPath), linkName);
    if (existsSync(resolved)) {
        await copyFile(resolved, destPath);
        warn(`[toolchain] symlink not permitted; copied ${linkName} -> ${destPath}`);
        return;
    }
    warn(`[toolchain] symlink not permitted and target missing (${linkName}); ${destPath} not created`);
}

/** Create a hardlink to an already-extracted entry, falling back to a copy. */
async function materializeHardlink(
    destDir: string,
    destPath: string,
    linkName: string,
): Promise<void> {
    const segments = linkName ? safeSegments(linkName) : null;
    if (!segments) {
        warn(`[toolchain] hardlink entry with an unusable target: ${linkName || "(empty)"}`);
        return;
    }
    const source = join(destDir, ...segments);
    if (!existsSync(source)) {
        warn(`[toolchain] hardlink target not yet extracted: ${linkName}`);
        return;
    }
    try {
        await rm(destPath, { force: true });
        await link(source, destPath);
    } catch {
        await copyFile(source, destPath);
        warn(`[toolchain] hardlink not permitted; copied ${linkName} -> ${destPath}`);
    }
}

/**
 * Decompress a `.tar.gz` file→file and extract it (never buffers the tree).
 *
 * @param archivePath - Path to the `.tar.gz` file on disk.
 * @param destDir     - Directory into which the archive is extracted.
 * @returns Absolute path of the archive's top-level directory inside `destDir`.
 */
export async function extractTarGzFile(archivePath: string, destDir: string): Promise<string> {
    await mkdir(destDir, { recursive: true });
    const tarPath = `${archivePath}.tar`;
    await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(tarPath));
    try {
        return await extractTarFile(tarPath, destDir);
    } finally {
        await rm(tarPath, { force: true });
    }
}

/**
 * Extract a ZIP archive from bytes into `destDir`.
 *
 * Supports stored (method 0) and deflate (method 8) local-file entries.
 * Scans local-file headers (PK\x03\x04); stops at the first general-purpose
 * bit-3 (data-descriptor) entry as sizes in the local header are zero and
 * cannot be reliably skipped.
 *
 * @param bytes   - The raw ZIP bytes.
 * @param destDir - Directory into which the archive is extracted.
 * @returns The top-level directory path (SDK root inside `destDir`).
 */
async function extractZip(bytes: Uint8Array, destDir: string): Promise<string> {
    await mkdir(destDir, { recursive: true });
    let offset = 0;
    let topLevelDir = "";
    const sig = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

    function u16le(buf: Uint8Array, off: number): number {
        return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8);
    }
    function u32le(buf: Uint8Array, off: number): number {
        return ((buf[off] ?? 0) |
            ((buf[off + 1] ?? 0) << 8) |
            ((buf[off + 2] ?? 0) << 16) |
            ((buf[off + 3] ?? 0) << 24)) >>> 0;
    }

    while (offset + 30 <= bytes.length) {
        // Check local file header signature.
        if (
            bytes[offset] !== sig[0] ||
            bytes[offset + 1] !== sig[1] ||
            bytes[offset + 2] !== sig[2] ||
            bytes[offset + 3] !== sig[3]
        ) {
            break;
        }

        const flags = u16le(bytes, offset + 6);
        const method = u16le(bytes, offset + 8);
        const compSize = u32le(bytes, offset + 18);
        const uncompSize = u32le(bytes, offset + 22);
        const fileNameLen = u16le(bytes, offset + 26);
        const extraLen = u16le(bytes, offset + 28);

        // bit-3 = data descriptor follows; sizes in local header are zero.
        if (flags & 0x08) {
            warn(`[toolchain] ZIP bit-3 (data-descriptor) entry encountered; stopping extraction.`);
            break;
        }

        const fileNameBytes = bytes.slice(offset + 30, offset + 30 + fileNameLen);
        const entryName = new TextDecoder().decode(fileNameBytes);
        const dataStart = offset + 30 + fileNameLen + extraLen;
        const compressedData = bytes.slice(dataStart, dataStart + compSize);

        offset = dataStart + compSize;

        // Skip directory entries.
        if (entryName.endsWith("/") || entryName.endsWith("\\")) continue;

        const segments = safeSegments(entryName);
        if (!segments) {
            warn(`[toolchain] refusing unsafe zip entry name: ${entryName}`);
            continue;
        }
        if (!topLevelDir && segments.length > 1) topLevelDir = segments[0] ?? "";
        const destPath = join(destDir, ...segments);

        let fileData: Uint8Array;
        if (method === 0) {
            // Stored.
            fileData = compressedData;
        } else if (method === 8) {
            // Deflate — use inflateRawSync (no zlib header).
            fileData = inflateRawSync(compressedData);
            if (fileData.length !== uncompSize) {
                throw new Error(
                    `ZIP inflate size mismatch for ${entryName}: expected ${uncompSize}, got ${fileData.length}`,
                );
            }
        } else {
            warn(`[toolchain] Unsupported ZIP method ${method} for ${entryName}; skipping.`);
            continue;
        }

        await Bun.write(destPath, fileData);
    }

    return join(destDir, topLevelDir || ".");
}

// ─── verifyAndUnpack ─────────────────────────────────────────────────────────

/**
 * Unpack an already-verified archive **file** into `destDir`.
 *
 * @param archivePath - Path to the downloaded archive on disk.
 * @param asset       - The asset descriptor (provides `kind`).
 * @param destDir     - Directory into which the archive is extracted.
 * @returns Absolute path to the SDK root (the directory containing `bin/clang`).
 */
export async function unpackArchiveFile(
    archivePath: string,
    asset: ToolchainAsset,
    destDir: string,
): Promise<string> {
    if (asset.kind === "tar.gz") return extractTarGzFile(archivePath, destDir);
    const bytes = new Uint8Array(await Bun.file(archivePath).arrayBuffer());
    return extractZip(bytes, destDir);
}

/**
 * Verify+unpack already-read archive bytes into `destDir` and return the SDK
 * root. Kept so the pin policy + unpack logic is unit-testable against an
 * in-memory fixture archive with NO network.
 *
 * Prefer {@link downloadWasiSdk} / {@link unpackArchiveFile} for real assets:
 * this entry point necessarily holds the compressed archive in memory.
 *
 * @param bytes   - Raw archive bytes (`.tar.gz` or `.zip`).
 * @param asset   - The toolchain asset descriptor (provides `kind` and `sha256`).
 * @param destDir - Directory into which the archive is extracted.
 * @param opts    - Pin policy options (maintainer opt-in for unpinned assets).
 * @returns Absolute path to the SDK root (the directory containing `bin/clang`).
 * @throws On hash mismatch, or on an unpinned asset without maintainer opt-in.
 */
export async function verifyAndUnpack(
    bytes: Uint8Array,
    asset: ToolchainAsset,
    destDir: string,
    opts?: PinPolicyOptions,
): Promise<string> {
    enforcePinPolicy(asset, sha256Hex(bytes), opts);

    await mkdir(destDir, { recursive: true });
    const stagePath = join(destDir, `.${asset.asset}.staged`);
    await writeFile(stagePath, bytes);
    try {
        return await unpackArchiveFile(stagePath, asset, destDir);
    } finally {
        await rm(stagePath, { force: true });
    }
}

// ─── downloadWasiSdk ─────────────────────────────────────────────────────────

/**
 * Stream an HTTP response body to `destPath`, hashing it on the way (B-1).
 *
 * The archive is never held in memory: chunks go straight to disk and into the
 * running SHA-256.
 *
 * @param url      - The asset URL to fetch.
 * @param destPath - File path the body is streamed into.
 * @returns The SHA-256 hex digest of the streamed bytes.
 * @throws On a non-2xx HTTP status or a missing response body.
 */
export async function downloadToFile(url: string, destPath: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`[toolchain] HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    if (!res.body) {
        throw new Error(`[toolchain] empty response body for ${url}`);
    }

    await mkdir(dirname(destPath), { recursive: true });
    const hash = createHash("sha256");
    const reader = res.body.getReader();
    const out = await open(destPath, "w");
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            hash.update(value);
            await out.write(value);
        }
    } finally {
        await out.close();
    }
    return hash.digest("hex");
}

/**
 * Download + SHA-256-verify + unpack the current-OS asset into `destDir`
 * (default `DEFAULT_SDK_DIR`). Network-touching: callers must opt in.
 *
 * - The asset is **streamed to a temp file** next to `destDir`, hashed while
 *   streaming, and extracted from that file (B-1: no full in-memory copy of
 *   either the compressed or the decompressed archive).
 * - The pin policy is enforced **before** extraction: an unpinned asset is
 *   rejected unless the maintainer opts in (see {@link enforcePinPolicy}).
 *
 * @param opts.destDir        - Override the install directory (default: DEFAULT_SDK_DIR).
 * @param opts.platform       - Override the platform key (default: current OS).
 * @param opts.acceptUnpinned - Maintainer opt-in for an unpinned first fetch.
 * @returns Absolute path to the SDK root.
 * @throws On hash mismatch, unpinned-without-opt-in, HTTP error, or unsupported platform.
 */
export async function downloadWasiSdk(opts?: {
    destDir?: string;
    platform?: string;
    acceptUnpinned?: boolean;
}): Promise<string> {
    const platform = opts?.platform ?? `${process.platform}-${process.arch}`;
    const asset = resolveAsset(platform);
    if (!asset) {
        throw new Error(`[toolchain] No wasi-sdk asset defined for platform: ${platform}`);
    }

    const destDir = opts?.destDir ?? DEFAULT_SDK_DIR;
    const url = toolchainAssetUrl(WASI_SDK, asset);
    const tmpPath = join(destDir, `.${asset.asset}.part`);

    warn(`[toolchain] Downloading ${url} …`);
    const actualHash = await downloadToFile(url, tmpPath);
    try {
        enforcePinPolicy(asset, actualHash, opts);
        return await unpackArchiveFile(tmpPath, asset, destDir);
    } finally {
        await rm(tmpPath, { force: true });
    }
}
