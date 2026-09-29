// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * copy — copy built `.wasm` artifacts from a package's `dist/` into a
 * destination directory, and write/check a committed hash manifest.
 *
 * `wasm-crypto build --pkg <dir>` emits `<dir>/dist/*.{scalar,simd}.wasm`
 * (gitignored — a local build byproduct). `copy` is the seam that promotes
 * those bytes into a **committed** location (`fw/src/crypto/wasm/`) and
 * records what was promoted in `<dir>/dist/MANIFEST.sha256`, so the
 * committed bytes can be verified without a rebuild.
 *
 * Usage: `wasm-crypto copy --pkg <srcPkg> --into <dstDir> [--check] [--target <name>]`
 *
 *   - `--pkg <srcPkg>` (CLI-level flag, resolved by `index.ts`'s `applyPkgDir`
 *     into `cfg.pkgDir`) — the package whose `dist/` holds the built `.wasm`.
 *   - `--into <dstDir>` — destination directory (e.g.
 *     `packages/front/fw/src/crypto/wasm`).
 *   - `--check` — verify-only: never writes. Compares each manifest row
 *     against the committed `<dstDir>/<file>` bytes; drift → one line per
 *     drifted file on stderr, exit 1.
 *   - `--target <name>` — restrict which module's `.scalar.wasm`/`.simd.wasm`
 *     variants are copied (or checked). The manifest itself always reflects
 *     the FULL current `<srcPkg>/dist/` contents — it is dist's index, not a
 *     partial-run artifact — so a `--check` run with no `--target` always
 *     validates the whole set regardless of how prior `copy` runs were scoped.
 *
 * Idempotence: running `copy` twice with no rebuild in between is a no-op —
 * it rewrites a byte-identical manifest and re-copies byte-identical files.
 *
 * Manifest format (`dist/MANIFEST.sha256`): plain `sha256sum`-style lines
 * (`<64-hex-digest>  <filename>\n`), sorted by filename, LF-terminated —
 * see `renderManifest`/`parseManifest`.
 *
 * Exit codes:
 *   0  copy applied (or, with --check, no drift)
 *   1  --check found drift, or --target matched no file
 *   2  config error (missing --pkg, missing --into, missing dist/, missing manifest)
 */

import { mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import type { WasmCryptoConfig } from "../index.ts";

// ─── Args ────────────────────────────────────────────────────────────────────

interface CopyArgs {
    into?: string;
    check: boolean;
    target?: string;
}

function parseArgs(args: string[]): CopyArgs {
    const out: CopyArgs = { check: false };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === undefined) continue; // unreachable — loop bound guarantees defined
        if (a === "--into") {
            out.into = args[++i];
        } else if (a.startsWith("--into=")) {
            out.into = a.slice("--into=".length);
        } else if (a === "--check") {
            out.check = true;
        } else if (a === "--target") {
            out.target = args[++i];
        } else if (a.startsWith("--target=")) {
            out.target = a.slice("--target=".length);
        }
    }
    return out;
}

// ─── Manifest rows ────────────────────────────────────────────────────────────

/** One manifest row: a file's sha256 hex digest and its bare filename. */
export interface ManifestRow {
    hash: string;
    file: string;
}

/** Matches `<module>.scalar.wasm` / `<module>.simd.wasm` (capture group 1 = module). */
const VARIANT_RE = /^(.+)\.(?:scalar|simd)\.wasm$/;

/** sha256 hex digest of a file's bytes. */
async function sha256File(path: string): Promise<string> {
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Render manifest rows to the committed `MANIFEST.sha256` text: plain
 * `sha256sum`-style lines (`<hash>  <file>\n`), LF-terminated. Rows must
 * already be sorted by filename (callers sort at the source so this stays a
 * pure formatter).
 */
export function renderManifest(rows: ManifestRow[]): string {
    return rows.map(r => `${r.hash}  ${r.file}\n`).join("");
}

/**
 * Parse a committed `MANIFEST.sha256` text into rows. Blank lines are
 * skipped; a line not matching the `<64-hex>  <file>` shape is ignored
 * (forward-compatible with a hand-added comment line, though the writer
 * never emits one).
 */
export function parseManifest(text: string): ManifestRow[] {
    const rows: ManifestRow[] = [];
    for (const line of text.split("\n")) {
        if (line.length === 0) continue;
        const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
        if (m === null) continue;
        const hash = m[1];
        const file = m[2];
        if (hash === undefined || file === undefined) continue; // unreachable — regex guarantees both groups
        rows.push({ hash, file });
    }
    return rows;
}

/** List `*.scalar.wasm`/`*.simd.wasm` basenames in `dir`, sorted. Empty if `dir` does not exist. */
async function listVariantWasmFiles(dir: string): Promise<string[]> {
    let entries: string[];
    try {
        entries = await readdir(dir);
    } catch {
        return [];
    }
    return entries.filter(f => VARIANT_RE.test(f)).sort();
}

/** Module name captured from a `<module>.scalar.wasm`/`<module>.simd.wasm` filename, or null. */
function moduleOf(file: string): string | null {
    const m = VARIANT_RE.exec(file);
    return m ? (m[1] ?? null) : null;
}

// ─── copy (apply) ─────────────────────────────────────────────────────────────

async function runCopy(
    srcDistDir: string,
    dstDir: string,
    manifestPath: string,
    targetFilter: string | undefined,
): Promise<number> {
    const allWasmFiles = await listVariantWasmFiles(srcDistDir);
    if (allWasmFiles.length === 0) {
        process.stderr.write(
            `wasm-crypto copy: dist directory not found or empty: ${srcDistDir}\n` +
                `  Run 'build --pkg <dir>' first.\n`,
        );
        return 2;
    }

    let toCopy = allWasmFiles;
    if (targetFilter !== undefined) {
        toCopy = allWasmFiles.filter(f => moduleOf(f) === targetFilter);
        if (toCopy.length === 0) {
            process.stderr.write(
                `wasm-crypto copy: no target named "${targetFilter}" in ${srcDistDir}.\n`,
            );
            return 1;
        }
    }

    await mkdir(dstDir, { recursive: true });
    for (const file of toCopy) {
        await Bun.write(join(dstDir, file), Bun.file(join(srcDistDir, file)));
    }

    // The manifest is dist's index — always the FULL current dist/ contents,
    // independent of --target (which only scopes what gets copied this run).
    const rows: ManifestRow[] = [];
    for (const file of allWasmFiles) {
        rows.push({ hash: await sha256File(join(srcDistDir, file)), file });
    }
    await Bun.write(manifestPath, renderManifest(rows));

    process.stderr.write(
        `wasm-crypto copy: ${toCopy.length} file(s) → ${dstDir}; ` +
            `manifest (${rows.length} entries) → ${manifestPath}\n`,
    );
    return 0;
}

// ─── copy --check ─────────────────────────────────────────────────────────────

async function runCheck(
    dstDir: string,
    manifestPath: string,
    targetFilter: string | undefined,
): Promise<number> {
    const manifestFile = Bun.file(manifestPath);
    if (!(await manifestFile.exists())) {
        process.stderr.write(
            `wasm-crypto copy --check: manifest not found: ${manifestPath}\n` +
                `  Run 'copy --pkg <dir> --into <dstDir>' (without --check) first.\n`,
        );
        return 2;
    }

    let rows = parseManifest(await manifestFile.text());
    if (targetFilter !== undefined) {
        rows = rows.filter(r => moduleOf(r.file) === targetFilter);
        if (rows.length === 0) {
            process.stderr.write(
                `wasm-crypto copy --check: no target named "${targetFilter}" in ${manifestPath}.\n`,
            );
            return 1;
        }
    }

    const drift: string[] = [];
    for (const row of rows) {
        const dstPath = join(dstDir, row.file);
        const dstFile = Bun.file(dstPath);
        if (!(await dstFile.exists())) {
            drift.push(`${row.file}: missing in ${dstDir}`);
            continue;
        }
        const actualHash = await sha256File(dstPath);
        if (actualHash !== row.hash) {
            drift.push(
                `${row.file}: hash mismatch (manifest ${row.hash}, actual ${actualHash})`,
            );
        }
    }

    if (drift.length > 0) {
        for (const line of drift) {
            process.stderr.write(`wasm-crypto copy --check: ${line}\n`);
        }
        return 1;
    }

    process.stdout.write(
        `wasm-crypto copy --check: OK — ${rows.length} file(s) match ${manifestPath}\n`,
    );
    return 0;
}

// ─── Entry point ───────────────────────────────────────────────────────────────

/**
 * Run the copy subcommand.
 *
 * @param args - Remaining CLI arguments after "copy" (`--into`, `--check`, `--target`).
 * @param cfg  - Resolved tool configuration; `cfg.pkgDir` (from the CLI-level
 *               `--pkg <srcPkg>` flag, applied by `index.ts`'s `applyPkgDir`)
 *               supplies the source package.
 * @returns Exit code: 0 success, 1 drift/no-match, 2 config error.
 */
export async function run(args: string[], cfg: WasmCryptoConfig): Promise<number> {
    const opts = parseArgs(args);

    if (cfg.pkgDir === undefined) {
        process.stderr.write("wasm-crypto copy: --pkg <srcPkg> is required.\n");
        return 2;
    }
    if (!opts.into) {
        process.stderr.write("wasm-crypto copy: --into <dstDir> is required.\n");
        return 2;
    }

    const srcDistDir = join(cfg.pkgDir, "dist");
    const dstDir = isAbsolute(opts.into) ? opts.into : join(process.cwd(), opts.into);
    const manifestPath = join(srcDistDir, "MANIFEST.sha256");

    return opts.check
        ? runCheck(dstDir, manifestPath, opts.target)
        : runCopy(srcDistDir, dstDir, manifestPath, opts.target);
}
