// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Target manifest schema for wasm-crypto.
 *
 * Each `Target` describes one fw wasm module to build and verify.
 * A JSON file (`targets.json`) holds an array of these; `validateTargets`
 * guards the parsed JSON before it is used by the build/verify commands.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One wasm-crypto build target = one fw wasm module.
 *
 * @remarks
 * - `algo`        — logical algorithm name, e.g. `"argon2"`.
 * - `wasmModule`  — wasm module file base name, e.g. `"argon2"` (no extension).
 * - `exportName`  — JS export identifier in the fw crypto layer,
 *                   e.g. `"argon2Wasm"`.
 * - `source`      — ID of the upstream source, as listed in `SOURCES.md`.
 * - `sourceKind`  — provenance class (see below); selects the C standard
 *                   applied to own/shim sources vs vendored sources, and
 *                   documents build-vs-vendor intent.
 * - `shim`        — package-relative POSIX path to the C shim, whose first
 *                   segment is `csrc/`, `shims/`, or `vendor/`
 *                   (e.g. `"shims/argon2.c"`); resolved against the `--pkg`
 *                   directory by the builder.
 * - `cSources`    — list of C source files to compile, each a package-relative
 *                   POSIX path whose first segment is `csrc/`, `shims/`, or
 *                   `vendor/`; resolved against the `--pkg` directory.
 * - `cStd`        — optional native C standard for files under `vendor/`
 *                   (e.g. `"c11"`, `"gnu11"`). Absent → clang default (no
 *                   forced `-std`). Ignored for `csrc/`/`shims/` files.
 * - `cflags`      — extra `clang` flags to pass when compiling this target.
 * - `simd`        — whether to enable SIMD (`-msimd128`).
 * - `exports`     — wasm exports the module must expose (must include
 *                   `"memory"`, `"alloc"`, `"free"` by ABI contract).
 * - `vectors`     — paths under `references/` to the test-vector files.
 *
 * @remarks Frozen source-root convention
 * `shim` and every entry of `cSources` are **package-relative** POSIX paths
 * whose first path segment is one of `csrc/`, `shims/`, or `vendor/`. The
 * builder resolves them against the `--pkg` directory (`join(pkgDir, path)`).
 * The per-source C standard follows {@link cStdFor}.
 */
export interface Target {
    algo: string;
    wasmModule: string;
    exportName: string;
    source: string;
    /**
     * Provenance class — selects the C standard applied to the target's
     * own/shim sources vs its vendored sources, and documents
     * build-vs-vendor intent.
     */
    sourceKind: "own" | "vendored-fork" | "vendored";
    shim: string;
    cSources: string[];
    /**
     * Optional native C standard for files under `vendor/` (e.g. `"c11"`,
     * `"gnu11"`). Absent → clang default (no forced `-std`). Ignored for
     * `csrc/`/`shims/` files.
     */
    cStd?: string;
    cflags: string[];
    simd: boolean;
    exports: string[];
    vectors: string[];
}

// ─── Source-root / C-standard rule ─────────────────────────────────────────────

/** The three frozen source-root segments a package-relative path may start with. */
const SOURCE_ROOTS = ["csrc/", "shims/", "vendor/"] as const;

/** The three frozen `sourceKind` literals. */
const SOURCE_KINDS = ["own", "vendored-fork", "vendored"] as const;

/**
 * The C standard flag for one package-relative source path, per the frozen
 * rule:
 *   - `csrc/…` or `shims/…` → `"c23"` (the project's own/shim sources);
 *   - `vendor/…`            → the target's `cStd` (native) or `null` (none);
 *   - any other leading segment → invalid source root (throws).
 *
 * @param path   - A package-relative POSIX path (first segment is a source root).
 * @param target - The owning target (only its `cStd` is read).
 * @returns The C standard token (e.g. `"c23"`, `"c11"`) or `null` for "no
 *          forced `-std`".
 * @throws {Error} if `path` does not start with `csrc/`, `shims/`, or `vendor/`.
 */
export function cStdFor(path: string, target: Pick<Target, "cStd">): string | null {
    if (path.startsWith("csrc/") || path.startsWith("shims/")) return "c23";
    if (path.startsWith("vendor/")) return target.cStd ?? null;
    throw new Error(
        `cStdFor: source path must be under csrc/ shims/ or vendor/, got "${path}"`,
    );
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate that `json` is an array of well-formed `Target` objects.
 *
 * @throws {Error} with a descriptive message if any target is invalid.
 * @returns The validated array, typed as `Target[]`.
 */
export function validateTargets(json: unknown): Target[] {
    if (!Array.isArray(json)) {
        throw new Error("targets.json must be an array");
    }

    for (let i = 0; i < json.length; i++) {
        const t = json[i];
        const pfx = `targets[${i}]`;

        if (t === null || typeof t !== "object") {
            throw new Error(`${pfx}: expected object, got ${t === null ? "null" : typeof t}`);
        }

        requireString(t, "algo", pfx);
        requireString(t, "wasmModule", pfx);
        requireString(t, "exportName", pfx);
        requireString(t, "source", pfx);
        requireSourceKind(t, pfx);
        requireString(t, "shim", pfx);
        requireStringArray(t, "cSources", pfx);
        requireOptionalString(t, "cStd", pfx);
        requireStringArray(t, "cflags", pfx);
        requireBoolean(t, "simd", pfx);
        requireStringArray(t, "exports", pfx);
        requireStringArray(t, "vectors", pfx);

        const obj = t as Record<string, unknown>;

        // Source-root convention: shim + every cSources entry must live under
        // one of the three frozen roots so the builder can resolve them and
        // apply the per-source C standard (see `cStdFor`).
        requireSourceRoot(obj["shim"] as string, `${pfx}.shim`);
        (obj["cSources"] as string[]).forEach((src, k) => {
            requireSourceRoot(src, `${pfx}.cSources[${k}]`);
        });

        const requiredExports = ["memory", "alloc", "free"];
        const missing = requiredExports.filter(e => !(obj["exports"] as unknown[]).includes(e));
        if (missing.length > 0) {
            throw new Error(`${pfx}.exports: missing required ABI exports: ${missing.join(", ")}`);
        }
    }

    return json as Target[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function requireString(obj: Record<string, unknown>, key: string, pfx: string): void {
    if (typeof obj[key] !== "string") {
        throw new Error(`${pfx}.${key}: expected string, got ${typeof obj[key]}`);
    }
}

function requireOptionalString(obj: Record<string, unknown>, key: string, pfx: string): void {
    if (obj[key] === undefined) return;
    if (typeof obj[key] !== "string") {
        throw new Error(`${pfx}.${key}: expected string, got ${typeof obj[key]}`);
    }
}

function requireSourceKind(obj: Record<string, unknown>, pfx: string): void {
    const val = obj["sourceKind"];
    if (typeof val !== "string" || !(SOURCE_KINDS as readonly string[]).includes(val)) {
        throw new Error(
            `${pfx}.sourceKind: expected one of ${SOURCE_KINDS.join("|")}, got ${
                typeof val === "string" ? `"${val}"` : typeof val
            }`,
        );
    }
}

function requireSourceRoot(path: string, pfx: string): void {
    if (!SOURCE_ROOTS.some(root => path.startsWith(root))) {
        throw new Error(`${pfx}: must be under csrc/ shims/ or vendor/, got "${path}"`);
    }
}

function requireBoolean(obj: Record<string, unknown>, key: string, pfx: string): void {
    if (typeof obj[key] !== "boolean") {
        throw new Error(`${pfx}.${key}: expected boolean, got ${typeof obj[key]}`);
    }
}

function requireStringArray(obj: Record<string, unknown>, key: string, pfx: string): void {
    const val = obj[key];
    if (!Array.isArray(val) || val.some(v => typeof v !== "string")) {
        throw new Error(`${pfx}.${key}: expected string[], got ${JSON.stringify(val)}`);
    }
}
