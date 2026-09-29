// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * x25519.kat.test.ts — package-local build + zero-import + ABI + RFC 7748 §5.2
 * KAT for the own-layer X25519 shim (shims/x25519.c over the vendored libsodium
 * curve25519 ref10 closure, calling the ..._ref10_implementation struct directly
 * — the runtime dispatcher dropped, targets.json `x25519`, productionized from the
 * W6 spike-GO gate BATCH_25/01).
 *
 * Toolchain-gated, mirroring shims/ed25519.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (the `x25519` target is `simd:false` — ref10 is
 * scalar, no simd128 lane) via the frozen `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 5 ABI exports
 *     (memory/alloc/free/x25519_base/x25519 — NO rng seam: X25519 has no keygen),
 *   - runs the RFC 7748 §5.2 X25519 known-answer test byte-for-byte:
 *       single — for each of the two §5.2 vectors, x25519(scalar, u, out); out ==
 *       RFC output byte-for-byte,
 *       iterated — k = X25519(k, u); u = old k, started from basepoint 9; assert
 *       the result after 1 and after 1000 iterations == RFC outputs. Uses the
 *       fixed-buffer (write-in-per-round) pattern so the 1000-round loop is
 *       allocation-free (the module's bump allocator never frees).
 *
 * The RFC 7748 §5.2 vectors are transcribed verbatim from the spike's run-spike.ts
 * (RFC7748_X25519_SINGLE the two single vectors + RFC7748_X25519_ITER the iterated
 * 1 and 1000 ladder), themselves quoted from references/SPEC/RFC/rfc7748.txt §5.2.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + RFC text on disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / non-zero status → the test FAILS.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";

import { run as runWasmCrypto, type WasmCryptoConfig } from "../../../../tools/wasm-crypto/src/index.ts";
import { resolveClang, wasmImportNames, wasmExportNames } from "../../../../tools/wasm-crypto/src/cmd/build.ts";
import { discoverWasiSdk } from "../../../../tools/wasm-crypto/build-env/toolchain.ts";
import { AbiHost, type WasmDataModule, type LoadedWasm } from "../../../../tools/wasm-crypto/src/abi-host.ts";
import { validateTargets, type Target } from "../../../../tools/wasm-crypto/src/targets.schema.ts";
import { katDeferral } from "./_kat-toolchain.ts";

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHIMS_DIR = import.meta.dir;
const PKG_DIR = join(SHIMS_DIR, "..");
const REPO_ROOT = join(PKG_DIR, "..", "..", "..");
const TARGETS_FILE = join(PKG_DIR, "targets.json");
const OUT_DIR = join(PKG_DIR, "dist");

const RFC7748_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc7748.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "x25519_base", "x25519"];

// ─── RFC 7748 §5.2 X25519 test vectors ────────────────────────────────────────
// Transcribed verbatim from the W6 spike run-spike.ts (RFC7748_X25519_SINGLE +
// RFC7748_X25519_ITER), quoted from references/SPEC/RFC/rfc7748.txt §5.2.

interface X25519Single {
    name: string;
    scalar: string; // 32-byte scalar
    u: string; // 32-byte u-coordinate
    out: string; // 32-byte X25519(scalar, u)
}

const RFC7748_X25519_SINGLE: X25519Single[] = [
    {
        name: "vector 1",
        scalar: "a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4",
        u: "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c",
        out: "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552",
    },
    {
        name: "vector 2",
        scalar: "4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d",
        u: "e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493",
        out: "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957",
    },
];

// RFC 7748 §5.2 iterated test: start k = u = 9 (basepoint), repeat
// k, u = X25519(k, u), u = old k. After 1 iteration and after 1000 iterations.
const RFC7748_X25519_ITER = {
    start: "0900000000000000000000000000000000000000000000000000000000000000",
    after1: "422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079",
    after1000: "684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    if (hex.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
}

async function makeConfig(wasiSdkPath: string): Promise<WasmCryptoConfig> {
    return {
        wasiSdkPath,
        srcDir: PKG_DIR,
        outDir: OUT_DIR,
        targetsFile: TARGETS_FILE,
        pkgDir: PKG_DIR,
    };
}

/** Load the scalar variant directly from its raw `.wasm` bytes. */
async function loadScalar(host: AbiHost): Promise<LoadedWasm> {
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "x25519.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "x25519Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/** Allocate `n` bytes of scratch in linear memory; returns the pointer. */
function allocOut(loaded: LoadedWasm, n: number): number {
    return (loaded.exports["alloc"] as (n: number) => number)(n);
}

/** Write `bytes` into freshly allocated linear memory; returns the pointer. */
function stageBytes(loaded: LoadedWasm, bytes: Uint8Array): number {
    const ptr = allocOut(loaded, bytes.length || 1);
    if (bytes.length) new Uint8Array(loaded.mem.buffer, ptr, bytes.length).set(bytes);
    return ptr;
}

/** Overwrite 32 bytes at `ptr` (fixed-buffer reuse — no per-round alloc). */
function writeIn32(loaded: LoadedWasm, ptr: number, bytes: Uint8Array): void {
    new Uint8Array(loaded.mem.buffer, ptr, 32).set(bytes);
}

/** Run the full RFC 7748 §5.2 KAT (single ×2 + iterated 1/1000) on the module. */
function runRfcKat(host: AbiHost, loaded: LoadedWasm): void {
    // ── single vectors (RFC 7748 §5.2): x25519(scalar, u) == RFC out. ──
    for (const v of RFC7748_X25519_SINGLE) {
        const scalar = hexToBytes(v.scalar);
        const u = hexToBytes(v.u);
        const expected = hexToBytes(v.out);
        const sPtr = stageBytes(loaded, scalar);
        const uPtr = stageBytes(loaded, u);
        const outPtr = allocOut(loaded, 32);
        const rc = host.run(loaded, "x25519", [sPtr, uPtr, outPtr]);
        expect(rc, `[x25519 ${v.name}] rc`).toBe(0);
        const out = host.readBytes(loaded, outPtr, 32);
        expect(bytesToHex(out), `[x25519 ${v.name}] out == RFC output`).toBe(bytesToHex(expected));
    }

    // ── iterated test (RFC 7748 §5.2): k=u=9, repeat k,u = X25519(k,u),u = old k. ──
    // Reuse three FIXED linear-memory buffers across all rounds: the module's bump
    // allocator never frees, so allocating per round would exhaust the arena (the
    // spike's 64 KiB arena overflowed after ~680 rounds; the production arena is
    // 16 MiB so it would survive, but fixed buffers are the robust pattern). One
    // alloc up front, write-in per round.
    {
        let k = hexToBytes(RFC7748_X25519_ITER.start);
        let u = hexToBytes(RFC7748_X25519_ITER.start);
        const kPtr = allocOut(loaded, 32);
        const uPtr = allocOut(loaded, 32);
        const outPtr = allocOut(loaded, 32);
        for (let i = 1; i <= 1000; i++) {
            writeIn32(loaded, kPtr, k);
            writeIn32(loaded, uPtr, u);
            const rc = host.run(loaded, "x25519", [kPtr, uPtr, outPtr]);
            expect(rc, `[x25519 iter ${i}] rc`).toBe(0);
            const out = host.readBytes(loaded, outPtr, 32);
            u = k;
            k = out;
            if (i === 1) {
                expect(bytesToHex(k), "[x25519 iter] after 1 == RFC output").toBe(
                    RFC7748_X25519_ITER.after1,
                );
            }
            if (i === 1000) {
                expect(bytesToHex(k), "[x25519 iter] after 1000 == RFC output").toBe(
                    RFC7748_X25519_ITER.after1000,
                );
            }
        }
    }
}

// ─── Toolchain discovery ──────────────────────────────────────────────────────

let wasiSdkPath = "";
let toolchainPresent = false;

beforeAll(async () => {
    const envPath = process.env["WASI_SDK_PATH"];
    wasiSdkPath = envPath ? envPath : ((await discoverWasiSdk()) ?? "");
    if (wasiSdkPath) {
        const clang = await resolveClang(await makeConfig(wasiSdkPath));
        toolchainPresent = clang !== null;
    }
});

// ─── Manifest + source presence (toolchain-independent) ───────────────────────

describe("x25519 manifest wiring", () => {
    test("targets.json `x25519` retargeted to shims/x25519.c over libsodium ref10", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "x25519");
        expect(t, "no x25519 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own-layer over vendored libsodium curve25519 ref10.
        expect(t!.source).toBe("libsodium");
        expect(t!.sourceKind).toBe("vendored");
        expect(t!.shim).toBe("shims/x25519.c");
        // The vendored curve25519 ref10 closure + shared fe25519 field core +
        // the sodium util seam are compiled in.
        expect(
            t!.cSources.some(c =>
                c.includes("crypto_scalarmult/curve25519/ref10/x25519_ref10.c"),
            ),
        ).toBe(true);
        expect(t!.cSources.some(c => c.includes("crypto_core/ed25519/ref10/ed25519_ref10.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/libsodium-compat/sodium_util_seam.c"))).toBe(true);
        // Dispatcher dropped: NO scalarmult_curve25519.c, no sodium_runtime_*.
        expect(t!.cSources.some(c => c.includes("scalarmult_curve25519.c"))).toBe(false);
        // No SHA-512 seam, no rng seam (X25519 has no keygen / hash).
        expect(t!.cSources.some(c => c.includes("sodium_sha512_seam.c"))).toBe(false);
        expect(t!.cSources.some(c => c.includes("csrc/rng/rng.c"))).toBe(false);
        // fe_25_5 path: NATIVE_LITTLE_ENDIAN, no HAVE_TI_MODE; vendored ref10 → c11.
        expect(t!.cStd).toBe("c11");
        expect(t!.cflags.join(" ")).toContain("-DNATIVE_LITTLE_ENDIAN");
        expect(t!.cflags.join(" ")).not.toContain("HAVE_TI_MODE");
        // compat AHEAD of vendor on package-qualified -I.
        const flags = t!.cflags;
        const compatIdx = flags.findIndex(f => f.includes("csrc/libsodium-compat"));
        const vendorIdx = flags.findIndex(f => f === "-Ipackages/front/fw-wasm-crypto/vendor/libsodium");
        expect(compatIdx).toBeGreaterThanOrEqual(0);
        expect(vendorIdx).toBeGreaterThan(compatIdx);
        // Scalar only (ref10 has no simd128 lane).
        expect(t!.simd).toBe(false);
        // The frozen 5-export ABI (2 x25519 ops + arena; no rng seam).
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        expect(t!.exports).not.toContain("rng_stage");
        expect(t!.exports).not.toContain("rng_reset");
        // Corrected vectors path (stale rfc7748-x25519.json → rfc7748.txt).
        expect(t!.vectors).toContain("references/SPEC/RFC/rfc7748.txt");
    });

    test("RFC 7748 spec text exists on disk (KAT anchor)", async () => {
        expect(await Bun.file(RFC7748_TXT).exists()).toBe(true);
    });

    test("shim exports the FROZEN 2-export ABI (impl-struct-direct, no rng seam)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "x25519.c")).text();
        expect(src).toContain("int x25519_base(const uint8_t* skPtr, uint8_t* pkPtr)");
        expect(src).toContain("int x25519(const uint8_t* skPtr, const uint8_t* pkPtr, uint8_t* outPtr)");
        // Impl-struct-direct: calls the ref10 implementation struct, not the
        // runtime-dispatching crypto_scalarmult_curve25519* entry points.
        expect(src).toContain("crypto_scalarmult_curve25519_ref10_implementation");
        expect(src).toContain(".mult_base(");
        expect(src).toContain(".mult(");
        // Shares the package arena; no rng seam wired (X25519 has no keygen —
        // the seam header is not included, so no rng_stage/rng_reset export).
        expect(src).toContain('#include "_arena.h"');
        expect(src).not.toContain('#include "csrc/rng/rng.h"');
        // No <sodium.h> include.
        expect(src).not.toContain("#include <sodium.h>");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("x25519 build + RFC 7748 §5.2 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC §5.2 single + iterated 1/1000", async () => {
        if (katDeferral("x25519", toolchainPresent, "RFC 7748 §5.2 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false → scalar only). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "x25519"],
            config: cfg,
        });
        expect(code, "wasm-crypto build x25519 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "x25519.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "x25519 scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) {
            expect(exports.has(e), `scalar missing export ${e}`).toBe(true);
        }

        // ── RFC 7748 §5.2 KAT through the emitted scalar variant. ──
        const host = new AbiHost();
        const scalar = await loadScalar(host);
        runRfcKat(host, scalar);

        console.warn(
            "[x25519.kat] RFC 7748 §5.2 byte-for-byte OK (2 single vectors + the " +
                "iterated 1 and 1000 ladder from basepoint 9).",
        );
    }, 120_000);
});
