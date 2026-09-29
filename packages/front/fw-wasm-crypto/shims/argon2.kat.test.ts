// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * argon2.kat.test.ts — package-local build + zero-import + ABI + RFC 9106 KAT
 * for the OWN C23 Argon2id core (shims/argon2.c over csrc/argon2/ over the OWN
 * csrc/blake2/ BLAKE2b lib from task 04; targets.json `argon2`, retargeted off
 * the vendored P-H-C reference to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/blake2b.kat.test.ts (PRIOR ART — not
 * imported). When a WASI SDK is discoverable (`WASI_SDK_PATH` env →
 * `discoverWasiSdk()`), this builds the scalar variant (argon2 is `simd:false`
 * — the memory-hard fill dominates, OQ-3) via the frozen `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/argon2id_hash),
 *   - validates the RFC 9106 §5.3 Argon2id test vector byte-for-byte
 *     (t=3, m=32 KiB, p=4 lanes, 32-byte tag; password/salt/secret/ad as
 *     documented → the documented tag),
 *   - asserts the bad-param → negative contract (t=0 / p=0 / m below the 8·p
 *     floor / outLen<4).
 *
 * The KAT anchor lives at references/SPEC/RFC/rfc9106.txt (RFC 9106 §5.3 — the
 * Argon2id vector is transcribed inline here, the same way the other shim KATs
 * transcribe their RFC literals; the .txt is never read at runtime per the
 * testing convention — vector data is vendored inline).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + KAT anchor on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *   - arena ceiling: the RFC §5.3 vector's m' matrix is 32 KiB (32 blocks ×
 *     1024 B), far under the 16 MiB arena — it fits. A vector whose m' exceeded
 *     the host arena would make the shim return ARGON2_ERR_MEMORY (recorded,
 *     never silently capped).
 *
 * Constant-time note: pass-0 first-half addressing is data-independent of the
 * password/salt/secret (Argon2i indexing). The in-engine CT proof is
 * acvp-wasm-ct-fuzz's job (G2) — this test does NOT self-attest CT as a pass.
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

const RFC9106_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc9106.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "argon2id_hash"];

// ─── RFC 9106 §5.3 Argon2id KAT (transcribed; .txt never read at runtime) ─────

// Memory: 32 KiB, Passes: 3, Parallelism: 4 lanes, Tag length: 32 bytes.
const KAT_T = 3;
const KAT_M = 32;
const KAT_P = 4;
const KAT_OUTLEN = 32;
const KAT_PWD = new Uint8Array(32).fill(0x01);
const KAT_SALT = new Uint8Array(16).fill(0x02);
const KAT_SECRET = new Uint8Array(8).fill(0x03);
const KAT_AD = new Uint8Array(12).fill(0x04);
const KAT_TAG =
    "0d640df58d78766c08c037a34a8b53c9" + "d01ef0452d75b65eb52520e96b01e659";

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "argon2.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "argon2Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/**
 * Marshal one argon2id_hash(pwd, salt, secret, ad, t, m, p, outLen) → tag and
 * read back the tag bytes. Throws on a non-zero status (callers probing the
 * bad-param contract use `argon2Status`).
 */
function argon2(
    host: AbiHost,
    loaded: LoadedWasm,
    pwd: Uint8Array,
    salt: Uint8Array,
    secret: Uint8Array,
    ad: Uint8Array,
    t: number,
    m: number,
    p: number,
    outLen: number,
): Uint8Array {
    const pwdIn = host.withBytes(loaded, pwd.length ? pwd : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const secIn = host.withBytes(loaded, secret.length ? secret : new Uint8Array(1));
    const adIn = host.withBytes(loaded, ad.length ? ad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        const rc = host.run(loaded, "argon2id_hash", [
            pwdIn.ptr, pwd.length,
            saltIn.ptr, salt.length,
            secIn.ptr, secret.length,
            adIn.ptr, ad.length,
            t, m, p,
            out.ptr, outLen,
        ]);
        if (rc !== 0) throw new Error(`argon2id_hash rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        adIn.free();
        secIn.free();
        saltIn.free();
        pwdIn.free();
    }
}

/** Raw status of argon2id_hash() — used to assert the bad-param contract. */
function argon2Status(
    host: AbiHost,
    loaded: LoadedWasm,
    t: number,
    m: number,
    p: number,
    outLen: number,
): number {
    const buf = host.withBytes(loaded, new Uint8Array(16));
    const out = host.withBytes(loaded, new Uint8Array(Math.max(1, outLen)));
    try {
        return host.run(loaded, "argon2id_hash", [
            buf.ptr, 16, buf.ptr, 16, buf.ptr, 0, buf.ptr, 0, t, m, p, out.ptr, outLen,
        ]);
    } finally {
        out.free();
        buf.free();
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

// ─── Manifest + anchor presence (toolchain-independent) ───────────────────────

describe("argon2 manifest wiring", () => {
    test("targets.json `argon2` retargeted to the own C23 Argon2id core", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "argon2");
        expect(t, "no argon2 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off the vendored P-H-C reference.
        expect(t!.source).toBe("own-argon2");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/argon2.c");
        // The own C23 core + the consumed own BLAKE2b lib (task 04) are compiled
        // in; the vendored argon2 TUs are gone.
        expect(t!.cSources.some(c => c.includes("csrc/argon2/argon2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/blake2/blake2b.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("vendor/argon2"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // The memory-hard fill dominates → scalar (OQ-3).
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Vectors pinned to the on-disk RFC 9106 form (not the absent .json).
        expect(t!.vectors).toEqual(["references/SPEC/RFC/rfc9106.txt"]);
    });

    test("RFC 9106 KAT anchor exists on disk", async () => {
        expect(await Bun.file(RFC9106_TXT).exists(), "rfc9106.txt").toBe(true);
    });

    test("shim exports the frozen argon2id_hash() ABI over the own core", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "argon2.c")).text();
        expect(src).toContain("int argon2id_hash(");
        expect(src).toContain('#include "csrc/argon2/argon2.h"');
        expect(src).toContain('#include "_arena.h"');
        // The frozen 13-arg ABI (pwd/salt/secret/ad + t/m/p + out).
        expect(src).toContain("secretPtr");
        expect(src).toContain("adPtr");
        expect(src).toContain("argon2id_core");
        // Bound to the own core, not the vendored P-H-C reference entry points.
        expect(src).not.toContain("argon2id_ctx");
    });

    test("own argon2 core consumes (not duplicates) the own BLAKE2b lib", async () => {
        const c = await Bun.file(join(PKG_DIR, "csrc/argon2/argon2.c")).text();
        // H0 / H' run over the own BLAKE2b core, included read-only.
        expect(c).toContain('#include "csrc/blake2/blake2b.h"');
        expect(c).toContain("blake2b_init_param");
        expect(c).toContain("blake2b_long");
        // BLAKE2b is NOT re-implemented (no compression / sigma table copied in).
        expect(c).not.toContain("blake2b_sigma");
        expect(c).not.toContain("blake2b_compress");
    });
});

// ─── Build + RFC 9106 KAT (toolchain-gated) ───────────────────────────────────

describe("argon2 build + RFC 9106 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC 9106 §5.3 KAT byte-for-byte", async () => {
        if (katDeferral("argon2", toolchainPresent, "RFC 9106 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false → scalar only). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "argon2"],
            config: cfg,
        });
        expect(code, "wasm-crypto build argon2 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "argon2.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const scalar = await loadScalar(host);

        // ── RFC 9106 §5.3 Argon2id KAT byte-for-byte. ──
        const tag = argon2(host, scalar, KAT_PWD, KAT_SALT, KAT_SECRET, KAT_AD, KAT_T, KAT_M, KAT_P, KAT_OUTLEN);
        expect(bytesToHex(tag), "RFC 9106 §5.3 Argon2id tag").toBe(KAT_TAG);

        // ── Determinism: a second call yields the identical tag. ──
        const tag2 = argon2(host, scalar, KAT_PWD, KAT_SALT, KAT_SECRET, KAT_AD, KAT_T, KAT_M, KAT_P, KAT_OUTLEN);
        expect(bytesToHex(tag2), "argon2id determinism").toBe(KAT_TAG);

        // ── Bad-param → negative contract. ──
        expect(argon2Status(host, scalar, 0, 32, 4, 32), "t=0 bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 32, 0, 32), "p=0 bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 8, 4, 32), "m below 8·p floor bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 32, 4, 3), "outLen<4 bad").toBeLessThan(0);

        // ── A second valid param set differs from the KAT tag (sanity). ──
        const tagAlt = argon2(host, scalar, KAT_PWD, KAT_SALT, new Uint8Array(0), new Uint8Array(0), 3, 32, 4, 32);
        expect(bytesToHex(tagAlt) === KAT_TAG, "no-secret/no-ad must differ from the full KAT").toBe(false);

        console.warn(
            "[argon2.kat] RFC 9106 §5.3 Argon2id tag byte-for-byte OK " +
                "(t=3, m=32 KiB, p=4 lanes, 32-byte tag); determinism + bad-param contract OK.",
        );
    }, 300_000);
});
